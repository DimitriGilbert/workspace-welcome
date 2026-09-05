/**
 * Swiss sheet panels: the stat band (poster numerals), the chart band
 * (hand-rolled geometric graphics — a recency histogram, an alert dot
 * matrix, a stack census) and the root strip. All values come straight
 * from the scan result; nothing here fetches or fakes.
 */

import type { ReactNode } from "react";

import { cn } from "@workspace-welcome/ui/lib/utils";
import type { Project, Root } from "@workspace-welcome/api/lib/types";

import { useOpenProject } from "@/lib/open-project";

import {
  bySeverity,
  recencyBuckets,
  stackBreakdown,
  type SwissStats,
} from "./swiss-data";

/** Uppercase wide-tracked micro-label — the sheet's small voice. */
export function Micro({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-[10px] font-semibold uppercase leading-none tracking-[0.18em]",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Shared button dressing: squared, uppercase, wide-tracked. */
export const btnSwiss =
  "rounded-none px-3 uppercase tracking-[0.16em] text-[10px] font-semibold";

const FIG_NOTE =
  "font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground";

interface StatCell {
  label: string | null;
  value: number | null;
  red?: boolean;
}

function statCells(stats: SwissStats | null): StatCell[] {
  if (stats === null) {
    return Array.from({ length: 6 }, () => ({ label: null, value: null }));
  }
  return [
    { label: "Projects", value: stats.total },
    { label: "Active · 7d", value: stats.active7d },
    { label: "Needs attention", value: stats.attention, red: stats.attention > 0 },
    { label: "Pinned", value: stats.pinned },
    { label: "Dirty files", value: stats.dirtyFiles },
    { label: "Commits ahead", value: stats.commitsAhead },
  ];
}

/** Six poster numerals on a hairline modular grid — the sheet's cover line. */
export function StatBand({ stats }: { stats: SwissStats | null }) {
  return (
    <div
      aria-busy={stats === null}
      className="grid grid-cols-2 gap-y-10 border-b border-border py-10 sm:grid-cols-3 xl:grid-cols-6"
    >
      {statCells(stats).map((cell, i) => (
        <div
          key={cell.label ?? `stat-${i}`}
          className="border-l border-border pl-4 first:border-l-0 first:pl-0 sm:pl-6"
        >
          {cell.label === null ? (
            <div className="h-2.5 w-16 animate-pulse bg-muted" />
          ) : (
            <Micro className="text-muted-foreground">{cell.label}</Micro>
          )}
          {cell.value === null ? (
            <div className="mt-4 h-[clamp(2.2rem,3.4vw,5rem)] w-3/4 animate-pulse bg-muted" />
          ) : (
            <p
              className={cn(
                "mt-3 text-[clamp(2.5rem,3.9vw,5.75rem)] font-semibold leading-[0.9] tracking-[-0.035em] tabular-nums",
                cell.red && "text-[var(--swiss-red)]",
              )}
            >
              {cell.value}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/** Registered roots as a thin modular strip: label + live project count. */
export function RootStrip({ roots, projects }: { roots: Root[]; projects: Project[] }) {
  if (roots.length === 0) return null;
  const counts = new Map<string, number>();
  for (const p of projects) {
    counts.set(p.rootId, (counts.get(p.rootId) ?? 0) + 1);
  }
  return (
    <div className="flex flex-wrap items-stretch gap-y-2 border-b border-border py-3.5">
      {roots.map((root, i) => (
        <div
          key={root.id}
          className={cn(
            "flex items-baseline gap-2.5 pr-8",
            i > 0 && "border-l border-border pl-8",
          )}
        >
          <Micro>{root.label}</Micro>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {counts.get(root.id) ?? 0}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Chart band: three reductive graphics sharing one hairline modular row. */
export function ChartBand({ projects }: { projects: Project[] }) {
  const openProject = useOpenProject();
  const now = Date.now();

  const buckets = recencyBuckets(projects, now);
  const maxBucket = Math.max(1, ...buckets.map((b) => b.count));
  const stacks = stackBreakdown(projects);
  const maxStack = Math.max(1, ...stacks.map((s) => s.count));
  const errors = bySeverity(projects, "error");
  const warns = bySeverity(projects, "warn");
  const infos = bySeverity(projects, "info");
  const flaggedCount = errors.length + warns.length + infos.length;

  const severityRow = (
    key: string,
    label: string,
    list: Project[],
    dotClass: string,
  ) => (
    <div
      key={key}
      className="flex items-start gap-4 border-b border-border py-3.5 first:pt-0 last:border-b-0 last:pb-0"
    >
      <Micro className="w-12 shrink-0 pt-1 text-muted-foreground">{label}</Micro>
      <span className="w-10 shrink-0 text-right font-mono text-2xl font-semibold leading-none tabular-nums">
        {String(list.length).padStart(2, "0")}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap content-start gap-1.5 pt-0.5">
        {list.length === 0 ? (
          <span className="swiss-dim font-mono text-xs">—</span>
        ) : (
          list.map((p) => {
            const detail = p.alerts.map((a) => a.message).join("; ");
            return (
              <button
                key={p.path}
                type="button"
                onClick={() => openProject(p.path)}
                title={`${p.name} — ${detail}`}
                aria-label={`Open ${p.name}: ${detail}`}
                className={`swiss-dot ${dotClass}`}
              />
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="grid gap-y-12 border-b border-border py-10 xl:grid-cols-12 xl:gap-y-0">
      {/*
       * LAST TOUCHED — activity histogram. Continuous ink baseline, one black
       * slab per window, count floating on the bar's shoulder.
       */}
      <figure className="min-w-0 xl:col-span-5 xl:pr-10">
        <figcaption className="flex items-baseline justify-between gap-4 pb-6">
          <Micro>Last touched</Micro>
          <span className={FIG_NOTE}>Projects per activity window</span>
        </figcaption>
        <div
          role="img"
          aria-label={`Activity histogram: ${buckets
            .map((b) => `${b.count} projects — ${b.label}`)
            .join(", ")}.`}
          className="flex h-44 items-stretch border-b border-foreground"
        >
          {buckets.map((b) => {
            // Cap at 96% so the floating count always stays inside the plot.
            const pct =
              b.count === 0
                ? 0
                : Math.min(96, Math.max(3, (b.count / maxBucket) * 100));
            return (
              <div key={b.label} className="relative min-w-0 flex-1 px-1.5">
                <div
                  aria-hidden
                  className="absolute bottom-0 left-1.5 right-1.5 bg-foreground"
                  style={{ height: `${pct}%` }}
                />
                <span
                  className="absolute inset-x-1.5 text-center font-mono text-xs tabular-nums"
                  style={{ bottom: `calc(${pct}% + 6px)` }}
                >
                  {b.count}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex">
          {buckets.map((b) => (
            <Micro
              key={b.label}
              className="flex-1 pt-2.5 text-center font-normal tracking-[0.14em] text-muted-foreground"
            >
              {b.label}
            </Micro>
          ))}
        </div>
      </figure>

      {/*
       * HEALTH — dot matrix. One mark per flagged project; severity is the
       * weight of the single red, never a second hue. Marks open the project.
       */}
      <figure className="min-w-0 xl:col-span-4 xl:border-l xl:border-border xl:px-10">
        <figcaption className="flex items-baseline justify-between gap-4 pb-6">
          <Micro>Health</Micro>
          <span className={FIG_NOTE}>One mark per flagged project</span>
        </figcaption>
        {flaggedCount === 0 ? (
          <div className="flex items-baseline gap-5 py-8">
            <span className="text-[clamp(3.5rem,4.5vw,6rem)] font-semibold leading-none tracking-[-0.03em] tabular-nums">
              00
            </span>
            <Micro className="text-muted-foreground">Alerts — all clear</Micro>
          </div>
        ) : (
          <div>
            {severityRow("error", "Error", errors, "swiss-dot-error")}
            {severityRow("warn", "Warn", warns, "swiss-dot-warn")}
            {severityRow("info", "Info", infos, "swiss-dot-info")}
          </div>
        )}
      </figure>

      {/** STACKS — toolchain census as thin ink bars. */}
      <figure className="min-w-0 xl:col-span-3 xl:border-l xl:border-border xl:pl-10">
        <figcaption className="flex items-baseline justify-between gap-4 pb-6">
          <Micro>Stacks</Micro>
          <span className={FIG_NOTE}>Projects per toolchain</span>
        </figcaption>
        <ul>
          {stacks.map((s) => (
            <li
              key={s.label}
              className="flex items-center gap-4 border-b border-border py-2.5 last:border-b-0"
            >
              <span className="w-28 shrink-0 truncate text-xs font-medium uppercase tracking-[0.1em]">
                {s.label}
              </span>
              <div className="relative h-2.5 min-w-0 flex-1">
                <div
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-foreground"
                  style={{ width: `${Math.max(4, (s.count / maxStack) * 100)}%` }}
                />
              </div>
              <span className="w-7 shrink-0 text-right font-mono text-xs tabular-nums">
                {s.count}
              </span>
            </li>
          ))}
        </ul>
      </figure>
    </div>
  );
}
