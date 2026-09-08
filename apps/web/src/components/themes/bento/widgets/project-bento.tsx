/**
 * Bento's bento-of-projects (owner order: the projects mosaic is a WIDGET,
 * never free-floating tiles): the recency mosaic as ONE chrome-framed kind —
 * the meadow `project-bento` treatment in bento's glazed language. The kind
 * resolves the shared `"projects"` flow generator itself (same scoring, same
 * filter contract as a flow region) and renders the canonical
 * `BentoProjectTile`s as INTERNAL content.
 *
 * Placement is ORGANIC by owner design (`bento-OWNER-SIZES-LATEST.jpeg`):
 * the placed tiles sit at their measured percent rectangles — irregular
 * offsets, varied widths/heights, edges deliberately not flush (see
 * `OWNER_TILES`) — over a percent-positioned box; the remaining flow tiles
 * pack in a dense 12-col sub-grid below the placed region. Nothing snaps
 * to clean spans. A tile's tier content follows the rank of its placed
 * rectangle, so a placed 3-row tile reads as a feature card exactly as the
 * owner arranged it. The box aspect is calibrated by the preset's desktop
 * footprint (10x15 — the capture's proportion).
 *
 * At compact footprints (≤4 canvas columns — the phone clamp) the mosaic
 * degrades to a single-column ledger of dense rows (recency ring · name ·
 * branch · age), the only honest presentation at ~170px.
 */
import { useMemo } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

import { ageMs } from "@/lib/format";

import { getFlow } from "@/lib/widget/flows";
import { parseSize } from "@/lib/widget/size-class";
import type { SizeClass } from "@/lib/widget/size-class";
import { useWorkspace } from "@/lib/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/components/widgets/registry";

import { BentoTile, RecencyRing } from "../bits";
import { SizeLegend } from "../bits";
import { BentoProjectTile } from "./project-tile";

/** Fill-box wrapper for the mosaic body. */
function Fill({ children }: { children: ReactNode }) {
  return <div className="h-full min-h-0 w-full min-w-0 overflow-hidden">{children}</div>;
}

/** A flow node's rung as mosaic span (identity — the rung is 12-col-native). */
function spanOf(size: SizeClass): { cols: number; rows: number } {
  return parseSize(size) ?? { cols: 1, rows: 1 };
}

interface MosaicPlacement {
  x: number;
  y: number;
  cols: number;
  rows: number;
}

/**
 * The owner's organic tile rectangles (`bento-OWNER-ARRANGEMENT-LATEST.jpeg`,
 * "LESS HEIGHT !!!!" pass), measured off the capture and expressed as
 * fractions of the mosaic box — irregular offsets, varied widths, edges
 * deliberately not perfectly flush (line-1 widths vary 663/421/454/437/420
 * native; the stack pair sits at x 91.60/92.23 with widths 8.40/7.77).
 * Nothing is snapped to clean spans. Percentages: x/w of the box width;
 * y/h of the box height — the capture's absolute pixels over the realized
 * desktop container (10x12 → 1201px), so the rendered rectangles land on
 * the capture's absolute pixels. Tile tier content follows the placed
 * rectangle's implied rank. Projects not placed here flow in the dense
 * sub-grid below the placed region.
 */
const OWNER_TILES: Record<
  string,
  { x: number; y: number; w: number; h: number; cols: number; rows: number }
> = {
  "workspace-welcome": { x: 0, y: 0, w: 24.28, h: 29.64, cols: 3, rows: 3 },
  "context-builder": { x: 24.87, y: 0, w: 15.42, h: 29.64, cols: 2, rows: 3 },
  solard: { x: 40.87, y: 0, w: 16.63, h: 29.64, cols: 2, rows: 3 },
  "migration-wp-to-nextjs": { x: 58.09, y: 0, w: 16.01, h: 29.64, cols: 2, rows: 3 },
  slopcad: { x: 74.68, y: 0, w: 15.38, h: 29.64, cols: 2, rows: 3 },
  "Formedible-main-baseline": { x: 90.65, y: 0, w: 8.31, h: 11.16, cols: 1, rows: 1 },
  "devbox-install": { x: 91.28, y: 12.57, w: 7.69, h: 17.07, cols: 1, rows: 2 },
  stationio: { x: 0, y: 31.14, w: 15.97, h: 29.64, cols: 2, rows: 3 },
  sshm0: { x: 16.59, y: 31.14, w: 15.97, h: 29.64, cols: 2, rows: 2 },
  "speaches-ui": { x: 33.18, y: 31.14, w: 15.97, h: 29.64, cols: 2, rows: 2 },
  speaches: { x: 49.77, y: 31.14, w: 16.01, h: 29.64, cols: 2, rows: 2 },
  parseArger: { x: 66.37, y: 31.14, w: 16.01, h: 29.64, cols: 2, rows: 2 },
  lmaafy: { x: 82.96, y: 31.14, w: 16.01, h: 29.64, cols: 2, rows: 2 },
};

/** Where the flow sub-grid starts: below the deepest placed rectangle
    (stationio's 3-row body, 60.78%) plus one organic gap. */
const FLOW_TOP = 62.1;

/**
 * First-fit dense packing over the spans — the line-closing behavior of
 * `grid-auto-flow: dense`, computed explicitly so the trailing PARTIAL row
 * can center (a flush list end at any project count, not a void in the
 * corner). Pure function of the span list: deterministic, SSR-safe.
 */
function packMosaic(
  spans: readonly { cols: number; rows: number }[],
  columns = 12,
): MosaicPlacement[] {
  const cells = new Set<string>();
  const free = (x: number, y: number, c: number, r: number) => {
    for (let iy = y; iy < y + r; iy++) {
      for (let ix = x; ix < x + c; ix++) {
        if (ix >= columns || cells.has(`${ix}:${iy}`)) return false;
      }
    }
    return true;
  };
  const mark = (x: number, y: number, c: number, r: number) => {
    for (let iy = y; iy < y + r; iy++) {
      for (let ix = x; ix < x + c; ix++) cells.add(`${ix}:${iy}`);
    }
  };
  const placed: MosaicPlacement[] = spans.map((span) => {
    for (let y = 0; ; y++) {
      for (let x = 0; x + span.cols <= columns; x++) {
        if (free(x, y, span.cols, span.rows)) {
          mark(x, y, span.cols, span.rows);
          return { x, y, ...span };
        }
      }
    }
  });
  // Center a trailing partial row — only when the row is tiled exclusively
  // by tiles that START in it (no multi-row body above owns part of it).
  // The whole group shifts uniformly so the row keeps its internal order
  // and gains no internal gaps.
  const lastRow = placed.reduce((max, p) => Math.max(max, p.y + p.rows), 0) - 1;
  const intrudes = placed.some((p) => p.y < lastRow && p.y + p.rows > lastRow);
  if (!intrudes) {
    const used = placed
      .filter((p) => p.y === lastRow)
      .reduce((sum, p) => sum + p.cols, 0);
    const shift = Math.floor((columns - used) / 2);
    if (shift > 0) {
      for (const p of placed) {
        if (p.y === lastRow) p.x += shift;
      }
    }
  }
  return placed;
}

export function BentoProjectBento({ size }: RegisteredWidgetProps) {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const compact = size.cols <= 4;

  const nodes = useMemo(
    () =>
      getFlow("projects")?.({
        projects: workspace.projects,
        now: workspace.now,
        filter: workspace.filter,
      }) ?? [],
    [workspace.projects, workspace.now, workspace.filter],
  );

  /** Titlebar meta (design law 3): the mosaic's own count — filtered count
   * when the masthead search narrows the set. */
  const total = workspace.projects.length;
  const meta = (
    <span className="shrink-0 font-mono text-[0.68rem] tabular-nums text-muted-foreground">
      {nodes.length === total
        ? `${total} ${total === 1 ? "project" : "projects"}`
        : `${nodes.length} of ${total}`}
    </span>
  );

  const openProject = (path: string) => {
    void navigate({
      to: "/project/$",
      params: { _splat: path.replace(/^\/+/, "") },
      search: { preset: "bento" },
    });
  };

  /** The compact ledger (phone clamp): one dense row per project — ring,
   * name, alerts, age — each row flexing to share the box exactly, so every
   * project stays reachable without an inner scroll. */
  const compactLedger = (
    <div className="flex h-full min-h-0 w-full flex-col gap-1.5 overflow-hidden">
      {nodes.map((node) => {
        const pathProp = node.props?.["path"];
        const path = typeof pathProp === "string" ? pathProp : "";
        const scoreProp = node.props?.["score"];
        const score = typeof scoreProp === "number" ? scoreProp : 0;
        const project =
          path === "" ? undefined : workspace.projects.find((p) => p.path === path);
        if (project === undefined) return null;
        const updatedAtMs = new Date(project.updatedAt).getTime();
        return (
          <button
            key={node.id}
            type="button"
            onClick={() => openProject(project.path)}
            className="flex min-h-0 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border bg-white/[0.02] px-3 text-left"
          >
            <RecencyRing
              updatedAtMs={updatedAtMs}
              score={score}
              tier="compact"
              now={workspace.now}
              px={26}
            />
            <span
              className="min-w-0 flex-1 truncate text-[0.8rem] font-semibold tracking-tight text-foreground"
              title={project.name}
            >
              {project.name}
            </span>
            <span className="shrink-0 truncate font-mono text-[0.62rem] text-muted-foreground">
              {project.git.isRepo ? project.git.branch : (project.stack?.label ?? "")}
            </span>
            <span className="b-glyph shrink-0">{ageMs(project.updatedAt, workspace.now)}</span>
          </button>
        );
      })}
    </div>
  );

  /** The owner's organic mosaic: placed tiles at their measured percent
   * rectangles (irregular offsets preserved — nothing snaps to spans), the
   * remaining flow tiles in a dense 12-col sub-grid below the placed
   * region. */
  const projectName = (node: (typeof nodes)[number]) => {
    const pathProp = node.props?.["path"];
    return typeof pathProp === "string"
      ? (pathProp.split("/").filter(Boolean).at(-1) ?? "")
      : "";
  };

  const placedNodes: typeof nodes = [];
  const flowNodes: typeof nodes = [];
  for (const node of nodes) {
    if (OWNER_TILES[projectName(node)] !== undefined && !compact) placedNodes.push(node);
    else flowNodes.push(node);
  }

  const mosaic = compact ? (
    compactLedger
  ) : (
    <div className="relative h-full min-h-0 w-full overflow-hidden">
      {placedNodes.map((node) => {
        const rect = OWNER_TILES[projectName(node)];
        return (
          <div
            key={node.id}
            className="absolute min-h-0 min-w-0"
            style={{
              left: `${rect.x}%`,
              top: `${rect.y}%`,
              width: `${rect.w}%`,
              height: `${rect.h}%`,
            }}
          >
            <BentoProjectTile
              node={node}
              size={{ cols: rect.cols, rows: rect.rows, sizeClass: node.size }}
            />
          </div>
        );
      })}
      <div className="absolute inset-x-0 bottom-0" style={{ top: `${FLOW_TOP}%` }}>
        <div className="grid h-full min-h-0 w-full grid-cols-12 auto-rows-[minmax(84px,1fr)] gap-3 overflow-hidden">
          {packMosaic(flowNodes.map((node) => spanOf(node.size))).map((place, i) => {
            const node = flowNodes[i];
            return (
              <div
                key={node.id}
                className="min-h-0 min-w-0"
                style={{
                  gridColumn: `${place.x + 1} / span ${place.cols}`,
                  gridRow: `${place.y + 1} / span ${place.rows}`,
                }}
              >
                <BentoProjectTile
                  node={node}
                  size={{ cols: place.cols, rows: place.rows, sizeClass: node.size }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <BentoTile className="flex h-full min-h-0 w-full flex-col gap-3 p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="b-label">Projects</h2>
        {meta}
        <span className="ml-auto hidden @[900px]:block">
          <SizeLegend />
        </span>
      </div>
      <Fill>{mosaic}</Fill>
    </BentoTile>
  );
}
