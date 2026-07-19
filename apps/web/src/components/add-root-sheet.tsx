import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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

import { useTRPC } from "@/utils/trpc";

interface AddRootSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: () => void;
}

/**
 * A sheet for adding a new root directory. Uses an absolute-path text field
 * (browsers can't open a real folder picker from a web page) and reports
 * server-side validation errors inline.
 */
export function AddRootSheet({
  open,
  onOpenChange,
  onAdded,
}: AddRootSheetProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [path, setPath] = useState("");
  const [label, setLabel] = useState("");

  const addMutation = useMutation(
    trpc.roots.add.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.roots.list.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.projects.scan.queryKey(),
        });
        toast.success("Directory added");
        setPath("");
        setLabel("");
        onOpenChange(false);
        onAdded?.();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

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
            addMutation.mutate({ path, label: label || undefined });
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="root-path">Path</Label>
            <Input
              id="root-path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
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
              value={label}
              onChange={(e) => setLabel(e.target.value)}
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
            <Button type="submit" disabled={addMutation.isPending || !path}>
              Add directory
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
