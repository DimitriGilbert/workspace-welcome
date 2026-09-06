import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CodeXml,
  Copy,
  ExternalLink,
  FileText,
  Folder,
  Loader2,
  Terminal as TerminalIcon,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@workspace-welcome/ui/components/button";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";
import { Textarea } from "@workspace-welcome/ui/components/textarea";

import { FileBrowser } from "@/components/file-browser";
import { ArtifactsPanel } from "@/components/artifacts";
import { AlertBadge } from "@/components/git-badges";
import { IdeationPanel } from "@/components/ideation/ideation-panel";
import { CommitHistoryCell } from "@/components/project-commit-history";
import {
  BranchSwitcher,
  GitActionsToolbar,
} from "@/components/project-git-actions";

import { useTRPC } from "@/utils/trpc";
import { absoluteDate, dateTooltip, relativeTime } from "@/lib/format";
import { hostLabel, stackIcon } from "@/lib/icons";
import { useReportRun } from "@/lib/use-report";

import {
  MiniStat,
  ReportActivityWidget,
  ReportAiWidget,
  ReportCodeWidget,
  ReportHealthWidget,
  ReportMissing,
  ReportStatusLine,
  ReportWidgetShell,
  CommitsTable,
  useReportExport,
} from "@/components/designs/mission-control/report-widgets";
import { HeatmapInstrument } from "@/components/designs/mission-control/analytics-zone";
import { dayKey } from "@/components/designs/mission-control/metrics";
import { isReportStale } from "@workspace-welcome/api/lib/report-staleness";
import consoleStyles from "@/components/designs/mission-control/mission-control.css?url";

/**
 * Search params: `?ideation=new` is the create-success toast's deep link into
 * a fresh ideation session. Only "new" is meaningful — anything else degrades
 * to absent instead of erroring the route.
 */
const projectSearchSchema = z.object({
  ideation: z.literal("new").optional().catch(undefined),
});

export const Route = createFileRoute("/designs/mission-control/project/$")({
  validateSearch: projectSearchSchema,
  head: () => ({
    links: [{ rel: "stylesheet", href: consoleStyles }],
  }),
  component: DesignProjectPage,
});

/** IDE status poll cadence — cheap and local, so 5 s while anything runs. */
const IDE_POLL_MS = 5_000;

/** Commit log page size — shared with the graph cell so one cache entry
 * serves the vitals graph AND the activity widget's table view. */
const COMMIT_LOG_LIMIT = 200;

/**
 * Deep link into the shared code-server. The server only ever reports the
 * port — the dashboard is browsed from other machines — so the host the
 * browser used is the only correct one.
 */
function ideUrl(port: number, projectPath: string): string {
  return `http://${window.location.hostname}:${port}/?folder=${encodeURIComponent(projectPath)}`;
}

function installingLabel(install: {
  receivedBytes: number | null;
  totalBytes: number | null;
}): string {
  if (install.receivedBytes === null || install.totalBytes === null) {
    return "Installing IDE…";
  }
  return `Installing IDE… (${Math.floor((install.receivedBytes / install.totalBytes) * 100)} %)`;
}

/**
 * The project readout. Everything the snitch report knows about this repo is
 * mined on one dense surface: the activity graph with a sortable commit
 * table, the subsidized AI cost as a hero numeral, health signals and code
 * mix as live widgets — beside the working surface (git actions, note,
 * ideation, files, artifacts). The report JSON arrives through one cached
 * react-query chain for THIS project; nothing fans out over the fleet.
 */
function DesignProjectPage() {
  const { _splat } = Route.useParams();
  const path = `/${_splat ?? ""}`;
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { run: runReport, isPending: reportPending } = useReportRun();

  const scan = useQuery(trpc.projects.scan.queryOptions());
  const project = scan.data?.projects.find((p) => p.path === path) ?? null;

  // The live commit log feeds both the vitals graph cell and the activity
  // widget's table view — one cached query, two surfaces.
  const commitLog = useQuery({
    ...trpc.projects.commitLog.queryOptions({ path, limit: COMMIT_LOG_LIMIT }),
    enabled: project?.git.isRepo === true,
  });

  // ?ideation=new consumption: once the panel is on screen, scroll to it and
  // strip the flag so a reload lands on a clean URL.
  useEffect(() => {
    if (search.ideation !== "new" || project === null) return;
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

  const invalidateScan = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.projects.scan.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.projects.commitLog.queryKey() }),
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

  useEffect(
    () => () => {
      if (ideOpening.current) ideTab.current?.close();
      ideTab.current = null;
    },
    [],
  );

  useEffect(() => {
    if (project) touchMutation.mutate({ path });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.path]);

  const [noteDraft, setNoteDraft] = useState(project?.note ?? "");
  useEffect(() => {
    setNoteDraft(project?.note ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.path, project?.note]);

  // Console channels. The page is a set of purposeful views, not one scroll.
  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "activity", label: "Activity" },
    { id: "code", label: "Code" },
    { id: "ai", label: "AI · Health" },
    { id: "files", label: "Files" },
    { id: "artifacts", label: "Artifacts" },
    { id: "ideation", label: "Ideation" },
  ] as const;
  type TabId = (typeof TABS)[number]["id"];
  const [tab, setTab] = useState<TabId>("overview");

  // One data clock for the heatmap instrument (page-lifetime is fine — the
  // packer only needs a stable "now" between renders).
  const now = scan.dataUpdatedAt || Date.now();

  // Commit-day counts feed the shared heatmap instrument; authors feed the
  // pulse numerals.
  const commitCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of commitLog.data ?? []) {
      const key = dayKey(c.timestamp * 1000);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [commitLog.data]);
  const commitAuthors = useMemo(
    () => new Set((commitLog.data ?? []).map((c) => c.author)).size,
    [commitLog.data],
  );
  const firstCommitIso = useMemo(() => {
    const log = commitLog.data;
    if (!log || log.length === 0) return null;
    const oldest = log[log.length - 1];
    if (!oldest) return null;
    return new Date(oldest.timestamp * 1000).toISOString();
  }, [commitLog.data]);
  // The pulse window must cover the repo's real log span — a repo last
  // touched 3 months ago renders an all-dark 12-week grid, which reads as a
  // void. Cap so cells stay legible.
  const pulseWeeks = useMemo(() => {
    const log = commitLog.data;
    if (!log || log.length < 2) return 12;
    const spanDays =
      (log[0].timestamp - (log[log.length - 1]?.timestamp ?? log[0].timestamp)) / 86400;
    return Math.min(26, Math.max(12, Math.ceil(spanDays / 7) + 1));
  }, [commitLog.data]);

  // The report chain runs ONCE here; the tab widgets take its data by prop
  // (react-query dedupes everything underneath).
  const report = useReportExport("repo", path);
  const stale = isReportStale(report.data?.generatedAt ?? null, project?.updatedAt ?? null);

  if (scan.isLoading) return <LoadingPage />;

  if (!project) {
    return (
      <div className="mc flex min-h-dvh flex-col items-start gap-3 px-5 py-6">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link to="/designs/mission-control" />}
          aria-label="Back to Mission Control"
        >
          <ArrowLeft className="size-3.5" />
        </Button>
        <div className="mc-panel w-full p-4">
          <h1 className="mc-label text-foreground">Project not found</h1>
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="break-all font-mono">{path}</span> isn&rsquo;t in
            the current scan — it may have been moved, hidden or deleted.
          </p>
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
    // Opened synchronously in the click — popup blockers only permit
    // window.open during a user gesture.
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

  const consoleBtn =
    "inline-flex h-8 items-center gap-1.5 border border-[var(--mc-line)] px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground outline-none transition-colors hover:border-[color-mix(in_oklch,var(--mc-accent)_40%,var(--mc-line))] hover:text-[var(--mc-accent)] focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

  // THE STATE BAND — one instrument panel, four hairline columns: git
  // controls, project facts, the last commit, the commit graph. The scan's
  // alerts ride the footer strip, so no separate chip row floats above.
  const stateBand = (
    <section className="grid grid-cols-1 gap-px border border-[var(--mc-line)] bg-[var(--mc-line)] md:grid-cols-2 xl:grid-cols-[1.15fr_0.75fr_1fr_1.1fr]">
      <PanelBlock
        title="git"
        trailing={
          git.isRepo && git.remote ? (
            <GitActionsToolbar
              path={path}
              gitBusy={gitBusy}
              fetch={fetchMutation}
              pull={pullMutation}
              push={pushMutation}
              fetchBranch={fetchBranchMutation}
            />
          ) : undefined
        }
      >
        {!git.isRepo ? (
          <p className="text-xs text-muted-foreground">Not a git repository.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <Row label="Branch">
              <BranchSwitcher
                path={path}
                branch={git.branch}
                gitBusy={gitBusy}
                switchBranch={switchBranchMutation}
              />
            </Row>
            <Row label="Remote">
              {git.remote ? (
                <a
                  href={git.remote.links.web}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 transition-colors hover:text-[var(--mc-accent)]"
                >
                  {hostLabel(git.remote.host)} · {git.remote.slug}
                  <ExternalLink aria-hidden className="size-3" />
                </a>
              ) : (
                <span className="text-muted-foreground">none</span>
              )}
            </Row>
            <Row label="Sync">
              <span className="inline-flex items-center gap-2 font-mono text-xs tabular-nums">
                <span className="inline-flex items-center gap-1 text-[var(--mc-accent)]">
                  <ArrowUp aria-hidden className="size-3" />
                  {git.ahead ?? 0}
                </span>
                <span className="inline-flex items-center gap-1 text-[var(--sev-warning)]">
                  <ArrowDown aria-hidden className="size-3" />
                  {git.behind ?? 0}
                </span>
                <span className="text-muted-foreground/50">/</span>
                <span
                  className={
                    (git.dirtyCount ?? 0) > 0
                      ? "text-[var(--sev-warning)]"
                      : "text-muted-foreground"
                  }
                >
                  {git.dirtyCount ?? 0} dirty
                </span>
              </span>
            </Row>
            {git.lastCommit ? (
              <Row label="Last commit">
                <span className="tabular-nums">{relativeTime(git.lastCommit.date)}</span>
              </Row>
            ) : null}
            {diverged ? (
              <p className="text-[11px] leading-relaxed text-[var(--sev-critical)]">
                Diverged — fast-forward pull impossible.
              </p>
            ) : null}
          </div>
        )}
      </PanelBlock>

      <PanelBlock title="project">
        <Row label="Stack">
          <span className="inline-flex items-center gap-1.5">
            <StackIcon aria-hidden className="size-3.5 text-muted-foreground" />
            {project.stack?.label ?? "unknown"}
          </span>
        </Row>
        <Row label="Created">{absoluteDate(project.createdAt)}</Row>
        <Row label="Updated">{relativeTime(project.updatedAt)}</Row>
        <Row label="Opened">
          {project.lastOpenedAt ? relativeTime(project.lastOpenedAt) : "never"}
        </Row>
        <Row label="Alerts">
          <span
            className={
              project.alerts.length > 0
                ? "text-[var(--sev-warning)]"
                : "text-[var(--state-positive)]"
            }
          >
            {project.alerts.length}
          </span>
        </Row>
      </PanelBlock>

      <PanelBlock title="last commit">
        {git.lastCommit ? (
          <div className="flex min-w-0 flex-col gap-2">
            <p className="line-clamp-3 text-xs leading-relaxed text-foreground">
              {git.lastCommit.message}
            </p>
            <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
              <span>{git.lastCommit.author}</span>
              <span>· {relativeTime(git.lastCommit.date)}</span>
              {commitLog.data?.[0] ? (
                <span className="text-[var(--mc-accent)]">
                  {commitLog.data[0].hash.slice(0, 7)}
                </span>
              ) : null}
            </div>
            {git.remote ? (
              <div className="flex flex-wrap gap-1.5">
                <a
                  href={git.remote.links.issues}
                  target="_blank"
                  rel="noreferrer"
                  className="border border-[var(--mc-line)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground outline-none transition-colors hover:text-[var(--mc-accent)] focus-visible:ring-1 focus-visible:ring-ring"
                >
                  Issues
                </a>
                <a
                  href={git.remote.links.pulls}
                  target="_blank"
                  rel="noreferrer"
                  className="border border-[var(--mc-line)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground outline-none transition-colors hover:text-[var(--mc-accent)] focus-visible:ring-1 focus-visible:ring-ring"
                >
                  Pull requests
                </a>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {git.isRepo ? "No commits yet." : "No git data."}
          </p>
        )}
      </PanelBlock>

      <PanelBlock title="history" fill>
        <CommitHistoryCell path={path} isRepo={git.isRepo} />
      </PanelBlock>

      <div className="col-span-full flex flex-wrap items-center gap-1.5 border-t border-[var(--mc-line)] bg-[var(--mc-bg-raise)] px-3 py-2">
        {project.alerts.length > 0 ? (
          project.alerts.map((a) => (
            <AlertBadge key={a.code} severity={a.severity} message={a.message} />
          ))
        ) : (
          <span className="font-mono text-[10px] text-muted-foreground">
            no open alerts · scan clean
          </span>
        )}
      </div>
    </section>
  );

  return (
    <div className="mc flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex flex-col gap-3 border-b border-[var(--mc-line)] bg-background px-4 pb-3 pt-4 lg:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            variant="ghost"
            size="icon-sm"
            render={<Link to="/designs/mission-control" />}
            aria-label="Back to Mission Control"
          >
            <ArrowLeft className="size-3.5" />
          </Button>
          <span
            aria-hidden
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--mc-accent)]"
          >
            MC
          </span>
          <StackIcon className="size-4 shrink-0 text-muted-foreground" />
          <h1 className="text-sm font-semibold tracking-tight text-foreground">
            {project.name}
          </h1>
          <button
            type="button"
            onClick={() => void copyPath()}
            title="Copy path"
            className="flex min-w-0 items-center gap-1 truncate font-mono text-[10px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring lg:max-w-[44ch]"
          >
            <Copy aria-hidden className="size-3 shrink-0" />
            {project.path}
          </button>
          <span
            className="ml-auto whitespace-nowrap font-mono text-[10px] tabular-nums text-muted-foreground"
            title={dateTooltip(project.updatedAt)}
          >
            upd {relativeTime(project.updatedAt)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={consoleBtn} onClick={() => openMutation.mutate({ path, target: "editor" })}>
            <Folder aria-hidden className="size-3" /> Editor
          </button>
          <button type="button" className={consoleBtn} onClick={() => openMutation.mutate({ path, target: "terminal" })}>
            <TerminalIcon aria-hidden className="size-3" /> Terminal
          </button>
          <button type="button" className={consoleBtn} onClick={() => openMutation.mutate({ path, target: "folder" })}>
            <ExternalLink aria-hidden className="size-3" /> Folder
          </button>
          <button
            type="button"
            className={consoleBtn}
            disabled={ideInstalling || ideStarting}
            onClick={openIde}
          >
            {ideInstalling || ideStarting ? (
              <Loader2 aria-hidden className="size-3 animate-spin" />
            ) : (
              <CodeXml aria-hidden className="size-3" />
            )}
            {ide.data !== undefined && ideInstalling
              ? installingLabel(ide.data.install)
              : ideStarting
                ? "Starting…"
                : "IDE"}
          </button>
          <button
            type="button"
            className={consoleBtn}
            disabled={!git.isRepo || reportPending}
            title={!git.isRepo ? "Not a git repository" : "Full HTML report in a new tab"}
            onClick={() => runReport({ kind: "repo", path, force: true })}
          >
            {reportPending ? (
              <Loader2 aria-hidden className="size-3 animate-spin" />
            ) : (
              <FileText aria-hidden className="size-3" />
            )}
            {reportPending ? "Generating…" : "Report"}
          </button>
          {git.isRepo && git.remote ? (
            <a href={git.remote.links.web} target="_blank" rel="noreferrer" className={consoleBtn}>
              {hostLabel(git.remote.host)} · {git.remote.slug}
              <ExternalLink aria-hidden className="size-3" />
            </a>
          ) : null}
        </div>
        <div
          role="tablist"
          aria-label="Project views"
          className="mc-tabs mc-scroll-x mt-1 overflow-x-auto"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className="mc-tab whitespace-nowrap"
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-3 px-4 pb-12 pt-3 lg:px-6 2xl:px-8">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            role="tabpanel"
            aria-label={`${tab} view`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="flex min-h-0 flex-1 flex-col gap-3"
          >
            {tab === "overview" ? (
              <>
                {stateBand}
                <div className="grid w-full gap-3 lg:grid-cols-2">
                  <ReportWidgetShell
                    title="Commit pulse"
                    meta={<span>{commitLog.data?.length ?? 0} in log window</span>}
                  >
                    <div className="flex flex-col gap-3">
                      <HeatmapInstrument
                        counts={commitCounts}
                        weeks={pulseWeeks}
                        now={now}
                        cellMax={26}
                        ariaLabel={`${project.name} commit-day heatmap, trailing ${pulseWeeks} weeks`}
                      />
                      <div className="grid grid-cols-3 gap-3 border-t border-[var(--mc-line)] pt-2.5">
                        <MiniStat
                          label="logged commits"
                          value={(commitLog.data?.length ?? 0).toLocaleString()}
                        />
                        <MiniStat label="authors" value={String(commitAuthors)} />
                        <MiniStat
                          label="first commit"
                          value={
                            firstCommitIso !== null
                              ? relativeTime(firstCommitIso)
                              : "—"
                          }
                        />
                      </div>
                    </div>
                  </ReportWidgetShell>
                  <ReportWidgetShell
                    title="Recent commits"
                    meta={<span>newest first</span>}
                  >
                    <CommitsTable commits={(commitLog.data ?? []).slice(0, 8)} />
                  </ReportWidgetShell>
                </div>
              </>
            ) : tab === "activity" ? (
              report.data === null ? (
                <ReportMissing
                  kind="repo"
                  command={report.command}
                  commandError={report.commandError}
                  generating={report.generating}
                  onGenerate={() => report.generate(false)}
                />
              ) : (
                <>
                  <div className="flex items-center justify-end px-1">
                    <ReportStatusLine
                      generatedAt={report.data.generatedAt}
                      stale={stale}
                      generating={report.generating}
                      onGenerate={() => report.generate(true)}
                      reportKey={report.key}
                    />
                  </div>
                  <ReportActivityWidget
                    data={report.data}
                    mode="repo"
                    commits={commitLog.data}
                    commitsPending={commitLog.isPending}
                    className="flex min-h-0 flex-1 flex-col"
                  />
                </>
              )
            ) : tab === "code" ? (
              report.data === null ? (
                <ReportMissing
                  kind="repo"
                  command={report.command}
                  commandError={report.commandError}
                  generating={report.generating}
                  onGenerate={() => report.generate(false)}
                />
              ) : (
                <>
                  <div className="flex items-center justify-end px-1">
                    <ReportStatusLine
                      generatedAt={report.data.generatedAt}
                      stale={stale}
                      generating={report.generating}
                      onGenerate={() => report.generate(true)}
                      reportKey={report.key}
                    />
                  </div>
                  <ReportCodeWidget
                    data={report.data}
                    commits={commitLog.data}
                    className="flex min-h-0 flex-1 flex-col"
                  />
                </>
              )
            ) : tab === "ai" ? (
              report.data === null ? (
                <ReportMissing
                  kind="repo"
                  command={report.command}
                  commandError={report.commandError}
                  generating={report.generating}
                  onGenerate={() => report.generate(false)}
                />
              ) : (
                <>
                  <div className="flex items-center justify-end px-1">
                    <ReportStatusLine
                      generatedAt={report.data.generatedAt}
                      stale={stale}
                      generating={report.generating}
                      onGenerate={() => report.generate(true)}
                      reportKey={report.key}
                    />
                  </div>
                  <div className="grid w-full gap-3 lg:grid-cols-[1.4fr_1fr]">
                    <ReportAiWidget data={report.data} />
                    <div className="flex min-w-0 flex-col gap-3">
                      <ReportHealthWidget data={report.data} />
                      <ReportWidgetShell title="Report meta">
                        <div className="flex flex-col gap-2">
                          <Row label="Target">
                            <span className="break-all font-mono text-[10.5px]">
                              {report.data.targetPath}
                            </span>
                          </Row>
                          <Row label="Period">
                            {report.data.period ?? "all history"}
                          </Row>
                          <Row label="Generated">
                            {relativeTime(report.data.generatedAt)}
                          </Row>
                          <Row label="Export key">
                            <span className="font-mono text-[10.5px] text-[var(--mc-accent)]">
                              {report.data.key}
                            </span>
                          </Row>
                        </div>
                      </ReportWidgetShell>
                    </div>
                  </div>
                </>
              )
            ) : tab === "files" ? (
              <section className="mc-panel mc-files overflow-hidden">
                <FileBrowser project={path} />
              </section>
            ) : tab === "artifacts" ? (
              <section className="mc-panel flex max-h-[52rem] flex-col overflow-hidden">
                <div className="min-h-0 flex-1 overflow-y-auto p-1">
                  <ArtifactsPanel project={path} />
                </div>
              </section>
            ) : (
              <div className="grid w-full gap-3 lg:grid-cols-2">
                <section className="mc-panel flex flex-col p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="mc-label">where i left off</span>
                    <span className="font-mono text-[9.5px] text-muted-foreground/70">
                      saved when you click away
                    </span>
                  </div>
                  <Textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    onBlur={saveNote}
                    placeholder="What were you doing? What's next?"
                    rows={10}
                    className="mt-2 flex-1"
                  />
                </section>
                {/* Keyed by path so splat-only navigation remounts the panel. */}
                <div id="ideation" className="min-w-0">
                  <IdeationPanel key={path} project={path} startNew={search.ideation === "new"} />
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/** One instrument-panel column: mono caps title over rows, hairline-split.
 *  `fill` lets the content (the commit graph) own the band's height and
 *  scroll internally instead of stretching empty boxes around it. */
function PanelBlock({
  title,
  trailing,
  fill = false,
  children,
}: {
  title: string;
  trailing?: ReactNode;
  fill?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={
        fill
          ? "flex min-w-0 flex-col bg-[var(--mc-panel)]"
          : "flex min-w-0 flex-col gap-2 bg-[var(--mc-panel)] p-3"
      }
    >
      <div
        className={
          fill
            ? "flex min-h-7 items-center justify-between gap-2 px-3 pt-3"
            : "flex min-h-7 items-center justify-between gap-2"
        }
      >
        <span className="mc-label">{title}</span>
        {trailing}
      </div>
      {fill ? <div className="min-h-0 flex-1 px-3 pb-1">{children}</div> : children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 text-right text-foreground">{children}</span>
    </div>
  );
}

function LoadingPage() {
  return (
    <div className="mc min-h-dvh w-full px-4 py-6 lg:px-6">
      <Skeleton className="h-4 w-40" />
      <div className="mt-6 grid grid-cols-1 gap-px border border-[var(--mc-line)] bg-[var(--mc-line)] md:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="mt-4 h-24" />
    </div>
  );
}
