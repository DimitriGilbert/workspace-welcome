/**
 * Shared snitch-report plumbing for the Meadow design: one lazy, cached
 * react-query pipeline (command → key → JSON export) that the context-panel
 * widget, the mosaic tiles, and the project page all read from, plus the
 * generate/poll runner and the view-model that folds repo and scan exports
 * into one renderable shape.
 *
 * Values import from `@workspace-welcome/api/lib/report-staleness` — the
 * fs-free browser-safe module; the export TYPE rides in as `import type`
 * (erased at runtime) because `report-export` itself carries node imports.
 */

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReportExport } from "@workspace-welcome/api/lib/report-export";
import {
  isReportStale,
  latestUpdatedAtOf,
} from "@workspace-welcome/api/lib/report-staleness";
import type { ReportPeriod } from "@workspace-welcome/api/routers/reports";

import { useTRPC } from "@/utils/trpc";

export type ReportScope = {
  kind: "repo" | "scan";
  path: string;
  /** git-snitch period preset; absent = all history. */
  period?: ReportPeriod;
};

/**
 * Normalized view over ReportExport: scan reports aggregate across their
 * project entries; repo reports read the single entry. Keeps every consumer
 * (context widget, tiles, project section) identical for both kinds.
 */
export interface ReportView {
  export: ReportExport;
  cadence: { period: string; commits: number }[];
  alerts: {
    label: string;
    severity: "info" | "warning" | "critical";
    summary: string;
    count: number;
    value: number;
  }[];
  languages: { language: string; files: number; lines: number }[];
  totals: { commits: number; contributors: number; repositories: number };
  aiUsage: ReportExport["aiUsage"];
  projectCount: number;
  stale: boolean;
}

export function toReportView(
  data: ReportExport,
  updatedAts: readonly string[],
): ReportView {
  if (data.kind === "repo") {
    const p = data.projects[0];
    return {
      export: data,
      cadence: p?.cadence ?? [],
      alerts: (p?.alerts ?? []).map((a) => ({
        label: a.label,
        severity: a.severity,
        summary: a.summary,
        count: 1,
        value: a.value,
      })),
      languages: p?.languages ?? [],
      totals: {
        commits: p?.totalCommits ?? 0,
        contributors: p?.contributors ?? 0,
        repositories: 1,
      },
      aiUsage: p?.aiUsage ?? data.aiUsage,
      projectCount: 1,
      stale: isReportStale(data.generatedAt, latestUpdatedAtOf(updatedAts)),
    };
  }
  // Scan: fold every project's series into one comparative view.
  const cadence = new Map<string, number>();
  const alerts = new Map<string, ReportView["alerts"][number]>();
  const languages = new Map<
    string,
    { language: string; files: number; lines: number }
  >();
  for (const p of data.projects) {
    for (const c of p.cadence) {
      cadence.set(c.period, (cadence.get(c.period) ?? 0) + c.commits);
    }
    for (const a of p.alerts) {
      const prev = alerts.get(a.label);
      if (prev) {
        prev.count++;
        prev.value = Math.max(prev.value, a.value);
      } else {
        alerts.set(a.label, {
          label: a.label,
          severity: a.severity,
          summary: a.summary,
          count: 1,
          value: a.value,
        });
      }
    }
    for (const l of p.languages) {
      const prev = languages.get(l.language);
      if (prev) {
        prev.files += l.files;
        prev.lines += l.lines;
      } else {
        languages.set(l.language, { ...l });
      }
    }
  }
  const totals = data.totals;
  return {
    export: data,
    cadence: [...cadence.entries()]
      .map(([period, commits]) => ({ period, commits }))
      .sort((a, b) => a.period.localeCompare(b.period)),
    alerts: [...alerts.values()].sort(
      (a, b) => b.value - a.value || b.count - a.count,
    ),
    languages: [...languages.values()].sort((a, b) => b.lines - a.lines),
    totals: {
      commits: totals.commits,
      contributors: totals.contributors,
      repositories: totals.repositories,
    },
    aiUsage: data.aiUsage,
    projectCount: data.projects.length,
    stale: isReportStale(data.generatedAt, latestUpdatedAtOf(updatedAts)),
  };
}

/**
 * The read pipeline: resolve the report key via `reports.command` (no run),
 * then lazily fetch the persisted JSON export for it. Both queries cache —
 * mosaic tiles, the context widget, and the project page share one entry
 * per scope, so a hero tile and the project page cost a single fetch.
 * `enabled` gates the fetch: only the tiles that render report data (and
 * the page-level widgets) pay for it.
 */
export function useReportJson(scope: ReportScope, enabled = true) {
  const trpc = useTRPC();
  const command = useQuery(
    trpc.reports.command.queryOptions(
      { kind: scope.kind, path: scope.path, period: scope.period },
      { enabled: enabled && scope.path.length > 0, staleTime: 10 * 60_000 },
    ),
  );
  const key = command.data?.key ?? null;
  const json = useQuery(
    trpc.reports.jsonExport.queryOptions(
      { key: key ?? "" },
      { enabled: enabled && key !== null, staleTime: 60_000 },
    ),
  );

  return {
    key,
    /** Copyable CLI command; null when the snitch binary can't be resolved. */
    command: command.data?.command ?? null,
    commandError: command.data?.error ?? null,
    data: json.data ?? null,
    pending: command.isPending || (key !== null && json.isPending),
  };
}

/**
 * The write pipeline: start (or join) a report run for the scope and poll
 * its job; when the job settles the export query is invalidated once and
 * the tracking cleared. Used by the context widget and the project page.
 */
export function useReportRunner(scope: ReportScope) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const generate = useMutation(
    trpc.reports.generate.mutationOptions({
      onSuccess: (job) => {
        if (job.status === "done") {
          // Cache hit / backfill — the export may already be fresh.
          void queryClient.invalidateQueries({
            queryKey: trpc.reports.jsonExport.queryKey({ key: job.key }),
          });
        }
      },
    }),
  );

  const jobKey = generate.data?.key ?? null;
  const job = useQuery(
    trpc.reports.job.queryOptions(
      { key: jobKey ?? "" },
      {
        enabled: jobKey !== null,
        refetchInterval: (query) =>
          query.state.data?.status === "running" ? 2000 : false,
      },
    ),
  );

  const jobSnapshot = job.data;
  useEffect(() => {
    if (jobKey === null || jobSnapshot === undefined) return;
    // Lost job (server restarted) — nothing left to wait for either.
    if (jobSnapshot !== null && jobSnapshot.status === "running") return;
    void queryClient.invalidateQueries({
      queryKey: trpc.reports.jsonExport.queryKey({ key: jobKey }),
    });
    generate.reset();
  }, [jobKey, jobSnapshot, queryClient, generate, trpc]);

  return {
    generate: (force: boolean) =>
      generate.mutate({
        kind: scope.kind,
        path: scope.path,
        force,
        period: scope.period,
      }),
    /** A run is starting or its job is still executing. */
    busy: generate.isPending || (jobKey !== null && job.isPending),
  };
}

/** "$1.24" / "$0" — the recorded (subsidized) AI cost of a report. */
export function formatCost(cost: number): string {
  if (cost === 0) return "$0";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1000) return `$${cost.toFixed(2)}`;
  return `$${Math.round(cost).toLocaleString()}`;
}

/** Compact token figures: 618.8M, 61.9k, 942. */
export function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
