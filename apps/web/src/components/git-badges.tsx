import { ArrowDown, ArrowUp, GitFork } from "lucide-react";

import { Badge } from "@workspace-welcome/ui/components/badge";
import { cn } from "@workspace-welcome/ui/lib/utils";
import type { GitInfo } from "@workspace-welcome/api/lib/types";

import { hostLabel } from "@/lib/icons";

/**
 * The compact git status badges shown on a project card:
 * host, branch, ahead/behind, dirty count.
 */
export function GitBadges({ git }: { git: GitInfo }) {
  if (!git.isRepo) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        not a repo
      </Badge>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {git.remote ? (
        <Badge variant="secondary">{hostLabel(git.remote.host)}</Badge>
      ) : null}
      {git.branch ? (
        <Badge variant="outline" className="font-mono">
          <GitFork className="size-3" />
          {git.branch}
        </Badge>
      ) : null}
      {(git.ahead ?? 0) > 0 ? (
        <Badge variant="secondary" className="text-emerald-500">
          <ArrowUp className="size-3" />
          {git.ahead}
        </Badge>
      ) : null}
      {(git.behind ?? 0) > 0 ? (
        <Badge variant="secondary" className="text-amber-500">
          <ArrowDown className="size-3" />
          {git.behind}
        </Badge>
      ) : null}
      {(git.dirtyCount ?? 0) > 0 ? (
        <Badge variant="secondary" className="text-muted-foreground">
          dirty {git.dirtyCount}
        </Badge>
      ) : null}
    </div>
  );
}

const SEVERITY_CLASS: Record<string, string> = {
  error: "bg-destructive/15 text-destructive ring-destructive/30",
  warn: "bg-amber-500/15 text-amber-500 ring-amber-500/30",
  info: "bg-muted text-muted-foreground ring-border",
};

/** Pill for a single health alert. */
export function AlertBadge({
  severity,
  message,
}: {
  severity: "error" | "warn" | "info";
  message: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-none px-2 text-xs font-medium ring-1",
        SEVERITY_CLASS[severity],
      )}
    >
      {message}
    </span>
  );
}
