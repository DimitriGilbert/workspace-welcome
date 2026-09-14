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
  try {
    await client.execute("PRAGMA journal_mode = WAL");
    await client.execute("PRAGMA busy_timeout = 5000");
    const db = drizzle({ client, schema });
    await applyMigrations(client);
    return { db, client, file };
  } catch (error) {
    // The driver fail-fast-closes its pool only when the initial probe
    // inside createClient fails; anything after that is the caller's job.
    // Close so a failed open (read-only file, failing migration) leaves no
    // live native handle behind — getDb does not cache failures, so repeat
    // calls against a persistently failing open would otherwise accumulate
    // one idle connection per attempt.
    client.close();
    throw error;
  }
}

let instance: DbHandle | null = null;
let opening: Promise<DbHandle> | null = null;
// Bumped by every closeDb(). An open captures the value it started under
// and may install itself only while that value is still current.
let generation = 0;

/**
 * Lazy singleton over the XDG data-dir database. The path is resolved on
 * each call until the first open succeeds, so tests can redirect
 * XDG_DATA_HOME before the first call; after that, repeat calls return the
 * same handle. `closeDb()` resets the singleton for the next cold open: it
 * bumps a generation counter, and an open settling under a stale
 * generation is closed and rejected instead of installed — so a close
 * during an in-flight open can neither resurrect the old-path handle nor
 * leak the new one.
 */
export function getDb(): Promise<DbHandle> {
  if (instance) return Promise.resolve(instance);
  if (opening) return opening;
  const openGeneration = generation;
  const attempt: Promise<DbHandle> = openDb(dbFile()).then(
    (handle) => {
      if (generation !== openGeneration) {
        // closeDb() ran while this open was in flight. Installing would
        // resurrect a handle the closer believes dead — possibly on a
        // redirected XDG_DATA_HOME path. Close it and reject instead.
        handle.client.close();
        throw new Error(
          "getDb(): the database singleton was closed while opening — call getDb() again for a fresh open",
        );
      }
      instance = handle;
      // Only clear our own memo: a newer open may already be in flight.
      if (opening === attempt) opening = null;
      return handle;
    },
    (error: unknown) => {
      // Don't cache a failed open — the next call retries fresh. Only clear
      // our own memo: a stale handler must not clobber a newer in-flight
      // open's promise.
      if (opening === attempt) opening = null;
      throw error;
    },
  );
  opening = attempt;
  return attempt;
}

/**
 * Close the singleton and forget it (test isolation between cold opens).
 * Bumping the generation also invalidates any in-flight open, whose settle
 * handlers will close its handle and reject rather than install it.
 */
export function closeDb(): void {
  generation += 1;
  if (instance) {
    instance.client.close();
    instance = null;
  }
  opening = null;
}
