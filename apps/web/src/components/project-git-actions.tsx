import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace-welcome/ui/components/dialog";
import { Input } from "@workspace-welcome/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@workspace-welcome/ui/components/select";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { useTRPC } from "@/utils/trpc";

/**
 * The slice of a one-shot git mutation object these controls need. The
 * mutations themselves live in the project page so the shared `gitBusy`
 * gate covers every git op; the handlers passed here compose with the
 * page-level toasts via react-query's per-call callbacks.
 */
interface GitAction {
  isPending: boolean;
  mutate: (
    vars: { path: string },
    handlers?: { onSuccess?: () => void },
  ) => void;
}

/** Same contract for the branch-scoped mutations (fetch / switch). */
interface BranchGitAction {
  isPending: boolean;
  mutate: (
    vars: { path: string; branch: string },
    handlers?: { onSuccess?: () => void },
  ) => void;
}

/** "a", "b", "c" → "a, b and c" — for the escalated switch warning. */
function joinAnd(parts: string[]): string {
  const last = parts.at(-1);
  if (parts.length < 2 || last === undefined) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${last}`;
}

interface GitActionsToolbarProps {
  path: string;
  /** Shared gate: while any git op runs, every control rests. */
  gitBusy: boolean;
  fetch: GitAction;
  pull: GitAction;
  push: GitAction;
  fetchBranch: BranchGitAction;
}

/**
 * The git InfoCell header controls: Fetch, fetch-one-branch (the chevron
 * beside Fetch opens a picker dialog), Pull, Push. All four run through the
 * same `gitBusy` gate; the spinners mark their own mutation only.
 */
export function GitActionsToolbar({
  path,
  gitBusy,
  fetch,
  pull,
  push,
  fetchBranch,
}: GitActionsToolbarProps) {
  const trpc = useTRPC();

  const [pickOpen, setPickOpen] = useState(false);
  const [remoteBranch, setRemoteBranch] = useState<string | null>(null);
  const [customBranch, setCustomBranch] = useState("");

  // The origin branch list only matters while the picker is open — kept
  // lazy so browsing project pages never spawns a git call.
  const branches = useQuery(
    trpc.projects.branches.queryOptions({ path }, { enabled: pickOpen }),
  );

  // Exactly one of the two ways must be filled; the branch name itself is
  // validated server-side (same schema as the API), toasts surface errors.
  const customName = customBranch.trim();
  const fromList = remoteBranch !== null;
  const fromCustom = customName !== "";
  const bothPicked = fromList && fromCustom;
  const branch = remoteBranch ?? customName;
  const canFetch = branch !== "" && !bothPicked;

  const submitFetchBranch = () => {
    if (!canFetch) return;
    fetchBranch.mutate(
      { path, branch },
      {
        onSuccess: () => {
          setRemoteBranch(null);
          setCustomBranch("");
          setPickOpen(false);
        },
      },
    );
  };

  const hint = bothPicked
    ? { warn: true, text: "Pick one way — the list or a name, not both." }
    : branches.isError
      ? {
          warn: true,
          text: "Couldn't list origin branches — type a name instead.",
        }
      : branches.isLoading
        ? { warn: false, text: "Loading origin branches…" }
        : { warn: false, text: "Choose from the list or type a branch name." };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        size="xs"
        variant="outline"
        disabled={gitBusy}
        onClick={() => fetch.mutate({ path })}
      >
        <RefreshCw className={cn("size-3", fetch.isPending && "animate-spin")} />
        Fetch
      </Button>
      <Button
        size="icon-xs"
        variant="outline"
        disabled={gitBusy}
        onClick={() => setPickOpen(true)}
        title="Fetch a single branch…"
        aria-label="Fetch a single branch"
      >
        <ChevronDown className="size-3" />
      </Button>
      <Button size="xs" disabled={gitBusy} onClick={() => pull.mutate({ path })}>
        <ArrowDownToLine className="size-3" /> Pull
      </Button>
      <Button size="xs" disabled={gitBusy} onClick={() => push.mutate({ path })}>
        <ArrowUpToLine className={cn("size-3", push.isPending && "animate-spin")} />{" "}
        Push
      </Button>

      <Dialog
        open={pickOpen}
        onOpenChange={(open) => {
          setPickOpen(open);
          if (open) {
            // Fresh choices every time the dialog opens.
            setRemoteBranch(null);
            setCustomBranch("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fetch a branch from origin</DialogTitle>
            <DialogDescription>
              Brings one branch&rsquo;s refs down to your repo without touching
              the working tree.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              submitFetchBranch();
            }}
          >
            <Select
              value={remoteBranch}
              onValueChange={(value) => setRemoteBranch(value)}
            >
              <SelectTrigger
                className="w-full"
                aria-invalid={bothPicked}
                aria-label="Origin branch"
              >
                <SelectValue placeholder="origin branch…" />
              </SelectTrigger>
              <SelectContent>
                {(branches.data?.remote ?? []).map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={customBranch}
              onChange={(e) => setCustomBranch(e.target.value)}
              placeholder="or branch name"
              aria-label="Branch name"
              aria-invalid={bothPicked}
              className="font-mono"
            />
            <p
              className={cn("text-xs", !hint.warn && "text-muted-foreground")}
              style={hint.warn ? { color: "var(--sev-warn)" } : undefined}
            >
              {hint.text}
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPickOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canFetch || gitBusy}>
                {fetchBranch.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ArrowDownToLine className="size-3.5" />
                )}
                Fetch branch
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface BranchSwitcherProps {
  path: string;
  /** Currently checked-out branch; null = detached HEAD. */
  branch: string | null;
  gitBusy: boolean;
  switchBranch: BranchGitAction;
}

/**
 * The branch label in the git InfoCell doubles as the switch affordance:
 * clicking it opens a picker (local + remote groups), and picking a branch
 * walks into a confirmation that checks the repo for in-flight work before
 * letting the switch through.
 */
export function BranchSwitcher({
  path,
  branch,
  gitBusy,
  switchBranch,
}: BranchSwitcherProps) {
  const trpc = useTRPC();

  const [open, setOpen] = useState(false);
  // null = still picking; a branch name = showing the confirmation step.
  const [picked, setPicked] = useState<string | null>(null);

  // Both reads are scoped to the dialog's lifetime: fresh data exactly when
  // the user is choosing, no git calls while they're merely looking around.
  const branches = useQuery(
    trpc.projects.branches.queryOptions({ path }, { enabled: open }),
  );
  const safety = useQuery(
    trpc.projects.switchSafety.queryOptions({ path }, { enabled: open }),
  );

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
    switchBranch.mutate(
      { path, branch: picked },
      {
        onSuccess: () => {
          setPicked(null);
          setOpen(false);
        },
      },
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        disabled={gitBusy}
        title="Switch branch"
        className="inline-flex items-center gap-0.5 font-mono transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        {branch ?? <span className="text-muted-foreground">detached</span>}
        <ChevronDown className="size-3 text-muted-foreground" />
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
                      : branches.isLoading
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
                        style={{ color: "var(--sev-warn)" }}
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
                    style={{ color: "var(--sev-warn)" }}
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
                  disabled={gitBusy}
                  onClick={confirmSwitch}
                >
                  {switchBranch.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
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
