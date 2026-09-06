/**
 * Design concept "swiss" — Josef Müller-Brockmann does a git dashboard.
 *
 * A print sheet, screen-sized: white paper, near-black ink, one red. A strict
 * modular grid runs edge-to-edge (no max-width rail — the 3440px canvas is
 * the poster), poster numerals anchor each zone, and rule-defined tables are
 * the primary project surface. The theme is re-themed inside the `.swiss`
 * scope; see components/designs/swiss/swiss.css.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  FileText,
  FolderPlus,
  PackagePlus,
  RefreshCw,
  Settings,
  Terminal as TerminalIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@workspace-welcome/ui/components/button";
import { cn } from "@workspace-welcome/ui/lib/utils";
import type { ScaffoldJobSnapshot } from "@workspace-welcome/api/lib/scaffold";

import { useTRPC } from "@/utils/trpc";
import { AddRootSheet } from "@/components/add-root-sheet";
import { CloneScriptSheet } from "@/components/clone-script-sheet";
import { CreateProjectSheet } from "@/components/create-project-sheet";
import { ReportSheet } from "@/components/report-sheet";
import {
  ChartBand,
  Micro,
  RootStrip,
  StatBand,
  btnSwiss,
} from "@/components/designs/swiss/swiss-panels";
import {
  applyView,
  buildSections,
  computeSwissStats,
  searchFilter,
  viewCounts,
  type DashboardView,
} from "@/components/designs/swiss/swiss-data";
import { SwissSectionTable } from "@/components/designs/swiss/swiss-table";
import { useOpenProject } from "@/lib/open-project";

import "@/components/designs/swiss/swiss.css";

export const Route = createFileRoute("/designs/swiss")({
  component: SwissDesign,
});

type ScaffoldResult = NonNullable<ScaffoldJobSnapshot["result"]>;

const VIEWS: ReadonlyArray<{ id: DashboardView; label: string }> = [
  { id: "all", label: "All" },
  { id: "pinned", label: "Pinned" },
  { id: "attention", label: "Attention" },
  { id: "archive", label: "Archive" },
];

function SwissDesign() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const openProject = useOpenProject();

  const scan = useQuery(trpc.projects.scan.queryOptions());
  const roots = useQuery(trpc.roots.list.queryOptions());

  const [view, setView] = useState<DashboardView>("all");
  const [query, setQuery] = useState("");
  const [addRootOpen, setAddRootOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Keyboard-first search, same contract as the main dashboard: "/" focuses
  // the field, Escape clears and blurs it; typing elsewhere is never hijacked.
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

  const projects = scan.data?.projects ?? [];

  // Cover numbers and graphics describe the whole workspace; the command row
  // and the tables below answer to the query + view.
  const stats = useMemo(() => computeSwissStats(projects), [projects]);
  const searchFiltered = useMemo(
    () => searchFilter(projects, query),
    [projects, query],
  );
  const counts = useMemo(() => viewCounts(searchFiltered), [searchFiltered]);
  const visible = useMemo(
    () => applyView(searchFiltered, view),
    [searchFiltered, view],
  );
  const sections = useMemo(() => buildSections(visible, view), [visible, view]);
  const rootLabels = useMemo(
    () => new Map((roots.data ?? []).map((r) => [r.id, r.label] as const)),
    [roots.data],
  );

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: trpc.projects.scan.queryKey() });

  const hasRoots = (roots.data?.length ?? 0) > 0;
  const loading = scan.isPending;
  const failed = scan.isError;
  const noProjects = !loading && !failed && projects.length === 0;
  const noMatch =
    !loading && !failed && !noProjects && visible.length === 0;

  const scanClock =
    scan.dataUpdatedAt > 0 ? format(new Date(scan.dataUpdatedAt), "HH:mm:ss") : "—";

  // The sheet closes itself on success; this side owns the toast, the scan
  // refresh, and the optional jump into the new project.
  const handleCreateSuccess = (result: ScaffoldResult) => {
    const name =
      result.projectDirectory.split("/").filter(Boolean).at(-1) ??
      result.projectDirectory;
    const toastId = toast.success(
      `Created ${name} in ${formatElapsed(result.elapsedTimeMs)}`,
      {
        description: result.reproducibleCommand,
        action: {
          label: "Open project",
          onClick: () => {
            openProject(result.projectDirectory);
            toast.dismiss(toastId);
          },
        },
      },
    );
    refresh();
  };

  return (
    <div className="swiss swiss-sheet min-h-dvh bg-background text-foreground">
      <a
        href="#swiss-main"
        className="sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:not-sr-only focus-visible:bg-foreground focus-visible:px-3 focus-visible:py-2 focus-visible:text-[10px] focus-visible:font-semibold focus-visible:uppercase focus-visible:tracking-[0.16em] focus-visible:text-background"
      >
        Skip to the index
      </a>

      <main
        id="swiss-main"
        className="px-[clamp(1.25rem,2.2vw,4rem)] pb-16"
      >
        {/*
         * Masthead — oversized title flush-left, live meta on the right,
         * closed by the sheet's one heavy rule.
         */}
        <header className="flex flex-wrap items-end justify-between gap-x-12 gap-y-8 border-b-[3px] border-foreground pt-10 pb-7">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="inline-block size-2.5 shrink-0 bg-[var(--swiss-red)]"
              />
              <Micro>Workspace-Welcome — Project Index</Micro>
            </div>
            <h1 className="mt-5 text-[clamp(3.5rem,5.5vw,9rem)] font-semibold uppercase leading-[0.9] tracking-[-0.035em]">
              Index<span className="text-[var(--swiss-red)]">.</span>
            </h1>
          </div>
          <div className="flex flex-wrap items-end gap-x-10 gap-y-5">
            <dl className="flex flex-wrap items-end gap-x-10 gap-y-5">
              <div>
                <dt>
                  <Micro className="text-muted-foreground">Scan</Micro>
                </dt>
                <dd className="mt-2 font-mono text-sm tabular-nums">{scanClock}</dd>
              </div>
              <div>
                <dt>
                  <Micro className="text-muted-foreground">Directories</Micro>
                </dt>
                <dd className="mt-2 font-mono text-sm tabular-nums">
                  {roots.data ? roots.data.length : "—"}
                </dd>
              </div>
              <div>
                <dt>
                  <Micro className="text-muted-foreground">Entries</Micro>
                </dt>
                <dd className="mt-2 font-mono text-sm tabular-nums">
                  {projects.length}
                </dd>
              </div>
            </dl>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className={btnSwiss}
                render={<Link to="/settings" />}
              >
                <Settings className="size-3" /> Settings
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={btnSwiss}
                onClick={refresh}
                disabled={scan.isFetching}
              >
                <RefreshCw
                  className={cn("size-3", scan.isFetching && "animate-spin")}
                />{" "}
                Refresh
              </Button>
            </div>
          </div>
        </header>

        {roots.data !== undefined && roots.data.length > 0 ? (
          <RootStrip roots={roots.data} projects={projects} />
        ) : null}

        {scan.data !== undefined && scan.data.rootErrors.length > 0 ? (
          <div
            role="alert"
            className="mt-8 border-l-[3px] border-[var(--swiss-red)] pl-5"
          >
            <Micro className="text-[var(--swiss-red)]">Unreadable directories</Micro>
            <ul className="mt-3 space-y-1.5">
              {scan.data.rootErrors.map((e) => (
                <li
                  key={e.rootId}
                  className="font-mono text-xs leading-relaxed text-muted-foreground"
                >
                  <span className="text-foreground">{e.path}</span>
                  {" — "}
                  {e.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {loading ? (
          <>
            <div className="mt-9 flex items-center gap-3" aria-live="polite" aria-busy>
              <span aria-hidden className="size-2 animate-pulse bg-[var(--swiss-red)]" />
              <Micro className="text-muted-foreground">Scanning the workspace</Micro>
            </div>
            <StatBand stats={null} />
            <div aria-hidden>
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse border-b border-border bg-muted/60"
                  style={{ animationDelay: `${i * 80}ms` }}
                />
              ))}
            </div>
          </>
        ) : failed ? (
          <ErrorBand
            message={scan.error?.message ?? "The scanner could not be reached."}
            onRetry={() => void scan.refetch()}
          />
        ) : noProjects ? (
          hasRoots ? (
            <EmptySheet
              kicker="Workspace scanned"
              title="No projects found"
              body="The registered directories contain no scannable projects yet. Add another directory or scaffold a new project."
            >
              <Button
                size="sm"
                className={cn(btnSwiss, "swiss-btn-red")}
                onClick={() => setAddRootOpen(true)}
              >
                <FolderPlus className="size-3" /> Add directory
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={btnSwiss}
                onClick={() => setCreateOpen(true)}
              >
                <PackagePlus className="size-3" /> Create project
              </Button>
            </EmptySheet>
          ) : (
            <EmptySheet
              kicker="Empty index"
              title="No directories registered"
              body="Register a workspace directory and everything under it — git state, stack, health — appears on this sheet."
            >
              <Button
                size="sm"
                className={cn(btnSwiss, "swiss-btn-red")}
                onClick={() => setAddRootOpen(true)}
              >
                <FolderPlus className="size-3" /> Add directory
              </Button>
            </EmptySheet>
          )
        ) : (
          <>
            <div className="mt-2">
              <StatBand stats={stats} />
            </div>

            <ChartBand projects={projects} />

            {/*
             * Command row — underline search, view segments, actions. Sticky
             * over the long tables; bleeds edge-to-edge.
             */}
            <div className="sticky top-0 z-20 -mx-[clamp(1.25rem,2.2vw,4rem)] border-b border-border bg-background px-[clamp(1.25rem,2.2vw,4rem)]">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-2.5">
                <div className="relative min-w-0">
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") e.preventDefault();
                    }}
                    placeholder="Filter the index"
                    aria-label="Filter projects"
                    className="swiss-search h-8 w-48 pr-8 font-mono text-[11px] uppercase tracking-[0.1em] placeholder:text-muted-foreground focus-visible:outline-none sm:w-72"
                  />
                  <kbd
                    aria-hidden
                    className="pointer-events-none absolute right-0.5 top-1/2 -translate-y-1/2 select-none border border-border px-1 font-mono text-[9px] leading-4 text-muted-foreground"
                  >
                    /
                  </kbd>
                </div>

                <nav
                  aria-label="Table views"
                  className="flex flex-wrap items-center gap-x-5 gap-y-1"
                >
                  {VIEWS.map((v) => {
                    const active = view === v.id;
                    const n = counts[v.id];
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setView(v.id)}
                        aria-pressed={active}
                        className={cn(
                          "border-b-2 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors",
                          active
                            ? "border-foreground text-foreground"
                            : "border-transparent text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {v.label}
                        <span
                          className={cn(
                            "ml-1.5 font-mono tracking-normal tabular-nums",
                            !active && "text-muted-foreground",
                            v.id === "attention" &&
                              n > 0 &&
                              "text-[var(--swiss-red)]",
                          )}
                        >
                          {n}
                        </span>
                      </button>
                    );
                  })}
                </nav>

                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className={btnSwiss}
                    onClick={() => setCloneOpen(true)}
                    disabled={projects.length === 0}
                  >
                    <TerminalIcon className="size-3" /> Clone script
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={btnSwiss}
                    onClick={() => setReportOpen(true)}
                    disabled={!hasRoots}
                  >
                    <FileText className="size-3" /> Report
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={btnSwiss}
                    onClick={() => setCreateOpen(true)}
                  >
                    <PackagePlus className="size-3" /> New project
                  </Button>
                  <Button
                    size="sm"
                    className={cn(btnSwiss, "swiss-btn-red")}
                    onClick={() => setAddRootOpen(true)}
                  >
                    <FolderPlus className="size-3" /> Add directory
                  </Button>
                </div>
              </div>
            </div>

            {noMatch ? (
              <NoMatchBand
                query={query}
                viewLabel={VIEWS.find((v) => v.id === view)?.label ?? "current"}
                onClear={() => {
                  setQuery("");
                  setView("all");
                }}
              />
            ) : (
              <div>
                {sections.map((s) => (
                  <SwissSectionTable key={s.id} section={s} rootLabels={rootLabels} />
                ))}
              </div>
            )}
          </>
        )}

        {/** Colophon — the print sheet signs itself with real scan facts. */}
        <footer className="mt-16 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-t border-foreground pt-4">
          <Micro className="text-muted-foreground">
            Workspace-Welcome — Swiss sheet · Grid 12 · Set in Geist
          </Micro>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] tabular-nums text-muted-foreground">
            {projects.length} entries ·{" "}
            {roots.data?.length ?? 0}{" "}
            {(roots.data?.length ?? 0) === 1 ? "directory" : "directories"} ·
            scanned {scanClock}
          </p>
        </footer>
      </main>

      <AddRootSheet open={addRootOpen} onOpenChange={setAddRootOpen} />
      <ReportSheet open={reportOpen} onOpenChange={setReportOpen} />
      <CloneScriptSheet
        // The picker respects the active filter, mirroring the table below it.
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
    </div>
  );
}

function ErrorBand({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="mt-10 border-l-[3px] border-[var(--swiss-red)] bg-[color-mix(in_srgb,var(--swiss-red)_5%,transparent)] p-6"
    >
      <Micro className="text-[var(--swiss-red)]">The scan failed</Micro>
      <p className="mt-3 max-w-[80ch] font-mono text-xs leading-relaxed">{message}</p>
      <Button
        variant="outline"
        size="sm"
        className={cn(btnSwiss, "mt-5")}
        onClick={onRetry}
      >
        <RefreshCw className="size-3" /> Retry scan
      </Button>
    </div>
  );
}

function EmptySheet({
  kicker,
  title,
  body,
  children,
}: {
  kicker: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-border py-16">
      <Micro className="text-muted-foreground">{kicker}</Micro>
      <p
        aria-hidden
        className="mt-6 text-[clamp(5rem,10vw,13rem)] font-semibold leading-[0.85] tracking-[-0.04em] text-[var(--swiss-red)] tabular-nums"
      >
        00
      </p>
      <h2 className="mt-8 text-xl font-semibold uppercase tracking-[0.08em]">
        {title}
      </h2>
      <p className="mt-3 max-w-[56ch] text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
      <div className="mt-8 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function NoMatchBand({
  query,
  viewLabel,
  onClear,
}: {
  query: string;
  viewLabel: string;
  onClear: () => void;
}) {
  const trimmed = query.trim();
  return (
    <div className="mt-12 border-y border-border py-14">
      <Micro className="text-muted-foreground">No match</Micro>
      <p className="mt-4 text-[clamp(1.75rem,3vw,3.5rem)] font-semibold uppercase leading-[1.02] tracking-[-0.02em]">
        {trimmed ? (
          <>
            Nothing matches &ldquo;{trimmed}&rdquo;
          </>
        ) : (
          <>{`The ${viewLabel} shelf is empty`}</>
        )}
      </p>
      <Button
        variant="outline"
        size="sm"
        className={cn(btnSwiss, "mt-7")}
        onClick={onClear}
      >
        Clear filter
      </Button>
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
