import type { CSSProperties } from "react";

import { cn } from "@workspace-welcome/ui/lib/utils";

/**
 * GitGlyphs — crisp mono glyph groups for git state: ↑ ahead, ↓ behind,
 * ~ dirty files, a quiet ✓ when clean and pushed; one bordered chip per
 * non-zero signal, "— not a repo" otherwise. Ported (read-only) from
 * bento's `GitGlyphs` with a STRUCTURAL prop shape — no api import
 * (packages/ui is props-in only; callers pass the git fields).
 */

export interface GitGlyphsProps {
  isRepo: boolean;
  ahead?: number;
  behind?: number;
  dirtyCount?: number;
  /** Larger chips for hero tiles. */
  large?: boolean;
  className?: string;
}

export const MIN_CONTENT = { w: 60, h: 18 };

const glyphChip = (
  color: string,
  border: string,
  large: boolean,
): CSSProperties => ({
  color,
  borderColor: border,
  ...(large ? { fontSize: 12, height: 24, padding: "0 8px" } : {}),
});

export function GitGlyphs({
  isRepo,
  ahead = 0,
  behind = 0,
  dirtyCount = 0,
  large = false,
  className,
}: GitGlyphsProps) {
  if (!isRepo) {
    return (
      <span
        data-part="git-glyphs"
        className={cn(
          "inline-flex items-center text-muted-foreground/70",
          large ? "text-[12px]" : "text-[10px]",
          className,
        )}
      >
        — not a repo
      </span>
    );
  }

  const clean = ahead === 0 && behind === 0 && dirtyCount === 0;

  return (
    <span
      data-part="git-glyphs"
      className={cn("inline-flex min-w-0 items-center gap-1.5", className)}
    >
      {ahead > 0 ? (
        <span
          className="inline-flex h-[18px] items-center rounded-md border bg-transparent px-1.5 font-mono text-[10px] leading-none tabular-nums"
          style={glyphChip(
            "var(--state-positive)",
            "color-mix(in oklch, var(--state-positive) 35%, transparent)",
            large,
          )}
          title={`${ahead} unpushed commit${ahead === 1 ? "" : "s"}`}
        >
          ↑{ahead}
        </span>
      ) : null}
      {behind > 0 ? (
        <span
          className="inline-flex h-[18px] items-center rounded-md border bg-transparent px-1.5 font-mono text-[10px] leading-none tabular-nums"
          style={glyphChip(
            "var(--sev-warning)",
            "color-mix(in oklch, var(--sev-warning) 35%, transparent)",
            large,
          )}
          title={`${behind} commit${behind === 1 ? "" : "s"} behind upstream`}
        >
          ↓{behind}
        </span>
      ) : null}
      {dirtyCount > 0 ? (
        <span
          className="inline-flex h-[18px] items-center rounded-md border border-transparent bg-transparent px-1.5 font-mono text-[10px] leading-none tabular-nums text-foreground"
          style={large ? { fontSize: 12, height: 24, padding: "0 8px" } : undefined}
          title={`${dirtyCount} uncommitted file${dirtyCount === 1 ? "" : "s"}`}
        >
          ~{dirtyCount}
        </span>
      ) : null}
      {clean ? (
        <span
          className="inline-flex h-[18px] items-center rounded-md border bg-transparent px-1.5 font-mono text-[10px] leading-none"
          style={glyphChip(
            "var(--state-positive)",
            "color-mix(in oklch, var(--state-positive) 25%, transparent)",
            large,
          )}
          title="Clean tree, synced with upstream"
        >
          ✓
        </span>
      ) : null}
    </span>
  );
}
