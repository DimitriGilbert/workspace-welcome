import { ChevronRight } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace-welcome/ui/components/card";
import type { Project } from "@workspace-welcome/api/lib/types";

import { AlertBadge } from "@/components/git-badges";

interface NeedsAttentionProps {
  projects: Project[];
  onSelect: (project: Project) => void;
}

/** Compact list of projects with warn/error alerts. Clickable to open detail. */
export function NeedsAttention({ projects, onSelect }: NeedsAttentionProps) {
  const flagged = projects.filter((p) =>
    p.alerts.some((a) => a.severity === "error" || a.severity === "warn"),
  );
  if (flagged.length === 0) return null;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-xs text-muted-foreground">
          Needs attention
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {flagged.map((p) => (
          <button
            key={p.path}
            type="button"
            onClick={() => onSelect(p)}
            className="group flex items-center justify-between gap-2 rounded-none px-2 py-1.5 text-left hover:bg-muted"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate text-xs font-medium">{p.name}</span>
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
    </Card>
  );
}
