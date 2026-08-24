import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { readReportHtml } from "@workspace-welcome/api/lib/snitch";
import { Button } from "@workspace-welcome/ui/components/button";

import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/reports/$key")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const html = await readReportHtml(params.key);
        // No file yet → undefined, the typed-valid fall-through: the route
        // component renders and waits out the run. The key itself is
        // regex-validated inside readReportHtml and never spliced into a path.
        if (html === null) return undefined;
        return new Response(html, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            // Reports are regenerated on demand; never serve a stale one.
            "cache-control": "no-store",
          },
        });
      },
    },
  },
  component: ReportRoute,
});

/**
 * Waiting room for a report. The GET handler serves the finished HTML file,
 * so this page only renders while the file is missing: a run in flight, a
 * failure, or an unknown key (e.g. after an app restart).
 */
function ReportRoute() {
  const { key } = Route.useParams();
  const trpc = useTRPC();

  const job = useQuery(
    trpc.reports.job.queryOptions(
      { key },
      {
        // Function form: poll only while the job is running, so a finished
        // (or unknown) job stops the interval instead of polling forever.
        refetchInterval: (query) =>
          query.state.data?.status === "running" ? 1000 : false,
      },
    ),
  );

  // done → the file exists now; reload so the GET handler serves it instead
  // of this page.
  useEffect(() => {
    if (job.data?.status === "done") window.location.reload();
  }, [job.data?.status]);

  // No data yet (first fetch in flight) — indistinguishable from a slow check.
  if (job.data === undefined) {
    return (
      <Shell>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Checking report…</p>
      </Shell>
    );
  }

  const data = job.data;

  if (data === null) {
    return (
      <Shell>
        <h1 className="text-sm font-semibold">No report generated yet</h1>
        <p className="text-xs text-muted-foreground">
          No run is recorded for this key — it may predate the last app
          restart. Start a run from a project page or Settings.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          render={<Link to="/" />}
        >
          Back to dashboard
        </Button>
      </Shell>
    );
  }

  if (data.status === "failed") {
    return (
      <Shell>
        <h1
          className="text-sm font-semibold"
          style={{ color: "var(--sev-error)" }}
        >
          Report failed
        </h1>
        <pre className="max-h-96 overflow-auto rounded-none border bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap">
          {data.stderrTail || "No stderr captured."}
        </pre>
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          render={<Link to="/" />}
        >
          Back to dashboard
        </Button>
      </Shell>
    );
  }

  // Running, or done with the reload in flight.
  return (
    <Shell>
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      <p className="text-sm font-medium">
        {data.status === "done" ? "Report ready — loading…" : "Generating report…"}
      </p>
      <p className="break-all font-mono text-xs text-muted-foreground">
        {data.kind} · {data.targetPath}
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-start gap-3 px-5 py-6 sm:px-8">
      {children}
    </div>
  );
}
