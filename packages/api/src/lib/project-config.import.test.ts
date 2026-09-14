import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { closeDb, dbFile, getDb } from "@workspace-welcome/db";

import {
  emptyProjectConfig,
  readProjectConfig,
  writeProjectConfig,
} from "./project-config";

/**
 * project-config JSON → DB import tests
 * (`pnpm --filter @workspace-welcome/api test:store`).
 *
 * Isolation: XDG_CONFIG_HOME/XDG_DATA_HOME point at mkdtemp dirs under
 * os.tmpdir() BEFORE any db/project-config call — the real user config/data
 * dirs are never read or written (asserted below, Phase-2 selftest-style).
 * The tests run sequentially (node:test's default) and share scenario "a"
 * state on purpose: import → write → reopen → no-reimport is one lifecycle.
 */

const TMP = mkdtempSync(join(tmpdir(), "ww-project-config-import-"));

/** Redirect both XDG vars at a fresh temp scenario and drop any open handle. */
function useScenario(name: string): void {
  process.env.XDG_CONFIG_HOME = join(TMP, name, "config");
  process.env.XDG_DATA_HOME = join(TMP, name, "data");
  closeDb();
}

/** The legacy per-project config dir under the current scenario. */
function legacyDir(): string {
  return join(
    process.env.XDG_DATA_HOME ?? TMP,
    "workspace-welcome",
    "projects",
  );
}

/** Guard: every path this process could touch stays under the temp sandbox. */
function assertIsolation(): void {
  assert.ok(TMP.startsWith(tmpdir()), `temp root escapes tmpdir: ${TMP}`);
  const resolvedDb = dbFile();
  const resolvedLegacy = legacyDir();
  assert.ok(
    resolvedDb.startsWith(TMP),
    `db path would leave the temp sandbox: ${resolvedDb}`,
  );
  assert.ok(
    resolvedLegacy.startsWith(TMP),
    `legacy dir would leave the temp sandbox: ${resolvedLegacy}`,
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

function seedLegacy(name: string, raw: string): void {
  const dir = legacyDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), raw, "utf8");
}

function legacyConfig(path: string, dirs: string[]): string {
  return JSON.stringify({ version: 1, path, artifacts: { dirs } });
}

/** Byte snapshot of every legacy file keyed by name — also proves the file
 * set itself never grows (this module must not write to the legacy dir). */
function legacySnapshot(): Record<string, string> {
  const snap: Record<string, string> = {};
  for (const name of readdirSync(legacyDir())) {
    snap[name] = readFileSync(join(legacyDir(), name), "utf8");
  }
  return snap;
}

const ALPHA = "/projects/alpha";
const DUP = "/projects/dup";

// Scenario "a": legacy per-project JSON files exist from a previous version.
test("first read imports valid legacy files, skips invalid ones, resolves duplicate paths deterministically", async () => {
  useScenario("a");
  assertIsolation();
  seedLegacy("alpha.json", legacyConfig(ALPHA, ["dist", "coverage"]));
  // Valid JSON, wrong schema (future `version`) — must be skipped, not throw.
  seedLegacy(
    "invalid.json",
    JSON.stringify({ version: 2, path: "/projects/bad", artifacts: { dirs: [] } }),
  );
  seedLegacy("dup-a.json", legacyConfig(DUP, ["from-dup-a"]));
  seedLegacy("dup-b.json", legacyConfig(DUP, ["from-dup-b"]));

  const alpha = await readProjectConfig(ALPHA);
  assert.deepEqual(alpha, {
    version: 1,
    path: ALPHA,
    artifacts: { dirs: ["dist", "coverage"] },
  });

  // Sorted file order applies dup-a.json before dup-b.json; the last upsert
  // wins, so the lexicographically later file's dirs are deterministic.
  assert.deepEqual(await readProjectConfig(DUP), {
    version: 1,
    path: DUP,
    artifacts: { dirs: ["from-dup-b"] },
  });

  // No row → the empty config, never the skipped file's content.
  assert.deepEqual(
    await readProjectConfig("/projects/bad"),
    emptyProjectConfig("/projects/bad"),
  );
  assert.deepEqual(
    await readProjectConfig("/projects/never-seen"),
    emptyProjectConfig("/projects/never-seen"),
  );

  assert.equal(await metaValue("project_configs_import"), "ok:3,skipped:1");
  const importedAt = await metaValue("project_configs_imported_at");
  assert.ok(importedAt !== null);
  assert.ok(
    !Number.isNaN(Date.parse(importedAt)),
    "marker is an ISO timestamp",
  );
});

test("write-then-read round-trip survives a reopen; legacy files stay byte-stable", async () => {
  assertIsolation();
  const before = legacySnapshot();

  // Overwrite an imported row and create a first-install row.
  await writeProjectConfig({
    version: 1,
    path: ALPHA,
    artifacts: { dirs: ["build", "artifacts"] },
  });
  await writeProjectConfig({
    version: 1,
    path: "/projects/new",
    artifacts: { dirs: ["out"] },
  });
  assert.deepEqual(await readProjectConfig(ALPHA), {
    version: 1,
    path: ALPHA,
    artifacts: { dirs: ["build", "artifacts"] },
  });

  // Fresh "process": closed handle, same db file — rows must survive.
  closeDb();
  await getDb();
  assert.deepEqual(await readProjectConfig(ALPHA), {
    version: 1,
    path: ALPHA,
    artifacts: { dirs: ["build", "artifacts"] },
  });
  assert.deepEqual(await readProjectConfig("/projects/new"), {
    version: 1,
    path: "/projects/new",
    artifacts: { dirs: ["out"] },
  });
  // Untouched by the writes.
  assert.deepEqual(await readProjectConfig(DUP), {
    version: 1,
    path: DUP,
    artifacts: { dirs: ["from-dup-b"] },
  });

  assert.deepEqual(legacySnapshot(), before);
});

test("a second boot never re-imports the legacy files", async () => {
  assertIsolation();
  const before = legacySnapshot();
  const alphaBytes = readFileSync(join(legacyDir(), "alpha.json"), "utf8");
  const importedAtBefore = await metaValue("project_configs_imported_at");

  // Tamper with the on-disk legacy files after the import already happened.
  writeFileSync(join(legacyDir(), "alpha.json"), legacyConfig(ALPHA, ["hacked"]), "utf8");
  seedLegacy("ghost.json", legacyConfig("/projects/ghost", ["boo"]));

  closeDb();
  await getDb();
  assert.deepEqual(await readProjectConfig(ALPHA), {
    version: 1,
    path: ALPHA,
    artifacts: { dirs: ["build", "artifacts"] },
  });
  assert.deepEqual(
    await readProjectConfig("/projects/ghost"),
    emptyProjectConfig("/projects/ghost"),
  );
  assert.equal(await metaValue("project_configs_imported_at"), importedAtBefore);
  assert.equal(await metaValue("project_configs_import"), "ok:3,skipped:1");

  // Restore so the legacy files remain untouched from here on.
  writeFileSync(join(legacyDir(), "alpha.json"), alphaBytes, "utf8");
  rmSync(join(legacyDir(), "ghost.json"), { force: true });
  assert.deepEqual(legacySnapshot(), before);
});

test("no legacy dir: empty configs, marker-only import, writes persist", async () => {
  useScenario("missing");
  assertIsolation();

  assert.deepEqual(
    await readProjectConfig("/projects/none"),
    emptyProjectConfig("/projects/none"),
  );
  assert.equal(await metaValue("project_configs_import"), "missing");
  const importedAt = await metaValue("project_configs_imported_at");
  assert.ok(importedAt !== null);
  assert.ok(
    !Number.isNaN(Date.parse(importedAt)),
    "marker is an ISO timestamp",
  );

  // First-install write path persists to the db and survives a reopen.
  await writeProjectConfig({
    version: 1,
    path: "/projects/fresh",
    artifacts: { dirs: ["media"] },
  });
  closeDb();
  await getDb();
  assert.deepEqual(await readProjectConfig("/projects/fresh"), {
    version: 1,
    path: "/projects/fresh",
    artifacts: { dirs: ["media"] },
  });
});

after(() => {
  closeDb();
  rmSync(TMP, { recursive: true, force: true });
});
