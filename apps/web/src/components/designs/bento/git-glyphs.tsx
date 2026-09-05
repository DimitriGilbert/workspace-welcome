import type { GitInfo } from "@workspace-welcome/api/lib/types";

import { cn } from "@workspace-welcome/ui/lib/utils";

/**
 * Crisp mono glyph groups for git state — one bordered chip per non-zero
 * signal, a quiet check when the tree is clean and pushed. Glyphs, not
 * words: ↑ ahead, ↓ behind, ~ dirty files. Sized up for hero tiles.
 */
export function GitGlyphs({
  git,
  large = false,
  className,
}: {
  git: GitInfo;
  /** Larger chips for hero tiles. */
  large?: boolean;
  className?: string;
}) {
  const ahead = git.ahead ?? 0;
  const behind = git.behind ?? 0;
  const dirty = git.dirtyCount ?? 0;

  if (!git.isRepo) {
    return (
      <span
        className={cn("b-glyph border-transparent bg-transparent text-muted-foreground/70", className)}
        style={large ? { fontSize: 12, height: 24 } : undefined}
      >
        — not a repo
      </span>
    );
  }

  const clean = ahead === 0 && behind === 0 && dirty === 0;

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      {ahead > 0 ? (
        <span
          className="b-glyph"
          style={{
            color: "var(--state-positive)",
            borderColor: "color-mix(in oklch, var(--state-positive) 35%, transparent)",
            ...(large ? { fontSize: 12, height: 24, padding: "0 8px" } : {}),
          }}
          title={`${ahead} unpushed commit${ahead === 1 ? "" : "s"}`}
        >
          ↑{ahead}
        </span>
      ) : null}
      {behind > 0 ? (
        <span
          className="b-glyph"
          style={{
            color: "var(--sev-warn)",
            borderColor: "color-mix(in oklch, var(--sev-warn) 35%, transparent)",
            ...(large ? { fontSize: 12, height: 24, padding: "0 8px" } : {}),
          }}
          title={`${behind} commit${behind === 1 ? "" : "s"} behind upstream`}
        >
          ↓{behind}
        </span>
      ) : null}
      {dirty > 0 ? (
        <span
          className="b-glyph"
          style={{
            color: "var(--foreground)",
            ...(large ? { fontSize: 12, height: 24, padding: "0 8px" } : {}),
          }}
          title={`${dirty} uncommitted file${dirty === 1 ? "" : "s"}`}
        >
          ~{dirty}
        </span>
      ) : null}
      {clean ? (
        <span
          className="b-glyph"
          style={{
            color: "var(--state-positive)",
            borderColor: "color-mix(in oklch, var(--state-positive) 25%, transparent)",
            ...(large ? { fontSize: 12, height: 24, padding: "0 8px" } : {}),
          }}
          title="Clean tree, synced with upstream"
        >
          ✓
        </span>
      ) : null}
    </span>
  );
}
