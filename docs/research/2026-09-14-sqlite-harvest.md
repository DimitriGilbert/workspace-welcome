# SQLite harvest reference — throwaway Better-T-Stack scaffold (2026-09-14)

Provenance: scaffolded in `/tmp/ww-db-ref` (throwaway; never inside this repo) with Better-T-Stack CLI
**3.43.0** (`bts.jsonc` `version`), pnpm 10.34.5, Node v24.21.0. Exact command:

```bash
pnpm create better-t-stack@latest ww-db-ref \
  --frontend tanstack-start --backend self --runtime none \
  --database sqlite --orm drizzle --api trpc --auth none --payments none \
  --addons turborepo --examples none --db-setup none \
  --web-deploy none --server-deploy none \
  --git --package-manager pnpm --install
```

Deviation from the suggested command: `--yes` was **removed**. CLI 3.43.0 rejects `--yes` combined
with core stack flags ("Cannot combine --yes with core stack configuration flags"); instead every
option is pinned explicitly — the same pattern this repo's own `bts.jsonc` `reproducibleCommand`
uses. Also added `--auth none --runtime none` (this repo's own stack has no auth; keeps the db
package free of auth tables) — the flag set otherwise mirrors this repo's original scaffold.

## 1. Generated dependency names + exact versions

From `/tmp/ww-db-ref/packages/db/package.json` (ranges) and `pnpm-lock.yaml` (resolved):

| Package | Declared in `packages/db/package.json` | Catalog (`pnpm-workspace.yaml`) | Resolved (lockfile) |
|---|---|---|---|
| `drizzle-orm` | `^0.45.2` (dependency, direct) | — | **0.45.2** |
| `drizzle-kit` | `^0.31.10` (devDependency) | — | **0.31.10** |
| `@libsql/client` (the sqlite driver) | `catalog:` | `0.18.0` (exact pin) | **0.18.0** |
| `libsql` (native core behind the client) | `catalog:` | `0.5.29` (exact pin) | **0.5.29** (+ `@libsql/linux-x64-gnu@0.5.29` prebuilt platform pkg) |
| `varlock` (env validation/codegen) | `catalog:` (devDependency) | `1.18.0` (exact pin) | **1.18.0** |
| `zod` | `catalog:` | `^4.5.4` | 4.6.5 |
| `typescript` | `catalog:` (devDependency) | `^6.0.3` | 6.0.3 |

Driver `@types`: **none needed and none generated** — `@libsql/client` ships its own TypeScript
declarations (`package.json` `"types": "lib-esm/node.d.ts"`, exposed via `exports`); there is no
`@types/libsql` / `@types/better-sqlite3` entry anywhere in the lockfile.

Supporting wiring (same files): `@ww-db-ref/config` `workspace:*` (devDep, tsconfig base);
`packages/api` depends on `@ww-db-ref/db` `workspace:*` (its only db touch); `apps/web` (self
backend — the app hosts the server) additionally declares `@libsql/client` + `libsql` `catalog:`
directly because the db client is constructed in `apps/web/src/services.ts`.

## 2. Verbatim `packages/db` tree + contents

Scaffold-generated file tree (complete):

```
packages/db/
├── .env.schema
├── .gitignore
├── drizzle.config.ts
├── package.json
├── src/
│   ├── config.ts
│   ├── env.ts          (varlock-generated, DO-NOT-EDIT header)
│   ├── index.ts        (the db client module)
│   ├── migrations/
│   │   └── .gitkeep    (0 bytes — dir pre-created empty)
│   └── schema/
│       └── index.ts
└── tsconfig.json
```

`packages/db/src/index.ts` — the db client module (factory, not a singleton):

```ts
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import type { DatabaseConfig } from "./config";
import * as schema from "./schema";

export function createDb(env: DatabaseConfig) {
  const client = createClient({
    url: env.DATABASE_URL,
  });

  return drizzle({ client, schema });
}

export type Database = ReturnType<typeof createDb>;
```

`packages/db/src/config.ts`:

```ts
export type DatabaseConfig = {
  DATABASE_URL: string;
};
```

`packages/db/src/schema/index.ts` — the generated schema is **empty**:

```ts
export {};
```

`packages/db/drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";
import "varlock/auto-load";

export default defineConfig({
  schema: "./src/schema",
  out: "./src/migrations",
  dialect: "turso",
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
});
```

`packages/db/package.json` (full — scripts included):

```json
{
  "name": "@ww-db-ref/db",
  "type": "module",
  "exports": {
    ".": {
      "default": "./src/index.ts"
    },
    "./*": {
      "default": "./src/*.ts"
    }
  },
  "scripts": {
    "check-types": "tsc --noEmit",
    "db:local": "turso dev --db-file local.db",
    "db:push": "drizzle-kit push",
    "db:generate": "drizzle-kit generate",
    "db:migrate:deploy": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "db:migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "@libsql/client": "catalog:",
    "drizzle-orm": "^0.45.2",
    "libsql": "catalog:",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@ww-db-ref/config": "workspace:*",
    "drizzle-kit": "^0.31.10",
    "typescript": "catalog:",
    "varlock": "catalog:"
  }
}
```

`packages/db/tsconfig.json`:

```json
{
  "extends": "@ww-db-ref/config/tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  }
}
```

### Migrations layout

**The scaffold itself generates no migrations** — the schema is empty and no `drizzle-kit generate`
run happened at scaffold time. `src/migrations/` exists but is empty at scaffold time (pre-created
with only a 0-byte `.gitkeep`) — BTS promotes `db:push` and generates no migration content; the
promoted workflow in the generated README is schema-push (`pnpm run db:push`), with
`db:generate`/`db:migrate` provided as scripts. (This is why `out: "./src/migrations"` — not the
classic `drizzle/` folder.)

To capture the migrations layout with the exact harvested toolchain, the scaffold's own
`drizzle-kit@0.31.10` binary was run once in a separate probe dir `/tmp/ww-db-ref-migrate-probe`
(verbatim `drizzle.config.ts` above, sample schema mirroring our Phase-2 tables:
`app_meta`, `roots`, `project_overrides` with `integer({ mode: "boolean" })` columns and a
`text().notNull().unique()`). Output — **probe output, not BTS scaffold output**:

```
src/migrations/
├── 0000_crazy_logan.sql          (name = counter + generated slug)
└── meta/
    ├── 0000_snapshot.json        (drizzle schema snapshot)
    └── _journal.json             (migration journal)
```

`src/migrations/0000_crazy_logan.sql` (full):

```sql
CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_overrides` (
	`path` text PRIMARY KEY NOT NULL,
	`pinned` integer NOT NULL,
	`note` text NOT NULL,
	`last_opened_at` text,
	`hidden` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `roots` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`label` text NOT NULL,
	`added_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roots_path_unique` ON `roots` (`path`);
```

`src/migrations/meta/_journal.json` (full):

```json
{
  "version": "7",
  "dialect": "sqlite",
  "entries": [
    {
      "idx": 0,
      "version": "6",
      "when": 1789372751801,
      "tag": "0000_crazy_logan",
      "breakpoints": true
    }
  ]
}
```

`src/migrations/meta/0000_snapshot.json` (full):

```json
{
  "version": "6",
  "dialect": "sqlite",
  "id": "16427d9a-a85a-4dae-8c79-ea51b0f97ec6",
  "prevId": "00000000-0000-0000-0000-000000000000",
  "tables": {
    "app_meta": {
      "name": "app_meta",
      "columns": {
        "key": { "name": "key", "type": "text", "primaryKey": true, "notNull": true, "autoincrement": false },
        "value": { "name": "value", "type": "text", "primaryKey": false, "notNull": true, "autoincrement": false }
      },
      "indexes": {}, "foreignKeys": {}, "compositePrimaryKeys": {}, "uniqueConstraints": {}, "checkConstraints": {}
    },
    "project_overrides": {
      "name": "project_overrides",
      "columns": {
        "path": { "name": "path", "type": "text", "primaryKey": true, "notNull": true, "autoincrement": false },
        "pinned": { "name": "pinned", "type": "integer", "primaryKey": false, "notNull": true, "autoincrement": false },
        "note": { "name": "note", "type": "text", "primaryKey": false, "notNull": true, "autoincrement": false },
        "last_opened_at": { "name": "last_opened_at", "type": "text", "primaryKey": false, "notNull": false, "autoincrement": false },
        "hidden": { "name": "hidden", "type": "integer", "primaryKey": false, "notNull": true, "autoincrement": false }
      },
      "indexes": {}, "foreignKeys": {}, "compositePrimaryKeys": {}, "uniqueConstraints": {}, "checkConstraints": {}
    },
    "roots": {
      "name": "roots",
      "columns": {
        "id": { "name": "id", "type": "text", "primaryKey": true, "notNull": true, "autoincrement": false },
        "path": { "name": "path", "type": "text", "primaryKey": false, "notNull": true, "autoincrement": false },
        "label": { "name": "label", "type": "text", "primaryKey": false, "notNull": true, "autoincrement": false },
        "added_at": { "name": "added_at", "type": "text", "primaryKey": false, "notNull": true, "autoincrement": false }
      },
      "indexes": {
        "roots_path_unique": { "name": "roots_path_unique", "columns": ["path"], "isUnique": true }
      },
      "foreignKeys": {}, "compositePrimaryKeys": {}, "uniqueConstraints": {}, "checkConstraints": {}
    }
  },
  "views": {},
  "enums": {},
  "_meta": { "schemas": {}, "tables": {}, "columns": {} },
  "internal": { "indexes": {} }
}
```

(The snapshot above is reformatted onto single lines per column for readability; keys, values, and
structure are verbatim. The `.sql` and `_journal.json` are byte-verbatim.)

Note for Phase 2: the generated `apps/web/vite.config.ts` (self backend) contains **no**
`ssr.external` / `optimizeDeps.exclude` entries for `libsql`/`@libsql/client` — BTS ships no special
vite wiring for the native driver.

## 3. Env wiring (`DATABASE_URL`) — **the deviation point**

BTS 3.43 wires env through **varlock** (not an env package like this repo's `packages/env`):

- `apps/web/.env` contains exactly: `DATABASE_URL=file:../../local.db` — a relative `file:` URL
  resolved from the app dir to the monorepo root.
- `packages/db/.env.schema` (full):

  ```
  # @import(../../apps/web/, pick=[NODE_ENV, DATABASE_*])
  # @generateTsTypes(path=./src/env.ts, exposeEnv=local)
  # ---
  ```

- `apps/web/.env.schema` declares `NODE_ENV` (enum, public) and `DATABASE_URL`
  (`@type=string(minLength=1)`, sensitive).
- Root `package.json` runs `varlock codegen` on `postinstall` and via `env:generate` for both
  `apps/web/` and `packages/db/`; the generated `packages/db/src/env.ts` is a `@ts-nocheck`
  DO-NOT-EDIT module exporting a typed `ENV` proxy (`Readonly<{ NODE_ENV …; DATABASE_URL: string }>`,
  `DATABASE_URL` marked sensitive).
- Consumption chain: `apps/web/src/env.server.ts` (`export { ENV as env } from "./env"`) →
  `apps/web/src/services.ts` (`const db = createDb(env)` module singleton + `getDb()` accessor) →
  handed to tRPC via `packages/api/src/context.ts` (`Context.db: Database`; type-only import from
  `@ww-db-ref/db`). `drizzle.config.ts` reads `process.env.DATABASE_URL || ""` after
  `import "varlock/auto-load"` (env auto-loading for the CLI).
- `db:local` (`turso dev --db-file local.db`) is optional tooling for a local Turso server; a
  `file:` URL does NOT need it (embedded — see §4).

**Deviation point (plan Decision 4):** workspace-welcome will NOT harvest any of this env
machinery. The db file lives at `$XDG_DATA_HOME/workspace-welcome/workspace-welcome.db` via the
existing `lib/xdg.ts` `dataDir()`; no `DATABASE_URL`, no varlock, `packages/env` untouched. The
generated `createDb(env: DatabaseConfig)` factory shape makes this trivial — keep the factory,
feed it `{ DATABASE_URL: "file:" + <absolute XDG path> }` (or an explicit path parameter).
Everything else in §2 (client, schema, drizzle.config, migrations layout) is harvestable as-is.

## 4. The driver BTS chose — locked decision

**Better-T-Stack 3.43.0 generates `@libsql/client` 0.18.0 backed by `libsql` 0.5.29 (Turso's
libsql). It does NOT use `better-sqlite3`** — the string `better-sqlite3` does appear in
`pnpm-lock.yaml` (4 occurrences), but only inside `drizzle-orm@0.45.2`'s optional
`peerDependencies`/`peerDependenciesMeta`; no `better-sqlite3` package is resolved or installed
(`node_modules` has none). The drizzle adapter is `drizzle-orm/libsql`
(`drizzle({ client, schema })`), and `drizzle.config.ts` uses `dialect: "turso"` (journal/snapshot
still record `dialect: "sqlite"`; emitted DDL is plain SQLite).

Per plan Decision 2 ("if it generates `@libsql/client` with a `file:` URL, use that"), the
downstream choice is locked: **`@libsql/client` with an embedded `file:` URL**.

Verification performed on this host (Node 24.21.0, linux-x64, using the scaffold's own installed
packages — probe script in `/tmp/ww-db-ref-migrate-probe/driver-smoke.mjs`):

- `createClient({ url: "file:<abs path>.db" })` opens the database embedded — **no turso server
  needed** (`db:local` is optional).
- `PRAGMA journal_mode = WAL` executes and persists (readback `"wal"`) — the WAL plan for Phase 2
  works with this driver.
- Parameterized round-trip (`execute({ sql: "… WHERE k = ?", args: […] })`) returns rows correctly.
- Native binding ships as the prebuilt `@libsql/linux-x64-gnu@0.5.29` platform package — matches
  this release host's platform (relevant to release tarball packaging).
- Caveat for Phase 2: `@libsql/client`'s API is async (promises), unlike better-sqlite3's sync API
  — the sync `readStore`/`mutateStore` facade in `packages/api/src/lib/store.ts` will need
  awaited client calls underneath.
