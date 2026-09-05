import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, Zap } from "lucide-react";
import { toast } from "sonner";

import { buildCloneScript } from "@workspace-welcome/api/lib/clone-script";
import type { ReportPeriod } from "@workspace-welcome/api/routers/reports";
import type { ScaffoldJobSnapshot } from "@workspace-welcome/api/lib/scaffold";
import type { Project, Root } from "@workspace-welcome/api/lib/types";

import { Button } from "@workspace-welcome/ui/components/button";
import { Checkbox } from "@workspace-welcome/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace-welcome/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace-welcome/ui/components/select";
import { Switch } from "@workspace-welcome/ui/components/switch";

import {
  CreateProjectFlow,
  useAddRoot,
} from "@/lib/forms";
import { useReportRun } from "@/lib/use-report";
import { relativeTime } from "@/lib/format";
import { hostLabel } from "@/lib/icons";

type ScaffoldResult = NonNullable<ScaffoldJobSnapshot["result"]>;

function ConsoleDialogHeader({ title, description }: { title: string; description: string }) {
  return (
    <DialogHeader className="border-b border-[var(--mb-line)]">
      <DialogTitle className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground">
        {title}
      </DialogTitle>
      <DialogDescription>{description}</DialogDescription>
    </DialogHeader>
  );
}

/* ------------------------------------------------------------- add root */

/**
 * Console add-directory dialog: two mono fields bound to the shared
 * useAddRoot flow, submitted from this container's own form.
 */
export function AddRootDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: () => void;
}) {
  const addRoot = useAddRoot({ onClose: () => onOpenChange(false), onAdded });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mb-scope sm:max-w-md" aria-describedby={undefined}>
        <ConsoleDialogHeader
          title="Add directory"
          description="Register a root directory the console should scan for projects."
        />
        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (addRoot.canSubmit) addRoot.submit();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="mb-label">Absolute path</span>
            <input
              className="mb-input h-9 px-2.5"
              value={addRoot.path}
              onChange={(e) => addRoot.setPath(e.target.value)}
              placeholder="/home/you/workspace"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="mb-label">Label (optional)</span>
            <input
              className="mb-input h-9 px-2.5"
              value={addRoot.label}
              onChange={(e) => addRoot.setLabel(e.target.value)}
              placeholder="work"
            />
          </label>
          <div className="mt-1 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!addRoot.canSubmit}>
              <Check className="size-3.5" />
              {addRoot.isPending ? "Adding…" : "Add directory"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------- create project */

/**
 * Console create-project dialog: the shared chrome-free wizard inside this
 * container. The dialog only owns chrome and width; the flow owns fields,
 * validation, job tracking and the command preview.
 */
export function CreateConsoleDialog({
  open,
  onOpenChange,
  onSuccess,
  onError,
  onRequestAddRoot,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (result: ScaffoldResult) => void;
  onError?: (message: string) => void;
  onRequestAddRoot?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mb-scope flex h-[85dvh] max-w-[calc(100vw-2rem)] flex-col sm:max-w-2xl" aria-describedby={undefined}>
        <ConsoleDialogHeader
          title="New project"
          description="Scaffold a better-t-stack project into a registered root."
        />
        <div className="flex min-h-0 flex-1 flex-col">
          <CreateProjectFlow
            open={open}
            onSuccess={onSuccess}
            onError={onError}
            onRequestAddRoot={onRequestAddRoot}
            onClose={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------- clone script */

/**
 * Console clone-script dialog: pick repos (the list mirrors the dashboard's
 * active filter), copy or download the re-runnable bootstrap script.
 */
export function CloneConsoleDialog({
  open,
  onOpenChange,
  projects,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const cloneable = useMemo(
    () => projects.filter((p) => p.git.isRepo && p.git.remote),
    [projects],
  );

  // Drop selections that left the filter while the dialog is open.
  useEffect(() => {
    setSelected((prev) => {
      const live = new Set(cloneable.map((p) => p.path));
      const next = new Set([...prev].filter((path) => live.has(path)));
      return next.size === prev.size ? prev : next;
    });
  }, [cloneable]);

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
        selectedProjects.map((p) => ({ name: p.name, remote: p.git.remote })),
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mb-scope flex max-h-[85dvh] flex-col sm:max-w-xl" aria-describedby={undefined}>
        <ConsoleDialogHeader
          title="Clone script"
          description="Pick the repos to clone on a new machine — SSH, re-runnable."
        />
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 mb-scroll">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {selected.size}/{cloneable.length} selected
              {cloneCount > 0 ? ` · ${cloneCount} clone${cloneCount === 1 ? "" : "s"}` : ""}
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setSelected(new Set(cloneable.map((p) => p.path)))}
              >
                All
              </Button>
              <Button variant="ghost" size="xs" onClick={() => setSelected(new Set())}>
                None
              </Button>
            </div>
          </div>

          {cloneable.length === 0 ? (
            <p className="border border-dashed border-[var(--mb-line-strong)] p-6 text-center text-xs text-muted-foreground">
              No projects with a remote in the current filter. Nothing to clone.
            </p>
          ) : (
            <div className="mb-panel mb-scroll flex max-h-56 flex-col overflow-y-auto">
              {cloneable.map((p) => {
                const checked = selected.has(p.path);
                return (
                  <label
                    key={p.path}
                    className="flex cursor-pointer items-center gap-3 border-b border-[var(--mb-line)] px-3 py-2 transition-colors last:border-b-0 hover:bg-white/[0.03]"
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggle(p.path)} />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{p.name}</span>
                    {p.git.remote ? (
                      <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
                        {hostLabel(p.git.remote.host)}
                      </span>
                    ) : null}
                    <span className="shrink-0 font-mono text-[9.5px] tabular-nums text-muted-foreground">
                      {relativeTime(p.updatedAt)}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {cloneCount > 0 ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="mb-label">Script</span>
                <div className="flex gap-1.5">
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
                className="mb-input mb-scroll h-56 w-full resize-none p-3 leading-relaxed"
              />
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------------------------------- html report */

const REPORT_PERIODS: ReadonlyArray<{ value: ReportPeriod | "all"; label: string }> = [
  { value: "all", label: "All time" },
  { value: "7d", label: "Last 7 days" },
  { value: "1m", label: "Last month" },
  { value: "3m", label: "Last 3 months" },
  { value: "1y", label: "Last year" },
];

function isPeriodValue(value: string): value is ReportPeriod | "all" {
  return REPORT_PERIODS.some((p) => p.value === value);
}

/**
 * Console HTML-report dialog: scope + period + force, opens the report tab.
 * Widget-level charting lives in the report console; this covers the full
 * comparative HTML document.
 */
export function ReportDialog({
  open,
  onOpenChange,
  roots,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roots: Root[];
}) {
  const { run, isPending } = useReportRun();
  const [path, setPath] = useState<string | null>(null);
  const [period, setPeriod] = useState<ReportPeriod | "all">("all");
  const [force, setForce] = useState(false);

  useEffect(() => {
    if (open && roots.length === 1) setPath(roots[0].path);
  }, [open, roots]);

  const hasRoots = roots.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mb-scope sm:max-w-md" aria-describedby={undefined}>
        <ConsoleDialogHeader
          title="Workspace report"
          description="One comparative git report for a tracked directory, in a new tab."
        />
        <form
          className="flex flex-col gap-4 p-4"
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
          <label className="flex flex-col gap-1.5">
            <span className="mb-label">Tracked directory</span>
            <Select
              value={path ?? undefined}
              onValueChange={(value) => {
                if (typeof value === "string") setPath(value);
              }}
            >
              <SelectTrigger className="w-full" aria-label="Tracked directory">
                <SelectValue placeholder="Pick a tracked directory…" />
              </SelectTrigger>
              <SelectContent className="mb-scope">
                {roots.map((r) => (
                  <SelectItem key={r.id} value={r.path}>
                    {r.label === r.path ? r.path : `${r.label} · ${r.path}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="mb-label">Period</span>
            <Select
              items={REPORT_PERIODS}
              value={period}
              onValueChange={(value) => {
                const next = value ?? "all";
                setPeriod(isPeriodValue(next) ? next : "all");
              }}
            >
              <SelectTrigger className="w-full" aria-label="Report period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="mb-scope">
                {REPORT_PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div className="flex items-center justify-between gap-3">
            <span className="flex flex-col gap-0.5">
              <span className="mb-label">Force refresh</span>
              <span className="text-xs text-muted-foreground">
                Regenerate even if a saved report exists.
              </span>
            </span>
            <Switch
              id="mb-report-force"
              checked={force}
              onCheckedChange={(checked) => setForce(checked)}
            />
          </div>

          <div className="mt-1 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!hasRoots || path === null || isPending}>
              <Zap className="size-3.5" />
              {isPending ? "Starting…" : "Open report"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
