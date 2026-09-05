import { cn } from "@workspace-welcome/ui/lib/utils";

/**
 * Gauge — a 240° arc with the value as the verdict numeral: sage when clean,
 * gold mid, red when trouble dominates. Ported (read-only) from bento's
 * `health-tile.tsx` arc geometry; band colors are the semantic tokens.
 */

export interface GaugeProps {
  /** 0–100; clamped. */
  value: number;
  /** Caption under the numeral (e.g. "of 100"). */
  label: string;
  /** Format the numeral (defaults to the rounded raw value). */
  formatValue?: (value: number) => string;
  ariaLabel?: string;
  className?: string;
}

/** Pixel floor below which callers should ladder down. */
export const MIN_CONTENT = { w: 170, h: 110 };

/** 240 degrees of a r=70 circle (viewBox 0 0 200 150). */
const ARC_LENGTH = 293.2;

export function Gauge({
  value,
  label,
  formatValue,
  ariaLabel,
  className,
}: GaugeProps) {
  const v = Math.min(100, Math.max(0, value));
  const band =
    v >= 80
      ? "var(--state-positive)"
      : v >= 55
        ? "var(--sev-warning)"
        : "var(--sev-critical)";
  const filled = (v / 100) * ARC_LENGTH;
  const numeral = formatValue ? formatValue(v) : String(Math.round(v));
  const arcLabel = ariaLabel ?? `${label}: ${numeral}`;

  return (
    <div
      role="img"
      aria-label={arcLabel}
      data-part="gauge"
      className={cn(
        "relative flex h-full w-full min-h-0 items-center justify-center",
        className,
      )}
      style={{ minWidth: MIN_CONTENT.w, minHeight: MIN_CONTENT.h }}
    >
      <div className="relative w-full max-w-[220px]">
        <svg viewBox="0 0 200 150" className="block w-full" aria-hidden focusable="false">
          <path
            d="M 39.4 130 A 70 70 0 1 1 160.6 130"
            fill="none"
            stroke="var(--muted)"
            strokeWidth={11}
            strokeLinecap="round"
          />
          <path
            d="M 39.4 130 A 70 70 0 1 1 160.6 130"
            fill="none"
            stroke={band}
            strokeWidth={11}
            strokeLinecap="round"
            strokeDasharray={`${filled} 400`}
            className="transition-[stroke-dasharray] duration-300 motion-reduce:transition-none"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
          <span
            className="text-4xl leading-none font-semibold tabular-nums"
            style={{ color: band }}
          >
            {numeral}
          </span>
          <span className="mt-1 text-[10px] tracking-wide text-muted-foreground uppercase">
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}
