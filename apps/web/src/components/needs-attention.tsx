import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Card, CardContent } from "@workspace-welcome/ui/components/card";
import type { Project } from "@workspace-welcome/api/lib/types";

import { AlertBadge } from "@/components/git-badges";
import { relativeTime } from "@/lib/format";
import { useOpenProject } from "@/lib/open-project";

interface NeedsAttentionProps {
  projects: Project[];
}

/**
 * Foldable list of projects with warn/error alerts, ordered by latest update.
 * Collapsible state is local (not persisted) — it re-expands each session so
 * you don't miss issues that resurface.
 *
 * Styled as a self-contained panel with the warn accent so it stands apart
 * from the recency grid without competing with it.
 */
export function NeedsAttention({ projects }: NeedsAttentionProps) {
  const openProject = useOpenProject();
  const [collapsed, setCollapsed] = useState(false);
  // Cap the number of rows shown by default so a huge backlog doesn't
  // swallow the page. The rest reveal on demand.
  const PREVIEW = 6;
  const [expanded, setExpanded] = useState(false);

  const flagged = projects
    .filter((p) =>
      p.alerts.some((a) => a.severity === "error" || a.severity === "warn"),
    )
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

  if (flagged.length === 0) return null;

  const errorCount = flagged.filter((p) =>
    p.alerts.some((a) => a.severity === "error"),
  ).length;

  return (
    <Card
      size="sm"
      className="border-foreground/10"
      style={{ boxShadow: "inset 3px 0 0 0 var(--sev-warn)" }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
        aria-expanded={!collapsed}
      >
        <span className="flex items-center gap-2.5">
          {collapsed ? (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          )}
          <span className="flex items-center gap-2">
            <span
              className="font-mono text-[0.65rem] font-medium uppercase tracking-[0.22em]"
              style={{ color: "var(--sev-warn)" }}
            >
              Needs attention
            </span>
            <span className="font-semibold tabular-nums">{flagged.length}</span>
            {errorCount > 0 ? (
              <span
                className="rounded-none px-1.5 py-0.5 font-mono text-[0.6rem] font-medium uppercase tracking-wider"
                style={{
                  color: "var(--sev-error)",
                  backgroundColor: "color-mix(in oklch, var(--sev-error) 14%, transparent)",
                }}
              >
                {errorCount} errors
              </span>
            ) : null}
          </span>
        </span>
      </button>
      {!collapsed ? (
        <CardContent className="flex flex-col gap-0.5">
          {(expanded ? flagged : flagged.slice(0, PREVIEW)).map((p) => {
            const isError = p.alerts.some((a) => a.severity === "error");
            return (
              <button
                key={p.path}
                type="button"
                onClick={() => openProject(p.path)}
                className="group flex items-center justify-between gap-3 px-2 py-2 text-left transition-colors hover:bg-muted"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: isError
                          ? "var(--sev-error)"
                          : "var(--sev-warn)",
                      }}
                    />
                    <span className="truncate text-sm font-medium">{p.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {relativeTime(p.updatedAt)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 pl-3.5">
                    {p.alerts.map((a) => (
                      <AlertBadge
                        key={a.code}
                        severity={a.severity}
                        message={a.message}
                      />
                    ))}
                  </div>
                </div>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            );
          })}
          {flagged.length > PREVIEW ? (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="px-2 py-2 text-left font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {expanded
                ? `Show fewer`
                : `+ ${flagged.length - PREVIEW} more need attention`}
            </button>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
