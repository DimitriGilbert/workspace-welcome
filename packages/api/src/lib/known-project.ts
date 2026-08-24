import { resolve } from "node:path";

import { readStore } from "./store";

/**
 * Server-side validation of client-supplied paths against the registered
 * roots. Reports (and later the file browser) act on arbitrary paths, so the
 * check lives here instead of being duplicated per router. Mirrors the private
 * helper in routers/projects.ts.
 */

/**
 * Resolve and validate a project path: it must be an immediate child of a
 * registered root, mirroring what the scanner indexes.
 */
export async function requireKnownProject(raw: string): Promise<string> {
  const path = resolve(raw);
  const { roots } = await readStore();
  const parent = path.slice(0, path.lastIndexOf("/"));
  const known = roots.some((r) => resolve(r.path) === parent);
  if (!known) {
    throw new Error(
      "Not a known project — it must live directly under a tracked directory.",
    );
  }
  return path;
}

/**
 * Resolve and validate a root path: it must equal a registered root's path
 * (root scans act on the whole tracked directory, not a subtree of it).
 */
export async function requireKnownRoot(raw: string): Promise<string> {
  const path = resolve(raw);
  const { roots } = await readStore();
  const known = roots.some((r) => resolve(r.path) === path);
  if (!known) {
    throw new Error("Not a tracked directory — it must be registered as a root.");
  }
  return path;
}
