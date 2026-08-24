import { execFile, execFileSync } from "node:child_process";
import {
  lstat,
  mkdir,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import type { Dirent, Stats } from "node:fs";
import { promisify } from "node:util";
import { dirname, isAbsolute, join, sep } from "node:path";

/**
 * Filesystem operations for the per-project file browser (ADR-0002).
 *
 * Every function takes the project root plus a `/`-joined relative path
 * ("" = the root itself) and funnels through resolveInside — the single
 * containment authority. Violations throw plain Errors; the tRPC fetch
 * adapter wraps them for the client.
 */

const execFileAsync = promisify(execFile);

/** Server-enforced cap for the in-JSON base64 upload path. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Split a `/`-joined relative path; "", stray slashes and "." mean the root. */
function splitRel(rel: string): string[] {
  return rel.split("/").filter((s) => s !== "" && s !== ".");
}

/** A single path segment: no separators, no dot aliases, non-empty after trim. */
function validateEntryName(raw: string): string {
  const name = raw.trim();
  if (name === "" || name === "." || name === ".." || name.includes("/")) {
    throw new Error(`Invalid name: ${raw}`);
  }
  return name;
}

/**
 * Resolve `root/rel` to an absolute path, refusing anything that leaves the
 * project subtree. This is the real gate (the router's zod refinements are
 * just early feedback): absolute inputs and `..` segments are rejected
 * outright, then the realpath of the deepest EXISTING ancestor must resolve
 * inside the root — so a symlink pointing out of the project fails even when
 * the final target doesn't exist yet (upload/mkdir/rename destinations).
 */
export async function resolveInside(
  root: string,
  rel: string,
): Promise<string> {
  if (isAbsolute(rel)) {
    throw new Error("Path must be relative to the project root.");
  }
  const segments = splitRel(rel);
  if (segments.includes("..")) {
    throw new Error("Path must not contain '..' segments.");
  }
  const realRoot = await realpath(root);
  let ancestor = realRoot;
  let firstMissing = segments.length;
  for (const [i, seg] of segments.entries()) {
    try {
      ancestor = await realpath(join(ancestor, seg));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      firstMissing = i;
      break;
    }
  }
  if (ancestor !== realRoot && !ancestor.startsWith(realRoot + sep)) {
    throw new Error("Path escapes the project root.");
  }
  return firstMissing === segments.length
    ? ancestor
    : join(ancestor, ...segments.slice(firstMissing));
}

export interface FileEntry {
  name: string;
  kind: "dir" | "file";
  /** Null for directories (their "size" is not a meaningful number). */
  size: number | null;
  modifiedAt: string;
}

export interface ListDirResult {
  entries: FileEntry[];
  /** false when `gio` is missing — the UI labels deletes as permanent. */
  trashAvailable: boolean;
}

/**
 * stat follows symlinks so a directory symlink stays navigable; a broken
 * symlink falls back to lstat, which still describes the link itself.
 * Returns null when the entry vanishes mid-listing.
 */
async function statEntry(abs: string, d: Dirent): Promise<FileEntry | null> {
  let st: Stats;
  try {
    st = await stat(abs);
  } catch {
    try {
      st = await lstat(abs);
    } catch {
      return null;
    }
  }
  return st.isDirectory()
    ? { name: d.name, kind: "dir", size: null, modifiedAt: st.mtime.toISOString() }
    : {
        name: d.name,
        kind: "file",
        size: st.size,
        modifiedAt: st.mtime.toISOString(),
      };
}

let trashAvailableCache: boolean | null = null;

/** `gio` present (trash-able deletes)? Probed once per process (spawn.ts pattern). */
function isTrashAvailable(): boolean {
  if (trashAvailableCache === null) {
    try {
      execFileSync("command", ["-v", "gio"], { stdio: "ignore", shell: true });
      trashAvailableCache = true;
    } catch {
      trashAvailableCache = false;
    }
  }
  return trashAvailableCache;
}

/** List one directory ("" = project root): dirs first, then name-ascending. */
export async function listDir(
  root: string,
  rel: string,
): Promise<ListDirResult> {
  const abs = await resolveInside(root, rel);
  const dirents = await readdir(abs, { withFileTypes: true });
  const entries = (
    await Promise.all(dirents.map((d) => statEntry(join(abs, d.name), d)))
  ).filter((e): e is FileEntry => e !== null);
  entries.sort((a, b) =>
    a.kind === b.kind
      ? a.name.localeCompare(b.name)
      : a.kind === "dir"
        ? -1
        : 1,
  );
  return { entries, trashAvailable: isTrashAvailable() };
}

/** Same-directory rename. Containment is re-checked on the destination too. */
export async function renameEntry(
  root: string,
  rel: string,
  newName: string,
): Promise<void> {
  const segments = splitRel(rel);
  if (segments.pop() === undefined) {
    throw new Error("Cannot rename the project root.");
  }
  const name = validateEntryName(newName);
  const from = await resolveInside(root, rel);
  const to = await resolveInside(root, [...segments, name].join("/"));
  // rename(2) would silently replace an existing destination — refuse instead.
  if (await stat(to).then(() => true, () => false)) {
    throw new Error(`"${name}" already exists in this folder.`);
  }
  await rename(from, to);
}

/** Create one folder inside an existing parent (non-recursive by design). */
export async function createFolder(
  root: string,
  parentRel: string,
  name: string,
): Promise<void> {
  const folderName = validateEntryName(name);
  const abs = await resolveInside(
    root,
    [...splitRel(parentRel), folderName].join("/"),
  );
  // Plain mkdir: the parent must already exist — creating nested paths in
  // one shot isn't part of this API.
  await mkdir(abs);
}

/**
 * Delete a file or a whole subtree. `gio trash` when available (restorable
 * from the file manager); on ENOENT of `gio` itself, remove permanently and
 * say so — the UI labels the fallback (ADR-0002). A gio that RUNS but fails
 * (permissions, etc.) throws rather than silently escalating to permanent.
 */
export async function deleteEntry(
  root: string,
  rel: string,
): Promise<{ mode: "trash" | "permanent" }> {
  const abs = await resolveInside(root, rel);
  if (abs === (await realpath(root))) {
    throw new Error("Cannot delete the project root.");
  }
  try {
    await execFileAsync("gio", ["trash", abs]);
    return { mode: "trash" };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    await rm(abs, { recursive: true, force: true });
    return { mode: "permanent" };
  }
}

/**
 * Decode and atomically write an uploaded file. The temp file lives in the
 * destination directory so the rename is same-filesystem (EXDEV impossible);
 * rename overwrites — the UI confirms collisions before calling.
 */
export async function writeUpload(
  root: string,
  dirRel: string,
  name: string,
  contentBase64: string,
): Promise<void> {
  const fileName = validateEntryName(name);
  const buf = Buffer.from(contentBase64, "base64");
  if (buf.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(
      `"${fileName}" is too large for the in-JSON upload path (max 10 MB).`,
    );
  }
  const abs = await resolveInside(
    root,
    [...splitRel(dirRel), fileName].join("/"),
  );
  const tmp = join(dirname(abs), `.upload-${process.pid}-${Date.now()}.tmp`);
  await writeFile(tmp, buf);
  try {
    await rename(tmp, abs);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}
