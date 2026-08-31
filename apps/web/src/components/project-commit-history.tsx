import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace-welcome/ui/components/card";
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
const SKELETON_WIDTHS = ["w-2/3", "w-1/2", "w-3/4", "w-2/5", "w-3/5", "w-1/2"];

/**
 * The full-width "History" block at the bottom of the project page: the
 * commit graph fed by `projects.commitLog`. Errors stay inline (a graph is
 * never worth a toast), and an empty repo gets a one-line state instead of
 * a blank card. Visibility for non-repos is decided by the page.
 */
export function ProjectCommitHistory({ path }: { path: string }) {
  const trpc = useTRPC();
  const history = useQuery(
    trpc.projects.commitLog.queryOptions({ path, limit: 200 }),
  );

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" />
          History
        </CardTitle>
        <CardDescription>
          {history.isError
            ? "Commit history unavailable."
            : history.data === undefined
              ? "Most recent commits."
              : history.data.length === 1
                ? "1 commit."
                : `${history.data.length} commits, newest first.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {history.isPending ? (
          <div aria-hidden className="flex flex-col gap-2">
            {SKELETON_WIDTHS.map((width) => (
              <Skeleton key={width} className={cn("h-5", width)} />
            ))}
          </div>
        ) : history.isError ? (
          <p className="text-xs" style={{ color: "var(--sev-error)" }}>
            {history.error.message}
          </p>
        ) : history.data.length === 0 ? (
          <p className="text-xs text-muted-foreground">No commits yet.</p>
        ) : (
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
        )}
      </CardContent>
    </Card>
  );
}
