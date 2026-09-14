import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { closeDb, dbFile, getDb } from "@workspace-welcome/db";

import { DEFAULT_RECONCILER_MODEL, DEFAULT_STEP_MODELS } from "./ideation/shared";
import { mutateStore, readSettings, readStore, storePath } from "./store";

/**
 * store.json → DB import tests (`pnpm --filter @workspace-welcome/api test:store`).
 *
 * Isolation: XDG_CONFIG_HOME/XDG_DATA_HOME point at mkdtemp dirs under
 * os.tmpdir() BEFORE any db/store call — the real user config/data dirs are
 * never read or written (asserted below, Phase-2 selftest-style). The tests
 * run sequentially (node:test's default) and share scenario "a" state on
 * purpose: import → mutate → reopen → no-reimport is one lifecycle.
 */

const TMP = mkdtempSync(join(tmpdir(), "ww-store-import-"));

/** Redirect both XDG vars at a fresh temp scenario and drop any open handle. */
function useScenario(name: string): void {
  process.env.XDG_CONFIG_HOME = join(TMP, name, "config");
  process.env.XDG_DATA_HOME = join(TMP, name, "data");
  closeDb();
}

/** Guard: every path this process could touch stays under the temp sandbox. */
function assertIsolation(): void {
  assert.ok(TMP.startsWith(tmpdir()), `temp root escapes tmpdir: ${TMP}`);
  const resolvedStore = storePath();
  const resolvedDb = dbFile();
  assert.ok(
    resolvedStore.startsWith(TMP),
    `store path would leave the temp sandbox: ${resolvedStore}`,
  );
  assert.ok(
    resolvedDb.startsWith(TMP),
    `db path would leave the temp sandbox: ${resolvedDb}`,
  );
}

async function metaValue(key: string): Promise<string | null> {
  const { client } = await getDb();
  const result = await client.execute({
    sql: "SELECT `value` FROM `app_meta` WHERE `key` = ?",
    args: [key],
  });
  const value = result.rows[0]?.value;
  return typeof value === "string" ? value : null;
}

function writeLegacy(raw: string): void {
  const file = storePath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, raw, "utf8");
}

const LEGACY_FIXTURE = JSON.stringify({
  roots: [
    {
      id: "root-oss",
      path: "/projects/oss",
      label: "oss",
      addedAt: "2026-01-05T09:00:00.000Z",
    },
    {
      id: "root-work",
      path: "/projects/work",
      label: "work",
      addedAt: "2026-02-10T12:30:00.000Z",
    },
    // Malformed root (non-string id) — the normalizer must skip it.
    {
      id: 42,
      path: "/projects/bad",
      label: "bad",
      addedAt: "2026-03-01T00:00:00.000Z",
    },
  ],
  projects: {
    // Old shape, written before `hidden` existed — defaults to false.
    "/projects/work/alpha": {
      pinned: true,
      note: "alpha note",
      lastOpenedAt: "2026-03-01T10:00:00.000Z",
    },
    "/projects/work/beta": {
      pinned: false,
      note: "",
      lastOpenedAt: null,
      hidden: true,
    },
    // Malformed overrides (pinned not boolean) — skipped.
    "/projects/work/garbage": { pinned: "yes", note: 7 },
  },
  settings: {
    editorCommand: "cursor",
    terminalCommand: "kitty",
    snitchPath: "/opt/gitsnitch.js",
    excludeGlobs: ["dist", 42, "target"], // non-strings filtered out
    ideation: { models: { questions: ["zai/custom-q"] } }, // partial → defaults
  },
});

const EXPECTED_ROOTS = [
  {
    id: "root-oss",
    path: "/projects/oss",
    label: "oss",
    addedAt: "2026-01-05T09:00:00.000Z",
  },
  {
    id: "root-work",
    path: "/projects/work",
    label: "work",
    addedAt: "2026-02-10T12:30:00.000Z",
  },
];

const ALPHA_OVERRIDES = {
  pinned: true,
  note: "alpha note",
  lastOpenedAt: "2026-03-01T10:00:00.000Z",
  hidden: false,
};

const BETA_OVERRIDES = {
  pinned: false,
  note: "",
  lastOpenedAt: null,
  hidden: true,
};

const EXPECTED_SETTINGS = {
  editorCommand: "cursor",
  terminalCommand: "kitty",
  snitchPath: "/opt/gitsnitch.js",
  excludeGlobs: ["dist", "target"],
  ideation: {
    models: {
      questions: ["zai/custom-q"],
      prd: [...DEFAULT_STEP_MODELS.prd],
      plan: [...DEFAULT_STEP_MODELS.plan],
    },
    reconciler: DEFAULT_RECONCILER_MODEL,
  },
};

const EXPECTED_DEFAULT_SETTINGS = {
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

// Scenario "a": a real legacy store exists from a previous version.
useScenario("a");
let firstImportedAt: string | null = null;

test("first read imports the legacy store.json losslessly", async () => {
  assertIsolation();
  writeLegacy(LEGACY_FIXTURE);

  const store = await readStore();
  assert.deepEqual(store.roots, EXPECTED_ROOTS);
  assert.deepEqual(store.projects, {
    "/projects/work/alpha": ALPHA_OVERRIDES,
    "/projects/work/beta": BETA_OVERRIDES,
  });
  assert.deepEqual(store.settings, EXPECTED_SETTINGS);
  assert.deepEqual(await readSettings(), EXPECTED_SETTINGS);

  assert.equal(await metaValue("store_import"), "ok");
  firstImportedAt = await metaValue("store_imported_at");
  assert.ok(firstImportedAt !== null);
  assert.ok(
    !Number.isNaN(Date.parse(firstImportedAt)),
    "marker is an ISO timestamp",
  );
});

test("mutations survive a simulated fresh process; legacy file stays byte-stable", async () => {
  assertIsolation();
  const legacyBefore = readFileSync(storePath(), "utf8");

  const before = await readStore();
  assert.equal(before.projects["/projects/work/alpha"]?.pinned, true);

  const toggled = await mutateStore((draft) => {
    const entry = draft.projects["/projects/work/alpha"];
    assert.ok(entry, "alpha imported");
    entry.pinned = false;
  });
  assert.equal(toggled.projects["/projects/work/alpha"]?.pinned, false);
  // In-memory cache stays coherent within the process.
  assert.equal(
    (await readStore()).projects["/projects/work/alpha"]?.pinned,
    false,
  );

  // Fresh "process": closed handle, same db file — the cache must not mask it.
  closeDb();
  await getDb();
  const reopened = await readStore();
  assert.deepEqual(reopened.roots, EXPECTED_ROOTS);
  assert.deepEqual(reopened.projects, {
    "/projects/work/alpha": { ...ALPHA_OVERRIDES, pinned: false },
    "/projects/work/beta": BETA_OVERRIDES,
  });
  assert.deepEqual(reopened.settings, EXPECTED_SETTINGS);

  assert.equal(readFileSync(storePath(), "utf8"), legacyBefore);
});

test("a second boot never re-imports the legacy file", async () => {
  assertIsolation();
  const legacyBefore = readFileSync(storePath(), "utf8");

  // Tamper with the on-disk legacy file after the import already happened.
  writeLegacy(
    JSON.stringify({
      roots: [
        {
          id: "root-ghost",
          path: "/ghost",
          label: "ghost",
          addedAt: "2026-09-14T00:00:00.000Z",
        },
      ],
      projects: {
        "/ghost/spooky": { pinned: true, note: "boo", lastOpenedAt: null, hidden: false },
      },
      settings: { editorCommand: "vim" },
    }),
  );

  closeDb();
  await getDb();
  const store = await readStore();
  assert.deepEqual(store.roots, EXPECTED_ROOTS);
  assert.equal(store.projects["/ghost/spooky"], undefined);
  assert.equal(store.settings.editorCommand, "cursor");
  assert.equal(await metaValue("store_imported_at"), firstImportedAt);
  assert.equal(await metaValue("store_import"), "ok");

  // Restore so the legacy file remains untouched from here on.
  writeLegacy(legacyBefore);
});

test("no legacy file: empty defaults, marker set, writes persist", async () => {
  useScenario("empty");
  assertIsolation();

  const store = await readStore();
  assert.deepEqual(store, {
    roots: [],
    projects: {},
    settings: EXPECTED_DEFAULT_SETTINGS,
  });
  assert.equal(await metaValue("store_import"), "missing");
  const importedAt = await metaValue("store_imported_at");
  assert.ok(importedAt !== null);
  assert.ok(
    !Number.isNaN(Date.parse(importedAt)),
    "marker is an ISO timestamp",
  );

  // First-install write path: mutating the empty store persists to the db.
  const freshRoot = {
    id: "root-fresh",
    path: "/projects/fresh",
    label: "fresh",
    addedAt: "2026-09-14T08:00:00.000Z",
  };
  await mutateStore((draft) => {
    draft.roots.push(freshRoot);
  });
  closeDb();
  await getDb();
  const reopened = await readStore();
  assert.deepEqual(reopened.roots, [freshRoot]);
  assert.deepEqual(reopened.settings, EXPECTED_DEFAULT_SETTINGS);
});

test("unparseable legacy file: defaults + fallback outcome, never throws", async () => {
  useScenario("fallback");
  assertIsolation();
  writeLegacy("{ not json");

  const store = await readStore();
  assert.deepEqual(store, {
    roots: [],
    projects: {},
    settings: EXPECTED_DEFAULT_SETTINGS,
  });
  const outcome = await metaValue("store_import");
  assert.ok(
    outcome !== null && outcome.startsWith("fallback:"),
    `expected a fallback outcome, got: ${String(outcome)}`,
  );
});

after(() => {
  closeDb();
  rmSync(TMP, { recursive: true, force: true });
});
