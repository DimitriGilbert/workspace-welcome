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
 * rides the provider's `refresh()`, and the workspace verbs — add a
 * directory, create a project, generate the report, build the clone script
 * — sit as DIRECT one-click buttons, each opening its token-styled form
 * part (`components/parts/form/*`; §3.5: themes compose the ONE set of
 * flows — no theme-local dialogs, no new tRPC, no dropdown burying a
 * click under a click). The Settings link closes the register.
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
  RefreshCw,
  Terminal,
  Zap,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

import { cn } from "@workspace-welcome/ui/lib/utils";

import { relativeTime } from "@/lib/format";
import { FormAddRoot } from "@/components/parts/form/add-root";
import { FormCloneScript } from "@/components/parts/form/clone-script";
import { FormCreateProject } from "@/components/parts/form/create-project";
import { FormReportRun } from "@/components/parts/form/report-run";
import { useWorkspace } from "@/lib/contexts/workspace-context";
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
 * The register itself — sync state, the four workspace verbs as direct
 * buttons, Rescan, Settings — plus the four flow dialogs the verbs open.
 * Renders wherever the theme seats it: the common page header (production)
 * or a canvas shell (the lab kind).
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
        <button
          type="button"
          onClick={() => setAddRootOpen(true)}
          className={MC_ACTION_BUTTON}
        >
          <FolderPlus aria-hidden className="size-3" />
          Add directory
        </button>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className={MC_ACTION_BUTTON}
        >
          <PackagePlus aria-hidden className="size-3" />
          Create project
        </button>
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className={MC_ACTION_BUTTON}
        >
          <Zap aria-hidden className="size-3" />
          Generate report
        </button>
        <button
          type="button"
          onClick={() => setCloneOpen(true)}
          className={MC_ACTION_BUTTON}
        >
          <Terminal aria-hidden className="size-3" />
          Clone script
        </button>
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
