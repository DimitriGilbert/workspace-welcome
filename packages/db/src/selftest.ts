import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq } from "drizzle-orm";

import { openDb } from "./client";
import { migrations } from "./migrations";
import { appMeta, forgeIssues, forgeProjectLinks, forgePulls, forgeRepos } from "./schema";

/**
 * Standalone selftest (`pnpm --filter @workspace-welcome/db db:selftest`):
 * opens a throwaway database under os.tmpdir() — never the real XDG data dir —
 * applies the embedded migrations, asserts the expected tables exist,
 * round-trips a row through the drizzle handle, and proves the forge FK
 * cascades fire. Prints PASS on success.
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
] as const;

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "ww-db-selftest-"));
  const file = join(dir, "selftest.db");
  // Isolation guard: this process must only ever touch a temp path.
  if (!file.startsWith(tmpdir())) {
    throw new Error(`selftest db path escapes tmpdir: ${file}`);
  }

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
  } finally {
    client.close();
    rmSync(dir, { recursive: true, force: true });
  }

  console.log("PASS");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
