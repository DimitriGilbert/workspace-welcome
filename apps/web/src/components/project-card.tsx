import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  ExternalLink,
  Folder,
  MoreHorizontal,
  Pin,
  PinOff,
  Terminal as TerminalIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace-welcome/ui/components/card";
import { Button } from "@workspace-welcome/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace-welcome/ui/components/dropdown-menu";
import { cn } from "@workspace-welcome/ui/lib/utils";
import type { Project } from "@workspace-welcome/api/lib/types";

import { useTRPC } from "@/utils/trpc";
import { absoluteDate, dateTooltip, relativeTime } from "@/lib/format";
import { stackIcon } from "@/lib/icons";
import { AlertBadge, GitBadges } from "@/components/git-badges";

interface ProjectCardProps {
  project: Project;
  onOpenDetail: (project: Project) => void;
}

export function ProjectCard({ project, onOpenDetail }: ProjectCardProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const invalidateScan = () =>
    queryClient.invalidateQueries({ queryKey: trpc.projects.scan.queryKey() });

  const pinMutation = useMutation(
    trpc.projects.setPinned.mutationOptions({
      onSuccess: () => invalidateScan(),
      onError: (e) => toast.error(e.message),
    }),
  );

  const openMutation = useMutation(
    trpc.projects.open.mutationOptions({
      onSuccess: (data) => {
        toast.success(data.message);
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const touchMutation = useMutation(
    trpc.projects.touchLastOpened.mutationOptions({
      onSuccess: () => invalidateScan(),
    }),
  );

  const StackIcon = stackIcon(project.stack?.id);

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

  const errorAlert = project.alerts.find((a) => a.severity === "error");
  const accentRing = errorAlert
    ? "ring-destructive/40"
    : project.pinned
      ? "ring-primary/40"
      : "ring-foreground/10";

  return (
    <Card
      size="sm"
      className={cn("cursor-pointer transition-colors hover:bg-muted/40", accentRing)}
      onClick={(e) => {
        // Ignore clicks bubbling from interactive controls inside the card.
        const target = e.target as HTMLElement;
        if (target.closest("[data-stop-propagation]")) return;
        onOpenDetail(project);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpenDetail(project);
      }}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <StackIcon className="size-4 text-muted-foreground" />
          <span className="truncate">{project.name}</span>
          {project.pinned ? (
            <Pin className="size-3.5 shrink-0 text-primary" />
          ) : null}
        </CardTitle>
        <CardAction>
          <div className="flex items-center gap-0.5" data-stop-propagation>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={project.pinned ? "Unpin project" : "Pin project"}
              disabled={pinMutation.isPending}
              onClick={() =>
                pinMutation.mutate({
                  path: project.path,
                  pinned: !project.pinned,
                })
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
                  <Button variant="ghost" size="icon-sm" aria-label="Actions" />
                }
              >
                <MoreHorizontal className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => open("editor")}>
                  <Folder className="size-3.5" /> Open in editor
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => open("terminal")}>
                  <TerminalIcon className="size-3.5" /> Open terminal
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => open("folder")}>
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
                <DropdownMenuItem onClick={copyPath}>
                  <Copy className="size-3.5" /> Copy path
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-2">
        <GitBadges git={project.git} />

        {project.alerts.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {project.alerts.slice(0, 3).map((a) => (
              <AlertBadge key={a.code} severity={a.severity} message={a.message} />
            ))}
          </div>
        ) : null}

        {project.note ? (
          <p className="line-clamp-2 text-xs italic text-muted-foreground">
            “{project.note}”
          </p>
        ) : null}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span title={dateTooltip(project.updatedAt)}>
            updated {relativeTime(project.updatedAt)}
          </span>
          <span title={absoluteDate(project.createdAt)}>
            created {relativeTime(project.createdAt)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
