import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { closeDb, dbFile, getDb } from "@workspace-welcome/db";

import { parseRemote } from "../detect";
import { PAGE_LIMIT, SYNC_TTL_MS } from "./constants";
import { readOverview, replaceSnapshot, upsertRepoLink } from "./db";
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

after(() => {
  closeDb();
  rmSync(SANDBOX, { recursive: true, force: true });
});
