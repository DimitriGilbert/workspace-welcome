/**
 * Meadow's recency tile, placed by the shared bento algorithm
 * (computeMosaicLayout): explicit grid placement, five tiers — hero 3×3,
 * feature 2×3, large 2×2, medium 2×1, compact 1×1 — so tile AREA is the
 * log-scaled set-relative recency. The warm front eats snitch report data:
 * the hero carries a tabbed mini panel (Activity graph / Facts table), the
 * feature surfaces headline numerals; fetches are lazy (only the front
 * tiles ask) and cached by react-query, so a hero tile and the project
 * page share one request.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  EyeOff,
  Folder,
  MoreHorizontal,
  PenLine,
  Pin,
  PinOff,
  Terminal,
} from "lucide-react";
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
import type { MosaicPlacement } from "@/lib/mosaic-layout";
import type { Project } from "@workspace-welcome/api/lib/types";

import { AlertDots, Chip, chipStyle } from "@/components/designs/meadow/bits";
import { CadenceArea } from "@/components/designs/meadow/charts";
import { compactAge } from "@/components/designs/meadow/derive";
import { useOpenMeadowProject } from "@/components/designs/meadow/open";
import {
  formatCost,
  formatTokens,
  useReportJson,
} from "@/components/designs/meadow/report-data";
import { toReportView } from "@/components/designs/meadow/report-data";
import { useTRPC } from "@/utils/trpc";
import { dateTooltip } from "@/lib/format";
import { hostLabel, stackIcon } from "@/lib/icons";
import { freshness, tierFromFreshness } from "@/lib/recency";

interface ProjectTileProps {
  project: Project;
  placement: MosaicPlacement;
}

const NUMERAL_CLASS: Record<string, string> = {
  hero: "text-[2.6rem]",
  feature: "text-4xl",
  large: "text-4xl",
  medium: "text-2xl",
  compact: "text-lg",
};

export function ProjectTile({ project, placement }: ProjectTileProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const openProject = useOpenMeadowProject();
  const reducedMotion = useReducedMotion();

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

  const openWith = (target: "editor" | "terminal" | "folder") => {
    openMutation.mutate({ path: project.path, target });
  };

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(project.path);
      toast.success("Path copied");
    } catch {
      toast.error("Couldn't copy path");
    }
  };

  const StackIcon = stackIcon(project.stack?.id);
  const tier = tierFromFreshness(
    freshness(project.updatedAt, project.lastOpenedAt),
  );
  const expanded = placement.tier === "hero" || placement.tier === "feature";

  // Only the warm front fetches report data — lazy, cached, shared with the
  // project page's identical query.
  const report = useReportJson(
    { kind: "repo", path: project.path },
    expanded,
  );
  const view =
    report.data !== null
      ? toReportView(report.data, [project.updatedAt])
      : null;

  const tileBackground = project.pinned
    ? "color-mix(in oklch, var(--pinned-accent) 4%, var(--card))"
    : tier === "fresh"
      ? "color-mix(in oklch, var(--recency-fresh) 4%, var(--card))"
      : undefined;

  const numeral = (
    <p
      className={cn(
        "leading-none font-semibold tracking-tight text-foreground",
        NUMERAL_CLASS[placement.tier] ?? "text-2xl",
      )}
      title={dateTooltip(project.updatedAt)}
    >
      {compactAge(project.updatedAt)}
    </p>
  );

  const gitChips = placement.tier !== "compact" && placement.tier !== "medium" ? (
    <div className="flex min-h-5 flex-wrap items-center gap-1.5">
      {!project.git.isRepo ? (
        <Chip tone="quiet" title="This directory is not a git repository">
          not a repo
        </Chip>
      ) : (
        <>
          {(project.git.ahead ?? 0) > 0 ? (
            <Chip
              tone="green"
              title={`${project.git.ahead} commits ahead of upstream`}
            >
              <ArrowUp aria-hidden className="size-3" />
              {project.git.ahead}
            </Chip>
          ) : null}
          {(project.git.behind ?? 0) > 0 ? (
            <Chip
              tone="honey"
              title={`${project.git.behind} commits behind upstream`}
            >
              <ArrowDown aria-hidden className="size-3" />
              {project.git.behind}
            </Chip>
          ) : null}
          {(project.git.dirtyCount ?? 0) > 0 ? (
            <Chip
              tone="sky"
              title={`${project.git.dirtyCount} uncommitted files`}
            >
              <PenLine aria-hidden className="size-3" />
              {project.git.dirtyCount}
            </Chip>
          ) : null}
          {project.git.remote && placement.tier === "hero" ? (
            <Chip tone="quiet" title="Git host">
              {hostLabel(project.git.remote.host)}
            </Chip>
          ) : null}
        </>
      )}
    </div>
  ) : null;

  const header = (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:text-foreground"
      >
        <StackIcon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate font-semibold tracking-tight text-foreground",
            expanded ? "text-sm" : "text-sm",
          )}
        >
          {project.name}
        </p>
        {placement.tier !== "compact" ? (
          <p className="truncate text-[11px] text-muted-foreground">
            {project.git.isRepo && project.git.branch
              ? project.git.branch
              : (project.stack?.label ?? project.path)}
          </p>
        ) : null}
      </div>
      {project.pinned ? (
        <Pin
          aria-hidden
          className="size-3.5 shrink-0"
          style={{ color: "var(--pinned-accent)" }}
        />
      ) : null}
      {placement.tier !== "compact" ? (
        <div
          data-stop-propagation
          className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        >
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={project.pinned ? "Unpin project" : "Pin project"}
            disabled={pinMutation.isPending}
            onClick={() =>
              pinMutation.mutate({
                path: project.path,
                pinned: !project.pinned,
              })
            }
          >
            {project.pinned ? (
              <PinOff className="size-3.5" />
            ) : (
              <Pin className="size-3.5" />
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Actions" />
              }
            >
              <MoreHorizontal className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem onClick={() => openWith("editor")}>
                <Folder className="size-3.5" /> Open in editor
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openWith("terminal")}>
                <Terminal className="size-3.5" /> Open terminal
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openWith("folder")}>
                <Folder className="size-3.5" /> Reveal in file manager
              </DropdownMenuItem>
              {project.git.remote ? (
                <DropdownMenuItem
                  onClick={() =>
                    window.open(project.git.remote?.links.web, "_blank")
                  }
                >
                  <ExternalLink className="size-3.5" /> Open repo
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={copyPath}>
                <Copy className="size-3.5" /> Copy path
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  hideMutation.mutate({ path: project.path, hidden: true })
                }
                className="text-destructive"
              >
                <EyeOff className="size-3.5" /> Hide from list
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </div>
  );

  return (
    <motion.article
      layout={reducedMotion ? false : true}
      transition={{ type: "spring", stiffness: 320, damping: 34, mass: 0.9 }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${project.name}`}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("[data-stop-propagation]")) return;
        openProject(project.path);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") openProject(project.path);
      }}
      className={cn(
        "meadow-panel meadow-lift meadow-focus group relative flex cursor-pointer select-none flex-col",
        placement.tier === "medium"
          ? "flex-row items-center gap-3 overflow-hidden px-4 py-3"
          : placement.tier === "compact"
            ? "gap-1 overflow-hidden p-2.5"
            : "gap-3 overflow-hidden p-4",
        tier === "cold" && "opacity-85",
      )}
      style={{
        background: tileBackground,
        gridColumn: `${placement.x + 1} / span ${placement.cols}`,
        gridRow: `${placement.y + 1} / span ${placement.rows}`,
      }}
    >
      {placement.tier === "medium" ? (
        <>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:text-foreground"
              >
                <StackIcon className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold tracking-tight text-foreground">
                  {project.name}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {project.git.isRepo && project.git.branch
                    ? project.git.branch
                    : (project.stack?.label ?? project.path)}
                </p>
              </div>
              {project.pinned ? (
                <Pin
                  aria-hidden
                  className="size-3.5 shrink-0"
                  style={{ color: "var(--pinned-accent)" }}
                />
              ) : null}
            </div>
          </div>
          <span data-stop-propagation>
            <AlertDots alerts={project.alerts} />
          </span>
          <div className="flex shrink-0 items-baseline gap-1.5">
            {numeral}
            <span className="text-[10px] text-muted-foreground">ago</span>
          </div>
        </>
      ) : placement.tier === "compact" ? (
        <>
          <p
            className="truncate text-xs font-semibold tracking-tight text-foreground"
            title={project.name}
          >
            {project.name}
          </p>
          <p
            className={cn(
              "leading-none font-semibold tracking-tight text-foreground",
              NUMERAL_CLASS[placement.tier] ?? "text-lg",
            )}
            title={dateTooltip(project.updatedAt)}
          >
            {compactAge(project.updatedAt)}
          </p>
        </>
      ) : placement.tier === "hero" ? (
        <HeroTileBody
          project={project}
          numeral={numeral}
          header={header}
          gitChips={gitChips}
          score={placement.score}
          view={view}
          reportPending={report.pending}
        />
      ) : placement.tier === "feature" ? (
        <>
          {header}
          <div className="flex items-end justify-between gap-2">
            <div>
              {numeral}
              <p className="mt-1 text-[11px] text-muted-foreground">
                last touch
              </p>
            </div>
            <span data-stop-propagation className="flex items-center gap-2">
              <AlertDots alerts={project.alerts} />
              <ScoreChip score={placement.score} />
            </span>
          </div>
          {view !== null && view.cadence.length > 0 ? (
            <div className="meadow-soft-block flex min-h-0 flex-1 flex-col rounded-2xl p-2">
              <CadenceArea
                data={view.cadence}
                maxPeriods={12}
                className="h-full min-h-12 flex-1"
                label={`${project.name}: commits per period`}
              />
            </div>
          ) : (
            <ReportNumerals view={view} pending={report.pending} />
          )}
          {view !== null && view.cadence.length > 0 ? (
            <ReportNumerals view={view} pending={report.pending} />
          ) : null}
          {gitChips}
        </>
      ) : (
        <>
          {header}
          <div className="flex items-end justify-between gap-2">
            <div>
              {numeral}
              <p className="mt-1 text-[11px] text-muted-foreground">
                last touch
              </p>
            </div>
            <span data-stop-propagation>
              <AlertDots alerts={project.alerts} />
            </span>
          </div>
          {view !== null && view.cadence.length > 0 ? (
            <div className="min-h-10 flex-1">
              <CadenceArea
                data={view.cadence}
                maxPeriods={12}
                className="h-full min-h-10"
                label={`${project.name}: commits per period`}
              />
            </div>
          ) : project.git.lastCommit ? (
            <p
              className="line-clamp-2 min-h-10 text-[11px] leading-relaxed text-muted-foreground"
              title={project.git.lastCommit.message}
            >
              <span className="font-medium">{project.git.lastCommit.author}</span>{" "}
              {project.git.lastCommit.message}
            </p>
          ) : null}
          {gitChips}
        </>
      )}
    </motion.article>
  );
}

/** Soft readout of the placement's log-scaled freshness — content, not a dial. */
function ScoreChip({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2 pl-1.5 text-[10px] font-medium tabular-nums"
      style={chipStyle("green")}
      title="Freshness within the workspace (log-scaled, from the shared mosaic layout)"
    >
      <span aria-hidden className="flex flex-col gap-0.5">
        <span
          className="h-1 w-8 rounded-full"
          style={{
            background:
              "color-mix(in oklch, var(--recency-fresh) 22%, var(--muted))",
          }}
        >
          <span
            className="block h-full rounded-full"
            style={{ width: `${pct}%`, background: "var(--recency-fresh)" }}
          />
        </span>
      </span>
      {pct}% fresh
    </span>
  );
}

/** The hero's tabbed mini report panel: Activity graph / Facts table. */
function HeroTileBody({
  project,
  numeral,
  header,
  gitChips,
  score,
  view,
  reportPending,
}: {
  project: Project;
  numeral: React.ReactNode;
  header: React.ReactNode;
  gitChips: React.ReactNode;
  score: number;
  view: ReturnType<typeof toReportView> | null;
  reportPending: boolean;
}) {
  const [tab, setTab] = useState<"activity" | "facts">("activity");
  return (
    <>
      {header}
      <div className="flex items-end justify-between gap-2">
        <div>
          {numeral}
          <p className="mt-1 text-[11px] text-muted-foreground">last touch</p>
        </div>
        <ScoreChip score={score} />
      </div>

      <div className="meadow-soft-block flex min-h-0 flex-1 flex-col gap-2 rounded-2xl p-2.5">
        <div
          role="tablist"
          aria-label={`${project.name} report`}
          className="flex items-center gap-1"
        >
          {(
            [
              { id: "activity", label: "Activity" },
              { id: "facts", label: "Facts" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`meadow-focus rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                tab === t.id
                  ? "meadow-tab-active"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
          <span data-stop-propagation className="ml-auto">
            <AlertDots alerts={project.alerts} />
          </span>
        </div>

        {tab === "activity" ? (
          view !== null ? (
            view.cadence.length === 0 ? (
              <MiniEmpty>No commits charted yet.</MiniEmpty>
            ) : (
              <CadenceArea
                data={view.cadence}
                maxPeriods={12}
                className="h-full min-h-12 flex-1"
                label={`${project.name}: commits per period`}
              />
            )
          ) : (
            <MiniEmpty>
              {reportPending ? "Reading the report…" : "No report yet — generate one from the project page."}
            </MiniEmpty>
          )
        ) : view !== null ? (
          <FactsTable view={view} />
        ) : (
          <MiniEmpty>
            {reportPending ? "Reading the report…" : "No report yet — generate one from the project page."}
          </MiniEmpty>
        )}
      </div>

      {gitChips}
    </>
  );
}

function FactsTable({
  view,
}: {
  view: ReturnType<typeof toReportView>;
}) {
  const topAlert = view.alerts[0];
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "commits", value: view.totals.commits.toLocaleString() },
    { label: "contributors", value: view.totals.contributors },
    ...(topAlert
      ? [
          {
            label: "top alert",
            value: (
              <span className="inline-flex items-center gap-1">
                <span
                  aria-hidden
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: severityColor(topAlert.severity) }}
                />
                {topAlert.label} · {topAlert.value}
              </span>
            ),
          },
        ]
      : [{ label: "alerts", value: "none" as string }]),
    ...(view.aiUsage
      ? [
          {
            label: "AI cost",
            value: (
              <span>
                {formatCost(view.aiUsage.cost)}
                <span className="ml-1 text-muted-foreground">recorded</span>
              </span>
            ),
          },
          {
            label: "AI tokens",
            value: formatTokens(view.aiUsage.tokens.total),
          },
        ]
      : []),
  ];

  return (
    <dl className="flex flex-col gap-1 overflow-y-auto">
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex items-baseline justify-between gap-2 text-[11px]"
        >
          <dt className="shrink-0 text-muted-foreground">{r.label}</dt>
          <dd className="min-w-0 truncate text-right font-medium text-foreground">
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function severityColor(severity: "info" | "warning" | "critical"): string {
  switch (severity) {
    case "critical":
      return "var(--sev-critical)";
    case "warning":
      return "var(--sev-warning)";
    default:
      return "var(--sev-info)";
  }
}

/** Feature-tier headline numerals from the report: commits, people, cost. */
function ReportNumerals({
  view,
  pending,
}: {
  view: ReturnType<typeof toReportView> | null;
  pending: boolean;
}) {
  if (view === null) {
    return (
      <p className="text-[10px] text-muted-foreground">
        {pending ? "Reading the report…" : "No report yet"}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <span className="text-[11px] text-muted-foreground">
        <span className="text-xs font-semibold tabular-nums text-foreground">
          {view.totals.commits.toLocaleString()}
        </span>{" "}
        commits
      </span>
      <span className="text-[11px] text-muted-foreground">
        <span className="text-xs font-semibold tabular-nums text-foreground">
          {view.totals.contributors}
        </span>{" "}
        {view.totals.contributors === 1 ? "contributor" : "contributors"}
      </span>
      {view.aiUsage ? (
        <span className="text-[11px] text-muted-foreground">
          <span
            className="text-xs font-semibold tabular-nums"
            style={{ color: "var(--pinned-accent)" }}
          >
            {formatCost(view.aiUsage.cost)}
          </span>{" "}
          AI cost
        </span>
      ) : null}
    </div>
  );
}

function MiniEmpty({ children }: { children: string }) {
  return (
    <p className="flex flex-1 items-center justify-center rounded-xl px-2 py-3 text-center text-[10px] leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}
