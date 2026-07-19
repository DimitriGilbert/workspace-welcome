import { z } from "zod";

import { mutateStore, readStore } from "../lib/store";
import { scanAll } from "../lib/scan";
import { openForTarget, type OpenTarget } from "../lib/spawn";
import { publicProcedure, router } from "../index";

/** Projects router: scan + per-project overrides + quick-open actions. */
export const projectsRouter = router({
  scan: publicProcedure.query(async () => {
    const store = await readStore();
    return scanAll({
      roots: store.roots,
      overrides: store.projects,
      settings: store.settings,
    });
  }),

  setPinned: publicProcedure
    .input(z.object({ path: z.string(), pinned: z.boolean() }))
    .mutation(async ({ input }) => {
      await mutateTouch(input.path, (ov) => {
        ov.pinned = input.pinned;
      });
      return { ok: true };
    }),

  setNote: publicProcedure
    .input(z.object({ path: z.string(), note: z.string() }))
    .mutation(async ({ input }) => {
      await mutateTouch(input.path, (ov) => {
        ov.note = input.note;
      });
      return { ok: true };
    }),

  touchLastOpened: publicProcedure
    .input(z.object({ path: z.string() }))
    .mutation(async ({ input }) => {
      await mutateTouch(input.path, (ov) => {
        ov.lastOpenedAt = new Date().toISOString();
      });
      return { ok: true };
    }),

  open: publicProcedure
    .input(
      z.object({
        path: z.string(),
        target: z.enum(["editor", "terminal", "folder"]),
      }),
    )
    .mutation(async ({ input }) => {
      const store = await readStore();
      const result = openForTarget(
        input.target as OpenTarget,
        input.path,
        store.settings,
      );
      if (!result.ok) {
        throw new Error(result.message);
      }
      return result;
    }),
});

/**
 * Apply a mutation to a single project's overrides, creating the entry lazily
 * if the project has never been touched before.
 */
async function mutateTouch(
  path: string,
  fn: (ov: {
    pinned: boolean;
    note: string;
    lastOpenedAt: string | null;
  }) => void,
): Promise<void> {
  await mutateStore((draft) => {
    const existing = draft.projects[path] ?? {
      pinned: false,
      note: "",
      lastOpenedAt: null,
    };
    fn(existing);
    draft.projects[path] = existing;
  });
}
