/**
 * Meadow digest widgets (T2-meadow rework) — the five digests of the old
 * context rail, each promoted to its own widget kind per the owner's
 * verdict ("I don't want this split! Why isn't it widgets?"): workspace
 * report, momentum, rhythm, stacks, and directories. The preset places
 * them as a full-width band region below the mosaic — the resizable
 * two-panel split is gone and the digests are ordinary canvas widgets,
 * individually placeable, resizable, and drag-arrangeable like any tile.
 *
 * Rungs: the full card at the band placements, honest numerals/bars at the
 * small ladder rungs the lab catalog places. Every rung root is a fill box
 * (the density probe measures the direct child). Data rides the shared
 * workspace/report contexts — never fetched here; the report state machine
 * is ReportProvider's, never re-implemented.
 */
import { useMemo } from "react";
import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";

import { AreaTrend, SoftNumber } from "./bits";
import {
  DirectoriesCard,
  MomentumCard,
  RhythmBar,
  RhythmCard,
  StacksCard,
} from "./context-cards";
import { MeadowReport } from "./report";
import {
  dailyActivity,
  stackDistribution,
  touchedWithinDays,
} from "@/lib/scan-metrics";
import { ageMs } from "@/lib/format";
import { useReport } from "@/widgets/contexts/report-context";
import type { ReportStatus } from "@/widgets/contexts/report-context";
import { useWorkspace } from "@/widgets/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

/** Fill-box wrapper every rung renders through. */
function Fill({ children }: { children: ReactNode }) {
  return (
    <div className="h-full w-full min-h-0 min-w-0 overflow-hidden">
      {children}
    </div>
  );
}

/** The workspace momentum derivation, shared by the momentum rungs. */
function useMomentum() {
  const workspace = useWorkspace();
  const activity = useMemo(
    () => dailyActivity(workspace.projects, 28, workspace.now),
    [workspace.projects, workspace.now],
  );
  const touched = useMemo(
    () => touchedWithinDays(workspace.projects, 7, workspace.now),
    [workspace.projects, workspace.now],
  );
  const total = activity.reduce((sum, v) => sum + v, 0);
  return { activity, touched, total };
}

// --- Workspace report ---------------------------------------------------------

const STATE_RUNG: Record<ReportStatus, { word: string; color: string }> = {
  "no-scope": { word: "no scope", color: "var(--muted-foreground)" },
  loading: { word: "reading…", color: "var(--muted-foreground)" },
  missing: { word: "no report", color: "var(--muted-foreground)" },
  running: { word: "running…", color: "var(--recency-fresh)" },
  stale: { word: "stale", color: "var(--sev-warning)" },
  fresh: { word: "fresh", color: "var(--recency-fresh)" },
};

/** Small-rung report state: the machine's status word, honest at a glance. */
function ReportStateRung({ withAge }: { withAge?: boolean }) {
  const report = useReport();
  const state = STATE_RUNG[report.status];
  return (
    <div className="flex h-full w-full min-w-0 flex-col justify-center gap-1 overflow-hidden px-1">
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <FlaskConical aria-hidden className="size-3.5 shrink-0" />
        Report
        <span
          className="meadow-focus rounded-full font-semibold"
          style={{ color: state.color }}
        >
          {state.word}
        </span>
      </p>
      {withAge && report.generatedAt !== null ? (
        <p className="text-[10px] text-muted-foreground">
          generated {ageMs(report.generatedAt)} ago
        </p>
      ) : null}
    </div>
  );
}

/** 2x2 rung: the report's headline totals, no charts. */
function ReportNumeralsRung() {
  const report = useReport();
  const view = report.view;
  return (
    <div className="flex h-full w-full min-w-0 flex-col justify-center gap-1 overflow-hidden px-1">
      {view !== null ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="text-[11px] text-muted-foreground">
            <SoftNumber
              value={view.totals.commits.toLocaleString()}
              className="text-sm font-semibold tabular-nums text-foreground"
            />{" "}
            commits
          </span>
          <span className="text-[11px] text-muted-foreground">
            <SoftNumber
              value={view.totals.contributors}
              className="text-sm font-semibold tabular-nums text-foreground"
            />{" "}
            people
          </span>
          <span className="text-[11px] text-muted-foreground">
            <SoftNumber
              value={view.totals.repositories}
              className="text-sm font-semibold tabular-nums text-foreground"
            />{" "}
            repos
          </span>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          {report.status === "loading"
            ? "Reading the report…"
            : "No report yet — generate one to see totals."}
        </p>
      )}
    </div>
  );
}

/** The tabbed snitch report as its own widget. The full presentation is
 * report.tsx's `MeadowReport` — band placements and everything from 2x3 up.
 * The heading follows the page's report scope: the dashboard's scan scope
 * reads "Workspace report", a project page's repo scope reads "Project
 * report" (the same kind is a rail card there). */
export function MeadowReportDigest({ size }: RegisteredWidgetProps) {
  const kind = useReport().scope.kind;
  const title = kind === "repo" ? "Project report" : "Workspace report";
  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
      sizes={{
        "1x1": <ReportStateRung />,
        "2x1": <ReportStateRung withAge />,
        "2x2": <ReportNumeralsRung />,
        "2x3": (
          <Fill>
            <MeadowReport title={title} />
          </Fill>
        ),
      }}
    >
      <Fill>
        <MeadowReport title={title} />
      </Fill>
    </WidgetShell>
  );
}

// --- Momentum -------------------------------------------------------------------

/** Small-rung momentum readout (non-chart). */
function MomentumRung({ withTrend }: { withTrend?: boolean }) {
  const { activity, touched, total } = useMomentum();
  return (
    <div className="flex h-full w-full min-w-0 flex-col justify-center gap-1 overflow-hidden px-1">
      <p className="flex items-baseline gap-2">
        <SoftNumber
          value={touched}
          className="text-xl leading-none font-semibold tracking-tight text-foreground"
        />
        <span className="text-[11px] text-muted-foreground">
          touched this week
        </span>
      </p>
      {withTrend ? (
        <AreaTrend
          values={activity}
          label={`Projects touched per day over the last four weeks, ${total} total`}
        />
      ) : null}
    </div>
  );
}

/** The momentum digest as its own widget: full card from 2x2 up. */
export function MeadowMomentumDigest({ size }: RegisteredWidgetProps) {
  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
      sizes={{
        "1x1": <MomentumRung />,
        "2x1": <MomentumRung withTrend />,
        "2x2": (
          <Fill>
            <MomentumCard />
          </Fill>
        ),
      }}
    >
      <Fill>
        <MomentumCard />
      </Fill>
    </WidgetShell>
  );
}

// --- Rhythm -----------------------------------------------------------------------

/** The rhythm digest as its own widget: the ratio bar alone at 1x1, the full
 * card from 2x1 up. */
export function MeadowRhythmDigest({ size }: RegisteredWidgetProps) {
  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
      sizes={{
        "1x1": (
          <div className="flex h-full w-full min-w-0 items-center px-1">
            <RhythmBar />
          </div>
        ),
        "2x1": (
          <Fill>
            <RhythmCard />
          </Fill>
        ),
      }}
    >
      <Fill>
        <RhythmCard />
      </Fill>
    </WidgetShell>
  );
}

// --- Stacks -------------------------------------------------------------------------

/** Small-rung stacks readout: how many distinct stacks the workspace runs. */
function StacksRung() {
  const workspace = useWorkspace();
  const count = useMemo(
    () =>
      stackDistribution(
        workspace.projects,
        Number.MAX_SAFE_INTEGER,
      ).length,
    [workspace.projects],
  );
  return (
    <div className="flex h-full w-full min-w-0 flex-col justify-center gap-1 overflow-hidden px-1">
      <p className="flex items-baseline gap-2">
        <SoftNumber
          value={count}
          className="text-xl leading-none font-semibold tracking-tight text-foreground"
        />
        <span className="text-[11px] text-muted-foreground">
          {count === 1 ? "stack" : "stacks"}
        </span>
      </p>
    </div>
  );
}

/** The stacks digest as its own widget: the chip row card from 2x1 up. */
export function MeadowStacksDigest({ size }: RegisteredWidgetProps) {
  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
      sizes={{
        "1x1": <StacksRung />,
        "2x1": (
          <Fill>
            <StacksCard />
          </Fill>
        ),
      }}
    >
      <Fill>
        <StacksCard />
      </Fill>
    </WidgetShell>
  );
}

// --- Directories ----------------------------------------------------------------------

/** Small-rung directories readout: how many roots the workspace watches. */
function DirectoriesRung() {
  const workspace = useWorkspace();
  const count = workspace.roots.data?.length ?? 0;
  return (
    <div className="flex h-full w-full min-w-0 flex-col justify-center gap-1 overflow-hidden px-1">
      <p className="flex items-baseline gap-2">
        <SoftNumber
          value={count}
          className="text-xl leading-none font-semibold tracking-tight text-foreground"
        />
        <span className="text-[11px] text-muted-foreground">
          {count === 1 ? "directory" : "directories"}
        </span>
      </p>
    </div>
  );
}

/** The directories digest as its own widget: the root list card from 2x1 up. */
export function MeadowDirectoriesDigest({ size }: RegisteredWidgetProps) {
  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
      sizes={{
        "1x1": <DirectoriesRung />,
        "2x1": (
          <Fill>
            <DirectoriesCard />
          </Fill>
        ),
      }}
    >
      <Fill>
        <DirectoriesCard />
      </Fill>
    </WidgetShell>
  );
}
