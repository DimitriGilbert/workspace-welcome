import { ArrowRight, Pin } from "lucide-react";

import { cn } from "@workspace-welcome/ui/lib/utils";
import { dateTooltip, relativeTime } from "@/lib/format";
import type { AlertSeverity, Project } from "@workspace-welcome/api/lib/types";

import { severityRank, worstSeverity } from "./metrics";
import { ProjectActions } from "./project-actions";
import { PulseStrip } from "./pulse-strip";
import { useOpenDesignProject } from "./use-open-design-project";

const SEV_LABEL: Record<AlertSeverity, string> = {
  critical: "ERR",
  warning: "WRN",
  info: "INF",
};

/**
 * Severity-driven triage band at the top of the overview: every project
 * carrying an error or warn alert, worst first, one line each. The console
 * never renders this band when the fleet is clean.
 */
export function AttentionBoard({
  projects,
  now,
  onViewAll,
}: {
  projects: Project[];
  now: number;
  onViewAll: () => void;
}) {
  const openProject = useOpenDesignProject();
  const triaged = [...projects].sort(
    (a, b) =>
      severityRank(a) - severityRank(b) ||
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const PREVIEW = 6;
  const preview = triaged.slice(0, PREVIEW);
  const overflow = triaged.length - preview.length;
  const errors = triaged.filter((p) => worstSeverity(p) === "critical").length;
  const warns = triaged.length - errors;

  return (
    <section aria-label="Needs attention" className="mc-panel">
      <header className="flex items-center gap-3 border-b border-[var(--mc-line-strong)] px-4 py-2">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--sev-warning)]">
          Triage
        </h2>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {errors > 0 ? <span className="text-[var(--sev-critical)]">{errors} err</span> : null}
          {errors > 0 && warns > 0 ? <span className="mx-1.5 text-muted-foreground/40">/</span> : null}
          {warns > 0 ? <span>{warns} warn</span> : null}
        </span>
        <button
          type="button"
          onClick={onViewAll}
          className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground outline-none transition-colors hover:text-[var(--mc-accent)] focus-visible:ring-1 focus-visible:ring-ring"
        >
          Full triage <ArrowRight aria-hidden className="size-3" />
        </button>
      </header>
      <ul>
        {preview.map((p) => {
          const worst = worstSeverity(p);
          const primary = p.alerts.find((a) => a.severity === worst) ?? p.alerts[0];
          return (
            <li
              key={p.path}
              className="mc-row group flex items-center gap-3 border-b border-[var(--mc-line)] px-4 py-2 last:border-b-0"
              onClick={() => openProject(p.path)}
            >
              <span
                aria-hidden
                className={cn(
                  "w-7 shrink-0 font-mono text-[9px] tracking-[0.1em]",
                  worst === "critical" && "text-[var(--sev-critical)]",
                  worst === "warning" && "text-[var(--sev-warning)]",
                  worst === "info" && "text-[var(--sev-info)]",
                )}
              >
                {worst ? SEV_LABEL[worst] : ""}
              </span>
              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openProject(p.path);
                  }}
                  className="flex min-w-0 shrink-0 items-center gap-1.5 truncate text-left text-[13px] font-medium tracking-tight text-foreground outline-none transition-colors hover:text-[var(--mc-accent)] focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {p.name}
                  {p.pinned ? <Pin aria-hidden className="size-3 shrink-0 text-[var(--pinned-accent)]" /> : null}
                </button>
                <span className="truncate text-xs text-muted-foreground">{primary?.message}</span>
              </span>
              <PulseStrip project={p} now={now} className="hidden w-32 shrink-0 xl:inline-flex" />
              <span
                className="hidden w-24 shrink-0 whitespace-nowrap text-right font-mono text-[11px] tabular-nums text-muted-foreground md:block"
                title={dateTooltip(p.updatedAt)}
              >
                {relativeTime(p.updatedAt)}
              </span>
              <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100">
                <ProjectActions project={p} />
              </span>
            </li>
          );
        })}
      </ul>
      {overflow > 0 ? (
        <button
          type="button"
          onClick={onViewAll}
          className="w-full border-t border-[var(--mc-line)] px-4 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground outline-none transition-colors hover:text-[var(--mc-accent)] focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
        >
          +{overflow} more in full triage
        </button>
      ) : null}
    </section>
  );
}
