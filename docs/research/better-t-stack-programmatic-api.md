# Better-T-Stack Programmatic API — Reference (verified against source)

**Purpose:** scaffold Better-T-Stack projects from code (a web form → server-side scaffold), with no interactive CLI prompts.
**Verified against:** `create-better-t-stack@3.40.3` (npm `latest` as of 2026-08-24) — package tarball `.d.mts` declarations and bundled implementation; official docs; local skill file.
**Sources:** listed at the bottom. Facts cite their source inline. Discrepancies and unverifiable items are in "Open questions".

---

## 1. Package facts (npm)

| Fact | Value | Source |
|---|---|---|
| npm package name | `create-better-t-stack` | npm registry |
| **`better-t-stack` package** | **Does NOT exist** — `npm view better-t-stack` → 404. (`pnpm create better-t-stack@latest` works because `pnpm create X` expands to `create-X`.) | npm registry |
| Latest version | `3.40.3` (dist-tag `latest`; many `pr*`/`canary`/`dev` tags exist — repo moves fast) | npm |
| Importable as a library | **Yes** — ESM only. `exports["."] = { types: "./dist/index.d.mts", import: "./dist/index.mjs" }`; also `./cli` and `./virtual`. No CJS/`require` export. | `package.json` of tarball |
| `bin` | `create-better-t-stack` → `dist/cli.mjs` | same |
| Node engine | `"engines": { "node": ">=22.0.0" }` | same |
| Key deps | `better-result` (Result type), `zod@^4`, `execa`, `@better-t-stack/types`, `@better-t-stack/template-generator`, `@clack/prompts` | same |
| Repo | https://github.com/AmanVarshney01/create-better-t-stack (monorepo; CLI at `apps/cli`). The old `better-t-stack/better-t-stack` URL 301-redirects here. | GitHub API |
| License | MIT | npm |

---

## 2. Programmatic entry points

From the published `dist/index.d.mts` of `create-better-t-stack@3.40.3` (exact declarations):

```ts
declare function create(
  projectName?: string,
  options?: Partial<CreateInput>
): Promise<Result<InitResult, CreateError>>;

declare function createVirtual(
  options: Partial<Omit<ProjectConfig, "projectDir" | "relativePath">>
): Promise<Result<VirtualFileTree, GeneratorError>>;

type AddOptions = Pick<AddInput, "addons" | "addonOptions" | "install" | "packageManager" | "projectDir" | "dryRun">;
declare function add(options?: AddOptions): Promise<AddResult>;

declare function sponsors(): Promise<void>;
declare function docs(): Promise<void>;
declare function builder(): Promise<void>;
declare function getSchemaResult(name: SchemaName): unknown;

type CreateError = UserCancelledError | CLIError | DirectoryConflictError | ProjectCreationError;
```

Docs example (https://www.better-t-stack.dev/docs/cli/programmatic-api):

```typescript
import { create } from "create-better-t-stack";

const result = await create("my-app", {
  frontend: ["tanstack-router"],
  backend: "hono",
  runtime: "bun",
  database: "sqlite",
  orm: "drizzle",
});

if (result.isErr()) {
  console.error(`Failed: ${result.error.message}`);
} else {
  console.log(`Created at: ${result.value.projectDirectory}`);
}
```

Result handling (the `Result` type is re-exported from `better-result`):

```ts
result.match({
  ok: (data) => console.log(`Project created at: ${data.projectDirectory}`),
  err: (error) => console.error(`Failed: ${error.message}`),
});
const data = result.unwrapOr(null);
```

**Return types** (from `@better-t-stack/types` `InitResultSchema`):

```ts
interface InitResult {
  success: boolean;
  projectConfig: ProjectConfig;   // fully resolved config
  reproducibleCommand: string;    // equivalent CLI command
  timeScaffolded: string;
  elapsedTimeMs: number;
  projectDirectory: string;       // absolute path of created project
  relativePath: string;
  error?: string;
}

interface AddResult {
  success: boolean;
  addedAddons: Addons[];
  projectDir: string;
  dryRun?: boolean;
  plannedFileCount?: number;
  error?: string;
}
```

**Error classes** exported by the package: `UserCancelledError`, `CLIError`, `ValidationError`, `CompatibilityError`, `DirectoryConflictError`, `ProjectCreationError`, `DatabaseSetupError`, `GeneratorError` (from `dist/index.d.mts`). All except `GeneratorError`/`ValidationError`/`CompatibilityError`/`DatabaseSetupError` can surface as `CreateError`. `DirectoryConflictError` is in the real union but is **missing from the docs page's error list** (docs list only UserCancelled/CLI/ProjectCreation) — trust the `.d.ts`.

**Not exported / does not exist in 3.40.3:** `runProgrammaticApi` and `init`. The local skill file's `import { init } from "create-better-t-stack"` example (SKILL.md line ~198) is **outdated** — the current function is `create`. (`grep` of the shipped `index.mjs` export list confirms: `add, builder, create, createBtsCli, createVirtual, docs, generate, getSchemaResult, router, sponsors`.)

**`createVirtual`** generates the project in memory as a `VirtualFileTree` (no disk writes, no install, `git` forced false) — useful for previews. Defaults differ from `create` (e.g. `auth: "none"`, `backend: "hono"`) — see implementation.

---

## 3. The complete options object (`CreateInput`)

All fields optional; schema is **strict** (unknown keys → `CLIError` at runtime, TypeScript error at compile time). From `CreateInputSchema` in `@better-t-stack/types@3.40.3`:

| Field | Type / allowed values | Default when omitted (silent mode) |
|---|---|---|
| `projectName` | `string` (1st positional arg of `create()`) | `"my-better-t-app"` (resolved under caller's `process.cwd()`) |
| `template` | `"none" \| "mern" \| "pern" \| "t3" \| "uniwind"` | — (no template) |
| `yes` | `boolean` | — (irrelevant programmatically; see §5) |
| `yolo` | `boolean` | `false` — bypasses compatibility validation. Avoid. |
| `dryRun` | `boolean` | `false` — validates + plans, writes nothing |
| `verbose` | `boolean` | forced `true` internally by `create()` |
| `frontend` | `Frontend[]`: `"none" \| "tanstack-router" \| "react-router" \| "tanstack-start" \| "next" \| "nuxt" \| "native-bare" \| "native-uniwind" \| "native-unistyles" \| "svelte" \| "solid" \| "astro"` | `["tanstack-router"]` |
| `backend` | `"none" \| "hono" \| "express" \| "fastify" \| "elysia" \| "convex" \| "self"` | `"hono"` |
| `runtime` | `"none" \| "bun" \| "node" \| "workers"` — **`"node"`, NOT `"nodejs"`** (no alias exists; `"nodejs"` fails validation) | `"bun"` |
| `database` | `"none" \| "sqlite" \| "postgres" \| "mysql" \| "mongodb"` | `"sqlite"` |
| `orm` | `"none" \| "drizzle" \| "prisma" \| "mongoose"` | `"drizzle"` |
| `auth` | `"none" \| "better-auth" \| "clerk"` | `"better-auth"` |
| `payments` | `"none" \| "polar"` | `"none"` |
| `api` | `"none" \| "trpc" \| "orpc"` | `"trpc"` |
| `dbSetup` | `"none" \| "turso" \| "neon" \| "prisma-postgres" \| "planetscale" \| "mongodb-atlas" \| "supabase" \| "d1" \| "docker"` | `"none"` |
| `addons` | `Addons[]`: `"none" \| "pwa" \| "tauri" \| "electrobun" \| "starlight" \| "biome" \| "lefthook" \| "husky" \| "mcp" \| "turborepo" \| "nx" \| "vite-plus" \| "fumadocs" \| "ultracite" \| "oxlint" \| "opentui" \| "wxt" \| "skills" \| "evlog"` | `["turborepo"]` |
| `examples` | `("none" \| "todo" \| "ai")[]` — `["none"]` and `[]` are equivalent (source filters `"none"` out) | `[]` |
| `git` | `boolean` | `true` |
| `packageManager` | `"bun" \| "npm" \| "pnpm"` | auto-detected from `process.env.npm_config_user_agent` (`pnpm*`→pnpm, `bun*`→bun, else `npm`) |
| `install` | `boolean` | `true` |
| `webDeploy` | `"none" \| "prisma" \| "docker" \| "cloudflare" \| "vercel"` | `"none"` |
| `serverDeploy` | `"none" \| "prisma" \| "docker" \| "cloudflare" \| "vercel"` | `"none"` |
| `directoryConflict` | `"merge" \| "overwrite" \| "increment" \| "error"` | **`"error"`** (forced default in programmatic `create()`) |
| `addonOptions` | object — see §4 | — |
| `dbSetupOptions` | object — see §4 | — |
| `renderTitle` | `boolean` | forced `false` programmatically |
| `disableAnalytics` | `boolean` | **`true` by default programmatically** (input value defaults to true) |
| `manualDb` | `boolean` | — |

Note: `open` (launch an editor) exists on the CLI but is **not** part of `CreateInputSchema` — passing it fails strict validation; programmatic creation never launches external apps (docs confirm: "Programmatic creation never launches external applications").

### 3.1 Structured sub-options

`addonOptions` (only needed for specific addons; from `AddonOptionsSchema`):

```ts
{
  wxt?:       { template: "svelte"|"solid"|"vanilla"|"vue"|"react"; devPort?: number };
  fumadocs?:  { template: "react-router"|"tanstack-start"|"astro"|"next-mdx"|"next-mdx-static"|"waku"|"react-router-spa"|"tanstack-start-spa";
                devPort?: number; search?: "orama"|"orama-cloud"; ogImage?: "next-og"|"takumi"; aiChat?: "openrouter"|"llmgateway"|"inkeep" };
  opentui?:   { template: "solid"|"react"|"core" };
  mcp?:       { scope?: "project"|"global"; servers?: McpServer[]; agents?: McpAgent[] };
  skills?:    { scope?: "project"|"global"; agents?: SkillsAgent[]; selections?: { source: SkillsSource; skills: string[] }[] };
  ultracite?: { linter?: "biome"|"oxlint"; editors?: string[]; agents?: string[]; hooks?: string[] };
}
```
(The long agent/editor enums are in `@better-t-stack/types` `schemas.d.mts`; don't pass these unless the corresponding addon is in `addons`.)

`dbSetupOptions` (only for cloud db provisioning; from `DbSetupOptionsSchema`):

```ts
{
  mode?: "manual" | "auto" | "alchemy";
  neon?:          { method?: "neon"|"neon-new"|"neondb"|"neonctl"; projectName?: string; regionId?: string };
  prismaPostgres?: { regionId?: string };
  turso?:         { databaseName?: string; groupName?: string; installCli?: boolean };
}
```

The value arrays are also exported for runtime validation: `FRONTEND_VALUES`, `BACKEND_VALUES`, `RUNTIME_VALUES`, `DATABASE_VALUES`, `ORM_VALUES`, `AUTH_VALUES`, `PAYMENTS_VALUES`, `API_VALUES`, `DATABASE_SETUP_VALUES`, `ADDONS_VALUES`, `EXAMPLES_VALUES`, `PACKAGE_MANAGER_VALUES`, `WEB_DEPLOY_VALUES`, `SERVER_DEPLOY_VALUES`, `DIRECTORY_CONFLICT_VALUES`, `TEMPLATE_VALUES` (from `@better-t-stack/types`). You can also call `getSchemaResult("createInput")` (exported by the CLI package) to get the zod schema result for a named schema.

---

## 4. Option compatibility rules (verbatim from v3.40.3 validation code)

All quotes are exact error strings from the shipped implementation (`dist/src-*.mjs`); these validations run unless `yolo: true`.

### Fullstack "self" backend — how "tanstack-start as its own backend" is expressed

- It is **`backend: "self"`** (not omitted, not `"none"`). `frontend` must be exactly one of `FULLSTACK_FRONTENDS = ["next", "tanstack-start", "nuxt", "svelte", "solid", "astro"]`.
- `"Backend 'self' (fullstack) currently only supports Next.js, TanStack Start, Nuxt, SvelteKit, Solid, and Astro frontends. Please use --frontend next, --frontend tanstack-start, --frontend nuxt, --frontend svelte, --frontend solid, or --frontend astro."` (requires exactly one web frontend)
- **`backend: "self"` requires `runtime: "none"`**: `"Backend 'self' (fullstack) requires '--runtime none'. Please remove the --runtime flag or set it to 'none'."` (The fullstack framework runs its own Node server; you don't pick a runtime.)
- Conversely: `"'--runtime none' is only supported with '--backend convex', '--backend none', or '--backend self'."`
- Desktop addons + self: `tauri`/`electrobun` are rejected with backend `self` ("emits server routes that cannot be bundled as static desktop assets").

### Docker deploy (web + server)

- `serverDeploy: "docker"` requires a **separate** server backend:
  `"'--server-deploy docker' requires a separate server backend (hono, express, fastify, elysia). For a fullstack 'self' backend, use '--web-deploy docker' instead."`
- `serverDeploy: "docker"` is incompatible with workers runtime:
  `"'--server-deploy docker' is not compatible with '--runtime workers'. Use '--runtime bun' or '--runtime node', or choose '--server-deploy cloudflare'."`
- Same separate-backend rule applies to `serverDeploy: "vercel"` and `serverDeploy: "prisma"` (identical error wording).
- `webDeploy: "docker"` is valid (enum), including with `backend: "self"` (that's the recommended docker path for fullstack). It is rejected only for desktop addons (`tauri`, `electrobun`) on static-export frontends:
  `"'--web-deploy docker' is not compatible with the ... addon on '...' because desktop addons switch the web build to a static export, which the docker image cannot serve."`
- So: **"docker deploy for web+server"** =
  - split stack: `webDeploy: "docker", serverDeploy: "docker"` + backend `hono|express|fastify|elysia` + runtime `bun|node`
  - fullstack self: `webDeploy: "docker", serverDeploy: "none"` (serverDeploy docker would error).

### Database / ORM

- Database and ORM must both be non-`none` together ("Database requires an ORM").
- MongoDB requires `prisma` or `mongoose` (not `drizzle`).
- `dbSetup: "docker"` (a docker-compose DB provider): `"Docker setup is not compatible with SQLite database or Cloudflare Workers runtime."` (Use with postgres/mysql/mongodb + runtime bun/node.) Note: `dbSetup: docker` ≠ `webDeploy/serverDeploy: docker`.

### Cloudflare Workers

`runtime: "workers"` requires `backend: "hono"`, ORM `drizzle` or `prisma`, database `sqlite` only, `dbSetup: "d1"` (not docker). (Skill file `COMPATIBILITY` section + source constants.)

### API / auth / payments / frontends

- tRPC not supported with `nuxt`, `svelte`, `solid`, `astro` frontends (use `orpc`). oRPC works with all. (SKILL.md compatibility rules.)
- `auth: "better-auth"` requires a backend (auto-forced `none` when backend is `none`); source: `config.auth === "better-auth" && config.backend === "self"` is a supported combination.
- `payments: "polar"` requires `auth: "better-auth"`.
- Only one web frontend; one web + one native (`native-bare`/`native-uniwind`/`native-unistyles`) is allowed.
- Addon frontend requirements: `pwa` → `tanstack-router | react-router | solid | next`; `tauri` → most web frontends (not `solid`).
- Examples: `todo` requires database + api layer (`"The 'todo' example requires a database."` / `"...requires an API layer (tRPC or oRPC)"`); `ai` requires a backend.
- `convex` backend: not compatible with `solid`/`astro` frontends; forces runtime `"none"` (`if (backend === "convex" || backend === "none" || backend === "self") return "none"`).

---

## 5. Silent mode, prompts, install, progress output

From the `create()` implementation (v3.40.3):

```js
const input = {
  ...parsedInput.data,
  renderTitle: false,
  verbose: true,
  disableAnalytics: parsedInput.data.disableAnalytics ?? true,
  directoryConflict: parsedInput.data.directoryConflict ?? "error"
};
const result = await createProjectHandlerResult(input, { silent: true });
```

- **No interactive prompts ever.** The handler runs with `{ silent: true }`; in silent mode `gatherConfig` fills every omitted option from `DEFAULT_CONFIG` (defaults in §3 table) instead of prompting. Docs: "When called with options, only omitted options fall back to defaults rather than prompting."
- **No console output.** All CLI logging (`info/warn/success/error`, spinners, title) is suppressed when silent (`createSpinner()` returns a noop in silent mode). **Exception:** dependency installation spawns `` `${packageManager} install` `` via execa with `stderr: "inherit"` — the installer's stderr streams to your process's stderr. Plan for that in a server context (or pre-filter).
- **`yes` is not needed** programmatically (silent mode already skips prompts). It changes an internal branch but ends at the same defaults; setting it is harmless.
- **`install`** (`boolean`, default `true`): runs `<packageManager> install` in the created project dir. Set `install: false` to skip (you can run install yourself later). Note `packageManager: "pnpm"` requires pnpm available on PATH/execa resolution.
- **No progress events/callbacks API.** There are no streaming events; you get the final `InitResult` (includes `elapsedTimeMs`, `reproducibleCommand`). For progress you'd have to capture stdout/stderr of the process or use `dryRun` first. (This is an explicit gap — see Open questions.)
- **External-command kill switch:** env `BTS_SKIP_EXTERNAL_COMMANDS=1` (or `BTS_TEST_MODE=1`) makes the CLI skip all external commands (`install`, `git init`, docker compose) — useful in tests. Telemetry can be disabled with `disableAnalytics: true` (default in programmatic API) or env `BTS_TELEMETRY_DISABLED`.
- **`dryRun: true`**: performs name/path/conflict resolution + full compatibility validation, writes nothing; success indicates the config would scaffold.
- **Directory conflicts:** if the target dir exists and is non-empty → `DirectoryConflictError` with the default `"error"` strategy. Choose `"merge"` / `"overwrite"` / `"increment"` (auto-rename `my-app-1`) for server-driven behavior.
- **`git: true`** initializes a git repo in the project.
- The `add()` programmatic API adds addons/deploy configs to an existing scaffolded project (needs the generated `bts.jsonc`), e.g. `add({ addons: ["biome"], install: true, projectDir })`.

---

## 6. Version pinning & Node version

- **Node >= 22.0.0** required by `engines` (npm, v3.40.3). Your server runtime must satisfy this. (Analytics constants accept Node 18–30 but the package engine field is authoritative.)
- **Pin the exact version**, e.g. `"create-better-t-stack": "3.40.3"` in `dependencies` (not `devDependencies` if used at runtime), and commit a lockfile. Reasons: the enum surface changes between minors (e.g. `solid`/`svelte` added to self-backend support; addons list grows constantly), and many `pr*`/`canary` dist-tags exist. `@latest` on a server is risky.
- Do not use `pnpm create better-t-stack@latest ...` from a server; that re-downloads the package each run and only gives you the CLI surface. Import the library instead.
- Verifyenum drift at build time by importing the `*_VALUES` arrays from `@better-t-stack/types` (peer of the same version) and validating your form's allowed values against them.

---

## 7. Realistic code examples

### 7.1 Exact equivalent of the user's reference CLI command

Reference command:

```
pnpm create better-t-stack@latest my-better-t-app --frontend tanstack-start --backend hono --runtime bun --api trpc --auth better-auth --payments none --database sqlite --orm drizzle --db-setup none --package-manager pnpm --git --web-deploy none --server-deploy none --install --addons turborepo --examples none
```

Programmatic equivalent (TypeScript, ESM, Node >= 22 server):

```ts
// scaffold.ts — run with Node >= 22 ("type": "module")
import { create, CLIError, DirectoryConflictError } from "create-better-t-stack";

const result = await create("my-better-t-app", {
  frontend: ["tanstack-start"],
  backend: "hono",
  runtime: "bun",          // "node" | "bun" | "workers" | "none" — NOT "nodejs"
  api: "trpc",
  auth: "better-auth",
  payments: "none",
  database: "sqlite",
  orm: "drizzle",
  dbSetup: "none",
  packageManager: "pnpm",
  git: true,
  install: true,           // runs `pnpm install` inside the new project
  webDeploy: "none",
  serverDeploy: "none",
  addons: ["turborepo"],
  examples: ["none"],      // identical to []
  // directoryConflict: "error" is the programmatic default
});

if (result.isOk()) {
  const { projectDirectory, reproducibleCommand, elapsedTimeMs } = result.value;
  console.log("scaffolded at", projectDirectory, "in", elapsedTimeMs, "ms");
} else {
  const err = result.error;
  if (err instanceof DirectoryConflictError) {
    // target dir existed and was non-empty; retry with "increment" or "overwrite"
  } else if (err instanceof CLIError) {
    // invalid enum value / incompatible combination; err.message has the rule text
  }
  console.error(err.message);
}
```

Note: `frontend: ["tanstack-start"]` + `backend: "hono"` is a **split** stack (TanStack Start web app + separate Hono server). It is not the "self" fullstack layout.

### 7.2 The user's DESIRED defaults (fullstack self backend)

Desired: tanstack-start fullstack (self as backend), no native, sqlite, nodejs runtime, trpc, drizzle, docker deploy for web+server, better-auth, no payments, pnpm.

Two source-verified corrections to that wish list:
1. With `backend: "self"`, **`runtime` must be `"none"`** — the framework provides the (Node) server. `"node"` would be rejected: "Backend 'self' (fullstack) requires '--runtime none'."
2. With `backend: "self"`, **`serverDeploy` must not be `"docker"`** — use `webDeploy: "docker"` alone: "'--server-deploy docker' requires a separate server backend (hono, express, fastify, elysia). For a fullstack 'self' backend, use '--web-deploy docker' instead."

```ts
import { create } from "create-better-t-stack";

const result = await create("my-fullstack-app", {
  frontend: ["tanstack-start"], // fullstack frontend; no native-* entries
  backend: "self",              // TanStack Start serves its own API
  runtime: "none",              // REQUIRED with backend "self"
  database: "sqlite",
  orm: "drizzle",
  api: "trpc",
  auth: "better-auth",
  payments: "none",
  dbSetup: "none",
  packageManager: "pnpm",
  git: true,
  install: true,
  webDeploy: "docker",          // Dockerfile + docker-compose for the self-hosted web app
  serverDeploy: "none",         // there is no separate server app
  addons: ["turborepo"],
  examples: [],
});

if (result.isOk()) console.log("done:", result.value.projectDirectory);
else console.error(result.error.message);
```

Equivalent CLI form: `pnpm create better-t-stack@latest my-fullstack-app --frontend tanstack-start --backend self --runtime none --api trpc --auth better-auth --payments none --database sqlite --orm drizzle --db-setup none --package-manager pnpm --git --web-deploy docker --server-deploy none --install --addons turborepo --examples none`

### 7.3 Variant: if "nodejs runtime + docker on BOTH web and server" is a hard requirement

That combination requires a separate server backend (runtime `"node"` is only meaningful with hono/express/fastify/elysia):

```ts
const result = await create("my-app", {
  frontend: ["tanstack-start"],
  backend: "hono",        // or express / fastify / elysia
  runtime: "node",        // "node", never "nodejs"
  database: "sqlite",
  orm: "drizzle",
  api: "trpc",
  auth: "better-auth",
  payments: "none",
  dbSetup: "none",
  packageManager: "pnpm",
  git: true,
  install: true,
  webDeploy: "docker",
  serverDeploy: "docker", // valid: separate server backend + non-workers runtime
  addons: ["turborepo"],
  examples: [],
});
```

### 7.4 Pre-view without writing to disk

```ts
import { createVirtual } from "create-better-t-stack";
const tree = await createVirtual({
  frontend: ["tanstack-start"], backend: "self", runtime: "none",
  database: "sqlite", orm: "drizzle", api: "trpc", auth: "better-auth",
});
if (tree.isOk()) console.log(tree.value.fileCount); // VirtualFileTree — in-memory files
```

---

## 8. Alternative integration surfaces (when not importing the lib)

| Surface | How | Notes |
|---|---|---|
| Import library (recommended) | `import { create } from "create-better-t-stack"` | Result-typed, silent, no child process needed. Node >= 22, ESM-only. |
| Spawn CLI | `npx create-better-t-stack@3.40.3 <name> --yes ...` (all flags + `--yes`) | Keep `--yes` to skip prompts; parse stdout; slower (process spawn, package download unless cached). |
| JSON-first CLI | `npx create-better-t-stack@latest create-json --input-file bts.json` | Same option names in a JSON file (no `projectName` key inside; passed as arg). Docs: https://www.better-t-stack.dev/docs/cli/agent-workflows |
| MCP server | `npx create-better-t-stack@latest mcp` | tRPC-based MCP tools (`create`, `create_json`, `schema`, ...) for agents. |
| Schema introspection | `import { getSchemaResult } from "create-better-t-stack"` or CLI `create-better-t-stack schema --name createInput` | Get the exact zod schema/JSON-schema for dynamic form validation. |

---

## 9. Gotchas / source-vs-docs discrepancies

1. **Skill file is outdated:** `/home/didi/.agents/skills/better-t-stack/SKILL.md` shows `init()` (removed; now `create()`), misses `native-bare`/`native-unistyles` frontends, says self-backend supports "next, tanstack-start, nuxt, astro" (source also allows `svelte` and `solid`), and its options list omits `dbSetup` values `supabase`/`docker`, deploy values `prisma`/`docker`/`vercel`, addon `evlog`, etc.
2. **Docs page omits `DirectoryConflictError`** from the `CreateError` union (source `.d.ts` includes it).
3. **`runtime: "nodejs"` is invalid** — must be `"node"`. (`grep` for `"nodejs"` in the shipped code returns nothing.)
4. **Strict schema:** passing an unknown key (e.g. `open`, or camelCase typos like `dbSetup`) returns `Result.err(CLIError)` rather than being ignored.
5. `examples: ["none"]` ≡ `examples: []`; `addons` accepts `"none"` in the enum but it is filtered out.
6. `install: true` streams the package manager's **stderr into your process's stderr** (execa `stderr: "inherit"`) — the API itself prints nothing else.
7. The default `directoryConflict: "error"` means an existing non-empty target dir fails the whole call; pick a strategy consciously for a web-form flow (e.g. `"increment"`).
8. `backend: "none"` requires `auth: "none"` — it is a hard validation error otherwise (source: `"Backend 'none' requires '--auth none'. Please remove the --auth flag or set it to 'none'."`). Don't offer auth in the form without a backend.

## 10. Open questions / not fully verifiable

- **Progress events:** there is no documented or typed event/callback/streaming API for scaffolding progress in 3.40.3 (only final `InitResult`). If live progress is required, options are: (a) wrap install yourself with `install: false` + your own runner, (b) capture the child stderr stream, or (c) file-watch the target directory. Not confirmed whether any private/unstable event API exists in the monorepo beyond the shipped bundle.
- **`better-t-stack` GitHub org:** the task referenced `github.com/better-t-stack/better-t-stack` — it 301-redirects to `AmanVarshney01/create-better-t-stack`; no separate org repo exists today.
- **Docs `--frontend` choices list** shows `native-nativewind` on the options page, but the shipped v3.40.3 enum has `native-bare | native-uniwind | native-unistyles` (no `native-nativewind`). Presumably a stale docs page; source wins. (SKILL.md also mentions `native-nativewind` — outdated.)
- **Whether `pnpm` (or `bun`) must be on PATH** when `install: true`: execa runs the bare command name, so yes — PATH must resolve `pnpm`. Not explicitly documented; inferred from `await $\`...install\``.
- Exact fields of `VirtualFileTree` were not extracted (it comes from `@better-t-stack/template-generator`; has `fileCount` per docs example).

## 11. Sources

- Local skill: `/home/didi/.agents/skills/better-t-stack/SKILL.md` (+ `references/OPTIONS.md`, `references/COMPATIBILITY.md`)
- Official docs overview: https://www.better-t-stack.dev/docs
- Programmatic API: https://www.better-t-stack.dev/docs/cli/programmatic-api
- Options reference: https://www.better-t-stack.dev/docs/cli/options
- Agent workflows (create-json / schema / MCP): https://www.better-t-stack.dev/docs/cli/agent-workflows
- npm: `create-better-t-stack@3.40.3` tarball — `package.json`, `dist/index.d.mts`, `dist/index.mjs`, bundled `dist/src-*.mjs` (validation messages, DEFAULT_CONFIG, silent-mode logic)
- npm: `@better-t-stack/types@3.40.3` tarball — `dist/schemas.d.mts`, `dist/index.d.mts` (all zod schemas + `*_VALUES` enums)
- GitHub repo: https://github.com/AmanVarshney01/create-better-t-stack (CLI: `apps/cli`)

*Doc generated 2026-08-24 against `create-better-t-stack@3.40.3` (latest). Re-verify enum lists when upgrading the pin.*

---

## Native frontends (follow-up)

Verified 2026-08-25 against the published tarballs `create-better-t-stack@3.40.3` and `@better-t-stack/types@3.40.3` (downloaded from npm), plus `@better-t-stack/template-generator@3.40.3`, **and** verified empirically by calling `create()` with `dryRun: true` from Node 24 (facts marked "empirical" below were reproduced by running the real code). CLI line numbers refer to the shipped bundle `dist/src-CP4utAOe.mjs` (hash-named file, exact for 3.40.3).

### 1. Exact native enum values (3.40.3 source)

`native-bare | native-uniwind | native-unistyles` — **confirmed; there is no `native-nativewind`.**

- `@better-t-stack/types@3.40.3` `dist/schemas.d.mts` lines 38–40: the `FrontendSchema` zod enum contains `"native-bare"`, `"native-uniwind"`, `"native-unistyles"` (and nothing else starting with `native-`). `dist/index.d.mts` line 221: `type NativeFrontend = Extract<Frontend, "native-bare" | "native-uniwind" | "native-unistyles" | "none">`.
- CLI bundle lines 913–915 (same three values) and lines 37–39 (UI labels: "Expo (bare)", "Expo + Uniwind", "Expo + Unistyles"; prompt labels "Bare"/"Uniwind"/"Unistyles" at lines 5385–5396).
- Empirical: `frontend: ["native-nativewind"]` → `Invalid create input: frontend.0: Invalid option: expected one of "tanstack-router"|"react-router"|"tanstack-start"|"next"|"native-bare"|"native-uniwind"|"native-unistyles"|"svelte"|"solid"|"astro"|"none"` (empirical, dryRun).

### 2. `frontend` is an array; web + native in one scaffold is legal

- `CreateInputSchema.frontend` is `z.ZodOptional<z.ZodArray<z.ZodEnum<...>>>` (`@better-t-stack/types` `dist/schemas.d.mts` line 1028). A bare string is rejected: `frontend: "native-bare"` → "Invalid input: expected array, received string" (empirical).
- Cardinality rule — `splitFrontends` + `ensureSingleWebAndNative` (CLI bundle lines 919–934): **at most one web frontend AND at most one native frontend** per project. Exact errors (empirical):
  - two natives: `Cannot select multiple native frameworks. Choose only one of: native-bare, native-uniwind, native-unistyles`
  - two webs: `Cannot select multiple web frameworks. Choose only one of: tanstack-router, tanstack-start, react-router, next, nuxt, svelte, solid, astro`
- So `frontend: ["tanstack-start", "native-bare"]` **is valid** — one web + one native in a single scaffold (empirical: dryRun OK with `backend: "self"` and with `backend: "hono"`). Native-only (`["native-bare"]`, no web) is also valid. `"none"` cannot be combined with other frontend values (`validateNoneExclusivity`, "Cannot combine 'none' with other frontend options.").

### 3. Constraints when a native frontend is present

Validation path note: programmatic `create()` runs the **full** `validateFullConfig` twice — once on the raw partial input (`processAndValidateFlags`, line 6850) and once on the resolved config after silent defaults are applied (`validateResolvedConfigCompatibility(config)` → `validateFullConfig(config, coreStackFlags, config)`, lines 6886, 8913–8919) — unless `yolo: true`. So all rules below are enforced for `create()`.

- **`backend: "self"` + native is NOT rejected.** `validateSelfBackendCompatibility` (lines 969–980) requires exactly one fullstack web frontend (`web.length === 1 && FULLSTACK_FRONTENDS.includes(web[0])`) and at most one native — `native.length === 1` alongside is fine. Empirical: `["tanstack-start", "native-bare"]` + `backend: "self"` + `runtime: "none"` → dryRun OK (also OK with `native-uniwind`). Native does **not** force a separate backend. Self + native *only* (no web frontend) fails with the standard self-backend error (empirical). `getNativeInstructions(isConvex, isBackendSelf, ...)` (line 8434) explicitly handles the self-backend case (`EXPO_PUBLIC_SERVER_URL=http://<YOUR_LOCAL_IP>:<web port>`).
- **Runtime: native neither forces nor restricts `runtime`.** Runtime rules are backend-driven only: `getRuntimeChoice` forces `"none"` for `convex`/`none`/`self` backends (line ~5755), and silent `gatherConfig` uses `runtime: flags.runtime ?? DEFAULT_CONFIG.runtime` with no native branch (line 5907). Empirical: native + hono + `runtime: "node"` OK; native + hono + `runtime: "bun"` OK; web + native + `runtime: "workers"` OK (with workers' own rules met: hono, drizzle, sqlite, dbSetup d1, serverDeploy cloudflare). `self` + `runtime: "node"` + native fails only on the self-backend rule ("Backend 'self' (fullstack) requires '--runtime none'.") (empirical).
- **No conflicts with any of the asked combinations** (all empirical, dryRun OK):
  - `api: "trpc"` + native — fine. tRPC is rejected only for `nuxt`/`svelte`/`solid`/`astro` web frontends (`validateApiFrontendCompatibility`, lines 1035–1043); native is exempt. (oRPC also fine.)
  - `auth: "better-auth"` + native — fine (better-auth works with any backend). `auth: "clerk"` also supports native (Clerk Expo quickstart URL, line 8565).
  - `database: "sqlite"` + `orm: "drizzle"` + native — fine. The DB lives in the backend/packages; `apps/native` only gets an API client + env vars. No native-specific DB/ORM rules exist in the source.
  - `webDeploy: "docker"` + native — allowed when a web frontend is present (the web app is what gets dockerized). Native-*only* + `webDeploy: "docker"` → `'--web-deploy' requires a web frontend. Please select a web frontend or set '--web-deploy none'.` (empirical).
  - `serverDeploy: "docker"` + native — fine with a separate backend (`hono`/`express`/`fastify`/`elysia` + `runtime: "node"` verified OK). Rejected with `backend: "self"`/`convex` per the existing self-backend rule, nothing to do with native.
  - `addons: ["turborepo"]` + native — fine. `ADDON_COMPATIBILITY.turborepo = []` (line 220) = no frontend requirement. Of all addons only `pwa`, `tauri`, `electrobun` have frontend allow-lists, and none includes native values (so those three are incompatible with a native-*only* frontend selection).
- **One native-specific hard requirement: Node version.** `getNodeToolingRequirements` (lines 1782–1786) requires Node `^22.13.0 || ^24.3.0 || >=26.0.0` ("React Native 0.86") for any native frontend — enforced as a hard `CLIError` by `checkLocalRequirements` (line 1862) when `packageManager !== "bun"` (and it spawns `<packageManager> --version` / `node --version` via execa to check; skipped when `BTS_SKIP_EXTERNAL_COMMANDS=1`/`BTS_TEST_MODE=1`). Empirical: ran with checks enabled on Node 24.19.0 → OK.

### 4. What else changes when native is included

- **Extra directory: `apps/native`** — an Expo (React Native 0.86) workspace app. `@better-t-stack/template-generator@3.40.3` `dist/index.mjs`: line 4197 copies template `frontend/native/base` → `apps/native`, then line 4198/4199 adds `frontend/native/bare` or `frontend/native/uniwind` (unistyles analogously) on top. It's in the workspace `PACKAGE_PATHS` list (line 374) and root `.gitignore` gets `apps/native/.expo/**` and `apps/native/dist/**` (lines 2878–2879). `apps/native/.env` is written with `EXPO_PUBLIC_SERVER_URL` (or `EXPO_PUBLIC_CONVEX_URL`, or a self-backend IP/port variant) by the env processor (lines 2708–2711; builder `buildNativeVars`).
- **No extra external tooling is required or invoked.** There are **no Xcode / Android SDK / emulator checks** and no `expo …` / `pod install` / prebuild commands anywhere in the CLI source (grep confirms). Running the native app is left to the user as next-step instructions. The only enforced tooling is the Node version range above (plus the usual package-manager minimums).
- **No extra prompts in programmatic mode.** The "web/native" multiselect and the native-setup picker exist only inside `getFrontendChoice` (lines 5293–5410), which returns immediately when `frontend` is provided; silent `gatherConfig` (lines 5901–5923) returns defaults without prompting at all. Nothing native-related can hang a silent run.
- **`InitResult` is unchanged** — same 7 fields, nothing native-specific. `projectConfig.frontend` echoes e.g. `["tanstack-start", "native-bare"]`, and `reproducibleCommand` renders repeated flags: `--frontend tanstack-start native-bare` (empirical).
- **Post-install instructions are print-only and suppressed when silent**: the Expo connectivity note (update `apps/native/.env` with your local IP), the "Unistyles requires a development build" note (`cd apps/native && <pm> run android|ios`), and the warning "'bun' might cause issues with web + native apps in a monorepo. Use 'pnpm' if problems arise." (bun + web + native only) all live in `displayPostInstallInstructions`, gated by `if (!isSilent())` (lines 8312, 8330, 8343, 8434–8443, 8557–8559, 8717). Programmatically you get none of this text — surface the IP/env hint yourself if relevant.
- Minor: with the `mcp` addon, native adds an `expo` MCP server to the recommended set (line 3126); with the `skills` addon it adds React Native skill sources (lines 3701–3765). Only relevant if you select those addons.
