/**
 * McProjectStateBand — THE STATE BAND (T3 port of the design's project-page
 * instrument panel, `routes/designs/mission-control/project.$.tsx`): four
 * hairline columns — git controls, project facts, the last commit, the
 * commit history — over an alerts footer strip, exactly the design's
 * `md:grid-cols-2 xl:grid-cols-[1.15fr_0.75fr_1fr_1.1fr]` band.
 *
 * Every interactive surface is a system part: `GitActionsToolbar` +
 * `BranchSwitcher` (the `git/` parts over `useProject().git`), and the
 * history column is the design's `CommitHistoryCell` presentation — the ui
 * `CommitGraph` over the ONE cached commit-log entry. The facts column also
 * carries the design's header console buttons (editor/terminal/folder/IDE)
 * as plain buttons over `useProject().open` / `useProject().ide`.
 *
 * Ladder: the full four-column band renders at the "12x4" rung (the
 * preset's authored footprint); "2x2" keeps the working pair (git + facts);
 * "1x1" degrades to the sync numerals.
 */
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, CodeXml, ExternalLink, Folder, Loader2, Terminal } from "lucide-react";

import { CommitGraph } from "@workspace-welcome/ui/components/commit-graph";
import { Chip } from "@workspace-welcome/ui/components/chip";
import { Stat } from "@workspace-welcome/ui/components/stat";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { relativeTime } from "@/lib/format";
import { useProject } from "@/widgets/contexts/project-context";
import type { RegisteredWidgetProps } from "@/components/widgets/registry";
import { BranchSwitcher, GitActionsToolbar } from "@/widgets/parts";
import { WidgetShell } from "@/components/widgets/widget-shell";

/** History column window — the design's CommitHistoryCell presentation (the
 * ui `CommitGraph`, fed by the ONE cached commit-log entry, limit 200): a
 * count line over the graph rows. The design's cell scrolls internally; the
 * board contract forbids inner scrollers, so the band shows a window with
 * an honest footer. */
const HISTORY_ROWS = 8;

/** One label/value row of the design's instrument register. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 text-right text-foreground">{children}</span>
    </div>
  );
}

/** One hairline column of the band: mono caps title over rows. */
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 bg-(--mc-panel) p-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </span>
      {children}
    </div>
  );
}

/** The design's console buttons over the provider's open/IDE choreography. */
function OpenActions() {
  const project = useProject();
  const btn =
    "inline-flex h-7 items-center gap-1 border border-(--mc-line-strong) px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-foreground outline-none transition-colors hover:border-(--mc-accent) hover:text-(--mc-accent) focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
  const installing = project.ide.installingLabel !== null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-mc-open-actions="">
      <button type="button" className={btn} onClick={() => project.open("editor")}>
        <Folder aria-hidden className="size-3" /> Editor
      </button>
      <button type="button" className={btn} onClick={() => project.open("terminal")}>
        <Terminal aria-hidden className="size-3" /> Terminal
      </button>
      <button type="button" className={btn} onClick={() => project.open("folder")}>
        <ExternalLink aria-hidden className="size-3" /> Folder
      </button>
      <button
        type="button"
        className={btn}
        disabled={installing || project.ide.starting}
        onClick={() => project.ide.open()}
      >
        {installing || project.ide.starting ? (
          <Loader2 aria-hidden className="size-3 animate-spin" />
        ) : (
          <CodeXml aria-hidden className="size-3" />
        )}
        {installing ? "IDE…" : project.ide.starting ? "Starting…" : "IDE"}
      </button>
    </div>
  );
}

/** git column: toolbar, branch switcher, remote, sync, last-commit age. */
function GitPanel() {
  const project = useProject();
  const git = project.project?.git;
  if (git === undefined) {
    return <Panel title="git">
      <p className="text-xs text-muted-foreground">Scanning…</p>
    </Panel>;
  }
  return (
    <Panel title="git">
      {!git.isRepo ? (
        <p className="text-xs text-muted-foreground">Not a git repository.</p>
      ) : (
        <div className="flex min-h-0 flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Branch
            </span>
            <BranchSwitcher />
          </div>
          {git.isRepo && git.remote !== null ? (
            <GitActionsToolbar />
          ) : null}
          <Row label="Remote">
            {git.remote ? (
              <a
                href={git.remote.links.web}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 transition-colors hover:text-(--mc-accent)"
              >
                {git.remote.host}
                {git.remote.slug ? ` · ${git.remote.slug}` : ""}
                <ExternalLink aria-hidden className="size-3" />
              </a>
            ) : (
              <span className="text-muted-foreground">none</span>
            )}
          </Row>
          <Row label="Sync">
            <span className="inline-flex items-center gap-2 font-mono text-xs tabular-nums">
              <span className="inline-flex items-center gap-1 text-(--mc-accent)">
                <ArrowUp aria-hidden className="size-3" />
                {git.ahead ?? 0}
              </span>
              <span className="inline-flex items-center gap-1 text-(--sev-warning)">
                <ArrowDown aria-hidden className="size-3" />
                {git.behind ?? 0}
              </span>
              <span className="text-muted-foreground/50">/</span>
              <span className={(git.dirtyCount ?? 0) > 0 ? "text-(--sev-warning)" : "text-muted-foreground"}>
                {git.dirtyCount ?? 0} dirty
              </span>
            </span>
          </Row>
          {git.lastCommit?.date ? (
            <Row label="Last commit">{relativeTime(git.lastCommit.date)}</Row>
          ) : null}
          {project.git.diverged ? (
            <p className="text-[11px] leading-relaxed text-(--sev-critical)">
              Diverged — fast-forward pull impossible.
            </p>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

/** project facts column + the console open actions. */
function FactsPanel() {
  const project = useProject();
  const record = project.project;
  if (record === null) {
    return (
      <Panel title="project">
        <p className="text-xs text-muted-foreground">Not in the current scan.</p>
      </Panel>
    );
  }
  return (
    <Panel title="project">
      <Row label="Stack">{record.stack?.label ?? "unknown"}</Row>
      <Row label="Created">{relativeTime(record.createdAt)}</Row>
      <Row label="Updated">{relativeTime(record.updatedAt)}</Row>
      <Row label="Opened">
        {record.lastOpenedAt ? relativeTime(record.lastOpenedAt) : "never"}
      </Row>
      <Row label="Alerts">
        <span
          className={cn(
            record.alerts.length > 0 ? "text-(--sev-warning)" : "text-(--state-positive)",
          )}
        >
          {record.alerts.length}
        </span>
      </Row>
      <OpenActions />
    </Panel>
  );
}

/** last commit column: message, author register, remote quick links. */
function LastCommitPanel() {
  const project = useProject();
  const git = project.project?.git;
  const head = project.commitLog.data?.[0];
  if (git === undefined) return null;
  return (
    <Panel title="last commit">
      {git.lastCommit ? (
        <div className="flex min-w-0 flex-col gap-2">
          <p className="line-clamp-3 text-xs leading-relaxed text-foreground">
            {git.lastCommit.message}
          </p>
          <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
            <span>{git.lastCommit.author}</span>
            <span>· {relativeTime(git.lastCommit.date)}</span>
            {head ? <span className="text-(--mc-accent)">{head.hash.slice(0, 7)}</span> : null}
          </div>
          {git.remote ? (
            <div className="flex flex-wrap gap-1.5">
              <a
                href={git.remote.links.issues}
                target="_blank"
                rel="noreferrer"
                className="border border-(--mc-line-strong) px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-(--mc-accent)"
              >
                Issues
              </a>
              <a
                href={git.remote.links.pulls}
                target="_blank"
                rel="noreferrer"
                className="border border-(--mc-line-strong) px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-(--mc-accent)"
              >
                Pull requests
              </a>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {git.isRepo ? "No commits yet." : "No git data."}
        </p>
      )}
    </Panel>
  );
}

/** history column: the design's CommitHistoryCell — count line over the
 * CommitGraph rows, windowed (the design's cell scrolls; the band shows a
 * window with an honest footer). */
function HistoryPanel() {
  const project = useProject();
  const commits = project.commitLog.data ?? [];
  const shown = commits.slice(0, HISTORY_ROWS);
  const overflow = commits.length - shown.length;
  return (
    <Panel title="history">
      <div className="flex min-h-0 flex-col gap-1">
        <p className="text-xs text-muted-foreground">
          {commits.length === 1
            ? "1 commit, newest first."
            : `${commits.length} commits, newest first.`}
        </p>
        {commits.length === 0 ? (
          <p className="text-xs text-muted-foreground">No commits yet.</p>
        ) : (
          <CommitGraph entries={shown} />
        )}
        {overflow > 0 ? (
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
            +{overflow} more in the log
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

/** Alerts footer strip — the design's col-span-full badge rail. */
function AlertsStrip() {
  const project = useProject();
  const alerts = project.project?.alerts ?? [];
  return (
    <div className="col-span-full flex flex-wrap items-center gap-1.5 border-t border-(--mc-line) bg-(--mc-bg-raise) px-3 py-2">
      {alerts.length > 0 ? (
        alerts.map((a) => (
          <Chip key={a.code} tone={a.severity} title={a.message}>
            {a.message}
          </Chip>
        ))
      ) : (
        <span className="font-mono text-[10px] text-muted-foreground">
          no open alerts · scan clean
        </span>
      )}
    </div>
  );
}

/** The full four-column band (rendered at the "4x4" rung and up). */
function StateBand() {
  return (
    <div className="grid h-full w-full grid-cols-1 gap-px border border-(--mc-line) bg-(--mc-line) md:grid-cols-2 xl:grid-cols-[1.15fr_0.75fr_1fr_1.1fr]">
      <GitPanel />
      <FactsPanel />
      <LastCommitPanel />
      <HistoryPanel />
      <AlertsStrip />
    </div>
  );
}

/** The compact pair: git + facts (below the full band's rung). */
function CompactBand() {
  return (
    <div className="grid h-full w-full grid-cols-1 gap-px border border-(--mc-line) bg-(--mc-line) md:grid-cols-2">
      <GitPanel />
      <FactsPanel />
    </div>
  );
}

export function McProjectStateBand(props: RegisteredWidgetProps) {
  const project = useProject();
  const git = project.project?.git;
  return (
    <WidgetShell className="h-full w-full">
      <WidgetShell
        className="h-full w-full"
        interactive={false}
        size={{ cols: props.size.cols, rows: props.size.rows }}
        sizes={{
          "1x1": (
            <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3 pb-2">
              <Stat
                label="Dirty"
                value={git?.dirtyCount ?? 0}
                tone={(git?.dirtyCount ?? 0) > 0 ? "warning" : "neutral"}
              />
            </div>
          ),
          "2x2": <CompactBand />,
          "12x4": <StateBand />,
        }}
      >
        <CompactBand />
      </WidgetShell>
    </WidgetShell>
  );
}
