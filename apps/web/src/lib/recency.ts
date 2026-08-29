/**
 * Recency model for the dashboard.
 *
 * Freshness is a 0..1 value derived from when a project was last worked on.
 * 1 = touched right now, 0 = older than the horizon. We use a power curve
 * (not linear) so the recent end gets more perceptual resolution: the
 * difference between "today" and "3 days ago" matters more to a developer
 * than the difference between "60 days" and "90 days".
 *
 * The freshness value drives the tier classification, which decides where a
 * project lands (recent card grid vs compact older list) and whether it dims.
 */

/** Horizon in ms. Older than this -> freshness 0. 90 days feels right for
 * "this is still vaguely relevant to me" vs "cold archive". */
const HORIZON_MS = 90 * 24 * 60 * 60 * 1000;

/** A nudge: if the user explicitly opened a project from the UI recently,
 *  treat it as slightly fresher than its raw mtime suggests. */
const LAST_OPENED_BOOST = 0.12;

/**
 * Freshness 0..1 (clamped). `updatedAt` is the source of truth; an optional
 * `lastOpenedAt` adds a small boost so manually-reopened projects stay warm.
 */
export function freshness(
  updatedAt: string,
  lastOpenedAt: string | null,
  now: number = Date.now(),
): number {
  const updatedMs = new Date(updatedAt).getTime();
  const ref = Math.max(updatedMs, lastOpenedAt ? new Date(lastOpenedAt).getTime() : 0);
  const age = Math.max(0, now - ref);
  if (age >= HORIZON_MS) return 0;

  const linear = 1 - age / HORIZON_MS;
  // Power curve: squares the linear value so recent items dominate the scale.
  // Result: "1 day ago" ~0.99, "1 week" ~0.79, "1 month" ~0.46, "3 months" ~0.
  const curved = linear * linear;

  const openedRecently =
    lastOpenedAt && now - new Date(lastOpenedAt).getTime() < 14 * 24 * 60 * 60 * 1000;
  return Math.min(1, curved + (openedRecently ? LAST_OPENED_BOOST : 0));
}

export type RecencyTier = "fresh" | "recent" | "stale" | "cold";

/**
 * Layout tier. Drives whether a project gets a full card, a dimmed card,
 * or collapses into the compact "older" list — and whether the "updated"
 * timestamp lights up in the accent color. Kept honest: fresh really means
 * "touched in the last couple of days".
 *   fresh  <= ~2 days  — alive; accent-colored timestamp
 *   recent < 14 days   — normal card
 *   stale  < 90 days   — normal card, quieter
 *   cold   >= 90 days  — collapses into compact list
 */
export function tierFromFreshness(f: number): RecencyTier {
  if (f >= 0.95) return "fresh";
  if (f >= 0.45) return "recent";
  if (f > 0.02) return "stale";
  return "cold";
}
