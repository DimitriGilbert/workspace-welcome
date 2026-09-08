/**
 * McProjectCommits — the commit ledger (THE project-page commit surface):
 * the live commit log as a dense graph register — one 22px row per commit,
 * lane glyph, subject, refs badge, and the inline trailing meta (sha in the
 * accent register, author, age) so rows read without hovering; the tooltip
 * carries the full detail. Rides the ONE cached commit-log entry from
 * `useProject().commitLog` (the design's shared-cache rule) over the ui
 * `CommitGraph` in its dense register.
 *
 * Rows cap at the placed height with an honest footer; the shell meta line
 * carries the log totals (commits · authors). Nothing here duplicates the
 * state band: the band is controls + facts, this is the history.
 */
import { useMemo } from "react";

import { CommitGraph } from "@workspace-welcome/ui/components/commit-graph";

import { relativeTime } from "@/lib/format";
import { useProject } from "@/lib/contexts/project-context";
import type { RegisteredWidgetProps } from "@/components/widgets/registry";
import { useWidgetSize, WidgetShell } from "@/components/widgets/widget-shell";

/** Row pitch of the CommitGraph dense register (ui constant mirror). */
const DENSE_ROW_PX = 22;

/** Chrome budget per rung — outer shell header + inner meta header + the
 * footer line + content padding — and the grid's per-row gap (12px), which
 * a multi-row span adds on top of `96px × rows`. Subtracted before dividing
 * by the row pitch. */
const CHROME_PX = 86;
const ROW_GAP_PX = 12;

export function McProjectCommits(_props: RegisteredWidgetProps) {
  const project = useProject();
  const commits = project.commitLog.data ?? [];
  const placed = useWidgetSize();

  const authors = useMemo(
    () => new Set(commits.map((c) => c.author)).size,
    [commits],
  );

  // The placed height buys the visible window (dense rows), never a scroll.
  const cap = Math.max(
    3,
    Math.floor((placed.rows * (96 + ROW_GAP_PX) - CHROME_PX) / DENSE_ROW_PX),
  );
  const shown = commits.slice(0, cap);
  const overflow = commits.length - shown.length;

  return (
    <WidgetShell
      className="h-full w-full"
      meta={
        <span className="font-mono text-[9.5px] tabular-nums text-muted-foreground">
          {commits.length} commits · {authors} {authors === 1 ? "author" : "authors"}
        </span>
      }
    >
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden px-1.5 pb-2.5">
        {commits.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            {project.project?.git?.isRepo ? "No commits yet." : "No git data."}
          </p>
        ) : (
          <div className="min-h-0 min-w-0 flex-1">
            <CommitGraph
              entries={shown}
              dense
              renderHoverDetail={(entry) => (
                <span className="flex flex-col gap-0.5">
                  <span>{entry.subject}</span>
                  <span className="text-muted-foreground">
                    {entry.author} · {relativeTime(new Date(entry.timestamp * 1000).toISOString())}
                    {" · "}
                    {entry.hash.slice(0, 7)}
                  </span>
                </span>
              )}
              renderTrailing={(entry) => (
                <>
                  <span className="hidden font-mono text-[10px] text-muted-foreground @[520px]:inline">
                    {entry.author}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {relativeTime(new Date(entry.timestamp * 1000).toISOString())}
                  </span>
                  <span className="font-mono text-[10px] text-(--mc-accent)">
                    {entry.hash.slice(0, 7)}
                  </span>
                </>
              )}
            />
          </div>
        )}
        {overflow > 0 ? (
          <p className="mt-auto shrink-0 px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
            +{overflow} older in the log
          </p>
        ) : null}
      </div>
    </WidgetShell>
  );
}
