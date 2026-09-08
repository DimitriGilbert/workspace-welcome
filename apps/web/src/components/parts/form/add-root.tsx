import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace-welcome/ui/components/dialog";
import { Button } from "@workspace-welcome/ui/components/button";
import { Input } from "@workspace-welcome/ui/components/input";
import { Label } from "@workspace-welcome/ui/components/label";

import { useAddRoot } from "@/lib/forms";

/**
 * FormAddRoot — the add-a-directory form in a token-styled ui Dialog
 * (master plan §3.5: forms are ONE token-styled set over `@/lib/forms`;
 * themes ship no dialog containers). The mutation, invalidations, toasts,
 * field reset, and success closing live in `useAddRoot` — this part is the
 * container. Uses an absolute-path text field (browsers can't open a real
 * folder picker from a web page); server-side validation errors surface as
 * a toast.
 */

export interface FormAddRootProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a successful add (post invalidation + field reset). */
  onAdded?: () => void;
}

export function FormAddRoot({ open, onOpenChange, onAdded }: FormAddRootProps) {
  const addRoot = useAddRoot({
    onAdded,
    onClose: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a directory</DialogTitle>
          <DialogDescription>
            Enter the absolute path of a folder that contains your projects.
            Subdirectories of this folder will be scanned.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            addRoot.submit();
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="form-add-root-path">Path</Label>
            <Input
              id="form-add-root-path"
              value={addRoot.path}
              onChange={(e) => addRoot.setPath(e.target.value)}
              placeholder="/home/you/projects"
              className="font-mono"
              autoFocus
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="form-add-root-label">Label (optional)</Label>
            <Input
              id="form-add-root-label"
              value={addRoot.label}
              onChange={(e) => addRoot.setLabel(e.target.value)}
              placeholder="work"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!addRoot.canSubmit}>
              Add directory
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
