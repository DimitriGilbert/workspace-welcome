/**
 * Aggregations over a snitch ReportExport for the mission-bento surfaces.
 * Staleness predicates come from the shared, browser-safe
 * `@workspace-welcome/api/lib/report-staleness` — no mirror here.
 */

import type { ReportExport, ReportExportProject } from "@workspace-welcome/api/lib/report-export";

export interface CadencePoint {
  period: string;
  commits: number;
}

/** Sum the export's per-project cadence series into one ordered series. */
export function aggregateCadence(exportData: ReportExport): CadencePoint[] {
  const sums = new Map<string, number>();
  for (const project of exportData.projects) {
    for (const point of project.cadence) {
      sums.set(point.period, (sums.get(point.period) ?? 0) + point.commits);
    }
  }
  return [...sums.entries()]
    .map(([period, commits]) => ({ period, commits }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

export interface AlertLabelRow {
  label: string;
  count: number;
  worst: "critical" | "warning" | "info";
}

const ALERT_WEIGHT = { critical: 2, warning: 1, info: 0 } as const;

/**
 * Alert census by label. Per-project signals when the export carries them,
 * the top-level totals otherwise. Worst severity drives the bar hue.
 */
export function aggregateAlertLabels(exportData: ReportExport): AlertLabelRow[] {
  const rows = new Map<string, AlertLabelRow>();
  const sources =
    exportData.projects.length > 0
      ? exportData.projects.flatMap((p) => p.alerts)
      : exportData.totals.alerts;
  for (const alert of sources) {
    const row = rows.get(alert.label) ?? {
      label: alert.label,
      count: 0,
      worst: "info" as const,
    };
    row.count++;
    if (ALERT_WEIGHT[alert.severity] > ALERT_WEIGHT[row.worst]) {
      row.worst = alert.severity;
    }
    rows.set(alert.label, row);
  }
  return [...rows.values()].sort((a, b) => b.count - a.count);
}

export interface LanguageRow {
  language: string;
  files: number;
  lines: number;
}

/** Language census, heaviest by lines first. */
export function languageRows(exportData: ReportExport, limit = 8): LanguageRow[] {
  const rows =
    exportData.totals.languages.length > 0
      ? exportData.totals.languages
      : (exportData.projects[0]?.languages ?? []);
  return [...rows].sort((a, b) => b.lines - a.lines).slice(0, limit);
}

/** Index a scan export's projects by absolute path for O(1) tile lookups. */
export function indexProjectsByPath(
  exportData: ReportExport,
): Map<string, ReportExportProject> {
  return new Map(exportData.projects.map((p) => [p.path, p]));
}

/** Compact numeral: 6760914711 → 6.8B, 210433186 → 210.4M, 912 → 912. */
export function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return n.toLocaleString();
}

/** Recorded AI cost, formatted; the runs are subsidized, so $0 is common. */
export function formatCost(cost: number): string {
  if (cost === 0) return "$0";
  if (cost < 1) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(2)}`;
}

/** A single project's cadence, ordered oldest → newest. */
export function projectCadence(
  entry: ReportExportProject,
): { period: string; commits: number }[] {
  return [...entry.cadence]
    .map((point) => ({ period: point.period, commits: point.commits }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

/** A single project's languages, heaviest by lines first. */
export function projectLanguages(
  entry: ReportExportProject,
  limit = 8,
): LanguageRow[] {
  return [...entry.languages].sort((a, b) => b.lines - a.lines).slice(0, limit);
}

/**
 * Adapt one snitch project entry into the export shape the aggregators read,
 * so dashboard instruments (alerts census, activity panes) can be reused
 * verbatim on a single project's data.
 */
export function entryAsExport(entry: ReportExportProject): ReportExport {
  return {
    key: `entry-${entry.path}`,
    kind: "repo",
    label: "project",
    targetPath: entry.path,
    period: null,
    generatedAt: entry.lastCommit?.date ?? new Date(0).toISOString(),
    savedAt: entry.lastCommit?.date ?? new Date(0).toISOString(),
    projects: [entry],
    totals: {
      commits: entry.totalCommits,
      contributors: entry.contributors,
      repositories: 1,
      languages: entry.languages,
      alerts: entry.alerts,
    },
    aiUsage: entry.aiUsage,
  };
}
