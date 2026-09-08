import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/utils/trpc";

/**
 * Per-project git commit log for the graph block. Like every module in
 * `lib/queries/`: consumers pass a scope (path), never a cache key;
 * identical input ⇒ identical key, so project pages and dialogs share one
 * cached entry per repo. Invalidations live in the query module, not here.
 */

/** Newest-first commit history for a repo; `limit` caps the fetch (default 200). */
export function useCommitLogQuery(path: string, limit = 200) {
  const trpc = useTRPC();
  return useQuery(
    trpc.projects.commitLog.queryOptions(
      { path, limit },
      { enabled: path.length > 0 },
    ),
  );
}
