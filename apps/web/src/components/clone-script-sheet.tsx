import { useMemo, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace-welcome/ui/components/sheet";
import { Button } from "@workspace-welcome/ui/components/button";
import { Badge } from "@workspace-welcome/ui/components/badge";
import { Checkbox } from "@workspace-welcome/ui/components/checkbox";
import { Separator } from "@workspace-welcome/ui/components/separator";
import { buildCloneScript } from "@workspace-welcome/api/lib/clone-script";
import type { Project } from "@workspace-welcome/api/lib/types";

import { hostLabel } from "@/lib/icons";
import { relativeTime } from "@/lib/format";

interface CloneScriptSheetProps {
  /** All visible (search-filtered) projects from the dashboard. */
  projects: Project[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Picker that builds a bootstrap clone script from the selected projects.
 *
 * Only projects with a parseable remote are selectable — there's nothing to
 * clone otherwise. The list mirrors the dashboard's current filter, so you can
 * narrow to e.g. `github main` and select-all-within-filter to grab just those.
 * The generated script clones each repo (SSH) into its working directory and
 * is re-runnable.
 */
export function CloneScriptSheet({
  projects,
  open,
  onOpenChange,
}: CloneScriptSheetProps) {
  // Selection is keyed by project path. Persisted across filter changes only
  // for paths still present; reset is handled implicitly when the sheet closes.
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

  const selectAll = () =>
    setSelected(new Set(cloneable.map((p) => p.path)));
  const selectNone = () => setSelected(new Set());

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Clone script</SheetTitle>
          <SheetDescription>
            Pick the repos to clone on a new machine. The script clones each
            into its working directory over SSH.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 p-4">
          {/* Selection controls */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {selected.size} of {cloneable.length} selected
              {cloneCount > 0 ? ` · ${cloneCount} clone${cloneCount === 1 ? "" : "s"}` : ""}
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="xs" onClick={selectAll}>
                <Check className="size-3" /> All
              </Button>
              <Button variant="ghost" size="xs" onClick={selectNone}>
                None
              </Button>
            </div>
          </div>

          {cloneable.length === 0 ? (
            <p className="rounded-none border border-dashed p-6 text-center text-xs text-muted-foreground">
              No projects with a remote in the current filter. Nothing to clone.
            </p>
          ) : (
            <div className="flex max-h-[40vh] flex-col gap-0.5 overflow-y-auto rounded-none border border-foreground/10">
              {cloneable.map((p) => {
                const checked = selected.has(p.path);
                return (
                  <label
                    key={p.path}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/50"
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggle(p.path)} />
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
          {cloneCount > 0 ? (
            <>
              <Separator />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">
                  Script · {cloneCount} repo{cloneCount === 1 ? "" : "s"}
                </span>
                <div className="flex gap-1">
                  <Button size="xs" variant="default" onClick={copyScript}>
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
                className="h-64 w-full resize-none rounded-none border border-foreground/10 bg-muted/30 p-3 font-mono text-[0.7rem] leading-relaxed text-foreground outline-none"
              />
              <p className="text-[0.7rem] text-muted-foreground">
                Run from the directory you want the repos in. Forces SSH — make
                sure your keys are set up with each host first.
              </p>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
