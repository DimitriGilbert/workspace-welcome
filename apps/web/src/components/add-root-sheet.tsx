import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace-welcome/ui/components/sheet";
import { Button } from "@workspace-welcome/ui/components/button";
import { Input } from "@workspace-welcome/ui/components/input";
import { Label } from "@workspace-welcome/ui/components/label";

import { useAddRoot } from "@/lib/forms";

interface AddRootSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: () => void;
}

/**
 * A sheet for adding a new root directory. The container-independent logic —
 * the `roots.add` mutation, query invalidations, toasts, field reset, and
 * success closing — lives in `useAddRoot` (`@/lib/forms`), so redesigns can
 * mount the same flow in any container. Uses an absolute-path text field
 * (browsers can't open a real folder picker from a web page) and reports
 * server-side validation errors inline (via toast).
 */
export function AddRootSheet({
  open,
  onOpenChange,
  onAdded,
}: AddRootSheetProps) {
  const addRoot = useAddRoot({
    onAdded,
    onClose: () => onOpenChange(false),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Add a directory</SheetTitle>
          <SheetDescription>
            Enter the absolute path of a folder that contains your projects.
            Subdirectories of this folder will be scanned.
          </SheetDescription>
        </SheetHeader>

        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            addRoot.submit();
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="root-path">Path</Label>
            <Input
              id="root-path"
              value={addRoot.path}
              onChange={(e) => addRoot.setPath(e.target.value)}
              placeholder="/home/you/projects"
              className="font-mono"
              autoFocus
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="root-label">Label (optional)</Label>
            <Input
              id="root-label"
              value={addRoot.label}
              onChange={(e) => addRoot.setLabel(e.target.value)}
              placeholder="work"
            />
          </div>
          <SheetFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!addRoot.canSubmit}>
              Add directory
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
