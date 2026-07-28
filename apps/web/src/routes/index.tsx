import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FolderPlus, RefreshCw, Search, Terminal as TerminalIcon } from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";

import { useTRPC } from "@/utils/trpc";
import { ProjectCard } from "@/components/project-card";
import { ProjectSheet } from "@/components/project-sheet";
import { PinnedSection } from "@/components/pinned-section";
import { SectionHeader } from "@/components/section-header";
import {
  SummaryCards,
  computeStats,
} from "@/components/summary-cards";
import { NeedsAttention } from "@/components/needs-attention";
import { EmptyState } from "@/components/empty-state";
import { AddRootSheet } from "@/components/add-root-sheet";
import { CloneScriptSheet } from "@/components/clone-script-sheet";
import { AlertIcons, GitBadges } from "@/components/git-badges";
import { dateTooltip, relativeTime } from "@/lib/format";
import { stackIcon } from "@/lib/icons";
import { freshness, tierFromFreshness, type RecencyTier } from "@/lib/recency";
import { matchProject } from "@/lib/search";
import type { Project } from "@workspace-welcome/api/lib/types";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const scan = useQuery(trpc.projects.scan.queryOptions());
  const roots = useQuery(trpc.roots.list.queryOptions());

  const [selected, setSelected] = useState<Project | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addRootOpen, setAddRootOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const projects = scan.data?.projects ?? [];

  // Keyboard-first search: "/" focuses the field, Escape clears + blurs it.
  // We ignore keystrokes that originate inside another editable element so we
  // don't hijack typing in the detail sheet, add-root form, etc.
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
        setQuery("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Apply the filter once; downstream sections (pinned/recent/older and the
  // needs-attention panel) all see the same narrowed set so filtering feels
  // coherent across the whole page. Matching spans name, path, stack label,
  // git branch, remote host and note — see @/lib/search.
  const visible = useMemo(
    () => projects.filter((p) => matchProject(p, query)),
    [projects, query],
  );

  // Stats reflect the filtered set too, so the summary strip and the grid
  // agree on what's being shown.
  const visibleStats = useMemo(() => computeStats(visible), [visible]);

  // Partition the visible projects into the three rhythms: pinned (separate
  // panel), recent grid (fresh + recent tiers), older list (stale + cold).
  // Pinned projects are pulled out of the recency grid entirely so they
  // don't appear twice.
  const { pinned, recent, older } = useMemo(() => {
    const pinned: Project[] = [];
    const recent: Project[] = [];
    const older: Project[] = [];
    for (const p of visible) {
      if (p.pinned) {
        pinned.push(p);
        continue;
      }
      const tier = tierFromFreshness(freshness(p.updatedAt, p.lastOpenedAt));
      if (tier === "fresh" || tier === "recent") recent.push(p);
      else older.push(p);
    }
    const byUpdatedDesc = (a: Project, b: Project) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    pinned.sort(byUpdatedDesc);
    recent.sort(byUpdatedDesc);
    older.sort(byUpdatedDesc);
    return { pinned, recent, older };
  }, [visible]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: trpc.projects.scan.queryKey() });
  };

  const openDetail = (p: Project) => {
    setSelected(p);
    setSheetOpen(true);
  };

  const hasRoots = (roots.data?.length ?? 0) > 0;
  const loading = scan.isLoading;

  return (
    <div className="mx-auto w-full max-w-[1480px] px-5 py-6 sm:px-8 lg:px-10">
      {/* Header band ------------------------------------------------------- */}
      <header className="mb-6 flex flex-col gap-4 border-b border-foreground/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[0.65rem] font-medium uppercase tracking-[0.24em] text-[var(--eyebrow)]">
            Workspace
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">
            Welcome back
          </h1>
          <p className="text-sm text-muted-foreground">
            {hasRoots
              ? `${projects.length} projects across ${roots.data?.length ?? 0} director${(roots.data?.length ?? 0) === 1 ? "y" : "ies"}`
              : "Add a directory to see your projects here."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Escape is handled globally, but stop the native "clear" so
                // our blur behaviour wins.
                if (e.key === "Escape") e.preventDefault();
              }}
              placeholder="Filter projects"
              aria-label="Filter projects"
              className="h-8 w-48 rounded-none border border-input bg-background pl-7 pr-12 text-xs outline-none transition-colors focus:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 sm:w-64"
            />
            <kbd
              className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 select-none rounded-sm border border-border/60 bg-muted/60 px-1 font-mono text-[0.6rem] font-medium text-muted-foreground"
              aria-hidden
            >
              /
            </kbd>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={scan.isFetching}
          >
            <RefreshCw
              className={`size-3.5 ${scan.isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCloneOpen(true)}
            disabled={projects.length === 0}
          >
            <TerminalIcon className="size-3.5" /> Clone script
          </Button>
          <Button size="sm" onClick={() => setAddRootOpen(true)}>
            <FolderPlus className="size-3.5" /> Add directory
          </Button>
        </div>
      </header>

      {loading ? (
        <LoadingGrid />
      ) : projects.length === 0 ? (
        <EmptyState noRoots={!hasRoots} onAddRoot={() => setAddRootOpen(true)} />
      ) : (
        <div className="flex flex-col gap-8">
          {/* Summary strip */}
          <SummaryCards stats={visibleStats} />

          {/* Needs attention */}
          <NeedsAttention projects={visible} onSelect={openDetail} />

          {/* Root errors (missing dirs etc.) */}
          {scan.data?.rootErrors.length ? (
            <div
              className="flex flex-col gap-1 rounded-none p-3 text-xs"
              style={{
                backgroundColor:
                  "color-mix(in oklch, var(--sev-error) 8%, transparent)",
                boxShadow: "inset 3px 0 0 0 var(--sev-error)",
              }}
            >
              {scan.data.rootErrors.map((e) => (
                <span key={e.rootId} style={{ color: "var(--sev-error)" }}>
                  Couldn&rsquo;t read <span className="font-mono">{e.path}</span>:{" "}
                  {e.message}
                </span>
              ))}
            </div>
          ) : null}

          {/* Pinned section — visually separated, amber accent */}
          {pinned.length > 0 ? (
            <PinnedSection projects={pinned} onOpenDetail={openDetail} />
          ) : null}

          {/* Recent grid — hot projects, prominent cards */}
          {recent.length > 0 ? (
            <section className="flex flex-col gap-3">
              <SectionHeader
                eyebrow="Recent"
                count={recent.length}
                accent="recency"
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {recent.map((p) => (
                  <ProjectCard
                    key={p.path}
                    project={p}
                    onOpenDetail={openDetail}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {/* Older list — compact rows, breaks the card forest */}
          {older.length > 0 ? (
            <section className="flex flex-col gap-3">
              <SectionHeader
                eyebrow="Older"
                count={older.length}
                accent="neutral"
              />
              <OlderList projects={older} onSelect={openDetail} />
            </section>
          ) : null}

          {/* Filter narrowed everything out — offer a clear hint. */}
          {visible.length === 0 && projects.length > 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-none border border-dashed border-foreground/15 p-12 text-center">
              <p className="text-sm font-medium">No projects match</p>
              <p className="text-xs text-muted-foreground">
                Nothing matches &ldquo;{query}&rdquo;. Try a different term.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setQuery("")}
                className="mt-1"
              >
                Clear filter
              </Button>
            </div>
          ) : null}
        </div>
      )}

      <ProjectSheet
        project={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
      <AddRootSheet open={addRootOpen} onOpenChange={setAddRootOpen} />
      <CloneScriptSheet
        // The picker respects the active search filter, so you can narrow
        // first then select-all-within-filter to grab just those repos.
        projects={visible}
        open={cloneOpen}
        onOpenChange={setCloneOpen}
      />
    </div>
  );
}

/**
 * Dense row-based list for older projects. Each row carries the same signals
 * as a card (stack, git, alerts, recency) but compressed horizontally so the
 * eye scans a long archive quickly. Recency still shows as a left bar so the
 * heatmap extends across the whole page, not just the card grid.
 */
function OlderList({
  projects,
  onSelect,
}: {
  projects: Project[];
  onSelect: (p: Project) => void;
}) {
  return (
    <div className="overflow-hidden rounded-none border border-foreground/10">
      {projects.map((p, i) => {
        const f = freshness(p.updatedAt, p.lastOpenedAt);
        const tier: RecencyTier = tierFromFreshness(f);
        const errorAlert = p.alerts.find((a) => a.severity === "error");
        const accentColor = errorAlert
          ? "var(--sev-error)"
          : tier === "cold"
            ? "var(--border)"
            : `color-mix(in oklch, var(--recency-fresh) ${Math.round(Math.max(0.08, f * 1.15) * 100)}%, var(--recency-stale))`;
        const StackIcon = stackIcon(p.stack?.id);
        return (
          <button
            key={p.path}
            type="button"
            onClick={() => onSelect(p)}
            style={{ boxShadow: `inset 2px 0 0 0 ${accentColor}` }}
            className={[
              "group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50",
              tier === "cold" ? "opacity-60 hover:opacity-100" : "",
              i > 0 ? "border-t border-foreground/10" : "",
            ].join(" ")}
          >
            <StackIcon className="size-4 shrink-0 text-muted-foreground" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{p.name}</span>
                {p.git.branch ? (
                  <span className="hidden shrink-0 items-center gap-1 font-mono text-[0.7rem] text-muted-foreground sm:inline-flex">
                    {p.git.branch}
                  </span>
                ) : null}
              </div>
              <span className="truncate font-mono text-[0.7rem] text-muted-foreground">
                {p.path}
              </span>
            </div>
            <div className="hidden shrink-0 items-center gap-2 md:flex">
              <GitBadges git={p.git} />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <AlertIcons alerts={p.alerts} />
              <span
                className="w-20 shrink-0 text-right text-[0.7rem] tabular-nums text-muted-foreground"
                title={dateTooltip(p.updatedAt)}
              >
                {relativeTime(p.updatedAt)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_repeat(3,1fr)]">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-32" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      </div>
    </div>
  );
}
