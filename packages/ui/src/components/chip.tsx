import type { ReactNode } from "react";

import { cn } from "@workspace-welcome/ui/lib/utils";
import { toneStyle, type Tone } from "@workspace-welcome/ui/lib/tokens";

/**
 * Chip — a rounded pill for one numeric/side signal, tinted by Tone.
 * Ported (read-only) from meadow's `Chip` + `chipStyle` — the tone → token
 * map itself lives in `lib/tokens.ts` (one source of truth).
 */

export interface ChipProps {
  tone?: Tone;
  /** Hover/accessible description. */
  title?: string;
  children: ReactNode;
  className?: string;
}

export const MIN_CONTENT = { w: 32, h: 18 };

export function Chip({ tone = "neutral", title, children, className }: ChipProps) {
  return (
    <span
      data-part="chip"
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 tabular-nums",
        className,
      )}
      style={toneStyle(tone)}
    >
      {children}
    </span>
  );
}
