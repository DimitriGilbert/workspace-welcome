import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/utils/trpc";

/**
 * Workspace-level scan queries — the dashboard's primary data. Consumers
 * pass scopes, never cache keys; identical input ⇒ identical cache entry,
 * so every widget reading the scan shares one fetch.
 */

/** The scan is the most expensive call the server serves; 5 min of trust. */
const SCAN_STALE_TIME = 5 * 60_000;

/** The full workspace scan (projects + derived vitals), cached 5 min. */
export function useScanQuery() {
  const trpc = useTRPC();
  return useQuery(
    trpc.projects.scan.queryOptions(undefined, { staleTime: SCAN_STALE_TIME }),
  );
}

/** The tracked roots list, cached on the same 5 min budget as the scan. */
export function useRootsQuery() {
  const trpc = useTRPC();
  return useQuery(
    trpc.roots.list.queryOptions(undefined, { staleTime: SCAN_STALE_TIME }),
  );
}
