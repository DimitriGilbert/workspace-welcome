/**
 * Forge sync tuning constants — the single source of truth for rate-limit
 * discipline (plan §Sync design). The gh CLI adapter consumes PAGE_LIMIT,
 * CALL_TIMEOUT_MS and AVAILABILITY_CACHE_MS directly; SYNC_TTL_MS and
 * MIN_SYNC_INTERVAL_MS are enforced by the sync service (Phase 4b) and are
 * defined here now so every forge module shares one knob table.
 */

/** Staleness threshold for the UI "stale" hint on a cached snapshot (60 min). */
export const SYNC_TTL_MS = 60 * 60 * 1000;

/** Server-enforced per-repo refusal window between syncs unless `force` (5 min). */
export const MIN_SYNC_INTERVAL_MS = 5 * 60 * 1000;

/** Row cap per `gh issue list` / `gh pr list` call; hitting it renders "50+". */
export const PAGE_LIMIT = 50;

/** Hard timeout for every gh invocation (execFile `timeout`). */
export const CALL_TIMEOUT_MS = 30_000;

/**
 * How long an `gh auth status` probe result — positive OR negative — stays
 * cached. A failed probe must not be re-run on every sync attempt; a down
 * forge is remembered for the full window.
 */
export const AVAILABILITY_CACHE_MS = 10 * 60 * 1000;
