/**
 * Bento's command bar widget — port of the design's `bento-header.tsx` +
 * `bento-root` chrome: identity left, the action row right, the
 * palette-style search spanning below ("/" focuses, Escape clears). The
 * search text IS the widget system's one workspace filter
 * (`useWorkspace().filter`), so the board narrows exactly like the design's
 * single filtered set. The dialogs are the theme's glazed ports
 * (`../dialogs`); the design's ideation handoff after create is reduced to
 * the open-project action (the app project route has no ideation deep
 * link), and the refresh button rides the provider's rescan handler.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import {
  FileText,
  Folder,
  FolderPlus,
  PackagePlus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Terminal as TerminalIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@workspace-welcome/ui/components/button";
import { WorkspaceBrand } from "@workspace-welcome/ui/components/workspace-brand";

import { formatElapsed } from "@/lib/format";
import { matchProject } from "@/lib/search";

import { useWorkspace } from "@/lib/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/components/widgets/registry";
import { ThemePicker } from "@/components/widgets/theme-picker";

import { AddRootDialog, CloneScriptDialog, CreateProjectDialog, ReportRunDialog } from "../dialogs";

export function BentoChrome(_props: RegisteredWidgetProps) {
  const workspace = useWorkspace();
  const navigate = useNavigate();

  const [addRootOpen, setAddRootOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses the command field; ignored while typing elsewhere so we
  // never hijack the dialogs' inputs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const projects = workspace.projects;
  const visible = projects.filter((p) => matchProject(p, workspace.filter));
  const hasRoots = (workspace.roots.data?.length ?? 0) > 0;
  const isFetching = workspace.scan.isFetching;

  return (
    <>
      {/* The design's header is NOT a glazed tile — it floats on the canvas.
          The bento-chrome shell skin is stripped in the theme stylesheet. */}
      <header className="flex h-full min-h-0 w-full flex-col justify-center gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <WorkspaceBrand render={<Link to="/" />} />

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {/* The bento chrome hides the runtime's console header (the
                command bar replaces it), so the system theme picker hosts
                here — preset + color scheme survive reloads. */}
            <ThemePicker theme="bento" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => workspace.refresh()}
              disabled={isFetching}
              aria-label="Refresh scan"
            >
              <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} />
              <span className="hidden lg:inline">Refresh</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCloneOpen(true)}
              disabled={projects.length === 0}
              aria-label="Clone script"
            >
              <TerminalIcon className="size-3.5" />
              <span className="hidden lg:inline">Clone script</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setReportOpen(true)}
              disabled={!hasRoots}
              aria-label="Report"
            >
              <FileText className="size-3.5" />
              <span className="hidden lg:inline">Report</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(true)} aria-label="Create project">
              <PackagePlus className="size-3.5" />
              <span className="hidden lg:inline">New project</span>
            </Button>
            <Button size="sm" onClick={() => setAddRootOpen(true)}>
              <FolderPlus className="size-3.5" />
              <span className="hidden sm:inline">Add directory</span>
            </Button>
            {/* The canvas renders a live 2rem×2rem resize hit zone on every
                widget corner (z-20, pointer-events always on) — flush at the
                top-right it swallows clicks meant for the gear, so park the
                button exactly one corner-depth in from the edge. */}
            <Button
              variant="ghost"
              size="icon-sm"
              className="mr-8"
              render={<Link to="/settings" aria-label="Settings" />}
            >
              <Settings className="size-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1 md:max-w-xl xl:max-w-2xl">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              type="search"
              value={workspace.filter}
              onChange={(e) => workspace.setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  workspace.setFilter("");
                  searchRef.current?.blur();
                }
              }}
              placeholder="Filter projects by name, path, stack, branch, note"
              aria-label="Filter projects"
              className="b-search h-11 w-full rounded-xl border border-border bg-white/[0.03] pl-10 pr-14 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus-visible:border-(--primary) focus-visible:ring-2 focus-visible:ring-ring/25"
            />
            <kbd className="b-kbd absolute right-3.5 top-1/2 -translate-y-1/2" aria-hidden>
              /
            </kbd>
          </div>
          {workspace.filter.trim().length > 0 ? (
            <p className="font-mono text-[0.7rem] tabular-nums text-muted-foreground" role="status">
              {visible.length} of {projects.length}
            </p>
          ) : null}
        </div>
      </header>

      <AddRootDialog
        open={addRootOpen}
        onOpenChange={setAddRootOpen}
        onAdded={() => workspace.refresh()}
      />
      <ReportRunDialog open={reportOpen} onOpenChange={setReportOpen} />
      <CloneScriptDialog projects={visible} open={cloneOpen} onOpenChange={setCloneOpen} />
      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={(result) => {
          const segments = result.projectDirectory.split("/").filter(Boolean);
          const toastId = toast.success(
            `Created ${segments.at(-1) ?? result.projectDirectory} in ${formatElapsed(result.elapsedTimeMs)}`,
            {
              description: result.reproducibleCommand,
              action: (
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void navigate({
                        to: "/project/$",
                        params: { _splat: result.projectDirectory.replace(/^\/+/, "") },
                      });
                      toast.dismiss(toastId);
                    }}
                  >
                    <Folder className="size-3.5" /> Open project
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      void navigate({
                        to: "/project/$",
                        params: { _splat: result.projectDirectory.replace(/^\/+/, "") },
                      });
                      toast.dismiss(toastId);
                    }}
                  >
                    <Sparkles className="size-3.5" /> Start ideation
                  </Button>
                </div>
              ),
            },
          );
          workspace.refresh();
        }}
        onError={(message) => toast.error(message)}
        onRequestAddRoot={() => setAddRootOpen(true)}
      />
    </>
  );
}
