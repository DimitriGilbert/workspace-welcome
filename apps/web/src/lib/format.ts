import { formatDistanceToNow, format } from "date-fns";

/** "3 days ago" style — compact relative time for the UI. date-fns hedges
 * ("about 3 weeks ago") which bloats dense tables, so qualifiers are trimmed;
 * exact dates live in the tooltips. */
export function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
      .replace(/^about /, "")
      .replace(/^almost /, "")
      .replace(/^over /, "");
  } catch {
    return "—";
  }
}

/** Absolute date like "Jul 14, 2026" for tooltips / detail views. */
export function absoluteDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "MMM d, yyyy");
  } catch {
    return "—";
  }
}

/** Both relative and absolute, joined for tooltips. */
export function dateTooltip(iso: string | null): string {
  if (!iso) return "";
  return `${relativeTime(iso)} (${absoluteDate(iso)})`;
}

/** "3.2 MB"-style byte size for file listings. */
export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Compact numeral on the mission-bento ladder: 6760914711 → 6.8B,
 * 210433186 → 210.4M, 912 → 912 (thousands round to whole k, smaller
 * counts keep their locale grouping). Replaces the duplicate
 * `formatCompact` in `components/designs/mission-bento/report-utils.ts`
 * (removed at cleanup K1).
 */
export function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return n.toLocaleString();
}

/**
 * Compact token figures on the meadow ladder: 618.8M, 61.9k, 942 —
 * one decimal all the way down to 1k, plain integer below. Replaces the
 * duplicate `formatTokens` in
 * `components/designs/meadow/report-data.ts` (removed at cleanup K1).
 */
export function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/**
 * Recorded (subsidized) AI cost, meadow superset: "$1.24" / "$0",
 * sub-cent precision below 1¢ (`$0.0004`) and grouped rounding at $1000+.
 * Replaces `formatCost` in `components/designs/meadow/report-data.ts`
 * and the thinner duplicates in
 * `components/designs/mission-bento/report-utils.ts` and
 * `components/designs/bento/project-tile.tsx` (removed at cleanup K1).
 */
export function formatCost(cost: number): string {
  if (cost === 0) return "$0";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1000) return `$${cost.toFixed(2)}`;
  return `$${Math.round(cost).toLocaleString()}`;
}

/**
 * Compact age numeral for a point in time given as epoch milliseconds:
 * "now", "4m", "3h", "2d", "5w", "1mo", "1y" — the meadow ladder,
 * week rung included (days < 14 → d, < 70 → w, < 730 → mo, else y).
 * Elapsed under a minute (or a future timestamp) reads as "now"; the
 * exact timestamp rides along in tooltips. `now` is a defaulted
 * parameter so callers (and tests) stay SSR-safe. Replaces the ISO-input
 * `compactAge` in `components/designs/meadow/derive.ts` (removed at
 * cleanup K1; ISO callers go through {@link ageMs}).
 */
export function compactAge(ms: number, now: number = Date.now()): string {
  const elapsed = now - ms;
  if (elapsed <= 60_000) return "now";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d`;
  if (days < 70) return `${Math.floor(days / 7)}w`;
  if (days < 730) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

/**
 * ISO bridge to {@link compactAge}: parses an ISO timestamp (or null →
 * "—") into epoch ms and delegates; unparseable input also yields "—".
 * Takes over the ISO entry point of meadow derive.ts `compactAge`
 * (removed at cleanup K1).
 */
export function ageMs(iso: string | null, now?: number): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  return now === undefined ? compactAge(ms) : compactAge(ms, now);
}

/**
 * Job-timer elapsed readout: "42s", "3m 05s" (seconds zero-padded once
 * minutes appear, clamped at zero). Replaces the private `formatElapsed`
 * duplicates in `lib/forms/create-project.tsx`,
 * `components/designs/mission-control/console-forms.tsx`,
 * `routes/index.tsx`, and the `routes/designs/*` pages (removed at
 * cleanup K1).
 */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0
    ? `${minutes}m ${String(rest).padStart(2, "0")}s`
    : `${rest}s`;
}
