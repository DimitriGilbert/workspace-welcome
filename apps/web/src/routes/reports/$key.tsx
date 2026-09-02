import { createFileRoute } from "@tanstack/react-router";

import {
  readReportHtml,
  REPORT_KEY_RE,
} from "@workspace-welcome/api/lib/snitch";

/**
 * Report serving as a plain server route (same pattern as api/files/*): the
 * finished HTML file IS the page, so GET returns it verbatim. While the file
 * is missing — run in flight, or a key whose job predates the last restart —
 * GET serves the self-contained waiting page instead. A server handler must
 * always return a Response: returning `undefined` for "not yet" is what made
 * every first report run surface as a 500 error tab. The waiting page polls
 * reports.job and reloads into the report the moment the file lands; the
 * React tree never mounts on this path.
 */
export const Route = createFileRoute("/reports/$key")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { key } = params;
        // Keys are opaque to callers; anything malformed was never a report
        // URL, so it gets a bare 404 rather than a waiting page.
        if (!REPORT_KEY_RE.test(key)) {
          return new Response("Not found", { status: 404 });
        }
        const html = await readReportHtml(key);
        return new Response(html ?? waitingPage(key), {
          headers: {
            "content-type": "text/html; charset=utf-8",
            // Reports are regenerated on demand; never serve a stale one.
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});

/**
 * Stand-in page for a report that isn't written yet. Self-contained — no app
 * JS, so it works in the blank tab use-report.ts opens synchronously. Polls
 * the job registry once a second: reloads into the finished report on
 * success, shows the captured stderr on failure, and explains the no-run
 * case (key from before the last restart). Same contract the previous React
 * waiting room implemented, minus the framework.
 */
function waitingPage(key: string): string {
  const keyJson = JSON.stringify(key);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Report — workspace-welcome</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; }
  main { max-width: 42rem; margin: 0 auto; padding: 1.5rem 1.25rem; display: flex; flex-direction: column; align-items: flex-start; gap: 0.75rem; }
  h1 { font-size: 0.8rem; font-weight: 600; margin: 0; }
  p { margin: 0; }
  .err { color: #dc2626; }
  .muted { color: light-dark(#71717a, #a1a1aa); font-size: 0.75rem; }
  .mono { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 0.7rem; word-break: break-all; color: light-dark(#71717a, #a1a1aa); }
  .spin { width: 1.1rem; height: 1.1rem; border: 2px solid light-dark(#d4d4d8, #3f3f46); border-top-color: transparent; border-radius: 9999px; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(1turn); } }
  .row { display: flex; align-items: center; gap: 0.6rem; }
  .stack { display: flex; flex-direction: column; align-items: flex-start; gap: 0.75rem; }
  pre { margin: 0; max-height: 24rem; overflow: auto; border: 1px solid light-dark(#e4e4e7, #27272a); background: light-dark(#fafafa, #18181b); padding: 0.75rem; font-size: 0.7rem; white-space: pre-wrap; word-break: break-word; }
  a { font-size: 0.75rem; color: inherit; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<main>
  <div id="busy" class="row">
    <span class="spin" aria-hidden="true"></span>
    <p>Generating report…</p>
  </div>
  <p id="busy-target" class="mono" hidden></p>
  <div id="fail" class="stack" hidden>
    <h1 class="err">Report failed</h1>
    <pre id="fail-stderr"></pre>
  </div>
  <div id="absent" class="stack" hidden>
    <h1>No report generated yet</h1>
    <p class="muted">No run is recorded for this report — it may predate the last app restart. Start a run from a project page or a tracked directory.</p>
  </div>
  <a id="back" href="/" hidden>Back to dashboard</a>
</main>
<script type="module">
const key = ${keyJson};
const busy = document.getElementById("busy");
const busyTarget = document.getElementById("busy-target");
const fail = document.getElementById("fail");
const failStderr = document.getElementById("fail-stderr");
const absent = document.getElementById("absent");
const back = document.getElementById("back");
const jobUrl = "/api/trpc/reports.job?input=" + encodeURIComponent(JSON.stringify({ key: key }));

function settle() {
  busy.hidden = true;
  busyTarget.hidden = true;
  back.hidden = false;
}

async function tick() {
  // undefined = transient (network hiccup, unexpected envelope) — keep
  // polling; null = the registry has no run for this key.
  let job;
  try {
    const res = await fetch(jobUrl);
    if (res.ok) {
      const body = await res.json();
      if (body !== null && typeof body === "object" &&
          body.result !== null && typeof body.result === "object" &&
          "data" in body.result) {
        job = body.result.data;
      }
    }
  } catch {
    // Transient — retry on the next tick.
  }
  if (job === undefined) { setTimeout(tick, 1500); return; }
  if (job === null) { absent.hidden = false; settle(); return; }
  if (job.status === "done") { location.reload(); return; }
  if (job.status === "failed") {
    failStderr.textContent = job.stderrTail || "No stderr captured.";
    fail.hidden = false;
    settle();
    return;
  }
  busyTarget.textContent = job.kind + " · " + job.targetPath;
  busyTarget.hidden = false;
  setTimeout(tick, 1000);
}

tick();
</script>
</body>
</html>`;
}
