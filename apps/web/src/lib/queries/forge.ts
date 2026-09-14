import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useTRPC } from "@/utils/trpc";

/**
 * Forge queries — the cached open-issue/PR state the UI renders
 * (`ForgeChips` on the lists, the project page's `ProjectForge` widget).
 * Both server procedures are pure database reads (rendering can never
 * trigger a network call), so an absent entry is the honest pre-sync
 * state: nothing is fetched to fill it. The only door to a live fetch is
 * the sync mutation below — explicit, user-initiated, and the sole
 * trigger for the invalidations that settle both queries.
 */

/** Counts change only on an explicit sync; 5 min of trust. */
const FORGE_STALE_TIME = 5 * 60_000;

/** Every linked project's cached counts — one shared fetch for all lists. */
export function useForgeOverviewQuery() {
  const trpc = useTRPC();
  return useQuery(
    trpc.forge.overview.queryOptions(undefined, { staleTime: FORGE_STALE_TIME }),
  );
}

/**
 * One overview row, inferred from the query result — the authored source is
 * the server's `ForgeOverviewEntry` (`packages/api/src/lib/forge/db.ts`);
 * this alias only re-exports the shape the wire already guarantees.
 */
export type ForgeOverviewEntry = NonNullable<
  ReturnType<typeof useForgeOverviewQuery>["data"]
>["entries"][number];

/**
 * One project's cached snapshot + mapping status. `remoteUrl` is the scan's
 * current remote (pure client data) so the server can separate
 * "unsupported host" from "never synced" without touching git.
 */
export function useForgeProjectQuery(path: string, remoteUrl: string | undefined) {
  const trpc = useTRPC();
  return useQuery(
    trpc.forge.project.queryOptions(
      { path, remoteUrl },
      { enabled: path.length > 0, staleTime: FORGE_STALE_TIME },
    ),
  );
}

/**
 * The project snapshot, inferred from the query result — the authored source
 * is the server's `ForgeProjectSnapshot` (`packages/api/src/lib/forge/db.ts`).
 */
export type ForgeProjectSnapshot = NonNullable<
  ReturnType<typeof useForgeProjectQuery>["data"]
>;

/**
 * The explicit sync: fetches fresh open issues/PRs now. Success settles BOTH
 * forge queries (the per-path snapshot and the overview the lists read);
 * failures ride plain Error messages ("Synced 2 min ago — use force",
 * "gh not authenticated…") to the toast path, verbatim.
 */
export function useForgeSyncMutation() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.forge.sync.mutationOptions({
      onSuccess: async (result) => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: trpc.forge.overview.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.forge.project.queryKey(),
          }),
        ]);
        toast.success(
          `Synced ${result.repoRef.slug} — ${result.openIssues} issues · ${result.openPulls} pull requests` +
            (result.truncated ? " (a list hit the page limit)" : ""),
        );
      },
      onError: (error) => toast.error(error.message),
    }),
  );
}

/**
 * The authenticated user's open issues + PRs across ALL GitHub repos — the
 * dashboard feed widget's data. Pure database read like the other forge
 * queries, so an absent cache is the honest pre-sync state: nothing is
 * fetched to fill it (the feed's door to a live fetch is the mutation below).
 */
export function useForgeFeedQuery() {
  const trpc = useTRPC();
  return useQuery(
    trpc.forge.feed.queryOptions(undefined, { staleTime: FORGE_STALE_TIME }),
  );
}

/**
 * The feed view, inferred from the query result — the authored source is the
 * server's `ForgeUserFeedView` (`packages/api/src/lib/forge/feed.ts`).
 */
export type ForgeFeedView = NonNullable<ReturnType<typeof useForgeFeedQuery>["data"]>;

/** One feed row, inferred from {@link ForgeFeedView} — same wire shape as the
 * server's `ForgeFeedItem` (`packages/api/src/lib/forge/types.ts`). */
export type ForgeFeedItem = ForgeFeedView["items"][number];

/**
 * The feed's explicit sync: ONE gh search per kind for the signed-in account,
 * user-scoped (no path input). Success settles the feed query; failures ride
 * plain Error messages ("Synced 2 min ago — use force", "gh not
 * authenticated…") to the toast path, verbatim.
 */
export function useForgeFeedSyncMutation() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.forge.syncFeed.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries({
          queryKey: trpc.forge.feed.queryKey(),
        });
        toast.success(
          `Synced your feed — ${result.issuesCount} issues · ${result.pullsCount} pull requests` +
            (result.truncated ? " (a list hit the page limit)" : ""),
        );
      },
      onError: (error) => toast.error(error.message),
    }),
  );
}

/**
 * The overview keyed by `projectPath` — the lookup list surfaces do
 * (paths are the same canonical absolute paths the scan's `Project.path`
 * carries, so a plain `get(project.path)` resolves).
 */
export function useForgeOverviewMap(): Map<string, ForgeOverviewEntry> {
  const overview = useForgeOverviewQuery();
  return useMemo(() => {
    const byPath = new Map<string, ForgeOverviewEntry>();
    for (const entry of overview.data?.entries ?? []) {
      byPath.set(entry.projectPath, entry);
    }
    return byPath;
  }, [overview.data]);
}
