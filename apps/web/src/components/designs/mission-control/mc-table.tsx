import { useState } from "react";
import {
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import type {
  CellContext,
  ColumnDef,
  Header,
  RowData,
  SortingState,
} from "@tanstack/react-table";
import type { ReactNode } from "react";

import { cn } from "@workspace-welcome/ui/lib/utils";

/**
 * The console's small-table kit: one shared TanStack feature set (sorting)
 * and one render shell for every table-ish surface outside the fleet ledger
 * — report units, commits, alert health, roots. TanStack table is not
 * optional anywhere: any tabular data goes through this.
 */

const features = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  columnSizingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
  },
});

type McFeatures = typeof features;

export function createMcColumnHelper<TData extends RowData>() {
  return createColumnHelper<McFeatures, TData>();
}

export type McColumns<TData extends RowData> = ReturnType<
  ReturnType<typeof createMcColumnHelper<TData>>["columns"]
>;

export interface McTableProps<TData extends RowData> {
  columns: McColumns<TData> | readonly ColumnDef<McFeatures, TData, unknown>[];
  data: TData[];
  initialSort?: SortingState;
  /** Row click (e.g. open the project page). Rows render as interactive. */
  onRowClick?: (row: TData) => void;
  /** px floor so phones scroll instead of crushing columns. */
  minWidth?: number;
  ariaLabel: string;
  /** Rendered when data is empty. */
  empty?: ReactNode;
  className?: string;
}

/**
 * Sortable console table shell: mono caps headers with sort ticks, ratio
 * column widths (fixed layout fills its container), hairline zebra rows.
 * Sorting state is per-instance and uncontrolled.
 */
export function McTable<TData extends RowData>({
  columns,
  data,
  initialSort = [],
  onRowClick,
  minWidth = 420,
  ariaLabel,
  empty,
  className,
}: McTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>(initialSort);

  const table = useTable({
    features,
    columns: columns as ColumnDef<McFeatures, TData, unknown>[],
    data,
    state: { sorting },
    onSortingChange: setSorting,
  });

  const totalSize = Math.max(table.getTotalSize(), 1);
  const rows = table.getRowModel().rows;

  return (
    <div className={cn("mc-table mc-scroll-x overflow-x-auto", className)}>
      <table
        className="w-full border-collapse"
        style={{ tableLayout: "fixed", minWidth: `${minWidth}px` }}
      >
        <caption className="sr-only">{ariaLabel}</caption>
        <thead>
          <tr className="border-b border-[var(--mc-line-strong)] text-left">
            {table.getHeaderGroups()[0]?.headers.map((header) => {
              const canSort = header.column.getCanSort();
              const sorted = header.column.getIsSorted();
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
                    <McHeaderLabel header={header} />
                    {sorted !== false ? (
                      <span
                        aria-hidden
                        className="mc-sort-tick"
                        style={{
                          transform: sorted === "desc" ? "rotate(180deg)" : undefined,
                        }}
                      >
                        ▲
                      </span>
                    ) : null}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              className={cn(
                "border-b border-[var(--mc-line)]",
                onRowClick && "mc-row group cursor-pointer",
              )}
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className="overflow-hidden px-1 py-1.5 align-middle first:pl-2 last:pr-2"
                >
                  {renderMcCell(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-4 text-center">
                {empty ?? <span className="mc-label">nothing to list</span>}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function renderMcCell<TData extends RowData>(
  render: ColumnDef<McFeatures, TData, unknown>["cell"],
  context: CellContext<McFeatures, TData, unknown>,
): ReactNode {
  if (typeof render === "function") {
    const out = render(context);
    return out ?? null;
  }
  return render ?? null;
}

function McHeaderLabel<TData extends RowData>({
  header,
}: {
  header: Header<McFeatures, TData, unknown>;
}) {
  const render = header.column.columnDef.header;
  if (typeof render === "string") return <>{render}</>;
  if (typeof render === "function") {
    const out = render(header.getContext());
    return out == null ? null : <>{out}</>;
  }
  return <>{header.column.id}</>;
}
