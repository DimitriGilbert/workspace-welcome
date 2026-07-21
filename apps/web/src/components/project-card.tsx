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
import { AlertIcons, GitBadges } from "@/components/git-badges";
import { freshness, heatBorderColor, tierFromFreshness } from "@/lib/recency";

interface ProjectCardProps {
  project: Project;
  onOpenDetail: (project: Project) => void;
  /**
   * "auto" picks the accent by priority: error > pinned > recency.
   * "recency" forces the recency-heat border even on pinned cards (used in
   * the main grid where pinned-ness is not the dominant signal).
   * "pinned" forces the pinned amber (used inside the pinned section).
   */
  accentMode?: "auto" | "recency" | "pinned";
}

export function ProjectCard({
  project,
  onOpenDetail,
  accentMode = "auto",
}: ProjectCardProps) {
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

  const errorAlert = project.alerts.find((a) => a.severity === "error");
  const f = freshness(project.updatedAt, project.lastOpenedAt);
  const tier = tierFromFreshness(f);

  // Accent priority: error always wins; otherwise the caller decides whether
  // pinned-ness or recency drives the left border.
  let accentColor: string;
  if (errorAlert) {
    accentColor = "var(--sev-error)";
  } else if (accentMode === "pinned" || (accentMode === "auto" && project.pinned)) {
    accentColor = "var(--pinned-accent)";
  } else {
    accentColor = heatBorderColor(f);
  }
  const edgeStyle: React.CSSProperties = {
    // 3px left heat bar + neutral 1px ring via layered inset shadows.
    boxShadow: `inset 3px 0 0 0 ${accentColor}`,
  };
  // Hot cards get a faint wash so freshness reads at a glance even before
  // the border registers; cold cards dim slightly to recede — but never dim
  // pinned cards (the user promoted them deliberately).
  const tierSurface =
    accentMode === "pinned" || (accentMode === "auto" && project.pinned)
      ? tier === "fresh"
        ? "bg-[var(--pinned-accent-wash)]"
        : ""
      : tier === "fresh"
        ? "bg-[var(--recency-fresh-wash)]"
        : tier === "cold"
          ? "opacity-70 hover:opacity-100"
          : "";

  return (
    <Card
      size="sm"
      style={edgeStyle}
      className={cn(
        "cursor-pointer ring-1 ring-foreground/10 transition-all duration-200 hover:-translate-y-px hover:ring-foreground/20 hover:bg-muted/40",
        tierSurface,
      )}
      onClick={(e) => {
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
          <StackIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{project.name}</span>
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
          <p className="line-clamp-2 border-l-2 border-foreground/10 pl-2 text-xs italic text-muted-foreground">
            {project.note}
          </p>
        ) : null}

        <div className="flex items-center justify-between text-[0.7rem] text-muted-foreground">
          <span title={dateTooltip(project.updatedAt)} className="tabular-nums">
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
