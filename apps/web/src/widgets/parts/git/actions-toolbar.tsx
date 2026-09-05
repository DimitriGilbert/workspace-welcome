import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  Loader2,
  RefreshCw,
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace-welcome/ui/components/select";
import { Chip } from "@workspace-welcome/ui/components/chip";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { useBranchesQuery } from "@/lib/queries/git";

import { useProject } from "@/widgets/contexts/project-context";

/**
 * GitActionsToolbar — Fetch, fetch-one-branch (the chevron beside Fetch
 * opens a picker dialog), Pull, Push (master plan §3.5). All four run
 * through the provider's shared busy gate; the spinners mark their own
 * mutation only.
 *
 * Everything comes from `useProject()` — the path, the busy/diverged gates,
 * and the `fetchRemote`/`pull`/`push`/`fetchBranch` mutation wrappers — so
 * the part carries no props. When the repo is diverged (ahead AND behind) a
 * warning chip appears: a plain pull can't fast-forward and the push will
 * be rejected until the divergence is resolved. The origin branch list is
 * the `lib/queries/git` hook, gated on the picker dialog being open.
 * (The legacy `components/project-git-actions.tsx` keeps its props-driven
 * twin until K5; this is the widget-system instance.)
 */
export function GitActionsToolbar() {
  const project = useProject();
  const { git } = project;
  const busy = git.busy;

  const [pickOpen, setPickOpen] = useState(false);
  const [remoteBranch, setRemoteBranch] = useState<string | null>(null);
  const [customBranch, setCustomBranch] = useState("");

  // The origin branch list only matters while the picker is open — kept
  // lazy so browsing project pages never spawns a git call.
  const branches = useBranchesQuery(project.path, pickOpen);

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
    git.fetchBranch.mutate(branch, {
      onSuccess: () => {
        setRemoteBranch(null);
        setCustomBranch("");
        setPickOpen(false);
      },
    });
  };

  const hint = bothPicked
    ? { warn: true, text: "Pick one way — the list or a name, not both." }
    : branches.isError
      ? {
          warn: true,
          text: "Couldn't list origin branches — type a name instead.",
        }
      : branches.isPending
        ? { warn: false, text: "Loading origin branches…" }
        : { warn: false, text: "Choose from the list or type a branch name." };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        size="xs"
        variant="outline"
        disabled={busy}
        onClick={() => git.fetchRemote.mutate()}
      >
        <RefreshCw className={cn("size-3", git.fetchRemote.isPending && "animate-spin")} aria-hidden />
        Fetch
      </Button>
      <Button
        size="icon-xs"
        variant="outline"
        disabled={busy}
        onClick={() => setPickOpen(true)}
        title="Fetch a single branch…"
        aria-label="Fetch a single branch"
      >
        <ChevronDown className="size-3" aria-hidden />
      </Button>
      <Button size="xs" disabled={busy} onClick={() => git.pull.mutate()}>
        <ArrowDownToLine className="size-3" aria-hidden /> Pull
      </Button>
      <Button size="xs" disabled={busy} onClick={() => git.push.mutate()}>
        <ArrowUpToLine className={cn("size-3", git.push.isPending && "animate-spin")} aria-hidden />{" "}
        Push
      </Button>
      {git.diverged ? (
        <Chip
          tone="warning"
          title="Ahead and behind upstream — pull can't fast-forward; reconcile the divergence before pushing."
        >
          diverged
        </Chip>
      ) : null}

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
              style={hint.warn ? { color: "var(--sev-warning)" } : undefined}
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
              <Button type="submit" disabled={!canFetch || busy}>
                {git.fetchBranch.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <ArrowDownToLine className="size-3.5" aria-hidden />
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
