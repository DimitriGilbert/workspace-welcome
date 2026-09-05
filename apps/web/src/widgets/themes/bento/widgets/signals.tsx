/**
 * Bento's signals row (master plan §5 T2-bento): widget-for-widget ports of
 * the design's `attention-tile.tsx` and `severity-tile.tsx`.
 *
 * Needs-attention is the `attention-list` part (the ONE `attentionProjects`
 * derivation — worst first, freshest tiebreak) with the design's rolled
 * count numeral in front; signal mix is the severity SegBar + Stat census
 * plus the uncommitted-work ranking (dirtyLeaders → HBars). No local
 * derivation, no local part copy — data via `useWorkspace()`, pixels via
 * parts and ui.
 */
import { useMemo } from "react";
import type { ReactNode } from "react";

import { AnimatedNumber } from "@workspace-welcome/ui/components/animated-number";
import { HBars } from "@workspace-welcome/ui/components/h-bars";
import { SegBar } from "@workspace-welcome/ui/components/seg-bar";
import { Stat } from "@workspace-welcome/ui/components/stat";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { attentionProjects, dirtyLeaders, severityCounts } from "@/lib/scan-metrics";

import { AttentionListPart } from "@/widgets/parts";
import { useWorkspace } from "@/widgets/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

function SignalFill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-full min-h-0 w-full min-w-0 flex-col", className)}>
      {children}
    </div>
  );
}

/* --------------------------------------------------------- attention --- */

/**
 * Needs attention — every project carrying a critical/warning alert, worst
 * first. Rows render through the attention-list part (non-interactive on
 * the dashboard: presets carry JSON props only, so `onOpen` stays unbound —
 * project-page navigation is the T3 wave's surface).
 */
export function BentoAttention({ size }: RegisteredWidgetProps) {
  const { projects } = useWorkspace();
  const attention = useMemo(() => attentionProjects(projects), [projects]);
  const criticals = attention.filter((project) =>
    project.alerts.some((alert) => alert.severity === "critical"),
  ).length;
  const warnings = attention.length - criticals;
  const count = (
    <AnimatedNumber
      value={attention.length}
      motion="roll"
      className="text-2xl font-semibold tabular-nums"
      style={{ color: attention.length > 0 ? "var(--sev-warning)" : "var(--state-positive)" }}
    />
  );
  const census = (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-[11px] tabular-nums">
      {count}
      <span className="text-muted-foreground">need attention</span>
      {criticals > 0 ? (
        <span style={{ color: "var(--sev-critical)" }}>{criticals} critical</span>
      ) : null}
      {warnings > 0 ? (
        <span style={{ color: "var(--sev-warning)" }}>
          {warnings} {warnings === 1 ? "warning" : "warnings"}
        </span>
      ) : null}
      <span className="ml-auto text-muted-foreground">of {projects.length} projects</span>
    </span>
  );

  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
      sizes={{
        "1x1": (
          <SignalFill className="items-center justify-center px-2">
            {count}
          </SignalFill>
        ),
        "2x1": (
          <SignalFill className="justify-center gap-1.5 px-3 py-2">
            {census}
            <AttentionListPart density="strip" max={6} className="min-h-0 w-full" />
          </SignalFill>
        ),
        "2x2": (
          <SignalFill className="gap-1.5 px-3 py-2">
            {census}
            <AttentionListPart
              density="rows"
              max={8}
              className="min-h-0 w-full flex-1 [&>ul]:flex-1"
            />
          </SignalFill>
        ),
        "3x3": (
          <SignalFill className="gap-1.5 px-3 py-2">
            {census}
            <AttentionListPart
              density="rows"
              max={10}
              className="min-h-0 w-full flex-1 [&>ul]:flex-1"
            />
          </SignalFill>
        ),
      }}
    >
      <SignalFill className="gap-1.5 px-3 py-2">
        {census}
        <AttentionListPart density="rows" max={8} className="min-h-0 w-full flex-1 [&>ul]:flex-1" />
      </SignalFill>
    </WidgetShell>
  );
}

/* ----------------------------------------------------------- signals --- */

/**
 * Signal mix — the workspace's alert severity split (SegBar + Stat census)
 * over the uncommitted-work ranking, exactly the design's two stacked
 * halves.
 */
export function BentoSignals({ size }: RegisteredWidgetProps) {
  const { projects } = useWorkspace();
  const counts = useMemo(() => severityCounts(projects), [projects]);
  const leaders = useMemo(() => dirtyLeaders(projects, 6), [projects]);
  const total = counts.critical + counts.warning + counts.info;
  const segBar = (
    <SegBar
      height={10}
      ariaLabel={`${counts.critical} critical, ${counts.warning} warning, ${counts.info} info alerts`}
      segments={[
        { value: counts.critical, color: "var(--sev-critical)", label: "critical" },
        { value: counts.warning, color: "var(--sev-warning)", label: "warning" },
        { value: counts.info, color: "var(--sev-info)", label: "info" },
      ]}
    />
  );
  const census = (
    <div className="grid min-w-0 grid-cols-3 gap-2">
      <Stat label="Critical" value={counts.critical} tone={counts.critical > 0 ? "critical" : undefined} size="sm" />
      <Stat label="Warnings" value={counts.warning} tone={counts.warning > 0 ? "warning" : undefined} size="sm" />
      <Stat label="Info" value={counts.info} tone={counts.info > 0 ? "info" : undefined} size="sm" />
    </div>
  );
  const dirty = leaders.length === 0 ? (
    <p className="min-h-0 flex-1 text-xs text-muted-foreground">
      Nothing dirty — working trees are clean.
    </p>
  ) : (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-1 border-t border-border pt-2">
      <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        Uncommitted work · {total} {total === 1 ? "alert" : "alerts"}
      </p>
      <HBars
        maxRows={6}
        ariaLabel="Uncommitted files by repository"
        rows={leaders.map((leader) => ({ label: leader.name, value: leader.dirty }))}
        className="min-h-0 w-full flex-1"
      />
    </div>
  );
  const body = (
    <SignalFill className="gap-2.5 px-4 py-3">
      {segBar}
      {census}
      {dirty}
    </SignalFill>
  );

  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
      sizes={{
        "1x1": <SignalFill className="items-center justify-center px-2">{segBar}</SignalFill>,
        "2x1": (
          <SignalFill className="justify-center gap-2 px-3 py-2">
            {segBar}
            {census}
          </SignalFill>
        ),
        "2x2": body,
        "3x3": body,
      }}
    >
      {body}
    </WidgetShell>
  );
}
