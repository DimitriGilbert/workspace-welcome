/**
 * Bento's signals row — ports of the design's `attention-tile.tsx` (the
 * featured panel: every project with an error or warning alert, worst
 * first, rows opening the project page) and `severity-tile.tsx` (the
 * severity split plus the uncommitted-work leaders). Data derives from
 * `useWorkspace()` via the shared scan-metrics module (the consolidations
 * of the design's own derivations); pixels are the design's tile markup.
 */
import { useMemo, useState } from "react";
import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  OctagonAlert,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useNavigate } from "@tanstack/react-router";

import { relativeTime } from "@/lib/format";
import { attentionProjects, dirtyLeaders, severityCounts } from "@/lib/scan-metrics";
import type { SeverityCounts } from "@/lib/scan-metrics";

import { useWorkspace } from "@/widgets/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";

import { BentoTile, GitGlyphs, RollNumber } from "../bits";

/** Deep-link into this theme's project page (the top-level splat route). */
function useOpenBentoProject() {
  const navigate = useNavigate();
  return (path: string) => {
    void navigate({
      to: "/project/$",
      params: { _splat: path.replace(/^\/+/, "") },
      search: { preset: "bento" },
    });
  };
}

/* -------------------------------------------------------- BentoAttention */

const PREVIEW = 5;

const SEVERITY_ICON: Record<"critical" | "warning", LucideIcon> = {
  critical: OctagonAlert,
  warning: TriangleAlert,
};

export function BentoAttention(_props: RegisteredWidgetProps) {
  const { projects } = useWorkspace();
  const openProject = useOpenBentoProject();
  const [expanded, setExpanded] = useState(false);

  const attention = useMemo(() => attentionProjects(projects), [projects]);

  const errors = attention.filter((p) => p.alerts.some((a) => a.severity === "critical")).length;
  const warns = attention.length - errors;
  const visible = expanded ? attention : attention.slice(0, PREVIEW);

  return (
    <BentoTile className="flex h-full min-h-0 w-full flex-col gap-3 p-5">
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
          of {projects.length} projects
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
          <ul className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {visible.map((p) => {
              const blocking = p.alerts.filter(
                (a) => a.severity === "critical" || a.severity === "warning",
              );
              const worst = blocking.some((a) => a.severity === "critical")
                ? "critical"
                : "warning";
              const Icon = SEVERITY_ICON[worst];
              return (
                <li key={p.path} className="flex min-h-9 flex-1">
                  <button
                    type="button"
                    onClick={() => openProject(p.path)}
                    className="group flex w-full min-w-0 items-center gap-3 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-white/[0.05]"
                  >
                    <Icon
                      className="size-4 shrink-0"
                      style={{ color: worst === "critical" ? "var(--sev-critical)" : "var(--sev-warning)" }}
                    />
                    {/* Row columns size off the TILE via the b-att-* container
                        classes (custom.css) — the ledger stays dense and
                        content-sized at any board width instead of stranding
                        a mid-row void when the box outgrows the content. */}
                    <span className="b-att-name shrink-0 truncate text-[0.82rem] font-semibold tracking-tight">
                      {p.name}
                    </span>
                    {/* Flexible column: the alert chips absorb the remaining
                        width on one dense line (truncate, no wrap) — the row
                        reads edge to edge with no mid-row voids. Below a
                        ~360px box the chips fall away entirely (b-att-chips,
                        custom.css): a 40px chip of ellipsis is noise. */}
                    <span className="b-att-chips">
                      {blocking.map((a) => (
                        <span
                          key={a.code}
                          className="inline-flex min-w-0 items-center truncate rounded-md px-2 py-0.5 text-[0.7rem] font-medium"
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
                          <span className="truncate">{a.message}</span>
                        </span>
                      ))}
                    </span>
                    <span className="b-att-glyphs">
                      <GitGlyphs git={p.git} />
                    </span>
                    <span className="b-att-age shrink-0 font-mono text-[0.7rem] tabular-nums text-muted-foreground">
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
              {expanded ? "Show fewer" : `Show ${attention.length - PREVIEW} more`}
            </button>
          ) : null}
        </>
      )}
    </BentoTile>
  );
}

/* ---------------------------------------------------------- BentoSignals */

export function BentoSignals(_props: RegisteredWidgetProps) {
  const { projects } = useWorkspace();
  const counts: SeverityCounts = useMemo(() => severityCounts(projects), [projects]);
  const total = counts.critical + counts.warning + counts.info;
  const leaders = useMemo(() => dirtyLeaders(projects, 6), [projects]);
  const maxDirty = leaders[0]?.dirty ?? 1;

  return (
    <BentoTile className="flex h-full min-h-0 w-full flex-col gap-3 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="b-label">Signal mix</h2>
        <span className="font-mono text-[0.68rem] text-muted-foreground">
          {total} {total === 1 ? "alert" : "alerts"} · {leaders.length} dirty
        </span>
      </div>

      {total === 0 ? (
        <div
          className="flex items-center gap-2 rounded-lg border border-border bg-white/[0.02] px-3 py-2 text-xs text-muted-foreground"
          style={{ borderColor: "color-mix(in oklch, var(--state-positive) 30%, transparent)" }}
        >
          <span className="size-2 shrink-0 rounded-full" style={{ background: "var(--state-positive)" }} />
          No alerts in the current view — every scan signal is clean.
        </div>
      ) : (
        <>
          <div
            className="b-segbar"
            role="img"
            aria-label={`${counts.critical} errors, ${counts.warning} warnings, ${counts.info} info alerts`}
          >
            {counts.critical > 0 ? (
              <span style={{ flexGrow: counts.critical, background: "var(--sev-critical)" }} />
            ) : null}
            {counts.warning > 0 ? (
              <span style={{ flexGrow: counts.warning, background: "var(--sev-warning)" }} />
            ) : null}
            {counts.info > 0 ? (
              <span style={{ flexGrow: counts.info, background: "var(--sev-info)" }} />
            ) : null}
          </div>

          <dl className="grid grid-cols-3 gap-2">
            <SeverityStat icon={OctagonAlert} label="Errors" count={counts.critical} color="var(--sev-critical)" />
            <SeverityStat icon={TriangleAlert} label="Warnings" count={counts.warning} color="var(--sev-warning)" />
            <SeverityStat icon={CircleAlert} label="Info" count={counts.info} color="var(--sev-info)" />
          </dl>
        </>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2 border-t border-border pt-3">
        <h3 className="b-label">Uncommitted work</h3>
        {leaders.length === 0 ? (
          <p className="flex flex-1 items-center text-xs text-muted-foreground">
            Nothing dirty. Working trees are clean.
          </p>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col justify-evenly gap-1.5">
            {leaders.map((l) => (
              <li key={l.path} className="flex items-center gap-2.5">
                <span className="w-24 shrink-0 truncate text-xs sm:w-32" title={l.name}>
                  {l.name}
                </span>
                <span className="b-dirtybar min-w-0 flex-1">
                  <span style={{ width: `${Math.max((l.dirty / maxDirty) * 100, 8)}%` }} />
                </span>
                <span className="b-num w-7 shrink-0 text-right text-sm">{l.dirty}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </BentoTile>
  );
}

function SeverityStat({
  icon: Icon,
  label,
  count,
  color,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div
      className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-white/[0.02] px-2.5 py-2"
      title={`${count} ${label.toLowerCase()}`}
    >
      <dt className="flex items-center gap-1.5 text-[0.62rem] text-muted-foreground">
        <Icon className="size-3 shrink-0" style={{ color }} />
        {label}
      </dt>
      <dd className="b-num text-lg" style={{ color: count > 0 ? color : "var(--muted-foreground)" }}>
        {count}
      </dd>
    </div>
  );
}
