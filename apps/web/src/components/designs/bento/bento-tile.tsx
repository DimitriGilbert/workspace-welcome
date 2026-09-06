import type { HTMLAttributes } from "react";

import { cn } from "@workspace-welcome/ui/lib/utils";

interface BentoTileProps extends HTMLAttributes<HTMLDivElement> {
  /** Width class from bento.css (.sp-band, .sp-health, .sp-pulse, …).
     Omit when a parent cell owns the grid placement (mosaic tiles). */
  span?: string;
  /** Whole tile is a clickable/keyboard-activatable surface. */
  action?: boolean;
  pinned?: boolean;
}

/**
 * Glazed surface unit of the mosaic. Flat at rest — feedback lives in the
 * hover/focus states. Pure presentation: data, actions and semantics are
 * composed by the specific tiles.
 */
export function BentoTile({
  span,
  action = false,
  pinned = false,
  className,
  ...rest
}: BentoTileProps) {
  return (
    <div
      className={cn(
        "b-tile",
        span,
        action && "b-tile--action",
        pinned && "b-tile--pinned",
        className,
      )}
      {...rest}
    />
  );
}
