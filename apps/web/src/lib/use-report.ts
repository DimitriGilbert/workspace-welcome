import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { useTRPC } from "@/utils/trpc";

/**
 * Kick off a report run and show it in a new tab. The tab must be opened
 * SYNCHRONOUSLY inside the click handler — popup blockers only permit
 * window.open during a user gesture, and the job key only exists once the
 * mutation resolves. The /reports page handles the wait-and-swap itself.
 */
export function useReportRun() {
  const trpc = useTRPC();
  const generate = useMutation(trpc.reports.generate.mutationOptions());

  const run = (kind: "repo" | "scan", path: string, force = false): void => {
    // No "noopener": with it window.open returns null BY SPEC, so we could
    // never navigate the tab afterwards. The blank tab is same-origin, so
    // holding the opener reference is harmless. A cache hit (force=false,
    // report on disk) resolves done instantly and the tab opens straight
    // into the saved report; otherwise the waiting page takes over.
    const win = window.open("", "_blank");
    generate.mutate(
      { kind, path, force },
      {
        onSuccess: (job) => {
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
