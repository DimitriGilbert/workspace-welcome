/**
 * Meadow context panel, ported from `components/designs/meadow/context.tsx`
 * + `report.tsx` into the theme namespace (owner correction: theme widgets
 * carry the prototype's presentation). The design's right rail: the tabbed
 * snitch report on top, then the momentum / rhythm / stacks / directories
 * digests, closing with the concept footer — every widget a slim
 * `.meadow-panel`. The theme's board CSS hosts this stack as the 24% rail
 * beside the mosaic at desktop widths, exactly as the design's resizable
 * split presents it.
 *
 * The report state machine (missing/stale/running/fresh) is ReportProvider's
 * — never re-implemented.
 */
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import {
  DirectoriesCard,
  MomentumCard,
  MomentumCardBase,
  RhythmBar,
  RhythmCard,
  StacksCard,
} from "./context-cards";
import { MeadowReport } from "./report";
import { dailyActivity, touchedWithinDays } from "@/lib/scan-metrics";
import { useProject } from "@/widgets/contexts/project-context";
import { useWorkspace } from "@/widgets/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

/** The full context presentation: the design's rail stack. */
function ContextFull() {
  return (
    <div className="meadow-scroll flex w-full min-w-0 flex-col gap-3">
      <MeadowReport title="Workspace report" />
      <MomentumCard />
      <RhythmCard />
      <StacksCard />
      <DirectoriesCard />

      <footer className="mt-1 flex flex-wrap items-center justify-between gap-2 pt-2">
        <p className="text-[10px] text-muted-foreground">
          Meadow — daylight. Tile size follows recency.
        </p>
        <Link
          to="/designs"
          className="meadow-focus group inline-flex items-center gap-1 rounded-full text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          All concepts
          <ArrowRight
            aria-hidden
            className="size-3 transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      </footer>
    </div>
  );
}

/** Small-rung momentum readout (non-chart). */
function MomentumRung() {
  const workspace = useWorkspace();
  const touched = touchedWithinDays(workspace.projects, 7, workspace.now);
  return (
    <div className="flex h-full w-full min-w-0 flex-col justify-center gap-1 overflow-hidden px-1">
      <p className="flex items-baseline gap-2">
        <span className="text-xl leading-none font-semibold tracking-tight text-foreground">
          {touched}
        </span>
        <span className="text-[11px] text-muted-foreground">touched this week</span>
      </p>
    </div>
  );
}

/**
 * Fill-box root with the authored rungs: the full rail at the dashboard
 * placement, honest non-chart numerals below it.
 */
export function MeadowContext({ size }: RegisteredWidgetProps) {
  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
      sizes={{
        "1x1": <MomentumRung />,
        "2x1": (
          <div className="flex h-full w-full min-w-0 flex-col justify-center gap-2 overflow-hidden px-1">
            <MomentumRung />
            <RhythmBar />
          </div>
        ),
        "2x2": (
          <div className="flex h-full w-full min-h-0 flex-col gap-2 overflow-hidden">
            <MomentumRung />
            <RhythmCard />
            <StacksCard />
          </div>
        ),
        // Narrow boards clamp the 12x6 placement to 2x6 — same full rail.
        "2x6": <ContextFull />,
        "12x6": <ContextFull />,
      }}
    >
      <ContextFull />
    </WidgetShell>
  );
}

/** Project-scoped momentum — the design's MomentumCardBase over one project's
 * touched-days curve (the project page's Activity tab). */
export function ProjectMomentumCard() {
  const { project, now } = useProject();
  const scoped = useMemo(() => (project === null ? [] : [project]), [project]);
  const activity = useMemo(
    () => dailyActivity(scoped, 28, now),
    [scoped, now],
  );
  const touches = useMemo(
    () => touchedWithinDays(scoped, 7, now),
    [scoped, now],
  );
  const total = activity.reduce((sum, v) => sum + v, 0);
  return (
    <MomentumCardBase
      activity={activity}
      touchedThisWeek={touches}
      total={total}
    />
  );
}
