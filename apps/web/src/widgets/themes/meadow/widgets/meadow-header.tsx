/**
 * Meadow masthead (T2-meadow) — port of `components/designs/meadow/header.tsx`.
 *
 * ONE row: time-of-day greeting, the essential counts inline (AnimatedNumber
 * fade — the design's SoftNumber), and the search field on the same line,
 * with the compact command cluster at the end (refresh, Add menu, settings).
 * Search is the workspace's ONE filter (`filter`/`setFilter`); "/" focuses,
 * Escape clears and blurs — the design's keyboard contract, kept.
 *
 * The Add menu opens the token-styled form parts (FormCreateProject /
 * FormAddRoot / FormCloneScript) instead of design-local dialogs; refresh
 * rides `useWorkspace().refresh`.
 */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  FolderPlus,
  PackagePlus,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";

import { AnimatedNumber } from "@workspace-welcome/ui/components/animated-number";
import { Button } from "@workspace-welcome/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace-welcome/ui/components/dropdown-menu";

import { FormAddRoot } from "@/widgets/parts/form/add-root";
import { FormCloneScript } from "@/widgets/parts/form/clone-script";
import { FormCreateProject } from "@/widgets/parts/form/create-project";
import { useWorkspace } from "@/widgets/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

/** Time-of-day greeting for the one-row header, by local hour. Ported from
 * the design's `derive.ts` — a theme-local presentation string. */
function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** Minute-scale "scanned" label for the header counts. Ported from the
 * design's header helper. */
function relativeScanned(at: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Fill-box root (one full-size child per rung so the density probe measures
 * the real presentation box), with the rungs authored as a `sizes` map —
 * the ladder picks, never an if-branch.
 */
export function MeadowHeader({ size }: RegisteredWidgetProps) {
  const workspace = useWorkspace();
  const searchRef = useRef<HTMLInputElement>(null);
  const [addRootOpen, setAddRootOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Keyboard-first search, same contract as the design: "/" focuses,
  // Escape clears and blurs; keystrokes inside editable elements are ignored.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "Escape" && el === searchRef.current) {
        workspace.setFilter("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [workspace]);

  const projectCount = workspace.vitals.total;
  const rootCount = workspace.roots.data?.length ?? 0;
  const flaggedCount = workspace.vitals.attention;
  const scannedAt = workspace.scan.dataUpdatedAt;
  const refreshing = workspace.scan.isFetching;

  const searchField = (
    <div className="relative min-w-0">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        ref={searchRef}
        type="search"
        value={workspace.filter}
        onChange={(e) => workspace.setFilter(e.target.value)}
        onKeyDown={(e) => {
          // The global handler owns Escape (clear + blur); stop the native
          // search-clear so our behavior wins.
          if (e.key === "Escape") e.preventDefault();
        }}
        placeholder="Filter projects"
        aria-label="Filter projects"
        className="meadow-focus h-8 w-44 min-w-0 rounded-full border border-input bg-card/80 pr-9 pl-9 text-[13px] shadow-none outline-none placeholder:text-muted-foreground focus-visible:border-(--ring) md:w-60"
      />
      <kbd
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full border border-border/70 bg-muted/70 px-1.5 font-mono text-[0.6rem] text-muted-foreground"
      >
        /
      </kbd>
    </div>
  );

  const commands = (
    <div className="flex shrink-0 items-center gap-2">
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => workspace.refresh()}
        disabled={refreshing}
        aria-label="Refresh scan"
        title="Refresh scan"
      >
        <RefreshCw aria-hidden className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" className="h-8 px-3">
              <Plus className="size-3.5" /> Add
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem onClick={() => setCreateOpen(true)}>
            <PackagePlus className="size-4" /> New project
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAddRootOpen(true)}>
            <FolderPlus className="size-4" /> Add directory
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setCloneOpen(true)}>
            <Terminal className="size-4" /> Clone script
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        size="icon-sm"
        render={<Link to="/settings" />}
        aria-label="Settings"
        title="Settings"
      >
        <Settings aria-hidden className="size-3.5" />
      </Button>
    </div>
  );

  const counts = (
    <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
      <span className="whitespace-nowrap">
        <AnimatedNumber value={projectCount} className="font-semibold text-foreground" />{" "}
        {projectCount === 1 ? "project" : "projects"}
      </span>
      <span aria-hidden className="text-border">
        ·
      </span>
      <span className="whitespace-nowrap">
        {rootCount} {rootCount === 1 ? "directory" : "directories"}
      </span>
      {flaggedCount > 0 ? (
        <>
          <span aria-hidden className="text-border">
            ·
          </span>
          <span className="meadow-focus rounded-full font-medium" style={{ color: "var(--pinned-accent)" }}>
            {flaggedCount} need care
          </span>
        </>
      ) : null}
      {scannedAt !== undefined && scannedAt > 0 ? (
        <span
          className="text-muted-foreground/70"
          title={new Date(scannedAt).toLocaleString()}
        >
          · scanned {relativeScanned(scannedAt, workspace.now)}
        </span>
      ) : null}
    </p>
  );

  const full: ReactNode = (
    <div className="flex h-full w-full min-w-0 flex-wrap content-center items-center gap-x-4 gap-y-2 overflow-hidden">
      <h1 className="text-lg font-semibold tracking-tight whitespace-nowrap text-foreground">
        {greetingFor(new Date())}
      </h1>
      {counts}
      <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
        {searchField}
        {commands}
      </div>
    </div>
  );

  return (
    <>
      <WidgetShell
        size={{ cols: size.cols, rows: size.rows }}
        className="h-full w-full"
        sizes={{
          "1x1": (
            <div className="flex h-full w-full min-w-0 items-center overflow-hidden px-1">
              <p className="truncate text-sm font-semibold tracking-tight text-foreground">
                {greetingFor(new Date())}
              </p>
            </div>
          ),
          "2x1": (
            <div className="flex h-full w-full min-w-0 flex-col justify-center gap-1 overflow-hidden px-1">
              <p className="truncate text-sm font-semibold tracking-tight text-foreground">
                {greetingFor(new Date())}
              </p>
              {counts}
            </div>
          ),
          "12x1": full,
        }}
      >
        {full}
      </WidgetShell>
      <FormCreateProject
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          toast.success("Project created");
          workspace.refresh();
        }}
      />
      <FormAddRoot
        open={addRootOpen}
        onOpenChange={setAddRootOpen}
        onAdded={() => workspace.refresh()}
      />
      <FormCloneScript open={cloneOpen} onOpenChange={setCloneOpen} />
    </>
  );
}
