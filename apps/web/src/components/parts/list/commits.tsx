import type { ComponentPropsWithoutRef, RefObject } from "react";
import { useEffect, useRef, useState } from "react";

import { CommitGraph } from "@workspace-welcome/ui/components/commit-graph";
import type { CommitGraphEntry } from "@workspace-welcome/ui/components/commit-graph";
import {
  createDataTableColumnHelper,
  DataTable,
} from "@workspace-welcome/ui/components/data-table";
import { KvList } from "@workspace-welcome/ui/components/kv-list";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";
import { WidgetTabs } from "@workspace-welcome/ui/components/widget-tabs";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { relativeTime } from "@/lib/format";
import { useCommitLogQuery } from "@/lib/queries/commit-log";

import { useProject } from "@/lib/contexts/project-context";

/**
 * CommitsList — the per-repo commit history in three views (master plan
 * §3.5): `table` (DataTable), `graph` (CommitGraph lanes), `list` (KvList
 * register). Reads ride the `useCommitLogQuery(path, limit)` DIRECT hook —
 * the sanctioned narrower-window path beside the provider's single cached
 * limit-200 entry (§3.4 hook-safety rule); the default limit hits that same
 * cache entry, so a page with several commit widgets fetches once.
 *
 * With `view` set the part renders that one view; without it a WidgetTabs
 * switcher (the ONE tabs implementation) picks among all three. No inner
 * scroller lives here — height is the widget ladder's job.
 *
 * The table presentation has a hard floor: the DataTable's min-content is
 * ~420px (three columns of commit register), so below `TABLE_FLOOR_PX` of
 * rendered width the part self-degrades — the default becomes the list
 * register and the switcher drops the Table tab (the shell ruling's part
 * half: pixel variance WITHIN a rung is the part's job). Above the floor
 * nothing changes.
 */

export type CommitsView = "table" | "graph" | "list";

/** Rendered width under which the DataTable cannot fit a container
 * (~420px min-content + slack) — micro rungs get non-table views. */
const TABLE_FLOOR_PX = 440;

export interface CommitsListProps extends ComponentPropsWithoutRef<"div"> {
  /** Commit cap; default 200 — the provider's cached entry. */
  limit?: number;
  /** Fixed view; omitted → internal tab switcher over all three. */
  view?: CommitsView;
  /** Dense register: 22px rows with inline sha · author · age trailing
   * meta — the board-ledger register (more rows per cell). */
  dense?: boolean;
}

const VIEW_TABS: { id: CommitsView; label: string }[] = [
  { id: "table", label: "Table" },
  { id: "graph", label: "Graph" },
  { id: "list", label: "List" },
];

/** Narrow a WidgetTabs id (plain string) back to a view. */
function toView(id: string): CommitsView | null {
  return VIEW_TABS.find((t) => t.id === id)?.id ?? null;
}

const helper = createDataTableColumnHelper<CommitGraphEntry>();

const commitColumns = [
  helper.accessor("subject", {
    header: "Subject",
    cell: (info) => (
      <span className="block truncate" title={info.getValue()}>
        {info.getValue()}
      </span>
    ),
    size: 56,
  }),
  helper.accessor("author", {
    header: "Author",
    cell: (info) => (
      <span className="block truncate text-muted-foreground" title={info.getValue()}>
        {info.getValue()}
      </span>
    ),
    size: 24,
  }),
  helper.accessor("timestamp", {
    header: "When",
    cell: (info) => (
      <span className="block truncate text-muted-foreground tabular-nums">
        {commitAge(info.getValue())}
      </span>
    ),
    size: 20,
  }),
];

function commitAge(timestamp: number): string {
  return relativeTime(new Date(timestamp * 1000).toISOString());
}

/** Observe an element's content-box width; `null` until the first
 * observation (SSR / first frame renders the wide-container default). */
function useObservedWidth(ref: RefObject<HTMLDivElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export function CommitsList({
  limit = 200,
  view,
  dense,
  className,
  ...rest
}: CommitsListProps) {
  const path = useProject().path;
  const commitLog = useCommitLogQuery(path, limit);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const width = useObservedWidth(rootRef);
  const tableFits = width === null || width >= TABLE_FLOOR_PX;
  const [tab, setTab] = useState<CommitsView>("table");
  const tabs = tableFits ? VIEW_TABS : VIEW_TABS.filter((t) => t.id !== "table");
  const active: CommitsView =
    view ?? (tab === "table" && !tableFits ? "list" : tab);
  const commits = commitLog.data ?? [];

  return (
    <div ref={rootRef} className={cn("flex min-h-0 min-w-0 flex-col gap-2", className)} {...rest}>
      {view === undefined ? (
        <WidgetTabs
          tabs={tabs}
          active={active}
          onChange={(id) => {
            const next = toView(id);
            if (next !== null) setTab(next);
          }}
          size="sm"
          ariaLabel="Commit history view"
        />
      ) : null}
      <div className="min-h-0 min-w-0 flex-1">
        {commitLog.isPending ? (
          <div className="flex flex-col gap-2 py-1">
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : commitLog.isError ? (
          <p
            role="alert"
            className="text-xs"
            style={{ color: "var(--sev-critical)" }}
          >
            {commitLog.error.message}
          </p>
        ) : commits.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">No git data.</p>
        ) : active === "graph" ? (
          <CommitGraph
            entries={commits}
            dense={dense}
            renderHoverDetail={(entry) => (
              <span className="flex flex-col gap-0.5">
                <span>{entry.subject}</span>
                <span className="text-muted-foreground">
                  {entry.author} · {commitAge(entry.timestamp)}
                  {" · "}
                  {entry.hash.slice(0, 7)}
                </span>
              </span>
            )}
            renderTrailing={
              dense
                ? (entry) => (
                    <>
                      <span className="hidden font-mono text-[10px] text-muted-foreground @[520px]:inline">
                        {entry.author}
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {commitAge(entry.timestamp)}
                      </span>
                      <span className="font-mono text-[10px] text-foreground">
                        {entry.hash.slice(0, 7)}
                      </span>
                    </>
                  )
                : undefined
            }
          />
        ) : active === "list" ? (
          <KvList
            density="compact"
            rows={commits.map((c) => ({
              label: commitAge(c.timestamp),
              value: c.isHead ? `● ${c.subject}` : c.subject,
              mono: false,
            }))}
          />
        ) : (
          <DataTable
            columns={commitColumns}
            data={commits}
            initialSort={[{ id: "timestamp", desc: true }]}
            ariaLabel="Commit history"
            empty="No commits in this window."
          />
        )}
      </div>
    </div>
  );
}
