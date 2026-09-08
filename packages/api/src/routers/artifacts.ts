import { z } from "zod";

import { listProjectArtifacts } from "../lib/artifacts";
import { requireKnownProject } from "../lib/known-project";
import {
  readProjectConfig,
  writeProjectConfig,
} from "../lib/project-config";
import { publicProcedure, router } from "../index";

/**
 * Artifacts router: per-project build/test media (screenshots, recordings).
 * The folder list lives in the per-project JSON file under the app data dir
 * (project-config.ts); listing walks those folders read-only (artifacts.ts).
 */

/**
 * One artifact folder, relative to the project root — the same containment
 * rules as the file browser's relPath, applied at save time so stored
 * configs can never contain an escape spelling.
 */
const artifactDir = z
  .string()
  .trim()
  .min(1, "Folder can't be empty")
  .max(256, "Folder path is too long")
  .refine(
    (dir) => !dir.startsWith("/"),
    "Folders are relative to the project root",
  )
  .refine(
    (dir) => !dir.split("/").includes(".."),
    "Folders can't contain '..' segments",
  )
  .transform((dir) => dir.replace(/^\.\//, "").replace(/\/+$/, ""));

const dirsSchema = z
  .array(artifactDir)
  .max(10, "At most 10 folders per project")
  .transform((dirs) => [...new Set(dirs)]);

export const artifactsRouter = router({
  /** The project's configured artifact folders (empty before first save). */
  config: publicProcedure
    .input(z.object({ project: z.string() }))
    .query(async ({ input }) => {
      const project = await requireKnownProject(input.project);
      const config = await readProjectConfig(project);
      return { dirs: config.artifacts.dirs };
    }),

  /** Replace the folder list; returns the normalized folders actually stored. */
  setConfig: publicProcedure
    .input(z.object({ project: z.string(), dirs: dirsSchema }))
    .mutation(async ({ input }) => {
      const project = await requireKnownProject(input.project);
      await writeProjectConfig({
        version: 1,
        path: project,
        artifacts: { dirs: input.dirs },
      });
      return { dirs: input.dirs };
    }),

  /** Media files under the configured folders, newest first. */
  list: publicProcedure
    .input(z.object({ project: z.string() }))
    .query(async ({ input }) => {
      const project = await requireKnownProject(input.project);
      const config = await readProjectConfig(project);
      if (config.artifacts.dirs.length === 0) {
        return {
          dirs: [],
          skippedDirs: [],
          media: [],
          truncated: false,
        };
      }
      return listProjectArtifacts(project, config.artifacts.dirs);
    }),
});
