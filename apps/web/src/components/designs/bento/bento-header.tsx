import type { RefObject } from "react";
import { Link } from "@tanstack/react-router";
import {
  FileText,
  FolderPlus,
  PackagePlus,
  RefreshCw,
  Search,
  Settings,
  Terminal as TerminalIcon,
} from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";
import { WorkspaceBrand } from "@workspace-welcome/ui/components/workspace-brand";

interface BentoHeaderProps {
  query: string;
  onQueryChange: (query: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  visibleCount: number;
  totalCount: number;
  isFetching: boolean;
  hasRoots: boolean;
  hasProjects: boolean;
  onRefresh: () => void;
  onClone: () => void;
  onReport: () => void;
  onCreate: () => void;
  onAddRoot: () => void;
}

/**
 * Command bar: identity left, actions right, palette-style search spanning
 * the width below. "/" focuses the field, Escape clears it.
 */
export function BentoHeader({
  query,
  onQueryChange,
  searchRef,
  visibleCount,
  totalCount,
  isFetching,
  hasRoots,
  hasProjects,
  onRefresh,
  onClone,
  onReport,
  onCreate,
  onAddRoot,
}: BentoHeaderProps) {
  const filtering = query.trim().length > 0;

  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <WorkspaceBrand render={<Link to="/" />} />
        <Link
          to="/designs"
          className="rounded-full border border-border bg-white/[0.04] px-2.5 py-0.5 font-mono text-[0.66rem] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
        >
          bento
        </Link>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isFetching}
            aria-label="Refresh scan"
          >
            <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} />
            <span className="hidden lg:inline">Refresh</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClone}
            disabled={!hasProjects}
            aria-label="Clone script"
          >
            <TerminalIcon className="size-3.5" />
            <span className="hidden lg:inline">Clone script</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onReport}
            disabled={!hasRoots}
            aria-label="Report"
          >
            <FileText className="size-3.5" />
            <span className="hidden lg:inline">Report</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={onCreate} aria-label="Create project">
            <PackagePlus className="size-3.5" />
            <span className="hidden lg:inline">New project</span>
          </Button>
          <Button size="sm" onClick={onAddRoot}>
            <FolderPlus className="size-3.5" />
            <span className="hidden sm:inline">Add directory</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            render={<Link to="/settings" aria-label="Settings" />}
          >
            <Settings className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1 md:max-w-xl xl:max-w-2xl">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onQueryChange("");
                searchRef.current?.blur();
              }
            }}
            placeholder="Filter projects by name, path, stack, branch, note"
            aria-label="Filter projects"
            className="h-11 w-full rounded-xl border border-border bg-white/[0.03] pl-10 pr-14 text-sm shadow-[inset_0_1px_0_oklch(1_0_0/0.05)] outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus-visible:border-[oklch(0.72_0.125_235/0.5)] focus-visible:ring-2 focus-visible:ring-ring/25"
          />
          <kbd className="b-kbd absolute right-3.5 top-1/2 -translate-y-1/2" aria-hidden>
            /
          </kbd>
        </div>
        {filtering ? (
          <p className="font-mono text-[0.7rem] tabular-nums text-muted-foreground" role="status">
            {visibleCount} of {totalCount}
          </p>
        ) : null}
      </div>
    </header>
  );
}
