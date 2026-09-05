import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, LayoutGroup, motion, MotionConfig } from "motion/react";
import type { QueryClient } from "@tanstack/react-query";
import { Folder, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@workspace-welcome/ui/components/button";
import { scaffoldInputSchema } from "@workspace-welcome/api/lib/scaffold-options";
import type { ScaffoldInput } from "@workspace-welcome/api/lib/scaffold-options";
import type { ScaffoldJobSnapshot } from "@workspace-welcome/api/lib/scaffold";

import "@/components/designs/bento/bento.css";
import { useTRPC } from "@/utils/trpc";
import { ActivityTile } from "@/components/designs/bento/activity-tile";
import {
  healthSummary,
  buildMosaic,
  indexReportExport,
  severityCounts,
  stackDistribution,
} from "@/components/designs/bento/bento-metrics";
import { AttentionTile } from "@/components/designs/bento/attention-tile";
import {
  AddRootDialog,
  CloneScriptDialog,
  CreateProjectDialog,
  ReportRunDialog,
} from "@/components/designs/bento/bento-dialogs";
import { BentoHeader } from "@/components/designs/bento/bento-header";
import { BentoTile } from "@/components/designs/bento/bento-tile";
import { HealthTile } from "@/components/designs/bento/health-tile";
import { ProjectTile } from "@/components/designs/bento/project-tile";
import { ReportPanel } from "@/components/designs/bento/report-panel";
import { SizeLegend } from "@/components/designs/bento/recency-ring";
import { SeverityTile } from "@/components/designs/bento/severity-tile";
import { StackTile } from "@/components/designs/bento/stack-tile";
import {
  EmptyTile,
  ErrorTile,
  LoadingMosaic,
  NoMatchesTile,
  RootErrors,
} from "@/components/designs/bento/states";
import { useOpenBentoProject } from "@/components/designs/bento/use-open-bento-project";
import { isReportStale } from "@workspace-welcome/api/lib/report-staleness";

import { ideationScaffoldSeedKey } from "@/lib/ideation-seed";
import { matchProject } from "@/lib/search";

type ScaffoldResult = NonNullable<ScaffoldJobSnapshot["result"]>;

export const Route = createFileRoute("/designs/bento/")({
  component: BentoPage,
});

/**
 * "Bento" concept, round 3: a dark glazed widget mosaic sized by the SHARED
 * mosaic-layout algorithm — log-scaled set-relative recency through the
 * canonical 3×3 / 2×3 / 2×2 / 2×1 / 1×1 ladder, skyline-packed on a
 * 12-column grid so every row fills. One lazily-fetched git-snitch scan
 * export feeds BOTH the pulse band (tabbed charts, MISSING / RUNNING /
 * STALE / FRESH) and the data-hungry tiles (commits, contributors,
 * subsidized AI cost, cadence) — no per-tile fetching. Flat tiles at rest;
 * feedback is hover-only. Everything renders live tRPC scan data.
 */
function BentoPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const scan = useQuery(trpc.projects.scan.queryOptions());
  const roots = useQuery(trpc.roots.list.queryOptions());

  const [addRootOpen, setAddRootOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses the command field; ignored while typing elsewhere so we
  // never hijack the dialogs' inputs.
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const projects = scan.data?.projects ?? [];

  // The filter narrows one coherent set that every tile reads, so searching
  // re-aims the whole mosaic (health, activity, stacks, pulse) at once.
  const visible = useMemo(
    () => projects.filter((p) => matchProject(p, query)),
    [projects, query],
  );

  // A new scan re-derives sizes and reading order; `now` rides the scan so
  // the rings' ages are fresh exactly when the data is.
  const now = useMemo(
    () => (scan.dataUpdatedAt > 0 ? scan.dataUpdatedAt : Date.now()),
    [scan.dataUpdatedAt],
  );
  const mosaic = useMemo(() => buildMosaic(visible, now), [visible, now]);
  const visibleByPath = useMemo(
    () => new Map(visible.map((p) => [p.path, p])),
    [visible],
  );
  const health = useMemo(() => healthSummary(visible, now), [visible, now]);
  const stacks = useMemo(() => stackDistribution(visible), [visible]);
  const counts = useMemo(() => severityCounts(visible), [visible]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: trpc.projects.scan.queryKey() });
  };

  // The snitch dataset: ONE lazily-fetched scan export shared by the pulse
  // band and the data-bearing tiles. The query keys match ReportPanel's
  // internal ones exactly, so react-query dedupes the fetch.
  const firstRoot = roots.data?.[0];
  const commandQuery = useQuery(
    trpc.reports.command.queryOptions(
      { kind: "scan", path: firstRoot?.path ?? "" },
      { enabled: firstRoot !== undefined },
    ),
  );
  const exportKey = commandQuery.data?.key ?? null;
  const exportQuery = useQuery(
    trpc.reports.jsonExport.queryOptions(
      { key: exportKey ?? "" },
      { enabled: exportKey !== null },
    ),
  );
  const dataset = useMemo(
    () => (exportQuery.data ? indexReportExport(exportQuery.data) : null),
    [exportQuery.data],
  );

  const openBentoProject = useOpenBentoProject();
  const navigate = useNavigate();

  // Same ideation handoff as the main dashboard: park the scaffold wizard's
  // input in session storage, then deep-link into the fresh project's
  // ideation panel (PRD §3) — inside this concept's project page.
  const startIdeation = (projectDirectory: string) => {
    const seed = latestScaffoldStartInput(queryClient);
    if (seed !== null) {
      try {
        sessionStorage.setItem(
          ideationScaffoldSeedKey(projectDirectory),
          JSON.stringify(seed),
        );
      } catch {
        // Private mode etc. — the panel starts unseeded; navigation must
        // still happen.
      }
    }
    navigate({
      to: "/designs/bento/project/$",
      params: { _splat: projectDirectory.replace(/^\/+/, "") },
      search: { ideation: "new" },
    });
  };

  const handleCreateSuccess = (result: ScaffoldResult) => {
    const segments = result.projectDirectory.split("/").filter(Boolean);
    // One compact toast action row: open the project, or jump into ideation
    // with the wizard's seed. Buttons dismiss by id — see the dashboard's
    // identical wiring for the sonner single-action-slot details.
    const toastId = toast.success(
      `Created ${segments.at(-1) ?? result.projectDirectory} in ${formatElapsed(result.elapsedTimeMs)}`,
      {
        description: result.reproducibleCommand,
        action: (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                openBentoProject(result.projectDirectory);
                toast.dismiss(toastId);
              }}
            >
              <Folder className="size-3.5" /> Open project
            </Button>
            <Button
              size="sm"
              onClick={() => {
                startIdeation(result.projectDirectory);
                toast.dismiss(toastId);
              }}
            >
              <Sparkles className="size-3.5" /> Start ideation
            </Button>
          </div>
        ),
      },
    );
    refresh();
  };

  const hasRoots = (roots.data?.length ?? 0) > 0;
  const loading = scan.isLoading;

  return (
    <div className="bento-root">
      <MotionConfig reducedMotion="user" transition={{ duration: 0.28, ease: [0.2, 0.9, 0.3, 1] }}>
        <h1 className="sr-only">Projects</h1>

        <div className="mx-auto flex w-full max-w-[3520px] flex-col gap-4">
          <BentoHeader
            query={query}
            onQueryChange={setQuery}
            searchRef={searchRef}
            visibleCount={visible.length}
            totalCount={projects.length}
            isFetching={scan.isFetching}
            hasRoots={hasRoots}
            hasProjects={projects.length > 0}
            onRefresh={refresh}
            onClone={() => setCloneOpen(true)}
            onReport={() => setReportOpen(true)}
            onCreate={() => setCreateOpen(true)}
            onAddRoot={() => setAddRootOpen(true)}
          />

          {loading ? (
            <LoadingMosaic />
          ) : scan.isError ? (
            <ErrorTile message={scan.error.message} onRetry={() => scan.refetch()} />
          ) : projects.length === 0 ? (
            <>
              <RootErrors errors={scan.data?.rootErrors ?? []} />
              <EmptyTile noRoots={!hasRoots} onAddRoot={() => setAddRootOpen(true)} />
            </>
          ) : (
            <main className="flex flex-col gap-4">
              <RootErrors errors={scan.data?.rootErrors ?? []} />

              {/* Vitals: health gauge, activity trend, stack donut — one
                  aligned band, every tile the same height. */}
              <section className="bento-grid" aria-label="Workspace vitals">
                <HealthTile summary={health} />
                <ActivityTile projects={visible} />
                <StackTile slices={stacks} />
              </section>

              {/* Focus: featured attention panel + signal mix. */}
              <section className="bento-grid" aria-label="Signals">
                <AttentionTile
                  attention={mosaic.attention}
                  totalProjects={visible.length}
                />
                <SeverityTile projects={visible} counts={counts} />
              </section>

              {/* Pulse: the tabbed snitch-report widget over the newest
                  cached export (MISSING / RUNNING / STALE / FRESH). */}
              {firstRoot ? (
                <section className="bento-grid" aria-label="Workspace pulse">
                  <BentoTile span="sp-pulse" className="b-pulse-h flex flex-col p-5">
                    <ReportPanel
                      kind="scan"
                      path={firstRoot.path}
                      projects={projects}
                      className="min-h-0 flex-1"
                    />
                  </BentoTile>
                </section>
              ) : null}

              {/* The mosaic: the shared algorithm packs recency-sized blocks
                  onto the 12-column grid; a scan repacks the map and motion
                  animates every block between its boxes. */}
              <MosaicSection count={mosaic.layout.placements.length}>
                <LayoutGroup id="bento-mosaic">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {mosaic.layout.placements.map((placement) => {
                      const project = visibleByPath.get(placement.path);
                      if (!project) return null;
                      const report = dataset?.byPath.get(placement.path);
                      const reportStale =
                        dataset !== null &&
                        isReportStale(dataset.generatedAt, project.updatedAt);
                      return (
                        <motion.div
                          key={placement.path}
                          layout
                          className="b-cell"
                          style={
                            {
                              "--x": placement.x + 1,
                              "--y": placement.y + 1,
                              "--cols": placement.cols,
                              "--rows": placement.rows,
                            } as CSSProperties
                          }
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{
                            layout: { type: "spring", stiffness: 340, damping: 34 },
                          }}
                        >
                          <ProjectTile
                            project={project}
                            placement={placement}
                            report={report}
                            reportStale={reportStale}
                            now={now}
                          />
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </LayoutGroup>
              </MosaicSection>

              {visible.length === 0 ? (
                <NoMatchesTile query={query} onClear={() => setQuery("")} />
              ) : null}
            </main>
          )}
        </div>

        <AddRootDialog open={addRootOpen} onOpenChange={setAddRootOpen} />
        <ReportRunDialog open={reportOpen} onOpenChange={setReportOpen} />
        <CloneScriptDialog
          // The picker respects the active filter, so you can narrow first and
          // select-all-within-filter, exactly like the main dashboard.
          projects={visible}
          open={cloneOpen}
          onOpenChange={setCloneOpen}
        />
        <CreateProjectDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSuccess={handleCreateSuccess}
          onError={(message) => toast.error(message)}
          onRequestAddRoot={() => setAddRootOpen(true)}
        />
      </MotionConfig>
    </div>
  );
}

function MosaicSection({ count, children }: { count: number; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label="Projects">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <h2 className="b-label">Projects</h2>
        <span className="font-mono text-[0.68rem] tabular-nums text-muted-foreground">
          {count}
        </span>
        <span className="ml-auto hidden md:block">
          <SizeLegend />
        </span>
      </div>
      <div className="bento-mosaic">{children}</div>
    </section>
  );
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0
    ? `${minutes}m ${String(rest).padStart(2, "0")}s`
    : `${rest}s`;
}

/**
 * The wizard's ScaffoldInput for the scaffold that just succeeded. Not part
 * of the job result; recovered from the MutationCache where the settled
 * `scaffold.start` mutation still holds its variables, validated through the
 * shared schema. Null when unavailable — ideation simply starts unseeded.
 */
function latestScaffoldStartInput(
  queryClient: QueryClient,
): ScaffoldInput | null {
  const latest = queryClient
    .getMutationCache()
    .getAll()
    .filter(
      (mutation) =>
        isScaffoldStartMutationKey(mutation.options.mutationKey) &&
        mutation.state.status === "success",
    )
    .sort((a, b) => b.state.submittedAt - a.state.submittedAt)[0];
  if (latest === undefined) return null;
  const parsed = scaffoldInputSchema.safeParse(latest.state.variables);
  return parsed.success ? parsed.data : null;
}

/**
 * tRPC nests the procedure path inside the react-query mutation key —
 * `[['scaffold', 'start']]` here. Matched from the flattened path's tail so
 * the check is prefix-tolerant but rejects longer procedure paths.
 */
function isScaffoldStartMutationKey(
  key: readonly unknown[] | undefined,
): boolean {
  const path = key?.flat(2);
  return path?.at(-2) === "scaffold" && path?.at(-1) === "start";
}
