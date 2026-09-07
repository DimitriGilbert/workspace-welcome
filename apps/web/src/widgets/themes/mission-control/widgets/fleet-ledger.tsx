/**
 * McFleetLedger — the fleet ledger (port of the design's `FleetTable`
 * presentation, `components/designs/mission-control/fleet-table.tsx`, onto
 * the system's table engine: ui `DataTable` — sortable headers, ratio
 * widths, never scrolling internally — the table library import stays in
 * the ui part where it belongs).
 *
 * The cells are the design's, verbatim: state LED, unit name + pin glyph,
 * stack icon, branch with the git-fork glyph, ahead/behind numerals with
 * the accent/warn registers, dirty count, the pulse-strip signal, note,
 * AlertIcons, relative update age. Rows open the project through the
 * same-theme project route (the design's whole-row click).
 *
 * Density contract (owner FINAL image + projects-list verdict): every fixed-content
 * column is sized to its content and the freed span goes to UNIT and BRANCH —
 * name and branch display fully, never truncated — while SIGNAL lands at a
 * quarter of its former span as the narrow compact-bar column (a 22px tick at
 * the track's end) with UPDATED closing the row. A NOTE column that no visible
 * unit can fill is a void column — it is omitted and the freed width goes to
 * name/branch instead. The NOTE column shows the project note or, absent, the
 * last commit subject — a unit with neither contributes nothing anywhere, so
 * the census is data-driven.
 *
 * The command bar's filter executes here over the visible set (the design
 * feeds it through the table's filter row model; the working set is already
 * narrowed by the workspace filter). The table's honest floor is the sum of
 * the columns' pixel content floors — below it the ladder swaps to a
 * `KvList` register (no internal scroll, no overflow, no mid-word cuts).
 * Row counts cap at the placed height on a pixel budget (≈33px ledger rows —
 * the ui cell rhythm; ≈20px KvList rows) with an honest "+N more" footer —
 * the console shows a window, the design's panel scroll becomes the rung's
 * business.
 */
import { useMemo } from "react";
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
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { dateTooltip, relativeTime } from "@/lib/format";
import { pulseCells, updatedMs } from "@/lib/scan-metrics";
import { stackIcon } from "@/lib/icons";
import { ProjectLed } from "@/widgets/parts";
import { useWorkspace } from "@/widgets/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { useWidgetSize, WidgetShell } from "@/widgets/runtime/widget-shell";

/**
 * Fleet helpers shared by the console kinds. `fleetMatches` is the design's
 * ledger haystack (name, note, branch, stack label, alert messages —
 * AND-semantics across whitespace terms). `projectHref` targets this
 * theme's project route — the same-theme navigation contract (V3): never
 * `/designs`, never legacy `/projects/`.
 */

/** This theme's slug — kind ids and routes are theme-local. */
export const MC_THEME = "mission-control";

/** Same-theme project-route href for a project path (splat = absolute path). */
export function projectHref(path: string): string {
  return `/app/${MC_THEME}/project/${path.replace(/^\/+/, "")}`;
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

/** The note text a unit contributes: the operator note, else the last commit subject. */
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
 * Column widths, content first — authored in px at the desktop reference row
 * (the FINAL owner image's ~1084px ledger): state LED, stack glyph, sync/
 * dirty/alerts numerals and the update age take what their content needs;
 * the freed span goes to UNIT and BRANCH — name and branch display fully,
 * never truncated — while SIGNAL lands at a quarter of its former span as
 * the narrow compact-bar column with UPDATED closing the row. Every column
 * also carries a PIXEL floor (`minSize`) equal to its longest real content
 * (24-char unit names, 29-char branches, three-digit sync pairs), so the
 * table's honest minWidth is the sum of the floors — below it the ladder
 * swaps to the KvList register instead of clipping (no mid-word cuts at any
 * width). The SIGNAL column is the LAST content column before the update
 * age — the strip starts immediately after the alert data and flexes to the
 * right-aligned timestamps.
 */
const FLEX_SIZES = { signalWithNotes: 146, signalSolo: 178, note: 330 };

/** Pixel floors — the longest real content each column must hold uncut. */
const MIN_PX = { state: 14, unit: 214, stack: 22, branch: 218, sync: 68, dirty: 32, note: 60, alerts: 46, signal: 72, updated: 64 };

/** Column px widths at the desktop reference (unit/branch carry the freed span). */
const SIZE_PX = { state: 27, unit: 274, stack: 41, branch: 274, sync: 55, dirty: 55, alerts: 55, updated: 127 };

function buildColumns(notes: boolean): DataTableColumns<Project> {
  const signal = notes ? FLEX_SIZES.signalWithNotes : FLEX_SIZES.signalSolo;
  return helper.columns([
    helper.display({
      id: "state",
      size: SIZE_PX.state,
      minSize: MIN_PX.state,
      header: () => <span className="sr-only">State</span>,
      cell: (ctx) => <ProjectLed project={ctx.row.original} />,
    }),
    helper.accessor((p) => p.name, {
      id: "unit",
      sortFn: "alphanumeric",
      size: SIZE_PX.unit,
      minSize: MIN_PX.unit,
      header: "Unit",
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
      size: SIZE_PX.stack,
      minSize: MIN_PX.stack,
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
      size: SIZE_PX.branch,
      minSize: MIN_PX.branch,
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
      size: SIZE_PX.sync,
      minSize: MIN_PX.sync,
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
      size: SIZE_PX.dirty,
      minSize: MIN_PX.dirty,
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
    ...(notes
      ? [
          helper.accessor((p) => noteOf(p), {
            id: "note",
            enableSorting: false,
            size: FLEX_SIZES.note,
            minSize: MIN_PX.note,
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
      size: SIZE_PX.alerts,
      minSize: MIN_PX.alerts,
      header: () => (
        <abbr title="Open alerts (severity order)" className="no-underline">
          A
        </abbr>
      ),
      cell: (ctx) => <AlertIcons alerts={ctx.row.original.alerts} />,
    }),
    helper.display({
      id: "signal",
      size: signal,
      minSize: MIN_PX.signal,
      header: "Signal",
      cell: (ctx) => <SignalCell project={ctx.row.original} />,
    }),
    helper.accessor((p) => updatedMs(p), {
      id: "updated",
      sortFn: "alphanumeric",
      size: SIZE_PX.updated,
      minSize: MIN_PX.updated,
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

/**
 * The visible-window cap on a pixel budget. Ledger rows run ≈33px (the ui
 * cell rhythm; the theme skin no longer tightens them — the FINAL owner
 * image carries the airier register), KvList rows ≈20px. Chrome: the census
 * label, table head, the "+N more" footer and the shell padding. The placed
 * height includes the canvas's inter-row gaps (12px — the canvas default;
 * PageLayout carries no gap field), so the cap fills the rung honestly.
 */
const CELL_PX = 96;
const GRID_GAP_PX = 12;
const LEDGER_ROW_PX = 33;
const LEDGER_CHROME_PX = 96;
const KV_ROW_PX = 20;
const KV_CHROME_PX = 54;

/** The table's honest floor: the sum of the columns' pixel content floors —
 * below it the name or branch would cut mid-word, so the register swaps. */
const TABLE_MIN_PX =
  MIN_PX.state +
  MIN_PX.unit +
  MIN_PX.stack +
  MIN_PX.branch +
  MIN_PX.sync +
  MIN_PX.dirty +
  MIN_PX.alerts +
  MIN_PX.signal +
  MIN_PX.updated;

export function McFleetLedger(_props: RegisteredWidgetProps) {
  const workspace = useWorkspace();
  const { cols, rows: placedRows } = useWidgetSize();

  const visible = useMemo(
    () => workspace.projects.filter((p) => fleetMatches(p, workspace.filter)),
    [workspace.projects, workspace.filter],
  );

  // The table is the ledger's form from the content-floor rung up (the FINAL
  // arrangement places it at exactly that footprint); below it the compact
  // register takes over — never a clipped table.
  const table = cols >= 4;
  const placedPx = placedRows * CELL_PX + (placedRows - 1) * GRID_GAP_PX;
  const cap = Math.max(
    3,
    Math.floor(
      (placedPx - (table ? LEDGER_CHROME_PX : KV_CHROME_PX)) /
        (table ? LEDGER_ROW_PX : KV_ROW_PX),
    ),
  );

  const shown = useMemo(() => {
    const sorted = [...visible].sort((a, b) => updatedMs(b) - updatedMs(a));
    return sorted.slice(0, cap);
  }, [visible, cap]);
  const overflow = visible.length - shown.length;
  const notes = useMemo(() => visible.some((p) => noteOf(p).trim().length > 0), [visible]);
  const columns = useMemo(() => buildColumns(notes), [notes]);
  const tableMinWidth = TABLE_MIN_PX + (notes ? MIN_PX.note : 0);

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
            No units on record — add a scan root to begin the ledger.
          </p>
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell className="h-full w-full">
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 overflow-hidden px-4 pb-2">
        <p className="shrink-0 font-mono text-[9.5px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Fleet
          <span className="ml-2 tracking-[0.14em] text-muted-foreground/80">
            {visible.length} of {workspace.projects.length} units
          </span>
        </p>
        {table ? (
          <>
            {/* Table form on shells wide enough for its content floor; the
                compact register takes over below it (container query) —
                never a clipped or overlapping table. */}
            <div className="hidden min-h-0 min-w-0 @[800px]:block">
              <DataTable
                columns={columns}
                data={shown}
                initialSort={[{ id: "updated", desc: true }]}
                minWidth={tableMinWidth}
                onRowClick={(p) => openProjectRow(p.path)}
                ariaLabel="Fleet status, one row per project: state, unit, stack, branch, sync counts, uncommitted files, note, alerts, activity signal and last update"
                empty="No units match the filter"
              />
            </div>
            <div className="min-h-0 min-w-0 @[800px]:hidden">
              <KvList
                density="compact"
                rows={shown.map((p) => ({
                  label: p.name,
                  value: compactStamp(relativeTime(p.updatedAt)),
                  mono: true,
                }))}
              />
            </div>
          </>
        ) : (
          <div className="min-h-0 min-w-0">
            <KvList
              density="compact"
              rows={shown.map((p) => ({
                label: p.name,
                value: compactStamp(relativeTime(p.updatedAt)),
                mono: true,
              }))}
            />
          </div>
        )}
        {overflow > 0 ? (
          <p className="mt-auto shrink-0 pt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            +{overflow} more in the ledger
          </p>
        ) : null}
      </div>
    </WidgetShell>
  );
}
