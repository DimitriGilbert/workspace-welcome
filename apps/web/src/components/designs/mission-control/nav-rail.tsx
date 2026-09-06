import { Link } from "@tanstack/react-router";
import {
  Archive,
  FolderPlus,
  LayoutGrid,
  PackagePlus,
  Pin,
  Radar,
  Settings,
  ShieldAlert,
  Terminal as TerminalIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@workspace-welcome/ui/lib/utils";

import type { ViewId } from "./metrics";

interface RailItem {
  id: ViewId;
  label: string;
  icon: LucideIcon;
  count: number;
  /** Attention count tints the glyph so triage state is visible at rest. */
  hot?: boolean;
}

/**
 * The persistent icon rail: views on top, fleet actions at the bottom, new
 * modules slot in as new entries. Counts are live fleet numbers; the radar
 * glyph spins while a rescan is in flight. Vertical on desktop canvases,
 * horizontal across the top on narrow ones. Report generation deliberately
 * has no rail button — it is widget-level now (context zone / project page).
 */
export function NavRail({
  view,
  onView,
  counts,
  onAddRoot,
  onCreate,
  onClone,
  canClone,
  scanning,
  orientation = "vertical",
}: {
  view: ViewId;
  onView: (v: ViewId) => void;
  counts: Record<ViewId, number>;
  onAddRoot: () => void;
  onCreate: () => void;
  onClone: () => void;
  canClone: boolean;
  scanning: boolean;
  orientation?: "vertical" | "horizontal";
}) {
  const vertical = orientation === "vertical";
  const views: RailItem[] = [
    { id: "overview", label: "Overview", icon: LayoutGrid, count: counts.overview },
    { id: "attention", label: "Attention", icon: ShieldAlert, count: counts.attention, hot: true },
    { id: "pinned", label: "Pinned", icon: Pin, count: counts.pinned },
    { id: "archive", label: "Archive", icon: Archive, count: counts.archive },
  ];

  const itemBtn = cn(
    "group relative flex size-10 items-center justify-center outline-none transition-colors",
    "focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
  );
  const actionBtn = cn(
    "flex size-10 items-center justify-center text-muted-foreground outline-none transition-colors",
    "hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
    "focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
  );

  return (
    <nav
      aria-label="Console navigation"
      className={cn(
        "flex shrink-0 items-center border-[var(--mc-line)] bg-[var(--mc-panel)]",
        vertical
          ? "h-full w-14 flex-col border-r py-3"
          : "w-full flex-row gap-1 overflow-x-auto border-b px-2 py-1.5 mc-scroll",
      )}
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center border border-[var(--mc-line)] text-[var(--mc-accent)]",
          !vertical && "mr-2",
        )}
        title="Mission Control"
        aria-hidden
      >
        <Radar
          className={cn("size-4", scanning && "animate-spin [animation-duration:1.6s]")}
          strokeWidth={1.75}
        />
      </div>

      <div className={cn("flex", vertical ? "flex-col items-center gap-1.5" : "flex-row items-center gap-1")}>
        {views.map((item) => {
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onView(item.id)}
              title={item.label}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                itemBtn,
                active
                  ? "text-[var(--mc-accent)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute transition-colors",
                  vertical
                    ? "inset-y-1.5 left-0 w-0.5"
                    : "inset-x-2 bottom-0 h-0.5",
                  active
                    ? "bg-[var(--mc-accent)]"
                    : "bg-transparent group-hover:bg-foreground/20",
                )}
              />
              <item.icon className="size-[18px]" strokeWidth={1.75} />
              {item.count > 0 ? (
                <span
                  className={cn(
                    "absolute font-mono text-[9px] leading-none tabular-nums",
                    vertical ? "right-0.5 top-0.5" : "right-1 top-1",
                    item.hot
                      ? "text-[var(--sev-warning)]"
                      : active
                        ? "text-[var(--mc-accent)]"
                        : "text-muted-foreground",
                  )}
                >
                  {item.count > 99 ? "99+" : item.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <span
        aria-hidden
        className={cn("bg-[var(--mc-line)]", vertical ? "my-3 h-px w-6" : "mx-2 h-6 w-px")}
      />

      <div
        role="group"
        aria-label="Fleet actions"
        className={cn("flex", vertical ? "flex-col items-center gap-1.5" : "flex-row items-center gap-1")}
      >
        <button type="button" onClick={onAddRoot} title="Add directory" aria-label="Add directory" className={actionBtn}>
          <FolderPlus className="size-[17px]" strokeWidth={1.75} />
        </button>
        <button type="button" onClick={onCreate} title="Create project" aria-label="Create project" className={actionBtn}>
          <PackagePlus className="size-[17px]" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={onClone}
          disabled={!canClone}
          title="Clone script"
          aria-label="Clone script"
          className={actionBtn}
        >
          <TerminalIcon className="size-[17px]" strokeWidth={1.75} />
        </button>
      </div>

      <Link
        to="/settings"
        title="Settings"
        aria-label="Settings"
        className={cn(actionBtn, vertical ? "mt-auto" : "ml-auto")}
      >
        <Settings className="size-[17px]" strokeWidth={1.75} />
      </Link>
    </nav>
  );
}
