/**
 * THE snitch-report view model — the one normalizer for the widget
 * system.
 *
 * Folds a `ReportExport` (repo single-entry or scan comparative) into one
 * directly-consumable shape so parts never re-map: `cadence`, `alerts`,
 * `languageRows`, and the whole `alertTally` (`.rows` included) are computed
 * HERE, once per export, from the canonical aggregators in
 * `lib/scan-metrics/report`. Staleness wraps the unchanged, fs-free
 * `@workspace-welcome/api/lib/report-staleness` — the caller (the report
 * context provider) passes the scope's `latestUpdated` in; this module owns
 * no scope knowledge.
 */

import type { ReportExport } from "@workspace-welcome/api/lib/report-export";
import { isReportStale } from "@workspace-welcome/api/lib/report-staleness";
import type { AlertSeverity } from "@workspace-welcome/api/lib/types";

import {
  aggregateCadence,
  alertTally,
  languageRows,
} from "@/lib/scan-metrics/report";
import type {
  AlertTally,
  CadencePoint,
  LanguageRow,
} from "@/lib/scan-metrics/report";

/** One directly-consumable alert row: label/severity/summary/count/value. */
export interface ReportAlertRow {
  label: string;
  severity: AlertSeverity;
  summary: string;
  /** How many alert instances (projects) reported this label. */
  count: number;
  /** Summed alert value (the CLI's numeric signal, e.g. days behind). */
  value: number;
}

/**
 * Normalized view over ReportExport: scan reports aggregate across their
 * project entries; repo reports read the single entry. Keeps every consumer
 * identical for both kinds.
 */
export interface ReportView {
  export: ReportExport;
  cadence: CadencePoint[];
  alerts: ReportAlertRow[];
  languageRows: LanguageRow[];
  /** Full census (severityCounts/total/rows) for widget-grade consumers. */
  alertTally: AlertTally;
  totals: { commits: number; contributors: number; repositories: number };
  aiUsage: ReportExport["aiUsage"];
  projectCount: number;
  /** Scope staleness verdict: project work moved ≥24h past generatedAt. */
  stale: boolean;
  /**
   * The project updatedAt the staleness verdict was judged against — the
   * provider's `latestUpdated`; null when the scan offered no value (absent
   * data is never stale).
   */
  staleAt: string | null;
}

/**
 * Fold an export into the renderable view. `latestUpdated` is the scope's
 * staleness input (max scan updatedAt for scan reports, the project's own
 * for repo reports) — computed by the provider, consumed verbatim here.
 */
export function toReportView(
  data: ReportExport,
  latestUpdated: string | null,
): ReportView {
  const stale = isReportStale(data.generatedAt, latestUpdated);
  const tally = alertTally(data);
  if (data.kind === "repo") {
    const p = data.projects[0];
    return {
      export: data,
      cadence: aggregateCadence(data),
      alerts: tally.rows.map((row) => ({
        label: row.label,
        severity: row.worst,
        summary: row.summary,
        count: row.count,
        value: row.value,
      })),
      languageRows: languageRows(data),
      alertTally: tally,
      totals: {
        commits: p?.totalCommits ?? 0,
        contributors: p?.contributors ?? 0,
        repositories: 1,
      },
      aiUsage: p?.aiUsage ?? data.aiUsage,
      projectCount: 1,
      stale,
      staleAt: latestUpdated,
    };
  }
  // Scan: the aggregators fold every project's series into one view.
  return {
    export: data,
    cadence: aggregateCadence(data),
    alerts: tally.rows.map((row) => ({
      label: row.label,
      severity: row.worst,
      summary: row.summary,
      count: row.count,
      value: row.value,
    })),
    languageRows: languageRows(data),
    alertTally: tally,
    totals: {
      commits: data.totals.commits,
      contributors: data.totals.contributors,
      repositories: data.totals.repositories,
    },
    aiUsage: data.aiUsage,
    projectCount: data.projects.length,
    stale,
    staleAt: latestUpdated,
  };
}
