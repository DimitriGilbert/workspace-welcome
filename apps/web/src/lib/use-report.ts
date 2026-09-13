import { toast } from "sonner";

import type { ReportPeriod } from "@workspace-welcome/api/routers/reports";

import {
  useReportGenerateMutation,
  useReportSettleNotifier,
} from "@/lib/queries/reports";

export interface ReportRunOptions {
  kind: "repo" | "scan";
  path: string;
  /** Regenerate even when a saved report exists. Default false. */
  force?: boolean;
  /** git-snitch period preset; absent = all history. */
  period?: ReportPeriod;
}

/**
 * Kick off a report run and show it in a new tab. The tab must be opened
 * SYNCHRONOUSLY inside the click handler — popup blockers only permit
 * window.open during a user gesture, and the job key only exists once the
 * mutation resolves. The /reports page handles the wait-and-swap itself.
 *
 * The run targets the same deterministic key the page's report provider
 * reads, so the provider's registry watch settles it for the widgets (one
 * invalidation when the job lands). The only case the registry never sees
 * is the cache hit — a synthetic done job, never stored server-side — so
 * its settle (possibly a backfilled export) is reported here.
 *
 * All query/mutation wiring delegates to `lib/queries/`; this hook owns
 * only the open-a-tab choreography.
 */
export function useReportRun() {
  const generate = useReportGenerateMutation();
  const reportSettled = useReportSettleNotifier();

  const run = ({
    kind,
    path,
    force = false,
    period,
  }: ReportRunOptions): void => {
    // No "noopener": with it window.open returns null BY SPEC, so we could
    // never navigate the tab afterwards. The blank tab is same-origin, so
    // holding the opener reference is harmless. A cache hit (force=false,
    // report on disk) resolves done instantly and the tab opens straight
    // into the saved report; otherwise the waiting page takes over.
    const win = window.open("", "_blank");
    generate.mutate(
      { kind, path, force, period },
      {
        onSuccess: (job) => {
          if (job.status === "done") reportSettled(job);
          const url = `/reports/${job.key}`;
          if (win) {
            win.location.href = url;
          } else {
            // Blocked anyway. The toast action's click is itself a user
            // gesture, so opening from there clears the popup blocker.
            toast.success("Report started", {
              action: {
                label: "Open",
                onClick: () => window.open(url, "_blank", "noopener"),
              },
            });
          }
        },
        onError: (e) => {
          win?.close();
          toast.error(e.message);
        },
      },
    );
  };

  return { run, isPending: generate.isPending };
}
