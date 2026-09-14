import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * XDG base-directory resolution for app-owned caches and data. Cache contents
 * (generated reports) are disposable and never user state; data contents (the
 * code-server install, the sqlite DB via packages/db) cost real work to
 * recreate, hence data, not cache — either way neither belongs in the config
 * dir next to the legacy, import-only store.json.
 */

/** $XDG_CACHE_HOME/workspace-welcome (or ~/.cache/workspace-welcome). */
export function cacheDir(): string {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(base, "workspace-welcome");
}

/** Where generated report HTML lands; created on first use (mkdir -p). */
export function reportsDir(): string {
  const dir = join(cacheDir(), "reports");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** $XDG_DATA_HOME/workspace-welcome (or ~/.local/share/workspace-welcome). */
export function dataDir(): string {
  const base = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(base, "workspace-welcome");
}

/** Root of the code-server auto-install (ADR-0004); created on first use. */
export function ideDir(): string {
  const dir = join(dataDir(), "ide");
  mkdirSync(dir, { recursive: true });
  return dir;
}
