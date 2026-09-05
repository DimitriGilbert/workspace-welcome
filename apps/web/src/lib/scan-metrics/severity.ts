/**
 * Severity helpers over the canonical `critical | warning | info` union
 * (`AlertSeverity` in @workspace-welcome/api — no runtime mapping anywhere).
 *
 * Also home to the 5-tone `ledState` derivation (master-plan ruling 4):
 * packages/ui's `Led` keeps its own structurally-identical tone union with NO
 * import in either direction; the app part composes them.
 *
 * Pure TS: no React, no color tokens; `now` is a defaulted parameter.
 */

import type { AlertSeverity, Project } from "@workspace-welcome/api/lib/types";

import { byUpdatedDesc, isHot } from "./activity";

export interface SeverityCounts {
  critical: number;
  warning: number;
  info: number;
}

/** Total alert signals by severity across all projects. */
export function severityCounts(projects: Project[]): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, warning: 0, info: 0 };
  for (const p of projects) {
    for (const a of p.alerts) counts[a.severity]++;
  }
  return counts;
}

/** Worst alert severity carried by a project, or null when clean. */
export function worstSeverity(p: Project): AlertSeverity | null {
  if (p.alerts.some((a) => a.severity === "critical")) return "critical";
  if (p.alerts.some((a) => a.severity === "warning")) return "warning";
  if (p.alerts.some((a) => a.severity === "info")) return "info";
  return null;
}

/** Sort key for triage: critical < warning < info < clean. */
export function severityRank(p: Project): number {
  const worst = worstSeverity(p);
  if (worst === "critical") return 0;
  if (worst === "warning") return 1;
  if (worst === "info") return 2;
  return 3;
}

export interface SeverityRow {
  severity: AlertSeverity;
  count: number;
  /** Distinct alert codes at this severity, most frequent first. */
  codes: { code: string; count: number }[];
}

/** Alert ledger per severity with per-code rollup (promoted from MC). */
export function severityLedger(projects: Project[]): SeverityRow[] {
  const rows: SeverityRow[] = [
    { severity: "critical", count: 0, codes: [] },
    { severity: "warning", count: 0, codes: [] },
    { severity: "info", count: 0, codes: [] },
  ];
  const codes = new Map<string, number>();
  for (const p of projects) {
    for (const a of p.alerts) {
      const row = rows.find((r) => r.severity === a.severity);
      if (!row) continue;
      row.count++;
      const key = `${row.severity}:${a.code}`;
      codes.set(key, (codes.get(key) ?? 0) + 1);
    }
  }
  for (const row of rows) {
    row.codes = [...codes.entries()]
      .filter(([key]) => key.startsWith(`${row.severity}:`))
      .map(([key, count]) => ({ code: key.slice(row.severity.length + 1), count }))
      .sort((a, b) => b.count - a.count);
  }
  return rows;
}

/**
 * The attention surface: projects carrying at least one critical/warning
 * alert, worst first, freshest tiebreak (converges meadow flaggedProjects,
 * bento attention, and mb's triage channel into ONE derivation).
 */
export function attentionProjects(projects: Project[]): Project[] {
  return projects
    .filter((p) =>
      p.alerts.some((a) => a.severity === "critical" || a.severity === "warning"),
    )
    .sort((a, b) => severityRank(a) - severityRank(b) || byUpdatedDesc(a, b));
}

// --- ledState (ruling 4) ----------------------------------------------------

/** Structural union — identical to packages/ui `Led`'s tone union by design;
 * never cross-import between here and packages/ui. */
export interface LedState {
  tone: "critical" | "warning" | "info" | "live" | "nominal";
  label: string;
}

/**
 * A project's LED state: worst alert severity wins, then a "live" lamp when
 * the project was touched in the last 48h (isHot), then a clean nominal lamp.
 * `now` comes from the caller (the workspace clock) — required, not defaulted,
 * so no component can accidentally read wall-clock time during SSR.
 */
export function ledState(project: Project, now: number): LedState {
  const worst = worstSeverity(project);
  if (worst === "critical") return { tone: "critical", label: "Error alert open" };
  if (worst === "warning") return { tone: "warning", label: "Warning alert open" };
  if (worst === "info") return { tone: "info", label: "Info alert open" };
  if (isHot(project, now)) {
    return { tone: "live", label: "Live — touched in the last 48 hours" };
  }
  return { tone: "nominal", label: "Nominal" };
}
