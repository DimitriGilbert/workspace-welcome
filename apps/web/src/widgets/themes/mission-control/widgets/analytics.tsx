/**
 * The analytics column kinds (T2 port of the design's `AnalyticsZone`,
 * `components/designs/mission-control/analytics-zone.tsx`, one kind per
 * design widget):
 *
 * - `mc-activity-heatmap` — fleet-wide 12-week activity heatmap
 *   (`activityCounts` → ui `Heatmap`, the design's promoted instrument).
 * - `mc-alerts-donut` — the alert census: severity slices in the `--sev-*`
 *   registers around the open-count numeral, the design's err/wrn/inf
 *   register + per-code rollup as the legend.
 * - `mc-stack-mix` — the stack census (`stackDistribution`, Other-folding)
 *   over the default chart ramp with a count legend.
 * - `mc-dirty-leaders` — the uncommitted-work leaders (`dirtyLeaders`) as
 *   `HBars` rows; the design's bar-click-to-open becomes the ledger's unit
 *   links (no row-activation seam in this theme's import surface — recorded
 *   in the T2 wave report).
 *
 * All fleet aggregates come from `lib/scan-metrics` (the one derivation
 * home); colors are tokens only; every rung renders one fill-box wrapper
 * and the geometry parts only render at rungs that clear their floors.
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
import { useWorkspace } from "@/widgets/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

const HEATMAP_WEEKS = 12;
const LEADER_LIMIT = 6;

/** Honest fill-box for an aggregate rung that has nothing to plot yet. */
function QuietFill({ line }: { line: string }) {
  return (
    <div className="flex h-full min-h-0 w-full items-center px-3 pb-2">
      <p className="font-mono text-[11px] text-muted-foreground">{line}</p>
    </div>
  );
}

// --- mc-activity-heatmap -----------------------------------------------------

export function McActivityHeatmap(_props: RegisteredWidgetProps) {
  const workspace = useWorkspace();
  const { projects, now } = workspace;

  const counts = useMemo(() => activityCounts(projects, now), [projects, now]);
  const touches = useMemo(() => [...counts.values()].reduce((sum, c) => sum + c, 0), [counts]);
  const touchedWeek = useMemo(() => touchedWithinDays(projects, 7, now), [projects, now]);

  return (
    <WidgetShell
      className="h-full w-full"
      meta={<span className="font-mono text-[9.5px] tabular-nums text-muted-foreground">{touches} / {HEATMAP_WEEKS}wk</span>}
    >
      <WidgetShell
        className="h-full w-full"
        sizes={{
          "1x1": (
            <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3 pb-2">
              <Stat label="Touched 7d" value={touchedWeek} />
            </div>
          ),
          "2x2": (
            <div
              data-part-min-w={HEATMAP_MIN.w}
              data-part-min-h={HEATMAP_MIN.h}
              style={{ minWidth: HEATMAP_MIN.w, minHeight: HEATMAP_MIN.h }}
              className="flex h-full min-h-0 w-full min-w-0 items-center overflow-hidden px-3 pb-2"
            >
              <Heatmap
                counts={counts}
                weeks={HEATMAP_WEEKS}
                now={now}
                ariaLabel="Fleet activity heatmap over the last 12 weeks"
              />
            </div>
          ),
        }}
      >
        <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3 pb-2">
          <Stat label="Touched 7d" value={touchedWeek} />
        </div>
      </WidgetShell>
    </WidgetShell>
  );
}

// --- mc-alerts-donut ---------------------------------------------------------

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

export function McAlertsDonut(_props: RegisteredWidgetProps) {
  const workspace = useWorkspace();
  const rows = useMemo(() => severityLedger(workspace.projects), [workspace.projects]);
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const open = rows.filter((r) => r.count > 0);

  return (
    <WidgetShell
      className="h-full w-full"
      meta={
        <span className="font-mono text-[9.5px] tabular-nums text-muted-foreground">
          {total === 0 ? "all clear" : `${total} open`}
        </span>
      }
    >
      <WidgetShell
        className="h-full w-full"
        sizes={{
          "1x1": (
            <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3 pb-2">
              <Stat label="Open alerts" value={total} tone={total > 0 ? "warning" : "positive"} />
            </div>
          ),
          "2x2": (
            <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 overflow-hidden px-3 pb-2">
              {total === 0 ? (
                <p className="flex items-center gap-2 font-mono text-[11px]" style={{ color: "var(--state-positive)" }}>
                  <span aria-hidden className="size-1.5 bg-(--state-positive)" />
                  0 open — fleet nominal
                </p>
              ) : (
                <>
                  <div className="flex min-h-0 min-w-0 justify-center py-1">
                    <Donut
                      size={104}
                      ariaLabel="Open alerts by severity"
                      center={{ value: String(total), label: "open" }}
                      slices={open.map((r) => ({
                        label: r.severity,
                        value: r.count,
                        color: SEV_SLICE_COLOR[r.severity],
                      }))}
                    />
                  </div>
                  <div className="flex min-w-0 flex-col">
                    {open.map((row) => (
                      <div
                        key={row.severity}
                        className="flex items-baseline gap-2.5 border-t border-(--mc-line) py-1 first:border-t-0"
                      >
                        <span
                          aria-hidden
                          className="size-1.5 self-center"
                          style={{ background: SEV_SLICE_COLOR[row.severity] }}
                        />
                        <span className="w-7 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          {SEV_GLYPH[row.severity]}
                        </span>
                        <span className="font-mono text-base leading-none tabular-nums" style={{ color: SEV_SLICE_COLOR[row.severity] }}>
                          {row.count}
                        </span>
                        <span className="ml-auto max-w-[15ch] truncate text-right font-mono text-[9.5px] text-muted-foreground">
                          {row.codes
                            .slice(0, 2)
                            .map((c) => `${c.code}×${c.count}`)
                            .join("  ")}
                          {row.codes.length > 2 ? "…" : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ),
        }}
      >
        <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3 pb-2">
          <Stat label="Open alerts" value={total} tone={total > 0 ? "warning" : "positive"} />
        </div>
      </WidgetShell>
    </WidgetShell>
  );
}

// --- mc-stack-mix ------------------------------------------------------------

export function McStackMix(_props: RegisteredWidgetProps) {
  const workspace = useWorkspace();
  const slices = useMemo(() => stackDistribution(workspace.projects), [workspace.projects]);
  const total = slices.reduce((sum, s) => sum + s.count, 0);

  return (
    <WidgetShell
      className="h-full w-full"
      meta={<span className="font-mono text-[9.5px] tabular-nums text-muted-foreground">{total} units</span>}
    >
      <WidgetShell
        className="h-full w-full"
        sizes={{
          "1x1": (
            <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3 pb-2">
              <Stat label="Stacks" value={slices.length} />
            </div>
          ),
          "2x2": total === 0 ? <QuietFill line="No units scanned yet." /> : (
            <div className="flex h-full min-h-0 w-full min-w-0 items-center gap-3 overflow-hidden px-3 pb-2">
              <div className="flex h-full w-[96px] shrink-0 items-center justify-center">
                <Donut
                  size={92}
                  ariaLabel="Stack mix across the fleet"
                  center={{ value: String(total), label: "units" }}
                  slices={slices.map((s) => ({ label: s.label, value: s.count }))}
                />
              </div>
              <ul className="m-0 min-w-0 flex-1 list-none p-0">
                {slices.map((s) => (
                  <li key={s.id} className="flex items-baseline gap-2 py-[3px]">
                    <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground" title={s.label}>
                      {s.label}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-foreground">{s.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ),
        }}
      >
        <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3 pb-2">
          <Stat label="Stacks" value={slices.length} />
        </div>
      </WidgetShell>
    </WidgetShell>
  );
}

// --- mc-dirty-leaders --------------------------------------------------------

export function McDirtyLeaders(_props: RegisteredWidgetProps) {
  const workspace = useWorkspace();
  const leaders = useMemo(() => dirtyLeaders(workspace.projects, LEADER_LIMIT), [workspace.projects]);
  const dirtySum = useMemo(
    () => leaders.reduce((sum, r) => sum + r.dirty, 0),
    [leaders],
  );

  return (
    <WidgetShell
      className="h-full w-full"
      meta={<span className="font-mono text-[9.5px] tabular-nums text-muted-foreground">{dirtySum} files</span>}
    >
      <WidgetShell
        className="h-full w-full"
        sizes={{
          "1x1": (
            <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3 pb-2">
              <Stat label="Dirty files" value={dirtySum} tone={dirtySum > 0 ? "warning" : undefined} />
            </div>
          ),
          "2x2": leaders.length === 0 ? (
            <QuietFill line="No uncommitted work — the tree is clean." />
          ) : (
            <div className="flex h-full min-h-0 w-full min-w-0 flex-col justify-center gap-1 overflow-hidden px-3 pb-2">
              <HBars
                rows={leaders.map((r) => ({
                  label: r.name,
                  value: r.dirty,
                  display: `${r.dirty}`,
                  color: "var(--sev-warning)",
                }))}
                maxRows={LEADER_LIMIT}
                ariaLabel="Projects carrying the most uncommitted files, heaviest first"
              />
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                uncommitted files per unit
              </p>
            </div>
          ),
        }}
      >
        <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3 pb-2">
          <Stat label="Dirty files" value={dirtySum} tone={dirtySum > 0 ? "warning" : undefined} />
        </div>
      </WidgetShell>
    </WidgetShell>
  );
}
