import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  Copy,
  ExternalLink,
  EyeOff,
  Folder,
  GitBranch,
  MoreHorizontal,
  Pin,
  PinOff,
  Terminal as TerminalIcon,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@workspace-welcome/ui/lib/utils";
import type { Project } from "@workspace-welcome/api/lib/types";

import { useOpenDesignProject } from "./use-open-design-project";
import { useProjectActions } from "./use-project-actions";

const MENU_WIDTH = 176;

/**
 * Row-level actions, rebuilt around one affordance: the cluster (pin + menu)
 * is already in the DOM and appears instantly on row hover — no tooltip-per-
 * action, no laggy portal menu. The single "⋯" opens ONE dropdown animated
 * with motion (opacity + 4px rise + 0.98→1 scale over 130ms). The menu is
 * portaled to the body with fixed coordinates so no scroll container, panel
 * or stacking context can clip or bury it; it flips above when the viewport
 * edge is near and dismisses on outside pointer-down, Escape, scroll or
 * resize.
 */
export function ProjectActions({ project }: { project: Project }) {
  const { pin, hide, openTarget } = useProjectActions();
  const openProject = useOpenDesignProject();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = () => {
    const anchor = rootRef.current;
    if (anchor === null) return;
    const rect = anchor.getBoundingClientRect();
    const menuH = 296;
    const below = rect.bottom + 4;
    const top =
      below + menuH > window.innerHeight - 8 && rect.top > menuH + 8
        ? rect.top - menuH - 4
        : below;
    const left = Math.max(
      8,
      Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8),
    );
    setPos({ left, top: Math.max(8, top) });
  };

  useLayoutEffect(() => {
    if (open) place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    const onReflow = () => setOpen(false);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open]);

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(project.path);
      toast.success("Path copied");
    } catch {
      toast.error("Couldn't copy path");
    }
  };

  type Item =
    | {
        kind: "item";
        icon: typeof Copy;
        label: string;
        onAction: () => void;
        destructive?: boolean;
      }
    | { kind: "separator" };

  const items: Item[] = [
    {
      kind: "item",
      icon: ExternalLink,
      label: "Open project page",
      onAction: () => openProject(project.path),
    },
    {
      kind: "item",
      icon: Folder,
      label: "Editor",
      onAction: () => openTarget(project.path, "editor"),
    },
    {
      kind: "item",
      icon: TerminalIcon,
      label: "Terminal",
      onAction: () => openTarget(project.path, "terminal"),
    },
    {
      kind: "item",
      icon: Folder,
      label: "File manager",
      onAction: () => openTarget(project.path, "folder"),
    },
  ];

  if (project.git.remote) {
    items.push(
      { kind: "separator" },
      {
        kind: "item",
        icon: GitBranch,
        label: "Repository",
        onAction: () => window.open(project.git.remote?.links.web, "_blank"),
      },
      {
        kind: "item",
        icon: ExternalLink,
        label: "Issues",
        onAction: () => window.open(project.git.remote?.links.issues, "_blank"),
      },
      {
        kind: "item",
        icon: ExternalLink,
        label: "Pull requests",
        onAction: () => window.open(project.git.remote?.links.pulls, "_blank"),
      },
    );
  }

  items.push(
    { kind: "separator" },
    {
      kind: "item",
      icon: Copy,
      label: "Copy path",
      onAction: () => void copyPath(),
    },
    {
      kind: "item",
      icon: EyeOff,
      label: "Hide from console",
      onAction: () => hide.mutate({ path: project.path, hidden: true }),
      destructive: true,
    },
  );

  return (
    <div
      ref={rootRef}
      className="relative flex items-center gap-0.5"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label={project.pinned ? `Unpin ${project.name}` : `Pin ${project.name}`}
        disabled={pin.isPending}
        onClick={() => pin.mutate({ path: project.path, pinned: !project.pinned })}
        className="flex size-6 items-center justify-center text-muted-foreground outline-none transition-colors hover:text-[var(--mc-accent)] focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
      >
        {project.pinned ? (
          <PinOff aria-hidden className="size-3" />
        ) : (
          <Pin aria-hidden className="size-3" />
        )}
      </button>
      <button
        type="button"
        aria-label={`Actions for ${project.name}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex size-6 items-center justify-center outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring",
          open
            ? "bg-muted text-[var(--mc-accent)]"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <MoreHorizontal aria-hidden className="size-3.5" />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && pos !== null ? (
            <motion.div
              ref={menuRef}
              role="menu"
              aria-label={`${project.name} actions`}
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -2, scale: 0.99 }}
              transition={{ duration: 0.13, ease: [0.2, 0.8, 0.3, 1] }}
              style={{ position: "fixed", left: pos.left, top: pos.top, width: MENU_WIDTH }}
              className="mc z-[80] flex flex-col border border-[var(--mc-line-strong)] bg-[var(--popover)] py-1 shadow-xl"
            >
              {items.map((item, i) =>
                item.kind === "separator" ? (
                  <span key={i} aria-hidden className="my-1 h-px bg-[var(--mc-line)]" />
                ) : (
                  <button
                    key={i}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      item.onAction();
                    }}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 text-left text-xs outline-none transition-colors",
                      item.destructive
                        ? "text-destructive hover:bg-destructive/10"
                        : "text-foreground hover:bg-muted hover:text-[var(--mc-accent)]",
                      "focus-visible:bg-muted focus-visible:text-[var(--mc-accent)]",
                    )}
                  >
                    <item.icon aria-hidden className="size-3 text-muted-foreground" />
                    {item.label}
                  </button>
                ),
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
