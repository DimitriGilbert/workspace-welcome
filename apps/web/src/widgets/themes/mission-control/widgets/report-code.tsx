/**
 * McReportCode — the CODE report widget (T2 port of the design's
 * `ReportCodeWidget`, dashboard slice): the language distribution as a
 * `Donut` with the total-lines figure in the hole (the console's instrument
 * for shares) plus the swatch legend with compact line counts, over the
 * commits/repos/contributors totals. The per-contributor bars ride the live
 * commit log on the project page (T3); the dashboard keeps the export
 * census. Below the donut floor: the totals numerals.
 */
import { useMemo } from "react";

import { Donut } from "@workspace-welcome/ui/components/donut";
import { Stat } from "@workspace-welcome/ui/components/stat";

import { formatCompact } from "@/lib/format";
import { useReport } from "@/widgets/contexts/report-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

import { McReportGate, ReportGeneratedMeta } from "./report-shared";

const LANGUAGE_LIMIT = 6;

export function McReportCode(_props: RegisteredWidgetProps) {
  const report = useReport();
  const view = report.view;

  const languages = useMemo(() => (view?.languageRows ?? []).slice(0, LANGUAGE_LIMIT), [view]);
  const totalLines = useMemo(
    () => (view?.languageRows ?? []).reduce((sum, l) => sum + l.lines, 0),
    [view],
  );
  const totalFiles = useMemo(
    () => (view?.languageRows ?? []).reduce((sum, l) => sum + l.files, 0),
    [view],
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
        <WidgetShell
          className="h-full w-full"
          sizes={{
            "1x1": (
              <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3 pb-2">
                <Stat label="Lines" value={formatCompact(totalLines)} />
              </div>
            ),
            "2x2": (
              <div className="flex h-full min-h-0 w-full min-w-0 flex-col justify-center gap-3 overflow-hidden px-3 pb-2">
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
            ),
            "3x3": (
              <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-3 overflow-hidden px-3 pb-3">
                <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
                  <Stat label="Commits" value={(view?.totals.commits ?? 0).toLocaleString()} size="sm" />
                  <Stat label="Repos" value={view?.totals.repositories ?? 0} size="sm" />
                  <Stat label="Contributors" value={view?.totals.contributors ?? 0} size="sm" />
                  <Stat label="Files" value={totalFiles.toLocaleString()} size="sm" />
                </div>
                {languages.length === 0 ? (
                  <p className="font-mono text-[11px] text-muted-foreground">No language data.</p>
                ) : (
                  <div className="flex min-h-0 min-w-0 flex-1 items-center gap-4">
                    <div className="flex h-full w-[116px] shrink-0 items-center justify-center">
                      <Donut
                        size={112}
                        ariaLabel="Language mix by lines"
                        center={{ value: formatCompact(totalLines), label: "lines" }}
                        slices={languages.map((l) => ({ label: l.language, value: l.lines }))}
                      />
                    </div>
                    <ul className="m-0 min-w-0 flex-1 list-none p-0">
                      {languages.map((l) => (
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
            ),
          }}
        >
          <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3 pb-2">
            <Stat label="Lines" value={formatCompact(totalLines)} />
          </div>
        </WidgetShell>
      </McReportGate>
    </WidgetShell>
  );
}
