import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace-welcome/ui/components/dialog";

import { CreateProjectFlow } from "@/lib/forms";
import type { ScaffoldResult } from "@/lib/forms";

import { FormAddRoot } from "@/widgets/parts/form/add-root";

/**
 * FormCreateProject — the scaffold wizard in a token-styled ui Dialog
 * (master plan §3.5). All flow logic — roots gating, the formedible wizard
 * with its live equivalent-command preview, job tracking, toasts — lives in
 * `CreateProjectFlow` (`@/lib/forms`); this part is the container plus the
 * zero-roots chain-out: when no root directory is registered yet, the
 * FormAddRoot dialog stacks on top and the wizard appears the moment the
 * new root settles.
 */

export interface FormCreateProjectProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired when the tracked scaffold job reaches success. */
  onCreated?: (result: ScaffoldResult) => void;
}

export function FormCreateProject({
  open,
  onOpenChange,
  onCreated,
}: FormCreateProjectProps) {
  // The zero-roots chain-out: FormAddRoot stacks above this dialog so the
  // wizard's (hidden, stateful) mount survives the detour.
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
        {/* Tall + wide: the wizard scrolls its fields and pins the command
            preview — both need real height to stay usable. */}
        <DialogContent className="h-[85vh] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Create a project</DialogTitle>
            <DialogDescription>
              Scaffold a new better-t-stack project into one of your tracked
              root directories.
            </DialogDescription>
          </DialogHeader>
          <CreateProjectFlow
            open={open && !addRootOpen}
            onSuccess={onCreated}
            onRequestAddRoot={() => setAddRootOpen(true)}
            onClose={() => onOpenChange(false)}
          />
        </DialogContent>
      </Dialog>
      <FormAddRoot
        open={addRootOpen}
        onOpenChange={setAddRootOpen}
      />
    </>
  );
}
