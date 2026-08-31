import type { ReactNode } from "react";

import { Badge } from "@workspace-welcome/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace-welcome/ui/components/tooltip";
import { cn } from "@workspace-welcome/ui/lib/utils";

/**
 * One commit, shaped exactly like the parsed `git log --date-order` record
 * from `@workspace-welcome/api` (`commitLog`). Input order is date-order:
 * a commit is never listed before its children, newest first.
 */
export type CommitGraphEntry = {
  hash: string;
  parents: string[];
  subject: string;
  author: string;
  timestamp: number;
  refs: string[];
  isHead: boolean;
};

type CommitGraphProps = {
  /** Commits in date-order (newest first), as produced by `commitLog`. */
  entries: CommitGraphEntry[];
  /**
   * Replaces the default tooltip body (the full subject) so the app can
   * supply author and formatted time without date handling living here.
   */
  renderHoverDetail?: (entry: CommitGraphEntry) => ReactNode;
  className?: string;
};

/** Height of one row's SVG band; the subject row keeps the same height. */
const ROW_HEIGHT = 30;
/** Horizontal distance between two lanes inside the gutter. */
const LANE_WIDTH = 12;
/** Inset of the lane area inside the gutter. */
const GUTTER_PAD = 8;
/** Gutter width for a single lane, so sparse histories stay centered. */
const MIN_GUTTER_WIDTH = 28;
const NODE_RADIUS = 3.5;
const HEAD_RING_RADIUS = 6;

/**
 * Lane colors from the kiln chart tokens (light + dark tuned in globals.css):
 * burnt orange, sage, ochre gold, slate blue, crimson. Lane i takes
 * palette[i % length], so the trunk (lane 0) is always the accent hue.
 */
const LANE_STROKES: readonly [string, ...string[]] = [
  "stroke-chart-1",
  "stroke-chart-2",
  "stroke-chart-3",
  "stroke-chart-4",
  "stroke-chart-5",
];
const LANE_FILLS: readonly [string, ...string[]] = [
  "fill-chart-1",
  "fill-chart-2",
  "fill-chart-3",
  "fill-chart-4",
  "fill-chart-5",
];

function laneStroke(lane: number): string {
  return LANE_STROKES[lane % LANE_STROKES.length] ?? LANE_STROKES[0];
}

function laneFill(lane: number): string {
  return LANE_FILLS[lane % LANE_FILLS.length] ?? LANE_FILLS[0];
}

function laneX(lane: number): number {
  return GUTTER_PAD + lane * LANE_WIDTH + LANE_WIDTH / 2;
}

type LaneSegment = { lane: number; d: string };

type RowGeometry = {
  entry: CommitGraphEntry;
  /** Path segments crossing this row's SVG band, in draw order. */
  segments: LaneSegment[];
  /** Lane the node dot sits on. */
  nodeLane: number;
};

/**
 * Deterministic lane assignment over the date-ordered log, following the
 * algorithm DoltHub documents in "Drawing a commit graph" (after pvigier's
 * 2019 write-up):
 *
 * - Every open lane flows toward one pending parent hash. A commit consumes
 *   every lane already flowing into it; the leftmost becomes its node lane,
 *   so first-parent branches keep the trunk straight and merge edges
 *   terminate at the merge node.
 * - A commit no lane expects (a branch tip, or history truncated by
 *   `--max-count`) opens the leftmost free lane.
 * - The first parent keeps the node's lane; every additional parent opens —
 *   or joins — the leftmost free lane, drawn as a bezier elbow out of the
 *   node (an octopus merge gets one elbow per parent).
 * - Freed lanes are reused, so dangling branches (a branch that ends without
 *   merging) do not leak columns; lanes whose parent never appears in the
 *   window run to the bottom edge of the last row, and root commits end
 *   their lane at the node.
 */
function layoutCommitGraph(entries: CommitGraphEntry[]): {
  rows: RowGeometry[];
  laneCount: number;
} {
  const rows: RowGeometry[] = [];
  /** Per lane: the commit hash the lane flows toward, or null when free. */
  const targets: (string | null)[] = [];

  const firstFreeLane = () => {
    let lane = 0;
    while (lane < targets.length && targets[lane] !== null) lane += 1;
    return lane;
  };

  for (const entry of entries) {
    const nodeY = ROW_HEIGHT / 2;
    const quarter = ROW_HEIGHT / 4;
    const segments: LaneSegment[] = [];

    // Lanes already flowing into this commit, leftmost first.
    const incoming: number[] = [];
    for (let lane = 0; lane < targets.length; lane += 1) {
      if (targets[lane] === entry.hash) incoming.push(lane);
    }

    const nodeLane =
      incoming.length > 0 ? Math.min(...incoming) : firstFreeLane();
    if (incoming.length === 0) targets[nodeLane] = null;

    // Lanes passing this row without touching the node.
    for (let lane = 0; lane < targets.length; lane += 1) {
      const target = targets[lane];
      if (target !== null && target !== entry.hash) {
        segments.push({ lane, d: `M ${laneX(lane)} 0 V ${ROW_HEIGHT}` });
      }
    }

    // Incoming edges: the node's own lane arrives straight; every other one
    // elbows into the node and is freed for reuse below it.
    for (const lane of incoming) {
      targets[lane] = null;
      if (lane === nodeLane) {
        segments.push({ lane, d: `M ${laneX(lane)} 0 V ${nodeY}` });
      } else {
        segments.push({
          lane,
          d: `M ${laneX(lane)} 0 V ${nodeY - quarter} C ${laneX(lane)} ${nodeY} ${laneX(nodeLane)} ${nodeY} ${laneX(nodeLane)} ${nodeY}`,
        });
      }
    }

    const [firstParent, ...mergeParents] = entry.parents;
    if (firstParent !== undefined) {
      // The first parent continues straight down the node's lane.
      targets[nodeLane] = firstParent;
      segments.push({
        lane: nodeLane,
        d: `M ${laneX(nodeLane)} ${nodeY} V ${ROW_HEIGHT}`,
      });
      for (const parent of mergeParents) {
        // Join a lane already flowing to this parent, else open a free one.
        let lane = targets.indexOf(parent);
        if (lane === -1) {
          lane = firstFreeLane();
          targets[lane] = parent;
        }
        segments.push({
          lane,
          d: `M ${laneX(nodeLane)} ${nodeY} C ${laneX(nodeLane)} ${nodeY + quarter} ${laneX(lane)} ${nodeY + quarter} ${laneX(lane)} ${ROW_HEIGHT}`,
        });
      }
    }

    rows.push({ entry, segments, nodeLane });
  }

  return { rows, laneCount: Math.max(targets.length, 1) };
}

/**
 * Presentational git commit graph: lane lines and node dots in a left SVG
 * gutter, subject + ref badges on the right, hover tooltip per row.
 */
function CommitGraph({ entries, renderHoverDetail, className }: CommitGraphProps) {
  if (entries.length === 0) return null;

  const { rows, laneCount } = layoutCommitGraph(entries);
  const gutterWidth = Math.max(
    MIN_GUTTER_WIDTH,
    GUTTER_PAD * 2 + laneCount * LANE_WIDTH,
  );

  return (
    <TooltipProvider delay={200}>
      <div data-slot="commit-graph" className={cn("w-full", className)}>
        <ul data-slot="commit-graph-rows" className="m-0 list-none p-0">
          {rows.map((row, index) => (
            <Tooltip key={`${index}:${row.entry.hash}`}>
              <TooltipTrigger
                render={
                  <li
                    data-slot="commit-graph-row"
                    className="flex min-w-0 cursor-default items-center gap-3 overflow-hidden px-2 transition-colors hover:bg-accent/60 focus-visible:bg-accent/60"
                  />
                }
              >
                <svg
                  data-slot="commit-graph-lanes"
                  aria-hidden="true"
                  width={gutterWidth}
                  height={ROW_HEIGHT}
                  viewBox={`0 0 ${gutterWidth} ${ROW_HEIGHT}`}
                  className="block shrink-0"
                >
                  {row.segments.map((segment, segmentIndex) => (
                    <path
                      key={`${segment.lane}:${segmentIndex}`}
                      d={segment.d}
                      fill="none"
                      strokeWidth={1.5}
                      className={laneStroke(segment.lane)}
                    />
                  ))}
                  {row.entry.isHead ? (
                    <circle
                      data-slot="commit-graph-head-ring"
                      cx={laneX(row.nodeLane)}
                      cy={ROW_HEIGHT / 2}
                      r={HEAD_RING_RADIUS}
                      fill="none"
                      strokeWidth={1.5}
                      className="stroke-ring"
                    />
                  ) : null}
                  <circle
                    data-slot="commit-graph-node"
                    cx={laneX(row.nodeLane)}
                    cy={ROW_HEIGHT / 2}
                    r={NODE_RADIUS}
                    strokeWidth={1}
                    className={cn(laneFill(row.nodeLane), "stroke-background")}
                  />
                </svg>
                <span
                  data-slot="commit-graph-subject"
                  className="min-w-0 truncate text-sm"
                >
                  {row.entry.subject}
                </span>
                {row.entry.refs.length > 0 ? (
                  <span
                    data-slot="commit-graph-refs"
                    className="flex shrink-0 items-center gap-1"
                  >
                    {row.entry.refs.map((ref) => (
                      <Badge
                        key={ref}
                        variant="outline"
                        className="h-4 px-1.5 font-mono text-[0.65rem]"
                      >
                        {ref}
                      </Badge>
                    ))}
                  </span>
                ) : null}
              </TooltipTrigger>
              <TooltipContent align="start" className="max-w-md">
                {renderHoverDetail ? renderHoverDetail(row.entry) : row.entry.subject}
              </TooltipContent>
            </Tooltip>
          ))}
        </ul>
      </div>
    </TooltipProvider>
  );
}

export { CommitGraph };
