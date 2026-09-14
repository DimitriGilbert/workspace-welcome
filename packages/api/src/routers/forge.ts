import { resolve } from "node:path";

import { z } from "zod";

import { parseRemote } from "../lib/detect";
import {
  readOverview,
  readProjectSnapshot,
  readRepoLinks,
} from "../lib/forge/db";
import { readUserFeed } from "../lib/forge/feed";
import {
  syncAllRepos,
  syncForgeRepo,
  syncUserFeed,
} from "../lib/forge/sync";
import { requireKnownProject } from "../lib/known-project";
import { publicProcedure, router } from "../index";

/**
 * Forge router: cached GitHub issue/PR state. The read queries (overview,
 * project, repos, feed) are pure DB reads — rendering can never trigger a
 * network call; the only doors to an adapter invocation are the explicit sync
 * mutations (sync, syncAll, syncFeed), which carry all the rate-limit
 * discipline (min-interval, dedupe, sequential queue) inside
 * lib/forge/sync.ts. Errors propagate as plain Errors for the toast path.
 */
export const forgeRouter = router({
  /**
   * Open issue/PR counts for every project attributable to a forge repo.
   * Pure database read — never fetches, so the dashboard list stays cheap.
   *
   * Attribution contract (plan §Phase 11): the client optionally sends
   * `slugs`, a projectPath → "owner/repo" map built from its scan data
   * (github-hosted remotes only — no server-side git needed). Snapshot
   * entries (`source: "repo"`) come from the per-repo sync tables as always
   * and ALWAYS win; for every mapped path without one, the server counts the
   * authenticated user's cached FEED items for that slug into a
   * `source: "feed"` entry — YOUR open items in that repo, not the repo's
   * totals — stamped with the feed's fetchedAt so the chip's age reads the
   * feed's, honestly. Still DB-only: no git, no gh, no adapter — the counts
   * exist because the feed cache already holds the items.
   */
  overview: publicProcedure
    .input(
      z
        .object({
          slugs: z.record(z.string(), z.string()).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      return { entries: await readOverview(input?.slugs) };
    }),

  /**
   * Every mapped project↔repo link with sync bookkeeping + open-item counts,
   * for the settings "Forge" listing (plan §Phase 10a). Includes never-synced
   * and failed links — `lastSyncStatus` carries the honest reason. Pure
   * database read — never touches the adapter.
   */
  repos: publicProcedure.query(async () => {
    return { repos: await readRepoLinks() };
  }),

  /**
   * One project's cached board + mapping status, under Phase 12's data
   * precedence: repo snapshot > the user's FEED items for the remote's slug >
   * nothing. The optional remoteUrl comes from the client's scan data;
   * parseRemote is pure, so the unsupported-host distinction AND the
   * feed-sourced fallback (an unlinked github project whose open items
   * already sit in the feed cache — `source: "feed"`, zero gh calls) never
   * cost a git invocation. Pure database read — never fetches.
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
   * Sync everything forge now (plan §Phase 10a): every visible workspace
   * project (never-synced GitHub projects included — the first sync creates
   * their link) then the user feed, ONE strictly sequential run through
   * sync.ts's queue. Projects without a forge identity come back "skipped"
   * with a reason; targets inside their min-interval come back "skipped"
   * (bypassable with force); failures are isolated per target. No projects →
   * an empty results array, not an error.
   */
  syncAll: publicProcedure
    .input(
      z.object({
        force: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return syncAllRepos({ force: input.force });
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
