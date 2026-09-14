import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { eq, notInArray } from "drizzle-orm";
import { appMeta, getDb, projectOverrides, roots, settings } from "@workspace-welcome/db";
import type { DbHandle } from "@workspace-welcome/db";

import { DEFAULT_RECONCILER_MODEL, DEFAULT_STEP_MODELS } from "./ideation/shared";
import type { ProjectOverrides, Root, Settings, StoreShape } from "./types";

/**
 * Persistence for roots, per-project overrides, and settings — SQLite via
 * `@workspace-welcome/db` (WAL file under the XDG data dir).
 *
 * The first read after boot runs a one-time importer: when the
 * `app_meta.store_imported_at` marker is unset, the legacy store.json under
 * the XDG config dir is parsed with the migrate()/migrateIdeation()
 * normalizers (kept verbatim — they are the compatibility contract) and
 * inserted together with the marker inside a single transaction, so a crash
 * can never split imported data from its marker. The legacy file is read at
 * most once and never written, renamed, or deleted — it stays as an untouched
 * backup; all writes go to the database.
 *
 * An in-memory StoreShape cache keeps reads cheap; it is invalidated whenever
 * the underlying DbHandle changes (a `closeDb()` + `getDb()` cycle), which is
 * how tests simulate a fresh process against the same file.
 */

const IMPORTED_AT_KEY = "store_imported_at";
const IMPORT_OUTCOME_KEY = "store_import";

/** Legacy config dir — resolved per call so tests can redirect XDG first. */
function storeDir(): string {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(configHome, "workspace-welcome");
}

/** Path to the legacy store file (exposed for tests / debugging). */
export function storePath(): string {
  return join(storeDir(), "store.json");
}

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

/** Parse a JSON column defensively; a malformed value yields undefined. */
function parseJsonValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** JSON string[] column → string[], skipping non-string entries. */
function parseJsonStrings(raw: string): string[] {
  const parsed = parseJsonValue(raw);
  return Array.isArray(parsed)
    ? parsed.filter((x): x is string => typeof x === "string")
    : [];
}

/** The settings singleton as a table row (id is pinned to 1 by a CHECK). */
function settingsRowValues(value: Settings) {
  return {
    id: 1,
    editorCommand: value.editorCommand,
    terminalCommand: value.terminalCommand,
    snitchPath: value.snitchPath,
    excludeGlobsJson: JSON.stringify(value.excludeGlobs),
    ideationJson: JSON.stringify(value.ideation),
  };
}

async function readMeta(handle: DbHandle, key: string): Promise<string | null> {
  const rows = await handle.db
    .select()
    .from(appMeta)
    .where(eq(appMeta.key, key));
  return rows[0]?.value ?? null;
}

/**
 * One-time legacy import. Runs only when `store_imported_at` is unset.
 * Legacy-file problems must never take the app down: a missing file records
 * outcome "missing" (marker only), an unparseable/unreadable one falls back
 * to defaults and records "fallback:<reason>" — both in `app_meta.store_import`,
 * with "ok" for a clean import. Database failures propagate (the marker stays
 * unset, so the next boot retries the import).
 */
async function importLegacyStore(handle: DbHandle): Promise<void> {
  let shape: StoreShape;
  let outcome: string;
  try {
    shape = migrate(JSON.parse(await readFile(storePath(), "utf8")));
    outcome = "ok";
  } catch (err) {
    shape = defaultStore();
    if (err instanceof SyntaxError) {
      outcome = "fallback:parse";
    } else {
      const code = (err as NodeJS.ErrnoException).code;
      outcome = code === "ENOENT" ? "missing" : `fallback:read:${code ?? "unknown"}`;
    }
  }

  await handle.db.transaction(async (tx) => {
    // A missing legacy file imports no data rows — the markers below record
    // that the (empty) start state is intentional.
    if (outcome !== "missing") {
      for (const root of shape.roots) {
        await tx
          .insert(roots)
          .values(root)
          .onConflictDoUpdate({
            target: roots.id,
            set: { path: root.path, label: root.label, addedAt: root.addedAt },
          });
      }
      for (const [path, value] of Object.entries(shape.projects)) {
        await tx
          .insert(projectOverrides)
          .values({ path, ...value })
          .onConflictDoUpdate({ target: projectOverrides.path, set: { ...value } });
      }
      const row = settingsRowValues(shape.settings);
      await tx
        .insert(settings)
        .values(row)
        .onConflictDoUpdate({ target: settings.id, set: row });
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

/** Load the full StoreShape from the database (defaults for absent rows). */
async function selectStore(handle: DbHandle): Promise<StoreShape> {
  const rootRows = await handle.db.select().from(roots).orderBy(roots.id);
  const overrideRows = await handle.db.select().from(projectOverrides);
  const settingRows = await handle.db
    .select()
    .from(settings)
    .where(eq(settings.id, 1));

  const projects: Record<string, ProjectOverrides> = {};
  for (const row of overrideRows) {
    projects[row.path] = {
      pinned: row.pinned,
      note: row.note,
      lastOpenedAt: row.lastOpenedAt,
      hidden: row.hidden,
    };
  }
  const row = settingRows[0];
  return {
    roots: rootRows.map((r) => ({
      id: r.id,
      path: r.path,
      label: r.label,
      addedAt: r.addedAt,
    })),
    projects,
    settings: row
      ? {
          editorCommand: row.editorCommand,
          terminalCommand: row.terminalCommand,
          snitchPath: row.snitchPath,
          excludeGlobs: parseJsonStrings(row.excludeGlobsJson),
          // Re-normalized on read so a malformed column can never poison settings.
          ideation: migrateIdeation(parseJsonValue(row.ideationJson)),
        }
      : { ...DEFAULT_SETTINGS },
  };
}

let memoryCache: StoreShape | null = null;
/** The handle memoryCache was loaded from — a reopened DB invalidates it. */
let cachedFrom: DbHandle | null = null;
/** Single-flight hydration: concurrent first reads import at most once. */
let hydration: { handle: DbHandle; promise: Promise<StoreShape> } | null = null;

async function hydrate(handle: DbHandle): Promise<StoreShape> {
  if ((await readMeta(handle, IMPORTED_AT_KEY)) === null) {
    await importLegacyStore(handle);
  }
  const shape = await selectStore(handle);
  memoryCache = shape;
  cachedFrom = handle;
  return shape;
}

/** Read the store, importing legacy data on first access. Result is cached. */
export async function readStore(): Promise<StoreShape> {
  const handle = await getDb();
  if (memoryCache && cachedFrom === handle) return memoryCache;
  const inflight = hydration?.handle === handle ? hydration.promise : null;
  if (inflight) return inflight;
  const promise = hydrate(handle);
  hydration = { handle, promise };
  try {
    return await promise;
  } finally {
    if (hydration?.promise === promise) hydration = null;
  }
}

/**
 * Apply a mutation to the store and persist it to the database.
 * Concurrent mutations are serialized by awaiting `inFlight`.
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

/**
 * Push the draft's state into the tables inside one transaction: roots are
 * upserted by id and removed ids deleted (never delete-all+insert), overrides
 * upserted by path with absent paths deleted, and the settings singleton
 * updated in place.
 */
async function reconcile(handle: DbHandle, draft: StoreShape): Promise<void> {
  await handle.db.transaction(async (tx) => {
    for (const root of draft.roots) {
      await tx
        .insert(roots)
        .values(root)
        .onConflictDoUpdate({
          target: roots.id,
          set: { path: root.path, label: root.label, addedAt: root.addedAt },
        });
    }
    // drizzle maps notInArray(col, []) to `true`: with no kept ids, every row
    // was removed from the draft and goes.
    const keepIds = draft.roots.map((root) => root.id);
    await tx.delete(roots).where(notInArray(roots.id, keepIds));

    for (const [path, value] of Object.entries(draft.projects)) {
      await tx
        .insert(projectOverrides)
        .values({ path, ...value })
        .onConflictDoUpdate({ target: projectOverrides.path, set: { ...value } });
    }
    const keepPaths = Object.keys(draft.projects);
    await tx
      .delete(projectOverrides)
      .where(notInArray(projectOverrides.path, keepPaths));

    const row = settingsRowValues(draft.settings);
    await tx
      .insert(settings)
      .values(row)
      .onConflictDoUpdate({ target: settings.id, set: row });
  });
}

/** Apply a mutation to the store and persist it transactionally. */
export async function mutateStore(
  fn: (draft: StoreShape) => void | Promise<void>,
): Promise<StoreShape> {
  return queueWrite(async () => {
    const handle = await getDb();
    const current = await readStore();
    // Shallow-clone containers so the mutation doesn't taint the previous cache.
    const draft: StoreShape = {
      roots: [...current.roots],
      projects: { ...current.projects },
      settings: { ...current.settings },
    };
    await fn(draft);
    await reconcile(handle, draft);
    memoryCache = draft;
    cachedFrom = handle;
    return draft;
  });
}

/** Convenience: read just the settings (with defaults applied). */
export async function readSettings(): Promise<Settings> {
  const store = await readStore();
  return store.settings;
}
