import { z } from "zod";

import { ideationSettingsSchema } from "../lib/ideation/shared";
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
        // must ride along or every save wipes it (PRD §4.5 pitfall). Keeping
        // it optional keeps pre-ideation callers — payloads without the
        // block — valid (criterion 13): an explicit block wins wholesale,
        // while an omitted one carries the stored values forward (the
        // mutation below), so hand-tuned model choices survive a save.
        ideation: ideationSettingsSchema.optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // Snapshot the stored settings so an omitted ideation block can carry
      // the current values forward instead of resetting them.
      const current = await readSettings();
      await mutateStore((draft) => {
        draft.settings = {
          editorCommand: input.editorCommand.trim(),
          terminalCommand: input.terminalCommand?.trim() || null,
          snitchPath: input.snitchPath?.trim() || null,
          excludeGlobs: input.excludeGlobs,
          // Clone so the persisted block never aliases the cached store
          // object — the store only shallow-copies settings on write.
          ideation: structuredClone(input.ideation ?? current.ideation),
        };
      });
      // excludeGlobs feeds the scan denylist, so a settings change can alter
      // which files count toward updatedAt — drop the cache to be safe.
      invalidateScanCache();
      // Re-read so we return the persisted (post-validation) shape.
      return readSettings();
    }),
});
