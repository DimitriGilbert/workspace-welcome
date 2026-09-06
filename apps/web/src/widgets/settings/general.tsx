import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@workspace-welcome/ui/components/button";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";

import { useTRPC } from "@/utils/trpc";
import { relativeTime } from "@/lib/format";
import { useReportRun } from "@/lib/use-report";
import { AddRootSheet } from "@/components/add-root-sheet";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

/**
 * SettingsGeneral — the /settings entries with no dedicated widget home, in
 * one widget: tracked directories (add / remove / scan report), hidden
 * projects (restore), and the shared web IDE (status / stop). Functional
 * surface ported verbatim from the legacy settings page — same queries,
 * mutations, invalidations, and toasts; presentation is the common shell.
 */
export function SettingsGeneral() {
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
    <WidgetShell title="Workspace" className="border bg-card">
      <div className="flex flex-col gap-4 px-3 pb-3 pt-1">
        {/* Tracked directories */}
        <section className="flex flex-col gap-2">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Workspace Welcome scans immediate subdirectories of each path for
            projects.
          </p>
          {roots.isPending ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-3/4" />
            </div>
          ) : roots.data?.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No directories tracked yet.
            </p>
          ) : null}
          {roots.data?.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 border px-2 py-1.5">
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
                  onClick={() => reportRun.run({ kind: "scan", path: r.path })}
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
        </section>

        {/* Hidden projects */}
        {(hidden.data?.length ?? 0) > 0 ? (
          <section className="flex flex-col gap-2 border-t pt-3">
            <p className="text-xs font-medium">Hidden projects</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Excluded from the dashboard. Restore them to bring them back.
            </p>
            {hidden.data?.map((p) => (
              <div key={p.path} className="flex items-center justify-between gap-2 border px-2 py-1.5">
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
                  onClick={() => unhide.mutate({ path: p.path, hidden: false })}
                >
                  Restore
                </Button>
              </div>
            ))}
          </section>
        ) : null}

        {/* Web IDE */}
        <IdeSection />

        <AddRootSheet open={addRootOpen} onOpenChange={setAddRootOpen} />
      </div>
    </WidgetShell>
  );
}

/**
 * Shared code-server status. A monitor, so the 5 s poll never pauses — the
 * state changes out-of-band (crash, another tab's Open IDE). The address is
 * built from the host this page was browsed from: the server only ever
 * reports the port, and the dashboard runs on a dev box reached from other
 * machines.
 */
function IdeSection() {
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
    <section className="flex flex-col gap-2 border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">Web IDE</p>
        {s?.running ? (
          <Button
            size="sm"
            variant="destructive"
            disabled={stop.isPending}
            onClick={() => stop.mutate()}
          >
            {stop.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Stop
          </Button>
        ) : null}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        One shared code-server for all projects, started on demand.
      </p>
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
    </section>
  );
}
