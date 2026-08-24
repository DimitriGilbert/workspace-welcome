import { z } from "zod";

import { requireKnownProject } from "../lib/known-project";
import {
  createFolder,
  deleteEntry,
  listDir,
  renameEntry,
  writeUpload,
} from "../lib/file-ops";
import { publicProcedure, router } from "../index";

/**
 * Files router: the per-project file browser's backend (ADR-0002). Every
 * procedure re-validates the project against the store and the relative path
 * against the containment rules — client behavior is never trusted.
 */

/** Early feedback mirroring the real gate in file-ops' resolveInside. */
const relPath = z
  .string()
  .refine((p) => !p.startsWith("/"), "Path must be relative to the project root")
  .refine(
    (p) => !p.split("/").includes(".."),
    "Path must not contain '..' segments",
  );

/** A bare filename — one segment, no dot aliases. */
const bareName = z.string().refine((n) => {
  const t = n.trim();
  return t !== "" && t !== "." && t !== ".." && !t.includes("/");
}, "Name must be a bare filename");

export const filesRouter = router({
  /** List one directory ("" = project root): dirs first, then name-ascending. */
  list: publicProcedure
    .input(z.object({ project: z.string(), dir: relPath }))
    .query(async ({ input }) => {
      const root = await requireKnownProject(input.project);
      return listDir(root, input.dir);
    }),

  /** Same-directory rename; an existing destination is refused, never replaced. */
  rename: publicProcedure
    .input(z.object({ project: z.string(), path: relPath, name: bareName }))
    .mutation(async ({ input }) => {
      const root = await requireKnownProject(input.project);
      await renameEntry(root, input.path, input.name);
      return { ok: true };
    }),

  /** Trash when `gio` exists, else permanent; returns which mode ran. */
  delete: publicProcedure
    .input(z.object({ project: z.string(), path: relPath }))
    .mutation(async ({ input }) => {
      const root = await requireKnownProject(input.project);
      return deleteEntry(root, input.path);
    }),

  /** Create one folder inside an existing parent directory. */
  createFolder: publicProcedure
    .input(z.object({ project: z.string(), parent: relPath, name: bareName }))
    .mutation(async ({ input }) => {
      const root = await requireKnownProject(input.project);
      await createFolder(root, input.parent, input.name);
      return { ok: true };
    }),

  /** Base64 upload; the 10 MB cap is enforced server-side after decode. */
  upload: publicProcedure
    .input(
      z.object({
        project: z.string(),
        dir: relPath,
        name: bareName,
        contentBase64: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const root = await requireKnownProject(input.project);
      await writeUpload(root, input.dir, input.name, input.contentBase64);
      return { ok: true };
    }),
});
