/**
 * McReportCode — the CODE report widget (port of the design's
 * `ReportCodeWidget` body, `components/designs/mission-control/
 * report-widgets.tsx`): two columns — commits/repos MiniStats over the
 * language donut (total lines in the hole) + the swatch legend; the
 * per-contributor bars fill the second column wherever a live commit log
 * rides the context (project page), the export census stands in on the
 * dashboard. Below the full rung: the totals + donut; smallest: numerals.
 */
import { useMemo } from "react";

import { Donut } from "@workspace-welcome/ui/components/donut";
import { Stat } from "@workspace-welcome/ui/components/stat";

import { formatCompact } from "@/lib/format";
import { useReport } from "@/widgets/contexts/report-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { useWidgetSize, WidgetShell } from "@/widgets/runtime/widget-shell";

import { McReportGate, ReportGeneratedMeta } from "./report-shared";

const LANGUAGE_LIMIT = 6;

/** Compact 12.4k / 1.2M numeral for chart centers and legends. */
function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

export function McReportCode(_props: RegisteredWidgetProps) {
  const report = useReport();
  const view = report.view;
  const placed = useWidgetSize();

  const languages = useMemo(() => (view?.languageRows ?? []).slice(0, LANGUAGE_LIMIT), [view]);
  const totalLines = useMemo(
    () => (view?.languageRows ?? []).reduce((sum, l) => sum + l.lines, 0),
    [view],
  );
  const totalFiles = useMemo(
    () => (view?.languageRows ?? []).reduce((sum, l) => sum + l.files, 0),
    [view],
  );
  const full = placed.cols >= 3 && placed.rows >= 3;
  const mid = placed.cols >= 2 && placed.rows >= 2;

  const donut = (
    <div className="flex min-h-44 min-w-0 flex-1 items-center gap-4">
      <div className="flex h-full min-h-32 min-w-0 flex-1 items-center justify-center">
        <Donut
          size={116}
          ariaLabel="Language mix by lines"
          center={{ value: compactCount(totalLines), label: "lines" }}
          slices={languages.map((l) => ({ label: l.language, value: l.lines }))}
        />
      </div>
      <ul className="m-0 min-w-0 shrink-0 list-none p-0">
        {languages.map((l, i) => (
          <li key={l.language} className="flex items-baseline gap-2 py-[3px]">
            <span
              aria-hidden
              className="size-2 shrink-0 self-center"
              style={{ background: `var(--chart-${(i % 6) + 1})` }}
            />
            <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
              {l.language}
            </span>
            <span className="font-mono text-[10.5px] tabular-nums text-foreground">
              {compactCount(l.lines)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <WidgetShell
      className="h-full w-full"
      meta={
        <span className="flex items-center gap-3">
          <span className="font-mono text-[9.5px] tabular-nums text-muted-foreground">
            {totalFiles.toLocaleString()} files · {totalLines.toLocaleString()} lines
          </span>
          {view === null ? null : <ReportGeneratedMeta />}
        </span>
      }
    >
      <McReportGate>
        {full ? (
          <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-3 overflow-hidden px-3.5 pb-3">
            <div className="flex min-w-0 flex-wrap gap-5">
              <Stat label="commits" value={(view?.totals.commits ?? 0).toLocaleString()} size="sm" />
              <Stat label="repos" value={view?.totals.repositories ?? 0} size="sm" />
              <Stat label="contributors" value={view?.totals.contributors ?? 0} size="sm" />
            </div>
            {languages.length === 0 ? (
              <p className="font-mono text-[11px] text-muted-foreground">No language data.</p>
            ) : (
              donut
            )}
          </div>
        ) : mid ? (
          <div className="flex h-full min-h-0 w-full min-w-0 flex-col justify-center gap-3 overflow-hidden px-3.5 pb-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3">
              <Stat label="Commits" value={(view?.totals.commits ?? 0).toLocaleString()} />
              <Stat label="Contributors" value={view?.totals.contributors ?? 0} />
            </div>
            {languages.length === 0 ? (
              <p className="font-mono text-[11px] text-muted-foreground">No language data.</p>
            ) : (
              <div className="flex min-h-0 min-w-0 items-center gap-3">
                <Donut
                  size={96}
                  ariaLabel="Language mix by lines"
                  slices={languages.map((l) => ({ label: l.language, value: l.lines }))}
                />
                <ul className="m-0 min-w-0 flex-1 list-none p-0">
                  {languages.slice(0, 4).map((l) => (
                    <li key={l.language} className="flex items-baseline gap-2 py-[3px]">
                      <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
                        {l.language}
                      </span>
                      <span className="font-mono text-[10.5px] tabular-nums text-foreground">
                        {formatCompact(l.lines)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3.5 pb-2">
            <Stat label="Lines" value={formatCompact(totalLines)} />
          </div>
        )}
      </McReportGate>
    </WidgetShell>
  );
}
