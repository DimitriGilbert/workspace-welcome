import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence } from "motion/react";
import { Folder, PackagePlus, RefreshCw, Search, Settings, Sparkles, Terminal as TerminalIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@workspace-welcome/ui/components/button";
import { WorkspaceBrand } from "@workspace-welcome/ui/components/workspace-brand";
import type { ScaffoldJobSnapshot } from "@workspace-welcome/api/lib/scaffold";
import type { ScaffoldInput } from "@workspace-welcome/api/lib/scaffold-options";
import { scaffoldInputSchema } from "@workspace-welcome/api/lib/scaffold-options";
import { computeMosaicLayout, DEFAULT_MOSAIC_SIZES } from "@/lib/mosaic-layout";
import type { MosaicSize } from "@/lib/mosaic-layout";
import { cn } from "@workspace-welcome/ui/lib/utils";

import "@/components/designs/mission-bento/mission-bento.css";
import {
  AddRootDialog,
  CloneConsoleDialog,
  CreateConsoleDialog,
  ReportDialog,
} from "@/components/designs/mission-bento/console-dialogs";
import { VitalsBand, SignalLine } from "@/components/designs/mission-bento/signal-line";
import { InstrumentTile } from "@/components/designs/mission-bento/instrument-tile";
import type { ChannelId } from "@/components/designs/mission-bento/metrics";
import {
  CHANNEL_ORDER,
  channelCounts,
  channelProjects,
  fleetVitals,
} from "@/components/designs/mission-bento/metrics";
import {
  WorkspaceReportProvider,
} from "@/components/designs/mission-bento/report-data";
import {
  EmptyConsole,
  ErrorConsole,
  LoadingMosaic,
  NoMatch,
  RootErrors,
} from "@/components/designs/mission-bento/states";
import { useMbOpenProject } from "@/components/designs/mission-bento/open-project";
import { ideationScaffoldSeedKey } from "@/lib/ideation-seed";
import { matchProject } from "@/lib/search";
import { useTRPC } from "@/utils/trpc";

type ScaffoldResult = NonNullable<ScaffoldJobSnapshot["result"]>;

export const Route = createFileRoute("/designs/mission-bento/")({
  component: MissionBentoRoute,
});

const CHANNEL_LABEL: Record<ChannelId, string> = {
  mosaic: "Mosaic",
  triage: "Triage",
  pins: "Pins",
  cold: "Cold",
};

/** Full-width stack below 1024px: one tall + one short tier. */
const NARROW_SIZES: readonly MosaicSize[] = [
  { cols: 1, rows: 3 },
  { cols: 1, rows: 1 },
];

/** The shared canonical ladder; narrow stacks get the narrow variant. */
function ladderFor(columns: number): readonly MosaicSize[] {
  return columns === 1 ? NARROW_SIZES : DEFAULT_MOSAIC_SIZES;
}

/**
 * Mission Bento: the ops console carrying a mosaic. The tiles are placed by
 * the shared bento algorithm (@/lib/mosaic-layout — log-scaled set-relative
 * recency, sizes 3×3 → 1×1, line-filling skyline), dressed in the console's
 * LED + mono instrument language, and fed by the cached snitch report: hero
 * tiles chart their own cadence, quality signals and languages; every tile
 * above compact carries commit/contributor/token/cost readouts. The signal
 * line above is one aligned instrument row — report-backed where the snitch
 * report is the best surface, scan-backed where only the scan knows.
 */
function MissionBentoRoute() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const openProject = useMbOpenProject();

  const scan = useQuery(trpc.projects.scan.queryOptions());
  const roots = useQuery(trpc.roots.list.queryOptions());

  const [channel, setChannel] = useState<ChannelId>("mosaic");
  const [query, setQuery] = useState("");
  const [addRootOpen, setAddRootOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Mosaic grid geometry per breakpoint (recomputed on change; SSR starts on
  // the desktop ladder and the first effect corrects it).
  const [geometry, setGeometry] = useState<{ columns: number; sizes: readonly MosaicSize[] }>({
    columns: 12,
    sizes: DEFAULT_MOSAIC_SIZES,
  });
  useEffect(() => {
    const xl = window.matchMedia("(min-width: 1536px)");
    const lg = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      if (xl.matches) {
        setGeometry({ columns: 12, sizes: ladderFor(12) });
      } else if (lg.matches) {
        setGeometry({ columns: 6, sizes: ladderFor(6) });
      } else {
        setGeometry({ columns: 1, sizes: ladderFor(1) });
      }
    };
    update();
    xl.addEventListener("change", update);
    lg.addEventListener("change", update);
    return () => {
      xl.removeEventListener("change", update);
      lg.removeEventListener("change", update);
    };
  }, []);

  // Keyboard-first console: "/" filter, 1-4 channels, Escape clears. Guarded
  // against typing contexts so dialogs keep their keystrokes.
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
        setChannel(CHANNEL_ORDER[Number(e.key) - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const projects = scan.data?.projects ?? [];
  const rootsList = roots.data ?? [];
  const hasRoots = rootsList.length > 0;
  const loading = scan.isLoading;
  const now = scan.dataUpdatedAt || Date.now();

  const visible = useMemo(
    () => projects.filter((p) => matchProject(p, query)),
    [projects, query],
  );
  const counts = useMemo(() => channelCounts(visible, now), [visible, now]);
  const vitals = useMemo(() => fleetVitals(projects, now), [projects, now]);

  // The shared algorithm packs whichever set the channel narrows to.
  const channelSet = useMemo(
    () => channelProjects(visible, channel, now),
    [visible, channel, now],
  );
  const layout = useMemo(
    () =>
      computeMosaicLayout(
        channelSet.map((p) => ({ path: p.path, updatedAt: p.updatedAt, pinned: p.pinned })),
        { now, gridColumns: geometry.columns, sizes: geometry.sizes },
      ),
    [channelSet, now, geometry],
  );
  const byPath = useMemo(
    () => new Map(channelSet.map((p) => [p.path, p])),
    [channelSet],
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: trpc.projects.scan.queryKey() });
  };

  const syncedLabel =
    scan.dataUpdatedAt && Date.now() - scan.dataUpdatedAt < 60_000
      ? "just now"
      : scan.dataUpdatedAt
        ? relativeTimeShort(new Date(scan.dataUpdatedAt).toISOString())
        : "pending";

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
    openProject(projectDirectory, true);
  };

  const handleCreateSuccess = (result: ScaffoldResult) => {
    const segments = result.projectDirectory.split("/").filter(Boolean);
    const name = segments.at(-1) ?? result.projectDirectory;
    const toastId = toast.success(`Created ${name} in ${formatElapsed(result.elapsedTimeMs)}`, {
      description: result.reproducibleCommand,
      action: (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              openProject(result.projectDirectory);
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
    });
    refresh();
  };

  const stageBody = () => {
    if (loading) return <LoadingMosaic />;
    if (scan.isError) {
      return <ErrorConsole message={scan.error.message} onRetry={() => scan.refetch()} />;
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
    if (layout.placements.length === 0) {
      return <QuietChannel channel={channel} />;
    }
    return (
      <section aria-label={`${CHANNEL_LABEL[channel]} tiles`} className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="mb-label">{CHANNEL_LABEL[channel]}</h2>
          <span className="mb-num text-[10px] text-muted-foreground">{layout.placements.length}</span>
        </div>
        {/* AnimatePresence renders no wrapper DOM, so placements stay direct
            grid children; popLayout lets exits overlap the layout remap. */}
        <div className="mb-mosaic">
          <AnimatePresence initial={false} mode="popLayout">
            {layout.placements.map((placement) => {
              const project = byPath.get(placement.path);
              if (project === undefined) return null;
              return (
                <InstrumentTile
                  key={placement.path}
                  project={project}
                  placement={placement}
                  now={now}
                  onOpen={openProject}
                />
              );
            })}
          </AnimatePresence>
        </div>
      </section>
    );
  };

  return (
    <div className="mb">
      <h1 className="sr-only">Mission Bento</h1>

      <header className="sticky top-0 z-30 border-b border-[var(--mb-line)] bg-background/95 backdrop-blur-sm">
        <div
          className={cn(
            "mb-stage mx-auto flex w-full max-w-[3520px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5",
            "lg:flex-nowrap lg:px-6",
          )}
        >
          <WorkspaceBrand render={<Link to="/" />} />
          <Link
            to="/designs"
            className="rounded-[4px] border border-[var(--mb-line-strong)] px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-[var(--mb-accent)]"
          >
            mission-bento
          </Link>

          <nav
            aria-label="Console channels"
            className="flex items-center rounded-[4px] border border-[var(--mb-line)]"
            role="group"
          >
            {CHANNEL_ORDER.map((id, i) => (
              <button
                key={id}
                type="button"
                className="mb-channel"
                aria-pressed={channel === id}
                onClick={() => setChannel(id)}
                title={`${CHANNEL_LABEL[id]} (${i + 1})`}
              >
                {CHANNEL_LABEL[id]}
                <span
                  className={cn(
                    "ml-1.5 tabular-nums",
                    id === "triage" && counts.triage > 0 && "text-[var(--mb-amber)]",
                  )}
                >
                  {counts[id]}
                </span>
              </button>
            ))}
          </nav>

          <div className="w-full sm:w-auto sm:min-w-56 sm:max-w-sm sm:flex-1">
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") e.preventDefault();
                }}
                placeholder="Filter fleet"
                aria-label="Filter fleet"
                className="mb-input h-8 w-full pr-9 pl-8"
              />
              <kbd aria-hidden className="mb-kbd absolute right-2 top-1/2 -translate-y-1/2">
                /
              </kbd>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <span className="mr-1 hidden font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground xl:inline">
              {scan.isFetching ? "Syncing…" : `Synced ${syncedLabel}`}
            </span>
            <button
              type="button"
              onClick={refresh}
              disabled={scan.isFetching}
              className="mb-act"
              aria-label="Rescan"
              title="Rescan"
            >
              <RefreshCw aria-hidden className={cn("size-3", scan.isFetching && "animate-spin")} />
              <span className="hidden lg:inline">Rescan</span>
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mb-act"
              aria-label="New project"
              title="New project"
            >
              <PackagePlus aria-hidden className="size-3.5" />
              <span className="hidden lg:inline">New</span>
            </button>
            <button
              type="button"
              onClick={() => setAddRootOpen(true)}
              className="mb-act"
              aria-label="Add directory"
              title="Add directory"
            >
              <Folder aria-hidden className="size-3.5" />
              <span className="hidden lg:inline">Add</span>
            </button>
            <button
              type="button"
              onClick={() => setCloneOpen(true)}
              disabled={projects.length === 0}
              className="mb-act"
              aria-label="Clone script"
              title="Clone script"
            >
              <TerminalIcon aria-hidden className="size-3.5" />
              <span className="hidden lg:inline">Clone</span>
            </button>
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              disabled={!hasRoots}
              className="mb-act"
              aria-label="Open HTML report"
              title="Open HTML report"
            >
              <Sparkles aria-hidden className="size-3.5" />
              <span className="hidden lg:inline">Report</span>
            </button>
            <Button
              variant="ghost"
              size="icon-sm"
              render={<Link to="/settings" aria-label="Settings" />}
            >
              <Settings className="size-3.5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mb-stage mx-auto flex w-full max-w-[3520px] flex-col gap-5 px-4 pb-14 pt-5 lg:px-6">
        <RootErrors errors={scan.data?.rootErrors ?? []} />

        {loading || scan.isError || projects.length === 0 || visible.length === 0 ? (
          stageBody()
        ) : (
          <>
            <section aria-label="Fleet vitals" className="flex flex-wrap items-end justify-between gap-4">
              <VitalsBand vitals={vitals} />
              <p className="hidden items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground xl:flex">
                <kbd className="mb-kbd">/</kbd> filter
                <kbd className="mb-kbd ml-2">1-4</kbd> channels
                <kbd className="mb-kbd ml-2">esc</kbd> clear
              </p>
            </section>

            <WorkspaceReportProvider roots={rootsList} projects={projects}>
              <SignalLine projects={visible} />
              {stageBody()}
            </WorkspaceReportProvider>
          </>
        )}
      </main>

      <AddRootDialog open={addRootOpen} onOpenChange={setAddRootOpen} />
      <CloneConsoleDialog
        open={cloneOpen}
        onOpenChange={setCloneOpen}
        projects={visible}
      />
      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} roots={rootsList} />
      <CreateConsoleDialog
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

function QuietChannel({ channel }: { channel: ChannelId }) {
  const notes: Record<ChannelId, { title: string; body: string }> = {
    mosaic: { title: "Empty view", body: "No projects in the current filter." },
    triage: {
      title: "Fleet nominal",
      body: "No error or warning alerts are open. Every unit is on branch, in sync and clean.",
    },
    pins: {
      title: "No pins",
      body: "Pin instruments from the mosaic to keep them docked here.",
    },
    cold: {
      title: "Cold rack empty",
      body: "Stale and cold units collect here once they quiet down.",
    },
  };
  const note = notes[channel];
  return (
    <div className="mb-panel flex flex-col items-center gap-2 border-dashed px-6 py-14 text-center">
      <h2 className="mb-label text-foreground">{note.title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{note.body}</p>
    </div>
  );
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${String(rest).padStart(2, "0")}s` : `${rest}s`;
}

function relativeTimeShort(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * The wizard's ScaffoldInput for the scaffold that just succeeded, recovered
 * from the MutationCache where the settled `scaffold.start` mutation still
 * holds its variables. Null when unavailable — ideation starts unseeded.
 */
function latestScaffoldStartInput(
  queryClient: ReturnType<typeof useQueryClient>,
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

function isScaffoldStartMutationKey(
  key: readonly unknown[] | undefined,
): boolean {
  const path = key?.flat(2);
  return path?.at(-2) === "scaffold" && path?.at(-1) === "start";
}
