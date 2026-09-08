/**
 * The analytics column kinds (port of the design's `AnalyticsZone` bodies,
 * `components/designs/mission-control/analytics-zone.tsx`, one kind per
 * design widget):
 *
 * - `mc-activity-heatmap` — fleet-wide 12-week activity heatmap
 *   (`activityCounts` → ui `Heatmap`, the design's promoted instrument).
 * - `mc-alerts-donut` — the alert census: severity slices around the
 *   open-count numeral, the design's err/wrn/inf register + per-code
 *   rollup legend — one shape-aware unit (ui `Donut` legend slot: donut
 *   left, rollup rows beside on wide containers, stacked below on narrow).
 * - `mc-stack-mix` — the stack census (`stackDistribution`, Other-folding)
 *   over the default chart ramp with the icon-keyed legend beside the
 *   donut (same shape-aware unit).
 * - `mc-dirty-leaders` — the uncommitted-work leaders (`dirtyLeaders`) as
 *   `HBars` rows (the sanctioned bars engine; the design's chart-library
 *   import is not available to themes) with the files meta.
 *
 * All fleet aggregates come from `lib/scan-metrics` (the one derivation
 * home); colors are tokens only; rungs resolve through `useWidgetSize`
 * against the real placed footprint — the canonical-ladder fallbacks
 * degrade to numerals only below the geometry floors.
 */
import { useMemo } from "react";

import type { Project } from "@workspace-welcome/api/lib/types";
import { Donut } from "@workspace-welcome/ui/components/donut";
import { HBars } from "@workspace-welcome/ui/components/h-bars";
import { Heatmap, MIN_CONTENT as HEATMAP_MIN } from "@workspace-welcome/ui/components/heatmap";
import { Stat } from "@workspace-welcome/ui/components/stat";

import {
  activityCounts,
  dirtyLeaders,
  severityLedger,
  stackDistribution,
  touchedWithinDays,
} from "@/lib/scan-metrics";
import { useWorkspace } from "@/lib/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/components/widgets/registry";
import { useWidgetSize, WidgetShell } from "@/components/widgets/widget-shell";

const HEATMAP_WEEKS = 12;
const LEADER_LIMIT = 6;

const SEV_SLICE_COLOR: Record<Project["alerts"][number]["severity"], string> = {
  critical: "var(--sev-critical)",
  warning: "var(--sev-warning)",
  info: "var(--sev-info)",
};

const SEV_GLYPH: Record<Project["alerts"][number]["severity"], string> = {
  critical: "err",
  warning: "wrn",
  info: "inf",
};

// --- mc-activity-heatmap -----------------------------------------------------

export function McActivityHeatmap(_props: RegisteredWidgetProps) {
  const workspace = useWorkspace();
  const { projects, now } = workspace;
  const placed = useWidgetSize();
  const full = placed.cols >= 2 && placed.rows >= 2;

  const counts = useMemo(() => activityCounts(projects, now), [projects, now]);
  const touches = useMemo(() => [...counts.values()].reduce((sum, c) => sum + c, 0), [counts]);
  const touchedWeek = useMemo(() => touchedWithinDays(projects, 7, now), [projects, now]);

  return (
    <WidgetShell
      className="h-full w-full"
      meta={
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {touches} / {HEATMAP_WEEKS}wk
        </span>
      }
    >
      {full ? (
        <div
          data-part-min-w={HEATMAP_MIN.w}
          data-part-min-h={HEATMAP_MIN.h}
          style={{ minWidth: HEATMAP_MIN.w, minHeight: HEATMAP_MIN.h }}
          className="flex h-full min-h-0 w-full min-w-0 flex-col justify-center overflow-hidden px-3.5 pb-3"
        >
          <Heatmap
            counts={counts}
            weeks={HEATMAP_WEEKS}
            now={now}
            ariaLabel="Fleet activity heatmap over the last 12 weeks"
          />
        </div>
      ) : (
        <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3.5 pb-2">
          <Stat label="Touched 7d" value={touchedWeek} />
        </div>
      )}
    </WidgetShell>
  );
}

// --- mc-alerts-donut ---------------------------------------------------------

/**
 * The alert census as ONE shape-aware unit: the donut sized to the box it is
 * given (fill, capped for the 5-row pair placement) with the severity rollup
 * as its legend — beside on wide containers, stacked below on narrow ones
 * (ui `Donut` owns the shape decision). Half-width pair placement on the
 * FINAL board renders donut left, five tight rollup rows right.
 */
export function McAlertsDonut(_props: RegisteredWidgetProps) {
  const workspace = useWorkspace();
  const placed = useWidgetSize();
  const tall = placed.rows >= 3;
  const rows = useMemo(() => severityLedger(workspace.projects), [workspace.projects]);
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const open = rows.filter((r) => r.count > 0);

  // Severity blocks with their per-code rollups — the FINAL image's five
  // tight rows (wrn 16 35% / stale-wip ×14 / no-remote ×2 / inf 30 65% /
  // dirty ×38), blocks distributing the legend column's height.
  const legend =
    total === 0 ? (
      <div className="flex items-center gap-2 py-1">
        <span aria-hidden className="size-1.5 bg-(--state-positive)" />
        <p className="font-mono text-[11px] text-muted-foreground">0 open — fleet nominal</p>
      </div>
    ) : (
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        {open.map((row) => (
          <div key={row.severity} className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 items-center gap-2.5 border-t border-(--mc-line)">
              <span
                aria-hidden
                className="size-1.5 shrink-0"
                style={{ background: SEV_SLICE_COLOR[row.severity] }}
              />
              <span className="w-8 shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {SEV_GLYPH[row.severity]}
              </span>
              <span
                className="font-mono text-[20px] leading-none tabular-nums"
                style={{ color: SEV_SLICE_COLOR[row.severity] }}
              >
                {row.count}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[12px] uppercase tracking-[0.14em] tabular-nums text-muted-foreground">
                {Math.round((row.count / Math.max(1, total)) * 100)}%
              </span>
            </div>
            {row.codes.slice(0, 3).map((c) => (
              <div key={c.code} className="flex min-h-0 flex-1 items-center gap-2.5 border-t border-(--mc-line)">
                <span className="ml-5 w-3 shrink-0 text-center font-mono text-[9px] text-muted-foreground/60">·</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" title={c.code}>
                  {c.code}
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-foreground">
                  ×{c.count}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    );

  const body =
    total === 0 ? (
      legend
    ) : (
      <Donut
        className="min-h-0 min-w-0 flex-1"
        fill
        size={200}
        ariaLabel="Open alerts by severity"
        center={{ value: String(total), label: "open" }}
        slices={open.map((r) => ({
          label: r.severity,
          value: r.count,
          color: SEV_SLICE_COLOR[r.severity],
        }))}
        legend={legend}
      />
    );

  return (
    <WidgetShell
      className="h-full w-full"
      meta={
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {total === 0 ? "all clear" : `${total} open`}
        </span>
      }
    >
      {tall ? (
        <div className="flex h-full min-h-0 w-full min-w-0 overflow-hidden px-3.5 pb-3">
          {body}
        </div>
      ) : (
        <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3.5 pb-2">
          <Stat label="Open alerts" value={total} tone={total > 0 ? "warning" : "positive"} />
        </div>
      )}
    </WidgetShell>
  );
}

// --- mc-stack-mix ------------------------------------------------------------

/** Chart ramp by slice index — the same mapping the ui Donut applies. */
function rampFill(i: number): string {
  return `var(--chart-${(i % 6) + 1})`;
}

export function McStackMix(_props: RegisteredWidgetProps) {
  const workspace = useWorkspace();
  const placed = useWidgetSize();
  // The donut form is the form: it renders from the 2-row rung up — never a
  // lone numeral.
  const tall = placed.rows >= 2;
  const slices = useMemo(() => stackDistribution(workspace.projects), [workspace.projects]);
  const total = slices.reduce((sum, s) => sum + s.count, 0);

  // Legend rows (the FINAL composition: swatch, label, share, count) —
  // distributed over the legend column's height beside the donut.
  const legend =
    total === 0 ? (
      <p className="font-mono text-[11px] text-muted-foreground">No units scanned yet.</p>
    ) : (
      <ul className="m-0 flex min-h-0 min-w-0 list-none flex-col justify-center p-0">
        {slices.map((s, i) => (
          <li
            key={s.id}
            className="flex items-center gap-2 border-t border-(--mc-line) py-6 first:border-t-0 @[420px]:py-12"
          >
            <span
              aria-hidden
              className="size-2 shrink-0"
              style={{ background: rampFill(i) }}
            />
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-muted-foreground" title={s.label}>
              {s.label}
            </span>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
              {Math.round((s.count / Math.max(1, total)) * 100)}%
            </span>
            <span className="w-8 shrink-0 text-right font-mono text-[13px] tabular-nums text-foreground">
              {s.count}
            </span>
          </li>
        ))}
      </ul>
    );

  const body =
    total === 0 ? (
      legend
    ) : (
      // Donut + legend as ONE shape-aware unit (beside on wide containers,
      // stacked below on narrow ones — ui `Donut` owns the shape decision).
      <Donut
        className="min-h-0 min-w-0 flex-1"
        fill
        size={240}
        ariaLabel="Stack mix across the fleet"
        center={{ value: String(total), label: "units" }}
        slices={slices.map((s) => ({ label: s.label, value: s.count }))}
        legend={legend}
      />
    );

  return (
    <WidgetShell
      className="h-full w-full"
      meta={
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {total} units
        </span>
      }
    >
      {tall ? (
        <div className="flex h-full min-h-0 w-full min-w-0 overflow-hidden px-3.5 pb-3">
          {body}
        </div>
      ) : (
        <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3.5 pb-2">
          <Stat label="Stacks" value={slices.length} />
        </div>
      )}
    </WidgetShell>
  );
}

// --- mc-dirty-leaders ------------------------------------------------------------

export function McDirtyLeaders(_props: RegisteredWidgetProps) {
  const workspace = useWorkspace();
  const placed = useWidgetSize();
  const tall = placed.rows >= 2;
  const leaders = useMemo(() => dirtyLeaders(workspace.projects, LEADER_LIMIT), [workspace.projects]);
  // The headline total is the fleet's uncommitted truth (the masthead's
  // figure); the leaders below it rank the heaviest units.
  const dirtySum = workspace.vitals.dirtySum;

  return (
    <WidgetShell
      className="h-full w-full"
      meta={
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {dirtySum} files
        </span>
      }
    >
      {tall ? (
        <>
          {/* Narrow column (below the bars' container floor): the total over
              the top leaders as a mini-ledger — never a lone numeral. */}
          <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden px-3.5 pb-2 @[240px]:hidden">
            {leaders.length === 0 ? (
              <p className="flex min-h-0 flex-1 items-center font-mono text-[11px] text-muted-foreground">
                No uncommitted work — the tree is clean.
              </p>
            ) : (
              <>
                <p className="flex shrink-0 items-baseline gap-2 border-b border-(--mc-shell-hairline) py-2 font-mono text-[13px] leading-none font-medium tabular-nums text-foreground">
                  {dirtySum} <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">dirty files</span>
                </p>
                <div className="flex min-h-0 flex-1 flex-col">
                  {leaders.slice(0, 4).map((r) => (
                    <div key={r.name} className="flex min-h-0 flex-1 items-center gap-2 border-t border-(--mc-line) first:border-t-0">
                      <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground" title={r.name}>
                        {r.name}
                      </span>
                      <span className="font-mono text-[10.5px] tabular-nums text-(--sev-warning)">
                        {r.dirty}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          {leaders.length === 0 ? (
            <div className="hidden h-full min-h-0 w-full items-center px-3.5 pb-2 @[240px]:flex">
              <p className="font-mono text-[11px] text-muted-foreground">
                No uncommitted work — the tree is clean.
              </p>
            </div>
          ) : (
            <div className="hidden h-full min-h-0 w-full min-w-0 flex-col overflow-hidden px-3.5 pb-3 @[240px]:flex">
              <HBars
                className="min-h-0 flex-1"
                rows={leaders.map((r) => ({
                  label: r.name,
                  value: r.dirty,
                  display: `${r.dirty}`,
                  color: "var(--sev-warning)",
                }))}
                maxRows={LEADER_LIMIT}
                labelWidth={96}
                ariaLabel="Projects carrying the most uncommitted files, heaviest first"
              />
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                uncommitted files per unit
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3.5 pb-2">
          <Stat label="Dirty files" value={dirtySum} tone={dirtySum > 0 ? "warning" : undefined} />
        </div>
      )}
    </WidgetShell>
  );
}
