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
import { dateTooltip, relativeTime } from "@/lib/format";
import { stackIcon } from "@/lib/icons";
import { useOpenProject } from "@/lib/open-project";
import { AlertIcons, GitBadges } from "@/components/git-badges";
import { freshness, tierFromFreshness } from "@/lib/recency";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
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

  const f = freshness(project.updatedAt, project.lastOpenedAt);
  const tier = tierFromFreshness(f);
  // The accent-colored timestamp says "updated", so it keys off updatedAt
  // alone (not the last-opened boost): lit only when genuinely fresh.
  const updatedHot =
    Date.now() - new Date(project.updatedAt).getTime() < 48 * 60 * 60 * 1000;

  // No color-coded edges: recency reads from the timestamp (fresh projects
  // light up in the accent cyan), alerts from the alert icons, pinned from
  // the pin glyph. Cold entries dim a little.
  const dimmed = tier === "cold" ? "opacity-70 hover:opacity-100" : "";

  return (
    <Card
      size="sm"
      className={cn(
        "group cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] ring-1 ring-foreground/10 transition-all duration-200 hover:-translate-y-px hover:bg-muted/40 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_14px_36px_-18px_rgba(0,0,0,0.65)] hover:ring-[color-mix(in_oklch,var(--primary)_45%,transparent)]",
        dimmed,
      )}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("[data-stop-propagation]")) return;
        openProject(project.path);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") openProject(project.path);
      }}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center bg-muted text-muted-foreground transition-colors group-hover:text-foreground"
          >
            <StackIcon className="size-3.5" />
          </span>
          <span className="truncate font-medium tracking-tight">{project.name}</span>
          {project.pinned ? (
            <Pin
              className="size-3.5 shrink-0"
              style={{ color: "var(--pinned-accent)" }}
            />
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
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <GitBadges git={project.git} />
          <AlertIcons alerts={project.alerts} />
        </div>

        {project.note ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {project.note}
          </p>
        ) : null}

        <div className="flex items-center justify-between border-t border-foreground/[0.07] pt-2 text-[0.7rem] text-muted-foreground">
          <span
            title={dateTooltip(project.updatedAt)}
            className={"tabular-nums" + (updatedHot ? " font-medium" : "")}
            style={updatedHot ? { color: "var(--recency-fresh)" } : undefined}
          >
            updated {relativeTime(project.updatedAt)}
          </span>
          {project.lastOpenedAt ? (
            <span className="tabular-nums opacity-60">
              opened {relativeTime(project.lastOpenedAt)}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
