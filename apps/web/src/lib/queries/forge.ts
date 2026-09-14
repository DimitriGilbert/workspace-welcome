import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/utils/trpc";

/**
 * Forge queries — the cached open-issue/PR counts the project lists render
 * (`ForgeChips`). The server procedure is a pure database read (rendering
 * can never trigger a network call), so an absent entry is the honest
 * pre-sync state: nothing is fetched to fill it. The per-path snapshot
 * query and the sync mutation (the project page's widget) join this module
 * in the next phase.
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
