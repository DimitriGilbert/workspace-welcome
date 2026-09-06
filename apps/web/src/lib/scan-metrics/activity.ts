/**
 * Activity metrics over scanned projects.
 *
 * Two distinct "recent activity" concepts live here, named apart on purpose:
 *   - `activityInstantMs` — max(updatedAt, lastOpenedAt), clamped to now. The
 *     pulse/vitals concept (mission-control / mission-bento): manually opening
 *     a project counts as activity.
 *   - `lastTouchMs` — ALSO max(git.lastCommit.date). Bento's health/histogram
 *     concept: a fresh commit counts even when the scan row predates it.
 *
 * Pure TS: no React, no color tokens, no `Date.now()` at module scope — every
 * time-dependent function takes `now` as a defaulted parameter (SSR-safe).
 */

import { format } from "date-fns";

import type { Project } from "@workspace-welcome/api/lib/types";

import { freshness, tierFromFreshness } from "@/lib/recency";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Scan row's updatedAt as ms — the canonical "last meaningful activity". */
export function updatedMs(p: Project): number {
  return new Date(p.updatedAt).getTime();
}

/** Newest first — the default fleet ordering. */
export function byUpdatedDesc(a: Project, b: Project): number {
  return updatedMs(b) - updatedMs(a);
}

/** The pulse/vitals activity instant (see module doc), clamped to now. */
export function activityInstantMs(p: Project, now: number = Date.now()): number {
  const opened = p.lastOpenedAt ? new Date(p.lastOpenedAt).getTime() : 0;
  return Math.min(Math.max(updatedMs(p), opened, 0), now);
}

/** Bento's last-touch instant (see module doc), clamped to now. */
export function lastTouchMs(p: Project, now: number = Date.now()): number {
  const candidates = [updatedMs(p)];
  if (p.git.lastCommit?.date) candidates.push(new Date(p.git.lastCommit.date).getTime());
  if (p.lastOpenedAt) candidates.push(new Date(p.lastOpenedAt).getTime());
  return Math.min(Math.max(...candidates), now);
}

/** True when the project was meaningfully touched in the last 48h. */
export function isHot(p: Project, now: number = Date.now()): boolean {
  return now - updatedMs(p) < 48 * DAY_MS;
}

/** Projects per recency tier — the rhythm strip's census. */
export interface FreshnessCounts {
  fresh: number;
  recent: number;
  stale: number;
  cold: number;
}

export function freshnessCounts(
  projects: Project[],
  now: number = Date.now(),
): FreshnessCounts {
  const counts: FreshnessCounts = { fresh: 0, recent: 0, stale: 0, cold: 0 };
  for (const p of projects) {
    counts[tierFromFreshness(freshness(p.updatedAt, p.lastOpenedAt, now))]++;
  }
  return counts;
}

/** How many projects were touched (updatedAt) within the last `days` days. */
export function touchedWithinDays(
  projects: Project[],
  days: number,
  now: number = Date.now(),
): number {
  const cutoff = now - days * DAY_MS;
  return projects.filter((p) => updatedMs(p) >= cutoff).length;
}

/** Local `Y-M-D` day key for a timestamp (ms) — heatmap bucket identity. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Daily touch counts per dayKey, one bucket per project activity instant. */
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

/** 0..4 fill level from a daily count, log-ish so single hits register. */
export function heatLevel(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

export interface HeatCell {
  date: Date;
  count: number;
  /** Cell sits after today (bottom-right corner of a partial final week). */
  future: boolean;
  label: string;
}

/** Local Monday of the week containing `date`, at local midnight. */
function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const shift = (d.getDay() + 6) % 7;
  return new Date(d.getTime() - shift * DAY_MS);
}

/**
 * Heatmap grid from the Map activityCounts produces: columns are weeks
 * (oldest first), rows Monday..Sunday. Promoted verbatim from mission-control.
 */
export function activityGridFromCounts(
  counts: Map<string, number>,
  weeks: number = 12,
  now: number = Date.now(),
): HeatCell[][] {
  const firstMonday = startOfWeek(new Date(now)).getTime() - (weeks - 1) * 7 * DAY_MS;
  const grid: HeatCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const column: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(firstMonday + (w * 7 + d) * DAY_MS);
      const count = counts.get(dayKey(date.getTime())) ?? 0;
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

export interface WeeklyActivityPoint {
  /** Monday of the bucket week, as a short label like "Jul 14". */
  label: string;
  /** Projects whose last touch falls inside this week. */
  count: number;
}

const WEEK_MS = 7 * DAY_MS;

const WEEK_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** Monday-based local week start, normalized to local midnight. */
function weekStartMs(ms: number): number {
  const d = new Date(ms);
  const day = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  return d.getTime() - day * DAY_MS;
}

/**
 * Projects touched per week over the trailing `weeks` weeks, oldest first.
 * A real histogram of last-touch events (lastTouchMs), not a projection.
 */
export function weeklyActivity(
  projects: Project[],
  weeks: number = 16,
  now: number = Date.now(),
): WeeklyActivityPoint[] {
  const currentWeek = weekStartMs(now);
  const counts = new Array<number>(weeks).fill(0);
  for (const p of projects) {
    const weekIndex =
      weeks - 1 - Math.floor((currentWeek - weekStartMs(lastTouchMs(p, now))) / WEEK_MS);
    if (weekIndex >= 0 && weekIndex < weeks) counts[weekIndex]++;
  }
  return counts.map((count, i) => ({
    label: WEEK_FORMATTER.format(new Date(currentWeek - (weeks - 1 - i) * WEEK_MS)),
    count,
  }));
}

/**
 * Projects-touched-per-day (updatedAt) over the trailing `days` window,
 * oldest first. Local calendar days, DST-safe via date fields, not ms math.
 */
export function dailyActivity(projects: Project[], days: number, now: number = Date.now()): number[] {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(midnight);
    d.setDate(d.getDate() - i);
    keys.push(dayKey(d.getTime()));
  }
  const bucketOf = new Map(keys.map((k, i) => [k, i]));
  const counts = new Array<number>(days).fill(0);
  for (const p of projects) {
    const i = bucketOf.get(dayKey(updatedMs(p)));
    if (i !== undefined) counts[i]++;
  }
  return counts;
}
