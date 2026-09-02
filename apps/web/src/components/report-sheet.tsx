import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace-welcome/ui/components/sheet";
import { Button } from "@workspace-welcome/ui/components/button";
import { Label } from "@workspace-welcome/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace-welcome/ui/components/select";
import { Switch } from "@workspace-welcome/ui/components/switch";

import { useTRPC } from "@/utils/trpc";
import { useReportRun } from "@/lib/use-report";

interface ReportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Workspace report picker: one comparative git-snitch report per tracked
 * directory, covering every project under it. A saved report is opened as-is
 * unless "Force refresh" is on, in which case it is regenerated.
 */
export function ReportSheet({ open, onOpenChange }: ReportSheetProps) {
  const trpc = useTRPC();
  const { run, isPending } = useReportRun();
  const roots = useQuery(trpc.roots.list.queryOptions());

  const [path, setPath] = useState<string | null>(null);
  const [force, setForce] = useState(false);

  // Preselect when only one root is tracked, so the common setup is a single
  // click on Open.
  useEffect(() => {
    if (open && roots.data?.length === 1) setPath(roots.data[0].path);
  }, [open, roots.data]);

  const hasRoots = (roots.data?.length ?? 0) > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Workspace report</SheetTitle>
          <SheetDescription>
            One comparative git report for a tracked directory — every project
            under it on a single page.
          </SheetDescription>
        </SheetHeader>

        <form
          className="flex flex-col gap-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (path === null) return;
            run("scan", path, force);
            onOpenChange(false);
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="report-workspace">Workspace</Label>
            {hasRoots ? (
              <>
                <Select
                  value={path}
                  onValueChange={(value) => setPath(value)}
                >
                  <SelectTrigger
                    className="w-full"
                    aria-label="Tracked directory"
                  >
                    <SelectValue placeholder="Pick a tracked directory…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(roots.data ?? []).map((r) => (
                      <SelectItem key={r.id} value={r.path}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {path !== null ? (
                  <p className="font-mono text-xs text-muted-foreground">
                    {path}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                No directories tracked yet — add one first.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="report-force">Force refresh</Label>
              <p className="text-xs text-muted-foreground">
                Regenerate even if a saved report exists.
              </p>
            </div>
            <Switch
              id="report-force"
              checked={force}
              onCheckedChange={(checked) => setForce(checked)}
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
            <Button type="submit" disabled={!hasRoots || path === null || isPending}>
              {isPending ? "Generating…" : "Open report"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
