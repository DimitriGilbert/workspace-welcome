import { cn } from "@workspace-welcome/ui/lib/utils";

/**
 * PulseStrip — a strip of terminal pixels: brightness is a sampled activity
 * intensity, the sharp cell marks the last activity instant. Engine-less div
 * geometry. Ported (read-only) from mission-control's `pulse-strip.tsx`;
 * intensity steps are the tone token at stepped opacities (tokens-only).
 */

export interface PulseCell {
  /** 0..1 — clamped. */
  intensity: number;
  /** Marks the last-activity instant (rendered solid). */
  tick?: boolean;
}

export interface PulseStripProps {
  cells: PulseCell[];
  /** `"accent"` uses the chart-1 token; `"sev"` the critical token. */
  tone?: "accent" | "sev";
  /** Accessible description; when omitted the strip is aria-hidden decoration. */
  ariaLabel?: string;
  className?: string;
}

/** Pixel floor — the smallest readable strip. */
export const MIN_CONTENT = { w: 64, h: 12 };

const TONE_COLOR = {
  accent: "var(--chart-1)",
  sev: "var(--sev-critical)",
} as const;

export function PulseStrip({
  cells,
  tone = "accent",
  ariaLabel,
  className,
}: PulseStripProps) {
  const color = TONE_COLOR[tone];
  const tick = cells.findIndex((c) => c.tick);
  const fallbackSummary =
    tick >= 0
      ? `activity signal, event at cell ${tick + 1} of ${cells.length}`
      : "no activity";

  return (
    <span
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      title={ariaLabel ? undefined : fallbackSummary}
      data-part="pulse-strip"
      className={cn(
        "inline-flex h-3 w-full min-w-0 items-stretch gap-px overflow-hidden rounded-[2px] bg-muted",
        className,
      )}
      style={{ minHeight: MIN_CONTENT.h }}
    >
      {cells.map((cell, i) => {
        const intensity = Math.min(1, Math.max(0, cell.intensity));
        const lit = cell.tick || intensity > 0;
        return (
          <span
            key={i}
            aria-hidden
            className="min-w-px flex-1"
            style={
              lit
                ? {
                    backgroundColor: color,
                    opacity: cell.tick ? 1 : 0.35 + intensity * 0.65,
                  }
                : undefined
            }
          />
        );
      })}
    </span>
  );
}
