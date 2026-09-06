import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Check, Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@workspace-welcome/ui/components/button";
import { Checkbox } from "@workspace-welcome/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace-welcome/ui/components/dialog";
import { Label } from "@workspace-welcome/ui/components/label";
import { cn } from "@workspace-welcome/ui/lib/utils";
import { buildCloneScript } from "@workspace-welcome/api/lib/clone-script";
import type { Project } from "@workspace-welcome/api/lib/types";

import { CreateProjectFlow, useAddRoot } from "@/lib/forms";
import type { ScaffoldResult } from "@/lib/forms";

import { useOpenDesignProject } from "./use-open-design-project";

/**
 * Console-flavored form containers. The flows themselves come from the
 * container-independent @/lib/forms module; this file only supplies chrome:
 * a sharp-cornered, hairline dialog that inherits the `.mc` palette through
 * the portal class. No side panels anywhere.
 */
export function ConsoleDialog({
  open,
  onClose,
  title,
  meta,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  meta?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent
        className={cn(
          "mc mc-dialog top-[7%] translate-y-0 flex-col gap-0 p-0",
          size === "sm" && "sm:max-w-md",
          size === "md" && "sm:max-w-xl",
          size === "lg" && "sm:max-w-3xl",
        )}
      >
        <DialogHeader className="border-b border-[var(--mc-line-strong)] px-4 py-3">
          <DialogTitle className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-foreground">
            {title}
            {meta ? (
              <span className="ml-2 font-mono text-[10px] normal-case tracking-normal text-muted-foreground">
                {meta}
              </span>
            ) : null}
          </DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

const fieldClass =
  "mc-input h-9 w-full px-2.5 text-[13px] placeholder:text-[12px]";

/**
 * Add-directory flow in console chrome: two fields, the shared useAddRoot
 * wiring (validation toasts, scan invalidation, reset, close) live there.
 */
export function AddRootDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { path, setPath, label, setLabel, isPending, canSubmit, submit } =
    useAddRoot({ onClose });

  return (
    <ConsoleDialog
      open={open}
      onClose={onClose}
      title="Add directory"
      meta="scan root"
      size="sm"
    >
      <form
        className="flex flex-col gap-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mc-add-root-path" className="mc-label">
            Absolute path
          </Label>
          <input
            id="mc-add-root-path"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/home/you/workspace"
            autoComplete="off"
            spellCheck={false}
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mc-add-root-label" className="mc-label">
            Label — optional
          </Label>
          <input
            id="mc-add-root-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="workspace"
            autoComplete="off"
            spellCheck={false}
            className={fieldClass}
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="font-mono text-[10px] uppercase tracking-[0.14em]"
            onClick={onClose}
          >
            Cancel
          </Button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex h-8 items-center border border-[var(--mc-line-strong)] bg-[color-mix(in_oklch,var(--mc-accent)_14%,transparent)] px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground outline-none transition-colors hover:border-[color-mix(in_oklch,var(--mc-accent)_50%,var(--mc-line-strong))] hover:text-[var(--mc-accent)] focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            {isPending ? "Adding…" : "Add root"}
          </button>
        </div>
      </form>
    </ConsoleDialog>
  );
}

/**
 * Create-project flow in console chrome: the full CreateProjectFlow (roots
 * gating, wizard, live command preview, job progress) inside a tall dialog.
 * Success surfaces the toast + open action here; the flow closes itself.
 */
export function CreateProjectDialog({
  open,
  onClose,
  onAddRoot,
}: {
  open: boolean;
  onClose: () => void;
  /** Fired from the flow's empty-roots state; swaps to the add-root dialog. */
  onAddRoot: () => void;
}) {
  const openProject = useOpenDesignProject();

  const handleSuccess = (result: ScaffoldResult) => {
    const segments = result.projectDirectory.split("/").filter(Boolean);
    toast.success(
      `Created ${segments.at(-1) ?? result.projectDirectory} in ${formatElapsed(result.elapsedTimeMs)}`,
      {
        description: result.reproducibleCommand,
        action: {
          label: "Open project",
          onClick: () => openProject(result.projectDirectory),
        },
      },
    );
  };

  return (
    <ConsoleDialog
      open={open}
      onClose={onClose}
      title="Create project"
      meta="scaffold"
      size="lg"
    >
      <div className="flex h-[min(72vh,680px)] flex-col">
        <CreateProjectFlow
          open={open}
          onSuccess={handleSuccess}
          onError={(message) => toast.error(message)}
          onRequestAddRoot={onAddRoot}
          onClose={onClose}
        />
      </div>
    </ConsoleDialog>
  );
}

/**
 * Clone-script picker in console chrome: same contract as the workspace
 * sheet — only projects with a parseable remote are selectable, the list
 * mirrors the active fleet filter, and the generated script is re-runnable.
 */
export function CloneScriptDialog({
  open,
  onClose,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  /** All visible (filter-matching) projects from the stage. */
  projects: Project[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
        selectedProjects.map((p) => ({ name: p.name, remote: p.git.remote })),
      ),
    [selectedProjects],
  );

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(script);
      toast.success("Script copied");
    } catch {
      toast.error("Couldn't copy script");
    }
  };

  const downloadScript = () => {
    const blob = new Blob([script], { type: "text/x-shellscript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "clone-all.sh";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ConsoleDialog
      open={open}
      onClose={onClose}
      title="Clone script"
      meta={`${selectedProjects.length} selected`}
      size="md"
    >
      <div className="flex flex-col gap-3 p-4">
        {cloneable.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            None of the visible projects carry a remote to clone from.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set(cloneable.map((p) => p.path)))}
                className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground outline-none transition-colors hover:text-[var(--mc-accent)] focus-visible:ring-1 focus-visible:ring-ring"
              >
                all
              </button>
              <span aria-hidden className="text-muted-foreground/40">/</span>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground outline-none transition-colors hover:text-[var(--mc-accent)] focus-visible:ring-1 focus-visible:ring-ring"
              >
                none
              </button>
            </div>
            <ul className="mc-scroll max-h-56 overflow-y-auto border border-[var(--mc-line)]">
              {cloneable.map((p) => (
                <li key={p.path} className="border-b border-[var(--mc-line)] last:border-b-0">
                  <label className="mc-row flex cursor-pointer items-center gap-2.5 px-3 py-2">
                    <Checkbox
                      checked={selected.has(p.path)}
                      onCheckedChange={() => toggle(p.path)}
                      aria-label={`Select ${p.name}`}
                    />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
                      {p.name}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {p.git.remote?.host}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
        {script.trim().length > 0 ? (
          <pre className="mc-scroll max-h-40 overflow-auto border border-[var(--mc-line)] bg-[color-mix(in_oklch,var(--foreground)_3%,transparent)] p-2.5 font-mono text-[10px] leading-relaxed break-all whitespace-pre-wrap text-muted-foreground">
            {script}
          </pre>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="font-mono text-[10px] uppercase tracking-[0.14em]"
            onClick={onClose}
          >
            Close
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={selectedProjects.length === 0}
            onClick={() => void copyScript()}
            className="font-mono text-[10px] uppercase tracking-[0.14em]"
          >
            <Check aria-hidden className="size-3" /> Copy
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={selectedProjects.length === 0}
            onClick={downloadScript}
            className="font-mono text-[10px] uppercase tracking-[0.14em]"
          >
            <Download aria-hidden className="size-3" /> clone-all.sh
          </Button>
        </div>
      </div>
    </ConsoleDialog>
  );
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${String(rest).padStart(2, "0")}s` : `${rest}s`;
}
