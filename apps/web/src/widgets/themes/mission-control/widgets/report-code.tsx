/**
 * McReportCode — the CODE report widget (port of the design's
 * `ReportCodeWidget` body, `components/designs/mission-control/
 * report-widgets.tsx`): the totals MiniStats over the language donut and
 * its share legend — donut and legend are ONE shape-aware unit (ui `Donut`
 * carries the legend slot: beside on wide containers, stacked below on
 * narrow ones), the donut sized to the box it is given (fill, capped per
 * rung), no floating chart in a void. The per-contributor bars fill the
 * second column wherever a live commit log rides the context (project
 * page); the export census stands in on the dashboard. Below the full
 * rung: the totals + donut unit; smallest: numerals.
 */
import { useMemo } from "react";

import { Donut } from "@workspace-welcome/ui/components/donut";
import { Stat } from "@workspace-welcome/ui/components/stat";

import { formatCompact } from "@/lib/format";
import { useReport } from "@/widgets/contexts/report-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { useWidgetSize, WidgetShell } from "@/widgets/runtime/widget-shell";

import { McReportGate } from "./report-shared";

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

  // Donut sized to the box it is given: fill mode scales to the mounted
  // sub-box, the cap rides the rung (the FINAL image's ~280px moderate ring
  // at the 4-row placement).
  const donutSize = placed.rows >= 6 ? 320 : placed.rows >= 5 ? 300 : placed.rows >= 4 ? 280 : 190;

  const maxLines = languages.reduce((peak, l) => Math.max(peak, l.lines), 0);

  /**
   * The full rung's language rows (the FINAL composition): swatch, name,
   * proportional share bar, exact lines and the share percentage — one tight
   * band per language (~37px pitch), the group centered beside the donut.
   */
  const legend = (
    <ul className="m-0 flex min-h-0 min-w-0 list-none flex-col justify-center p-0">
      {languages.map((l, i) => {
        const share = totalLines > 0 ? Math.round((l.lines / totalLines) * 100) : 0;
        const barShare = maxLines > 0 ? Math.max(3, Math.round((l.lines / maxLines) * 100)) : 0;
        return (
          <li
            key={l.language}
            className="flex items-center gap-2.5 border-t border-(--mc-line) px-1 py-[8px] first:border-t-0"
          >
            <span
              aria-hidden
              className="size-2.5 shrink-0"
              style={{ background: `var(--chart-${(i % 6) + 1})` }}
            />
            <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-muted-foreground">
              {l.language}
            </span>
            <span className="block h-1.5 w-[100px] shrink-0 overflow-hidden bg-[color-mix(in_oklch,var(--foreground)_6%,transparent)]">
              <span
                className="block h-full"
                style={{
                  width: `${barShare}%`,
                  background: `var(--chart-${(i % 6) + 1})`,
                  opacity: 0.55 + (l.lines / Math.max(1, maxLines)) * 0.45,
                }}
              />
            </span>
            <span className="w-12 shrink-0 text-right font-mono text-[13px] tabular-nums text-foreground">
              {compactCount(l.lines)}
            </span>
            <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
              {share}%
            </span>
          </li>
        );
      })}
    </ul>
  );

  /** The compact legend (mid rungs): same columns, tighter register. */
  const legendCompact = (
    <ul className="m-0 flex min-h-0 min-w-0 list-none flex-col justify-center p-0">
      {languages.map((l, i) => {
        const share = totalLines > 0 ? Math.round((l.lines / totalLines) * 100) : 0;
        const barShare = maxLines > 0 ? Math.max(3, Math.round((l.lines / maxLines) * 100)) : 0;
        return (
          <li
            key={l.language}
            className="flex items-center gap-2 border-t border-(--mc-line) px-1 py-1.5 first:border-t-0"
          >
            <span
              aria-hidden
              className="size-2 shrink-0"
              style={{ background: `var(--chart-${(i % 6) + 1})` }}
            />
            <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
              {l.language}
            </span>
            <span className="block h-1.5 w-16 shrink-0 overflow-hidden bg-[color-mix(in_oklch,var(--foreground)_6%,transparent)]">
              <span
                className="block h-full"
                style={{
                  width: `${barShare}%`,
                  background: `var(--chart-${(i % 6) + 1})`,
                  opacity: 0.55 + (l.lines / Math.max(1, maxLines)) * 0.45,
                }}
              />
            </span>
            <span className="font-mono text-[10.5px] tabular-nums text-foreground">
              {compactCount(l.lines)}
            </span>
            <span className="w-9 text-right font-mono text-[9.5px] tabular-nums text-muted-foreground">
              {share}%
            </span>
          </li>
        );
      })}
    </ul>
  );

  return (
    <WidgetShell
      className="h-full w-full"
      meta={
        view === null ? undefined : (
          <span className="font-mono text-[9.5px] tabular-nums text-muted-foreground">
            {totalFiles.toLocaleString()} files · {totalLines.toLocaleString()} lines
          </span>
        )
      }
    >
      <McReportGate>
        {full ? (
          <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-3 overflow-hidden px-3.5 pb-3">
            <div className="flex min-w-0 flex-wrap gap-x-5 gap-y-2">
              <Stat label="commits" value={(view?.totals.commits ?? 0).toLocaleString()} size="sm" />
              <Stat label="repos" value={view?.totals.repositories ?? 0} size="sm" />
              <Stat label="contributors" value={view?.totals.contributors ?? 0} size="sm" />
            </div>
            {languages.length === 0 ? (
              <p className="font-mono text-[11px] text-muted-foreground">No language data.</p>
            ) : (
              // Donut + legend as ONE shape-aware unit: the donut sized to
              // its box, the legend beside it (below on narrow containers).
              <Donut
                className="min-h-0 min-w-0 flex-1"
                fill
                size={donutSize}
                ariaLabel="Language mix by lines"
                center={{ value: compactCount(totalLines), label: "lines" }}
                slices={languages.map((l) => ({ label: l.language, value: l.lines }))}
                legend={legend}
              />
            )}
          </div>
        ) : mid ? (
          <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-3 overflow-hidden px-3.5 pb-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3">
              <Stat label="Commits" value={(view?.totals.commits ?? 0).toLocaleString()} />
              <Stat label="Contributors" value={view?.totals.contributors ?? 0} />
            </div>
            {languages.length === 0 ? (
              <p className="font-mono text-[11px] text-muted-foreground">No language data.</p>
            ) : (
              <Donut
                className="min-h-0 min-w-0 flex-1"
                fill
                size={Math.min(donutSize, 150)}
                ariaLabel="Language mix by lines"
                slices={languages.map((l) => ({ label: l.language, value: l.lines }))}
                legend={legendCompact}
              />
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
