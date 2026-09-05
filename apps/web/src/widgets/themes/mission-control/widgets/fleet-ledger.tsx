/**
 * McFleetLedger — the fleet ledger (T2 port of the design's `FleetTable`,
 * `components/designs/mission-control/fleet-table.tsx`, onto the system's
 * table conventions: ui `DataTable` — TanStack v9, sortable headers, ratio
 * widths, `data-sort-key` rows — never scrolling internally).
 *
 * Port notes against the design:
 * - The command bar's filter executes here over the visible set (the design
 *   feeds it through the table's filter row model; the working set is
 *   already narrowed by the workspace filter).
 * - Rows open the project through the unit link (an anchor to this theme's
 *   project route — the V3 same-theme contract); the design's whole-row
 *   click and the per-row `ProjectActions` menu are a project-page concern
 *   now (the parts barrel's git toolbar lives on the project page, T3).
 * - The stack glyph column renders as the stack's text label (the icon
   module is outside this theme's import surface).
 * - Below the DataTable's 420px minWidth the ladder swaps to a `KvList`
 *   register (the documented convention — no internal scroll, no overflow).
 *   Row counts cap at the placed height (≈3 table rows per 96px cell) with
 *   an honest "+N more" footer — the console shows a window, the design's
 *   panel scroll becomes the rung's business.
 */
import { useMemo } from "react";

import type { Project } from "@workspace-welcome/api/lib/types";
import {
  createDataTableColumnHelper,
  DataTable,
} from "@workspace-welcome/ui/components/data-table";
import { KvList } from "@workspace-welcome/ui/components/kv-list";
import { PulseStrip } from "@workspace-welcome/ui/components/pulse-strip";
import { SeverityDots } from "@workspace-welcome/ui/components/severity-dots";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { dateTooltip, relativeTime } from "@/lib/format";
import { pulseCells, updatedMs } from "@/lib/scan-metrics";
import { ProjectLed } from "@/widgets/parts";
import { useWorkspace } from "@/widgets/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { useWidgetSize, WidgetShell } from "@/widgets/runtime/widget-shell";

/**
 * Fleet helpers shared by the console kinds (kept here — a widget-kind file
 * in the invariant-5 sense; `fleetMatches` is the design's ledger haystack,
 * ported from `components/designs/mission-control/fleet-table.tsx`: name,
 * note, branch, stack label and alert messages, AND-semantics across
 * whitespace terms. The console narrows by alert text, which the production
 * matcher (`@/lib/search` matchProject) does not cover). `projectHref`
 * targets this theme's project route — the same-theme navigation contract
 * (V3): never `/designs`, never legacy `/projects/`.
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

/** Quiet middot when there is nothing to report (the design's `N`). */
function Quiet({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("tabular-nums", className)}>{children}</span>;
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
      cells={pulseCells(project, 16, now)}
      ariaLabel={`Activity pulse for ${project.name}`}
      className="w-full max-w-40"
    />
  );
}

function SyncCell({ project }: { project: Project }) {
  const ahead = project.git.ahead ?? 0;
  const behind = project.git.behind ?? 0;
  if (ahead === 0 && behind === 0) {
    return <Quiet className="text-muted-foreground/40">·</Quiet>;
  }
  return (
    <Quiet className="whitespace-nowrap">
      {ahead > 0 ? <span className="text-(--mc-accent)">{ahead}</span> : <span className="text-muted-foreground/40">·</span>}
      <span className="mx-1 text-muted-foreground/40">/</span>
      {behind > 0 ? <span className="text-(--sev-warning)">{behind}</span> : <span className="text-muted-foreground/40">·</span>}
    </Quiet>
  );
}

const columns = helper.columns([
  helper.display({
    id: "state",
    size: 6,
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
          className="flex max-w-full items-center gap-1.5 truncate text-left text-[13px] font-medium tracking-tight text-foreground outline-none transition-colors hover:text-(--mc-accent) focus-visible:ring-1 focus-visible:ring-ring"
          title={p.name}
        >
          <span className="truncate">{p.name}</span>
          {p.pinned ? (
            <span aria-label="Pinned" className="shrink-0 text-[10px]" style={{ color: "var(--pinned-accent)" }}>
              ◆
            </span>
          ) : null}
        </a>
      );
    },
  }),
  helper.accessor((p) => p.stack?.label ?? "", {
    id: "stack",
    sortFn: "alphanumeric",
    size: 10,
    header: () => (
      <abbr title="Detected stack" className="no-underline">
        Stk
      </abbr>
    ),
    cell: (ctx) => (
      <span className="block truncate font-mono text-[10px] text-muted-foreground" title={ctx.row.original.stack?.label ?? "No stack detected"}>
        {ctx.getValue()}
      </span>
    ),
  }),
  helper.accessor((p) => (p.git.isRepo ? (p.git.branch ?? "detached") : ""), {
    id: "branch",
    sortFn: "alphanumeric",
    size: 14,
    header: "Branch",
    cell: (ctx) => (
      <span className="block truncate font-mono text-[11px] text-muted-foreground">
        {ctx.getValue() === "" ? "no git" : ctx.getValue()}
      </span>
    ),
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
    size: 7,
    header: () => (
      <abbr title="Uncommitted files" className="no-underline">
        Dirty
      </abbr>
    ),
    cell: (ctx) => {
      const dirty = ctx.getValue();
      return (
        <span className="block text-right font-mono text-[11px]">
          {dirty > 0 ? (
            <span className="text-(--sev-warning)">{dirty}</span>
          ) : (
            <span className="text-muted-foreground/40">·</span>
          )}
        </span>
      );
    },
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
    size: 20,
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
    cell: (ctx) => (
      <SeverityDots
        dots={ctx.row.original.alerts.map((a) => ({
          id: a.code,
          severity: a.severity,
          message: a.message,
        }))}
      />
    ),
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
        <div className="flex h-full min-h-0 w-full flex-col justify-center gap-2 px-3 pb-2">
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
        <div className="flex h-full min-h-0 w-full flex-col justify-center gap-2 px-3 pb-2">
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
        <div className="flex h-full min-h-0 w-full items-center justify-center px-3 pb-2">
          <p className="text-xs text-muted-foreground">
            No units on record — add a scan root to begin the ledger.
          </p>
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell className="h-full w-full">
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-1.5 overflow-hidden px-3 pb-2">
        <p className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground">
          Fleet
          <span className="ml-2 tabular-nums">
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
          <p className="mt-auto shrink-0 pt-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
            +{overflow} more in the ledger
          </p>
        ) : null}
      </div>
    </WidgetShell>
  );
}
