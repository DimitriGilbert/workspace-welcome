import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileText, Loader2, Plus, Trash2 } from "lucide-react";
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
import { Input } from "@workspace-welcome/ui/components/input";
import { Label } from "@workspace-welcome/ui/components/label";

import { useTRPC } from "@/utils/trpc";
import { relativeTime } from "@/lib/format";
import { useReportRun } from "@/lib/use-report";
import { AddRootSheet } from "@/components/add-root-sheet";

export const Route = createFileRoute("/settings")({
  component: SettingsComponent,
});

function SettingsComponent() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const reportRun = useReportRun();

  const roots = useQuery(trpc.roots.list.queryOptions());
  const hidden = useQuery(trpc.projects.hidden.queryOptions());

  const removeRoot = useMutation(
    trpc.roots.remove.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.roots.list.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.projects.scan.queryKey(),
        });
        toast.success("Directory removed");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const unhide = useMutation(
    trpc.projects.setHidden.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.projects.hidden.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.projects.scan.queryKey(),
        });
        toast.success("Project restored to list");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const [addRootOpen, setAddRootOpen] = useState(false);

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4">
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" render={<Link to="/" />}>
          <ArrowLeft className="size-3.5" />
        </Button>
        <h1 className="text-base font-semibold">Settings</h1>
      </div>

      {/* Roots */}
      <Card size="sm" className="mb-3">
        <CardHeader>
          <CardTitle>Tracked directories</CardTitle>
          <CardDescription>
            Workspace Welcome scans immediate subdirectories of each path for
            projects.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {roots.data?.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No directories tracked yet.
            </p>
          ) : null}
          {roots.data?.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-none border p-2"
            >
              <div className="flex min-w-0 flex-col">
                <span className="text-xs font-medium">{r.label}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {r.path}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={reportRun.isPending}
                  onClick={() =>
                    reportRun.run({ kind: "scan", path: r.path })
                  }
                >
                  {reportRun.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <FileText className="size-3.5" />
                  )}
                  {reportRun.isPending ? "Generating…" : "Scan report"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove directory"
                  disabled={removeRoot.isPending}
                  onClick={() => removeRoot.mutate({ id: r.id })}
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => setAddRootOpen(true)}
          >
            <Plus className="size-3.5" /> Add directory
          </Button>
        </CardContent>
      </Card>

      {/* Hidden projects */}
      {(hidden.data?.length ?? 0) > 0 ? (
        <Card size="sm" className="mb-3">
          <CardHeader>
            <CardTitle>Hidden projects</CardTitle>
            <CardDescription>
              Excluded from the dashboard. Restore them to bring them back.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {hidden.data?.map((p) => (
              <div
                key={p.path}
                className="flex items-center justify-between gap-2 rounded-none border p-2"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="text-xs font-medium">{p.name}</span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {p.path}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={unhide.isPending}
                  onClick={() =>
                    unhide.mutate({ path: p.path, hidden: false })
                  }
                >
                  Restore
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Commands */}
      <CommandsCard />

      {/* Web IDE */}
      <IdeCard />

      <AddRootSheet open={addRootOpen} onOpenChange={setAddRootOpen} />
    </div>
  );
}

function CommandsCard() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const settings = useQuery(trpc.settings.get.queryOptions());

  const [editor, setEditor] = useState("");
  const [terminal, setTerminal] = useState("");
  const [snitch, setSnitch] = useState("");

  // Hydrate local state once settings load.
  useEffect(() => {
    if (settings.data) {
      setEditor(settings.data.editorCommand);
      setTerminal(settings.data.terminalCommand ?? "");
      setSnitch(settings.data.snitchPath ?? "");
    }
  }, [settings.data]);

  const update = useMutation(
    trpc.settings.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.settings.get.queryKey(),
        });
        toast.success("Settings saved");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const dirty =
    settings.data !== undefined &&
    (editor !== settings.data.editorCommand ||
      (terminal || null) !== (settings.data.terminalCommand ?? null) ||
      (snitch || null) !== (settings.data.snitchPath ?? null));

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Open commands</CardTitle>
        <CardDescription>
          Commands used by the quick-open actions. The project path is passed as
          the last argument.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="editor-cmd">Editor command</Label>
          <Input
            id="editor-cmd"
            value={editor}
            onChange={(e) => setEditor(e.target.value)}
            placeholder="code"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            e.g. <span className="font-mono">code</span>,{" "}
            <span className="font-mono">cursor</span>,{" "}
            <span className="font-mono">zed</span>
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="terminal-cmd">Terminal command (optional)</Label>
          <Input
            id="terminal-cmd"
            value={terminal}
            onChange={(e) => setTerminal(e.target.value)}
            placeholder="kitty"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Launched with{" "}
            <span className="font-mono">--working-directory {"<path>"}</span>.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="snitch-path">gitsnitch CLI path (optional)</Label>
          <Input
            id="snitch-path"
            value={snitch}
            onChange={(e) => setSnitch(e.target.value)}
            placeholder="~/workspace/gitsnitch/apps/cli/dist/index.js"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Blank = auto (local{" "}
            <span className="font-mono">~/workspace/gitsnitch</span> build if
            present, else <span className="font-mono">npx @git-snitch/cli</span>
            ); when set the app runs{" "}
            <span className="font-mono">node {"<path>"}</span>.
          </p>
        </div>
        <Button
          className="w-fit"
          disabled={!dirty || update.isPending}
          onClick={() =>
            update.mutate({
              editorCommand: editor,
              terminalCommand: terminal.trim() ? terminal : null,
              snitchPath: snitch.trim() ? snitch : null,
              excludeGlobs: settings.data?.excludeGlobs ?? [],
            })
          }
        >
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Shared code-server status. A monitor, so the 5 s poll never pauses — the
 * state changes out-of-band (crash, another tab's Open IDE). The address is
 * built from the host this page was browsed from: the server only ever
 * reports the port, and the dashboard runs on a dev box reached from other
 * machines.
 */
function IdeCard() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const status = useQuery(
    trpc.ide.status.queryOptions(undefined, { refetchInterval: 5_000 }),
  );

  const stop = useMutation(
    trpc.ide.stop.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.ide.status.queryKey(),
        });
        toast.success("IDE stopped");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const s = status.data;
  const addr =
    s !== undefined && s.running && s.port !== null
      ? `http://${window.location.hostname}:${s.port}`
      : null;
  const installing =
    s !== undefined &&
    (s.install.phase === "downloading" || s.install.phase === "extracting");
  const installLabel =
    s !== undefined &&
    s.install.receivedBytes !== null &&
    s.install.totalBytes !== null
      ? `Installing… (${Math.floor(
          (s.install.receivedBytes / s.install.totalBytes) * 100,
        )} %)`
      : "Installing…";

  return (
    <Card size="sm" className="mt-3">
      <CardHeader>
        <CardTitle>Web IDE</CardTitle>
        <CardDescription>
          One shared code-server for all projects, started on demand.
        </CardDescription>
        {s?.running ? (
          <CardAction>
            <Button
              size="sm"
              variant="destructive"
              disabled={stop.isPending}
              onClick={() => stop.mutate()}
            >
              {stop.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              Stop
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {s === undefined ? null : addr !== null ? (
          <>
            <div className="flex items-center gap-2 text-xs">
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-positive"
              />
              Running
              {s.version ? (
                <span className="text-muted-foreground">· {s.version}</span>
              ) : null}
            </div>
            <a
              href={addr}
              target="_blank"
              rel="noreferrer"
              className="break-all font-mono text-xs text-primary hover:underline"
            >
              {addr}
            </a>
            <p className="text-xs text-muted-foreground">
              Started {relativeTime(s.startedAt)}.
            </p>
          </>
        ) : installing ? (
          <p className="text-xs text-muted-foreground">{installLabel}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {s.installed
              ? "Stopped — start it from a project’s “Open IDE” button."
              : "Not installed yet — it installs itself (~100–200 MB) the first time you click “Open IDE” on a project."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
