/**
 * Meadow digest cards (T2-meadow) — port of the ContextPanel widgets from
 * `components/designs/meadow/context.tsx`: momentum, rhythm, stacks, and
 * directories. Every derivation is the shared scan-metrics function (the
 * design's local `derive.ts` duplicates were consolidated there) and every
 * visual maps to a ui part: Chart for the momentum trend, SegBar for the
 * rhythm ratio, Chip for the stack census. Cards are theme-local chrome
 * (`data-slot="meadow-card"`, skinned in the theme's custom.css).
 */
import { useMemo } from "react";
import type { ComponentType } from "react";
import { Link } from "@tanstack/react-router";
import { Activity, ArrowRight, Folder, Layers, Waves } from "lucide-react";

import { AnimatedNumber } from "@workspace-welcome/ui/components/animated-number";
import { Chart } from "@workspace-welcome/ui/components/chart";
import { Chip } from "@workspace-welcome/ui/components/chip";
import { SegBar } from "@workspace-welcome/ui/components/seg-bar";
import { cn } from "@workspace-welcome/ui/lib/utils";

import {
  dailyActivity,
  freshnessCounts,
  stackDistribution,
  touchedWithinDays,
} from "@/lib/scan-metrics";
import { useWorkspace } from "@/widgets/contexts/workspace-context";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Last path segment of an absolute path — for root labels. Ported from the
 * design's derive helper; one line of presentation formatting. */
function pathBasename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

/** Card shell shared by every digest — the design's `ContextCard`. */
export function Card({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      data-slot="meadow-card"
      className={cn(
        "flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden p-3.5",
        className,
      )}
    >
      <h3 className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold tracking-tight text-muted-foreground">
        <Icon aria-hidden className="size-3.5" />
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Momentum · 4 wks — projects-touched per day over the trailing month.
 * `chart` placements guarantee the 200x160 floor (authored rungs), so the
 * ui Chart renders only there; without it the numerals carry the card.
 */
export function MomentumCard({ chart }: { chart: boolean }) {
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
    <Card icon={Activity} title="Momentum · 4 wks" className="flex-1">
      <div className="flex shrink-0 items-baseline gap-2">
        <AnimatedNumber
          value={touched}
          className="text-xl leading-none font-semibold tracking-tight text-foreground"
        />
        <span className="text-[11px] text-muted-foreground">touched this week</span>
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
          {total} touches
        </span>
      </div>
      {chart ? (
        <div className="min-h-0 flex-1">
          <Chart
            variant="area"
            points={activity.map((value, i) => ({
              label: new Date(
                workspace.now - (activity.length - 1 - i) * DAY_MS,
              ).toLocaleDateString(undefined, { month: "numeric", day: "numeric" }),
              value,
            }))}
            color="var(--recency-fresh)"
            maxPoints={28}
            ariaLabel={`Projects touched per day over the last four weeks, ${total} total`}
            className="h-40 min-h-40 w-full"
          />
        </div>
      ) : null}
    </Card>
  );
}

/** Rhythm — the workspace split across the four recency tiers (SegBar). */
export function RhythmCard() {
  const workspace = useWorkspace();
  const freshness = useMemo(
    () => freshnessCounts(workspace.projects),
    [workspace.projects],
  );
  const segments = rhythmSegments(freshness);

  return (
    <Card icon={Waves} title="Rhythm">
      <SegBar segments={segments} height={10} ariaLabel="Projects by recency tier" />
      <ul className="flex shrink-0 flex-wrap gap-x-3 gap-y-1">
        {segments.map((s) => (
          <li
            key={s.label}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
            <AnimatedNumber
              value={s.value}
              className="font-semibold text-foreground"
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The freshness-tier breakdown as SegBar segments (shared by the rhythm
 * card and the bare small-rung bar). */
function rhythmSegments(freshness: {
  fresh: number;
  recent: number;
  stale: number;
  cold: number;
}) {
  return [
    { label: "fresh · 2d", value: freshness.fresh, color: "var(--recency-fresh)" },
    {
      label: "recent · 2w",
      value: freshness.recent,
      color: "color-mix(in oklch, var(--recency-fresh) 62%, var(--card))",
    },
    { label: "stale · 3m", value: freshness.stale, color: "var(--recency-stale)" },
    { label: "cold", value: freshness.cold, color: "var(--border)" },
  ];
}

/** The rhythm ratio bar alone — the below-the-card small rung. */
export function RhythmBar() {
  const workspace = useWorkspace();
  const freshness = useMemo(
    () => freshnessCounts(workspace.projects),
    [workspace.projects],
  );
  return (
    <div className="min-h-0 w-full overflow-hidden pr-2">
      <SegBar
        segments={rhythmSegments(freshness)}
        height={10}
        ariaLabel="Projects by recency tier"
      />
    </div>
  );
}

/** Stacks — the detected-stack census, top four plus the folded rest. */
export function StacksCard() {
  const workspace = useWorkspace();
  const stacks = useMemo(
    () => stackDistribution(workspace.projects, 5),
    [workspace.projects],
  );

  return (
    <Card icon={Layers} title="Stacks">
      <ul className="flex shrink-0 flex-wrap gap-1.5">
        {stacks.map((s) => (
          <li key={s.label}>
            <Chip
              tone={s.id === "other" ? "neutral" : "positive"}
              title={`${s.count} ${s.count === 1 ? "project" : "projects"} on ${s.label}`}
            >
              {s.label}
              <span className="tabular-nums">{s.count}</span>
            </Chip>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Directories — tracked roots with project counts and read errors. */
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
    <Card icon={Folder} title="Directories">
      <ul className="flex min-h-0 flex-col gap-1">
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
        className="meadow-focus group mt-auto inline-flex shrink-0 items-center gap-1 self-start rounded-full text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Workspace settings
        <ArrowRight
          aria-hidden
          className="size-3 transition-transform group-hover:translate-x-0.5"
        />
      </Link>
    </Card>
  );
}
