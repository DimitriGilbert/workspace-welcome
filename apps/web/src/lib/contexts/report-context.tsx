/**
 * ReportProvider — the one snitch-report state machine for the widget
 * system. Thin typed view over the react-query cache mounted per page
 * (`lib/queries/` owns all procedure wiring and the settle invalidation);
 * this provider owns ONLY the status machine, the two staleness rules, the
 * period scope, and the repo→scan fallback.
 *
 * ONE pipeline: the scope's key is deterministic, so the workspace report
 * generated from ANY door (the header dialog, a widget CTA, another tab)
 * is the same artifact this provider reads. The registry watch
 * (`useReportJobWatch`) observes the scope key's job — `running` while it
 * executes, one invalidation when it settles — so a run started elsewhere
 * reaches these widgets the moment it lands. The provider never wipes the
 * cached export mid-run.
 *
 * Repo→scan fallback: the workspace scan report contains every project
 * under its root as a full entry, so a repo scope with no dedicated report
 * serves its entry from the newest covering scan export (same period)
 * instead of demanding a second run. The dedicated repo report (deeper
 * history) is still what `generate()` produces for the scope.
 *
 * State machine (priority order, first match wins — draft-data §3.1):
 *
 * | priority | status    | condition                                          |
 * |----------|-----------|----------------------------------------------------|
 * | 1        | no-scope  | scope.path is empty (unresolvable mount scope)     |
 * | 2        | running   | generate mutation pending or the scope job runs    |
 * | 3        | loading   | command pending; key resolved + export pending;    |
 * |          |           | or the covering-scan fallback is resolving         |
 * | 4        | missing   | exports settled without data for the scope (own    |
 * |          |           | repo export and any covering scan entry)           |
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
  useCoveringScanExport,
  useReportCommand,
  useReportExport,
  useReportGenerate,
  useReportJobWatch,
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
  /**
   * True when the command resolution itself failed (e.g. the scope path was
   * rejected as "not a known project") — the scope can't produce a report at
   * all, so the machine reports `missing` with `commandError` instead of
   * hanging in `loading`, `generate()` is a no-op, and the gate drops its
   * Generate CTA rather than offering a click that can only re-fail.
   */
  commandFailed: boolean;
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
 * Reshape a covering scan export into the repo view for one project entry:
 * the entry IS the project's report data (same fields the dedicated repo
 * run produces), so the repo widgets render it unchanged. Key/generatedAt
 * stay the scan's — the artifact that actually exists.
 */
function repoViewFromScan(
  scan: ReportExport,
  entry: ReportExportProject,
  projectPath: string,
): ReportExport {
  return {
    ...scan,
    kind: "repo",
    label: "project",
    targetPath: projectPath,
    projects: [entry],
    totals: {
      commits: entry.totalCommits,
      contributors: entry.contributors,
      repositories: 1,
      languages: entry.languages,
      alerts: entry.alerts,
    },
    aiUsage: entry.aiUsage ?? scan.aiUsage,
  };
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
  // The write pipeline (mutation only) + the registry watch: the watch is
  // how runs started ANYWHERE (header dialog, another tab) settle for this
  // page's readers — one invalidation per run, toasts included.
  const pipeline = useReportGenerate({ kind, path: scopePath, period });
  const watch = useReportJobWatch(key);
  const generating = pipeline.isPending || watch.running;

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

  const ownExport = exportQuery.data ?? null;
  // The repo→scan fallback activates only once the repo's own export has
  // settled missing — an existing (even stale) repo report still wins.
  const fallbackEnabled =
    kind === "repo" &&
    hasScope &&
    !commandQuery.isError &&
    !exportQuery.isPending &&
    ownExport === null;
  const covering = useCoveringScanExport({ path: scopePath, period }, fallbackEnabled);
  const exportData = useMemo(() => {
    if (ownExport !== null) return ownExport;
    if (covering.data !== null && covering.entry !== null) {
      return repoViewFromScan(covering.data, covering.entry, scopePath);
    }
    return null;
  }, [covering.data, covering.entry, ownExport, scopePath]);

  const byPath = useMemo(
    () => (exportData ? indexProjectsByPath(exportData) : new Map<string, ReportExportProject>()),
    [exportData],
  );

  const value = useMemo<ReportContextValue>(() => {
    const commandFailed = commandQuery.isError;
    let status: ReportStatus;
    if (!hasScope) {
      status = "no-scope";
    } else if (generating) {
      status = "running";
    } else if (commandFailed) {
      // The scope was rejected server-side (unknown path, unreachable CLI
      // resolution) — an honest missing-with-error, never an infinite load.
      status = "missing";
    } else if (
      commandQuery.isPending ||
      (key !== null && exportQuery.isPending) ||
      covering.pending
    ) {
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
      // The artifact that exists: the fallback serves the covering scan's
      // key; otherwise the scope's own (repo|scan) key from the command.
      key: exportData?.key ?? key,
      command: commandQuery.data?.command ?? null,
      commandError: commandFailed
        ? (commandQuery.error?.message ?? "Report command failed.")
        : (commandQuery.data?.error ?? null),
      commandFailed,
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
        if (!hasScope || commandFailed) return;
        pipeline.generate(options?.force ?? false);
      },
      generating,
      view: exportData === null ? null : toReportView(exportData, latestUpdated),
    };
  }, [
    byPath,
    commandQuery.data,
    commandQuery.error,
    commandQuery.isError,
    commandQuery.isPending,
    covering.pending,
    exportData,
    exportQuery.isPending,
    generating,
    hasScope,
    key,
    kind,
    latestUpdated,
    period,
    pipeline,
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

/**
 * The same state when a provider is mounted, null otherwise — for form
 * parts that compose anywhere (parts-preview) but adopt the page's report
 * scope when one exists.
 */
export function useReportOptional(): ReportContextValue | null {
  return useContext(ReportContext);
}
