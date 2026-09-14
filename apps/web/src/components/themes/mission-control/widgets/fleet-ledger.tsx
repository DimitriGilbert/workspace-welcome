/**
 * McFleetLedger — the fleet ledger (port of the design's `FleetTable`
 * presentation, `components/designs/mission-control/fleet-table.tsx`, onto
 * the system's table engine: ui `DataTable` — sortable headers, ratio
 * widths, never scrolling internally — the table library import stays in
 * the ui part where it belongs).
 *
 * The cells are the design's, verbatim: state LED, project name + pin
 * glyph, stack icon, branch with the git-fork glyph, ahead/behind numerals
 * with the accent/warn registers, dirty count, the pulse-strip signal,
 * note, AlertIcons, relative update age. Rows open the project through the
 * same-theme project route (the design's whole-row click).
 *
 * Density contract (owner FINAL image + projects-list verdict): every
 * fixed-content column is sized to its content and the freed span goes to
 * PROJECT and BRANCH — name and branch display fully, never truncated —
 * while SIGNAL lands at a quarter of its former span as the narrow
 * compact-bar column (a 22px tick at the track's end) with UPDATED closing
 * the row. A NOTE column that no visible project can fill is a void column
 * — it is omitted and the freed width goes to name/branch instead. The
 * NOTE column shows the project note or, absent, the last commit subject —
 * a project with neither contributes nothing anywhere, so the census is
 * data-driven.
 *
 * The command bar's filter executes here over the visible set (the design
 * feeds it through the table's filter row model; the working set is already
 * narrowed by the workspace filter). The table's honest floor is the sum of
 * the columns' pixel content floors — below it the ladder swaps to a
 * `KvList` register. The FULL filtered fleet renders — everything that
 * outruns the placement scrolls in the band's ScrollArea (shadcn register),
 * no "+N more" footer.
 */
import { useEffect, useMemo, useState } from "react";
import { GitFork, Pin } from "lucide-react";

import type { Project } from "@workspace-welcome/api/lib/types";
import { AlertIcons } from "@/components/git-badges";
import {
  createDataTableColumnHelper,
  DataTable,
} from "@workspace-welcome/ui/components/data-table";
import type { DataTableColumns } from "@workspace-welcome/ui/components/data-table";
import { KvList } from "@workspace-welcome/ui/components/kv-list";
import { PulseStrip } from "@workspace-welcome/ui/components/pulse-strip";
import { ScrollArea } from "@workspace-welcome/ui/components/scroll-area";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { dateTooltip, relativeTime } from "@/lib/format";
import { pulseCells, updatedMs } from "@/lib/scan-metrics";
import { stackIcon } from "@/lib/icons";
import { ForgeChips, ProjectLed, useForgeCensus } from "@/components/parts";
import { useWorkspace } from "@/lib/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/components/widgets/registry";
import { WidgetShell } from "@/components/widgets/widget-shell";

/**
 * Fleet helpers shared by the console kinds. `fleetMatches` is the design's
 * ledger haystack (name, note, branch, stack label, alert messages —
 * AND-semantics across whitespace terms). `projectHref` targets this
 * theme's project route — the same-theme navigation contract (V3): never
 * `/designs`, never legacy `/projects/`.
 */

/**
 * Same-theme project-route href for a project path (splat = absolute path).
 * Clean URL — user links never carry `?preset=` (owner order: the param is
 * agent deep-link cargo); the project page renders the SAVED preset, which
 * loading this board persisted, so the theme carries over without it.
 */
export function projectHref(path: string): string {
  return `/project/${path.replace(/^\/+/, "")}`;
}

/**
 * The ledger's timestamp register: the relative age compressed to its
 * unit initial ("12h ago", "1d ago") so the column holds its minimum width
 * at narrow shells — the full stamp rides the title tooltip.
 */
function compactStamp(stamp: string): string {
  return stamp
    .replace("less than a minute ago", "now")
    .replace(" minutes", "m")
    .replace(" hours", "h")
    .replace(" days", "d")
    .replace(" weeks", "w")
    .replace(" months", "mo")
    .replace(" minute ago", "m ago")
    .replace(" hour ago", "h ago")
    .replace(" day ago", "d ago")
    .replace(" week ago", "w ago")
    .replace(" month ago", "mo ago")
    .replace(" years", "y")
    .replace(" year ago", "y ago");
}

/** The note text a project contributes: the operator note, else the last commit subject. */
function noteOf(p: Project): string {
  return p.note ?? p.git.lastCommit?.message ?? "";
}

/** Lowercased haystack of the fields an operator filters the fleet by. */
function fleetHaystack(p: Project): string {
  return [
    p.name,
    noteOf(p),
    p.git.isRepo ? (p.git.branch ?? "") : "",
    p.stack?.label ?? "",
    p.alerts.map((a) => a.message).join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

/** True when every whitespace-separated term hits the project's haystack. */
export function fleetMatches(p: Project, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter((t) => t.length > 0);
  if (terms.length === 0) return true;
  const haystack = fleetHaystack(p);
  return terms.every((t) => haystack.includes(t));
}

const helper = createDataTableColumnHelper<Project>();

/**
 * The sizing law: every column's authored `size` EQUALS its measured content
 * floor, and `tableMinWidth` is the sum of the same floors — one number per
 * column, no independent ratio weights. The engine renders pure shares
 * (table-core `column_getSize` clamps size into [minSize, maxSize]; the ui
 * DataTable lays each `<th>` at size/totalSize × tableWidth under
 * `table-layout: fixed`), so a column renders BELOW its floor exactly when
 * its share exceeds its floor-share — authoring any column above its floor
 * (the old ratio hack that gave forge 220 for a 117px pair) necessarily
 * starves the others at the floor width. With size ≡ floor everywhere the
 * shares ARE the floor shares and safety holds at every width by
 * construction: rendered(T) = floor·T/Σfloor ≥ floor for all T ≥ Σfloor,
 * with all surplus split in proportion to content need — PROJECT and BRANCH
 * (the largest floors) take the most, which IS the density contract's
 * "freed span goes to name/branch". Floors are measured off the live DOM,
 * not tuned to breakpoints: state = 8px lamp + 12px first-cell padding;
 * stack = the "ST▲" header at its widest (arrow included) beside the 14px
 * glyph; sync = the three-digit "999 / 999" pair (62px with the mx-1 slash
 * gaps and px-1) with headroom; forge = the chip vocabulary's widest pair
 * (two truncated "50+" chips, 51.7px each) + the 1.5 gap + px-1 = 117.3;
 * alerts = two icons + gap + padding; updated = "11mo ago" 52.8px + 12px
 * last-cell padding; project/branch carry their 24/29-character bases;
 * note/signal are the authored design minimums of their flexible columns.
 *
 * The same Σ rules the ladder: the table form renders only when the
 * MEASURED stage (the widget's content box, ResizeObserver) is ≥
 * `tableMinWidth` — the swap threshold IS the floor, the identical number
 * handed to the DataTable as `minWidth`, so there is no width at which the
 * table exists without room for every column and the UPDATED stamp renders
 * whole at every viewport. A static container query can never express this:
 * the floor moves with the census (+NOTE/+FORGE), and the old `@[800px]`
 * condition measured the SHELL box — chrome included — against a constant
 * below Σfloor, so on 800–973px shells the 881px table rendered inside a
 * 795px stage and scrolled its right-edge UPDATED column out of the band.
 */
const COL_PX = {
  state: 20,
  project: 214,
  stack: 25,
  branch: 218,
  sync: 68,
  dirty: 32,
  forge: 120,
  note: 60,
  alerts: 46,
  signal: 72,
  updated: 66,
} as const;

function buildColumns(notes: boolean, forge: boolean): DataTableColumns<Project> {
  return helper.columns([
    helper.display({
      id: "state",
      size: COL_PX.state,
      minSize: COL_PX.state,
      header: () => <span className="sr-only">State</span>,
      cell: (ctx) => <ProjectLed project={ctx.row.original} />,
    }),
    helper.accessor((p) => p.name, {
      id: "project",
      sortFn: "alphanumeric",
      size: COL_PX.project,
      minSize: COL_PX.project,
      header: "Project",
      cell: (ctx) => {
        const p = ctx.row.original;
        return (
          <a
            href={projectHref(p.path)}
            onClick={(e) => e.stopPropagation()}
            className="flex max-w-full items-center gap-1.5 truncate text-left text-[13px] font-medium tracking-tight text-foreground outline-none transition-colors hover:text-(--mc-accent) focus-visible:ring-1 focus-visible:ring-ring"
            title={p.name}
          >
            <span className="truncate">{p.name}</span>
            {p.pinned ? <Pin aria-hidden className="size-3 shrink-0 text-(--pinned-accent)" /> : null}
          </a>
        );
      },
    }),
    helper.accessor((p) => p.stack?.label ?? "", {
      id: "stack",
      sortFn: "alphanumeric",
      size: COL_PX.stack,
      minSize: COL_PX.stack,
      header: () => (
        <abbr title="Detected stack" className="no-underline">
          ST
        </abbr>
      ),
      cell: (ctx) => <StackCell project={ctx.row.original} />,
    }),
    helper.accessor((p) => (p.git.isRepo ? (p.git.branch ?? "detached") : ""), {
      id: "branch",
      sortFn: "alphanumeric",
      size: COL_PX.branch,
      minSize: COL_PX.branch,
      header: () => (
        <abbr title="Branch" className="no-underline">
          BR
        </abbr>
      ),
      cell: (ctx) => <BranchCell project={ctx.row.original} />,
    }),
    helper.accessor((p) => (p.git.ahead ?? 0) + (p.git.behind ?? 0), {
      id: "sync",
      sortFn: "alphanumeric",
      size: COL_PX.sync,
      minSize: COL_PX.sync,
      header: () => (
        <abbr title="Commits ahead / behind upstream" className="no-underline">
          U/D
        </abbr>
      ),
      cell: (ctx) => (
        <span className="block text-right font-mono text-[11px]">
          <SyncCell project={ctx.row.original} />
        </span>
      ),
    }),
    helper.accessor((p) => p.git.dirtyCount ?? 0, {
      id: "dirty",
      sortFn: "alphanumeric",
      size: COL_PX.dirty,
      minSize: COL_PX.dirty,
      header: () => (
        <abbr title="Uncommitted files" className="no-underline">
          D
        </abbr>
      ),
      cell: (ctx) => (
        <span className="block text-right font-mono text-[11px]">
          <N value={ctx.row.original.git.dirtyCount} tone="warn" />
        </span>
      ),
    }),
    // Forge counts join the git cluster census-style: the column exists
    // only while some visible project has a cached snapshot (no data, no
    // void column — the NOTE ruling above); the cells self-null per row.
    // The floor is the chip vocabulary's widest pair — two truncated "50+"
    // chips (51.7px each; exact counts cap at 49, so no glyph run is
    // wider) plus the 1.5 gap plus the cell's px-1 = 117.3px, rounded to
    // 120 under the sizing law above; the pair therefore fits on one line
    // at every width the table form renders, by construction.
    ...(forge
      ? [
          helper.display({
            id: "forge",
            size: COL_PX.forge,
            minSize: COL_PX.forge,
            header: () => (
              <abbr title="Open forge issues / pull requests" className="no-underline">
                I/P
              </abbr>
            ),
            cell: (ctx) => <ForgeChips project={ctx.row.original} />,
          }),
        ]
      : []),
    ...(notes
      ? [
          helper.accessor((p) => noteOf(p), {
            id: "note",
            enableSorting: false,
            size: COL_PX.note,
            minSize: COL_PX.note,
            header: "Note",
            cell: (ctx) => {
              const text = ctx.getValue();
              return text ? (
                <span className="block truncate text-xs text-muted-foreground" title={text}>
                  {text}
                </span>
              ) : null;
            },
          }),
        ]
      : []),
    helper.accessor((p) => p.alerts.length, {
      id: "alerts",
      sortFn: "alphanumeric",
      size: COL_PX.alerts,
      minSize: COL_PX.alerts,
      header: () => (
        <abbr title="Open alerts (severity order)" className="no-underline">
          A
        </abbr>
      ),
      cell: (ctx) => <AlertIcons alerts={ctx.row.original.alerts} />,
    }),
    helper.display({
      id: "signal",
      size: COL_PX.signal,
      minSize: COL_PX.signal,
      header: "Signal",
      cell: (ctx) => <SignalCell project={ctx.row.original} />,
    }),
    helper.accessor((p) => updatedMs(p), {
      id: "updated",
      sortFn: "alphanumeric",
      size: COL_PX.updated,
      minSize: COL_PX.updated,
      header: "Updated",
      cell: (ctx) => (
        <span
          className="block whitespace-nowrap text-right font-mono text-[11px] tabular-nums text-muted-foreground"
          title={dateTooltip(ctx.row.original.updatedAt)}
        >
          {compactStamp(relativeTime(ctx.row.original.updatedAt))}
        </span>
      ),
    }),
  ]);
}

/** Tabular numeral; quiet middot when there is nothing to report (the design's `N`). */
function N({ value, tone }: { value: number | null; tone?: "up" | "warn" }) {
  if (value === null || value === 0) {
    return <span className="text-muted-foreground/40">·</span>;
  }
  return (
    <span
      className={cn(
        "tabular-nums",
        tone === "up" && "text-(--mc-accent)",
        tone === "warn" && "text-(--sev-warning)",
      )}
    >
      {value}
    </span>
  );
}

/**
 * The signal column reads the shared workspace clock internally (the
 * ProjectLed pattern — column defs are module-level, hooks live in the cell
 * components), so a row's numerals and its sparkline never disagree. The
 * strip fills its whole track — the track IS the flex width the ledger
 * hands it, never a capped island.
 */
function SignalCell({ project }: { project: Project }) {
  const { now } = useWorkspace();
  return (
    <PulseStrip
      cells={pulseCells(project, 24, now)}
      ariaLabel={`Activity pulse for ${project.name}`}
      className="w-full"
    />
  );
}

/** The design's StackCell: the detected stack's icon, centered. */
function StackCell({ project }: { project: Project }) {
  const Icon = stackIcon(project.stack?.id);
  return (
    <span className="flex justify-center" title={project.stack?.label ?? "No stack detected"}>
      <Icon aria-hidden className="size-3.5 text-muted-foreground group-hover:text-foreground" />
    </span>
  );
}

/** The design's BranchCell: fork glyph + mono branch, "no git" when bare. */
function BranchCell({ project }: { project: Project }) {
  if (!project.git.isRepo) {
    return <span className="font-mono text-[11px] text-muted-foreground">no git</span>;
  }
  return (
    <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
      <GitFork aria-hidden className="size-3 shrink-0" />
      <span className="truncate">{project.git.branch ?? "detached"}</span>
    </span>
  );
}

/** The design's SyncCell: ahead / behind with the accent/warn registers. */
function SyncCell({ project }: { project: Project }) {
  const ahead = project.git.ahead ?? 0;
  const behind = project.git.behind ?? 0;
  if (ahead === 0 && behind === 0) {
    return <span className="text-muted-foreground/40">·</span>;
  }
  return (
    <span className="block whitespace-nowrap font-mono text-[11px]">
      <N value={ahead} tone="up" />
      <span className="mx-1 text-muted-foreground/40">/</span>
      <N value={behind} tone="warn" />
    </span>
  );
}

function openProjectRow(path: string): void {
  window.location.href = projectHref(path);
}

/** The table's honest floor: the sum of the always-on columns' content
 * floors — under the sizing law this equals Σsize, so the engine's floor
 * and its share denominator are one number. Below it the name or branch
 * would cut mid-word, so the register swaps. */
const TABLE_MIN_PX =
  COL_PX.state +
  COL_PX.project +
  COL_PX.stack +
  COL_PX.branch +
  COL_PX.sync +
  COL_PX.dirty +
  COL_PX.alerts +
  COL_PX.signal +
  COL_PX.updated;

/**
 * The stage's live content width (the CommitsList `useObservedWidth`
 * pattern, via a callback ref — the stage mounts only once the scan
 * resolves, so the observer must follow the element, not the mount).
 * `contentRect` excludes the observed element's own padding, so for the
 * ledger's `px-4` content box this IS the width the table or the register
 * must fill — the ladder's swap input.
 */
function useObservedWidth(element: HTMLElement | null): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    if (element === null) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return width;
}

export function McFleetLedger(_props: RegisteredWidgetProps) {
  const workspace = useWorkspace();
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const stageWidth = useObservedWidth(stage);

  const visible = useMemo(
    () => workspace.projects.filter((p) => fleetMatches(p, workspace.filter)),
    [workspace.projects, workspace.filter],
  );

  const sorted = useMemo(
    () => [...visible].sort((a, b) => updatedMs(b) - updatedMs(a)),
    [visible],
  );
  const notes = useMemo(() => visible.some((p) => noteOf(p).trim().length > 0), [visible]);
  const forge = useForgeCensus(visible);
  const columns = useMemo(() => buildColumns(notes, forge), [notes, forge]);
  const tableMinWidth =
    TABLE_MIN_PX + (notes ? COL_PX.note : 0) + (forge ? COL_PX.forge : 0);

  // The table is the ledger's form from its content floor up: the measured
  // stage against the SAME Σ that feeds the table's minWidth (the sizing
  // law's ladder rule — see COL_PX). Below the floor the compact register
  // takes over — never a clipped or scrolling table. Unmeasured stages
  // (first render) assume the table; the scan-loading skeleton covers
  // hydration, so the measurement lands before either form is visible.
  const table = stageWidth === null || stageWidth >= tableMinWidth;

  if (workspace.scanState === "loading") {
    return (
      <WidgetShell className="h-full w-full">
        <div className="flex h-full min-h-0 w-full flex-col justify-center gap-2 px-4 pb-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </WidgetShell>
    );
  }

  if (workspace.scanState === "error") {
    return (
      <WidgetShell className="h-full w-full">
        <div className="flex h-full min-h-0 w-full flex-col justify-center gap-2 px-4 pb-2">
          <p role="alert" className="font-mono text-[11px] text-(--sev-critical)">
            Scan failed: {workspace.scan.error?.message ?? "unknown error"}
          </p>
          <button type="button" onClick={() => workspace.refresh()} className="self-start font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground outline-none transition-colors hover:text-(--mc-accent)">
            Rescan
          </button>
        </div>
      </WidgetShell>
    );
  }

  if (workspace.projects.length === 0) {
    return (
      <WidgetShell className="h-full w-full">
        <div className="flex h-full min-h-0 w-full items-center justify-center px-4 pb-2">
          <p className="text-xs text-muted-foreground">
            No projects on record — add a scan root to begin the ledger.
          </p>
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell className="h-full w-full">
      {/* The stage: its content box (px-4 excluded by contentRect) is the
          width the ladder swaps on — see useObservedWidth. */}
      <div
        ref={setStage}
        className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 overflow-hidden px-4 pb-2"
      >
        <p className="shrink-0 font-mono text-[9.5px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Fleet
          <span className="ml-2 tracking-[0.14em] text-muted-foreground/80">
            {visible.length} of {workspace.projects.length} projects
          </span>
        </p>
        {table ? (
          /* Table form on stages at least its content floor; the compact
             register takes over below it (measured swap — COL_PX's ladder
             rule) — never a clipped or scrolling table. The full fleet
             renders; the band's ScrollArea takes the overflow. */
          <div className="flex min-h-0 min-w-0 flex-1">
            <ScrollArea className="min-h-0 min-w-0 flex-1">
              <DataTable
                columns={columns}
                data={sorted}
                initialSort={[{ id: "updated", desc: true }]}
                minWidth={tableMinWidth}
                onRowClick={(p) => openProjectRow(p.path)}
                ariaLabel="Fleet status, one row per project: state, project, stack, branch, sync counts, uncommitted files, forge counts, note, alerts, activity signal and last update"
                empty="No projects match the filter"
              />
            </ScrollArea>
          </div>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <ScrollArea className="min-h-0 min-w-0 flex-1">
              <KvList
                density="compact"
                rows={sorted.map((p) => ({
                  label: p.name,
                  value: (
                    // Chips carry their own styling — the register value
                    // wraps (never truncates) a pill pair, and the mono
                    // register rides the stamp alone, not the chips.
                    <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5">
                      <ForgeChips project={p} />
                      <span className="font-mono tabular-nums">
                        {compactStamp(relativeTime(p.updatedAt))}
                      </span>
                    </span>
                  ),
                  wrap: true,
                }))}
              />
            </ScrollArea>
          </div>
        )}
      </div>
    </WidgetShell>
  );
}
