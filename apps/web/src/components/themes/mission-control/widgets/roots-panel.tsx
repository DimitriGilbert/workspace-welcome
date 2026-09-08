/**
 * McRoots — the registered-roots ledger (port of the design's `RootsPanel`
 * body, `components/designs/mission-control/analytics-zone.tsx`): one row
 * per tracked root with its live project count (accent numerals), the
 * scan's read errors surfaced under the register, and the Manage link to
 * settings. The roots query result is exposed raw by the workspace context
 * (never copied); per-root counts derive from the working set.
 */
import { useMemo } from "react";
import { ArrowUpRight } from "lucide-react";

import {
  createDataTableColumnHelper,
  DataTable,
} from "@workspace-welcome/ui/components/data-table";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";

import { useWorkspace } from "@/lib/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/components/widgets/registry";
import { useWidgetSize, WidgetShell } from "@/components/widgets/widget-shell";

interface RootRow {
  id: string;
  label: string;
  path: string;
  count: number;
}

const rootHelper = createDataTableColumnHelper<RootRow>();

const rootColumns = rootHelper.columns([
  rootHelper.accessor((r) => r.label, {
    id: "root",
    sortFn: "alphanumeric",
    size: 24,
    header: "Root",
    cell: (ctx) => (
      <span className="block truncate text-[11.5px] text-foreground" title={ctx.row.original.path}>
        {ctx.getValue()}
      </span>
    ),
  }),
  rootHelper.accessor((r) => r.count, {
    id: "units",
    sortFn: "alphanumeric",
    size: 10,
    header: "Units",
    cell: (ctx) => (
      <span className="block text-right font-mono text-[11px] tabular-nums text-(--mc-accent)">
        {ctx.getValue()}
      </span>
    ),
  }),
]);

export function McRoots(_props: RegisteredWidgetProps) {
  const workspace = useWorkspace();
  const roots = workspace.roots;
  const placed = useWidgetSize();
  const tall = placed.rows >= 2;

  const rows = useMemo<RootRow[]>(
    () =>
      (roots.data ?? []).map((root) => ({
        id: root.id,
        label: root.label.length > 0 ? root.label : root.path,
        path: root.path,
        count: workspace.projects.filter((p) => p.rootId === root.id).length,
      })),
    [roots.data, workspace.projects],
  );

  return (
    <WidgetShell
      className="h-full w-full"
      meta={
        <span className="hidden font-mono text-[10px] tabular-nums text-muted-foreground @[240px]:block">
          {roots.isError ? "unavailable" : `${roots.data?.length ?? 0} registered`}
        </span>
      }
      action={
        <a
          href="/settings"
          className="hidden items-center gap-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground outline-none transition-colors hover:text-(--mc-accent) focus-visible:ring-1 focus-visible:ring-ring @[240px]:inline-flex"
        >
          Manage <ArrowUpRight aria-hidden className="size-3" />
        </a>
      }
    >
      {roots.isPending ? (
        <div className="flex h-full min-h-0 w-full flex-col justify-center gap-2 px-3.5 pb-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : roots.isError ? (
        <div className="flex h-full min-h-0 w-full items-center px-3.5 pb-2">
          <p role="alert" className="font-mono text-[10px] leading-relaxed text-(--sev-critical)">
            {roots.error?.message ?? "roots unavailable"}
          </p>
        </div>
      ) : tall ? (
        <>
          <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3.5 pb-2 @[240px]:hidden">
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {rows.reduce((sum, r) => sum + r.count, 0)} units · {rows.length} roots
            </p>
          </div>
          <div className="hidden h-full min-h-0 w-full min-w-0 flex-col gap-2 overflow-hidden px-3.5 pb-3 @[240px]:flex">
            <div className="min-h-0 min-w-0">
              <DataTable
                columns={rootColumns}
                data={rows}
                initialSort={[{ id: "units", desc: true }]}
                minWidth={140}
                ariaLabel="Registered scan roots: label, project count"
                empty="no roots registered"
              />
            </div>
            {workspace.rootErrors.map((e) => (
              <p key={e.rootId} className="font-mono text-[10px] leading-relaxed text-(--sev-critical)">
                Unreadable <span className="break-all">{e.path}</span>: {e.message}
              </p>
            ))}
          </div>
        </>
      ) : (
        <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3.5 pb-2">
          <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {rows.reduce((sum, r) => sum + r.count, 0)} units · {rows.length} roots
          </p>
        </div>
      )}
    </WidgetShell>
  );
}
