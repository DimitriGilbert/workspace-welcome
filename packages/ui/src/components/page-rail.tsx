import type { ReactNode } from "react";

import { cn } from "@workspace-welcome/ui/lib/utils";

/** Same content rail as apps/web home / project pages. */
export const pageRailClassName =
  "relative mx-auto w-full max-w-[1480px] px-5 sm:px-8 lg:px-10";

export function PageRail({
  children,
  className,
  ambience = false,
}: {
  children: ReactNode;
  className?: string;
  /** Terracotta wash behind the masthead (home). */
  ambience?: boolean;
}) {
  return (
    <div className={cn(pageRailClassName, className)}>
      {ambience ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-20 h-80"
          style={{
            background:
              "radial-gradient(600px 260px at 50% 0%, color-mix(in oklch, var(--primary) 7%, transparent), transparent 72%)",
          }}
        />
      ) : null}
      {children}
    </div>
  );
}

/** Masthead row: brand left, trailing actions right — matches apps/web. */
export function MastheadRow({
  brand,
  trailing,
  className,
}: {
  brand: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative flex flex-wrap items-center gap-x-4 gap-y-2", className)}>
      {brand}
      {trailing}
    </div>
  );
}
