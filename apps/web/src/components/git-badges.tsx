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
 * Git status for a project card, as quiet text rather than chip boxes:
 * host, branch, ahead/behind, dirty count. The metadata reads like a line
 * of mono notes; color only marks ahead/behind direction.
 */
export function GitBadges({ git }: { git: GitInfo }) {
  if (!git.isRepo) {
    return <span className="text-[0.7rem] text-muted-foreground">not a repo</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[0.7rem] text-muted-foreground">
      {git.remote ? <span>{hostLabel(git.remote.host)}</span> : null}
      {git.branch ? (
        <span className="inline-flex max-w-[18ch] items-center gap-1 truncate font-mono">
          <GitFork className="size-3 shrink-0" />
          <span className="truncate">{git.branch}</span>
        </span>
      ) : null}
      {(git.ahead ?? 0) > 0 ? (
        <span className="inline-flex items-center gap-0.5 text-positive">
          <ArrowUp className="size-3" />
          {git.ahead}
        </span>
      ) : null}
      {(git.behind ?? 0) > 0 ? (
        <span
          className="inline-flex items-center gap-0.5"
          style={{ color: "var(--sev-warn)" }}
        >
          <ArrowDown className="size-3" />
          {git.behind}
        </span>
      ) : null}
      {(git.dirtyCount ?? 0) > 0 ? (
        <span>dirty {git.dirtyCount}</span>
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
  warn: "text-[var(--sev-warn)]",
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
  error: "bg-destructive/10 text-destructive",
  warn: "bg-[color-mix(in_oklch,var(--sev-warn)_12%,transparent)] text-[var(--sev-warn)]",
  info: "bg-muted text-muted-foreground",
};

/** Compact pill with full text — used in the needs-attention list. */
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
        "inline-flex h-4 items-center whitespace-nowrap px-1.5 text-[0.65rem] font-medium",
        SEVERITY_PILL_CLASS[severity],
      )}
    >
      {message}
    </span>
  );
}
