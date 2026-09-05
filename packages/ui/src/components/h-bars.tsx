import { cn } from "@workspace-welcome/ui/lib/utils";

/**
 * HBars — horizontal ranked bars: quiet rows where the bar carries the
 * proportion and the numerals carry the facts. Engine-less div geometry
 * (not the recharts chart part). Ported (read-only) from meadow's
 * `charts.tsx` HBars; tokens-only colors.
 */

export interface HBarRow {
  label: string;
  /** Bar length fraction driver (0 renders as a stub). */
  value: number;
  /** Right-aligned figure shown after the bar; defaults to the raw value. */
  display?: string;
  color?: string;
}

export interface HBarsProps {
  rows: HBarRow[];
  /** Show at most N rows; overflow collapses into a "+N" footer. */
  maxRows?: number;
  onRowClick?: (row: HBarRow) => void;
  /** Accessible description; defaults to a row summary. */
  ariaLabel?: string;
  className?: string;
}

/** Per-row floor — total box is w × (rows × h). Use `minContent(rows)`. */
export const MIN_CONTENT = { w: 140, h: 18 };

/** Pixel floor for a rendered row count (clamped rows, incl. "+N" footer). */
export function minContent(rows: number): { w: number; h: number } {
  return { w: MIN_CONTENT.w, h: Math.max(MIN_CONTENT.h, rows * MIN_CONTENT.h) };
}

export function HBars({
  rows,
  maxRows,
  onRowClick,
  ariaLabel,
  className,
}: HBarsProps) {
  const shown = maxRows === undefined ? rows : rows.slice(0, maxRows);
  const overflow = rows.length - shown.length;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const label =
    ariaLabel ?? (rows.length > 0 ? rows.map((r) => r.label).join(", ") : "empty ranking");

  if (shown.length === 0) {
    return (
      <div
        role="img"
        aria-label={label}
        data-part="h-bars"
        className={cn("h-full w-full min-h-0", className)}
        style={{ minWidth: MIN_CONTENT.w, minHeight: MIN_CONTENT.h }}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={label}
      data-part="h-bars"
      className={cn("@container flex h-full w-full min-h-0 flex-col", className)}
      style={{ minWidth: MIN_CONTENT.w }}
    >
      <ul className="m-0 flex min-h-0 list-none flex-1 flex-col justify-around gap-0 p-0">
        {shown.map((row) => {
          const body = (
            <>
              <span className="min-w-0 shrink-0 truncate text-[11px] leading-none font-medium text-foreground">
                {row.label}
              </span>
              <span
                aria-hidden
                className="h-1.5 min-w-1 flex-1 overflow-hidden rounded-full bg-muted"
              >
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.max(4, (row.value / max) * 100)}%`,
                    backgroundColor: row.color ?? "var(--chart-1)",
                  }}
                />
              </span>
              <span className="hidden shrink-0 text-[10px] leading-none tabular-nums text-muted-foreground @[140px]:inline">
                {row.display ?? String(row.value)}
              </span>
            </>
          );
          return (
            <li key={row.label} className="flex min-h-[18px] items-center">
              {onRowClick ? (
                <button
                  type="button"
                  onClick={() => onRowClick(row)}
                  className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {body}
                </button>
              ) : (
                <div className="flex w-full min-w-0 items-center gap-2">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      {overflow > 0 ? (
        <div className="pt-1 text-[10px] leading-none text-muted-foreground">
          +{overflow} more
        </div>
      ) : null}
    </div>
  );
}
