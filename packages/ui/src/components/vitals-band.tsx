import { AnimatedNumber } from "@workspace-welcome/ui/components/animated-number";
import { Stat } from "@workspace-welcome/ui/components/stat";
import { cn } from "@workspace-welcome/ui/lib/utils";
import type { Tone } from "@workspace-welcome/ui/lib/tokens";

/**
 * VitalsBand — a fleet-wide numeral row: pure layout over Stat +
 * AnimatedNumber (MC's spring `VitalsBoard` and mb's static band, merged).
 * Flex-wraps to two rows when narrow; cells may be clickable.
 */

export interface VitalsCell {
  label: string;
  value: string | number;
  tone?: Tone;
}

export interface VitalsBandProps {
  cells: VitalsCell[];
  /** Makes each cell a button (e.g. jump to the filtered view). */
  onCellClick?: (cell: VitalsCell, index: number) => void;
  ariaLabel?: string;
  className?: string;
}

/** Pixel floor below which callers should ladder down (one cell). */
export const MIN_CONTENT = { w: 64, h: 34 };

export function VitalsBand({
  cells,
  onCellClick,
  ariaLabel,
  className,
}: VitalsBandProps) {
  return (
    <div
      data-part="vitals-band"
      role={onCellClick ? "group" : undefined}
      aria-label={ariaLabel}
      className={cn("flex min-w-0 flex-wrap items-stretch gap-x-6 gap-y-3", className)}
    >
      {cells.map((cell, i) => {
        const stat = (
          <Stat
            label={cell.label}
            tone={cell.tone}
            size="md"
            value={
              <AnimatedNumber value={cell.value} motion="spring" />
            }
          />
        );
        return onCellClick ? (
          <button
            key={cell.label}
            type="button"
            onClick={() => onCellClick(cell, i)}
            className="min-w-0 cursor-pointer rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {stat}
          </button>
        ) : (
          <div key={cell.label} className="min-w-0">
            {stat}
          </div>
        );
      })}
    </div>
  );
}
