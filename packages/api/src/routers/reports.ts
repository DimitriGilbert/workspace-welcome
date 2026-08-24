import { z } from "zod";

import {
  requireKnownProject,
  requireKnownRoot,
} from "../lib/known-project";
import { getJob, REPORT_KEY_RE, startReportRun } from "../lib/snitch";
import { readSettings } from "../lib/store";
import { publicProcedure, router } from "../index";

/** Reports router: kick off git-snitch runs and poll their job state. */
export const reportsRouter = router({
  /**
   * Start a report run (or join the running one for the same target — the
   * registry dedupes by key). `repo` targets one project, `scan` a whole
   * tracked directory; both are validated server-side against the store.
   */
  generate: publicProcedure
    .input(z.object({ kind: z.enum(["repo", "scan"]), path: z.string() }))
    .mutation(async ({ input }) => {
      const targetPath =
        input.kind === "repo"
          ? await requireKnownProject(input.path)
          : await requireKnownRoot(input.path);
      const settings = await readSettings();
      return startReportRun(input.kind, targetPath, settings);
    }),

  /** Job state for polling; null after a restart (the file outlives the map). */
  job: publicProcedure
    .input(z.object({ key: z.string().regex(REPORT_KEY_RE) }))
    .query(({ input }) => getJob(input.key)),
});
