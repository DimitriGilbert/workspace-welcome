import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace-welcome/ui/components/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace-welcome/ui/components/tabs";

import { CloneRepositoryFlow, CreateProjectFlow } from "@/lib/forms";
import type { CloneResult, ScaffoldResult } from "@/lib/forms";

import { FormAddRoot } from "@/components/parts/form/add-root";

/**
 * FormCreateProject — the tabbed create-project dialog (master plan §3.5):
 * one "Scaffold" tab (the better-t-stack wizard) and one "Clone from git"
 * tab (the git URL form), each backed by its own container-independent flow
 * in `@/lib/forms` with its own job tracking. All flow logic — roots
 * gating, the formedible forms with their live equivalent-command
 * previews, job polling, toasts — stays in those flows; this part is the
 * container plus the zero-roots chain-out shared by both tabs: when no root
 * directory is registered yet, the FormAddRoot dialog stacks on top and the
 * active flow reappears the moment the new root settles.
 */

export interface FormCreateProjectProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired when the tracked scaffold job reaches success. */
  onCreated?: (result: ScaffoldResult) => void;
  /** Fired when the tracked clone job reaches success. */
  onCloned?: (result: CloneResult) => void;
}

export function FormCreateProject({
  open,
  onOpenChange,
  onCreated,
  onCloned,
}: FormCreateProjectProps) {
  // The zero-roots chain-out: FormAddRoot stacks above this dialog so the
  // tabs' (hidden, stateful) mounts survive the detour.
  const [addRootOpen, setAddRootOpen] = useState(false);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          if (!next) setAddRootOpen(false);
        }}
      >
        {/* Height caps rather than fixes: the clone tab's four fields fit a
            short dialog whole (submit in view), while the wizard grows to
            its content and scrolls only past the cap. */}
        <DialogContent className="max-h-[85vh] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Create a project</DialogTitle>
            <DialogDescription>
              Scaffold a new better-t-stack project or clone an existing
              repository into one of your tracked root directories.
            </DialogDescription>
          </DialogHeader>
          {/* Inactive panels stay mounted (keepMounted — Base UI unmounts
              them by default), so each tab's form values survive a flip
              mid-thought. */}
          <Tabs defaultValue="scaffold" className="flex min-h-0 flex-1 flex-col gap-0">
            <div className="border-b border-border px-4 py-3">
              <TabsList className="w-full">
                <TabsTrigger value="scaffold">Scaffold</TabsTrigger>
                <TabsTrigger value="clone">Clone from git</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="scaffold" keepMounted className="flex min-h-0 flex-1 flex-col">
              <CreateProjectFlow
                open={open && !addRootOpen}
                onSuccess={onCreated}
                onRequestAddRoot={() => setAddRootOpen(true)}
                onClose={() => onOpenChange(false)}
              />
            </TabsContent>
            <TabsContent value="clone" keepMounted className="flex min-h-0 flex-1 flex-col">
              <CloneRepositoryFlow
                open={open && !addRootOpen}
                onSuccess={onCloned}
                onRequestAddRoot={() => setAddRootOpen(true)}
                onClose={() => onOpenChange(false)}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      <FormAddRoot
        open={addRootOpen}
        onOpenChange={setAddRootOpen}
      />
    </>
  );
}
