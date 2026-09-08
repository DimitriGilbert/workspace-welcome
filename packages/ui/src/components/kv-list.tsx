import type { ReactNode } from "react";

import { cn } from "@workspace-welcome/ui/lib/utils";
import { TONE_TOKEN, type Tone } from "@workspace-welcome/ui/lib/tokens";

/**
 * KvList — a label/value ledger (the "facts table" register): quiet caps
 * labels, right-aligned values, optional mono numerals. This is the rung
 * DataTable collapses to below its minWidth (first columns, top rows).
 */

export interface KvRow {
  label: string;
  value: ReactNode;
  tone?: Tone;
  /** Mono + tabular numerals (commit hashes, sizes, ages). */
  mono?: boolean;
}

export interface KvListProps {
  rows: KvRow[];
  density?: "compact" | "comfortable";
  className?: string;
}

export const MIN_CONTENT = { w: 160, h: 24 };

export function KvList({ rows, density = "comfortable", className }: KvListProps) {
  return (
    <dl data-part="kv-list" className={cn("flex min-w-0 flex-col", className)}>
      {rows.map((row) => (
        <div
          key={row.label}
          className={cn(
            "flex min-w-0 items-baseline justify-between gap-3",
            density === "compact" ? "py-0.5" : "py-1.5",
          )}
        >
          <dt className="shrink-0 text-[10px] font-medium tracking-[0.08em] uppercase text-muted-foreground">
            {row.label}
          </dt>
          <dd
            className={cn(
              "min-w-0 truncate text-right text-xs text-foreground",
              row.mono && "font-mono tabular-nums",
            )}
            style={row.tone ? { color: TONE_TOKEN[row.tone] } : undefined}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
