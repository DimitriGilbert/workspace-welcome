import type { ReactNode } from "react";

import { cn } from "@workspace-welcome/ui/lib/utils";
import { TONE_TOKEN, type Tone } from "@workspace-welcome/ui/lib/tokens";

/**
 * Stat — the label-under-numeral readout cell. Ported (read-only) from the
 * seven design duplicates (MC `MiniStat`, mb `MiniStat`/`BigStat`, meadow
 * `BigFact`/`StatCell`, bento `TileStat`/`HealthStat`): mono tabular
 * numeral over a quiet caps label. Headerless — chrome belongs to the shell.
 */

export interface StatProps {
  label: string;
  value: ReactNode;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
  /** Hover title (and only that — no extra chrome). */
  hint?: string;
  className?: string;
}

/** Pixel floor below which callers should ladder down (one numeral cell). */
export const MIN_CONTENT = { w: 64, h: 34 };

const SIZES: Record<NonNullable<StatProps["size"]>, string> = {
  sm: "text-sm",
  md: "text-2xl",
  lg: "text-4xl",
};

export function Stat({ label, value, tone, size = "md", hint, className }: StatProps) {
  return (
    <div
      data-part="stat"
      title={hint}
      className={cn("flex min-w-0 flex-col gap-1", className)}
    >
      <span
        className={cn(
          "font-mono leading-none tabular-nums text-foreground",
          SIZES[size],
        )}
        style={tone ? { color: TONE_TOKEN[tone] } : undefined}
      >
        {value}
      </span>
      <span className="truncate text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
