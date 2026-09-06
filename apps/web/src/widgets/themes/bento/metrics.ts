/**
 * Bento's mosaic derivations — ported from
 * `components/designs/bento/bento-metrics.ts` (the parts the shared
 * `@/lib/scan-metrics` + `@/lib/format` modules do not already own): the
 * recency-sized mosaic index (placements by path + the attention ordering)
 * and the deterministic per-tile stagger seed.
 *
 * Pure data in, pure data out — widgets feed it `useWorkspace()`'s projects
 * and the shared `now` clock.
 */
import type { Project } from "@workspace-welcome/api/lib/types";

import { computeMosaicLayout } from "@/lib/mosaic-layout";

export type MosaicLayout = ReturnType<typeof computeMosaicLayout>;
export type MosaicPlacement = MosaicLayout["placements"][number];

export interface WorkspaceMosaic {
  layout: MosaicLayout;
  /** Placements by project path — tiles look up their own box here. */
  byPath: Map<string, MosaicPlacement>;
  /** Projects carrying at least one error or warn alert, worst first. */
  attention: Project[];
}

/**
 * The dashboard mosaic: the shared algorithm's placements re-indexed by path
 * plus the attention list (critical carriers first, then warnings, recency
 * within each band) — the exact derivations the design's tiles consume.
 */
export function buildMosaic(
  projects: Project[],
  now: number = Date.now(),
): WorkspaceMosaic {
  const layout = computeMosaicLayout(projects, { now });
  const byPath = new Map(layout.placements.map((p) => [p.path, p]));

  const severityWeight = (p: Project) =>
    p.alerts.some((a) => a.severity === "critical")
      ? 2
      : p.alerts.some((a) => a.severity === "warning")
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

/** FNV-1a — deterministic per-tile seeds (carousel stagger) from a path. */
export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Categorical ramp for the stack donut — the design's --bento-c* tokens. */
export const STACK_RAMP = [
  "var(--bento-c1)",
  "var(--bento-c2)",
  "var(--bento-c3)",
  "var(--bento-c4)",
  "var(--bento-c5)",
  "var(--bento-c6)",
] as const;

/** The design's tile tier names, keyed by the flow's size classes. */
export function tileTier(cols: number, rows: number): string {
  if (cols >= 3 && rows >= 3) return "hero";
  if (cols >= 2 && rows >= 3) return "feature";
  if (cols >= 2 && rows >= 2) return "large";
  if (cols >= 2) return "medium";
  return "compact";
}
