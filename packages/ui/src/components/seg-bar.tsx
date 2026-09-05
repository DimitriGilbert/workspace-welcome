import { cn } from "@workspace-welcome/ui/lib/utils";

/**
 * SegBar — one horizontal ratio bar of colored segments (a stacked single
 * bar, not a chart). Engine-less div geometry. Zero total renders as a full
 * muted bar — an honest "nothing to divide" state, never an empty strip.
 * Ported (read-only) from meadow's `charts.tsx` RatioBar shape; tokens-only.
 */

export interface SegBarSegment {
  value: number;
  color?: string;
  /** Tooltip/accessible text; defaults to the raw value. */
  label?: string;
}

export interface SegBarProps {
  segments: SegBarSegment[];
  /** Bar height in px: 8 (default) or 10. */
  height?: 8 | 10;
  /** Accessible description; defaults to a segment summary. */
  ariaLabel?: string;
  className?: string;
}

/** Pixel floor below which callers should ladder down. */
export const MIN_CONTENT = { w: 40, h: 8 };

/** Default segment colors — the theme's chart tokens, --chart-1..6, cycling. */
const RAMP = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
] as const;

export function SegBar({
  segments,
  height = 8,
  ariaLabel,
  className,
}: SegBarProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const label =
    ariaLabel ??
    (segments.length > 0
      ? segments.map((s) => `${s.label ?? String(s.value)}`).join(", ")
      : "empty breakdown");

  return (
    <div
      role="img"
      aria-label={label}
      data-part="seg-bar"
      className={cn(
        "flex w-full gap-px overflow-hidden rounded-full bg-transparent",
        className,
      )}
      style={{ height, minWidth: MIN_CONTENT.w, minHeight: MIN_CONTENT.h }}
    >
      {total <= 0 ? (
        <span aria-hidden className="h-full flex-1 rounded-full bg-muted" />
      ) : (
        (() => {
          const visible = segments.filter((s) => s.value > 0);
          const last = visible.length - 1;
          return visible.map((s, i) => (
            <span
              key={`${s.label ?? i}`}
              title={s.label ? `${s.label}: ${s.value}` : String(s.value)}
              className={cn(
                "h-full",
                i === 0 && "rounded-l-full",
                i === last && "rounded-r-full",
              )}
              style={{
                flexGrow: s.value,
                flexBasis: 0,
                backgroundColor: s.color ?? RAMP[i % RAMP.length],
              }}
            />
          ));
        })()
      )}
    </div>
  );
}
