/**
 * Bento's form containers — port of `components/designs/bento/bento-dialogs`
 * (glazed dialogs instead of side sheets). The flows come from the
 * container-independent `@/lib/forms` module; everything here is chrome.
 * The one wiring change against the design original: the report picker's
 * tracked-directory list reads the mounted WorkspaceProvider's roots query
 * (same cache entry) instead of fetching directly — the theme namespace has
 * no procedure access, and react-query dedupes the observers anyway.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, FolderPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { buildCloneScript } from "@workspace-welcome/api/lib/clone-script";
import type { Project } from "@workspace-welcome/api/lib/types";
import type { ReportPeriod } from "@workspace-welcome/api/routers/reports";
import { Badge } from "@workspace-welcome/ui/components/badge";
import { Button } from "@workspace-welcome/ui/components/button";
import { Checkbox } from "@workspace-welcome/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace-welcome/ui/components/dialog";
import { Input } from "@workspace-welcome/ui/components/input";
import { Label } from "@workspace-welcome/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace-welcome/ui/components/select";
import { Separator } from "@workspace-welcome/ui/components/separator";
import { Switch } from "@workspace-welcome/ui/components/switch";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { CreateProjectFlow } from "@/lib/forms";
import type { ScaffoldResult } from "@/lib/forms";
import { useAddRoot } from "@/lib/forms";
import { hostLabel } from "@/lib/icons";
import { useReportRun } from "@/lib/use-report";

import { useWorkspace } from "@/lib/contexts/workspace-context";

export interface BentoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Max width classes for the popup, e.g. "sm:max-w-2xl". */
  width?: string;
  /** Fixed working height so inner scroll regions behave (wizard, log). */
  bodyClassName?: string;
}

export function BentoDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  width = "sm:max-w-lg",
  bodyClassName,
}: BentoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("bento-dialog gap-0", width)}>
        <DialogHeader className="border-b border-border/70 px-5 py-4">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {/* No flex-1 here on purpose: a flex main-size would override the
            bodyClassName height cap (flex-basis beats height), letting long
            content stretch the popup past the viewport. */}
        <div className={cn("flex min-h-0 flex-col", bodyClassName)}>{children}</div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------ add root */

export interface AddRootDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a successful add (post-close). */
  onAdded?: () => void;
}

export function AddRootDialog({ open, onOpenChange, onAdded }: AddRootDialogProps) {
  const { path, setPath, label, setLabel, isPending, canSubmit, submit } = useAddRoot({
    onClose: () => onOpenChange(false),
    onAdded,
  });

  return (
    <BentoDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add a root directory"
      description="Workspace Welcome scans each registered directory for projects."
      width="sm:max-w-md"
    >
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) submit();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bento-root-path">Absolute path</Label>
          <Input
            id="bento-root-path"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/home/you/workspace"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bento-root-label">Label</Label>
          <Input
            id="bento-root-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Workspace (optional)"
            autoComplete="off"
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <FolderPlus className="size-3.5" />}
            Add directory
          </Button>
        </div>
      </form>
    </BentoDialog>
  );
}

/* ------------------------------------------------------ create project */

export interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (result: ScaffoldResult) => void;
  onError: (message: string) => void;
  /** The wizard's empty-state escape hatch when no roots are registered. */
  onRequestAddRoot: () => void;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  onSuccess,
  onError,
  onRequestAddRoot,
}: CreateProjectDialogProps) {
  return (
    <BentoDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create a project"
      description="Scaffold a Better-T-Stack app into a registered root — the job streams here."
      width="sm:max-w-2xl"
      bodyClassName="h-[min(680px,80vh)]"
    >
      <CreateProjectFlow
        open={open}
        onSuccess={onSuccess}
        onError={onError}
        onRequestAddRoot={() => {
          onOpenChange(false);
          onRequestAddRoot();
        }}
        onClose={() => onOpenChange(false)}
      />
    </BentoDialog>
  );
}

/* -------------------------------------------------------- clone script */

export interface CloneScriptDialogProps {
  /** All visible (search-filtered) projects from the dashboard. */
  projects: Project[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CloneScriptDialog({ projects, open, onOpenChange }: CloneScriptDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Fresh selection semantics per open: the dashboard filter may have moved.
  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

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

  const selectedProjects = cloneable.filter((p) => selected.has(p.path));
  const script = useMemo(
    () =>
      buildCloneScript(
        selectedProjects.map((p) => ({
          name: p.name,
          remote: p.git.remote,
        })),
      ),
    [selectedProjects],
  );
  const cloneCount = (script.match(/^  git clone "/gm) ?? []).length;

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(script);
      toast.success("Script copied to clipboard");
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  const downloadScript = () => {
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

  return (
    <BentoDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Clone script"
      description="Pick the repos to clone on a new machine. The list follows the dashboard filter."
      width="sm:max-w-xl"
      bodyClassName="h-[min(640px,80vh)]"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {selected.size} of {cloneable.length} selected
            {cloneCount > 0 ? ` · ${cloneCount} clone${cloneCount === 1 ? "" : "s"}` : ""}
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setSelected(new Set(cloneable.map((p) => p.path)))}
            >
              <Check className="size-3" /> All
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setSelected(new Set())}>
              None
            </Button>
          </div>
        </div>

        {cloneable.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            No projects with a remote in the current filter. Nothing to clone.
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto rounded-xl border border-border">
            {cloneable.map((p) => {
              const checked = selected.has(p.path);
              return (
                <label
                  key={p.path}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.04]"
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggle(p.path)} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-medium">{p.name}</span>
                      {p.git.remote ? (
                        <Badge variant="secondary">{hostLabel(p.git.remote.host)}</Badge>
                      ) : null}
                      {p.git.branch ? (
                        <span className="hidden shrink-0 font-mono text-[0.7rem] text-muted-foreground sm:inline">
                          {p.git.branch}
                        </span>
                      ) : null}
                    </div>
                    {p.git.remote?.slug ? (
                      <span className="truncate font-mono text-[0.7rem] text-muted-foreground">
                        {p.git.remote.slug}
                      </span>
                    ) : null}
                  </div>
                </label>
              );
            })}
          </div>
        )}

        {cloneCount > 0 ? (
          <>
            <Separator className="bg-border" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">
                Script · {cloneCount} repo{cloneCount === 1 ? "" : "s"}
              </span>
              <div className="flex gap-1">
                <Button size="xs" onClick={copyScript}>
                  <Copy className="size-3" /> Copy
                </Button>
                <Button size="xs" variant="outline" onClick={downloadScript}>
                  <Download className="size-3" /> .sh
                </Button>
              </div>
            </div>
            <textarea
              readOnly
              value={script}
              spellCheck={false}
              className="h-40 w-full shrink-0 resize-none rounded-xl border border-border bg-white/[0.03] p-3 font-mono text-[0.7rem] leading-relaxed text-foreground outline-none"
            />
          </>
        ) : null}
      </div>
    </BentoDialog>
  );
}

/* -------------------------------------------------------- report picker */

const PERIODS: ReadonlyArray<{ value: ReportPeriod | "all"; label: string }> = [
  { value: "all", label: "All time" },
  { value: "7d", label: "Last 7 days" },
  { value: "14d", label: "Last 2 weeks" },
  { value: "1m", label: "Last month" },
  { value: "3m", label: "Last 3 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "1y", label: "Last year" },
];

function isPeriodValue(value: string): value is ReportPeriod | "all" {
  return PERIODS.some((p) => p.value === value);
}

export interface ReportRunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Workspace report picker: one comparative git-snitch report per root. */
export function ReportRunDialog({ open, onOpenChange }: ReportRunDialogProps) {
  const workspace = useWorkspace();
  const roots = workspace.roots;
  const { run, isPending } = useReportRun();

  const [path, setPath] = useState<string | null>(null);
  const [period, setPeriod] = useState<ReportPeriod | "all">("all");
  const [force, setForce] = useState(false);

  useEffect(() => {
    if (open && roots.data?.length === 1) setPath(roots.data[0].path);
  }, [open, roots.data]);

  const hasRoots = (roots.data?.length ?? 0) > 0;

  return (
    <BentoDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Workspace report"
      description="One comparative git report for a tracked directory — every project under it on a single page."
      width="sm:max-w-md"
    >
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (path === null) return;
          run({
            kind: "scan",
            path,
            force,
            period: period === "all" ? undefined : period,
          });
          onOpenChange(false);
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bento-report-root">Workspace</Label>
          {hasRoots ? (
            <Select value={path} onValueChange={(value) => setPath(value)}>
              <SelectTrigger className="w-full" aria-label="Tracked directory">
                <SelectValue placeholder="Pick a tracked directory…" />
              </SelectTrigger>
              <SelectContent>
                {(roots.data ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.path}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-xs text-muted-foreground">
              No directories tracked yet — add one first.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bento-report-period">Period</Label>
          <Select
            items={PERIODS}
            value={period}
            onValueChange={(value) => {
              const next = value ?? "all";
              setPeriod(isPeriodValue(next) ? next : "all");
            }}
          >
            <SelectTrigger className="w-full" aria-label="Report period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="bento-report-force">Force refresh</Label>
            <p className="text-xs text-muted-foreground">
              Regenerate even if a saved report exists.
            </p>
          </div>
          <Switch
            id="bento-report-force"
            checked={force}
            onCheckedChange={(checked) => setForce(checked)}
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!hasRoots || path === null || isPending}>
            {isPending ? "Generating…" : "Open report"}
          </Button>
        </div>
      </form>
    </BentoDialog>
  );
}
