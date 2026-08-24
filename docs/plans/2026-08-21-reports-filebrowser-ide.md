# Plan: git-snitch Reports, per-Project File Browser, Web IDE

## Overview

Add three features to workspace-welcome, building on top of the uncommitted WIP
(dedicated project page `apps/web/src/routes/projects.$.tsx`, `open-project.ts`,
`serve-prod.mjs` — treat as baseline, never revert):

1. **git-snitch Reports** — configurable snitch command (Settings, ADR-0001),
   on-demand per-Project (`repo`) and per-Root (`scan`) report runs through an
   in-process job registry with tRPC polling, HTML reports cached under
   `$XDG_CACHE_HOME/workspace-welcome/reports/` and served by a TanStack Start
   server route that opens in a new tab.
2. **File Browser** — per-Project file tree on the project page, confined
   server-side to the project subtree (ADR-0002), with lazy directory listing,
   upload (drag-drop), rename, trash-with-fallback delete, new folder, and
   download; assembled from primitives (ADR-0005).
3. **Web IDE** — code-server auto-installed into `$XDG_DATA_HOME` on first use
   (ADR-0004), lifecycle managed by the app (ADR-0003): start on demand, single
   shared instance, `--auth none` bound to `0.0.0.0` (dev box browsed from the
   LAN), `/healthz` readiness, deep-link per project via `?folder=` with URLs
   built client-side from `window.location.hostname`, stop from Settings.

All decisions are LOCKED in `docs/adr/0001..0005`; verified technical facts are
in `docs/research/2026-08-21-{report-serving,file-browser-ui,web-ide-server}.md`.
Do not re-litigate either set.

## Prerequisites

- Node 22+, pnpm, `git` on PATH (existing app prerequisites).
- Network access for `pnpm add` in Phase 2.2 (lockfile update). Runtime network
  is only needed on first feature use (`npx -y @git-snitch/cli` fallback when
  the local gitsnitch build is absent; code-server tarball download).
- `~/workspace/gitsnitch` is OPTIONAL: default snitch resolution falls back to
  npx when `~/workspace/gitsnitch/apps/cli/dist/index.js` does not exist
  (currently it does not — that is expected and correct per ADR-0001).
- Working tree has uncommitted WIP listed above; execution adds to it. **No git
  commits at any point.**
- No test framework exists in the repo and none may be added (no new packages
  beyond the three listed in Global Conventions). Validation is code review +
  gatekeeping commands only.

## Global Conventions (apply to EVERY dispatch)

**NO-SLOP POLICY (MANDATORY — paste verbatim into every implementer/fixer
dispatch; every validator enforces it):**

- NO `any`, `as any`, `: any` ANYWHERE
- NO placeholder code, NO `// TODO`, NO `// FIXME`
- NO unused imports, NO unused variables — if a variable is not used, it must not exist
- NO console.log hacks to suppress errors. NO void hacks.
- Use `import type` for type-only imports (`verbatimModuleSyntax: true`)
- External imports first, blank line, then local imports
- ONE query/mutation per file, named export
- Do NOT start the dev server

**Repo-specific precedence and conventions (state alongside the policy):**

- The "ONE query/mutation per file" rule does NOT apply to files under
  `packages/api/src/routers/` — this repo's convention is one router file per
  feature containing multiple related procedures (`projects.ts`, `roots.ts`,
  `settings.ts`). Every other NO-SLOP rule applies everywhere, including
  routers.
- Error handling matches existing routers: plain `throw new Error("...")` with
  human-readable messages (the tRPC fetch adapter wraps them). TRPCError is NOT
  used in this codebase — do not introduce it.
- Every tRPC input is zod-validated (`zod` v4 via catalog). Match the
  `.input(z.object({...}))` + `publicProcedure` style of existing routers.
- Module-level singletons for server state are the established pattern
  (`scan-cache.ts`, `store.ts` `memoryCache`) — the job registry and IDE
  manager follow it.
- JSDoc/block comments explain WHY, tersely, in the existing voice.
- Attaching an `'error'` listener on a spawned child is required process
  management (an unhandled `'error'` event crashes the process) — implement it
  with real handling (record the failure on the job/manager), never a bare
  no-op. `console.error` for operational failures is acceptable only where
  `serve-prod.mjs` already does so.
- **Gatekeeping (every implementer AND fixer, before reporting done):**
  `pnpm build` then `pnpm check-types` (both recursive, from repo root). When a
  phase adds files under `apps/web/src/routes/`, run `pnpm build` FIRST — it
  regenerates the gitignored `apps/web/src/routeTree.gen.ts` that the route-id
  types depend on, so a stale tree fails check-types. Both must pass cleanly.
- **New packages allowed — exactly these, exact versions** (Phase 2.2 only):
  `@headless-tree/react@1.7.0` plus its required peer `@headless-tree/core@1.7.0`
  (pnpm does not auto-install peers; core is part of the same library), and
  `react-dropzone@20.1.1`. Nothing else. UI "components" for this plan are new
  wrapper FILES in `packages/ui/src/components/` over the already-installed
  `@base-ui/react` — not packages.
- **No git commits.** Work only in the working tree.

---

## Phase 1: git-snitch Reports

**Type**: Sequential (two sub-phases, each implementer → validator → fixer;
phase-wide validator after both pass)

Verified facts to rely on (from `~/workspace/gitsnitch/apps/cli/src/index.ts`
and `docs/research/2026-08-21-report-serving.md`):

- git-snitch CLI: `git-snitch repo <path>` / `git-snitch scan <dir>`, both
  accept `-o, --output <file>` (writes standalone HTML there), overwrite is the
  DEFAULT (only `--no-overwrite` fails), and `--verbose` streams human-readable
  progress lines to stderr. Exit code 0 on success, 1 on error.
- TanStack Start server routes: `createFileRoute(...)` with
  `server.handlers.GET` receiving a web `Request` and returning a web
  `Response` (or `undefined` to fall through to the route component — typed as
  valid in the installed `@tanstack/start-client-core` serverRoute types).
  Node APIs are fine in handlers; `serve-prod.mjs` streams any `Response` body.

### 1.1: Snitch command, job registry, reports router (packages/api)

**Requirements**:

- Create `packages/api/src/lib/xdg.ts`:
  - `cacheDir()`: `$XDG_CACHE_HOME` or `~/.cache`, joined with
    `workspace-welcome` (mirror how `store.ts` resolves `XDG_CONFIG_HOME`).
  - `reportsDir()`: `cacheDir()/reports`, `mkdir -p` on demand.
- Create `packages/api/src/lib/exit-cleanup.ts`:
  - `registerExitCleanup(fn: () => void): void` — idempotent module singleton
    that installs ONE set of `process.on("exit")`, `process.on("SIGTERM")`,
    `process.on("SIGINT")` handlers and runs all registered (synchronous) fns.
    Handlers must not throw. Used to kill in-flight children so a dev-server
    restart never orphans a git-snitch process (research Topic C) and later the
    IDE child (Phase 3).
- Create `packages/api/src/lib/known-project.ts`:
  - `requireKnownProject(raw: string): Promise<string>` — resolve, require the
    path to be an immediate child of a registered root (mirror the private
    helper in `routers/projects.ts`).
  - `requireKnownRoot(raw: string): Promise<string>` — resolve, require the
    path to equal a registered root's path. Both `readStore()` for validation.
- Create `packages/api/src/lib/snitch.ts`:
  - `resolveSnitchCommand(settings: Settings): { command: string; baseArgs: string[] }`
    (ADR-0001, PATH semantics): if `settings.snitchPath` is set, expand a
    leading `~` to the home dir and use `node <expanded path>`; a set-but-
    missing file throws (the caller records a failed job carrying the
    message). Else if `<homedir>/workspace/gitsnitch/apps/cli/dist/index.js`
    exists (stat), use `["node", <that path>]`; else
    `["npx", "-y", "@git-snitch/cli"]`.
  - `reportKey(kind: "repo" | "scan", absPath: string): string` —
    `` `${kind}-${slug}-${hash8}` `` where slug = basename sanitized to
    `[a-z0-9.-]` (lowercase, collapse the rest to `-`, fallback `"report"`),
    hash8 = first 8 hex chars of `sha1(absPath)`. Deterministic across
    restarts. Report file path = `reportsDir()/<key>.html`.
  - `ReportJob` type: `{ key; kind; targetPath; status: "running" | "done" | "failed"; startedAt: string; finishedAt: string | null; exitCode: number | null; stderrTail: string }`.
  - `startReportRun(kind, targetPath, settings): ReportJob` — in-memory
    `Map<key, ReportJob>`; if a job with this key is `running`, return it
    (dedupe, mirrors scan-cache in-flight). Resolution failures (a configured
    `snitchPath` that doesn't exist) mark the job `failed` with the message —
    no spawn. Otherwise spawn ATTACHED (regular
    `spawn` — NOT the detached `launch()` in `spawn.ts`) with piped stdio,
    `cwd: targetPath`, env passthrough, args =
    `baseArgs + [kind, targetPath, "--output", <reportsDir/key.html>, "--verbose"]`.
    Capture stderr incrementally, keep the last ~8 KB as `stderrTail`. On spawn
    `error` (e.g. ENOENT on the binary) mark `failed` with the message in the
    tail. On exit: code 0 → verify the report file exists (`done`, else
    `failed` with "exited 0 but wrote no report"); non-zero → `failed`. Timeout
    300 000 ms → SIGTERM, 5 s grace → SIGKILL, mark failed ("timed out").
    Register a sync kill fn with `exit-cleanup` while running (deregister on
    exit). Keep finished jobs in the map (last state wins; map is the only
    state — after an app restart `getJob` returns null and the file, if any,
    is still servable; that is the intended persistence boundary).
  - `getJob(key: string): ReportJob | null`.
  - `readReportHtml(key: string): Promise<string | null>` — validate key
    against `/^(repo|scan)-[a-z0-9.-]+-[a-f0-9]{8}$/`, resolve inside
    `reportsDir()`, reject escapes, read file or return null.
- Create `packages/api/src/routers/reports.ts`:
  - `generate` mutation, input `{ kind: z.enum(["repo", "scan"]), path: z.string() }`:
    `repo` → `requireKnownProject`, `scan` → `requireKnownRoot`; then
    `startReportRun` and return the job.
  - `job` query, input `{ key: z.string() }` (regex above) → `getJob` result
    (nullable) — polled by the UI with `refetchInterval` while running.
- Modify `packages/api/src/lib/types.ts`: `Settings` gains
  `snitchPath: string | null` (null = auto-resolve; a set path is run as
  `node <path>`).
- Modify `packages/api/src/lib/store.ts`: `DEFAULT_SETTINGS.snitchPath = null`;
  `migrate()` reads it (string → keep, else null).
- Modify `packages/api/src/routers/settings.ts`: `update` input gains
  `snitchPath: z.string().nullable().default(null)`; persist trimmed-or-null
  like `terminalCommand`. (The web settings UI caller is updated in 1.2 — the
  interim mismatch is expected and harmless.)
- Modify `packages/api/src/routers/index.ts`: register `reports: reportsRouter`.

**Inputs**:
- Read: `packages/api/src/lib/{store.ts,scan-cache.ts,spawn.ts,types.ts}`,
  `packages/api/src/routers/{projects.ts,settings.ts,roots.ts,index.ts}`,
  `packages/api/src/lib/git.ts` (attached exec/spawn + timeout style).
- Reference: research doc section 2 ("Registry sketch"), ADR-0001.

**Outputs**:
- Create: `packages/api/src/lib/xdg.ts`, `packages/api/src/lib/exit-cleanup.ts`,
  `packages/api/src/lib/known-project.ts`, `packages/api/src/lib/snitch.ts`,
  `packages/api/src/routers/reports.ts`.
- Modify: `packages/api/src/lib/types.ts`, `packages/api/src/lib/store.ts`,
  `packages/api/src/routers/settings.ts`, `packages/api/src/routers/index.ts`.

**Validation Criteria**:
- `pnpm build` + `pnpm check-types` pass.
- Spawn is attached with captured pipes — NOT `detached`/`unref` (validator:
  contrast with `launch()` in spawn.ts and confirm).
- Dedupe: second `generate` for a running key returns the existing job without
  spawning.
- Timeout path SIGTERM→SIGKILL escalation present; exit-cleanup registration
  present and deregistered on completion.
- `--output` always passed (never rely on git-snitch's cwd-relative default
  filename); `--verbose` passed so stderr carries progress.
- Key regex identical in `reportKey` production and `readReportHtml`
  validation; key never spliced into a path unsanitized.
- Settings round-trip: store default null, migrate tolerant of absent field,
  `settings.update` persists it.

**Dependencies**: None (first phase).

### 1.2: Report serving route + UI integration (apps/web)

**Requirements**:

- Create `apps/web/src/routes/reports/$key.tsx`:
  - `server.handlers.GET`: call `readReportHtml(key)`; file exists →
    `new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } })`;
    missing → return `undefined` so the route component renders (typed-valid
    fall-through). NOTE for the fix loop: if `undefined` fall-through proves
    broken at runtime semantics, the in-phase fallback is returning a minimal
    HTML "generating" page with `<meta http-equiv="refresh" content="2">` from
    the handler — but implement the component path first.
  - Route `component`: a small client page that reads `$key`, polls
    `trpc.reports.job` (`refetchInterval: 1000` while status is `"running"`):
    running → spinner + "Generating report…" (+ kind/target from the job);
    `done` → `window.location.reload()` (the reload hits the GET handler and
    serves the HTML); `failed` → error panel showing `stderrTail` in a
    `<pre>`; job `null` → "No report generated yet" with a link back to `/`.
- Create `apps/web/src/lib/use-report.ts`: `useReportRun()` hook returning
  `run(kind: "repo" | "scan", path: string)` and `isPending`. `run` opens the tab
  SYNCHRONOUSLY in the click handler — `const win = window.open("", "_blank",
  "noopener")` — then calls the `reports.generate` mutation; on resolve,
  `win.location.href = `/reports/${job.key}``; on mutation error,
  `win.close()` + `toast.error(e.message)`. (The sync open beats popup
  blockers; the /reports page itself handles the wait.)
- Modify `apps/web/src/routes/projects.$.tsx`: add a "Report" button to the
  header action row (outline, `FileText` icon, after Terminal/Folder):
  disabled with `title="Not a git repository"` when `!project.git.isRepo`;
  spinner + "Generating…" while pending; wired to
  `run("repo", project.path)`.
- Modify `apps/web/src/routes/settings.tsx`:
  - Each tracked-directory row gains a "Report" ghost button (uses
    `useReportRun().run("scan", r.path)`, spinner while pending) — the root
    scan action lives here (dashboard stays untouched).
  - `CommandsCard` gains a "gitsnitch CLI path (optional)" input persisted as
    `snitchPath` (empty string → null), font-mono, placeholder
    `~/workspace/gitsnitch/apps/cli/dist/index.js`, help text: blank = auto
    (local `~/workspace/gitsnitch` build if present, else
    `npx @git-snitch/cli`); when set the app runs `node <path>`. The existing
    save call now also sends `snitchPath`, and `dirty` compares it.

**Inputs**:
- Read: 1.1 outputs, `apps/web/src/routes/api/trpc/$.ts` (server handler
  pattern), `apps/web/src/routes/projects.$.tsx`, `apps/web/src/routes/settings.tsx`.
- Reference: research doc section 1 (route shape verbatim).

**Outputs**:
- Create: `apps/web/src/routes/reports/$key.tsx`, `apps/web/src/lib/use-report.ts`.
- Modify: `apps/web/src/routes/projects.$.tsx`, `apps/web/src/routes/settings.tsx`.

**Validation Criteria**:
- `pnpm build` FIRST (new route file → regenerated `routeTree.gen.ts`), then
  `pnpm check-types`; both pass.
- Handler headers exactly `text/html; charset=utf-8` + `no-store`; key treated
  as opaque (regex-validated inside `readReportHtml`, never spliced raw).
- Polling stops when the job is not running (function-form `refetchInterval`
  or equivalent) — no infinite polling after done/failed.
- The project-page and settings buttons share the one hook; no duplicated
  job-polling logic in the buttons.
- UI copy terse, matches existing voice; disabled state explained.

**Dependencies**: Sub-phase 1.1 must complete successfully.

### Phase 1 — Phase-level Validation

- Read ALL Phase 1 files together: key format consistent across
  `snitch.ts` (producer), router (validator), route handler (consumer);
  settings field flows store → router → UI → mutation payload; the polling
  query and the route component agree on the `ReportJob` shape; no duplicate
  known-project logic drift vs `routers/projects.ts`; `pnpm build` +
  `pnpm check-types` clean repo-wide.

**Dependencies**: None (first phase).

---

## Phase 2: File Browser (project page)

**Type**: Sequential (three sub-phases; phase-wide validator after all pass)

Decisions locked: subtree confinement + realpath checks and
trash-with-fallback (ADR-0002); assemble from `@headless-tree/react` +
`react-dropzone` + base-ui primitives (ADR-0005). Upload transport: **base64
through a tRPC mutation** with a 10 MB per-file server-enforced cap (simplest
robust option for TanStack Start + tRPC — no multipart plumbing, works through
the existing fetch adapter and `serve-prod.mjs`). Download: **server route**
streaming the file with `content-disposition: attachment` (research Topic C
verified `serve-prod.mjs` pumps binary response bodies). Upload collision:
confirm in the UI before overwriting (ADR-0002 implementation note).

### 2.1: Files API — containment, operations, router, download route

**Requirements**:

- Create `packages/api/src/lib/file-ops.ts`. All functions take the project
  root (absolute) + a relative path (segments joined with `/`, `""` = project
  root) and THROW a plain `Error` on any violation:
  - `resolveInside(root: string, rel: string): Promise<string>` — reject
    absolute `rel`, reject any `..` segment (zod also guards, this is the real
    gate); `realpath` the root; for the target, `realpath` its deepest
    EXISTING ancestor (targets may not exist yet for upload/mkdir/rename
    destinations), verify that ancestor resolves inside the root, then
    re-append the non-existing tail. Any escape → throw.
  - `listDir(root, rel)` → `{ entries: { name; kind: "dir" | "file"; size: number | null; modifiedAt: string }[]; trashAvailable: boolean }`
    — `readdir(withFileTypes)`, dirs first then name-ascending, dotfiles
    included. `trashAvailable` = `gio` on PATH, computed once (module cache,
    mirror `isOnPath` in spawn.ts).
  - `renameEntry(root, rel, newName)` — newName validated (no `/`, trimmed
    non-empty, not `.`/`..`); same-directory rename; containment on both ends.
  - `createFolder(root, parentRel, name)` — same name validation; `mkdir`
    (parent exists by construction).
  - `deleteEntry(root, rel)` → `{ mode: "trash" | "permanent" }` — try
    `gio trash <abs>` (execFile); on ENOENT of `gio`, fall back to
    `fs.rm(abs, { recursive: true, force: true })` and report `"permanent"`.
  - `writeUpload(root, dirRel, name, contentBase64)` — decode; reject if
    byteLength > 10 MB ("too large for the in-JSON upload path"); containment;
    atomic write (temp file in the same directory + rename, mirroring
    `store.ts`); overwrites silently (the UI confirms collisions first).
- Create `packages/api/src/routers/files.ts` (all procedures validate the
  project via `requireKnownProject` from 1.1's `known-project.ts` first):
  - `list` query: `{ project: z.string(), dir: z.string() }` where `dir`
    rejects leading `/` and `..` segments.
  - `rename` mutation: `{ project, path, name }`.
  - `delete` mutation: `{ project, path }` → returns the mode.
  - `createFolder` mutation: `{ project, parent, name }`.
  - `upload` mutation: `{ project, dir, name, contentBase64 }` (name:
    basename-only validation).
- Create `apps/web/src/routes/api/files/download.ts` — server route
  `GET /api/files/download`: search params `project` + `path`;
  `requireKnownProject` + `resolveInside` + `readFile`; success →
  `new Response(new Uint8Array(buf), { headers: { "content-type":
  "application/octet-stream", "content-disposition": `attachment;
  filename="${sanitizedBasename}"`, "content-length": String(len) } })`;
  missing file → `new Response("Not found", { status: 404 })`.
- Modify `packages/api/src/routers/index.ts`: register `files: filesRouter`.

**Inputs**:
- Read: `packages/api/src/lib/{store.ts (atomic write), spawn.ts (isOnPath),
  types.ts}`, `packages/api/src/routers/{projects.ts,roots.ts}`,
  `apps/web/src/routes/api/trpc/$.ts`, 1.1 outputs (`known-project.ts`).
- Reference: ADR-0002; research Topic C (binary Response streaming).

**Outputs**:
- Create: `packages/api/src/lib/file-ops.ts`,
  `packages/api/src/routers/files.ts`,
  `apps/web/src/routes/api/files/download.ts`.
- Modify: `packages/api/src/routers/index.ts`.

**Validation Criteria**:
- `pnpm build` then `pnpm check-types` pass (new route file).
- Containment: validator traces `resolveInside` against symlink escape
  (`realpath` of deepest existing ancestor), absolute-path input, `..`
  traversal, and missing-tail (upload to new nested dir) cases.
- Every router procedure re-validates the project and relative path
  server-side regardless of client behavior.
- Delete falls back correctly and REPORTS which mode ran (UI labels on it).
- Upload cap enforced server-side (decode then check byteLength).
- Download route sanitizes the filename header (no quotes/CR/LF).

**Dependencies**: Phase 1 must complete successfully (uses
`known-project.ts`, router registration baseline).

### 2.2: Frontend deps + base-ui dialog/context-menu wrappers

**Requirements**:

- Run `pnpm --filter web add @headless-tree/core@1.7.0 @headless-tree/react@1.7.0 react-dropzone@20.1.1`
  (exact versions; core is the required peer of the react binding — no other
  packages may be added). Lockfile changes stay uncommitted.
- Create `packages/ui/src/components/dialog.tsx` — wrapper over
  `@base-ui/react/dialog` modeled on `sheet.tsx` (same `data-slot` +
  `cn()` + Tailwind class conventions, `rounded-none` aesthetic): export
  `Dialog`, `DialogTrigger`, `DialogClose`, `DialogContent` (CENTERED popup
  variant: fixed, `top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2`,
  backdrop, close button, `sm:max-w-md`), `DialogHeader`, `DialogFooter`,
  `DialogTitle`, `DialogDescription`.
- Create `packages/ui/src/components/context-menu.tsx` — wrapper over
  `@base-ui/react/context-menu` modeled on `dropdown-menu.tsx`: export
  `ContextMenu`, `ContextMenuTrigger`, `ContextMenuContent` (portal +
  positioner, same popup classes), `ContextMenuItem` (with
  `variant?: "default" | "destructive"` like `DropdownMenuItem`),
  `ContextMenuSeparator`.

**Inputs**:
- Read: `packages/ui/src/components/{sheet.tsx,dropdown-menu.tsx,button.tsx}`,
  `packages/ui/src/lib/utils.ts`.
- Reference: research Topic B (base-ui 1.6 component list — dialog and
  context-menu both exist as primitives).

**Outputs**:
- Create: `packages/ui/src/components/dialog.tsx`,
  `packages/ui/src/components/context-menu.tsx`.
- Modify: `apps/web/package.json`, `pnpm-lock.yaml` (via pnpm add only).

**Validation Criteria**:
- `pnpm build` then `pnpm check-types` pass across ALL packages (web now
  depends on the new libs).
- Exactly the three named packages added (plus the core peer), pinned as
  specified; no other dependency changes.
- Wrappers follow the existing wrapper conventions exactly (data-slot props,
  `cn()` merging, same class vocabulary); no `any`.

**Dependencies**: Phase 2.1 must complete successfully.

### 2.3: File browser component + project page section

**Requirements**:

- Create `apps/web/src/components/file-browser/` (split for reviewability):
  - `index.tsx` — `FileBrowser({ project }: { project: string })`: owns the
    tRPC queries/mutations (`files.list` per directory, rename/delete/
    createFolder/upload), exposes refresh of the currently-listed directory,
    renders the Card shell ("Files", description: upload/delete hints) with a
    height-capped scroll area wrapping the tree.
  - `tree.tsx` — headless-tree async data source wired to `files.list` (lazy
    per-directory, cached by the library), folder/file rows with lucide icons
    matching the app's icon vocabulary (`Folder`, `File`/type icons from
    `lib/icons.ts` where sensible), inline rename submitting the `rename`
    mutation (headless-tree's built-in inline rename), right-click opens the
    context menu from `actions.tsx`.
  - `actions.tsx` — context menu items (Download = `<a
    href="/api/files/download?project=..&path=.." download>`; Rename…; New
    folder…; Delete… destructive) + the dialogs: rename dialog, new-folder
    dialog, and the delete confirmation whose copy DEPENDS ON
    `trashAvailable` from `files.list` ("Move to trash?" vs "Delete
    PERMANENTLY? (gio not found — no trash available)") per ADR-0002; delete
    result surfaces the actual mode via toast.
  - `dropzone.tsx` — react-dropzone (`useDropzone`) overlay/panel on the
    browser body: on drop, for each file read as base64
    (`FileReader`/`arrayBuffer` → base64), check collision against the
    currently listed directory entries and confirm overwrite via dialog when
    the name exists, then call `upload` sequentially with per-file
    toasts on failure; refresh the directory after uploads.
- Modify `apps/web/src/routes/projects.$.tsx`: render
  `<FileBrowser project={path} />` as a new "Files" Card in the main column
  below the Note card.

**Inputs**:
- Read: 2.1/2.2 outputs, `apps/web/src/routes/projects.$.tsx`,
  `apps/web/src/lib/icons.ts`, existing components for Card/Button/toast
  usage patterns.
- Reference: ADR-0005; research Topic B (headless-tree async data source,
  react-dropzone hooks-only styling).

**Validation Criteria**:
- `pnpm build` then `pnpm check-types` pass.
- Lazy loading: directories fetch children only when expanded (no recursive
  upfront walk).
- All destructive actions go through the confirmation dialog with the correct
  trash/permanent labelling.
- Upload: base64 pipeline with collision confirm; sequential uploads; the
  tree refreshes afterwards.
- Download link uses the server route with properly URL-encoded params.
- No `any`; headless-tree/dropzone used via their public typed APIs.

**Dependencies**: Sub-phases 2.1 and 2.2 must complete successfully.

### Phase 2 — Phase-level Validation

- Read ALL Phase 2 files together: the UI's expected `files.list` payload
  matches the router's return; the download route's param names match what
  `actions.tsx` builds; `resolveInside` is the single containment authority
  used by every operation; dialog/context-menu wrappers are used (not raw
  base-ui) in the browser; `pnpm build` + `pnpm check-types` clean repo-wide.

**Dependencies**: Phase 1 must complete successfully.

---

## Phase 3: Web IDE (code-server)

**Type**: Sequential (two sub-phases; phase-wide validator after both pass)

Locked: code-server distro, auto-install into the app data dir, on-demand
child process, single shared instance, `--auth none` bound to `0.0.0.0` (the
dashboard runs on a dev box browsed from other machines — ADRs 0003/0004),
`/healthz` readiness (polled server-side on 127.0.0.1), process-group kill.
IDE URLs are built CLIENT-side from `window.location.hostname` + port — the
server never hardcodes a host. No IDE binary-path setting (explicitly
deferred by ADR-0004 — auto-install + directory scan covers this plan).

### 3.1: IDE install + lifecycle manager + router (packages/api)

**Requirements**:

- Extend `packages/api/src/lib/xdg.ts`: `dataDir()` (`$XDG_DATA_HOME` or
  `~/.local/share` + `workspace-welcome`) and `ideDir()` = `dataDir()/ide`,
  mkdir on demand.
- Create `packages/api/src/lib/ide.ts` (module singleton, mirroring the
  scan-cache/snitch registry patterns):
  - Install manager:
    - `findInstalled(): Promise<string | null>` — scan `ideDir()` for
      `code-server-*/bin/code-server` (readdir + stat; the directory's
      presence IS the installed state — nothing persisted elsewhere).
    - Install state singleton:
      `{ phase: "not-installed" | "downloading" | "extracting" | "ready" | "failed"; receivedBytes: number | null; totalBytes: number | null; error: string | null }`.
    - `ensureInstalled(): Promise<IdeStatus["install"]>` — if found → ready;
      if an install is already in flight → return its state; else run: fetch
      `https://api.github.com/repos/coder/code-server/releases/latest`, read
      `tag_name` (strip leading `v` for the URL template), download
      `https://github.com/coder/code-server/releases/download/v<V>/code-server-<V>-linux-amd64.tar.gz`
      streaming to a temp file in `ideDir()` (Node 22 global fetch +
      `Readable.fromWeb(response.body)` piped to `createWriteStream`, tracking
      received bytes against `content-length` for progress); then extract with
      the system `tar` (`execFile`/spawn `tar -xzf <tmp> -C <ideDir>`,
      attached, timeout); delete the temp tarball; re-scan for the binary →
      ready. Any failure → phase `failed` + message (surfaced to the UI). The
      mutation returns immediately after kicking the install (it must not
      block for a 100–200 MB download).
  - Server lifecycle singleton:
    `{ child: ChildProcess; pid: number; port: number; startedAt: string; ready: boolean; version: string | null; stderrTail: string } | null`.
    - `startServer(): Promise<{ port: number }>` — dedupe (running/starting →
      return existing); allocate a free port by binding a `net` server to
      `127.0.0.1:0`, reading the assigned port, closing it; spawn the located
      binary with `["--bind-addr", `0.0.0.0:<port>`, "--auth none"]`
      (`0.0.0.0` — dev-box reachability from the LAN, ADR-0003/0004),
      `detached: true` (own process group — the OPPOSITE of the snitch
      attached spawn, per research Topic A) but stdio PIPED; capture a
      stderr tail (~8 KB); on child `'exit'` clear the singleton; register a
      sync `kill(-pid, "SIGTERM")` with `exit-cleanup` (1.1) while running.
    - Readiness: after spawn, poll `fetch("http://127.0.0.1:<port>/healthz")`
      every 250 ms (accept any 2xx) up to 90 s → `ready = true`; on timeout,
      stop the child and throw.
    - `stopServer(): Promise<void>` — `process.kill(-pid, "SIGTERM")`, 5 s
      grace → `SIGKILL`; clear singleton; deregister from exit-cleanup.
    - `ideVersion(): Promise<string | null>` — `execFile(<binary>,
      ["--version"])` once, cached (trimmed first line).
    - `ideStatus(): Promise<IdeStatus>` —
      `{ installed: boolean; install: <install state>; running: boolean; port: number | null; version: string | null; startedAt: string | null }`.
    - NO `buildIdeUrl` on the server. The browser may sit on another machine
      (dev box), so IDE URLs are built CLIENT-side:
      `http://<window.location.hostname>:<port>/?folder=<encodeURIComponent(absPath)>`
      (folder must be absolute; research Topic A). The server returns the
      port; the client owns the host.
- Create `packages/api/src/routers/ide.ts`:
  - `open` mutation, input `{ path: z.string() }` → `requireKnownProject` →
    `ensureInstalled()`; if installed, `startServer()`; return
    `{ status: IdeStatus["install"]["phase"], ready: boolean, port: number | null }`
    (port present only when ready — the client polls `status` and builds the
    URL itself).
  - `status` query → `ideStatus()` (polled by the UI).
  - `stop` mutation → `stopServer()` → `{ ok: true }`.
- Modify `packages/api/src/routers/index.ts`: register `ide: ideRouter`.

**Inputs**:
- Read: 1.1 outputs (`exit-cleanup.ts`, `known-project.ts`, `xdg.ts`),
  `packages/api/src/lib/{spawn.ts,git.ts}`, research Topic A (flags,
  /healthz, process-group kill rationale), ADRs 0003/0004.
- Reference: `snitch.ts` registry shape from 1.1.

**Outputs**:
- Create: `packages/api/src/lib/ide.ts`, `packages/api/src/routers/ide.ts`.
- Modify: `packages/api/src/lib/xdg.ts`, `packages/api/src/routers/index.ts`.

**Validation Criteria**:
- `pnpm build` then `pnpm check-types` pass.
- Spawn is `detached: true` (own process group) with piped stdio; bind-addr
  is `0.0.0.0:<port>` with `--auth none` (LAN-reachable dev box, ADR-0003);
  stop is `kill(-pid, SIGTERM)` with SIGKILL escalation; app-exit cleanup
  registered.
- Readiness = `/healthz` poll with a bounded timeout and failure cleanup.
- Install never blocks the mutation (state machine kicked, state queryable);
  download progress tracked from `content-length`.
- `open` validates the project path; deep link encodes the absolute path.
- Single shared instance enforced (dedupe on start).

**Dependencies**: Phase 2 must complete successfully (uses 1.1 libs; router
registration baseline).

### 3.2: IDE UI — project page button + Settings status card

**Requirements**:

- Modify `apps/web/src/routes/projects.$.tsx`:
  - The page queries `trpc.ide.status` (poll every 5 s — cheap and local).
  - "Open IDE" button in the header action row (`CodeXml`/`Braces`-style
    lucide icon): when status is `running && ready` → click opens the IDE
    SYNCHRONOUSLY via `window.open(url, "_blank", "noopener")` (user gesture,
    no popup issue) where `url` is built client-side as
    `http://${window.location.hostname}:${port}/?folder=${encodeURIComponent(path)}`
    (NEVER a hardcoded host — the dashboard is browsed from other machines);
    otherwise → `ide.open` mutation and keep
    polling: button label/state reflects install phase ("Installing IDE…
    (42 %)" when bytes known, "Starting IDE…" while starting); when it turns
    ready → `toast.success("IDE ready", { action: { label: "Open", onClick:
    () => window.open(url, "_blank", "noopener") } })` (click-triggered open —
    robust against popup blockers on the async path); failure → toast with
    the install `error`.
- Modify `apps/web/src/routes/settings.tsx`: new "Web IDE" Card (between
  Commands and the sheet): polls `trpc.ide.status` every 5 s; shows running
  state (dot + `127.0.0.1:<port>`, version, `relativeTime(startedAt)`) or
  stopped/not-installed text; a Stop button (destructive outline,
  `ide.stop` mutation, invalidate the status query); when not installed
  shows a one-line hint that it installs on first "Open IDE". The address
  shown is `<window.location.hostname>:<port>` (the host you're browsing
  from), never a hardcoded loopback.

**Inputs**:
- Read: 3.1 outputs, `apps/web/src/routes/{projects.$.tsx,settings.tsx}`,
  `apps/web/src/lib/format.ts` (`relativeTime`).
- Reference: 1.2's mutation/toast/polling patterns.

**Outputs**:
- Modify: `apps/web/src/routes/projects.$.tsx`,
  `apps/web/src/routes/settings.tsx`.

**Validation Criteria**:
- `pnpm build` then `pnpm check-types` pass.
- Both the sync-open path (already ready) and the async path (toast action)
  present; polling stops correctly when status is terminal.
- Status card reflects `ideStatus` faithfully and Stop actually calls the
  mutation and refreshes.
- Terse copy, existing voice; no unused query data fetched.

**Dependencies**: Sub-phase 3.1 must complete successfully.

### Phase 3 — Phase-level Validation

- Read ALL Phase 3 files together: `IdeStatus` shape consistent between
  `ide.ts`, router, and both UI consumers; `exit-cleanup` shared with the
  snitch registry without double-registration; URL construction lives ONLY
  on the client (`window.location.hostname` + port — no server-side host);
  `pnpm build` + `pnpm check-types` clean repo-wide.

**Dependencies**: Phase 2 must complete successfully.

---

## Phase 4: Documentation refresh

**Type**: Sequential (single sub-phase)

**Requirements**:

- Modify `README.md` — terse, existing voice, no restructuring:
  - "Around the projects themselves" gains three bullets: Reports (git-snitch
    per project / per directory, cached + served by the app, new tab), the
    per-project file browser (upload/rename/trash-delete/download, confined
    to the project subtree), and the browser IDE (code-server, on-demand,
    installs itself on first use).
  - "How it works" gains a short paragraph: reports live under
    `$XDG_CACHE_HOME/workspace-welcome/reports/` and are served by a server
    route; the file router enforces subtree confinement server-side; the IDE
    is a managed child process (data dir, `--auth none` on localhost, killed
    with the app).
  - "Run it" unchanged apart from noting `gio` is optional (permanent-delete
    fallback) and the first IDE open downloads ~100–200 MB.
- Modify `CONTEXT.md` — entries already exist for Reports / File browser /
  Web IDE; adjust only where implementation sharpened a term (e.g. mention the
  `/reports/<key>` serving path and the Settings IDE card). No new ADRs —
  decisions are locked.

**Inputs**:
- Read: `README.md`, `CONTEXT.md`, all ADRs, the implemented phases' file
  list above.

**Outputs**:
- Modify: `README.md`, `CONTEXT.md`.

**Validation Criteria**:
- No feature described that was not built; no built feature omitted.
- Matches existing tone (first person, terse, concrete); no marketing slop.
- CONTEXT.md stays a glossary (no how-to prose leaking in).

**Dependencies**: Phases 1–3 must complete successfully.

---

## Success Criteria

- All phases and sub-phases pass their validators (plus the three phase-wide
  validators), each fix loop ≤ 3 attempts.
- Repo-wide `pnpm build` and `pnpm check-types` pass with zero errors.
- Only the allowed packages were added (`@headless-tree/core@1.7.0`,
  `@headless-tree/react@1.7.0`, `react-dropzone@20.1.1`) and only the files
  listed in this plan were created/modified.
- No git commits were made at any point; the uncommitted WIP listed in
  Prerequisites is still intact beneath the new work.
- NO-SLOP policy holds in every file touched (with the documented
  router-file exception).
