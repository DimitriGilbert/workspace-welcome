/**
 * Pure derivations for the Bento dashboard. Every number rendered by the
 * mosaic comes from these functions, which only read real scan data — no
 * synthetic series anywhere.
 */

import type { ReportExport } from "@workspace-welcome/api/lib/report-export";
import type { ReportExportProject } from "@workspace-welcome/api/lib/report-export";
import type { Project } from "@workspace-welcome/api/lib/types";

import { computeMosaicLayout } from "@/lib/mosaic-layout";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** The most recent moment the project shows any sign of life. */
export function lastTouch(p: Project, now: number = Date.now()): number {
  const candidates = [new Date(p.updatedAt).getTime()];
  if (p.git.lastCommit?.date) candidates.push(new Date(p.git.lastCommit.date).getTime());
  if (p.lastOpenedAt) candidates.push(new Date(p.lastOpenedAt).getTime());
  return Math.min(
    Math.max(...candidates),
    now,
  );
}

/* ------------------------------------------------------------ mosaic size */

/**
 * The project mosaic is sized and packed by the shared algorithm
 * (`@/lib/mosaic-layout`): log-scaled, set-relative recency scores, the
 * canonical 3×3 / 2×3 / 2×2 / 2×1 / 1×1 ladder on a 12-column grid, and a
 * skyline pack that pulls small blocks up to fill every row. This wrapper
 * only adapts the scan's Project shape and re-indexes the placements by path
 * for the tiles.
 */

export type MosaicLayout = ReturnType<typeof computeMosaicLayout>;
export type MosaicPlacement = MosaicLayout["placements"][number];

export interface WorkspaceMosaic {
  layout: MosaicLayout;
  /** Placements by project path — tiles look up their own box here. */
  byPath: Map<string, MosaicPlacement>;
  /** Projects carrying at least one error or warn alert, worst first. */
  attention: Project[];
}

export function buildMosaic(
  projects: Project[],
  now: number = Date.now(),
): WorkspaceMosaic {
  const layout = computeMosaicLayout(projects, { now });
  const byPath = new Map(layout.placements.map((p) => [p.path, p]));

  const severityWeight = (p: Project) =>
    p.alerts.some((a) => a.severity === "error")
      ? 2
      : p.alerts.some((a) => a.severity === "warn")
        ? 1
        : 0;
  const attention = projects
    .filter((p) => severityWeight(p) > 0)
    .sort((a, b) => {
      const w = severityWeight(b) - severityWeight(a);
      return w !== 0 ? w : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  return { layout, byPath, attention };
}

/**
 * "2h / 3d / 5w / 4mo" — the compact age the ring's age chip renders. One
 * unit of resolution per magnitude, mono-friendly.
 */
export function compactAge(ms: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - ms) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 32) return `${days}d`;
  const months = Math.floor(days / 30.44);
  if (months < 24) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}

/** FNV-1a — deterministic per-tile seeds (carousel stagger) from a path. */
export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ------------------------------------------------------- report datasets */

/**
 * A ReportExport indexed for O(1) per-tile lookup: the dashboard fetches ONE
 * scan export (lazy, react-query cached) and hands every tile this index —
 * no per-tile fetching, no 30-request fan-out.
 */
export interface ReportDataset {
  generatedAt: string;
  key: string;
  byPath: Map<string, ReportExportProject>;
  /** True when no export was available at all. */
  empty: boolean;
}

export function indexReportExport(data: ReportExport): ReportDataset {
  return {
    generatedAt: data.generatedAt,
    key: data.key,
    byPath: new Map(data.projects.map((p) => [p.path, p])),
    empty: false,
  };
}

export const EMPTY_REPORT_DATASET: ReportDataset = {
  generatedAt: "",
  key: "",
  byPath: new Map(),
  empty: true,
};

/* ------------------------------------------------------------- health */

export interface HealthSummary {
  /** 0-100 hygiene index: 100 minus severity penalties across projects. */
  score: number;
  total: number;
  /** Projects with at least one error or warn alert. */
  flagged: number;
  /** Projects whose newest activity is 30+ days old. */
  dormant: number;
  /** Projects with no error/warn alerts. */
  clean: number;
  /** Projects touched in the last 7 days. */
  activeThisWeek: number;
}

/**
 * Workspace health: every project starts clean and subtracts by its worst
 * signals. Penalties are capped per project so one noisy repo cannot zero
 * the whole workspace, and info-level alerts only nibble.
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
      if (a.severity === "error") projectPenalty += 14;
      else if (a.severity === "warn") projectPenalty += 6;
      else projectPenalty += 1.5;
    }
    penalty += Math.min(projectPenalty, 20);
    const hasBlocking = p.alerts.some(
      (a) => a.severity === "error" || a.severity === "warn",
    );
    if (hasBlocking) flagged++;
    else clean++;
    if (now - lastTouch(p, now) >= 30 * 24 * 60 * 60 * 1000) dormant++;
    if (now - lastTouch(p, now) < WEEK_MS) activeThisWeek++;
  }

  const score =
    projects.length === 0 ? 100 : Math.round(Math.max(0, 100 - penalty));
  return { score, total: projects.length, flagged, dormant, clean, activeThisWeek };
}

/* ----------------------------------------------------------- activity */

export interface WeeklyActivityPoint {
  /** Monday of the bucket week, as a short label like "Jul 14". */
  label: string;
  /** Projects whose last touch falls inside this week. */
  count: number;
}

const WEEK_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

/**
 * Projects touched per week over the trailing `weeks` weeks, oldest first.
 * "Touched" = updated, committed or opened most recently in that week, so
 * the curve is a real histogram of last-touch events, not a projection.
 */
export function weeklyActivity(
  projects: Project[],
  weeks: number = 16,
  now: number = Date.now(),
): WeeklyActivityPoint[] {
  // Align buckets to week boundaries so labels read as calendar weeks.
  const currentWeekStart = startOfWeek(now);
  const counts = new Array<number>(weeks).fill(0);
  for (const p of projects) {
    const t = lastTouch(p, now);
    const weekIndex =
      weeks - 1 - Math.floor((currentWeekStart - startOfWeek(t)) / WEEK_MS);
    if (weekIndex >= 0 && weekIndex < weeks) counts[weekIndex]++;
  }
  return counts.map((count, i) => ({
    label: WEEK_FORMATTER.format(new Date(currentWeekStart - (weeks - 1 - i) * WEEK_MS)),
    count,
  }));
}

function startOfWeek(ms: number): number {
  const d = new Date(ms);
  // Monday-based weeks; normalize to local midnight.
  const day = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  return d.getTime() - day * 24 * 60 * 60 * 1000;
}

/* ------------------------------------------------------------ severity */

export type SeverityCounts = { error: number; warn: number; info: number };

/** Alert counts by severity across all visible projects. */
export function severityCounts(projects: Project[]): SeverityCounts {
  const counts: SeverityCounts = { error: 0, warn: 0, info: 0 };
  for (const p of projects) {
    for (const a of p.alerts) counts[a.severity]++;
  }
  return counts;
}

/** The worst alert severity a project carries, or null when clean. */
export function worstSeverity(
  p: Project,
): "error" | "warn" | "info" | null {
  if (p.alerts.some((a) => a.severity === "error")) return "error";
  if (p.alerts.some((a) => a.severity === "warn")) return "warn";
  if (p.alerts.some((a) => a.severity === "info")) return "info";
  return null;
}

/* -------------------------------------------------------------- stacks */

export interface StackSlice {
  id: string;
  label: string;
  count: number;
}

/**
 * Stack breakdown, largest first, capped at `max` slices with the remainder
 * folded into "Other" so the donut stays readable.
 */
export function stackDistribution(projects: Project[], max: number = 5): StackSlice[] {
  const counts = new Map<string, { id: string; label: string; count: number }>();
  for (const p of projects) {
    const key = p.stack?.id ?? "other";
    const label = p.stack?.label ?? "Unspecified";
    const entry = counts.get(key) ?? { id: key, label, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  const sorted = [...counts.values()].sort((a, b) => b.count - a.count);
  if (sorted.length <= max) return sorted;
  const head = sorted.slice(0, max - 1);
  const restCount = sorted.slice(max - 1).reduce((sum, s) => sum + s.count, 0);
  return [...head, { id: "other", label: "Other", count: restCount }];
}

/* -------------------------------------------------------- dirty leaders */

export interface DirtyLeader {
  name: string;
  path: string;
  dirty: number;
}

/** Repos with the most uncommitted files, worst first. */
export function dirtyLeaders(projects: Project[], limit: number = 5): DirtyLeader[] {
  return projects
    .filter((p) => (p.git.dirtyCount ?? 0) > 0)
    .sort((a, b) => (b.git.dirtyCount ?? 0) - (a.git.dirtyCount ?? 0))
    .slice(0, limit)
    .map((p) => ({ name: p.name, path: p.path, dirty: p.git.dirtyCount ?? 0 }));
}

/* ------------------------------------------------------- report exports */
/*
 * Chart-ready aggregations over a ReportExport (git-snitch JSON). All pure:
 * the tabbed report widget and the data-bearing tiles render straight from
 * these. Staleness comes from the shared fs-free module
 * `@workspace-welcome/api/lib/report-staleness` — no local mirror.
 */

/** Commits per period, summed across the export's projects, oldest first. */
export interface CadencePoint {
  period: string;
  commits: number;
}

export function aggregateCadence(
  data: ReportExport,
  maxPeriods: number = 14,
): CadencePoint[] {
  const byPeriod = new Map<string, number>();
  for (const project of data.projects) {
    for (const point of project.cadence) {
      byPeriod.set(point.period, (byPeriod.get(point.period) ?? 0) + point.commits);
    }
  }
  return [...byPeriod.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-maxPeriods)
    .map(([period, commits]) => ({ period, commits }));
}

/** One tally entry for the health tab: an alert label and its summed value. */
export interface AlertTallyRow {
  label: string;
  severity: "info" | "warning" | "critical";
  value: number;
}

export interface AlertTally {
  info: number;
  warning: number;
  critical: number;
  /** Distinct alert labels by summed value, worst first, capped. */
  top: AlertTallyRow[];
  total: number;
}

export function tallyAlerts(data: ReportExport, max: number = 6): AlertTally {
  const counts: AlertTally = { info: 0, warning: 0, critical: 0, top: [], total: 0 };
  const byLabel = new Map<string, AlertTallyRow>();
  for (const alert of data.totals.alerts) {
    counts[alert.severity] += alert.value;
    counts.total += alert.value;
    const key = `${alert.severity}:${alert.label}`;
    const entry = byLabel.get(key) ?? {
      label: alert.label,
      severity: alert.severity,
      value: 0,
    };
    entry.value += alert.value;
    byLabel.set(key, entry);
  }
  counts.top = [...byLabel.values()]
    .sort((a, b) => b.value - a.value)
    .slice(0, max);
  return counts;
}

export interface LanguageRow {
  language: string;
  files: number;
  lines: number;
}

/** Languages by lines, largest first, capped — "Other" folds the tail. */
export function topLanguages(data: ReportExport, max: number = 8): LanguageRow[] {
  const sorted = [...data.totals.languages].sort((a, b) => b.lines - a.lines);
  if (sorted.length <= max) return sorted;
  const head = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1).reduce(
    (acc, l) => ({ language: "Other", files: acc.files + l.files, lines: acc.lines + l.lines }),
    { language: "Other", files: 0, lines: 0 },
  );
  return [...head, rest];
}

export interface AiUsageLeader {
  name: string;
  records: number;
  cost: number;
  tokens: number;
}

/** Repos by total AI tokens, worst first, capped (scan reports only). */
export function aiUsageLeaders(data: ReportExport, max: number = 6): AiUsageLeader[] {
  return data.projects
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

/* ---------------------------------------------------------------- color */

/** Categorical ramp for the stack donut (see --bento-c* in bento.css). */
export const STACK_RAMP = [
  "var(--bento-c1)",
  "var(--bento-c2)",
  "var(--bento-c3)",
  "var(--bento-c4)",
  "var(--bento-c5)",
  "var(--bento-c6)",
] as const;
