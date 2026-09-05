/**
 * Mission-control metrics: every visualization on the console is derived here
 * from the real scan payload. Nothing is fabricated — the pulse strips replay
 * the shared freshness model (@/lib/recency) backwards from now, the heatmap
 * buckets actual activity timestamps, and the ledgers count actual alerts.
 */

import { format } from "date-fns";

import { freshness, tierFromFreshness } from "@/lib/recency";
import type { AlertSeverity, Project } from "@workspace-welcome/api/lib/types";

export type ViewId = "overview" | "attention" | "pinned" | "archive";
export type SortId = "recent" | "severity" | "name";

/** Worst alert severity carried by a project, or null when clean. */
export function worstSeverity(p: Project): AlertSeverity | null {
  if (p.alerts.some((a) => a.severity === "critical")) return "critical";
  if (p.alerts.some((a) => a.severity === "warning")) return "warning";
  if (p.alerts.some((a) => a.severity === "info")) return "info";
  return null;
}

/** Sort key for triage: errors surface first, clean projects sink. */
export function severityRank(p: Project): number {
  const worst = worstSeverity(p);
  if (worst === "critical") return 0;
  if (worst === "warning") return 1;
  if (worst === "info") return 2;
  return 3;
}

/** Most recent of (meaningful activity, manual open) — the project's pulse. */
export function activityInstantMs(p: Project, now: number = Date.now()): number {
  const updated = new Date(p.updatedAt).getTime();
  const opened = p.lastOpenedAt ? new Date(p.lastOpenedAt).getTime() : 0;
  return Math.min(Math.max(updated, opened, 0), now);
}

export function updatedMs(p: Project): number {
  return new Date(p.updatedAt).getTime();
}

/** Newest first — the default fleet ordering. */
export function byUpdatedDesc(a: Project, b: Project): number {
  return updatedMs(b) - updatedMs(a);
}

/** True when the project was meaningfully touched in the last 48h. */
export function isHot(p: Project, now: number = Date.now()): boolean {
  return now - updatedMs(p) < 48 * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Pulse strip — a per-project sparkline replaying the freshness decay.
// ---------------------------------------------------------------------------

/** Must mirror the horizon in @/lib/recency (90 days) — the strips are drawn
 * over the same window the freshness model is defined on. */
const PULSE_HORIZON_MS = 90 * 24 * 60 * 60 * 1000;

export interface PulseCell {
  /** 0..1 brightness, sampled from the real freshness function. */
  intensity: number;
  /** The cell containing the last activity instant (the event spark). */
  tick: boolean;
}

/**
 * `cells` buckets across the 90-day freshness window, oldest first, the last
 * bucket ending at now. A bucket lights up when it falls between the project's
 * last activity and the present; its brightness is freshness() sampled at that
 * moment. So a project touched today burns bright across the whole strip, and
 * a project touched a month ago shows a fading tail into the present.
 */
export function pulseCells(
  p: Project,
  cells: number = 24,
  now: number = Date.now(),
): PulseCell[] {
  const cellMs = PULSE_HORIZON_MS / cells;
  const activity = activityInstantMs(p, now);
  const age = Math.max(0, now - activity);
  const tickIndex = Math.max(0, cells - 1 - Math.floor(age / cellMs));

  const out: PulseCell[] = [];
  for (let i = 0; i < cells; i++) {
    // Right edge of the bucket, measured as "ms ago" (cell `cells - 1` ends
    // at now). Lit when the edge is younger than the last activity.
    const ago = (cells - 1 - i) * cellMs;
    if (ago > age) {
      out.push({ intensity: 0, tick: false });
      continue;
    }
    const elapsed = age - ago;
    out.push({
      intensity: freshness(p.updatedAt, p.lastOpenedAt, now - elapsed),
      tick: i === tickIndex,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fleet partition — the overview rhythm (mirrors the main dashboard's
// pinned / recent / older split; attention overlaps all three).
// ---------------------------------------------------------------------------

export interface FleetPartition {
  pinned: Project[];
  /** Carries error or warn alerts, regardless of pin/recency. */
  flagged: Project[];
  /** Not pinned, tier fresh or recent. */
  current: Project[];
  /** Not pinned, tier stale or cold — deep storage. */
  archive: Project[];
}

export function partitionFleet(projects: Project[]): FleetPartition {
  const partition: FleetPartition = {
    pinned: [],
    flagged: [],
    current: [],
    archive: [],
  };
  for (const p of projects) {
    if (p.alerts.some((a) => a.severity === "critical" || a.severity === "warning")) {
      partition.flagged.push(p);
    }
    if (p.pinned) {
      partition.pinned.push(p);
      continue;
    }
    const tier = tierFromFreshness(freshness(p.updatedAt, p.lastOpenedAt));
    if (tier === "fresh" || tier === "recent") partition.current.push(p);
    else partition.archive.push(p);
  }
  return partition;
}

// ---------------------------------------------------------------------------
// Vitals — the masthead numerals.
// ---------------------------------------------------------------------------

export interface FleetVitals {
  total: number;
  activeWeek: number;
  attention: number;
  pinned: number;
  dirtySum: number;
  aheadSum: number;
  behindSum: number;
}

export function fleetVitals(projects: Project[], now: number = Date.now()): FleetVitals {
  const vitals: FleetVitals = {
    total: projects.length,
    activeWeek: 0,
    attention: 0,
    pinned: 0,
    dirtySum: 0,
    aheadSum: 0,
    behindSum: 0,
  };
  for (const p of projects) {
    if (now - activityInstantMs(p, now) < 7 * 24 * 60 * 60 * 1000) vitals.activeWeek++;
    if (p.alerts.some((a) => a.severity === "critical" || a.severity === "warning")) {
      vitals.attention++;
    }
    if (p.pinned) vitals.pinned++;
    vitals.dirtySum += p.git.dirtyCount ?? 0;
    vitals.aheadSum += p.git.ahead ?? 0;
    vitals.behindSum += p.git.behind ?? 0;
  }
  return vitals;
}

// ---------------------------------------------------------------------------
// Activity heatmap — projects touched per day over the last N weeks.
// ---------------------------------------------------------------------------

export interface HeatCell {
  date: Date;
  count: number;
  /** Cell sits after today (bottom-right corner of a partial final week). */
  future: boolean;
  label: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local Monday of the week containing `date`. */
function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const shift = (d.getDay() + 6) % 7;
  return new Date(d.getTime() - shift * DAY_MS);
}

/** Local `Y-M-D` day key for a timestamp (ms). */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Daily touch counts across a fleet: one bucket per project activity instant
 * (updatedAt or lastOpenedAt, whichever is newer).
 */
export function activityCounts(
  projects: Project[],
  now: number = Date.now(),
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of projects) {
    const key = dayKey(activityInstantMs(p, now));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Columns are weeks, oldest first; rows are Monday..Sunday, from a Map of
 * local-day keys (see activityCounts / dayKey) to daily counts.
 */
export function activityGridFromCounts(
  counts: Map<string, number>,
  weeks: number = 12,
  now: number = Date.now(),
): HeatCell[][] {
  const today = new Date(now);
  const firstMonday = startOfWeek(today).getTime() - (weeks - 1) * 7 * DAY_MS;
  const grid: HeatCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const column: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(firstMonday + (w * 7 + d) * DAY_MS);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const count = counts.get(key) ?? 0;
      column.push({
        date,
        count,
        future: date.getTime() > now,
        label: `${format(date, "EEE, MMM d")} · ${count} active`,
      });
    }
    grid.push(column);
  }
  return grid;
}

/** 0..4 fill level from a daily count, log-ish so single hits register. */
export function heatLevel(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

// ---------------------------------------------------------------------------
// Ledgers — severity, stacks, dirty leaders.
// ---------------------------------------------------------------------------

export interface SeverityRow {
  severity: AlertSeverity;
  count: number;
  codes: { code: string; count: number }[];
}

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
      codes.set(`${row.severity}:${a.code}`, (codes.get(`${row.severity}:${a.code}`) ?? 0) + 1);
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

export interface StackRow {
  id: string | null;
  label: string;
  count: number;
}

/** Stack census, largest first. Ungrouped projects land under "unresolved". */
export function stackBreakdown(projects: Project[]): StackRow[] {
  const counts = new Map<string, StackRow>();
  for (const p of projects) {
    const key = p.stack?.id ?? "unresolved";
    const row = counts.get(key) ?? { id: p.stack?.id ?? null, label: p.stack?.label ?? "Unresolved", count: 0 };
    row.count++;
    counts.set(key, row);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

export interface DirtyRow {
  name: string;
  path: string;
  dirty: number;
  updated: number;
}

/** Projects carrying the most uncommitted work, heaviest first. */
export function dirtyLeaders(projects: Project[], limit: number = 5): DirtyRow[] {
  return projects
    .filter((p) => (p.git.dirtyCount ?? 0) > 0)
    .sort((a, b) => (b.git.dirtyCount ?? 0) - (a.git.dirtyCount ?? 0) || updatedMs(b) - updatedMs(a))
    .slice(0, limit)
    .map((p) => ({
      name: p.name,
      path: p.path,
      dirty: p.git.dirtyCount ?? 0,
      updated: updatedMs(p),
    }));
}

/** Sort helper applying the console's sort switch to a copy of the list. */
export function sortFleet(projects: Project[], sort: SortId): Project[] {
  const copy = [...projects];
  if (sort === "recent") {
    copy.sort(byUpdatedDesc);
  } else if (sort === "severity") {
    copy.sort((a, b) => severityRank(a) - severityRank(b) || byUpdatedDesc(a, b));
  } else {
    copy.sort((a, b) => a.name.localeCompare(b.name));
  }
  return copy;
}

// ---------------------------------------------------------------------------
// Chart series — the analytics zone's recharts feeds. Shapes kept flat so a
// Pie/Bar can address them by dataKey directly.
// ---------------------------------------------------------------------------

export interface PieRow {
  key: string;
  label: string;
  value: number;
  /** CSS color for the arc. */
  fill: string;
}

/** Alert census as a donut series (one slice per open severity). */
export function alertsPieRows(projects: Project[]): PieRow[] {
  return severityLedger(projects)
    .filter((r) => r.count > 0)
    .map((r) => ({
      key: r.severity,
      label: r.severity,
      value: r.count,
      fill: `var(--sev-${r.severity})`,
    }));
}

const STACK_FILLS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

/** Stack census as a donut series; slices capped at 6, remainder grouped. */
export function stackPieRows(projects: Project[]): PieRow[] {
  const rows = stackBreakdown(projects);
  const head = rows.slice(0, 5);
  const rest = rows.slice(5);
  const out: PieRow[] = head.map((r, i) => ({
    key: r.label,
    label: r.label,
    value: r.count,
    fill: STACK_FILLS[i] ?? "var(--chart-6)",
  }));
  if (rest.length > 0) {
    out.push({
      key: "other",
      label: `other (${rest.length})`,
      value: rest.reduce((sum, r) => sum + r.count, 0),
      fill: "var(--chart-6)",
    });
  }
  return out;
}
