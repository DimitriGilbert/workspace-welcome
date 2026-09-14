import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { appMeta, getDb, projectConfigs } from "@workspace-welcome/db";
import type { DbHandle } from "@workspace-welcome/db";
import { z } from "zod";

import { dataDir } from "./xdg";

/**
 * Per-project artifact-folder settings, persisted as one row per project in
 * the `project_configs` table (path primary key) via `@workspace-welcome/db`.
 *
 * The first read/write after boot runs a one-time importer: when the
 * `app_meta.project_configs_imported_at` marker is unset, every `*.json`
 * under the legacy `$XDG_DATA_HOME/workspace-welcome/projects/` directory is
 * parsed with the zod schema below and upserted together with the marker
 * inside a single transaction, so a crash can never split imported rows from
 * their marker. Legacy files are read at most once and never written,
 * renamed, or deleted — they stay as untouched backups forever; this module
 * has no write path to them. The old file-name↔stored-path integrity check
 * is subsumed by the primary key: a row can only ever belong to its path.
 */

const IMPORTED_AT_KEY = "project_configs_imported_at";
const IMPORT_OUTCOME_KEY = "project_configs_import";

const PROJECTS_DIR_NAME = "projects";

/** Legacy per-project config dir — resolved per call so tests can redirect XDG first. */
function projectsDir(): string {
  return join(dataDir(), PROJECTS_DIR_NAME);
}

/** Current config shape; bump `version` and migrate when it changes. */
export const projectConfigSchema = z.object({
  version: z.literal(1),
  /** Absolute project path this config belongs to (the DB row key). */
  path: z.string(),
  artifacts: z.object({
    /** Project-relative folders that hold build/test media. */
    dirs: z.array(z.string()),
  }),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;

/** The config a project effectively has before anything was ever saved. */
export function emptyProjectConfig(projectPath: string): ProjectConfig {
  return { version: 1, path: projectPath, artifacts: { dirs: [] } };
}

/** JSON string[] column → string[], skipping non-string entries. */
function parseJsonStrings(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

async function readMeta(handle: DbHandle, key: string): Promise<string | null> {
  const rows = await handle.db
    .select()
    .from(appMeta)
    .where(eq(appMeta.key, key));
  return rows[0]?.value ?? null;
}

/**
 * One-time legacy import. Runs only when `project_configs_imported_at` is
 * unset. Legacy-file problems must never take the app down: a missing
 * directory records outcome "missing" (marker only, no rows), files that
 * fail to read, parse, or validate are skipped silently and counted — the
 * outcome becomes "ok:<imported>,skipped:<n>" — and an unreadable directory
 * imports nothing and records "fallback:read:<code>"; outcomes land in
 * `app_meta.project_configs_import`, with plain "ok" for a clean sweep.
 * Files are processed in sorted name order, so when two legacy files carry
 * the same stored `path` the lexicographically last one wins (deterministic
 * upsert-last-wins). Database failures propagate (the marker stays unset, so
 * the next boot retries the import).
 */
async function importLegacyProjectConfigs(handle: DbHandle): Promise<void> {
  const imported: ProjectConfig[] = [];
  let skipped = 0;
  let outcome: string;
  try {
    const dir = projectsDir();
    const names = (await readdir(dir))
      .filter((name) => name.endsWith(".json"))
      .sort();
    for (const name of names) {
      try {
        const parsed = projectConfigSchema.safeParse(
          JSON.parse(await readFile(join(dir, name), "utf8")),
        );
        if (parsed.success) {
          imported.push(parsed.data);
        } else {
          skipped += 1;
        }
      } catch {
        // Unreadable or unparseable legacy file — skip it silently.
        skipped += 1;
      }
    }
    outcome = skipped > 0 ? `ok:${imported.length},skipped:${skipped}` : "ok";
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    outcome =
      code === "ENOENT" ? "missing" : `fallback:read:${code ?? "unknown"}`;
  }

  await handle.db.transaction(async (tx) => {
    for (const config of imported) {
      await tx
        .insert(projectConfigs)
        .values({
          path: config.path,
          artifactDirsJson: JSON.stringify(config.artifacts.dirs),
        })
        .onConflictDoUpdate({
          target: projectConfigs.path,
          set: { artifactDirsJson: JSON.stringify(config.artifacts.dirs) },
        });
    }
    await tx
      .insert(appMeta)
      .values({ key: IMPORTED_AT_KEY, value: new Date().toISOString() })
      .onConflictDoNothing();
    await tx
      .insert(appMeta)
      .values({ key: IMPORT_OUTCOME_KEY, value: outcome })
      .onConflictDoNothing();
  });
}

/** The handle the one-time import already ran on — a reopened DB re-checks. */
let importedOn: DbHandle | null = null;
/** Single-flight: concurrent first accesses import at most once. */
let importing: { handle: DbHandle; promise: Promise<void> } | null = null;

async function ensureImported(handle: DbHandle): Promise<void> {
  if (importedOn === handle) return;
  if (importing?.handle === handle) return importing.promise;
  const promise = (async () => {
    if ((await readMeta(handle, IMPORTED_AT_KEY)) === null) {
      await importLegacyProjectConfigs(handle);
    }
    importedOn = handle;
  })();
  importing = { handle, promise };
  try {
    await promise;
  } finally {
    if (importing?.promise === promise) importing = null;
  }
}

/**
 * Read a project's config from the database; no row yields the empty config.
 * A malformed `artifact_dirs_json` column degrades to no folders rather than
 * throwing.
 */
export async function readProjectConfig(
  projectPath: string,
): Promise<ProjectConfig> {
  const handle = await getDb();
  await ensureImported(handle);
  const rows = await handle.db
    .select()
    .from(projectConfigs)
    .where(eq(projectConfigs.path, projectPath));
  const row = rows[0];
  if (row === undefined) return emptyProjectConfig(projectPath);
  return {
    version: 1,
    path: row.path,
    artifacts: { dirs: parseJsonStrings(row.artifactDirsJson) },
  };
}

/**
 * Validate and upsert a project's config row (its own write path — never
 * routed through the store's mutateStore). A single upsert statement is
 * atomic on its own, so no in-process write queue is needed. The one-time
 * import runs first when due, so a fresh write can never be clobbered by a
 * later legacy import of the same path.
 */
export async function writeProjectConfig(config: ProjectConfig): Promise<void> {
  const shape = projectConfigSchema.parse(config);
  const handle = await getDb();
  await ensureImported(handle);
  await handle.db
    .insert(projectConfigs)
    .values({
      path: shape.path,
      artifactDirsJson: JSON.stringify(shape.artifacts.dirs),
    })
    .onConflictDoUpdate({
      target: projectConfigs.path,
      set: { artifactDirsJson: JSON.stringify(shape.artifacts.dirs) },
    });
}
