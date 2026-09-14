import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useTRPC } from "@/utils/trpc";

/**
 * Forge queries — the cached open-issue/PR state the UI renders
 * (`ForgeChips` on the lists, the project page's `ProjectForge` widget, the
 * dashboard feed, and the settings Forge register). The read queries here
 * are pure database reads (rendering can never trigger a network call), so
 * an absent entry is the honest pre-sync state: nothing is fetched to fill
 * it — the register lists never-synced links instead. The only door to a
 * live fetch is an explicit sync mutation — user-initiated, and the sole
 * trigger for the invalidations that settle the queries.
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
 * A PR goes STALE when its last update is older than this many days (the
 * triage law, plan §Phase 10d): an open PR authored by the user that has
 * seen no activity for 30 days — the age at which the triage band surfaces
 * it as a warn-severity row.
 */
export const STALE_PR_DAYS = 30;

/** One stale-PR triage row — the feed item trimmed to what the band renders;
 * `updatedAt` is non-null by construction (see {@link staleFeedPrs}). */
export interface StalePrRow {
  repoSlug: string;
  number: number;
  title: string;
  url: string;
  updatedAt: string;
}

/**
 * The feed's stale-PR rows, most-stale first — the pure derivation the
 * triage band appends after its alert population. Law: {@link STALE_PR_DAYS}
 * days without an update. A null `updatedAt` is NEVER stale — no timestamp
 * means no age, so claiming staleness would be a fabrication (issues are
 * likewise out: the law is about pull requests). `now` is defaulted so the
 * plain `staleFeedPrs(items)` call is memo/SSR-friendly; feed items in,
 * rows out, no I/O.
 */
export function staleFeedPrs(
  items: ForgeFeedItem[],
  now: number = Date.now(),
): StalePrRow[] {
  const cutoff = now - STALE_PR_DAYS * 24 * 60 * 60 * 1000;
  const rows: StalePrRow[] = [];
  for (const item of items) {
    if (item.kind !== "pr" || item.updatedAt === null) continue;
    if (new Date(item.updatedAt).getTime() >= cutoff) continue;
    rows.push({
      repoSlug: item.repoSlug,
      number: item.number,
      title: item.title,
      url: item.url,
      updatedAt: item.updatedAt,
    });
  }
  return rows.sort(
    (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
  );
}

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
 * Every mapped project↔repo link with its sync bookkeeping + open-item
 * counts — the settings Forge register's data. Pure database read like the
 * other forge queries, and unlike the overview it lists never-synced and
 * failed links too (the register is the honest bookkeeping surface —
 * `lastSyncStatus` carries the reason). 5 min of trust.
 */
export function useForgeReposQuery() {
  const trpc = useTRPC();
  return useQuery(
    trpc.forge.repos.queryOptions(undefined, { staleTime: FORGE_STALE_TIME }),
  );
}

/**
 * One register row, inferred from the query result — the authored source is
 * the server's `ForgeRepoLinkEntry` (`packages/api/src/lib/forge/db.ts`).
 */
export type ForgeRepoLinkEntry = NonNullable<
  ReturnType<typeof useForgeReposQuery>["data"]
>["repos"][number];

/**
 * ONE fleet run (plan §Phase 10b): every workspace project then the user
 * feed, sequentially, failures isolated per target. Success settles ALL FOUR
 * forge queries in one Promise.all — repos (the register itself), overview
 * (the lists' chips), project (the per-project boards), feed (the dashboard)
 * — the point of the phase: every forge widget updates in place. The toast
 * carries counts only; the register rows carry the per-repo errors.
 */
export function useSyncAllMutation() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.forge.syncAll.mutationOptions({
      onSuccess: async (result) => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: trpc.forge.repos.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.forge.overview.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.forge.project.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.forge.feed.queryKey(),
          }),
        ]);
        const synced = result.results.filter((r) => r.status === "synced").length;
        const skipped = result.results.filter((r) => r.status === "skipped").length;
        const failed = result.results.filter((r) => r.status === "failed").length;
        const summary = `Synced ${synced} · skipped ${skipped} · failed ${failed} + feed ${result.feed.status}`;
        if (failed > 0 || result.feed.status === "failed") {
          toast.error(summary);
        } else {
          toast.success(summary);
        }
      },
      onError: (error) => toast.error(error.message),
    }),
  );
}

/**
 * One fleet run's outcome, inferred from the mutation result — the authored
 * source is the server's `ForgeSyncAllResult`
 * (`packages/api/src/lib/forge/sync.ts`).
 */
export type ForgeSyncAllResult = NonNullable<
  ReturnType<typeof useSyncAllMutation>["data"]
>;

/**
 * The register row's per-repo sync — the same `forge.sync` mutation the
 * project page uses, scoped to one path. Success settles the register plus
 * the overview and project snapshot quietly (the row updates in place, no
 * toast); failures ride plain Error messages ("Synced 2 min ago — use
 * force", "gh not authenticated…") to the toast path, verbatim.
 */
export function useRepoSyncMutation() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.forge.sync.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: trpc.forge.repos.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.forge.overview.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.forge.project.queryKey(),
          }),
        ]);
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
