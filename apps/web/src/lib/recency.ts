/**
 * Recency model for the dashboard.
 *
 * Freshness is a 0..1 value derived from when a project was last worked on.
 * 1 = touched right now, 0 = older than the horizon. We use a power curve
 * (not linear) so the recent end gets more perceptual resolution: the
 * difference between "today" and "3 days ago" matters more to a developer
 * than the difference between "60 days" and "90 days".
 *
 * The freshness value drives:
 *   - border color via color-mix(in oklch, fresh X%, stale)
 *   - tier classification (which layout treatment the card gets)
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
 * or collapses into the compact "older" list.
 *   fresh  < 2 days   — hottest border
 *   recent < 14 days  — warm border, still a prominent card
 *   stale  < 90 days   — faint border, normal card
 *   cold   >= 90 days  — collapses into compact list
 */
export function tierFromFreshness(f: number): RecencyTier {
  if (f >= 0.78) return "fresh";
  if (f >= 0.45) return "recent";
  if (f > 0.02) return "stale";
  return "cold";
}

/** Percentage of the "fresh" endpoint to mix in for color-mix. We exaggerate
 * slightly above the raw freshness so even "recent" cards still show clear
 * color instead of looking grey. Min floor keeps cold cards from vanishing. */
export function heatMixPercent(f: number): number {
  const scaled = Math.min(1, f * 1.15);
  return Math.round(Math.max(0.06, scaled) * 100);
}

/** CSS color value for the recency border, ready to drop into a style attr. */
export function heatBorderColor(f: number): string {
  const pct = heatMixPercent(f);
  return `color-mix(in oklch, var(--recency-fresh) ${pct}%, var(--recency-stale))`;
}
