/**
 * ProjectProvider — one project page's data substrate (master plan §3.4, D7).
 *
 * A thin typed view over the react-query cache scoped to a single project
 * path: the scan's Project record, the shared `now` clock, the git quintet
 * with its shared busy/diverged gates, the projects.open/copyPath/touch
 * actions, the note draft+save pair, the ONE cached commit-log entry, and
 * the IDE open choreography. Each of these existed ~4x across the design
 * project pages (mission-control, meadow, mission-bento, bento); this
 * provider is where they live ONCE.
 *
 * Nesting (ruling 3): ProjectProvider mounts WorkspaceProvider INTERNALLY,
 * so `useWorkspace()` works under any Project stack, every read rides the
 * same cache entries the dashboard warmed (`lib/queries/` hooks — identical
 * input ⇒ identical entry), and the memoized fleet derivations are reused
 * rather than re-computed per page.
 *
 * Procedure access: the scan and commit-log reads go through their
 * `lib/queries/` hooks (the sanctioned callers of `queryOptions` for shared
 * procedures). `ide.status` is provider-singular — this is its only
 * consumer in the widget system, parts read it via `useProject().ide.status`
 * — so it follows the `settings.get` precedent and wires its `queryOptions`
 * here, where the poll cadence needs the intent ref.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode, RefObject } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { Project } from "@workspace-welcome/api/lib/types";

import { useCommitLogQuery } from "@/lib/queries/commit-log";
import { useScanQuery } from "@/lib/queries/scan";
import { useTRPC } from "@/utils/trpc";

import { WorkspaceProvider } from "@/widgets/contexts/workspace-context";

/** IDE status poll cadence — cheap and local, so 5 s while anything runs. */
const IDE_POLL_MS = 5_000;

/** The one commit-log window the provider caches (§3.4); narrower windows
 * (a table view, a graph cell) go through `useCommitLogQuery(path, limit)`
 * directly and stay hook-safe. */
const COMMIT_LOG_LIMIT = 200;

/**
 * Deep link into the shared code-server. The server only ever reports the
 * port — the dashboard is browsed from other machines — so the host the
 * browser used is the only correct one.
 */
function ideUrl(port: number, projectPath: string): string {
  return `http://${window.location.hostname}:${port}/?folder=${encodeURIComponent(projectPath)}`;
}

/** "Installing IDE…" with a live percentage once byte counts are known. */
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
 * The slice of a one-shot git mutation object the interactive git parts
 * need, with the project path baked in — the same contract the legacy
 * `components/project-git-actions.tsx` props expose, minus the plumbing.
 * Per-op `isPending` keeps the spinners honest; the per-call `onSuccess`
 * lets dialogs close after the provider-level invalidation settles.
 */
export interface ProjectGitAction {
  isPending: boolean;
  mutate(handlers?: { onSuccess?: () => void }): void;
}

/** Same contract for the branch-scoped mutations (fetch / switch). */
export interface ProjectBranchAction {
  isPending: boolean;
  mutate(branch: string, handlers?: { onSuccess?: () => void }): void;
}

function projectGitAction(
  path: string,
  mutation: {
    isPending: boolean;
    mutate: (
      vars: { path: string },
      handlers?: { onSuccess?: () => void },
    ) => void;
  },
): ProjectGitAction {
  return {
    isPending: mutation.isPending,
    mutate: (handlers) => mutation.mutate({ path }, handlers),
  };
}

function projectBranchAction(
  path: string,
  mutation: {
    isPending: boolean;
    mutate: (
      vars: { path: string; branch: string },
      handlers?: { onSuccess?: () => void },
    ) => void;
  },
): ProjectBranchAction {
  return {
    isPending: mutation.isPending,
    mutate: (branch, handlers) => mutation.mutate({ path, branch }, handlers),
  };
}

/**
 * The shared IDE status poll. The cadence IS the choreography: 5 s while
 * anything is in flight — install downloading/extracting, or an open intent
 * pending — otherwise off, so a settled IDE never keeps the server polling.
 */
function useIdeStatusQuery(openingRef: RefObject<boolean>) {
  const trpc = useTRPC();
  return useQuery(
    trpc.ide.status.queryOptions(undefined, {
      refetchInterval: (query) => {
        const s = query.state.data;
        return s === undefined ||
          s.install.phase === "downloading" ||
          s.install.phase === "extracting" ||
          openingRef.current
          ? IDE_POLL_MS
          : false;
      },
    }),
  );
}

/** Raw query-result types, derived so tRPC's client-error types ride along. */
type CommitLogQueryResult = ReturnType<typeof useCommitLogQuery>;
type IdeQueryResult = ReturnType<typeof useIdeStatusQuery>;

export interface ProjectContextValue {
  /** Absolute path — the stable identity this provider is scoped to. */
  path: string;
  /** The scan's Project record for `path`; null while loading or unknown. */
  project: Project | null;
  /** THE clock — the Workspace rule (`scan.dataUpdatedAt || Date.now()`),
   * one tick per data epoch, never per render. */
  now: number;
  /** The git quintet plus the two derived gates every git part reads. */
  git: {
    /** Any quintet mutation in flight — the shared busy gate. */
    busy: boolean;
    /** ahead > 0 AND behind > 0 — fast-forward pull impossible. */
    diverged: boolean;
    fetchRemote: ProjectGitAction;
    pull: ProjectGitAction;
    push: ProjectGitAction;
    fetchBranch: ProjectBranchAction;
    switchBranch: ProjectBranchAction;
  };
  /** Open in editor/terminal/folder (`projects.open`); toasts the result. */
  open(target: "editor" | "terminal" | "folder"): void;
  /** Copy the absolute path to the clipboard; toasts the outcome. */
  copyPath(): Promise<void>;
  /** `projects.touchLastOpened` — the provider fires it automatically once
   * per mount when the project resolves; this is the explicit re-fire. */
  touch(): void;
  /** "Where I left off" note: persisted value, local draft, save on blur. */
  note: {
    /** The persisted note (`project.note ?? ""`). */
    value: string;
    /** Local edit state — seeded from `value`, re-seeded when the persisted
     * note changes or the provider is reused across paths (the in-component
     * equivalent of a keyed remount on path). */
    draft: string;
    setDraft(value: string): void;
    /** `projects.setNote(draft)` unless unchanged; invalidates the scan. */
    save(): void;
  };
  /** The ONE cached commit-log entry (limit 200) shared by pulse, heatmap,
   * graph and table widgets. */
  commitLog: CommitLogQueryResult;
  /** The shared web IDE (ADRs 0003/0004): polled status + open choreography. */
  ide: {
    /** Server status; polls 5 s only while installing or starting. */
    status: IdeQueryResult;
    /** Intent-ref choreography: pops the tab synchronously in the click,
     * hands it the URL when the port appears (or toasts an actionable
     * "IDE ready"), fails loudly when the install fails. */
    open(): void;
    /** True while the open mutation (server start) is in flight. */
    starting: boolean;
    /** "Installing IDE… (42 %)" while downloading/extracting; else null. */
    installingLabel: string | null;
  };
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

/**
 * Throwing accessor (§3.4 enforcement a) — widgets require the provider;
 * a null-default context turns a missing mount into a loud error instead
 * of silently undefined data.
 */
export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (ctx === null) {
    throw new Error(
      "ProjectProvider missing — a widget requires it, but no ProjectProvider is mounted above. Mount the project provider stack (settings > project) around the page.",
    );
  }
  return ctx;
}

export function ProjectProvider({
  path,
  children,
}: {
  path: string;
  children: ReactNode;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Same cache entries the nested WorkspaceProvider (and the dashboard)
  // observe — react-query dedupes the observers underneath.
  const scan = useScanQuery();
  const project = scan.data?.projects.find((p) => p.path === path) ?? null;

  // THE clock — same rule as Workspace, computed locally because this
  // provider sits ABOVE the WorkspaceProvider it mounts.
  const now = scan.dataUpdatedAt || Date.now();

  const commitLog = useCommitLogQuery(path, COMMIT_LOG_LIMIT);

  // Every store-touching op (git quintet, note, touch) settles the scan and
  // the commit log together so counts, branches and graphs agree.
  const invalidateProjectData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.projects.scan.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.projects.commitLog.queryKey(),
      }),
    ]);
  }, [queryClient, trpc]);

  // --- The git quintet -----------------------------------------------------
  const fetchMutation = useMutation(
    trpc.projects.fetchRemote.mutationOptions({
      onSuccess: async (data) => {
        await invalidateProjectData();
        toast.success(data.message || "Fetched.");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const pullMutation = useMutation(
    trpc.projects.pull.mutationOptions({
      onSuccess: async (data) => {
        await invalidateProjectData();
        toast.success(data.message || "Already up to date.");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const pushMutation = useMutation(
    trpc.projects.push.mutationOptions({
      onSuccess: async (data) => {
        await invalidateProjectData();
        toast.success(data.message || "Pushed.");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const fetchBranchMutation = useMutation(
    trpc.projects.fetchBranch.mutationOptions({
      onSuccess: async (data) => {
        await invalidateProjectData();
        toast.success(data.message || "Branch fetched.");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const switchBranchMutation = useMutation(
    trpc.projects.switchBranch.mutationOptions({
      onSuccess: async (data) => {
        await invalidateProjectData();
        toast.success(data.message || "Switched.");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const git = useMemo(
    () => ({
      busy:
        fetchMutation.isPending ||
        pullMutation.isPending ||
        pushMutation.isPending ||
        fetchBranchMutation.isPending ||
        switchBranchMutation.isPending,
      diverged:
        (project?.git.ahead ?? 0) > 0 && (project?.git.behind ?? 0) > 0,
      fetchRemote: projectGitAction(path, fetchMutation),
      pull: projectGitAction(path, pullMutation),
      push: projectGitAction(path, pushMutation),
      fetchBranch: projectBranchAction(path, fetchBranchMutation),
      switchBranch: projectBranchAction(path, switchBranchMutation),
    }),
    [
      path,
      project,
      fetchMutation,
      pullMutation,
      pushMutation,
      fetchBranchMutation,
      switchBranchMutation,
    ],
  );

  // --- Open / note / touch --------------------------------------------------
  const openMutation = useMutation(
    trpc.projects.open.mutationOptions({
      onSuccess: (data) => toast.success(data.message),
      onError: (e) => toast.error(e.message),
    }),
  );

  const noteMutation = useMutation(
    trpc.projects.setNote.mutationOptions({
      onSuccess: () => {
        void invalidateProjectData();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const touchMutation = useMutation(
    trpc.projects.touchLastOpened.mutationOptions({
      onSuccess: () => {
        void invalidateProjectData();
      },
    }),
  );

  // Touch once: the ref guard fires exactly one `touchLastOpened` per path
  // per mount, regardless of how often the scan refetches.
  const touchedPath = useRef<string | null>(null);
  const projectPath = project?.path ?? null;
  const touch = useCallback(() => {
    touchMutation.mutate({ path });
  }, [path, touchMutation]);
  useEffect(() => {
    if (projectPath === null || touchedPath.current === projectPath) return;
    touchedPath.current = projectPath;
    touchMutation.mutate({ path: projectPath });
  }, [projectPath, touchMutation]);

  const open = useCallback(
    (target: "editor" | "terminal" | "folder") => {
      openMutation.mutate({ path, target });
    },
    [openMutation, path],
  );

  const copyPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(path);
      toast.success("Path copied");
    } catch {
      toast.error("Couldn't copy path");
    }
  }, [path]);

  // The draft seeds from the persisted note and re-seeds when the persisted
  // value changes (save, external edit) or the provider instance is reused
  // across paths — never mid-keystroke from an unrelated scan refetch.
  const noteValue = project?.note ?? "";
  const [noteDraft, setNoteDraft] = useState(noteValue);
  useEffect(() => {
    setNoteDraft(noteValue);
  }, [path, noteValue]);

  const saveNote = useCallback(() => {
    if (noteDraft === (project?.note ?? "")) return;
    noteMutation.mutate({ path, note: noteDraft });
  }, [noteDraft, noteMutation, path, project]);

  // --- IDE choreography -----------------------------------------------------
  const ideOpening = useRef(false);
  const ideTab = useRef<Window | null>(null);
  const ide = useIdeStatusQuery(ideOpening);

  const ideOpenMutation = useMutation(
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

  // The follow-through: while the intent ref is set, watch the polled status
  // — hand the popped tab its URL when the port appears, fail loudly when
  // the install fails, and otherwise (installed, idle) fire the start.
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
    } else if (s.installed && !ideOpenMutation.isPending) {
      ideOpenMutation.mutate({ path });
    }
  }, [ide.data, ideOpenMutation, path]);

  // If the page dies mid-start, close the placeholder tab we popped.
  useEffect(
    () => () => {
      if (ideOpening.current) ideTab.current?.close();
      ideTab.current = null;
    },
    [],
  );

  const openIde = useCallback(() => {
    const s = ide.data;
    if (s !== undefined && s.running && s.port !== null) {
      window.open(ideUrl(s.port, path), "_blank", "noopener");
      return;
    }
    // Opened synchronously in the click — popup blockers only permit
    // window.open during a user gesture.
    ideTab.current = window.open("", "_blank");
    ideOpening.current = true;
    ideOpenMutation.mutate({ path });
  }, [ide.data, ideOpenMutation, path]);

  const value = useMemo<ProjectContextValue>(
    () => ({
      path,
      project,
      now,
      git,
      open,
      copyPath,
      touch,
      note: {
        value: noteValue,
        draft: noteDraft,
        setDraft: setNoteDraft,
        save: saveNote,
      },
      commitLog,
      ide: {
        status: ide,
        open: openIde,
        starting: ideOpenMutation.isPending,
        installingLabel:
          ide.data !== undefined &&
          (ide.data.install.phase === "downloading" ||
            ide.data.install.phase === "extracting")
            ? installingLabel(ide.data.install)
            : null,
      },
    }),
    [
      path,
      project,
      now,
      git,
      open,
      copyPath,
      touch,
      noteValue,
      noteDraft,
      saveNote,
      commitLog,
      ide,
      openIde,
      ideOpenMutation.isPending,
    ],
  );

  return (
    <ProjectContext.Provider value={value}>
      {/* Provider stamp (§3.4): this provider's own lower-case key on its
          root; WorkspaceProvider is nested below (ruling 3) and adds its
          own, so the page's full mount order is legible from the DOM. */}
      <div data-providers="project">
        <WorkspaceProvider>{children}</WorkspaceProvider>
      </div>
    </ProjectContext.Provider>
  );
}
