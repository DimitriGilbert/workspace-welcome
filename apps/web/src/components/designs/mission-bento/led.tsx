import type { Project } from "@workspace-welcome/api/lib/types";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { isHot, worstSeverity } from "./metrics";

export type LedTone = "error" | "warn" | "info" | "live" | "nominal";

/** Mono tag that rides beside the LED — the severity in three glyphs. */
export const LED_TAG: Record<LedTone, string> = {
  error: "ERR",
  warn: "WRN",
  info: "INF",
  live: "LIV",
  nominal: "NOM",
};

/**
 * A project's LED state: worst alert severity wins, then a lit green "live"
 * lamp when the project was touched in the last 48h, then a hollow nominal
 * lamp. The LED + tag pair is the per-project signal the owner reads at a
 * glance — no cryptic cursors.
 */
export function projectLed(p: Project, now: number): { tone: LedTone; label: string } {
  const worst = worstSeverity(p);
  if (worst === "critical") {
    return { tone: "error", label: "Error alert open" };
  }
  if (worst === "warning") {
    return { tone: "warn", label: "Warning alert open" };
  }
  if (worst === "info") {
    return { tone: "info", label: "Info alert open" };
  }
  if (isHot(p, now)) {
    return { tone: "live", label: "Live — touched in the last 48 hours" };
  }
  return { tone: "nominal", label: "Nominal" };
}

export function Led({
  tone,
  label,
  className,
}: {
  tone: LedTone;
  label?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      title={label}
      className={cn("mb-led", `mb-led--${tone}`, className)}
    />
  );
}
