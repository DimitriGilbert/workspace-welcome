import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Layers, Loader2, Plus, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@workspace-welcome/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace-welcome/ui/components/dialog";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";
import { Textarea } from "@workspace-welcome/ui/components/textarea";

import {
  DEFAULT_RECONCILER_MODEL,
  DEFAULT_STEP_MODELS,
} from "@workspace-welcome/api/lib/ideation/shared";

import { useTRPC } from "@/utils/trpc";
import { relativeTime } from "@/lib/format";
import {
  ideationScaffoldSeedKey,
  readIdeationScaffoldSeed,
} from "@/lib/ideation-seed";
import { IdeationCandidatesDrawer } from "@/components/ideation/ideation-candidates-drawer";
import { IdeationChatView } from "@/components/ideation/ideation-chat-view";
import { IdeationModelPicker } from "@/components/ideation/ideation-model-picker";

import type {
  IdeationArtifactKind,
  IdeationModelSet,
} from "@workspace-welcome/api/lib/ideation/shared";

/**
 * The ideation panel (PRD §3): the section between Note and Files on the
 * project page. Owns the tRPC control plane — session lifecycle (start /
 * get / list), the candidates drawer, and the write-once save flow — while
 * IdeationChatView owns the SSE wire. Disk is the source of truth: phase and
 * transcript are derived from session.get, and every settled turn refetches
 * it. Sessions survive restarts under .ideadump/, so the newest one
 * auto-resumes on mount until the user asks for a fresh one.
 */

/** The write-once docs/ targets, per artifact kind (session.ts's map). */
const ARTIFACT_LABELS: Record<IdeationArtifactKind, string> = {
  prd: "docs/PRD.md",
  plan: "docs/PLAN.md",
};

export interface IdeationPanelProps {
  /** Absolute project path — the page's splat, as every other section gets it. */
  project: string;
  /**
   * Deep-link flag from the create-success toast (`?ideation=new`, PRD §3):
   * forces the fresh-session idea form and suppresses the one-time
   * auto-resume of the newest session.
   */
  startNew?: boolean;
}

export function IdeationPanel({ project, startNew = false }: IdeationPanelProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  /** Suppresses the one-time auto-resume once the user asks for a fresh session. */
  const [choseNew, setChoseNew] = useState(() => startNew);
  /**
   * Draft model set for the next session — the picker's value (PRD §3),
   * frozen into session.json server-side at start. Seeded from the
   * client-safe constants so the picker has a value before Settings
   * resolve; settings.get exposes the ideation block directly, so its
   * values take over once they land (identical in the normal case).
   */
  const [modelSet, setModelSet] = useState<IdeationModelSet>(() => ({
    questions: [...DEFAULT_STEP_MODELS.questions],
    prd: [...DEFAULT_STEP_MODELS.prd],
    plan: [...DEFAULT_STEP_MODELS.plan],
    reconciler: DEFAULT_RECONCILER_MODEL,
  }));
  /** Guards the settings sync against clobbering an explicit user pick. */
  const modelsTouchedRef = useRef(false);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ideaDraft, setIdeaDraft] = useState("");
  /** Frozen context summary of the session this mount started (start's return). */
  const [contextSummary, setContextSummary] = useState<string | null>(null);
  /** Write-once guard: non-empty collisions wait here for an explicit overwrite. */
  const [collisionPrompt, setCollisionPrompt] = useState<{
    kinds: IdeationArtifactKind[];
    collisions: string[];
  } | null>(null);
  const [gitignoreNote, setGitignoreNote] = useState(false);
  const autoResumedRef = useRef(false);

  const sessionsQuery = useQuery(
    trpc.ideation.sessions.list.queryOptions({ path: project }),
  );
  const sessionQuery = useQuery(
    trpc.ideation.session.get.queryOptions(
      { path: project, sessionId: activeSessionId ?? "" },
      { enabled: activeSessionId !== null },
    ),
  );
  const settingsQuery = useQuery(trpc.settings.get.queryOptions());
  const session = sessionQuery.data ?? null;
  const sessions = sessionsQuery.data ?? [];

  // Settings own the picker's default (PRD §4.5): adopt the stored ideation
  // block once it resolves, unless the user already picked by hand.
  useEffect(() => {
    const ideation = settingsQuery.data?.ideation;
    if (ideation === undefined || modelsTouchedRef.current) return;
    setModelSet({
      questions: [...ideation.models.questions],
      prd: [...ideation.models.prd],
      plan: [...ideation.models.plan],
      reconciler: ideation.reconciler,
    });
  }, [settingsQuery.data]);

  // Resume the newest session once (reload-mid-interview restores transcript
  // and phase, PRD criterion 3) — unless the user explicitly wants a new one.
  useEffect(() => {
    if (autoResumedRef.current || choseNew || activeSessionId !== null) return;
    if (sessionsQuery.data === undefined) return;
    autoResumedRef.current = true;
    const newest = sessionsQuery.data[0];
    if (newest !== undefined) setActiveSessionId(newest.id);
  }, [sessionsQuery.data, choseNew, activeSessionId]);

  // A session that vanished from disk (directory removed) falls back to the
  // idea form instead of an eternal skeleton.
  useEffect(() => {
    if (activeSessionId !== null && sessionQuery.isSuccess && session === null) {
      setActiveSessionId(null);
    }
  }, [activeSessionId, sessionQuery.isSuccess, session]);

  /** Refetch disk truth after a settled turn (RUN_FINISHED / phase errors). */
  const refreshFromDisk = useCallback(() => {
    if (activeSessionId === null) return;
    void queryClient.invalidateQueries({
      queryKey: trpc.ideation.session.get.queryKey({
        path: project,
        sessionId: activeSessionId,
      }),
    });
    void queryClient.invalidateQueries({
      queryKey: trpc.ideation.sessions.list.queryKey({ path: project }),
    });
  }, [activeSessionId, project, queryClient, trpc]);

  const startMutation = useMutation(
    trpc.ideation.session.start.mutationOptions({
      onSuccess: async (data) => {
        setActiveSessionId(data.sessionId);
        setContextSummary(data.contextSummary);
        setGitignoreNote(false);
        // Seed consumed (PRD §3): the durable copy is now frozen inside
        // session.json, so drop the handoff — a reload must not re-seed a
        // later session with the wizard's input.
        sessionStorage.removeItem(ideationScaffoldSeedKey(project));
        await queryClient.invalidateQueries({
          queryKey: trpc.ideation.sessions.list.queryKey({ path: project }),
        });
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  /** Artifact kinds whose merged output exists on disk and can be saved. */
  const savableKinds = useMemo<IdeationArtifactKind[]>(() => {
    if (session === null) return [];
    const kinds: IdeationArtifactKind[] = [];
    if (session.phase === "planning" || session.phase === "done") kinds.push("prd");
    if (session.phase === "done") kinds.push("plan");
    return kinds;
  }, [session]);

  const saveMutation = useMutation(
    trpc.ideation.artifacts.save.mutationOptions({
      onSuccess: async (result, variables) => {
        // Write-once (PRD §7): collisions come back instead of writes — the
        // confirm dialog is the only path to a retry with overwrite.
        if (result.collisions.length > 0) {
          setCollisionPrompt({
            kinds: variables.artifacts,
            collisions: result.collisions,
          });
          return;
        }
        setCollisionPrompt(null);
        if (result.gitignoreAppended) setGitignoreNote(true);
        if (result.written.length > 0) {
          toast.success(`Saved ${result.written.join(", ")}`);
        }
        await refreshFromDisk();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const startSession = () => {
    const idea = ideaDraft.trim();
    if (idea === "" || startMutation.isPending) return;
    // The wizard seed this tab parked for the project, if any (deep-link
    // flow, PRD §3) — rides along and is persisted server-side at start.
    const seed = readIdeationScaffoldSeed(project);
    startMutation.mutate({
      path: project,
      idea,
      models: modelSet,
      scaffoldInput: seed === null ? undefined : seed,
    });
  };

  const handleModelsChange = useCallback((next: IdeationModelSet) => {
    modelsTouchedRef.current = true;
    setModelSet(next);
  }, []);

  const newSession = useCallback(() => {
    setActiveSessionId(null);
    setChoseNew(true);
    setIdeaDraft("");
    setContextSummary(null);
    setGitignoreNote(false);
    setCollisionPrompt(null);
  }, []);

  // ?ideation=new forces the fresh-session form: the lazy choseNew
  // initializer covers mount time (the toast's navigation remounts the
  // route), this effect the rarer same-route URL edit. The choseNew guard
  // keeps it one-shot — a lingering startNew must never wipe an in-progress
  // draft on unrelated re-renders.
  useEffect(() => {
    if (!startNew || choseNew) return;
    newSession();
  }, [startNew, choseNew, newSession]);

  const resumeSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setContextSummary(null);
    setGitignoreNote(false);
    setCollisionPrompt(null);
  };

  return (
    // The id is the deep-link anchor: ?ideation=new scrolls here (PRD §3).
    <section id="ideation" className="mt-4 border border-foreground/10 p-3">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <span className="font-mono text-[0.65rem] text-muted-foreground">
          ideation{session !== null ? ` · ${session.phase}` : ""}
        </span>
        <div className="flex items-center gap-1">
          {activeSessionId !== null ? (
            <>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setDrawerOpen(true)}
              >
                <Layers className="size-3" /> candidates
              </Button>
              <Button variant="ghost" size="xs" onClick={newSession}>
                <Plus className="size-3" /> new
              </Button>
            </>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand ideation panel" : "Collapse ideation panel"}
          >
            <ChevronDown
              className={`size-3.5 transition-transform ${collapsed ? "" : "rotate-180"}`}
            />
          </Button>
        </div>
      </div>

      {collapsed ? null : activeSessionId === null ? (
        <div className="mt-2 flex min-w-0 flex-col gap-2">
          <Textarea
            value={ideaDraft}
            onChange={(e) => setIdeaDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                startSession();
              }
            }}
            rows={2}
            placeholder="What are you building?"
          />
          {/* Model choice for the session being composed — frozen into
              session.json at start, so later settings changes never rewrite
              it (PRD §4.5). No step prop: there is no session yet, so the
              simple solo picker is the relevant mode. */}
          <IdeationModelPicker value={modelSet} onChange={handleModelsChange} />
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[0.65rem] text-muted-foreground/70">
              grill → prd → plan → docs/
            </span>
            <Button
              size="sm"
              onClick={startSession}
              disabled={ideaDraft.trim() === "" || startMutation.isPending}
            >
              {startMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              Start
            </Button>
          </div>
          {sessionsQuery.isLoading ? (
            <div className="mt-2 flex flex-col gap-1.5">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : sessionsQuery.isError ? (
            <p
              className="mt-2 text-[0.7rem] leading-relaxed"
              style={{ color: "var(--sev-error)" }}
            >
              {sessionsQuery.error.message}
            </p>
          ) : sessions.length > 0 ? (
            <div className="mt-2 flex min-w-0 flex-col gap-1.5">
              <span className="font-mono text-[0.65rem] text-muted-foreground">
                resume
              </span>
              {sessions.map((summary) => (
                <button
                  key={summary.id}
                  type="button"
                  onClick={() => resumeSession(summary.id)}
                  className="flex min-w-0 items-center gap-2 border border-foreground/10 px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
                >
                  <span className="shrink-0 font-mono text-[0.65rem] text-muted-foreground">
                    {summary.phase}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {summary.idea}
                  </span>
                  <span className="shrink-0 font-mono text-[0.65rem] text-muted-foreground/70">
                    {relativeTime(summary.updatedAt)}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : sessionQuery.isError ? (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-[0.7rem] leading-relaxed" style={{ color: "var(--sev-error)" }}>
            {sessionQuery.error.message}
          </p>
          <div>
            <Button variant="outline" size="xs" onClick={() => void sessionQuery.refetch()}>
              Retry
            </Button>
          </div>
        </div>
      ) : session === null ? (
        <div className="mt-2 flex flex-col gap-2">
          <Skeleton className="h-[24rem]" />
        </div>
      ) : (
        <>
          <IdeationChatView
            key={activeSessionId}
            project={project}
            sessionId={activeSessionId}
            session={session}
            contextSummary={contextSummary}
            onSessionDiskChanged={refreshFromDisk}
          />
          {savableKinds.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-foreground/10 pt-2">
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-mono text-[0.65rem] text-muted-foreground">
                  {savableKinds.map((kind) => ARTIFACT_LABELS[kind]).join(" · ")}
                </span>
                {gitignoreNote ? (
                  <span className="text-[0.65rem] text-muted-foreground/70">
                    added .ideadump/ to .gitignore
                  </span>
                ) : null}
              </div>
              <Button
                size="sm"
                disabled={saveMutation.isPending}
                onClick={() =>
                  saveMutation.mutate({
                    path: project,
                    sessionId: activeSessionId,
                    artifacts: savableKinds,
                  })
                }
              >
                {saveMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                Save to project
              </Button>
            </div>
          ) : null}
        </>
      )}

      <IdeationCandidatesDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        project={project}
        sessionId={activeSessionId}
      />

      <Dialog
        open={collisionPrompt !== null}
        onOpenChange={(open) => {
          if (!open) setCollisionPrompt(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Overwrite existing files?</DialogTitle>
            <DialogDescription>
              {collisionPrompt?.collisions.join(", ")} already exist. Overwriting
              replaces their contents with this session&apos;s merged output —
              this cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCollisionPrompt(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={saveMutation.isPending}
              onClick={() => {
                if (collisionPrompt === null || activeSessionId === null) return;
                saveMutation.mutate({
                  path: project,
                  sessionId: activeSessionId,
                  artifacts: collisionPrompt.kinds,
                  overwrite: true,
                });
              }}
            >
              {saveMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              Overwrite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
