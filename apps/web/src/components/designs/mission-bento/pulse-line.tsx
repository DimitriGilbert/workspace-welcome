import { pulseCells } from "./metrics";
import type { Project } from "@workspace-welcome/api/lib/types";

/**
 * The per-project sparkline: 24 buckets over the 90-day freshness window,
 * drawn as a strip of instrument pixels. Brightness replays the project's
 * real freshness decay; the solid cell marks the last activity instant.
 */
export function PulseLine({
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
      ? `Activity signal, event at cell ${tick + 1} of ${cells} over 90 days`
      : "No activity inside the 90-day window";

  return (
    <span
      aria-hidden
      title={summary}
      className={`inline-flex h-3 items-stretch gap-px ${className ?? ""}`}
      style={{ background: "color-mix(in oklch, var(--foreground) 4%, transparent)" }}
    >
      {row.map((cell, i) => (
        <span
          key={i}
          className="mb-pulse-cell"
          style={{
            background: cell.tick
              ? "var(--mb-accent)"
              : cell.intensity > 0
                ? `color-mix(in oklch, var(--mb-accent) ${Math.round(30 + cell.intensity * 70)}%, transparent)`
                : "transparent",
          }}
        />
      ))}
    </span>
  );
}
