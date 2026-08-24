import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUp,
  CodeXml,
  Copy,
  ExternalLink,
  ExternalLinkIcon,
  FileText,
  Folder,
  GitBranch,
  Loader2,
  RefreshCw,
  Terminal as TerminalIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace-welcome/ui/components/card";
import { Button } from "@workspace-welcome/ui/components/button";
import { Badge } from "@workspace-welcome/ui/components/badge";
import { Separator } from "@workspace-welcome/ui/components/separator";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";
import { Textarea } from "@workspace-welcome/ui/components/textarea";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { useTRPC } from "@/utils/trpc";
import { absoluteDate, relativeTime } from "@/lib/format";
import { hostLabel, stackIcon } from "@/lib/icons";
import { useReportRun } from "@/lib/use-report";
import { AlertBadge } from "@/components/git-badges";
import { FileBrowser } from "@/components/file-browser";

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

  const invalidateScan = () =>
    queryClient.invalidateQueries({ queryKey: trpc.projects.scan.queryKey() });

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
        <Card size="sm" className="w-full">
          <CardHeader>
            <CardTitle>Project not found</CardTitle>
            <CardDescription>
              <span className="break-all font-mono text-xs">{path}</span>{" "}
              isn&rsquo;t in the current scan — it may have been moved, hidden
              or deleted.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const StackIcon = stackIcon(project.stack?.id);
  const git = project.git;
  const gitBusy = fetchMutation.isPending || pullMutation.isPending;
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
    // Full-bleed page: the Files section below must span the viewport, so the
    // centered max-w container wraps only the header and the two-column grid.
    <div className="w-full px-5 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-[1480px]">
      {/* Header band ------------------------------------------------------- */}
      <header className="mb-6 flex flex-col gap-4 border-b border-foreground/10 pb-5">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            render={<Link to="/" />}
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="size-3.5" />
          </Button>
          <Link
            to="/"
            className="font-mono text-[0.65rem] font-medium uppercase tracking-[0.24em] text-[var(--eyebrow)]"
          >
            Workspace
          </Link>
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="flex items-center gap-2.5 text-3xl font-semibold tracking-tight">
              <StackIcon className="size-6 shrink-0 text-muted-foreground" />
              <span className="truncate">{project.name}</span>
            </h1>
            <button
              type="button"
              onClick={copyPath}
              title="Copy path"
              className="break-all text-left font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {project.path}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() =>
                openMutation.mutate({ path, target: "editor" })
              }
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
            <Button size="sm" variant="ghost" onClick={copyPath}>
              <Copy className="size-3.5" /> Copy path
            </Button>
          </div>
        </div>
        {project.alerts.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {project.alerts.map((a) => (
              <AlertBadge
                key={a.code}
                severity={a.severity}
                message={a.message}
              />
            ))}
          </div>
        ) : null}
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Main column */}
        <div className="flex min-w-0 flex-col gap-6">
          {/* Git */}
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="size-4 text-muted-foreground" />
                Git
              </CardTitle>
              {git.isRepo && git.remote ? (
                <CardAction>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={gitBusy}
                      onClick={() => fetchMutation.mutate({ path })}
                    >
                      <RefreshCw
                        className={cn(
                          "size-3.5",
                          fetchMutation.isPending && "animate-spin",
                        )}
                      />
                      Fetch
                    </Button>
                    <Button
                      size="sm"
                      disabled={gitBusy}
                      onClick={() => pullMutation.mutate({ path })}
                    >
                      <ArrowDownToLine className="size-3.5" /> Pull
                    </Button>
                  </div>
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {!git.isRepo ? (
                <p className="text-xs text-muted-foreground">
                  Not a git repository.
                </p>
              ) : (
                <>
                  <Row label="Branch">
                    {git.branch ? (
                      <Badge variant="outline" className="font-mono">
                        <GitBranch className="size-3" />
                        {git.branch}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">detached</span>
                    )}
                  </Row>
                  {git.remote ? (
                    <Row label="Remote">
                      <a
                        href={git.remote.links.web}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        {hostLabel(git.remote.host)} · {git.remote.slug}
                        <ExternalLinkIcon className="size-3" />
                      </a>
                    </Row>
                  ) : (
                    <Row label="Remote">
                      <span className="text-muted-foreground">none</span>
                    </Row>
                  )}
                  <Row label="Ahead / behind">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-emerald-500">
                        <ArrowUp className="size-3" />
                        {git.ahead ?? 0}
                      </span>
                      <span className="inline-flex items-center gap-1 text-amber-500">
                        <ArrowDown className="size-3" />
                        {git.behind ?? 0}
                      </span>
                    </span>
                  </Row>
                  <Row label="Dirty files">{git.dirtyCount ?? 0}</Row>
                  {git.lastCommit ? (
                    <>
                      <Separator />
                      <div className="flex flex-col gap-1 pt-1">
                        <span className="text-xs text-muted-foreground">
                          Last commit · {relativeTime(git.lastCommit.date)}
                        </span>
                        <p className="text-xs">{git.lastCommit.message}</p>
                        <span className="text-xs text-muted-foreground">
                          by {git.lastCommit.author}
                        </span>
                      </div>
                    </>
                  ) : null}
                  {diverged ? (
                    <p
                      className="pt-1 text-xs"
                      style={{ color: "var(--sev-error)" }}
                    >
                      Diverged from upstream — a fast-forward pull isn&rsquo;t
                      possible. Reconcile the branches from a terminal.
                    </p>
                  ) : null}
                  {git.remote ? (
                    <div className="flex flex-wrap gap-1 pt-1">
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
                </>
              )}
            </CardContent>
          </Card>

          {/* Note */}
          <Card size="sm">
            <CardHeader>
              <CardTitle>Where I left off</CardTitle>
              <CardDescription>
                Saved automatically when you click away.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onBlur={saveNote}
                placeholder="What were you doing? What's next?"
                rows={6}
              />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-6">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Row label="Stack">
                {project.stack ? (
                  <Badge variant="secondary">{project.stack.label}</Badge>
                ) : (
                  <span className="text-muted-foreground">unknown</span>
                )}
              </Row>
              <Row label="Created">{absoluteDate(project.createdAt)}</Row>
              <Row label="Updated">{relativeTime(project.updatedAt)}</Row>
              {project.lastOpenedAt ? (
                <Row label="Last opened">
                  {relativeTime(project.lastOpenedAt)}
                </Row>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
      </div>

      {/* Files — full viewport width (only the page padding), outside the
          centered container so wide monitors get all available space. */}
      <div className="mt-6">
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

function LoadingPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
      <div className="flex flex-col gap-3 border-b border-foreground/10 pb-5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-44" />
        </div>
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
