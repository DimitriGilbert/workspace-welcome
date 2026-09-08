import { cn } from "@workspace-welcome/ui/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace-welcome/ui/components/tooltip";

/**
 * SeverityDots — color-coded state at a glance: one pastel dot per alert,
 * message on hover. Ported (read-only) from meadow's `AlertDots` with a
 * structural prop shape (no api import — packages/ui is props-in only).
 * Empty input renders nothing: calm means silence when there's news.
 */

export interface SeverityDot {
  /** Stable key (e.g. the alert code). */
  id: string;
  severity: "critical" | "warning" | "info";
  message?: string;
}

export interface SeverityDotsProps {
  dots: SeverityDot[];
  className?: string;
}

export const MIN_CONTENT = { w: 12, h: 8 };

const SEVERITY_TOKEN: Record<SeverityDot["severity"], string> = {
  critical: "var(--sev-critical)",
  warning: "var(--sev-warning)",
  info: "var(--sev-info)",
};

export function SeverityDots({ dots, className }: SeverityDotsProps) {
  if (dots.length === 0) return null;
  return (
    <TooltipProvider delay={150}>
      <span data-part="severity-dots" className={cn("flex items-center gap-1", className)}>
        {dots.map((dot) => (
          <Tooltip key={dot.id}>
            <TooltipTrigger
              render={
                <span
                  className="size-2 shrink-0 cursor-default rounded-full"
                  style={{ backgroundColor: SEVERITY_TOKEN[dot.severity] }}
                />
              }
            />
            <TooltipContent>{dot.message ?? dot.severity}</TooltipContent>
          </Tooltip>
        ))}
      </span>
    </TooltipProvider>
  );
}
