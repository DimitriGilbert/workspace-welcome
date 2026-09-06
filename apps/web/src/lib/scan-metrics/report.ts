/**
 * Chart-ready aggregations over a snitch `ReportExport`. All pure: widgets
 * render straight from these. Staleness stays in the shared fs-free module
 * `@workspace-welcome/api/lib/report-staleness` — no mirror here.
 *
 * Pure TS: no React, no color tokens; canonical severity throughout.
 */

import type { ReportExport, ReportExportProject } from "@workspace-welcome/api/lib/report-export";
import type { AlertSeverity, Project } from "@workspace-welcome/api/lib/types";

import { lastTouchMs } from "./activity";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export interface CadencePoint {
  period: string;
  commits: number;
}

/** Sum the export's per-project cadence series into one ordered series. */
export function aggregateCadence(exportData: ReportExport, maxPeriods = Infinity): CadencePoint[] {
  const sums = new Map<string, number>();
  for (const project of exportData.projects) {
    for (const point of project.cadence) {
      sums.set(point.period, (sums.get(point.period) ?? 0) + point.commits);
    }
  }
  const series = [...sums.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, commits]) => ({ period, commits }));
  return series.length > maxPeriods ? series.slice(-maxPeriods) : series;
}

export interface AlertTallyRow {
  label: string;
  /** Worst severity the alert was seen at; drives presentation tone. */
  worst: AlertSeverity;
  /** How many projects/repositories reported the alert. */
  count: number;
  /** Summed alert value (the CLI's numeric signal, e.g. days behind). */
  value: number;
  /** First-seen summary text for tooltips. */
  summary: string;
}

export interface AlertTally {
  /** Severity census over summed values (canonical union). */
  severityCounts: Record<AlertSeverity, number>;
  /** Distinct alerts, worst first, then by summed value. */
  rows: AlertTallyRow[];
  total: number;
}

const ALERT_WEIGHT: Record<AlertSeverity, number> = { critical: 2, warning: 1, info: 0 };

/**
 * Alert census across the whole export: per-project signals when the export
 * carries them, the top-level totals otherwise (mb's fold), values summed
 * per severity (bento's tally).
 */
export function alertTally(exportData: ReportExport): AlertTally {
  const tally: AlertTally = {
    severityCounts: { critical: 0, warning: 0, info: 0 },
    rows: [],
    total: 0,
  };
  const sources =
    exportData.projects.length > 0
      ? exportData.projects.flatMap((p) => p.alerts)
      : exportData.totals.alerts;
  const byLabel = new Map<string, AlertTallyRow>();
  for (const alert of sources) {
    tally.severityCounts[alert.severity] += alert.value;
    tally.total += alert.value;
    const key = `${alert.severity}:${alert.label}`;
    const row = byLabel.get(key) ?? {
      label: alert.label,
      worst: "info" as AlertSeverity,
      count: 0,
      value: 0,
      summary: alert.summary,
    };
    row.count++;
    row.value += alert.value;
    if (ALERT_WEIGHT[alert.severity] > ALERT_WEIGHT[row.worst]) row.worst = alert.severity;
    byLabel.set(key, row);
  }
  tally.rows = [...byLabel.values()].sort(
    (a, b) =>
      ALERT_WEIGHT[b.worst] - ALERT_WEIGHT[a.worst] || b.value - a.value || b.count - a.count,
  );
  return tally;
}

export interface LanguageRow {
  language: string;
  files: number;
  lines: number;
}

/** Language census, heaviest by lines first; falls back to a repo report's
 * single project when the scan totals carry no languages. */
export function languageRows(exportData: ReportExport, limit = 8): LanguageRow[] {
  const rows =
    exportData.totals.languages.length > 0
      ? exportData.totals.languages
      : (exportData.projects[0]?.languages ?? []);
  return [...rows].sort((a, b) => b.lines - a.lines).slice(0, limit);
}

/** A single project entry's languages, heaviest by lines first. */
export function projectLanguages(entry: ReportExportProject, limit = 8): LanguageRow[] {
  return [...entry.languages].sort((a, b) => b.lines - a.lines).slice(0, limit);
}

/** Index a scan export's projects by absolute path for O(1) tile lookups. */
export function indexProjectsByPath(
  exportData: ReportExport,
): Map<string, ReportExportProject> {
  return new Map(exportData.projects.map((p) => [p.path, p]));
}

/** Adapt one snitch project entry into the export shape the aggregators
 * read, so whole-workspace instruments can be reused verbatim on one project. */
export function entryAsExport(entry: ReportExportProject): ReportExport {
  const at = entry.lastCommit?.date ?? new Date(0).toISOString();
  return {
    key: `entry-${entry.path}`,
    kind: "repo",
    label: "project",
    targetPath: entry.path,
    period: null,
    generatedAt: at,
    savedAt: at,
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

export interface AiUsageLeader {
  name: string;
  records: number;
  cost: number;
  tokens: number;
}

/** Repos by total AI tokens, heaviest first, capped (scan reports only). */
export function aiUsageLeaders(exportData: ReportExport, max = 6): AiUsageLeader[] {
  return exportData.projects
    .filter((p) => p.aiUsage !== null)
    .map((p) => ({
      name: p.name,
      records: p.aiUsage?.records ?? 0,
      cost: p.aiUsage?.cost ?? 0,
      tokens: p.aiUsage?.tokens.total ?? 0,
    }))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, max);
}

export interface HealthSummary {
  /** 0-100 hygiene index: 100 minus severity penalties across projects. */
  score: number;
  total: number;
  /** Projects with at least one critical/warning alert. */
  flagged: number;
  /** Projects whose newest activity is 30+ days old. */
  dormant: number;
  /** Projects with no critical/warning alerts. */
  clean: number;
  /** Projects touched in the last 7 days. */
  activeThisWeek: number;
}

/**
 * Workspace health (bento's gauge input): penalties capped per project so one
 * noisy repo cannot zero the workspace; info alerts only nibble.
 */
export function healthSummary(projects: Project[], now: number = Date.now()): HealthSummary {
  let penalty = 0;
  let flagged = 0;
  let dormant = 0;
  let clean = 0;
  let activeThisWeek = 0;

  for (const p of projects) {
    let projectPenalty = 0;
    for (const a of p.alerts) {
      if (a.severity === "critical") projectPenalty += 14;
      else if (a.severity === "warning") projectPenalty += 6;
      else projectPenalty += 1.5;
    }
    penalty += Math.min(projectPenalty, 20);
    if (p.alerts.some((a) => a.severity === "critical" || a.severity === "warning")) flagged++;
    else clean++;
    const touch = lastTouchMs(p, now);
    if (now - touch >= 30 * DAY_MS) dormant++;
    if (now - touch < WEEK_MS) activeThisWeek++;
  }

  const score = projects.length === 0 ? 100 : Math.round(Math.max(0, 100 - penalty));
  return { score, total: projects.length, flagged, dormant, clean, activeThisWeek };
}
