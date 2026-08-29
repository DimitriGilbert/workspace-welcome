import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

import type { Project } from "@workspace-welcome/api/lib/types";

import { AlertBadge } from "@/components/git-badges";
import { relativeTime } from "@/lib/format";
import { useOpenProject } from "@/lib/open-project";

interface NeedsAttentionProps {
  projects: Project[];
}

/**
 * The one warm surface on the page: a slim amber-tinted band listing projects
 * with warn/error alerts, newest first. One line per project. Collapsible
 * (local state, re-expands each session so resurfacing issues aren't missed)
 * with a preview cap so a big backlog doesn't swallow the page.
 */
export function NeedsAttention({ projects }: NeedsAttentionProps) {
  const openProject = useOpenProject();
  const [collapsed, setCollapsed] = useState(false);
  const PREVIEW = 5;
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
    <section
      className="flex flex-col border"
      style={{
        borderColor: "color-mix(in oklch, var(--sev-warn) 25%, transparent)",
        background:
          "color-mix(in oklch, var(--sev-warn) 5%, transparent)",
      }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left transition-colors hover:text-foreground"
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <ChevronRight className="size-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-3.5 text-muted-foreground" />
        )}
        <AlertTriangle
          className="size-3.5"
          style={{ color: "var(--sev-warn)" }}
        />
        <span className="text-[0.8rem] font-medium tracking-tight">
          Needs attention
        </span>
        <span
          className="font-mono text-[0.7rem] tabular-nums"
          style={{ color: "var(--sev-warn)" }}
        >
          {flagged.length}
        </span>
        {errorCount > 0 ? (
          <span
            className="ml-1 px-1.5 py-px font-mono text-[0.6rem] font-medium uppercase tracking-wider"
            style={{ color: "var(--sev-error)" }}
          >
            {errorCount} {errorCount === 1 ? "error" : "errors"}
          </span>
        ) : null}
      </button>
      {!collapsed ? (
        <div className="flex flex-col">
          {(expanded ? flagged : flagged.slice(0, PREVIEW)).map((p) => {
            return (
              <button
                key={p.path}
                type="button"
                onClick={() => openProject(p.path)}
                className="group flex items-center gap-3 px-3 py-1.5 text-left transition-colors hover:bg-foreground/[0.04]"
              >
                <span className="w-40 shrink-0 truncate text-[0.8rem] font-medium sm:w-56">
                  {p.name}
                </span>
                <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {p.alerts.map((a) => (
                    <AlertBadge
                      key={a.code}
                      severity={a.severity}
                      message={a.message}
                    />
                  ))}
                </span>
                <span className="shrink-0 font-mono text-[0.7rem] tabular-nums text-muted-foreground">
                  {relativeTime(p.updatedAt)}
                </span>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            );
          })}
          {flagged.length > PREVIEW ? (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="px-3 py-1.5 text-left font-mono text-[0.7rem] text-muted-foreground transition-colors hover:text-foreground"
            >
              {expanded ? "Show fewer" : `Show ${flagged.length - PREVIEW} more`}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
