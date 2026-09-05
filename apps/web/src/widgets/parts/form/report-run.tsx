import { useEffect, useState } from "react";
import { Zap } from "lucide-react";

import type { ReportPeriod } from "@workspace-welcome/api/routers/reports";
import { Button } from "@workspace-welcome/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace-welcome/ui/components/dialog";
import { Label } from "@workspace-welcome/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace-welcome/ui/components/select";
import { Switch } from "@workspace-welcome/ui/components/switch";

import { REPORT_PERIOD_PRESETS } from "@/lib/queries/reports";
import { useReportRun } from "@/lib/use-report";

import { useWorkspace } from "@/widgets/contexts/workspace-context";

/**
 * FormReportRun — the workspace HTML-report launcher in a token-styled ui
 * Dialog (master plan §3.5): scope (tracked directory) + period + force,
 * then `useReportRun` opens the report in a new tab. Period choices come
 * from the queries module's `REPORT_PERIOD_PRESETS` (All → undefined) — one
 * source of truth with the report pipeline; presets are keyed by label.
 * The root list comes from `useWorkspace().roots` (raw result, exposed not
 * copied).
 */

export function FormReportRun({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const workspace = useWorkspace();
  const roots = workspace.roots.data ?? [];
  const { run, isPending } = useReportRun();

  const [path, setPath] = useState<string | null>(null);
  const [periodLabel, setPeriodLabel] = useState<string>(
    REPORT_PERIOD_PRESETS[0]?.label ?? "All",
  );
  const [force, setForce] = useState(false);

  // Default to the only choice when there's exactly one root.
  useEffect(() => {
    if (open && roots.length === 1) setPath(roots[0]?.path ?? null);
  }, [open, roots]);

  const period: ReportPeriod | undefined =
    REPORT_PERIOD_PRESETS.find((p) => p.label === periodLabel)?.value;
  const hasRoots = roots.length > 0;

  const submit = () => {
    if (path === null) return;
    run({ kind: "scan", path, force, period });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Workspace report</DialogTitle>
          <DialogDescription>
            One comparative git report for a tracked directory, in a new tab.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="form-report-run-root">Tracked directory</Label>
            <Select
              value={path}
              onValueChange={(value) => setPath(value)}
            >
              <SelectTrigger className="w-full" aria-label="Tracked directory">
                <SelectValue placeholder="Pick a tracked directory…" />
              </SelectTrigger>
              <SelectContent>
                {roots.map((r) => (
                  <SelectItem key={r.id} value={r.path}>
                    {r.label === r.path ? r.path : `${r.label} · ${r.path}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="form-report-run-period">Period</Label>
            <Select
              value={periodLabel}
              onValueChange={(value) => {
                if (value !== null) setPeriodLabel(value);
              }}
            >
              <SelectTrigger className="w-full" aria-label="Report period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORT_PERIOD_PRESETS.map((p) => (
                  <SelectItem key={p.label} value={p.label}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="flex flex-col gap-0.5">
              <Label htmlFor="form-report-run-force">Force refresh</Label>
              <span className="text-xs text-muted-foreground">
                Regenerate even if a saved report exists.
              </span>
            </span>
            <Switch
              id="form-report-run-force"
              checked={force}
              onCheckedChange={(checked) => setForce(checked)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!hasRoots || path === null || isPending}>
              <Zap className="size-3.5" aria-hidden />
              {isPending ? "Starting…" : "Open report"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
