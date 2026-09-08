/**
 * McProjectCommits — the "Recent commits" panel (port of the design's
 * overview-tab `CommitsTable`, `routes/designs/mission-control/
 * project.$.tsx` + `report-widgets.tsx`): the live commit log as a sortable
 * ledger — when, author, subject, short sha in the accent register —
 * newest first. Rides the ONE cached commit-log entry from
 * `useProject().commitLog` (the design's shared-cache rule). Rows cap at
 * the placed height with an honest footer.
 */
import { useMemo } from "react";

import {
  createDataTableColumnHelper,
  DataTable,
} from "@workspace-welcome/ui/components/data-table";

import { relativeTime } from "@/lib/format";
import { useProject } from "@/widgets/contexts/project-context";
import type { RegisteredWidgetProps } from "@/components/widgets/registry";
import { useWidgetSize, WidgetShell } from "@/components/widgets/widget-shell";

interface CommitRow {
  hash: string;
  subject: string;
  author: string;
  timestamp: number;
}

const commitHelper = createDataTableColumnHelper<CommitRow>();

const commitColumns = commitHelper.columns([
  commitHelper.accessor((r) => r.timestamp, {
    id: "date",
    sortFn: "alphanumeric",
    size: 14,
    header: "When",
    cell: (ctx) => (
      <span className="block whitespace-nowrap font-mono text-[10px] tabular-nums text-muted-foreground">
        {relativeTime(new Date(ctx.getValue() * 1000).toISOString())}
      </span>
    ),
  }),
  commitHelper.accessor((r) => r.author, {
    id: "author",
    sortFn: "alphanumeric",
    size: 16,
    header: "Author",
    cell: (ctx) => (
      <span className="block truncate font-mono text-[10px] text-muted-foreground">
        {ctx.getValue()}
      </span>
    ),
  }),
  commitHelper.accessor((r) => r.subject, {
    id: "subject",
    sortFn: "alphanumeric",
    size: 56,
    header: "Commit",
    cell: (ctx) => (
      <span className="block truncate text-[11px] text-foreground" title={ctx.getValue()}>
        {ctx.getValue()}
      </span>
    ),
  }),
  commitHelper.accessor((r) => r.hash, {
    id: "hash",
    enableSorting: false,
    size: 12,
    header: "Sha",
    cell: (ctx) => (
      <span className="block text-right font-mono text-[10px] text-(--mc-accent)">
        {ctx.getValue().slice(0, 7)}
      </span>
    ),
  }),
]);

export function McProjectCommits(_props: RegisteredWidgetProps) {
  const project = useProject();
  const commits = project.commitLog.data ?? [];
  const placed = useWidgetSize();

  const rows = useMemo<CommitRow[]>(
    () =>
      commits.map((c) => ({
        hash: c.hash,
        subject: c.subject,
        author: c.author,
        timestamp: c.timestamp,
      })),
    [commits],
  );

  // The placed height buys the visible window: ~3 ledger rows per 96px cell.
  const cap = Math.max(3, Math.floor(placed.rows * 3) - 1);
  const shown = rows.slice(0, cap);
  const overflow = rows.length - shown.length;

  return (
    <WidgetShell className="h-full w-full">
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-1 overflow-hidden px-3.5 pb-3">
        <div className="min-h-0 min-w-0">
          <DataTable
            columns={commitColumns}
            data={shown}
            initialSort={[{ id: "date", desc: true }]}
            minWidth={400}
            ariaLabel="Commit history: date, author, message, short hash"
            empty="no commits"
          />
        </div>
        {overflow > 0 ? (
          <p className="mt-auto shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
            +{overflow} more in the log
          </p>
        ) : null}
      </div>
    </WidgetShell>
  );
}
