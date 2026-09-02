import { z } from "zod";

import {
  requireKnownProject,
  requireKnownRoot,
} from "../lib/known-project";
import {
  cachedReportJob,
  getJob,
  reportFileExists,
  reportKey,
  REPORT_KEY_RE,
  startReportRun,
} from "../lib/snitch";
import { readSettings } from "../lib/store";
import { publicProcedure, router } from "../index";

/** git-snitch --period presets surfaced in the UI; see parseScanPeriod. */
const REPORT_PERIODS = ["7d", "14d", "1m", "3m", "6m", "1y"] as const;

export type ReportPeriod = (typeof REPORT_PERIODS)[number];

/** Reports router: kick off git-snitch runs and poll their job state. */
export const reportsRouter = router({
  /**
   * Start a report run (or join the running one for the same target — the
   * registry dedupes by key). `repo` targets one project, `scan` a whole
   * tracked directory; both are validated server-side against the store.
   * Without `force` a finished cached report is served as-is (the returned
   * job is a synthetic done, the tab opens instantly); with it the cache is
   * voided and a fresh run starts. `period` scopes the run to a time window
   * and the cache key to that window — each period keeps its own report.
   */
  generate: publicProcedure
    .input(
      z.object({
        kind: z.enum(["repo", "scan"]),
        path: z.string(),
        force: z.boolean().default(false),
        period: z.enum(REPORT_PERIODS).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const targetPath =
        input.kind === "repo"
          ? await requireKnownProject(input.path)
          : await requireKnownRoot(input.path);
      const key = reportKey(input.kind, targetPath, input.period);
      if (!input.force && reportFileExists(key)) {
        return cachedReportJob(input.kind, targetPath, input.period);
      }
      const settings = await readSettings();
      return startReportRun(input.kind, targetPath, settings, input.period);
    }),

  /** Job state for polling; null after a restart (the file outlives the map). */
  job: publicProcedure
    .input(z.object({ key: z.string().regex(REPORT_KEY_RE) }))
    .query(({ input }) => getJob(input.key)),
});
