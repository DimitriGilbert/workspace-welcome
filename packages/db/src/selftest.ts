import { createClient } from "@libsql/client";
import { spawn } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { and, eq } from "drizzle-orm";

import { closeDb, dbFile, getDb, openDb } from "./client";
import { applyMigration } from "./migrate";
import { migrations } from "./migrations";
import {
  appMeta,
  forgeFeedItems,
  forgeIssues,
  forgeProjectLinks,
  forgePulls,
  forgeRepos,
} from "./schema";

/**
 * Standalone selftest (`pnpm --filter @workspace-welcome/db db:selftest`):
 * opens a throwaway database under os.tmpdir() — never the real XDG data dir —
 * applies the embedded migrations, asserts the expected tables exist,
 * round-trips a row through the drizzle handle, proves the forge FK cascades
 * fire, and round-trips the user-feed table's composite PK. Also pins the
 * client/migration hardening: two opens racing over one fresh file, openDb's
 * failure/recovery on a read-only file, and the closeDb-during-open
 * generation guard (XDG_DATA_HOME pinned to the sandbox for that one).
 * Every scenario stays inside its own mkdtemp sandbox. Prints PASS on
 * success.
 */

const EXPECTED_TABLES = [
  "app_meta",
  "roots",
  "project_overrides",
  "settings",
  "project_configs",
  "forge_repos",
  "forge_project_links",
  "forge_issues",
  "forge_pulls",
  "forge_feed_items",
] as const;

/** Isolation guard: every db path this selftest touches must live in its sandbox. */
function assertInsideTempSandbox(
  path: string,
  root: string,
  label: string,
): void {
  if (!path.startsWith(root)) {
    throw new Error(`${label} escapes its temp sandbox: ${path}`);
  }
}

/** Core scenario: migrations, tables, drizzle round-trip, FK cascades, feed PK. */
async function coreScenario(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "ww-db-selftest-"));
  const file = join(dir, "selftest.db");
  assertInsideTempSandbox(file, dir, "core selftest db");

  const { db, client } = await openDb(file);
  try {
    // Every expected table exists after the embedded migrations ran.
    const master = await client.execute(
      "SELECT `name` FROM `sqlite_master` WHERE `type` = 'table' AND `name` NOT LIKE 'sqlite_%'",
    );
    const present = new Set<string>();
    for (const row of master.rows) {
      const name = row.name;
      if (typeof name === "string") present.add(name);
    }
    for (const table of EXPECTED_TABLES) {
      if (!present.has(table)) {
        throw new Error(`missing table after migrations: ${table}`);
      }
    }

    // The runner recorded the newest embedded migration as schema_version.
    const latest = migrations.at(-1);
    const versionRows = await db
      .select()
      .from(appMeta)
      .where(eq(appMeta.key, "schema_version"));
    const recorded = versionRows[0]?.value;
    if (latest === undefined || recorded !== latest.id) {
      throw new Error(
        `schema_version = ${String(recorded)}, expected ${latest?.id}`,
      );
    }

    // Insert/select round-trip on app_meta through the drizzle handle.
    await db
      .insert(appMeta)
      .values({ key: "selftest_roundtrip", value: "ok" })
      .onConflictDoUpdate({
        target: appMeta.key,
        set: { value: "ok" },
      });
    const roundtrip = await db
      .select()
      .from(appMeta)
      .where(eq(appMeta.key, "selftest_roundtrip"));
    const value = roundtrip[0]?.value;
    if (value !== "ok") {
      throw new Error(`app_meta round-trip failed: ${String(value)}`);
    }

    // Forge FK cascade: deleting a repo row must take its link + issue + pull
    // rows with it (libsql enforces foreign_keys — this proves the DDL).
    const repoRows = await db
      .insert(forgeRepos)
      .values({ kind: "github", host: "github.com", slug: "selftest/repo" })
      .returning({ id: forgeRepos.id });
    const repoId = repoRows[0]?.id;
    if (repoId === undefined) {
      throw new Error("forge_repos insert returned no id");
    }
    await db.insert(forgeProjectLinks).values({
      projectPath: "/tmp/selftest-project",
      repoId,
      remoteUrl: "https://github.com/selftest/repo.git",
    });
    await db.insert(forgeIssues).values({
      repoId,
      number: 1,
      title: "cascade me",
      state: "open",
      author: null,
      labelsJson: "[]",
      commentCount: 0,
      updatedAt: null,
      url: "https://github.com/selftest/repo/issues/1",
    });
    await db.insert(forgePulls).values({
      repoId,
      number: 2,
      title: "cascade me too",
      state: "open",
      author: null,
      isDraft: false,
      reviewDecision: null,
      labelsJson: "[]",
      updatedAt: null,
      url: "https://github.com/selftest/repo/pull/2",
    });
    await db.delete(forgeRepos).where(eq(forgeRepos.id, repoId));
    const cascaded = [
      { table: "forge_project_links", rows: await db.select().from(forgeProjectLinks).where(eq(forgeProjectLinks.repoId, repoId)) },
      { table: "forge_issues", rows: await db.select().from(forgeIssues).where(eq(forgeIssues.repoId, repoId)) },
      { table: "forge_pulls", rows: await db.select().from(forgePulls).where(eq(forgePulls.repoId, repoId)) },
    ];
    for (const { table, rows } of cascaded) {
      if (rows.length > 0) {
        throw new Error(
          `FK cascade failed: ${table} rows survived their forge_repos delete`,
        );
      }
    }

    // User-feed table: composite PK (kind, repo_slug, number) round-trip. The
    // feed has NO forge_repos FK by design — rows may name repos no workspace
    // project maps to, so the insert below deliberately uses an unmapped slug.
    await db.insert(forgeFeedItems).values([
      {
        kind: "pr",
        repoSlug: "anyone/unmapped-repo",
        number: 5,
        title: "Feed PK round-trip (draft)",
        url: "https://github.com/anyone/unmapped-repo/pull/5",
        updatedAt: "2026-09-14T08:00:00Z",
        labelsJson: JSON.stringify(["bug", "feed"]),
        isDraft: true,
      },
      {
        // Same repo_slug + number, different kind: both must coexist — the
        // kind column is part of the key.
        kind: "issue",
        repoSlug: "anyone/unmapped-repo",
        number: 5,
        title: "Feed PK round-trip (issue twin)",
        url: "https://github.com/anyone/unmapped-repo/issues/5",
        updatedAt: null,
        labelsJson: "[]",
        isDraft: false,
      },
    ]);
    const feedPr = await db
      .select()
      .from(forgeFeedItems)
      .where(
        and(
          eq(forgeFeedItems.kind, "pr"),
          eq(forgeFeedItems.repoSlug, "anyone/unmapped-repo"),
          eq(forgeFeedItems.number, 5),
        ),
      );
    const feedPrRow = feedPr[0];
    if (
      feedPrRow === undefined ||
      feedPrRow.isDraft !== true ||
      feedPrRow.title !== "Feed PK round-trip (draft)" ||
      feedPrRow.updatedAt !== "2026-09-14T08:00:00Z"
    ) {
      throw new Error(
        `forge_feed_items PK round-trip failed: ${JSON.stringify(feedPrRow)}`,
      );
    }
    const issueTwin = await db
      .select()
      .from(forgeFeedItems)
      .where(
        and(
          eq(forgeFeedItems.kind, "issue"),
          eq(forgeFeedItems.repoSlug, "anyone/unmapped-repo"),
          eq(forgeFeedItems.number, 5),
        ),
      );
    if (issueTwin.length !== 1 || issueTwin[0]?.updatedAt !== null) {
      throw new Error(
        `forge_feed_items kind-component of PK failed: ${JSON.stringify(issueTwin)}`,
      );
    }
    // An exact PK duplicate is rejected by the composite key.
    let duplicateRejected = false;
    try {
      await db.insert(forgeFeedItems).values({
        kind: "pr",
        repoSlug: "anyone/unmapped-repo",
        number: 5,
        title: "duplicate",
        url: "https://github.com/anyone/unmapped-repo/pull/5",
        updatedAt: null,
        labelsJson: "[]",
        isDraft: false,
      });
    } catch {
      duplicateRejected = true;
    }
    if (!duplicateRejected) {
      throw new Error(
        "forge_feed_items accepted a duplicate (kind, repo_slug, number) row",
      );
    }
  } finally {
    client.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Concurrent cold-open pin (verified-report-1 F1): two opens racing over one
 * fresh file must both settle — the loser's BEGIN IMMEDIATE blocks behind
 * the winner's commit, re-reads the recorded version inside the transaction,
 * and skips instead of dying on "table already exists".
 *
 * The race is staged across two child node processes, because in one process
 * it cannot pass even on fixed code: the driver's BEGIN IMMEDIATE is a
 * synchronous native statement whose busy handler blocks the event loop, so
 * an in-process loser freezes the winner mid-transaction and times out with
 * SQLITE_BUSY. The file's journal mode is switched to WAL up front for the
 * same reason: a journal-mode change is one of the few sqlite lock paths the
 * busy timeout does not cover, so two racing `PRAGMA journal_mode = WAL`
 * steps can spuriously BUSY (a pre-existing openDb quirk, orthogonal to the
 * migration race being pinned here).
 */
const CHILD_OPEN_SCRIPT = `
const { pathToFileURL } = require("node:url");
import(pathToFileURL(process.argv[1]).href).then((m) => m.openDb(process.argv[2])).then((handle) => {
  handle.client.close();
  console.log("ok");
}).catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
`;

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const clientModule = fileURLToPath(new URL("./client.ts", import.meta.url));

/** Cold-open `file` in a child node process; resolves its stdout, rejects with its stderr. */
function openDbInChild(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--eval", CHILD_OPEN_SCRIPT, clientModule, file],
      { cwd: packageRoot, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error: Error) => {
      reject(new Error(`child openDb could not start: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(
          new Error(`child openDb failed (exit ${String(code)}): ${stderr.trim()}`),
        );
      }
    });
  });
}

/**
 * Concurrent migration pin: the cross-process cold-start race settles, and
 * the guarded branch itself is pinned deterministically — replaying the
 * first migration through applyMigration after a completed cold open must
 * re-read the recorded version inside the write transaction and skip
 * cleanly (pre-fix: SQLITE_ERROR "table `project_configs` already exists").
 */
async function concurrentOpenScenario(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "ww-db-selftest-race-"));
  const file = join(dir, "race.db");
  assertInsideTempSandbox(file, dir, "concurrent-migration db");
  try {
    // Pre-establish WAL only — every migration stays pending (F1's scenario).
    const prep = createClient({ url: `file:${file}`, timeout: 5000 });
    try {
      await prep.execute("PRAGMA journal_mode = WAL");
    } finally {
      prep.close();
    }
    const settled = await Promise.all([openDbInChild(file), openDbInChild(file)]);
    for (const output of settled) {
      if (output !== "ok") {
        throw new Error(`child openDb settled unexpectedly: ${output}`);
      }
    }

    const latest = migrations.at(-1);
    const first = migrations.at(0);
    if (latest === undefined || first === undefined) {
      throw new Error("migrations array is empty");
    }
    const handle = await openDb(file);
    try {
      await applyMigration(handle.client, first);
      const rows = await handle.db
        .select()
        .from(appMeta)
        .where(eq(appMeta.key, "schema_version"));
      const recorded = rows[0]?.value;
      if (recorded !== latest.id) {
        throw new Error(
          `skipped applyMigration rewrote schema_version = ${String(recorded)}, expected ${latest.id}`,
        );
      }
    } finally {
      handle.client.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * openDb failure/recovery pin (verified-report-1 F3): a read-only db file
 * passes the driver's read probe inside createClient and then fails the
 * open's first write (the WAL PRAGMA / bootstrap DDL) — deterministically
 * exercising the failure path after client creation. openDb must reject AND
 * close the client, so restoring write permission lets the very same file
 * open cleanly with no live lock or handle left behind.
 */
async function openFailureScenario(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "ww-db-selftest-readonly-"));
  const file = join(dir, "readonly.db");
  assertInsideTempSandbox(file, dir, "read-only-failure db");
  try {
    writeFileSync(file, "");
    chmodSync(file, 0o444);
    let rejected = false;
    try {
      await openDb(file);
    } catch {
      rejected = true;
    }
    if (!rejected) {
      throw new Error("openDb succeeded against a read-only db file");
    }
    chmodSync(file, 0o644);
    const handle = await openDb(file);
    handle.client.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Generation pin (verified-report-1 F2): closeDb() during an in-flight open
 * must not resurrect or leak the singleton. The stale open rejects with its
 * handle closed; the getDb() issued right after the close (while the stale
 * open is still in flight) resolves to a working handle on the CURRENT temp
 * path even when XDG_DATA_HOME was redirected between the open and the close
 * — exactly the test-isolation mechanism closeDb exists to provide; and a
 * normal close/reopen cycle round-trips. XDG_DATA_HOME is pinned to temp
 * sandboxes and restored after.
 *
 * In-process contention note: a stale open and a fresh open may only be in
 * flight together when they target DIFFERENT files — two same-process cold
 * opens of one file contend at BEGIN IMMEDIATE, where the driver's
 * synchronous busy handler freezes the event loop (see the concurrent-open
 * scenario). Hence the redirect construction below.
 */
async function generationScenario(): Promise<void> {
  const rootA = mkdtempSync(join(tmpdir(), "ww-db-selftest-generation-a-"));
  const rootB = mkdtempSync(join(tmpdir(), "ww-db-selftest-generation-b-"));
  const previousDataHome = process.env.XDG_DATA_HOME;
  const latest = migrations.at(-1);
  if (latest === undefined) {
    throw new Error("migrations array is empty");
  }
  try {
    process.env.XDG_DATA_HOME = rootA;
    assertInsideTempSandbox(dbFile(), rootA, "XDG_DATA_HOME dbFile()");

    // closeDb during an in-flight open, stale open running alone: the stale
    // promise must reject — its handle closed, never installed.
    const stale = getDb();
    closeDb();
    let staleRejected = false;
    try {
      await stale;
    } catch {
      staleRejected = true;
    }
    if (!staleRejected) {
      throw new Error("stale getDb() resolved after closeDb() — resurrection");
    }

    // Redirect between the open and the close: the fresh getDb() issued
    // immediately after closeDb() must open the CURRENT path (rootB) while
    // the stale rootA open is still in flight — never resurrect it.
    const staleA = getDb();
    closeDb();
    process.env.XDG_DATA_HOME = rootB;
    const freshB = getDb();
    let staleARejected = false;
    try {
      await staleA;
    } catch {
      staleARejected = true;
    }
    if (!staleARejected) {
      throw new Error("redirected stale getDb() resolved after closeDb()");
    }
    const handle = await freshB;
    assertInsideTempSandbox(handle.file, rootB, "post-close getDb() handle");
    const recorded = await handle.db
      .select()
      .from(appMeta)
      .where(eq(appMeta.key, "schema_version"));
    if (recorded[0]?.value !== latest.id) {
      throw new Error(
        `post-close getDb() is not a working handle (schema_version = ${String(recorded[0]?.value)})`,
      );
    }
    closeDb();

    // Normal cycle: close, then reopen — a distinct, working handle.
    const reopened = await getDb();
    if (reopened === handle) {
      throw new Error("getDb() returned the handle closed by closeDb()");
    }
    assertInsideTempSandbox(reopened.file, rootB, "reopened getDb() handle");
    const reopenedVersion = await reopened.db
      .select()
      .from(appMeta)
      .where(eq(appMeta.key, "schema_version"));
    if (reopenedVersion[0]?.value !== latest.id) {
      throw new Error("reopened getDb() lost the recorded schema_version");
    }
    closeDb();
  } finally {
    closeDb();
    if (previousDataHome === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = previousDataHome;
    }
    rmSync(rootA, { recursive: true, force: true });
    rmSync(rootB, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await coreScenario();
  await concurrentOpenScenario();
  await openFailureScenario();
  await generationScenario();
  console.log("PASS");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
