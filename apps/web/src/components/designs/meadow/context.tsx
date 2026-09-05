/**
 * The context panel — the resurrected right rail, now a resizable panel
 * instead of a fixed column. Vertical stack of the workspace digests:
 * the tabbed snitch report on top, then momentum, rhythm, stacks, and
 * directories, closing with the concept footer. Every widget is slim and
 * self-contained so the panel can be dragged narrow without breaking.
 */

import { Link } from "@tanstack/react-router";
import { Activity, ArrowRight, Folder, Layers, Waves } from "lucide-react";

import type { Root } from "@workspace-welcome/api/lib/types";

import { SoftNumber, chipStyle } from "@/components/designs/meadow/bits";
import { AreaTrend } from "@/components/designs/meadow/charts";
import type {
  FreshnessCounts,
  StackSlice,
} from "@/components/designs/meadow/derive";
import { pathBasename } from "@/components/designs/meadow/derive";
import { MeadowReport } from "@/components/designs/meadow/report";
import { stackIcon } from "@/lib/icons";

export interface ContextPanelSummary {
  activity: number[];
  touchedThisWeek: number;
  freshness: FreshnessCounts;
  stacks: StackSlice[];
  roots: Root[];
  projectsPerRoot: Map<string, number>;
  rootErrors: { rootId: string; path: string; message: string }[];
}

export interface ContextPanelProps {
  summary: ContextPanelSummary;
  /** Workspace report scope (the first registered root). */
  reportPath: string;
  /** updatedAt timestamps of the scanned projects — the staleness input. */
  reportUpdatedAts: readonly string[];
  /**
   * true inside the resizable panel (fills the panel height and scrolls
   * internally); false in the stacked phone layout (natural height, the
   * page's own main scrolls).
   */
  fill?: boolean;
}

export function ContextPanel({
  summary,
  reportPath,
  reportUpdatedAts,
  fill = true,
}: ContextPanelProps) {
  return (
    <div
      className={
        fill
          ? "meadow-context meadow-scroll flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3"
          : "flex flex-col gap-3 pt-1"
      }
    >
      {reportPath ? (
        <MeadowReport
          scope={{ kind: "scan", path: reportPath }}
          title="Workspace report"
          updatedAts={reportUpdatedAts}
        />
      ) : null}

      <MomentumCard
        activity={summary.activity}
        touchedThisWeek={summary.touchedThisWeek}
      />
      <RhythmCard freshness={summary.freshness} />
      <StacksCard stacks={summary.stacks} />
      <DirectoriesCard
        roots={summary.roots}
        projectsPerRoot={summary.projectsPerRoot}
        rootErrors={summary.rootErrors}
      />

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
        <p className="text-[10px] text-muted-foreground">
          Meadow — daylight. Tile size follows recency.
        </p>
        <Link
          to="/designs"
          className="meadow-focus group inline-flex items-center gap-1 rounded-full text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          All concepts
          <ArrowRight
            aria-hidden
            className="size-3 transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      </footer>
    </div>
  );
}

/** Card shell shared by every context widget — reused by the project page. */
export function ContextCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Activity;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="meadow-panel flex flex-col gap-2 p-3.5"
    >
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-tight text-muted-foreground">
        <Icon aria-hidden className="size-3.5" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function MomentumCard({
  activity,
  touchedThisWeek,
}: {
  activity: number[];
  touchedThisWeek: number;
}) {
  const total = activity.reduce((sum, v) => sum + v, 0);
  return (
    <MomentumCardBase
      activity={activity}
      touchedThisWeek={touchedThisWeek}
      total={total}
    />
  );
}

/**
 * The momentum widget body — exported so the project page renders the exact
 * same digest scoped to one project (its touched-days curve).
 */
export function MomentumCardBase({
  activity,
  touchedThisWeek,
  total,
}: {
  activity: number[];
  touchedThisWeek: number;
  total: number;
}) {
  return (
    <ContextCard icon={Activity} title="Momentum · 4 wks">
      <div className="flex items-baseline gap-2">
        <SoftNumber
          value={touchedThisWeek}
          className="text-xl leading-none font-semibold tracking-tight text-foreground"
        />
        <span className="text-[11px] text-muted-foreground">
          touched this week
        </span>
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
          {total} touches
        </span>
      </div>
      <AreaTrend
        values={activity}
        label={`Projects touched per day over the last four weeks, ${total} total`}
      />
    </ContextCard>
  );
}

const TIER_COLORS = {
  fresh: "var(--recency-fresh)",
  recent: "color-mix(in oklch, var(--recency-fresh) 62%, var(--card))",
  stale: "var(--recency-stale)",
  cold: "var(--border)",
} as const;

function RhythmCard({ freshness }: { freshness: FreshnessCounts }) {
  const segments = [
    { key: "fresh" as const, label: "fresh · 2d", value: freshness.fresh },
    { key: "recent" as const, label: "recent · 2w", value: freshness.recent },
    { key: "stale" as const, label: "stale · 3m", value: freshness.stale },
    { key: "cold" as const, label: "cold", value: freshness.cold },
  ].filter((s) => s.value > 0);

  return (
    <ContextCard icon={Waves} title="Rhythm">
      <div
        aria-hidden
        className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full"
      >
        {segments.map((s) => (
          <span
            key={s.key}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ flexGrow: s.value, backgroundColor: TIER_COLORS[s.key] }}
          />
        ))}
        {segments.length === 0 ? (
          <span className="h-full w-full rounded-full bg-muted" />
        ) : null}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((s) => (
          <li
            key={s.key}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: TIER_COLORS[s.key] }}
            />
            {s.label}
            <SoftNumber
              value={s.value}
              className="font-semibold text-foreground"
            />
          </li>
        ))}
      </ul>
    </ContextCard>
  );
}

function StacksCard({ stacks }: { stacks: StackSlice[] }) {
  const top = stacks.slice(0, 4);
  const rest = stacks.slice(4).reduce((sum, s) => sum + s.count, 0);
  return (
    <ContextCard icon={Layers} title="Stacks">
      <ul className="flex flex-wrap gap-1.5">
        {top.map((s) => {
          const Icon = stackIcon(s.id === "unknown" ? undefined : s.id);
          return (
            <li
              key={s.label}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={chipStyle("green")}
              title={`${s.count} ${s.count === 1 ? "project" : "projects"} on ${s.label}`}
            >
              <Icon aria-hidden className="size-3.5" />
              {s.label}
              <span className="tabular-nums">{s.count}</span>
            </li>
          );
        })}
        {rest > 0 ? (
          <li className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            +{rest} other
          </li>
        ) : null}
      </ul>
    </ContextCard>
  );
}

function DirectoriesCard({
  roots,
  projectsPerRoot,
  rootErrors,
}: {
  roots: Root[];
  projectsPerRoot: Map<string, number>;
  rootErrors: { rootId: string; path: string; message: string }[];
}) {
  const errorRootIds = new Set(rootErrors.map((e) => e.rootId));
  return (
    <ContextCard icon={Folder} title="Directories">
      <ul className="flex flex-col gap-1">
        {roots.map((r) => (
          <li key={r.id} className="flex items-center gap-2 px-0.5" title={r.path}>
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full"
              style={{
                backgroundColor: errorRootIds.has(r.id)
                  ? "var(--sev-error)"
                  : "var(--recency-fresh)",
              }}
            />
            <span className="min-w-0 truncate text-[11px] text-foreground">
              {r.label || pathBasename(r.path)}
            </span>
            <span className="ml-auto text-[11px] font-semibold tabular-nums text-muted-foreground">
              {projectsPerRoot.get(r.id) ?? 0}
            </span>
          </li>
        ))}
        {rootErrors.map((e) => (
          <li
            key={`err-${e.rootId}`}
            className="truncate text-[10px]"
            title={`${e.path}: ${e.message}`}
            style={{ color: "var(--sev-error)" }}
          >
            couldn&rsquo;t read {pathBasename(e.path)}
          </li>
        ))}
      </ul>
      <Link
        to="/settings"
        className="meadow-focus group mt-1 inline-flex items-center gap-1 rounded-full text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Workspace settings
        <ArrowRight
          aria-hidden
          className="size-3 transition-transform group-hover:translate-x-0.5"
        />
      </Link>
    </ContextCard>
  );
}
