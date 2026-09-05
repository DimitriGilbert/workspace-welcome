/**
 * ProjectTile — THE core widget kind (master plan §3.3, W2's flows contract).
 *
 * The `"projects"` flow generator (`widgets/runtime/flows.ts`) stamps one
 * node per scanned project with `widget: "project-tile"` and
 * `props: { path, score }`; this kind is its registered renderer. It is a
 * common widget, so it lives in the registry's static core layer
 * (`widgets/core/` — the home of theme-independent kinds) instead of any
 * theme directory.
 *
 * Rung presentation (self-degradation precedence, §3.3): the authored
 * ladder is the author's tool, so the tile reads `useWidgetSize()` and
 * renders one presentation per band — 1x1 lamp row, 2x1 summary row, and a
 * full board from 2x2 up (score chip, git glyphs, pulse strip, alert
 * chips). Part-level pixel variance INSIDE a band is the parts' container
 * queries' job, not re-branched here.
 *
 * Data arrives through the provider stack only (themes/flows don't fetch):
 * the project is looked up in `useWorkspace().projects` by the node's
 * `path` prop; the score flows in as tile weight. Unbound instances (the
 * widget-lab ladder catalog) render an honest filling empty state — never
 * fake content.
 */
import { useMemo } from "react";

import type { Project } from "@workspace-welcome/api/lib/types";
import { Chip } from "@workspace-welcome/ui/components/chip";
import { GitGlyphs } from "@workspace-welcome/ui/components/git-glyphs";
import { Led } from "@workspace-welcome/ui/components/led";
import { PulseStrip } from "@workspace-welcome/ui/components/pulse-strip";
import { ScoreChip } from "@workspace-welcome/ui/components/score-ring";

import { compactAge } from "@/lib/format";
import { ledState, pulseCells } from "@/lib/scan-metrics";

import { useWorkspace } from "../contexts/workspace-context";
import type { RegisteredWidgetProps } from "../registry";
import { parseSize, rankOf } from "../runtime/size-class";
import { useWidgetSize } from "../runtime/widget-shell";

/** Node props as the flow stamps them (`WidgetNode.props` is JsonValue). */
interface ProjectTileProps {
  path?: string;
  score?: number;
}

function readTileProps(node: RegisteredWidgetProps["node"]): ProjectTileProps {
  const path = node.props?.["path"];
  const score = node.props?.["score"];
  return {
    path: typeof path === "string" ? path : undefined,
    score: typeof score === "number" ? score : undefined,
  };
}

const ALERT_TONE = {
  critical: "critical",
  warning: "warning",
  info: "info",
} as const;

function AlertChips({ project }: { project: Project }) {
  if (project.alerts.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {project.alerts.map((alert) => (
        <Chip key={alert.code} tone={ALERT_TONE[alert.severity]} title={alert.message}>
          {alert.code}
        </Chip>
      ))}
    </div>
  );
}

/**
 * Fill-box root: every presentation wraps in one `h-full w-full min-h-0`
 * flex column so the density probe measures a honestly-filled box and the
 * shell's content stretch drives the height chain.
 */
export function ProjectTile({ node }: RegisteredWidgetProps) {
  const { path, score } = readTileProps(node);
  const workspace = useWorkspace();
  const { sizeClass } = useWidgetSize();

  const project = useMemo(
    () => (path === undefined ? null : workspace.projects.find((p) => p.path === path) ?? null),
    [path, workspace.projects],
  );

  const parsed = parseSize(sizeClass);
  const rank = parsed === null ? 0 : rankOf(parsed);
  // Bands, smallest-first: a 1x1 cell (~100 px) fits a lamp row only; the
  // summary row starts at 2x1; the full board from 2x2 up.
  const micro = rank < rankOf({ cols: 2, rows: 1 });
  const compact = !micro && rank < rankOf({ cols: 2, rows: 2 });

  if (project === null) {
    // Loading scan or unbound instance (e.g. the lab ladder catalog): an
    // honest, box-filling empty state — never fake content.
    return (
      <div
        data-slot="project-tile-empty"
        className="flex h-full min-h-0 w-full items-center justify-center px-3"
      >
        <p className="truncate text-xs text-muted-foreground">
          {workspace.scanState === "loading"
            ? "Waiting for the workspace scan…"
            : path === undefined
              ? "No project bound — flow tiles and nodes with a path prop render here."
              : "Project not in the current scan."}
        </p>
      </div>
    );
  }

  const led = ledState(project, workspace.now);

  if (micro) {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 items-center gap-2 overflow-hidden px-3">
        <span className="shrink-0">
          <Led tone={led.tone} label={led.label} />
        </span>
        <span className="truncate text-xs font-medium">{project.name}</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col justify-center gap-1.5 overflow-hidden px-3 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <Led tone={led.tone} label={led.label} />
          <span className="truncate text-sm font-medium">{project.name}</span>
          {score !== undefined && <ScoreChip score={score} className="ml-auto shrink-0" />}
        </div>
        <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
          <span className="truncate">{project.stack?.label ?? "—"}</span>
          <span className="ml-auto shrink-0 tabular-nums">
            {compactAge(workspace.now - (Date.parse(project.updatedAt) || 0), workspace.now)}
          </span>
        </div>
        {!project.git.isRepo ? null : (
          <GitGlyphs
            isRepo
            ahead={project.git.ahead ?? 0}
            behind={project.git.behind ?? 0}
            dirtyCount={project.git.dirtyCount ?? 0}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 overflow-hidden px-3 pb-3">
      <div className="flex min-w-0 items-start gap-2">
        <Led tone={led.tone} label={led.label} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{project.name}</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">{project.path}</p>
        </div>
        {score !== undefined && <ScoreChip score={score} className="shrink-0" />}
      </div>
      <PulseStrip
        cells={pulseCells(project, 24, workspace.now)}
        ariaLabel={`Activity pulse for ${project.name}`}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span className="truncate">{project.stack?.label ?? "—"}</span>
        <span className="truncate">{project.git.branch ?? "no branch"}</span>
        <span className="ml-auto shrink-0 tabular-nums">
          {compactAge(workspace.now - (Date.parse(project.updatedAt) || 0), workspace.now)}
        </span>
      </div>
      <GitGlyphs
        isRepo={project.git.isRepo}
        ahead={project.git.ahead ?? 0}
        behind={project.git.behind ?? 0}
        dirtyCount={project.git.dirtyCount ?? 0}
      />
      <div className="mt-auto min-w-0">
        <AlertChips project={project} />
      </div>
    </div>
  );
}
