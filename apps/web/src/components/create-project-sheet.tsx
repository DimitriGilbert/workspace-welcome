import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace-welcome/ui/components/sheet";

import { CreateProjectFlow } from "@/lib/forms";
import type { ScaffoldResult } from "@/lib/forms";

interface CreateProjectSheetProps {
  /** Sheet visibility — fully controlled by the caller. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Fired once when the tracked job reaches status "success"; the sheet then
   * closes itself through `onOpenChange(false)`. The caller owns toasts and
   * the `projects.scan` invalidation.
   */
  onSuccess?: (result: ScaffoldResult) => void;
  /**
   * Fired for every surfaced failure: a rejected `scaffold.start` (including
   * the single-flight BAD_REQUEST), a job that ended in status "error", and a
   * job lost to a server restart. The message is also shown inline.
   */
  onError?: (message: string) => void;
  /**
   * Fired when the sheet has zero registered roots and the user asks to add
   * one; the caller typically closes this sheet and opens the add-directory
   * sheet.
   */
  onRequestAddRoot?: () => void;
}

/**
 * Create-project sheet: the default side-panel container for the shared
 * create-project flow (`@/lib/forms`), which owns the formedible wizard, the
 * live equivalent-CLI preview, the `scaffold.start` submit, and the job
 * progress tracking. The sheet contributes only the Sheet chrome — dashboard
 * redesigns can mount `CreateProjectFlow` in any container. No toasts are
 * fired from here — the callbacks are the caller's hook for that (wiring
 * phase 3.2).
 */
export function CreateProjectSheet({
  open,
  onOpenChange,
  onSuccess,
  onError,
  onRequestAddRoot,
}: CreateProjectSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Create a new project</SheetTitle>
          <SheetDescription>
            Scaffold a better-t-stack project under a registered root. The
            equivalent CLI command updates live as you pick options.
          </SheetDescription>
        </SheetHeader>
        <CreateProjectFlow
          open={open}
          onSuccess={onSuccess}
          onError={onError}
          onRequestAddRoot={onRequestAddRoot}
          onClose={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
