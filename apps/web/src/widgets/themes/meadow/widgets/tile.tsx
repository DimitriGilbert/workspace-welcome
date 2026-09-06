/**
 * Meadow's recency tile, ported verbatim from
 * `components/designs/meadow/tile.tsx` into the theme namespace (owner
 * correction: theme widgets carry the prototype's presentation). Tile AREA
 * is the log-scaled set-relative recency: the flow's ladder rung maps
 * 1:1 onto the design's tiers — 3x3 hero, 2x3 feature, 2x2 large, 2x1
 * medium, 1x1 compact — and the warm front eats the scan report's data:
 * the hero carries a tabbed mini panel (Activity graph / Facts table), the
 * feature surfaces headline numerals. Report reads ride the page's report
 * context (`entry(path)`), so a hero tile and the workspace report share
 * one fetch.
 *
 * Divergence from the design, data-path only: pin/hide/open mutations are
 * the runtime's context surface (not reachable from theme kinds), so the
 * hover action cluster is omitted and the pinned state renders as the
 * design's honey pin indicator.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDown, ArrowUp, PenLine, Pin } from "lucide-react";

import type { ReportExportProject } from "@workspace-welcome/api/lib/report-export";
import type { HealthAlert } from "@workspace-welcome/api/lib/types";

import { AlertDots, Chip, chipStyle, SoftNumber } from "./bits";
import { CadenceArea } from "./bits";
import { ageMs, dateTooltip, formatCost, formatTokens } from "@/lib/format";
import { hostLabel, stackIcon } from "@/lib/icons";
import { freshness, tierFromFreshness } from "@/lib/recency";
import { useReport } from "@/widgets/contexts/report-context";
import { useWorkspace } from "@/widgets/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

const NUMERAL_CLASS: Record<string, string> = {
  hero: "text-[2.6rem]",
  feature: "text-4xl",
  large: "text-4xl",
  medium: "text-2xl",
  compact: "text-lg",
};

/** Design tier from the placement footprint (the flow's ladder rung). */
function tierOf(cols: number, rows: number): string {
  if (cols === 3 && rows === 3) return "hero";
  if (cols === 2 && rows === 3) return "feature";
  if (cols === 2 && rows === 2) return "large";
  if (cols === 2 && rows === 1) return "medium";
  return "compact";
}

/** The tile's slice of the scan report entry — numerals + cadence only. */
interface TileReport {
  cadence: ReportExportProject["cadence"];
  commits: number;
  contributors: number;
  aiUsage: ReportExportProject["aiUsage"];
  topAlert: ReportExportProject["alerts"][number] | null;
}

export function MeadowProjectTile({ node, size }: RegisteredWidgetProps) {
  const workspace = useWorkspace();
  const report = useReport();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();

  const pathProp = node.props?.["path"];
  const scoreProp = node.props?.["score"];
  const path = typeof pathProp === "string" ? pathProp : undefined;
  const score = typeof scoreProp === "number" ? scoreProp : 0;

  const project =
    path === undefined
      ? null
      : (workspace.projects.find((p) => p.path === path) ?? null);

  const openProject = (target: string) => {
    void navigate({
      to: "/app/$theme/project/$",
      params: { theme: "meadow", _splat: target.replace(/^\/+/, "") },
    });
  };

  if (project === null) {
    // Loading scan or unbound instance (e.g. the lab ladder catalog): an
    // honest, box-filling empty state — never fake content.
    return (
      <div
        data-slot="meadow-tile-empty"
        className="flex h-full min-h-0 w-full items-center justify-center px-3"
      >
        <p className="truncate text-xs text-muted-foreground">
          {workspace.scanState === "loading"
            ? "Waiting for the workspace scan…"
            : path === undefined
              ? "No project bound — flow tiles render here with a bound path."
              : "Project not in the current scan."}
        </p>
      </div>
    );
  }

  const tier = tierOf(size.cols, size.rows);
  const expanded = tier === "hero" || tier === "feature";
  const entry = expanded ? report.entry(project.path) : null;
  const tileReport: TileReport | null =
    entry === null
      ? null
      : {
          cadence: entry.cadence,
          commits: entry.totalCommits,
          contributors: entry.contributors,
          aiUsage: entry.aiUsage,
          topAlert: entry.alerts[0] ?? null,
        };
  const reportPending = expanded && report.status === "loading";

  const tileBackground = project.pinned
    ? "color-mix(in oklch, var(--pinned-accent) 4%, var(--card))"
    : tierFromFreshness(freshness(project.updatedAt, project.lastOpenedAt, workspace.now)) === "fresh"
      ? "color-mix(in oklch, var(--recency-fresh) 4%, var(--card))"
      : undefined;

  const numeral = (
    <p
      className={`leading-none font-semibold tracking-tight text-foreground ${NUMERAL_CLASS[tier] ?? "text-2xl"}`}
      title={dateTooltip(project.updatedAt)}
    >
      {ageMs(project.updatedAt, workspace.now)}
    </p>
  );

  const gitChips =
    tier !== "compact" && tier !== "medium" ? (
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
            {project.git.remote && tier === "hero" ? (
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
        {(() => {
          const StackIcon = stackIcon(project.stack?.id);
          return <StackIcon className="size-3.5" />;
        })()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold tracking-tight text-foreground">
          {project.name}
        </p>
        {tier !== "compact" ? (
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
    </div>
  );

  const body =
    tier === "medium" ? (
      <div className="flex h-full w-full min-w-0 flex-row items-center gap-3 overflow-hidden px-4 py-3">
        <div className="min-w-0 flex-1">{header}</div>
        <AlertDots alerts={project.alerts} />
        <div className="flex shrink-0 items-baseline gap-1.5">
          {numeral}
          <span className="text-[10px] text-muted-foreground">ago</span>
        </div>
      </div>
    ) : tier === "compact" ? (
      <div className="flex h-full w-full flex-col gap-1 overflow-hidden p-2.5">
        <p
          className="truncate text-xs font-semibold tracking-tight text-foreground"
          title={project.name}
        >
          {project.name}
        </p>
        <p
          className={`leading-none font-semibold tracking-tight text-foreground ${NUMERAL_CLASS[tier] ?? "text-lg"}`}
          title={dateTooltip(project.updatedAt)}
        >
          {ageMs(project.updatedAt, workspace.now)}
        </p>
      </div>
    ) : tier === "hero" ? (
      <HeroTileBody
        project={project}
        numeral={numeral}
        header={header}
        gitChips={gitChips}
        score={score}
        view={tileReport}
        reportPending={reportPending}
      />
    ) : tier === "feature" ? (
      <>
        {header}
        <div className="flex items-end justify-between gap-2">
          <div>
            {numeral}
            <p className="mt-1 text-[11px] text-muted-foreground">last touch</p>
          </div>
          <span className="flex items-center gap-2">
            <AlertDots alerts={project.alerts} />
            <ScoreChip score={score} />
          </span>
        </div>
        {tileReport !== null && tileReport.cadence.length > 0 ? (
          <div className="meadow-soft-block flex min-h-0 flex-1 flex-col rounded-2xl p-2">
            <CadenceArea
              data={tileReport.cadence}
              maxPeriods={12}
              className="h-full min-h-12 flex-1"
              label={`${project.name}: commits per period`}
            />
          </div>
        ) : (
          <ReportNumerals view={tileReport} pending={reportPending} />
        )}
        {tileReport !== null && tileReport.cadence.length > 0 ? (
          <ReportNumerals view={tileReport} pending={reportPending} />
        ) : null}
        {gitChips}
      </>
    ) : (
      <>
        {header}
        <div className="flex items-end justify-between gap-2">
          <div>
            {numeral}
            <p className="mt-1 text-[11px] text-muted-foreground">last touch</p>
          </div>
          <AlertDots alerts={project.alerts} />
        </div>
        {tileReport !== null && tileReport.cadence.length > 0 ? (
          <div className="min-h-10 flex-1">
            <CadenceArea
              data={tileReport.cadence}
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
    );

  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
    >
      <motion.article
        layout={reducedMotion ? false : true}
        transition={{ type: "spring", stiffness: 320, damping: 34, mass: 0.9 }}
        role="button"
        tabIndex={0}
        aria-label={`Open ${project.name}`}
        onClick={() => openProject(project.path)}
        onKeyDown={(e) => {
          if (e.key === "Enter") openProject(project.path);
        }}
        className={`meadow-panel meadow-lift meadow-focus group relative flex h-full w-full cursor-pointer select-none flex-col overflow-hidden ${
          tier === "medium"
            ? "flex-row items-center gap-3 px-4 py-3"
            : tier === "compact"
              ? "gap-1 p-2.5"
              : "gap-3 p-4"
        } ${tierFromFreshness(freshness(project.updatedAt, project.lastOpenedAt, workspace.now)) === "cold" ? "opacity-85" : ""}`}
        style={{ background: tileBackground }}
      >
        {body}
      </motion.article>
    </WidgetShell>
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
  project: { name: string; alerts: HealthAlert[] };
  numeral: ReactNode;
  header: ReactNode;
  gitChips: ReactNode;
  score: number;
  view: TileReport | null;
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
              onClick={(e) => {
                e.stopPropagation();
                setTab(t.id);
              }}
              className={`meadow-focus rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                tab === t.id
                  ? "meadow-tab-active"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
          <span className="ml-auto">
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

function FactsTable({ view }: { view: TileReport }) {
  const topAlert = view.topAlert;
  const rows: { label: string; value: ReactNode }[] = [
    { label: "commits", value: view.commits.toLocaleString() },
    { label: "contributors", value: view.contributors },
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
    <dl className="flex flex-col gap-1">
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
  view: TileReport | null;
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
        <SoftNumber
          value={view.commits.toLocaleString()}
          className="text-xs font-semibold tabular-nums text-foreground"
        />{" "}
        commits
      </span>
      <span className="text-[11px] text-muted-foreground">
        <SoftNumber
          value={view.contributors}
          className="text-xs font-semibold tabular-nums text-foreground"
        />{" "}
        {view.contributors === 1 ? "contributor" : "contributors"}
      </span>
      {view.aiUsage ? (
        <span className="text-[11px] text-muted-foreground">
          <SoftNumber
            value={formatCost(view.aiUsage.cost)}
            className="text-xs font-semibold tabular-nums"
            style={{ color: "var(--pinned-accent)" }}
          />{" "}
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

