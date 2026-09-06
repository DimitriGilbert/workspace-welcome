/**
 * The primary project surface: full-width rule-defined tables, one per
 * section (pinned / active / archive — or a focused view). Rows flood with
 * ink on hover; every control is wired to the same mutations the card grid
 * uses (pin, hide-with-undo, open in editor/terminal/folder, touch).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
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
import { cn } from "@workspace-welcome/ui/lib/utils";
import type { GitInfo, Project } from "@workspace-welcome/api/lib/types";

import { useTRPC } from "@/utils/trpc";
import { dateTooltip, relativeTime } from "@/lib/format";
import { useOpenProject } from "@/lib/open-project";

import { Micro } from "./swiss-panels";
import { isFresh, sortedAlerts } from "./swiss-data";
import type { SwissSection } from "./swiss-data";

function aheadBehindLabel(ahead: number | null, behind: number | null): string {
  const a = ahead ?? 0;
  const b = behind ?? 0;
  if (a === 0 && b === 0) return "±0";
  const parts: string[] = [];
  if (a > 0) parts.push(`+${a}`);
  if (b > 0) parts.push(`−${b}`);
  return parts.join(" ");
}

export function SwissSectionTable({
  section,
  rootLabels,
}: {
  section: SwissSection;
  rootLabels: Map<string, string>;
}) {
  return (
    <section aria-labelledby={`swiss-section-${section.id}`} className="mt-12">
      <div className="flex items-baseline justify-between gap-4 border-t-2 border-foreground pb-1 pt-3">
        <h2
          id={`swiss-section-${section.id}`}
          className="flex items-baseline gap-3 text-[11px] font-semibold uppercase tracking-[0.22em]"
        >
          {section.title}
          <span className="font-mono text-[11px] tracking-normal text-muted-foreground">
            {String(section.projects.length).padStart(2, "0")}
          </span>
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {section.note}
        </span>
      </div>
      <div className="overflow-x-auto pb-px">
        <table className="swiss-table w-full min-w-[680px]">
          <thead>
            <tr>
              <th scope="col" className="hidden w-[4%] md:table-cell">
                №
              </th>
              <th scope="col" className="w-[28%]">
                Project
              </th>
              <th scope="col" className="hidden w-[8%] 2xl:table-cell">
                Root
              </th>
              <th scope="col" className="hidden w-[9%] xl:table-cell">
                Stack
              </th>
              <th scope="col" className="hidden w-[14%] md:table-cell">
                Branch
              </th>
              <th scope="col" className="text-right hidden w-[7%] lg:table-cell">
                Ahead
              </th>
              <th scope="col" className="text-right hidden w-[6%] lg:table-cell">
                Dirty
              </th>
              <th scope="col" className="w-[8%]">
                Health
              </th>
              <th scope="col" className="text-right w-[9%]">
                Updated
              </th>
              <th scope="col" className="w-[88px]">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {section.projects.map((p, i) => (
              <SwissRow
                key={p.path}
                project={p}
                index={i}
                rootLabel={rootLabels.get(p.rootId)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SwissRow({
  project,
  index,
  rootLabel,
}: {
  project: Project;
  index: number;
  rootLabel: string | undefined;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const openProject = useOpenProject();

  const invalidateScan = () =>
    queryClient.invalidateQueries({ queryKey: trpc.projects.scan.queryKey() });

  const pinMutation = useMutation(
    trpc.projects.setPinned.mutationOptions({
      onSuccess: invalidateScan,
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
      onSuccess: invalidateScan,
    }),
  );

  const openIn = (target: "editor" | "terminal" | "folder") => {
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

  const fresh = isFresh(project);
  const git: GitInfo = project.git;

  return (
    <tr
      className="cursor-pointer"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button, a, [data-stop]")) return;
        openProject(project.path);
      }}
    >
      <td className="swiss-dim hidden font-mono text-xs tabular-nums md:table-cell">
        {String(index + 1).padStart(2, "0")}
      </td>
      <td className="min-w-0">
        <button
          type="button"
          onClick={() => openProject(project.path)}
          className="flex max-w-full items-center gap-1.5 text-left text-[16px] font-semibold leading-tight tracking-[-0.01em] decoration-[1.5px] underline-offset-4 hover:underline"
        >
          {project.pinned ? (
            <Pin aria-hidden className="size-3 shrink-0" />
          ) : null}
          <span className="truncate">{project.name}</span>
        </button>
        {project.note ? (
          <p className="swiss-dim mt-1 max-w-[60ch] truncate text-xs leading-snug">
            {project.note}
          </p>
        ) : null}
      </td>
      <td className="hidden 2xl:table-cell">
        <Micro className="swiss-dim">{rootLabel ?? "—"}</Micro>
      </td>
      <td className="hidden xl:table-cell">
        <Micro className="swiss-dim">{project.stack?.label ?? "—"}</Micro>
      </td>
      <td className="hidden font-mono text-xs md:table-cell">
        {git.isRepo ? (
          <span className="block truncate" title={git.branch ?? undefined}>
            {git.branch ?? "detached"}
          </span>
        ) : (
          <span className="swiss-dim">no repo</span>
        )}
      </td>
      <td className="swiss-dim text-right hidden font-mono text-xs tabular-nums whitespace-nowrap lg:table-cell">
        {aheadBehindLabel(git.ahead, git.behind)}
      </td>
      <td className="swiss-dim text-right hidden font-mono text-xs tabular-nums lg:table-cell">
        {git.dirtyCount === null ? "—" : git.dirtyCount}
        {(git.dirtyCount ?? 0) > 0 ? (
          <span aria-hidden className="ml-1.5 inline-block size-1.5 bg-current" />
        ) : null}
      </td>
      <td>
        {project.alerts.length === 0 ? (
          <span className="swiss-dim font-mono text-xs lowercase">ok</span>
        ) : (
          <span className="flex items-center gap-1.5">
            {sortedAlerts(project.alerts).slice(0, 4).map((a) => (
              <span
                key={a.code}
                title={a.message}
                aria-label={a.message}
                role="img"
                className={`swiss-dot swiss-dot-${a.severity}`}
              />
            ))}
            {project.alerts.length > 4 ? (
              <span className="swiss-dim font-mono text-[10px]">
                +{project.alerts.length - 4}
              </span>
            ) : null}
          </span>
        )}
      </td>
      <td className="text-right whitespace-nowrap">
        <span
          title={dateTooltip(project.updatedAt)}
          className={cn(
            "font-mono text-xs tabular-nums",
            fresh ? "font-semibold" : "swiss-dim",
          )}
        >
          {fresh ? (
            <span aria-hidden className="mr-1.5 inline-block size-1.5 bg-current" />
          ) : null}
          {relativeTime(project.updatedAt)}
        </span>
      </td>
      <td className="text-right">
        <div className="flex items-center justify-end gap-0.5" data-stop>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={project.pinned ? `Unpin ${project.name}` : `Pin ${project.name}`}
            disabled={pinMutation.isPending}
            onClick={() =>
              pinMutation.mutate({ path: project.path, pinned: !project.pinned })
            }
          >
            {project.pinned ? (
              <PinOff className="size-3.5" />
            ) : (
              <Pin className="size-3.5" />
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
              <MoreHorizontal className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem onClick={() => openIn("editor")}>
                <Folder className="size-3.5" /> Open in editor
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openIn("terminal")}>
                <TerminalIcon className="size-3.5" /> Open terminal
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openIn("folder")}>
                <Folder className="size-3.5" /> Reveal in file manager
              </DropdownMenuItem>
              {project.git.remote ? (
                <DropdownMenuItem
                  onClick={() =>
                    window.open(project.git.remote?.links.web, "_blank")
                  }
                >
                  <ExternalLink className="size-3.5" /> Open repo
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void copyPath()}>
                <Copy className="size-3.5" /> Copy path
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  hideMutation.mutate({ path: project.path, hidden: true })
                }
                className="text-destructive"
              >
                <EyeOff className="size-3.5" /> Hide from list
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}
