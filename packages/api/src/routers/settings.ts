import { z } from "zod";

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
      }),
    )
    .mutation(async ({ input }) => {
      await mutateStore((draft) => {
        draft.settings = {
          editorCommand: input.editorCommand.trim(),
          terminalCommand: input.terminalCommand?.trim() || null,
          snitchPath: input.snitchPath?.trim() || null,
          excludeGlobs: input.excludeGlobs,
        };
      });
      // excludeGlobs feeds the scan denylist, so a settings change can alter
      // which files count toward updatedAt — drop the cache to be safe.
      invalidateScanCache();
      // Re-read so we return the persisted (post-validation) shape.
      return readSettings();
    }),
});
