/**
 * Fleet-level derivations: masthead vitals, the pinned/flagged/current/archive
 * partition, and mb's channel switch. Pure TS — no React, no color tokens;
 * `now` is always a defaulted parameter (SSR-safe).
 */

import type { Project } from "@workspace-welcome/api/lib/types";

import { freshness, tierFromFreshness } from "@/lib/recency";

import { activityInstantMs } from "./activity";
import { attentionProjects } from "./severity";

// --- vitals -----------------------------------------------------------------

export interface FleetVitals {
  total: number;
  /** Projects whose activity instant is within the last 7 days. */
  activeWeek: number;
  /** Projects carrying at least one critical/warning alert. */
  attention: number;
  pinned: number;
  dirtySum: number;
  aheadSum: number;
  behindSum: number;
}

/** The masthead numerals (MC field names; a superset of mb's vitals). */
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

// --- partition --------------------------------------------------------------

export interface FleetPartition {
  pinned: Project[];
  /** Carries critical or warning alerts, regardless of pin/recency. */
  flagged: Project[];
  /** Not pinned, tier fresh or recent. */
  current: Project[];
  /** Not pinned, tier stale or cold — deep storage. */
  archive: Project[];
}

/**
 * The overview rhythm (mirrors the main dashboard's pinned / recent / older
 * split; attention overlaps all three).
 */
export function partitionFleet(projects: Project[], now: number = Date.now()): FleetPartition {
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
    const tier = tierFromFreshness(freshness(p.updatedAt, p.lastOpenedAt, now));
    if (tier === "fresh" || tier === "recent") partition.current.push(p);
    else partition.archive.push(p);
  }
  return partition;
}

// --- channels (mb) ----------------------------------------------------------

export type ChannelId = "mosaic" | "triage" | "pins" | "cold";

export const CHANNEL_ORDER: readonly ChannelId[] = ["mosaic", "triage", "pins", "cold"];

/** Counts for the channel switch, computed over the (filtered) set. */
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
  if (channel === "triage") return attentionProjects(projects);
  return projects.filter((p) => {
    const tier = tierFromFreshness(freshness(p.updatedAt, p.lastOpenedAt, now));
    return tier === "stale" || tier === "cold";
  });
}
