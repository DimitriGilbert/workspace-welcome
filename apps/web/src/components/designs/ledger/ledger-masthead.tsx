import type { RefObject } from "react";
import { Link } from "@tanstack/react-router";
import { RefreshCw, Search, Settings } from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";

interface LedgerMastheadProps {
  query: string;
  onQueryChange: (query: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  onRefresh: () => void;
  refreshing: boolean;
  /** Edition line facts; null while the first scan is in flight. */
  edition: { entries: number; roots: number; scanned: string } | null;
  /** Error- and warn-level alert count across the visible index; null while loading. */
  attentionCount: number | null;
}

/**
 * The nameplate: serif masthead with the day's headline figure in the wide
 * middle, blotter-style search and live controls on the right, closed by a
 * full-bleed double rule like the head of a printed ledger.
 */
export function LedgerMasthead({
  query,
  onQueryChange,
  searchRef,
  onRefresh,
  refreshing,
  edition,
  attentionCount,
}: LedgerMastheadProps) {
  return (
    <header className="ledger-shell pt-10 pb-6 md:pt-14">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="ledger-serif ledger-nameplate">
            Workspace <span className="italic text-primary">Ledger</span>
          </h1>
          {edition ? (
            <p className="mt-4 font-mono text-[0.7rem] tabular-nums text-muted-foreground">
              {edition.entries} {edition.entries === 1 ? "entry" : "entries"}{" "}
              across {edition.roots} {edition.roots === 1 ? "root" : "roots"},
              scanned {edition.scanned}
            </p>
          ) : (
            <Skeleton className="mt-4 h-3 w-64" />
          )}
        </div>

        {attentionCount !== null ? (
          <div className="ledger-news hidden lg:block">
            {attentionCount > 0 ? (
              <>
                <p className="ledger-news-num tabular-nums">{attentionCount}</p>
                <p className="ledger-cap mt-2">
                  {attentionCount === 1 ? "entry needs" : "entries need"}{" "}
                  attention
                </p>
              </>
            ) : (
              <p className="ledger-serif text-xl italic text-muted-foreground">
                All entries in order.
              </p>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 lg:justify-end">
          <div className="ledger-search flex h-9 w-56 items-center gap-2 px-0.5 sm:w-80">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => {
                // The global handler owns Escape (clear + blur); stop the
                // native "clear the box" behavior so ours wins.
                if (e.key === "Escape") e.preventDefault();
              }}
              placeholder="Filter the index"
              aria-label="Filter projects"
              className="h-full w-full min-w-0 bg-transparent font-mono text-sm text-foreground outline-none placeholder:font-serif placeholder:text-muted-foreground/70"
            />
            <kbd className="ledger-kbd" aria-hidden>
              /
            </kbd>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={"size-3.5" + (refreshing ? " animate-spin" : "")}
              aria-hidden
            />
            Rescan
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            render={<Link to="/settings" />}
            aria-label="Settings"
          >
            <Settings className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="ledger-rule-double ledger-rule-bleed mt-7" aria-hidden />
    </header>
  );
}
