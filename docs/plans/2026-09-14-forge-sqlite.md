# Plan: forge-sqlite — SQLite/Drizzle persistence + multi-forge backend support

**Repo**: `/home/didi/workspace/workspace-welcome`, branch `forge-sqlite` (already checked out, clean tree at planning time).
**Plan file**: save as `docs/plans/2026-09-14-forge-sqlite.md`.
**Method**: executed per `/home/didi/.agents/skills/subagent-orchestration/SKILL.md` — per phase: implementer → validator → fixer loop (max 3), commit between validated phases.

## Overview

Introduce SQLite + Drizzle into this better-t-stack-scaffolded-without-a-db monorepo (by harvesting a throwaway BTS scaffold into a new `packages/db`), migrate ALL user-state JSON persistence (store.json, per-project config files) into a proper relational model with a lossless first-boot auto-import, then build a rate-limit-safe multi-forge layer (GitHub via `gh` CLI first; Gitea/GitLab as interface+registry design only) surfacing per-project open issue/PR counts on project lists and a new issues/PRs widget on the project page, all cached in the DB with TTL + dedupe + sequential fetch discipline.

## 🚨 ABSOLUTE CONSTRAINT — PASTE INTO EVERY DISPATCH (see §Boilerplate)

The owner's GitHub account is precious and rate-limited. **Zero live `gh`/GitHub API calls during Phases 1–7 and all fix loops.** All adapter testing is fixture-based (hand-authored sample `gh … --json` output files committed in the repo) plus pure-parser unit tests. The ONLY live calls in the entire epic are in Phase 8: exactly the 3 commands in §Live-API budget, once. Runtime design must itself be rate-limit-aware (§Sync design).

## Guiding decisions (with rationale)

1. **DB placement: new `packages/db` (`@workspace-welcome/db`), not inside `packages/api`.**
   - Better-t-stack's monorepo scaffold generates exactly a `packages/db` shape — the harvest is near 1:1, minimizing adaptation errors.
   - Hard package boundary keeps the native module away from `packages/api`'s dual-side modules (e.g. `lib/clone-script.ts` is imported directly into client components; a db-inside-api would put `better-sqlite3` one directory away from browser-bundled code).
   - `apps/web` never imports db; it reaches data only through tRPC. Matches the existing 5-package conventions. Cost: one more package — low.
2. **Driver: whatever the Phase-1 throwaway BTS scaffold generates (expected `better-sqlite3`; if it generates `@libsql/client` with a `file:` URL, use that).** Tie-break to `better-sqlite3` (sync API fits the sync store facade; prebuilt linux-x64 binding; first-class drizzle migrator). Do NOT swap drivers on taste — only on proven breakage in this environment. Release packaging flows through `pnpm --filter web deploy --prod` (prod-pruned node_modules) either way; precedent already exists for native deps (`create-better-t-stack`/oxfmt, `apps/web/vite.config.ts:15-24`).
3. **Runtime migrations are embedded TS modules, not drizzle-kit's `drizzle/` folder read from disk.** The release tarball ships a Vite-bundled server (`dist/server/server.js`) — the packages on disk do not exist at stable URLs in production, so folder-based `migrate()` would break exactly where CI cannot catch it. Deviation from the BTS layout, documented in the ADR: `drizzle.config.ts` + `drizzle-kit generate` stay as dev-time tooling (SQL review/diff), while `packages/db/src/migrations/*.ts` embed the SQL strings; a ~40-line runner applies them in order guarded by an `app_meta.schema_version` marker. Validators cross-check migration SQL ↔ `schema.ts` column-for-column.
4. **No `DATABASE_URL` env var.** DB file lives at `$XDG_DATA_HOME/workspace-welcome/workspace-welcome.db` via the existing `lib/xdg.ts` `dataDir()` (deviation from BTS env validation, which we simply don't harvest; `packages/env` stays untouched).
5. **Migration strategy: facade-preserving, one-time, transactional, lossless.** `store.ts` (`readStore`/`mutateStore`/`readSettings`) and `project-config.ts` (`readProjectConfig`/`writeProjectConfig`) keep their exact exported signatures and become DB-backed — the ~10 consumer files (`routers/{roots,projects,settings,reports,ideation,artifacts}.ts`, `lib/{known-project,scaffold,ideation/context}.ts`) stay untouched. First `readStore()` after boot: if `app_meta.store_imported_at` is unset and the legacy JSON exists, parse it with the existing `migrate()` normalizers and insert rows inside one transaction, then set the marker. Original JSON files are left in place untouched (backup + reversibility); new writes go to DB only. Same pattern for per-project config files (`app_meta.project_configs_imported_at`).
6. **Forge adapter interface supports BOTH styles** (`style: "cli" | "api"`); only the gh CLI adapter is implemented this round. Gitea/GitLab exist as enum values + extension documentation in the ADR — NO stub adapters, NO invented API calls.
7. **Project→forge-repo mapping via the already-captured git remote.** `gitInspect` (`packages/api/src/lib/git.ts:125`) already parses `remote.origin.url` into `RemoteInfo { url, host, slug, links }` (`lib/detect.ts:142 parseRemote`). Resolution happens only on explicit sync: `gitInspect(projectPath).remote` → adapter `matches(remote)` (gh matches `host === "github"`) → upsert `forge_repos` + `forge_project_links`. Dashboard overview queries are pure-DB reads and never fetch. `GitHost`/`classifyHost` stay unchanged (self-hosted gitea/gitlab detection is future settings-driven work — documented, not built).
8. **Sync is awaited, queued, deduped, TTL-guarded — never a job registry, never background.** `gh issue list` / `gh pr list` are seconds-fast; the pattern is `lib/git.ts`'s awaited `execFile` mutation (like `projects.pull`), not `snitch.ts`'s spawn+poll. Anti-storm measures in §Sync design.

## JSON→DB migration inventory (verified against code)

| Artifact | Today | Shape | Target | Stays a file? |
|---|---|---|---|---|
| Store | `$XDG_CONFIG_HOME/workspace-welcome/store.json` (`lib/store.ts:18-20`, atomic tmp+rename writes, in-memory cache) | `{ roots: Root[], projects: Record<absPath, ProjectOverrides>, settings: Settings }` (settings incl. `excludeGlobs`, `ideation` models/reconciler) | `roots`, `project_overrides`, `settings` tables + `app_meta` import markers | Legacy file left as backup, never written again |
| Per-project config | `$XDG_DATA_HOME/workspace-welcome/projects/<slug>-<sha12>.json` (`lib/project-config.ts:55-62`) | `{ version: 1, path, artifacts: { dirs: string[] } }` | `project_configs` table (path PK) | Same — left in place after import |
| Scan cache | module singleton `lib/scan-cache.ts:67` | fingerprints + override-free `Project[]` | NOT migrated — in-memory | n/a (cheap fingerprints, warm path is already O(changed); persisting adds staleness risk for no rate-limit win) |
| Report HTML + JSON export | `$XDG_CACHE_HOME/workspace-welcome/reports/<key>.{html,json}` (`lib/snitch.ts:169`, `lib/report-export.ts:479`) | disposable, deterministically re-creatable cache; served at `/reports/<key>` | NOT migrated | **Stay files**: XDG cache semantics (disposable), HTML is served verbatim as one blob, unlink-on-rerun contract stays trivial; a DB index would be a second source of truth for a cache |
| Report job registry | in-memory `Map` (`snitch.ts:235`) — "the file is the state; the registry is just the live handle" | n/a | NOT migrated | n/a |
| Ideation sessions | `.ideadump/ideation/<sessionId>/` inside each project (`lib/ideation/session.ts`) | session.json, transcript.jsonl, grades.jsonl, candidates, final docs | NOT migrated | **Stay files**: they live in the project by design (survive server restarts, travel with the repo, are per-project artifacts) |
| Web IDE install | `dataDir()/ide/` | code-server payload | NOT user state | stays |
| Forge cache (NEW) | — | snapshots, items, links | `forge_repos`, `forge_project_links`, `forge_issues`, `forge_pulls` | n/a |

## Data model sketch (drizzle, sqlite-core)

```
app_meta            (key TEXT PK, value TEXT NOT NULL)
  -- schema_version, store_imported_at, project_configs_imported_at
roots               (id TEXT PK, path TEXT NOT NULL UNIQUE, label TEXT NOT NULL, added_at TEXT NOT NULL)
project_overrides   (path TEXT PK, pinned INTEGER(bool) NOT NULL, note TEXT NOT NULL,
                     last_opened_at TEXT NULL, hidden INTEGER(bool) NOT NULL)
settings            (id INTEGER PK CHECK(id=1), editor_command TEXT NOT NULL,
                     terminal_command TEXT NULL, snitch_path TEXT NULL,
                     exclude_globs_json TEXT NOT NULL, ideation_json TEXT NOT NULL)
project_configs     (path TEXT PK, artifact_dirs_json TEXT NOT NULL)
forge_repos         (id INTEGER PK, kind TEXT NOT NULL,            -- 'github' (+'gitea','gitlab' reserved)
                     host TEXT NOT NULL, slug TEXT NOT NULL,       -- 'owner/repo'
                     last_synced_at TEXT NULL, last_sync_status TEXT NOT NULL DEFAULT 'never',
                     last_sync_error TEXT NULL, UNIQUE(kind, host, slug))
forge_project_links (project_path TEXT PK, repo_id INTEGER NOT NULL REFERENCES forge_repos(id) ON DELETE CASCADE,
                     remote_url TEXT NOT NULL)
forge_issues        (repo_id INTEGER NOT NULL REFERENCES forge_repos(id) ON DELETE CASCADE,
                     number INTEGER NOT NULL, title TEXT NOT NULL, state TEXT NOT NULL,  -- 'open'
                     author TEXT NULL, labels_json TEXT NOT NULL, comment_count INTEGER NULL,
                     updated_at TEXT NULL, url TEXT NOT NULL, PRIMARY KEY (repo_id, number))
forge_pulls         (repo_id … same FK, number, title, state, author, is_draft INTEGER(bool),
                     review_decision TEXT NULL, labels_json TEXT NOT NULL, updated_at TEXT NULL,
                     url TEXT NOT NULL, PRIMARY KEY (repo_id, number))
```

Conventions: booleans as drizzle `integer({ mode: "boolean" })`; timestamps as ISO strings (existing repo convention); `*_json` columns hold JSON arrays/objects (settings is one row — arrays-as-JSON there is honest, the relational demand applies to entities, not the settings singleton). Open counts are derived (`COUNT(*)`), never stored. Sync replaces a repo's item rows transactionally (snapshot semantics — the tables hold "open items as of last sync"; no history needed).

## Forge adapter interface sketch (TypeScript)

```ts
// packages/api/src/lib/forge/types.ts
export type ForgeKind = "github" | "gitea" | "gitlab";
export type AdapterStyle = "cli" | "api";

export interface ForgeRepoRef { kind: ForgeKind; host: string; slug: string } // host "github.com"

export interface ForgeIssue {
  number: number; title: string; state: "open"; author: string | null;
  labels: string[]; commentCount: number | null; updatedAt: string | null; url: string;
}
export interface ForgePull {
  number: number; title: string; state: "open"; author: string | null;
  isDraft: boolean; reviewDecision: string | null; labels: string[];
  updatedAt: string | null; url: string;
}
export interface ForgeSnapshot {
  ref: ForgeRepoRef; fetchedAt: string;          // ISO
  issues: ForgeIssue[]; pulls: ForgePull[];
  /** True when a list hit the page limit — counts render as "50+". */
  issuesTruncated: boolean; pullsTruncated: boolean;
}
export interface ForgeFetchOptions { pageLimit: number }   // default 50

export interface ForgeAdapter {
  readonly kind: ForgeKind;
  readonly style: AdapterStyle;
  matches(remote: RemoteInfo): boolean;          // gh: remote.host === "github"
  isAvailable(): Promise<boolean>;               // gh: `gh auth status` exit code, cached ≥10 min
  fetchSnapshot(ref: ForgeRepoRef, opts?: ForgeFetchOptions): Promise<ForgeSnapshot>; // throws Error on failure
}
// registry.ts: only the gh adapter registered this round; resolution = first adapter where matches(remote).
```

gh adapter mechanics (fixture-tested, never live during dev): `execFile("gh", ["issue"|"pr", "list", "--repo", slug, "--state", "open", "--limit", String(pageLimit), "--json", …], { timeout: 30_000, maxBuffer: 1MB })` following `lib/git.ts:34-48`; parse with pure functions `parseIssueListJson(raw: string)` / `parsePullListJson(raw: string)` that defensively map `unknown` → typed rows (gh JSON states are uppercase `"OPEN"`; fixtures document the exact shape: issue fields `number,title,state,author{login},labels[{name}],updatedAt,url,comments`; PR adds `isDraft,reviewDecision`). Availability probe: `gh auth status` — remember failure for 10 min, never probe more than once per sync attempt.

## Sync / caching / TTL design (rate-limit safety, encoded in Phase 4b requirements)

- **Constants** (single module): `TTL_MS = 60 min` (staleness threshold for UI "stale" hint), `MIN_SYNC_INTERVAL_MS = 5 min` (server-enforced per-repo refusal unless `force`), `PAGE_LIMIT = 50`, `CALL_TIMEOUT_MS = 30_000`.
- **Triggers**: explicit Sync button on the project-page widget (mutation `forge.sync { path, force? }`). NO auto-sync on page load, NO background polling, NO fleet/bulk sync in core scope (bulk is an optional extra, still user-initiated and strictly sequential).
- **Dedupe + sequencing**: module-level `Map<repoKey, Promise<ForgeSnapshot>>` in-flight (the `scan-cache.ts` `inFlight` idiom) AND a single global async queue so only ONE gh invocation is ever in flight process-wide; issues and pulls within one sync run strictly sequential (`await` one, then the other).
- **UI read path**: `forge.overview` and `forge.project` are DB-only reads — rendering can never trigger network.
- **Failure honesty**: sync failures set `last_sync_status='failed'` + `last_sync_error`, throw `Error` with the gh stderr/message for the standard toast path; availability failure short-circuits with a clear "gh not authenticated" message.
- **Counts truncation**: when a list length equals `PAGE_LIMIT`, count renders `50+` (never a false exact number).

## Phases

---

### Phase 1: Throwaway BTS scaffold + harvest reference
**Type**: Sequential (no repo code changes besides one research doc)

**Requirements**:
- Load the skill `/home/didi/.agents/skills/better-t-stack/SKILL.md` FIRST and follow it.
- Scaffold a THROWAWAY project **in /tmp (e.g. `/tmp/ww-db-ref`), NEVER inside this repo**: `pnpm create better-t-stack@latest ww-db-ref --frontend tanstack-start --backend self --database sqlite --orm drizzle --api trpc --addons turborepo --package-manager pnpm --yes` (adjust flags per the skill; the goal is the monorepo `packages/db` shape with drizzle + sqlite).
- Let its `pnpm install` run **in /tmp only**. Do NOT touch this repo's lockfile.
- Harvest into `docs/research/2026-09-14-sqlite-harvest.md`: (1) exact generated dependency names + versions (drizzle-orm, drizzle-kit, driver, types); (2) verbatim generated `packages/db` file tree + contents of client, schema, drizzle.config, migrations layout, package.json scripts; (3) how it wires env (`DATABASE_URL`) — noted as the deviation point (we use XDG instead); (4) the driver BTS chose (better-sqlite3 vs libsql) — this locks Decision 2.
- Delete nothing in /tmp (harmless), write ONLY the harvest doc in this repo.

**Inputs**: Read: `/home/didi/.agents/skills/better-t-stack/SKILL.md`, `bts.jsonc`.
**Outputs**: Create: `docs/research/2026-09-14-sqlite-harvest.md`.
**Validation criteria**: Harvest doc exists and contains all four sections with verbatim generated content + exact versions; no other repo files changed (`git status` clean besides the doc); driver identified.
**Dependencies**: None.
**Commit**: `forge-sqlite(p1): sqlite harvest reference — throwaway better-t-stack scaffold (/tmp) inventoried: driver, versions, packages/db layout, migration mechanics (validated)`

---

### Phase 2: `packages/db` package — schema, client, embedded migrations
**Type**: Sequential

**Requirements**:
- Create `@workspace-welcome/db` (source-level consumption like the other packages: `"exports": { "./*": { "default": "./src/*.ts" } }`, no build step).
- `package.json`: deps `drizzle-orm`, driver + `@types/*` from Phase-1 versions; devDeps `drizzle-kit`, `tsx` (for selftest), `typescript`, `@workspace-welcome/config`; workspace dep none. Scripts: `check-types` (tsc --noEmit), `db:generate` (drizzle-kit generate), `db:selftest`.
- Root `pnpm-workspace.yaml` catalog: add `drizzle-orm`, `drizzle-kit`, driver, its types (versions from Phase 1) and reference them via `catalog:` from packages/db. Run `pnpm install` from repo root.
- `src/schema.ts`: drizzle sqlite-core tables exactly per §Data model sketch — `appMeta`, `roots`, `projectOverrides`, `settings`, `projectConfigs` (forge tables come in Phase 4b).
- `src/client.ts`: lazy sync singleton `getDb()` — `mkdirSync(dataDir(), { recursive: true })` (import `dataDir` from `@workspace-welcome/api/lib/xdg` — NOTE: check import direction; if that would create a cycle (api will depend on db in Phase 3), instead replicate a local `dbDir()` helper and leave a comment; prefer the local helper to keep db dependency-free), open `better-sqlite3` at `dataDir()/workspace-welcome.db`, `pragma journal_mode = WAL`, `pragma busy_timeout = 5000`, `drizzle(database)`, then apply pending migrations. Must be safe to call repeatedly (singleton) and from tests against a temp path (path resolved lazily per call, overridable via an explicit `openDb(file)` export used by selftest).
- `src/migrations/0001_app_tables.ts` + `src/migrations/index.ts` + `src/migrate.ts`: embedded runner — each migration `{ id, statements: string[] }`; runner reads `app_meta.schema_version`, applies unapplied migrations in order, each inside a transaction, recording the version. SQL generated by `db:generate` for review, embedded as TS strings (provenance comment with the drizzle-kit command/date); validator cross-checks columns against `schema.ts` 1:1.
- `drizzle.config.ts` (package root, points at `src/schema.ts`, dialect sqlite, out `drizzle/`).
- `src/index.ts` re-exports; `scripts/selftest.ts` (or `src/selftest.ts` run via tsx): opens a temp DB under `os.tmpdir()`, applies migrations, asserts every table exists via `sqlite_master`, prints PASS — must never touch the real XDG path.
- `apps/web/vite.config.ts`: add the driver to `ssr.external` AND `optimizeDeps.exclude` (mirror the existing `create-better-t-stack` entries with a comment referencing that precedent).
- tsconfig: extend `@workspace-welcome/config/tsconfig.base.json` like `packages/api/tsconfig.check.json` (noEmit).

**Inputs**: Read: `docs/research/2026-09-14-sqlite-harvest.md` (Phase 1), `packages/api/package.json`, `packages/api/tsconfig.check.json`, `apps/web/vite.config.ts`, `packages/api/src/lib/xdg.ts`.
**Outputs**: Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/drizzle.config.ts`, `packages/db/src/{schema,client,migrate,index,selftest}.ts`, `packages/db/src/migrations/{0001_app_tables.ts,index.ts}`. Modify: `pnpm-workspace.yaml`, `apps/web/vite.config.ts`.
**Validation criteria**: `pnpm run check-types` zero errors (recursive — db included); `pnpm run build` succeeds (proves the SSR external wiring); `pnpm --filter @workspace-welcome/db db:selftest` prints PASS against a temp file; no `any`/`as any`; migrations embedded (no runtime fs reads of `drizzle/`); `git status` shows no lockfile surprises beyond the intended install.
**Dependencies**: Phase 1.
**Commit**: `forge-sqlite(p2): @workspace-welcome/db — drizzle schema (app tables), WAL client at XDG data dir, embedded migration runner, vite ssr-external for the native driver (validated)`

---

### Phase 3: JSON→DB migration of user state
**Type**: Sub-phased (3a → 3b → phase-wide validation)

#### 3a: store.json → DB (facade preserved)
**Requirements**:
- Rewrite `packages/api/src/lib/store.ts` internals: keep exports `readStore`, `mutateStore`, `readSettings`, `storePath` and the `StoreShape` contract EXACTLY (consumers in `routers/{roots,projects,settings,reports,ideation}.ts`, `lib/{known-project,scaffold,ideation/context}.ts` must not change).
- Path resolution becomes lazy functions (module-scope `CONFIG_DIR` const → function) so tests can redirect `XDG_CONFIG_HOME`/`XDG_DATA_HOME` at temp dirs before first call.
- `readStore()`: returns cached rows-as-StoreShape; on very first access runs the one-time importer if `app_meta.store_imported_at` is unset: if legacy `store.json` exists → parse with the EXISTING `migrate()`/`migrateIdeation()` normalizers (keep them) → insert roots (rows from `Root[]`), project overrides (all fields incl. `hidden`), settings singleton row (excludeGlobs + ideation as JSON columns) in ONE transaction → set marker with timestamp. Missing legacy file → just set the marker. Never throws on legacy parse failure — falls back to defaults + marker (log nothing to console; a `store_import` meta value records outcome).
- `mutateStore(fn)`: serialize through the existing in-flight chain, inside a drizzle transaction: read → build `StoreShape` draft → `fn(draft)` → reconcile (roots: delete-all+insert is NOT allowed — upsert by id, delete removed ids; overrides: upsert by path, delete paths absent from draft; settings: update row 1) → return the draft as `StoreShape` (memory cache semantics preserved).
- `readSettings()` unchanged signature.
- Keep the legacy file untouched forever (no rename, no delete).
- Add `packages/api` script `"test:store": "node --import tsx --test src/lib/store.import.test.ts"`; the test (node:test, zero new deps): sets `XDG_CONFIG_HOME`/`XDG_DATA_HOME` to `mkdtemp` dirs at test start, writes a fixture store.json (incl. an old-shape entry missing `hidden`, a malformed entry, ideation partial defaults), asserts: import → readStore round-trip equals normalized expectations; mutateStore pin toggle survives reopen (new "process" = fresh `getDb` on same file); second boot does NOT re-import (edit the JSON file, assert no effect).
- **CRITICAL test isolation**: tests must ONLY use temp dirs; the validator must verify no test ever reads/writes the real `~/.config/workspace-welcome/`.

**Inputs**: Read: Phase-2 db client/schema, current `lib/store.ts`.
**Outputs**: Modify: `packages/api/src/lib/store.ts`, `packages/api/package.json` (add `@workspace-welcome/db` workspace dep + test script). Create: `packages/api/src/lib/store.import.test.ts`.
**Validation**: `pnpm run check-types`, `pnpm run build`, `pnpm --filter @workspace-welcome/api test:store` PASS; consumers' imports unchanged; legacy file never written (test asserts mtime/content stable after mutations).

#### 3b: project-config JSONs → DB
**Requirements**:
- Rewrite `packages/api/src/lib/project-config.ts` internals to `project_configs` table, preserving `readProjectConfig`/`writeProjectConfig`/`emptyProjectConfig` signatures (sole consumer: `routers/artifacts.ts` — unchanged). Keep zod schema for input validation before insert; drop file-name machinery (`projectConfigFileName`) or keep exported only if still referenced (it is not — remove; `projectConfigPath` may go too after checking grep).
- One-time importer keyed by `app_meta.project_configs_imported_at`: scan legacy `projectsDir()` `*.json`, for each valid file (zod-parse; skip invalid) whose stored `path` matches nothing weird, insert/upsert row keyed by path. Files stay on disk.
- Extend the store import test file (or add `project-config.import.test.ts`) covering: import, read-default-when-missing, write-then-read round-trip, legacy-file-untouched.

**Outputs**: Modify: `packages/api/src/lib/project-config.ts`, `packages/api/package.json` (test script glob). Create: `packages/api/src/lib/project-config.import.test.ts`.
**Validation**: same gates + `test:store` still green; `routers/artifacts.ts` untouched.

**Phase-wide validation**: one validator reads store.ts + project-config.ts + both tests together: transactional import correctness (crash between marker and inserts impossible — same transaction), no behavioral drift for consumers, XDG isolation, no `any`, import order, `import type` discipline.
**Dependencies**: Phase 2.
**Commit**: `forge-sqlite(p3): user state into sqlite — store.json + per-project configs auto-imported losslessly on first boot (facade signatures intact, legacy files preserved); temp-XDG node:test coverage (validated)`

---

### Phase 4: Forge domain — adapter + sync service
**Type**: Sub-phased (4a → 4b → phase-wide validation)

#### 4a: Adapter interface + gh CLI adapter + fixtures + parser tests
**Requirements**:
- Create `packages/api/src/lib/forge/types.ts` exactly per §Interface sketch (imports `RemoteInfo` type from `../types`).
- `packages/api/src/lib/forge/parse.ts`: PURE functions `parseIssueListJson(raw: unknown): ForgeIssue[]` and `parsePullListJson(raw: unknown): ForgePull[]` — defensive `unknown` mapping (asRecord/asString/asNumber helpers local to the file, mirroring `lib/report-export.ts` style), uppercase `"OPEN"` states normalized, `author.login` unwrapped, `labels[].name` mapped, malformed rows skipped never thrown.
- `packages/api/src/lib/forge/gh-cli.ts`: the adapter (execFile pattern from `lib/git.ts` — `promisify(execFile)`, `timeout: 30_000`, `maxBuffer: 1MB`, never throws raw — wraps into `Error` with stderr excerpt). `fetchSnapshot` runs `gh issue list … --json number,title,state,author,labels,updatedAt,url,comments --state open --limit N` then (sequentially!) `gh pr list … --json number,title,state,author,isDraft,reviewDecision,labels,updatedAt,url --state open --limit N`. `isAvailable()` = `gh auth status` exit-code probe, cached in-module for 10 min. `matches(remote)` = `remote.host === "github"`.
- `packages/api/src/lib/forge/registry.ts`: `const adapters: ForgeAdapter[] = [ghCliAdapter]`; `resolveAdapter(remote): ForgeAdapter | null`.
- Fixtures: `packages/api/src/lib/forge/fixtures/issue-list.sample.json`, `pr-list.sample.json` (realistic gh shapes, ≥3 rows each incl. a draft PR, null-ish author edge, labels, uppercase states, `50-length` truncation case as a third tiny fixture or documented variant).
- Tests: `packages/api/src/lib/forge/parse.test.ts` (node:test, no I/O): fixture → parsed rows exact assertions; malformed rows skipped; truncation flag math. Package script `"test:forge": "node --import tsx --test src/lib/forge/*.test.ts"`.
- **NO live gh** — gh-cli.ts is only type-checked/built in this phase; its exec path is exercised via 4b's fake-adapter tests and the Phase-8 smoke.

**Outputs**: Create: `packages/api/src/lib/forge/{types,parse,gh-cli,registry}.ts`, `fixtures/{issue-list,pr-list}.sample.json`, `parse.test.ts`. Modify: `packages/api/package.json` (script).
**Validation**: `pnpm run check-types`, `pnpm run build`, `pnpm --filter @workspace-welcome/api test:forge` PASS; grep confirms no test spawns `gh`; registry contains ONLY the gh adapter.

#### 4b: Forge schema + resolver + sync service
**Requirements**:
- `packages/db/src/schema/forge.ts` (or extend `schema.ts` — keep one schema module if Phase 2 kept it single; follow the established layout): tables per §Data model; migration `0002_forge.ts` embedded via the Phase-2 runner; `db:selftest` extended to cover them.
- `packages/api/src/lib/forge/db.ts`: read/write helpers — `upsertRepoLink(projectPath, remote)` (resolve adapter; return null when no adapter matches), `readOverview(): ForgeOverviewEntry[]` (join links+repos+counts via `COUNT`), `readProjectSnapshot(projectPath)` (repo ref + open issues/pulls rows + fetchedAt + sync status), `replaceSnapshot(ref, snapshot)` (one transaction: update repo row's `last_synced_at/status/error`, delete the repo's issue+pull rows, insert fresh open sets).
- `packages/api/src/lib/forge/sync.ts`: `syncForgeRepo(projectPath, opts: { force?: boolean, now?: () => number, adapter?: ForgeAdapter })` — DI so tests pass a fake adapter. Semantics: `MIN_SYNC_INTERVAL_MS` refusal (throws `Error("synced X min ago — use force")`) unless `force`; in-flight Map dedupe by repo key + global sequential queue (a module-level promise chain — one adapter invocation process-wide); availability probe short-circuit; sequential issue→pull fetch; `replaceSnapshot`; returns `{ fetchedAt, openIssues, openPulls, truncated }`. All constants in `packages/api/src/lib/forge/constants.ts` (TTL 60 min, MIN_SYNC_INTERVAL 5 min, PAGE_LIMIT 50, CALL_TIMEOUT 30 s).
- Tests `sync.test.ts` (node:test, fake adapter recording call order): asserts sequential ordering (issues before pulls, never interleaved across two concurrent syncForgeRepo calls — queue proof), TTL/min-interval refusal + force bypass, dedupe (two concurrent calls → one fetch set), snapshot replace (rows from previous sync gone), failure path sets `last_sync_error` and throws.
- DB access in tests: temp-dir `XDG_DATA_HOME` like Phase 3 tests.

**Outputs**: Modify: `packages/db/src/schema.ts` (+ `src/migrations/0002_forge.ts`, `src/migrations/index.ts`, selftest), `packages/api/package.json` (test glob). Create: `packages/api/src/lib/forge/{constants,db,sync}.ts`, `sync.test.ts`.
**Validation**: check-types, build, `test:forge` (now includes sync tests) PASS; `db:selftest` covers forge tables; no live `gh` anywhere.

**Phase-wide validation**: read the whole `lib/forge/` + db schema together — interface coherence, no duplicated parsing, queue/dedupe/TTL actually wired through `sync.ts` (not bypassable via `db.ts`), NO gitea/gitlab stubs invented.
**Dependencies**: Phases 3a (db-backed store) and 4a; strictly after Phase 2.
**Commit**: `forge-sqlite(p4): forge domain — cli/api adapter contract, gh CLI adapter (fixture-tested), sqlite snapshot cache with TTL + global sequential queue + in-flight dedupe (validated)`

---

### Phase 5: tRPC forge router
**Type**: Sequential

**Requirements**:
- Create `packages/api/src/routers/forge.ts` (zod v4 inputs, one router, named procedures — repo convention is one router per file; the skill's "ONE query/mutation per file" rule yields to the repo's established router-file convention, keep each procedure small):
  - `overview` (query, no input): DB-only → `{ entries: Array<{ projectPath, repoRef: { kind, host, slug }, openIssues, openPulls, truncated: boolean, fetchedAt: string | null }> }`. NEVER fetches.
  - `project` (query, input `z.object({ path: z.string() })`): DB-only snapshot + mapping status (unknown | unsupported-host | ready) + `stale: boolean` (TTL vs `last_synced_at`).
  - `sync` (mutation, input `z.object({ path: z.string(), force: z.boolean().optional() })`): `requireKnownProject(path)` (`lib/known-project.ts`) → `syncForgeRepo` → returns the fresh summary. On success nothing else invalidated server-side (client invalidates).
- Register `forge: forgeRouter` in `packages/api/src/routers/index.ts`.
- Client typing flows via `AppRouter` inference — no type edits in web.

**Inputs**: Read: `packages/api/src/routers/projects.ts` (zod + helper idioms), `lib/known-project.ts`.
**Outputs**: Create: `packages/api/src/routers/forge.ts`. Modify: `packages/api/src/routers/index.ts`.
**Validation**: check-types, build; router registered; overview/project provably read-only (no sync import in their path); sync validates the path is a known project.
**Dependencies**: Phase 4.
**Commit**: `forge-sqlite(p5): forge tRPC surface — overview + project snapshot reads (DB-only), explicit sync mutation behind known-project guard (validated)`

---

### Phase 6: UI — open issue/PR counts on project lists
**Type**: Sequential

**Requirements**:
- `apps/web/src/lib/queries/forge.ts`: `useForgeOverviewQuery()` (staleTime 5 min, mirrors `lib/queries/scan.ts` idiom) + exported type for the entry map keyed by project path.
- `apps/web/src/components/parts/forge-chips.tsx`: part `ForgeChips({ project }: { project: Project })` — looks up the path in the overview data; renders `null` when absent; otherwise two `Chip`s (issues, pulls — tone `info`, `title` tooltip with count + fetched age via `lib/format.ts` `relativeTime`), `50+` styling when truncated. Register `ForgeChipsPart = definePart({ id: "forge-chips", component: ForgeChips })` in `components/parts/registry.ts`; export both from the parts barrel `components/parts/index.ts`.
- Wire into the project-list surfaces (each: import from the parts barrel, place adjacent to existing git/host chips): `components/themes/bento/widgets/project-tile.tsx` (BentoProjectTile), `components/themes/meadow/widgets/tile.tsx` (MeadowProjectTile), `components/themes/mission-control/widgets/fleet-ledger.tsx` (row slot), legacy `components/project-card.tsx`. Keep placements minimal — chips inherit theme tokens.
- Honest states only: no snapshot → no chips (no fake zeros).

**Inputs**: Read: `components/parts/led-project.tsx` (part-with-project-prop pattern), `components/parts/registry.ts`, `components/parts/index.ts`, the four consumer files, `lib/queries/scan.ts`.
**Outputs**: Create: `lib/queries/forge.ts`, `components/parts/forge-chips.tsx`. Modify: `components/parts/{registry.ts,index.ts}`, the four consumer files.
**Validation**: check-types, build, `pnpm run widget-check:grep` (invariants — color-literal/no-any scopes now include the new files), `pnpm run widget-check:validate-layout` (structure unaffected but must stay green). If a dev server is already serving on 37420: dashboard render spot-check; if not, do NOT start one — note and defer visual proof to Phase 8.
**Dependencies**: Phase 5.
**Commit**: `forge-sqlite(p6): forge counts on project lists — ForgeChips part over the overview query, wired into bento/meadow tiles, mc fleet ledger, legacy card (validated)`

---

### Phase 7: UI — project-page issues/PRs widget
**Type**: Sequential

**Requirements**:
- Create `apps/web/src/components/widgets/forge-board.tsx` exporting `ProjectForge({ node, size }: RegisteredWidgetProps)`: a CORE registry kind (theme-agnostic, built only from `@workspace-welcome/ui` components — Card/Chip/ScrollArea/Empty/Tabs + lucide icons), registered in `components/widgets/registry.ts` core map as `id: "project-forge"`, `title: "Issues & pull requests"`, `requires: ["project"]`, `defaultSize: "4x4"`, `min: "2x3"`, `hosts: ["forge-chips"]`.
- Data: `useProject()` for path + `project.git.remote`; `useForgeProjectQuery(path)` (add to `lib/queries/forge.ts`); Sync button → `useMutation(trpc.forge.sync.mutationOptions(...))` with busy state, then invalidates overview + project queries (the established invalidate pattern from `lib/contexts/project-context.tsx`).
- Render: header with counts (issues / pulls), fetched-age + stale hint, Sync button (disabled while pending; server min-interval message surfaces via the standard `onError → toast`); body = two tabs or one scrollable mixed list of open issues + PRs (title link via `url` target `_blank` `rel="noopener noreferrer"`, `#number`, author, draft badge for PRs, `isDraft`→"draft" chip, labels as plain text, relative age). Bounded rows (render what's cached; `50+` footer when truncated).
- Honest empty states (project-tile precedent): no remote → quiet "No git remote"; remote host unsupported → "GitHub only for now — <host> unsupported"; never synced → the Sync CTA. NEVER fake content.
- Preset placements (sizes on the size ladder; tablet/phone overrides mirroring neighbors; the drag board makes final placement an owner decision — note this in code comments): append one node to each theme's project canvas: `components/themes/bento/preset.ts` (`{ id: "project-forge", widget: "project-forge", size: "12x4", tablet: "6x4", phone: "2x6" }` — or a rail slot if it packs honestly), `components/themes/mission-control/preset.ts` (`4x4` / `8x2` / `4x4`), `components/themes/meadow/preset.ts` (rail `4x4`).
- `data-widget` id comes from the node id — no nav-tab retargeting needed (verify none of the existing nav tabs reference ids that shift).

**Inputs**: Read: `components/widgets/registry.ts`, `components/widgets/project-tile.tsx` (core-kind + empty-state pattern), `components/themes/bento/widgets/project-surface.tsx` (widget shape), the three preset files, `lib/contexts/project-context.tsx`, `lib/widget/validate-layout.ts`.
**Outputs**: Create: `components/widgets/forge-board.tsx`; Modify: `components/widgets/registry.ts`, the three `preset.ts` files, `lib/queries/forge.ts` (project query).
**Validation**: check-types, build, `widget-check:grep`, `widget-check:validate-layout` (the new node must resolve + `requires ⊆` project stack + sizes on ladder — this gate is the structural proof). If dev server already up: `pnpm run widget-check:theme -- --page project` per theme suite is strongly encouraged (density/placement probes); if no server, defer to Phase 8.
**Dependencies**: Phase 6.
**Commit**: `forge-sqlite(p7): project-page forge widget — core "project-forge" kind (issues/PRs board, sync button, honest empty states) placed on all three theme boards (validated)`

---

### Phase 8: Docs + packaging check + FINAL live smoke test
**Type**: Sequential. **This is the ONLY phase where live gh calls are permitted.**

**Requirements** (docs first, smoke last, release check after the phase commit):
1. `docs/adr/0006-sqlite-drizzle-persistence.md`: decision (packages/db, driver from harvest, XDG path not DATABASE_URL, embedded TS migrations because the release ships a bundled server, facade-preserving lossless import, what stays on files and why — reports cache, ideation sessions, scan cache).
2. `docs/adr/0007-forge-integration.md`: adapter contract (cli+api styles), gh-first, registry resolution via git remote, TTL/queue/dedupe anti-rate-limit design, explicit Gitea/GitLab extension path (settings-driven host map later; no stubs now), fixture-testing discipline + live-smoke budget.
3. `CONTEXT.md`: glossary entries — **Forge**, **Forge adapter**, **Snapshot** (open issues/PRs as of last sync), **Sync** (explicit, TTL/min-interval guarded), **Forge chips**.
4. `AGENTS.md`: monorepo table row for `packages/db`; Commands section additions (`pnpm --filter @workspace-welcome/db db:generate`, `db:selftest`, `pnpm --filter @workspace-welcome/api test:store` / `test:forge`); one line noting the DB file lives under the app's XDG data dir and legacy JSON files are import-only backups.
5. Release packaging check: read `scripts/release.sh` — verify the staging dir (post `pnpm --filter web deploy --prod`) will contain the driver binding (`node_modules/better-sqlite3` or libsql equivalent) and `drizzle-orm` in the pruned tree; extend the required-files assertion list (line ~169) with the driver package name ONLY if that is the established mechanism for such assertions (create-better-t-stack precedent). Then, AFTER the phase commit (release.sh requires a clean tree), run `pnpm run release --dry-run` and confirm the boot test passes with the DB present (it must create/open the DB in the container's XDG dirs). If `test:install --local` is feasible in this environment, run it; otherwise note it as an owner follow-up.
6. Full available gate matrix on the final tree: `pnpm run check-types`, `pnpm run build`, `widget-check:grep`, `widget-check:validate-layout`, plus (only if a dev server is already serving 37420 — do NOT start one) `widget-check:theme` across themes/pages, `widget-check:lab`, `widget-check:parts`, `widget-check:self-test`, `widget-check:sentinel`, `widget-check:settings`, `widget-check:interactions`. Note any skipped-with-reason.
7. **Live smoke test — EXACT budget (3 gh invocations total, once)**, target repo `DimitriGilbert/workspace-welcome` (this repo's own origin; a small repo):
   ```bash
   gh auth status > /tmp/smoke-auth.txt 2>&1                                    # call 1
   gh issue list -R DimitriGilbert/workspace-welcome --state open --limit 10 \
     --json number,title,state,author,labels,updatedAt,url,comments > /tmp/smoke-issues.json   # call 2
   gh pr list -R DimitriGilbert/workspace-welcome --state open --limit 10 \
     --json number,title,state,author,isDraft,reviewDecision,labels,updatedAt,url > /tmp/smoke-pulls.json  # call 3
   ```
   Then OFFLINE: run the pure parsers against the captured files (a one-shot tsx invocation importing `parse.ts`), compare with fixture expectations; if reality differs from fixtures, update fixtures + parser to accept BOTH shapes — iterating against the captured files, ZERO further gh calls. Optionally (still within budget — it reuses the same 3-call shape, do NOT exceed): exercise `forge.sync` once via the running dev server for this one repo. Record results in the phase report.
8. `widget-check:snapshot` pixel baselines: likely shifted by the new widget — do NOT re-record silently; flag to the owner (baselines are owner artifacts).

**Outputs**: Create: two ADRs. Modify: `CONTEXT.md`, `AGENTS.md`, possibly `scripts/release.sh`.
**Validation**: all gates green (or skipped-with-reason for server-dependent ones); smoke artifacts parsed successfully; release dry-run boots (or explicitly deferred with reason); docs accurate (validator cross-checks against shipped code).
**Dependencies**: Phase 7.
**Commit**: `forge-sqlite(p8): docs + packaging — ADR-0006/0007, glossary, AGENTS.md map; release dry-run over native driver; one-shot live smoke (3 gh calls) parse-verified (validated)`

---

### Phase 9 (OPTIONAL — owner decision, do not start without explicit go-ahead): Forge extras
Creative extras, clearly separated: settings "Forge" section listing mapped repos with per-repo sync + strictly-sequential "Sync all" (user-initiated, still TTL-guarded); PR review-decision badges; issue label filters; stale-PR alert rows in triage. Each sized separately before dispatch.

## Success criteria

- All phases validate (implementer → validator → fixer loops ≤3 attempts); every phase's `pnpm run check-types` + `pnpm run build` green; phase-specific scripts (`db:selftest`, `test:store`, `test:forge`) green.
- Store/project-config migration proven lossless via temp-XDG node:test suites; legacy JSON files untouched; consumer routers unmodified.
- Forge layer proven fixture-only during development; exactly 3 live gh invocations in the entire epic (Phase 8), captured and parsed offline.
- New UI: `ForgeChips` on bento/meadow/mc/legacy lists; `project-forge` widget on all three theme project boards; `validate-layout` green.

## Risk list (with mitigations)

1. **Native module SSR bundling** (better-sqlite3/libsql in TanStack Start/Vite): mitigated by `ssr.external` + `optimizeDeps.exclude` (exact precedent: `apps/web/vite.config.ts:14-24` for `create-better-t-stack`); Phase-2 gate `pnpm run build` proves it. Fallback if bundling still fights: `runtimeImport`-style lazy `require` inside client.ts.
2. **Release packaging drops the binding**: `pnpm --filter web deploy --prod` must carry the driver (web→api→db prod chain); Phase-8 dry-run boot test is the proof; required-files list extended per the existing mechanism. Per-platform tarballs are built on this linux-x64 host, so the prebuilt binding matches.
3. **First-boot import edge cases** (crash mid-import, concurrent dev-server+test importing the same real DB): importer is a single transaction + marker; tests only ever use temp XDG dirs (validator-enforced); single-process server assumption documented.
4. **Rate-limit accidental burn**: no auto-sync, no bulk sync, global sequential queue, TTL + min-interval, page caps, availability probe caching — all unit-tested with a fake adapter; live-call budget enforced by plan (fixers/validators NEVER run gh).
5. **gh fixture/reality drift**: smoke captures live output to files FIRST, then iterates offline; parser updated to accept both shapes.
6. **`gh` missing/unauthenticated on end-user machines**: availability probe + honest UI empty state ("gh not authenticated") — never a crash loop.
7. **Preset/layout gate fallout**: new nodes must satisfy `validate-layout` (registry resolvable, requires ⊆ stack, ladder sizes); pixel snapshot baselines intentionally flagged, not silently re-recorded.
8. **Version drift between harvest and catalog**: Phase-2 pins exactly what Phase 1 harvested; deviations must be justified in the harvest doc.
9. **Import direction db→api (xdg helper)**: prefer a local `dbDir()` in packages/db to keep db dependency-free (api depends on db, never the reverse).

## Live-API budget (the whole epic)

Exactly **3 gh invocations**, once, in Phase 8 step 7: `gh auth status`, one `gh issue list --limit 10`, one `gh pr list --limit 10` against `DimitriGilbert/workspace-welcome`. All outputs captured to files before parsing; any iteration reuses the captures. No other phase, implementer, validator, or fixer may execute `gh` or hit api.github.com. Gitea/GitLab: zero calls (no instances; no invented APIs).

## NO-SLOP + GH-protection boilerplate (orchestrator: paste into EVERY dispatch)

```text
NO-SLOP POLICY (MANDATORY):
- NO `any`, `as any`, `: any` ANYWHERE. NO placeholder code, NO `// TODO`, NO `// FIXME`.
- NO unused imports, NO unused variables. NO console.log hacks, NO void hacks.
- `import type` for type-only imports (verbatimModuleSyntax: true).
- Imports ordered: external/workspace packages first, one blank line, then local imports.
- Zod v4 for every tRPC input. Node-only: node:child_process + node:fs (promisify(execFile) — never execa).
- pnpm ONLY, from the repo root (/home/didi/workspace/workspace-welcome). NEVER touch another lockfile.
- Do NOT start, restart, or kill any dev server — one is assumed running.
- NO git stash / git reset --hard / git clean; no commits or pushes (the orchestrator commits).
- Only run scripts that exist in a package.json; report anything you couldn't run and why.
- Never hand-edit generated files (routeTree.gen.ts, drizzle-kit output under packages/db/drizzle/).

🚨 GITHUB-ACCOUNT PROTECTION (ABSOLUTE):
- ZERO live `gh` commands or GitHub API calls in your work. This includes "just checking" gh auth, issue, pr, api, or search — do NOT run them.
- All forge testing is fixture-based: sample gh JSON files under packages/api/src/lib/forge/fixtures/ + pure-parser node:test tests. Type-checking/building gh-cli.ts is fine; executing gh is not.
- (Phase 8 smoke-test dispatch ONLY: replace this block with the exact 3-command budget from the plan.)
```

---

**Orchestrator execution notes**: phases are strictly sequential 1→8 except the sub-phase flows inside 3 and 4 (sub-phase implementer → sub-phase validator each, then one phase-wide validator before the phase commit). Per the skill: dispatch implementers with the COMPLETE requirements section of their phase, validators must actually read the code line-by-line plus run the phase gates, fixers fix ALL validator findings at once. Dev-server-dependent gates are "run only if 127.0.0.1:37420 is already serving — otherwise record a skip reason and defer to Phase 8"; never start a server to satisfy a gate.
