import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, FolderPlus, Loader2 } from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace-welcome/ui/components/sheet";
import { useFormedible } from "@workspace-welcome/ui/components/formedible/hooks/use-formedible";
import type {
  FormedibleFieldConfig,
  FormediblePageConfig,
} from "@workspace-welcome/ui/components/formedible/lib/types";
import {
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

type ScaffoldFormValues = ScaffoldInput;

type ScaffoldResult = NonNullable<ScaffoldJobSnapshot["result"]>;

interface CreateProjectSheetProps {
  /** Sheet visibility — fully controlled by the caller. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Fired once when the tracked job reaches status "success"; the sheet then
   * closes itself through `onOpenChange(false)`. The caller owns toasts and
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
   * Fired when the sheet has zero registered roots and the user asks to add
   * one; the caller typically closes this sheet and opens the add-directory
   * sheet.
   */
  onRequestAddRoot?: () => void;
}

/**
 * Create-project sheet: a formedible-driven wizard (built-in `pages`, function
 * valued `options`, `conditional` visibility — no per-field JSX) that starts a
 * server-side better-t-stack scaffold job via `scaffold.start` and polls
 * `scaffold.job` until it settles. All option lists, defaults, and the form
 * schema come from `@workspace-welcome/api/lib/scaffold-options` (single
 * source of truth, node-free for the browser); the equivalent CLI command is previewed live and re-shown while the
 * job runs. No toasts are fired from here — the callbacks are the caller's
 * hook for that (wiring phase 3.2).
 */
export function CreateProjectSheet({
  open,
  onOpenChange,
  onSuccess,
  onError,
  onRequestAddRoot,
}: CreateProjectSheetProps) {
  const trpc = useTRPC();
  const rootsQuery = useQuery(trpc.roots.list.queryOptions());
  // While set, the sheet body shows the job progress view; the command is the
  // frozen preview of the submitted values.
  const [job, setJob] = useState<{ id: string; command: string } | null>(null);

  // SheetContent unmounts its children on close; without this reset a
  // remounted job view on reopen would replay the settled job's callbacks.
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
  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  const roots = rootsQuery.data;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Create a new project</SheetTitle>
          <SheetDescription>
            Scaffold a better-t-stack project under a registered root. The
            equivalent CLI command updates live as you pick options.
          </SheetDescription>
        </SheetHeader>

        {/* The form stays mounted (hidden) while a job runs so its values survive the back-to-form path. */}
        <div className={job === null ? undefined : "hidden"}>
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
            <ScaffoldForm
              roots={roots}
              onJobStarted={handleJobStarted}
              onError={handleError}
            />
          )}
        </div>
        {job !== null ? (
          <ScaffoldJobView
            jobId={job.id}
            command={job.command}
            onSuccess={handleSuccess}
            onError={handleError}
            onDismiss={handleDismiss}
            onClose={handleClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

const FORM_PAGES: readonly FormediblePageConfig<ScaffoldFormValues>[] = [
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

function ScaffoldForm({
  roots,
  onJobStarted,
  onError,
}: {
  roots: Root[];
  onJobStarted: (jobId: string, command: string) => void;
  onError: (message: string) => void;
}) {
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

  const fields = useMemo<readonly FormedibleFieldConfig<ScaffoldFormValues>[]>(
    () => [
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
        options: scaffoldOptionLists.backend,
      },
      {
        name: "runtime",
        type: "select",
        label: "Runtime",
        description: "Runs the separate backend server.",
        page: 2,
        conditional: (values) => values.backend !== "self",
        options: (values) => scaffoldOptionLists.runtimeByBackend[values.backend],
      },
      {
        name: "api",
        type: "select",
        label: "API",
        page: 2,
        options: scaffoldOptionLists.api,
      },
      {
        name: "auth",
        type: "select",
        label: "Authentication",
        page: 2,
        options: scaffoldOptionLists.auth,
      },
      {
        name: "database",
        type: "select",
        label: "Database",
        page: 3,
        options: scaffoldOptionLists.database,
      },
      {
        name: "orm",
        type: "select",
        label: "ORM",
        page: 3,
        options: scaffoldOptionLists.orm,
      },
      {
        name: "dbSetup",
        type: "select",
        label: "Database setup",
        description: "Allowed setups depend on the database.",
        page: 3,
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
        conditional: (values) => values.backend !== "self",
        options: (values) =>
          scaffoldOptionLists.serverDeployByBackend[values.backend],
      },
      {
        name: "payments",
        type: "select",
        label: "Payments",
        page: 4,
        options: scaffoldOptionLists.payments,
      },
      {
        name: "addons",
        type: "multiSelect",
        label: "Addons",
        page: 4,
        multiSelectConfig: { placeholder: "Pick addons…" },
        options: scaffoldOptionLists.addons,
      },
      {
        name: "examples",
        type: "select",
        label: "Examples",
        page: 4,
        options: scaffoldOptionLists.examples,
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
    ],
    [roots],
  );

  const { Form, form } = useFormedible<ScaffoldFormValues>({
    fields,
    pages: FORM_PAGES,
    schema: scaffoldInputSchema,
    submitLabel: "Create project",
    nextLabel: "Next",
    previousLabel: "Back",
    progress: { showSteps: true },
    // Keep the submitted values: the sheet switches to the job view on submit
    // and re-shows this same form instance if the job fails.
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

  // Formedible unmounts hidden fields but keeps their values, so dependent
  // selections are reconciled here rather than only at submit: switching from
  // the self backend to a separate one applies the visible defaults to the
  // newly visible runtime/serverDeploy, and a dbSetup left invalid by a
  // database switch resets to "none". `form.setFieldValue` does not run
  // formOptions.onChange, hence the mirrored setValues call.
  const previousValuesRef = useRef(values);
  useEffect(() => {
    const previous = previousValuesRef.current;
    previousValuesRef.current = values;
    const switchedFromSelfBackend =
      previous.backend === "self" && values.backend !== "self";
    // Widening to the enum-union element type: the dependent maps keep their
    // precise per-key tuple types, and `.includes` on their union misresolves.
    const runtimeList: readonly ScaffoldFormValues["runtime"][] =
      scaffoldOptionLists.runtimeByBackend[values.backend];
    const serverDeployList: readonly ScaffoldFormValues["serverDeploy"][] =
      scaffoldOptionLists.serverDeployByBackend[values.backend];
    const dbSetupList: readonly ScaffoldFormValues["dbSetup"][] =
      scaffoldOptionLists.dbSetupByDatabase[values.database];
    let runtime = values.runtime;
    let serverDeploy = values.serverDeploy;
    let dbSetup = values.dbSetup;
    if (switchedFromSelfBackend) {
      runtime = scaffoldOptionLists.visibleDefaults.runtime;
      serverDeploy = scaffoldOptionLists.visibleDefaults.serverDeploy;
    }
    if (values.backend !== "self" && !runtimeList.includes(runtime)) {
      runtime = scaffoldOptionLists.visibleDefaults.runtime;
    }
    if (values.backend !== "self" && !serverDeployList.includes(serverDeploy)) {
      serverDeploy = scaffoldOptionLists.visibleDefaults.serverDeploy;
    }
    if (!dbSetupList.includes(dbSetup)) {
      dbSetup = "none";
    }
    if (
      runtime === values.runtime &&
      serverDeploy === values.serverDeploy &&
      dbSetup === values.dbSetup
    ) {
      return;
    }
    form.setFieldValue("runtime", runtime);
    form.setFieldValue("serverDeploy", serverDeploy);
    form.setFieldValue("dbSetup", dbSetup);
    setValues({ ...values, runtime, serverDeploy, dbSetup });
  }, [values, form]);

  const command = buildEquivalentCommand(normalizeScaffoldInput(values));

  return (
    <div>
      {startError !== null ? (
        <div
          role="alert"
          className="border-b border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive"
        >
          {startError}
        </div>
      ) : null}
      <Form className="px-4 py-4" />
      <div className="sticky bottom-0 border-t border-foreground/10 bg-popover px-4 py-3">
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

function ScaffoldJobView({
  jobId,
  command,
  onSuccess,
  onError,
  onDismiss,
  onClose,
}: {
  jobId: string;
  command: string;
  onSuccess: (result: ScaffoldResult) => void;
  onError: (message: string) => void;
  onDismiss: () => void;
  onClose: () => void;
}) {
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
