/**
 * The console's command register (the design's `CommandBar` sync/actions
 * half, `components/designs/mission-control/command-bar.tsx`).
 *
 * Owner mod 1: the register is PAGE HEADER chrome, not canvas content — the
 * board's `command-bar` node is gone; `McCommandRegister` renders at the
 * common header's right edge (ThemePreset.headerCommand → render-layout),
 * beside the one common filter. It fills that slot: `h-8` controls centered
 * in the header row, the register wrapping (never clipping) when the
 * viewport narrows. The fleet filter lives in the page header itself
 * (`data-console-filter`, focused by `/`) — the one filter the owner kept
 * common — so this register carries no second search input: the sync clock
 * reads the provider's data-epoch (never wall-clock during render), Rescan
 * rides the provider's `refresh()`, and the Actions menu keeps the workspace
 * verbs reachable, opening the same token-styled form parts the `mc-actions`
 * band renders — one set of flows, two doors (§3.5: themes compose form
 * parts, no new dialogs). The Settings link survives the collapsed action
 * band here.
 *
 * `McCommandBar` keeps the kind alive as a canvas-ground wrapper (the lab
 * exercises every registered kind): the same register inside a chrome-stripped
 * shell, sized by its placed footprint.
 */
import { useState } from "react";
import {
  ArrowUpRight,
  FolderPlus,
  PackagePlus,
  Plus,
  RefreshCw,
  Terminal,
  Zap,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

import { cn } from "@workspace-welcome/ui/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace-welcome/ui/components/dropdown-menu";

import { relativeTime } from "@/lib/format";
import { FormAddRoot } from "@/widgets/parts/form/add-root";
import { FormCloneScript } from "@/widgets/parts/form/clone-script";
import { FormCreateProject } from "@/widgets/parts/form/create-project";
import { FormReportRun } from "@/widgets/parts/form/report-run";
import { useWorkspace } from "@/widgets/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/components/widgets/registry";
import { WidgetShell } from "@/components/widgets/widget-shell";

/**
 * The console's action-button register — square, hairline, mono micro-caps,
 * accent on hover (the design's command-button treatment, shared with the
 * `mc-actions` band so the two doors read as one register).
 */
export const MC_ACTION_BUTTON = cn(
  "inline-flex h-8 items-center gap-1.5 border border-(--mc-line) px-2.5",
  "font-mono text-[10px] uppercase tracking-[0.14em] text-foreground outline-none transition-colors",
  "hover:border-(--mc-accent) hover:text-(--mc-accent)",
  "focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
);

/**
 * The register itself — sync state, the Actions menu, Rescan, Settings —
 * plus the four flow dialogs it opens. Renders wherever the theme seats it:
 * the common page header (production) or a canvas shell (the lab kind).
 */
export function McCommandRegister({ className }: { className?: string }) {
  const workspace = useWorkspace();

  const [addRootOpen, setAddRootOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);

  const syncedLabel = (() => {
    const updatedAt = workspace.scan.dataUpdatedAt;
    if (updatedAt === undefined) return "pending";
    return workspace.now - updatedAt < 60_000
      ? "just now"
      : relativeTime(new Date(updatedAt).toISOString());
  })();
  const scanning = workspace.scan.isFetching;

  return (
    <>
      <div
        className={cn(
          "flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2",
          className,
        )}
      >
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground xl:inline">
          {scanning ? "Syncing…" : `Synced ${syncedLabel}`}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button type="button" className={MC_ACTION_BUTTON}>
                <Plus aria-hidden className="size-3" />
                Actions
              </button>
            }
          />
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem onClick={() => setAddRootOpen(true)}>
              <FolderPlus className="size-4" /> Add directory
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setCreateOpen(true)}>
              <PackagePlus className="size-4" /> Create project
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setReportOpen(true)}>
              <Zap className="size-4" /> Generate report
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setCloneOpen(true)}>
              <Terminal className="size-4" /> Clone script
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onClick={() => workspace.refresh()}
          disabled={scanning}
          className={MC_ACTION_BUTTON}
        >
          <RefreshCw aria-hidden className={cn("size-3", scanning && "animate-spin")} />
          Rescan
        </button>
        <Link to="/settings" className={cn(MC_ACTION_BUTTON, "text-muted-foreground")}>
          Settings
          <ArrowUpRight aria-hidden className="size-3" />
        </Link>
      </div>
      <FormAddRoot
        open={addRootOpen}
        onOpenChange={setAddRootOpen}
        onAdded={() => workspace.refresh()}
      />
      <FormCreateProject
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => workspace.refresh()}
      />
      <FormReportRun open={reportOpen} onOpenChange={setReportOpen} />
      <FormCloneScript open={cloneOpen} onOpenChange={setCloneOpen} />
    </>
  );
}

export function McCommandBar(_props: RegisteredWidgetProps) {
  return (
    <WidgetShell className="h-full w-full">
      <McCommandRegister className="h-full min-h-0 w-full content-center overflow-hidden px-4 pb-2 min-[2200px]:px-6" />
    </WidgetShell>
  );
}
