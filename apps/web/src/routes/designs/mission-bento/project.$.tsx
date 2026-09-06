import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CodeXml,
  Copy,
  ExternalLink as ExternalLinkIcon,
  FileText,
  Folder,
  Loader2,
  RefreshCw,
  Terminal as TerminalIcon,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@workspace-welcome/ui/components/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@workspace-welcome/ui/components/carousel";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";
import { Textarea } from "@workspace-welcome/ui/components/textarea";
import { WorkspaceBrand } from "@workspace-welcome/ui/components/workspace-brand";
import { cn } from "@workspace-welcome/ui/lib/utils";
import type { Project } from "@workspace-welcome/api/lib/types";
import { computeMosaicLayout } from "@/lib/mosaic-layout";
import type { MosaicPlacement } from "@/lib/mosaic-layout";

import "@/components/designs/mission-bento/mission-bento.css";
import { CadenceChart, SplitDonut } from "@/components/designs/mission-bento/charts";
import { Led, projectLed } from "@/components/designs/mission-bento/led";
import {
  AiPane,
  AlertsCensus,
} from "@/components/designs/mission-bento/instruments";
import { InstrumentTile } from "@/components/designs/mission-bento/instrument-tile";
import { PulseLine } from "@/components/designs/mission-bento/pulse-line";
import { useProjectSnitchReport } from "@/components/designs/mission-bento/report-data";
import type { ProjectReportState } from "@/components/designs/mission-bento/report-data";
import {
  entryAsExport,
  formatCompact,
  formatCost,
  projectCadence,
  projectLanguages,
} from "@/components/designs/mission-bento/report-utils";
import { useTRPC } from "@/utils/trpc";
import { dateTooltip, relativeTime } from "@/lib/format";
import { hostLabel, stackIcon } from "@/lib/icons";
import { useReportRun } from "@/lib/use-report";
import { AlertBadge } from "@/components/git-badges";
import { FileBrowser } from "@/components/file-browser";
import { ArtifactsPanel } from "@/components/artifacts";
import { IdeationPanel } from "@/components/ideation/ideation-panel";
import { CommitHistoryCell } from "@/components/project-commit-history";
import {
  BranchSwitcher,
  GitActionsToolbar,
} from "@/components/project-git-actions";

/**
 * Search params: `?ideation=new` is the create-success toast's deep link into
 * a fresh ideation session. Only "new" is meaningful — anything else degrades
 * to absent instead of erroring the route.
 */
const projectSearchSchema = z.object({
  ideation: z.literal("new").optional().catch(undefined),
});

export const Route = createFileRoute("/designs/mission-bento/project/$")({
  validateSearch: projectSearchSchema,
  component: MissionBentoProjectPage,
});

/** IDE status poll cadence — cheap and local, so 5 s while anything runs. */
const IDE_POLL_MS = 5_000;

type Channel =
  | "overview"
  | "activity"
  | "code"
  | "ai"
  | "files"
  | "artifacts"
  | "ideation";

const CHANNELS: readonly { id: Channel; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "activity", label: "Activity" },
  { id: "code", label: "Code" },
  { id: "ai", label: "AI" },
  { id: "files", label: "Files" },
  { id: "artifacts", label: "Artifacts" },
  { id: "ideation", label: "Ideation" },
];

/** Deep link into the shared code-server using the browsing host. */
function ideUrl(port: number, projectPath: string): string {
  return `http://${window.location.hostname}:${port}/?folder=${encodeURIComponent(projectPath)}`;
}

/** Install progress label — the percentage only when the size is known. */
function installingLabel(install: {
  receivedBytes: number | null;
  totalBytes: number | null;
}): string {
  if (install.receivedBytes === null || install.totalBytes === null) {
    return "Installing IDE…";
  }
  return `Installing IDE… (${Math.floor(
    (install.receivedBytes / install.totalBytes) * 100,
  )} %)`;
}

/**
 * The mission-bento project page: the dashboard's own instruments re-plugged
 * into console CHANNELS. Overview renders the project AS its mosaic
 * instrument tile beside the git panel, the alerts census and the dirty
 * bars; Activity the cadence area (graph ↔ table carousel) and the commit
 * graph; Code the language census (bars ↔ table), stacks donut and quality
 * signals with their summaries; AI the subsidized cost as the headline
 * figure; then Files, Artifacts and Ideation channels. Every report-backed
 * panel is a dashboard-widget ancestor; sparse views are grouped into
 * multi-widget rows, never stretched into empty full-width frames.
 */
function MissionBentoProjectPage() {
  const { _splat } = Route.useParams();
  const path = `/${_splat ?? ""}`;
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { run: runReport, isPending: reportPending } = useReportRun();

  const scan = useQuery(trpc.projects.scan.queryOptions());
  const project = scan.data?.projects.find((p) => p.path === path) ?? null;

  const [channel, setChannel] = useState<Channel>("overview");

  // The project's snitch data: repo report when cached, newest workspace
  // scan's entry otherwise. One top-level call — every channel reads it.
  const snitch = useProjectSnitchReport(path, project?.updatedAt ?? null);

  // The project's instrument-tile placement, read from the same shared
  // algorithm (and therefore the same geometry) as the dashboard mosaic.
  const placement = useMemo<MosaicPlacement | null>(() => {
    if (!scan.data) return null;
    const layout = computeMosaicLayout(
      scan.data.projects.map((p) => ({
        path: p.path,
        updatedAt: p.updatedAt,
        pinned: p.pinned,
      })),
      { now: scan.dataUpdatedAt || Date.now(), gridColumns: 12 },
    );
    return layout.placements.find((pl) => pl.path === path) ?? null;
  }, [scan.data, scan.dataUpdatedAt, path]);

  // ?ideation=new consumption: switch to the ideation channel, scroll the
  // fresh-session form into view, then strip the flag from the URL.
  useEffect(() => {
    if (search.ideation !== "new" || project === null) return;
    setChannel("ideation");
    document.getElementById("ideation")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, ideation: undefined }),
      replace: true,
    });
  }, [search.ideation, project, navigate]);

  // Git mutations refresh both the scan and the commit log so the history
  // panel tracks every pull / push / fetch / branch switch.
  const invalidateScan = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.projects.scan.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.projects.commitLog.queryKey(),
      }),
    ]);

  const noteMutation = useMutation(
    trpc.projects.setNote.mutationOptions({
      onSuccess: () => invalidateScan(),
      onError: (e) => toast.error(e.message),
    }),
  );
  const openMutation = useMutation(
    trpc.projects.open.mutationOptions({
      onSuccess: (data) => toast.success(data.message),
      onError: (e) => toast.error(e.message),
    }),
  );
  const touchMutation = useMutation(
    trpc.projects.touchLastOpened.mutationOptions({
      onSuccess: () => invalidateScan(),
    }),
  );
  const fetchMutation = useMutation(
    trpc.projects.fetchRemote.mutationOptions({
      onSuccess: async (data) => {
        await invalidateScan();
        toast.success(data.message || "Fetched.");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const pullMutation = useMutation(
    trpc.projects.pull.mutationOptions({
      onSuccess: async (data) => {
        await invalidateScan();
        toast.success(data.message || "Already up to date.");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const pushMutation = useMutation(
    trpc.projects.push.mutationOptions({
      onSuccess: async (data) => {
        await invalidateScan();
        toast.success(data.message || "Pushed.");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const fetchBranchMutation = useMutation(
    trpc.projects.fetchBranch.mutationOptions({
      onSuccess: async (data) => {
        await invalidateScan();
        toast.success(data.message || "Branch fetched.");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const switchBranchMutation = useMutation(
    trpc.projects.switchBranch.mutationOptions({
      onSuccess: async (data) => {
        await invalidateScan();
        toast.success(data.message || "Switched.");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  // Shared code-server status, polled while an install or start is in
  // flight. The intent flag + tab ref mirror the main project page's flow:
  // one blank tab opened synchronously in the click, navigated or closed
  // exactly once when the flow settles.
  const ideOpening = useRef(false);
  const ideTab = useRef<Window | null>(null);
  const ide = useQuery(
    trpc.ide.status.queryOptions(undefined, {
      refetchInterval: (query) => {
        const s = query.state.data;
        return s === undefined ||
          s.install.phase === "downloading" ||
          s.install.phase === "extracting" ||
          ideOpening.current
          ? IDE_POLL_MS
          : false;
      },
    }),
  );
  const ideOpen = useMutation(
    trpc.ide.open.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.ide.status.queryKey(),
        });
      },
      onError: (e) => {
        ideOpening.current = false;
        ideTab.current?.close();
        ideTab.current = null;
        toast.error(e.message);
      },
    }),
  );

  useEffect(() => {
    const s = ide.data;
    if (s === undefined || !ideOpening.current) return;
    if (s.running && s.port !== null) {
      ideOpening.current = false;
      const url = ideUrl(s.port, path);
      const tab = ideTab.current;
      ideTab.current = null;
      if (tab !== null && !tab.closed) {
        tab.location.href = url;
        return;
      }
      toast.success("IDE ready", {
        action: {
          label: "Open",
          onClick: () => window.open(url, "_blank", "noopener"),
        },
      });
    } else if (s.install.phase === "failed") {
      ideOpening.current = false;
      ideTab.current?.close();
      ideTab.current = null;
      toast.error(s.install.error ?? "IDE install failed");
    } else if (s.installed && !ideOpen.isPending) {
      ideOpen.mutate({ path });
    }
  }, [ide.data, ideOpen, path]);

  // Left the page mid-wait: close the blank tab rather than strand it.
  useEffect(
    () => () => {
      if (ideOpening.current) ideTab.current?.close();
      ideTab.current = null;
    },
    [],
  );

  // Touch last-opened once per visited project (when the scan resolves it).
  useEffect(() => {
    if (project) touchMutation.mutate({ path });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.path]);

  // Local note draft, re-synced when the loaded note changes.
  const [noteDraft, setNoteDraft] = useState(project?.note ?? "");
  useEffect(() => {
    setNoteDraft(project?.note ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.path, project?.note]);

  if (scan.isLoading) return <LoadingPage />;

  if (!project) {
    return (
      <div className="mb min-h-dvh px-5 py-6 lg:px-8">
        <Button variant="ghost" size="icon-sm" render={<Link to="/designs/mission-bento" />}>
          <ArrowLeft className="size-3.5" />
        </Button>
        <div className="mb-panel mt-4 w-full max-w-2xl p-5">
          <h1 className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground">
            Unit not found
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="break-all font-mono">{path}</span> isn&rsquo;t in
            the current scan — it may have been moved, hidden or deleted.
          </p>
          <Link to="/designs/mission-bento" className="mb-act mt-4 w-fit">
            <ArrowLeft className="size-3" /> Back to mosaic
          </Link>
        </div>
      </div>
    );
  }

  const StackIcon = stackIcon(project.stack?.id);
  const git = project.git;
  const gitBusy =
    fetchMutation.isPending ||
    pullMutation.isPending ||
    pushMutation.isPending ||
    fetchBranchMutation.isPending ||
    switchBranchMutation.isPending;
  const diverged = (git.ahead ?? 0) > 0 && (git.behind ?? 0) > 0;

  const ideInstalling =
    ide.data !== undefined &&
    (ide.data.install.phase === "downloading" ||
      ide.data.install.phase === "extracting");
  const ideStarting = ideOpen.isPending;

  const openIde = () => {
    const s = ide.data;
    if (s !== undefined && s.running && s.port !== null) {
      window.open(ideUrl(s.port, path), "_blank", "noopener");
      return;
    }
    // Open the blank tab synchronously in the click — popup blockers only
    // permit window.open during a user gesture; the URL arrives with the
    // poll. No "noopener": it nulls the return value BY SPEC.
    ideTab.current = window.open("", "_blank");
    ideOpening.current = true;
    ideOpen.mutate({ path });
  };

  const saveNote = () => {
    if (noteDraft === project.note) return;
    noteMutation.mutate({ path, note: noteDraft });
  };

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(path);
      toast.success("Path copied");
    } catch {
      toast.error("Couldn't copy path");
    }
  };

  const led = projectLed(project, Date.now());

  return (
    <div className="mb flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-[var(--mb-line)] bg-background/95 backdrop-blur-sm">
        <div className="mb-stage mx-auto flex w-full max-w-[2900px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 lg:px-8">
          <WorkspaceBrand render={<Link to="/" />} />
          <Button
            variant="ghost"
            size="sm"
            render={<Link to="/designs/mission-bento" aria-label="Back to the mosaic" />}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
          >
            <ArrowLeft className="size-3.5" /> Mosaic
          </Button>

          <span aria-hidden className="h-5 w-px bg-[var(--mb-line-strong)]" />

          <Led tone={led.tone} label={led.label} />
          <StackIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <h1 className="text-sm font-semibold tracking-tight">{project.name}</h1>
          <button
            type="button"
            onClick={copyPath}
            title="Copy path"
            className="min-w-0 truncate font-mono text-[0.7rem] text-muted-foreground transition-colors hover:text-foreground lg:max-w-[38ch]"
          >
            <Copy aria-hidden className="mr-1 inline size-3" />
            {project.path}
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <span className="mr-2 hidden items-center gap-3 md:flex">
              <MetricTag label="upd" value={relativeTime(project.updatedAt)} tone="accent" title={dateTooltip(project.updatedAt)} />
              {git.isRepo ? (
                <>
                  <MetricTag label="↑" value={String(git.ahead ?? 0)} tone={(git.ahead ?? 0) > 0 ? "accent" : undefined} />
                  <MetricTag label="↓" value={String(git.behind ?? 0)} tone={(git.behind ?? 0) > 0 ? "warn" : undefined} />
                  <MetricTag label="◇" value={String(git.dirtyCount ?? 0)} tone={(git.dirtyCount ?? 0) > 0 ? "warn" : undefined} />
                </>
              ) : null}
            </span>
            <button type="button" onClick={() => openMutation.mutate({ path, target: "editor" })} className="mb-act">
              <Folder aria-hidden className="size-3.5" />
              <span className="hidden md:inline">Editor</span>
            </button>
            <button type="button" onClick={() => openMutation.mutate({ path, target: "terminal" })} className="mb-act">
              <TerminalIcon aria-hidden className="size-3.5" />
              <span className="hidden md:inline">Terminal</span>
            </button>
            <button
              type="button"
              onClick={openIde}
              disabled={ideInstalling || ideStarting}
              className="mb-act"
            >
              {ideInstalling || ideStarting ? (
                <Loader2 aria-hidden className="size-3.5 animate-spin" />
              ) : (
                <CodeXml aria-hidden className="size-3.5" />
              )}
              <span className="hidden md:inline">
                {ide.data !== undefined && ideInstalling
                  ? installingLabel(ide.data.install)
                  : ideStarting
                    ? "Starting…"
                    : "IDE"}
              </span>
            </button>
            <button
              type="button"
              disabled={!git.isRepo || reportPending}
              title={!git.isRepo ? "Not a git repository" : "Fresh git-snitch report in a new tab"}
              onClick={() => runReport({ kind: "repo", path, force: true })}
              className="mb-act"
            >
              {reportPending ? (
                <Loader2 aria-hidden className="size-3.5 animate-spin" />
              ) : (
                <FileText aria-hidden className="size-3.5" />
              )}
              <span className="hidden md:inline">{reportPending ? "Generating…" : "Report"}</span>
            </button>
          </div>
        </div>

        {/* Console channel tabs + the report status strip. */}
        <div className="mb-stage mx-auto flex w-full max-w-[2900px] flex-wrap items-center gap-x-3 gap-y-1.5 px-4 pb-2 lg:px-8">
          <nav aria-label="Project channels" className="flex flex-wrap items-center gap-1" role="tablist">
            {CHANNELS.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={channel === c.id}
                className="mb-channel"
                onClick={() => setChannel(c.id)}
              >
                {c.label}
              </button>
            ))}
          </nav>
          <span className="ml-auto flex items-center">
            <SnitchStatusStrip report={snitch} />
          </span>
        </div>
      </header>

      <main className="mb-stage mx-auto flex w-full max-w-[2900px] flex-1 flex-col gap-3 px-4 pb-6 pt-4 lg:px-8">
        {channel === "overview" && project.alerts.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {project.alerts.map((a) => (
              <AlertBadge key={a.code} severity={a.severity} message={a.message} />
            ))}
          </div>
        ) : null}

        {channel === "overview" ? (
          <OverviewChannel
            path={path}
            project={project}
            placement={placement}
            snitch={snitch}
            now={scan.dataUpdatedAt || Date.now()}
            gitBusy={gitBusy}
            diverged={diverged}
            fetch={fetchMutation}
            pull={pullMutation}
            push={pushMutation}
            fetchBranch={fetchBranchMutation}
            switchBranch={switchBranchMutation}
          />
        ) : channel === "activity" ? (
          <ActivityChannel path={path} project={project} snitch={snitch} />
        ) : channel === "code" ? (
          <CodeChannel snitch={snitch} />
        ) : channel === "ai" ? (
          <AiChannel snitch={snitch} />
        ) : channel === "files" ? (
          <FileBrowser project={path} />
        ) : channel === "artifacts" ? (
          <ArtifactsPanel project={path} />
        ) : (
          <IdeationChannel
            path={path}
            noteDraft={noteDraft}
            setNoteDraft={setNoteDraft}
            saveNote={saveNote}
            ideationNew={search.ideation === "new"}
          />
        )}
      </main>
    </div>
  );
}

/* --------------------------------------------------------------- channels */

/**
 * Language-share donut — the stacks-donut idiom pointed at this project's
 * real distribution (a single-project stacks census would degenerate to one
 * slice). Top languages + Other, share of lines.
 */
function LanguageDonut({ report }: { report: ProjectReportState }) {
  if (report.status === "running") {
    return <PanelBusy note="git-snitch is scanning this repository…" />;
  }
  if (report.status === "loading") {
    return <PanelSkeleton rows={3} />;
  }
  if (report.entry === null) {
    return <PanelState report={report} />;
  }
  const rows = projectLanguages(report.entry, 5);
  if (rows.length === 0) {
    return <QuietPane note="No language data recorded." />;
  }
  const total = rows.reduce((sum, r) => sum + r.lines, 0);
  const RAMP = [
    "var(--mb-accent)",
    "var(--mb-blue)",
    "var(--mb-amber)",
    "oklch(0.76 0.09 300)",
    "oklch(0.72 0.1 15)",
  ];
  const segments = rows.map((row, i) => ({
    name: row.language,
    value: row.lines,
    fill: RAMP[i % RAMP.length],
  }));
  const top = rows[0];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        <SplitDonut
          segments={segments}
          center={`${Math.round((top.lines / Math.max(1, total)) * 100)}%`}
          centerLabel={top.language}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1">
        {rows.map((row, i) => (
          <span
            key={row.language}
            className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground"
          >
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ background: RAMP[i % RAMP.length] }}
            />
            {row.language} {formatCompact(row.lines)}
          </span>
        ))}
      </div>
    </div>
  );
}

function OverviewChannel({
  path,
  project,
  placement,
  snitch,
  now,
  gitBusy,
  diverged,
  fetch,
  pull,
  push,
  fetchBranch,
  switchBranch,
}: {
  path: string;
  project: Project;
  placement: MosaicPlacement | null;
  snitch: ProjectReportState;
  now: number;
  gitBusy: boolean;
  diverged: boolean;
  fetch: GitMutate;
  pull: GitMutate;
  push: GitMutate;
  fetchBranch: BranchMutate;
  switchBranch: BranchMutate;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      {/* Row 1 — the project AS its dashboard instrument tile, paired with
          the git panel. Both stretch to the same dense row height. */}
      <div className="flex min-h-[380px] lg:col-span-7 [&>*]:h-full [&>*]:w-full [&>*]:flex-1">
        {placement ? (
          <InstrumentTile
            project={project}
            placement={{ ...placement, cols: 12, rows: 3, tier: "hero", tierIndex: 0 }}
            now={now}
            onOpen={() => {}}
            snitch={snitch.entry}
          />
        ) : (
          <Skeleton className="h-[380px] w-full" />
        )}
      </div>
      <Panel label="git" className="min-h-[380px] lg:col-span-5">
        <GitPanel
          path={path}
          project={project}
          diverged={diverged}
          gitBusy={gitBusy}
          fetch={fetch}
          pull={pull}
          push={push}
          fetchBranch={fetchBranch}
          switchBranch={switchBranch}
        />
      </Panel>

      {/* Row 2 — one merged signals panel: census LED rows left, signal
          summaries right, justify-evenly so both halves fill the height. */}
      <Panel label="Signals" meta="snitch" className="min-h-[300px] lg:col-span-12">
        <div className="grid min-h-0 flex-1 gap-6 md:grid-cols-2">
          <div className="flex min-h-0 flex-col">
            <span className="mb-label pb-1.5">Census</span>
            <div className="min-h-0 flex-1">
              <AlertsCensus exportData={snitch.entry ? entryAsExport(snitch.entry) : null} />
            </div>
          </div>
          <div className="flex min-h-0 flex-col md:border-l md:border-[var(--mb-line)] md:pl-6">
            <span className="mb-label pb-1.5">What the snitch found</span>
            <SignalsList report={snitch} />
          </div>
        </div>
      </Panel>

      {/* Row 3 — language-share donut beside the pulse instrument. */}
      <Panel label="Languages" meta="share of lines" className="min-h-[280px] lg:col-span-4">
        <LanguageDonut report={snitch} />
      </Panel>
      <Panel label="Pulse" meta="90d freshness" className="min-h-[280px] lg:col-span-8">
        <div className="flex min-h-0 flex-1 flex-col justify-evenly gap-3">
          <PulseLine project={project} now={now} cells={64} />
          <div role="list" aria-label="Touch timeline" className="grid gap-x-8 gap-y-1.5 sm:grid-cols-3">
            <TouchRow
              label="Updated"
              tone="live"
              value={relativeTime(project.updatedAt)}
              detail={dateTooltip(project.updatedAt)}
            />
            {project.git.lastCommit ? (
              <TouchRow
                label="Commit"
                tone="info"
                value={relativeTime(project.git.lastCommit.date)}
                detail={dateTooltip(project.git.lastCommit.date)}
              />
            ) : null}
            {project.lastOpenedAt ? (
              <TouchRow
                label="Opened"
                tone="nominal"
                value={relativeTime(project.lastOpenedAt)}
                detail={dateTooltip(project.lastOpenedAt)}
              />
            ) : null}
          </div>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
            lit where the freshness model still feels it
          </span>
        </div>
      </Panel>
    </div>
  );
}

function TouchRow({
  label,
  tone,
  value,
  detail,
}: {
  label: string;
  tone: "live" | "info" | "nominal";
  value: string;
  detail?: string;
}) {
  return (
    <div role="listitem" className="flex items-center gap-2.5 text-xs">
      <Led tone={tone} />
      <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </span>
      <span className="mb-num text-[11px]">{value}</span>
      {detail ? (
        <span className="ml-auto truncate font-mono text-[9.5px] text-muted-foreground" title={detail}>
          {detail}
        </span>
      ) : null}
    </div>
  );
}

function ActivityChannel({
  path,
  project,
  snitch,
}: {
  path: string;
  project: Project;
  snitch: ProjectReportState;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      {/* Cadence area graph ↔ commits table, cycled by carousel. */}
      <div className="min-h-0 lg:col-span-7 [&>*]:h-[420px]">
        <Panel label="Cadence" meta="commits / period">
          <CadenceCarousel report={snitch} />
        </Panel>
      </div>
      <Panel label="Pulse" meta="90d freshness" className="min-h-[420px] lg:col-span-5">
        <div className="flex min-h-0 flex-1 flex-col justify-evenly gap-3">
          <PulseLine project={project} now={Date.now()} cells={48} />
          <div role="list" aria-label="Touch timeline" className="flex flex-col gap-1.5">
            <div role="listitem" className="flex items-center gap-2.5 text-xs">
              <Led tone="live" />
              <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Updated</span>
              <span className="mb-num text-[11px]">{relativeTime(project.updatedAt)}</span>
              <span className="ml-auto font-mono text-[9.5px] text-muted-foreground" title={dateTooltip(project.updatedAt)}>
                {dateTooltip(project.updatedAt)}
              </span>
            </div>
            {project.git.lastCommit ? (
              <div role="listitem" className="flex items-center gap-2.5 text-xs">
                <Led tone="info" />
                <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Commit</span>
                <span className="mb-num text-[11px]">{relativeTime(project.git.lastCommit.date)}</span>
                <span className="ml-auto max-w-[24ch] truncate font-mono text-[9.5px] text-muted-foreground" title={project.git.lastCommit.message}>
                  {project.git.lastCommit.message}
                </span>
              </div>
            ) : null}
            {project.lastOpenedAt ? (
              <div role="listitem" className="flex items-center gap-2.5 text-xs">
                <Led tone="nominal" />
                <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Opened</span>
                <span className="mb-num text-[11px]">{relativeTime(project.lastOpenedAt)}</span>
                <span className="ml-auto font-mono text-[9.5px] text-muted-foreground" title={dateTooltip(project.lastOpenedAt)}>
                  {dateTooltip(project.lastOpenedAt)}
                </span>
              </div>
            ) : null}
          </div>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
            lit where the freshness model still feels it
          </span>
        </div>
      </Panel>
      <div className="min-h-0 lg:col-span-12 [&>*]:h-[360px]">
        <Panel label="History" meta="newest first">
          <CommitHistoryCell path={path} isRepo={project.git.isRepo} />
        </Panel>
      </div>
    </div>
  );
}

function CodeChannel({ snitch }: { snitch: ProjectReportState }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      <div className="min-h-0 lg:col-span-7 [&>*]:h-[460px]">
        <Panel label="Languages" meta="lines · files">
          <LanguagesCarousel report={snitch} />
        </Panel>
      </div>
      <Panel label="Quality signals" meta="snitch" className="min-h-[460px] lg:col-span-5">
        <SignalsList report={snitch} />
      </Panel>
    </div>
  );
}

function AiChannel({ snitch }: { snitch: ProjectReportState }) {
  const usage = snitch.entry?.aiUsage ?? null;
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      {/* Subsidized cost stays the headline of the channel. */}
      <Panel label="Subsidized AI cost" meta="recorded run cost" className="min-h-[320px] lg:col-span-5">
        {usage ? (
          <div className="flex min-h-0 flex-1 flex-col justify-evenly gap-2">
            <div className="flex flex-col-reverse gap-1">
              <span className="mb-label">Recorded run cost</span>
              <span className="mb-num text-[52px] leading-none text-[var(--mb-accent)]">
                {formatCost(usage.cost)}
              </span>
            </div>
            <span className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              Every AI record matched to this project&rsquo;s report runs on the
              subsidized plan — the recorded cost is what the run billed.
            </span>
          </div>
        ) : (
          <PanelState report={snitch} />
        )}
      </Panel>
      <Panel label="AI usage" meta="snitch" className="min-h-[320px] lg:col-span-7">
        {snitch.entry ? (
          <AiPane exportData={entryAsExport(snitch.entry)} donut />
        ) : (
          <PanelState report={snitch} />
        )}
      </Panel>
    </div>
  );
}

function IdeationChannel({
  path,
  noteDraft,
  setNoteDraft,
  saveNote,
  ideationNew,
}: {
  path: string;
  noteDraft: string;
  setNoteDraft: (value: string) => void;
  saveNote: () => void;
  ideationNew: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      <section className="mb-panel flex min-w-0 flex-col p-3.5 lg:col-span-4">
        <div className="flex items-baseline justify-between gap-3 pb-2">
          <span className="mb-label">Where I left off</span>
          <span className="font-mono text-[0.65rem] text-muted-foreground/70">
            saved on blur
          </span>
        </div>
        <Textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={saveNote}
          placeholder="What were you doing? What's next?"
          rows={10}
          className="min-h-0 flex-1 resize-none"
        />
      </section>
      <div id="ideation" className="min-w-0 lg:col-span-8 [&>*]:h-[520px]">
        <IdeationPanel key={path} project={path} startNew={ideationNew} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------- page pieces */

type GitMutate = { isPending: boolean; mutate: (vars: { path: string }) => void };
type BranchMutate = { isPending: boolean; mutate: (vars: { path: string; branch: string }) => void };

function Panel({
  label,
  meta,
  className,
  children,
}: {
  label: string;
  meta?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("mb-panel flex min-h-0 flex-col overflow-hidden", className)}>
      <div className="mb-inst-head shrink-0">
        <h2 className="mb-label">{label}</h2>
        {meta ? <span className="mb-num ml-auto text-[10px] text-muted-foreground">{meta}</span> : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-3.5">{children}</div>
    </section>
  );
}

function GitPanel({
  path,
  project,
  diverged,
  gitBusy,
  fetch,
  pull,
  push,
  fetchBranch,
  switchBranch,
}: {
  path: string;
  project: Project;
  diverged: boolean;
  gitBusy: boolean;
  fetch: GitMutate;
  pull: GitMutate;
  push: GitMutate;
  fetchBranch: BranchMutate;
  switchBranch: BranchMutate;
}) {
  const git = project.git;
  if (!git.isRepo) {
    return <p className="text-xs text-muted-foreground">Not a git repository.</p>;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-evenly gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BranchSwitcher
          path={path}
          branch={git.branch}
          gitBusy={gitBusy}
          switchBranch={switchBranch}
        />
        {git.remote ? (
          <GitActionsToolbar
            path={path}
            gitBusy={gitBusy}
            fetch={fetch}
            pull={pull}
            push={push}
            fetchBranch={fetchBranch}
          />
        ) : null}
      </div>
      <Row label="Remote">
        {git.remote ? (
          <a
            href={git.remote.links.web}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 transition-colors hover:text-[var(--mb-accent)]"
          >
            {hostLabel(git.remote.host)} · {git.remote.slug}
            <ExternalLinkIcon className="size-3" />
          </a>
        ) : (
          <span className="text-muted-foreground">none</span>
        )}
      </Row>
      <Row label="Ahead / behind">
        <span className="mb-num inline-flex items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 text-[var(--mb-accent)]">
            <ArrowUp className="size-3" />
            {git.ahead ?? 0}
          </span>
          <span className="inline-flex items-center gap-1 text-[var(--mb-amber)]">
            <ArrowDown className="size-3" />
            {git.behind ?? 0}
          </span>
        </span>
      </Row>
      <Row label="Dirty files">{git.dirtyCount ?? 0}</Row>
      {git.lastCommit ? (
        <>
          <Row label="Last commit">
            <span className="mb-num text-[11px]">{relativeTime(git.lastCommit.date)}</span>
          </Row>
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {git.lastCommit.message}
          </p>
        </>
      ) : null}
      {diverged ? (
        <p className="text-xs text-[var(--mb-red)]">
          Diverged from upstream — a fast-forward pull isn&rsquo;t possible.
        </p>
      ) : null}
    </div>
  );
}

/** Signals WITH their summaries — the report's own voice, grouped densely. */
function SignalsList({ report }: { report: ProjectReportState }) {
  if (report.status === "running") {
    return <PanelBusy note="git-snitch is scanning this repository…" />;
  }
  if (report.status === "loading") {
    return <PanelSkeleton rows={3} />;
  }
  if (report.entry === null) {
    return <PanelState report={report} />;
  }
  const alerts = report.entry.alerts;
  if (alerts.length === 0) {
    return <QuietPane note="No quality signals — clean report." />;
  }
  return (
    <div role="list" aria-label="Quality signals" className="flex min-h-0 flex-1 flex-col justify-evenly gap-1.5">
      {alerts.map((alert) => (
        <div key={alert.id} role="listitem" className="flex min-w-0 items-start gap-2">
          <Led
            tone={alert.severity === "critical" ? "error" : alert.severity === "warning" ? "warn" : "info"}
            className="mt-1"
          />
          <span className="w-24 shrink-0 truncate pt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-foreground/85">
            {alert.label}
          </span>
          <span className="mb-num w-8 shrink-0 pt-0.5 text-right text-[10px] text-muted-foreground">
            {alert.value}
          </span>
          <span className="line-clamp-2 min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground">
            {alert.summary}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Graph ↔ table cycling for one dataset (owner round-4 item 5): slide 1 is
 * the cadence area chart, slide 2 the same series as a readable table.
 */
function CadenceCarousel({ report }: { report: ProjectReportState }) {
  if (report.status === "running") {
    return <PanelBusy note="git-snitch is scanning this repository…" />;
  }
  if (report.status === "loading") {
    return <PanelSkeleton rows={4} />;
  }
  if (report.entry === null) {
    return <PanelState report={report} />;
  }
  const series = projectCadence(report.entry).slice(-36);
  if (series.length === 0) {
    return <QuietPane note="No commits in the report window." />;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-num flex flex-wrap gap-x-5 gap-y-1 pb-2 text-[11px] text-muted-foreground">
        <span>
          <span className="text-[var(--mb-accent)]">{report.entry.totalCommits.toLocaleString()}</span> commits
        </span>
        <span>
          <span className="text-foreground">{report.entry.contributors}</span> contributors
        </span>
        {report.entry.lastCommit ? <span>last {relativeTime(report.entry.lastCommit.date)}</span> : null}
        <SnitchMetaInline report={report} />
      </div>
      <Carousel opts={{ loop: false }} className="min-h-0 flex-1">
        <CarouselContent className="h-full">
          <CarouselItem className="h-full">
            <div className="h-full min-h-0 pb-1">
              <CadenceChart series={series} />
            </div>
          </CarouselItem>
          <CarouselItem className="h-full">
            <div className="mb-scroll h-full min-h-0 overflow-y-auto pr-1">
              <table className="w-full border-collapse font-mono text-[11px]">
                <caption className="sr-only">Commits per period</caption>
                <thead>
                  <tr className="border-b border-[var(--mb-line-strong)] text-left">
                    <th scope="col" className="mb-label py-1.5">Period</th>
                    <th scope="col" className="mb-label py-1.5 text-right">Commits</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((point) => (
                    <tr key={point.period} className="border-b border-[var(--mb-line)]">
                      <td className="py-1.5 text-muted-foreground">{point.period}</td>
                      <td className="mb-num py-1.5 text-right tabular-nums text-foreground">
                        {point.commits}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CarouselItem>
        </CarouselContent>
        <div className="flex items-center justify-end gap-1 pt-1">
          <CarouselPrevious variant="outline" size="icon-xs" className="static" />
          <CarouselNext variant="outline" size="icon-xs" className="static" />
          <span className="mb-label ml-1">graph ⟷ table</span>
        </div>
      </Carousel>
    </div>
  );
}

/** Languages: census bars ↔ table, the same carousel pattern. */
function LanguagesCarousel({ report }: { report: ProjectReportState }) {
  if (report.status === "running") {
    return <PanelBusy note="git-snitch is scanning this repository…" />;
  }
  if (report.status === "loading") {
    return <PanelSkeleton rows={4} />;
  }
  if (report.entry === null) {
    return <PanelState report={report} />;
  }
  const rows = projectLanguages(report.entry, 12);
  if (rows.length === 0) {
    return <QuietPane note="No language data recorded." />;
  }
  const max = Math.max(...rows.map((r) => r.lines));
  const totalLines = rows.reduce((sum, r) => sum + r.lines, 0);
  const totalFiles = rows.reduce((sum, r) => sum + r.files, 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-num flex flex-wrap gap-x-5 gap-y-1 pb-2 text-[11px] text-muted-foreground">
        <span>
          <span className="text-[var(--mb-blue)]">{formatCompact(totalLines)}</span> lines
        </span>
        <span>{totalFiles} files</span>
        <span>{rows.length} languages</span>
        <SnitchMetaInline report={report} />
      </div>
      <Carousel opts={{ loop: false }} className="min-h-0 flex-1">
        <CarouselContent className="h-full">
          <CarouselItem className="h-full">
            <div role="img" aria-label="Lines of code by language" className="flex h-full min-h-0 flex-col justify-evenly">
              {rows.map((row) => (
                <div key={row.language} className="mb-bar-row" aria-hidden>
                  <span className="w-28 shrink-0 truncate text-[11px] text-foreground sm:w-44">
                    {row.language}
                  </span>
                  <span className="mb-bar-track">
                    <span
                      className="mb-bar-fill"
                      style={{
                        width: `${Math.max(2, (row.lines / max) * 100)}%`,
                        background: "color-mix(in oklch, var(--mb-blue) 75%, transparent)",
                      }}
                    />
                  </span>
                  <span className="mb-num w-20 shrink-0 text-right text-[10px] text-muted-foreground">
                    {formatCompact(row.lines)} · {row.files}f
                  </span>
                </div>
              ))}
            </div>
          </CarouselItem>
          <CarouselItem className="h-full">
            <div className="mb-scroll h-full min-h-0 overflow-y-auto pr-1">
              <table className="w-full border-collapse font-mono text-[11px]">
                <caption className="sr-only">Lines of code by language</caption>
                <thead>
                  <tr className="border-b border-[var(--mb-line-strong)] text-left">
                    <th scope="col" className="mb-label py-1.5">Language</th>
                    <th scope="col" className="mb-label py-1.5 text-right">Lines</th>
                    <th scope="col" className="mb-label py-1.5 text-right">Files</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.language} className="border-b border-[var(--mb-line)]">
                      <td className="py-1.5 text-muted-foreground">{row.language}</td>
                      <td className="mb-num py-1.5 text-right tabular-nums text-foreground">
                        {row.lines.toLocaleString()}
                      </td>
                      <td className="mb-num py-1.5 text-right tabular-nums text-muted-foreground">
                        {row.files}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CarouselItem>
        </CarouselContent>
        <div className="flex items-center justify-end gap-1 pt-1">
          <CarouselPrevious variant="outline" size="icon-xs" className="static" />
          <CarouselNext variant="outline" size="icon-xs" className="static" />
          <span className="mb-label ml-1">graph ⟷ table</span>
        </div>
      </Carousel>
    </div>
  );
}

function SnitchMetaInline({ report }: { report: ProjectReportState }) {
  if (report.generatedAt === null) return null;
  const stale = report.status === "stale";
  return (
    <span
      className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em]"
      style={{ color: stale ? "var(--mb-amber)" : "var(--mb-accent)" }}
      title={`Generated ${new Date(report.generatedAt).toLocaleString()} · ${report.source ?? "scan"} report`}
    >
      <Led tone={stale ? "warn" : "live"} />
      {stale ? "Stale" : "Fresh"} · {relativeTime(report.generatedAt)} · {report.source}
      {stale ? (
        <button
          type="button"
          onClick={report.generate}
          disabled={report.generating}
          className="ml-1 inline-flex items-center gap-1 outline-none transition-colors hover:text-[var(--mb-amber)]"
        >
          <RefreshCw className={cn("size-2.5", report.generating && "animate-spin")} /> Regenerate
        </button>
      ) : null}
    </span>
  );
}

function SnitchStatusStrip({ report }: { report: ProjectReportState }) {
  if (report.status === "loading") {
    return (
      <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
        Report loading…
      </span>
    );
  }
  if (report.status === "running") {
    return (
      <span className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--mb-amber)]">
        <Led tone="warn" /> Snitch running
      </span>
    );
  }
  if (report.status === "missing") {
    return (
      <span className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
          <Led tone="nominal" /> No report
        </span>
        <Button variant="outline" size="xs" onClick={report.generate} disabled={report.generating}>
          <RefreshCw className={cn("size-3", report.generating && "animate-spin")} />
          Generate
        </Button>
      </span>
    );
  }
  const stale = report.status === "stale";
  return (
    <span className="flex items-center gap-2">
      <span
        className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em]"
        style={{ color: stale ? "var(--mb-amber)" : "var(--mb-accent)" }}
        title={report.generatedAt ? `Generated ${new Date(report.generatedAt).toLocaleString()} · ${report.source} report` : undefined}
      >
        <Led tone={stale ? "warn" : "live"} />
        {stale ? "Stale" : "Fresh"} · {report.generatedAt ? relativeTime(report.generatedAt) : ""} · {report.source}
      </span>
      {stale ? (
        <Button
          variant="outline"
          size="xs"
          onClick={report.generate}
          disabled={report.generating}
          className="border-[color-mix(in_oklch,var(--mb-amber)_45%,transparent)] text-[var(--mb-amber)]"
        >
          <RefreshCw className={cn("size-3", report.generating && "animate-spin")} />
          Regenerate
        </Button>
      ) : null}
      {report.key ? (
        <a href={`/reports/${report.key}`} target="_blank" rel="noreferrer" className="mb-act">
          <ExternalLinkIcon className="size-3" />
          <span className="hidden md:inline">Open</span>
        </a>
      ) : null}
    </span>
  );
}

/** Shared per-panel async state (running / loading / missing + generate). */
function PanelState({ report }: { report: ProjectReportState }) {
  if (report.status === "running") {
    return <PanelBusy note="git-snitch is scanning this repository…" />;
  }
  if (report.status === "loading") {
    return <PanelSkeleton rows={4} />;
  }
  return <PanelMissing onGenerate={report.generate} generating={report.generating} />;
}

function Row({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

/** Compact mono metric tag in the command band: glyph + tabular number. */
function MetricTag({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value: string;
  tone?: "accent" | "warn";
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex items-baseline gap-1 font-mono text-[10px] tabular-nums text-muted-foreground"
    >
      <span aria-hidden>{label}</span>
      <span
        className={cn(
          tone === "accent" && "text-[var(--mb-accent)]",
          tone === "warn" && "text-[var(--mb-amber)]",
        )}
      >
        {value}
      </span>
    </span>
  );
}

function PanelBusy({ note }: { note: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center gap-2 font-mono text-[10px] text-[var(--mb-amber)]">
      <Led tone="warn" /> {note}
    </div>
  );
}

function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden className="flex min-h-0 flex-1 flex-col justify-evenly gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

function PanelMissing({
  onGenerate,
  generating,
}: {
  onGenerate: () => void;
  generating: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 border border-dashed border-[var(--mb-line-strong)] px-4 py-6 text-center">
      <span className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">
        <Led tone="nominal" /> No report cached
      </span>
      <Button size="sm" onClick={onGenerate} disabled={generating}>
        <RefreshCw className={cn("size-3.5", generating && "animate-spin")} />
        {generating ? "Starting…" : "Generate report"}
      </Button>
    </div>
  );
}

function QuietPane({ note }: { note: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <p className="py-4 text-center font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">
        {note}
      </p>
    </div>
  );
}

function LoadingPage() {
  return (
    <div className="mb min-h-dvh px-4 py-6 lg:px-8">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-7 w-24" />
          </div>
        </div>
        <Skeleton className="h-5 w-72" />
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-12">
        <Skeleton className="h-64 lg:col-span-5" />
        <Skeleton className="h-64 lg:col-span-4" />
        <Skeleton className="h-64 lg:col-span-3" />
      </div>
    </div>
  );
}
