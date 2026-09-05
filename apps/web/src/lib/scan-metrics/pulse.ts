/**
 * Pulse strip — a per-project sparkline replaying the shared freshness decay
 * (@/lib/recency) backwards from now. One copy for every design surface.
 *
 * Pure TS: no React, no color tokens; `now` is a defaulted parameter.
 */

import type { Project } from "@workspace-welcome/api/lib/types";

import { freshness } from "@/lib/recency";

import { activityInstantMs } from "./activity";

/** Must mirror the 90-day horizon in @/lib/recency — the strips are drawn
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
 * bucket ending at now. A bucket lights up when it falls between the
 * project's last activity and the present; its brightness is freshness()
 * sampled at that moment. A project touched today burns bright across the
 * whole strip; one touched a month ago shows a fading tail into the present.
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
    out.push({
      intensity: freshness(p.updatedAt, p.lastOpenedAt, now - (age - ago)),
      tick: i === tickIndex,
    });
  }
  return out;
}
