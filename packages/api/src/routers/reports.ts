import { z } from "zod";

import {
  requireKnownProject,
  requireKnownRoot,
} from "../lib/known-project";
import {
  ensureReportJson,
  listReportJson,
  readReportJson,
  reportJsonPath,
} from "../lib/report-export";
import {
  buildReportCommand,
  cachedReportJob,
  getJob,
  reportFileExists,
  reportHtmlPath,
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
        // Backfill the JSON export for reports cached before exports existed;
        // a no-op (and never throws) when it is already there or can't be
        // built — the HTML is served either way.
        await ensureReportJson({
          key,
          kind: input.kind,
          targetPath,
          period: input.period,
          htmlPath: reportHtmlPath(key),
        });
        return cachedReportJob(input.kind, targetPath, input.period);
      }
      const settings = await readSettings();
      return startReportRun(input.kind, targetPath, settings, input.period);
    }),

  /** Job state for polling; null after a restart (the file outlives the map). */
  job: publicProcedure
    .input(z.object({ key: z.string().regex(REPORT_KEY_RE) }))
    .query(({ input }) => getJob(input.key)),

  /**
   * The persisted structured JSON export for a finished report — same key as
   * the HTML, chart-friendly shape (see report-export.ts). Written when the
   * run finishes; null for a key with no export (still running, predates
   * exports, or unreadable) — supplementary data, never a UI-level error.
   */
  jsonExport: publicProcedure
    .input(z.object({ key: z.string().regex(REPORT_KEY_RE) }))
    .query(({ input }) => readReportJson(input.key)),

  /** Index of persisted JSON exports, newest first; empty when none exist. */
  jsonExports: publicProcedure.query(() => listReportJson()),

  /**
   * The prebuilt CLI command that would produce this report — same ADR-0001
   * resolution, flags, and output path the app itself spawns, quoted for a
   * POSIX shell so a widget can offer it as the copyable manual path. Never
   * throws for a resolvable CLI: a configured-but-missing snitch path degrades
   * to `command: null` + an `error` message instead. `key` matches the
   * generate/jsonExport pair, so a widget can copy the command, then poll the
   * same key it would have gotten from generate.
   */
  command: publicProcedure
    .input(
      z.object({
        kind: z.enum(["repo", "scan"]),
        path: z.string(),
        period: z.enum(REPORT_PERIODS).optional(),
      }),
    )
    .query(async ({ input }) => {
      const targetPath =
        input.kind === "repo"
          ? await requireKnownProject(input.path)
          : await requireKnownRoot(input.path);
      const key = reportKey(input.kind, targetPath, input.period);
      const settings = await readSettings();
      let spec: ReturnType<typeof buildReportCommand>;
      try {
        spec = buildReportCommand(settings, input.kind, targetPath, input.period);
      } catch (err) {
        return {
          key,
          kind: input.kind,
          targetPath,
          period: input.period ?? null,
          command: null,
          source: "unresolved" as const,
          error: (err as Error).message,
          htmlPath: reportHtmlPath(key),
          jsonPath: reportJsonPath(key),
        };
      }
      return {
        key,
        kind: input.kind,
        targetPath,
        period: input.period ?? null,
        command: spec.command,
        source: spec.source,
        error: null,
        htmlPath: spec.htmlPath,
        jsonPath: reportJsonPath(key),
      };
    }),
});
