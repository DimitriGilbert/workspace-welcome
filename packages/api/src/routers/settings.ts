import { z } from "zod";

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
        excludeGlobs: z.array(z.string()),
      }),
    )
    .mutation(async ({ input }) => {
      await mutateStore((draft) => {
        draft.settings = {
          editorCommand: input.editorCommand.trim(),
          terminalCommand: input.terminalCommand?.trim() || null,
          excludeGlobs: input.excludeGlobs,
        };
      });
      // Re-read so we return the persisted (post-validation) shape.
      return readSettings();
    }),
});
