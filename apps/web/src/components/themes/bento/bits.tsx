/**
 * Bento's glazed surface unit + shared presentation fragments — verbatim
 * ports of `components/designs/bento/bento-tile.tsx`, `roll-number.tsx`,
 * `git-glyphs.tsx`, `recency-ring.tsx`, and `cadence-area.tsx`. The only
 * edits against the design originals are import re-pointing and color
 * literals lifted into the theme's custom-property tokens (the harness
 * keeps widget TSX literal-free).
 */
import type { CSSProperties, HTMLAttributes } from "react";
import { AnimatePresence, motion } from "motion/react";

import { cn } from "@workspace-welcome/ui/lib/utils";

import { compactAge, dateTooltip } from "@/lib/format";

/* ------------------------------------------------------------- BentoTile */

export interface BentoTileProps extends HTMLAttributes<HTMLDivElement> {
  /** Whole tile is a clickable/keyboard-activatable surface. */
  action?: boolean;
  pinned?: boolean;
}

export function BentoTile({
  action = false,
  pinned = false,
  className,
  ...rest
}: BentoTileProps) {
  return (
    <div
      className={cn("b-tile", action && "b-tile--action", pinned && "b-tile--pinned", className)}
      {...rest}
    />
  );
}

/* ------------------------------------------------------------ RollNumber */

interface RollNumberProps {
  value: number;
  className?: string;
  style?: CSSProperties;
  /** Accessible text — defaults to the value itself. */
  label?: string;
}

/** A numeral that rolls when its value changes (the design's feedback idiom). */
export function RollNumber({ value, className, style, label }: RollNumberProps) {
  return (
    <span className="relative inline-flex overflow-hidden" aria-label={label ?? String(value)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: "60%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-60%", opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.2, 0.9, 0.3, 1] }}
          className={cn("inline-block tabular-nums", className)}
          style={style}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ------------------------------------------------------------- GitGlyphs */

interface GitGlyphsProps {
  git: {
    isRepo: boolean;
    ahead?: number | null;
    behind?: number | null;
    dirtyCount?: number | null;
  };
  /** Larger chips for hero tiles. */
  large?: boolean;
  className?: string;
}

/** Mono glyph chips: ↑ ahead · ↓ behind · ~ dirty · ✓ clean. */
export function GitGlyphs({ git, large = false, className }: GitGlyphsProps) {
  const ahead = git.ahead ?? 0;
  const behind = git.behind ?? 0;
  const dirty = git.dirtyCount ?? 0;

  if (!git.isRepo) {
    return (
      <span
        className={cn("b-glyph border-transparent bg-transparent text-muted-foreground/70", className)}
        style={large ? { fontSize: 12, height: 24 } : undefined}
      >
        — not a repo
      </span>
    );
  }

  const clean = ahead === 0 && behind === 0 && dirty === 0;

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      {ahead > 0 ? (
        <span
          className="b-glyph"
          style={{
            color: "var(--state-positive)",
            borderColor: "color-mix(in oklch, var(--state-positive) 35%, transparent)",
            ...(large ? { fontSize: 12, height: 24, padding: "0 8px" } : {}),
          }}
          title={`${ahead} unpushed commit${ahead === 1 ? "" : "s"}`}
        >
          ↑{ahead}
        </span>
      ) : null}
      {behind > 0 ? (
        <span
          className="b-glyph"
          style={{
            color: "var(--sev-warning)",
            borderColor: "color-mix(in oklch, var(--sev-warning) 35%, transparent)",
            ...(large ? { fontSize: 12, height: 24, padding: "0 8px" } : {}),
          }}
          title={`${behind} commit${behind === 1 ? "" : "s"} behind upstream`}
        >
          ↓{behind}
        </span>
      ) : null}
      {dirty > 0 ? (
        <span
          className="b-glyph"
          style={{
            color: "var(--foreground)",
            ...(large ? { fontSize: 12, height: 24, padding: "0 8px" } : {}),
          }}
          title={`${dirty} uncommitted file${dirty === 1 ? "" : "s"}`}
        >
          ~{dirty}
        </span>
      ) : null}
      {clean ? (
        <span
          className="b-glyph"
          style={{
            color: "var(--state-positive)",
            borderColor: "color-mix(in oklch, var(--state-positive) 25%, transparent)",
            ...(large ? { fontSize: 12, height: 24, padding: "0 8px" } : {}),
          }}
          title="Clean tree, synced with upstream"
        >
          ✓
        </span>
      ) : null}
    </span>
  );
}

/* ----------------------------------------------------------- RecencyRing */

/** Ring color per mosaic tier — one tone each, matching --tone-* tokens. */
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
  /** Log-scaled set-relative recency 0..1 — drives the sweep. */
  score: number;
  tier: string;
  now: number;
  /** Ring diameter in px. */
  px?: number;
  className?: string;
}

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
        <circle cx={px / 2} cy={px / 2} r={r} fill="none" stroke="var(--bento-ring-track)" strokeWidth={stroke} />
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

/** The mosaic header legend: the five cell shapes at scale. */
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

/* ----------------------------------------------------------- CadenceArea */

/** Monthly cadence as a filled area — pure SVG, the design's tile chart. */
export function CadenceArea({ cadence }: { cadence: { period: string; commits: number }[] }) {
  const points = cadence.slice(-12);
  const max = Math.max(...points.map((p) => p.commits), 1);
  const step = points.length > 1 ? 100 / (points.length - 1) : 100;
  const coords =
    points.length === 1
      ? [
          { x: 0, y: 30 - (points[0].commits / max) * 26 },
          { x: 100, y: 30 - (points[0].commits / max) * 26 },
        ]
      : points.map((p, i) => ({
          x: i * step,
          y: 30 - (p.commits / max) * 26,
        }));
  const line = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");
  const area = points.length ? `${line} L100,32 L0,32 Z` : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <svg
        viewBox="0 0 100 32"
        preserveAspectRatio="none"
        className="min-h-0 w-full flex-1"
        role="img"
        aria-label={`Commits per month: ${points.map((p) => `${p.period} ${p.commits}`).join(", ")}`}
      >
        <defs>
          <linearGradient id="bento-tile-cadence" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--bento-c1)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--bento-c1)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#bento-tile-cadence)" />
        <path
          d={line}
          fill="none"
          stroke="var(--bento-c1)"
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex justify-between font-mono text-[0.52rem] text-muted-foreground">
        <span>{points[0]?.period.slice(5)}</span>
        <span>{points.at(-1)?.period.slice(5)}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ HealthGauge */

const ARC_LENGTH = 293.2; // 240 degrees of a r=70 circle

/**
 * The 240° hygiene arc — the design's health-tile gauge, track via token.
 * The wrapper carries `b-health-gauge` (custom.css) so the ring can compact
 * by container query inside narrow health tiles.
 */
export function HealthGauge({
  score,
  bandColor,
  children,
}: {
  score: number;
  bandColor: string;
  children: React.ReactNode;
}) {
  const filled = (score / 100) * ARC_LENGTH;
  return (
    <div className="b-health-gauge relative w-[170px] shrink-0">
      <svg viewBox="0 0 200 150" className="block w-full" aria-hidden>
        <path
          d="M 39.4 130 A 70 70 0 1 1 160.6 130"
          fill="none"
          stroke="var(--bento-track)"
          strokeWidth={11}
          strokeLinecap="round"
        />
        <path
          d="M 39.4 130 A 70 70 0 1 1 160.6 130"
          fill="none"
          style={{ stroke: bandColor }}
          strokeWidth={11}
          strokeLinecap="round"
          strokeDasharray={`${filled} 400`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">{children}</div>
    </div>
  );
}
