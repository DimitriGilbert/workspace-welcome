import { z } from "zod";

import { getScan } from "../lib/scan-cache";
import { mutateStore, readStore } from "../lib/store";
import { openForTarget, type OpenTarget } from "../lib/spawn";
import { publicProcedure, router } from "../index";

/** Projects router: scan + per-project overrides + quick-open actions. */
export const projectsRouter = router({
  /**
   * Scan all roots, backed by an in-memory cache keyed by a cheap per-project
   * fingerprint (dir + `.git` sentinel mtimes + a `git status` hash for repos).
   *
   * - Warm loads and override-only mutations (pin/note/hide/touch) are fast:
   *     the cache is reused and overrides are re-merged live.
   * - The client Refresh button re-invokes this query with no input; every
   *     call re-probes all fingerprints and re-scans any project that changed
   *     since the last call, so Refresh does surface real changes.
   * - Pass `force: true` to bypass the fingerprint check and force a full
   *     rescan of every project (paranoid mode; ~6s on this workspace).
   *
   * The input is optional so existing callers that pass nothing keep working.
   */
  scan: publicProcedure
    .input(z.object({ force: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      const store = await readStore();
      return getScan({
        roots: store.roots,
        overrides: store.projects,
        settings: store.settings,
        force: input?.force,
      });
    }),

  /** List hidden projects (path + name only) so they can be un-hidden. */
  hidden: publicProcedure.query(async () => {
    const store = await readStore();
    return Object.entries(store.projects)
      .filter(([, ov]) => ov.hidden)
      .map(([path]) => ({ path, name: path.split("/").pop() ?? path }))
      .sort((a, b) => a.name.localeCompare(b.name));
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

  setHidden: publicProcedure
    .input(z.object({ path: z.string(), hidden: z.boolean() }))
    .mutation(async ({ input }) => {
      await mutateTouch(input.path, (ov) => {
        ov.hidden = input.hidden;
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
    hidden: boolean;
  }) => void,
): Promise<void> {
  await mutateStore((draft) => {
    const existing = draft.projects[path] ?? {
      pinned: false,
      note: "",
      lastOpenedAt: null,
      hidden: false,
    };
    fn(existing);
    draft.projects[path] = existing;
  });
}
