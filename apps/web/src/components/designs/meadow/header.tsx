/**
 * Meadow's masthead — ONE row: time-of-day greeting, the essential counts
 * inline, and search on the same line, with the compact command cluster at
 * the end. No hero block, no subtitle; the page's height belongs to the
 * grid.
 */

import type { RefObject } from "react";
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

import { Button } from "@workspace-welcome/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace-welcome/ui/components/dropdown-menu";

import { SoftNumber } from "@/components/designs/meadow/bits";
import { greetingFor } from "@/components/designs/meadow/derive";

interface MeadowHeaderProps {
  now: Date;
  projectCount: number;
  rootCount: number;
  flaggedCount: number;
  /** TanStack Query's dataUpdatedAt for the scan — when the workspace was last read. */
  scannedAt: number | undefined;
  query: string;
  onQueryChange: (query: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  onRefresh: () => void;
  refreshing: boolean;
  onNewProject: () => void;
  onAddRoot: () => void;
  onCloneScript: () => void;
}

export function MeadowHeader({
  now,
  projectCount,
  rootCount,
  flaggedCount,
  scannedAt,
  query,
  onQueryChange,
  searchRef,
  onRefresh,
  refreshing,
  onNewProject,
  onAddRoot,
  onCloneScript,
}: MeadowHeaderProps) {
  const projectNoun = projectCount === 1 ? "project" : "projects";
  const rootNoun = rootCount === 1 ? "directory" : "directories";

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
      <h1 className="text-lg font-semibold tracking-tight whitespace-nowrap text-foreground">
        {greetingFor(now)}
      </h1>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
        <span>
          <SoftNumber value={projectCount} className="font-semibold text-foreground" />{" "}
          {projectNoun}
        </span>
        <span aria-hidden className="text-border">
          ·
        </span>
        <span>
          {rootCount} {rootNoun}
        </span>
        {flaggedCount > 0 ? (
          <>
            <span aria-hidden className="text-border">
              ·
            </span>
            <a
              href="#meadow-attention"
              className="meadow-focus rounded-full font-medium transition-colors"
              style={{ color: "var(--pinned-accent)" }}
            >
              {flaggedCount} need care
            </a>
          </>
        ) : null}
        {scannedAt ? (
          <span
            className="text-muted-foreground/70"
            title={new Date(scannedAt).toLocaleString()}
          >
            · scanned {relativeScanned(scannedAt)}
          </span>
        ) : null}
      </p>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              // The global handler owns Escape (clear + blur); stop the
              // native search-clear so our behavior wins.
              if (e.key === "Escape") e.preventDefault();
            }}
            placeholder="Filter projects"
            aria-label="Filter projects"
            className="meadow-focus h-8 w-44 rounded-full border border-input bg-card/80 pr-9 pl-9 text-[13px] text-foreground shadow-[inset_0_1px_2px_oklch(0.4_0.05_110/0.06)] outline-none transition-colors placeholder:text-muted-foreground focus:border-ring md:w-60"
          />
          <kbd
            aria-hidden
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full border border-border/70 bg-muted/70 px-1.5 font-mono text-[0.6rem] text-muted-foreground"
          >
            /
          </kbd>
        </div>

        <Button
          variant="outline"
          size="icon-sm"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh scan"
          title="Refresh scan"
        >
          <RefreshCw
            aria-hidden
            className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
          />
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
            <DropdownMenuItem onClick={onNewProject}>
              <PackagePlus className="size-4" /> New project
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onAddRoot}>
              <FolderPlus className="size-4" /> Add directory
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCloneScript}>
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
    </header>
  );
}

/** Minute-scale "scanned" label for the header counts. */
function relativeScanned(at: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
