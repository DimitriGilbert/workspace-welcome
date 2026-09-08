/**
 * McActions — the console's action band (owner gap: the workspace verbs had
 * no first-class surface on the board). One canvas-ground register row beside
 * the masthead and the command bar: an mc-label eyebrow over the four
 * workspace flows — add a directory, create a project, generate the
 * workspace report, build the clone script — plus the settings link. Each
 * verb opens its token-styled form part (`components/parts/form/*`, §3.5:
 * themes compose the ONE set of flows — no theme-local dialogs, no new
 * tRPC); the command bar's Actions menu opens the same parts, so the verbs
 * have two doors in the band. Mutations ride the parts' own hooks; the band
 * only refreshes the workspace scan after a root/project change.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  FolderPlus,
  PackagePlus,
  Terminal,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@workspace-welcome/ui/lib/utils";

import { FormAddRoot } from "@/components/parts/form/add-root";
import { FormCloneScript } from "@/components/parts/form/clone-script";
import { FormCreateProject } from "@/components/parts/form/create-project";
import { FormReportRun } from "@/components/parts/form/report-run";
import { useWorkspace } from "@/lib/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/components/widgets/registry";
import { WidgetShell } from "@/components/widgets/widget-shell";

import { MC_ACTION_BUTTON } from "./command-bar";

interface ActionVerb {
  label: string;
  icon: LucideIcon;
  open: () => void;
}

export function McActions(_props: RegisteredWidgetProps) {
  const workspace = useWorkspace();

  const [addRootOpen, setAddRootOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);

  const verbs: ActionVerb[] = [
    { label: "Add directory", icon: FolderPlus, open: () => setAddRootOpen(true) },
    { label: "Create project", icon: PackagePlus, open: () => setCreateOpen(true) },
    { label: "Generate report", icon: Zap, open: () => setReportOpen(true) },
    { label: "Clone script", icon: Terminal, open: () => setCloneOpen(true) },
  ];

  return (
    <>
      <WidgetShell className="h-full w-full">
        <div className="flex h-full min-h-0 w-full min-w-0 flex-wrap content-center items-center gap-x-2.5 gap-y-2 overflow-hidden px-4 pb-2 min-[2200px]:px-6">
          <span className="mr-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground">
            Actions
          </span>
          {verbs.map((verb) => (
            <button
              key={verb.label}
              type="button"
              onClick={verb.open}
              className={MC_ACTION_BUTTON}
            >
              <verb.icon aria-hidden className="size-3" />
              {verb.label}
            </button>
          ))}
          <Link to="/settings" className={cn(MC_ACTION_BUTTON, "ml-auto")}>
            Settings
            <ArrowUpRight aria-hidden className="size-3" />
          </Link>
        </div>
      </WidgetShell>
      <FormAddRoot
        open={addRootOpen}
        onOpenChange={setAddRootOpen}
        onAdded={() => workspace.refresh()}
      />
      <FormCreateProject
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          toast.success("Project created");
          workspace.refresh();
        }}
      />
      <FormReportRun open={reportOpen} onOpenChange={setReportOpen} />
      <FormCloneScript open={cloneOpen} onOpenChange={setCloneOpen} />
    </>
  );
}
