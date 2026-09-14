import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { closeDb, dbFile, getDb } from "@workspace-welcome/db";

import { parseRemote } from "../detect";
import { PAGE_LIMIT, SYNC_TTL_MS } from "./constants";
import { readOverview, readProjectSnapshot, replaceSnapshot, upsertRepoLink } from "./db";
import { readUserFeed } from "./feed";
import { syncUserFeed } from "./sync";
import type {
  ForgeFeedItem,
  ForgeIssue,
  ForgePull,
  ForgeRepoRef,
  ForgeSnapshot,
  ForgeUserFeed,
  UserFeedAdapter,
} from "./types";

/**
 * syncUserFeed + feed persistence tests
 * (`pnpm --filter @workspace-welcome/api test:forge`).
 *
 * Isolation: XDG_CONFIG_HOME/XDG_DATA_HOME point at mkdtemp dirs under
 * os.tmpdir() BEFORE any db call — the real user dirs are never touched
 * (asserted in useScenario, the sync.test.ts idiom). The feed is user-level:
 * no project path, no git fixtures — every sync goes through the in-file
 * fake UserFeedAdapter below; the real gh CLI adapter is never invoked and
 * zero searches run.
 */

const SANDBOX = mkdtempSync(join(tmpdir(), "ww-forge-feed-"));

/** Redirect both XDG vars at a fresh scenario and drop any open db handle. */
function useScenario(name: string): void {
  process.env.XDG_CONFIG_HOME = join(SANDBOX, name, "config");
  process.env.XDG_DATA_HOME = join(SANDBOX, name, "data");
  closeDb();
  const resolvedDb = dbFile();
  assert.ok(
    resolvedDb.startsWith(SANDBOX),
    `db path would leave the temp sandbox: ${resolvedDb}`,
  );
}

// --- Fake user-feed adapter ------------------------------------------------------

interface FakeRecorder {
  calls: number;
  probes: number;
  /** fetchSnapshot invocations — the user-feed path must make exactly zero. */
  snapshotCalls: number;
}

interface FakeConfig {
  available?: boolean;
  /** Simulated fetch duration so dedupe overlap is measurable. */
  fetchDelayMs?: number;
  /** Feeds consumed in call order; later calls reuse the last one. */
  feeds?: ForgeUserFeed[];
  failWith?: Error;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function feedItem(
  n: number,
  opts: {
    kind?: "issue" | "pr";
    repoSlug?: string;
    updatedAt?: string | null;
    isDraft?: boolean;
    labels?: string[];
  } = {},
): ForgeFeedItem {
  const kind = opts.kind ?? "issue";
  const repoSlug = opts.repoSlug ?? "octo-workshops/acme-cli";
  return {
    kind,
    repoSlug,
    number: n,
    title: `Item ${n}`,
    url: `https://github.com/${repoSlug}/${kind === "pr" ? "pull" : "issues"}/${n}`,
    // `undefined` means "fabricate a fresh-ish timestamp" while an explicit
    // null must survive as null (?? would coerce it to the default).
    updatedAt:
      opts.updatedAt === undefined
        ? `2026-09-14T08:00:${String(n).padStart(2, "0")}Z`
        : opts.updatedAt,
    labels: opts.labels ?? [],
    isDraft: opts.isDraft ?? false,
  };
}

function feedOf(
  items: ForgeFeedItem[],
  opts: { fetchedAt?: string; truncated?: boolean } = {},
): ForgeUserFeed {
  return {
    fetchedAt: opts.fetchedAt ?? new Date().toISOString(),
    items,
    truncated: opts.truncated ?? false,
  };
}

function fakeFeedAdapter(
  config: FakeConfig = {},
): UserFeedAdapter & FakeRecorder {
  let calls = 0;
  let probes = 0;
  let snapshotCalls = 0;
  const adapter: UserFeedAdapter & FakeRecorder = {
    kind: "github",
    style: "cli",
    get calls() {
      return calls;
    },
    get probes() {
      return probes;
    },
    get snapshotCalls() {
      return snapshotCalls;
    },
    matches: (remote) => remote.host === "github",
    async isAvailable() {
      probes += 1;
      return config.available ?? true;
    },
    // Guard assertion: the feed sync must never touch the repo-scoped path —
    // reaching this body fails the test loudly instead of silently passing.
    async fetchSnapshot(ref: ForgeRepoRef): Promise<ForgeSnapshot> {
      snapshotCalls += 1;
      throw new Error(
        `fetchSnapshot must not run in feed tests (ref: ${ref.slug})`,
      );
    },
    async fetchUserFeed(): Promise<ForgeUserFeed> {
      calls += 1;
      await sleep(config.fetchDelayMs ?? 0);
      if (config.failWith !== undefined) throw config.failWith;
      const queued = config.feeds?.[calls - 1];
      return queued ?? feedOf([]);
    },
  };
  return adapter;
}

// --- Tests -----------------------------------------------------------------------

test("feed sync persists items; read-back keeps ordering, attribution, kind, isDraft", async () => {
  useScenario("happy");
  // Real wall-clock fetchedAt: the read path derives `stale` against
  // Date.now(), so a fixed historical timestamp would (correctly) read stale.
  const fetchedAt = new Date().toISOString();
  const adapter = fakeFeedAdapter({
    feeds: [
      feedOf(
        [
          // Deliberately unordered input: the read path must sort, not trust.
          feedItem(3, { kind: "pr", updatedAt: "2026-09-12T08:00:00Z", repoSlug: "dimitri/dotfiles" }),
          feedItem(1, { updatedAt: "2026-09-14T07:00:00Z", labels: ["bug"] }),
          feedItem(2, { kind: "pr", updatedAt: "2026-09-14T07:00:00Z", isDraft: true }),
          feedItem(4, { updatedAt: null }),
        ],
        { fetchedAt },
      ),
    ],
  });

  const result = await syncUserFeed({ adapter });
  assert.equal(result.fetchedAt, fetchedAt);
  assert.equal(result.itemCount, 4);
  assert.equal(result.issuesCount, 2);
  assert.equal(result.pullsCount, 2);
  assert.equal(result.truncated, false);
  assert.equal(adapter.calls, 1);
  assert.equal(adapter.snapshotCalls, 0);

  const view = await readUserFeed();
  assert.equal(view.fetchedAt, fetchedAt);
  assert.equal(view.status, "ok");
  assert.equal(view.error, null);
  assert.equal(view.stale, false);
  assert.equal(view.truncated, false);
  // updatedAt DESC (nulls sink), kind asc as the tiebreaker — the tied
  // 07:00:00 pair comes back issue-before-pr.
  assert.deepEqual(
    view.items.map((item) => [item.kind, item.number]),
    [
      ["issue", 1],
      ["pr", 2],
      ["pr", 3],
      ["issue", 4],
    ],
  );
  assert.equal(view.items[0]?.repoSlug, "octo-workshops/acme-cli");
  assert.equal(view.items[2]?.repoSlug, "dimitri/dotfiles");
  assert.deepEqual(view.items[0]?.labels, ["bug"]);
  // isDraft survives the integer-boolean round-trip; issues read false.
  assert.equal(view.items[1]?.isDraft, true);
  assert.equal(view.items[0]?.isDraft, false);

  // Simulated fresh process: rows survive a cold reopen.
  closeDb();
  await getDb();
  const reopened = await readUserFeed();
  assert.equal(reopened.fetchedAt, fetchedAt);
  assert.equal(reopened.items.length, 4);
});

test("refuses a feed resync within MIN_SYNC_INTERVAL_MS; force bypasses", async () => {
  useScenario("interval");
  const t0 = Date.parse("2026-09-14T10:00:00.000Z");
  const adapter = fakeFeedAdapter({
    feeds: [
      feedOf([feedItem(1)], {
        fetchedAt: new Date(t0).toISOString(),
      }),
      feedOf([feedItem(2)], {
        fetchedAt: new Date(t0 + 10 * 60_000).toISOString(),
      }),
    ],
  });

  await syncUserFeed({ adapter, now: () => t0 });
  assert.equal(adapter.calls, 1);

  // 3 minutes later: refused with the shared message vocabulary, before any
  // probe or search.
  await assert.rejects(
    syncUserFeed({ adapter, now: () => t0 + 3 * 60_000 }),
    /Synced 3 min ago — use force/,
  );
  assert.equal(adapter.calls, 1);
  assert.equal(adapter.probes, 1);

  const forced = await syncUserFeed({
    adapter,
    force: true,
    now: () => t0 + 3 * 60_000,
  });
  assert.equal(
    forced.fetchedAt,
    new Date(t0 + 10 * 60_000).toISOString(),
  );
  assert.equal(adapter.calls, 2);
});

test("two concurrent feed syncs dedupe to exactly one fetch + one probe", async () => {
  useScenario("dedupe");
  const adapter = fakeFeedAdapter({ fetchDelayMs: 25 });

  const [a, b] = await Promise.all([
    syncUserFeed({ adapter }),
    syncUserFeed({ adapter }),
  ]);

  assert.equal(adapter.calls, 1);
  assert.equal(adapter.probes, 1);
  assert.deepEqual(a, b);
});

test("a failing feed fetch records status=failed + error and rethrows", async () => {
  useScenario("failure");
  const adapter = fakeFeedAdapter({
    failWith: new Error("gh search issues failed: boom"),
  });

  await assert.rejects(
    syncUserFeed({ adapter }),
    /gh search issues failed: boom/,
  );
  assert.equal(adapter.calls, 1);

  const view = await readUserFeed();
  assert.deepEqual(view.items, []);
  assert.equal(view.fetchedAt, null);
  assert.equal(view.status, "failed");
  assert.ok(
    view.error?.includes("boom"),
    `error recorded: ${String(view.error)}`,
  );
});

test("a failed force-resync keeps the last good feed items (stale-but-real)", async () => {
  useScenario("stale-but-real");
  const t0 = Date.parse("2026-09-14T11:00:00.000Z");
  const fetchedAt = new Date(t0).toISOString();
  // The fake reads config per fetch, so flipping it to failing after the
  // good feed landed simulates a later force-sync outage.
  const config: FakeConfig = {
    feeds: [feedOf([feedItem(1, { updatedAt: "2026-09-13T08:00:00Z" }), feedItem(2)], { fetchedAt })],
  };
  const adapter = fakeFeedAdapter(config);

  await syncUserFeed({ adapter, now: () => t0 });
  config.failWith = new Error("gh search prs failed: later boom");
  await assert.rejects(
    syncUserFeed({ adapter, force: true, now: () => t0 + 60_000 }),
    /later boom/,
  );

  // recordFeedFailure marks the attempt but never clears fetchedAt or the
  // rows: the widget renders the stale-but-real items with status "failed".
  const view = await readUserFeed();
  assert.equal(view.status, "failed");
  assert.ok(view.error?.includes("later boom"));
  assert.equal(view.fetchedAt, fetchedAt);
  assert.equal(view.items.length, 2);
});

test("a forced feed resync replaces the previous items wholesale", async () => {
  useScenario("replace");
  const t0 = Date.parse("2026-09-14T12:00:00.000Z");
  const adapter = fakeFeedAdapter({
    feeds: [
      feedOf([
        feedItem(1, { repoSlug: "octo-workshops/acme-cli" }),
        feedItem(2, { repoSlug: "dimitri/dotfiles" }),
        feedItem(3, { kind: "pr", repoSlug: "dimitri/dotfiles" }),
      ], { fetchedAt: new Date(t0).toISOString() }),
      feedOf([feedItem(1, { repoSlug: "octo-workshops/acme-cli" })], {
        fetchedAt: new Date(t0 + 10 * 60_000).toISOString(),
      }),
    ],
  });

  await syncUserFeed({ adapter, now: () => t0 });
  await syncUserFeed({ adapter, force: true, now: () => t0 + 60_000 });

  const view = await readUserFeed();
  // Items absent from the new feed (both dotfiles rows) are gone — replace,
  // no history.
  assert.equal(view.items.length, 1);
  assert.equal(view.items[0]?.number, 1);
  assert.equal(view.items[0]?.repoSlug, "octo-workshops/acme-cli");
  assert.equal(
    view.fetchedAt,
    new Date(t0 + 10 * 60_000).toISOString(),
  );
});

test("a PAGE_LIMIT-sized feed derives truncated on the read path", async () => {
  useScenario("truncated");
  const fullPage = Array.from({ length: PAGE_LIMIT }, (_, i) =>
    feedItem(i + 1),
  );
  const adapter = fakeFeedAdapter({
    feeds: [feedOf(fullPage, { truncated: true })],
  });

  const result = await syncUserFeed({ adapter });
  assert.equal(result.itemCount, PAGE_LIMIT);
  assert.equal(result.truncated, true);

  // The view derives truncation from the stored count — equality counts.
  const view = await readUserFeed();
  assert.equal(view.items.length, PAGE_LIMIT);
  assert.equal(view.truncated, true);
});

test("26 issues + 25 prs reads truncated:false — the cap is per-kind, not the sum", async () => {
  useScenario("truncated-mixed");
  // 51 rows combined exceed PAGE_LIMIT, yet neither search hit its own cap:
  // the read path must agree with the fetch's per-kind derivation, not the sum.
  const issues = Array.from({ length: 26 }, (_, i) => feedItem(i + 1));
  const pulls = Array.from({ length: 25 }, (_, i) =>
    feedItem(i + 1, { kind: "pr" }),
  );
  const adapter = fakeFeedAdapter({
    feeds: [feedOf([...issues, ...pulls])],
  });

  const result = await syncUserFeed({ adapter });
  assert.equal(result.issuesCount, 26);
  assert.equal(result.pullsCount, 25);
  assert.equal(result.itemCount, 51);
  assert.equal(result.truncated, false);

  const view = await readUserFeed();
  assert.equal(view.items.length, 51);
  assert.equal(view.truncated, false);
});

test("one kind alone hitting PAGE_LIMIT reads truncated:true", async () => {
  useScenario("truncated-one-kind");
  const issues = Array.from({ length: PAGE_LIMIT }, (_, i) =>
    feedItem(i + 1),
  );
  const pulls = Array.from({ length: 3 }, (_, i) =>
    feedItem(i + 1, { kind: "pr" }),
  );
  const adapter = fakeFeedAdapter({
    feeds: [feedOf([...issues, ...pulls], { truncated: true })],
  });

  const result = await syncUserFeed({ adapter });
  assert.equal(result.issuesCount, PAGE_LIMIT);
  assert.equal(result.pullsCount, 3);
  assert.equal(result.truncated, true);

  const view = await readUserFeed();
  assert.equal(view.items.length, PAGE_LIMIT + 3);
  assert.equal(view.truncated, true);
});

test("an unavailable adapter short-circuits before any search", async () => {
  useScenario("unavailable");
  const adapter = fakeFeedAdapter({ available: false });

  await assert.rejects(
    syncUserFeed({ adapter }),
    /gh not authenticated — run `gh auth login`/,
  );
  assert.equal(adapter.calls, 0);
  assert.equal(adapter.probes, 1);
  assert.equal(adapter.snapshotCalls, 0);

  // An availability failure is not a fetch failure: nothing was recorded as
  // a failed sync — the feed simply never synced.
  const view = await readUserFeed();
  assert.deepEqual(view.items, []);
  assert.equal(view.fetchedAt, null);
  assert.equal(view.status, "never");
  assert.equal(view.error, null);
});

test("readUserFeed marks a feed older than SYNC_TTL_MS as stale", async () => {
  useScenario("stale-ttl");
  const t0 = Date.parse("2026-09-14T10:00:00.000Z");
  // fetchedAt 2h before the wall clock the read path consults.
  const staleFetchedAt = new Date(Date.now() - 2 * SYNC_TTL_MS).toISOString();
  const adapter = fakeFeedAdapter({
    feeds: [feedOf([feedItem(1)], { fetchedAt: staleFetchedAt })],
  });

  await syncUserFeed({ adapter, now: () => t0 });
  const view = await readUserFeed();
  assert.equal(view.stale, true);
  assert.equal(view.status, "ok");
});

// --- Overview feed attribution (plan §Phase 11) ----------------------------------

/**
 * readOverview(slugs) tests: the feed cache is the data source, so they ride
 * this file's fake-feed idiom. The snapshot half of the merge is seeded
 * DIRECTLY (upsertRepoLink + replaceSnapshot — both pure DB writes, zero
 * adapter traffic), and the slugs map uses synthetic project paths:
 * readOverview never stats a path, it only keys on it. `repoIssue` is the
 * snapshot-table twin of feedItem above (different row shape, same per-file
 * fixture style).
 */
function repoIssue(n: number): ForgeIssue {
  return {
    number: n,
    title: `Snapshot issue ${n}`,
    state: "open",
    author: "someone-else",
    labels: [],
    commentCount: 0,
    updatedAt: "2026-09-14T08:00:00.000Z",
    url: `https://github.com/dimitri/dotfiles/issues/${n}`,
  };
}

/** Seed one project↔repo link + a synced snapshot for it (pure DB writes). */
async function seedSnapshot(
  projectPath: string,
  slug: string,
  issues: ForgeIssue[],
  pulls: ForgePull[] = [],
): Promise<void> {
  const remote = parseRemote(`https://github.com/${slug}.git`);
  assert.ok(remote !== null, `fixture remote must parse: ${slug}`);
  await upsertRepoLink(projectPath, remote);
  const ref: ForgeRepoRef = { kind: "github", host: "github.com", slug };
  const snapshot: ForgeSnapshot = {
    ref,
    fetchedAt: "2026-09-14T09:00:00.000Z",
    issues,
    pulls,
    issuesTruncated: false,
    pullsTruncated: false,
  };
  await replaceSnapshot(ref, snapshot);
}

test("slug map with no snapshot: feed-derived entries carry per-kind counts, the feed's fetchedAt, source feed", async () => {
  useScenario("overview-feed");
  const fetchedAt = new Date().toISOString();
  const adapter = fakeFeedAdapter({
    feeds: [
      feedOf(
        [
          feedItem(1, { repoSlug: "dimitri/dotfiles" }),
          feedItem(2, { repoSlug: "dimitri/dotfiles" }),
          feedItem(3, { kind: "pr", repoSlug: "dimitri/dotfiles" }),
          feedItem(4, { repoSlug: "octo-workshops/acme-cli" }),
        ],
        { fetchedAt },
      ),
    ],
  });
  await syncUserFeed({ adapter });

  const entries = await readOverview({
    "/home/fake/dotfiles": "dimitri/dotfiles",
    "/home/fake/acme-cli": "octo-workshops/acme-cli",
  });
  // Path-sorted like the snapshot-only read; one entry per mapped path.
  assert.deepEqual(entries, [
    {
      projectPath: "/home/fake/acme-cli",
      repoRef: {
        kind: "github",
        host: "github.com",
        slug: "octo-workshops/acme-cli",
      },
      openIssues: 1,
      openPulls: 0,
      truncated: false,
      fetchedAt,
      source: "feed",
    },
    {
      projectPath: "/home/fake/dotfiles",
      repoRef: {
        kind: "github",
        host: "github.com",
        slug: "dimitri/dotfiles",
      },
      openIssues: 2,
      openPulls: 1,
      truncated: false,
      fetchedAt,
      source: "feed",
    },
  ]);
});

test("a project with a snapshot wins: repo counts, no feed entry beside it", async () => {
  useScenario("overview-snapshot-wins");
  // Snapshot says 1 issue / 0 pulls; the feed for the SAME slug says 2
  // issues / 1 pr — the entry must render the snapshot's, and exactly once.
  await seedSnapshot("/home/fake/dotfiles", "dimitri/dotfiles", [repoIssue(1)]);
  const adapter = fakeFeedAdapter({
    feeds: [
      feedOf([
        feedItem(1, { repoSlug: "dimitri/dotfiles" }),
        feedItem(2, { repoSlug: "dimitri/dotfiles" }),
        feedItem(3, { kind: "pr", repoSlug: "dimitri/dotfiles" }),
        feedItem(1, { repoSlug: "octo-workshops/acme-cli" }),
      ]),
    ],
  });
  await syncUserFeed({ adapter });

  const entries = await readOverview({
    "/home/fake/dotfiles": "dimitri/dotfiles",
    "/home/fake/acme-cli": "octo-workshops/acme-cli",
  });
  assert.equal(entries.length, 2);
  const snapshotted = entries.find(
    (entry) => entry.projectPath === "/home/fake/dotfiles",
  );
  assert.deepEqual(snapshotted, {
    projectPath: "/home/fake/dotfiles",
    repoRef: {
      kind: "github",
      host: "github.com",
      slug: "dimitri/dotfiles",
    },
    openIssues: 1,
    openPulls: 0,
    truncated: false,
    fetchedAt: "2026-09-14T09:00:00.000Z",
    source: "repo",
  });
  // The unsnapshotted path still earns its feed entry alongside — path-sorted
  // first ("/home/fake/acme-cli" < "/home/fake/dotfiles").
  assert.equal(entries[0]?.projectPath, "/home/fake/acme-cli");
  assert.equal(entries[0]?.source, "feed");
  assert.equal(entries[0]?.openIssues, 1);
});

test("slugs absent from the feed cache get no entry — absence, never zeros", async () => {
  useScenario("overview-no-feed-match");
  await syncUserFeed({
    adapter: fakeFeedAdapter({
      feeds: [feedOf([feedItem(1, { repoSlug: "dimitri/dotfiles" })])],
    }),
  });

  assert.deepEqual(
    await readOverview({ "/home/fake/ghost": "ghost/unmapped" }),
    [],
  );
});

test("no feed ever synced: slugs alone never fabricate entries", async () => {
  useScenario("overview-no-feed");
  assert.deepEqual(
    await readOverview({ "/home/fake/ghost": "ghost/never-fetched" }),
    [],
  );
});

test("missing vs empty slugs input: byte-identical snapshot-only reads", async () => {
  useScenario("overview-identical");
  await seedSnapshot("/home/fake/dotfiles", "dimitri/dotfiles", [
    repoIssue(1),
    repoIssue(2),
  ]);
  await syncUserFeed({
    adapter: fakeFeedAdapter({
      feeds: [feedOf([feedItem(9, { repoSlug: "dimitri/dotfiles" })])],
    }),
  });

  const withoutSlugs = await readOverview();
  const emptySlugs = await readOverview({});
  assert.deepEqual(emptySlugs, withoutSlugs);
  assert.deepEqual(withoutSlugs, [
    {
      projectPath: "/home/fake/dotfiles",
      repoRef: {
        kind: "github",
        host: "github.com",
        slug: "dimitri/dotfiles",
      },
      openIssues: 2,
      openPulls: 0,
      truncated: false,
      fetchedAt: "2026-09-14T09:00:00.000Z",
      source: "repo",
    },
  ]);
});

test("feed counts derive per-kind truncation: a 50-cap slug and the 26+25 analog", async () => {
  useScenario("overview-feed-truncated");
  // busy: PAGE_LIMIT issues (at the cap) + 3 prs → truncated. mixed: 26
  // issues + 25 prs — 51 rows combined, yet neither kind hit its own cap →
  // not truncated. Same per-kind law as the repo-snapshot derivation.
  const busy = Array.from({ length: PAGE_LIMIT }, (_, i) =>
    feedItem(i + 1, { repoSlug: "dimitri/busy" }),
  ).concat(
    Array.from({ length: 3 }, (_, i) =>
      feedItem(i + 1, { kind: "pr", repoSlug: "dimitri/busy" }),
    ),
  );
  const mixed = Array.from({ length: 26 }, (_, i) =>
    feedItem(i + 1, { repoSlug: "dimitri/mixed" }),
  ).concat(
    Array.from({ length: 25 }, (_, i) =>
      feedItem(i + 1, { kind: "pr", repoSlug: "dimitri/mixed" }),
    ),
  );
  await syncUserFeed({
    adapter: fakeFeedAdapter({ feeds: [feedOf([...busy, ...mixed])] }),
  });

  const entries = await readOverview({
    "/home/fake/busy": "dimitri/busy",
    "/home/fake/mixed": "dimitri/mixed",
  });
  const busyEntry = entries.find((entry) => entry.projectPath === "/home/fake/busy");
  const mixedEntry = entries.find((entry) => entry.projectPath === "/home/fake/mixed");
  assert.equal(busyEntry?.openIssues, PAGE_LIMIT);
  assert.equal(busyEntry?.openPulls, 3);
  assert.equal(busyEntry?.truncated, true);
  assert.equal(mixedEntry?.openIssues, 26);
  assert.equal(mixedEntry?.openPulls, 25);
  assert.equal(mixedEntry?.truncated, false);
});

// --- Project snapshot feed fallback (plan §Phase 12) ------------------------------

/**
 * readProjectSnapshot precedence tests: repo snapshot > feed items for the
 * remote's slug > nothing. They ride this file's fake-feed idiom; the
 * snapshot half is seeded via seedSnapshot (pure DB writes), and
 * readProjectSnapshot never stats a path — synthetic project paths again.
 * `repoPull` is repoIssue's pull twin (same row shape family).
 */
function repoPull(n: number): ForgePull {
  return {
    number: n,
    title: `Snapshot pull ${n}`,
    state: "open",
    author: "someone-else",
    isDraft: false,
    reviewDecision: "APPROVED",
    labels: [],
    updatedAt: "2026-09-14T08:00:00.000Z",
    url: `https://github.com/dimitri/dotfiles/pull/${n}`,
  };
}

test("unlinked github project + feed rows: feed-sourced snapshot, per-kind split, feed's fetchedAt, source feed", async () => {
  useScenario("project-feed");
  // Real wall-clock fetchedAt: the read derives `stale` against Date.now().
  const fetchedAt = new Date().toISOString();
  await syncUserFeed({
    adapter: fakeFeedAdapter({
      feeds: [
        feedOf(
          [
            // Deliberately unordered input: the read orders each kind's list
            // by updatedAt DESC (the readUserFeed law, preserved per kind).
            feedItem(5, { kind: "pr", repoSlug: "dimitri/dotfiles", updatedAt: "2026-09-10T08:00:00Z" }),
            feedItem(2, { repoSlug: "dimitri/dotfiles", updatedAt: "2026-09-13T08:00:00Z" }),
            feedItem(7, { kind: "pr", repoSlug: "dimitri/dotfiles", updatedAt: "2026-09-14T07:00:00Z" }),
            feedItem(1, { repoSlug: "dimitri/dotfiles", updatedAt: "2026-09-12T08:00:00Z" }),
            // Another slug's row — must never leak into this project's board.
            feedItem(9, { repoSlug: "octo-workshops/acme-cli" }),
          ],
          { fetchedAt },
        ),
      ],
    }),
  });

  const remote = parseRemote("https://github.com/dimitri/dotfiles.git");
  assert.ok(remote !== null);
  const snapshot = await readProjectSnapshot("/home/fake/dotfiles", remote);
  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.source, "feed");
  assert.deepEqual(snapshot.repoRef, {
    kind: "github",
    host: "github.com",
    slug: "dimitri/dotfiles",
  });
  assert.deepEqual(
    snapshot.issues.map((issue) => issue.number),
    [2, 1],
  );
  assert.deepEqual(
    snapshot.pulls.map((pull) => pull.number),
    [7, 5],
  );
  assert.equal(snapshot.fetchedAt, fetchedAt);
  assert.equal(snapshot.lastSyncStatus, "ok");
  assert.equal(snapshot.lastSyncError, null);
  assert.equal(snapshot.stale, false);
  assert.equal(snapshot.truncated, false);
});

test("feed-sourced rows stay honest: author/commentCount/reviewDecision null, isDraft + labels carried", async () => {
  useScenario("project-feed-honesty");
  await syncUserFeed({
    adapter: fakeFeedAdapter({
      feeds: [
        feedOf([
          feedItem(1, { repoSlug: "dimitri/dotfiles", labels: ["bug", "ui"] }),
          feedItem(2, { kind: "pr", repoSlug: "dimitri/dotfiles", isDraft: true, labels: ["wip"] }),
          feedItem(3, { kind: "pr", repoSlug: "dimitri/dotfiles" }),
        ]),
      ],
    }),
  });

  const remote = parseRemote("https://github.com/dimitri/dotfiles.git");
  assert.ok(remote !== null);
  const snapshot = await readProjectSnapshot("/home/fake/dotfiles", remote);
  assert.equal(snapshot.source, "feed");

  // The feed carries no author and no comment count (gh search omits them) —
  // null, never fabricated; labels and state ride through.
  assert.equal(snapshot.issues.length, 1);
  assert.equal(snapshot.issues[0]?.author, null);
  assert.equal(snapshot.issues[0]?.commentCount, null);
  assert.equal(snapshot.issues[0]?.state, "open");
  assert.deepEqual(snapshot.issues[0]?.labels, ["bug", "ui"]);

  // The feed carries no reviewDecision — null; isDraft survives per pull.
  assert.equal(snapshot.pulls.length, 2);
  const draft = snapshot.pulls.find((pull) => pull.number === 2);
  const ready = snapshot.pulls.find((pull) => pull.number === 3);
  assert.equal(draft?.isDraft, true);
  assert.deepEqual(draft?.labels, ["wip"]);
  assert.equal(ready?.isDraft, false);
  assert.equal(draft?.reviewDecision, null);
  assert.equal(ready?.reviewDecision, null);
  assert.ok(snapshot.pulls.every((pull) => pull.author === null));
});

test("a linked synced project keeps its repo snapshot — source repo, feed rows for the slug never leak in", async () => {
  useScenario("project-snapshot-wins");
  await seedSnapshot("/home/fake/dotfiles", "dimitri/dotfiles", [repoIssue(1)], [
    repoPull(4),
  ]);
  // The feed holds MORE rows for the same slug — snapshot still wins, and
  // none of the feed rows appear (the read path's observable "no feed read").
  await syncUserFeed({
    adapter: fakeFeedAdapter({
      feeds: [
        feedOf([
          feedItem(9, { repoSlug: "dimitri/dotfiles" }),
          feedItem(8, { kind: "pr", repoSlug: "dimitri/dotfiles" }),
        ]),
      ],
    }),
  });

  const remote = parseRemote("https://github.com/dimitri/dotfiles.git");
  assert.ok(remote !== null);
  const snapshot = await readProjectSnapshot("/home/fake/dotfiles", remote);
  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.source, "repo");
  assert.deepEqual(
    snapshot.issues.map((issue) => issue.number),
    [1],
  );
  assert.deepEqual(
    snapshot.pulls.map((pull) => pull.number),
    [4],
  );
  // Repo-source fields the feed honestly lacks survive the mapping.
  assert.equal(snapshot.issues[0]?.author, "someone-else");
  assert.equal(snapshot.issues[0]?.commentCount, 0);
  assert.equal(snapshot.pulls[0]?.reviewDecision, "APPROVED");
  assert.equal(snapshot.fetchedAt, "2026-09-14T09:00:00.000Z");
  assert.equal(snapshot.truncated, false);
});

test("unlinked github project with no feed rows for its slug keeps the never-synced shape (source none)", async () => {
  useScenario("project-feed-empty");
  // The feed synced — but only for another slug: this one truly has nothing.
  await syncUserFeed({
    adapter: fakeFeedAdapter({
      feeds: [feedOf([feedItem(1, { repoSlug: "octo-workshops/acme-cli" })])],
    }),
  });
  const remote = parseRemote("https://github.com/dimitri/dotfiles.git");
  assert.ok(remote !== null);
  const snapshot = await readProjectSnapshot("/home/fake/dotfiles", remote);
  assert.equal(snapshot.status, "unknown");
  assert.equal(snapshot.source, "none");
  assert.equal(snapshot.repoRef, null);
  assert.deepEqual(snapshot.issues, []);
  assert.deepEqual(snapshot.pulls, []);
  assert.equal(snapshot.fetchedAt, null);
  assert.equal(snapshot.lastSyncStatus, "never");
  assert.equal(snapshot.stale, false);
  assert.equal(snapshot.truncated, false);

  // Same shape when no feed ever synced at all.
  useScenario("project-feed-never");
  const never = await readProjectSnapshot("/home/fake/dotfiles", remote);
  assert.equal(never.status, "unknown");
  assert.equal(never.source, "none");
  assert.equal(never.fetchedAt, null);
});

test("unsupported host and missing remote keep their shapes — source none, fallback never fires", async () => {
  useScenario("project-feed-statuses");
  // A synced feed with rows for the very slug being probed exists — the
  // gate is the HOST (feed = github only), so neither shape may board it.
  await syncUserFeed({
    adapter: fakeFeedAdapter({
      feeds: [feedOf([feedItem(1, { repoSlug: "dimitri/dotfiles" })])],
    }),
  });

  const gitlabRemote = parseRemote("https://gitlab.com/dimitri/dotfiles.git");
  assert.ok(gitlabRemote !== null);
  const unsupported = await readProjectSnapshot(
    "/home/fake/dotlab",
    gitlabRemote,
  );
  assert.equal(unsupported.status, "unsupported-host");
  assert.equal(unsupported.source, "none");
  assert.equal(unsupported.repoRef, null);

  const noRemote = await readProjectSnapshot("/home/fake/dotfiles");
  assert.equal(noRemote.status, "unknown");
  assert.equal(noRemote.source, "none");
  assert.equal(noRemote.repoRef, null);
  assert.equal(noRemote.lastSyncStatus, "never");
});

test("a feed board carries the feed's GLOBAL truncation — even a small per-slug subset", async () => {
  useScenario("project-feed-truncated");
  // 49 other-repo issues + this slug's 1 issue + 1 pr: the global issue
  // count sits at PAGE_LIMIT (the capped-feed world), yet this slug's board
  // holds 2 rows — the subset cannot know what the cap dropped, so the
  // global flag is the honest ceiling it must carry.
  const elsewhere = Array.from({ length: PAGE_LIMIT - 1 }, (_, i) =>
    feedItem(i + 1, { repoSlug: "octo-workshops/acme-cli" }),
  );
  await syncUserFeed({
    adapter: fakeFeedAdapter({
      feeds: [
        feedOf(
          [
            ...elsewhere,
            feedItem(1, { repoSlug: "dimitri/busy" }),
            feedItem(2, { kind: "pr", repoSlug: "dimitri/busy" }),
          ],
          { truncated: true },
        ),
      ],
    }),
  });

  const remote = parseRemote("https://github.com/dimitri/busy.git");
  assert.ok(remote !== null);
  const snapshot = await readProjectSnapshot("/home/fake/busy", remote);
  assert.equal(snapshot.source, "feed");
  assert.equal(snapshot.issues.length, 1);
  assert.equal(snapshot.pulls.length, 1);
  assert.equal(snapshot.truncated, true);
});

after(() => {
  closeDb();
  rmSync(SANDBOX, { recursive: true, force: true });
});
