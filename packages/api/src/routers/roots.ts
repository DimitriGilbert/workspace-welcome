import { resolve } from "node:path";
import { stat } from "node:fs/promises";
import { z } from "zod";

import { newId } from "../lib/id";
import { mutateStore, readStore } from "../lib/store";
import { publicProcedure, router } from "../index";

/**
 * Roots router: manage the set of directories the scanner watches.
 * Paths are resolved to absolute form and validated to exist + be a directory.
 */

export const rootsRouter = router({
  list: publicProcedure.query(async () => {
    const store = await readStore();
    return store.roots;
  }),

  add: publicProcedure
    .input(
      z.object({
        path: z.string().min(1),
        label: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const abs = resolve(input.path);
      let exists;
      try {
        exists = await stat(abs);
      } catch {
        throw new Error(`Directory does not exist: ${abs}`);
      }
      if (!exists.isDirectory()) {
        throw new Error(`Not a directory: ${abs}`);
      }

      const store = await readStore();
      if (store.roots.some((r) => r.path === abs)) {
        throw new Error("This root is already tracked");
      }

      const root = {
        id: newId(),
        path: abs,
        label: (input.label ?? "").trim() || abs.split("/").pop() || abs,
        addedAt: new Date().toISOString(),
      };

      await mutateStore((draft) => {
        draft.roots.push(root);
      });
      return root;
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const store = await readStore();
      const root = store.roots.find((r) => r.id === input.id);
      if (!root) throw new Error("Root not found");

      await mutateStore((draft) => {
        draft.roots = draft.roots.filter((r) => r.id !== input.id);
        // Drop overrides for projects that lived under this root.
        const prefix = `${root.path}/`;
        for (const key of Object.keys(draft.projects)) {
          if (key.startsWith(prefix)) delete draft.projects[key];
        }
      });
      return { ok: true };
    }),
});
