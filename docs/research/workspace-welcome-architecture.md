# workspace-welcome — Architecture Reference

Precise map of the repo for implementer agents. Written for the planned
"Create new project" feature (formedible-driven form on the welcome page that
programmatically invokes better-t-stack server-side to scaffold a project on
disk). All paths are relative to the repo root unless absolute. Current branch:
`creator` (has uncommitted UI additions: formedible + select/switch/slider/
command/popover/radio-group/field components — see §5).

---

## 1. Monorepo layout

pnpm workspace (`pnpm@10.33.4`, root `package.json` `packageManager`). Workspace
definition: `pnpm-workspace.yaml` → `apps/*`, `packages/*`, plus a `catalog:` of
shared dependency versions (react 19, tailwind 4, zod 4, trpc 11, lucide-react,
sonner, next-themes, …). **No turborepo** — no `turbo.json`; root scripts are
plain `pnpm -r` recursion.

```
apps/
  web/                  the only app (TanStack Start SSR web dashboard)
packages/
  api/                  @workspace-welcome/api — tRPC router + all server logic
  ui/                   @workspace-welcome/ui — shadcn-style component kit (Base UI)
  config/               @workspace-welcome/config — shared tsconfig.base.json only
  env/                  @workspace-welcome/env — t3-oss/env-core validators
bts.jsonc               better-t-stack manifest (this repo was scaffolded with it)
CONTEXT.md              domain glossary (roots/projects/reports/file browser/IDE)
docs/
  adr/0001..0005-*.md   decisions: snitch invocation, file browser, web IDE
  plans/2026-08-21-reports-filebrowser-ide.md
  research/             this doc + 3 prior research docs
```

### Package manager & workspace wiring

- Root `package.json` scripts: `dev` = `pnpm -r dev`, `build` = `pnpm -r build`,
  `check-types` = `pnpm -r check-types`, `dev:web` = `pnpm --filter web dev`.
- Internal deps use `workspace:*` and scoped names `@workspace-welcome/*`
  (note the hyphen — **not** `@workspace/ui`).

### TypeScript setup

- Base config: `packages/config/tsconfig.base.json` — `module: ESNext`,
  `moduleResolution: bundler`, `verbatimModuleSyntax`, `strict`,
  `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters`, `types: ["node"]`.
- Root `tsconfig.json` just extends it. Each package extends it again and adds
  what it needs:
  - `apps/web/tsconfig.json` — `jsx: react-jsx`, DOM libs, `noEmit`, and
    **path aliases**:
    ```jsonc
    "paths": {
      "@/*": ["./src/*"],                                  // app-internal
      "@workspace-welcome/ui/*": ["../../packages/ui/src/*"]
    }
    ```
  - `packages/ui/tsconfig.json` — maps `@workspace-welcome/ui/*` → `./src/*`
    (so the package can self-import its own components, as formedible does).
  - `packages/api/tsconfig.json` is composite/outDir for building;
    `tsconfig.check.json` is the `noEmit` config used by its `check-types`.
- `apps/web/vite.config.ts` uses `resolve: { tsconfigPaths: true }` so the same
  aliases resolve at dev/build time. Dev port: **37420**.

### How apps consume the UI (and api) packages

Source-level consumption — no build step, no dist. `packages/ui/package.json`
`exports` map:

```jsonc
{
  "exports": {
    "./globals.css": "./src/styles/globals.css",
    "./lib/*": "./src/lib/*.ts",
    "./components/*": "./src/components/*.tsx",
    "./hooks/*": "./src/hooks/*.ts",
    "./postcss.config": "./postcss.config.mjs"
  }
}
```

Apps import e.g. `@workspace-welcome/ui/components/button`,
`@workspace-welcome/ui/lib/utils`. Same pattern for api:
`@workspace-welcome/api/lib/types` resolves to `packages/api/src/lib/types.ts`
(export map `"./*": "./src/*.ts"`). `apps/web/src/index.css` contains exactly
`@import "@workspace-welcome/ui/globals.css";` — the app inherits the UI
package's Tailwind theme; `packages/ui/src/styles/globals.css` has
`@source "../../../apps/**/*.{ts,tsx}"` so app classes are compiled too.

---

## 2. The app that hosts the welcome page (`apps/web`)

**Framework: TanStack Start (SSR) + Vite + TanStack Router + tRPC client.**
(Origin: better-t-stack `--frontend tanstack-start --api trpc` — see `bts.jsonc`.)

### Router setup

- `apps/web/src/router.tsx` — `createTanStackRouter({ routeTree, context:
  { trpc, queryClient }, Wrap: TRPCProvider })`. `trpc` is a
  `createTRPCOptionsProxy` over a `createTRPCClient` with
  `httpBatchLink({ url: "/api/trpc" })`. `setupRouterSsrQueryIntegration`
  wires react-query to router SSR. QueryClient: `staleTime: 60s`, global
  `queryCache.onError` → `toast.error` with a retry action.
- `apps/web/src/routeTree.gen.ts` — **generated** by the router plugin; regenerates
  on `vite dev`. Do not hand-edit.
- `apps/web/src/utils/trpc.ts` — the whole file:
  ```ts
  export const { TRPCProvider, useTRPC, useTRPCClient } =
    createTRPCContext<AppRouter>();
  ```
  Components call `const trpc = useTRPC()` then
  `useQuery(trpc.projects.scan.queryOptions())` /
  `useMutation(trpc.roots.add.mutationOptions({...}))`.

### Routes (file-based, `apps/web/src/routes/`)

| Route | File | What |
|---|---|---|
| `/` (welcome page) | `routes/index.tsx` | dashboard — see below |
| `/projects/$` (splat) | `routes/projects.$.tsx` | per-project page (abs path as splat) |
| `/reports/$key` | `routes/reports/$key.tsx` | serves finished snitch HTML; polls job while running |
| `/settings` | `routes/settings.tsx` | settings page |
| `/api/trpc/$` | `routes/api/trpc/$.ts` | tRPC fetch adapter (server route) |
| `/api/files/download`, `/api/files/view` | `routes/api/files/*.ts` | plain server routes for binary/file responses |

- `routes/__root.tsx` — `createRootRouteWithContext<RouterAppContext>()`; renders
  `<html lang="en" className="dark">` (dark-only UI), `Header`, `<Outlet/>`,
  `<Toaster richColors />` (sonner), both devtools. `RouterAppContext` =
  `{ trpc: TRPCOptionsProxy<AppRouter>; queryClient: QueryClient }`.
- Navigation: plain `<Link to="/">` / `<Link to="/settings">` (see
  `apps/web/src/components/header.tsx`); project cards navigate to
  `/projects/<encodeURIComponent(path)>` via `<Link>`; no route params beyond
  splat/key.

### The welcome page — `apps/web/src/routes/index.tsx`

`Route = createFileRoute("/")`, component `HomeComponent`. Structure:

- Queries: `trpc.projects.scan` + `trpc.roots.list`.
- Local state: `addRootOpen`, `cloneOpen` (sheet visibility), `query` (inline
  filter), `/`-key search ref (global keydown listener, lines 50–69).
- Header band (lines 119–180): eyebrow "Workspace", `h1` "Welcome back",
  project/root counts, search input, **Refresh** (invalidates
  `trpc.projects.scan`), **Clone script** button → `setCloneOpen(true)`,
  **Add directory** button → `setAddRootOpen(true)`. A "Create new project"
  entry point belongs in this button row.
- Sections: `SummaryCards` (`components/summary-cards.tsx`),
  `NeedsAttention`, root-error banner, `PinnedSection`, "Recent" grid of
  `ProjectCard` (`components/project-card.tsx`), "Older" compact rows
  (in-file `OlderList`), no-match empty state.
- Sheets mounted at bottom (lines 264–271): `<AddRootSheet>` and
  `<CloneScriptSheet projects={visible} .../>` — the established pattern for
  launching a side-panel flow from the welcome page.

App-local components: `apps/web/src/components/` — `add-root-sheet.tsx`,
`clone-script-sheet.tsx`, `empty-state.tsx`, `file-browser/{index,tree,viewer,
actions,dropzone}.tsx`, `git-badges.tsx`, `header.tsx`, `loader.tsx`,
`needs-attention.tsx`, `pinned-section.tsx`, `project-card.tsx`,
`section-header.tsx`, `summary-cards.tsx`. App-local libs: `apps/web/src/lib/`
— `format.ts`, `icons.ts` (stack icon + `hostLabel`), `open-project.ts`
(`useOpenProject` — navigate to project page + `touchLastOpened`), `recency.ts`,
`search.ts` (`matchProject`), `use-report.ts`.

---

## 3. Server-side patterns

**Backend = tRPC v11, all logic in `packages/api`.** No Hono/express, no server
functions. Mounted via one TanStack Start server route,
`apps/web/src/routes/api/trpc/$.ts`:

```ts
fetchRequestHandler({ req: request, router: appRouter, createContext,
                      endpoint: "/api/trpc" })
```

- `packages/api/src/index.ts` — `t = initTRPC.context<Context>().create()`;
  exports `router`, `publicProcedure`. Context (`src/context.ts`) is a stub
  (`{ auth: null, session: null }`, no auth).
- `packages/api/src/routers/index.ts` — `appRouter = router({ healthCheck,
  roots, projects, settings, reports, files, ide })`; `export type AppRouter`.
  Routers live in `src/routers/{roots,projects,settings,reports,files,ide}.ts`,
  each `router({ name: publicProcedure.input(zod).query|mutation(...) })`.
  Zod v4 for all input validation; failures throw plain `Error` → tRPC wraps →
  client `onError: (e) => toast.error(e.message)`.
- Only `node:child_process` + `node:fs` are used for OS work — **no execa**.

### How the app executes shell commands today (three distinct patterns)

**A. Awaited execFile (git inspection / short actions) —
`packages/api/src/lib/git.ts`**
```ts
const execFileAsync = promisify(execFile);
async function git(args: string[], cwd: string): Promise<GitCommandResult | null> {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd, timeout: GIT_TIMEOUT_MS /* 4s; network actions 60s */, maxBuffer: 1MB });
}
```
Never throws — returns `null`/degraded results; mutating `gitAction` merges
stdout+stderr into `GitActionResult { ok, output }` surfaced in toasts
(`projects.fetchRemote`, `projects.pull` mutations, `routers/projects.ts:108–135`).
`file-ops.ts` uses the same `execFileAsync` for `gio trash` detection.

**B. Attached spawn + in-memory job registry + polling (git-snitch reports) —
`packages/api/src/lib/snitch.ts`** ← the closest pattern to a long-running
scaffolder.
```ts
export interface ReportJob {
  key: string; kind: "repo" | "scan"; targetPath: string;
  status: "running" | "done" | "failed";
  startedAt: string; finishedAt: string | null; exitCode: number | null;
  stderrTail: string;               // last ~8 KB of stderr = progress lines
}
export function startReportRun(kind, targetPath, settings): ReportJob
```
- `spawn(command, [...baseArgs, kind, targetPath, "--output", out, "--verbose"],`
  `{ cwd: targetPath, stdio: ["ignore","pipe","pipe"], env: {...process.env} })`
  (snitch.ts:176).
- Command resolution order (`resolveSnitchCommand`, ADR-0001): configured
  `settings.snitchPath` (run as `node <path>`, must exist) → local checkout at
  `~/workspace/gitsnitch/apps/cli/dist/index.js` → `npx -y @git-snitch/cli`.
- Job registry is a module-level `Map<string, ReportJob>`; the mutation returns
  immediately; UI polls `reports.job` query with
  `refetchInterval: q => q.state.data?.status === "running" ? 1000 : false`
  (function form — stops when settled; see `routes/reports/$key.tsx` and
  `routes/projects.$.tsx` IDE poll at 5 s for the same idiom).
- Lifecycle guards: SIGTERM→5 s→SIGKILL timeout ladder (300 s cap), stderr tail
  accumulation, stdout drained, `registerExitCleanup(killNow)` from
  `packages/api/src/lib/exit-cleanup.ts` (kills attached children on dev-server
  restart), `error` + `exit` handlers both idempotently finalize. Deterministic
  key `reportKey()` dedupes concurrent runs for the same target.

**C. Detached fire-and-forget spawn (open editor/terminal/folder) —
`packages/api/src/lib/spawn.ts`**
```ts
const child = spawn(args[0], args.slice(1), { detached: true, stdio: "ignore",
                                              env: { ...process.env } });
child.on("error", () => undefined); child.unref();   // outlives the server
```
Used by `projects.open` mutation (`openForTarget`). PATH probing via
`execFileSync("command", ["-v", bin], { shell: true })`.

A fourth variant, code-server lifecycle (`packages/api/src/lib/ide.ts`), mixes
B and C: attached spawn with `detached: true` + captured pipes, a module
singleton `{installState, server}` the UI polls via `ide.status`, and
never-block-the-mutation semantics (`ensureInstalled()` kicks a download and
returns current phase immediately).

**No SSE/websockets anywhere.** Long ops = mutation returns a key/handle →
client polls a query with conditional `refetchInterval`. Short ops = awaited
mutation whose result/throw goes to a sonner toast.

---

## 4. Project discovery, listing, caching, registration

### The store (single JSON file, no DB) — `packages/api/src/lib/store.ts`

- Location: `$XDG_CONFIG_HOME/workspace-welcome/store.json`
  (`~/.config/workspace-welcome/store.json`), atomic writes (tmp + rename),
  in-memory cache, writes serialized through an `inFlight` promise chain.
- Shape (`packages/api/src/lib/types.ts:140`):
  ```ts
  export interface StoreShape {
    roots: Root[];                            // { id, path, label, addedAt }
    projects: Record<string, ProjectOverrides>; // keyed by ABS project path
    settings: Settings;   // editorCommand, terminalCommand, snitchPath, excludeGlobs
  }
  ```
- A **Root** is a watched directory; its **immediate subdirectories** are
  Projects. `Project` (types.ts:93) = `{ path, name, rootId, createdAt,
  updatedAt, stack, git: GitInfo, alerts: HealthAlert[], pinned, note,
  lastOpenedAt, hidden }` — overrides are merged onto scan output.

### Scan + cache — `packages/api/src/lib/scan.ts`, `scan-cache.ts`

- `projects.scan` query (`routers/projects.ts:27`) → `getScan({ roots,
  overrides, settings, force })` in `scan-cache.ts:201`.
- Cache is module-singleton `{ projects, rootErrors, fingerprints }`. Per-project
  fingerprint (`scan.ts:158 projectFingerprint`): dir mtime + `.git/HEAD` +
  `.git/index` mtimes + djb2 hash of `git status --porcelain
  --untracked-files=no`. Warm path re-scans only changed/new/removed projects;
  overrides are re-merged live on every call (pin/note/hide never rescans).
  Whole-cache invalidation when `inputsHash` (roots + excludeGlobs) changes.
- `invalidateScanCache()` is called by `roots.add`, `roots.remove`,
  `settings.update` — **any mutation that changes what exists on disk under a
  root must do the same** (or rely on fingerprint drift: a brand-new project
  directory under an existing root has no cached fingerprint, so the *next*
  scan picks it up automatically).
- Client refresh: `queryClient.invalidateQueries({ queryKey:
  trpc.projects.scan.queryKey() })` (welcome page `refresh()`, index.tsx:109).

### Where a newly scaffolded project gets "registered"

There is **no explicit project registry** — a project exists iff it is a
non-hidden child directory of a registered root at scan time. Therefore a
"Create new project" flow only needs to:

1. Scaffold into a directory **directly under an existing root**
   (`store.roots[].path/<new-name>`) — or scaffold anywhere and `roots.add` its
   parent (router already validates existence, `routers/roots.ts:21–58`).
2. Call `invalidateScanCache()` (import from `packages/api/src/lib/scan-cache.ts`)
   if you want it visible without waiting for fingerprint discovery, and have
   the client invalidate `trpc.projects.scan`.
3. Optionally seed overrides via the existing `mutateStore` pattern
   (`routers/projects.ts:161 mutateTouch`) — e.g. pin it or set a note.

Path validation helpers for any new mutation:
`packages/api/src/lib/known-project.ts` — `requireKnownProject(path)` (must be
an immediate child of a root) and `requireKnownRoot(path)`.

---

## 5. UI conventions — `packages/ui`

shadcn-style kit on **Base UI** (`@base-ui/react`) + Tailwind v4 (CSS-first,
no `tailwind.config`; theme = `src/styles/globals.css` with `:root`/`.dark`
OKLCH token blocks and a custom `@theme inline` layer adding
`--color-recency-fresh/stale`, `--color-pinned-accent`,
`--color-sev-info/warn/error`, `--color-eyebrow`). App is dark-only
(`<html className="dark">`). Icons: **lucide-react**. `cn()` from
`packages/ui/src/lib/utils.ts` (clsx + tailwind-merge). components.json style:
`base-lyra`, icon library `lucide`.

Components in `packages/ui/src/components/` (all exported as
`@workspace-welcome/ui/components/<name>`):

alert, attachment, badge, bubble, button, card, checkbox, command*, context-menu,
dialog, dropdown-menu, empty, field*, input-group, input, label, marker,
message-scroller, message, popover*, radio-group*, scroll-area, select*,
separator, sheet, skeleton, slider*, sonner, switch*, tabs, textarea, tooltip
(*= uncommitted new files on the `creator` branch) — plus the vendored
**formedible** directory (also uncommitted; see §8).

Patterns to reuse:

- **Sheet** (right side-panel) is the established "flow launcher": both welcome
  page actions (`AddRootSheet`, `CloneScriptSheet`) are Sheets with
  `SheetHeader/Title/Description`, form body, `SheetFooter` with Cancel +
  submit `Button` (`apps/web/src/components/add-root-sheet.tsx` is the minimal
  template: local `useState` fields → `useMutation(trpc.roots.add.mutationOptions({
  onSuccess: invalidate + toast, onError: e => toast.error(e.message) }))`).
- **Dialog** exists (`components/dialog.tsx`) but is unused so far; Sheets are
  the convention. There is no multi-step wizard yet — formedible's
  `pages`/`FormProgress`/`FormNavigation` provide one.
- **Toasts**: `sonner` via `<Toaster richColors />` in `__root.tsx`;
  `toast.success/error(msg)` everywhere; global query-error toast in
  `router.tsx`.
- Buttons: `variant="outline|ghost|default"`, `size="sm|xs|icon-sm"`, lucide
  icon at `className="size-3.5"`. Aesthetic: `rounded-none` borders,
  `font-mono` micro-labels, `eyebrow` uppercase tracking.

### formedible (schema-driven dynamic forms) — NEW, uncommitted

Vendored at `packages/ui/src/components/formedible/`. Built on
`@tanstack/react-form` + zod. Key entry:

- `hooks/use-formedible.tsx` — `useFormedible(config: UseFormedibleOptions)`
  returns `{ Form, form, currentPage, totalPages, goToNextPage, ... }`.
- `UseFormedibleOptions` (`lib/types.ts:545`): `fields` (name/type/label/options/
  conditional/section/page/tab…), `schema` (zod — drives validation via
  `lib/validation.ts`/`zod-errors.ts`), `pages` (multi-step wizard with
  `FormProgress` + `FormNavigation`), `tabs`, `formOptions.onSubmit` (the
  consumer's submit handler), `submitLabel`, `defaultComponents` (custom field
  type → component registry).
- Field types (`lib/types.ts` `FormedibleFieldType`) rendered through
  `fields/field-registry.tsx`: text/email/password/url/tel, textarea, number,
  select, radio, checkbox, switch, date, slider, rating, phone, file, array,
  object, multiSelect, combobox, autocomplete, multiCombobox, color,
  duration, location, masked. Conditional visibility: `conditional: string`
  (expression) or `(values) => boolean` (`lib/field-visibility.ts`).
- Import shape: `useFormedible` and friends are consumed as
  `@workspace-welcome/ui/components/formedible/hooks/use-formedible` etc.
  (self-referencing alias, works because of the ui tsconfig paths map).
- Deps added to `packages/ui/package.json` for this: `@tanstack/react-form`,
  `cmdk`, `zod`.

---

## 6. Frontend state / data-fetching conventions

- **TanStack Query v5 + tRPC options proxy** — no zustand/redux/context stores.
  Server state: `useQuery(trpc.<router>.<proc>.queryOptions(input?, opts?))`;
  writes: `useMutation(trpc.<proc>.mutationOptions({ onSuccess, onError }))`
  followed by `queryClient.invalidateQueries({ queryKey:
  trpc.<proc>.queryKey() })`. All through `useTRPC()` from
  `apps/web/src/utils/trpc.ts`.
- Polling: conditional functional `refetchInterval` (stops when settled) —
  reports at 1 s (`routes/reports/$key.tsx:45`), IDE at 5 s
  (`routes/projects.$.tsx:130`).
- Local UI state: `useState`/`useRef` inside route components; `useMemo` for
  derived filtering (`index.tsx:75–107`). Sheet open/close is prop-drilled
  `open`/`onOpenChange`.
- `staleTime: 60s` default; router preloads with `defaultPreloadStaleTime: 0`.

---

## 7. Quality gates / validation commands

No ESLint config, no test runner, no CI in-repo. The gate is `check-types`.

| Scope | Command |
|---|---|
| everything | `pnpm check-types` (root; runs `pnpm -r check-types`) |
| packages/ui | `pnpm --filter @workspace-welcome/ui check-types` → `tsc --noEmit` |
| packages/api | `pnpm --filter @workspace-welcome/api check-types` → `tsc --noEmit -p tsconfig.check.json` |
| apps/web | `pnpm --filter web check-types` → `tsc --noEmit` (also covers `@workspace-welcome/ui/*` via its paths map) |
| build app | `pnpm --filter web build` (`vite build`) |
| dev server | `pnpm dev:web` or `pnpm --filter web dev` (vite dev, port 37420) |
| prod serve | `pnpm --filter web serve` / `node apps/web/serve-prod.mjs` |

For a change touching `packages/ui` + `apps/web`, the practical gate is:
`pnpm --filter @workspace-welcome/ui check-types && pnpm --filter web
check-types`, then smoke-test in `pnpm dev:web`. Note: because `apps/web`
type-checks `packages/ui` sources through its own paths alias, web's
`check-types` is the stricter composite gate. Runtime deps for new imports must
be added to the right `package.json` (catalog where available) + `pnpm install`.

---

## 8. Existing "generator/creator" flows to mimic

### 8a. Clone-script generator (commit `d0ec1b5`) — UI + shared pure function

- **UI**: `apps/web/src/components/clone-script-sheet.tsx` — Sheet launched from
  the welcome-page header; checkbox list of remote-bearing projects (respects
  the active search filter); live-regenerates the script with `useMemo` as the
  selection changes; Copy (clipboard API + toast) and Download (Blob +
  `clone-projects.sh`) actions; read-only `<textarea>` preview.
- **Logic**: `packages/api/src/lib/clone-script.ts` — `buildCloneScript(projects:
  CloneableProject[]): string`, a **pure, I/O-free function** living in the api
  package but imported **directly into the client component**
  (`import { buildCloneScript } from "@workspace-welcome/api/lib/clone-script"`)
  — no server round-trip for generation. This works because the api package is
  consumed at source level; keep new shared logic free of node-only imports if
  you want the same dual-side reuse.
- End-to-end: click → Sheet → selection state (client) → pure function →
  text output. **No server execution** — the *user* runs the script. The new
  better-t-stack feature differs exactly here: it must execute server-side, so
  pair the 8a UI shape with the 8b server pattern.

### 8b. git-snitch report run — the server-execution pattern to copy

End-to-end today:

1. UI (`apps/web/src/lib/use-report.ts` `useReportRun`): click handler opens a
   blank tab synchronously (popup-blocker gesture requirement), then
   `useMutation(trpc.reports.generate.mutationOptions())`.
2. Mutation (`packages/api/src/routers/reports.ts:18`): zod input
   `{ kind: "repo"|"scan", path }`, validates via `requireKnownProject/Root`,
   reads settings, calls `startReportRun(kind, path, settings)` and returns the
   job **immediately** (spawn is fire-and-forget; the registry dedupes).
3. `packages/api/src/lib/snitch.ts` spawns the CLI attached, keeps an 8 KB
   stderr tail as progress, enforces a timeout ladder, registers exit cleanup.
4. UI polls `trpc.reports.job` (1 s while `status === "running"`), renders
   `stderrTail` as progress, reloads to the served artifact when `done`.

For a better-t-stack scaffolder: mirror steps 2–4 (mutation → spawn
`npx better-t-stack@latest create …` or a configured path, resolveSnitchCommand-
style resolution, `ScaffoldJob { status, stdout/stderrTail, projectPath }`
registry, polling query), then on success `invalidateScanCache()` +
client-side `trpc.projects.scan` invalidation so the new project appears in the
welcome list (§4). The snitch.ts file is the canonical reference for child
lifecycle handling in this repo; read it before writing the scaffolder lib.

### Also relevant

- `bts.jsonc` — better-t-stack manifest of THIS repo (version 3.36.4,
  reproducibleCommand line shows the CLI flag vocabulary:
  `pnpm create better-t-stack@latest <name> --frontend tanstack-start --api trpc
  --package-manager pnpm …`). A `better-t-stack` skill is available in this
  environment for CLI usage details.
- IDE install flow (`packages/api/src/lib/ide.ts`): another never-block +
  poll pattern with byte-level download progress — the model for progress
  reporting if better-t-stack output proves insufficient.
- `docs/adr/0001-git-snitch-invocation.md` — the ADR for "configured path →
  local checkout → npx" command resolution; reuse the argument for the
  better-t-stack binary.
