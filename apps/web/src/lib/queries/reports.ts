import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { ReportExport, ReportExportProject } from "@workspace-welcome/api/lib/report-export";
import type { ReportJob } from "@workspace-welcome/api/lib/snitch";
import type { ReportPeriod } from "@workspace-welcome/api/routers/reports";

import { useTRPC } from "@/utils/trpc";
import { REPORT_PERIOD_PRESETS, reportPeriodLabel } from "@/lib/report-periods";

export { REPORT_PERIOD_PRESETS, reportPeriodLabel };

/**
 * The one home for snitch-report queries — the read pipeline (command →
 * key → JSON export), the write pipeline (generate → job settle →
 * invalidation), and the persisted-exports index. Absorbs meadow's
 * `report-data` query plumbing and the mission-bento report provider
 * internals, so designs consume hooks instead of re-wiring procedures.
 *
 * ONE report pipeline: generate (any door — the header dialog, a widget
 * CTA, another tab) targets the same deterministic key the readers use,
 * and the server's job registry is the rendezvous. `useReportJobWatch`
 * observes the scope key's registry entry, so a run settles for every
 * reader on the page no matter who started it; `noteSettledJob` makes the
 * settle handling (failure toast + export invalidation) once-per-run
 * across every observer.
 *
 * Key conventions for this module (and every module in `lib/queries/`):
 * - Scopes, not keys: callers pass a `ReportScope` (or a path); the module
 *   derives cache keys and report keys from it. Nothing outside builds keys.
 * - Enabled gating with placeholder inputs: tRPC inputs must stay well-typed
 *   even when a query is disabled, so unresolved inputs pass a placeholder
 *   (`""` / `null`) and `enabled` is the single gate that keeps the query
 *   from actually fetching.
 * - Identical input ⇒ identical key: the same scope from a tile, a page, and
 *   a provider resolves to one shared cache entry — a fetch is paid once.
 * - Only this module invalidates: settle-time invalidation lives here.
 *   (The settings/project mutation wrappers are the sanctioned exception.)
 */

/** Where a report targets: one repo, or the whole scan behind a root. */
export type ReportScope = {
  kind: "repo" | "scan";
  path: string;
  /** git-snitch period preset; absent = all history. */
  period?: ReportPeriod;
};

/** Resolving the CLI command is cheap but not free; 10 min of trust. */
const COMMAND_STALE_TIME = 10 * 60_000;

/** The persisted JSON export changes only when a run settles; 60 s of trust. */
const EXPORT_STALE_TIME = 60_000;

/** Poll cadence while a report job is executing. */
const JOB_POLL_MS = 1500;

/**
 * Idle cadence for the registry watch — the catch-net for runs started
 * outside this hook (the workspace dialog, another tab). Only ticks while
 * the window is focused (`refetchIntervalInBackground` stays off), so an
 * unfocused page costs nothing.
 */
const WATCH_IDLE_POLL_MS = 5000;

// --- Settle handling (shared, once per run) -------------------------------------

/**
 * Settled-run signatures already handled this session (`key:finishedAt`).
 * The registry watch and a generate's own success callback can both report
 * the same settle; the guard keeps the toast and the invalidation
 * once-per-run no matter how many observers see it.
 */
const settledRuns = new Set<string>();

/**
 * Handle a settled (done | failed) job: toast the captured stderr on
 * failure, invalidate the export queries so every reader of the key
 * refetches — once per run. Synthetic done jobs (the generate cache hit,
 * never registered server-side) ride the same guard: `finishedAt` is the
 * report file's mtime, so a later real run (new mtime) is a fresh run.
 */
function noteSettledJob(
  trpc: ReturnType<typeof useTRPC>,
  queryClient: ReturnType<typeof useQueryClient>,
  job: ReportJob,
): void {
  const signature = `${job.key}:${job.finishedAt}`;
  if (settledRuns.has(signature)) return;
  settledRuns.add(signature);
  if (job.status === "failed") {
    toast.error(
      job.stderrTail.split("\n").filter(Boolean).at(-1) ?? "Report run failed.",
    );
  }
  void queryClient.invalidateQueries({
    queryKey: trpc.reports.jsonExport.queryKey(),
  });
  void queryClient.invalidateQueries({
    queryKey: trpc.reports.jsonExports.queryKey(),
  });
}

/**
 * The settle reporter for run-starters outside the provider (the workspace
 * dialog in `use-report.ts`, settings): a cache hit resolves a synthetic
 * done job the registry never stores, so its (possibly backfilled) export
 * refresh rides here; a real run settles through the registry watch.
 */
export function useReportSettleNotifier() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useCallback(
    (job: ReportJob) => {
      noteSettledJob(trpc, queryClient, job);
    },
    [queryClient, trpc],
  );
}

// --- Read pipeline --------------------------------------------------------------

/**
 * Resolve the report key + copyable CLI command for a scope WITHOUT starting
 * a run. Gated on a non-empty path (placeholder `""` while unresolved);
 * `enabled` narrows further for callers that render report data optionally.
 */
export function useReportCommand(scope: ReportScope, enabled = true) {
  const trpc = useTRPC();
  return useQuery(
    trpc.reports.command.queryOptions(
      { kind: scope.kind, path: scope.path, period: scope.period },
      {
        enabled: enabled && scope.path.length > 0,
        staleTime: COMMAND_STALE_TIME,
      },
    ),
  );
}

/**
 * The persisted JSON export for a finished report key — null while the run
 * is still going (or the export predates exports). Gated on a real key:
 * `null` disables the query behind a placeholder `""` input.
 */
export function useReportExport(key: string | null) {
  const trpc = useTRPC();
  return useQuery(
    trpc.reports.jsonExport.queryOptions(
      { key: key ?? "" },
      { enabled: key !== null, staleTime: EXPORT_STALE_TIME },
    ),
  );
}

/**
 * Watch a report key's job in the server registry — the ONE rendezvous that
 * makes every run converge for the page's readers: while the entry runs,
 * `running` is true (the provider's `running` status, retained content);
 * when a settle is observed, the export queries invalidate once per run no
 * matter which door started it (the workspace dialog, a widget CTA on
 * another surface, another tab). A job that vanishes mid-run (server
 * restart killed the child) is reported, and the exports invalidate — the
 * start of the run already unlinked the previous export server-side.
 *
 * Idle cadence 5 s, 1500 ms while a run executes; focused windows only.
 */
export function useReportJobWatch(key: string | null) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const query = useQuery(
    trpc.reports.job.queryOptions(
      { key: key ?? "" },
      {
        enabled: key !== null,
        refetchInterval: (current) =>
          current.state.data?.status === "running" ? JOB_POLL_MS : WATCH_IDLE_POLL_MS,
      },
    ),
  );
  const job = key === null ? null : (query.data ?? null);

  // Whether the watched entry was last seen running — the lost-job tell.
  const seenRunning = useRef(false);
  useEffect(() => {
    if (job !== null && job.status === "running") {
      seenRunning.current = true;
      return;
    }
    if (job === null) {
      // Registry has no entry: a restart wiped a run we saw executing —
      // nothing will settle; the readers must not wait on it either.
      if (seenRunning.current) {
        seenRunning.current = false;
        toast.error("Report job lost — the server probably restarted.");
        void queryClient.invalidateQueries({
          queryKey: trpc.reports.jsonExport.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.reports.jsonExports.queryKey(),
        });
      }
      return;
    }
    seenRunning.current = false;
    noteSettledJob(trpc, queryClient, job);
  }, [job, queryClient, trpc]);

  return { running: job?.status === "running", job };
}

/**
 * The write pipeline for one scope: start (or join) a run. The mutation's
 * result is written straight into the job-query cache so the registry watch
 * observes `running` (or a synthetic cache-hit `done`) without waiting for
 * the idle cadence — the watch owns settle handling from there. Failures to
 * START (snitch resolution) toast here; run failures toast at settle.
 */
export function useReportGenerate(scope: ReportScope) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const generate = useMutation(
    trpc.reports.generate.mutationOptions({
      onSuccess: (job) => {
        // Write the result straight into the job-query cache: `running` is
        // observed by the registry watch without waiting for the idle
        // cadence, and a synthetic cache-hit `done` settles through the
        // watch's shared guard (backfilled export included).
        queryClient.setQueryData(
          trpc.reports.job.queryKey({ key: job.key }),
          job,
        );
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  return {
    /** `force` voids the cached report and starts a fresh run. */
    generate: (force: boolean) =>
      generate.mutate({
        kind: scope.kind,
        path: scope.path,
        force,
        period: scope.period,
      }),
    /** The mutation is in flight (clicked → server accepted). */
    isPending: generate.isPending,
  };
}

// --- Persisted exports index + the repo→scan fallback ---------------------------

/** Index of persisted JSON exports, newest first — the "saved reports" list
 * and the scan-fallback lookup read this. */
export function useReportExportsIndex(enabled = true) {
  const trpc = useTRPC();
  return useQuery(
    trpc.reports.jsonExports.queryOptions(undefined, {
      enabled,
      staleTime: EXPORT_STALE_TIME,
    }),
  );
}

/** True when `rootPath` contains `projectPath` (a scan root covering a repo). */
function covers(rootPath: string, projectPath: string): boolean {
  const root = rootPath.replace(/\/+$/, "");
  return projectPath === root || projectPath.startsWith(`${root}/`);
}

export interface CoveringScanExport {
  /** The newest persisted scan export whose root contains the repo path. */
  data: ReportExport | null;
  /** The repo's entry inside that export — the report data for the project. */
  entry: ReportExportProject | null;
  /** The covering export's index summary (its key, generatedAt), when found. */
  summary: { key: string; generatedAt: string } | null;
  /** Still resolving the index or the covering export. */
  pending: boolean;
}

/**
 * The repo-scope fallback: the workspace scan report already contains every
 * project under its root as a full entry, so a missing repo report must not
 * demand a second run — find the newest persisted scan export covering the
 * path (same period) and expose its entry for the repo view. Disabled until
 * the caller needs it (the provider enables it only when its own repo
 * export settled missing).
 */
export function useCoveringScanExport(
  scope: { path: string; period?: ReportPeriod },
  enabled: boolean,
): CoveringScanExport {
  const active = enabled && scope.path.length > 0;
  const index = useReportExportsIndex(active);

  const cover = useMemo(() => {
    if (!active) return null;
    return (
      (index.data ?? []).find(
        (s) =>
          s.kind === "scan" &&
          (s.period ?? null) === (scope.period ?? null) &&
          covers(s.targetPath, scope.path),
      ) ?? null
    );
  }, [active, index.data, scope.path, scope.period]);

  const exportQuery = useReportExport(cover?.key ?? null);
  const data = cover !== null ? (exportQuery.data ?? null) : null;
  const entry =
    data?.projects.find((p) => p.path === scope.path) ?? null;
  return {
    data,
    entry,
    summary:
      cover !== null ? { key: cover.key, generatedAt: cover.generatedAt } : null,
    pending:
      active && (index.isPending || (cover !== null && exportQuery.isPending)),
  };
}

/**
 * The raw generate mutation — no job tracking, no toasts. Shared plumbing
 * for run-starters that navigate instead of reading (use-report.ts's
 * open-in-tab runner reports the settle itself via the notifier).
 */
export function useReportGenerateMutation() {
  const trpc = useTRPC();
  return useMutation(trpc.reports.generate.mutationOptions());
}
