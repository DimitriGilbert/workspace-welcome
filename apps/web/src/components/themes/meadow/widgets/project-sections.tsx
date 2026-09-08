/**
 * Meadow project sections, ported from the design project route's soft
 * tabbed body (`routes/designs/meadow/project.$.tsx`) + the report-section
 * building blocks into the theme namespace (owner correction: theme widgets
 * carry the prototype's presentation): seven pill tabs with icons —
 * OVERVIEW / ACTIVITY / CODE / AI / FILES / ARTIFACTS / IDEATION — composing
 * the git panel, the tabbed report widget, the cadence area, the language
 * donut + bars, the alert cards, the subsidized-AI band, the project-scoped
 * momentum digest, and the note. Data rides the project + report providers
 * and the system's list/form parts (branch switcher, git toolbar, commits,
 * files, artifacts, ideation).
 *
 * The section strip keeps the landed 390px fix: `flex-wrap` lets the seven
 * pills reflow at compact widths instead of inner-scrolling, and stays one
 * row once they fit on desktop.
 *
 * First-class widget framing (owner bento order): the shell header shows —
 * title + titlebar meta (branch, report age) — so the body reads as one
 * chrome-framed canvas widget, not a free page; the old in-content footer
 * ("meadow view" / all-concepts link) is gone, its metadata living in the
 * titlebar slot. The theme's custom.css un-hides this kind's header only.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  BrainCircuit,
  ExternalLink,
  FileText,
  FolderOpen,
  History,
  Images,
  LayoutDashboard,
  Lightbulb,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Donut, HBars, RatioBar, CadenceArea, SLICE_COLORS } from "./bits";
import { ProjectMomentumCard } from "./context-cards";
import { MeadowReport } from "./report";
import { Button } from "@workspace-welcome/ui/components/button";

import { IdeationPanel } from "@/components/ideation/ideation-panel";
import { absoluteDate, ageMs, formatCost, formatTokens, relativeTime } from "@/lib/format";
import { hostLabel } from "@/lib/icons";
import { useProject } from "@/lib/contexts/project-context";
import { useReport } from "@/lib/contexts/report-context";
import {
  ArtifactsList,
  BranchSwitcher,
  CommitsList,
  FilesList,
  GitActionsToolbar,
  NoteEditor,
} from "@/components/parts";
import type { RegisteredWidgetProps } from "@/components/widgets/registry";
import { WidgetShell } from "@/components/widgets/widget-shell";
import type { ReportAlertRow } from "@/lib/report-view";

type PageTab =
  | "overview"
  | "activity"
  | "code"
  | "ai"
  | "files"
  | "artifacts"
  | "ideation";

const TABS: { id: PageTab; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "activity", label: "Activity", icon: History },
  { id: "code", label: "Code", icon: FileText },
  { id: "ai", label: "AI", icon: BrainCircuit },
  { id: "files", label: "Files", icon: FolderOpen },
  { id: "artifacts", label: "Artifacts", icon: Images },
  { id: "ideation", label: "Ideation", icon: Lightbulb },
];

const SEVERITY_COLOR: Record<ReportAlertRow["severity"], string> = {
  critical: "var(--sev-critical)",
  warning: "var(--sev-warning)",
  info: "var(--sev-info)",
};

function VitalRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

/** The design's OVERVIEW left column: git vitals over the git/ parts. */
function GitPanel() {
  const project = useProject();
  const p = project.project;
  const git = p?.git;
  if (p === null || git === undefined) return null;
  const diverged = (git.ahead ?? 0) > 0 && (git.behind ?? 0) > 0;
  return (
    <section
      aria-label="Git state"
      className="meadow-panel flex flex-col gap-2.5 p-4"
    >
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Git
        </h2>
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
                {hostLabel(git.remote.host)} · {git.remote.slug}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : (
              <span className="text-muted-foreground">none</span>
            )}
          </VitalRow>
          <VitalRow label="Ahead / behind">
            <span className="inline-flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1"
                style={{ color: "var(--recency-fresh)" }}
              >
                <ArrowUp className="size-3" aria-hidden />
                {git.ahead ?? 0}
              </span>
              <span
                className="inline-flex items-center gap-1"
                style={{ color: "var(--sev-warning)" }}
              >
                <ArrowDown className="size-3" aria-hidden />
                {git.behind ?? 0}
              </span>
            </span>
          </VitalRow>
          <VitalRow label="Dirty files">{git.dirtyCount ?? 0}</VitalRow>
          <VitalRow label="Created">{absoluteDate(p.createdAt)}</VitalRow>
          {diverged ? (
            <p className="text-xs" style={{ color: "var(--sev-critical)" }}>
              Diverged from upstream — a fast-forward pull isn&rsquo;t
              possible. Reconcile the branches from a terminal.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

/** The design's OVERVIEW bottom row: last commit + the note. */
function LastCommitAndNote() {
  const git = useProject().project?.git;
  const last = git?.lastCommit ?? null;
  return (
    <>
      <section
        aria-label="Last commit"
        className="meadow-panel flex flex-col gap-2 p-4"
      >
        <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Last commit
        </h2>
        {last ? (
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-1.5">
            <p className="line-clamp-3 text-xs leading-relaxed text-foreground">
              {last.message}
            </p>
            <span className="font-mono text-[0.7rem] text-muted-foreground">
              {last.author} · {relativeTime(last.date)}
            </span>
            {git?.remote ? (
              <div className="flex flex-wrap gap-1 pt-1">
                <Button
                  size="xs"
                  variant="outline"
                  render={
                    <a
                      href={git.remote.links.issues}
                      target="_blank"
                      rel="noreferrer"
                    />
                  }
                >
                  Issues
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  render={
                    <a
                      href={git.remote.links.pulls}
                      target="_blank"
                      rel="noreferrer"
                    />
                  }
                >
                  Pull requests
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {git?.isRepo ? "No commits yet." : "No git data."}
          </p>
        )}
      </section>
      <section
        aria-label="Note"
        className="meadow-panel flex flex-col gap-2 p-4"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Where I left off
          </h2>
          <span className="text-[10px] text-muted-foreground/70">
            saved when you click away
          </span>
        </div>
        <NoteEditor
          rows={4}
          placeholder="What were you doing? What's next?"
          className="flex-1 [&>span:first-child]:hidden [&_textarea]:resize-y [&_textarea]:rounded-2xl [&_textarea]:border-border/70 [&_textarea]:bg-card/60 [&_textarea]:font-sans"
        />
      </section>
    </>
  );
}

function OverviewPane() {
  return (
    <>
      {/* The overview's two bands split the bento body 3:2 (min-h-0 so the
          cadence svg's aspect-derived intrinsic height can't bloat the row
          and starve the last-commit/note band — the charts shrink to the
          band instead). */}
      <div className="grid w-full min-h-0 flex-[3] gap-3 lg:grid-cols-2">
        <GitPanel />
        <MeadowReport title="Project report" />
      </div>
      <div className="grid w-full min-h-0 flex-[2] gap-3 lg:grid-cols-2">
        <LastCommitAndNote />
      </div>
    </>
  );
}

function ActivityPane() {
  const view = useReport().view;
  return (
    // The desktop band is ONE bounded row (minmax(0,1fr)): content-sized rows
    // would let the history table's min-content stretch the pane past the
    // bento and clip the momentum card under the cadence chart (fill law).
    <div className="grid w-full min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]">
      {/* Both columns fill the taller bento (fill law): the cadence panel
          flexes over the momentum card, the history panel stretches with the
          grid row and its list distributes the body. */}
      <div className="flex min-h-0 flex-col gap-3">
        <section
          aria-label="Commit cadence"
          className="meadow-panel flex min-h-0 flex-1 flex-col gap-2 p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Commit cadence
            </h2>
            {view !== null ? (
              <span className="ml-auto flex items-baseline gap-1.5 text-[11px] text-muted-foreground">
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {view.totals.commits.toLocaleString()}
                </span>
                commits ·
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {view.totals.contributors}
                </span>
                {view.totals.contributors === 1 ? "contributor" : "contributors"}
              </span>
            ) : null}
          </div>
          {view === null || view.cadence.length === 0 ? (
            <p className="flex flex-1 items-center justify-center py-6 text-xs text-muted-foreground">
              No dated commits to chart.
            </p>
          ) : (
            <CadenceArea
              data={view.cadence}
              className="min-h-40 flex-1"
              label={`${view.export.targetPath}: commits per period`}
            />
          )}
        </section>
        {/* ContextCard is an h-full fill box — unwrapped it would claim the
            whole column and collapse the cadence chart to its header; in an
            auto-height wrapper it keeps its natural card height and the
            cadence panel flexes over the rest. */}
        <div className="shrink-0">
          <ProjectMomentumCard />
        </div>
      </div>
      <section
        aria-label="History"
        className="meadow-panel flex min-h-0 flex-col gap-2 overflow-hidden p-4"
      >
        <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          History
        </h2>
        <CommitsList className="min-h-0 flex-1" />
      </section>
    </div>
  );
}

/** Alert cards carrying their full summaries — the CODE right column. Cards
 * distribute the column so the list fills its box (fill law) instead of
 * drifting to the top and leaving a void under the last card. */
function AlertCards({ alerts }: { alerts: readonly ReportAlertRow[] }) {
  if (alerts.length === 0) {
    return (
      <div className="meadow-panel flex flex-1 items-center justify-center p-6 text-xs text-muted-foreground">
        All clear — no health alerts in this report.
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {alerts.map((a) => (
        <article
          key={`${a.label}-${a.value}`}
          className="meadow-panel flex min-h-0 flex-1 flex-col justify-center gap-1.5 p-3.5"
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
            <h4 className="text-xs font-semibold tracking-tight text-foreground">
              {a.label}
            </h4>
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
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {a.summary}
          </p>
        </article>
      ))}
    </div>
  );
}

function CodePane() {
  const view = useReport().view;
  const languages = view?.languageRows ?? [];
  const top = languages.slice(0, 5);
  const restLines = languages.slice(5).reduce((sum, l) => sum + l.lines, 0);
  const slices = [
    ...top.map((l, i) => ({
      label: l.language,
      value: l.lines,
      color: SLICE_COLORS[i] ?? "var(--muted)",
    })),
    ...(restLines > 0
      ? [
          {
            label: "Other",
            value: restLines,
            color:
              "color-mix(in oklch, var(--muted-foreground) 35%, var(--muted))",
          },
        ]
      : []),
  ];
  const totalLines = languages.reduce((sum, l) => sum + l.lines, 0);

  return (
    <div className="grid w-full min-h-0 flex-1 gap-3 xl:grid-cols-2">
      <section
        aria-label="Language distribution"
        className="meadow-panel flex min-h-0 flex-col gap-3 p-4"
      >
        <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Language mix
        </h2>
        {languages.length === 0 ? (
          <p className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            No language data in this report.
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4 sm:flex-row sm:items-stretch">
            <div className="mx-auto aspect-square w-full max-w-56 shrink-0 sm:h-full sm:max-h-72 sm:w-auto sm:max-w-none">
              <Donut
                fill
                slices={slices}
                centerValue={formatTokens(totalLines)}
                centerLabel="lines"
                label="Language share by lines of code"
              />
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center self-center [&>ul]:flex-1 [&>ul>li]:flex-1 [&>ul>li]:justify-center">
              <HBars
                data={languages.slice(0, 6).map((l) => ({
                  label: l.language,
                  value: l.lines,
                  display: `${formatTokens(l.lines)} ln · ${l.files} files`,
                }))}
                label="Lines of code by language"
              />
            </div>
          </div>
        )}
      </section>
      <section
        aria-label="Health alerts"
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            aria-hidden
            className="flex size-6 items-center justify-center rounded-full"
            style={{
              color: "var(--pinned-accent)",
              background:
                "color-mix(in oklch, var(--pinned-accent) 11%, transparent)",
            }}
          >
            <BadgeCheck className="size-3" />
          </span>
          <h3 className="text-[13px] font-semibold tracking-tight text-foreground">
            Health alerts
          </h3>
        </div>
        {view !== null ? <AlertCards alerts={view.alerts.slice(0, 6)} /> : null}
      </section>
    </div>
  );
}

function AiPane() {
  const view = useReport().view;
  if (view === null) return null;
  return view.aiUsage === null ? (
    <div className="meadow-panel flex h-full min-h-0 w-full items-center justify-center p-6 text-sm text-muted-foreground">
      No AI usage recorded for this project in the current report.
    </div>
  ) : (
    <section
      aria-label="AI usage"
      className="meadow-panel flex h-full min-h-0 w-full flex-col justify-evenly gap-6 p-6"
      style={{
        background: "color-mix(in oklch, var(--pinned-accent) 4%, var(--card))",
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          aria-hidden
          className="flex size-6 items-center justify-center rounded-full"
          style={{
            color: "var(--pinned-accent)",
            background:
              "color-mix(in oklch, var(--pinned-accent) 11%, transparent)",
          }}
        >
          <BrainCircuit className="size-3" />
        </span>
        <h3 className="text-[13px] font-semibold tracking-tight text-foreground">
          AI usage
        </h3>
      </div>
      <div className="flex w-full flex-wrap items-end justify-between gap-x-12 gap-y-4">
        <div className="flex flex-col">
          <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Subsidized cost (recorded)
          </span>
          <span
            className="text-[clamp(2.5rem,5cqi,4.5rem)] leading-tight font-semibold tracking-tight"
            style={{ color: "var(--pinned-accent)" }}
          >
            {formatCost(view.aiUsage.cost)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Tokens total
          </span>
          <span className="text-[clamp(1.4rem,2.5cqi,2.1rem)] leading-tight font-semibold tabular-nums text-foreground">
            {formatTokens(view.aiUsage.tokens.total)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Records
          </span>
          <span className="text-[clamp(1.4rem,2.5cqi,2.1rem)] leading-tight font-semibold tabular-nums text-foreground">
            {view.aiUsage.records.toLocaleString()}
          </span>
        </div>
        <div className="ml-auto flex w-full max-w-sm flex-col gap-1.5">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>in {formatTokens(view.aiUsage.tokens.input)}</span>
            <span>out {formatTokens(view.aiUsage.tokens.output)}</span>
          </div>
          <RatioBar
            a={view.aiUsage.tokens.input}
            b={view.aiUsage.tokens.output}
            colorA="var(--pinned-accent)"
            label="Input vs output token ratio"
          />
          <p className="text-[10px] text-muted-foreground">
            What the plans subsidize: the recorded spend against{" "}
            {view.aiUsage.records.toLocaleString()} tracked model calls.
          </p>
        </div>
      </div>
    </section>
  );
}

function SectionsFull({ tab }: { tab: PageTab }) {
  const project = useProject();
  if (project.project === null) {
    return (
      <p className="px-3 py-6 text-xs text-muted-foreground">
        <span className="break-all font-mono">{project.path}</span> isn&rsquo;t
        in the current scan — it may have been moved, hidden or deleted.
      </p>
    );
  }
  return (
    <div className="flex h-full w-full min-h-0 min-w-0 flex-1 flex-col gap-3">
      {tab === "overview" ? <OverviewPane /> : null}
      {tab === "activity" ? <ActivityPane /> : null}
      {tab === "code" ? <CodePane /> : null}
      {tab === "ai" ? <AiPane /> : null}
      {tab === "files" ? (
        <FilesList height="100%" className="meadow-files-fill min-h-0 flex-1" />
      ) : null}
      {tab === "artifacts" ? (
        <div className="flex min-h-0 w-full flex-1 flex-col">
          <ArtifactsList className="meadow-artifacts-fill min-h-0 flex-1" />
        </div>
      ) : null}
      {tab === "ideation" ? (
        <div className="flex min-h-0 w-full flex-1 flex-col">
          <IdeationPanel key={project.path} project={project.path} />
        </div>
      ) : null}
    </div>
  );
}

export function MeadowProjectSections({ size }: RegisteredWidgetProps) {
  const [tab, setTab] = useState<PageTab>("overview");
  const project = useProject();
  const branch = project.project?.git.branch ?? "—";
  const { generatedAt } = useReport();
  const compact = size.cols <= 1 && size.rows <= 1;

  /** Titlebar meta (sizing law: metadata lives in the shell's meta slot):
   * the branch plus the report's age, silent until there is a report. */
  const meta = (
    <span className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
      <span className="truncate font-mono">{branch}</span>
      {generatedAt !== null ? (
        <span className="shrink-0">· report {ageMs(generatedAt)} ago</span>
      ) : null}
    </span>
  );

  /** The design's pill tab strip (icons + meadow-tab-active register), with
   * the landed 390px fix: `flex-wrap` reflows the seven pills at compact
   * widths instead of inner-scrolling. */
  const tabStrip = (
    <div
      role="tablist"
      aria-label="Project sections"
      className="flex flex-wrap items-center gap-1"
    >
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          onClick={() => setTab(t.id)}
          className={`meadow-focus inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
            tab === t.id
              ? "meadow-tab-active"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          <t.icon aria-hidden className="size-3.5" />
          {t.label}
        </button>
      ))}
    </div>
  );

  const withTabs = (pane: ReactNode) => (
    <div className="flex h-full min-h-0 w-full flex-col gap-3">
      {tabStrip}
      <div role="tabpanel" className="flex min-h-0 flex-1 flex-col">
        {pane}
      </div>
    </div>
  );

  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
      title={compact ? undefined : "Project sections"}
      meta={compact ? undefined : meta}
      chrome="px-1"
      sizes={{
        "1x1": (
          <div className="flex h-full w-full min-w-0 items-center overflow-hidden px-1">
            <span className="truncate font-mono text-xs">{branch}</span>
          </div>
        ),
        // Every placement above 1x1 renders the ONE tabbed body — the pill
        // strip wraps (the landed 390px fix) and panes reflow to the width.
        "2x2": withTabs(<SectionsFull tab={tab} />),
      }}
    >
      {withTabs(<SectionsFull tab={tab} />)}
    </WidgetShell>
  );
}
