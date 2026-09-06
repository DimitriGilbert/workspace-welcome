/**
 * McTriage — the severity-driven triage band (verbatim port of the design's
 * `AttentionBoard`, `components/designs/mission-control/attention-board.tsx`
 * — the console "never renders this band when the fleet is clean"): every
 * project carrying an error or warn alert, worst first, one line each —
 * severity glyph register, name + alert message, pulse strip, update age.
 *
 * Row activation opens the project through the same-theme project route
 * (the design's `useOpenDesignProject` seam). The design's "Full triage"
 * header button switches a view the widget system owns at the page level,
 * so the header carries the err/wrn register only — no dead control.
 * Nominal fleet renders nothing (the design's contract); the freshness
 * census stands in for the preset's static empty state.
 */
import { Pin } from "lucide-react";

import type { AlertSeverity, Project } from "@workspace-welcome/api/lib/types";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { dateTooltip, relativeTime } from "@/lib/format";
import { freshnessCounts } from "@/lib/scan-metrics";
import { pulseCells } from "@/lib/scan-metrics";
import { PulseStrip } from "@workspace-welcome/ui/components/pulse-strip";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";

import { projectHref } from "./fleet-ledger";
import { useWorkspace } from "@/widgets/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

const SEV_LABEL: Record<AlertSeverity, string> = {
  critical: "ERR",
  warning: "WRN",
  info: "INF",
};

/** Worst alert severity carried by a project, or null when clean. */
function worstSeverity(p: Project): AlertSeverity | null {
  if (p.alerts.some((a) => a.severity === "critical")) return "critical";
  if (p.alerts.some((a) => a.severity === "warning")) return "warning";
  if (p.alerts.some((a) => a.severity === "info")) return "info";
  return null;
}

/** Sort key for triage: errors surface first, clean projects sink. */
function severityRank(p: Project): number {
  const worst = worstSeverity(p);
  if (worst === "critical") return 0;
  if (worst === "warning") return 1;
  if (worst === "info") return 2;
  return 3;
}

function openProject(path: string): void {
  window.location.href = projectHref(path);
}

/** The design's six-row preview. */
const PREVIEW = 6;

/** The severity rows, worst first, freshest tiebreak — the design's sort. */
function triagedProjects(projects: Project[]): Project[] {
  return [...projects].sort(
    (a, b) =>
      severityRank(a) - severityRank(b) ||
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

/** The nominal state: the freshness census that explains the quiet. */
function NominalCensus() {
  const workspace = useWorkspace();
  const tiers = freshnessCounts(workspace.projects, workspace.now);
  return (
    <div
      className="flex h-full min-h-0 w-full flex-col justify-center gap-4 overflow-hidden px-4 pb-2"
      data-mc-triage="nominal"
    >
      <p
        className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em]"
        style={{ color: "var(--state-positive)" }}
      >
        <span aria-hidden className="inline-block size-1.5 bg-(--state-positive)" />
        Fleet nominal
      </p>
      <p className="text-xs text-muted-foreground">
        No alerts are open. Every unit is on branch, in sync and clean —{" "}
        {tiers.fresh} fresh, {tiers.recent} recent, {tiers.stale} stale, {tiers.cold} cold.
      </p>
    </div>
  );
}

export function McTriage(_props: RegisteredWidgetProps) {
  const workspace = useWorkspace();
  const triaged = triagedProjects(workspace.projects).filter(
    (p) => p.alerts.some((a) => a.severity === "critical") || p.alerts.some((a) => a.severity === "warning"),
  );

  if (workspace.scanState === "loading") {
    return (
      <WidgetShell className="h-full w-full">
        <div className="flex h-full min-h-0 w-full flex-col justify-center gap-2 px-4 pb-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </WidgetShell>
    );
  }

  const preview = triaged.slice(0, PREVIEW);
  const overflow = triaged.length - preview.length;
  const errors = triaged.filter((p) => worstSeverity(p) === "critical").length;
  const warns = triaged.length - errors;

  return (
    <WidgetShell className="h-full w-full">
      {triaged.length === 0 ? (
        <NominalCensus />
      ) : (
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border border-(--mc-line) bg-(--mc-panel)">
          <header className="flex shrink-0 items-center gap-3 border-b border-(--mc-line-strong) px-4 py-2">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-(--sev-warning)">
              Triage
            </h2>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {errors > 0 ? <span className="text-(--sev-critical)">{errors} err</span> : null}
              {errors > 0 && warns > 0 ? <span className="mx-1.5 text-muted-foreground/40">/</span> : null}
              {warns > 0 ? <span>{warns} warn</span> : null}
            </span>
          </header>
          <ul className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {preview.map((p) => {
              const worst = worstSeverity(p);
              const primary = p.alerts.find((a) => a.severity === worst) ?? p.alerts[0];
              return (
                <li
                  key={p.path}
                  className="group flex shrink-0 cursor-pointer items-center gap-3 border-b border-(--mc-line) px-4 py-2 transition-colors last:border-b-0 hover:bg-[color-mix(in_oklch,var(--foreground)_3.5%,transparent)]"
                  onClick={() => openProject(p.path)}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "w-7 shrink-0 font-mono text-[9px] tracking-[0.1em]",
                      worst === "critical" && "text-(--sev-critical)",
                      worst === "warning" && "text-(--sev-warning)",
                      worst === "info" && "text-(--sev-info)",
                    )}
                  >
                    {worst ? SEV_LABEL[worst] : ""}
                  </span>
                  <span className="flex min-w-0 flex-1 items-baseline gap-2">
                    <a
                      href={projectHref(p.path)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex min-w-0 shrink-0 items-center gap-1.5 truncate text-left text-[13px] font-medium tracking-tight text-foreground outline-none transition-colors hover:text-(--mc-accent) focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {p.name}
                      {p.pinned ? <Pin aria-hidden className="size-3 shrink-0 text-(--pinned-accent)" /> : null}
                    </a>
                    <span className="truncate text-xs text-muted-foreground">{primary?.message}</span>
                  </span>
                  <PulseStrip
                    cells={pulseCells(p, 24, workspace.now)}
                    className="hidden w-32 shrink-0 xl:inline-flex"
                  />
                  <span
                    className="hidden w-24 shrink-0 whitespace-nowrap text-right font-mono text-[11px] tabular-nums text-muted-foreground md:block"
                    title={dateTooltip(p.updatedAt)}
                  >
                    {relativeTime(p.updatedAt)}
                  </span>
                </li>
              );
            })}
          </ul>
          {overflow > 0 ? (
            <p className="shrink-0 border-t border-(--mc-line) px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              +{overflow} more in full triage
            </p>
          ) : null}
        </div>
      )}
    </WidgetShell>
  );
}
