# Research: Serving HTML reports + long-running jobs (Topic C)

Date: 2026-08-21. Two questions: (1) how to serve a generated static HTML
report from a TanStack Start server route; (2) the lightest robust pattern for
long-running spawned CLI jobs (git-snitch, 10s+).

Version ground truth (from `pnpm-lock.yaml`): `@tanstack/react-start`
**1.168.32**, `@tanstack/react-router` 1.170.18, `@tanstack/start-client-core`
1.170.14 (provides the server-route types), `@trpc/server` 11.18, Vite 8.1.5,
Node 22+.

## 1. Serving a generated HTML file from a server route

**Verified answer:** use a file route with `server.handlers.GET` returning a
fetch-API `Response` with an explicit content type — exactly the pattern
already in `apps/web/src/routes/api/trpc/$.ts`, just returning HTML instead
of the tRPC handler's result.

Primary sources:

- **Installed types** (`@tanstack/start-client-core/dist/esm/serverRoute.d.ts`
  in this repo's node_modules): route options accept
  `server?: { handlers?: Partial<Record<'ANY'|'GET'|'POST'|'PUT'|'PATCH'|'DELETE'|'OPTIONS'|'HEAD', handler>> }`;
  a handler is
  `(ctx: { request: Request; params; pathname; next }) => Response | undefined | Promise<...>`.
  So handlers receive a **web `Request`** and must return a **web `Response`**.
- **Official docs** ([Server Routes guide][ts-server-routes]): same shape —
  `createFileRoute('/api/hello')({ server: { handlers: { GET: async ({ request }) => new Response('...') } } })`;
  custom content types are just `new Response(body, { headers: { 'Content-Type': ... } })`.
  File conventions: `routes/reports/$id.ts` → `/reports/$id`; dot-suffixed
  paths are escaped in the filename, e.g. `routes/report[.]html.ts` →
  `/report.html`; only one handler file may resolve to a given path.

[ts-server-routes]: https://tanstack.com/start/latest/docs/framework/react/guide/server-routes

### Recommended shape for this app

```ts
// apps/web/src/routes/reports/$projectId.ts
import { createFileRoute } from "@tanstack/react-router";
import { readReport } from "@workspace-welcome/api/reports"; // resolves+reads from XDG_CACHE_HOME, returns string | null

export const Route = createFileRoute("/reports/$projectId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const html = await readReport(params.projectId); // server-side: node:fs/promises
        if (!html) return new Response("Report not generated yet", { status: 404 });
        return new Response(html, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            // reports are self-contained and regenerated on demand; never cache stale
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
```

Notes verified against this codebase:

- **Node APIs in handlers are fine** — handlers run in the server process:
  dev = Vite dev server (Node), prod = `apps/web/serve-prod.mjs`, a plain
  `node:http` server that forwards non-asset requests to the built fetch
  handler. The tRPC route handler already transitively executes
  `node:fs/promises`/`node:child_process` from `packages/api` in the same
  position, so `node:fs` in a route handler is a proven path, not a bet.
- `serve-prod.mjs` streams any `Response` body (it pumps `response.body`
  chunks via `res.write`), so binary responses (file browser downloads) also
  pass through — for those, return `new Response(new Uint8Array(buf), ...)`
  plus `content-disposition: attachment; filename="..."`.
- Reports are self-contained HTML (CONTEXT.md), so no asset rewriting is
  needed; serve with `no-store` or an ETag derived from the file mtime.
- Path safety: `params.projectId` should be treated as an opaque report key
  (e.g. slug/hash), never spliced into a filesystem path — resolve inside the
  reports cache dir and reject escapes, mirroring ADR-0002's containment
  approach.

## 2. Long-running spawned CLI jobs (git-snitch)

**Recommendation: in-process job registry + tRPC query polling.** SSE exists
and works in this stack, but for this app polling is strictly lighter and
more robust (reasoning below).

### Why polling wins here

- The job is a **single-user, 10s–60s, few-state-transitions** process
  (`running → done | failed`). There is no high-frequency event stream that
  would justify a persistent connection.
- No new client plumbing: polling is `useQuery(..., { refetchInterval })`
  with the existing `@trpc/tanstack-react-query` setup; SSE subscriptions
  require wiring `httpSubscriptionLink` into the tRPC client and async
  generator procedures server-side ([tRPC subscriptions docs][trpc-subs]).
- Survives dev-server reloads and tab sleep: a dropped SSE stream needs
  reconnect + `tracked()` event-ID resumption semantics; a poll just picks
  the state back up.
- Matches the codebase's existing pattern: `packages/api/src/lib/scan-cache.ts`
  already solves "expensive thing, dedupe concurrent callers" with an
  in-memory cache + a shared in-flight Promise. The job registry is the same
  shape with a lifecycle.

[trpc-subs]: https://trpc.io/docs/subscriptions

### Registry sketch (fits existing patterns)

```ts
// packages/api/src/lib/report-jobs.ts
type Job = {
  id: string;                // opaque id, doubles as report key
  status: "running" | "done" | "failed";
  startedAt: string; exitCode: number | null;
  stderrTail: string;        // last ~50 lines for the failure toast (ADR-0001)
};
const jobs = new Map<string, Job>();

// mutation: reports.generate
//  - if a job for this key is already running, return it (dedupe, like scan-cache inFlight)
//  - spawn(cmd, args, { cwd: projectPath })  // NOT the detached launch() in spawn.ts:
//                                              attached, pipes captured, timeout
//  - on exit: record exitCode + stderr tail; report file lands in XDG_CACHE_HOME/workspace-welcome/reports/
// query: reports.job(id) -> Job   (polled with refetchInterval while status === "running")
```

- Spawn must **surface CLI failures** (non-zero exit / ENOENT on the binary)
  per ADR-0001 — capture `stderr`, keep the tail on the job record.
- Timeout (e.g. 120s) with SIGTERM → SIGKILL escalation.
- Kill in-flight children on process exit (same hook the IDE child will
  need; see Topic A research) so a dev-server restart never orphans a
  git-snitch process.
- Jobs map is in-memory only — after an app restart the UI sees "no job" and
  the report file (if written) is still servable via the route above. That's
  the right persistence boundary: the *file* is the state, the registry is
  just the live handle.

### If SSE is ever wanted (upgrade path, verified)

tRPC v11 supports subscriptions via SSE `httpSubscriptionLink` or `wsLink`,
recommending SSE ("easier to setup", no WebSocket server), with async
generator procedures and `tracked()` for resumption ([docs][trpc-subs]).
`serve-prod.mjs` streams response bodies, so SSE would pass through in prod.
Cost: client link changes, generator procedures, reconnect semantics — all
for a job that emits ~3 events. Not worth it now.

## Not verified / caveats

- The `[.]`-escaping route filename convention and single-handler-per-path
  rule come from the official Server Routes guide (current as of Aug 2026);
  the installed types confirm the handler signature but file-name routing is
  generated by the Vite plugin at dev/build time — confirm with one throwaway
  route if a dot-suffixed path is ever needed (plain `$param` paths like the
  tRPC route are already proven in this repo).
- `httpSubscriptionLink` + `@trpc/tanstack-react-query` interop was not
  prototyped (not needed for the recommendation).
