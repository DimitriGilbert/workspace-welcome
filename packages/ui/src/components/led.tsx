import type { ComponentPropsWithoutRef } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@workspace-welcome/ui/lib/utils";

/**
 * Led — a project's status lamp: worst-severity tones, a lit "live" lamp,
 * or a hollow nominal one. Ported (read-only) from mb's `Led` + `LED_TAG`.
 *
 * The tone union here is Led's OWN structural union — it never imports
 * scan-metrics (no dependency between metrics and packages/ui in either
 * direction; the app part composes `ledState()` with this component).
 * `pulse` breathes the lamp; it is OFF under reduced motion.
 */

export type LedTone = "critical" | "warning" | "info" | "live" | "nominal";

export interface LedProps extends ComponentPropsWithoutRef<"span"> {
  tone: LedTone;
  /** Accessible/hover description; defaults to the tone's meaning. */
  label?: string;
  /** Mono glyphs riding beside the lamp (e.g. the tone's three-letter tag). */
  tag?: string;
  /** Breathe the lamp. Off under reduced motion; nominal never pulses. */
  pulse?: boolean;
}

export const MIN_CONTENT = { w: 8, h: 8 };

/** Default three-glyph tags per tone (mb's LED_TAG, canonical vocabulary). */
export const LED_TAG: Record<LedTone, string> = {
  critical: "CRT",
  warning: "WRN",
  info: "INF",
  live: "LIV",
  nominal: "NOM",
};

const LED_TOKEN: Record<LedTone, string> = {
  critical: "var(--sev-critical)",
  warning: "var(--sev-warning)",
  info: "var(--sev-info)",
  live: "var(--state-positive)",
  nominal: "transparent",
};

const LED_LABEL: Record<LedTone, string> = {
  critical: "Critical alert open",
  warning: "Warning alert open",
  info: "Info alert open",
  live: "Live — touched in the last 48 hours",
  nominal: "Nominal",
};

export function Led({
  tone,
  label,
  tag,
  pulse = false,
  className,
  ...rest
}: LedProps) {
  const reduced = useReducedMotion();
  const hollow = tone === "nominal";
  const breathe = pulse && !reduced && !hollow;
  const color = LED_TOKEN[tone];
  const text = label ?? LED_LABEL[tone];

  return (
    <span
      data-part="led"
      role="img"
      aria-label={text}
      title={text}
      className={cn("inline-flex items-center gap-1.5", className)}
      {...rest}
    >
      <motion.span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full",
          hollow && "border border-current text-muted-foreground/60",
        )}
        style={hollow ? undefined : { backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
        animate={breathe ? { opacity: [1, 0.45, 1] } : undefined}
        transition={
          breathe ? { duration: 2, repeat: Infinity, ease: "easeInOut" } : undefined
        }
      />
      {tag ? (
        <span
          aria-hidden
          className="font-mono text-[9px] leading-none tracking-[0.1em] text-muted-foreground"
        >
          {tag}
        </span>
      ) : null}
    </span>
  );
}
