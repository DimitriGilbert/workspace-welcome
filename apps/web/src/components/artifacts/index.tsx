import type { ComponentPropsWithoutRef } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Film, Images, Plus, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@workspace-welcome/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace-welcome/ui/components/card";
import { Input } from "@workspace-welcome/ui/components/input";
import { Skeleton } from "@workspace-welcome/ui/components/skeleton";
import { cn } from "@workspace-welcome/ui/lib/utils";
import type { ArtifactMediaEntry } from "@workspace-welcome/api/lib/artifacts";

import { useTRPC } from "@/utils/trpc";
import { formatBytes, relativeTime } from "@/lib/format";
import { artifactViewUrl } from "@/lib/artifacts";
import { ArtifactLightbox } from "@/components/artifacts/lightbox";

/**
 * Per-project artifact gallery: the configured folders' images and test
 * recordings, newest first. Folder configuration lives in a per-project JSON
 * file under the app data dir (server-side project-config.ts); media is
 * streamed by /api/artifacts/view, which refuses anything outside those
 * folders. Read-only by design — deleting artifacts happens in the Files tab.
 */
export function ArtifactsPanel({
  project,
  className,
  ...rest
}: { project: string } & ComponentPropsWithoutRef<"div">) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const config = useQuery(trpc.artifacts.config.queryOptions({ project }));
  const listing = useQuery(trpc.artifacts.list.queryOptions({ project }));

  const setConfig = useMutation(
    trpc.artifacts.setConfig.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.artifacts.config.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.artifacts.list.queryKey(),
        });
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const dirs = config.data?.dirs ?? [];
  const addDir = (value: string) =>
    setConfig.mutate({ project, dirs: [...dirs, value] });
  const removeDir = (dir: string) =>
    setConfig.mutate({ project, dirs: dirs.filter((d) => d !== dir) });

  const [source, setSource] = useState<string | null>(null);
  const media = listing.data?.media ?? [];
  const visible =
    source === null ? media : media.filter((m) => m.sourceDir === source);
  // A removed folder's filter chip must not linger as a dead selection.
  useEffect(() => {
    if (source !== null && !dirs.includes(source)) setSource(null);
  }, [dirs, source]);

  const countByDir = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of media) {
      counts.set(entry.sourceDir, (counts.get(entry.sourceDir) ?? 0) + 1);
    }
    return counts;
  }, [media]);

  const [selected, setSelected] = useState<ArtifactMediaEntry | null>(null);
  useEffect(() => {
    // A re-run can overwrite/delete the open file — drop the lightbox rather
    // than show a stale entry (its URLs 404).
    if (selected !== null && !media.some((m) => m.path === selected.path)) {
      setSelected(null);
    }
  }, [media, selected]);

  const refresh = () =>
    void queryClient.invalidateQueries({
      queryKey: trpc.artifacts.list.queryKey(),
    });

  return (
    <Card size="sm" className={className} {...rest}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Images className="size-4 text-muted-foreground" />
          Artifacts
        </CardTitle>
        <CardDescription>
          Build and test media (screenshots, recordings) from the folders
          below — newest first, read-only. Deletes belong in the Files tab.
        </CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={refresh}
            aria-label="Refresh artifacts"
          >
            <RefreshCw
              className={cn("size-3.5", listing.isFetching && "animate-spin")}
            />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Folder configuration — every add/remove persists immediately. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[0.65rem] text-muted-foreground">
            artifact folders
          </span>
          {dirs.map((dir) => (
            <span
              key={dir}
              className="inline-flex items-center gap-1 border border-foreground/10 bg-muted/40 px-1.5 py-0.5 font-mono text-[0.65rem]"
            >
              {dir}
              <button
                type="button"
                onClick={() => removeDir(dir)}
                aria-label={`Stop watching ${dir}`}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <AddDirInput dirs={dirs} onAdd={addDir} pending={setConfig.isPending} />
        </div>

        {config.isLoading ? (
          <Skeleton className="h-40" />
        ) : listing.isError ? (
          <p className="text-xs" style={{ color: "var(--sev-critical)" }}>
            {listing.error.message}
          </p>
        ) : (
          <>
            {(listing.data?.skippedDirs.length ?? 0) > 0 ? (
              <div
                className="flex flex-col gap-0.5 border border-dashed px-2 py-1.5"
                style={{ borderColor: "var(--sev-warning)" }}
              >
                {listing.data?.skippedDirs.map((skipped) => (
                  <p
                    key={skipped.dir}
                    className="font-mono text-[0.65rem]"
                    style={{ color: "var(--sev-warning)" }}
                  >
                    {skipped.dir} — {skipped.reason}
                  </p>
                ))}
              </div>
            ) : null}
            {dirs.length === 0 ? (
              <ArtifactsHint
                icon={<Images className="size-6" />}
                title="No artifact folders yet"
                body="Add the folders where this project drops build/test media — screenshots, screen recordings — and they'll show up here, newest first."
              />
            ) : media.length === 0 ? (
              <ArtifactsHint
                icon={<Images className="size-6" />}
                title="No media found"
                body="No images or videos under the configured folders yet — they'll appear after the next build or test run."
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[0.65rem] text-muted-foreground">
                    {visible.length}
                    {listing.data?.truncated ? "+" : ""} file
                    {visible.length === 1 ? "" : "s"}
                  </span>
                  {dirs.length > 1 ? (
                    <span className="flex flex-wrap items-center gap-1">
                      <FilterChip
                        label="all"
                        count={media.length}
                        active={source === null}
                        onClick={() => setSource(null)}
                      />
                      {dirs.map((dir) => (
                        <FilterChip
                          key={dir}
                          label={dir}
                          count={countByDir.get(dir) ?? 0}
                          active={source === dir}
                          onClick={() => setSource(dir)}
                        />
                      ))}
                    </span>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {visible.map((entry) => (
                    <ArtifactTile
                      key={entry.path}
                      project={project}
                      entry={entry}
                      onOpen={() => setSelected(entry)}
                    />
                  ))}
                </div>
                {listing.data?.truncated ? (
                  <p className="font-mono text-[0.65rem] text-muted-foreground">
                    showing the {listing.data.media.length} newest — clean old
                    runs to see the rest
                  </p>
                ) : null}
              </>
            )}
          </>
        )}
      </CardContent>
      <ArtifactLightbox
        project={project}
        entry={selected}
        onClose={() => setSelected(null)}
      />
    </Card>
  );
}

/** Inline "add folder" input with the same rules the server enforces. */
function AddDirInput({
  dirs,
  onAdd,
  pending,
}: {
  dirs: readonly string[];
  onAdd: (value: string) => void;
  pending: boolean;
}) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    const value = draft.trim().replace(/^\.\//, "").replace(/\/+$/, "");
    if (value === "") return;
    // Early feedback mirroring the router's zod refinements — the server
    // re-validates, this just keeps the mistake in place for correcting.
    if (value.startsWith("/") || value.split("/").includes("..")) {
      toast.error(
        "Folders are relative to the project root and can't contain '..'",
      );
      return;
    }
    if (dirs.includes(value)) {
      toast.error("That folder is already configured");
      return;
    }
    onAdd(value);
    setDraft("");
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="add folder, e.g. e2e/artifacts"
        className="h-6 w-56 px-1.5 font-mono text-[0.65rem]"
        aria-label="Add an artifact folder"
      />
      <Button variant="outline" size="xs" onClick={submit} disabled={pending}>
        <Plus className="size-3" /> Add
      </Button>
    </span>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex max-w-48 items-center gap-1 border px-1.5 py-0.5 font-mono text-[0.65rem] transition-colors",
        active
          ? "border-transparent bg-accent text-accent-foreground"
          : "border-foreground/10 text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="truncate">{label}</span>
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function ArtifactTile({
  project,
  entry,
  onOpen,
}: {
  project: string;
  entry: ArtifactMediaEntry;
  onOpen: () => void;
}) {
  const url = artifactViewUrl(project, entry);
  return (
    <button
      type="button"
      onClick={onOpen}
      title={entry.path}
      className="group flex min-w-0 flex-col border border-foreground/10 text-left transition-colors hover:border-foreground/30"
    >
      <span className="relative block aspect-square overflow-hidden bg-muted/30">
        {entry.kind === "image" ? (
          <img
            src={url}
            alt={entry.name}
            loading="lazy"
            className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          />
        ) : (
          // #t=0.5 makes browsers paint the first frame instead of a blank
          // box; clicks are the tile's, never the video's own controls.
          <video
            src={`${url}#t=0.5`}
            preload="metadata"
            muted
            playsInline
            tabIndex={-1}
            className="pointer-events-none size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          />
        )}
        {entry.kind === "video" ? (
          <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 bg-background/80 px-1 py-0.5 font-mono text-[0.6rem]">
            <Film className="size-3" />
            {formatBytes(entry.size)}
          </span>
        ) : null}
      </span>
      <span className="min-w-0 px-1.5 py-1">
        <span className="block truncate font-mono text-[0.65rem]">
          {entry.name}
        </span>
        <span className="block truncate text-[0.6rem] text-muted-foreground">
          {relativeTime(entry.modifiedAt)} · {formatBytes(entry.size)}
        </span>
      </span>
    </button>
  );
}

/** Dashed hint panel in the dashboard empty-state's visual voice. */
function ArtifactsHint({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-none border border-dashed border-foreground/15 p-10 text-center">
      <span
        aria-hidden
        className="flex size-11 items-center justify-center rounded-none bg-muted text-muted-foreground"
      >
        {icon}
      </span>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <p className="max-w-md text-xs text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
