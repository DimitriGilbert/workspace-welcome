/**
 * Stack census and dirty-work leaders. Pure TS over scanned projects —
 * no React, no color tokens (slices map onto theme ramps in the parts).
 */

import type { Project } from "@workspace-welcome/api/lib/types";

import { updatedMs } from "./activity";

export interface StackSlice {
  /** Representative stack id (for icons); "other" when undetected/folded. */
  id: string;
  label: string;
  count: number;
}

/**
 * Stack distribution, largest first, capped at `max` slices with the
 * remainder folded into an "Other" slice so donuts stay readable
 * (bento/mb's Other-folding shape wins over MC's raw breakdown).
 */
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

export interface DirtyLeader {
  name: string;
  path: string;
  dirty: number;
}

/**
 * Projects carrying the most uncommitted work, heaviest first; MC's recency
 * tiebreak is kept in the sort (fresher project wins an equal dirty count).
 */
export function dirtyLeaders(projects: Project[], limit: number = 5): DirtyLeader[] {
  return projects
    .filter((p) => (p.git.dirtyCount ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.git.dirtyCount ?? 0) - (a.git.dirtyCount ?? 0) || updatedMs(b) - updatedMs(a),
    )
    .slice(0, limit)
    .map((p) => ({ name: p.name, path: p.path, dirty: p.git.dirtyCount ?? 0 }));
}
