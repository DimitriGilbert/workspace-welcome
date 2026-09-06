import { useState } from "react";
import { ChevronDown, CircleCheck, OctagonAlert, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { AlertSeverity, Project } from "@workspace-welcome/api/lib/types";

import { GitGlyphs } from "@/components/designs/bento/git-glyphs";
import { useOpenBentoProject } from "@/components/designs/bento/use-open-bento-project";
import { relativeTime } from "@/lib/format";
import { BentoTile } from "@/components/designs/bento/bento-tile";
import { RollNumber } from "@/components/designs/bento/roll-number";

interface AttentionTileProps {
  /** Projects carrying error or warn alerts, worst first. */
  attention: Project[];
  totalProjects: number;
}

const PREVIEW = 6;

const SEVERITY_ICON: Record<Exclude<AlertSeverity, "info">, LucideIcon> = {
  critical: OctagonAlert,
  warning: TriangleAlert,
};

/**
 * The featured panel: every project with an error or warning alert, worst
 * first, sized like a hero because severity earns size. Rows open the
 * project; the header carries the counts so the state reads from across
 * the room.
 */
export function AttentionTile({ attention, totalProjects }: AttentionTileProps) {
  const openProject = useOpenBentoProject();
  const [expanded, setExpanded] = useState(false);

  const errors = attention.filter((p) =>
    p.alerts.some((a) => a.severity === "critical"),
  ).length;
  const warns = attention.length - errors;
  const visible = expanded ? attention : attention.slice(0, PREVIEW);

  return (
    <BentoTile span="sp-attention" className="b-band-h flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h2 className="b-label">Needs attention</h2>
          <RollNumber
            value={attention.length}
            label={`${attention.length} projects need attention`}
            className="b-num text-[30px]"
            style={{ color: attention.length > 0 ? "var(--sev-warning)" : "var(--state-positive)" }}
          />
          {attention.length > 0 ? (
            <span className="flex items-center gap-2 font-mono text-[0.68rem]">
              {errors > 0 ? (
                <span className="inline-flex items-center gap-1" style={{ color: "var(--sev-critical)" }}>
                  <OctagonAlert className="size-3" /> {errors} {errors === 1 ? "error" : "errors"}
                </span>
              ) : null}
              {warns > 0 ? (
                <span className="inline-flex items-center gap-1" style={{ color: "var(--sev-warning)" }}>
                  <TriangleAlert className="size-3" /> {warns} {warns === 1 ? "warning" : "warnings"}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
        <span className="font-mono text-[0.68rem] text-muted-foreground">
          of {totalProjects} projects
        </span>
      </div>

      {attention.length === 0 ? (
        <div className="flex min-h-24 flex-1 flex-col items-center justify-center gap-1.5 text-center">
          <CircleCheck className="size-5" style={{ color: "var(--state-positive)" }} />
          <p className="text-sm font-semibold">All clear</p>
          <p className="text-xs text-muted-foreground">
            No error or warning alerts in the current view.
          </p>
        </div>
      ) : (
        <>
          <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {visible.map((p) => {
              const blocking = p.alerts.filter(
                (a) => a.severity === "critical" || a.severity === "warning",
              );
              const worst = blocking.some((a) => a.severity === "critical")
                ? "critical"
                : "warning";
              const Icon = SEVERITY_ICON[worst];
              return (
                <li key={p.path} className="flex min-h-10 flex-1">
                  <button
                    type="button"
                    onClick={() => openProject(p.path)}
                    className="group flex w-full items-center gap-3 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-white/[0.05]"
                  >
                    <Icon
                      className="size-4 shrink-0"
                      style={{ color: worst === "critical" ? "var(--sev-critical)" : "var(--sev-warning)" }}
                    />
                    <span className="w-32 shrink-0 truncate text-[0.82rem] font-semibold tracking-tight sm:w-64">
                      {p.name}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-wrap content-center gap-1.5">
                      {blocking.map((a) => (
                        <span
                          key={a.code}
                          className="inline-flex max-w-full items-center truncate rounded-md px-2 py-0.5 text-[0.7rem] font-medium"
                          style={
                            a.severity === "critical"
                              ? {
                                  background:
                                    "color-mix(in oklch, var(--sev-critical) 13%, transparent)",
                                  color: "var(--sev-critical)",
                                }
                              : {
                                  background:
                                    "color-mix(in oklch, var(--sev-warning) 12%, transparent)",
                                  color: "var(--sev-warning)",
                                }
                          }
                        >
                          {a.message}
                        </span>
                      ))}
                    </span>
                    <GitGlyphs git={p.git} className="hidden md:inline-flex" />
                    <span className="hidden shrink-0 font-mono text-[0.7rem] tabular-nums text-muted-foreground sm:inline">
                      {relativeTime(p.updatedAt)}
                    </span>
                    <ChevronDown className="size-3.5 shrink-0 -rotate-90 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                </li>
              );
            })}
          </ul>
          {attention.length > PREVIEW ? (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="self-start rounded-md px-1.5 py-1 font-mono text-[0.68rem] text-muted-foreground transition-colors hover:text-foreground"
              aria-expanded={expanded}
            >
              {expanded
                ? "Show fewer"
                : `Show ${attention.length - PREVIEW} more`}
            </button>
          ) : null}
        </>
      )}
    </BentoTile>
  );
}
