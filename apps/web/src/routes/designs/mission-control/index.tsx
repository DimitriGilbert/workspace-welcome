import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Group, Panel, Separator } from "react-resizable-panels";
import type { Layout } from "react-resizable-panels";
import { createFileRoute } from "@tanstack/react-router";

import { Skeleton } from "@workspace-welcome/ui/components/skeleton";

import { AttentionBoard } from "@/components/designs/mission-control/attention-board";
import { CommandBar, VitalsBoard } from "@/components/designs/mission-control/command-bar";
import { AddRootDialog, CloneScriptDialog, CreateProjectDialog } from "@/components/designs/mission-control/console-forms";
import { AnalyticsZone } from "@/components/designs/mission-control/analytics-zone";
import { FleetTable } from "@/components/designs/mission-control/fleet-table";
import {
  fleetVitals,
  partitionFleet,
} from "@/components/designs/mission-control/metrics";
import type { ViewId } from "@/components/designs/mission-control/metrics";
import { NavRail } from "@/components/designs/mission-control/nav-rail";
import { ReportZone } from "@/components/designs/mission-control/report-widgets";
import { latestUpdatedAtOf } from "@workspace-welcome/api/lib/report-staleness";
import {
  EmptyConsole,
  ErrorConsole,
  LoadingConsole,
  NoMatch,
} from "@/components/designs/mission-control/states";
import { relativeTime } from "@/lib/format";
import { useOpenDesignProject } from "@/components/designs/mission-control/use-open-design-project";
import { matchProject } from "@/lib/search";
import { useTRPC } from "@/utils/trpc";

import consoleStyles from "@/components/designs/mission-control/mission-control.css?url";

const VIEW_ORDER: ViewId[] = ["overview", "attention", "pinned", "archive"];

export const Route = createFileRoute("/designs/mission-control/")({
  head: () => ({
    links: [{ rel: "stylesheet", href: consoleStyles }],
  }),
  component: MissionControlRoute,
});

/** matchMedia as state, SSR-safe (false while rendering). */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function QuietNote({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 border border-dashed border-[var(--mc-line-strong)] px-6 py-14 text-center">
      <h2 className="mc-label">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function SectionLabel({ title, meta }: { title: string; meta?: string }) {
  return (
    <p className="mc-label flex items-baseline gap-2">
      {title}
      {meta ? <span className="text-muted-foreground">{meta}</span> : null}
    </p>
  );
}

/** Session-persisted zone layout (percent of the group, per panel id). */
const DEFAULT_LAYOUT: Layout = { stage: 56, context: 24, analytics: 20 };

/**
 * Session-persisted console geometry: the panel layout lives at module scope
 * so it survives navigating to a project page and back (a reload
 * intentionally resets it). Ledger column widths persist the same way,
 * inside the fleet-table module.
 */
let sessionLayout: Layout = { ...DEFAULT_LAYOUT };

/**
 * Mission Control, round two. A persistent icon rail flanks THREE resizable
 * zones (react-resizable-panels v4): the stage — animated vitals, the fleet
 * ledger (a TanStack table: header sorting, live filter, drag-resizable
 * columns) — the context zone with the tabbed snitch-report widget, and the
 * analytics zone of donuts and leaders. Every zone drags; below `lg`
 * everything stacks for phones. Forms live in console dialogs, never side
 * panels; the per-row tooltip cluster is gone in favor of one snappy
 * motion-animated menu.
 */
function MissionControlRoute() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const openProject = useOpenDesignProject();
  const wide = useMediaQuery("(min-width: 1024px)");

  const scan = useQuery(trpc.projects.scan.queryOptions());
  const roots = useQuery(trpc.roots.list.queryOptions());

  const [view, setView] = useState<ViewId>("overview");
  const [query, setQuery] = useState("");
  const [addRootOpen, setAddRootOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [layout, setLayout] = useState<Layout>(sessionLayout);
  const searchRef = useRef<HTMLInputElement>(null);

  // Keyboard-first console: `/` filter, `1-4` views, Escape clears. Guarded
  // against typing contexts so dialogs and fields keep their keystrokes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
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
      } else if (!typing && /^[1-4]$/.test(e.key)) {
        setView(VIEW_ORDER[Number(e.key) - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const projects = scan.data?.projects ?? [];
  const rootsList = roots.data ?? [];
  const rootErrors = scan.data?.rootErrors ?? [];

  // One clock per data epoch: pulse strips and freshness share it so a row's
  // numerals and its sparkline never disagree.
  const now = scan.dataUpdatedAt || Date.now();

  // Rail counts and analytics describe the whole fleet; the stage narrows by
  // the active filter so searching never rewrites the wide-screen picture.
  const fleet = useMemo(() => partitionFleet(projects), [projects]);
  const vitals = useMemo(() => fleetVitals(projects, now), [projects, now]);
  const railCounts: Record<ViewId, number> = {
    overview: projects.length,
    attention: fleet.flagged.length,
    pinned: fleet.pinned.length,
    archive: fleet.archive.length,
  };

  const visible = useMemo(
    () => projects.filter((p) => matchProject(p, query)),
    [projects, query],
  );
  const visiblePartition = useMemo(() => partitionFleet(visible), [visible]);
  const triage = useMemo(
    () => visible.filter((p) => p.alerts.length > 0),
    [visible],
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: trpc.projects.scan.queryKey() });
  };

  const hasRoots = rootsList.length > 0;
  const loading = scan.isLoading;

  // The report widget targets the first registered root; staleness compares
  // the report's generatedAt against the freshest project under that root.
  const reportPath = rootsList[0]?.path ?? "";
  const reportStalenessInput = useMemo(
    () => latestUpdatedAtOf(projects.map((p) => p.updatedAt)),
    [projects],
  );

  const syncedLabel =
    scan.dataUpdatedAt && Date.now() - scan.dataUpdatedAt < 60_000
      ? "just now"
      : scan.dataUpdatedAt
        ? relativeTime(new Date(scan.dataUpdatedAt).toISOString())
        : "pending";


  const stageBody = () => {
    if (loading) return <LoadingConsole />;
    if (scan.isError) {
      return <ErrorConsole message={scan.error.message} onRetry={refresh} />;
    }
    if (!hasRoots) {
      return <EmptyConsole noRoots onAddRoot={() => setAddRootOpen(true)} />;
    }
    if (projects.length === 0) {
      return <EmptyConsole noRoots={false} onAddRoot={() => setAddRootOpen(true)} />;
    }
    if (visible.length === 0) {
      return <NoMatch query={query} onClear={() => setQuery("")} />;
    }

    if (view === "pinned") {
      if (visiblePartition.pinned.length === 0) {
        return (
          <QuietNote
            title="No pins"
            body="Pin units from the ledger or triage board to keep them docked here."
          />
        );
      }
      return (
        <section className="flex flex-col gap-2">
          <SectionLabel
            title="Docked"
            meta={`${visiblePartition.pinned.length} pinned · freshest first`}
          />
          <FleetTable
            projects={visiblePartition.pinned}
            now={now}
            filter={query}
            initialSort={[{ id: "updated", desc: true }]}
          />
        </section>
      );
    }

    if (view === "attention") {
      if (triage.length === 0) {
        return (
          <QuietNote
            title="Fleet nominal"
            body="No alerts are open. Every unit is on branch, in sync and clean."
          />
        );
      }
      return (
        <section className="flex flex-col gap-2">
          <SectionLabel title="Triage" meta={`${triage.length} under review`} />
          <FleetTable
            projects={triage}
            now={now}
            filter={query}
            initialSort={[{ id: "alerts", desc: false }]}
          />
        </section>
      );
    }

    if (view === "archive") {
      if (visiblePartition.archive.length === 0) {
        return (
          <QuietNote
            title="Archive empty"
            body="Stale and cold units collect here once they quiet down."
          />
        );
      }
      return (
        <section className="flex flex-col gap-2">
          <SectionLabel title="Archive" meta={`${visiblePartition.archive.length} units`} />
          <FleetTable
            projects={visiblePartition.archive}
            now={now}
            filter={query}
          />
        </section>
      );
    }

    return (
      <>
        {visiblePartition.flagged.length > 0 ? (
          <AttentionBoard
            projects={visiblePartition.flagged}
            now={now}
            onViewAll={() => setView("attention")}
          />
        ) : null}
        <section className="flex flex-col gap-2">
          <SectionLabel
            title="Fleet"
            meta={`${
              visiblePartition.current.length + visiblePartition.pinned.length
            } of ${projects.length} units`}
          />
          {/* Pinned rows stay in the ledger — the row actions are the way to
              pin/unpin; the mosaic tiles are gone, this is the console's
              only project surface: tables + instruments. */}
          <FleetTable
            projects={[...visiblePartition.pinned, ...visiblePartition.current]}
            now={now}
            filter={query}
          />
          {visiblePartition.archive.length > 0 ? (
            <button
              type="button"
              onClick={() => setView("archive")}
              className="self-start pt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground outline-none transition-colors hover:text-[var(--mc-accent)] focus-visible:ring-1 focus-visible:ring-ring"
            >
              +{visiblePartition.archive.length} in archive · open archive (4)
            </button>
          ) : null}
        </section>
      </>
    );
  };

  const header = (
    <header className="sticky top-0 z-20 flex flex-col gap-4 border-b border-[var(--mc-line)] bg-background px-4 pb-4 pt-5 lg:px-5 2xl:px-6">
      <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-4">
        {loading ? (
          <div aria-hidden className="flex flex-wrap gap-x-8 gap-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col-reverse gap-2">
                <Skeleton className="h-2 w-14" />
                <Skeleton className="h-8 w-16" />
              </div>
            ))}
          </div>
        ) : (
          <VitalsBoard vitals={vitals} />
        )}
        <p className="hidden items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground xl:flex">
          <kbd className="mc-kbd">/</kbd> filter
          <kbd className="mc-kbd ml-2">1-4</kbd> views
          <kbd className="mc-kbd ml-2">esc</kbd> clear
        </p>
      </div>
      <CommandBar
        query={query}
        onQueryChange={setQuery}
        searchRef={searchRef}
        resultCount={visible.length}
        totalCount={projects.length}
        onRescan={refresh}
        scanning={scan.isFetching}
        syncedLabel={syncedLabel}
      />
    </header>
  );

  const contextZone = (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <ReportZone
        kind="scan"
        path={reportPath}
        latestUpdatedAt={reportStalenessInput}
        onOpenProject={openProject}
      />
    </div>
  );

  const analyticsZone = (
    <AnalyticsZone
      projects={projects}
      roots={rootsList}
      rootErrors={rootErrors}
      rootsError={roots.isError ? roots.error.message : undefined}
      now={now}
      onOpenProject={openProject}
    />
  );

  return (
    <div className="mc flex min-h-dvh flex-col lg:h-dvh lg:flex-row lg:overflow-hidden">
      <div className="hidden lg:contents">
        <NavRail
          view={view}
          onView={setView}
          counts={railCounts}
          onAddRoot={() => setAddRootOpen(true)}
          onCreate={() => setCreateOpen(true)}
          onClone={() => setCloneOpen(true)}
          canClone={projects.length > 0}
          scanning={scan.isFetching}
        />
      </div>
      <div className="lg:hidden">
        <NavRail
          orientation="horizontal"
          view={view}
          onView={setView}
          counts={railCounts}
          onAddRoot={() => setAddRootOpen(true)}
          onCreate={() => setCreateOpen(true)}
          onClone={() => setCloneOpen(true)}
          canClone={projects.length > 0}
          scanning={scan.isFetching}
        />
      </div>

      <h1 className="sr-only">Mission Control</h1>

      {wide ? (
        <main className="flex min-w-0 flex-1 lg:overflow-hidden">
          <Group
            orientation="horizontal"
            className="h-full w-full"
            defaultLayout={layout}
            onLayoutChanged={(next, meta) => {
              if (meta.isUserInteraction) {
                sessionLayout = next;
                setLayout(next);
              }
            }}
          >
            <Panel id="stage" minSize="30%" defaultSize="56%">
              <div className="mc-scroll flex h-full min-h-0 flex-col lg:overflow-y-auto">
                {header}
                <div className="flex flex-1 flex-col gap-5 px-4 pb-12 pt-4 lg:px-5 2xl:px-6">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={view}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.14, ease: "easeOut" }}
                      className="flex flex-col gap-5"
                    >
                      {stageBody()}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </Panel>
            <Separator className="mc-separator mc-separator-v" id="mc-sep-stage" />
            <Panel id="context" minSize="16%" defaultSize="24%">
              <div className="mc-scroll h-full overflow-y-auto border-l border-[var(--mc-line)] bg-[var(--mc-bg-raise)] p-3">
                {contextZone}
              </div>
            </Panel>
            <Separator className="mc-separator mc-separator-v" id="mc-sep-analytics" />
            <Panel id="analytics" minSize="15%" defaultSize="20%">
              <div className="mc-scroll h-full overflow-y-auto border-l border-[var(--mc-line)] bg-[var(--mc-bg-raise)] p-3">
                {analyticsZone}
              </div>
            </Panel>
          </Group>
        </main>
      ) : (
        <>
          <main className="flex min-w-0 flex-1 flex-col">
            {header}
            <div className="flex flex-1 flex-col gap-5 px-4 pb-12 pt-4">
              {stageBody()}
            </div>
          </main>
          <section
            aria-label="Root report"
            className="border-t border-[var(--mc-line)] bg-[var(--mc-bg-raise)] p-3"
          >
            {contextZone}
          </section>
          <section
            aria-label="Fleet analytics"
            className="border-t border-[var(--mc-line)] bg-[var(--mc-bg-raise)] p-3 pb-12"
          >
            {analyticsZone}
          </section>
        </>
      )}

      <AddRootDialog open={addRootOpen} onClose={() => setAddRootOpen(false)} />
      <CloneScriptDialog
        // The picker respects the active filter, so you can narrow the fleet
        // first and then select-all within the filter.
        projects={visible}
        open={cloneOpen}
        onClose={() => setCloneOpen(false)}
      />
      <CreateProjectDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onAddRoot={() => {
          setCreateOpen(false);
          setAddRootOpen(true);
        }}
      />
    </div>
  );
}
