import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CodeXml,
  ExternalLink,
  ExternalLinkIcon,
  FileText,
  Folder,
  Loader2,
  Settings,
  Terminal as TerminalIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@workspace-welcome/ui/components/button";
import { MastheadRow, PageRail } from "@workspace-welcome/ui/components/page-rail";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";
import { Textarea } from "@workspace-welcome/ui/components/textarea";
import { WorkspaceBrand } from "@workspace-welcome/ui/components/workspace-brand";

import { useTRPC } from "@/utils/trpc";
import { absoluteDate, relativeTime } from "@/lib/format";
import { hostLabel, stackIcon } from "@/lib/icons";
import { useReportRun } from "@/lib/use-report";
import { AlertBadge } from "@/components/git-badges";
import { StatusStrip } from "@/components/status-strip";
import { FileBrowser } from "@/components/file-browser";
import { CommitHistoryCell } from "@/components/project-commit-history";
import {
  BranchSwitcher,
  GitActionsToolbar,
} from "@/components/project-git-actions";

export const Route = createFileRoute("/projects/$")({
  component: ProjectPage,
});

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

/**
 * Dedicated project page. The URL carries the absolute project path as a
 * splat under /projects — deep-linkable, back-button friendly, and a proper
 * page instead of the old side panel.
 */
function ProjectPage() {
  const { _splat } = Route.useParams();
  const path = `/${_splat ?? ""}`;

  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { run: runReport, isPending: reportPending } = useReportRun();

  const scan = useQuery(trpc.projects.scan.queryOptions());
  const project = scan.data?.projects.find((p) => p.path === path) ?? null;

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
      const tab = ideTab.current;
      ideTab.current = null;
      if (tab !== null && !tab.closed) {
        tab.location.href = url;
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
      <div className="mx-auto flex w-full max-w-2xl flex-col items-start gap-3 px-5 py-6 sm:px-8">
        <Button variant="ghost" size="icon-sm" render={<Link to="/" />}>
          <ArrowLeft className="size-3.5" />
        </Button>
        <div className="w-full border border-foreground/10 p-4">
          <h1 className="text-sm font-semibold tracking-tight">
            Project not found
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="break-all font-mono">{path}</span> isn&rsquo;t in
            the current scan — it may have been moved, hidden or deleted.
          </p>
        </div>
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

  return (
    // The header block uses the exact same container recipe as home
    // (max-w + padding inside), so both pages' left edges line up to the
    // pixel. The vitals band and Files break out — full-bleed minus the
    // page padding — the deliberate differences on this page.
    <div>
      <PageRail className="pt-6">
        <header className="relative flex flex-col gap-3">
          {/* Row 1 — the same skeleton as home: identity, vitals, settings. */}
          <MastheadRow
            brand={<WorkspaceBrand render={<Link to="/" />} />}
            trailing={
              <>
            <div className="ml-auto mr-1">
              <StatusStrip
                items={[
                  {
                    label: relativeTime(project.updatedAt),
                    value: "updated",
                    accent:
                      Date.now() - new Date(project.updatedAt).getTime() <
                      48 * 60 * 60 * 1000
                        ? "positive"
                        : undefined,
                  },
                  git.isRepo && (git.ahead ?? 0) > 0
                    ? { label: "ahead", value: git.ahead, accent: "positive" as const }
                    : null,
                  git.isRepo && (git.behind ?? 0) > 0
                    ? { label: "behind", value: git.behind, accent: "warn" as const }
                    : null,
                  git.isRepo && (git.dirtyCount ?? 0) > 0
                    ? { label: "dirty", value: git.dirtyCount }
                    : null,
                  project.stack ? { label: "stack", value: project.stack.label } : null,
                ]}
              />
            </div>
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

          {/* Row 2 — the project's identity and its commands. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-foreground/10 pb-4">
            <Button
              variant="ghost"
              size="icon-sm"
              render={<Link to="/" />}
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="size-3.5" />
            </Button>
            <StackIcon className="size-4 shrink-0 text-muted-foreground" />
            <h1 className="text-sm font-semibold tracking-tight">{project.name}</h1>
            <button
              type="button"
              onClick={copyPath}
              title="Copy path"
              className="min-w-0 truncate font-mono text-[0.7rem] text-muted-foreground transition-colors hover:text-foreground lg:max-w-[42ch]"
            >
              {project.path}
            </button>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => openMutation.mutate({ path, target: "editor" })}
              >
                <Folder className="size-3.5" /> Open editor
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
                <ExternalLink className="size-3.5" /> Folder
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
                    ? "Starting IDE…"
                    : "Open IDE"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!git.isRepo || reportPending}
                title={!git.isRepo ? "Not a git repository" : undefined}
                onClick={() => runReport("repo", path)}
              >
                {reportPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <FileText className="size-3.5" />
                )}
                {reportPending ? "Generating…" : "Report"}
              </Button>
            </div>
          </div>
        </header>

        {project.alerts.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1">
            {project.alerts.map((a) => (
              <AlertBadge key={a.code} severity={a.severity} message={a.message} />
            ))}
          </div>
        ) : null}
      </PageRail>

      {/* Vitals — four cells, full-bleed like Files so the band is page-wide. */}
      <div className="px-5 pt-5 sm:px-8 lg:px-10">
        <section className="grid grid-cols-1 border border-foreground/10 md:grid-cols-4 md:divide-x md:divide-foreground/[0.07]">
          <InfoCell
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
              <>
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
                      className="inline-flex items-center gap-1 hover:underline"
                      style={{ color: "var(--primary)" }}
                    >
                      {hostLabel(git.remote.host)} · {git.remote.slug}
                      <ExternalLinkIcon className="size-3" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">none</span>
                  )}
                </Row>
                <Row label="Ahead / behind">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-positive">
                      <ArrowUp className="size-3" />
                      {git.ahead ?? 0}
                    </span>
                    <span
                      className="inline-flex items-center gap-1"
                      style={{ color: "var(--sev-warn)" }}
                    >
                      <ArrowDown className="size-3" />
                      {git.behind ?? 0}
                    </span>
                  </span>
                </Row>
                <Row label="Dirty files">{git.dirtyCount ?? 0}</Row>
                {git.lastCommit ? (
                  <Row label="Last commit">
                    <span className="tabular-nums">
                      {relativeTime(git.lastCommit.date)}
                    </span>
                  </Row>
                ) : null}
                {diverged ? (
                  <p className="text-xs" style={{ color: "var(--sev-error)" }}>
                    Diverged from upstream — a fast-forward pull isn&rsquo;t
                    possible. Reconcile the branches from a terminal.
                  </p>
                ) : null}
              </>
            )}
          </InfoCell>

          <InfoCell title="project">
            <Row label="Stack">{project.stack?.label ?? "unknown"}</Row>
            <Row label="Created">{absoluteDate(project.createdAt)}</Row>
            <Row label="Updated">{relativeTime(project.updatedAt)}</Row>
            {project.lastOpenedAt ? (
              <Row label="Last opened">{relativeTime(project.lastOpenedAt)}</Row>
            ) : null}
          </InfoCell>

          <InfoCell title="last commit">
            {git.lastCommit ? (
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className="line-clamp-3 text-xs leading-relaxed">
                  {git.lastCommit.message}
                </p>
                <span className="font-mono text-[0.7rem] text-muted-foreground">
                  {git.lastCommit.author} · {relativeTime(git.lastCommit.date)}
                </span>
                {git.remote ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Button
                      size="xs"
                      variant="outline"
                      render={
                        <a
                          href={git.remote.links.issues}
                          target="_blank"
                          rel="noreferrer"
                        />
                      }
                    >
                      Issues
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      render={
                        <a
                          href={git.remote.links.pulls}
                          target="_blank"
                          rel="noreferrer"
                        />
                      }
                    >
                      Pull requests
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {git.isRepo ? "No commits yet." : "No git data."}
              </p>
            )}
          </InfoCell>

          <InfoCell title="history">
            <CommitHistoryCell path={path} isRepo={git.isRepo} />
          </InfoCell>
        </section>
      </div>

      <div className="mx-auto w-full max-w-[1480px] px-5 sm:px-8 lg:px-10">
        {/* Note */}
        <section className="mt-4 border border-foreground/10 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-[0.65rem] text-muted-foreground">
              where i left off
            </span>
            <span className="text-[0.65rem] text-muted-foreground/70">
              saved when you click away
            </span>
          </div>
          <Textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={saveNote}
            placeholder="What were you doing? What's next?"
            rows={3}
            className="mt-2"
          />
        </section>
      </div>

      {/* Files — full-bleed: page padding only, no max-w (like the vitals band). */}
      <div className="px-5 pb-6 pt-6 sm:px-8 lg:px-10">
        <FileBrowser project={path} />
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

/**
 * One zone of the vitals band. Titles use the same lowercase mono voice as
 * the status strip; cells are separated by hairlines on wide screens.
 */
function InfoCell({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 p-3">
      <InfoCellHeader title={title} trailing={trailing} />
      {children}
    </div>
  );
}

function InfoCellHeader({
  title,
  trailing,
}: {
  title: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-2">
      <span className="font-mono text-[0.65rem] text-muted-foreground">
        {title}
      </span>
      {trailing}
    </div>
  );
}

function LoadingPage() {
  // Same skeleton shapes as the page it stands in for: two masthead rows,
  // the four-cell full-bleed vitals band, the note block.
  return (
    <div className="w-full px-5 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-[1480px]">
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-80" />
          </div>
          <div className="flex items-center justify-between border-b border-foreground/10 pb-4">
            <Skeleton className="h-5 w-72" />
            <div className="flex gap-2">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-7 w-24" />
            </div>
          </div>
        </header>
      </div>
      <div className="pt-5">
        <div className="grid grid-cols-1 border border-foreground/10 md:grid-cols-4 md:divide-x md:divide-foreground/[0.07]">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-[1480px]">
        <Skeleton className="mt-4 h-24" />
      </div>
    </div>
  );
}
