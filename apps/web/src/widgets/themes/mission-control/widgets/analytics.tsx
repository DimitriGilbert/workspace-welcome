/**
 * The analytics column kinds (port of the design's `AnalyticsZone` bodies,
 * `components/designs/mission-control/analytics-zone.tsx`, one kind per
 * design widget):
 *
 * - `mc-activity-heatmap` — fleet-wide 12-week activity heatmap
 *   (`activityCounts` → ui `Heatmap`, the design's promoted instrument).
 * - `mc-alerts-donut` — the alert census: severity slices around the
 *   open-count numeral, the design's err/wrn/inf register + per-code
 *   rollup legend (verbatim body).
 * - `mc-stack-mix` — the stack census (`stackDistribution`, Other-folding)
 *   over the default chart ramp with the design's icon-keyed legend row.
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
import { useWorkspace } from "@/widgets/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { useWidgetSize, WidgetShell } from "@/widgets/runtime/widget-shell";

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
 * Half-width pairs: the preset packs the analytics donuts ONE PER ZONE
 * COLUMN (the design's [alerts | stack] / [dirty | roots] pairs), so the
 * full body gates on the shell's container width (≥ ~240px) rather than a
 * column count — a 1-col placement renders the donut on desktop canvases
 * and degrades to the numeral on tablet/phone.
 */
export function McAlertsDonut(_props: RegisteredWidgetProps) {
  const workspace = useWorkspace();
  const placed = useWidgetSize();
  const tall = placed.rows >= 3;
  const rows = useMemo(() => severityLedger(workspace.projects), [workspace.projects]);
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const open = rows.filter((r) => r.count > 0);

  const fullBody = (
    <div className="hidden h-full min-h-0 w-full min-w-0 flex-col gap-2 overflow-hidden px-3.5 pb-3 @[240px]:flex">
      {total === 0 ? (
        <div className="flex items-center gap-2 py-1">
          <span aria-hidden className="size-1.5 bg-(--state-positive)" />
          <p className="font-mono text-[11px] text-muted-foreground">
            0 open — fleet nominal
          </p>
        </div>
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
                className="flex items-baseline gap-2.5 border-t border-(--mc-line) py-1.5 first:border-t-0"
              >
                <span
                  aria-hidden
                  className="size-1.5 self-center"
                  style={{ background: SEV_SLICE_COLOR[row.severity] }}
                />
                <span className="w-8 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {SEV_GLYPH[row.severity]}
                </span>
                <span
                  className="font-mono text-base leading-none tabular-nums"
                  style={{ color: SEV_SLICE_COLOR[row.severity] }}
                >
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
        <>
          <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3.5 pb-2 @[240px]:hidden">
            <Stat label="Open alerts" value={total} tone={total > 0 ? "warning" : "positive"} />
          </div>
          {fullBody}
        </>
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
  const tall = placed.rows >= 3;
  const slices = useMemo(() => stackDistribution(workspace.projects), [workspace.projects]);
  const total = slices.reduce((sum, s) => sum + s.count, 0);

  const fullBody =
    total === 0 ? (
      <div className="hidden h-full min-h-0 w-full items-center px-3.5 pb-2 @[240px]:flex">
        <p className="font-mono text-[11px] text-muted-foreground">No units scanned yet.</p>
      </div>
    ) : (
      <div className="hidden h-full min-h-0 w-full min-w-0 items-center gap-3 overflow-hidden px-3.5 pb-3 @[240px]:flex">
        <div className="relative h-24 w-24 shrink-0">
          <Donut
            size={92}
            ariaLabel="Stack mix across the fleet"
            center={{ value: String(total), label: "units" }}
            slices={slices.map((s) => ({ label: s.label, value: s.count }))}
          />
        </div>
        <ul className="m-0 min-w-0 flex-1 list-none p-0">
          {slices.map((s, i) => (
            <li key={s.id} className="flex items-baseline gap-2 py-[3px]">
              <span
                aria-hidden
                className="size-2 shrink-0 self-center"
                style={{ background: rampFill(i) }}
              />
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground" title={s.label}>
                {s.label}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-foreground">{s.count}</span>
            </li>
          ))}
        </ul>
      </div>
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
        <>
          <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3.5 pb-2 @[240px]:hidden">
            <Stat label="Stacks" value={slices.length} />
          </div>
          {fullBody}
        </>
      ) : (
        <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3.5 pb-2">
          <Stat label="Stacks" value={slices.length} />
        </div>
      )}
    </WidgetShell>
  );
}

// --- mc-dirty-leaders --------------------------------------------------------

export function McDirtyLeaders(_props: RegisteredWidgetProps) {
  const workspace = useWorkspace();
  const placed = useWidgetSize();
  const tall = placed.rows >= 2;
  const leaders = useMemo(() => dirtyLeaders(workspace.projects, LEADER_LIMIT), [workspace.projects]);
  const dirtySum = useMemo(
    () => leaders.reduce((sum, r) => sum + r.dirty, 0),
    [leaders],
  );

  const statBody = (
    <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3.5 pb-2">
      <Stat label="Dirty files" value={dirtySum} tone={dirtySum > 0 ? "warning" : undefined} />
    </div>
  );

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
          <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3.5 pb-2 @[240px]:hidden">
            <Stat label="Dirty files" value={dirtySum} tone={dirtySum > 0 ? "warning" : undefined} />
          </div>
          {leaders.length === 0 ? (
            <div className="hidden h-full min-h-0 w-full items-center px-3.5 pb-2 @[240px]:flex">
              <p className="font-mono text-[11px] text-muted-foreground">
                No uncommitted work — the tree is clean.
              </p>
            </div>
          ) : (
            <div className="hidden h-full min-h-0 w-full min-w-0 flex-col justify-center gap-1 overflow-hidden px-3.5 pb-3 @[240px]:flex">
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
          )}
        </>
      ) : (
        statBody
      )}
    </WidgetShell>
  );
}
