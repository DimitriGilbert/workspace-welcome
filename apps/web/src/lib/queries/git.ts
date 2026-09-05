import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/utils/trpc";

/**
 * Branch-picker queries for the widget system's interactive git parts
 * (`widgets/parts/git/*`). Like every module in `lib/queries/`: consumers
 * pass a scope (project path) and an `enabled` gate, never a cache key;
 * identical input ⇒ identical entry, so the two pickers share one fetch.
 * Invalidations ride the project provider's settle path (scan + commitLog),
 * which covers these derived reads too.
 */

/**
 * Local + origin branch names for a repo. `enabled` is the dialog gate —
 * both git pickers only need the list while open, so browsing project pages
 * never spawns a git call.
 */
export function useBranchesQuery(path: string, enabled = false) {
  const trpc = useTRPC();
  return useQuery(
    trpc.projects.branches.queryOptions(
      { path },
      { enabled: enabled && path.length > 0 },
    ),
  );
}

/**
 * The switch-safety probe (uncommitted work, git lock, index recency) —
 * read exactly when the branch picker is confirming a switch. The provider's
 * scan invalidations after any git op keep repeated probes honest.
 */
export function useSwitchSafetyQuery(path: string, enabled = false) {
  const trpc = useTRPC();
  return useQuery(
    trpc.projects.switchSafety.queryOptions(
      { path },
      { enabled: enabled && path.length > 0 },
    ),
  );
}
