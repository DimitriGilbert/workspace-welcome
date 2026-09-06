import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BrainCircuit,
  CodeXml,
  Copy,
  ExternalLink,
  ExternalLinkIcon,
  FileText,
  FolderOpen,
  History,
  Images,
  Lightbulb,
  Loader2,
  LayoutDashboard,
  Settings,
  Terminal as TerminalIcon,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@workspace-welcome/ui/components/button";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";
import { Textarea } from "@workspace-welcome/ui/components/textarea";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { useTRPC } from "@/utils/trpc";
import { AlertBadge } from "@/components/git-badges";
import { ArtifactsPanel } from "@/components/artifacts";
import { FileBrowser } from "@/components/file-browser";
import { IdeationPanel } from "@/components/ideation/ideation-panel";
import { CommitHistoryCell } from "@/components/project-commit-history";
import {
  BranchSwitcher,
  GitActionsToolbar,
} from "@/components/project-git-actions";
import { MomentumCardBase } from "@/components/designs/meadow/context";
import { compactAge, dailyActivity, pathBasename, touchedWithinDays } from "@/components/designs/meadow/derive";
import { MeadowReport } from "@/components/designs/meadow/report";
import {
  ProjectAiBand,
  ProjectAlertsPanel,
  ProjectCadencePanel,
  ProjectLanguagesPanel,
  ProjectReportStats,
} from "@/components/designs/meadow/report-section";
import { absoluteDate, relativeTime } from "@/lib/format";
import { hostLabel, stackIcon } from "@/lib/icons";
import "@/components/designs/meadow/meadow.css";

/**
 * Search params (PRD §3): `?ideation=new` is the create-success toast's
 * deep link into a fresh ideation session. Only "new" is meaningful —
 * anything else degrades to absent instead of erroring the route.
 */
const ideationSearch = z
  .object({ ideation: z.literal("new").optional().catch(undefined) })
  .catch({});

export const Route = createFileRoute("/designs/meadow/project/$")({
  validateSearch: ideationSearch,
  component: MeadowProjectPage,
});

/** IDE status poll cadence — cheap and local, so 5 s while anything runs. */
const IDE_POLL_MS = 5_000;

type PageTab =
  | "overview"
  | "activity"
  | "code"
  | "ai"
  | "files"
  | "artifacts"
  | "ideation";

const TABS: { id: PageTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "activity", label: "Activity", icon: History },
  { id: "code", label: "Code", icon: FileText },
  { id: "ai", label: "AI", icon: BrainCircuit },
  { id: "files", label: "Files", icon: FolderOpen },
  { id: "artifacts", label: "Artifacts", icon: Images },
  { id: "ideation", label: "Ideation", icon: Lightbulb },
];

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
  return `Installing IDE… (${Math.floor(
    (install.receivedBytes / install.totalBytes) * 100,
  )} %)`;
}

/**
 * The Meadow project page, round four: soft tabbed sections assembled from
 * the dashboard's own widgets — the report stat strip, cadence area,
 * language donut + bars, alert cards, the subsidized-AI band, the tabbed
 * report widget itself, and the momentum digest scoped to this project.
 * Sparse content lives grouped in columns inside its tab; nothing stretches
 * into empty framing.
 */
function MeadowProjectPage() {
  const { _splat } = Route.useParams();
  const path = `/${_splat ?? ""}`;
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const scan = useQuery(trpc.projects.scan.queryOptions());
  const project = scan.data?.projects.find((p) => p.path === path) ?? null;
  const dataNow = scan.dataUpdatedAt || Date.now();

  const [tab, setTab] = useState<PageTab>("overview");

  // ?ideation=new consumption (PRD §3): open the Ideation tab, then strip
  // the flag so a reload lands on a clean URL.
  useEffect(() => {
    if (search.ideation !== "new" || project === null) return;
    setTab("ideation");
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, ideation: undefined }),
      replace: true,
    });
  }, [search.ideation, project, navigate]);

  // Git mutations refresh both the scan (branch, ahead/behind, dirty) and
  // this project's commit log, so History tracks every pull / push / fetch /
  // branch switch.
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

  // Async Open IDE flow (same choreography as the live page): one blank tab
  // opened synchronously in the click, one navigation or ready-toast per
  // transition, install failures surfaced from the polled state.
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

  // This project's own momentum digest — the dashboard widget scoped to a
  // single project via the same pure shaping helpers. (Above the early
  // returns: hooks must not depend on the loading/not-found branches.)
  const projectActivity = useMemo(
    () => (project ? dailyActivity([project], 28, dataNow) : []),
    [project, dataNow],
  );
  const projectTouches = useMemo(
    () => (project ? touchedWithinDays([project], 7, dataNow) : 0),
    [project, dataNow],
  );

  if (scan.isLoading) return <MeadowProjectLoading />;

  if (!project) {
    return (
      <div className="meadow min-h-svh">
        <div className="mx-auto flex w-full max-w-2xl flex-col items-start gap-3 px-5 py-8 sm:px-8">
          <BackLink />
          <div className="meadow-panel w-full p-6">
            <h1 className="text-sm font-semibold tracking-tight text-foreground">
              Project not found
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="break-all font-mono">{path}</span> isn&rsquo;t
              in the current scan — it may have been moved, hidden or deleted.
            </p>
          </div>
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
    if (s !== undefined && s.running && s.port !== null) {
      window.open(ideUrl(s.port, path), "_blank", "noopener");
      return;
    }
    // No "noopener": with it window.open returns null BY SPEC, so the tab
    // could never be navigated later. Same-origin blank tab is harmless.
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

  // This project's slice of the dashboard momentum widget.
  const momentum = (
    <MomentumCardBase
      activity={projectActivity}
      touchedThisWeek={projectTouches}
      total={projectActivity.reduce((sum, v) => sum + v, 0)}
    />
  );

  return (
    <div className="meadow flex min-h-svh flex-col">
      <div className="mx-auto flex w-full flex-1 flex-col gap-4 px-5 pt-6 pb-8 md:px-8 2xl:px-12">
        {/* Trail back to the meadow + workspace settings. */}
        <div className="flex items-center gap-3">
          <BackLink />
          <span className="text-[11px] text-muted-foreground" title={project.path}>
            {pathBasename(path)}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            render={<Link to="/settings" />}
            aria-label="Settings"
            title="Settings"
            className="ml-auto"
          >
            <Settings aria-hidden className="size-3.5" />
          </Button>
        </div>

        {/* Identity + the day-to-day commands. */}
        <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full"
            style={{
              color: "var(--recency-fresh)",
              background:
                "color-mix(in oklch, var(--recency-fresh) 9%, transparent)",
            }}
          >
            <StackIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
              {project.name}
            </h1>
            <button
              type="button"
              onClick={copyPath}
              title="Copy path"
              className="meadow-focus flex min-w-0 items-center gap-1 rounded-full font-mono text-[0.7rem] text-muted-foreground transition-colors hover:text-foreground"
            >
              <span className="truncate">{project.path}</span>
              <Copy aria-hidden className="size-3 shrink-0" />
            </button>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{
              color: "var(--recency-fresh)",
              background:
                "color-mix(in oklch, var(--recency-fresh) 10%, transparent)",
            }}
            title={project.updatedAt}
          >
            touched {compactAge(project.updatedAt)} ago
          </span>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => openMutation.mutate({ path, target: "editor" })}
            >
              <FolderOpen className="size-3.5" /> Open editor
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
          </div>
        </header>

        {/* Alerts — soft severity pills, only when there is news. */}
        {project.alerts.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {project.alerts.map((a) => (
              <AlertBadge key={a.code} severity={a.severity} message={a.message} />
            ))}
          </div>
        ) : null}

        {/* Report at a glance — the subsidized AI cost is the loud cell. */}
        <ProjectReportStats path={path} updatedAt={project.updatedAt} />

        {/* The soft tabbed sections. */}
        <div
          role="tablist"
          aria-label="Project sections"
          className="flex flex-wrap items-center gap-1"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "meadow-focus inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                tab === t.id
                  ? "meadow-tab-active"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon aria-hidden className="size-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" className="flex min-h-0 flex-col gap-3">
          {tab === "overview" ? (
            <>
              <div className="grid w-full gap-3 lg:grid-cols-2">
                <section
                  aria-label="Git state"
                  className="meadow-panel flex flex-col gap-2.5 p-4"
                >
                  <div className="flex min-h-6 items-center justify-between gap-2">
                    <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                      Git
                    </h2>
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
                    <p className="text-xs text-muted-foreground">
                      Not a git repository.
                    </p>
                  ) : (
                    // Spread the vitals across the panel so the git cell
                    // stays filled at any row height (it pairs with the
                    // report widget, whose height varies with its state).
                    <div className="flex flex-1 flex-col justify-between gap-2 text-xs">
                      <VitalRow label="Branch">
                        <BranchSwitcher
                          path={path}
                          branch={git.branch}
                          gitBusy={gitBusy}
                          switchBranch={switchBranchMutation}
                        />
                      </VitalRow>
                      <VitalRow label="Remote">
                        {git.remote ? (
                          <a
                            href={git.remote.links.web}
                            target="_blank"
                            rel="noreferrer"
                            className="meadow-focus inline-flex items-center gap-1 rounded-full hover:underline"
                            style={{ color: "var(--primary)" }}
                          >
                            {hostLabel(git.remote.host)} · {git.remote.slug}
                            <ExternalLinkIcon className="size-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">none</span>
                        )}
                      </VitalRow>
                      <VitalRow label="Ahead / behind">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="inline-flex items-center gap-1"
                            style={{ color: "var(--recency-fresh)" }}
                          >
                            <ArrowUp className="size-3" />
                            {git.ahead ?? 0}
                          </span>
                          <span
                            className="inline-flex items-center gap-1"
                            style={{ color: "var(--sev-warning)" }}
                          >
                            <ArrowDown className="size-3" />
                            {git.behind ?? 0}
                          </span>
                        </span>
                      </VitalRow>
                      <VitalRow label="Dirty files">
                        {git.dirtyCount ?? 0}
                      </VitalRow>
                      <VitalRow label="Created">
                        {absoluteDate(project.createdAt)}
                      </VitalRow>
                      {diverged ? (
                        <p
                          className="text-xs"
                          style={{ color: "var(--sev-critical)" }}
                        >
                          Diverged from upstream — a fast-forward pull
                          isn&rsquo;t possible. Reconcile the branches from a
                          terminal.
                        </p>
                      ) : null}
                    </div>
                  )}
                </section>
                {/* The context panel's tabbed report widget, scoped to this
                    repo — the same component the dashboard's right panel
                    renders, with its full missing/stale/fresh contract. */}
                <MeadowReport
                  scope={{ kind: "repo", path }}
                  title="Project report"
                  updatedAts={[project.updatedAt]}
                />
              </div>
              <div className="grid w-full gap-3 lg:grid-cols-2">
                <section
                  aria-label="Last commit"
                  className="meadow-panel flex flex-col gap-2 p-4"
                >
                  <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Last commit
                  </h2>
                  {git.lastCommit ? (
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <p className="line-clamp-3 text-xs leading-relaxed text-foreground">
                        {git.lastCommit.message}
                      </p>
                      <span className="font-mono text-[0.7rem] text-muted-foreground">
                        {git.lastCommit.author} ·{" "}
                        {relativeTime(git.lastCommit.date)}
                      </span>
                      {git.remote ? (
                        <div className="mt-auto flex flex-wrap gap-1 pt-1">
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
                </section>
                <section
                  aria-label="Note"
                  className="meadow-panel flex flex-col gap-2 p-4"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                      Where I left off
                    </h2>
                    <span className="text-[10px] text-muted-foreground/70">
                      saved when you click away
                    </span>
                  </div>
                  <Textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    onBlur={saveNote}
                    placeholder="What were you doing? What's next?"
                    rows={4}
                    className="resize-y rounded-2xl border-border/70 bg-card/60"
                  />
                </section>
              </div>
            </>
          ) : null}

          {tab === "activity" ? (
            <div className="grid w-full items-start gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <div className="flex flex-col gap-3">
                <ProjectCadencePanel path={path} updatedAt={project.updatedAt} />
                {/* This project's slice of the dashboard momentum widget. */}
                {momentum}
              </div>
              <section
                aria-label="History"
                className="meadow-panel flex flex-col gap-2 self-start p-4"
              >
                <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  History
                </h2>
                <CommitHistoryCell path={path} isRepo={git.isRepo} />
              </section>
            </div>
          ) : null}

          {tab === "code" ? (
            <div className="grid w-full items-start gap-3 xl:grid-cols-2">
              <ProjectLanguagesPanel path={path} updatedAt={project.updatedAt} />
              <ProjectAlertsPanel path={path} updatedAt={project.updatedAt} />
            </div>
          ) : null}

          {tab === "ai" ? (
            <div className="flex w-full flex-col gap-2">
              <ProjectAiBand path={path} updatedAt={project.updatedAt} />
            </div>
          ) : null}

          {tab === "files" ? <FileBrowser project={path} /> : null}
          {tab === "artifacts" ? <ArtifactsPanel project={path} /> : null}
          {tab === "ideation" ? <IdeationPanel key={path} project={path} startNew={search.ideation === "new"} /> : null}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-foreground/5 pt-5">
          <p className="text-[11px] text-muted-foreground">
            {project.name} — meadow view
          </p>
          <Link
            to="/designs"
            className="meadow-focus inline-flex items-center gap-1 rounded-full text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            All concepts
          </Link>
        </footer>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/designs/meadow"
      className="meadow-focus group inline-flex items-center gap-1.5 rounded-full text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      aria-label="Back to the Meadow dashboard"
    >
      <ArrowLeft
        aria-hidden
        className="size-3.5 transition-transform group-hover:-translate-x-0.5"
      />
      Meadow
    </Link>
  );
}

function VitalRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

function MeadowProjectLoading() {
  return (
    <div className="meadow min-h-svh">
      <div className="mx-auto flex w-full flex-col gap-5 px-5 pt-6 pb-12 md:px-8 2xl:px-12">
        <Skeleton className="h-4 w-24" />
        <div className="flex items-center gap-4">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-3 w-80" />
          </div>
          <Skeleton className="ml-auto h-8 w-64 rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <div className="flex gap-2">
          {TABS.map((t) => (
            <Skeleton key={t.id} className="h-7 w-20 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}
