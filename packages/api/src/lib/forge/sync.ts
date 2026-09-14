import { gitInspect } from "../git";
import { getScan } from "../scan-cache";
import { readStore } from "../store";
import { MIN_SYNC_INTERVAL_MS } from "./constants";
import {
  readLastSyncedAt,
  recordSyncFailure,
  replaceSnapshot,
  upsertRepoLink,
} from "./db";
import { readFeedSyncedAt, recordFeedFailure, replaceFeed } from "./feed";
import { ghCliAdapter } from "./gh-cli";
import { resolveAdapter } from "./registry";
import type {
  ForgeAdapter,
  ForgeRepoRef,
  ForgeSnapshot,
  ForgeUserFeed,
  UserFeedAdapter,
} from "./types";

/**
 * The guarded forge sync entrypoints — the ONLY place in the codebase that
 * invokes an adapter (isAvailable / fetchSnapshot / fetchUserFeed).
 * syncForgeRepo syncs one project's repo; syncUserFeed (plan §Phase 9) syncs
 * the authenticated user's cross-repo feed; syncAllRepos (plan §Phase 10a)
 * sweeps every workspace project then the feed in ONE strictly sequential
 * run. All three share the rate-limit discipline (plan §Sync design), in the
 * order a call meets it:
 *
 *   a. resolve the project's origin remote (gitInspect, repo sync only)
 *   b. upsert the project→repo link; unsupported host throws (repo sync only)
 *   c. MIN_SYNC_INTERVAL_MS refusal unless `force`
 *   d. in-flight dedupe — concurrent syncs of the same target share one attempt
 *   e. a process-wide sequential queue — one adapter invocation at a time
 *      across ALL syncs, both kinds (the probe rides it too)
 *   f. availability probe short-circuit ("gh not authenticated")
 *   g. fetch (adapters sequence their gh calls internally) + replace
 *   h. fetch/parse failure → record*Failure + rethrow (toast path)
 */

/** Summary of one completed sync — what Phase 5's mutation returns. */
export interface ForgeSyncResult {
  repoRef: ForgeRepoRef;
  /** ISO timestamp of the fetch. */
  fetchedAt: string;
  openIssues: number;
  openPulls: number;
  truncated: boolean;
}

export interface SyncForgeOptions {
  /** Bypass the MIN_SYNC_INTERVAL_MS refusal. */
  force?: boolean;
  /** Clock injection for tests; defaults to Date.now. */
  now?: () => number;
  /** Adapter injection for tests; defaults to the registry resolution. */
  adapter?: ForgeAdapter;
}

// --- Process-wide sequencing ---------------------------------------------------

/**
 * Single global chain: every adapter invocation (probe or fetch) from every
 * sync is threaded through it, so two gh processes are never in flight at
 * once no matter how many repos sync concurrently. Rejections are absorbed
 * into the chain — one failed sync must not deadlock the next — while the
 * original rejection still reaches its caller.
 */
let fetchQueue: Promise<unknown> = Promise.resolve();

function enqueueFetch<T>(run: () => Promise<T>): Promise<T> {
  const result = fetchQueue.then(run, run);
  fetchQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** In-flight syncs keyed by repo identity (kind+host+slug). */
const inFlightSyncs = new Map<string, Promise<ForgeSyncResult>>();

function repoKey(ref: ForgeRepoRef): string {
  return `${ref.kind}:${ref.host}:${ref.slug}`;
}

/**
 * The min-interval refusal both sync targets throw. A subclass of Error so
 * the single-target toast path is byte-for-byte unchanged (same message
 * vocabulary, still a plain Error to tRPC); syncAllRepos discriminates on
 * instanceof to record the refusal as a "skipped" row rather than a failure,
 * instead of string-matching user-facing text.
 */
export class ForgeSyncIntervalRefusalError extends Error {
  constructor(minutes: number) {
    super(`Synced ${minutes} min ago — use force`);
    this.name = "ForgeSyncIntervalRefusalError";
  }
}

/** The probe + fetch + persist pipeline one deduped sync attempt runs. */
async function runSyncedFetch(
  repoRef: ForgeRepoRef,
  adapter: ForgeAdapter,
): Promise<ForgeSyncResult> {
  // Availability rides the same queue as fetches — a probe is an adapter
  // invocation too, and availability failures are remembered inside the
  // adapter for AVAILABILITY_CACHE_MS.
  const available = await enqueueFetch(() => adapter.isAvailable());
  if (!available) {
    throw new Error("gh not authenticated — run `gh auth login`");
  }

  let snapshot: ForgeSnapshot;
  try {
    snapshot = await enqueueFetch(() => adapter.fetchSnapshot(repoRef));
  } catch (err) {
    // Record, then rethrow the adapter's wrapped error for the toast path.
    // Recording is best-effort: a DB failure here must not mask the fetch
    // error, which is the one the user needs to see.
    try {
      await recordSyncFailure(
        repoRef,
        err instanceof Error ? err.message : String(err),
      );
    } catch {
      // Deliberately swallowed — see above.
    }
    throw err;
  }

  await replaceSnapshot(repoRef, snapshot);
  return {
    repoRef,
    fetchedAt: snapshot.fetchedAt,
    openIssues: snapshot.issues.length,
    openPulls: snapshot.pulls.length,
    truncated: snapshot.issuesTruncated || snapshot.pullsTruncated,
  };
}

/**
 * Sync one project's forge repo now. Throws with user-facing vocabulary on
 * every refusal path ("No git remote configured for this project",
 * "Forge host unsupported: <host> — GitHub only for now", "Synced X min ago
 * — use force", "gh not authenticated — run `gh auth login`"); fetch
 * failures rethrow the adapter's wrapped error after being recorded.
 */
export async function syncForgeRepo(
  projectPath: string,
  opts: SyncForgeOptions = {},
): Promise<ForgeSyncResult> {
  const now = opts.now ?? Date.now;

  // a. The origin remote is the only forge identity source.
  const git = await gitInspect(projectPath);
  const remote = git.isRepo ? git.remote : null;
  if (remote === null) {
    throw new Error("No git remote configured for this project");
  }

  // b. Map project → repo (idempotent upsert of repo row + link).
  const repoRef = await upsertRepoLink(projectPath, remote);
  if (repoRef === null) {
    throw new Error(
      `Forge host unsupported: ${remote.host} — GitHub only for now`,
    );
  }
  const adapter = opts.adapter ?? resolveAdapter(remote);
  if (adapter === null) {
    // Same registry that just produced a ref — unreachable, but re-derived
    // rather than assumed so the registry stays the only routing rule.
    throw new Error(
      `Forge host unsupported: ${remote.host} — GitHub only for now`,
    );
  }

  // c. Per-repo min-interval refusal unless forced. A future-dated
  // lastSyncedAt (clock skew) also refuses — the account-safe direction.
  if (!opts.force) {
    const lastSyncedAt = await readLastSyncedAt(repoRef);
    if (lastSyncedAt !== null) {
      const fetchedAtMs = Date.parse(lastSyncedAt);
      if (Number.isFinite(fetchedAtMs)) {
        const elapsedMs = now() - fetchedAtMs;
        if (elapsedMs < MIN_SYNC_INTERVAL_MS) {
          const minutes = Math.max(1, Math.round(elapsedMs / 60_000));
          throw new ForgeSyncIntervalRefusalError(minutes);
        }
      }
    }
  }

  // d. Dedupe: an identical in-flight sync hands back the same promise —
  // never a second fetch for one repo.
  const key = repoKey(repoRef);
  const inFlight = inFlightSyncs.get(key);
  if (inFlight !== undefined) return inFlight;

  const attempt = runSyncedFetch(repoRef, adapter);
  inFlightSyncs.set(key, attempt);
  try {
    return await attempt;
  } finally {
    inFlightSyncs.delete(key);
  }
}

// --- Fleet sync: every project + the feed (plan §Phase 10a) ----------------------

/** Why a project was left out of a fleet run before any attempt was made. */
export type ForgeSyncAllSkipReason = "no-remote" | "unsupported-host";

/** One project's outcome in a fleet run. */
export interface ForgeSyncAllProjectResult {
  projectPath: string;
  /**
   * The repo that was attempted/synced — from the project's CURRENT origin
   * remote (null on pre-attempt skips, where no forge identity exists).
   */
  slug: string | null;
  status: "synced" | "skipped" | "failed";
  /** Present only on pre-attempt skips. */
  reason?: ForgeSyncAllSkipReason;
  openIssues?: number;
  openPulls?: number;
  truncated?: boolean;
  error?: string;
  fetchedAt?: string;
}

/** The user-feed step's outcome, riding the same run as the project loop. */
export interface ForgeSyncAllFeedResult {
  status: "synced" | "skipped" | "failed";
  itemCount?: number;
  issuesCount?: number;
  pullsCount?: number;
  truncated?: boolean;
  error?: string;
}

/** Everything one "Sync all" run produced. */
export interface ForgeSyncAllResult {
  results: ForgeSyncAllProjectResult[];
  feed: ForgeSyncAllFeedResult;
  /** ISO timestamp of the moment the run started. */
  fetchedAt: string;
}

export interface SyncAllOptions {
  /** Bypass every per-target MIN_SYNC_INTERVAL_MS refusal. */
  force?: boolean;
  /** Clock injection for tests; defaults to Date.now. */
  now?: () => number;
  /**
   * Adapter injection for tests, applied to every repo sync AND the feed
   * step; must therefore cover both surfaces (UserFeedAdapter extends
   * ForgeAdapter). Defaults resolve per repo / to the gh CLI adapter.
   */
  adapter?: UserFeedAdapter;
}

/**
 * Sync EVERYTHING forge in one run (plan §Phase 10a): every visible project
 * from the workspace scan, then the authenticated user's feed. The law
 * (ADR-0007): the project loop is a plain awaited for-loop — NEVER
 * Promise.all — and every fetch goes through syncForgeRepo / syncUserFeed, so
 * the per-repo min-interval refusal, in-flight dedupe and the ONE global
 * queue stay fully intact; one adapter invocation is in flight at a time
 * across the whole sweep. Projects are enumerated exactly the way the
 * projects router serves them (readStore → getScan — the cached local
 * scan; git/stat only, never network) and each resolves its CURRENT origin
 * remote first: no remote → skipped "no-remote", no adapter or unparsable
 * slug → skipped "unsupported-host" — both are skips, not errors, and a
 * never-synced GitHub project gets its link created by its first sync so
 * every project's widget updates. Failures are isolated per target: one
 * repo's error (or the feed's) is recorded in its row and the sweep
 * continues; targets inside their min-interval come back "skipped" unless
 * `force`. No projects → an empty results array (the feed step still runs),
 * never an error.
 */
export async function syncAllRepos(
  opts: SyncAllOptions = {},
): Promise<ForgeSyncAllResult> {
  const now = opts.now ?? Date.now;
  const fetchedAt = new Date(now()).toISOString();

  const store = await readStore();
  const scan = await getScan({
    roots: store.roots,
    overrides: store.projects,
    settings: store.settings,
  });
  // Path-sorted for stable, re-sortable reporting (the scan's own order is a
  // pinned/recency display order).
  const projects = [...scan.projects].sort((a, b) =>
    a.path.localeCompare(b.path),
  );

  const results: ForgeSyncAllProjectResult[] = [];
  for (const project of projects) {
    // Fresh remote resolution (local gitInspect), not the scan snapshot's —
    // classification must match what syncForgeRepo will do moments later.
    const git = await gitInspect(project.path);
    const remote = git.isRepo ? git.remote : null;
    if (remote === null) {
      results.push({
        projectPath: project.path,
        slug: null,
        status: "skipped",
        reason: "no-remote",
      });
      continue;
    }
    // Routing is always the registry's call (the DI adapter replaces WHICH
    // github adapter fetches, never which hosts are supported) — mirrors
    // upsertRepoLink inside syncForgeRepo.
    const routed = resolveAdapter(remote);
    if (routed === null || remote.slug === null) {
      results.push({
        projectPath: project.path,
        slug: null,
        status: "skipped",
        reason: "unsupported-host",
      });
      continue;
    }
    try {
      const result = await syncForgeRepo(project.path, {
        force: opts.force,
        now,
        adapter: opts.adapter,
      });
      results.push({
        projectPath: project.path,
        slug: result.repoRef.slug,
        status: "synced",
        openIssues: result.openIssues,
        openPulls: result.openPulls,
        truncated: result.truncated,
        fetchedAt: result.fetchedAt,
      });
    } catch (err) {
      if (err instanceof ForgeSyncIntervalRefusalError) {
        results.push({
          projectPath: project.path,
          slug: remote.slug,
          status: "skipped",
        });
      } else {
        results.push({
          projectPath: project.path,
          slug: remote.slug,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // The feed rides the same sequential run, guarded identically.
  let feed: ForgeSyncAllFeedResult;
  try {
    const feedResult = await syncUserFeed({
      force: opts.force,
      now,
      adapter: opts.adapter,
    });
    feed = {
      status: "synced",
      itemCount: feedResult.itemCount,
      issuesCount: feedResult.issuesCount,
      pullsCount: feedResult.pullsCount,
      truncated: feedResult.truncated,
    };
  } catch (err) {
    if (err instanceof ForgeSyncIntervalRefusalError) {
      feed = { status: "skipped" };
    } else {
      feed = {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return { results, feed, fetchedAt };
}

// --- User-level feed sync (plan §Phase 9) ----------------------------------------

/** Summary of one completed feed sync — what the syncFeed mutation returns. */
export interface UserFeedSyncResult {
  /** ISO timestamp of the fetch. */
  fetchedAt: string;
  itemCount: number;
  issuesCount: number;
  pullsCount: number;
  truncated: boolean;
}

export interface SyncUserFeedOptions {
  /** Bypass the MIN_SYNC_INTERVAL_MS refusal. */
  force?: boolean;
  /** Clock injection for tests; defaults to Date.now. */
  now?: () => number;
  /** Adapter injection for tests; defaults to the gh CLI adapter. */
  adapter?: UserFeedAdapter;
}

/**
 * In-flight feed syncs. One key only — the feed is user-level, not per-repo —
 * but the Map keeps the dedupe shape identical to the repo syncs above. The
 * key never collides with repoKey's "kind:host:slug" vocabulary.
 */
const inFlightFeedSyncs = new Map<string, Promise<UserFeedSyncResult>>();
const FEED_SYNC_KEY = "user-feed";

/** The probe + fetch + persist pipeline one deduped feed sync runs. */
async function runUserFeedFetch(
  adapter: UserFeedAdapter,
): Promise<UserFeedSyncResult> {
  // Availability rides the same global queue as every other adapter
  // invocation — one gh process in flight stays true across BOTH sync kinds.
  const available = await enqueueFetch(() => adapter.isAvailable());
  if (!available) {
    throw new Error("gh not authenticated — run `gh auth login`");
  }

  let feed: ForgeUserFeed;
  try {
    feed = await enqueueFetch(() => adapter.fetchUserFeed());
  } catch (err) {
    // Record best-effort (recordFeedFailure never throws, so the original
    // fetch error — the one the user needs — is what propagates), rethrow.
    await recordFeedFailure(err instanceof Error ? err.message : String(err));
    throw err;
  }

  await replaceFeed(feed.items, feed.fetchedAt);
  return {
    fetchedAt: feed.fetchedAt,
    itemCount: feed.items.length,
    issuesCount: feed.items.filter((item) => item.kind === "issue").length,
    pullsCount: feed.items.filter((item) => item.kind === "pr").length,
    truncated: feed.truncated,
  };
}

/**
 * Sync the authenticated user's cross-repo feed now (ONE `gh search` per kind
 * inside the adapter — never per-project). Guard order mirrors syncForgeRepo
 * exactly: min-interval refusal unless forced → in-flight dedupe → the same
 * process-wide sequential queue (shared with repo syncs) → availability
 * probe short-circuit → fetch (the adapter sequences issues→prs internally)
 * → replaceFeed. Refusal/availability paths use the same user-facing
 * vocabulary as the repo sync; fetch failures are recorded then rethrown.
 */
export async function syncUserFeed(
  opts: SyncUserFeedOptions = {},
): Promise<UserFeedSyncResult> {
  const now = opts.now ?? Date.now;
  const adapter = opts.adapter ?? ghCliAdapter;

  // a. Feed-level min-interval refusal unless forced. A future-dated
  // fetchedAt (clock skew) also refuses — the account-safe direction.
  if (!opts.force) {
    const lastSyncedAt = await readFeedSyncedAt();
    if (lastSyncedAt !== null) {
      const fetchedAtMs = Date.parse(lastSyncedAt);
      if (Number.isFinite(fetchedAtMs)) {
        const elapsedMs = now() - fetchedAtMs;
        if (elapsedMs < MIN_SYNC_INTERVAL_MS) {
          const minutes = Math.max(1, Math.round(elapsedMs / 60_000));
          throw new ForgeSyncIntervalRefusalError(minutes);
        }
      }
    }
  }

  // b. Dedupe: an identical in-flight feed sync hands back the same promise —
  // never a second search pair for one user.
  const inFlight = inFlightFeedSyncs.get(FEED_SYNC_KEY);
  if (inFlight !== undefined) return inFlight;

  const attempt = runUserFeedFetch(adapter);
  inFlightFeedSyncs.set(FEED_SYNC_KEY, attempt);
  try {
    return await attempt;
  } finally {
    inFlightFeedSyncs.delete(FEED_SYNC_KEY);
  }
}
