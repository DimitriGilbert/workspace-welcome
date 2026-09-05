/**
 * McCommandBar — search + rescan + sync clock (T2 port of the design's
 * `CommandBar`, `components/designs/mission-control/command-bar.tsx`).
 *
 * The filter text is THE workspace filter (`WorkspaceContext.filter`) — the
 * page header's console input and this bar bind the same state, so every
 * widget narrows together (§3.4). The count readout keeps filtering honest;
 * Escape clears the field (the design's guard); Rescan rides the provider's
 * `refresh()` (the scan invalidation, force stays a server concern). The
 * sync clock reads the provider's data-epoch — never wall-clock during
 * render.
 *
 * Rungs: `2x1` the full bar (field, count, sync clock, rescan); smaller
 * rungs collapse to the field + count. Icons are dropped in the port — the
 * design's mono-caps vocabulary carries the controls without them.
 */
import { useMemo } from "react";

import { relativeTime } from "@/lib/format";
import { useWorkspace } from "@/widgets/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

import { fleetMatches } from "./fleet-ledger";

const INPUT_CLASS =
  "h-8 w-full min-w-0 border border-(--mc-line) bg-transparent px-2 font-mono text-[11px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-(--mc-accent)";

const BUTTON_CLASS =
  "inline-flex h-8 shrink-0 items-center border border-(--mc-line) px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground outline-none transition-colors hover:border-(--mc-accent) hover:text-(--mc-accent) focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

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

  const field = (
    <div className="relative min-w-0 flex-1">
      <input
        type="search"
        value={workspace.filter}
        onChange={(e) => workspace.setFilter(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") e.preventDefault();
        }}
        placeholder="Filter fleet"
        aria-label="Filter fleet"
        className={INPUT_CLASS}
      />
      <kbd
        aria-hidden
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 border border-(--mc-line) px-1 font-mono text-[9px] text-muted-foreground"
      >
        /
      </kbd>
    </div>
  );

  const count = (
    <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground" aria-live="polite">
      {visibleCount}/{workspace.projects.length}
    </span>
  );

  const rescan = (
    <button type="button" onClick={() => workspace.refresh()} disabled={scanning} className={BUTTON_CLASS}>
      {scanning ? "Syncing…" : "Rescan"}
    </button>
  );

  return (
    <WidgetShell
      className="h-full w-full"
      sizes={{
        "1x1": (
          <div className="flex h-full min-h-0 w-full items-center gap-2 overflow-hidden px-3 pb-2">
            {field}
            {count}
          </div>
        ),
      }}
    >
      <div className="flex h-full min-h-0 w-full min-w-0 flex-wrap items-center gap-x-4 gap-y-2 overflow-hidden px-3 pb-2">
        {field}
        {count}
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground xl:inline">
            {scanning ? "Syncing…" : `Synced ${syncedLabel}`}
          </span>
          {rescan}
        </div>
      </div>
    </WidgetShell>
  );
}
