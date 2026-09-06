/**
 * Meadow project sections (T3-meadow) — port of the design project route's
 * soft tabbed body (`routes/designs/meadow/project.$.tsx`): seven tabs —
 * OVERVIEW / ACTIVITY / CODE / AI / FILES / ARTIFACTS / IDEATION — composed
 * from the system's parts: the git panel over the git/ parts, last commit,
 * the note-editor, the cadence area (ui Chart, full rung only), commit
 * history (commits-list), language bars + alert cards, the subsidized-AI
 * band, files/artifacts via the list/ parts, and the shared IdeationPanel.
 * Report-driven panes gate through ReportGate; charts render only at the
 * authored full rung (≥ 200×160 guaranteed).
 *
 * The section strip renders the runtime `WidgetTabs` in its documented
 * in-content placement (not the shell `tabs` slot, whose single row is a
 * horizontal scroller): with `flex-wrap` the seven pills wrap at compact
 * widths instead of inner-scrolling and stay one row once they fit on
 * desktop.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { AnimatedNumber } from "@workspace-welcome/ui/components/animated-number";
import { Chart, MIN_CONTENT as CHART_MIN } from "@workspace-welcome/ui/components/chart";
import { HBars } from "@workspace-welcome/ui/components/h-bars";
import { SegBar } from "@workspace-welcome/ui/components/seg-bar";

import { IdeationPanel } from "@/components/ideation/ideation-panel";
import { absoluteDate, formatCost, formatTokens, relativeTime } from "@/lib/format";
import { useProject } from "@/widgets/contexts/project-context";
import { useReport } from "@/widgets/contexts/report-context";
import {
  ArtifactsList,
  BranchSwitcher,
  CommitsList,
  FilesList,
  GitActionsToolbar,
  NoteEditor,
  ReportGate,
} from "@/widgets/parts";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell, WidgetTabs } from "@/widgets/runtime/widget-shell";

type ReportView = NonNullable<ReturnType<typeof useReport>["view"]>;
type ReportAlert = ReportView["alerts"][number];

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "activity", label: "Activity" },
  { id: "code", label: "Code" },
  { id: "ai", label: "AI" },
  { id: "files", label: "Files" },
  { id: "artifacts", label: "Artifacts" },
  { id: "ideation", label: "Ideation" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function toSection(id: string): SectionId {
  return SECTIONS.find((s) => s.id === id)?.id ?? "overview";
}

const SEVERITY_COLOR: Record<ReportAlert["severity"], string> = {
  critical: "var(--sev-critical)",
  warning: "var(--sev-warning)",
  info: "var(--sev-info)",
};

function PaneTitle({ children }: { children: string }) {
  return (
    <h3 className="shrink-0 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

function VitalRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

/** Git vitals over the git/ parts — the design's OVERVIEW left column. */
function GitPanel() {
  const project = useProject();
  const git = project.project?.git;
  if (git === undefined) return null;
  return (
    <section
      aria-label="Git state"
      data-slot="meadow-card"
      className="flex min-h-0 min-w-0 flex-col gap-2.5 overflow-hidden p-3.5"
    >
      <div className="flex min-h-6 items-center justify-between gap-2">
        <PaneTitle>Git</PaneTitle>
        {git.isRepo && git.remote ? <GitActionsToolbar /> : null}
      </div>
      {!git.isRepo ? (
        <p className="text-xs text-muted-foreground">Not a git repository.</p>
      ) : (
        <div className="flex flex-1 flex-col justify-between gap-2 text-xs">
          <VitalRow label="Branch">
            <BranchSwitcher />
          </VitalRow>
          <VitalRow label="Remote">
            {git.remote ? (
              <a
                href={git.remote.links.web}
                target="_blank"
                rel="noreferrer"
                className="meadow-focus inline-flex items-center gap-1 rounded-full hover:underline"
                style={{ color: "var(--primary)" }}
              >
                {git.remote.slug ?? git.remote.host}
              </a>
            ) : (
              <span className="text-muted-foreground">none</span>
            )}
          </VitalRow>
          <VitalRow label="Ahead / behind">
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex items-center gap-1" style={{ color: "var(--recency-fresh)" }}>
                <ArrowUp className="size-3" aria-hidden />
                {git.ahead ?? 0}
              </span>
              <span className="inline-flex items-center gap-1" style={{ color: "var(--sev-warning)" }}>
                <ArrowDown className="size-3" aria-hidden />
                {git.behind ?? 0}
              </span>
            </span>
          </VitalRow>
          <VitalRow label="Dirty files">{git.dirtyCount ?? 0}</VitalRow>
          <VitalRow label="Created">{absoluteDate(project.project?.createdAt ?? null)}</VitalRow>
          {project.git.diverged ? (
            <p className="text-xs" style={{ color: "var(--sev-critical)" }}>
              Diverged from upstream — a fast-forward pull isn&rsquo;t possible.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

/** Last commit + the "where I left off" note — the OVERVIEW right column. */
function NotePanel() {
  const git = useProject().project?.git;
  const last = git?.lastCommit ?? null;
  return (
    <section
      aria-label="Where I left off"
      data-slot="meadow-card"
      className="flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden p-3.5"
    >
      <PaneTitle>Last commit</PaneTitle>
      {last ? (
        <div className="flex shrink-0 flex-col gap-1">
          <p className="line-clamp-3 text-xs leading-relaxed text-foreground">{last.message}</p>
          <span className="font-mono text-[0.7rem] text-muted-foreground">
            {last.author} · {relativeTime(last.date)}
          </span>
        </div>
      ) : (
        <p className="shrink-0 text-xs text-muted-foreground">
          {git?.isRepo ? "No commits yet." : "No git data."}
        </p>
      )}
      <div className="min-h-0 flex-1">
        <NoteEditor rows={4} className="h-full" placeholder="What were you doing? What's next?" />
      </div>
    </section>
  );
}

function OverviewPane() {
  return (
    <div className="grid h-full min-h-0 w-full gap-3 lg:grid-cols-2">
      <GitPanel />
      <NotePanel />
    </div>
  );
}

function ActivityPane() {
  const view = useReport().view;
  return (
    <div className="grid h-full min-h-0 w-full gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <ReportGate mode="banner" className="flex min-h-0 flex-col">
        {view !== null ? (
          <section
            aria-label="Commit cadence"
            data-slot="meadow-card"
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden p-3.5"
          >
            <PaneTitle>Commit cadence</PaneTitle>
            {view.cadence.length === 0 ? (
              <p className="text-xs text-muted-foreground">No dated commits to chart.</p>
            ) : (
              <div className="min-h-0 min-w-0 flex-1" style={{ minHeight: CHART_MIN.h, minWidth: CHART_MIN.w }}>
                <Chart
                  variant="area"
                  dots
                  maxPoints={12}
                  color="var(--recency-fresh)"
                  points={view.cadence.map((point) => ({ label: point.period, value: point.commits }))}
                  ariaLabel={`${view.totals.commits.toLocaleString()} commits per period`}
                  className="h-full min-h-40 w-full"
                />
              </div>
            )}
          </section>
        ) : null}
      </ReportGate>
      <section
        aria-label="History"
        data-slot="meadow-card"
        className="flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden p-3.5"
      >
        <PaneTitle>History</PaneTitle>
        <CommitsList className="min-h-0 flex-1" />
      </section>
    </div>
  );
}

/** Alert cards carrying their full summaries — the design's CODE right column. */
function AlertCards({ alerts }: { alerts: readonly ReportAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div
        data-slot="meadow-card"
        className="flex min-h-0 flex-1 items-center justify-center p-3.5 text-xs text-muted-foreground"
      >
        All clear — no health alerts in this report.
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
      {alerts.map((a) => (
        <article
          key={`${a.label}-${a.value}`}
          data-slot="meadow-card"
          className="flex shrink-0 flex-col gap-1.5 p-3"
          style={{
            borderColor: `color-mix(in oklch, ${SEVERITY_COLOR[a.severity]} 30%, var(--border))`,
          }}
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: SEVERITY_COLOR[a.severity] }}
            />
            <h4 className="text-xs font-semibold tracking-tight text-foreground">{a.label}</h4>
            <span
              className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
              style={{
                color: SEVERITY_COLOR[a.severity],
                background: `color-mix(in oklch, ${SEVERITY_COLOR[a.severity]} 10%, transparent)`,
              }}
            >
              {a.value}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{a.summary}</p>
        </article>
      ))}
    </div>
  );
}

function CodePane() {
  const view = useReport().view;
  return (
    <div className="grid h-full min-h-0 w-full gap-3 lg:grid-cols-2">
      <ReportGate mode="banner" className="flex min-h-0 flex-col">
        {view !== null ? (
          <section
            aria-label="Language mix"
            data-slot="meadow-card"
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden p-3.5"
          >
            <PaneTitle>Language mix</PaneTitle>
            {view.languageRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">No language data in this report.</p>
            ) : (
              <HBars
                ariaLabel="Lines of code by language"
                rows={view.languageRows.slice(0, 6).map((l) => ({
                  label: l.language,
                  value: l.lines,
                  display: `${formatTokens(l.lines)} ln · ${l.files} files`,
                }))}
              />
            )}
          </section>
        ) : null}
      </ReportGate>
      <ReportGate mode="banner" className="flex min-h-0 flex-col">
        {view !== null ? <PaneTitle>Health alerts</PaneTitle> : null}
        {view !== null ? <AlertCards alerts={view.alerts.slice(0, 6)} /> : null}
      </ReportGate>
    </div>
  );
}

function AiPane() {
  const view = useReport().view;
  return (
    <ReportGate mode="banner" className="flex min-h-0 flex-1 flex-col">
      {view === null ? null : view.aiUsage === null ? (
        <div
          data-slot="meadow-card"
          className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground"
        >
          No AI usage recorded for this project in the current report.
        </div>
      ) : (
        <section
          aria-label="AI usage"
          data-slot="meadow-card"
          className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-4 overflow-hidden p-4"
          style={{ background: "color-mix(in oklch, var(--pinned-accent) 4%, var(--card))" }}
        >
          <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
            <div className="flex flex-col">
              <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                Subsidized cost (recorded)
              </span>
              <AnimatedNumber
                value={formatCost(view.aiUsage.cost)}
                className="text-4xl leading-tight font-semibold tracking-tight"
                style={{ color: "var(--pinned-accent)" }}
              />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                Tokens total
              </span>
              <span className="text-xl leading-tight font-semibold tabular-nums text-foreground">
                {formatTokens(view.aiUsage.tokens.total)}
              </span>
            </div>
            <div className="ml-auto flex w-full max-w-xs flex-col gap-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>in {formatTokens(view.aiUsage.tokens.input)}</span>
                <span>out {formatTokens(view.aiUsage.tokens.output)}</span>
              </div>
              <SegBar
                height={10}
                ariaLabel="Input vs output token ratio"
                segments={[
                  { value: view.aiUsage.tokens.input, color: "var(--recency-fresh)", label: "input tokens" },
                  { value: view.aiUsage.tokens.output, color: "var(--sev-info)", label: "output tokens" },
                ]}
              />
            </div>
          </div>
        </section>
      )}
    </ReportGate>
  );
}

function SectionsFull({ tab }: { tab: SectionId }) {
  const project = useProject();
  if (project.project === null) {
    return (
      <p className="px-3 py-6 text-xs text-muted-foreground">
        <span className="break-all font-mono">{project.path}</span> isn&rsquo;t in the current scan
        — it may have been moved, hidden or deleted.
      </p>
    );
  }
  return (
    <div className="h-full min-h-0 w-full">
      {tab === "overview" ? <OverviewPane /> : null}
      {tab === "activity" ? <ActivityPane /> : null}
      {tab === "code" ? <CodePane /> : null}
      {tab === "ai" ? <AiPane /> : null}
      {tab === "files" ? <FilesList height="100%" className="min-h-0 flex-1" /> : null}
      {tab === "artifacts" ? <ArtifactsList className="min-h-0 flex-1" /> : null}
      {tab === "ideation" ? <IdeationPanel key={project.path} project={project.path} /> : null}
    </div>
  );
}

/** Compact rung: the git vitals line + the note, honest and editable. */
function SectionsCompact() {
  const git = useProject().project?.git;
  return (
    <div className="flex h-full w-full min-w-0 flex-col justify-center gap-1.5 overflow-hidden px-1">
      <p className="truncate font-mono text-xs text-foreground">{git?.branch ?? "—"}</p>
      <p className="text-[11px] text-muted-foreground">
        ↑ {git?.ahead ?? 0} · ↓ {git?.behind ?? 0} · {git?.dirtyCount ?? 0} dirty
      </p>
      <NoteEditor rows={2} />
    </div>
  );
}

export function MeadowProjectSections({ size }: RegisteredWidgetProps) {
  const [tab, setTab] = useState<SectionId>("overview");
  const branch = useProject().project?.git.branch ?? "—";
  /** Wrapped strip + pane for every rung: `flex-wrap` lets the seven pills
   * reflow at compact widths (no inner scroll) while desktop stays one row;
   * `overflow-x-visible` overrides the base strip's scroller. */
  const withTabs = (pane: ReactNode) => (
    <div className="flex h-full min-h-0 w-full flex-col">
      <WidgetTabs
        tabs={SECTIONS}
        activeTab={tab}
        onTabChange={(id) => setTab(toSection(id))}
        className="flex-wrap overflow-x-visible pt-1"
      />
      <div className="min-h-0 flex-1">{pane}</div>
    </div>
  );
  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
      sizes={{
        "1x1": withTabs(
          <div className="flex h-full w-full min-w-0 items-center overflow-hidden px-1">
            <span className="truncate font-mono text-xs">{branch}</span>
          </div>,
        ),
        "2x2": withTabs(<SectionsCompact />),
        "12x6": withTabs(<SectionsFull tab={tab} />),
      }}
    >
      {withTabs(<SectionsFull tab={tab} />)}
    </WidgetShell>
  );
}
