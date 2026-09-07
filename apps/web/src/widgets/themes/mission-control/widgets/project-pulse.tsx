/**
 * McProjectPulse — the commit pulse (T3 port of the design project page's
 * "Commit pulse" overview widget): the commit-day `Heatmap` over THIS repo's
 * log window with the pulse numerals beneath (logged commits, authors, first
 * commit) — all riding the ONE cached commit-log entry from
 * `useProject().commitLog`.
 *
 * The heatmap window covers the repo's real log span (capped 12–26 weeks so
 * an old repo doesn't render an all-dark void — the design's `pulseWeeks`
 * rule verbatim) and runs the Heatmap's `fill` register: the cells flex
 * through the widget's box instead of centering a capped mosaic that strands
 * a dead margin beside the legend (owner fill law — the box is the chart's).
 * Ladder: "2x2" carries heatmap + numerals; "1x1" degrades to the
 * logged-commits numeral.
 */
import { useMemo } from "react";

import { Heatmap, MIN_CONTENT as HEATMAP_MIN } from "@workspace-welcome/ui/components/heatmap";
import { Stat } from "@workspace-welcome/ui/components/stat";

import { relativeTime } from "@/lib/format";
import { dayKey } from "@/lib/scan-metrics";
import { useProject } from "@/widgets/contexts/project-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

/** The design's span rule: cover the real log span, 12–26 weeks, legible. */
function pulseWeeks(first: number | undefined, last: number | undefined): number {
  if (first === undefined || last === undefined || first === last) return 12;
  const spanDays = (first - last) / 86_400;
  return Math.min(26, Math.max(12, Math.ceil(spanDays / 7) + 1));
}

export function McProjectPulse(props: RegisteredWidgetProps) {
  const project = useProject();
  const commits = project.commitLog.data ?? [];
  const now = project.now;

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of commits) {
      const key = dayKey(c.timestamp * 1000);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [commits]);

  const authors = useMemo(
    () => new Set(commits.map((c) => c.author)).size,
    [commits],
  );
  const firstCommitIso = useMemo(() => {
    const oldest = commits.at(-1);
    return oldest ? new Date(oldest.timestamp * 1000).toISOString() : null;
  }, [commits]);
  const weeks = pulseWeeks(commits[0]?.timestamp, commits.at(-1)?.timestamp);

  return (
    <WidgetShell
      className="h-full w-full"
      meta={
        <span className="font-mono text-[9.5px] tabular-nums text-muted-foreground">
          {commits.length} in log window
        </span>
      }
    >
      <WidgetShell
        className="h-full w-full"
        interactive={false}
        size={{ cols: props.size.cols, rows: props.size.rows }}
        sizes={{
          "1x1": (
            <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3 pb-2">
              <Stat label="Commits" value={commits.length} />
            </div>
          ),
          "2x2": (
            <div className="flex h-full min-h-0 w-full flex-col justify-between gap-3 overflow-hidden px-3 pb-3">
              <div
                data-part-min-w={HEATMAP_MIN.w}
                data-part-min-h={HEATMAP_MIN.h}
                className="min-h-0 min-w-0"
              >
                <Heatmap
                  counts={counts}
                  weeks={weeks}
                  now={now}
                  cellMax={26}
                  fill
                  ariaLabel={`${project.project?.name ?? "project"} commit-day heatmap, trailing ${weeks} weeks`}
                />
              </div>
              <div className="grid shrink-0 grid-cols-3 gap-3 border-t border-(--mc-line-strong) pt-2.5">
                <Stat label="logged commits" value={commits.length} size="sm" />
                <Stat label="authors" value={authors} size="sm" />
                <Stat
                  label="first commit"
                  value={firstCommitIso !== null ? relativeTime(firstCommitIso) : "—"}
                  size="sm"
                />
              </div>
            </div>
          ),
        }}
      >
        <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3 pb-2">
          <Stat label="Commits" value={commits.length} />
        </div>
      </WidgetShell>
    </WidgetShell>
  );
}
