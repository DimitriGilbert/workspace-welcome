# ADR 0006 — SQLite persistence via Drizzle in a dedicated packages/db

Status: accepted (2026-09-14)

## Context

All user state — roots, per-project overrides, settings, per-project
artifact-folder configs — lived in JSON files (store.json under the XDG
config dir, one config file per project under the XDG data dir) written with
atomic tmp+rename. The stack this repo is generated from, Better-T-Stack
3.43.0, ships a first-class `packages/db` (sqlite + drizzle) shape; a
throwaway scaffold was harvested verbatim into
docs/research/2026-09-14-sqlite-harvest.md. The forge feature (ADR-0007)
also needs a relational cache.

## Decision

1. **New `packages/db` (`@workspace-welcome/db`)**, source-level consumed
   like the other workspace packages (no build step). `apps/web` never
   imports it — all access flows through `packages/api` over tRPC — which
   keeps the native binding away from browser-bundled code.
2. **Driver: `@libsql/client` 0.18.0 + `libsql` 0.5.29 over an embedded
   `file:` URL** — exactly what Better-T-Stack 3.43.0 generates (not
   better-sqlite3), with drizzle-orm 0.45.2 / drizzle-kit 0.31.10, all
   catalog-pinned to the harvested versions. The driver's async API was
   absorbed inside the store/project-config facades (both were already
   async — no consumer changed).
3. **DB file at `$XDG_DATA_HOME/workspace-welcome/workspace-welcome.db`** —
   no `DATABASE_URL` and none of the scaffold's varlock env machinery
   harvested (`packages/env` untouched); the path mirrors the existing
   `lib/xdg.ts` `dataDir()` (replicated locally so db stays
   dependency-free). WAL journal mode + 5 s busy timeout on open.
4. **Runtime migrations are embedded TS modules** (`src/migrations/*.ts`:
   SQL string statements, each applied with its `app_meta.schema_version`
   recording inside one transaction), because the release tarball ships a
   Vite-bundled server (`dist/server/server.js`) — a folder-based
   drizzle-kit `migrate()` would read paths that do not exist in
   production. `db:generate` (drizzle-kit) remains dev-time tooling: its
   output under `packages/db/drizzle/` is committed as the review/diff
   base for transcribing into the embedded modules (journal numbering runs
   one behind the embedded runtime ids).
5. **Facade-preserving, lossless one-time import.** `store.ts` and
   `project-config.ts` kept their exported signatures and became DB-backed.
   First access, when the `app_meta.store_imported_at` /
   `project_configs_imported_at` marker is unset, parses the legacy JSON
   with the existing normalizers/zod schemas and inserts rows together
   with the marker in a single transaction — a crash can never split
   imported data from its marker; a failed import leaves the marker unset
   and retries next boot; unparseable legacy input falls back to defaults
   with the outcome recorded in `app_meta`. The legacy JSON files are
   never written again — they stay on disk as untouched backups.
6. **What deliberately stays on files**: report HTML/JSON (disposable
   XDG-cache artifacts, deterministically re-creatable and served as one
   blob — a DB index would be a second source of truth for a cache);
   ideation sessions (they live in the project's `.ideadump/` by design —
   they travel with the repo and survive server restarts); the scan cache
   (in-memory fingerprints — persisting adds staleness risk for no
   rate-limit win).
7. **Deployment constraint discovered in the wild:** packages listed in
   vite `ssr.external` must be DIRECT dependencies of `apps/web`. pnpm's
   strict layout linked libsql only into `packages/db`, so the
   externalized `dist/server` imports threw `ERR_MODULE_NOT_FOUND` and the
   installed systemd service 500'd. Fix (commit d5a158b): declare
   `@libsql/client` + `libsql` (`catalog:`) in apps/web, mirroring the
   existing `create-better-t-stack` precedent (`apps/web/vite.config.ts`
   `ssr.external` + `optimizeDeps.exclude`). This also makes
   `pnpm deploy --prod` carry the binding in web's own closure;
   `scripts/release.sh` asserts both node_modules paths in the staging dir.

## Consequences

- Consumer routers kept their imports; a future schema change is a new
  embedded migration (append-only), not a consumer edit.
- Tests redirect `XDG_CONFIG_HOME`/`XDG_DATA_HOME` to temp dirs
  (`test:store`, `test:forge`, `db:selftest`) — nothing touches the real
  user dirs. Single-process server assumption (one WAL handle) applies.
- Release packaging must keep carrying the native binding — the release
  required-paths assertion covers it; the dry-run boot test is the proof.
