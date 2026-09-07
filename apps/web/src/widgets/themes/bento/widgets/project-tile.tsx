/**
 * Bento's project tile — port of the design's `project-tile.tsx`: one
 * project as a bento cell in the five sizes the recency ladder assigns
 * (hero 3×3 → compact 1×1). Size carries the recency story and sets how
 * much snitch data the tile surfaces; the tile itself opens the project
 * page. Data rides the widget system's providers: the project record from
 * `useWorkspace()`, the report slice from `useReport().entry(path)`, the
 * clock from the provider (the design's `now` rides the scan the same way).
 *
 * The design's per-tile pin/hide dropdown needs procedure access the theme
 * namespace deliberately lacks; the tile keeps the design's visual tiers
 * and the whole-tile open action (pinning lives on the project page).
 */
import {
  BrainCircuit,
  GitCommitHorizontal,
  Users,
} from "lucide-react";
import { useMemo } from "react";
import type { MouseEvent, KeyboardEvent, ReactNode } from "react";

import { cn } from "@workspace-welcome/ui/lib/utils";
import type { ReportExportProject } from "@workspace-welcome/api/lib/report-export";
import type { Project } from "@workspace-welcome/api/lib/types";

import { AlertIcons } from "@/components/git-badges";
import { useNavigate } from "@tanstack/react-router";
import { formatCompact, formatCost, relativeTime } from "@/lib/format";
import { stackIcon } from "@/lib/icons";

import { useReport } from "@/widgets/contexts/report-context";
import { useWorkspace } from "@/widgets/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";

import { BentoTile, CadenceArea, GitGlyphs, RecencyRing } from "../bits";
import { DataCarousel } from "../data-carousel";

const SEVERITY_COLOR = {
  critical: "var(--sev-critical)",
  warning: "var(--sev-warning)",
  info: "var(--sev-info)",
} as const;

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

/** Deep-link into this theme's project page (the app splat route). */
function useOpenBentoProject() {
  const navigate = useNavigate();
  return (path: string) => {
    void navigate({
      to: "/app/$theme/project/$",
      params: { theme: "bento", _splat: path.replace(/^\/+/, "") },
    });
  };
}

/* ------------------------------------------------------------ widget --- */

export function BentoProjectTile({ node, size }: RegisteredWidgetProps) {
  const { path, score = 0 } = readTileProps(node);
  const workspace = useWorkspace();
  const report = useReport();
  const openBentoProject = useOpenBentoProject();

  const project = useMemo(
    () =>
      path === undefined
        ? null
        : workspace.projects.find((candidate) => candidate.path === path) ?? null,
    [path, workspace.projects],
  );
  const entry = path === undefined ? null : report.entry(path);
  const entryStale = path !== undefined && report.isEntryStale(path);
  const now = workspace.now;

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

  const tier = size.cols >= 3 && size.rows >= 3
    ? "hero"
    : size.cols >= 2 && size.rows >= 3
      ? "feature"
      : size.cols >= 2 && size.rows >= 2
        ? "large"
        : size.cols >= 2
          ? "medium"
          : "compact";

  const open = () => openBentoProject(project.path);

  const shared = {
    action: true,
    pinned: project.pinned,
    role: "button" as const,
    tabIndex: 0,
    "aria-label": `Open ${project.name}`,
    onClick: (e: MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-stop-propagation]")) return;
      open();
    },
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    },
  };

  const header = (iconSize: string, nameClass: string) => (
    <div className="flex min-w-0 items-start gap-2.5">
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center rounded-[10px] border border-border bg-white/[0.04] text-muted-foreground",
          iconSize,
        )}
      >
        <StackIconById project={project} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {/* The name keeps a readable floor (min-w-14): at narrow mosaic
              spans the stack chip yields and truncates first — a nameless
              tile is a clip, not a compromise. */}
          <span
            className={cn("min-w-14 truncate font-semibold tracking-tight", nameClass)}
            title={project.name}
          >
            {project.name}
          </span>
          {project.stack ? (
            <span className="hidden min-w-0 overflow-hidden rounded-full border border-border bg-white/[0.03] px-2 py-px text-[0.62rem] font-medium text-muted-foreground sm:inline-flex">
              {project.stack.label}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );

  const updatedAtMs = new Date(project.updatedAt).getTime();
  const dim = tier === "compact" && now - updatedAtMs > 120 * 24 * 60 * 60 * 1000;

  if (tier === "compact") {
    return (
      <BentoTile
        {...shared}
        className={cn("flex h-full min-h-0 w-full flex-col gap-1.5 p-3", dim && "opacity-60")}
      >
        <div className="flex items-center justify-between gap-1">
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-lg border border-border bg-white/[0.04] text-muted-foreground"
          >
            <StackIconById project={project} />
          </span>
        </div>
        <span
          className="line-clamp-2 text-[0.78rem] leading-tight font-semibold tracking-tight"
          title={project.name}
        >
          {project.name}
        </span>
        <div className="mt-auto flex items-center justify-between gap-1.5">
          <RecencyRing updatedAtMs={updatedAtMs} score={score} tier={tier} now={now} px={26} />
          <AlertIcons alerts={project.alerts} />
        </div>
      </BentoTile>
    );
  }

  if (tier === "medium") {
    return (
      <BentoTile {...shared} className="flex h-full min-h-0 w-full flex-col gap-2 p-3.5">
        {header("size-7", "text-[0.84rem]")}
        <TileStatLine report={entry} project={project} />
        <div className="mt-auto flex items-center justify-between gap-2">
          <GitGlyphs git={project.git} />
          <span className="flex shrink-0 items-center gap-2">
            <AlertIcons alerts={project.alerts} />
            <RecencyRing updatedAtMs={updatedAtMs} score={score} tier={tier} now={now} px={30} />
          </span>
        </div>
      </BentoTile>
    );
  }

  if (tier === "large") {
    return (
      <BentoTile {...shared} className="flex h-full min-h-0 w-full flex-col gap-3 p-4">
        {header("size-8", "text-[0.92rem]")}
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-1">
          <LastCommitLine project={project} />
          <TileStatLine report={entry} project={project} />
        </div>
        <div className="flex items-end justify-between gap-2">
          <GitGlyphs git={project.git} large />
          <span className="flex shrink-0 items-center gap-2">
            <AlertIcons alerts={project.alerts} />
            <RecencyRing updatedAtMs={updatedAtMs} score={score} tier={tier} now={now} px={36} />
          </span>
        </div>
      </BentoTile>
    );
  }

  if (tier === "feature") {
    return (
      <BentoTile {...shared} className="flex h-full min-h-0 w-full flex-col gap-3 p-4">
        {header("size-8", "text-[0.94rem]")}
        <div className="flex min-h-0 flex-1 flex-col">
          {entry ? (
            <DataCarousel
              ariaLabel={`${project.name} stats`}
              autoMs={7000}
              seed={project.path}
              cards={[
                {
                  label: "graph",
                  content: (
                    <div className="flex min-h-0 flex-1 flex-col justify-center gap-1.5">
                      <CadenceArea cadence={entry.cadence} />
                      <p className="font-mono text-[0.62rem] text-muted-foreground">
                        commits / month · {formatCompact(entry.totalCommits)} total
                      </p>
                    </div>
                  ),
                },
                {
                  label: "table",
                  content: (
                    // h-full lets content-center actually center: the dl
                    // stretches with the card, so the stat grid sits mid-tile
                    // instead of pinning to the top above dead space.
                    <dl className="grid h-full grid-cols-2 content-center gap-x-5 gap-y-2">
                      <TileStat icon={GitCommitHorizontal} label="commits" value={formatCompact(entry.totalCommits)} />
                      <TileStat icon={Users} label="contrib." value={String(entry.contributors)} />
                      <TileStat icon={BrainCircuit} label="AI cost" value={formatCost(entry.aiUsage?.cost ?? 0)} accent />
                      <TileStat icon={null} label="tokens" value={formatCompact(entry.aiUsage?.tokens.total ?? 0)} />
                      <TileStat icon={null} label="languages" value={String(entry.languages.length)} />
                      <TileStat icon={null} label="signals" value={String(entry.alerts.length)} />
                    </dl>
                  ),
                },
              ]}
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col justify-center gap-1">
              <LastCommitLine project={project} />
            </div>
          )}
        </div>
        <div className="flex items-end justify-between gap-2">
          <GitGlyphs git={project.git} large />
          <span className="flex shrink-0 items-center gap-2">
            <AlertIcons alerts={project.alerts} />
            <RecencyRing updatedAtMs={updatedAtMs} score={score} tier={tier} now={now} px={38} />
          </span>
        </div>
      </BentoTile>
    );
  }

  // hero — 3×3: the working set, with the tabbed snitch digest.
  return (
    <BentoTile {...shared} className="flex h-full min-h-0 w-full flex-col gap-2.5 p-4">
      {header("size-9", "text-base")}

      {project.note ? (
        <p className="line-clamp-1 text-xs text-muted-foreground" title={project.note}>
          {project.note}
        </p>
      ) : null}

      {entry ? (
        <>
          <div className="flex shrink-0 items-center gap-1" data-stop-propagation>
            <span className="ml-auto font-mono text-[0.6rem] text-muted-foreground">
              {formatCompact(entry.totalCommits)} commits · {entry.contributors} contrib.
              {entry.aiUsage ? ` · AI ${formatCost(entry.aiUsage.cost)}` : ""}
            </span>
            {entryStale ? (
              <span
                className="font-mono text-[0.6rem]"
                style={{ color: "var(--sev-warning)" }}
                title="The project moved on after this snapshot was generated"
              >
                · data stale
              </span>
            ) : null}
          </div>
          <DataCarousel
            ariaLabel={`${project.name} report`}
            autoMs={6000}
            seed={project.path}
            cards={[
              {
                label: "activity",
                content: (
                  <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                    <CadenceArea cadence={entry.cadence} />
                    <p className="font-mono text-[0.62rem] text-muted-foreground">
                      commits / month · {entry.totalCommits} total · last{" "}
                      {relativeTime(entry.lastCommit?.date ?? null)}
                    </p>
                  </div>
                ),
              },
              {
                label: "quality",
                content: <HeroQuality entry={entry} />,
              },
              {
                label: "ai",
                content: <HeroAi entry={entry} />,
              },
            ]}
          />
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-1.5">
          <LastCommitLine project={project} detailed />
        </div>
      )}

      <div className="flex items-end justify-between gap-3">
        <GitGlyphs git={project.git} large />
        <span className="flex shrink-0 items-center gap-2.5">
          <AlertIcons alerts={project.alerts} />
          <RecencyRing updatedAtMs={updatedAtMs} score={score} tier={tier} now={now} px={44} />
        </span>
      </div>
    </BentoTile>
  );
}

function StackIconById({ project }: { project: Project }) {
  const Icon = stackIcon(project.stack?.id);
  return <Icon className="size-4" />;
}

/* ---------------------------------------------------------- fragments --- */

function HeroQuality({ entry }: { entry: ReportExportProject }) {
  if (entry.alerts.length === 0) {
    return <TileEmpty>No quality signals flagged in this report.</TileEmpty>;
  }
  return (
    <ul className="flex h-full min-h-0 flex-col gap-1.5 pr-0.5">
      {entry.alerts.map((alert) => (
        <li
          key={alert.id}
          className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-white/[0.02] px-2.5 py-1.5"
          title={alert.summary}
        >
          <span
            className="mt-1 size-2 shrink-0 rounded-[3px]"
            style={{ background: SEVERITY_COLOR[alert.severity] }}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium">{alert.label}</span>
            <span className="line-clamp-1 block text-[0.66rem] leading-snug text-muted-foreground">
              {alert.summary}
            </span>
          </span>
          <span className="b-num shrink-0 text-sm" style={{ color: SEVERITY_COLOR[alert.severity] }}>
            {alert.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

function HeroAi({ entry }: { entry: ReportExportProject }) {
  const usage = entry.aiUsage;
  if (!usage) {
    return <TileEmpty>No AI usage recorded in this report window.</TileEmpty>;
  }
  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-2.5">
      <div className="flex items-baseline gap-2">
        <span className="b-num text-3xl" style={{ color: "var(--bento-c4)" }}>
          {formatCost(usage.cost)}
        </span>
        <span className="flex flex-col">
          <span className="text-xs font-medium">subsidized AI cost</span>
          <span className="font-mono text-[0.62rem] text-muted-foreground">
            {usage.records.toLocaleString()} messages
          </span>
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-2 font-mono text-[0.66rem] text-muted-foreground">
        <div className="flex flex-col gap-0.5 rounded-lg border border-border px-2 py-1.5">
          <dt className="text-[0.58rem] uppercase tracking-[0.08em]">tokens in</dt>
          <dd className="text-sm text-foreground">{formatCompact(usage.tokens.input)}</dd>
        </div>
        <div className="flex flex-col gap-0.5 rounded-lg border border-border px-2 py-1.5">
          <dt className="text-[0.58rem] uppercase tracking-[0.08em]">out</dt>
          <dd className="text-sm text-foreground">{formatCompact(usage.tokens.output)}</dd>
        </div>
        <div className="flex flex-col gap-0.5 rounded-lg border border-border px-2 py-1.5">
          <dt className="text-[0.58rem] uppercase tracking-[0.08em]">total</dt>
          <dd className="text-sm text-foreground">{formatCompact(usage.tokens.total)}</dd>
        </div>
      </dl>
    </div>
  );
}

function TileStatLine({
  report,
  project,
}: {
  report?: ReportExportProject | null;
  project: Project;
}) {
  if (report) {
    return (
      <p
        className="truncate font-mono text-[0.68rem] text-muted-foreground"
        title={`${report.totalCommits} commits · ${report.contributors} contributors · AI cost ${formatCost(report.aiUsage?.cost ?? 0)} subsidized`}
      >
        {formatCompact(report.totalCommits)} commits · {report.contributors} contrib. ·{" "}
        <span style={{ color: "var(--bento-c4)" }}>AI {formatCost(report.aiUsage?.cost ?? 0)}</span>
      </p>
    );
  }
  return <LastCommitLine project={project} />;
}

function LastCommitLine({
  project,
  detailed = false,
}: {
  project: Project;
  detailed?: boolean;
}) {
  const lastCommit = project.git.lastCommit;
  if (!lastCommit) {
    return (
      <p
        className={
          detailed ? "text-sm text-muted-foreground" : "line-clamp-1 text-xs text-muted-foreground"
        }
      >
        {project.git.isRepo ? "No commits yet." : "Not a git repository."}
      </p>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="b-label">last commit</p>
      <p
        className={cn(
          detailed ? "line-clamp-2 text-sm leading-snug" : "line-clamp-1 text-[0.8rem] leading-snug",
        )}
        title={lastCommit.message}
      >
        {lastCommit.message}
      </p>
      <p className="font-mono text-[0.66rem] text-muted-foreground">
        {lastCommit.author}
        {project.git.branch ? ` · ${project.git.branch}` : ""} · {relativeTime(lastCommit.date)}
      </p>
    </div>
  );
}

function TileStat({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: typeof GitCommitHorizontal | null;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {Icon ? (
        <Icon
          className="size-3.5 shrink-0"
          style={accent ? { color: "var(--bento-c4)" } : { color: "var(--muted-foreground)" }}
        />
      ) : null}
      <dt className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="b-num shrink-0 text-sm" style={accent ? { color: "var(--bento-c4)" } : undefined}>
        {value}
      </dd>
    </div>
  );
}

function TileEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border px-3 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}
