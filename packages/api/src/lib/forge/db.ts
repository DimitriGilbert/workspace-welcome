import { and, eq, isNotNull, sql } from "drizzle-orm";
import {
  forgeIssues,
  forgeProjectLinks,
  forgePulls,
  forgeRepos,
  getDb,
} from "@workspace-welcome/db";
import type { Db } from "@workspace-welcome/db";

import type { RemoteInfo } from "../types";
import { PAGE_LIMIT, SYNC_TTL_MS } from "./constants";
import {
  countFeedBySlug,
  readFeedItemsBySlug,
  readFeedSyncedAt,
} from "./feed";
import { isTruncated } from "./parse";
import { resolveAdapter } from "./registry";
import type {
  ForgeIssue,
  ForgeKind,
  ForgePull,
  ForgeRepoRef,
  ForgeSnapshot,
} from "./types";

/**
 * Forge snapshot persistence + the DB-only read path. Tables hold "open items
 * as of last sync" (snapshot semantics — replace, no history); every read
 * here is pure database access and can never trigger network. The only door
 * to an adapter invocation is ./sync.ts.
 */

/** The drizzle transaction handle used inside the write helpers below. */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Where an overview entry's counts come from: a synced per-repo snapshot
 * ("repo" — the repo's full open totals) or the authenticated user's feed
 * ("feed" — only the items the USER authored in that repo; plan §Phase 11's
 * attribution). The client discriminates on this for tooltip vocabulary.
 */
export type ForgeOverviewSource = "repo" | "feed";

/** One linked project's open-item counts, for the dashboard overview. */
export interface ForgeOverviewEntry {
  projectPath: string;
  repoRef: ForgeRepoRef;
  openIssues: number;
  openPulls: number;
  /** True when either list hit the page limit — counts render "50+". */
  truncated: boolean;
  fetchedAt: string | null;
  /** Which cache produced the counts — see ForgeOverviewSource. */
  source: ForgeOverviewSource;
}

/** How much of a forge mapping exists for a project (Phase 5/7 rendering). */
export type ForgeProjectStatus = "unknown" | "unsupported-host" | "ready";

/**
 * Which cache produced a project board: a synced per-repo snapshot ("repo" —
 * the repo's FULL open totals) or the authenticated user's feed ("feed" —
 * only the items the USER authored in that repo, Phase 12's fallback), or
 * "none" when neither cache holds anything for the project. The client
 * discriminates on this for header/footer vocabulary.
 */
export type ForgeProjectSource = ForgeOverviewSource | "none";

/**
 * Everything the project page knows about a project's forge state. Data
 * precedence (Phase 12): a repo snapshot wins outright; without one, the
 * user's FEED items for the remote's slug become a feed-sourced board
 * (`source: "feed"` — YOUR open items, honestly narrower than repo totals);
 * only when neither exists does the never-synced CTA shape return
 * (`source: "none"`).
 */
export interface ForgeProjectSnapshot {
  status: ForgeProjectStatus;
  /** Which cache produced the board — see ForgeProjectSource. */
  source: ForgeProjectSource;
  repoRef: ForgeRepoRef | null;
  issues: ForgeIssue[];
  pulls: ForgePull[];
  fetchedAt: string | null;
  lastSyncStatus: string;
  lastSyncError: string | null;
  /** fetchedAt older than SYNC_TTL_MS — the UI's "stale" hint. */
  stale: boolean;
  /**
   * True when the backing list may be incomplete. Repo source: a stored list
   * reached PAGE_LIMIT ("50+" law). Feed source: the FEED itself hit its page
   * limit — the per-slug subset of a capped feed may be missing more of YOUR
   * items in this very repo, so the global flag is the honest ceiling we
   * have, never a per-slug guess.
   */
  truncated: boolean;
}

/**
 * The nothing-yet board: no snapshot, no attributable feed rows. `status`
 * carries the honest reason ("unknown" vs "unsupported-host").
 */
function neverSyncedSnapshot(status: ForgeProjectStatus): ForgeProjectSnapshot {
  return {
    status,
    source: "none",
    repoRef: null,
    issues: [],
    pulls: [],
    fetchedAt: null,
    lastSyncStatus: "never",
    lastSyncError: null,
    stale: false,
    truncated: false,
  };
}

/**
 * Canonical web hostname for a forge kind, per types.ts's ForgeRepoRef doc.
 * Only github resolves through the registry today; when a gitea/gitlab
 * adapter registers, its canonical host must be added here explicitly — a
 * self-hosted forge's hostname is that adapter's decision, never guessed.
 */
function canonicalWebHost(kind: ForgeKind): string {
  if (kind === "github") return "github.com";
  throw new Error(`No canonical web host defined for forge kind: ${kind}`);
}

/** Defensive TEXT → ForgeKind guard for rows read back out of the cache. */
function asForgeKind(value: string): ForgeKind | null {
  return value === "github" || value === "gitea" || value === "gitlab"
    ? value
    : null;
}

function repoIdentity(ref: ForgeRepoRef) {
  return and(
    eq(forgeRepos.kind, ref.kind),
    eq(forgeRepos.host, ref.host),
    eq(forgeRepos.slug, ref.slug),
  );
}

/** The repo row's integer id inside a transaction that just upserted it. */
async function selectRepoId(tx: Tx, ref: ForgeRepoRef): Promise<number> {
  const rows = await tx
    .select({ id: forgeRepos.id })
    .from(forgeRepos)
    .where(repoIdentity(ref))
    .limit(1);
  const id = rows[0]?.id;
  if (id === undefined) {
    throw new Error(
      `forge_repos row missing after upsert: ${ref.kind}:${ref.host}:${ref.slug}`,
    );
  }
  return id;
}

/** labels_json → string[]; a malformed column degrades to [], never throws. */
function parseLabels(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * Map a project onto the forge repo its origin remote resolves to (creating
 * the repo row + link on first call, refreshing the link on later ones).
 * Returns null when the remote's host has no adapter or the slug didn't
 * parse — both mean "no forge identity for this project".
 */
export async function upsertRepoLink(
  projectPath: string,
  remote: RemoteInfo,
): Promise<ForgeRepoRef | null> {
  const adapter = resolveAdapter(remote);
  if (adapter === null) return null;
  if (remote.slug === null) return null;
  const ref: ForgeRepoRef = {
    kind: adapter.kind,
    host: canonicalWebHost(adapter.kind),
    slug: remote.slug,
  };

  const { db } = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .insert(forgeRepos)
      .values({ kind: ref.kind, host: ref.host, slug: ref.slug })
      .onConflictDoUpdate({
        target: [forgeRepos.kind, forgeRepos.host, forgeRepos.slug],
        // Identity columns only — the sync bookkeeping columns are never
        // touched here, so relinking cannot reset last-sync state.
        set: { kind: ref.kind, host: ref.host, slug: ref.slug },
      });
    const repoId = await selectRepoId(tx, ref);
    await tx
      .insert(forgeProjectLinks)
      .values({ projectPath, repoId, remoteUrl: remote.url })
      .onConflictDoUpdate({
        target: forgeProjectLinks.projectPath,
        set: { repoId, remoteUrl: remote.url },
      });
  });
  return ref;
}

/**
 * Open-item counts for every linked project that has a snapshot. A link
 * persisted by a failed FIRST sync carries none — excluded here so the
 * dashboard never renders fabricated zeros. A repo that synced once and
 * later failed keeps its old counts (recordSyncFailure never clears
 * lastSyncedAt): stale-but-real data stays listed. Pure read — never fetches.
 *
 * Phase 11 attribution: the caller may pass `slugs`, a projectPath →
 * "owner/repo" map the client built from its scan data (github-hosted
 * remotes only). For every mapped path WITHOUT a snapshot entry above, the
 * user's FEED items for that slug become a `source: "feed"` entry — counts
 * of YOUR open items in the repo, not the repo's totals, stamped with the
 * feed's fetchedAt. Snapshots always win (repo totals are strictly more
 * data); a slug absent from the feed cache yields no entry (absence, never
 * a fabricated zero). Still pure database access — ./feed.ts's read helpers
 * never touch the adapter.
 */
export async function readOverview(
  slugs?: Record<string, string>,
): Promise<ForgeOverviewEntry[]> {
  const { db } = await getDb();
  const rows = await db
    .select({
      projectPath: forgeProjectLinks.projectPath,
      kind: forgeRepos.kind,
      host: forgeRepos.host,
      slug: forgeRepos.slug,
      lastSyncedAt: forgeRepos.lastSyncedAt,
      openIssues: sql<number>`(SELECT COUNT(*) FROM \`forge_issues\` WHERE \`repo_id\` = \`forge_repos\`.\`id\` AND \`state\` = 'open')`,
      openPulls: sql<number>`(SELECT COUNT(*) FROM \`forge_pulls\` WHERE \`repo_id\` = \`forge_repos\`.\`id\` AND \`state\` = 'open')`,
    })
    .from(forgeProjectLinks)
    .innerJoin(forgeRepos, eq(forgeProjectLinks.repoId, forgeRepos.id))
    .where(isNotNull(forgeRepos.lastSyncedAt))
    .orderBy(forgeProjectLinks.projectPath);

  const entries: ForgeOverviewEntry[] = [];
  for (const row of rows) {
    const kind = asForgeKind(row.kind);
    // A kind this build doesn't know (row written by a newer version) has no
    // renderable identity — skip rather than guess.
    if (kind === null) continue;
    const openIssues = Number(row.openIssues);
    const openPulls = Number(row.openPulls);
    entries.push({
      projectPath: row.projectPath,
      repoRef: { kind, host: row.host, slug: row.slug },
      openIssues,
      openPulls,
      truncated: openIssues >= PAGE_LIMIT || openPulls >= PAGE_LIMIT,
      fetchedAt: row.lastSyncedAt,
      source: "repo",
    });
  }

  // Only paths the snapshot half did NOT cover can earn a feed entry — and
  // only when the client supplied at least one such slug.
  const snapshotPaths = new Set(entries.map((entry) => entry.projectPath));
  const wanted = Object.entries(slugs ?? {}).filter(
    ([projectPath]) => !snapshotPaths.has(projectPath),
  );
  if (wanted.length > 0) {
    const [feedCounts, feedFetchedAt] = await Promise.all([
      countFeedBySlug(),
      readFeedSyncedAt(),
    ]);
    const before = entries.length;
    for (const [projectPath, slug] of wanted) {
      const counts = feedCounts.get(slug);
      // No feed rows for the slug, or no feed fetch ever landed (fetchedAt
      // null) → nothing honest to attribute: absence, never zeros.
      if (counts === undefined || feedFetchedAt === null) continue;
      entries.push({
        projectPath,
        repoRef: { kind: "github", host: "github.com", slug },
        openIssues: counts.issues,
        openPulls: counts.pulls,
        truncated:
          counts.issues >= PAGE_LIMIT || counts.pulls >= PAGE_LIMIT,
        fetchedAt: feedFetchedAt,
        source: "feed",
      });
    }
    if (entries.length > before) {
      // Feed entries were appended out of order — restore the path-sorted
      // whole the snapshot-only read guarantees (that half was SQL-ordered).
      entries.sort((a, b) =>
        a.projectPath < b.projectPath
          ? -1
          : a.projectPath > b.projectPath
            ? 1
            : 0,
      );
    }
  }
  return entries;
}

/**
 * One mapped project↔repo row for the settings "Forge" listing (plan
 * §Phase 10a): the link identity, the repo's sync bookkeeping, and its stored
 * open-item counts. Unlike the overview, never-synced links ARE listed —
 * `lastSyncStatus` carries the honest reason ("never" / "failed"), so the
 * counts' zeros render next to that status rather than as fabricated
 * freshness. Ordered by slug then projectPath. Pure read — never fetches.
 */
export interface ForgeRepoLinkEntry {
  projectPath: string;
  repoRef: ForgeRepoRef;
  /** The origin remote URL the link was last written from. */
  remoteUrl: string;
  lastSyncedAt: string | null;
  lastSyncStatus: string;
  lastSyncError: string | null;
  openIssues: number;
  openPulls: number;
}

/**
 * Every project→repo link, with sync bookkeeping and open-item counts derived
 * from the item tables (the stored snapshot's sets — no truncation flag is
 * derived here; a count at PAGE_LIMIT renders "50+" client-side the same way
 * the overview's does). Pure read — never fetches.
 */
export async function readRepoLinks(): Promise<ForgeRepoLinkEntry[]> {
  const { db } = await getDb();
  const rows = await db
    .select({
      projectPath: forgeProjectLinks.projectPath,
      remoteUrl: forgeProjectLinks.remoteUrl,
      kind: forgeRepos.kind,
      host: forgeRepos.host,
      slug: forgeRepos.slug,
      lastSyncedAt: forgeRepos.lastSyncedAt,
      lastSyncStatus: forgeRepos.lastSyncStatus,
      lastSyncError: forgeRepos.lastSyncError,
      openIssues: sql<number>`(SELECT COUNT(*) FROM \`forge_issues\` WHERE \`repo_id\` = \`forge_repos\`.\`id\` AND \`state\` = 'open')`,
      openPulls: sql<number>`(SELECT COUNT(*) FROM \`forge_pulls\` WHERE \`repo_id\` = \`forge_repos\`.\`id\` AND \`state\` = 'open')`,
    })
    .from(forgeProjectLinks)
    .innerJoin(forgeRepos, eq(forgeProjectLinks.repoId, forgeRepos.id))
    .orderBy(forgeRepos.slug, forgeProjectLinks.projectPath);

  const entries: ForgeRepoLinkEntry[] = [];
  for (const row of rows) {
    const kind = asForgeKind(row.kind);
    // Same defensive skip as the overview: a kind this build doesn't know has
    // no renderable identity — skip rather than guess.
    if (kind === null) continue;
    entries.push({
      projectPath: row.projectPath,
      repoRef: { kind, host: row.host, slug: row.slug },
      remoteUrl: row.remoteUrl,
      lastSyncedAt: row.lastSyncedAt,
      lastSyncStatus: row.lastSyncStatus,
      lastSyncError: row.lastSyncError,
      openIssues: Number(row.openIssues),
      openPulls: Number(row.openPulls),
    });
  }
  return entries;
}

/**
 * A project's cached snapshot + mapping status, under Phase 12's data
 * precedence: repo snapshot > feed items for the remote's slug > nothing.
 * Pure read — the caller may pass the project's CURRENT RemoteInfo so "no
 * link because the host is unsupported" renders differently from "never
 * synced", and so an unlinked github project can fall back to the feed cache
 * (zero gh calls: the items are already on disk). A linked-but-never-synced
 * project keeps today's never-synced shape — the link means a sync was
 * attempted, and the Sync CTA is the honest next step, not a feed board.
 */
export async function readProjectSnapshot(
  projectPath: string,
  remote?: RemoteInfo,
): Promise<ForgeProjectSnapshot> {
  const { db } = await getDb();

  const linked = await db
    .select({
      repoId: forgeRepos.id,
      kind: forgeRepos.kind,
      host: forgeRepos.host,
      slug: forgeRepos.slug,
      lastSyncedAt: forgeRepos.lastSyncedAt,
      lastSyncStatus: forgeRepos.lastSyncStatus,
      lastSyncError: forgeRepos.lastSyncError,
    })
    .from(forgeProjectLinks)
    .innerJoin(forgeRepos, eq(forgeProjectLinks.repoId, forgeRepos.id))
    .where(eq(forgeProjectLinks.projectPath, projectPath))
    .limit(1);

  const row = linked[0];
  const kind = row === undefined ? null : asForgeKind(row.kind);
  if (row === undefined || kind === null) {
    const unsupported =
      remote !== undefined &&
      (resolveAdapter(remote) === null || remote.slug === null);
    if (unsupported) return neverSyncedSnapshot("unsupported-host");

    // Phase 12 fallback: no link, but the remote resolves to a github slug
    // the feed may already hold YOUR open items for. The feed is github-only
    // by construction (gh search), so the adapter kind gates it — a future
    // gitea/gitlab adapter must never be attributed github feed rows.
    const adapter = remote === undefined ? null : resolveAdapter(remote);
    const slug = remote?.slug ?? null;
    if (adapter?.kind === "github" && slug !== null) {
      const feedSnapshot = await feedSourcedSnapshot(slug);
      if (feedSnapshot !== null) return feedSnapshot;
    }
    return neverSyncedSnapshot("unknown");
  }

  const [issueRows, pullRows] = await Promise.all([
    db
      .select()
      .from(forgeIssues)
      .where(and(eq(forgeIssues.repoId, row.repoId), eq(forgeIssues.state, "open")))
      .orderBy(forgeIssues.number),
    db
      .select()
      .from(forgePulls)
      .where(and(eq(forgePulls.repoId, row.repoId), eq(forgePulls.state, "open")))
      .orderBy(forgePulls.number),
  ]);

  const fetchedAtMs = row.lastSyncedAt === null ? null : Date.parse(row.lastSyncedAt);
  return {
    status: "ready",
    source: "repo",
    repoRef: { kind, host: row.host, slug: row.slug },
    issues: issueRows.map((issue) => ({
      number: issue.number,
      title: issue.title,
      state: "open",
      author: issue.author,
      labels: parseLabels(issue.labelsJson),
      commentCount: issue.commentCount,
      updatedAt: issue.updatedAt,
      url: issue.url,
    })),
    pulls: pullRows.map((pull) => ({
      number: pull.number,
      title: pull.title,
      state: "open",
      author: pull.author,
      isDraft: pull.isDraft,
      reviewDecision: pull.reviewDecision,
      labels: parseLabels(pull.labelsJson),
      updatedAt: pull.updatedAt,
      url: pull.url,
    })),
    fetchedAt: row.lastSyncedAt,
    lastSyncStatus: row.lastSyncStatus,
    lastSyncError: row.lastSyncError,
    stale:
      fetchedAtMs !== null &&
      Number.isFinite(fetchedAtMs) &&
      Date.now() - fetchedAtMs > SYNC_TTL_MS,
    // Same law the client derived pre-Phase 12: a stored list at the cap
    // renders "50+", never a false exact count.
    truncated:
      isTruncated(issueRows.length, PAGE_LIMIT) ||
      isTruncated(pullRows.length, PAGE_LIMIT),
  };
}

/**
 * The feed-sourced board for one github slug: the user's open feed items in
 * that repo mapped onto the snapshot row shape — author/commentCount and
 * reviewDecision stay null (the feed honestly carries none of them, see
 * ForgeFeedItem), isDraft and labels ride through, per-kind lists keep
 * readFeedItemsBySlug's updatedAt-DESC order. Staleness reads the FEED's
 * fetchedAt; truncation carries the feed's GLOBAL flag — a capped feed may
 * have dropped more of the user's items in this very slug, and the per-slug
 * subset cannot know, so the global flag is the honest ceiling. Returns null
 * when the feed holds nothing for the slug (or never synced) — absence, so
 * the caller keeps its never-synced shape.
 */
async function feedSourcedSnapshot(
  slug: string,
): Promise<ForgeProjectSnapshot | null> {
  const [items, fetchedAt, countsBySlug] = await Promise.all([
    readFeedItemsBySlug(slug),
    readFeedSyncedAt(),
    countFeedBySlug(),
  ]);
  // No rows for this slug, or no feed fetch ever landed (the write path
  // keeps rows and fetchedAt consistent, but the guard keeps that a law
  // rather than an assumption) — nothing honest to show.
  if (items.length === 0 || fetchedAt === null) return null;

  const issues: ForgeIssue[] = [];
  const pulls: ForgePull[] = [];
  for (const item of items) {
    if (item.kind === "pr") {
      pulls.push({
        number: item.number,
        title: item.title,
        state: "open",
        author: null,
        isDraft: item.isDraft,
        reviewDecision: null,
        labels: item.labels,
        updatedAt: item.updatedAt,
        url: item.url,
      });
    } else {
      issues.push({
        number: item.number,
        title: item.title,
        state: "open",
        author: null,
        labels: item.labels,
        commentCount: null,
        updatedAt: item.updatedAt,
        url: item.url,
      });
    }
  }

  // The feed's GLOBAL per-kind totals decide truncation (readUserFeed's law).
  let feedIssues = 0;
  let feedPulls = 0;
  for (const counts of countsBySlug.values()) {
    feedIssues += counts.issues;
    feedPulls += counts.pulls;
  }
  const fetchedAtMs = Date.parse(fetchedAt);
  return {
    status: "ready",
    source: "feed",
    repoRef: { kind: "github", host: canonicalWebHost("github"), slug },
    issues,
    pulls,
    fetchedAt,
    lastSyncStatus: "ok",
    lastSyncError: null,
    stale:
      Number.isFinite(fetchedAtMs) && Date.now() - fetchedAtMs > SYNC_TTL_MS,
    truncated:
      isTruncated(feedIssues, PAGE_LIMIT) || isTruncated(feedPulls, PAGE_LIMIT),
  };
}

/** The repo's lastSyncedAt, for the sync service's min-interval guard. */
export async function readLastSyncedAt(
  ref: ForgeRepoRef,
): Promise<string | null> {
  const { db } = await getDb();
  const rows = await db
    .select({ lastSyncedAt: forgeRepos.lastSyncedAt })
    .from(forgeRepos)
    .where(repoIdentity(ref))
    .limit(1);
  return rows[0]?.lastSyncedAt ?? null;
}

/**
 * Persist one fetched snapshot atomically: mark the repo row
 * (lastSyncedAt/ok/no error), delete its stale open-item rows, insert the
 * fresh open sets. Tables hold "open items as of last sync" — replace, no
 * history.
 */
export async function replaceSnapshot(
  ref: ForgeRepoRef,
  snapshot: ForgeSnapshot,
): Promise<void> {
  const { db } = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .insert(forgeRepos)
      .values({
        kind: ref.kind,
        host: ref.host,
        slug: ref.slug,
        lastSyncedAt: snapshot.fetchedAt,
        lastSyncStatus: "ok",
        lastSyncError: null,
      })
      .onConflictDoUpdate({
        target: [forgeRepos.kind, forgeRepos.host, forgeRepos.slug],
        set: {
          lastSyncedAt: snapshot.fetchedAt,
          lastSyncStatus: "ok",
          lastSyncError: null,
        },
      });
    const repoId = await selectRepoId(tx, ref);
    await tx.delete(forgeIssues).where(eq(forgeIssues.repoId, repoId));
    await tx.delete(forgePulls).where(eq(forgePulls.repoId, repoId));
    for (const issue of snapshot.issues) {
      await tx.insert(forgeIssues).values({
        repoId,
        number: issue.number,
        title: issue.title,
        state: issue.state,
        author: issue.author,
        labelsJson: JSON.stringify(issue.labels),
        commentCount: issue.commentCount,
        updatedAt: issue.updatedAt,
        url: issue.url,
      });
    }
    for (const pull of snapshot.pulls) {
      await tx.insert(forgePulls).values({
        repoId,
        number: pull.number,
        title: pull.title,
        state: pull.state,
        author: pull.author,
        isDraft: pull.isDraft,
        reviewDecision: pull.reviewDecision,
        labelsJson: JSON.stringify(pull.labels),
        updatedAt: pull.updatedAt,
        url: pull.url,
      });
    }
  });
}

/** Record a failed sync attempt (upsert — the repo row may be brand new). */
export async function recordSyncFailure(
  ref: ForgeRepoRef,
  error: string,
): Promise<void> {
  const { db } = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .insert(forgeRepos)
      .values({
        kind: ref.kind,
        host: ref.host,
        slug: ref.slug,
        lastSyncStatus: "failed",
        lastSyncError: error,
      })
      .onConflictDoUpdate({
        target: [forgeRepos.kind, forgeRepos.host, forgeRepos.slug],
        set: { lastSyncStatus: "failed", lastSyncError: error },
      });
  });
}
