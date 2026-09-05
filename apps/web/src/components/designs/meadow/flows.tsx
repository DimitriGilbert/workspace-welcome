/**
 * Meadow's form containers — dialogs in the soft daylight register, no side
 * panels anywhere. The heavy lifting is container-independent:
 *
 *   - Create project: @/lib/forms CreateProjectFlow (wizard + scaffold job)
 *     inside a wide soft dialog.
 *   - Add directory: @/lib/forms useAddRoot bound to two fields.
 *   - Clone script: a compact picker dialog over buildCloneScript.
 *
 * Chrome (titles, close buttons, toasts, invalidation) lives here; the
 * flows themselves stay shared.
 */

import { useMemo, useState } from "react";
import { Check, Copy, Download, FolderPlus } from "lucide-react";
import { toast } from "sonner";

import { buildCloneScript } from "@workspace-welcome/api/lib/clone-script";
import { Badge } from "@workspace-welcome/ui/components/badge";
import { Button } from "@workspace-welcome/ui/components/button";
import { Checkbox } from "@workspace-welcome/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace-welcome/ui/components/dialog";
import { Input } from "@workspace-welcome/ui/components/input";
import { Label } from "@workspace-welcome/ui/components/label";
import type { Project } from "@workspace-welcome/api/lib/types";

import { CreateProjectFlow } from "@/lib/forms";
import { useAddRoot } from "@/lib/forms";
import { hostLabel } from "@/lib/icons";
import { relativeTime } from "@/lib/format";

// --- Create project -------------------------------------------------------------

export interface MeadowCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (projectDirectory: string) => void;
  onError: (message: string) => void;
  onRequestAddRoot: () => void;
}

export function MeadowCreateDialog({
  open,
  onOpenChange,
  onSuccess,
  onError,
  onRequestAddRoot,
}: MeadowCreateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="meadow-dialog flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-foreground/5 px-5 py-4">
          <DialogTitle className="text-base font-semibold tracking-tight">
            Plant a new project
          </DialogTitle>
          <DialogDescription>
            Scaffold a better-t-stack project into one of your directories —
            the wizard runs the real CLI and streams its progress here.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <CreateProjectFlow
            open={open}
            onSuccess={(result) => {
              onSuccess(result.projectDirectory);
              onOpenChange(false);
            }}
            onError={onError}
            onRequestAddRoot={() => {
              onOpenChange(false);
              onRequestAddRoot();
            }}
            onClose={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Add directory ----------------------------------------------------------------

export interface MeadowAddRootDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MeadowAddRootDialog({
  open,
  onOpenChange,
}: MeadowAddRootDialogProps) {
  const addRoot = useAddRoot({ onClose: () => onOpenChange(false) });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="meadow-dialog sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight">
            Add a directory
          </DialogTitle>
          <DialogDescription>
            Point Meadow at a folder of projects — its subdirectories are
            scanned for git repos, stacks, and health signals.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            addRoot.submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meadow-root-path">Absolute path</Label>
            <Input
              id="meadow-root-path"
              value={addRoot.path}
              onChange={(e) => addRoot.setPath(e.target.value)}
              placeholder="/home/you/projects"
              className="font-mono text-xs"
              autoFocus
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meadow-root-label">
              Label <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="meadow-root-label"
              value={addRoot.label}
              onChange={(e) => addRoot.setLabel(e.target.value)}
              placeholder="work"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!addRoot.canSubmit}>
              <FolderPlus aria-hidden className="size-3.5" />
              {addRoot.isPending ? "Adding…" : "Add directory"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Clone script -----------------------------------------------------------------

export interface MeadowCloneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All visible (search-filtered) projects from the dashboard. */
  projects: Project[];
}

export function MeadowCloneDialog({
  open,
  onOpenChange,
  projects,
}: MeadowCloneDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const cloneable = useMemo(
    () => projects.filter((p) => p.git.isRepo && p.git.remote),
    [projects],
  );

  const toggle = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectedProjects = cloneable.filter((p) => selected.has(p.path));
  const script = useMemo(
    () =>
      buildCloneScript(
        selectedProjects.map((p) => ({
          name: p.name,
          remote: p.git.remote,
        })),
      ),
    [selectedProjects],
  );
  const cloneCount = (script.match(/^  git clone "/gm) ?? []).length;

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(script);
      toast.success("Script copied to clipboard");
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  const downloadScript = () => {
    const blob = new Blob([script], { type: "text/x-shellscript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "clone-projects.sh";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="meadow-dialog flex max-h-[85vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight">
            Clone script
          </DialogTitle>
          <DialogDescription>
            Pick the repos to clone on a new machine — the script mirrors the
            current dashboard filter's projects over SSH.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {selected.size} of {cloneable.length} selectable
              {cloneCount > 0
                ? ` · ${cloneCount} clone${cloneCount === 1 ? "" : "s"}`
                : ""}
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setSelected(new Set(cloneable.map((p) => p.path)))}
              >
                <Check className="size-3" /> All
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setSelected(new Set())}
              >
                None
              </Button>
            </div>
          </div>

          {cloneable.length === 0 ? (
            <p className="meadow-soft-block rounded-2xl border border-dashed p-6 text-center text-xs text-muted-foreground">
              No projects with a remote in the current filter. Nothing to
              clone.
            </p>
          ) : (
            <div className="meadow-soft-block flex max-h-[34vh] flex-col gap-0.5 overflow-y-auto p-1">
              {cloneable.map((p) => {
                const checked = selected.has(p.path);
                return (
                  <label
                    key={p.path}
                    className="flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-1.5 transition-colors hover:bg-accent/50"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(p.path)}
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-medium">
                          {p.name}
                        </span>
                        {p.git.remote ? (
                          <Badge variant="secondary">
                            {hostLabel(p.git.remote.host)}
                          </Badge>
                        ) : null}
                        <span className="ml-auto shrink-0 text-[0.65rem] tabular-nums text-muted-foreground">
                          {relativeTime(p.updatedAt)}
                        </span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {cloneCount > 0 ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">
                  Script · {cloneCount} repo{cloneCount === 1 ? "" : "s"}
                </span>
                <div className="flex gap-1">
                  <Button size="xs" onClick={copyScript}>
                    <Copy className="size-3" /> Copy
                  </Button>
                  <Button size="xs" variant="outline" onClick={downloadScript}>
                    <Download className="size-3" /> .sh
                  </Button>
                </div>
              </div>
              <textarea
                readOnly
                value={script}
                spellCheck={false}
                className="meadow-soft-block h-44 w-full resize-none p-3 font-mono text-[0.7rem] leading-relaxed text-foreground outline-none"
              />
              <p className="text-[0.7rem] text-muted-foreground">
                Run from the directory you want the repos in. Forces SSH — make
                sure your keys are set up with each host first.
              </p>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
