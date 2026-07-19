import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Card, CardContent } from "@workspace-welcome/ui/components/card";
import type { Project } from "@workspace-welcome/api/lib/types";

import { AlertBadge } from "@/components/git-badges";
import { relativeTime } from "@/lib/format";

interface NeedsAttentionProps {
  projects: Project[];
  onSelect: (project: Project) => void;
}

/**
 * Foldable list of projects with warn/error alerts, ordered by latest update.
 * Collapsible state is local (not persisted) — it re-expands each session so
 * you don't miss issues that resurface.
 */
export function NeedsAttention({ projects, onSelect }: NeedsAttentionProps) {
  const [collapsed, setCollapsed] = useState(false);

  const flagged = projects
    .filter((p) =>
      p.alerts.some((a) => a.severity === "error" || a.severity === "warn"),
    )
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

  if (flagged.length === 0) return null;

  return (
    <Card size="sm">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/40"
        aria-expanded={!collapsed}
      >
        <span className="flex items-center gap-2 text-xs font-medium">
          {collapsed ? (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          )}
          Needs attention
          <span className="text-muted-foreground">({flagged.length})</span>
        </span>
      </button>
      {!collapsed ? (
        <CardContent className="flex flex-col gap-1">
          {flagged.map((p) => (
            <button
              key={p.path}
              type="button"
              onClick={() => onSelect(p)}
              className="group flex items-center justify-between gap-2 rounded-none px-2 py-1.5 text-left hover:bg-muted"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-medium">{p.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {relativeTime(p.updatedAt)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
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
          ))}
        </CardContent>
      ) : null}
    </Card>
  );
}
