import {
  asyncDataLoaderFeature,
  hotkeysCoreFeature,
  renamingFeature,
  type ItemInstance,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import { ChevronRight, File, Folder, Loader2 } from "lucide-react";
import { useImperativeHandle, useState, type Ref } from "react";
import { toast } from "sonner";

import { cn } from "@workspace-welcome/ui/lib/utils";
import type {
  FileEntry,
  ListDirResult,
} from "@workspace-welcome/api/lib/file-ops";

import { EntryContextMenu } from "@/components/file-browser/actions";

/**
 * Item ids ARE relative paths ("" = the project root, "src", "src/main.ts")
 * — the exact shape the files router speaks, so no id-to-path translation
 * layer is needed anywhere in the browser.
 */
const ROOT_ID = "";

/** Relative path of `name` inside `dir`. */
export function childPath(dir: string, name: string): string {
  return dir === "" ? name : `${dir}/${name}`;
}

/** Directory containing `rel` ("" at the top level). */
export function parentDir(rel: string): string {
  const i = rel.lastIndexOf("/");
  return i === -1 ? "" : rel.slice(0, i);
}

/** Imperative handle exposed by <FileTree> for post-mutation refreshes. */
export interface FileTreeApi {
  /** Refetch one directory's children (after a mutation changed its contents). */
  refreshDir: (dir: string) => void;
}

interface FileTreeProps {
  project: string;
  /** Fetches one directory through the shared query cache (deduped listings). */
  listDir: (dir: string) => Promise<ListDirResult>;
  /** Fired when a folder row is clicked — that folder becomes the upload target. */
  onDirChange: (dir: string) => void;
  /** Fired when a file row is clicked — opens the inline viewer. */
  onOpenFile: (path: string, entry: FileEntry) => void;
  trashAvailable: boolean;
  rename: (path: string, name: string) => void;
  createFolder: (parent: string, name: string) => void;
  remove: (path: string) => void;
  ref?: Ref<FileTreeApi>;
}

/**
 * Lazy file tree: headless-tree's async data loader fetches each directory
 * only when it is expanded, and caches children in the tree instance — no
 * recursive upfront walk.
 */
export function FileTree({
  project,
  listDir,
  onDirChange,
  onOpenFile,
  trashAvailable,
  rename,
  createFolder,
  remove,
  ref,
}: FileTreeProps) {
  // Label for the synthetic root entry; the root itself is never rendered,
  // only its children are.
  const rootName = project.split("/").filter(Boolean).at(-1) ?? project;
  const [rootLoaded, setRootLoaded] = useState(false);

  const tree = useTree<FileEntry>({
    rootItemId: ROOT_ID,
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData().kind === "dir",
    onPrimaryAction: (item) => {
      // Guard: a click inside the rename input must not open the viewer.
      if (item.isRenaming()) return;
      if (item.isFolder()) onDirChange(item.getId());
      else onOpenFile(item.getId(), item.getItemData());
    },
    // Built-in inline rename (F2 / Enter / Escape). Submitting goes through
    // the same mutation as the rename dialog.
    onRename: (item, value) => {
      const name = value.trim();
      if (name === "" || name === item.getItemData().name) return;
      rename(item.getId(), name);
    },
    dataLoader: {
      getItem: async (itemId) => {
        if (itemId === ROOT_ID) {
          return { name: rootName, kind: "dir", size: null, modifiedAt: "" };
        }
        // Reached only for items outside the children cache (the root);
        // re-derive from the parent listing so this stays a real lookup.
        const parent = parentDir(itemId);
        const entry = (await listDir(parent)).entries.find(
          (e) => childPath(parent, e.name) === itemId,
        );
        if (!entry) throw new Error(`"${itemId}" is no longer in this folder.`);
        return entry;
      },
      getChildrenWithData: async (itemId) => {
        try {
          const result = await listDir(itemId);
          if (itemId === ROOT_ID) setRootLoaded(true);
          return result.entries.map((entry) => ({
            id: childPath(itemId, entry.name),
            data: entry,
          }));
        } catch (err) {
          // The loader leaves the folder stuck in its "loading" arrays when
          // the fetch rejects, which would block re-expanding forever —
          // clear both, then let the rejection reach whoever awaited it.
          const drop = (ids: string[]) => ids.filter((id) => id !== itemId);
          tree.applySubStateUpdate("loadingItemChildrens", drop);
          tree.applySubStateUpdate("loadingItemData", drop);
          toast.error(
            err instanceof Error ? err.message : "Couldn't list the folder.",
          );
          throw err;
        }
      },
    },
    features: [asyncDataLoaderFeature, hotkeysCoreFeature, renamingFeature],
  });

  useImperativeHandle(
    ref,
    () => ({
      refreshDir: (dir: string) => {
        tree
          .getItemInstance(dir)
          .invalidateChildrenIds()
          .catch((err: unknown) => {
            toast.error(
              err instanceof Error
                ? err.message
                : "Couldn't refresh the folder.",
            );
          });
      },
    }),
    [tree],
  );

  const items = tree.getItems();

  return (
    <div
      {...tree.getContainerProps("Project files")}
      className="flex flex-col gap-0.5"
    >
      {items.map((item) => (
        <Row
          key={item.getId()}
          item={item}
          project={project}
          trashAvailable={trashAvailable}
          rename={rename}
          createFolder={createFolder}
          remove={remove}
        />
      ))}
      {items.length === 0 ? (
        <p className="flex items-center gap-2 px-1 py-1 text-xs text-muted-foreground">
          {rootLoaded ? (
            "Empty folder."
          ) : (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Loading…
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}

function Row({
  item,
  project,
  trashAvailable,
  rename,
  createFolder,
  remove,
}: {
  item: ItemInstance<FileEntry>;
  project: string;
  trashAvailable: boolean;
  rename: (path: string, name: string) => void;
  createFolder: (parent: string, name: string) => void;
  remove: (path: string) => void;
}) {
  const entry = item.getItemData();
  const folder = item.isFolder();

  return (
    <EntryContextMenu
      project={project}
      path={item.getId()}
      name={entry.name}
      kind={entry.kind}
      trashAvailable={trashAvailable}
      rename={rename}
      createFolder={createFolder}
      remove={remove}
    >
      <div
        {...item.getProps()}
        style={{ paddingLeft: `${item.getItemMeta().level * 12 + 4}px` }}
        className="flex items-center gap-1.5 rounded-none py-1 pr-2 text-xs outline-none transition-colors hover:bg-muted/60 focus-visible:bg-accent"
      >
        {folder ? (
          item.isLoading() ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <ChevronRight
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                item.isExpanded() && "rotate-90",
              )}
            />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {folder ? (
          <Folder className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <File className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        {item.isRenaming() ? (
          <input
            {...item.getRenameInputProps()}
            className="h-6 w-full min-w-0 rounded-none border border-input bg-transparent px-1.5 font-mono text-xs outline-none focus-visible:border-ring"
          />
        ) : (
          <span className="truncate">{entry.name}</span>
        )}
      </div>
    </EntryContextMenu>
  );
}
