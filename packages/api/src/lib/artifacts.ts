import { readdir, stat } from "node:fs/promises";
import { join, sep } from "node:path";

import { resolveInside } from "./file-ops";

/**
 * Discovery of build/test media artifacts (screenshots, recordings) inside a
 * project's configured folders (see project-config.ts). Strictly read-only —
 * the file browser owns every mutation of project files.
 *
 * Only plain files are collected: symlinked entries are skipped because a
 * symlinked subfolder could point outside the configured folder — outside
 * the project entirely — and the point of this module is "show me what the
 * test run produced here", not arbitrary media anywhere on disk.
 */

export type ArtifactMediaKind = "image" | "video";

export const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "avif",
  "ico",
]);

export const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "webm",
  "m4v",
  "mov",
  "mkv",
  "avi",
  "ogv",
]);

/** Extension → content-type for the view route; the single media map. */
export const MEDIA_CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  avif: "image/avif",
  ico: "image/x-icon",
  mp4: "video/mp4",
  webm: "video/webm",
  m4v: "video/mp4",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  ogv: "video/ogg",
};

export interface ArtifactMediaEntry {
  /** Project-relative path, "/"-joined — the identity the view route serves. */
  path: string;
  name: string;
  kind: ArtifactMediaKind;
  /** The configured folder (normalized) this file was found under. */
  sourceDir: string;
  size: number;
  modifiedAt: string;
}

export interface ArtifactsListResult {
  /** The configured folders the scan ran over. */
  dirs: string[];
  /** Configured folders that couldn't be read, with the reason why. */
  skippedDirs: { dir: string; reason: string }[];
  media: ArtifactMediaEntry[];
  /** True when caps cut the walk short — the list is not the whole truth. */
  truncated: boolean;
}

/** "image" | "video" | null for a file name, by extension. */
export function mediaKindOf(name: string): ArtifactMediaKind | null {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  return null;
}

/** Hard caps so a huge artifact tree can't stall the listing or the client. */
const MAX_MEDIA = 500;
const MAX_WALKED_FILES = 5000;
const MAX_DEPTH = 8;

/**
 * List media under the configured folders, newest first. A configured folder
 * that doesn't exist yet (the test run that creates it hasn't run) is
 * reported in skippedDirs, not thrown — the list still covers the rest.
 */
export async function listProjectArtifacts(
  projectRoot: string,
  dirs: readonly string[],
): Promise<ArtifactsListResult> {
  const media: ArtifactMediaEntry[] = [];
  const skippedDirs: { dir: string; reason: string }[] = [];
  const budget = { files: MAX_WALKED_FILES };

  for (const dir of dirs) {
    try {
      // Containment gate for the folder itself (absolute spellings, `..`,
      // symlink escapes). The walk below only descends into real dirs and
      // skips symlinks, so this root check is the whole gate.
      await resolveInside(projectRoot, dir);
    } catch (err) {
      // Folder spellings are validated at save time, so a refusal here means
      // the folder moved or a symlink now points elsewhere — skip it.
      skippedDirs.push({
        dir,
        reason: err instanceof Error ? err.message : "can't be resolved",
      });
      continue;
    }
    await walkDir({
      projectRoot,
      sourceDir: dir,
      rel: dir,
      depth: 0,
      budget,
      media,
      skippedDirs,
    });
  }

  media.sort(
    (a, b) =>
      Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt) ||
      a.path.localeCompare(b.path),
  );
  const truncated = media.length > MAX_MEDIA || budget.files <= 0;
  return {
    dirs: [...dirs],
    skippedDirs,
    media: truncated ? media.slice(0, MAX_MEDIA) : media,
    truncated,
  };
}

interface WalkContext {
  projectRoot: string;
  sourceDir: string;
  /** Folder-relative path of the directory being walked ("/"-joined). */
  rel: string;
  depth: number;
  budget: { files: number };
  media: ArtifactMediaEntry[];
  skippedDirs: { dir: string; reason: string }[];
}

async function walkDir(ctx: WalkContext): Promise<void> {
  if (ctx.depth > MAX_DEPTH) return;
  let dirents;
  try {
    dirents = await readdir(join(ctx.projectRoot, ctx.rel), {
      withFileTypes: true,
    });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      // Only a missing top-level folder is misconfiguration worth reporting;
      // a deeper vanished directory is a race with the test run.
      if (ctx.depth === 0) {
        ctx.skippedDirs.push({ dir: ctx.sourceDir, reason: "folder not found" });
      }
      return;
    }
    if (ctx.depth === 0) {
      ctx.skippedDirs.push({
        dir: ctx.sourceDir,
        reason: err instanceof Error ? err.message : "can't be read",
      });
      return;
    }
    // An unreadable subfolder shouldn't sink the whole listing — skip it.
    return;
  }

  for (const dirent of dirents) {
    if (ctx.budget.files <= 0) return;
    const childRel = `${ctx.rel}/${dirent.name}`;
    if (dirent.isDirectory()) {
      await walkDir({ ...ctx, rel: childRel, depth: ctx.depth + 1 });
      continue;
    }
    if (!dirent.isFile()) continue; // symlinks (and oddities) are skipped
    ctx.budget.files -= 1;
    const kind = mediaKindOf(dirent.name);
    if (kind === null) continue;
    let size: number;
    let modifiedAt: string;
    try {
      const st = await stat(join(ctx.projectRoot, childRel));
      size = st.size;
      modifiedAt = st.mtime.toISOString();
    } catch {
      continue; // vanished mid-walk — not listable, not an error
    }
    ctx.media.push({
      path: childRel,
      name: dirent.name,
      kind,
      sourceDir: ctx.sourceDir,
      size,
      modifiedAt,
    });
  }
}

/**
 * True when `abs` is the resolved folder itself or lives under it — the view
 * route's second gate: a configured folder list is what marks a file as an
 * artifact, so only files under one are served, even though the project root
 * containment already holds.
 */
export function isInsideAnyDir(
  abs: string,
  resolvedDirs: readonly string[],
): boolean {
  return resolvedDirs.some(
    (dir) => abs === dir || abs.startsWith(dir + sep),
  );
}
