import type { Client } from "@libsql/client";

import { migrations } from "./migrations";
import type { AppMigration } from "./migrations";

/**
 * Embedded migration runner. SQL lives in `src/migrations/*.ts` (the runtime
 * source of truth); this module bootstraps `app_meta`, then applies every
 * unapplied migration — each one's statements plus its version recording
 * inside a single transaction, so a crash can never leave a migration half
 * applied or applied-but-unrecorded.
 */

const SCHEMA_VERSION_KEY = "schema_version";

/** Version recorded before any migration has run; sorts below every id. */
const BOOTSTRAP_VERSION = "0000";

// Identical DDL to `app_meta` in schema.ts (and to drizzle-kit's generated
// 0000 SQL). IF NOT EXISTS makes the bootstrap idempotent; the app_meta
// CREATE is owned by this runner, not by any migration statement.
const BOOTSTRAP_APP_META =
  "CREATE TABLE IF NOT EXISTS `app_meta` (`key` text PRIMARY KEY NOT NULL, `value` text NOT NULL)";

async function readAppliedVersion(client: Client): Promise<string> {
  const result = await client.execute({
    sql: "SELECT `value` FROM `app_meta` WHERE `key` = ?",
    args: [SCHEMA_VERSION_KEY],
  });
  const value = result.rows[0]?.value;
  return typeof value === "string" ? value : "";
}

async function applyMigration(
  client: Client,
  migration: AppMigration,
): Promise<void> {
  const transaction = await client.transaction("write");
  try {
    for (const statement of migration.statements) {
      await transaction.execute(statement);
    }
    await transaction.execute({
      sql: "INSERT INTO `app_meta` (`key`, `value`) VALUES (?, ?) ON CONFLICT(`key`) DO UPDATE SET `value` = excluded.`value`",
      args: [SCHEMA_VERSION_KEY, migration.id],
    });
    await transaction.commit();
  } finally {
    // No-op after commit; rolls back if anything above threw.
    transaction.close();
  }
}

/** Bootstrap `app_meta` + the schema_version marker, then apply what's pending. */
export async function applyMigrations(client: Client): Promise<void> {
  await client.execute(BOOTSTRAP_APP_META);
  await client.execute({
    sql: "INSERT OR IGNORE INTO `app_meta` (`key`, `value`) VALUES (?, ?)",
    args: [SCHEMA_VERSION_KEY, BOOTSTRAP_VERSION],
  });
  const applied = await readAppliedVersion(client);
  for (const migration of migrations) {
    // Ids are zero-padded, so lexicographic comparison is apply order.
    if (migration.id <= applied) continue;
    await applyMigration(client, migration);
  }
}
