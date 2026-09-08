import { cn } from "@workspace-welcome/ui/lib/utils";

/**
 * Heatmap — weeks × weekdays grid of daily counts, Monday-first columns,
 * oldest week left, future cells of the partial final week blanked.
 * Counts come in as a Map keyed by the local `Y-M-D` day string (the same
 * key `activityCounts` produces in the app's scan-metrics). Ported
 * (read-only) from mission-control's `analytics-zone.tsx` HeatmapInstrument;
 * the fill ladder is the chart-1 token at stepped opacities (tokens-only).
 */

export interface HeatmapProps {
  /** Daily counts keyed by local `Y-M-D` (e.g. "2026-8-31"). */
  counts: Map<string, number>;
  /** Number of week columns (default 18, minimum 4). */
  weeks?: number;
  /** "Today" — ms epoch; cells after it render blank. */
  now: number;
  /** Cap per-cell width in px and center the grid (default 26). */
  cellMax?: number;
  /** Stretch the grid through the box (1fr tracks, cells flex to span)
   * instead of the centered capped-square mosaic — for wide placements
   * where the capped grid would strand a void beside its legend. */
  fill?: boolean;
  ariaLabel?: string;
  className?: string;
}

/** Pixel floor: 4 weeks at ~14px cells + gaps, 7 rows + legend. */
export const MIN_CONTENT = { w: 68, h: 140 };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local `Y-M-D` day key for a timestamp (ms) — bucket identity. */
function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** 0..4 fill level from a daily count, log-ish so single hits register. */
function heatLevel(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

/** Cell fill: muted for empty days, chart-1 at stepped opacity for hits. */
interface HeatFill {
  color: string;
  opacity: number;
}

function heatFill(level: number): HeatFill {
  switch (Math.min(4, Math.max(0, level))) {
    case 1:
      return { color: "var(--chart-1)", opacity: 0.28 };
    case 2:
      return { color: "var(--chart-1)", opacity: 0.52 };
    case 3:
      return { color: "var(--chart-1)", opacity: 0.76 };
    case 4:
      return { color: "var(--chart-1)", opacity: 1 };
    default:
      return { color: "var(--muted)", opacity: 1 };
  }
}

const HEAT_LEVELS: readonly HeatFill[] = [1, 2, 3, 4].map((l) => heatFill(l));

/** Local Monday of the week containing `date`, at local midnight. */
function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const shift = (d.getDay() + 6) % 7;
  return new Date(d.getTime() - shift * DAY_MS);
}

interface HeatCell {
  count: number;
  future: boolean;
  title: string;
}

const CELL_TITLE = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function heatGrid(
  counts: Map<string, number>,
  weeks: number,
  now: number,
): HeatCell[][] {
  const firstMonday =
    startOfWeek(new Date(now)).getTime() - (weeks - 1) * 7 * DAY_MS;
  const grid: HeatCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const column: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const t = firstMonday + (w * 7 + d) * DAY_MS;
      const future = t > now;
      const count = future ? 0 : (counts.get(dayKey(t)) ?? 0);
      column.push({
        count,
        future,
        title: `${CELL_TITLE.format(new Date(t))} · ${count} active`,
      });
    }
    grid.push(column);
  }
  return grid;
}

export function Heatmap({
  counts,
  weeks = 18,
  now,
  cellMax = 26,
  fill = false,
  ariaLabel,
  className,
}: HeatmapProps) {
  const weekCount = Math.max(4, weeks);
  const grid = heatGrid(counts, weekCount, now);
  const touches = grid.reduce(
    (sum, col) => sum + col.reduce((s, c) => s + c.count, 0),
    0,
  );
  const label = `${ariaLabel ?? "activity heatmap"}, ${touches} touches over ${weekCount} weeks`;

  return (
    <div
      role="img"
      aria-label={label}
      data-part="heatmap"
      className={cn("flex h-full w-full min-h-0 flex-col gap-2", className)}
      style={{ minWidth: MIN_CONTENT.w, minHeight: MIN_CONTENT.h }}
    >
      <div
        aria-hidden
        className="grid flex-1 grid-flow-col content-center gap-[3px]"
        style={
          fill
            ? {
                gridTemplateColumns: `repeat(${weekCount}, minmax(0, 1fr))`,
                gridTemplateRows: "repeat(7, minmax(0, 1fr))",
              }
            : {
                gridTemplateColumns: `repeat(${weekCount}, minmax(0, ${cellMax}px))`,
                gridTemplateRows: "repeat(7, auto)",
                justifyContent: "center",
              }
        }
      >
        {grid.map((col, w) =>
          col.map((cell, d) => {
            const fillStyle = cell.future
              ? heatFill(0)
              : heatFill(heatLevel(cell.count));
            return (
              <span
                key={`${w}-${d}`}
                title={cell.future ? undefined : cell.title}
                className={cn(
                  "w-full rounded-[1px]",
                  fill ? "h-full" : "aspect-square",
                  cell.future && "invisible",
                )}
                style={{
                  backgroundColor: fillStyle.color,
                  opacity: cell.future ? 0 : fillStyle.opacity,
                }}
              />
            );
          }),
        )}
      </div>
      <div className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
        <span>{weekCount}wk</span>
        <span aria-hidden className="ml-auto flex items-center gap-[3px]">
          {HEAT_LEVELS.map((fill, i) => (
            <span
              key={i}
              className="size-2 rounded-[1px]"
              style={{ backgroundColor: fill.color, opacity: fill.opacity }}
            />
          ))}
        </span>
        <span>now</span>
      </div>
    </div>
  );
}
