import type { Project } from "@workspace-welcome/api/lib/types";
import { PulseStrip } from "@workspace-welcome/ui/components/pulse-strip";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { pulseCells } from "@/lib/scan-metrics";

import { useWorkspace } from "@/widgets/contexts/workspace-context";

/**
 * ProjectPulse — a project's activity sparkline (master plan §3.5): the pure
 * `pulseCells` derivation sampled at THE workspace clock (`useWorkspace().now`
 * — one tick per data epoch, never wall-clock during render) feeding the ui
 * `PulseStrip`. The project comes in as a prop (tiles address their project);
 * the clock comes from context — no props drilling for time.
 */

export interface ProjectPulseProps {
  project: Project;
  /** Bucket count across the 90-day freshness window (default 24). */
  cells?: number;
  /** Strip palette: accent (default) or severity. */
  tone?: "accent" | "sev";
  /** Accessible description; omit for an aria-hidden decoration strip. */
  ariaLabel?: string;
  className?: string;
}

export function ProjectPulse({
  project,
  cells = 24,
  tone = "accent",
  ariaLabel,
  className,
}: ProjectPulseProps) {
  const { now } = useWorkspace();
  const cellsData = pulseCells(project, cells, now);

  return (
    <span className={cn("flex min-h-0 min-w-0 flex-col justify-center", className)}>
      <PulseStrip cells={cellsData} tone={tone} ariaLabel={ariaLabel ?? undefined} />
    </span>
  );
}
