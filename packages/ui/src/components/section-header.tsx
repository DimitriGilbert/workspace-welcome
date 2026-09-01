import type { ReactNode } from "react";

import { cn } from "@workspace-welcome/ui/lib/utils";

/**
 * Section anchor: a plain heading with an optional count. No eyebrows, no
 * accent dots — the section's position on the page already says what it is.
 */
export function SectionHeader({
  title,
  count,
  description,
  trailing,
  className,
}: {
  title: string;
  count?: number;
  description?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-3">
          <h2 className="text-[0.8rem] font-medium tracking-tight">
            {title}
            {typeof count === "number" ? (
              <span className="ml-2 font-mono text-[0.7rem] font-normal tabular-nums text-muted-foreground">
                {count}
              </span>
            ) : null}
          </h2>
          <div
            aria-hidden
            className="h-px flex-1 bg-gradient-to-r from-foreground/15 to-transparent"
          />
        </div>
        {description ? (
          <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}
