/**
 * Pure staleness predicates for report-backed widgets — the single source of
 * truth for the owner's staleness rule: a report is STALE when the project's
 * latest updatedAt is 24 hours or more NEWER than the report's generatedAt.
 *
 * This module is deliberately dependency-free (no node imports) so browser
 * bundles can import it directly; the server-side report readers in
 * `./report-export` re-export these symbols so every existing server import
 * keeps working. Never stale when either timestamp is missing or
 * unparseable — absent data is not staleness.
 */

/**
 * A report snapshot is stale when the work it describes moved on by at least
 * this much after the report was generated (owner's rule: "stale is 24h+ when
 * project update more recent"). There is deliberately NO absolute-age term:
 * a report over an untouched project never goes stale.
 */
export const REPORT_STALE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

/**
 * Shared staleness predicate for report-backed UI. Pure and dependency-free
 * so server and client derive the same answer from the same inputs.
 *
 * `generatedAt` — the report export's top-level `generatedAt` field.
 * `latestUpdatedAt` — the project's updatedAt; for root/comparative reports
 * pass the max across the root's projects (see latestUpdatedAtOf).
 */
export function isReportStale(
  generatedAt: string | null,
  latestUpdatedAt: string | null,
): boolean {
  if (generatedAt === null || latestUpdatedAt === null) return false;
  const generated = Date.parse(generatedAt);
  const updated = Date.parse(latestUpdatedAt);
  if (!Number.isFinite(generated) || !Number.isFinite(updated)) return false;
  return updated - generated >= REPORT_STALE_TOLERANCE_MS;
}

/**
 * Max updatedAt across a set of projects — the root/comparative input to
 * isReportStale. Null when the list carries no parseable timestamp.
 */
export function latestUpdatedAtOf(
  updatedAts: readonly (string | null | undefined)[],
): string | null {
  let latest: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const value of updatedAts) {
    if (value === null || value === undefined) continue;
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) continue;
    if (ms > latestMs) {
      latestMs = ms;
      latest = value;
    }
  }
  return latest;
}
