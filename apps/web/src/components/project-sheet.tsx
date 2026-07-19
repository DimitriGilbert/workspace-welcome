import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  ExternalLinkIcon,
  Folder,
  GitBranch,
  Terminal as TerminalIcon,
} from "lucide-react";
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
import { Separator } from "@workspace-welcome/ui/components/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace-welcome/ui/components/tabs";
import { Textarea } from "@workspace-welcome/ui/components/textarea";
import type { Project } from "@workspace-welcome/api/lib/types";

import { useTRPC } from "@/utils/trpc";
import { absoluteDate, relativeTime } from "@/lib/format";
import { hostLabel, stackIcon } from "@/lib/icons";
import { AlertBadge } from "@/components/git-badges";

interface ProjectSheetProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectSheet({
  project,
  open,
  onOpenChange,
}: ProjectSheetProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const invalidateScan = () =>
    queryClient.invalidateQueries({ queryKey: trpc.projects.scan.queryKey() });

  const noteMutation = useMutation(
    trpc.projects.setNote.mutationOptions({
      onSuccess: () => invalidateScan(),
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

  // Touch last-opened whenever a new project is opened in the sheet.
  useEffect(() => {
    if (project && open) {
      touchMutation.mutate({ path: project.path });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.path, open]);

  // Local note draft, synced when the project changes.
  const [noteDraft, setNoteDraft] = useState(project?.note ?? "");
  useEffect(() => {
    setNoteDraft(project?.note ?? "");
  }, [project?.path, project?.note]);

  if (!project) return null;

  const StackIcon = stackIcon(project.stack?.id);
  const git = project.git;

  const saveNote = () => {
    if (noteDraft === project.note) return;
    noteMutation.mutate({ path: project.path, note: noteDraft });
  };

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(project.path);
      toast.success("Path copied");
    } catch {
      toast.error("Couldn't copy path");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <StackIcon className="size-4 text-muted-foreground" />
            {project.name}
          </SheetTitle>
          <SheetDescription className="break-all font-mono text-xs">
            {project.path}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 p-4">
          {project.alerts.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {project.alerts.map((a) => (
                <AlertBadge
                  key={a.code}
                  severity={a.severity}
                  message={a.message}
                />
              ))}
            </div>
          ) : null}

          {/* Quick actions */}
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              variant="default"
              onClick={() => {
                openMutation.mutate({ path: project.path, target: "editor" });
              }}
            >
              <Folder className="size-3.5" /> Open editor
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                openMutation.mutate({ path: project.path, target: "terminal" })
              }
            >
              <TerminalIcon className="size-3.5" /> Terminal
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                openMutation.mutate({ path: project.path, target: "folder" })
              }
            >
              <ExternalLink className="size-3.5" /> Folder
            </Button>
            <Button size="sm" variant="ghost" onClick={copyPath}>
              <Copy className="size-3.5" /> Copy path
            </Button>
          </div>

          <Separator />

          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="git">Git</TabsTrigger>
              <TabsTrigger value="note">Note</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="flex flex-col gap-2 pt-2">
              <Row label="Stack">
                {project.stack ? (
                  <Badge variant="secondary">{project.stack.label}</Badge>
                ) : (
                  <span className="text-muted-foreground">unknown</span>
                )}
              </Row>
              <Row label="Created">{absoluteDate(project.createdAt)}</Row>
              <Row label="Updated">{relativeTime(project.updatedAt)}</Row>
              {project.lastOpenedAt ? (
                <Row label="Last opened">
                  {relativeTime(project.lastOpenedAt)}
                </Row>
              ) : null}
            </TabsContent>

            <TabsContent value="git" className="flex flex-col gap-2 pt-2">
              {!git.isRepo ? (
                <p className="text-xs text-muted-foreground">
                  Not a git repository.
                </p>
              ) : (
                <>
                  <Row label="Branch">
                    {git.branch ? (
                      <Badge variant="outline" className="font-mono">
                        <GitBranch className="size-3" />
                        {git.branch}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">detached</span>
                    )}
                  </Row>
                  {git.remote ? (
                    <Row label="Remote">
                      <a
                        href={git.remote.links.web}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        {hostLabel(git.remote.host)} · {git.remote.slug}
                        <ExternalLinkIcon className="size-3" />
                      </a>
                    </Row>
                  ) : (
                    <Row label="Remote">
                      <span className="text-muted-foreground">none</span>
                    </Row>
                  )}
                  <Row label="Ahead / behind">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-emerald-500">
                        <ArrowUp className="size-3" />
                        {git.ahead ?? 0}
                      </span>
                      <span className="inline-flex items-center gap-1 text-amber-500">
                        <ArrowDown className="size-3" />
                        {git.behind ?? 0}
                      </span>
                    </span>
                  </Row>
                  <Row label="Dirty files">
                    {git.dirtyCount ?? 0}
                  </Row>
                  {git.lastCommit ? (
                    <>
                      <Separator />
                      <div className="flex flex-col gap-1 pt-1">
                        <span className="text-xs text-muted-foreground">
                          Last commit · {relativeTime(git.lastCommit.date)}
                        </span>
                        <p className="text-xs">{git.lastCommit.message}</p>
                        <span className="text-xs text-muted-foreground">
                          by {git.lastCommit.author}
                        </span>
                      </div>
                    </>
                  ) : null}
                  {git.remote ? (
                    <div className="flex flex-wrap gap-1 pt-1">
                      <Button
                        size="xs"
                        variant="outline"
                        render={
                          <a
                            href={git.remote.links.issues}
                            target="_blank"
                            rel="noreferrer"
                          />
                        }
                      >
                        Issues
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        render={
                          <a
                            href={git.remote.links.pulls}
                            target="_blank"
                            rel="noreferrer"
                          />
                        }
                      >
                        Pull requests
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </TabsContent>

            <TabsContent value="note" className="flex flex-col gap-2 pt-2">
              <label className="text-xs text-muted-foreground">
                Where I left off…
              </label>
              <Textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onBlur={saveNote}
                placeholder="What were you doing? What's next?"
                rows={6}
              />
              <p className="text-xs text-muted-foreground">
                Saved automatically when you click away.
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
