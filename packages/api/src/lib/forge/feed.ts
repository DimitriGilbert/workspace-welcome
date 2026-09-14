import { eq, inArray, sql } from "drizzle-orm";
import { appMeta, forgeFeedItems, getDb } from "@workspace-welcome/db";
import type { Db } from "@workspace-welcome/db";

import { PAGE_LIMIT, SYNC_TTL_MS } from "./constants";
import { isTruncated } from "./parse";
import type { ForgeFeedItem } from "./types";

/**
 * User-level forge feed persistence + the DB-only read path (plan §Phase 9).
 * `forge_feed_items` holds the authenticated user's open issues + PRs across
 * ALL GitHub repos — workspace or not — as of the last feed sync; feed
 * bookkeeping (fetchedAt / status / error) lives in `app_meta` because the
 * feed is a singleton, not a per-repo entity. Every read here is pure
 * database access and can never trigger network; the only door to a `gh
 * search` invocation is ./sync.ts's syncUserFeed.
 */

/** The drizzle transaction handle used inside the write helpers below. */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const SYNCED_AT_KEY = "forge_feed_synced_at";
const SYNC_STATUS_KEY = "forge_feed_sync_status";
const SYNC_ERROR_KEY = "forge_feed_sync_error";

export type ForgeFeedSyncStatus = "never" | "ok" | "failed";

/**
 * What the dashboard feed widget (Phase 9b) renders. `stale` derives from
 * fetchedAt vs SYNC_TTL_MS and `truncated` from the per-kind row counts vs
 * PAGE_LIMIT — neither is stored, so the view can never disagree with the
 * constants.
 */
export interface ForgeUserFeedView {
  items: ForgeFeedItem[];
  /** ISO timestamp of the last successful feed fetch; null when never. */
  fetchedAt: string | null;
  status: ForgeFeedSyncStatus;
  /** Last sync failure message; null unless status is "failed". */
  error: string | null;
  /** fetchedAt older than SYNC_TTL_MS — the UI's "stale" hint. */
  stale: boolean;
  /** True when either kind's stored count reached PAGE_LIMIT ("at least this many"). */
  truncated: boolean;
}

/** Defensive TEXT → ForgeFeedSyncStatus for values read back out of app_meta. */
function asFeedSyncStatus(value: string | null): ForgeFeedSyncStatus {
  return value === "ok" || value === "failed" ? value : "never";
}

/**
 * labels_json → string[]; a malformed column degrades to [], never throws.
 * This LOCAL helper deliberately mirrors the one in ./db.ts (same column
 * convention, different table) rather than coupling the snapshot and feed
 * persistence modules — keep the two in sync.
 */
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

/** All three feed bookkeeping rows in one round trip (absent keys → null). */
async function readFeedMeta(): Promise<{
  fetchedAt: string | null;
  status: string | null;
  error: string | null;
}> {
  const { db } = await getDb();
  const rows = await db
    .select()
    .from(appMeta)
    .where(inArray(appMeta.key, [SYNCED_AT_KEY, SYNC_STATUS_KEY, SYNC_ERROR_KEY]));
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  return {
    fetchedAt: byKey.get(SYNCED_AT_KEY) ?? null,
    status: byKey.get(SYNC_STATUS_KEY) ?? null,
    error: byKey.get(SYNC_ERROR_KEY) ?? null,
  };
}

/** Upsert one app_meta row; a null value clears the key (absent = null). */
async function writeMeta(tx: Tx, key: string, value: string | null): Promise<void> {
  if (value === null) {
    await tx.delete(appMeta).where(eq(appMeta.key, key));
    return;
  }
  await tx
    .insert(appMeta)
    .values({ key, value })
    .onConflictDoUpdate({ target: appMeta.key, set: { value } });
}

/**
 * The cached feed for rendering. Items come back ordered updatedAt DESC
 * (freshest first) with kind as the tiebreaker — "issue" sorts before "pr"
 * for same-timestamp rows. NULLS LAST is stated explicitly rather than
 * trusting the driver's default NULL placement: undated rows must sink, and
 * the feed tests pin that behavior. Pure read — never fetches.
 */
export async function readUserFeed(): Promise<ForgeUserFeedView> {
  const { db } = await getDb();
  const [rows, meta] = await Promise.all([
    db
      .select()
      .from(forgeFeedItems)
      .orderBy(
        sql`${forgeFeedItems.updatedAt} DESC NULLS LAST`,
        forgeFeedItems.kind,
      ),
    readFeedMeta(),
  ]);
  const items: ForgeFeedItem[] = rows.map((row) => ({
    kind: row.kind === "pr" ? "pr" : "issue",
    repoSlug: row.repoSlug,
    number: row.number,
    title: row.title,
    url: row.url,
    updatedAt: row.updatedAt,
    labels: parseLabels(row.labelsJson),
    isDraft: row.isDraft,
  }));
  const fetchedAtMs = meta.fetchedAt === null ? null : Date.parse(meta.fetchedAt);
  // Per-kind counts drive truncation, mirroring the write path (each search
  // list is capped independently): 26 issues + 25 prs exceed PAGE_LIMIT
  // combined, yet neither kind hit the cap, so the view stays untruncated.
  const issuesCount = items.filter((item) => item.kind === "issue").length;
  const pullsCount = items.length - issuesCount;
  return {
    items,
    fetchedAt: meta.fetchedAt,
    status: asFeedSyncStatus(meta.status),
    error: meta.status === "failed" ? meta.error : null,
    stale:
      fetchedAtMs !== null &&
      Number.isFinite(fetchedAtMs) &&
      Date.now() - fetchedAtMs > SYNC_TTL_MS,
    truncated:
      isTruncated(issuesCount, PAGE_LIMIT) ||
      isTruncated(pullsCount, PAGE_LIMIT),
  };
}

/** The feed's last successful fetch time, for the sync service's guard. */
export async function readFeedSyncedAt(): Promise<string | null> {
  return (await readFeedMeta()).fetchedAt;
}

/**
 * The feed's open items for ONE repo slug (plan §Phase 12: the project
 * page's feed fallback) — YOUR items in that repo, not the repo's totals.
 * Same ordering law as readUserFeed (updatedAt DESC NULLS LAST, kind as the
 * tiebreaker); the per-slug subset preserves it when split by kind
 * client-side. An empty array is the honest "no feed rows for this slug".
 * Pure read — never fetches.
 */
export async function readFeedItemsBySlug(
  slug: string,
): Promise<ForgeFeedItem[]> {
  const { db } = await getDb();
  const rows = await db
    .select()
    .from(forgeFeedItems)
    .where(eq(forgeFeedItems.repoSlug, slug))
    .orderBy(
      sql`${forgeFeedItems.updatedAt} DESC NULLS LAST`,
      forgeFeedItems.kind,
    );
  return rows.map((row) => ({
    kind: row.kind === "pr" ? "pr" : "issue",
    repoSlug: row.repoSlug,
    number: row.number,
    title: row.title,
    url: row.url,
    updatedAt: row.updatedAt,
    labels: parseLabels(row.labelsJson),
    isDraft: row.isDraft,
  }));
}

/**
 * Open feed items grouped by repo slug — the overview's feed-derived counts
 * (plan §Phase 11: attribute the feed's items to local projects by remote
 * slug, DB-only). One GROUP BY over the cache table; a slug with none of
 * YOUR items is simply absent from the map, never a zero row — absence is
 * the honest answer there. `kind` reads back through the same defensive
 * lens as readUserFeed: only "pr" is a pull, anything else counts as an
 * issue. Pure read — never fetches.
 */
export async function countFeedBySlug(): Promise<
  Map<string, { issues: number; pulls: number }>
> {
  const { db } = await getDb();
  const rows = await db
    .select({
      repoSlug: forgeFeedItems.repoSlug,
      kind: forgeFeedItems.kind,
      count: sql<number>`COUNT(*)`,
    })
    .from(forgeFeedItems)
    .groupBy(forgeFeedItems.repoSlug, forgeFeedItems.kind);
  const bySlug = new Map<string, { issues: number; pulls: number }>();
  for (const row of rows) {
    const counts = bySlug.get(row.repoSlug) ?? { issues: 0, pulls: 0 };
    if (row.kind === "pr") counts.pulls += Number(row.count);
    else counts.issues += Number(row.count);
    bySlug.set(row.repoSlug, counts);
  }
  return bySlug;
}

/**
 * Persist one fetched feed atomically: drop every previous row, insert the
 * fresh open set, mark the sync ok (fetchedAt/status/error set together, so
 * a crash can never land a new fetch time under a stale error).
 */
export async function replaceFeed(
  items: readonly ForgeFeedItem[],
  fetchedAt: string,
): Promise<void> {
  const { db } = await getDb();
  await db.transaction(async (tx) => {
    await tx.delete(forgeFeedItems);
    for (const item of items) {
      await tx.insert(forgeFeedItems).values({
        kind: item.kind,
        repoSlug: item.repoSlug,
        number: item.number,
        title: item.title,
        url: item.url,
        updatedAt: item.updatedAt,
        labelsJson: JSON.stringify(item.labels),
        isDraft: item.isDraft,
      });
    }
    await writeMeta(tx, SYNCED_AT_KEY, fetchedAt);
    await writeMeta(tx, SYNC_STATUS_KEY, "ok");
    await writeMeta(tx, SYNC_ERROR_KEY, null);
  });
}

/**
 * Record a failed feed sync attempt. Like db.ts's recordSyncFailure, this
 * never clears the previous fetchedAt — stale-but-real items stay renderable
 * with status "failed". Deliberately never throws: a DB failure here must
 * not mask the fetch error, which is the one the user needs to see.
 */
export async function recordFeedFailure(error: string): Promise<void> {
  try {
    const { db } = await getDb();
    await db.transaction(async (tx) => {
      await writeMeta(tx, SYNC_STATUS_KEY, "failed");
      await writeMeta(tx, SYNC_ERROR_KEY, error);
    });
  } catch {
    // Deliberately swallowed — see above.
  }
}
