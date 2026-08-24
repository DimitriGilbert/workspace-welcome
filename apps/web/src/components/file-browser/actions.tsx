import { ArrowDownToLine, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@workspace-welcome/ui/components/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace-welcome/ui/components/dialog";
import { Button } from "@workspace-welcome/ui/components/button";
import { Input } from "@workspace-welcome/ui/components/input";

/** Mirrors the server's bare-name rule (files.ts) for immediate feedback. */
function validName(raw: string): boolean {
  const t = raw.trim();
  return t !== "" && t !== "." && t !== ".." && !t.includes("/");
}

interface EntryContextMenuProps {
  project: string;
  /** Relative path of the right-clicked entry, "/"-joined from the root. */
  path: string;
  name: string;
  kind: "dir" | "file";
  /** From files.list — drives the delete copy (ADR-0002). */
  trashAvailable: boolean;
  rename: (path: string, name: string) => void;
  createFolder: (parent: string, name: string) => void;
  remove: (path: string) => void;
  children: ReactNode;
}

/**
 * Context menu plus the rename / new-folder / delete-confirm dialogs for one
 * tree row. The delete confirmation is labelled by `trashAvailable` — trash
 * when `gio` exists, an explicitly permanent delete otherwise — while the
 * toast for the actual mode comes from the mutation result in the
 * FileBrowser, so a wrong guess can never mislead silently.
 */
export function EntryContextMenu({
  project,
  path,
  name,
  kind,
  trashAvailable,
  rename,
  createFolder,
  remove,
  children,
}: EntryContextMenuProps) {
  const [dialog, setDialog] = useState<"rename" | "folder" | "delete" | null>(
    null,
  );
  const [draft, setDraft] = useState("");

  const submitRename = () => {
    const trimmed = draft.trim();
    if (!validName(trimmed) || trimmed === name) return;
    rename(path, trimmed);
    setDialog(null);
  };

  const submitFolder = () => {
    const trimmed = draft.trim();
    if (!validName(trimmed)) return;
    createFolder(path, trimmed);
    setDialog(null);
  };

  // The server sets content-disposition; `download` just forces saving
  // instead of navigating (which would 404 for non-previewable types).
  const downloadUrl = `/api/files/download?project=${encodeURIComponent(project)}&path=${encodeURIComponent(path)}`;

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          {kind === "file" ? (
            <ContextMenuItem render={<a href={downloadUrl} download />}>
              <ArrowDownToLine /> Download
            </ContextMenuItem>
          ) : null}
          <ContextMenuItem
            onClick={() => {
              setDraft(name);
              setDialog("rename");
            }}
          >
            <Pencil /> Rename…
          </ContextMenuItem>
          {kind === "dir" ? (
            <ContextMenuItem
              onClick={() => {
                setDraft("");
                setDialog("folder");
              }}
            >
              <FolderPlus /> New folder…
            </ContextMenuItem>
          ) : null}
          <ContextMenuItem
            variant="destructive"
            onClick={() => setDialog("delete")}
          >
            <Trash2 /> Delete…
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        {dialog === "rename" || dialog === "folder" ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {dialog === "rename"
                  ? `Rename "${name}"`
                  : `New folder in "${name}"`}
              </DialogTitle>
              <DialogDescription>
                {dialog === "rename"
                  ? "The new name applies inside its folder."
                  : "Created directly inside the folder you clicked."}
              </DialogDescription>
            </DialogHeader>
            <form
              className="flex flex-col gap-3 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (dialog === "rename") submitRename();
                else if (dialog === "folder") submitFolder();
              }}
            >
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                className="font-mono"
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDialog(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    !validName(draft) ||
                    (dialog === "rename" && draft.trim() === name)
                  }
                >
                  {dialog === "rename" ? "Rename" : "Create folder"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        ) : (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {trashAvailable ? "Move to trash?" : "Delete permanently?"}
              </DialogTitle>
              <DialogDescription>
                {trashAvailable
                  ? `"${name}" can be restored from the file manager's trash.`
                  : `gio not found — no trash available.${
                      kind === "dir"
                        ? " The folder and everything inside it is removed for good."
                        : " This cannot be undone."
                    }`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setDialog(null);
                  remove(path);
                }}
              >
                {trashAvailable ? "Move to trash" : "Delete permanently"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
