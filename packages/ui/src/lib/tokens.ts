import type { CSSProperties } from "react";

/**
 * The ui package's semantic tone system and chart color ramp.
 *
 * Parts never hardcode colors — they address the theme's required custom
 * properties, and each theme's `tokens.css` gives those tokens values. This
 * module is the single Tone → token map (chip and every tone-taking part
 * read it); the chart ramp cycling belongs to ui, NOT to scan-metrics
 * (packages/ui never imports app code and vice versa).
 */

/** Semantic accent register for chips, stats, and tone-tinted text. */
export type Tone =
  | "critical"
  | "warning"
  | "info"
  | "positive"
  | "accent"
  | "neutral";

/** The required theme token each tone resolves to. */
export const TONE_TOKEN: Record<Tone, string> = {
  critical: "var(--sev-critical)",
  warning: "var(--sev-warning)",
  info: "var(--sev-info)",
  positive: "var(--state-positive)",
  accent: "var(--pinned-accent)",
  neutral: "var(--muted-foreground)",
};

/** Inline style for a tone-tinted element: colored text over a faint wash. */
export function toneStyle(tone: Tone): CSSProperties {
  const color = TONE_TOKEN[tone];
  return {
    color,
    backgroundColor: `color-mix(in oklch, ${color} 11%, transparent)`,
  };
}

/** The theme's six chart tokens, in ramp order. */
export const CHART_TOKENS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
] as const;

/**
 * Cycle the theme's chart ramp — `chartColor(0)` is the primary series,
 * `chartColor(6)` wraps back to the first. Negative indices wrap too.
 */
export function chartColor(i: number): string {
  const n = CHART_TOKENS.length;
  // The index math above is always in range; the fallback is unreachable.
  return CHART_TOKENS[(((i % n) + n) % n)] ?? "var(--chart-1)";
}
