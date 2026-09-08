/**
 * Meadow's small shared visual atoms, ported verbatim from
 * `components/designs/meadow/bits.tsx` into the theme namespace (owner
 * correction: theme widgets carry the prototype's presentation code).
 * Pastel severity dots, soft data chips, and the SoftNumber — a quiet
 * motion fade for values that change in place.
 */

import type { CSSProperties, ReactNode } from "react";
import { useId } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { LucideIcon } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace-welcome/ui/components/tooltip";
import type { AlertSeverity, HealthAlert } from "@workspace-welcome/api/lib/types";

/** Accent register for icon chips and chips; values are meadow tokens. */
export type Tone = "green" | "honey" | "sky" | "quiet";

export const TONE_COLOR: Record<Tone, string> = {
  green: "var(--recency-fresh)",
  honey: "var(--pinned-accent)",
  sky: "var(--sev-info)",
  quiet: "var(--muted-foreground)",
};

export const chipStyle = (tone: Tone): CSSProperties => ({
  color: TONE_COLOR[tone],
  backgroundColor: `color-mix(in oklch, ${TONE_COLOR[tone]} 11%, transparent)`,
});

interface SectionIntroProps {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  count?: number;
  /** Optional trailing slot (sort hints, actions). */
  trailing?: ReactNode;
  id?: string;
}

/** Section heading: a tinted icon chip, a quiet title, and a count pill. */
export function SectionIntro({
  icon: Icon,
  tone,
  title,
  count,
  trailing,
  id,
}: SectionIntroProps) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span
        aria-hidden
        className="flex size-7 items-center justify-center rounded-full"
        style={chipStyle(tone)}
      >
        <Icon className="size-3.5" />
      </span>
      <h2
        id={id}
        className="text-sm font-semibold tracking-tight text-foreground"
      >
        {title}
      </h2>
      {count !== undefined ? (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
          {count}
        </span>
      ) : null}
      {trailing ? (
        <div className="ml-auto flex items-center gap-2">{trailing}</div>
      ) : null}
    </div>
  );
}

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  critical: "var(--sev-critical)",
  warning: "var(--sev-warning)",
  info: "var(--sev-info)",
};

/**
 * Color-coded state at a glance: one pastel dot per alert, message on hover.
 * Empty projects render nothing — calm means silence when there's news.
 */
export function AlertDots({ alerts }: { alerts: HealthAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <TooltipProvider delay={150}>
      <span className="flex items-center gap-1">
        {alerts.map((a) => (
          <Tooltip key={a.code}>
            <TooltipTrigger
              render={
                <span
                  className="size-2 cursor-default rounded-full"
                  style={{ backgroundColor: SEVERITY_COLOR[a.severity] }}
                />
              }
            />
            <TooltipContent>{a.message}</TooltipContent>
          </Tooltip>
        ))}
      </span>
    </TooltipProvider>
  );
}

interface ChipProps {
  tone: Tone;
  title?: string;
  children: ReactNode;
}

/** Rounded pill for one numeric git signal; only rendered when nonzero. */
export function Chip({ tone, title, children }: ChipProps) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 tabular-nums"
      style={chipStyle(tone)}
    >
      {children}
    </span>
  );
}

/**
 * A number that fades gently when its value changes — no bounce, no slide
 * circus. Renders inline; honors prefers-reduced-motion by swapping
 * instantly.
 */
export function SoftNumber({
  value,
  className,
  style,
}: {
  value: string | number;
  className?: string;
  style?: CSSProperties;
}) {
  const reduced = useReducedMotion();
  const key = String(value);
  if (reduced) {
    return (
      <span className={className} style={style}>
        {value}
      </span>
    );
  }
  return (
    <span className="relative inline-flex overflow-visible tabular-nums">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={key}
          className={className}
          style={style}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

// --- Meadow's hand-rolled SVG charts (ported from charts.tsx) ---------------

interface Point {
  x: number;
  y: number;
}

/**
 * Fritsch–Carlson monotone cubic interpolation. Unlike Catmull–Rom it never
 * overshoots the data, so a spike in daily activity can't dip below zero —
 * the line stays as calm as the rest of the theme.
 */
function monotonePath(pts: Point[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    slope.push((pts[i + 1].y - pts[i].y) / (pts[i + 1].x - pts[i].x));
  }
  const m: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      m.push(0);
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      m.push((w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]));
    }
  }
  m.push(slope[n - 2]);
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C ${pts[i].x + h} ${pts[i].y + m[i] * h}, ${pts[i + 1].x - h} ${
      pts[i + 1].y - m[i + 1] * h
    }, ${pts[i + 1].x} ${pts[i + 1].y}`;
  }
  return d;
}

interface AreaTrendProps {
  /** One value per bucket, oldest first. */
  values: number[];
  /** Accessible description — the chart is purely supplementary visually. */
  label: string;
  /** Stroke/fill color; defaults to the sage recency token. */
  color?: string;
  /** Box classes for the svg (`h-14` default; fill rungs pass `flex-1`). */
  className?: string;
}

const TREND_W = 280;
const TREND_H = 92;
const TREND_TOP = 10;
const TREND_BOTTOM = 4;

/** Soft area chart: sage stroke, translucent gradient wash, hairline guides. */
export function AreaTrend({ values, label, color, className = "h-14" }: AreaTrendProps) {
  const gradientId = useId();
  const stroke = color ?? "var(--recency-fresh)";
  if (values.length === 0) return null;

  const max = Math.max(...values, 1);
  const n = values.length;
  const pts = values.map((v, i) => ({
    x: n === 1 ? TREND_W / 2 : (i / (n - 1)) * TREND_W,
    y: TREND_TOP + (1 - v / max) * (TREND_H - TREND_TOP - TREND_BOTTOM),
  }));
  const line = monotonePath(pts);
  const area = `${line} L ${TREND_W} ${TREND_H} L 0 ${TREND_H} Z`;

  return (
    <svg
      viewBox={`0 0 ${TREND_W} ${TREND_H}`}
      className={`${className} w-full`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((t) => (
        <line
          key={t}
          x1={0}
          x2={TREND_W}
          y1={TREND_TOP + t * (TREND_H - TREND_TOP - TREND_BOTTOM)}
          y2={TREND_TOP + t * (TREND_H - TREND_TOP - TREND_BOTTOM)}
          stroke="var(--border)"
          strokeWidth={1}
          strokeDasharray="2 6"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// --- Report-widget primitives -------------------------------------------------

export interface CadencePoint {
  period: string;
  commits: number;
}

/**
 * Soft area chart for a report's cadence series (commits per period) — the
 * time-axis series renders as a monotone line over a translucent wash, never
 * bars (bars are for true comparisons). Shows at most the last `maxPeriods`;
 * the first and last period label the axis, so the chart reads edge-to-edge
 * with no dead space. `className` sets the box (h-14 in mosaic tiles,
 * h-full inside flex panels) and the svg stretches to fill it.
 */
export function CadenceArea({
  data,
  label,
  color = "var(--recency-fresh)",
  maxPeriods = 16,
  className = "h-36",
}: {
  data: CadencePoint[];
  label: string;
  color?: string;
  maxPeriods?: number;
  className?: string;
}) {
  const gradientId = useId();
  if (data.length === 0) return null;
  const shown = data.slice(-maxPeriods);
  const max = Math.max(...shown.map((d) => d.commits), 1);
  const n = shown.length;
  const pts = shown.map((d, i) => ({
    x: n === 1 ? TREND_W / 2 : (i / (n - 1)) * TREND_W,
    y: TREND_TOP + (1 - d.commits / max) * (TREND_H - TREND_TOP - TREND_BOTTOM),
  }));
  const line = monotonePath(pts);
  const area = `${line} L ${TREND_W} ${TREND_H} L 0 ${TREND_H} Z`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <svg
        viewBox={`0 0 ${TREND_W} ${TREND_H}`}
        className={`${className} w-full`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.03} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={0}
            x2={TREND_W}
            y1={TREND_TOP + t * (TREND_H - TREND_TOP - TREND_BOTTOM)}
            y2={TREND_TOP + t * (TREND_H - TREND_TOP - TREND_BOTTOM)}
            stroke="var(--border)"
            strokeWidth={1}
            strokeDasharray="2 6"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {pts.map((p, i) => (
          <circle
            key={shown[i]?.period}
            cx={p.x}
            cy={p.y}
            r={2.5}
            fill={color}
            vectorEffect="non-scaling-stroke"
          >
            <title>{`${shown[i]?.period}: ${shown[i]?.commits} commits`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{shown[0]?.period}</span>
        <span>{shown.at(-1)?.period}</span>
      </div>
    </div>
  );
}

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/** Soft pastel ramp for distribution slices (top-N + "other"). */
export const SLICE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

/**
 * Soft donut for a distribution (language share, severity mix). Zero-value
 * slices vanish; non-zero slices keep a small gap so pastels never merge.
 * The center carries the total. With `fill` the donut sizes to its parent
 * box (square, both axes — the fill law) instead of a fixed pixel size; the
 * svg's meet framing keeps the ring round in non-square boxes.
 */
export function Donut({
  slices,
  size = 148,
  centerLabel,
  centerValue,
  label,
  fill = false,
}: {
  slices: DonutSlice[];
  size?: number;
  centerLabel: string;
  centerValue: string;
  label: string;
  fill?: boolean;
}) {
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const active = slices.filter((s) => s.value > 0);
  const gap = active.length > 1 ? 2.5 : 0;

  let acc = 0;
  const arcs = active.map((s) => {
    const frac = total === 0 ? 0 : s.value / total;
    const dash = Math.max(0, frac * c - gap);
    const arc = { ...s, dash, offset: acc };
    acc += frac * c;
    return arc;
  });

  return (
    <div
      className={fill ? "relative h-full w-full min-h-0 min-w-0" : "relative shrink-0"}
      style={fill ? undefined : { width: size, height: size }}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className={fill ? "h-full w-full" : undefined}
        width={fill ? undefined : size}
        height={fill ? undefined : size}
        role="img"
        aria-label={label}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={stroke}
        />
        {arcs.map((a) => (
          <circle
            key={a.label}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={a.color}
            strokeWidth={stroke}
            strokeDasharray={`${a.dash} ${c - a.dash}`}
            strokeDashoffset={-a.offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          >
            <title>{`${a.label}: ${Math.round((a.value / (total || 1)) * 100)}%`}</title>
          </circle>
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg leading-none font-semibold tabular-nums text-foreground">
          {centerValue}
        </span>
        <span className="mt-0.5 text-[9px] tracking-wide text-muted-foreground uppercase">
          {centerLabel}
        </span>
      </div>
    </div>
  );
}

export interface HBarDatum {
  label: string;
  /** Bar length fraction driver (0 is rendered as a stub). */
  value: number;
  color?: string;
  /** Right-aligned figure shown after the label. */
  display: string;
}

/**
 * Horizontal soft bars for ranked report metrics (top alerts, languages).
 * Rows are quiet; the bar carries the proportion, the numerals carry facts.
 */
export function HBars({
  data,
  label,
}: {
  data: HBarDatum[];
  label: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul
      className="flex flex-col gap-2"
      role="img"
      aria-label={label}
    >
      {data.map((d) => (
        <li key={d.label} className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2 text-[11px]">
            <span className="min-w-0 truncate font-medium text-foreground">
              {d.label}
            </span>
            <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
              {d.display}
            </span>
          </div>
          <span
            aria-hidden
            className="h-1.5 rounded-full"
            style={{
              width: `${Math.max(4, (d.value / max) * 100)}%`,
              backgroundColor: d.color ?? "color-mix(in oklch, var(--recency-fresh) 45%, var(--muted))",
            }}
          />
        </li>
      ))}
    </ul>
  );
}

/** Two-segment soft ratio bar (e.g. AI input vs output tokens). */
export function RatioBar({
  a,
  b,
  colorA = "var(--recency-fresh)",
  colorB = "var(--sev-info)",
  label,
}: {
  a: number;
  b: number;
  colorA?: string;
  colorB?: string;
  label: string;
}) {
  const total = a + b;
  const aPct = total === 0 ? 50 : (a / total) * 100;
  return (
    <div
      className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full"
      role="img"
      aria-label={label}
    >
      <span
        className="h-full rounded-l-full"
        style={{ width: `${aPct}%`, backgroundColor: colorA }}
      />
      <span
        className="h-full flex-1 rounded-r-full"
        style={{ backgroundColor: colorB }}
      />
    </div>
  );
}
