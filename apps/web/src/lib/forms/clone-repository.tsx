import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FolderPlus, Loader2 } from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";
import { useFormedible } from "@workspace-welcome/ui/components/formedible/hooks/use-formedible";
import type { FormedibleFieldConfig } from "@workspace-welcome/ui/components/formedible/lib/types";
import {
  buildCloneCommand,
  cloneDefaults,
  cloneInputSchema,
  deriveRepoName,
  normalizeCloneInput,
} from "@workspace-welcome/api/lib/clone-options";
import type { CloneInput } from "@workspace-welcome/api/lib/clone-options";
import type { CloneJobSnapshot } from "@workspace-welcome/api/lib/clone-job";
import type { Root } from "@workspace-welcome/api/lib/types";

import { useTRPC } from "@/utils/trpc";
import { JobError, formatElapsed } from "@/lib/forms/create-project";

export type CloneFormValues = CloneInput;

export type CloneResult = NonNullable<CloneJobSnapshot["result"]>;

/**
 * The clone tab's field configuration for the given registered roots. A
 * single page — four fields don't warrant a wizard — but everything else
 * keeps the create-project form's idioms: config-driven formedible fields
 * (no per-field JSX), validation through the shared node-free
 * `cloneInputSchema`, and the equivalent-command preview built from the same
 * `buildCloneCommand` the server reports back.
 *
 * `url` is deliberately `type: "text"`: formedible's built-in `url` format
 * check rejects git's scp-like `git@host:owner/repo` remotes; the schema's
 * grammar refinement is the real validation.
 */
export function buildCloneFormFields(
  roots: Root[],
): readonly FormedibleFieldConfig<CloneFormValues>[] {
  return [
    {
      name: "url",
      type: "text",
      label: "Repository URL",
      description: "SSH or HTTPS remote to clone from.",
      placeholder: "git@github.com:owner/repo.git",
      required: true,
      maxLength: 400,
    },
    {
      name: "branch",
      type: "text",
      label: "Branch",
      description: "Checked out after the clone; all branches are fetched.",
      placeholder: "Leave empty for the default branch",
      maxLength: 200,
    },
    {
      name: "root",
      type: "select",
      label: "Root directory",
      required: true,
      options: roots.map((root) => ({
        value: root.path,
        label: root.label === root.path ? root.path : `${root.label} · ${root.path}`,
      })),
    },
    {
      name: "directoryName",
      type: "text",
      label: "Directory name",
      description: "Created under the selected root.",
      placeholder: "repo",
      required: true,
      maxLength: 100,
    },
  ];
}

export interface UseCloneRepositoryFormOptions {
  /** Registered roots; the first one seeds the default root selection. */
  roots: Root[];
  /**
   * Fired when `clone.start` accepted the job. The command is the frozen
   * equivalent-command preview of the submitted (normalized) values, for the
   * job progress view.
   */
  onJobStarted: (jobId: string, command: string) => void;
  /**
   * Fired when `clone.start` rejects — including the single-flight
   * BAD_REQUEST. The message is also surfaced inline by `CloneFormBody`.
   */
  onError: (message: string) => void;
}

/**
 * The clone-from-git form wiring: a single-page formedible form whose submit
 * runs `clone.start` and hands the accepted job to `onJobStarted`. The
 * directory name seeds itself from the URL's repo segment and keeps
 * following the URL until the user edits it — the classic derived-until-
 * edited input, applied through `form.setFieldValue` (which does not run
 * formOptions.onChange, hence the mirrored setValues call, same footgun as
 * the scaffold form's reconcile effect). Container-independent: renders
 * nothing.
 */
export function useCloneRepositoryForm({
  roots,
  onJobStarted,
  onError,
}: UseCloneRepositoryFormOptions) {
  const trpc = useTRPC();
  const start = useMutation(trpc.clone.start.mutationOptions());
  const [startError, setStartError] = useState<string | null>(null);
  const initialValues = useMemo<CloneFormValues>(
    () => ({ ...cloneDefaults, root: roots[0]?.path ?? "" }),
    [roots],
  );
  // Mirror of the form values, fed by formOptions.onChange, so the live
  // command preview can render outside <Form /> without re-subscribing to the
  // TanStack store.
  const [values, setValues] = useState<CloneFormValues>(initialValues);
  const fields = useMemo(() => buildCloneFormFields(roots), [roots]);

  const { Form, form } = useFormedible<CloneFormValues>({
    fields,
    schema: cloneInputSchema,
    submitLabel: "Clone repository",
    // Keep the submitted values: containers switch to the job view on submit
    // and re-show this same form instance if the job fails.
    resetOnSubmitSuccess: false,
    formOptions: {
      defaultValues: initialValues,
      onChange: ({ value }) => setValues(value),
      onSubmit: async ({ value }) => {
        const input = normalizeCloneInput(value);
        try {
          const { jobId } = await start.mutateAsync(input);
          setStartError(null);
          onJobStarted(jobId, buildCloneCommand(input));
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : "Failed to start the clone job.";
          setStartError(message);
          onError(message);
        }
      },
    },
  });

  // Derived-until-edited directory name: while the field is empty or still
  // holds the previous derivation, it follows the URL's repo segment; the
  // moment the user types something of their own, it stops following.
  const lastDerivedNameRef = useRef("");
  useEffect(() => {
    const derived = deriveRepoName(values.url);
    const previous = lastDerivedNameRef.current;
    if (derived === previous) return;
    const follows =
      values.directoryName === "" || values.directoryName === previous;
    lastDerivedNameRef.current = derived;
    if (!follows) return;
    form.setFieldValue("directoryName", derived);
    setValues((v) => ({ ...v, directoryName: derived }));
  }, [values.url, values.directoryName, form]);

  const command = buildCloneCommand(normalizeCloneInput(values));

  return { Form, form, values, command, startError };
}

/**
 * Rendered body of the clone form: the inline start-error banner, the
 * scrollable form, and the pinned equivalent-command preview. Pairs with
 * `CloneJobView`; containers typically swap between the two.
 */
export function CloneFormBody({
  roots,
  onJobStarted,
  onError,
}: UseCloneRepositoryFormOptions) {
  const { Form, command, startError } = useCloneRepositoryForm({
    roots,
    onJobStarted,
    onError,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {startError !== null ? (
        <div
          role="alert"
          className="border-b border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive"
        >
          {startError}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Form className="px-4 py-4" />
      </div>
      {/* Plain flex sibling of the scroll region (not sticky inside it), so
          the preview is always visible yet can never cover a field. */}
      <div className="border-t border-foreground/10 bg-popover px-4 py-3">
        <span className="text-xs font-medium">Equivalent command</span>
        <pre className="mt-1 overflow-x-auto rounded-none border border-foreground/10 bg-muted/30 p-3 font-mono text-[0.7rem] leading-relaxed whitespace-pre-wrap break-all">
          {command}
        </pre>
        <p className="mt-1 text-[0.7rem] text-muted-foreground">
          What the server runs for you — paste it in a terminal to reproduce
          the same clone by hand.
        </p>
      </div>
    </div>
  );
}

export interface UseCloneRepositoryJobOptions {
  /** The job id returned by `clone.start`. */
  jobId: string;
  /**
   * Fired once when the tracked job reaches status "success", with the job's
   * `CloneResult` (project directory, reproducible command, elapsed time).
   */
  onSuccess: (result: CloneResult) => void;
  /**
   * Fired once for every surfaced failure: a job that ended in status
   * "error", and a job lost to a server restart (the registry is in-memory).
   */
  onError: (message: string) => void;
  /** Fired after the success callback; containers typically close here. */
  onClose: () => void;
}

/**
 * Tracks a clone job: polls `clone.job` once per second while the job is
 * running, keeps a one-second progress clock (`now`) alive only while
 * running, auto-scrolls the log tail element (`logRef`), and fires the
 * settle callbacks exactly once per job (`handledRef`). Render nothing with
 * it — pair it with `CloneJobView` for the standard presentation.
 */
export function useCloneRepositoryJob({
  jobId,
  onSuccess,
  onError,
  onClose,
}: UseCloneRepositoryJobOptions) {
  const trpc = useTRPC();
  const job = useQuery(
    trpc.clone.job.queryOptions(
      { jobId },
      {
        // Function form: poll only while running, so a settled (or unknown)
        // job stops the interval instead of polling forever.
        refetchInterval: (query) =>
          query.state.data?.status === "running" ? 1000 : false,
      },
    ),
  );
  const handledRef = useRef(false);
  const logRef = useRef<HTMLDivElement | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const snap = job.data;
  const isRunning = snap?.status === "running";

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  useEffect(() => {
    const el = logRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [snap?.logTail]);

  useEffect(() => {
    if (snap === undefined || handledRef.current) return;
    if (snap === null) {
      // Covers both a null after "running" was observed and a job id the
      // restarted server never knew: either way the in-memory registry is
      // gone and the job cannot be tracked further.
      handledRef.current = true;
      onError("Clone job lost — the server probably restarted.");
      return;
    }
    if (snap.status === "running") return;
    handledRef.current = true;
    if (snap.status === "success") {
      if (snap.result !== undefined) onSuccess(snap.result);
      onClose();
      return;
    }
    onError(snap.error ?? "Cloning failed.");
  }, [snap, onError, onSuccess, onClose]);

  return { job, snap, isRunning, now, logRef };
}

export interface CloneJobViewProps {
  jobId: string;
  /** Frozen equivalent-command of the submitted values. */
  command: string;
  /** Fired once when the tracked job reaches status "success". */
  onSuccess: (result: CloneResult) => void;
  /** Fired once for a job that errored or was lost to a server restart. */
  onError: (message: string) => void;
  /** "Back to form" — discards the tracked job and re-shows the form. */
  onDismiss: () => void;
  /** Fired after the success callback; containers typically close here. */
  onClose: () => void;
}

/**
 * The clone job progress view: elapsed time, frozen command, live clone-log
 * tail, and the terminal states (unreachable server, lost job, failure,
 * success). The stateful half lives in `useCloneRepositoryJob`.
 */
export function CloneJobView({
  jobId,
  command,
  onSuccess,
  onError,
  onDismiss,
  onClose,
}: CloneJobViewProps) {
  const { job, snap, now, logRef } = useCloneRepositoryJob({
    jobId,
    onSuccess,
    onError,
    onClose,
  });

  if (job.isError) {
    return (
      <JobError
        title="Couldn't reach the server"
        message={
          job.error instanceof Error
            ? job.error.message
            : "The clone job status could not be fetched."
        }
        onDismiss={onDismiss}
      />
    );
  }

  if (snap === undefined) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <p className="text-sm">Checking clone job…</p>
      </div>
    );
  }

  if (snap === null) {
    return (
      <JobError
        title="Clone job lost"
        message="The server probably restarted while the job was running — its job registry is in-memory. A partial clone is removed on ordinary failures, but a restart can outrun that cleanup: check the target directory before retrying."
        onDismiss={onDismiss}
      />
    );
  }

  if (snap.status === "error") {
    return (
      <JobError
        title="Cloning failed"
        message={snap.error ?? "Cloning failed."}
        onDismiss={onDismiss}
      />
    );
  }

  if (snap.status === "success") {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-muted-foreground">
        <p className="text-sm font-medium text-foreground">
          Repository cloned — closing…
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        Cloning repository
        <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
          {formatElapsed(now - snap.startedAt)}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium">Command</span>
        <pre className="overflow-x-auto rounded-none border border-foreground/10 bg-muted/30 p-3 font-mono text-[0.7rem] leading-relaxed whitespace-pre-wrap break-all">
          {command}
        </pre>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium">Clone log</span>
        <div
          ref={logRef}
          className="max-h-64 overflow-y-auto rounded-none border border-foreground/10 bg-muted/30 p-3 font-mono text-[0.7rem] leading-relaxed"
        >
          {snap.logTail.length === 0 ? (
            <span className="text-muted-foreground">No output yet.</span>
          ) : (
            snap.logTail.map((line, index) => (
              <div key={index} className="whitespace-pre-wrap break-all">
                {line}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export interface CloneRepositoryFlowProps {
  /**
   * Container visibility. While false, tracked job state resets so a flow
   * kept mounted inside hidden chrome never replays a settled job's
   * callbacks on reopen; containers that unmount the flow while closed are
   * unaffected.
   */
  open: boolean;
  /**
   * Fired once when the tracked job reaches status "success"; the flow then
   * asks the container to close through `onClose`. The caller owns toasts
   * and the `projects.scan` invalidation.
   */
  onSuccess?: (result: CloneResult) => void;
  /**
   * Fired for every surfaced failure: a rejected `clone.start` (including
   * the single-flight BAD_REQUEST), a job that ended in status "error", and
   * a job lost to a server restart. The message is also shown inline.
   */
  onError?: (message: string) => void;
  /**
   * Fired when the flow has zero registered roots and the user asks to add
   * one; the caller typically closes its container and opens the
   * add-directory flow.
   */
  onRequestAddRoot?: () => void;
  /**
   * Fired after a successful job settled (post `onSuccess`): the flow resets
   * to the form and the container should close. Never fired on failures —
   * those stay open with a "Back to form" affordance.
   */
  onClose?: () => void;
}

/**
 * The complete clone-from-git flow, free of container chrome: root-directory
 * gating (loading, error + retry, empty state), the single-page formedible
 * form with its live equivalent-command preview, and the clone job progress
 * view. While a job runs the form stays mounted but hidden so its values
 * survive the back-to-form path. Any container can mount it; visibility,
 * titles, and toasts stay the container's business.
 */
export function CloneRepositoryFlow({
  open,
  onSuccess,
  onError,
  onRequestAddRoot,
  onClose,
}: CloneRepositoryFlowProps) {
  const trpc = useTRPC();
  const rootsQuery = useQuery(trpc.roots.list.queryOptions());
  // While set, the flow shows the job progress view; the command is the
  // frozen preview of the submitted values.
  const [job, setJob] = useState<{ id: string; command: string } | null>(null);

  // For containers that keep the flow mounted while closed: without this
  // reset, a remounted job view on reopen would replay the settled job's
  // callbacks. Unmounting containers reset for free.
  useEffect(() => {
    if (!open) setJob(null);
  }, [open]);

  const handleJobStarted = useCallback(
    (jobId: string, command: string) => setJob({ id: jobId, command }),
    [],
  );
  const handleSuccess = useCallback(
    (result: CloneResult) => onSuccess?.(result),
    [onSuccess],
  );
  const handleError = useCallback(
    (message: string) => onError?.(message),
    [onError],
  );
  const handleDismiss = useCallback(() => setJob(null), []);
  const handleClose = useCallback(() => {
    setJob(null);
    onClose?.();
  }, [onClose]);

  const roots = rootsQuery.data;

  return (
    <>
      {/* The form stays mounted (hidden) while a job runs so its values
          survive the back-to-form path. The body is a flex column whose
          scrollable region ends above the pinned command preview — a sticky
          footer inside the scroll area floats over and swallows clicks on the
          fields, so it must never overlap the scrolling content. */}
      <div className={job === null ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
        {rootsQuery.isPending ? (
          <div className="flex flex-col items-center gap-3 p-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <p className="text-sm">Loading directories…</p>
          </div>
        ) : roots === undefined ? (
          <div className="flex flex-col items-center gap-3 p-8 text-muted-foreground">
            <p className="text-sm">Couldn't load root directories.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => rootsQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : roots.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-4">
            <div className="w-full rounded-none border border-dashed p-6 text-center text-xs text-muted-foreground">
              No root directories registered yet. Register a root directory
              first — repositories are cloned inside one.
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRequestAddRoot?.()}
            >
              <FolderPlus className="size-3.5" /> Add a root directory
            </Button>
          </div>
        ) : (
          <CloneFormBody
            roots={roots}
            onJobStarted={handleJobStarted}
            onError={handleError}
          />
        )}
      </div>
      {job !== null ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <CloneJobView
            jobId={job.id}
            command={job.command}
            onSuccess={handleSuccess}
            onError={handleError}
            onDismiss={handleDismiss}
            onClose={handleClose}
          />
        </div>
      ) : null}
    </>
  );
}
