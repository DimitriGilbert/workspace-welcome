/**
 * Pure data shaping for the Meadow dashboard. Everything here takes real
 * scanned projects and returns plain numbers/slices — no rendering, no
 * mocking — so the pulse strip, attention band, and the recency tile ladder
 * stay testable and the route stays declarative.
 */

import type { Project } from "@workspace-welcome/api/lib/types";

import { freshness, tierFromFreshness } from "@/lib/recency";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface FreshnessCounts {
  fresh: number;
  recent: number;
  stale: number;
  cold: number;
}

/** Projects per recency tier, for the pulse strip's rhythm widget. */
export function freshnessCounts(projects: Project[]): FreshnessCounts {
  const counts: FreshnessCounts = { fresh: 0, recent: 0, stale: 0, cold: 0 };
  for (const p of projects) {
    const tier = tierFromFreshness(freshness(p.updatedAt, p.lastOpenedAt));
    counts[tier]++;
  }
  return counts;
}

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

/**
 * Projects carrying at least one error/warn alert — the attention surface.
 * Errors float to the top, then most-recently-touched first.
 */
export function flaggedProjects(projects: Project[]): Project[] {
  const errorRank = (p: Project) =>
    p.alerts.some((a) => a.severity === "critical") ? 0 : 1;
  return projects
    .filter((p) =>
      p.alerts.some((a) => a.severity === "critical" || a.severity === "warning"),
    )
    .sort(
      (a, b) =>
        errorRank(a) - errorRank(b) ||
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
}

/** How many projects were touched within the last `days` days. */
export function touchedWithinDays(
  projects: Project[],
  days: number,
  now: number = Date.now(),
): number {
  const cutoff = now - days * DAY_MS;
  return projects.filter((p) => new Date(p.updatedAt).getTime() >= cutoff)
    .length;
}

/**
 * Projects-touched-per-day over the trailing `days` window, oldest first.
 * Buckets are local calendar days (DST-safe via date fields, not ms math).
 */
export function dailyActivity(
  projects: Project[],
  days: number,
  now: number = Date.now(),
): number[] {
  const dayKey = (ms: number) => {
    const d = new Date(ms);
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  };
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const keys: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(midnight);
    d.setDate(d.getDate() - i);
    keys.push(dayKey(d.getTime()));
  }
  const bucketOf = new Map(keys.map((k, i) => [k, i]));
  const counts = new Array<number>(days).fill(0);
  for (const p of projects) {
    const i = bucketOf.get(dayKey(new Date(p.updatedAt).getTime()));
    if (i !== undefined) counts[i]++;
  }
  return counts;
}

export interface StackSlice {
  /** Representative stack id (for icons); "unknown" when undetected. */
  id: string;
  label: string;
  count: number;
}

/** Detected-stack histogram, most common first. */
export function stackBreakdown(projects: Project[]): StackSlice[] {
  const byLabel = new Map<string, StackSlice>();
  for (const p of projects) {
    const label = p.stack?.label ?? "Other";
    const entry = byLabel.get(label);
    if (entry) entry.count++;
    else byLabel.set(label, { id: p.stack?.id ?? "unknown", label, count: 1 });
  }
  return [...byLabel.values()].sort((a, b) => b.count - a.count);
}

/**
 * Compact age numeral for the big friendly figures: "now", "4h", "3d",
 * "2w", "5mo", "1y". The exact timestamp rides along in tooltips.
 */
export function compactAge(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms <= 60_000) return "now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d`;
  if (days < 70) return `${Math.floor(days / 7)}w`;
  if (days < 730) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

/**
 * Time-of-day greeting for the one-row header, by local hour:
 * morning before noon, afternoon until 6, evening after.
 */
export function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** Last path segment of an absolute path — for root labels. */
export function pathBasename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

// --- The recency tile ladder --------------------------------------------------

/** Bento-style tile sizes, biggest to smallest. */
export type TileSize = "hero" | "big" | "wide" | "dot";

/** Recency group rank: pinned first, then fresh → recent → stale → cold. */
function recencyRank(p: Project): number {
  if (p.pinned) return 0;
  const tier = tierFromFreshness(freshness(p.updatedAt, p.lastOpenedAt));
  switch (tier) {
    case "fresh":
      return 1;
    case "recent":
      return 2;
    case "stale":
      return 3;
    default:
      return 4;
  }
}

/**
 * The bento discipline, in a soft register: tiles sized by recency so
 * returning after a long time shows where the work happened. Exactly one
 * hero (3×2) for the freshest/pinned project, at most four 2×2 for the
 * pinned-and-fresh front, 2×1 for everything still recent, and compact
 * 1×1 dots for the stale/cold tail — a pyramid that reads newest-and-
 * biggest first. (The front slots are capped so a workspace full of
 * recently-touched projects still falls off in size.)
 */
export interface TiledProject {
  project: Project;
  size: TileSize;
}

/** Tile slots (beyond the hero) reserved for the pinned-and-fresh front. */
const BIG_SLOTS = 4;

export function tilePlan(projects: Project[]): TiledProject[] {
  const ordered = [...projects].sort(
    (a, b) =>
      recencyRank(a) - recencyRank(b) ||
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  return ordered.map((project, i) => {
    const rank = recencyRank(project);
    return {
      project,
      size:
        i === 0
          ? "hero"
          : i <= BIG_SLOTS && rank <= 1
            ? "big" // pinned (beyond the hero) or fresh, front of the grid
            : rank <= 2
              ? "wide"
              : "dot",
    };
  });
}
