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

/** One linked project's open-item counts, for the dashboard overview. */
export interface ForgeOverviewEntry {
  projectPath: string;
  repoRef: ForgeRepoRef;
  openIssues: number;
  openPulls: number;
  /** True when either list hit the page limit — counts render "50+". */
  truncated: boolean;
  fetchedAt: string | null;
}

/** How much of a forge mapping exists for a project (Phase 5/7 rendering). */
export type ForgeProjectStatus = "unknown" | "unsupported-host" | "ready";

/** Everything the project page knows about a project's forge state. */
export interface ForgeProjectSnapshot {
  status: ForgeProjectStatus;
  repoRef: ForgeRepoRef | null;
  issues: ForgeIssue[];
  pulls: ForgePull[];
  fetchedAt: string | null;
  lastSyncStatus: string;
  lastSyncError: string | null;
  /** fetchedAt older than SYNC_TTL_MS — the UI's "stale" hint. */
  stale: boolean;
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
 */
export async function readOverview(): Promise<ForgeOverviewEntry[]> {
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
    });
  }
  return entries;
}

/**
 * A project's cached snapshot + mapping status. Pure read — the caller may
 * pass the project's CURRENT RemoteInfo so "no link because the host is
 * unsupported" renders differently from "never synced".
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
    return {
      status: unsupported ? "unsupported-host" : "unknown",
      repoRef: null,
      issues: [],
      pulls: [],
      fetchedAt: null,
      lastSyncStatus: "never",
      lastSyncError: null,
      stale: false,
    };
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
