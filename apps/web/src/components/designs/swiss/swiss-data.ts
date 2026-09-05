/**
 * Pure data shaping for the Swiss dashboard concept. Everything here takes
 * real scanned projects and returns plain numbers/lists — no React, no fetch —
 * so the panels and tables stay dumb renderers.
 */

import type { AlertSeverity, Project } from "@workspace-welcome/api/lib/types";

import { freshness, tierFromFreshness } from "@/lib/recency";
import { matchProject } from "@/lib/search";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
/** Parity with the card treatment: "updated" lights up under 48h. */
const FRESH_MS = 48 * 60 * 60 * 1000;

/** Which slice of the index the table sections show. */
export type DashboardView = "all" | "pinned" | "attention" | "archive";

export interface SwissStats {
  total: number;
  active7d: number;
  attention: number;
  pinned: number;
  dirtyFiles: number;
  commitsAhead: number;
}

export function computeSwissStats(projects: Project[]): SwissStats {
  const now = Date.now();
  let active7d = 0;
  let attention = 0;
  let pinned = 0;
  let dirtyFiles = 0;
  let commitsAhead = 0;
  for (const p of projects) {
    if (now - new Date(p.updatedAt).getTime() < WEEK_MS) active7d += 1;
    if (hasAttention(p)) attention += 1;
    if (p.pinned) pinned += 1;
    if ((p.git.dirtyCount ?? 0) > 0) dirtyFiles += p.git.dirtyCount ?? 0;
    if ((p.git.ahead ?? 0) > 0) commitsAhead += p.git.ahead ?? 0;
  }
  return {
    total: projects.length,
    active7d,
    attention,
    pinned,
    dirtyFiles,
    commitsAhead,
  };
}

/** Warn-or-worse — the threshold the needs-attention surface keys off. */
export function hasAttention(p: Project): boolean {
  return p.alerts.some((a) => a.severity === "critical" || a.severity === "warning");
}

/** Projects carrying at least one alert of the given severity. */
export function bySeverity(projects: Project[], severity: AlertSeverity): Project[] {
  return projects.filter((p) => p.alerts.some((a) => a.severity === severity));
}

/** Last meaningful touch: mtime, or a more recent manual open from the UI. */
function lastTouchedMs(p: Project): number {
  const opened = p.lastOpenedAt === null ? 0 : new Date(p.lastOpenedAt).getTime();
  return Math.max(new Date(p.updatedAt).getTime(), opened);
}

export function isFresh(p: Project): boolean {
  return Date.now() - new Date(p.updatedAt).getTime() < FRESH_MS;
}

export interface RecencyBucket {
  label: string;
  count: number;
}

const BUCKET_EDGES: ReadonlyArray<{ label: string; days: number }> = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "2w", days: 14 },
  { label: "1m", days: 30 },
  { label: "3m", days: 90 },
  { label: "cold", days: Number.POSITIVE_INFINITY },
];

/** Activity histogram: projects per "last touched" window, oldest spilling
 * into the cold bucket at the horizon's far end. */
export function recencyBuckets(projects: Project[], now: number): RecencyBucket[] {
  const buckets = BUCKET_EDGES.map((edge) => ({ label: edge.label, count: 0 }));
  for (const p of projects) {
    const ageDays = Math.max(0, now - lastTouchedMs(p)) / DAY_MS;
    const idx = BUCKET_EDGES.findIndex((edge) => ageDays < edge.days);
    const bucket = buckets[idx === -1 ? buckets.length - 1 : idx];
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

export interface StackCount {
  label: string;
  count: number;
}

/** Toolchain census, largest first, top six plus an "Other" remainder. */
export function stackBreakdown(projects: Project[]): StackCount[] {
  const counts = new Map<string, number>();
  for (const p of projects) {
    const label = p.stack?.label ?? "Undetected";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const top = sorted
    .slice(0, 6)
    .map(([label, count]) => ({ label, count }));
  let rest = 0;
  for (const [, count] of sorted.slice(6)) rest += count;
  if (rest > 0) top.push({ label: "Other", count: rest });
  return top;
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** Alerts ordered critical → warning → info so the table's health marks read with
 * a consistent rhythm regardless of scanner order. */
export function sortedAlerts(alerts: Project["alerts"]): Project["alerts"] {
  return [...alerts].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
}

function worstSeverityRank(alerts: Project["alerts"]): number {
  let rank = 3;
  for (const a of alerts) {
    const candidate = SEVERITY_RANK[a.severity];
    if (candidate < rank) rank = candidate;
  }
  return rank;
}

function byUpdatedDesc(a: Project, b: Project): number {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function bySeverityThenUpdated(a: Project, b: Project): number {
  return (
    worstSeverityRank(a.alerts) - worstSeverityRank(b.alerts) || byUpdatedDesc(a, b)
  );
}

/** Stale-or-colder per the shared recency model — the archive shelf. */
export function isOlder(p: Project): boolean {
  const tier = tierFromFreshness(freshness(p.updatedAt, p.lastOpenedAt));
  return tier === "stale" || tier === "cold";
}

export interface SwissSection {
  id: string;
  title: string;
  /** How the zone is ordered, printed as a small note in the section bar. */
  note: string;
  projects: Project[];
}

/**
 * Partition a filtered set into the sheet's table zones. "all" keeps the
 * pinned / active / archive rhythm; the focused views collapse to a single
 * zone so the table never contradicts the active segment.
 */
export function buildSections(visible: Project[], view: DashboardView): SwissSection[] {
  const sorted = (list: Project[]) => [...list].sort(byUpdatedDesc);
  if (view === "pinned") {
    return [
      { id: "pinned", title: "Pinned", note: "By last update", projects: sorted(visible) },
    ];
  }
  if (view === "attention") {
    return [
      {
        id: "attention",
        title: "Needs attention",
        note: "Worst severity first",
        projects: [...visible].sort(bySeverityThenUpdated),
      },
    ];
  }
  if (view === "archive") {
    return [
      { id: "archive", title: "Archive", note: "By last update", projects: sorted(visible) },
    ];
  }
  const pinned: Project[] = [];
  const active: Project[] = [];
  const archive: Project[] = [];
  for (const p of visible) {
    if (p.pinned) {
      pinned.push(p);
    } else if (isOlder(p)) {
      archive.push(p);
    } else {
      active.push(p);
    }
  }
  const sections: SwissSection[] = [];
  if (pinned.length > 0) {
    sections.push({
      id: "pinned",
      title: "Pinned",
      note: "By last update",
      projects: sorted(pinned),
    });
  }
  if (active.length > 0) {
    sections.push({
      id: "active",
      title: "Active",
      note: "By last update",
      projects: sorted(active),
    });
  }
  if (archive.length > 0) {
    sections.push({
      id: "archive",
      title: "Archive",
      note: "By last update",
      projects: sorted(archive),
    });
  }
  return sections;
}

/**
 * Narrow a search-filtered set to the active view. All-view passes through;
 * the other views are strict subsets so segment counts stay additive.
 */
export function applyView(base: Project[], view: DashboardView): Project[] {
  switch (view) {
    case "pinned":
      return base.filter((p) => p.pinned);
    case "attention":
      return base.filter(hasAttention);
    case "archive":
      return base.filter((p) => !p.pinned && isOlder(p));
    default:
      return base;
  }
}

export interface ViewCounts {
  all: number;
  pinned: number;
  attention: number;
  archive: number;
}

/** Segment counts, computed from the search-filtered set so numbers agree
 * with what the table shows for the same query. */
export function viewCounts(base: Project[]): ViewCounts {
  let pinned = 0;
  let attention = 0;
  let archive = 0;
  for (const p of base) {
    if (p.pinned) pinned += 1;
    if (hasAttention(p)) attention += 1;
    if (!p.pinned && isOlder(p)) archive += 1;
  }
  return { all: base.length, pinned, attention, archive };
}

/** Search pass — kept here so the route stays declarative. */
export function searchFilter(projects: Project[], query: string): Project[] {
  return projects.filter((p) => matchProject(p, query));
}
