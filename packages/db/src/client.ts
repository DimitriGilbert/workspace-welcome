import { createClient } from "@libsql/client";
import type { Client } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { drizzle } from "drizzle-orm/libsql";
import type { LibSQLDatabase } from "drizzle-orm/libsql";

import { applyMigrations } from "./migrate";
import * as schema from "./schema";

/**
 * Database client factory + lazy singleton. The driver is `@libsql/client`
 * over an embedded `file:` URL (Phase-1 harvest decision) — its API is async,
 * so `openDb`/`getDb` return Promises.
 */

/** The drizzle handle with the full schema bound (typed table access). */
export type Db = LibSQLDatabase<typeof schema>;

/** Everything a caller needs: typed drizzle handle, raw client, open file. */
export type DbHandle = {
  db: Db;
  client: Client;
  file: string;
};

/**
 * $XDG_DATA_HOME/workspace-welcome/workspace-welcome.db (or
 * ~/.local/share/workspace-welcome/workspace-welcome.db).
 *
 * This LOCAL helper deliberately mirrors `dataDir()` in
 * packages/api/src/lib/xdg.ts rather than importing it: packages/db must stay
 * dependency-free of workspace siblings so that api can depend on db, never
 * the reverse. Keep the two in sync.
 */
export function dbFile(): string {
  const base = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(base, "workspace-welcome", "workspace-welcome.db");
}

/** Open (creating if needed) + migrate the database at an explicit file path. */
export async function openDb(file: string): Promise<DbHandle> {
  mkdirSync(dirname(file), { recursive: true });
  const client = createClient({
    url: `file:${file}`,
    // Busy timeout on every connection the client opens (including internal
    // transaction connections); the PRAGMA below additionally covers this
    // initial logical connection explicitly.
    timeout: 5000,
  });
  await client.execute("PRAGMA journal_mode = WAL");
  await client.execute("PRAGMA busy_timeout = 5000");
  const db = drizzle({ client, schema });
  await applyMigrations(client);
  return { db, client, file };
}

let instance: DbHandle | null = null;
let opening: Promise<DbHandle> | null = null;

/**
 * Lazy singleton over the XDG data-dir database. The path is resolved on
 * each call until the first open succeeds, so tests can redirect
 * XDG_DATA_HOME before the first call; after that, repeat calls return the
 * same handle. `closeDb()` resets the singleton for the next cold open.
 */
export function getDb(): Promise<DbHandle> {
  if (instance) return Promise.resolve(instance);
  opening ??= openDb(dbFile()).then(
    (handle) => {
      instance = handle;
      opening = null;
      return handle;
    },
    (error: unknown) => {
      // Don't cache a failed open — the next call retries fresh.
      opening = null;
      throw error;
    },
  );
  return opening;
}

/** Close the singleton and forget it (test isolation between cold opens). */
export function closeDb(): void {
  if (instance) {
    instance.client.close();
    instance = null;
  }
  opening = null;
}
