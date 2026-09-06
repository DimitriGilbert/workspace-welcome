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
 * The command bar's filter executes here over the visible set (the design
 * feeds it through the table's filter row model; the working set is already
 * narrowed by the workspace filter). Below the DataTable's floor the ladder
 * swaps to a `KvList` register (no internal scroll, no overflow). Row
 * counts cap at the placed height (≈3 table rows per 96px cell) with an
 * honest "+N more" footer — the console shows a window, the design's panel
 * scroll becomes the rung's business.
 */
import { useMemo } from "react";
import { GitFork, Pin } from "lucide-react";

import type { Project } from "@workspace-welcome/api/lib/types";
import { AlertIcons } from "@/components/git-badges";
import {
  createDataTableColumnHelper,
  DataTable,
} from "@workspace-welcome/ui/components/data-table";
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

/** Lowercased haystack of the fields an operator filters the fleet by. */
function fleetHaystack(p: Project): string {
  return [
    p.name,
    p.note ?? "",
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
 * components), so a row's numerals and its sparkline never disagree.
 */
function SignalCell({ project }: { project: Project }) {
  const { now } = useWorkspace();
  return (
    <PulseStrip
      cells={pulseCells(project, 24, now)}
      ariaLabel={`Activity pulse for ${project.name}`}
      className="w-full max-w-52"
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

const columns = helper.columns([
  helper.display({
    id: "state",
    size: 4,
    header: () => <span className="sr-only">State</span>,
    cell: (ctx) => <ProjectLed project={ctx.row.original} />,
  }),
  helper.accessor((p) => p.name, {
    id: "unit",
    sortFn: "alphanumeric",
    size: 24,
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
    size: 7,
    header: () => (
      <abbr title="Detected stack" className="no-underline">
        Stk
      </abbr>
    ),
    cell: (ctx) => <StackCell project={ctx.row.original} />,
  }),
  helper.accessor((p) => (p.git.isRepo ? (p.git.branch ?? "detached") : ""), {
    id: "branch",
    sortFn: "alphanumeric",
    size: 15,
    header: "Branch",
    cell: (ctx) => <BranchCell project={ctx.row.original} />,
  }),
  helper.accessor((p) => (p.git.ahead ?? 0) + (p.git.behind ?? 0), {
    id: "sync",
    sortFn: "alphanumeric",
    size: 8,
    header: () => (
      <abbr title="Commits ahead / behind upstream" className="no-underline">
        Up/Dn
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
    size: 8,
    header: () => (
      <abbr title="Uncommitted files" className="no-underline">
        Dirty
      </abbr>
    ),
    cell: (ctx) => (
      <span className="block text-right font-mono text-[11px]">
        <N value={ctx.row.original.git.dirtyCount} tone="warn" />
      </span>
    ),
  }),
  helper.display({
    id: "signal",
    size: 18,
    header: "Signal",
    cell: (ctx) => <SignalCell project={ctx.row.original} />,
  }),
  helper.accessor((p) => p.note ?? p.git.lastCommit?.message ?? "", {
    id: "note",
    enableSorting: false,
    size: 22,
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
  helper.accessor((p) => p.alerts.length, {
    id: "alerts",
    sortFn: "alphanumeric",
    size: 8,
    header: () => (
      <abbr title="Open alerts (severity order)" className="no-underline">
        Alr
      </abbr>
    ),
    cell: (ctx) => <AlertIcons alerts={ctx.row.original.alerts} />,
  }),
  helper.accessor((p) => updatedMs(p), {
    id: "updated",
    sortFn: "alphanumeric",
    size: 10,
    header: "Updated",
    cell: (ctx) => (
      <span
        className="block whitespace-nowrap text-right font-mono text-[11px] tabular-nums text-muted-foreground"
        title={dateTooltip(ctx.row.original.updatedAt)}
      >
        {relativeTime(ctx.row.original.updatedAt)}
      </span>
    ),
  }),
]);

function openProjectRow(path: string): void {
  window.location.href = projectHref(path);
}

export function McFleetLedger(_props: RegisteredWidgetProps) {
  const workspace = useWorkspace();
  const { cols, rows: placedRows } = useWidgetSize();

  const visible = useMemo(
    () => workspace.projects.filter((p) => fleetMatches(p, workspace.filter)),
    [workspace.projects, workspace.filter],
  );

  // The placed height buys the visible window: ~3 table rows per 96px cell,
  // chrome reserved. The narrow register (KvList) buys ~4 lines per cell.
  const wide = cols > 4;
  const cap = Math.max(3, Math.floor(placedRows * (wide ? 3 : 3.4)) - 1);

  const shown = useMemo(() => {
    const sorted = [...visible].sort((a, b) => updatedMs(b) - updatedMs(a));
    return sorted.slice(0, cap);
  }, [visible, cap]);
  const overflow = visible.length - shown.length;

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
        {wide ? (
          <div className="min-h-0 min-w-0">
            <DataTable
              columns={columns}
              data={shown}
              initialSort={[{ id: "updated", desc: true }]}
              minWidth={420}
              onRowClick={(p) => openProjectRow(p.path)}
              ariaLabel="Fleet status, one row per project: state, unit, stack, branch, sync counts, uncommitted files, activity signal, note, alerts and last update"
              empty="No units match the filter"
            />
          </div>
        ) : (
          <div className="min-h-0 min-w-0">
            <KvList
              density="compact"
              rows={shown.map((p) => ({
                label: p.name,
                value: relativeTime(p.updatedAt),
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
