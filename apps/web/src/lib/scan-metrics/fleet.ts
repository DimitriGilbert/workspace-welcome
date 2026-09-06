/**
 * Fleet-level derivations: the masthead vitals. Pure TS — no React, no color
 * tokens; `now` is always a defaulted parameter (SSR-safe).
 */

import type { Project } from "@workspace-welcome/api/lib/types";

import { activityInstantMs } from "./activity";

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
