import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Group, Panel, Separator } from "react-resizable-panels";
import type { Layout } from "react-resizable-panels";
import { MotionConfig } from "motion/react";
import { CloudOff, RefreshCw, SearchX, Sun } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@workspace-welcome/ui/components/button";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";

import { useTRPC } from "@/utils/trpc";
import { AttentionBand } from "@/components/designs/meadow/attention";
import { ContextPanel } from "@/components/designs/meadow/context";
import {
  dailyActivity,
  flaggedProjects,
  freshnessCounts,
  stackBreakdown,
  touchedWithinDays,
} from "@/components/designs/meadow/derive";
import {
  MeadowAddRootDialog,
  MeadowCloneDialog,
  MeadowCreateDialog,
} from "@/components/designs/meadow/flows";
import { MeadowHeader } from "@/components/designs/meadow/header";
import { ProjectTile } from "@/components/designs/meadow/tile";
import { useMediaQuery } from "@/components/designs/meadow/use-media-query";
import { computeMosaicLayout } from "@/lib/mosaic-layout";
import type { MosaicSize } from "@/lib/mosaic-layout";
import "@/components/designs/meadow/meadow.css";
import { matchProject } from "@/lib/search";

export const Route = createFileRoute("/designs/meadow/")({
  component: MeadowPage,
});

/** Default two-panel split (percent of the group, per panel id). */
const DEFAULT_LAYOUT: Layout = { "meadow-mosaic": 76, "meadow-context": 24 };

/**
 * Session-persisted panel geometry at module scope, so navigating to a
 * project page and back keeps the drag; a reload intentionally resets it.
 */
let sessionLayout: Layout = { ...DEFAULT_LAYOUT };

/** Mosaic packing config per breakpoint: narrower phones get a smaller
 * ladder (the 3-wide tiers can't read at ~80px cells) on a 2-column grid. */
function useMosaicConfig(): {
  columns: number;
  sizes?: readonly MosaicSize[];
} {
  const xl = useMediaQuery("(min-width: 1280px)");
  const md = useMediaQuery("(min-width: 768px)");
  if (xl) return { columns: 12 };
  if (md) return { columns: 8 };
  return {
    columns: 2,
    sizes: [
      { cols: 2, rows: 2 },
      { cols: 2, rows: 1 },
      { cols: 1, rows: 1 },
    ],
  };
}

function MeadowPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const wide = useMediaQuery("(min-width: 1024px)");
  const mosaicConfig = useMosaicConfig();

  const scan = useQuery(trpc.projects.scan.queryOptions());
  const rootsQuery = useQuery(trpc.roots.list.queryOptions());

  const [addRootOpen, setAddRootOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [clock] = useState(() => new Date());
  const [layout, setLayout] = useState<Layout>(sessionLayout);
  const searchRef = useRef<HTMLInputElement>(null);

  // Keyboard-first search, same contract as the live dashboard: "/" focuses,
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
        setQuery("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const projects = scan.data?.projects ?? [];
  const roots = rootsQuery.data ?? [];
  const hasRoots = roots.length > 0;
  const loading = scan.isLoading;
  // One clock per data epoch so tile scores and the digests never disagree.
  const dataNow = scan.dataUpdatedAt || Date.now();

  const visible = useMemo(
    () => projects.filter((p) => matchProject(p, query)),
    [projects, query],
  );

  // The context panel describes the whole workspace; the filter only
  // reshapes the mosaic, so the digests keep meaning while you narrow.
  const contextSummary = useMemo(
    () => ({
      activity: dailyActivity(projects, 28, dataNow),
      touchedThisWeek: touchedWithinDays(projects, 7, dataNow),
      freshness: freshnessCounts(projects),
      stacks: stackBreakdown(projects),
      roots,
      projectsPerRoot: projects.reduce((map, p) => {
        map.set(p.rootId, (map.get(p.rootId) ?? 0) + 1);
        return map;
      }, new Map<string, number>()),
      rootErrors: scan.data?.rootErrors ?? [],
    }),
    [projects, roots, scan.data?.rootErrors, dataNow],
  );

  const attentionFlagged = useMemo(() => flaggedProjects(visible), [visible]);

  // The shared bento sizing + packing: log-scaled set-relative recency into
  // 3×3/2×3/2×2/2×1/1×1 tiers, packed line-filling onto the breakpoint's
  // grid width. Same input + clock → same layout.
  const mosaic = useMemo(
    () =>
      computeMosaicLayout(
        visible.map((p) => ({
          path: p.path,
          updatedAt: p.updatedAt,
          pinned: p.pinned,
        })),
        { now: dataNow, gridColumns: mosaicConfig.columns, sizes: mosaicConfig.sizes },
      ),
    [visible, dataNow, mosaicConfig],
  );
  const placementOf = useMemo(
    () => new Map(mosaic.placements.map((p) => [p.path, p])),
    [mosaic],
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: trpc.projects.scan.queryKey() });
  };

  const reportPath = roots[0]?.path ?? "";

  const contextPanel = (
    <ContextPanel
      summary={contextSummary}
      reportPath={reportPath}
      reportUpdatedAts={projects.map((p) => p.updatedAt)}
      fill={wide}
    />
  );

  const mosaicBody = loading ? (
    <MeadowLoading />
  ) : scan.isError ? (
    <ScanErrorPanel message={scan.error.message} onRetry={refresh} />
  ) : projects.length === 0 ? (
    <MeadowEmpty noRoots={!hasRoots} onAddRoot={() => setAddRootOpen(true)} />
  ) : visible.length === 0 ? (
    <NoMatchPanel query={query} onClear={() => setQuery("")} />
  ) : (
    <div
      aria-label="Projects by recency"
      className="meadow-mosaic grid gap-3"
      style={{
        gridTemplateColumns: `repeat(${mosaic.columns}, minmax(0, 1fr))`,
      }}
    >
      {visible.map((p) => {
        const placement = placementOf.get(p.path);
        if (!placement) return null;
        return <ProjectTile key={p.path} project={p} placement={placement} />;
      })}
    </div>
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="meadow flex h-svh flex-col overflow-hidden">
        <div className="flex shrink-0 flex-col gap-4 px-5 pt-5 md:px-8 2xl:px-12">
          <MeadowHeader
            now={clock}
            projectCount={projects.length}
            rootCount={roots.length}
            flaggedCount={flaggedProjects(projects).length}
            scannedAt={scan.dataUpdatedAt}
            query={query}
            onQueryChange={setQuery}
            searchRef={searchRef}
            onRefresh={refresh}
            refreshing={scan.isFetching}
            onNewProject={() => setCreateOpen(true)}
            onAddRoot={() => setAddRootOpen(true)}
            onCloneScript={() => setCloneOpen(true)}
          />
          {!loading && !scan.isError && projects.length > 0 ? (
            <AttentionBand projects={attentionFlagged} />
          ) : null}
        </div>

        {wide ? (
          <main className="min-h-0 flex-1 px-5 pt-4 pb-4 md:px-8 2xl:px-12">
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
              <Panel id="meadow-mosaic" minSize="40%" defaultSize="76%">
                <div className="meadow-scroll h-full overflow-y-auto py-1 pr-2">
                  {mosaicBody}
                </div>
              </Panel>
              <Separator className="meadow-separator" id="meadow-sep" />
              <Panel
                id="meadow-context"
                minSize="15%"
                maxSize="34%"
                defaultSize="24%"
              >
                {contextPanel}
              </Panel>
            </Group>
          </main>
        ) : (
          <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pt-5 pb-8 md:px-8">
            {mosaicBody}
            {contextPanel}
          </main>
        )}

        <MeadowAddRootDialog
          open={addRootOpen}
          onOpenChange={setAddRootOpen}
        />
        <MeadowCloneDialog
          projects={visible}
          open={cloneOpen}
          onOpenChange={setCloneOpen}
        />
        <MeadowCreateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSuccess={(projectDirectory) => {
            const name =
              projectDirectory.split("/").filter(Boolean).at(-1) ??
              projectDirectory;
            toast.success(`Created ${name}`);
            refresh();
          }}
          onError={(message) => toast.error(message)}
          onRequestAddRoot={() => setAddRootOpen(true)}
        />
      </div>
    </MotionConfig>
  );
}

function MeadowLoading() {
  return (
    <div className="meadow-mosaic grid grid-cols-2 gap-3 md:auto-rows-[100px] md:grid-cols-8 xl:grid-cols-12 xl:auto-rows-[104px]">
      <Skeleton className="col-span-2 h-40 md:col-span-3 md:h-full" />
      <Skeleton className="col-span-2 h-40 md:col-span-2 md:h-full" />
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="col-span-1 h-24 md:h-full" />
      ))}
    </div>
  );
}

function ScanErrorPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section
      aria-labelledby="meadow-error-h"
      className="meadow-panel flex flex-col items-center gap-3 p-12 text-center"
    >
      <span
        aria-hidden
        className="flex size-12 items-center justify-center rounded-full"
        style={{
          color: "var(--sev-error)",
          background: "color-mix(in oklch, var(--sev-error) 9%, transparent)",
        }}
      >
        <CloudOff className="size-5" />
      </span>
      <h2
        id="meadow-error-h"
        className="text-base font-semibold tracking-tight text-foreground"
      >
        The scan didn&rsquo;t come back
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
        <RefreshCw aria-hidden className="size-3.5" /> Try again
      </Button>
    </section>
  );
}

function MeadowEmpty({
  noRoots,
  onAddRoot,
}: {
  noRoots: boolean;
  onAddRoot: () => void;
}) {
  return (
    <section
      aria-labelledby="meadow-empty-h"
      className="meadow-panel flex flex-col items-center gap-4 p-16 text-center"
    >
      <span
        aria-hidden
        className="flex size-16 items-center justify-center rounded-full"
        style={{
          color: "var(--recency-fresh)",
          background:
            "color-mix(in oklch, var(--recency-fresh) 10%, transparent)",
        }}
      >
        <Sun className="size-7" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2
          id="meadow-empty-h"
          className="text-lg font-semibold tracking-tight text-foreground"
        >
          {noRoots ? "A quiet start" : "No projects yet"}
        </h2>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          {noRoots
            ? "Point Meadow at a folder of projects and it will keep an eye on git state, stacks, and health — a calm morning brief, every time you open it."
            : "None of the directories under this root look like projects yet. Add another directory, or drop a project into this one."}
        </p>
      </div>
      {noRoots ? (
        <Button onClick={onAddRoot} className="mt-1">
          Add your first directory
        </Button>
      ) : null}
    </section>
  );
}

function NoMatchPanel({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <section
      aria-labelledby="meadow-nomatch-h"
      className="meadow-panel flex flex-col items-center gap-3 p-14 text-center"
    >
      <span
        aria-hidden
        className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <SearchX className="size-5" />
      </span>
      <h2
        id="meadow-nomatch-h"
        className="text-base font-semibold tracking-tight text-foreground"
      >
        Nothing matches &ldquo;{query}&rdquo;
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Try a different term — search spans names, paths, stacks, branches,
        hosts, and notes.
      </p>
      <Button variant="outline" size="sm" onClick={onClear} className="mt-1">
        Clear filter
      </Button>
    </section>
  );
}
