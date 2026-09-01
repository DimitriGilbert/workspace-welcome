import { z } from "zod";

import {
  DEFAULT_RECONCILER_MODEL,
  DEFAULT_STEP_MODELS,
  ideationSettingsSchema,
} from "../lib/ideation/shared";
import { invalidateScanCache } from "../lib/scan-cache";
import { mutateStore, readSettings } from "../lib/store";
import { publicProcedure, router } from "../index";

/** Settings router: editor/terminal commands + extra exclude globs. */
export const settingsRouter = router({
  get: publicProcedure.query(async () => {
    return readSettings();
  }),

  update: publicProcedure
    .input(
      z.object({
        editorCommand: z.string().min(1),
        terminalCommand: z.string().nullable(),
        // Defaults to null so callers written before this field existed (and
        // until 1.2 updates them) stay valid — absent means auto-resolve.
        snitchPath: z.string().nullable().default(null),
        excludeGlobs: z.array(z.string()),
        // update replaces the whole settings object, so the ideation block
        // must ride along or every save wipes it (PRD §4.5 pitfall). The
        // default keeps pre-ideation callers — payloads without the block —
        // valid while preserving the ideation defaults (criterion 13).
        ideation: ideationSettingsSchema.default({
          models: {
            questions: [...DEFAULT_STEP_MODELS.questions],
            prd: [...DEFAULT_STEP_MODELS.prd],
            plan: [...DEFAULT_STEP_MODELS.plan],
          },
          reconciler: DEFAULT_RECONCILER_MODEL,
        }),
      }),
    )
    .mutation(async ({ input }) => {
      await mutateStore((draft) => {
        draft.settings = {
          editorCommand: input.editorCommand.trim(),
          terminalCommand: input.terminalCommand?.trim() || null,
          snitchPath: input.snitchPath?.trim() || null,
          excludeGlobs: input.excludeGlobs,
          // Clone so the persisted block never aliases the schema's shared
          // default object when the caller omitted it.
          ideation: structuredClone(input.ideation),
        };
      });
      // excludeGlobs feeds the scan denylist, so a settings change can alter
      // which files count toward updatedAt — drop the cache to be safe.
      invalidateScanCache();
      // Re-read so we return the persisted (post-validation) shape.
      return readSettings();
    }),
});
