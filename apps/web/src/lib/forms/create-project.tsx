import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, FolderPlus, Loader2 } from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";
import { useFormedible } from "@workspace-welcome/ui/components/formedible/hooks/use-formedible";
import type {
  FormedibleFieldConfig,
  FormediblePageConfig,
} from "@workspace-welcome/ui/components/formedible/lib/types";
import {
  addonChoices,
  addonIncompatibilityReason,
  addonsExclusivity,
  reconciledFields,
  reconcileScaffoldInput,
  scaffoldDefaults,
  scaffoldInputSchema,
  scaffoldOptionLists,
} from "@workspace-welcome/api/lib/scaffold-options";
import type { ScaffoldInput } from "@workspace-welcome/api/lib/scaffold-options";
import type { ScaffoldJobSnapshot } from "@workspace-welcome/api/lib/scaffold";
import type { Root } from "@workspace-welcome/api/lib/types";

import { useTRPC } from "@/utils/trpc";
import {
  buildEquivalentCommand,
  normalizeScaffoldInput,
} from "@/lib/scaffold-command";

export type ScaffoldFormValues = ScaffoldInput;

export type ScaffoldResult = NonNullable<ScaffoldJobSnapshot["result"]>;

export const SCAFFOLD_FORM_PAGES: readonly FormediblePageConfig<ScaffoldFormValues>[] =
  [
    {
      page: 1,
      title: "Basics",
      description: "Where the project lives and what installs it.",
    },
    {
      page: 2,
      title: "Stack",
      description: "Frontends, backend, and the API layer.",
    },
    {
      page: 3,
      title: "Database",
      description: "Storage, ORM, and provisioning.",
    },
    {
      page: 4,
      title: "Deploy & extras",
      description: "Deployment targets, addons, and finishing touches.",
    },
  ];

/**
 * The wizard's field configuration for the given registered roots: built-in
 * formedible `pages`, function-valued `options`, `conditional` visibility —
 * no per-field JSX. All option lists, defaults, and the form schema come from
 * `@workspace-welcome/api/lib/scaffold-options` (single source of truth,
 * node-free for the browser).
 */
export function buildScaffoldFormFields(
  roots: Root[],
): readonly FormedibleFieldConfig<ScaffoldFormValues>[] {
  return [
    {
      name: "projectName",
      type: "text",
      label: "Project name",
      description: "Created as a new directory under the selected root.",
      placeholder: "my-app",
      required: true,
      maxLength: 100,
      page: 1,
    },
    {
      name: "root",
      type: "select",
      label: "Root directory",
      required: true,
      page: 1,
      options: roots.map((root) => ({
        value: root.path,
        label: root.label === root.path ? root.path : `${root.label} · ${root.path}`,
      })),
    },
    {
      name: "packageManager",
      type: "select",
      label: "Package manager",
      page: 1,
      options: scaffoldOptionLists.packageManager,
    },
    {
      name: "frontend",
      type: "select",
      label: "Web frontend",
      page: 2,
      options: scaffoldOptionLists.frontend,
    },
    // Native frontends additionally require Node ^22.13.0 || ^24.3.0 ||
    // >=26 when the package manager is not bun; this host runs v24.19.0,
    // which satisfies the range (same note as in the api scaffold lib).
    {
      name: "native",
      type: "select",
      label: "Native frontend",
      page: 2,
      options: scaffoldOptionLists.native,
    },
    {
      name: "backend",
      type: "select",
      label: "Backend",
      page: 2,
      options: (values) =>
        scaffoldOptionLists.backend.map((value) => {
          if (
            value === "self" &&
            !scaffoldOptionLists.fullstackFrontends.includes(values.frontend)
          ) {
            return {
              value,
              label: "self",
              description: `The fullstack backend only serves these frontends: ${scaffoldOptionLists.fullstackFrontends.join(", ")}.`,
              disabled: true,
            };
          }
          return value;
        }),
    },
    // Runtime and server deploy are hidden (and reconciled to "none") for
    // the backends that have no separate server; Workers exists for Hono.
    {
      name: "runtime",
      type: "select",
      label: "Runtime",
      description: "Runs the separate backend server.",
      page: 2,
      conditional: (values) =>
        values.backend !== "self" && values.backend !== "none",
      options: (values) => scaffoldOptionLists.runtimeByBackend[values.backend],
    },
    {
      name: "api",
      type: "select",
      label: "API",
      page: 2,
      conditional: (values) => values.backend !== "none",
      options: (values) => scaffoldOptionLists.apiByFrontend[values.frontend],
    },
    {
      name: "auth",
      type: "select",
      label: "Authentication",
      page: 2,
      conditional: (values) => values.backend !== "none",
      options: scaffoldOptionLists.auth,
    },
    {
      name: "database",
      type: "select",
      label: "Database",
      page: 3,
      conditional: (values) => values.backend !== "none",
      options: (values) =>
        scaffoldOptionLists.database.map((value) => {
          if (value === "mongodb" && values.runtime === "workers") {
            return {
              value,
              label: "mongodb",
              description:
                "Not available with the Cloudflare Workers runtime.",
              disabled: true,
            };
          }
          return value;
        }),
    },
    {
      name: "orm",
      type: "select",
      label: "ORM",
      page: 3,
      conditional: (values) => values.backend !== "none",
      options: (values) => scaffoldOptionLists.ormByDatabase[values.database],
    },
    {
      name: "dbSetup",
      type: "select",
      label: "Database setup",
      description: "Allowed setups depend on the database.",
      page: 3,
      conditional: (values) => values.backend !== "none",
      options: (values) =>
        scaffoldOptionLists.dbSetupByDatabase[values.database],
    },
    {
      name: "webDeploy",
      type: "select",
      label: "Web deploy",
      page: 4,
      options: scaffoldOptionLists.webDeploy,
    },
    {
      name: "serverDeploy",
      type: "select",
      label: "Server deploy",
      description: "Deploys the separate backend server.",
      page: 4,
      conditional: (values) =>
        values.backend !== "self" && values.backend !== "none",
      options: (values) =>
        scaffoldOptionLists.serverDeployByBackend[values.backend],
    },
    // Upstream only offers the payments prompt for better-auth projects.
    {
      name: "payments",
      type: "select",
      label: "Payments",
      page: 4,
      conditional: (values) =>
        values.backend !== "none" && values.auth === "better-auth",
      options: scaffoldOptionLists.payments,
    },
    {
      name: "addons",
      type: "multiSelect",
      label: "Addons",
      description: "Extras layered onto the stack; unavailable ones say why.",
      page: 4,
      multiSelectConfig: { placeholder: "Pick addons…" },
      options: (values) =>
        scaffoldOptionLists.addons.map((value) => {
          const reason = addonIncompatibilityReason(value, values);
          // Upstream getCompatibleAddons filters out other task runners
          // once one is selected; here they disable with an explanation.
          const taskRunnerTaken =
            addonsExclusivity.taskRunners.includes(value) &&
            values.addons.some(
              (selected) =>
                selected !== value &&
                addonsExclusivity.taskRunners.includes(selected),
            );
          return {
            value,
            label: addonChoices[value].label,
            description:
              reason ??
              (taskRunnerTaken
                ? "Only one task runner: turborepo, nx, or vite-plus."
                : addonChoices[value].description),
            disabled: reason !== null || taskRunnerTaken,
          };
        }),
    },
    {
      name: "examples",
      type: "select",
      label: "Examples",
      page: 4,
      conditional: (values) => values.backend !== "none",
      options: (values) =>
        scaffoldOptionLists.examples.map((value) => {
          if (
            value === "todo" &&
            (values.database === "none" || values.api === "none")
          ) {
            return {
              value,
              label: "todo",
              description: "Needs a database and an API layer.",
              disabled: true,
            };
          }
          if (
            value === "ai" &&
            (values.frontend === "solid" || values.frontend === "astro")
          ) {
            return {
              value,
              label: "ai",
              description: `Not compatible with ${values.frontend}.`,
              disabled: true,
            };
          }
          return value;
        }),
    },
    {
      name: "git",
      type: "switch",
      label: "Git repository",
      description: "Initialize a git repository.",
      page: 4,
    },
    {
      name: "install",
      type: "switch",
      label: "Install dependencies",
      description:
        "Runs {{packageManager}} install after scaffolding and streams the log here.",
      page: 4,
    },
  ];
}

export interface UseScaffoldFormOptions {
  /** Registered roots; the first one seeds the default root selection. */
  roots: Root[];
  /**
   * Fired when `scaffold.start` accepted the job. The command is the frozen
   * equivalent-CLI preview of the submitted (normalized) values, for the job
   * progress view.
   */
  onJobStarted: (jobId: string, command: string) => void;
  /**
   * Fired when `scaffold.start` rejects — including the single-flight
   * BAD_REQUEST. The message is also surfaced inline by `ScaffoldFormBody`.
   */
  onError: (message: string) => void;
}

/**
 * The create-project form wiring: a formedible-driven wizard (built-in
 * `pages`, function-valued `options`, `conditional` visibility — no per-field
 * JSX) whose submit runs `scaffold.start` and hands the accepted job to
 * `onJobStarted`. Validation uses the shared `scaffoldInputSchema`; the live
 * equivalent-CLI command is derived from a mirrored snapshot of the form
 * values so it can render outside `<Form />` without re-subscribing to the
 * TanStack store. Container-independent: renders nothing.
 */
export function useScaffoldForm({
  roots,
  onJobStarted,
  onError,
}: UseScaffoldFormOptions) {
  const trpc = useTRPC();
  const start = useMutation(trpc.scaffold.start.mutationOptions());
  const [startError, setStartError] = useState<string | null>(null);
  const initialValues = useMemo<ScaffoldFormValues>(
    () => ({
      ...scaffoldDefaults,
      projectName: "",
      root: roots[0]?.path ?? "",
    }),
    [roots],
  );
  // Mirror of the form values, fed by formOptions.onChange, so the live
  // command preview can render outside <Form /> without re-subscribing to the
  // TanStack store from this package-less side of the workspace.
  const [values, setValues] = useState<ScaffoldFormValues>(initialValues);
  const fields = useMemo(() => buildScaffoldFormFields(roots), [roots]);

  const { Form, form } = useFormedible<ScaffoldFormValues>({
    fields,
    pages: SCAFFOLD_FORM_PAGES,
    schema: scaffoldInputSchema,
    submitLabel: "Create project",
    nextLabel: "Next",
    previousLabel: "Back",
    progress: { showSteps: true },
    // Keep the submitted values: containers switch to the job view on submit
    // and re-show this same form instance if the job fails.
    resetOnSubmitSuccess: false,
    formOptions: {
      defaultValues: initialValues,
      onChange: ({ value }) => setValues(value),
      onSubmit: async ({ value }) => {
        const input = normalizeScaffoldInput(value);
        try {
          const { jobId } = await start.mutateAsync(input);
          setStartError(null);
          onJobStarted(jobId, buildEquivalentCommand(input));
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : "Failed to start the scaffold job.";
          setStartError(message);
          onError(message);
        }
      },
    },
  });

  // Formedible unmounts hidden fields but keeps their values, and a visible
  // select can hold a value its dependency just invalidated, so dependent
  // selections are re-picked here through the same reconcileScaffoldInput the
  // submit path runs — a stale option can neither render invalid nor reach
  // validation. `form.setFieldValue` does not run formOptions.onChange,
  // hence the mirrored setValues call.
  useEffect(() => {
    const next = reconcileScaffoldInput(values);
    const changed = reconciledFields.some(
      (field) => next[field] !== values[field],
    );
    if (!changed) return;
    for (const field of reconciledFields) {
      if (next[field] !== values[field]) {
        form.setFieldValue(field, next[field]);
      }
    }
    setValues(next);
  }, [values, form]);

  const command = buildEquivalentCommand(normalizeScaffoldInput(values));

  return { Form, form, values, command, startError };
}

/**
 * Rendered body of the create-project form: the inline start-error banner,
 * the scrollable wizard, and the pinned equivalent-command preview. Pairs
 * with `ScaffoldJobView`; containers typically swap between the two.
 */
export function ScaffoldFormBody({
  roots,
  onJobStarted,
  onError,
}: UseScaffoldFormOptions) {
  const { Form, command, startError } = useScaffoldForm({
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
          the same project by hand.
        </p>
      </div>
    </div>
  );
}

export interface UseScaffoldJobOptions {
  /** The job id returned by `scaffold.start`. */
  jobId: string;
  /**
   * Fired once when the tracked job reaches status "success", with the job's
   * `ScaffoldResult` (project directory, reproducible command, elapsed time).
   */
  onSuccess: (result: ScaffoldResult) => void;
  /**
   * Fired once for every surfaced failure: a job that ended in status
   * "error", and a job lost to a server restart (the registry is in-memory).
   */
  onError: (message: string) => void;
  /** Fired after the success callback; containers typically close here. */
  onClose: () => void;
}

/**
 * Tracks a scaffold job: polls `scaffold.job` once per second while the job
 * is running, keeps a one-second progress clock (`now`) alive only while
 * running, auto-scrolls the log tail element (`logRef`), and fires the
 * settle callbacks exactly once per job (`handledRef`). Render nothing with
 * it — pair it with `ScaffoldJobView` for the standard presentation.
 */
export function useScaffoldJob({
  jobId,
  onSuccess,
  onError,
  onClose,
}: UseScaffoldJobOptions) {
  const trpc = useTRPC();
  const job = useQuery(
    trpc.scaffold.job.queryOptions(
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
      onError("Scaffold job lost — the server probably restarted.");
      return;
    }
    if (snap.status === "running") return;
    handledRef.current = true;
    if (snap.status === "success") {
      if (snap.result !== undefined) onSuccess(snap.result);
      onClose();
      return;
    }
    onError(snap.error ?? "Scaffolding failed.");
  }, [snap, onError, onSuccess, onClose]);

  return { job, snap, isRunning, now, logRef };
}

export interface ScaffoldJobViewProps {
  jobId: string;
  /** Frozen equivalent-CLI command of the submitted values. */
  command: string;
  /** Fired once when the tracked job reaches status "success". */
  onSuccess: (result: ScaffoldResult) => void;
  /** Fired once for a job that errored or was lost to a server restart. */
  onError: (message: string) => void;
  /** "Back to form" — discards the tracked job and re-shows the form. */
  onDismiss: () => void;
  /** Fired after the success callback; containers typically close here. */
  onClose: () => void;
}

/**
 * The scaffold job progress view: phase, elapsed time, frozen command, live
 * install-log tail, and the terminal states (unreachable server, lost job,
 * failure, success). The stateful half lives in `useScaffoldJob`.
 */
export function ScaffoldJobView({
  jobId,
  command,
  onSuccess,
  onError,
  onDismiss,
  onClose,
}: ScaffoldJobViewProps) {
  const { job, snap, now, logRef } = useScaffoldJob({
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
            : "The scaffold job status could not be fetched."
        }
        onDismiss={onDismiss}
      />
    );
  }

  if (snap === undefined) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <p className="text-sm">Checking scaffold job…</p>
      </div>
    );
  }

  if (snap === null) {
    return (
      <JobError
        title="Scaffold job lost"
        message="The server probably restarted while the job was running — its job registry is in-memory. Check the target directory before retrying."
        onDismiss={onDismiss}
      />
    );
  }

  if (snap.status === "error") {
    return (
      <JobError
        title="Scaffolding failed"
        message={snap.error ?? "Scaffolding failed."}
        onDismiss={onDismiss}
      />
    );
  }

  if (snap.status === "success") {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-muted-foreground">
        <p className="text-sm font-medium text-foreground">
          Project created — closing…
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        {snap.phase === "installing"
          ? "Installing dependencies"
          : snap.phase === "agents-md"
            ? "Writing AGENTS.md"
            : "Scaffolding project"}
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
        <span className="text-xs font-medium">Install log</span>
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

export interface CreateProjectFlowProps {
  /**
   * Container visibility. While false, tracked job state resets so a flow
   * kept mounted inside hidden chrome never replays a settled job's
   * callbacks on reopen; containers that unmount the flow while closed are
   * unaffected.
   */
  open: boolean;
  /**
   * Fired once when the tracked job reaches status "success"; the flow then
   * asks the container to close through `onClose`. The caller owns toasts and
   * the `projects.scan` invalidation.
   */
  onSuccess?: (result: ScaffoldResult) => void;
  /**
   * Fired for every surfaced failure: a rejected `scaffold.start` (including
   * the single-flight BAD_REQUEST), a job that ended in status "error", and a
   * job lost to a server restart. The message is also shown inline.
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
 * The complete create-project flow, free of container chrome: root-directory
 * gating (loading, error + retry, empty state), the formedible wizard with
 * its live equivalent-command preview, and the scaffold job progress view.
 * While a job runs the form stays mounted but hidden so its values survive
 * the back-to-form path. Any container (sheet, dialog, expanding block) can
 * mount it; visibility, titles, and toasts stay the container's business.
 */
export function CreateProjectFlow({
  open,
  onSuccess,
  onError,
  onRequestAddRoot,
  onClose,
}: CreateProjectFlowProps) {
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
    (result: ScaffoldResult) => onSuccess?.(result),
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
          footer inside the scroll area floats over and swallows clicks on
          the fields and the wizard navigation (the addons picker sat
          exactly there), so it must never overlap the scrolling content. */}
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
              first — new projects are scaffolded inside one.
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
          <ScaffoldFormBody
            roots={roots}
            onJobStarted={handleJobStarted}
            onError={handleError}
          />
        )}
      </div>
      {job !== null ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ScaffoldJobView
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

function JobError({
  title,
  message,
  onDismiss,
}: {
  title: string;
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-sm font-semibold text-destructive">{title}</p>
      <p className="whitespace-pre-wrap text-xs text-muted-foreground">
        {message}
      </p>
      <Button variant="outline" size="sm" className="w-fit" onClick={onDismiss}>
        <ArrowLeft className="size-3.5" /> Back to form
      </Button>
    </div>
  );
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0
    ? `${minutes}m ${String(rest).padStart(2, "0")}s`
    : `${rest}s`;
}
