/**
 * Small shared visual atoms for the Meadow concept: section intros (icon
 * chip + title + count), pastel severity dots, soft data chips, and the
 * SoftNumber — a quiet motion fade for values that change in place.
 * Keeping them in one place gives every new module that slots in the same
 * voice.
 */

import type { CSSProperties, ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { LucideIcon } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace-welcome/ui/components/tooltip";
import type { AlertSeverity, HealthAlert } from "@workspace-welcome/api/lib/types";

/** Accent register for icon chips and chips; values are meadow tokens. */
export type Tone = "green" | "honey" | "sky" | "quiet";

export const TONE_COLOR: Record<Tone, string> = {
  green: "var(--recency-fresh)",
  honey: "var(--pinned-accent)",
  sky: "var(--sev-info)",
  quiet: "var(--muted-foreground)",
};

export const chipStyle = (tone: Tone): CSSProperties => ({
  color: TONE_COLOR[tone],
  backgroundColor: `color-mix(in oklch, ${TONE_COLOR[tone]} 11%, transparent)`,
});

interface SectionIntroProps {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  count?: number;
  /** Optional trailing slot (sort hints, actions). */
  trailing?: ReactNode;
  id?: string;
}

/** Section heading: a tinted icon chip, a quiet title, and a count pill. */
export function SectionIntro({
  icon: Icon,
  tone,
  title,
  count,
  trailing,
  id,
}: SectionIntroProps) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span
        aria-hidden
        className="flex size-7 items-center justify-center rounded-full"
        style={chipStyle(tone)}
      >
        <Icon className="size-3.5" />
      </span>
      <h2
        id={id}
        className="text-sm font-semibold tracking-tight text-foreground"
      >
        {title}
      </h2>
      {count !== undefined ? (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
          {count}
        </span>
      ) : null}
      {trailing ? (
        <div className="ml-auto flex items-center gap-2">{trailing}</div>
      ) : null}
    </div>
  );
}

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  error: "var(--sev-error)",
  warn: "var(--sev-warn)",
  info: "var(--sev-info)",
};

/**
 * Color-coded state at a glance: one pastel dot per alert, message on hover.
 * Empty projects render nothing — calm means silence when there's news.
 */
export function AlertDots({ alerts }: { alerts: HealthAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <TooltipProvider delay={150}>
      <span className="flex items-center gap-1">
        {alerts.map((a) => (
          <Tooltip key={a.code}>
            <TooltipTrigger
              render={
                <span
                  className="size-2 cursor-default rounded-full"
                  style={{ backgroundColor: SEVERITY_COLOR[a.severity] }}
                />
              }
            />
            <TooltipContent>{a.message}</TooltipContent>
          </Tooltip>
        ))}
      </span>
    </TooltipProvider>
  );
}

interface ChipProps {
  tone: Tone;
  title?: string;
  children: ReactNode;
}

/** Rounded pill for one numeric git signal; only rendered when nonzero. */
export function Chip({ tone, title, children }: ChipProps) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 tabular-nums"
      style={chipStyle(tone)}
    >
      {children}
    </span>
  );
}

/**
 * A number that fades gently when its value changes — no bounce, no slide
 * circus. Renders inline; honors prefers-reduced-motion by swapping
 * instantly.
 */
export function SoftNumber({
  value,
  className,
  style,
}: {
  value: string | number;
  className?: string;
  style?: CSSProperties;
}) {
  const reduced = useReducedMotion();
  const key = String(value);
  if (reduced) {
    return (
      <span className={className} style={style}>
        {value}
      </span>
    );
  }
  return (
    <span className="relative inline-flex overflow-visible tabular-nums">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={key}
          className={className}
          style={style}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
