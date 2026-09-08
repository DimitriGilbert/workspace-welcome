import { useMemo, useState } from "react";
import { toast } from "sonner";

import { buildCloneScript } from "@workspace-welcome/api/lib/clone-script";
import type { Project } from "@workspace-welcome/api/lib/types";

export interface UseCloneScriptOptions {
  /** The working set (search-filtered) projects to pick from. */
  projects: Project[];
  /** Fired after a successful copy, once the success toast is shown. */
  onCopied?: () => void;
}

/**
 * Container-independent clone-script picker logic (P4): the selection state
 * keyed by project path, the all/none helpers, the `buildCloneScript`
 * derivation, and the copy/download actions. Mirrors `useAddRoot`: render
 * nothing with it — a container binds its own list chrome to `toggle` and
 * calls `copy`/`download` from its buttons.
 *
 * Only projects with a parseable remote are selectable — there is nothing to
 * clone otherwise. The selection persists across working-set changes for
 * paths still present; stale paths drop out of the derived selection
 * implicitly (the script is always derived from the intersection).
 */
export function useCloneScript({ projects, onCopied }: UseCloneScriptOptions) {
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

  const all = () => setSelected(new Set(cloneable.map((p) => p.path)));
  const none = () => setSelected(new Set());

  const selectedProjects = useMemo(
    () => cloneable.filter((p) => selected.has(p.path)),
    [cloneable, selected],
  );

  const script = useMemo(
    () =>
      buildCloneScript(
        selectedProjects.map((p) => ({ name: p.name, remote: p.git.remote })),
      ),
    [selectedProjects],
  );

  /** Repos the script will actually clone (dedupe may collapse the set). */
  const cloneCount = (script.match(/^  git clone "/gm) ?? []).length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      toast.success("Script copied to clipboard");
      onCopied?.();
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  const download = () => {
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

  return {
    // Cloneable projects (repo + parsed remote) in working-set order.
    cloneable,
    // Selected paths — may contain paths whose project left the filter.
    selected,
    // Effective selection: selected ∩ cloneable, drives the script.
    selectedProjects,
    toggle,
    // Select every cloneable project in the current working set.
    all,
    // Clear the selection.
    none,
    // The generated bash script (re-runnable, forces SSH).
    script,
    // Repos the script clones after slug dedupe.
    cloneCount,
    // Copy the script to the clipboard; toasts the outcome.
    copy,
    // Download the script as `clone-projects.sh`.
    download,
  };
}

export type UseCloneScriptResult = ReturnType<typeof useCloneScript>;
