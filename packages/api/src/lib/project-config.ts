import { createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { dataDir } from "./xdg";

/**
 * Per-project settings, one JSON file per project under the app data dir:
 * `$XDG_DATA_HOME/workspace-welcome/projects/`. Deliberately a file per
 * project rather than a block in store.json — these settings are per-project
 * and grow independently of the store, and a stray file can be deleted
 * without touching anything else. The file name is derived deterministically
 * from the project path, and the path is also stored inside and verified on
 * read, so a hand-moved file can never be served to the wrong project.
 */

const PROJECTS_DIR_NAME = "projects";

/** Current config shape; bump `version` and migrate when it changes. */
export const projectConfigSchema = z.object({
  version: z.literal(1),
  /** Absolute project path the file belongs to — must match the file name. */
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

/**
 * Deterministic file name for a project path: a readable slug of the path
 * plus a short hash, so names stay recognizable while different projects can
 * never collide even after the slug is truncated.
 */
export function projectConfigFileName(projectPath: string): string {
  const slug = projectPath
    .split("/")
    .filter((segment) => segment !== "")
    .join("-")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .slice(0, 64);
  const hash = createHash("sha256").update(projectPath).digest("hex").slice(0, 12);
  return `${slug}-${hash}.json`;
}

function projectsDir(): string {
  return join(dataDir(), PROJECTS_DIR_NAME);
}

/** Absolute path of a project's config file (exposed for tests / debugging). */
export function projectConfigPath(projectPath: string): string {
  return join(projectsDir(), projectConfigFileName(projectPath));
}

/**
 * Read a project's config; a missing file yields the empty config. A file
 * whose stored path doesn't match the project is treated as absent rather
 * than served to the wrong project. A corrupt file throws — silently
 * discarding user settings would be worse.
 */
export async function readProjectConfig(
  projectPath: string,
): Promise<ProjectConfig> {
  let raw: string;
  try {
    raw = await readFile(projectConfigPath(projectPath), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyProjectConfig(projectPath);
    }
    throw err;
  }
  const parsed = projectConfigSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(
      `Project config ${projectConfigFileName(projectPath)} is unreadable: ${parsed.error.message}`,
    );
  }
  if (parsed.data.path !== projectPath) {
    return emptyProjectConfig(projectPath);
  }
  return parsed.data;
}

// Same single-writer discipline as store.ts: concurrent config writes are
// serialized in-process so temp-file names can't collide.
let inFlight: Promise<unknown> = Promise.resolve();

function queueWrite<T>(next: () => Promise<T>): Promise<T> {
  const run = inFlight.then(next, next) as Promise<T>;
  // Keep the chain alive without surfacing rejections to subsequent writes.
  inFlight = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Atomically write a project's config (temp file + rename, store.ts style). */
export async function writeProjectConfig(config: ProjectConfig): Promise<void> {
  return queueWrite(async () => {
    const shape = projectConfigSchema.parse(config);
    const dir = projectsDir();
    await mkdir(dir, { recursive: true });
    const target = join(dir, projectConfigFileName(shape.path));
    const tmp = join(dir, `.config.${process.pid}.${Date.now()}.tmp`);
    await writeFile(tmp, JSON.stringify(shape, null, 2), "utf8");
    try {
      await rename(tmp, target);
    } catch (err) {
      // rename can fail across devices in some setups; fall back to copy+unlink.
      if ((err as NodeJS.ErrnoException).code !== "EXDEV") {
        await unlink(tmp).catch(() => undefined);
        throw err;
      }
      const contents = await readFile(tmp, "utf8");
      await writeFile(target, contents, "utf8");
      await unlink(tmp).catch(() => undefined);
    }
  });
}
