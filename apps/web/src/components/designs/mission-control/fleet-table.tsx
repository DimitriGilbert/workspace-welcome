import { useEffect, useState } from "react";
import {
  columnFilteringFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createCoreRowModel,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import type {
  Cell,
  ColumnFiltersState,
  ColumnSizingState,
  Header,
  SortingState,
  Updater,
} from "@tanstack/react-table";
import { GitFork, Pin } from "lucide-react";

import { cn } from "@workspace-welcome/ui/lib/utils";
import type { Project } from "@workspace-welcome/api/lib/types";

import { AlertIcons } from "@/components/git-badges";
import { dateTooltip, relativeTime } from "@/lib/format";
import { stackIcon } from "@/lib/icons";
import { freshness } from "@/lib/recency";

import { updatedMs } from "./metrics";
import { ProjectActions } from "./project-actions";
import { PulseStrip } from "./pulse-strip";
import { useOpenDesignProject } from "./use-open-design-project";

// ---------------------------------------------------------------------------
// Feature set — assembled once per module load. Sort/filter registries stay
// built-in; the severity ordering and the fleet haystack filter are passed
// inline as column options below.
// ---------------------------------------------------------------------------

function severityRankOf(p: Project): number {
  if (p.alerts.some((a) => a.severity === "error")) return 0;
  if (p.alerts.some((a) => a.severity === "warn")) return 1;
  if (p.alerts.some((a) => a.severity === "info")) return 2;
  return 3;
}

/** Search haystack: the fields an operator might filter the fleet by. */
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

const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  coreRowModel: createCoreRowModel(),
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
  },
  filterFns: {
    includesString: filterFn_includesString,
  },
  tableMeta: {} as { now: number },
});

const columnHelper = createColumnHelper<typeof features, Project>();

const columns = columnHelper.columns([
  columnHelper.display({
    id: "state",
    size: 40,
    enableResizing: false,
    header: () => <span className="sr-only">State</span>,
    cell: (ctx) => (
      <StatusLed project={ctx.row.original} now={ctx.table.options.meta?.now ?? 0} />
    ),
  }),
  columnHelper.accessor((p) => p.name, {
    id: "unit",
    sortFn: "alphanumeric",
    filterFn: (row, _columnId, filterValue) =>
      fleetHaystack(row.original).includes(String(filterValue).toLowerCase()),
    size: 230,
    header: "Unit",
    cell: (ctx) => <UnitCell project={ctx.row.original} />,
  }),
  columnHelper.accessor((p) => p.stack?.label ?? "", {
    id: "stack",
    sortFn: "alphanumeric",
    size: 52,
    header: () => (
      <abbr title="Detected stack" className="no-underline">
        Stk
      </abbr>
    ),
    cell: (ctx) => <StackCell project={ctx.row.original} />,
  }),
  columnHelper.accessor((p) => (p.git.isRepo ? (p.git.branch ?? "detached") : ""), {
    id: "branch",
    sortFn: "alphanumeric",
    size: 150,
    header: "Branch",
    cell: (ctx) => <BranchCell project={ctx.row.original} />,
  }),
  columnHelper.accessor((p) => (p.git.ahead ?? 0) + (p.git.behind ?? 0), {
    id: "sync",
    sortFn: "alphanumeric",
    size: 84,
    header: () => (
      <abbr title="Commits ahead / behind upstream" className="no-underline">
        Up/Dn
      </abbr>
    ),
    cell: (ctx) => <SyncCell project={ctx.row.original} />,
  }),
  columnHelper.accessor((p) => p.git.dirtyCount ?? 0, {
    id: "dirty",
    sortFn: "alphanumeric",
    size: 72,
    header: () => (
      <abbr title="Uncommitted files" className="no-underline">
        Dirty
      </abbr>
    ),
    cell: (ctx) => (
      <span className="block text-right">
        <N value={ctx.row.original.git.dirtyCount} tone="warn" />
      </span>
    ),
  }),
  columnHelper.display({
    id: "signal",
    size: 200,
    header: "Signal",
    cell: (ctx) => (
      <PulseStrip
        project={ctx.row.original}
        now={ctx.table.options.meta?.now ?? 0}
        className="w-full max-w-52"
      />
    ),
  }),
  columnHelper.accessor((p) => p.note ?? p.git.lastCommit?.message ?? "", {
    id: "note",
    enableSorting: false,
    size: 230,
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
  columnHelper.accessor((p) => p.alerts.length, {
    id: "alerts",
    // Severity ordering: errors first, then warns, infos, clean — recency
    // breaks ties. This is the triage sort.
    sortFn: (a, b) =>
      severityRankOf(a.original) - severityRankOf(b.original) ||
      updatedMs(b.original) - updatedMs(a.original),
    size: 76,
    header: () => (
      <abbr title="Open alerts (severity order)" className="no-underline">
        Alr
      </abbr>
    ),
    cell: (ctx) => <AlertIcons alerts={ctx.row.original.alerts} />,
  }),
  columnHelper.accessor((p) => updatedMs(p), {
    id: "updated",
    sortFn: "alphanumeric",
    size: 96,
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
  columnHelper.display({
    id: "actions",
    size: 76,
    enableResizing: false,
    header: () => <span className="sr-only">Actions</span>,
    cell: (ctx) => (
      <div className="flex items-center justify-end opacity-0 transition-opacity duration-75 group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100">
        <ProjectActions project={ctx.row.original} />
      </div>
    ),
  }),
]);

/** The visible sort tick: ▲ ascending, ▼ descending. */
function SortTick({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (sorted === false) return null;
  return (
    <span
      aria-hidden
      className="mc-sort-tick"
      style={{ transform: sorted === "desc" ? "rotate(180deg)" : undefined }}
    >
      ▲
    </span>
  );
}

/** Session-persisted column widths shared by every ledger surface. */
let sessionColumnSizing: Record<string, number> = {};

export interface FleetTableProps {
  projects: Project[];
  /** The route's shared data clock (ms epoch). */
  now: number;
  /** Fleet filter text from the command bar; "" disables the filter. */
  filter: string;
  initialSort?: SortingState;
}

/**
 * The fleet ledger, now a real TanStack table: clickable headers sort
 * (severity-aware on Alerts, numeric on Sync/Dirty/Updated, textual on
 * Unit/Branch), the command-bar filter runs through the table's own filter
 * row model, and every resizable column carries a visible drag handle —
 * widths commit on drag (columnResizeMode "onChange") and persist in
 * route-level state for the whole session; double-clicking a handle resets
 * that column. The PATH column is gone: a path belongs on the project page,
 * not in a truncated cell.
 */
export function FleetTable({
  projects,
  now,
  filter,
  initialSort = [{ id: "updated", desc: true }],
}: FleetTableProps) {
  const openProject = useOpenDesignProject();
  const [sorting, setSorting] = useState<SortingState>(initialSort);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  // Route-owned sizing, mirrored to module scope so navigating to a project
  // page and back keeps the operator's adjustments for the whole session.
  const [sizing, setSizing] = useState<ColumnSizingState>(sessionColumnSizing);
  const handleSizingChange = (updater: Updater<ColumnSizingState>) => {
    setSizing((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      sessionColumnSizing = next;
      return next;
    });
  };

  const table = useTable({
    features,
    columns,
    data: projects,
    state: { sorting, columnFilters, columnSizing: sizing },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnSizingChange: handleSizingChange,
    columnResizeMode: "onChange",
    meta: { now },
  });

  // The command bar owns the filter text; the table owns filter execution.
  useEffect(() => {
    table.getColumn("unit")?.setFilterValue(filter.length > 0 ? filter : undefined);
  }, [filter, table]);

  const rows = table.getRowModel().rows;
  // The ledger always fills its panel: header widths are rendered as ratios
  // of the TanStack sizes, so nothing (Updated, Actions) ever hides behind a
  // horizontal scroll on mid-size screens; a drag redistributes space toward
  // the dragged column, and the px floor keeps phones from crushing the
  // columns into mush.
  const totalSize = Math.max(table.getTotalSize(), 1);

  return (
    <div className="mc-table mc-scroll-x overflow-x-auto">
      <table
        className="w-full border-collapse"
        style={{ tableLayout: "fixed", minWidth: "720px" }}
      >
        <caption className="sr-only">
          Fleet status, one row per project: state, unit, stack, branch, sync
          counts, uncommitted files, activity signal, note, alerts and last
          update. Click a header to sort; drag a header edge to resize its
          column; double-click an edge to reset it.
        </caption>
        <thead>
          <tr className="border-b border-[var(--mc-line-strong)] text-left">
            {table.getHeaderGroups()[0]?.headers.map((header) => {
              const canSort = header.column.getCanSort();
              const sorted = header.column.getIsSorted();
              const canResize = header.column.getCanResize();
              return (
                <th
                  key={header.id}
                  scope="col"
                  className="mc-th"
                  style={{ width: `${(header.getSize() / totalSize) * 100}%` }}
                  aria-sort={
                    sorted === "asc"
                      ? "ascending"
                      : sorted === "desc"
                        ? "descending"
                        : undefined
                  }
                >
                  <button
                    type="button"
                    onClick={
                      canSort ? header.column.getToggleSortingHandler() : undefined
                    }
                    disabled={!canSort}
                    className={cn(
                      "flex items-center outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      canSort &&
                        "cursor-pointer transition-colors hover:text-[var(--mc-accent)]",
                    )}
                  >
                    <SortHeaderLabel header={header} />
                    <SortTick sorted={sorted} />
                  </button>
                  {canResize ? (
                    <span
                      role="separator"
                      aria-label={`Resize ${header.id} column`}
                      className="mc-resize-handle"
                      data-resizing={header.column.getIsResizing() || undefined}
                      onMouseDown={(e) => header.getResizeHandler()(e)}
                      onTouchStart={(e) => header.getResizeHandler()(e)}
                      onDoubleClick={() => header.column.resetSize()}
                    />
                  ) : null}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const p = row.original;
            const f = freshness(p.updatedAt, p.lastOpenedAt);
            const cold = !p.pinned && f <= 0.02 && p.alerts.length === 0;
            return (
              <tr
                key={row.id}
                onClick={() => openProject(p.path)}
                className={cn(
                  "mc-row group cursor-pointer border-b border-[var(--mc-line)]",
                  cold && "opacity-55 hover:opacity-100",
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="py-2 align-middle first:pl-4 last:pr-4"
                  >
                    {renderCell(cell)}
                  </td>
                ))}
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-6 text-center">
                <span className="mc-label">No units match the filter</span>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/** Render a cell through its column def (every cell body here is a fn). */
function renderCell(cell: Cell<typeof features, Project, unknown>) {
  const render = cell.column.columnDef.cell;
  if (typeof render === "function") {
    const out = render(cell.getContext());
    return out == null ? null : out;
  }
  return render == null ? null : render;
}

/** Header label from the column def (string or render fn). */
function SortHeaderLabel({
  header,
}: {
  header: Header<typeof features, Project, unknown>;
}) {
  const render = header.column.columnDef.header;
  if (typeof render === "string") return <>{render}</>;
  if (typeof render === "function") {
    const out = render(header.getContext());
    return out == null ? null : <>{out}</>;
  }
  return <>{header.column.id}</>;
}

function StatusLed({ project, now }: { project: Project; now: number }) {
  const worst =
    project.alerts.some((a) => a.severity === "error")
      ? "error"
      : project.alerts.some((a) => a.severity === "warn")
        ? "warn"
        : project.alerts.some((a) => a.severity === "info")
          ? "info"
          : null;
  const hot = now - updatedMs(project) < 48 * 60 * 60 * 1000;
  const tone = worst ?? (hot ? "fresh" : null);
  const label = worst ?? (hot ? "fresh" : "nominal");
  return (
    <span
      role="img"
      aria-label={`State: ${label}`}
      title={label}
      className={cn(
        "inline-block size-1.5",
        tone === "error" && "bg-[var(--sev-error)]",
        tone === "warn" && "bg-[var(--sev-warn)]",
        tone === "fresh" && "bg-[var(--mc-accent)]",
        tone === "info" && "bg-[var(--sev-info)]",
        !tone && "border border-[var(--mc-line-strong)]",
      )}
    />
  );
}

function UnitCell({ project }: { project: Project }) {
  const openProject = useOpenDesignProject();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openProject(project.path);
      }}
      className="flex max-w-full items-center gap-1.5 truncate text-left text-[13px] font-medium tracking-tight text-foreground outline-none transition-colors hover:text-[var(--mc-accent)] focus-visible:ring-1 focus-visible:ring-ring"
      title={project.name}
    >
      {project.name}
      {project.pinned ? (
        <Pin aria-hidden className="size-3 shrink-0 text-[var(--pinned-accent)]" />
      ) : null}
    </button>
  );
}

function StackCell({ project }: { project: Project }) {
  const Icon = stackIcon(project.stack?.id);
  return (
    <span
      className="flex justify-center"
      title={project.stack?.label ?? "No stack detected"}
    >
      <Icon
        aria-hidden
        className="size-3.5 text-muted-foreground group-hover:text-foreground"
      />
    </span>
  );
}

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

function SyncCell({ project }: { project: Project }) {
  const ahead = project.git.ahead ?? 0;
  const behind = project.git.behind ?? 0;
  if (ahead === 0 && behind === 0) {
    return <span className="text-muted-foreground/40">·</span>;
  }
  return (
    <span className="block whitespace-nowrap text-right font-mono text-[11px]">
      <N value={ahead} tone="up" />
      <span className="mx-1 text-muted-foreground/40">/</span>
      <N value={behind} tone="warn" />
    </span>
  );
}

/** Tabular numeral; quiet middot when there is nothing to report. */
function N({ value, tone }: { value: number | null; tone?: "up" | "warn" }) {
  if (value === null || value === 0) {
    return <span className="text-muted-foreground/40">·</span>;
  }
  return (
    <span
      className={cn(
        "tabular-nums",
        tone === "up" && "text-[var(--mc-accent)]",
        tone === "warn" && "text-[var(--sev-warn)]",
      )}
    >
      {value}
    </span>
  );
}
