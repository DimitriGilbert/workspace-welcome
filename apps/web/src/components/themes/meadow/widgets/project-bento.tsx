/**
 * Meadow's bento-of-projects (owner order: "bento of project is a widget and
 * NOT free floating projects AND IS 2/3+"): the recency mosaic as ONE
 * chrome-framed widget kind. The canvas never sees individual project tiles
 * — the kind resolves the shared `"projects"` flow generator itself (same
 * scoring, same filter contract as a flow region) and renders the tiles as
 * INTERNAL content on a dense CSS mosaic: `grid-cols-12` with
 * `grid-flow-row-dense`, rungs mapped to even spans so lines complete, and
 * `minmax` fractional rows so the mosaic exactly fills the shell box at any
 * project count — no inner scroll, no interior voids.
 *
 * Rung remap (internal 12 columns): 3x3→4x3, 2x3→4x2, 2x2→2x2, 2x1→2x1,
 * 1x1→1x1. At compact footprints (≤4 canvas columns — the phone clamp) the
 * mosaic degrades to a single-column ledger of dense rows (name · branch ·
 * age), the only honest presentation at ~170px.
 */
import { useMemo } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

import { ageMs } from "@/lib/format";

import { getFlow } from "@/lib/widget/flows";
import { parseSize } from "@/lib/widget/size-class";
import type { SizeClass } from "@/lib/widget/size-class";
import { useWidgetSize, WidgetShell } from "@/components/widgets/widget-shell";
import { useWorkspace } from "@/lib/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/components/widgets/registry";

import { MeadowProjectTile } from "./tile";

/** Ladder rung → internal mosaic span (12-column grid, even spans). */
const SPAN_LADDER: Record<string, { cols: number; rows: number }> = {
  "3x3": { cols: 4, rows: 3 },
  "2x3": { cols: 4, rows: 2 },
  "2x2": { cols: 2, rows: 2 },
  "2x1": { cols: 2, rows: 1 },
  "1x1": { cols: 1, rows: 1 },
};

function spanOf(size: SizeClass): { cols: number; rows: number } {
  return SPAN_LADDER[size] ?? parseSize(size) ?? { cols: 1, rows: 1 };
}

/** Fill-box wrapper for the rung roots. */
function Fill({ children }: { children: ReactNode }) {
  return <div className="h-full min-h-0 w-full min-w-0 overflow-hidden">{children}</div>;
}

export function MeadowProjectBento({ size }: RegisteredWidgetProps) {
  const workspace = useWorkspace();
  const footprint = useWidgetSize();
  const navigate = useNavigate();
  const compact = footprint.cols <= 4;

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
    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
      {nodes.length === total
        ? `${total} ${total === 1 ? "project" : "projects"}`
        : `${nodes.length} of ${total}`}
    </span>
  );

  const openProject = (path: string) => {
    void navigate({
      to: "/project/$",
      params: { _splat: path.replace(/^\/+/, "") },
      search: { preset: "meadow" },
    });
  };

  /** The compact ledger (phone clamp): one dense row per project — name,
   * branch, age — each row flexing to share the box exactly, so every
   * project stays reachable without an inner scroll. */
  const compactLedger = (
    <div className="flex h-full min-h-0 w-full flex-col gap-1.5 overflow-hidden">
      {nodes.map((node) => {
        const pathProp = node.props?.["path"];
        const path = typeof pathProp === "string" ? pathProp : "";
        const project =
          path === "" ? undefined : workspace.projects.find((p) => p.path === path);
        if (project === undefined) return null;
        const worst = project.alerts.some((a) => a.severity === "critical")
          ? "var(--sev-critical)"
          : project.alerts.length > 0
            ? "var(--sev-warning)"
            : "var(--recency-fresh)";
        return (
          <button
            key={node.id}
            type="button"
            onClick={() => openProject(project.path)}
            className="meadow-focus flex min-h-0 w-full flex-1 min-w-0 items-center gap-2 rounded-xl px-3 text-left"
            style={{
              background: "color-mix(in oklch, var(--card) 70%, transparent)",
              border: "1px solid var(--border)",
            }}
          >
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: worst }}
            />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold tracking-tight text-foreground">
              {project.name}
            </span>
            <span className="shrink-0 truncate text-[10px] text-muted-foreground">
              {project.git.isRepo
                ? project.git.branch
                : (project.stack?.label ?? "")}
            </span>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
              {ageMs(project.updatedAt, workspace.now)}
            </span>
          </button>
        );
      })}
    </div>
  );

  const mosaic = (
    <div className="grid h-full min-h-0 w-full grid-flow-row-dense grid-cols-12 auto-rows-[minmax(84px,1fr)] gap-3 overflow-hidden">
      {nodes.map((node) => {
        const span = spanOf(node.size);
        return (
          <div
            key={node.id}
            className="min-h-0 min-w-0"
            style={{
              gridColumn: `span ${span.cols}`,
              gridRow: `span ${span.rows}`,
            }}
          >
            <MeadowProjectTile
              node={node}
              size={{ ...span, sizeClass: node.size }}
            />
          </div>
        );
      })}
    </div>
  );

  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
      title={compact ? undefined : "Project bento"}
      meta={compact ? undefined : meta}
      chrome="px-1"
      sizes={{
        "1x1": (
          <div className="flex h-full w-full min-w-0 items-center overflow-hidden px-1">
            <span className="truncate text-sm font-semibold tabular-nums text-foreground">
              {nodes.length} {nodes.length === 1 ? "project" : "projects"}
            </span>
          </div>
        ),
        "2x2": <Fill>{compact ? compactLedger : mosaic}</Fill>,
      }}
    >
      <Fill>{compact ? compactLedger : mosaic}</Fill>
    </WidgetShell>
  );
}
