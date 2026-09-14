import type { Client } from "@libsql/client";

import { migrations } from "./migrations";
import type { AppMigration } from "./migrations";

/**
 * Embedded migration runner. SQL lives in `src/migrations/*.ts` (the runtime
 * source of truth); this module bootstraps `app_meta`, then applies every
 * unapplied migration — each one's statements plus its version recording
 * inside a single transaction, so a crash can never leave a migration half
 * applied or applied-but-unrecorded. Each apply also re-checks the recorded
 * version inside the write transaction, so a concurrent process's commit
 * makes the loser skip instead of crashing on already-existing tables.
 */

const SCHEMA_VERSION_KEY = "schema_version";

/** Version recorded before any migration has run; sorts below every id. */
const BOOTSTRAP_VERSION = "0000";

// Identical DDL to `app_meta` in schema.ts (and to drizzle-kit's generated
// 0000 SQL). IF NOT EXISTS makes the bootstrap idempotent; the app_meta
// CREATE is owned by this runner, not by any migration statement.
const BOOTSTRAP_APP_META =
  "CREATE TABLE IF NOT EXISTS `app_meta` (`key` text PRIMARY KEY NOT NULL, `value` text NOT NULL)";

/** Runs the version SELECT: the pooled autocommit client or an open transaction. */
type SqlExecutor = Pick<Client, "execute">;

async function readAppliedVersion(client: SqlExecutor): Promise<string> {
  const result = await client.execute({
    sql: "SELECT `value` FROM `app_meta` WHERE `key` = ?",
    args: [SCHEMA_VERSION_KEY],
  });
  const value = result.rows[0]?.value;
  return typeof value === "string" ? value : "";
}

/**
 * Apply one migration inside a single write transaction: its statements plus
 * its version recording commit atomically. Re-reads the recorded version on
 * the TRANSACTION handle first and skips cleanly when the migration turns
 * out to be applied already — a concurrent process may have committed it
 * after this caller's cheap outer pre-read. Exported for the selftest's
 * deterministic race pin.
 */
export async function applyMigration(
  client: Client,
  migration: AppMigration,
): Promise<void> {
  const transaction = await client.transaction("write");
  try {
    // Cross-process race guard: two processes (or two client pools) can both
    // pass the outer pre-read in applyMigrations while a migration is
    // pending — that read runs in autocommit outside this lock, so the loser
    // sees the winner's pre-commit snapshot. The BEGIN IMMEDIATE above has
    // already taken the write lock, so re-reading the version on the
    // TRANSACTION handle is authoritative: the loser's begin blocked behind
    // the winner's commit, and this read sees the new version. Without it
    // the loser died on "table already exists" from the winner's committed
    // DDL (the migration CREATE TABLEs carry no IF NOT EXISTS).
    const recorded = await readAppliedVersion(transaction);
    if (migration.id <= recorded) {
      // The winner applied it while we waited on the write lock: close the
      // empty transaction (the finally below rolls it back — nothing to
      // undo) without executing any DDL.
      return;
    }
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
  // Cheap fast path only — applyMigration re-checks the version inside the
  // write transaction (the authoritative read that closes the race).
  const applied = await readAppliedVersion(client);
  for (const migration of migrations) {
    // Ids are zero-padded, so lexicographic comparison is apply order.
    if (migration.id <= applied) continue;
    await applyMigration(client, migration);
  }
}
