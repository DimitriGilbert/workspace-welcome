/**
 * Flow registry seam (master plan §5, W2).
 *
 * A flow region (`RegionNode { kind: "flow", from }`) is resolved through this
 * registry: the generator registered under the region's `from` key stamps one
 * `WidgetNode` per input item, in reading order — the order the grid packer
 * (`@/lib/grid-layout/pack-grid`) will serve them in.
 *
 * The generator input is STRUCTURAL — `{ projects: Project[]; now: number }`.
 * The provider stack's `WorkspaceContextValue` satisfies it as-is, so flows
 * run INSIDE the provider stack at render time without knowing about it.
 * `now` is always injected by the caller: generators never read `Date.now`
 * (SSR-safe, deterministic). Flows never call tRPC — data arrives through the
 * provider stack, never fetched here.
 */

import type { Project } from "@workspace-welcome/api/lib/types";

import { scoreProjects } from "@/lib/grid-layout/score-projects";
import type { WidgetNode } from "./layout-types";
import type { SizeClass } from "./size-class";
import { SIZE_LADDER } from "./size-class";

/** What every flow generator receives. `WorkspaceContextValue` satisfies this. */
export interface FlowInput {
  projects: Project[];
  now: number;
}

/** A flow generator: input items in, placed-ready widget nodes out. */
export type FlowGenerator = (input: FlowInput) => WidgetNode[];

/**
 * Tier ladder mapped from `SIZE_LADDER` (ascending) to score tiers (top
 * first): tier index 0 — the freshest quantile, "hero" — takes the largest
 * rung. Same shape as the legacy mosaic ladder.
 */
const TIER_LADDER: readonly SizeClass[] = [...SIZE_LADDER].reverse();

/** Kebab-case slug of a project path — stable flow-node identity. */
function slugifyPath(path: string): string {
  return path
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The `"projects"` flow: one project tile per scanned project. Each project
 * is scored by the canonical log-scale recency + tier blend
 * (`scoreProjects`); its tier buys the tile size off the ladder and its
 * score is passed to the tile as the `weight` prop (rings/gauges render from
 * it). Nodes come out in reading order — pinned first, then freshest first,
 * ties by path — matching the packer's expectations.
 */
const projectsFlow: FlowGenerator = ({ projects, now }) => {
  if (projects.length === 0) return [];
  const scored = scoreProjects(projects, { now, tierCount: TIER_LADDER.length });
  return [...projects]
    .map((project, i) => ({
      project,
      score: scored[i]?.score ?? 0,
      tierIndex: scored[i]?.tierIndex ?? 0,
      // Unparseable dates sort to the back of their group.
      sortMs: Number.isFinite(Date.parse(project.updatedAt))
        ? Date.parse(project.updatedAt)
        : Number.NEGATIVE_INFINITY,
    }))
    .sort((a, b) => {
      if (a.project.pinned !== b.project.pinned) return a.project.pinned ? -1 : 1;
      if (a.sortMs !== b.sortMs) return b.sortMs - a.sortMs;
      return a.project.path < b.project.path
        ? -1
        : a.project.path > b.project.path
          ? 1
          : 0;
    })
    .map(({ project, score, tierIndex }) => ({
      id: `project-${slugifyPath(project.path)}`,
      // Registered in the widget registry by the project-tile widget (W4).
      widget: "project-tile",
      size: TIER_LADDER[tierIndex] ?? "1x1",
      props: { path: project.path, score },
    }));
};

/**
 * The built-in flows, keyed by the `from` value a flow region references.
 * Register new flows with {@link registerFlow} — never mutate this directly.
 */
const flows: Record<string, FlowGenerator> = {
  projects: projectsFlow,
};

/** Look up the flow registered under a region's `from` key (null if unknown). */
export function getFlow(from: string): FlowGenerator | null {
  return flows[from] ?? null;
}

/** Every registered `from` key. */
export function flowKeys(): string[] {
  return Object.keys(flows);
}

/**
 * Register a flow generator under a `from` key. Duplicate keys throw — a
 * silent overwrite would swap content under an already-authored preset.
 */
export function registerFlow(from: string, generator: FlowGenerator): void {
  if (from in flows) {
    throw new Error(`Flow "${from}" is already registered`);
  }
  flows[from] = generator;
}
