import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";

import {
  DEFAULT_RECONCILER_MODEL,
  DEFAULT_STEP_MODELS,
} from "./ideation/shared";
import type { ProjectOverrides, Root, Settings, StoreShape } from "./types";

/**
 * On-disk persistence for roots, per-project overrides, and settings.
 *
 * No database — a single JSON file under the user config directory, written
 * atomically (temp file + rename) so a crash mid-write can't corrupt state.
 */

const CONFIG_DIR = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
const STORE_DIR = join(CONFIG_DIR, "workspace-welcome");
const STORE_PATH = join(STORE_DIR, "store.json");

const DEFAULT_SETTINGS: Settings = {
  editorCommand: "code",
  terminalCommand: null,
  snitchPath: null,
  excludeGlobs: [],
  ideation: {
    models: {
      questions: [...DEFAULT_STEP_MODELS.questions],
      prd: [...DEFAULT_STEP_MODELS.prd],
      plan: [...DEFAULT_STEP_MODELS.plan],
    },
    reconciler: DEFAULT_RECONCILER_MODEL,
  },
};

function defaultStore(): StoreShape {
  return { roots: [], projects: {}, settings: { ...DEFAULT_SETTINGS } };
}

/** Migrate partial / older shapes to the current StoreShape. */
function migrate(raw: unknown): StoreShape {
  const base = defaultStore();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Partial<StoreShape>;

  if (Array.isArray(obj.roots)) {
    base.roots = obj.roots.filter(isRoot);
  }
  if (obj.projects && typeof obj.projects === "object") {
    base.projects = {};
    for (const [key, value] of Object.entries(obj.projects)) {
      if (isOverrides(value)) {
        base.projects[key] = {
          pinned: value.pinned,
          note: value.note,
          lastOpenedAt: value.lastOpenedAt,
          // Newer field; default for entries written before it existed.
          hidden: value.hidden ?? false,
        };
      }
    }
  }
  if (obj.settings && typeof obj.settings === "object") {
    base.settings = {
      editorCommand:
        typeof obj.settings.editorCommand === "string" &&
        obj.settings.editorCommand.length > 0
          ? obj.settings.editorCommand
          : DEFAULT_SETTINGS.editorCommand,
      terminalCommand:
        typeof obj.settings.terminalCommand === "string"
          ? obj.settings.terminalCommand
          : null,
      snitchPath:
        typeof obj.settings.snitchPath === "string"
          ? obj.settings.snitchPath
          : null,
      excludeGlobs: Array.isArray(obj.settings.excludeGlobs)
        ? obj.settings.excludeGlobs.filter((x) => typeof x === "string")
        : [],
      ideation: migrateIdeation(obj.settings.ideation),
    };
  }
  return base;
}

/**
 * Settings migration for the ideation block: stores written before the
 * block existed have no `ideation` key at all, and any missing or malformed
 * field falls back to its default so the block is always complete after
 * migrate().
 */
function migrateIdeation(raw: unknown): Settings["ideation"] {
  const block =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const models =
    block.models && typeof block.models === "object"
      ? (block.models as Record<string, unknown>)
      : {};
  const list = (value: unknown, fallback: readonly string[]): string[] => {
    const entries = Array.isArray(value)
      ? value.filter(
          (entry): entry is string =>
            typeof entry === "string" && entry.length > 0,
        )
      : [];
    return entries.length > 0 ? entries : [...fallback];
  };
  return {
    models: {
      questions: list(models.questions, DEFAULT_STEP_MODELS.questions),
      prd: list(models.prd, DEFAULT_STEP_MODELS.prd),
      plan: list(models.plan, DEFAULT_STEP_MODELS.plan),
    },
    reconciler:
      typeof block.reconciler === "string" && block.reconciler.length > 0
        ? block.reconciler
        : DEFAULT_RECONCILER_MODEL,
  };
}

function isRoot(x: unknown): x is Root {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.path === "string" &&
    typeof r.label === "string" &&
    typeof r.addedAt === "string"
  );
}

function isOverrides(x: unknown): x is ProjectOverrides {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.pinned === "boolean" &&
    typeof o.note === "string" &&
    (o.lastOpenedAt === null || typeof o.lastOpenedAt === "string") &&
    // `hidden` is optional on older entries — default to false downstream.
    (o.hidden === undefined || typeof o.hidden === "boolean")
  );
}

let memoryCache: StoreShape | null = null;

async function ensureDir(): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true });
}

/** Read the store, creating defaults on first run. Result is cached in memory. */
export async function readStore(): Promise<StoreShape> {
  if (memoryCache) return memoryCache;

  try {
    const raw = await readFile(STORE_PATH, "utf8");
    memoryCache = migrate(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    memoryCache = defaultStore();
  }
  return memoryCache;
}

/** Path to the store file (exposed for tests / debugging). */
export const storePath = STORE_PATH;

/**
 * Atomically write the store. Updates the in-memory cache on success.
 * Concurrent writes are serialized by awaiting `inFlight`.
 */
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

async function persistRaw(store: StoreShape): Promise<void> {
  await ensureDir();
  const tmp = join(STORE_DIR, `.store.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  try {
    await rename(tmp, STORE_PATH);
  } catch (err) {
    // rename can fail across devices in some setups; fall back to copy+unlink.
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") {
      await unlink(tmp).catch(() => undefined);
      throw err;
    }
    const contents = await readFile(tmp, "utf8");
    await writeFile(STORE_PATH, contents, "utf8");
    await unlink(tmp).catch(() => undefined);
  }
}

/** Apply a mutation to the store and persist atomically. */
export async function mutateStore(
  fn: (draft: StoreShape) => void,
): Promise<StoreShape> {
  return queueWrite(async () => {
    const current = await readStore();
    // Shallow-clone containers so the mutation doesn't taint the previous cache.
    const draft: StoreShape = {
      roots: [...current.roots],
      projects: { ...current.projects },
      settings: { ...current.settings },
    };
    fn(draft);
    await persistRaw(draft);
    memoryCache = draft;
    return draft;
  });
}

/** Convenience: read just the settings (with defaults applied). */
export async function readSettings(): Promise<Settings> {
  const store = await readStore();
  return store.settings;
}
