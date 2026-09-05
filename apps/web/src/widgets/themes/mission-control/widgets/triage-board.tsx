/**
 * McTriage — the severity-driven triage band (T2 port of the design's
 * `AttentionBoard`, `components/designs/mission-control/attention-board.tsx`
 * — the console "never renders this band when the fleet is clean").
 *
 * Rows come from the ONE attention surface, the `AttentionList` part
 * (`attentionProjects` over the working set: worst first, freshest
 * tiebreak), capped at the design's six-row preview with the part's "+N
 * more" footer. The header counts keep the design's err/wrn register.
 *
 * The design renders NOTHING when the fleet is nominal — a preset is static
 * data, so the empty board renders the honest substitute: the freshness
 * census (fresh/recent/stale/cold) that explains the quiet. Row activation
 * (open the project page) is the `AttentionList` `onOpen` callback; no
 * navigation seam exists in the import surface yet, so rows render
 * non-interactive (recorded in the T2 wave report; the ledger's unit links
 * carry same-theme navigation).
 */
import { Stat } from "@workspace-welcome/ui/components/stat";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { freshnessCounts, severityCounts } from "@/lib/scan-metrics";
import { AttentionList } from "@/widgets/parts";
import { useWorkspace } from "@/widgets/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

const PREVIEW_ROWS = 6;

/** The design's err/wrn counter line (tone-tinted numerals, quiet separator). */
function SeverityRegister() {
  const workspace = useWorkspace();
  const counts = severityCounts(workspace.projects);
  const flagged = counts.critical + counts.warning;
  if (flagged === 0) return null;
  return (
    <p className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
      {counts.critical > 0 ? (
        <span className="text-(--sev-critical)">{counts.critical} err</span>
      ) : null}
      {counts.critical > 0 && counts.warning > 0 ? (
        <span className="mx-1.5 text-muted-foreground/40">/</span>
      ) : null}
      {counts.warning > 0 ? <span>{counts.warning} wrn</span> : null}
    </p>
  );
}

/** The nominal state: the freshness census that explains the quiet. */
function NominalCensus() {
  const workspace = useWorkspace();
  const tiers = freshnessCounts(workspace.projects, workspace.now);
  return (
    <div
      className="flex h-full min-h-0 w-full flex-col justify-center gap-4 overflow-hidden px-3 pb-2"
      data-mc-triage="nominal"
    >
      <p
        className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em]"
        style={{ color: "var(--state-positive)" }}
      >
        <span aria-hidden className="inline-block size-1.5 bg-(--state-positive)" />
        Fleet nominal
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-x-8 gap-y-3">
        <Stat label="Fresh" value={tiers.fresh} size="sm" />
        <Stat label="Recent" value={tiers.recent} size="sm" />
        <Stat label="Stale" value={tiers.stale} size="sm" />
        <Stat label="Cold" value={tiers.cold} size="sm" />
      </div>
      <p className={cn("text-xs text-muted-foreground")}>
        No critical or warning alerts are open. Every unit is on branch, in sync and clean.
      </p>
    </div>
  );
}

export function McTriage(_props: RegisteredWidgetProps) {
  const workspace = useWorkspace();
  const flagged = workspace.projects.some(
    (p) =>
      p.alerts.some((a) => a.severity === "critical") ||
      p.alerts.some((a) => a.severity === "warning"),
  );

  return (
    <WidgetShell className="h-full w-full">
      {flagged ? (
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-1.5 overflow-hidden">
          <div className="flex shrink-0 items-center gap-3 px-3">
            <SeverityRegister />
          </div>
          <AttentionList density="rows" max={PREVIEW_ROWS} className="min-h-0 flex-1 px-3 pb-2" />
        </div>
      ) : (
        <NominalCensus />
      )}
    </WidgetShell>
  );
}
