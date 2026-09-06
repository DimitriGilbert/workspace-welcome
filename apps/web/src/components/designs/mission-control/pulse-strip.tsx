import { pulseCells } from "./metrics";
import type { Project } from "@workspace-welcome/api/lib/types";

/**
 * The per-project sparkline: 24 buckets over the 90-day freshness window,
 * rendered as a strip of terminal pixels. Brightness is the project's real
 * freshness value sampled at each point in time; the sharp cell marks the
 * last activity instant. Data lives in the `updated` column next to it, so
 * the strip is aria-hidden decoration with a title for sighted hover.
 */
export function PulseStrip({
  project,
  cells = 24,
  now,
  className,
}: {
  project: Project;
  cells?: number;
  now: number;
  className?: string;
}) {
  const row = pulseCells(project, cells, now);
  const tick = row.findIndex((c) => c.tick);
  const summary =
    tick >= 0
      ? `activity signal, event at cell ${tick + 1} of ${cells}`
      : "no activity inside the 90 day window";

  return (
    <span
      aria-hidden={true}
      title={summary}
      className={`mc-pulse inline-flex h-3.5 items-stretch gap-px ${className ?? ""}`}
      style={{
        background: "color-mix(in oklch, var(--foreground) 4%, transparent)",
      }}
    >
      {row.map((cell, i) => (
        <span
          key={i}
          className="mc-pulse-cell min-w-px flex-1"
          data-tick={cell.tick || undefined}
          style={{
            background: cell.tick
              ? "var(--recency-fresh)"
              : cell.intensity > 0
                ? `color-mix(in oklch, var(--recency-fresh) ${Math.round(35 + cell.intensity * 65)}%, transparent)`
                : "transparent",
          }}
        />
      ))}
    </span>
  );
}
