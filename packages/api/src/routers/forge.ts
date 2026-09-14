import { resolve } from "node:path";

import { z } from "zod";

import { parseRemote } from "../lib/detect";
import { readOverview, readProjectSnapshot } from "../lib/forge/db";
import { readUserFeed } from "../lib/forge/feed";
import { syncForgeRepo, syncUserFeed } from "../lib/forge/sync";
import { requireKnownProject } from "../lib/known-project";
import { publicProcedure, router } from "../index";

/**
 * Forge router: cached GitHub issue/PR state. The three queries are pure DB
 * reads — rendering can never trigger a network call; the only doors to an
 * adapter invocation are the two explicit sync mutations, which carry all
 * the rate-limit discipline (min-interval, dedupe, sequential queue) inside
 * lib/forge/sync.ts. Errors propagate as plain Errors for the toast path.
 */
export const forgeRouter = router({
  /**
   * Open issue/PR counts for every project linked to a forge repo. Pure
   * database read — never fetches, so the dashboard list stays cheap.
   */
  overview: publicProcedure.query(async () => {
    return { entries: await readOverview() };
  }),

  /**
   * One project's cached snapshot + mapping status. The optional remoteUrl
   * comes from the client's scan data; parseRemote is pure, so the
   * unsupported-host distinction never costs a git invocation.
   */
  project: publicProcedure
    .input(
      z.object({
        path: z.string(),
        remoteUrl: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const remote =
        input.remoteUrl === undefined
          ? undefined
          : parseRemote(input.remoteUrl) ?? undefined;
      // Resolve to the same key the sync mutation wrote its link under.
      return readProjectSnapshot(resolve(input.path), remote);
    }),

  /**
   * Fetch fresh open issues/PRs for one project now. Guarded by the
   * known-project check like every mutating action, then by sync.ts's
   * min-interval refusal (bypassable with force). The client invalidates
   * its queries on success — nothing is refreshed server-side.
   */
  sync: publicProcedure
    .input(
      z.object({
        path: z.string(),
        force: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const path = await requireKnownProject(input.path);
      return syncForgeRepo(path, { force: input.force });
    }),

  /**
   * The authenticated user's open issues + PRs across ALL GitHub repos
   * (workspace or not), for the dashboard feed widget (plan §Phase 9b).
   * Pure database read of the feed cache — never touches the adapter.
   */
  feed: publicProcedure.query(async () => {
    return readUserFeed();
  }),

  /**
   * Fetch the user-level feed now — user-scoped, so no path/known-project
   * input: ONE `gh search` per kind inside the adapter, then sync.ts's
   * min-interval refusal (bypassable with force). The client invalidates
   * its feed query on success.
   */
  syncFeed: publicProcedure
    .input(
      z.object({
        force: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return syncUserFeed({ force: input.force });
    }),
});
