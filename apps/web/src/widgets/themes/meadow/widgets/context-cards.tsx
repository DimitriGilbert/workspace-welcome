/**
 * Meadow digest cards, ported from the ContextPanel widgets of
 * `components/designs/meadow/context.tsx` into the theme namespace (owner
 * correction: theme widgets carry the prototype's presentation): momentum,
 * rhythm, stacks, and directories. Every derivation is the shared
 * scan-metrics function (the design's local `derive.ts` duplicates were
 * consolidated there); the cards are theme-local chrome — the design's
 * `.meadow-panel` shells, icon chip headings, and soft chips, verbatim.
 *
 * Since the T2-meadow rework each card is placed by its own widget kind
 * (`digests.tsx`) as a full-width band, so the cards stretch to their
 * placement (`h-full`) and clip their content overflow — band rungs have a
 * definite height and no-inner-scroll forbids inner scrolling.
 */
import { useMemo } from "react";
import type { ComponentType } from "react";
import { Link } from "@tanstack/react-router";
import { Activity, ArrowRight, Folder, Layers, Waves } from "lucide-react";

import { AreaTrend } from "./bits";
import { SoftNumber, chipStyle } from "./bits";
import {
  dailyActivity,
  freshnessCounts,
  stackDistribution,
  touchedWithinDays,
} from "@/lib/scan-metrics";
import { stackIcon } from "@/lib/icons";
import { useProject } from "@/widgets/contexts/project-context";
import { useWorkspace } from "@/widgets/contexts/workspace-context";

/** Last path segment of an absolute path — for root labels. Ported from the
 * design's derive helper; one line of presentation formatting. */
function pathBasename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

/** Card shell shared by every digest — the design's `ContextCard`. */
export function ContextCard({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="meadow-panel flex h-full min-h-0 w-full flex-col gap-2 overflow-hidden p-3.5"
    >
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-tight text-muted-foreground">
        <Icon aria-hidden className="size-3.5" />
        {title}
      </h3>
      {children}
    </section>
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

/** The workspace's momentum digest over the shared scan-metrics inputs. */
export function MomentumCard() {
  const workspace = useWorkspace();
  const activity = useMemo(
    () => dailyActivity(workspace.projects, 28, workspace.now),
    [workspace.projects, workspace.now],
  );
  const touched = useMemo(
    () => touchedWithinDays(workspace.projects, 7, workspace.now),
    [workspace.projects, workspace.now],
  );
  const total = activity.reduce((sum, v) => sum + v, 0);
  return (
    <MomentumCardBase
      activity={activity}
      touchedThisWeek={touched}
      total={total}
    />
  );
}

const TIER_COLORS = {
  fresh: "var(--recency-fresh)",
  recent: "color-mix(in oklch, var(--recency-fresh) 62%, var(--card))",
  stale: "var(--recency-stale)",
  cold: "var(--border)",
} as const;

export function RhythmCard() {
  const workspace = useWorkspace();
  const freshness = useMemo(
    () => freshnessCounts(workspace.projects, workspace.now),
    [workspace.projects, workspace.now],
  );
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

/** The rhythm ratio bar alone — the below-the-card small rung. */
export function RhythmBar() {
  const workspace = useWorkspace();
  const freshness = useMemo(
    () => freshnessCounts(workspace.projects, workspace.now),
    [workspace.projects, workspace.now],
  );
  const segments = [
    { key: "fresh" as const, label: "fresh · 2d", value: freshness.fresh },
    { key: "recent" as const, label: "recent · 2w", value: freshness.recent },
    { key: "stale" as const, label: "stale · 3m", value: freshness.stale },
    { key: "cold" as const, label: "cold", value: freshness.cold },
  ].filter((s) => s.value > 0);
  return (
    <div
      aria-hidden
      className="min-h-0 w-full overflow-hidden pr-2"
    >
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
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
    </div>
  );
}

export function StacksCard() {
  const workspace = useWorkspace();
  const stacks = useMemo(
    () => stackDistribution(workspace.projects, 5),
    [workspace.projects],
  );
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

export function DirectoriesCard() {
  const workspace = useWorkspace();
  const roots = workspace.roots.data ?? [];
  const perRoot = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of workspace.projects) {
      map.set(p.rootId, (map.get(p.rootId) ?? 0) + 1);
    }
    return map;
  }, [workspace.projects]);
  const errorRootIds = new Set(workspace.rootErrors.map((e) => e.rootId));

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
                  ? "var(--sev-critical)"
                  : "var(--recency-fresh)",
              }}
            />
            <span className="min-w-0 truncate text-[11px] text-foreground">
              {r.label || pathBasename(r.path)}
            </span>
            <span className="ml-auto text-[11px] font-semibold tabular-nums text-muted-foreground">
              {perRoot.get(r.id) ?? 0}
            </span>
          </li>
        ))}
        {workspace.rootErrors.map((e) => (
          <li
            key={`err-${e.rootId}`}
            className="truncate text-[10px]"
            title={`${e.path}: ${e.message}`}
            style={{ color: "var(--sev-critical)" }}
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

/** Project-scoped momentum — the design's MomentumCardBase over one project's
 * touched-days curve (the project page's Activity tab). */
export function ProjectMomentumCard() {
  const { project, now } = useProject();
  const scoped = useMemo(() => (project === null ? [] : [project]), [project]);
  const activity = useMemo(
    () => dailyActivity(scoped, 28, now),
    [scoped, now],
  );
  const touches = useMemo(
    () => touchedWithinDays(scoped, 7, now),
    [scoped, now],
  );
  const total = activity.reduce((sum, v) => sum + v, 0);
  return (
    <MomentumCardBase
      activity={activity}
      touchedThisWeek={touches}
      total={total}
    />
  );
}
