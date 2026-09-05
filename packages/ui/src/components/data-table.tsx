import { useState } from "react";
import type { ReactNode } from "react";
import {
  columnFilteringFeature,
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
  CellContext,
  ColumnDef,
  Header,
  RowData,
  SortingState,
} from "@tanstack/react-table";

import { cn } from "@workspace-welcome/ui/lib/utils";

/**
 * DataTable — the ONE table shell (TanStack v9) with McTable's proven
 * feature set: sorting, column visibility, column sizing, the sorted row
 * model, and optional includes-string filtering. Fixed layout with ratio
 * widths from column sizes.
 *
 * NEVER SCROLLS INTERNALLY: there is no overflow-auto here — `minWidth`
 * (default 420; fleet-scale tables pass 720) is the authored floor, and
 * below it the widget's `sizes` ladder swaps to KVList instead. Rows stamp
 * `data-sort-key={row.id}` for the harness; sortable header buttons stamp
 * `data-sort-key={column.id}` plus `data-sort-direction="asc"|"desc"`
 * (absent when unsorted) as the sort interaction contract.
 */

const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
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
});

export type DataTableFeatures = typeof features;

export function createDataTableColumnHelper<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>();
}

export type DataTableColumns<TData extends RowData> = ReturnType<
  ReturnType<typeof createDataTableColumnHelper<TData>>["columns"]
>;

export interface DataTableProps<TData extends RowData> {
  columns: DataTableColumns<TData> | readonly ColumnDef<DataTableFeatures, TData, unknown>[];
  data: TData[];
  initialSort?: SortingState;
  /** Row click (e.g. open the project page). Rows render as interactive. */
  onRowClick?: (row: TData) => void;
  /** px content floor — below it, callers ladder down (KVList), never scroll. */
  minWidth?: number;
  ariaLabel: string;
  /** Rendered when data is empty. */
  empty?: ReactNode;
  className?: string;
}

/** Pixel floor below which callers should ladder down to KVList. */
export const MIN_CONTENT = { w: 420, h: 96 };

export function DataTable<TData extends RowData>({
  columns,
  data,
  initialSort = [],
  onRowClick,
  minWidth = 420,
  ariaLabel,
  empty,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>(initialSort);

  const table = useTable({
    features,
    columns: columns as ColumnDef<DataTableFeatures, TData, unknown>[],
    data,
    state: { sorting },
    onSortingChange: setSorting,
  });

  const totalSize = Math.max(table.getTotalSize(), 1);
  const rows = table.getRowModel().rows;

  return (
    <div
      data-part="data-table"
      className={cn("w-full min-w-0", className)}
    >
      <table
        className="w-full border-collapse"
        style={{ tableLayout: "fixed", minWidth: `${minWidth}px` }}
      >
        <caption className="sr-only">{ariaLabel}</caption>
        <thead>
          <tr className="border-b border-border text-left">
            {table.getHeaderGroups()[0]?.headers.map((header) => {
              const canSort = header.column.getCanSort();
              const sorted = header.column.getIsSorted();
              return (
                <th
                  key={header.id}
                  scope="col"
                  className="pb-1.5 font-medium"
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
                    data-sort-key={canSort ? header.column.id : undefined}
                    data-sort-direction={
                      canSort && sorted !== false ? sorted : undefined
                    }
                    onClick={
                      canSort ? header.column.getToggleSortingHandler() : undefined
                    }
                    onKeyDown={
                      canSort
                        ? (event) => {
                            // Synthetic (untrusted) Enter/Space doesn't trigger
                            // native button activation, so the harness can't
                            // rely on click — mirror the activation here.
                            // preventDefault keeps a real keyboard press from
                            // ALSO firing the native click (double toggle).
                            if (event.key !== "Enter" && event.key !== " ") {
                              return;
                            }
                            event.preventDefault();
                            header.column.getToggleSortingHandler()?.(event);
                          }
                        : undefined
                    }
                    disabled={!canSort}
                    className={cn(
                      "flex items-center gap-1 text-[10px] tracking-[0.08em] uppercase outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      canSort
                        ? "cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                        : "text-muted-foreground/70",
                    )}
                  >
                    <DataTableHeaderLabel header={header} />
                    {sorted !== false ? (
                      <span
                        aria-hidden
                        className="text-[8px] leading-none"
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
              data-sort-key={row.id}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              className={cn(
                "border-b border-border/50",
                onRowClick &&
                  "cursor-pointer transition-colors hover:bg-muted/40 focus-visible:bg-muted/40",
              )}
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className="overflow-hidden px-1 py-1.5 align-middle text-xs first:pl-2 last:pr-2"
                >
                  {renderDataTableCell(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-4 text-center text-xs text-muted-foreground">
                {empty ?? "nothing to list"}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function renderDataTableCell<TData extends RowData>(
  render: ColumnDef<DataTableFeatures, TData, unknown>["cell"],
  context: CellContext<DataTableFeatures, TData, unknown>,
): ReactNode {
  if (typeof render === "function") {
    const out = render(context);
    return out ?? null;
  }
  return render ?? null;
}

function DataTableHeaderLabel<TData extends RowData>({
  header,
}: {
  header: Header<DataTableFeatures, TData, unknown>;
}) {
  const render = header.column.columnDef.header;
  if (typeof render === "string") return <>{render}</>;
  if (typeof render === "function") {
    const out = render(header.getContext());
    return out == null ? null : <>{out}</>;
  }
  return <>{header.column.id}</>;
}
