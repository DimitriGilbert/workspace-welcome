import type { ComponentPropsWithoutRef } from "react";
import type { Project } from "@workspace-welcome/api/lib/types";
import { Chip } from "@workspace-welcome/ui/components/chip";
import { SeverityDots } from "@workspace-welcome/ui/components/severity-dots";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";
import { cn } from "@workspace-welcome/ui/lib/utils";
import type { Tone } from "@workspace-welcome/ui/lib/tokens";

import { relativeTime } from "@/lib/format";
import { attentionProjects, severityCounts } from "@/lib/scan-metrics";

import { useWorkspace } from "@/lib/contexts/workspace-context";

/**
 * AttentionList — the triage surface (master plan §3.5): projects carrying
 * at least one critical/warning alert, worst first, freshest tiebreak — the
 * ONE `attentionProjects` derivation over `useWorkspace().projects`. Two
 * densities: `"rows"` (a triage ledger: name, alert dots, last activity) and
 * `"strip"` (a wrap of one chip per project, tinted by its worst severity —
 * the 1x1/2x1 rung). `onOpen` lets the host navigate (e.g. to the project
 * page); without it rows render non-interactive.
 */

export interface AttentionListProps extends ComponentPropsWithoutRef<"div"> {
  /** `"rows"` ledger (default) or `"strip"` chip wrap. */
  density?: "rows" | "strip";
  /** Cap on rendered projects (the count is honest: "+N more" footer). */
  max?: number;
  /** Project activation (row/chip click). */
  onOpen?: (project: Project) => void;
}

export function AttentionList({
  density = "rows",
  max = 6,
  onOpen,
  className,
  ...rest
}: AttentionListProps) {
  const workspace = useWorkspace();
  const attention = attentionProjects(workspace.projects);
  const shown = attention.slice(0, max);
  const overflow = attention.length - shown.length;

  if (workspace.scanState === "loading") {
    return (
      <div
        data-part="attention-list-loading"
        className={cn("flex min-h-0 min-w-0 flex-col gap-2", className)}
        {...rest}
      >
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (attention.length === 0) {
    return (
      <div
        data-part="attention-list-empty"
        className={cn(
          "flex min-h-0 min-w-0 items-center text-xs text-muted-foreground",
          className,
        )}
        {...rest}
      >
        All clear — no critical or warning alerts.
      </div>
    );
  }

  if (density === "strip") {
    return (
      <div
        className={cn("flex min-h-0 min-w-0 flex-wrap items-center gap-1", className)}
        {...rest}
      >
        {shown.map((p) => {
          const worst = worstTone(p);
          const count = severityCounts([p]);
          const total = count.critical + count.warning + count.info;
          return (
            <button
              key={p.path}
              type="button"
              onClick={onOpen ? () => onOpen(p) : undefined}
              className={cn(
                "rounded-none text-left",
                onOpen && "cursor-pointer",
              )}
            >
              <Chip tone={worst} title={`${p.name}: ${total} alert(s)`}>
                {p.name} · {total}
              </Chip>
            </button>
          );
        })}
        {overflow > 0 ? (
          <span className="text-[10px] text-muted-foreground">+{overflow}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-col", className)} {...rest}>
      <ul className="m-0 flex min-h-0 list-none flex-col divide-y divide-border/60 p-0">
        {shown.map((p) => (
          <li key={p.path} className="min-w-0">
            <button
              type="button"
              onClick={onOpen ? () => onOpen(p) : undefined}
              disabled={!onOpen}
              className={cn(
                "flex w-full min-w-0 items-center gap-2 py-1.5 text-left",
                onOpen && "cursor-pointer transition-colors hover:bg-muted/50",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-xs font-medium">
                {p.name}
              </span>
              <SeverityDots
                dots={p.alerts.map((a) => ({
                  id: a.code,
                  severity: a.severity,
                  message: a.message,
                }))}
              />
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {relativeTime(p.updatedAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {overflow > 0 ? (
        <span className="pt-1 text-[10px] text-muted-foreground">
          +{overflow} more
        </span>
      ) : null}
    </div>
  );
}

/** A project's worst alert as a ui Tone (critical > warning > info). */
function worstTone(p: Project): Tone {
  if (p.alerts.some((a) => a.severity === "critical")) return "critical";
  if (p.alerts.some((a) => a.severity === "warning")) return "warning";
  return "info";
}
