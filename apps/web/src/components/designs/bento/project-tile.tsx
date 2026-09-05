import {
  BrainCircuit,
  Copy,
  ExternalLink,
  EyeOff,
  Folder,
  GitCommitHorizontal,
  MoreHorizontal,
  Pin,
  PinOff,
  Terminal as TerminalIcon,
  Users,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@workspace-welcome/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace-welcome/ui/components/dropdown-menu";
import { cn } from "@workspace-welcome/ui/lib/utils";
import type { ReportExportProject } from "@workspace-welcome/api/lib/report-export";
import type { Project } from "@workspace-welcome/api/lib/types";

import { useTRPC } from "@/utils/trpc";
import { AlertIcons } from "@/components/git-badges";
import { relativeTime } from "@/lib/format";
import { stackIcon } from "@/lib/icons";
import { GitGlyphs } from "@/components/designs/bento/git-glyphs";
import { RecencyRing } from "@/components/designs/bento/recency-ring";
import { useOpenBentoProject } from "@/components/designs/bento/use-open-bento-project";
import type { MosaicPlacement } from "@/components/designs/bento/bento-metrics";
import { BentoTile } from "@/components/designs/bento/bento-tile";
import { CadenceArea } from "@/components/designs/bento/cadence-area";
import { DataCarousel } from "@/components/designs/bento/data-carousel";

interface ProjectTileProps {
  project: Project;
  /** Box + tier from the shared mosaic layout. */
  placement: MosaicPlacement;
  /**
   * This project's slice of the workspace snitch export (one lazy fetch for
   * the whole dashboard) — absent when the export predates the project or
   * no export exists.
   */
  report?: ReportExportProject;
  /** The export's generatedAt is ≥24h behind this project's updatedAt. */
  reportStale: boolean;
  now: number;
}

/** "12.4k / 3.1M" — compact magnitude for token and line counts. */
export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

/** Subsidized AI cost — the snitch export's `cost` field. */
export function formatCost(cost: number): string {
  if (cost === 0) return "$0";
  if (cost >= 1000) return `$${(cost / 1000).toFixed(1)}k`;
  return `$${cost.toFixed(2)}`;
}

const SEVERITY_COLOR = {
  critical: "var(--sev-critical)",
  warning: "var(--sev-warning)",
  info: "var(--sev-info)",
} as const;

/**
 * A project as a bento cell, in the five sizes the shared mosaic algorithm
 * assigns (hero 3×3 → compact 1×1). Size carries the recency story and sets
 * how much snitch-report data the tile surfaces: hero tiles get tabbed
 * activity/quality/AI content, feature tiles a stat table with a sparkline,
 * lower tiers progressively less. The tile itself opens the project; pin and
 * the action menu stop propagation.
 */
export function ProjectTile({ project, placement, report, reportStale, now }: ProjectTileProps) {
  const size = placement.tier;
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const openBentoProject = useOpenBentoProject();

  const invalidateScan = () =>
    queryClient.invalidateQueries({ queryKey: trpc.projects.scan.queryKey() });

  const pinMutation = useMutation(
    trpc.projects.setPinned.mutationOptions({
      onSuccess: () => invalidateScan(),
      onError: (e) => toast.error(e.message),
    }),
  );
  const hideMutation = useMutation(
    trpc.projects.setHidden.mutationOptions({
      onSuccess: () => {
        invalidateScan();
        toast.success("Project hidden", {
          action: {
            label: "Undo",
            onClick: () =>
              hideMutation.mutate({ path: project.path, hidden: false }),
          },
        });
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const openMutation = useMutation(
    trpc.projects.open.mutationOptions({
      onSuccess: (data) => toast.success(data.message),
      onError: (e) => toast.error(e.message),
    }),
  );
  const touchMutation = useMutation(
    trpc.projects.touchLastOpened.mutationOptions({
      onSuccess: () => invalidateScan(),
    }),
  );

  const openIn = (target: "editor" | "terminal" | "folder") => {
    openMutation.mutate({ path: project.path, target });
    touchMutation.mutate({ path: project.path });
  };

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(project.path);
      toast.success("Path copied");
    } catch {
      toast.error("Couldn't copy path");
    }
  };

  const open = () => openBentoProject(project.path);

  const StackIcon = stackIcon(project.stack?.id);
  const updatedAtMs = new Date(project.updatedAt).getTime();

  const menu = (
    <div className="flex shrink-0 items-center gap-0.5" data-stop-propagation>
      {size !== "compact" ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={project.pinned ? "Unpin project" : "Pin project"}
          disabled={pinMutation.isPending}
          onClick={() =>
            pinMutation.mutate({ path: project.path, pinned: !project.pinned })
          }
          // Phone-width mosaic cells are too narrow for a name AND a pin
          // toggle; pinning stays available in the actions menu.
          className="max-sm:hidden"
        >
          {project.pinned ? (
            <PinOff className="size-3.5" />
          ) : (
            <Pin className="size-3.5 text-muted-foreground/60" />
          )}
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label="Actions" />}
        >
          <MoreHorizontal className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem
            onClick={() =>
              pinMutation.mutate({ path: project.path, pinned: !project.pinned })
            }
          >
            {project.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
            {project.pinned ? "Unpin" : "Pin to mosaic"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openIn("editor")}>
            <Folder className="size-3.5" /> Open in editor
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openIn("terminal")}>
            <TerminalIcon className="size-3.5" /> Open terminal
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openIn("folder")}>
            <Folder className="size-3.5" /> Reveal in file manager
          </DropdownMenuItem>
          {project.git.remote ? (
            <DropdownMenuItem
              onClick={() => window.open(project.git.remote?.links.web, "_blank")}
            >
              <ExternalLink className="size-3.5" /> Open repo
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={copyPath}>
            <Copy className="size-3.5" /> Copy path
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => hideMutation.mutate({ path: project.path, hidden: true })}
            className="text-destructive"
          >
            <EyeOff className="size-3.5" /> Hide from list
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const shared = {
    action: true,
    pinned: project.pinned,
    role: "button" as const,
    tabIndex: 0,
    "aria-label": `Open ${project.name}`,
    onClick: (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-stop-propagation]")) return;
      open();
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
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
        <StackIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn("truncate font-semibold tracking-tight", nameClass)}
            title={project.name}
          >
            {project.name}
          </span>
          {project.stack ? (
            <span className="hidden shrink-0 rounded-full border border-border bg-white/[0.03] px-2 py-px text-[0.62rem] font-medium text-muted-foreground sm:inline">
              {project.stack.label}
            </span>
          ) : null}
        </div>
      </div>
      {menu}
    </div>
  );

  const dim = size === "compact" && now - updatedAtMs > 120 * 24 * 60 * 60 * 1000;

  if (size === "compact") {
    return (
      <BentoTile
        {...shared}
        className={cn(
          "flex flex-col gap-1.5 p-3",
          dim && "opacity-60 hover:opacity-100",
        )}
      >
        <div className="flex items-center justify-between gap-1">
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-lg border border-border bg-white/[0.04] text-muted-foreground"
          >
            <StackIcon className="size-3" />
          </span>
          {menu}
        </div>
        <span
          className="line-clamp-2 text-[0.78rem] leading-tight font-semibold tracking-tight"
          title={project.name}
        >
          {project.name}
        </span>
        <div className="mt-auto flex items-center justify-between gap-1.5">
          <RecencyRing
            updatedAtMs={updatedAtMs}
            score={placement.score}
            tier={size}
            now={now}
            px={26}
          />
          <AlertIcons alerts={project.alerts} />
        </div>
      </BentoTile>
    );
  }

  if (size === "medium") {
    return (
      <BentoTile {...shared} className="flex flex-col gap-2 p-3.5">
        {header("size-7", "text-[0.84rem]")}
        <TileStatLine report={report} project={project} />
        <div className="mt-auto flex items-center justify-between gap-2">
          <GitGlyphs git={project.git} />
          <span className="flex shrink-0 items-center gap-2">
            <AlertIcons alerts={project.alerts} />
            <RecencyRing
              updatedAtMs={updatedAtMs}
              score={placement.score}
              tier={size}
              now={now}
              px={30}
            />
          </span>
        </div>
      </BentoTile>
    );
  }

  if (size === "large") {
    return (
      <BentoTile {...shared} className="flex flex-col gap-3 p-4">
        {header("size-8", "text-[0.92rem]")}
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-1">
          <LastCommitLine project={project} />
          <TileStatLine report={report} project={project} />
        </div>
        <div className="flex items-end justify-between gap-2">
          <GitGlyphs git={project.git} large />
          <span className="flex shrink-0 items-center gap-2">
            <AlertIcons alerts={project.alerts} />
            <RecencyRing
              updatedAtMs={updatedAtMs}
              score={placement.score}
              tier={size}
              now={now}
              px={36}
            />
          </span>
        </div>
      </BentoTile>
    );
  }

  if (size === "feature") {
    return (
      <BentoTile {...shared} className="flex flex-col gap-3 p-4">
        {header("size-8", "text-[0.94rem]")}
        <div className="flex min-h-0 flex-1 flex-col">
          {report ? (
            <DataCarousel
              ariaLabel={`${project.name} stats`}
              autoMs={7000}
              seed={project.path}
              className="min-h-0 flex-1"
              cards={[
                {
                  label: "graph",
                  content: (
                    <div className="flex min-h-0 flex-1 flex-col justify-center gap-1.5">
                      <CadenceArea cadence={report.cadence} />
                      <p className="font-mono text-[0.62rem] text-muted-foreground">
                        commits / month · {formatCompact(report.totalCommits)} total
                      </p>
                    </div>
                  ),
                },
                {
                  label: "table",
                  content: (
                    <dl className="grid grid-cols-2 content-center gap-x-5 gap-y-2">
                      <TileStat icon={GitCommitHorizontal} label="commits" value={formatCompact(report.totalCommits)} />
                      <TileStat icon={Users} label="contrib." value={String(report.contributors)} />
                      <TileStat icon={BrainCircuit} label="AI cost" value={formatCost(report.aiUsage?.cost ?? 0)} accent />
                      <TileStat icon={null} label="tokens" value={formatCompact(report.aiUsage?.tokens.total ?? 0)} />
                      <TileStat icon={null} label="languages" value={String(report.languages.length)} />
                      <TileStat icon={null} label="signals" value={String(report.alerts.length)} />
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
            <RecencyRing
              updatedAtMs={updatedAtMs}
              score={placement.score}
              tier={size}
              now={now}
              px={38}
            />
          </span>
        </div>
      </BentoTile>
    );
  }

  // hero — 3×3: the working set, with the tabbed snitch digest.
  return (
    <HeroTile
      shared={shared}
      project={project}
      report={report}
      reportStale={reportStale}
      placement={placement}
      now={now}
      header={header}
    />
  );
}

/* ------------------------------------------------------------- hero tile */

function HeroTile({
  shared,
  project,
  report,
  reportStale,
  placement,
  now,
  header,
}: {
  shared: Record<string, unknown>;
  project: ProjectTileProps["project"];
  report?: ReportExportProject;
  reportStale: boolean;
  placement: MosaicPlacement;
  now: number;
  header: (iconSize: string, nameClass: string) => React.ReactNode;
}) {
  const updatedAtMs = new Date(project.updatedAt).getTime();

  return (
    <BentoTile {...shared} className="flex flex-col gap-2.5 p-4">
      {header("size-9", "text-base")}

      {project.note ? (
        <p className="line-clamp-1 text-xs text-muted-foreground" title={project.note}>
          {project.note}
        </p>
      ) : null}

      {report ? (
        <>
          <div className="flex shrink-0 items-center gap-1" data-stop-propagation>
            <span className="ml-auto font-mono text-[0.6rem] text-muted-foreground">
              {formatCompact(report.totalCommits)} commits ·{" "}
              {report.contributors} contrib.
              {report.aiUsage ? ` · AI ${formatCost(report.aiUsage.cost)}` : ""}
            </span>
            {reportStale ? (
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
            className="min-h-0 flex-1"
            cards={[
              {
                label: "activity",
                content: (
                  <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                    <CadenceArea cadence={report.cadence} />
                    <p className="font-mono text-[0.62rem] text-muted-foreground">
                      commits / month · {report.totalCommits} total · last{" "}
                      {relativeTime(report.lastCommit?.date ?? null)}
                    </p>
                  </div>
                ),
              },
              {
                label: "quality",
                content: <HeroQuality report={report} />,
              },
              {
                label: "ai",
                content: <HeroAi report={report} />,
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
          <RecencyRing
            updatedAtMs={updatedAtMs}
            score={placement.score}
            tier={placement.tier}
            now={now}
            px={44}
          />
        </span>
      </div>
    </BentoTile>
  );
}

function HeroQuality({ report }: { report: ReportExportProject }) {
  if (report.alerts.length === 0) {
    return <TileEmpty>No quality signals flagged in this report.</TileEmpty>;
  }
  return (
    <ul className="flex h-full min-h-0 flex-col gap-1.5 overflow-y-auto pr-0.5">
      {report.alerts.map((alert) => (
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

function HeroAi({ report }: { report: ReportExportProject }) {
  const usage = report.aiUsage;
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

/* ------------------------------------------------------------ fragments */

function TileStatLine({
  report,
  project,
}: {
  report?: ReportExportProject;
  project: ProjectTileProps["project"];
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
  project: ProjectTileProps["project"];
  detailed?: boolean;
}) {
  const lastCommit = project.git.lastCommit;
  if (!lastCommit) {
    return (
      <p className={detailed ? "text-sm text-muted-foreground" : "line-clamp-1 text-xs text-muted-foreground"}>
        {project.git.isRepo ? "No commits yet." : "Not a git repository."}
      </p>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="b-label">last commit</p>
      <p
        className={cn(detailed ? "line-clamp-2 text-sm leading-snug" : "line-clamp-1 text-[0.8rem] leading-snug")}
        title={lastCommit.message}
      >
        {lastCommit.message}
      </p>
      <p className="font-mono text-[0.66rem] text-muted-foreground">
        {lastCommit.author}
        {project.git.branch ? ` · ${project.git.branch}` : ""} ·{" "}
        {relativeTime(lastCommit.date)}
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
      <dd
        className="b-num shrink-0 text-sm"
        style={accent ? { color: "var(--bento-c4)" } : undefined}
      >
        {value}
      </dd>
    </div>
  );
}

function TileEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border px-3 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}
