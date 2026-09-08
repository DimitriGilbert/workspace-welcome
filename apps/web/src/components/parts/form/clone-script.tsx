import { Check, Copy, Download } from "lucide-react";

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
import { Separator } from "@workspace-welcome/ui/components/separator";

import { hostLabel } from "@/lib/icons";
import { relativeTime } from "@/lib/format";
import { useCloneScript } from "@/lib/forms";

import { useWorkspace } from "@/lib/contexts/workspace-context";

/**
 * FormCloneScript — the bootstrap-clone picker in a token-styled ui Dialog
 * (master plan §3.5), over the new `useCloneScript` (`@/lib/forms`). The
 * working set comes from `useWorkspace().projects` — the part mirrors the
 * dashboard's current filter, so you can narrow and then select-all within
 * it. Only projects with a parseable remote are selectable; the script
 * clones each repo (SSH) into its working directory and is re-runnable.
 */
export function FormCloneScript({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const workspace = useWorkspace();
  const picker = useCloneScript({ projects: workspace.projects });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[85vh] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Clone script</DialogTitle>
          <DialogDescription>
            Pick the repos to clone on a new machine. The script clones each
            into its working directory over SSH.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 pt-0">
          {/* Selection controls */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {picker.selectedProjects.length} of {picker.cloneable.length}{" "}
              selected
              {picker.cloneCount > 0
                ? ` · ${picker.cloneCount} clone${picker.cloneCount === 1 ? "" : "s"}`
                : ""}
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="xs" onClick={picker.all}>
                <Check className="size-3" aria-hidden /> All
              </Button>
              <Button variant="ghost" size="xs" onClick={picker.none}>
                None
              </Button>
            </div>
          </div>

          {picker.cloneable.length === 0 ? (
            <p className="rounded-none border border-dashed p-6 text-center text-xs text-muted-foreground">
              No projects with a remote in the current filter. Nothing to
              clone.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5 rounded-none border border-foreground/10">
              {picker.cloneable.map((p) => {
                const checked = picker.selected.has(p.path);
                return (
                  <label
                    key={p.path}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => picker.toggle(p.path)}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-medium">
                          {p.name}
                        </span>
                        {p.git.remote ? (
                          <Badge variant="secondary">
                            {hostLabel(p.git.remote.host)}
                          </Badge>
                        ) : null}
                        {p.git.branch ? (
                          <span className="hidden shrink-0 font-mono text-[0.7rem] text-muted-foreground sm:inline">
                            {p.git.branch}
                          </span>
                        ) : null}
                      </div>
                      {p.git.remote?.slug ? (
                        <span className="truncate font-mono text-[0.7rem] text-muted-foreground">
                          {p.git.remote.slug}
                        </span>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-[0.7rem] tabular-nums text-muted-foreground">
                      {relativeTime(p.updatedAt)}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {/* Output panel — appears once at least one repo will clone */}
          {picker.cloneCount > 0 ? (
            <>
              <Separator />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">
                  Script · {picker.cloneCount} repo
                  {picker.cloneCount === 1 ? "" : "s"}
                </span>
                <div className="flex gap-1">
                  <Button size="xs" onClick={() => void picker.copy()}>
                    <Copy className="size-3" aria-hidden /> Copy
                  </Button>
                  <Button size="xs" variant="outline" onClick={picker.download}>
                    <Download className="size-3" aria-hidden /> .sh
                  </Button>
                </div>
              </div>
              <textarea
                readOnly
                value={picker.script}
                spellCheck={false}
                aria-label="Generated clone script"
                className="h-64 w-full shrink-0 resize-none rounded-none border border-foreground/10 bg-muted/30 p-3 font-mono text-[0.7rem] leading-relaxed text-foreground outline-none"
              />
              <p className="text-[0.7rem] text-muted-foreground">
                Run from the directory you want the repos in. Forces SSH —
                make sure your keys are set up with each host first.
              </p>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
