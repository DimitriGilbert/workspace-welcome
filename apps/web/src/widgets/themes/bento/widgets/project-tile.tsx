/**
 * Bento's project tile (master plan §5 T2-bento): the design's
 * `project-tile.tsx` ported rung-for-rung. The five mosaic tiers ARE this
 * widget's size rungs — hero 3x3 → compact 1x1 — sized by the
 * owner-mandated recency mapping that already lives in the "projects" flow
 * (`scoreProjects` tiers); nothing is re-derived here.
 *
 * Per-tile report data rides the report context's entry lookup (ONE lazy
 * scan export for the whole board — the design's no-fan-out rule) and
 * per-entry staleness is `report.isEntryStale` (the design's tile rule).
 * Pixels are ui parts + P4 conventions: ProjectLed (the ledState bridge),
 * GitGlyphs, ScoreRing + compactAge (the recency ring, one recency token
 * per tier), SeverityDots, Chip, ViewCarousel. The `Chart` part clears
 * its 200x160 floor only on the hero rung — the feature rung authors
 * HBars/KvList non-chart carousel cards instead (ruling 5).
 */
import { useMemo } from "react";
import type { ReactNode } from "react";

import type { AlertSeverity, Project } from "@workspace-welcome/api/lib/types";
import type { ReportExportProject } from "@workspace-welcome/api/lib/report-export";
import { Chip } from "@workspace-welcome/ui/components/chip";
import { Chart } from "@workspace-welcome/ui/components/chart";
import { GitGlyphs } from "@workspace-welcome/ui/components/git-glyphs";
import { HBars } from "@workspace-welcome/ui/components/h-bars";
import { KvList } from "@workspace-welcome/ui/components/kv-list";
import { ScoreRing } from "@workspace-welcome/ui/components/score-ring";
import { SeverityDots } from "@workspace-welcome/ui/components/severity-dots";
import { ViewCarousel } from "@workspace-welcome/ui/components/view-carousel";
import { cn } from "@workspace-welcome/ui/lib/utils";
import type { Tone } from "@workspace-welcome/ui/lib/tokens";

import { compactAge, formatCompact, formatCost, relativeTime } from "@/lib/format";

import { ProjectLedPart } from "@/widgets/parts";
import { useReport } from "@/widgets/contexts/report-context";
import { useWorkspace } from "@/widgets/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

const SEV_TONE: Record<AlertSeverity, Tone> = {
  critical: "critical",
  warning: "warning",
  info: "info",
};

const SEV_TOKEN: Record<AlertSeverity, string> = {
  critical: "var(--sev-critical)",
  warning: "var(--sev-warning)",
  info: "var(--sev-info)",
};

/** Recency ring color per tier rung — the design's tier tones as tokens. */
const TIER_RECENCY: Record<string, string> = {
  "3x3": "var(--recency-fresh)",
  "2x3": "var(--recency-warm)",
  "2x2": "var(--recency-cooling)",
  "2x1": "var(--recency-stale)",
  "1x1": "var(--recency-stale)",
};

interface TileProps {
  path?: string;
  score?: number;
}

function readTileProps(node: RegisteredWidgetProps["node"]): TileProps {
  const path = node.props?.["path"];
  const score = node.props?.["score"];
  return {
    path: typeof path === "string" ? path : undefined,
    score: typeof score === "number" ? score : undefined,
  };
}

/* ---------------------------------------------------------- fragments --- */

function TileFill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-full min-h-0 w-full min-w-0 flex-col", className)}>
      {children}
    </div>
  );
}

function TileQuiet({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-8 items-center justify-center rounded-lg border border-dashed border-border px-3 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}

function TileHeader({ project, large = false }: { project: Project; large?: boolean }) {
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2">
      <ProjectLedPart project={project} />
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-semibold tracking-tight",
          large ? "text-sm" : "text-xs",
        )}
        title={project.name}
      >
        {project.name}
      </span>
      {project.stack ? (
        <Chip tone="neutral" title={`${project.stack.label} stack`}>
          {project.stack.label}
        </Chip>
      ) : null}
      {project.pinned ? <Chip tone="accent">pinned</Chip> : null}
    </div>
  );
}

/** The recency ring: score sweep + tier token color, the compact age inside. */
function RingAge({ score, tier, age, px }: { score: number; tier: string; age: string; px: number }) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: px, height: px }}
    >
      <ScoreRing
        score={score}
        size={px}
        color={TIER_RECENCY[tier] ?? TIER_RECENCY["1x1"]}
        label={`Recency ring — updated ${age}`}
      />
      <span
        aria-hidden
        className="absolute font-mono tabular-nums text-foreground"
        style={{ fontSize: px >= 34 ? 9.5 : 8 }}
      >
        {age}
      </span>
    </span>
  );
}

function AlertDots({ project }: { project: Project }) {
  if (project.alerts.length === 0) return null;
  return (
    <SeverityDots
      dots={project.alerts.map((alert) => ({
        id: alert.code,
        severity: alert.severity,
        message: alert.message,
      }))}
    />
  );
}

function ReportLine({ entry }: { entry: ReportExportProject }) {
  return (
    <p
      className="min-w-0 shrink-0 truncate font-mono text-[10px] tabular-nums text-muted-foreground"
      title={`${entry.totalCommits} commits · ${entry.contributors} contributors · AI cost ${formatCost(entry.aiUsage?.cost ?? 0)} subsidized`}
    >
      {formatCompact(entry.totalCommits)} commits · {entry.contributors} contrib. ·{" "}
      <span style={{ color: "var(--chart-4)" }}>AI {formatCost(entry.aiUsage?.cost ?? 0)}</span>
    </p>
  );
}

function LastCommitLine({ project }: { project: Project }) {
  const commit = project.git.lastCommit;
  if (!commit) {
    return (
      <p className="text-xs text-muted-foreground">
        {project.git.isRepo ? "No commits yet." : "Not a git repository."}
      </p>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <p className="line-clamp-2 text-xs leading-snug" title={commit.message}>
        {commit.message}
      </p>
      <p className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
        {commit.author}
        {project.git.branch ? ` · ${project.git.branch}` : ""} · {relativeTime(commit.date)}
      </p>
    </div>
  );
}

function TileFooter({
  project,
  tier,
  score,
  age,
  px,
  large = false,
}: {
  project: Project;
  tier: string;
  score: number;
  age: string;
  px: number;
  large?: boolean;
}) {
  return (
    <div className="mt-auto flex min-w-0 shrink-0 items-end justify-between gap-2">
      <GitGlyphs
        isRepo={project.git.isRepo}
        ahead={project.git.ahead ?? 0}
        behind={project.git.behind ?? 0}
        dirtyCount={project.git.dirtyCount ?? 0}
        large={large}
      />
      <span className="flex shrink-0 items-center gap-2">
        <AlertDots project={project} />
        <RingAge score={score} tier={tier} age={age} px={px} />
      </span>
    </div>
  );
}

function QualityCard({ entry }: { entry: ReportExportProject }) {
  if (entry.alerts.length === 0) {
    return <TileQuiet>No quality signals flagged in this report.</TileQuiet>;
  }
  return (
    <ul className="m-0 flex min-h-0 w-full list-none flex-col justify-evenly gap-1.5 p-0">
      {entry.alerts.slice(0, 5).map((alert) => (
        <li key={alert.id} className="flex min-w-0 items-center gap-2" title={alert.summary}>
          <Chip tone={SEV_TONE[alert.severity]}>{alert.label}</Chip>
          <span
            className="ml-auto shrink-0 font-mono text-xs tabular-nums"
            style={{ color: SEV_TOKEN[alert.severity] }}
          >
            {alert.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

function AiCard({ entry }: { entry: ReportExportProject }) {
  const usage = entry.aiUsage;
  if (!usage) {
    return <TileQuiet>No AI usage recorded in this report window.</TileQuiet>;
  }
  return (
    <KvList
      density="compact"
      rows={[
        { label: "AI cost", value: formatCost(usage.cost), tone: "accent", mono: true },
        { label: "Messages", value: usage.records.toLocaleString(), mono: true },
        { label: "Tokens in", value: formatCompact(usage.tokens.input), mono: true },
        { label: "Tokens out", value: formatCompact(usage.tokens.output), mono: true },
        { label: "Total tokens", value: formatCompact(usage.tokens.total), mono: true },
      ]}
    />
  );
}

/* ------------------------------------------------------------ widget --- */

export function BentoProjectTile({ node, size }: RegisteredWidgetProps) {
  const { path, score = 0 } = readTileProps(node);
  const workspace = useWorkspace();
  const report = useReport();

  const project = useMemo(
    () =>
      path === undefined
        ? null
        : workspace.projects.find((candidate) => candidate.path === path) ?? null,
    [path, workspace.projects],
  );
  const entry = path === undefined ? null : report.entry(path);
  const entryStale = path !== undefined && report.isEntryStale(path);

  if (project === null) {
    return (
      <div
        data-slot="bento-tile-empty"
        className="flex h-full min-h-0 w-full items-center justify-center px-3"
      >
        <p className="truncate text-xs text-muted-foreground">
          {workspace.scanState === "loading"
            ? "Waiting for the workspace scan…"
            : path === undefined
              ? "No project bound — flow tiles bind a path."
              : "Project not in the current scan."}
        </p>
      </div>
    );
  }

  const age = compactAge(workspace.now - (Date.parse(project.updatedAt) || 0), workspace.now);
  const staleChip =
    entry !== null && entryStale ? (
      <Chip
        tone="warning"
        title="The project moved on after this snapshot was generated"
      >
        data stale
      </Chip>
    ) : null;

  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
      sizes={{
        "1x1": (
          <TileFill className="gap-1 px-2.5 py-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <ProjectLedPart project={project} />
              <span
                className="line-clamp-2 text-[11px] leading-tight font-semibold tracking-tight"
                title={project.name}
              >
                {project.name}
              </span>
            </div>
            <div className="mt-auto flex min-w-0 items-center justify-between gap-1">
              <AlertDots project={project} />
              <RingAge score={score} tier="1x1" age={age} px={24} />
            </div>
          </TileFill>
        ),
        "2x1": (
          <TileFill className="gap-1.5 px-3 py-2.5">
            <TileHeader project={project} />
            {entry !== null ? (
              <ReportLine entry={entry} />
            ) : (
              <LastCommitLine project={project} />
            )}
            <TileFooter project={project} tier="2x1" score={score} age={age} px={26} />
          </TileFill>
        ),
        "2x2": (
          <TileFill className="gap-2 px-3.5 py-3">
            <TileHeader project={project} large />
            <div className="flex min-h-0 flex-1 flex-col justify-center gap-1.5">
              <LastCommitLine project={project} />
              {entry !== null ? <ReportLine entry={entry} /> : null}
            </div>
            <TileFooter project={project} tier="2x2" score={score} age={age} px={34} large />
          </TileFill>
        ),
        "2x3": (
          <TileFill className="gap-2 px-3.5 py-3">
            <TileHeader project={project} large />
            <div className="flex min-w-0 shrink-0 items-center gap-2">
              {entry !== null ? <ReportLine entry={entry} /> : null}
              {staleChip}
            </div>
            <div className="min-h-0 w-full flex-1">
              {entry === null ? (
                <LastCommitLine project={project} />
              ) : (
                <ViewCarousel
                  autoAdvance
                  ariaLabel={`${project.name} stats`}
                  className="h-full min-h-0 w-full"
                  cards={[
                    {
                      id: "tile-cadence-bars",
                      label: "bars",
                      node: (
                        <HBars
                          maxRows={6}
                          ariaLabel={`Commits per month for ${project.name}`}
                          className="h-full min-h-0 w-full"
                          rows={[...entry.cadence.slice(-6)].reverse().map((point) => ({
                            label: point.period,
                            value: point.commits,
                          }))}
                        />
                      ),
                    },
                    {
                      id: "tile-stats",
                      label: "table",
                      node: (
                        <KvList
                          density="compact"
                          className="h-full min-h-0 w-full"
                          rows={[
                            { label: "commits", value: formatCompact(entry.totalCommits), mono: true },
                            { label: "contrib.", value: String(entry.contributors), mono: true },
                            { label: "AI cost", value: formatCost(entry.aiUsage?.cost ?? 0), tone: "accent", mono: true },
                            { label: "tokens", value: formatCompact(entry.aiUsage?.tokens.total ?? 0), mono: true },
                            { label: "languages", value: String(entry.languages.length), mono: true },
                            { label: "signals", value: String(entry.alerts.length), mono: true },
                          ]}
                        />
                      ),
                    },
                  ]}
                />
              )}
            </div>
            <TileFooter project={project} tier="2x3" score={score} age={age} px={36} large />
          </TileFill>
        ),
        "3x3": (
          <TileFill className="gap-2 px-4 py-3">
            <TileHeader project={project} large />
            {project.note ? (
              <p className="line-clamp-1 shrink-0 text-xs text-muted-foreground" title={project.note}>
                {project.note}
              </p>
            ) : null}
            <div className="flex min-w-0 shrink-0 items-center gap-2">
              {entry !== null ? <ReportLine entry={entry} /> : null}
              {staleChip}
            </div>
            <div className="min-h-0 w-full flex-1">
              {entry === null ? (
                <LastCommitLine project={project} />
              ) : (
                <ViewCarousel
                  autoAdvance
                  ariaLabel={`${project.name} report`}
                  className="h-full min-h-0 w-full"
                  cards={[
                    {
                      id: "tile-activity",
                      label: "activity",
                      node: (
                        <div className="flex h-full min-h-0 w-full flex-col gap-1">
                          <div className="min-h-0 w-full flex-1">
                            <Chart
                              variant="area"
                              points={entry.cadence
                                .slice(-12)
                                .map((point) => ({ label: point.period, value: point.commits }))}
                              maxPoints={12}
                              ariaLabel={`Commits per month for ${project.name}`}
                            />
                          </div>
                          <p className="shrink-0 font-mono text-[9px] text-muted-foreground">
                            commits / month · last {relativeTime(entry.lastCommit?.date ?? null)}
                          </p>
                        </div>
                      ),
                    },
                    {
                      id: "tile-quality",
                      label: "quality",
                      node: <QualityCard entry={entry} />,
                    },
                    {
                      id: "tile-ai",
                      label: "ai",
                      node: <AiCard entry={entry} />,
                    },
                  ]}
                />
              )}
            </div>
            <TileFooter project={project} tier="3x3" score={score} age={age} px={40} large />
          </TileFill>
        ),
      }}
    >
      <TileFill className="gap-2 px-3.5 py-3">
        <TileHeader project={project} large />
        <LastCommitLine project={project} />
        <TileFooter project={project} tier="2x2" score={score} age={age} px={34} large />
      </TileFill>
    </WidgetShell>
  );
}
