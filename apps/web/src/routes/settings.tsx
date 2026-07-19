import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace-welcome/ui/components/card";
import { Button } from "@workspace-welcome/ui/components/button";
import { Input } from "@workspace-welcome/ui/components/input";
import { Label } from "@workspace-welcome/ui/components/label";

import { useTRPC } from "@/utils/trpc";
import { AddRootSheet } from "@/components/add-root-sheet";

export const Route = createFileRoute("/settings")({
  component: SettingsComponent,
});

function SettingsComponent() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const roots = useQuery(trpc.roots.list.queryOptions());

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

      {/* Commands */}
      <CommandsCard />

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

  // Hydrate local state once settings load.
  useEffect(() => {
    if (settings.data) {
      setEditor(settings.data.editorCommand);
      setTerminal(settings.data.terminalCommand ?? "");
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
      (terminal || null) !== (settings.data.terminalCommand ?? null));

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
        <Button
          className="w-fit"
          disabled={!dirty || update.isPending}
          onClick={() =>
            update.mutate({
              editorCommand: editor,
              terminalCommand: terminal.trim() ? terminal : null,
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
