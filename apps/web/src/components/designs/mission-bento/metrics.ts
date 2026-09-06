/**
 * Mission Bento scan metrics: pure derivations from the real scan payload.
 * Channel partitioning, fleet vitals, LED state and pulse strips all read
 * from these functions — the mosaic geometry itself comes from the shared
 * @/lib/mosaic-layout algorithm.
 */

import type { AlertSeverity, Project } from "@workspace-welcome/api/lib/types";

import { freshness, tierFromFreshness } from "@/lib/recency";

// ---------------------------------------------------------------- views

export type ChannelId = "mosaic" | "triage" | "pins" | "cold";

export const CHANNEL_ORDER: readonly ChannelId[] = [
  "mosaic",
  "triage",
  "pins",
  "cold",
];

// ------------------------------------------------------------- scan helpers

export function updatedMs(p: Project): number {
  return new Date(p.updatedAt).getTime();
}

/** Newest first — the default ordering everywhere. */
export function byUpdatedDesc(a: Project, b: Project): number {
  return updatedMs(b) - updatedMs(a);
}

/** Most recent of (meaningful activity, manual open), clamped to now. */
export function activityInstantMs(p: Project, now: number = Date.now()): number {
  const opened = p.lastOpenedAt ? new Date(p.lastOpenedAt).getTime() : 0;
  return Math.min(Math.max(updatedMs(p), opened, 0), now);
}

/** True when the project was meaningfully touched in the last 48h. */
export function isHot(p: Project, now: number = Date.now()): boolean {
  return now - updatedMs(p) < 48 * 60 * 60 * 1000;
}

/** Worst alert severity carried by a project, or null when clean. */
export function worstSeverity(p: Project): AlertSeverity | null {
  if (p.alerts.some((a) => a.severity === "critical")) return "critical";
  if (p.alerts.some((a) => a.severity === "warning")) return "warning";
  if (p.alerts.some((a) => a.severity === "info")) return "info";
  return null;
}

/** Sort key for triage: errors first, clean projects last. */
export function severityRank(p: Project): number {
  const worst = worstSeverity(p);
  if (worst === "critical") return 0;
  if (worst === "warning") return 1;
  if (worst === "info") return 2;
  return 3;
}

// ---------------------------------------------------------------- vitals

export interface FleetVitals {
  total: number;
  liveWeek: number;
  triage: number;
  dirty: number;
  unshared: number;
  behind: number;
}

export function fleetVitals(projects: Project[], now: number = Date.now()): FleetVitals {
  const vitals: FleetVitals = {
    total: projects.length,
    liveWeek: 0,
    triage: 0,
    dirty: 0,
    unshared: 0,
    behind: 0,
  };
  for (const p of projects) {
    if (now - activityInstantMs(p, now) < 7 * 24 * 60 * 60 * 1000) vitals.liveWeek++;
    if (p.alerts.some((a) => a.severity === "critical" || a.severity === "warning")) {
      vitals.triage++;
    }
    vitals.dirty += p.git.dirtyCount ?? 0;
    vitals.unshared += p.git.ahead ?? 0;
    vitals.behind += p.git.behind ?? 0;
  }
  return vitals;
}

// ----------------------------------------------------------- pulse strip

/** Must mirror the 90-day horizon in @/lib/recency. */
const PULSE_HORIZON_MS = 90 * 24 * 60 * 60 * 1000;

export interface PulseCell {
  /** 0..1 brightness, sampled from the real freshness function. */
  intensity: number;
  /** The cell containing the last activity instant. */
  tick: boolean;
}

/**
 * `cells` buckets across the 90-day freshness window, oldest first, the last
 * bucket ending at now. A bucket lights when it falls between the project's
 * last activity and the present; brightness is freshness() sampled there.
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

// ---------------------------------------------------------- scan censuses

export interface StackSlice {
  id: string;
  label: string;
  count: number;
}

/** Stack census, largest first, capped with the remainder folded into Other. */
export function stackDistribution(projects: Project[], max: number = 5): StackSlice[] {
  const counts = new Map<string, StackSlice>();
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

export interface DirtyRow {
  name: string;
  path: string;
  dirty: number;
}

/** Projects carrying the most uncommitted work, heaviest first. */
export function dirtyLeaders(projects: Project[], limit: number = 5): DirtyRow[] {
  return projects
    .filter((p) => (p.git.dirtyCount ?? 0) > 0)
    .sort((a, b) => (b.git.dirtyCount ?? 0) - (a.git.dirtyCount ?? 0) || byUpdatedDesc(a, b))
    .slice(0, limit)
    .map((p) => ({ name: p.name, path: p.path, dirty: p.git.dirtyCount ?? 0 }));
}

// ---------------------------------------------------------------- channels

/** Counts for the channel switch, computed over the filtered set. */
export function channelCounts(
  projects: Project[],
  now: number = Date.now(),
): Record<ChannelId, number> {
  const counts: Record<ChannelId, number> = {
    mosaic: projects.length,
    triage: 0,
    pins: 0,
    cold: 0,
  };
  for (const p of projects) {
    if (p.alerts.some((a) => a.severity === "critical" || a.severity === "warning")) {
      counts.triage++;
    }
    if (p.pinned) counts.pins++;
    const tier = tierFromFreshness(freshness(p.updatedAt, p.lastOpenedAt, now));
    if (tier === "stale" || tier === "cold") counts.cold++;
  }
  return counts;
}

/** The projects a channel displays. */
export function channelProjects(
  projects: Project[],
  channel: ChannelId,
  now: number = Date.now(),
): Project[] {
  if (channel === "mosaic") return projects;
  if (channel === "pins") return projects.filter((p) => p.pinned);
  if (channel === "triage") {
    return projects
      .filter((p) => severityRank(p) <= 1)
      .sort((a, b) => severityRank(a) - severityRank(b) || byUpdatedDesc(a, b));
  }
  return projects.filter((p) => {
    const tier = tierFromFreshness(freshness(p.updatedAt, p.lastOpenedAt, now));
    return tier === "stale" || tier === "cold";
  });
}
