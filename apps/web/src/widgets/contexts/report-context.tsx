/**
 * ReportProvider — the one snitch-report state machine for the widget
 * system. Thin typed view over the react-query cache mounted per page
 * (`lib/queries/` owns all procedure wiring and the settle invalidation);
 * this provider owns ONLY the status machine, the two staleness rules, and
 * the period scope.
 *
 * State machine (priority order, first match wins — draft-data §3.1):
 *
 * | priority | status    | condition                                          |
 * |----------|-----------|----------------------------------------------------|
 * | 1        | no-scope  | scope.path is empty (unresolvable mount scope)     |
 * | 2        | running   | generate mutation pending or a job is being polled |
 * | 3        | loading   | command pending, or key resolved + export pending  |
 * | 4        | missing   | export settled without data for the scope key      |
 * | 5        | stale     | export present AND isReportStale(gen, latestUpd)   |
 * | 5        | fresh     | export present AND not stale                       |
 *
 * Retention: `exportData`, `byPath`, and the derived `view` are RETAINED
 * during `running` — the export key is scope-derived and never changes
 * mid-run, and the machine never wipes the cached export, so widgets render
 * last-known content under a progress strip while a regeneration settles.
 *
 * Staleness rules (both owned here, both wrapping the unchanged fs-free
 * `@workspace-welcome/api/lib/report-staleness`):
 * 1. Scope status — `isReportStale(exportData.generatedAt, latestUpdated)`
 *    where latestUpdated is the max scan updatedAt across the projects in
 *    scope (repo kind: that single project's updatedAt).
 * 2. Per-entry — `isEntryStale(path)` compares the export's generatedAt
 *    against the SCAN project at that path (bento's tile rule); a repo
 *    report's single entry therefore equals the scope verdict.
 *
 * Generate mapping for callers: missing → `generate()` (no force — a cached
 * report may exist server-side), stale → `generate({ force: true })`.
 */

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { ReportExport, ReportExportProject } from "@workspace-welcome/api/lib/report-export";
import { isReportStale, latestUpdatedAtOf } from "@workspace-welcome/api/lib/report-staleness";
import type { ReportPeriod } from "@workspace-welcome/api/routers/reports";
import type { Project } from "@workspace-welcome/api/lib/types";

import { toReportView } from "@/lib/report-view";
import type { ReportView } from "@/lib/report-view";
import {
  useReportCommand,
  useReportExport,
  useReportGenerate,
} from "@/lib/queries/reports";
import type { ReportScope } from "@/lib/queries/reports";
import { useScanQuery } from "@/lib/queries/scan";
import { indexProjectsByPath } from "@/lib/scan-metrics/report";

export type ReportStatus =
  | "no-scope"
  | "loading"
  | "missing"
  | "running"
  | "stale"
  | "fresh";

export interface ReportContextValue {
  /** The mount scope; `path` is "" exactly when status is no-scope. */
  scope: ReportScope;
  status: ReportStatus;
  /** The settled export — RETAINED across `running` for last-known render. */
  exportData: ReportExport | null;
  /** Export projects indexed by absolute path — the entry lookup. */
  byPath: Map<string, ReportExportProject>;
  /** One project entry inside the export (scan tile / repo single entry). */
  entry(path: string): ReportExportProject | null;
  /** The report key (also the HTML route param), when resolvable. */
  key: string | null;
  /** Copyable CLI command that would produce this report. */
  command: string | null;
  commandError: string | null;
  generatedAt: string | null;
  /** Scope staleness input: max updatedAt of the scan projects in scope. */
  latestUpdated: string | null;
  /** Staleness of ONE project inside the export (scan tile rule). */
  isEntryStale(path: string): boolean;
  period: ReportPeriod | undefined;
  setPeriod(period: ReportPeriod | undefined): void;
  /** Start (or join) a run for the scope; toasts + settle invalidation live
   * in the queries module. missing → `generate()`, stale → force. */
  generate(options?: { force?: boolean }): void;
  /** A run is starting or its tracked job is still executing. */
  generating: boolean;
  /** The normalizer's output, computed once — null without an export. */
  view: ReportView | null;
}

const ReportContext = createContext<ReportContextValue | null>(null);

export interface ReportProviderProps {
  kind: ReportScope["kind"];
  /** The scope root/project path; undefined/empty ⇒ `no-scope` status. */
  path?: string;
  children: ReactNode;
}

/**
 * Mounted per page, never per widget: `{ kind: "scan", path: roots[0]?.path }`
 * on the dashboard, `{ kind: "repo", path }` on project pages. Rides the
 * same react-query cache the workspace scan warmed (identical input ⇒
 * identical entry), so staleness inputs and exports are paid for once.
 */
export function ReportProvider({ kind, path, children }: ReportProviderProps) {
  const scopePath = path ?? "";
  const hasScope = scopePath.length > 0;
  const [period, setPeriod] = useState<ReportPeriod | undefined>(undefined);

  const commandQuery = useReportCommand(
    { kind, path: scopePath, period },
    hasScope,
  );
  const key = commandQuery.data?.key ?? null;
  const exportQuery = useReportExport(key);
  // The full write pipeline: generate mutation, 1500 ms job poll, settle
  // invalidation, failure/lost-job toasts — owned by lib/queries, unchanged.
  const pipeline = useReportGenerate({ kind, path: scopePath, period });
  const { busy: generating, generate: runPipeline } = pipeline;

  // Staleness inputs come from the workspace scan (cached by WorkspaceProvider;
  // this query joins the identical cache entry when mounted under it).
  const scan = useScanQuery();
  const scanProjects = scan.data?.projects;
  const scanProjectsByPath = useMemo(() => {
    const map = new Map<string, Project>();
    for (const p of scanProjects ?? []) map.set(p.path, p);
    return map;
  }, [scanProjects]);
  const latestUpdated = useMemo(() => {
    if (!hasScope) return null;
    if (kind === "repo") {
      return scanProjectsByPath.get(scopePath)?.updatedAt ?? null;
    }
    return latestUpdatedAtOf(
      (scanProjects ?? [])
        .filter((p) => p.path.startsWith(scopePath))
        .map((p) => p.updatedAt),
    );
  }, [hasScope, kind, scanProjects, scanProjectsByPath, scopePath]);

  const exportData = exportQuery.data ?? null;
  const byPath = useMemo(
    () => (exportData ? indexProjectsByPath(exportData) : new Map<string, ReportExportProject>()),
    [exportData],
  );

  const value = useMemo<ReportContextValue>(() => {
    let status: ReportStatus;
    if (!hasScope) {
      status = "no-scope";
    } else if (generating) {
      status = "running";
    } else if (commandQuery.isPending || (key !== null && exportQuery.isPending)) {
      status = "loading";
    } else if (exportData === null) {
      status = "missing";
    } else {
      status = isReportStale(exportData.generatedAt, latestUpdated)
        ? "stale"
        : "fresh";
    }
    return {
      scope: { kind, path: scopePath, period },
      status,
      exportData,
      byPath,
      entry: (entryPath: string) => byPath.get(entryPath) ?? null,
      key,
      command: commandQuery.data?.command ?? null,
      commandError: commandQuery.data?.error ?? null,
      generatedAt: exportData?.generatedAt ?? null,
      latestUpdated,
      isEntryStale: (entryPath: string) =>
        exportData !== null &&
        isReportStale(
          exportData.generatedAt,
          scanProjectsByPath.get(entryPath)?.updatedAt ?? null,
        ),
      period,
      setPeriod,
      generate: (options?: { force?: boolean }) => {
        if (!hasScope) return;
        runPipeline(options?.force ?? false);
      },
      generating,
      view: exportData === null ? null : toReportView(exportData, latestUpdated),
    };
  }, [
    byPath,
    commandQuery.data,
    commandQuery.isPending,
    exportData,
    exportQuery.isPending,
    generating,
    hasScope,
    key,
    kind,
    latestUpdated,
    period,
    runPipeline,
    scanProjectsByPath,
    scopePath,
  ]);

  return (
    <ReportContext.Provider value={value}>
      {/* Layout-transparent stamp for validate-layout (migration §8.2). */}
      <div data-providers="report" className="contents">
        {children}
      </div>
    </ReportContext.Provider>
  );
}

/**
 * Read the page's shared report state. Throws outside a ReportProvider —
 * widgets must be mounted under the provider stack (§3.4 enforcement (a)).
 */
export function useReport(): ReportContextValue {
  const ctx = useContext(ReportContext);
  if (ctx === null) {
    throw new Error(
      "ReportProvider missing — widget requires it (mount ReportProvider above this widget)",
    );
  }
  return ctx;
}
