/**
 * McProjectStateBand — THE STATE REGISTER (owner compactness pass): one
 * 96px row carrying everything "where am I" — branch switcher, fetch/pull/
 * push, the sync numerals, the remote register with issues/PR quick links,
 * alert chips, the project facts, and the console open actions. The band's
 * former history and last-commit columns are GONE — both duplicated the
 * commit ledger placed directly beneath this band, and the four-column
 * 4-row panel grid they filled was mostly void (owner round: "shit empty
 * space", "redundant with beneath").
 *
 * Every interactive surface is a system part: `GitActionsToolbar` +
 * `BranchSwitcher` (the `git/` parts over `useProject().git`), open actions
 * over `useProject().open` / `useProject().ide`. Facts read the same scan
 * record; container queries fold the low-value facts (opened, remote slug)
 * as the register narrows instead of re-runging.
 *
 * Ladder: the masthead register renders at the "6x1" rung (the preset's
 * 12x1/8x1 desktop+tablet footprints); "4x4" keeps the compact git+facts
 * panel pair for the phone board; "1x1" degrades to the sync numerals.
 */
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, CodeXml, ExternalLink, Folder, Loader2, Terminal } from "lucide-react";

import { Chip } from "@workspace-welcome/ui/components/chip";
import { Stat } from "@workspace-welcome/ui/components/stat";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { relativeTime } from "@/lib/format";
import { useProject } from "@/lib/contexts/project-context";
import type { RegisteredWidgetProps } from "@/components/widgets/registry";
import { BranchSwitcher, GitActionsToolbar } from "@/components/parts";
import { WidgetShell } from "@/components/widgets/widget-shell";

/** The design's console-button register, shared by the masthead and the
 * compact pair's facts panel. */
const OPEN_BTN =
  "inline-flex h-7 items-center gap-1 border border-(--mc-line-strong) px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-foreground outline-none transition-colors hover:border-(--mc-accent) hover:text-(--mc-accent) focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

/** One label/value row of the compact pair's panels. */
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

/** One hairline column of the compact pair: mono caps title over rows. */
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 bg-(--mc-panel) p-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </span>
      {children}
    </div>
  );
}

/** One labelled group of the masthead register: micro-caps key over no
 * column — inline `KEY value` pairs separated at group width. */
function Group({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <span aria-hidden className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
        {label}
      </span>
      {children}
    </span>
  );
}

/** The design's console buttons over the provider's open/IDE choreography. */
function OpenActions({ className }: { className?: string }) {
  const project = useProject();
  const installing = project.ide.installingLabel !== null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)} data-mc-open-actions="">
      <button type="button" className={OPEN_BTN} onClick={() => project.open("editor")}>
        <Folder aria-hidden className="size-3" /> Editor
      </button>
      <button type="button" className={OPEN_BTN} onClick={() => project.open("terminal")}>
        <Terminal aria-hidden className="size-3" /> Terminal
      </button>
      <button type="button" className={OPEN_BTN} onClick={() => project.open("folder")}>
        <ExternalLink aria-hidden className="size-3" /> Folder
      </button>
      <button
        type="button"
        className={OPEN_BTN}
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

/** Sync numerals: ahead/behind over the dirty count — shared by both rungs. */
function SyncNumerals() {
  const project = useProject();
  const git = project.project?.git;
  if (git === undefined) return null;
  return (
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
  );
}

/** The masthead register ("6x1" rung): the whole state row, edge to edge. */
function MastheadRegister() {
  const project = useProject();
  const git = project.project?.git;
  const record = project.project;
  const alerts = record?.alerts ?? [];

  if (git === undefined) {
    return (
      <div className="flex h-full w-full items-center border border-(--mc-line) bg-(--mc-panel) px-3">
        <p className="text-xs text-muted-foreground">Scanning…</p>
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 w-full flex-wrap content-center items-center gap-x-5 gap-y-2 overflow-hidden border border-(--mc-line) bg-(--mc-panel) px-3 py-1.5">
      {!git.isRepo ? (
        <p className="text-xs text-muted-foreground">Not a git repository.</p>
      ) : (
        <>
          <Group label="branch">
            <BranchSwitcher />
          </Group>
          {git.remote !== null ? <GitActionsToolbar /> : null}
          <Group label="sync">
            <SyncNumerals />
          </Group>
          <Group label="remote">
            {git.remote ? (
              <span className="inline-flex min-w-0 items-center gap-2 font-mono text-[11px]">
                <a
                  href={git.remote.links.web}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 transition-colors hover:text-(--mc-accent)"
                >
                  {git.remote.host}
                  <span className="hidden text-muted-foreground @[880px]:inline">
                    · {git.remote.slug}
                  </span>
                  <ExternalLink aria-hidden className="size-3" />
                </a>
                <a
                  href={git.remote.links.issues}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-(--mc-accent)"
                >
                  issues
                </a>
                <a
                  href={git.remote.links.pulls}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-(--mc-accent)"
                >
                  pulls
                </a>
              </span>
            ) : (
              <span className="font-mono text-[11px] text-muted-foreground">none</span>
            )}
          </Group>
          {project.git.diverged ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-(--sev-critical)">
              diverged — fast-forward pull impossible
            </span>
          ) : null}
        </>
      )}
      {alerts.length > 0 ? (
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          {alerts.map((a) => (
            <Chip key={a.code} tone={a.severity} title={a.message}>
              {a.message}
            </Chip>
          ))}
        </span>
      ) : null}
      {record !== null ? (
        <Group label="facts" className="ml-auto">
          <span className="inline-flex min-w-0 items-center gap-2 font-mono text-[11px] tabular-nums">
            <span>{record.stack?.label ?? "unknown"}</span>
            <span className="text-muted-foreground/50">·</span>
            <span className="text-muted-foreground">
              upd {relativeTime(record.updatedAt)}
            </span>
            <span className="hidden text-muted-foreground @[1000px]:inline">
              · open {record.lastOpenedAt ? relativeTime(record.lastOpenedAt) : "never"}
            </span>
            <span
              className={cn(
                "hidden",
                record.alerts.length > 0
                  ? "inline text-(--sev-warning)"
                  : "text-muted-foreground @[1000px]:inline",
              )}
            >
              · ⚠ {record.alerts.length}
            </span>
          </span>
        </Group>
      ) : null}
      <OpenActions className="ml-auto" />
    </div>
  );
}

/** git panel of the compact pair: branch, sync actions, remote, sync. */
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
        <div className="flex min-h-0 flex-col gap-1.5">
          <Row label="Branch">
            <BranchSwitcher />
          </Row>
          {git.remote !== null ? <GitActionsToolbar /> : null}
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
            <SyncNumerals />
          </Row>
        </div>
      )}
    </Panel>
  );
}

/** project facts panel of the compact pair + the console open actions. */
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

/** The compact pair (rendered at the "4x4" rung — the phone board). */
function CompactBand() {
  return (
    <div className="grid h-full w-full grid-cols-1 gap-px border border-(--mc-line) bg-(--mc-line) md:grid-cols-2">
      <GitPanel />
      <FactsPanel />
    </div>
  );
}

export function McProjectStateBand(props: RegisteredWidgetProps) {
  const git = useProject().project?.git;
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
          "6x1": <MastheadRegister />,
          "4x4": <CompactBand />,
        }}
      >
        <MastheadRegister />
      </WidgetShell>
    </WidgetShell>
  );
}
