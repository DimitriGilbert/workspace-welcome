import { useQuery } from "@tanstack/react-query";

import { CommitGraph } from "@workspace-welcome/ui/components/commit-graph";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { dateTooltip } from "@/lib/format";
import { useTRPC } from "@/utils/trpc";

/** git author time is unix seconds (%at) — ISO for the format helpers. */
function isoFromUnix(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

/** Placeholder row widths while the log loads — varied so it reads as rows. */
const SKELETON_WIDTHS = ["w-2/3", "w-1/2", "w-3/4", "w-2/5", "w-3/5"];

/**
 * The "history" cell of the vitals band: the commit graph fed by
 * `projects.commitLog`, scrolled when long. Errors stay inline (a graph is
 * never worth a toast), and non-repos get the same quiet muted line as the
 * neighbouring cells.
 */
export function CommitHistoryCell({
  path,
  isRepo,
}: {
  path: string;
  isRepo: boolean;
}) {
  const trpc = useTRPC();
  const history = useQuery({
    ...trpc.projects.commitLog.queryOptions({ path, limit: 200 }),
    enabled: isRepo,
  });

  if (!isRepo) {
    return <p className="text-xs text-muted-foreground">No git data.</p>;
  }
  if (history.isPending) {
    return (
      <div aria-hidden className="flex flex-col gap-2">
        {SKELETON_WIDTHS.map((width) => (
          <Skeleton key={width} className={cn("h-5", width)} />
        ))}
      </div>
    );
  }
  if (history.isError) {
    return (
      <p className="text-xs" style={{ color: "var(--sev-error)" }}>
        {history.error.message}
      </p>
    );
  }
  if (history.data.length === 0) {
    return <p className="text-xs text-muted-foreground">No commits yet.</p>;
  }
  return (
    <>
      <p className="text-xs text-muted-foreground">
        {history.data.length === 1
          ? "1 commit, newest first."
          : `${history.data.length} commits, newest first.`}
      </p>
      <div className="max-h-64 min-h-0 overflow-y-auto pr-1">
        <CommitGraph
          // commitLog entries are shape-identical to CommitGraphEntry.
          entries={history.data}
          renderHoverDetail={(entry) => (
            <div className="flex min-w-0 flex-col gap-1">
              <span className="line-clamp-2 text-xs font-semibold leading-snug">
                {entry.subject}
              </span>
              <span className="min-w-0 truncate font-mono text-[0.65rem] text-muted-foreground">
                {entry.hash.slice(0, 7)} · {entry.author} ·{" "}
                {dateTooltip(isoFromUnix(entry.timestamp))}
              </span>
            </div>
          )}
        />
      </div>
    </>
  );
}
