import type { ReactNode } from "react";

import { cn } from "@workspace-welcome/ui/lib/utils";

/**
 * Section anchor: a small uppercase eyebrow (accent dot + label + optional
 * count) that gives the page rhythm without resorting to boxes everywhere.
 *
 * The `accent` prop tints the eyebrow rule + label with a section-specific
 * hue so sections are visually distinct at a glance.
 */
type Accent = "neutral" | "recency" | "pinned" | "alert";

const ACCENT_VAR: Record<Accent, string> = {
  neutral: "var(--eyebrow)",
  recency: "var(--recency-fresh)",
  pinned: "var(--pinned-accent)",
  alert: "var(--sev-warn)",
};

interface SectionHeaderProps {
  eyebrow: string;
  count?: number;
  accent?: Accent;
  description?: ReactNode;
  /** Right-aligned actions (buttons, etc). */
  trailing?: ReactNode;
  className?: string;
}

export function SectionHeader({
  eyebrow,
  count,
  accent = "neutral",
  description,
  trailing,
  className,
}: SectionHeaderProps) {
  const accentVar = ACCENT_VAR[accent];
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{
              backgroundColor: accentVar,
              boxShadow: `0 0 0 3px color-mix(in oklch, ${accentVar} 22%, transparent)`,
            }}
          />
          <span
            className="font-mono text-[0.65rem] font-medium uppercase tracking-[0.22em]"
            style={{ color: accentVar }}
          >
            {eyebrow}
            {typeof count === "number" ? (
              <span className="ml-2 tabular-nums opacity-60">{count}</span>
            ) : null}
          </span>
        </div>
        {description ? (
          <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}
