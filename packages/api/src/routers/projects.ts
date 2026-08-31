import { resolve } from "node:path";

import { z } from "zod";

import { getScan, refreshCachedProject } from "../lib/scan-cache";
import {
  branchNameSchema,
  commitLog,
  gitFetch,
  gitFetchBranch,
  gitPull,
  gitPush,
  gitSwitchBranch,
  listBranches,
  switchSafety,
} from "../lib/git";
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

  /** Local and origin branch names for the fetch/switch pickers. */
  branches: publicProcedure
    .input(z.object({ path: z.string() }))
    .query(async ({ input }) => {
      const path = await requireKnownProject(input.path);
      return listBranches(path);
    }),

  /**
   * Fresh safety probe for the switch-branch confirmation: dirty state, an
   * in-flight git index lock, recent index activity, and the shared IDE —
   * the signals that an agent may be working the repo right now.
   */
  switchSafety: publicProcedure
    .input(z.object({ path: z.string() }))
    .query(async ({ input }) => {
      const path = await requireKnownProject(input.path);
      return switchSafety(path);
    }),

  /** Commit history for the graph block, newest first. Read-only. */
  commitLog: publicProcedure
    .input(
      z.object({
        path: z.string(),
        limit: z.number().int().min(1).max(500).optional(),
      }),
    )
    .query(async ({ input }) => {
      const path = await requireKnownProject(input.path);
      return commitLog(path, input.limit);
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

  /**
   * `git fetch --all --prune` — updates remote-tracking refs only. The UI's
   * behind/ahead counts refresh right after.
   */
  fetchRemote: publicProcedure
    .input(z.object({ path: z.string() }))
    .mutation(async ({ input }) => {
      const path = await requireKnownProject(input.path);
      const { settings } = await readStore();
      const res = await gitFetch(path);
      // A fetch moves none of the fingerprint signals the scan cache watches,
      // so poke the cached entry manually — otherwise the warm path would keep
      // serving the pre-fetch behind-count indefinitely.
      await refreshCachedProject(path, settings);
      if (!res.ok) throw new Error(res.output || "git fetch failed");
      return { ok: true, message: res.output || "Fetched." };
    }),

  /**
   * `git pull --ff-only` — fast-forwards when possible, refuses (rather than
   * merging or rebasing) when local and upstream diverged.
   */
  pull: publicProcedure
    .input(z.object({ path: z.string() }))
    .mutation(async ({ input }) => {
      const path = await requireKnownProject(input.path);
      const { settings } = await readStore();
      const res = await gitPull(path);
      await refreshCachedProject(path, settings);
      if (!res.ok) throw new Error(res.output || "git pull failed");
      return { ok: true, message: res.output || "Already up to date." };
    }),

  /**
   * `git push -u origin HEAD` — pushes the current branch to origin and sets
   * upstream, covering both first-push and the already-tracked case.
   */
  push: publicProcedure
    .input(z.object({ path: z.string() }))
    .mutation(async ({ input }) => {
      const path = await requireKnownProject(input.path);
      const { settings } = await readStore();
      const res = await gitPush(path);
      await refreshCachedProject(path, settings);
      if (!res.ok) throw new Error(res.output || "git push failed");
      return { ok: true, message: res.output || "Pushed." };
    }),

  /**
   * `git fetch origin <branch>` — one branch rather than the whole remote.
   * Unknown refs fail in git with a message that surfaces as the toast.
   */
  fetchBranch: publicProcedure
    .input(z.object({ path: z.string(), branch: branchNameSchema }))
    .mutation(async ({ input }) => {
      const path = await requireKnownProject(input.path);
      const { settings } = await readStore();
      const res = await gitFetchBranch(path, input.branch);
      await refreshCachedProject(path, settings);
      if (!res.ok) throw new Error(res.output || "git fetch failed");
      return {
        ok: true,
        message: res.output || `Fetched origin/${input.branch}.`,
      };
    }),

  /**
   * `git switch <branch>` — DWIM creates a local branch tracking the unique
   * `origin/<branch>` when only the remote one exists. The UI confirms first
   * against the `switchSafety` probe. HEAD moves, but the refresh is still
   * explicit, following the pull template.
   */
  switchBranch: publicProcedure
    .input(z.object({ path: z.string(), branch: branchNameSchema }))
    .mutation(async ({ input }) => {
      const path = await requireKnownProject(input.path);
      const { settings } = await readStore();
      const res = await gitSwitchBranch(path, input.branch);
      await refreshCachedProject(path, settings);
      if (!res.ok) throw new Error(res.output || "git switch failed");
      return {
        ok: true,
        message: res.output || `Switched to ${input.branch}.`,
      };
    }),
});

/**
 * Resolve and validate a client-supplied project path: it must be an immediate
 * child of a registered root, mirroring what the scanner indexes. fetch/pull
 * mutate repository state, so unlike `open` we refuse to act on paths outside
 * the tracked workspace.
 */
async function requireKnownProject(raw: string): Promise<string> {
  const path = resolve(raw);
  const { roots } = await readStore();
  const parent = path.slice(0, path.lastIndexOf("/"));
  const known = roots.some((r) => resolve(r.path) === parent);
  if (!known) {
    throw new Error(
      "Not a known project — it must live directly under a tracked directory.",
    );
  }
  return path;
}

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
