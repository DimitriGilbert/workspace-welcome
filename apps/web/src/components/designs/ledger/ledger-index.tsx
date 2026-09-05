import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  EyeOff,
  Folder,
  MoreHorizontal,
  Pin,
  PinOff,
  Terminal as TerminalIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@workspace-welcome/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace-welcome/ui/components/dropdown-menu";
import type { Project } from "@workspace-welcome/api/lib/types";

import { AlertIcons } from "@/components/git-badges";
import { dateTooltip, relativeTime } from "@/lib/format";
import { hostLabel, stackIcon } from "@/lib/icons";
import { useOpenProject } from "@/lib/open-project";
import { useTRPC } from "@/utils/trpc";

export interface IndexedEntry {
  project: Project;
  /** Continuous row number across the whole index, zero-padded. */
  folio: string;
}

export interface LedgerGroup {
  key: string;
  title: string;
  entries: IndexedEntry[];
  /** Archive rows rest at a lower opacity until hovered. */
  dim: boolean;
}

interface LedgerIndexProps {
  groups: LedgerGroup[];
  total: number;
  shown: number;
  filtering: boolean;
}

/**
 * The index proper: one continuous typeset table instead of a card grid.
 * Groups (Pinned, In rotation, Archive) share column captions and a
 * continuous folio numbering, so the eye scans one ledger rather than
 * thirty boxes. Columns appear as width allows; on phones each entry
 * folds to a two-line index card.
 */
export function LedgerIndex({
  groups,
  total,
  shown,
  filtering,
}: LedgerIndexProps) {
  return (
    <section aria-label="Project index">
      {filtering ? (
        <p className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
          showing {shown} of {total} entries
        </p>
      ) : null}

      <div className="ledger-cols ledger-row mt-2" aria-hidden>
        <span className="c-no ledger-cap">No.</span>
        <span className="c-entry">Entry</span>
        <span className="c-branch">Branch</span>
        <span className="c-sync ledger-num-cell ledger-cap">Sync</span>
        <span className="c-files ledger-num-cell ledger-cap">Files</span>
        <span className="c-commit ledger-cap">Last commit</span>
        <span className="c-updated ledger-num-cell ledger-cap">Updated</span>
        <span className="c-actions" />
      </div>

      {groups.map((group) => (
        <div key={group.key} className="mt-5">
          <div className="ledger-section-head px-3">
            <h3>{group.title}</h3>
            <span className="ledger-section-count">
              {group.entries.length}
            </span>
            <span className="ledger-section-rule" aria-hidden />
          </div>
          <ul className="ledger-rows mt-1">
            {group.entries.map(({ project, folio }) => (
              <LedgerRow
                key={project.path}
                project={project}
                folio={folio}
                dim={group.dim}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function LedgerRow({
  project,
  folio,
  dim,
}: {
  project: Project;
  folio: string;
  dim: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const openProject = useOpenProject();

  const invalidateScan = () =>
    queryClient.invalidateQueries({ queryKey: trpc.projects.scan.queryKey() });

  const pinMutation = useMutation(
    trpc.projects.setPinned.mutationOptions({
      onSuccess: () => invalidateScan(),
      onError: (e) => toast.error(e.message),
    }),
  );
  const hideMutation = useMutation(
    trpc.projects.setHidden.mutationOptions({
      onSuccess: () => {
        invalidateScan();
        toast.success("Project hidden", {
          action: {
            label: "Undo",
            onClick: () =>
              hideMutation.mutate({ path: project.path, hidden: false }),
          },
        });
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const openMutation = useMutation(
    trpc.projects.open.mutationOptions({
      onSuccess: (data) => toast.success(data.message),
      onError: (e) => toast.error(e.message),
    }),
  );
  const touchMutation = useMutation(
    trpc.projects.touchLastOpened.mutationOptions({
      onSuccess: () => invalidateScan(),
    }),
  );

  const open = (target: "editor" | "terminal" | "folder") => {
    openMutation.mutate({ path: project.path, target });
    touchMutation.mutate({ path: project.path });
  };

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(project.path);
      toast.success("Path copied");
    } catch {
      toast.error("Couldn't copy path");
    }
  };

  const git = project.git;
  const ahead = git.ahead ?? 0;
  const behind = git.behind ?? 0;
  const dirty = git.dirtyCount ?? 0;
  // "Updated" lights up only for genuinely fresh work (48h), keyed off
  // updatedAt alone, matching the dashboard card's convention.
  const updatedHot =
    Date.now() - new Date(project.updatedAt).getTime() < 48 * 60 * 60 * 1000;
  const StackIcon = stackIcon(project.stack?.id);

  const branchLabel = git.isRepo
    ? [git.remote ? hostLabel(git.remote.host) : null, git.branch ?? "no branch"]
        .filter(Boolean)
        .join(" / ")
    : "unversioned";

  return (
    <li
      className={"ledger-row" + (dim ? " is-dim" : "")}
      onClick={(e) => {
        // Buttons and links own their own actions; anywhere else on the
        // row opens the project, mirroring the dashboard card.
        if ((e.target as HTMLElement).closest("button, a")) return;
        openProject(project.path);
      }}
    >
      <span className="c-no ledger-serif" aria-hidden>
        {folio}
      </span>

      <span className="c-entry flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
        <StackIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <button
          type="button"
          onClick={() => openProject(project.path)}
          className="ledger-name-btn ledger-serif truncate text-[1.08rem] font-medium"
        >
          {project.name}
        </button>
        <AlertIcons alerts={project.alerts} />
      </span>

      <span
        className="c-branch ledger-mono-cell"
        title={git.isRepo ? (git.branch ?? "no branch") : "not a git repository"}
      >
        {branchLabel}
      </span>

      <span className="c-sync ledger-num-cell font-mono text-[0.7rem] tabular-nums">
        {ahead > 0 ? (
          <span className="inline-flex items-center gap-0.5 text-positive">
            <ArrowUp className="size-3" aria-hidden />
            {ahead}
          </span>
        ) : null}
        {behind > 0 ? (
          <span className="inline-flex items-center gap-0.5 text-sev-warn">
            <ArrowDown className="size-3" aria-hidden />
            {behind}
          </span>
        ) : null}
        {ahead === 0 && behind === 0 ? (
          <span className="text-muted-foreground">&plusmn;0</span>
        ) : null}
      </span>

      <span
        className={
          "c-files ledger-num-cell font-mono text-[0.7rem] tabular-nums" +
          (dirty > 0 ? " font-medium text-foreground" : "")
        }
      >
        {dirty > 0 ? dirty : <span className="text-muted-foreground">0</span>}
      </span>

      <span
        className="c-commit ledger-commit-cell ledger-mono-cell"
        title={
          git.lastCommit
            ? `${git.lastCommit.author}${git.lastCommit.date ? `, ${dateTooltip(git.lastCommit.date)}` : ""}`
            : undefined
        }
      >
        {git.lastCommit?.message ?? ""}
      </span>

      <span
        className={
          "c-updated ledger-num-cell font-mono text-[0.7rem] tabular-nums" +
          (updatedHot ? " font-medium text-recency-fresh" : "")
        }
        title={dateTooltip(project.updatedAt)}
      >
        {relativeTime(project.updatedAt)}
      </span>

      <span className="c-actions flex items-center justify-end gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={project.pinned ? "Unpin project" : "Pin project"}
          disabled={pinMutation.isPending}
          onClick={() =>
            pinMutation.mutate({ path: project.path, pinned: !project.pinned })
          }
        >
          {project.pinned ? (
            <PinOff className="size-3.5" aria-hidden />
          ) : (
            <Pin className="size-3.5" aria-hidden />
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${project.name}`}
              />
            }
          >
            <MoreHorizontal className="size-3.5" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem onClick={() => open("editor")}>
              <Folder className="size-3.5" /> Open in editor
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => open("terminal")}>
              <TerminalIcon className="size-3.5" /> Open terminal
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => open("folder")}>
              <Folder className="size-3.5" /> Reveal in file manager
            </DropdownMenuItem>
            {git.remote ? (
              <DropdownMenuItem
                onClick={() => window.open(git.remote?.links.web, "_blank")}
              >
                <ExternalLink className="size-3.5" /> Open repo
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={copyPath}>
              <Copy className="size-3.5" /> Copy path
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => hideMutation.mutate({ path: project.path, hidden: true })}
              className="text-destructive"
            >
              <EyeOff className="size-3.5" /> Hide from list
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </li>
  );
}
