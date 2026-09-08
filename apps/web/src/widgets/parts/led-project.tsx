import type { ComponentPropsWithoutRef } from "react";
import type { Project } from "@workspace-welcome/api/lib/types";
import { LED_TAG, Led } from "@workspace-welcome/ui/components/led";

import { ledState } from "@/lib/scan-metrics";

import { useWorkspace } from "@/lib/contexts/workspace-context";

/**
 * ProjectLed — the 5-tone status lamp composition (master-plan ruling 4):
 * `ledState(project, useWorkspace().now)` → ui `<Led>`. The severity→tone
 * derivation lives in scan-metrics, the pixels in packages/ui, and THIS part
 * is the only bridge between them (no imports in either direction). Retires
 * the third naming generation (StatusLed/projectLed/worstSeverity copies).
 */

export interface ProjectLedProps extends ComponentPropsWithoutRef<"span"> {
  project: Project;
  /** Show the tone's three-letter mono tag (CRT/WRN/INF/LIV/NOM). */
  tag?: boolean;
  /** Breathe the lamp while it isn't nominal (off under reduced motion). */
  pulse?: boolean;
}

export function ProjectLed({
  project,
  tag,
  pulse = false,
  className,
  ...rest
}: ProjectLedProps) {
  const { now } = useWorkspace();
  const state = ledState(project, now);

  return (
    <Led
      tone={state.tone}
      label={state.label}
      tag={tag ? LED_TAG[state.tone] : undefined}
      pulse={pulse}
      className={className}
      {...rest}
    />
  );
}
