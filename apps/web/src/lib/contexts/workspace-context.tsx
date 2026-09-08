/**
 * WorkspaceProvider — the dashboard's data substrate (master plan §3.4, D5).
 *
 * A thin typed view over the react-query cache, mounted once per workspace
 * page: the raw `scan`/`roots` query results (exposed, never copied), the
 * hidden-filtered working set, the shared `now` clock, the scan lifecycle,
 * the memoized fleet vitals, one text filter every widget narrows by, and
 * the rescan handler. All cache reads ride the canonical hooks from
 * `lib/queries/scan.ts` (identical input ⇒ identical cache entry), so this
 * provider and a dashboard that warmed the cache share one fetch; page
 * shells compose it below SettingsProvider (§3.4 stack derivation).
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { Project, ScanResult } from "@workspace-welcome/api/lib/types";

import { useRootsQuery, useScanQuery } from "@/lib/queries/scan";
import { fleetVitals } from "@/lib/scan-metrics";
import type { FleetVitals } from "@/lib/scan-metrics";
import { useTRPC } from "@/utils/trpc";

/** Lifecycle of the workspace scan as widgets see it (priority order below). */
export type ScanState = "loading" | "error" | "empty" | "ready";

/**
 * The raw scan/roots results as the provider exposes them. Derived from the
 * canonical hooks so the tRPC client-error type rides along exactly — a
 * plain `UseQueryResult<ScanResult>` would drop it (tRPC results error as
 * `TRPCClientErrorLike`, not `Error`).
 */
type ScanQueryResult = ReturnType<typeof useScanQuery>;
type RootsQueryResult = ReturnType<typeof useRootsQuery>;

export interface WorkspaceContextValue {
  /** The raw scan query result (projects + rootErrors) — exposed, not copied. */
  scan: ScanQueryResult;
  /** The raw tracked-roots query result — exposed, not copied. */
  roots: RootsQueryResult;
  /** The working set: scan projects with hidden filtered out. */
  projects: Project[];
  /** Roots that could not be read (missing/permission), for error chips. */
  rootErrors: ScanResult["rootErrors"];
  /**
   * THE clock: `scan.dataUpdatedAt || Date.now()` — the existing pattern,
   * kept verbatim. One tick per data epoch so pulse strips and freshness
   * derivations across every widget agree; `Date.now()` only ever answers
   * while the first scan is still in flight, never per-render thereafter.
   */
  now: number;
  /** `error` when the scan failed, `loading` while pending, `empty` when no
   * roots are tracked, else `ready`. */
  scanState: ScanState;
  /**
   * The rescan handler: invalidates the scan + roots entries, so active
   * observers refetch immediately. `force` escalates to the scan router's
   * paranoid mode — it bypasses the server's per-project fingerprint cache
   * for a full rescan (~6 s) and lands the result in the default (input-less)
   * cache entry the dashboard reads, then settles both entries.
   */
  refresh(force?: boolean): void;
  /** The masthead numerals over the working set — memoized once here. */
  vitals: FleetVitals;
  /**
   * The one text filter (matchProject query). Owned here so every widget
   * narrows together; per-widget narrowing stays a useMemo in the widget —
   * the provider does not re-provide filtered lists (§3.4).
   */
  filter: string;
  setFilter(value: string): void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/**
 * Throwing accessor (§3.4 enforcement a) — widgets require the provider;
 * a null-default context turns a missing mount into a loud error instead
 * of silently undefined data.
 */
export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (ctx === null) {
    throw new Error(
      "WorkspaceProvider missing — a widget requires it, but no WorkspaceProvider is mounted above. Mount the page provider stack (settings > workspace) around the page.",
    );
  }
  return ctx;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const scan = useScanQuery();
  const roots = useRootsQuery();
  const [filter, setFilter] = useState("");

  // The server already drops hidden projects at the scan boundary; the filter
  // is repeated here so the contract holds even if that ever moves.
  const projects = useMemo(
    () => scan.data?.projects.filter((p) => !p.hidden) ?? [],
    [scan.data],
  );
  const rootErrors = useMemo(() => scan.data?.rootErrors ?? [], [scan.data]);

  // THE clock — one tick per data epoch (see the value-shape note above).
  const now = scan.dataUpdatedAt || Date.now();

  const scanState: ScanState = scan.isError
    ? "error"
    : scan.isPending
      ? "loading"
      : roots.data?.length === 0
        ? "empty"
        : "ready";

  const vitals = useMemo(() => fleetVitals(projects, now), [projects, now]);

  const refresh = useCallback(
    (force = false) => {
      if (!force) {
        // Standard rescan: the server re-probes every fingerprint and
        // re-scans what changed; invalidation refetches active observers
        // immediately regardless of the entries' staleTime.
        void queryClient.invalidateQueries({
          queryKey: trpc.projects.scan.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.roots.list.queryKey(),
        });
        return;
      }
      // Forced rescan: bypass the fingerprint cache server-side, land the
      // result in the default (input-less) entry the mounted observers read,
      // then settle both entries. The trailing invalidation is cheap — the
      // fingerprints were just probed — and keeps every scan entry coherent.
      void queryClient
        .fetchQuery(trpc.projects.scan.queryOptions({ force: true }))
        .then((data) => {
          queryClient.setQueryData(
            trpc.projects.scan.queryOptions(undefined).queryKey,
            data,
          );
        })
        .finally(() => {
          void queryClient.invalidateQueries({
            queryKey: trpc.projects.scan.queryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: trpc.roots.list.queryKey(),
          });
        });
    },
    [queryClient, trpc],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      scan,
      roots,
      projects,
      rootErrors,
      now,
      scanState,
      refresh,
      vitals,
      filter,
      setFilter,
    }),
    [scan, roots, projects, rootErrors, now, scanState, refresh, vitals, filter],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {/* Provider stamp (§3.4): this provider's own lower-case key on its
          root; nested providers add theirs, so the page's full mount order
          is legible from the DOM. */}
      <div data-providers="workspace">{children}</div>
    </WorkspaceContext.Provider>
  );
}
