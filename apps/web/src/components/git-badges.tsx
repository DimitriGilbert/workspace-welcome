import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CloudOff,
  GitFork,
  GitGraph,
  Inbox,
  Split,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@workspace-welcome/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace-welcome/ui/components/tooltip";
import { cn } from "@workspace-welcome/ui/lib/utils";
import type { AlertCode, AlertSeverity, GitInfo } from "@workspace-welcome/api/lib/types";

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

const ALERT_META: Record<
  AlertCode,
  { icon: LucideIcon; severity: AlertSeverity; label: string }
> = {
  "no-remote": { icon: CloudOff, severity: "warn", label: "No remote configured" },
  diverged: {
    icon: Split,
    severity: "error",
    label: "Diverged from upstream",
  },
  behind: { icon: ArrowDown, severity: "warn", label: "Behind upstream" },
  unpushed: { icon: ArrowUp, severity: "info", label: "Unpushed commits" },
  dirty: { icon: GitGraph, severity: "info", label: "Uncommitted changes" },
  "stale-wip": {
    icon: AlertTriangle,
    severity: "warn",
    label: "Stale WIP (3+ weeks)",
  },
  dormant: { icon: Inbox, severity: "info", label: "Dormant (90+ days)" },
};

const SEVERITY_CLASS: Record<AlertSeverity, string> = {
  error: "text-destructive",
  warn: "text-amber-500",
  info: "text-muted-foreground",
};

/**
 * Icon-only health alerts for the dense project-card view; full text appears
 * on hover via a tooltip. Keeps the card scannable.
 */
export function AlertIcons({
  alerts,
}: {
  alerts: { code: AlertCode; message: string; severity: AlertSeverity }[];
}) {
  if (alerts.length === 0) return null;
  return (
    <TooltipProvider delay={200}>
      <div className="flex items-center gap-1.5">
        {alerts.map((a) => {
          const meta = ALERT_META[a.code];
          const Icon = meta.icon;
          return (
            <Tooltip key={a.code}>
              <TooltipTrigger
                render={
                  <span
                    className={cn(
                      "inline-flex cursor-default",
                      SEVERITY_CLASS[a.severity],
                    )}
                  />
                }
              >
                <Icon className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>{a.message}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

const SEVERITY_PILL_CLASS: Record<string, string> = {
  error: "bg-destructive/15 text-destructive ring-destructive/30",
  warn: "bg-amber-500/15 text-amber-500 ring-amber-500/30",
  info: "bg-muted text-muted-foreground ring-border",
};

/** Pill with full text — used in the needs-attention list where space allows. */
export function AlertBadge({
  severity,
  message,
}: {
  severity: AlertSeverity;
  message: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-none px-2 text-xs font-medium ring-1",
        SEVERITY_PILL_CLASS[severity],
      )}
    >
      {message}
    </span>
  );
}
