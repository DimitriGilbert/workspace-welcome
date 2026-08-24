import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen } from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace-welcome/ui/components/card";
import type {
  FileEntry,
  ListDirResult,
} from "@workspace-welcome/api/lib/file-ops";

import { useTRPC } from "@/utils/trpc";
import { UploadDropzone } from "@/components/file-browser/dropzone";
import { FileViewer } from "@/components/file-browser/viewer";
import {
  FileTree,
  childPath,
  parentDir,
  type FileTreeApi,
} from "@/components/file-browser/tree";

/** Persisted split geometry (px) — the drag position survives reloads. */
const TREE_WIDTH_KEY = "file-browser.tree-width";
const TREE_MIN_PX = 260;
const TREE_DEFAULT_PX = 340;
/** Share of the card the tree may never exceed, so the viewer stays usable. */
const TREE_MAX_RATIO = 0.6;

/**
 * Per-project file browser (ADR-0002/0005): a lazily-loaded tree over
 * `files.list` beside an inline viewer pane, plus a drop-panel uploader.
 * Every mutation refreshes the affected directory, and the server confines
 * all of it to the project subtree regardless of what the client asks for.
 */
export function FileBrowser({ project }: { project: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const treeApi = useRef<FileTreeApi | null>(null);
  // The split container — measured live while dragging so the clamp adapts.
  const splitRef = useRef<HTMLDivElement | null>(null);

  // The last folder clicked in the tree is the upload target ("" = root).
  const [currentDir, setCurrentDir] = useState("");

  // The file shown in the viewer pane (null = empty state). The viewer only
  // fetches content while mounted, so this is the laziness gate.
  const [viewing, setViewing] = useState<{
    path: string;
    entry: FileEntry;
  } | null>(null);

  const [treeWidth, setTreeWidth] = useState(TREE_DEFAULT_PX);
  useEffect(() => {
    // Restore the persisted width, clamped against a min only — the max
    // depends on the card's live width and is enforced while dragging.
    const stored = window.localStorage.getItem(TREE_WIDTH_KEY);
    const px = stored === null ? NaN : Number(stored);
    if (Number.isFinite(px) && px >= TREE_MIN_PX) setTreeWidth(px);
  }, []);

  const startResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = splitRef.current;
    if (el === null) return;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const max = Math.round(rect.width * TREE_MAX_RATIO);
      const w = Math.min(Math.max(ev.clientX - rect.left, TREE_MIN_PX), max);
      setTreeWidth(w);
    };
    const up = (ev: PointerEvent) => {
      handle.releasePointerCapture(ev.pointerId);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      setTreeWidth((w) => {
        window.localStorage.setItem(TREE_WIDTH_KEY, String(w));
        return w;
      });
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }, []);

  const listing = useQuery(
    trpc.files.list.queryOptions({ project, dir: currentDir }),
  );

  // The tree loads directories imperatively through the same query cache, so
  // tree loads and the reactive listing above share one fetch per directory.
  const listDir = useCallback(
    (dir: string): Promise<ListDirResult> =>
      queryClient.fetchQuery(trpc.files.list.queryOptions({ project, dir })),
    [queryClient, trpc, project],
  );

  const refreshDir = useCallback(
    async (dir: string) => {
      // Invalidate every listing (the active one refetches), then make the
      // tree refetch just the changed directory.
      await queryClient.invalidateQueries({
        queryKey: trpc.files.list.queryKey(),
      });
      treeApi.current?.refreshDir(dir);
    },
    [queryClient, trpc],
  );

  const renameMutation = useMutation(
    trpc.files.rename.mutationOptions({
      onSuccess: (_result, vars) => {
        refreshDir(parentDir(vars.path));
        // Keep the upload target honest when the folder itself was renamed.
        if (vars.path === currentDir)
          setCurrentDir(childPath(parentDir(vars.path), vars.name));
        // A renamed selection (or one inside a renamed folder) follows along.
        setViewing((v) => {
          if (v === null) return v;
          if (v.path === vars.path) {
            return {
              path: childPath(parentDir(vars.path), vars.name),
              entry: { ...v.entry, name: vars.name },
            };
          }
          if (v.path.startsWith(`${vars.path}/`)) {
            const next = `${childPath(parentDir(vars.path), vars.name)}/${v.path.slice(vars.path.length + 1)}`;
            return { ...v, path: next };
          }
          return v;
        });
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const deleteMutation = useMutation(
    trpc.files.delete.mutationOptions({
      onSuccess: (result, vars) => {
        // The server reports which mode actually ran — label it honestly.
        toast.success(
          result.mode === "trash" ? "Moved to trash" : "Deleted permanently",
        );
        refreshDir(parentDir(vars.path));
        if (vars.path === currentDir) setCurrentDir(parentDir(vars.path));
        // The viewed file (or a folder containing it) is gone — empty state.
        setViewing((v) =>
          v !== null && (v.path === vars.path || v.path.startsWith(`${vars.path}/`))
            ? null
            : v,
        );
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const createFolderMutation = useMutation(
    trpc.files.createFolder.mutationOptions({
      onSuccess: (_result, vars) => refreshDir(vars.parent),
      onError: (e) => toast.error(e.message),
    }),
  );
  // Upload failures toast per file from here; the dropzone keeps going.
  const uploadMutation = useMutation(
    trpc.files.upload.mutationOptions({
      onError: (e, vars) => toast.error(`${vars.name}: ${e.message}`),
    }),
  );

  // Constant per server process. True is the common case, and the delete
  // result toast corrects the label if the permanent fallback ran.
  const trashAvailable = listing.data?.trashAvailable ?? true;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="size-4 text-muted-foreground" />
          Files
        </CardTitle>
        <CardDescription>
          Drop files below to upload (up to 10 MB each); deleting moves to
          trash when the machine has one, otherwise it is permanent.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {listing.isError ? (
          <p className="text-xs" style={{ color: "var(--sev-error)" }}>
            {listing.error.message}
          </p>
        ) : null}
        {/* Fixed shared height so both panes are equal and scroll
            independently; the resize handle stretches the full height. */}
        <div ref={splitRef} className="flex h-[70vh] min-w-0 items-stretch gap-0">
          <div
            className="shrink-0 overflow-y-auto"
            style={{ width: `${treeWidth}px` }}
          >
            <FileTree
              ref={treeApi}
              project={project}
              listDir={listDir}
              onDirChange={setCurrentDir}
              onOpenFile={(path, entry) => setViewing({ path, entry })}
              trashAvailable={trashAvailable}
              rename={(path, name) =>
                renameMutation.mutate({ project, path, name })
              }
              createFolder={(parent, name) =>
                createFolderMutation.mutate({ project, parent, name })
              }
              remove={(path) => deleteMutation.mutate({ project, path })}
            />
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            onPointerDown={startResize}
            className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/50"
          />
          <div className="flex min-w-0 flex-1 flex-col py-1 pl-3">
            {viewing !== null ? (
              <FileViewer
                project={project}
                path={viewing.path}
                name={viewing.entry.name}
                size={viewing.entry.size ?? 0}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-none border border-dashed border-border">
                <p className="text-xs text-muted-foreground">
                  Select a file to preview
                </p>
              </div>
            )}
          </div>
        </div>
        <UploadDropzone
          dir={currentDir}
          existing={listing.data?.entries.map((e) => e.name) ?? []}
          upload={(name, contentBase64) =>
            uploadMutation.mutateAsync({
              project,
              dir: currentDir,
              name,
              contentBase64,
            })
          }
          onUploaded={() => refreshDir(currentDir)}
        />
      </CardContent>
    </Card>
  );
}
