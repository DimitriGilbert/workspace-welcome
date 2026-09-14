import { gitInspect } from "../git";
import { MIN_SYNC_INTERVAL_MS } from "./constants";
import {
  readLastSyncedAt,
  recordSyncFailure,
  replaceSnapshot,
  upsertRepoLink,
} from "./db";
import { resolveAdapter } from "./registry";
import type {
  ForgeAdapter,
  ForgeRepoRef,
  ForgeSnapshot,
} from "./types";

/**
 * The guarded forge sync entrypoint — the ONLY place in the codebase that
 * invokes an adapter (isAvailable / fetchSnapshot). Rate-limit discipline
 * (plan §Sync design), in the order a call meets it:
 *
 *   a. resolve the project's origin remote (gitInspect)
 *   b. upsert the project→repo link; unsupported host throws
 *   c. MIN_SYNC_INTERVAL_MS refusal unless `force`
 *   d. in-flight dedupe — concurrent syncs of the same repo share one attempt
 *   e. a process-wide sequential queue — one adapter invocation at a time
 *      across ALL repos (the probe rides it too)
 *   f. availability probe short-circuit ("gh not authenticated")
 *   g. fetch (adapter sequences issues→pulls internally) + replaceSnapshot
 *   h. fetch/parse failure → recordSyncFailure + rethrow (toast path)
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
          throw new Error(`Synced ${minutes} min ago — use force`);
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
