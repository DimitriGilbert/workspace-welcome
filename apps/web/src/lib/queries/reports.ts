import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { ReportPeriod } from "@workspace-welcome/api/routers/reports";

import { useTRPC } from "@/utils/trpc";

/**
 * The one home for snitch-report queries — the read pipeline (command →
 * key → JSON export), the write pipeline (generate → job poll → settle
 * invalidation), and the persisted-exports index. Absorbs meadow's
 * `report-data` query plumbing and the mission-bento report provider
 * internals, so designs consume hooks instead of re-wiring procedures.
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
 * git-snitch period presets the UI can scope a report to; `All` maps to
 * `undefined` = all history (mission-bento's array, unchanged).
 */
export const REPORT_PERIOD_PRESETS: readonly {
  value: ReportPeriod | undefined;
  label: string;
}[] = [
  { value: undefined, label: "All" },
  { value: "7d", label: "7d" },
  { value: "3m", label: "3m" },
];

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
 * Poll a report job by key; 1500 ms while it is running, stop on settle.
 * `null` key (nothing to track) keeps the query disabled behind a
 * placeholder input. Data is `null` after a server restart — the job is
 * lost; callers decide what that means.
 */
export function useReportJob(jobKey: string | null) {
  const trpc = useTRPC();
  return useQuery(
    trpc.reports.job.queryOptions(
      { key: jobKey ?? "" },
      {
        enabled: jobKey !== null,
        refetchInterval: (query) =>
          query.state.data?.status === "running" ? JOB_POLL_MS : false,
      },
    ),
  );
}

/**
 * The write pipeline for one scope: start (or join) a run, track its job,
 * and on settle invalidate the export + index queries once — whether the
 * run finished, failed, or was lost. Failures toast here (mutation error
 * and non-zero exit via stderrTail); a lost job toasts too. Cache hits
 * resolve a synthetic done job and ride the same settle path.
 */
export function useReportGenerate(scope: ReportScope) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [jobKey, setJobKey] = useState<string | null>(null);

  const generate = useMutation(
    trpc.reports.generate.mutationOptions({
      onSuccess: (job) => setJobKey(job.key),
      onError: (e) => toast.error(e.message),
    }),
  );

  const jobQuery = useReportJob(jobKey);
  const job = jobQuery.data;
  useEffect(() => {
    if (jobKey === null || job === undefined) return;
    if (job === null) {
      // Lost job (server restarted) — nothing left to wait for either.
      setJobKey(null);
      toast.error("Report job lost — the server probably restarted.");
      return;
    }
    if (job.status === "running") return;
    setJobKey(null);
    if (job.status === "failed") {
      toast.error(
        job.stderrTail.split("\n").filter(Boolean).at(-1) ??
          "Report run failed.",
      );
    }
    void queryClient.invalidateQueries({
      queryKey: trpc.reports.jsonExport.queryKey(),
    });
    void queryClient.invalidateQueries({
      queryKey: trpc.reports.jsonExports.queryKey(),
    });
  }, [job, jobKey, queryClient, trpc]);

  return {
    /** `force` voids the cached report and starts a fresh run. */
    generate: (force: boolean) =>
      generate.mutate({
        kind: scope.kind,
        path: scope.path,
        force,
        period: scope.period,
      }),
    /** A run is starting or its tracked job is still executing. */
    busy: generate.isPending || jobKey !== null,
    /** The tracked job's key while a run is in flight, else null. */
    jobKey,
  };
}

/** Index of persisted JSON exports, newest first — the "saved reports" list
 * and the scan-fallback lookup read this. */
export function useReportExportsIndex() {
  const trpc = useTRPC();
  return useQuery(trpc.reports.jsonExports.queryOptions());
}

/**
 * The raw generate mutation — no job tracking, no toasts. Shared plumbing
 * for `useReportGenerate` (which polls + settles) and `use-report.ts`'s
 * open-in-tab runner (which navigates instead of polling).
 */
export function useReportGenerateMutation() {
  const trpc = useTRPC();
  return useMutation(trpc.reports.generate.mutationOptions());
}
