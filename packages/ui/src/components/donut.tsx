import { cn } from "@workspace-welcome/ui/lib/utils";

/**
 * Donut — hand-SVG ring chart for a distribution (language share, severity
 * mix). Zero-value slices vanish; non-zero slices keep a small gap so
 * adjacent colors never merge. The optional center carries a headline figure.
 * Ported (read-only) from meadow's `charts.tsx` Donut; tokens-only colors.
 */

export interface DonutSlice {
  label: string;
  value: number;
  color?: string;
}

export interface DonutCenter {
  value: string;
  label: string;
}

export interface DonutProps {
  slices: DonutSlice[];
  /** Outer size in px (default 148). */
  size?: number;
  /** Headline figure in the hole; MIN_CONTENT is 110×110 with, 64×64 without. */
  center?: DonutCenter;
  /** Accessible description; defaults to a slice summary. */
  ariaLabel?: string;
  className?: string;
}

/** Floor when the center figure is shown. */
export const MIN_CONTENT = { w: 110, h: 110 };
/** Floor for the bare ring (no center). */
export const MIN_CONTENT_BARE = { w: 64, h: 64 };

/** Default slice ramp — the theme's chart tokens, --chart-1..6. */
const RAMP = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
] as const;

export function Donut({
  slices,
  size = 148,
  center,
  ariaLabel,
  className,
}: DonutProps) {
  const stroke = Math.max(10, Math.round(size / 8));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const active = slices.filter((s) => s.value > 0);
  const gap = active.length > 1 ? 2.5 : 0;

  let acc = 0;
  const arcs = active.map((s, i) => {
    const frac = total === 0 ? 0 : s.value / total;
    const dash = Math.max(0, frac * c - gap);
    const arc = { ...s, color: s.color ?? RAMP[i % RAMP.length], dash, offset: acc };
    acc += frac * c;
    return arc;
  });

  const label =
    ariaLabel ??
    (slices.length > 0
      ? slices.map((s) => `${s.label} ${s.value}`).join(", ")
      : "empty distribution");

  return (
    <div
      data-part="donut"
      className={cn("@container flex h-full w-full min-h-0 items-center justify-center", className)}
      style={{ minWidth: MIN_CONTENT.w }}
    >
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
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
        {center ? (
          // Below ~90px the hole is too small for text — drop it, keep the ring.
          <div className="absolute inset-0 hidden flex-col items-center justify-center @[90px]:flex">
            <span className="text-lg leading-none font-semibold tabular-nums text-foreground">
              {center.value}
            </span>
            <span className="mt-0.5 text-[9px] tracking-wide text-muted-foreground uppercase">
              {center.label}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
