import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { ReportPeriod } from "@workspace-welcome/api/routers/reports";
import type { ReportExport, ReportExportProject } from "@workspace-welcome/api/lib/report-export";
import { isReportStale, latestUpdatedAtOf } from "@workspace-welcome/api/lib/report-staleness";
import type { Project, Root } from "@workspace-welcome/api/lib/types";

import { useTRPC } from "@/utils/trpc";
import { indexProjectsByPath } from "./report-utils";

/** git-snitch period presets the widget line can scope to; undefined = all. */
export const REPORT_PERIODS: readonly { value: ReportPeriod | undefined; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "7d", label: "7d" },
  { value: "3m", label: "3m" },
];

export type ReportStatus =
  | "no-root"
  | "loading"
  | "missing"
  | "running"
  | "stale"
  | "fresh";

export interface WorkspaceReportState {
  status: ReportStatus;
  /** The settled export, when one is cached for the current scope. */
  exportData: ReportExport | null;
  /** Export projects indexed by absolute path — the tile lookup. */
  byPath: Map<string, ReportExportProject>;
  /** The report key (also the HTML route param), when resolvable. */
  key: string | null;
  period: ReportPeriod | undefined;
  setPeriod: (period: ReportPeriod | undefined) => void;
  regenerate: () => void;
  regenerating: boolean;
  /** Newest updatedAt among the projects the scan covered (staleness input). */
  latestUpdated: string | null;
}

const NullState: WorkspaceReportState = {
  status: "no-root",
  exportData: null,
  byPath: new Map(),
  key: null,
  period: undefined,
  setPeriod: () => {},
  regenerate: () => {},
  regenerating: false,
  latestUpdated: null,
};

const ReportDataContext = createContext<WorkspaceReportState>(NullState);

/**
 * One workspace snitch report (the first tracked root × a period), fetched
 * once and shared by every consumer on the dashboard — the signal line and
 * all mosaic tiles read the same cache instead of re-deriving per widget.
 */
export function WorkspaceReportProvider({
  roots,
  projects,
  children,
}: {
  roots: Root[];
  projects: Project[];
  children: ReactNode;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<ReportPeriod | undefined>(undefined);
  const [jobKey, setJobKey] = useState<string | null>(null);

  const root = roots[0];
  const rootPath = root?.path;

  // Resolves the report key for the scope without starting a run.
  const commandQuery = useQuery(
    trpc.reports.command.queryOptions(
      { kind: "scan", path: rootPath ?? "", period },
      { enabled: rootPath !== undefined },
    ),
  );
  const key = commandQuery.data?.key ?? null;

  const exportQuery = useQuery(
    trpc.reports.jsonExport.queryOptions(
      { key: key ?? "" },
      { enabled: key !== null },
    ),
  );

  // Poll an in-flight run; settle → refresh the export index + cache.
  const jobQuery = useQuery(
    trpc.reports.job.queryOptions(
      { key: jobKey ?? "" },
      {
        enabled: jobKey !== null,
        refetchInterval: (query) =>
          query.state.data?.status === "running" ? 1000 : false,
      },
    ),
  );
  useEffect(() => {
    const job = jobQuery.data;
    if (jobKey === null || job === undefined) return;
    if (job === null) {
      setJobKey(null);
      toast.error("Report job lost — the server probably restarted.");
      return;
    }
    if (job.status === "running") return;
    setJobKey(null);
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
  }, [jobQuery.data, jobKey, queryClient, trpc]);

  const generate = useMutation(
    trpc.reports.generate.mutationOptions({
      onSuccess: (job) => setJobKey(job.key),
      onError: (e) => toast.error(e.message),
    }),
  );

  const value = useMemo<WorkspaceReportState>(() => {
    const exportData = exportQuery.data ?? null;
    const latestUpdated = latestUpdatedAtOf(
      (rootPath
        ? projects.filter((p) => p.path.startsWith(rootPath))
        : projects
      ).map((p) => p.updatedAt),
    );
    let status: ReportStatus;
    if (rootPath === undefined) {
      status = "no-root";
    } else if (jobKey !== null) {
      status = "running";
    } else if (
      commandQuery.isPending ||
      (key !== null && exportQuery.isPending)
    ) {
      status = "loading";
    } else if (exportData === null) {
      status = "missing";
    } else {
      status = isReportStale(exportData.generatedAt, latestUpdated) ? "stale" : "fresh";
    }
    return {
      status,
      exportData,
      byPath: exportData ? indexProjectsByPath(exportData) : new Map(),
      key,
      period,
      setPeriod,
      regenerate: () => {
        if (rootPath !== undefined) {
          generate.mutate({ kind: "scan", path: rootPath, period, force: true });
        }
      },
      regenerating: generate.isPending || jobKey !== null,
      latestUpdated,
    };
  }, [
    commandQuery.isPending,
    exportQuery.data,
    exportQuery.isPending,
    generate,
    jobKey,
    key,
    period,
    projects,
    rootPath,
  ]);

  return <ReportDataContext.Provider value={value}>{children}</ReportDataContext.Provider>;
}

/** Read the shared workspace report state (signal line + mosaic tiles). */
export function useWorkspaceReport(): WorkspaceReportState {
  return useContext(ReportDataContext);
}

export type ProjectReportSource = "repo" | "scan";

/** One snitch project entry — the shape every tile/page chart reads. */
export type SnitchEntry = ReportExportProject;

export interface ProjectReportState {
  status: ReportStatus;
  /** The project's own entry: repo export when cached, scan entry otherwise. */
  entry: ReportExportProject | null;
  source: ProjectReportSource | null;
  generatedAt: string | null;
  /** The HTML report key currently backing the entry. */
  key: string | null;
  generate: () => void;
  generating: boolean;
}

/**
 * Per-project snitch data for the project page: prefer this project's own
 * repo report; fall back to the newest workspace scan's entry for the path.
 * Repo reports are richer (single-repo depth), scans exist workspace-wide —
 * the page charts whichever is available and offers a one-click generate.
 */
export function useProjectSnitchReport(path: string, projectUpdatedAt: string | null): ProjectReportState {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [jobKey, setJobKey] = useState<string | null>(null);

  const repoCommand = useQuery(
    trpc.reports.command.queryOptions(
      { kind: "repo", path },
      { enabled: path.length > 0 },
    ),
  );
  const repoKey = repoCommand.data?.key ?? null;
  const repoExport = useQuery(
    trpc.reports.jsonExport.queryOptions(
      { key: repoKey ?? "" },
      { enabled: repoKey !== null },
    ),
  );

  // Scan fallback: newest cached scan export, any period.
  const exportsIndex = useQuery(trpc.reports.jsonExports.queryOptions());
  const newestScanKey = useMemo(
    () => exportsIndex.data?.find((e) => e.kind === "scan")?.key ?? null,
    [exportsIndex.data],
  );
  const scanExport = useQuery(
    trpc.reports.jsonExport.queryOptions(
      { key: newestScanKey ?? "" },
      { enabled: newestScanKey !== null },
    ),
  );

  const jobQuery = useQuery(
    trpc.reports.job.queryOptions(
      { key: jobKey ?? "" },
      {
        enabled: jobKey !== null,
        refetchInterval: (query) =>
          query.state.data?.status === "running" ? 1000 : false,
      },
    ),
  );
  useEffect(() => {
    const job = jobQuery.data;
    if (jobKey === null || job === undefined) return;
    if (job === null) {
      setJobKey(null);
      toast.error("Report job lost — the server probably restarted.");
      return;
    }
    if (job.status === "running") return;
    setJobKey(null);
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
  }, [jobQuery.data, jobKey, queryClient, trpc]);

  const generate = useMutation(
    trpc.reports.generate.mutationOptions({
      onSuccess: (job) => setJobKey(job.key),
      onError: (e) => toast.error(e.message),
    }),
  );

  return useMemo<ProjectReportState>(() => {
    const repo = repoExport.data ?? null;
    const scan = scanExport.data ?? null;
    const scanEntry =
      newestScanKey !== null && scan !== null
        ? (scan.projects.find((p) => p.path === path) ?? null)
        : null;

    let status: ReportStatus;
    let entry: ReportExportProject | null;
    let source: ProjectReportSource | null;
    let generatedAt: string | null;
    let key: string | null;

    if (jobKey !== null) {
      status = "running";
      entry = null;
      source = null;
      generatedAt = null;
      key = jobKey;
    } else if (repoCommand.isPending || (repoKey !== null && repoExport.isPending)) {
      status = "loading";
      entry = null;
      source = null;
      generatedAt = null;
      key = repoKey;
    } else if (repo !== null) {
      entry = repo.projects[0] ?? null;
      source = "repo";
      generatedAt = repo.generatedAt;
      key = repo.key;
      status = isReportStale(repo.generatedAt, projectUpdatedAt) ? "stale" : "fresh";
    } else if (scanEntry !== null && scan !== null) {
      entry = scanEntry;
      source = "scan";
      generatedAt = scan.generatedAt;
      key = scan.key;
      status = isReportStale(scan.generatedAt, projectUpdatedAt) ? "stale" : "fresh";
    } else {
      status = "missing";
      entry = null;
      source = null;
      generatedAt = null;
      key = repoKey;
    }

    return {
      status,
      entry,
      source,
      generatedAt,
      key,
      generate: () => generate.mutate({ kind: "repo", path, force: false }),
      generating: generate.isPending || jobKey !== null,
    };
  }, [
    generate,
    newestScanKey,
    path,
    projectUpdatedAt,
    repoCommand.isPending,
    repoExport.data,
    repoExport.isPending,
    repoKey,
    scanExport.data,
    jobKey,
  ]);
}
