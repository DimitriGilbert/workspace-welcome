import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FolderPlus,
  PackagePlus,
  RefreshCw,
  Search,
  Settings,
  Terminal as TerminalIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@workspace-welcome/ui/components/button";
import { MastheadRow, PageRail } from "@workspace-welcome/ui/components/page-rail";
import { SectionHeader } from "@workspace-welcome/ui/components/section-header";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";
import { WorkspaceBrand } from "@workspace-welcome/ui/components/workspace-brand";

import { useTRPC } from "@/utils/trpc";
import { ProjectCard } from "@/components/project-card";
import { PinnedSection } from "@/components/pinned-section";
import {
  SummaryLine,
  computeStats,
} from "@/components/summary-cards";
import { NeedsAttention } from "@/components/needs-attention";
import { EmptyState } from "@/components/empty-state";
import { AddRootSheet } from "@/components/add-root-sheet";
import { CloneScriptSheet } from "@/components/clone-script-sheet";
import { CreateProjectSheet } from "@/components/create-project-sheet";
import { AlertIcons, GitBadges } from "@/components/git-badges";
import { dateTooltip, relativeTime } from "@/lib/format";
import { stackIcon } from "@/lib/icons";
import { useOpenProject } from "@/lib/open-project";
import { freshness, tierFromFreshness, type RecencyTier } from "@/lib/recency";
import { matchProject } from "@/lib/search";
import type { ScaffoldJobSnapshot } from "@workspace-welcome/api/lib/scaffold";
import type { Project } from "@workspace-welcome/api/lib/types";

type ScaffoldResult = NonNullable<ScaffoldJobSnapshot["result"]>;

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const scan = useQuery(trpc.projects.scan.queryOptions());
  const roots = useQuery(trpc.roots.list.queryOptions());

  const [addRootOpen, setAddRootOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
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

  const openProject = useOpenProject();

  // The sheet closes itself on success; this side owns the toast, the scan
  // refresh that makes the new project appear, and the optional jump to it.
  const handleCreateSuccess = (result: ScaffoldResult) => {
    const segments = result.projectDirectory.split("/").filter(Boolean);
    toast.success(
      `Created ${segments.at(-1) ?? result.projectDirectory} in ${formatElapsed(result.elapsedTimeMs)}`,
      {
        description: result.reproducibleCommand,
        action: {
          label: "Open project",
          onClick: () => openProject(result.projectDirectory),
        },
      },
    );
    refresh();
  };

  const hasRoots = (roots.data?.length ?? 0) > 0;
  const loading = scan.isLoading;

  return (
    <PageRail className="py-6" ambience>
      <h1 className="sr-only">Projects</h1>

      <header className="relative flex flex-col gap-3">
        {/* Masthead: identity on the left, live status on the right. */}
        <MastheadRow
          brand={<WorkspaceBrand render={<Link to="/" />} />}
          trailing={
            <>
              {loading || projects.length === 0 ? null : (
                <div className="ml-auto mr-1">
                  <SummaryLine stats={visibleStats} rootCount={roots.data?.length} />
                </div>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                render={<Link to="/settings" />}
                aria-label="Settings"
              >
                <Settings className="size-3.5" />
              </Button>
            </>
          }
        />

        {/* Command row: search owns the left edge, actions the right. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-foreground/10 pb-4">
          <div className="relative mr-auto">
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
              className="h-8 w-48 rounded-none border border-input bg-background/60 pl-7 pr-12 text-xs outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 sm:w-64"
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateOpen(true)}
          >
            <PackagePlus className="size-3.5" /> Create project
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
        <div className="relative mt-6 flex flex-col gap-7">
          {/* Needs attention */}
          <NeedsAttention projects={visible} />

          {/* Root errors (missing dirs etc.) */}
          {scan.data?.rootErrors.length ? (
            <div className="flex flex-col gap-1 border-l-2 p-3 text-xs" style={{ borderColor: "var(--sev-error)" }}>
              {scan.data.rootErrors.map((e) => (
                <span key={e.rootId} style={{ color: "var(--sev-error)" }}>
                  Couldn&rsquo;t read <span className="font-mono">{e.path}</span>:{" "}
                  {e.message}
                </span>
              ))}
            </div>
          ) : null}

          {/* Pinned section */}
          {pinned.length > 0 ? <PinnedSection projects={pinned} /> : null}

          {/* Recent grid */}
          {recent.length > 0 ? (
            <section className="flex flex-col gap-3">
              <SectionHeader title="Recent" count={recent.length} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {recent.map((p) => (
                  <ProjectCard key={p.path} project={p} />
                ))}
              </div>
            </section>
          ) : null}

          {/* Older list — compact rows, breaks the card forest */}
          {older.length > 0 ? (
            <section className="flex flex-col gap-3">
              <SectionHeader title="Older" count={older.length} />
              <OlderList projects={older} />
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

      <AddRootSheet open={addRootOpen} onOpenChange={setAddRootOpen} />
      <CloneScriptSheet
        // The picker respects the active search filter, so you can narrow
        // first then select-all-within-filter to grab just those repos.
        projects={visible}
        open={cloneOpen}
        onOpenChange={setCloneOpen}
      />
      <CreateProjectSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleCreateSuccess}
        onError={(message) => toast.error(message)}
        onRequestAddRoot={() => {
          setCreateOpen(false);
          setAddRootOpen(true);
        }}
      />
    </PageRail>
  );
}

/**
 * Dense row-based list for older projects. Each row carries the same signals
 * as a card (stack, git, alerts, recency) but compressed horizontally so the
 * eye scans a long archive quickly. Cold entries dim until hovered.
 */
function OlderList({ projects }: { projects: Project[] }) {
  const openProject = useOpenProject();
  return (
    <div className="overflow-hidden rounded-none border border-foreground/10">
      {projects.map((p, i) => {
        const f = freshness(p.updatedAt, p.lastOpenedAt);
        const tier: RecencyTier = tierFromFreshness(f);
        const StackIcon = stackIcon(p.stack?.id);
        return (
          <button
            key={p.path}
            type="button"
            onClick={() => openProject(p.path)}
            className={[
              "group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-foreground/[0.04]",
              tier === "cold" ? "opacity-60 hover:opacity-100" : "",
              i > 0 ? "border-t border-foreground/[0.07]" : "",
            ].join(" ")}
          >
            <StackIcon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="truncate text-[0.8rem] font-medium tracking-tight">{p.name}</span>
                {p.git.branch ? (
                  <span className="hidden shrink-0 items-center gap-1 font-mono text-[0.7rem] text-muted-foreground sm:inline-flex">
                    {p.git.branch}
                  </span>
                ) : null}
              </div>
              <span className="truncate font-mono text-[0.7rem] text-muted-foreground/80">
                {p.path}
              </span>
            </div>
            <div className="hidden shrink-0 items-center gap-2 md:flex">
              <GitBadges git={p.git} />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <AlertIcons alerts={p.alerts} />
              <span
                className="min-w-24 shrink-0 text-right font-mono text-[0.7rem] tabular-nums text-muted-foreground"
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
    <div className="mt-5 flex flex-col gap-6">
      <Skeleton className="h-4 w-80" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-24" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    </div>
  );
}

// Same shape as the create-project sheet's progress clock, so the toast's
// elapsed time matches what the user just watched tick up.
function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0
    ? `${minutes}m ${String(rest).padStart(2, "0")}s`
    : `${rest}s`;
}
