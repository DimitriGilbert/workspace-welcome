import { useState } from "react";
import { ChevronDown, Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace-welcome/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@workspace-welcome/ui/components/select";

import { useBranchesQuery, useSwitchSafetyQuery } from "@/lib/queries/git";

import { useProject } from "@/widgets/contexts/project-context";

/**
 * BranchSwitcher — the branch label doubles as the switch affordance
 * (master plan §3.5): clicking opens a picker (local + remote groups), and
 * picking a branch walks into a confirmation that probes the repo for
 * in-flight work before letting the switch through.
 *
 * All state comes from `useProject()` — path, current branch, the shared
 * busy gate, and the `switchBranch` mutation wrapper — so the part carries
 * no props at all. The branch list and switch-safety reads go through their
 * `lib/queries/git` hooks, gated on the dialog being open: fresh data
 * exactly when the user is choosing, no git calls while they're merely
 * looking around. (The legacy `components/project-git-actions.tsx` keeps its
 * props-driven twin until K5; this is the widget-system instance.)
 */
export function BranchSwitcher() {
  const project = useProject();
  const branch = project.project?.git.branch ?? null;
  const busy = project.git.busy;
  const switchBranch = project.git.switchBranch;

  const [open, setOpen] = useState(false);
  // null = still picking; a branch name = showing the confirmation step.
  const [picked, setPicked] = useState<string | null>(null);

  // Both reads are scoped to the dialog's lifetime (see docblock above).
  const branches = useBranchesQuery(project.path, open);
  const safety = useSwitchSafetyQuery(project.path, open);

  const locals = branches.data?.local ?? [];
  const remotes = branches.data?.remote ?? [];

  // The switchSafety escalation rule: uncommitted work, a git op in flight,
  // or very recent index activity all mean an agent may be mid-task here.
  const escalated =
    safety.data !== undefined &&
    (safety.data.dirtyCount > 0 ||
      safety.data.gitLock ||
      (safety.data.indexIdleSeconds !== null &&
        safety.data.indexIdleSeconds < 120));

  const reasons: string[] = [];
  if (safety.data !== undefined) {
    if (safety.data.dirtyCount > 0) {
      reasons.push(
        `${safety.data.dirtyCount} uncommitted file${safety.data.dirtyCount === 1 ? "" : "s"}`,
      );
    }
    if (safety.data.gitLock) {
      reasons.push("a git operation in flight");
    }
    if (
      safety.data.indexIdleSeconds !== null &&
      safety.data.indexIdleSeconds < 120
    ) {
      reasons.push(
        `the git index was written ${safety.data.indexIdleSeconds}s ago`,
      );
    }
  }

  // One quiet status line summarizing the probe, in the page's mono voice.
  const safetyLine = safety.data
    ? [
        `dirty ${safety.data.dirtyCount}`,
        safety.data.gitLock ? "index.lock present" : null,
        safety.data.indexIdleSeconds !== null
          ? `index idle ${safety.data.indexIdleSeconds}s`
          : "index state unknown",
        safety.data.ideRunning ? "IDE running" : null,
      ]
        .filter((part): part is string => part !== null)
        .join(" · ")
    : null;

  // Picking a name that only exists on origin relies on git's DWIM: the
  // checkout creates a local branch tracking origin/<name>.
  const needsTrackingBranch = picked !== null && !locals.includes(picked);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setPicked(null);
  };

  const confirmSwitch = () => {
    if (picked === null) return;
    switchBranch.mutate(picked, {
      onSuccess: () => {
        setPicked(null);
        setOpen(false);
      },
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        disabled={busy}
        title="Switch branch"
        className="inline-flex items-center gap-0.5 font-mono text-xs transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        {branch ?? <span className="text-muted-foreground">detached</span>}
        <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          {picked === null ? (
            <>
              <DialogHeader>
                <DialogTitle>Switch branch</DialogTitle>
                <DialogDescription>
                  {branch
                    ? `On ${branch} now — pick a branch to check it out. Remote names get a local branch tracking origin.`
                    : "Detached HEAD — pick a branch to check out. Remote names get a local branch tracking origin."}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3 p-4">
                <Select value={picked} onValueChange={(value) => setPicked(value)}>
                  <SelectTrigger className="w-full" aria-label="Branch">
                    <SelectValue placeholder="Pick a branch…" />
                  </SelectTrigger>
                  <SelectContent>
                    {locals.length > 0 ? (
                      <SelectGroup>
                        <SelectLabel>Local</SelectLabel>
                        {locals.map((b) => (
                          <SelectItem key={b} value={b} disabled={b === branch}>
                            {b}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ) : null}
                    {remotes.length > 0 ? (
                      <SelectGroup>
                        <SelectLabel>Remote</SelectLabel>
                        {remotes.map((b) => (
                          <SelectItem key={b} value={b} disabled={b === branch}>
                            {b}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ) : null}
                  </SelectContent>
                </Select>
                {locals.length === 0 && remotes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {branches.isError
                      ? "Couldn't list branches — check this repo has commits."
                      : branches.isPending
                        ? "Loading branches…"
                        : "No branches found — try Fetch first."}
                  </p>
                ) : null}
                <DialogFooter>
                  <Button
                    variant="ghost"
                    onClick={() => handleOpenChange(false)}
                  >
                    Cancel
                  </Button>
                </DialogFooter>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  {escalated
                    ? `Switch to ${picked} anyway?`
                    : `Switch branch to ${picked}?`}
                </DialogTitle>
                <DialogDescription>
                  {escalated ? (
                    <>
                      <TriangleAlert
                        aria-hidden
                        className="mr-1 inline size-3 align-[-1px]"
                        style={{ color: "var(--sev-warning)" }}
                      />
                      {joinAnd(reasons)} — an agent may be working in this repo
                      right now. Switching could mess up that work.
                    </>
                  ) : (
                    <>
                      Your working tree moves to {picked}.
                      {needsTrackingBranch
                        ? ` No local branch named ${picked} yet — checking it out creates one tracking origin/${picked}.`
                        : ""}
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-1 px-4">
                {safetyLine !== null ? (
                  <p className="font-mono text-[0.65rem] text-muted-foreground">
                    {safetyLine}
                  </p>
                ) : safety.isError ? (
                  <p
                    className="text-xs"
                    style={{ color: "var(--sev-warning)" }}
                  >
                    Couldn&rsquo;t read the working-tree state.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Checking the working tree…
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setPicked(null)}
                  disabled={switchBranch.isPending}
                >
                  Back
                </Button>
                <Button
                  variant={escalated ? "destructive" : "default"}
                  disabled={busy}
                  onClick={confirmSwitch}
                >
                  {switchBranch.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : null}
                  {escalated ? "Switch anyway" : "Switch"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** "a", "b", "c" → "a, b and c" — for the escalated switch warning. */
function joinAnd(parts: string[]): string {
  const last = parts.at(-1);
  if (parts.length < 2 || last === undefined) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${last}`;
}
