/**
 * McCommandBar — search + rescan + sync clock (verbatim port of the
 * design's `CommandBar`, `components/designs/mission-control/command-bar.tsx`).
 *
 * The filter text is THE workspace filter (`WorkspaceContext.filter`) — the
 * page header's console input and this bar bind the same state, so every
 * widget narrows together (§3.4). The count readout keeps filtering honest;
 * Escape clears the field (the design's guard); Rescan rides the provider's
 * `refresh()`. The sync clock reads the provider's data-epoch — never
 * wall-clock during render.
 *
 * The board places this on the canvas ground beside the masthead (the shell
 * chrome is stripped for the `command-bar` node in custom.css), completing
 * the design's sticky header band.
 */
import { useMemo } from "react";
import { RefreshCw, Search } from "lucide-react";

import { cn } from "@workspace-welcome/ui/lib/utils";

import { relativeTime } from "@/lib/format";
import { useWorkspace } from "@/widgets/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

import { fleetMatches } from "./fleet-ledger";

export function McCommandBar(_props: RegisteredWidgetProps) {
  const workspace = useWorkspace();

  const visibleCount = useMemo(
    () => workspace.projects.filter((p) => fleetMatches(p, workspace.filter)).length,
    [workspace.projects, workspace.filter],
  );

  const syncedLabel = (() => {
    const updatedAt = workspace.scan.dataUpdatedAt;
    if (updatedAt === undefined) return "pending";
    return workspace.now - updatedAt < 60_000
      ? "just now"
      : relativeTime(new Date(updatedAt).toISOString());
  })();
  const scanning = workspace.scan.isFetching;

  return (
    <WidgetShell className="h-full w-full">
      <div className="flex h-full min-h-0 w-full min-w-0 flex-wrap items-center content-center gap-x-4 gap-y-2.5 overflow-hidden px-4 pb-2 min-[2200px]:px-6">
        <div className="relative min-w-0">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={workspace.filter}
            onChange={(e) => workspace.setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") e.preventDefault();
            }}
            placeholder="Filter fleet"
            aria-label="Filter fleet"
            className="h-8 w-56 border border-(--mc-line-strong) bg-(--mc-panel) pr-10 pl-8 font-mono text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/75 focus-visible:border-(--mc-accent) md:w-64"
          />
          <kbd
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 border border-(--mc-line) bg-(--mc-panel) px-1 py-0.75 font-mono text-[9px] leading-none text-muted-foreground select-none"
          >
            /
          </kbd>
        </div>

        <span
          className="font-mono text-[10px] tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          {visibleCount}/{workspace.projects.length}
        </span>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground xl:inline">
            {scanning ? "Syncing…" : `Synced ${syncedLabel}`}
          </span>
          <button
            type="button"
            onClick={() => workspace.refresh()}
            disabled={scanning}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 border border-(--mc-line) px-2.5",
              "font-mono text-[10px] uppercase tracking-[0.14em] text-foreground outline-none transition-colors",
              "hover:border-(--mc-accent) hover:text-(--mc-accent)",
              "focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            <RefreshCw aria-hidden className={cn("size-3", scanning && "animate-spin")} />
            Rescan
          </button>
        </div>
      </div>
    </WidgetShell>
  );
}
