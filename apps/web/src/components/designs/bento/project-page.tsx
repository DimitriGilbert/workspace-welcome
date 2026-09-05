import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowLeft,
  CodeXml,
  ExternalLink as ExternalLinkIcon,
  FileText,
  Folder,
  History,
  Images,
  Loader2,
  MessagesSquare,
  Package,
  Pin,
  PinOff,
  Terminal as TerminalIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@workspace-welcome/ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace-welcome/ui/components/tabs";
import { Textarea } from "@workspace-welcome/ui/components/textarea";

import "@/components/designs/bento/bento.css";
import { useTRPC } from "@/utils/trpc";
import { ArtifactsPanel } from "@/components/artifacts";
import { AlertBadge } from "@/components/git-badges";
import { FileBrowser } from "@/components/file-browser";
import { IdeationPanel } from "@/components/ideation/ideation-panel";
import { CommitHistoryCell } from "@/components/project-commit-history";
import {
  BranchSwitcher,
  GitActionsToolbar,
} from "@/components/project-git-actions";
import { BentoTile } from "@/components/designs/bento/bento-tile";
import { GitGlyphs } from "@/components/designs/bento/git-glyphs";
import { RecencyRing } from "@/components/designs/bento/recency-ring";
import { ReportPanel } from "@/components/designs/bento/report-panel";
import { CadenceArea } from "@/components/designs/bento/cadence-area";
import { isReportStale } from "@workspace-welcome/api/lib/report-staleness";
import { formatCost } from "@/components/designs/bento/project-tile";
import { absoluteDate, relativeTime } from "@/lib/format";
import { hostLabel, stackIcon } from "@/lib/icons";
import { freshness } from "@/lib/recency";
import { useReportRun } from "@/lib/use-report";

/** IDE status poll cadence — cheap and local, so 5 s while anything runs. */
const IDE_POLL_MS = 5_000;

/**
 * Deep link into the shared code-server. The server only ever reports the
 * port — the dashboard is browsed from other machines — so the host the
 * browser used is the only correct one.
 */
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

export interface BentoProjectPageProps {
  /** Absolute project path rebuilt from the route splat. */
  path: string;
  /** `?ideation=new` deep link from the create flow. */
  ideationNew: boolean;
  /** Strip the ideation flag once consumed. */
  onConsumeIdeationFlag: () => void;
}

/**
 * The Bento concept's project page: the functional surface of the main
 * project page — git state and actions, files, commits, artifacts,
 * ideation, notes — restyled as glazed bento tiles. The hero band carries
 * identity + note + the working set of actions; git lives in its own edge-
 * lit tile; the bottom tabs cover files / artifacts / ideation / report.
 */
export function BentoProjectPage({
  path,
  ideationNew,
  onConsumeIdeationFlag,
}: BentoProjectPageProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { run: runReport, isPending: reportPending } = useReportRun();

  const scan = useQuery(trpc.projects.scan.queryOptions());
  const project = scan.data?.projects.find((p) => p.path === path) ?? null;

  const [tab, setTab] = useState(() => (ideationNew ? "ideation" : "overview"));

  // The project's snitch dataset for the overview summary — same query keys
  // ReportPanel uses below, so the fetch happens once and is shared.
  const commandQuery = useQuery(
    trpc.reports.command.queryOptions(
      { kind: "repo", path },
      { enabled: project !== null },
    ),
  );
  const exportKey = commandQuery.data?.key ?? null;
  const exportQuery = useQuery(
    trpc.reports.jsonExport.queryOptions(
      { key: exportKey ?? "" },
      { enabled: exportKey !== null },
    ),
  );
  const report = useMemo(
    () => exportQuery.data?.projects.find((p) => p.path === path) ?? null,
    [exportQuery.data, path],
  );
  const reportGeneratedAt = exportQuery.data?.generatedAt ?? null;
  const reportStale =
    exportQuery.data !== undefined &&
    isReportStale(reportGeneratedAt, project?.updatedAt ?? null);

  // Recent commits fill the state tile's right column.
  const recentCommits = useQuery(
    trpc.projects.commitLog.queryOptions(
      { path, limit: 4 },
      { enabled: project?.git.isRepo === true },
    ),
  );

  // ?ideation=new: once the project resolved, strip the flag so a reload
  // lands on a clean URL; the ideation tab (mounted with startNew) keeps
  // forcing the fresh-session form until the panel consumes it.
  useEffect(() => {
    if (ideationNew && project !== null) onConsumeIdeationFlag();
  }, [ideationNew, project, onConsumeIdeationFlag]);

  // Git mutations refresh both the scan (branch, ahead/behind, dirty) and
  // this project's commit log, so the History graph tracks every pull /
  // push / fetch / branch switch.
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
  const pinMutation = useMutation(
    trpc.projects.setPinned.mutationOptions({
      onSuccess: () => invalidateScan(),
      onError: (e) => toast.error(e.message),
    }),
  );

  // Shared code-server status, polled while an install or start is in flight
  // (function form — a settled IDE stops the interval until the next click).
  // The intent flag keeps the poll alive across the async open flow; it is
  // read at evaluation time, after the click that sets it. The tab ref holds
  // the blank tab opened synchronously in the click (popup blockers require
  // the gesture) — navigated or closed exactly once when the flow settles.
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
        // The mutation can resolve long before the next poll tick (it waits
        // out startup itself) — refetch so the ready toast fires promptly
        // and the paused interval resumes while intent is armed.
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

  // Async Open IDE flow: exactly one navigation or "IDE ready" toast per
  // transition (the intent flag disarms on fire, so later polls of the same
  // running state stay silent), install failures surfaced from the polled
  // state, and the second kick — open() returns early while an install runs,
  // so the start has to be re-issued once the binary has landed.
  useEffect(() => {
    const s = ide.data;
    if (s === undefined || !ideOpening.current) return;
    if (s.running && s.port !== null) {
      ideOpening.current = false;
      const url = ideUrl(s.port, path);
      const tab_ = ideTab.current;
      ideTab.current = null;
      if (tab_ !== null && !tab_.closed) {
        tab_.location.href = url;
        return;
      }
      // No live tab (popup blocker, or the user closed it mid-wait) — the
      // toast action's own click is a user gesture, so popup blockers let a
      // direct open through.
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

  // Left the page mid-wait: nobody is left to navigate the blank tab — close
  // it rather than strand an empty window.
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
      <div className="mx-auto flex w-full max-w-2xl flex-col items-stretch gap-3 py-6">
        <Button
          variant="ghost"
          size="icon-sm"
          className="w-fit"
          render={<Link to="/designs/bento" />}
          aria-label="Back to bento dashboard"
        >
          <ArrowLeft className="size-3.5" />
        </Button>
        <BentoTile className="flex flex-col items-center gap-3 p-14 text-center">
          <p className="text-base font-semibold tracking-tight">Project not found</p>
          <p className="text-sm text-muted-foreground">
            <span className="break-all font-mono">{path}</span> isn&rsquo;t in
            the current scan — it may have been moved, hidden or deleted.
          </p>
        </BentoTile>
      </div>
    );
  }

  const StackIcon = stackIcon(project.stack?.id);
  const git = project.git;
  // One gate for every git op on the page — fetch, pull, push, fetch-a-
  // branch and switch all rest while any of the others is in flight.
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
    // Already up: open straight from the click — a user gesture, so no popup
    // blocker involvement — using the browser's own host.
    if (s !== undefined && s.running && s.port !== null) {
      window.open(ideUrl(s.port, path), "_blank", "noopener");
      return;
    }
    // Open the tab synchronously in the click — popup blockers only permit
    // window.open during a user gesture, and the URL only exists once the
    // poll sees the server ready. No "noopener": with it window.open returns
    // null BY SPEC, so the tab could never be navigated later; the blank tab
    // is same-origin, so holding the reference is harmless.
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

  const now = scan.dataUpdatedAt > 0 ? scan.dataUpdatedAt : Date.now();
  const updatedAtMs = new Date(project.updatedAt).getTime();
  const f = freshness(project.updatedAt, project.lastOpenedAt, now);
  // Map the shared recency tier onto the ring's tone vocabulary.
  const ringTier =
    f >= 0.95 ? "hero" : f >= 0.45 ? "feature" : f >= 0.2 ? "medium" : "compact";

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Full-width glazed nav bar: back, the page sections, and the
          project's live status on the right. */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v ?? "overview")}
        className="b-tabs flex min-h-0 flex-col gap-3"
      >
        <BentoTile className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            render={<Link to="/designs/bento" />}
            aria-label="Back to bento dashboard"
          >
            <ArrowLeft className="size-3.5" /> bento
          </Button>
          <TabsList className="max-w-full overflow-x-auto">
            <TabsTrigger value="overview">
              <Package className="size-3" /> Overview
            </TabsTrigger>
            <TabsTrigger value="pulse">
              <Activity className="size-3" /> Pulse
            </TabsTrigger>
            <TabsTrigger value="files">
              <Folder className="size-3" /> Files
            </TabsTrigger>
            <TabsTrigger value="artifacts">
              <Images className="size-3" /> Artifacts
            </TabsTrigger>
            <TabsTrigger value="ideation">
              <MessagesSquare className="size-3" /> Ideation
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="size-3" /> History
            </TabsTrigger>
          </TabsList>
          <span className="ml-auto hidden shrink-0 items-center gap-2 font-mono text-[0.62rem] text-muted-foreground/80 lg:flex">
            {git.isRepo ? <GitGlyphs git={git} /> : null}
            <span>updated {relativeTime(project.updatedAt)}</span>
          </span>
        </BentoTile>

        <TabsContent value="overview" className="mt-0 flex min-h-0 flex-1 flex-col gap-3">
          <section className="bento-grid">
            <BentoTile span="sp-id" className="flex min-h-[320px] flex-col gap-4 p-5 xl:min-h-[460px]">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-white/[0.04] text-muted-foreground"
                >
                  <StackIcon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-lg font-semibold tracking-tight">
                      {project.name}
                    </h1>
                    {project.stack ? (
                      <span className="shrink-0 rounded-full border border-border bg-white/[0.03] px-2 py-px text-[0.62rem] font-medium text-muted-foreground">
                        {project.stack.label}
                      </span>
                    ) : null}
                    {project.pinned ? (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 font-mono text-[0.62rem]"
                        style={{ color: "var(--pinned-accent)" }}
                      >
                        <Pin className="size-3" /> pinned
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={copyPath}
                    title="Copy path"
                    className="min-w-0 max-w-full truncate font-mono text-[0.7rem] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {project.path}
                  </button>
                </div>
                <RecencyRing updatedAtMs={updatedAtMs} score={f} tier={ringTier} now={now} px={48} />
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <Meta label="Created" value={absoluteDate(project.createdAt)} />
                <Meta label="Updated" value={relativeTime(project.updatedAt)} />
                <Meta
                  label="Last opened"
                  value={project.lastOpenedAt ? relativeTime(project.lastOpenedAt) : "—"}
                />
              </dl>

              <div className="flex flex-wrap items-center gap-1.5">
                <Button size="sm" onClick={() => openMutation.mutate({ path, target: "editor" })}>
                  <Folder className="size-3.5" /> Editor
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openMutation.mutate({ path, target: "terminal" })}
                >
                  <TerminalIcon className="size-3.5" /> Terminal
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openMutation.mutate({ path, target: "folder" })}
                >
                  <Folder className="size-3.5" /> Folder
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={ideInstalling || ideStarting}
                  onClick={openIde}
                >
                  {ideInstalling || ideStarting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <CodeXml className="size-3.5" />
                  )}
                  {ide.data !== undefined && ideInstalling
                    ? installingLabel(ide.data.install)
                    : ideStarting
                      ? "Starting…"
                      : "IDE"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!git.isRepo || reportPending}
                  title={!git.isRepo ? "Not a git repository" : "Open the git-snitch report"}
                  onClick={() => runReport({ kind: "repo", path, force: true })}
                >
                  {reportPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <FileText className="size-3.5" />
                  )}
                  {reportPending ? "Generating…" : "Report"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    pinMutation.mutate({ path, pinned: !project.pinned })
                  }
                  disabled={pinMutation.isPending}
                  aria-label={project.pinned ? "Unpin project" : "Pin project"}
                >
                  {project.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                </Button>
              </div>

              <div className="mt-auto flex min-h-0 flex-col gap-1.5 border-t border-border pt-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="b-label">where i left off</span>
                  <span className="font-mono text-[0.62rem] text-muted-foreground/70">
                    saved when you click away
                  </span>
                </div>
                <Textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onBlur={saveNote}
                  placeholder="What were you doing? What's next?"
                  rows={2}
                  className="min-h-0"
                />
              </div>
            </BentoTile>

            {/* Grouped state: git controls | last commit + the commits right
                behind it — the tile's full height works for data. */}
            <BentoTile span="sp-state" className="flex min-h-[320px] flex-col gap-3 p-5 xl:min-h-[460px]">
              <div className="flex min-h-7 items-center justify-between gap-2">
                <h2 className="b-label">state</h2>
                {git.isRepo && git.remote ? (
                  <GitActionsToolbar
                    path={path}
                    gitBusy={gitBusy}
                    fetch={fetchMutation}
                    pull={pullMutation}
                    push={pushMutation}
                    fetchBranch={fetchBranchMutation}
                  />
                ) : null}
              </div>

              {!git.isRepo ? (
                <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  Not a git repository.
                </p>
              ) : (
                <div className="grid min-h-0 flex-1 content-start gap-x-6 gap-y-3 md:grid-cols-2 md:divide-x md:divide-border">
                  <div className="flex min-w-0 flex-col gap-3 md:pr-5">
                    <BranchSwitcher
                      path={path}
                      branch={git.branch}
                      gitBusy={gitBusy}
                      switchBranch={switchBranchMutation}
                    />
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">Remote</span>
                      {git.remote ? (
                        <a
                          href={git.remote.links.web}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-w-0 items-center gap-1 hover:underline"
                          style={{ color: "var(--bento-c1)" }}
                        >
                          <span className="truncate">{hostLabel(git.remote.host)} · {git.remote.slug}</span>
                          <ExternalLinkIcon className="size-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">none</span>
                      )}
                    </div>
                    <GitGlyphs git={git} large />
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">Dirty files</span>
                      <span className="b-num text-sm">{git.dirtyCount ?? 0}</span>
                    </div>
                    {diverged ? (
                      <p className="text-xs leading-relaxed" style={{ color: "var(--sev-critical)" }}>
                        Diverged from upstream — a fast-forward pull isn&rsquo;t
                        possible. Reconcile the branches from a terminal.
                      </p>
                    ) : null}
                  </div>

                  <div className="flex min-w-0 flex-col gap-2.5 md:pl-5">
                    <h3 className="b-label">last commit</h3>
                    {git.lastCommit ? (
                      <div className="flex min-w-0 flex-col gap-1">
                        <p className="line-clamp-2 text-sm leading-snug" title={git.lastCommit.message}>
                          {git.lastCommit.message}
                        </p>
                        <p className="font-mono text-[0.66rem] text-muted-foreground">
                          {git.lastCommit.author} · {relativeTime(git.lastCommit.date)}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No commits yet.</p>
                    )}

                    <div className="mt-auto flex min-h-0 flex-1 flex-col gap-1 border-t border-border pt-2.5">
                      <h3 className="b-label">right behind it</h3>
                      {recentCommits.isPending ? (
                        <p className="text-xs text-muted-foreground">Loading history…</p>
                      ) : (recentCommits.data?.length ?? 0) === 0 ? (
                        <p className="text-xs text-muted-foreground">No earlier commits.</p>
                      ) : (
                        <ul className="flex min-h-0 flex-1 flex-col justify-evenly">
                          {(recentCommits.data ?? []).slice(0, 4).map((commit) => (
                            <li key={commit.hash} className="flex min-w-0 items-baseline gap-2 text-xs">
                              <span className="b-glyph shrink-0">{commit.hash.slice(0, 7)}</span>
                              <span className="min-w-0 flex-1 truncate" title={commit.subject}>
                                {commit.subject}
                              </span>
                              <span className="shrink-0 font-mono text-[0.62rem] text-muted-foreground">
                                {relativeTime(new Date(commit.timestamp * 1000).toISOString())}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {git.remote ? (
                        <div className="flex shrink-0 flex-wrap gap-1 pt-1.5">
                          <Button
                            size="xs"
                            variant="outline"
                            render={
                              <a href={git.remote.links.issues} target="_blank" rel="noreferrer" />
                            }
                          >
                            Issues
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            render={
                              <a href={git.remote.links.pulls} target="_blank" rel="noreferrer" />
                            }
                          >
                            Pull requests
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </BentoTile>

            {/* Pulse summary: the project's snitch story on the default tab —
                cost, stats, cadence shape, worst signal — no tab-hopping. */}
            <BentoTile span="sp-summary" className="flex min-h-[320px] flex-col gap-3 p-5 xl:min-h-[460px]">
              <div className="flex items-center justify-between gap-2">
                <h2 className="b-label">pulse</h2>
                {report ? (
                  reportStale ? (
                    <span className="font-mono text-[0.64rem]" style={{ color: "var(--sev-warning)" }}>
                      stale
                    </span>
                  ) : (
                    <span className="font-mono text-[0.64rem]" style={{ color: "var(--state-positive)" }}>
                      fresh
                    </span>
                  )
                ) : null}
              </div>

              {report ? (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <span
                      className="b-num text-[34px]"
                      style={{ color: "var(--bento-c4)" }}
                      aria-label={`Subsidized AI cost ${(report.aiUsage?.cost ?? 0).toFixed(2)} dollars`}
                    >
                      {formatCost(report.aiUsage?.cost ?? 0)}
                    </span>
                    <span className="text-right text-[0.66rem] leading-tight text-muted-foreground">
                      subsidized AI cost
                      <br />
                      {report.aiUsage?.records.toLocaleString() ?? "0"} messages
                    </span>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <Meta label="Commits" value={report.totalCommits.toLocaleString()} />
                    <Meta label="Contributors" value={String(report.contributors)} />
                    <Meta label="Languages" value={String(report.languages.length)} />
                    <Meta label="Signals" value={String(report.alerts.length)} />
                  </dl>

                  <div className="flex min-h-0 flex-1 flex-col justify-center">
                    <CadenceArea cadence={report.cadence} />
                  </div>

                  {report.alerts[0] ? (
                    <p
                      className="line-clamp-2 rounded-lg border border-border bg-white/[0.02] px-2.5 py-1.5 text-[0.66rem] leading-snug text-muted-foreground"
                      title={report.alerts[0].summary}
                    >
                      <span
                        className="font-medium"
                        style={{
                          color:
                            report.alerts[0].severity === "critical"
                              ? "var(--sev-critical)"
                              : report.alerts[0].severity === "warning"
                                ? "var(--sev-warning)"
                                : "var(--sev-info)",
                        }}
                      >
                        {report.alerts[0].label}:
                      </span>{" "}
                      {report.alerts[0].summary}
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-2.5">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    No cached snitch report for this project yet — the pulse
                    carries its cadence, quality signals, language mix, and
                    subsidized AI cost.
                  </p>
                  <Button size="sm" variant="outline" onClick={() => setTab("pulse")}>
                    <Activity className="size-3.5" /> Open pulse
                  </Button>
                </div>
              )}

              <Button
                size="xs"
                variant="ghost"
                className="self-start"
                onClick={() => setTab("pulse")}
              >
                Full pulse <ArrowLeft className="size-3 rotate-180" />
              </Button>
            </BentoTile>
          </section>

          {project.alerts.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {project.alerts.map((a) => (
                <AlertBadge key={a.code} severity={a.severity} message={a.message} />
              ))}
            </div>
          ) : null}
        </TabsContent>

        {/* Pulse: the same ReportPanel the dashboard uses — Activity cadence
            (area chart <-> month table carousel), Health signals with the
            snitch prose, Code donut, and the subsidized AI cost headline.
            Given chart height here so the plots run edge-to-edge. */}
        <TabsContent value="pulse" className="mt-0 flex min-h-0 flex-1 flex-col">
          <BentoTile className="b-pulse-xl flex flex-col p-5">
            <ReportPanel
              kind="repo"
              path={path}
              projects={[project]}
              title="Project pulse"
              className="min-h-0 flex-1"
            />
          </BentoTile>
        </TabsContent>

      {/* Working surface: files / artifacts / ideation / commit history. */}

        <TabsContent value="files" className="pt-3">
          <BentoTile className="p-2">
            <FileBrowser project={path} />
          </BentoTile>
        </TabsContent>
        <TabsContent value="artifacts" className="pt-3">
          <BentoTile className="p-2">
            <ArtifactsPanel project={path} />
          </BentoTile>
        </TabsContent>
        <TabsContent value="ideation" className="pt-3">
          {/* Keyed by path so splat-only navigation remounts the panel and
              resets its per-project state (auto-resume, draft, context). */}
          <IdeationPanel key={path} project={path} startNew={ideationNew} />
        </TabsContent>
        <TabsContent value="history" className="pt-3">
          <BentoTile className="flex max-h-[560px] flex-col p-5">
            <h2 className="b-label">commit history</h2>
            <div className="min-h-0 flex-1 overflow-y-auto pt-2">
              <CommitHistoryCell path={path} isRepo={git.isRepo} />
            </div>
          </BentoTile>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="b-label">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-[0.72rem] text-foreground/90" title={value}>
        {value}
      </dd>
    </div>
  );
}

function LoadingPage() {
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="b-skel h-8 w-40" style={{ borderRadius: 10 }} />
      <div className="bento-grid">
        <div className="b-skel sp-id min-h-[300px]" />
        <div className="b-skel sp-state min-h-[300px]" />
        <div className="b-skel sp-commit min-h-[240px]" />
        <div className="b-skel sp-history min-h-[240px]" />
      </div>
    </div>
  );
}
