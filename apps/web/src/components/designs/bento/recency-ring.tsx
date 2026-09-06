import type { CSSProperties } from "react";

import { cn } from "@workspace-welcome/ui/lib/utils";

import { compactAge } from "@/components/designs/bento/bento-metrics";
import { dateTooltip } from "@/lib/format";

/**
 * Ring color per mosaic tier — the shared algorithm's tier labels, one tone
 * each, matching --tone-* in bento.css. Green leads (live), gray trails
 * (compact).
 */
const TONE_COLOR: Record<string, string> = {
  hero: "var(--tone-live)",
  feature: "var(--tone-warm)",
  large: "var(--tone-cooling)",
  medium: "var(--bento-c4)",
  compact: "var(--tone-cold)",
};

interface RecencyRingProps {
  /** Epoch ms of the project's updatedAt — reads as the compact age. */
  updatedAtMs: number;
  /**
   * Log-scaled set-relative recency 0..1 from the shared mosaic layout —
   * drives the sweep, so the ring and the tile size tell one story.
   */
  score: number;
  tier: string;
  now: number;
  /** Ring diameter in px. */
  px?: number;
  className?: string;
}

/**
 * The recency ring: a thin progress circle whose sweep is the project's
 * log-scaled recency score and whose color is its tier — full green ring
 * "now", empty gray ring "8mo". The compact age reads inside it, so one
 * glance answers both "how big is this tile and why" and "how long since I
 * was here".
 */
export function RecencyRing({
  updatedAtMs,
  score,
  tier,
  now,
  px = 34,
  className,
}: RecencyRingProps) {
  const stroke = 3;
  const r = (px - stroke) / 2;
  const c = 2 * Math.PI * r;
  const sweep = Math.max(0.02, Math.min(1, score));
  const color = TONE_COLOR[tier] ?? TONE_COLOR.compact;
  const iso = new Date(updatedAtMs).toISOString();

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      title={`Updated ${dateTooltip(iso)}`}
    >
      <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} aria-hidden>
        <circle
          cx={px / 2}
          cy={px / 2}
          r={r}
          fill="none"
          stroke="oklch(1 0 0 / 0.09)"
          strokeWidth={stroke}
        />
        <circle
          cx={px / 2}
          cy={px / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${sweep * c} ${c}`}
          transform={`rotate(-90 ${px / 2} ${px / 2})`}
          style={{ filter: `drop-shadow(0 0 4px ${color})`, opacity: tier === "compact" ? 0.85 : 1 }}
        />
      </svg>
      <span
        className="b-age absolute inset-0 flex items-center justify-center"
        style={{ fontSize: px >= 40 ? 10.5 : 9 }}
      >
        {compactAge(updatedAtMs, now)}
      </span>
    </span>
  );
}

const LEGEND_ITEMS: { tier: string; shape: string; meaning: string }[] = [
  { tier: "hero", shape: "3×3", meaning: "live" },
  { tier: "feature", shape: "2×3", meaning: "warm" },
  { tier: "large", shape: "2×2", meaning: "current" },
  { tier: "medium", shape: "2×1", meaning: "cooling" },
  { tier: "compact", shape: "1×1", meaning: "archive" },
];

/**
 * The mosaic header legend: the five cell shapes at scale with the recency
 * meaning each size encodes, so tile size reads as data, not decoration.
 */
export function SizeLegend() {
  return (
    <div
      className="b-legend"
      aria-label="Tile size by recency: 3 by 3 live, 2 by 3 warm, 2 by 2 current, 2 by 1 cooling, 1 by 1 archive"
    >
      {LEGEND_ITEMS.map((item) => (
        <span key={item.tier} className="b-legend-item">
          <span
            className="b-legend-cell"
            style={{ color: TONE_COLOR[item.tier] } as CSSProperties}
            aria-hidden
          >
            <i className={item.tier} />
          </span>
          <span className="flex flex-col">
            <span className="font-medium text-foreground/80">{item.meaning}</span>
            <span>{item.shape}</span>
          </span>
        </span>
      ))}
    </div>
  );
}
