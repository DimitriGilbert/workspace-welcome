import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

import { closeDb, dbFile, getDb } from "@workspace-welcome/db";

import { parseRemote } from "../detect";
import { newId } from "../id";
import { invalidateScanCache } from "../scan-cache";
import { mutateStore } from "../store";
import { PAGE_LIMIT } from "./constants";
import { readOverview, readProjectSnapshot, readRepoLinks } from "./db";
import { syncAllRepos, syncForgeRepo, syncUserFeed } from "./sync";
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
 * syncForgeRepo + syncAllRepos + forge DB persistence tests
 * (`pnpm --filter @workspace-welcome/api test:forge`).
 *
 * Isolation: XDG_CONFIG_HOME/XDG_DATA_HOME point at mkdtemp dirs under
 * os.tmpdir() BEFORE any db call — the real user dirs are never touched
 * (asserted in useScenario, Phase-3 idiom). Git fixtures are throwaway
 * `git init` repos under a second temp root: LOCAL git only — the remote URL
 * is never contacted and the real gh CLI adapter is never invoked; every
 * sync goes through the in-file fake adapter below. The fleet tests register
 * a throwaway fleet dir as the scenario's one store root, so syncAllRepos's
 * scan enumeration (readStore → getScan) sees exactly that scenario's
 * fixtures.
 */

const execFileAsync = promisify(execFile);

const SANDBOX = mkdtempSync(join(tmpdir(), "ww-forge-sync-"));
const REPOS = mkdtempSync(join(tmpdir(), "ww-forge-repos-"));

/**
 * Redirect both XDG vars at a fresh scenario, drop any open db handle, and
 * drop the in-memory scan cache — a new scenario is a new world (fresh store,
 * fresh projects), never a warm reuse of the previous one's enumeration.
 */
function useScenario(name: string): void {
  process.env.XDG_CONFIG_HOME = join(SANDBOX, name, "config");
  process.env.XDG_DATA_HOME = join(SANDBOX, name, "data");
  closeDb();
  invalidateScanCache();
  const resolvedDb = dbFile();
  assert.ok(
    resolvedDb.startsWith(SANDBOX),
    `db path would leave the temp sandbox: ${resolvedDb}`,
  );
}

/** A throwaway git repo (local commands only; the URL is never fetched). */
async function initRepo(remoteUrl?: string): Promise<string> {
  const dir = mkdtempSync(join(REPOS, "repo-"));
  await execFileAsync("git", ["init"], { cwd: dir });
  if (remoteUrl !== undefined) {
    await execFileAsync("git", ["remote", "add", "origin", remoteUrl], {
      cwd: dir,
    });
  }
  return dir;
}

/**
 * A deterministically-named fixture repo directly inside a fleet root (see
 * initFleet) — fixed child names keep path-sorted syncAllRepos results
 * predictable while the fleet parent itself stays mkdtemp-unique.
 */
async function initNamedRepo(
  fleet: string,
  name: string,
  remoteUrl?: string,
): Promise<string> {
  const dir = join(fleet, name);
  await execFileAsync("git", ["init", dir]);
  if (remoteUrl !== undefined) {
    await execFileAsync("git", ["remote", "add", "origin", remoteUrl], {
      cwd: dir,
    });
  }
  return dir;
}

/**
 * A throwaway fleet root: a temp parent dir for fixture repos, registered as
 * the scenario's one store root so the scan enumerates exactly these
 * projects.
 */
async function initFleet(name: string): Promise<string> {
  const dir = mkdtempSync(join(REPOS, `fleet-${name}-`));
  await mutateStore((draft) => {
    draft.roots.push({
      id: newId(),
      path: dir,
      label: name,
      addedAt: new Date().toISOString(),
    });
  });
  return dir;
}

// --- Fake adapter --------------------------------------------------------------

interface FakeFetchCall {
  ref: ForgeRepoRef;
  start: number;
  end: number;
}

interface FakeRecorder {
  calls: FakeFetchCall[];
  probes: number;
  feedCalls: number;
}

interface FakeConfig {
  available?: boolean;
  /** Simulated fetch duration so overlap (or its absence) is measurable. */
  fetchDelayMs?: number;
  /** Snapshots consumed in call order; later calls reuse the last one. */
  snapshots?: ForgeSnapshot[];
  failWith?: Error;
  /** Slugs whose fetches throw failWith; absent → every fetch throws it. */
  failSlugs?: string[];
  /** Payload returned by fetchUserFeed; defaults to an empty feed. */
  feed?: ForgeUserFeed;
  /** Thrown by fetchUserFeed (the fleet run's isolated feed failure). */
  failFeedWith?: Error;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeFeedItem(kind: "issue" | "pr", n: number): ForgeFeedItem {
  return {
    kind,
    repoSlug: "fake-owner/anywhere",
    number: n,
    title: `Feed ${kind} ${n}`,
    url: `https://github.com/fake-owner/anywhere/${kind === "pr" ? "pull" : "issues"}/${n}`,
    updatedAt: "2026-09-14T08:00:00.000Z",
    labels: [],
    isDraft: false,
  };
}

function makeIssue(
  n: number,
  title: string,
  labels: string[] = [],
): ForgeIssue {
  return {
    number: n,
    title,
    state: "open",
    author: `user-${n}`,
    labels,
    commentCount: n,
    updatedAt: "2026-09-14T08:00:00.000Z",
    url: `https://github.com/fake-owner/fake-repo/issues/${n}`,
  };
}

function makePull(n: number, title: string, isDraft = false): ForgePull {
  return {
    number: n,
    title,
    state: "open",
    author: `user-${n}`,
    isDraft,
    reviewDecision: null,
    labels: [],
    updatedAt: "2026-09-14T08:00:00.000Z",
    url: `https://github.com/fake-owner/fake-repo/pull/${n}`,
  };
}

function snapshotOf(
  ref: ForgeRepoRef,
  opts: {
    fetchedAt?: string;
    issues?: ForgeIssue[];
    pulls?: ForgePull[];
    issuesTruncated?: boolean;
    pullsTruncated?: boolean;
  } = {},
): ForgeSnapshot {
  return {
    ref,
    fetchedAt: opts.fetchedAt ?? new Date().toISOString(),
    issues: opts.issues ?? [],
    pulls: opts.pulls ?? [],
    issuesTruncated: opts.issuesTruncated ?? false,
    pullsTruncated: opts.pullsTruncated ?? false,
  };
}

function fakeAdapter(config: FakeConfig = {}): UserFeedAdapter & FakeRecorder {
  const calls: FakeFetchCall[] = [];
  let probeCount = 0;
  let feedCallCount = 0;
  const adapter: UserFeedAdapter & FakeRecorder = {
    kind: "github",
    style: "cli",
    calls,
    get probes() {
      return probeCount;
    },
    get feedCalls() {
      return feedCallCount;
    },
    matches: (remote) => remote.host === "github",
    async isAvailable() {
      probeCount += 1;
      return config.available ?? true;
    },
    async fetchSnapshot(ref) {
      const start = Date.now();
      await sleep(config.fetchDelayMs ?? 0);
      const end = Date.now();
      calls.push({ ref, start, end });
      if (
        config.failWith !== undefined &&
        (config.failSlugs === undefined || config.failSlugs.includes(ref.slug))
      ) {
        throw config.failWith;
      }
      const queued = config.snapshots?.[calls.length - 1];
      return (
        queued ??
        snapshotOf(ref, { issues: [makeIssue(1, "Default issue")] })
      );
    },
    async fetchUserFeed() {
      feedCallCount += 1;
      if (config.failFeedWith !== undefined) throw config.failFeedWith;
      return (
        config.feed ?? {
          fetchedAt: new Date().toISOString(),
          items: [],
          truncated: false,
        }
      );
    },
  };
  return adapter;
}

// --- Tests ---------------------------------------------------------------------

test("sync persists a snapshot; overview + project reads agree; rows survive reopen", async () => {
  useScenario("happy");
  const repoPath = await initRepo("https://github.com/fake-owner/fake-repo.git");
  const ref: ForgeRepoRef = {
    kind: "github",
    host: "github.com",
    slug: "fake-owner/fake-repo",
  };
  const fetchedAt = new Date().toISOString();
  const adapter = fakeAdapter({
    snapshots: [
      snapshotOf(ref, {
        fetchedAt,
        issues: [makeIssue(1, "One", []), makeIssue(2, "Two", ["bug"])],
        pulls: [makePull(3, "Fix things")],
      }),
    ],
  });

  const result = await syncForgeRepo(repoPath, { adapter });
  assert.deepEqual(result.repoRef, ref);
  assert.equal(result.fetchedAt, fetchedAt);
  assert.equal(result.openIssues, 2);
  assert.equal(result.openPulls, 1);
  assert.equal(result.truncated, false);
  assert.equal(adapter.calls.length, 1);

  const overview = await readOverview();
  assert.equal(overview.length, 1);
  assert.deepEqual(overview[0], {
    projectPath: repoPath,
    repoRef: ref,
    openIssues: 2,
    openPulls: 1,
    truncated: false,
    fetchedAt,
  });

  const snapshot = await readProjectSnapshot(repoPath);
  assert.equal(snapshot.status, "ready");
  assert.deepEqual(snapshot.repoRef, ref);
  assert.deepEqual(snapshot.issues, [
    makeIssue(1, "One", []),
    makeIssue(2, "Two", ["bug"]),
  ]);
  assert.deepEqual(snapshot.pulls, [makePull(3, "Fix things")]);
  assert.equal(snapshot.fetchedAt, fetchedAt);
  assert.equal(snapshot.lastSyncStatus, "ok");
  assert.equal(snapshot.lastSyncError, null);
  assert.equal(snapshot.stale, false);

  // Simulated fresh process: close the handle, reopen the same file — the
  // persisted rows must still be there.
  closeDb();
  await getDb();
  const reopened = await readProjectSnapshot(repoPath);
  assert.equal(reopened.status, "ready");
  assert.deepEqual(reopened.issues.map((i) => i.number), [1, 2]);
  assert.deepEqual(reopened.issues[1]?.labels, ["bug"]);
  assert.deepEqual(reopened.pulls.map((p) => p.number), [3]);
  assert.equal((await readOverview())[0]?.openIssues, 2);
});

test("refuses a resync within MIN_SYNC_INTERVAL_MS; force bypasses", async () => {
  useScenario("interval");
  const repoPath = await initRepo(
    "https://github.com/fake-owner/interval-repo.git",
  );
  const ref: ForgeRepoRef = {
    kind: "github",
    host: "github.com",
    slug: "fake-owner/interval-repo",
  };
  const t0 = Date.parse("2026-09-14T10:00:00.000Z");
  const first = snapshotOf(ref, {
    fetchedAt: new Date(t0).toISOString(),
    issues: [makeIssue(1, "First")],
  });
  const second = snapshotOf(ref, {
    fetchedAt: new Date(t0 + 10 * 60_000).toISOString(),
    issues: [makeIssue(2, "Second")],
  });
  const adapter = fakeAdapter({ snapshots: [first, second] });

  await syncForgeRepo(repoPath, { adapter, now: () => t0 });
  assert.equal(adapter.calls.length, 1);

  // 3 minutes later: refused with the Phase-7 message vocabulary, and the
  // refusal happens before any probe or fetch.
  await assert.rejects(
    syncForgeRepo(repoPath, { adapter, now: () => t0 + 3 * 60_000 }),
    /Synced 3 min ago — use force/,
  );
  assert.equal(adapter.calls.length, 1);
  assert.equal(adapter.probes, 1);

  const forced = await syncForgeRepo(repoPath, {
    adapter,
    force: true,
    now: () => t0 + 3 * 60_000,
  });
  assert.equal(forced.fetchedAt, second.fetchedAt);
  assert.equal(forced.openIssues, 1);
  assert.equal(adapter.calls.length, 2);
});

test("two concurrent syncs of the same repo dedupe to exactly one fetch", async () => {
  useScenario("dedupe");
  const repoPath = await initRepo(
    "https://github.com/fake-owner/dedupe-repo.git",
  );
  const adapter = fakeAdapter({ fetchDelayMs: 25 });

  const [a, b] = await Promise.all([
    syncForgeRepo(repoPath, { adapter }),
    syncForgeRepo(repoPath, { adapter }),
  ]);

  assert.equal(adapter.calls.length, 1);
  assert.equal(adapter.probes, 1);
  assert.deepEqual(a, b);
});

test("concurrent syncs of two different repos never overlap their fetches", async () => {
  useScenario("queue");
  const repoA = await initRepo("https://github.com/fake-owner/queue-a.git");
  const repoB = await initRepo("https://github.com/fake-owner/queue-b.git");
  const adapter = fakeAdapter({ fetchDelayMs: 30 });

  await Promise.all([
    syncForgeRepo(repoA, { adapter }),
    syncForgeRepo(repoB, { adapter }),
  ]);

  assert.equal(adapter.calls.length, 2);
  const [first, second] = [...adapter.calls].sort((x, y) => x.start - y.start);
  assert.ok(
    first !== undefined && second !== undefined,
    "both fetches recorded",
  );
  assert.ok(
    second.start >= first.end,
    `fetches overlapped: [${first.start},${first.end}) vs [${second.start},${second.end})`,
  );
});

test("a forced resync replaces the previous snapshot's rows wholesale", async () => {
  useScenario("replace");
  const repoPath = await initRepo(
    "https://github.com/fake-owner/replace-repo.git",
  );
  const ref: ForgeRepoRef = {
    kind: "github",
    host: "github.com",
    slug: "fake-owner/replace-repo",
  };
  const t0 = Date.parse("2026-09-14T11:00:00.000Z");
  const adapter = fakeAdapter({
    snapshots: [
      snapshotOf(ref, {
        fetchedAt: new Date(t0).toISOString(),
        issues: [makeIssue(1, "Old issue")],
        pulls: [makePull(7, "Old draft pull", true)],
      }),
      snapshotOf(ref, {
        fetchedAt: new Date(t0 + 10 * 60_000).toISOString(),
        issues: [makeIssue(2, "New issue")],
        pulls: [],
      }),
    ],
  });

  await syncForgeRepo(repoPath, { adapter, now: () => t0 });
  const before = await readProjectSnapshot(repoPath);
  // Draft flag survives the integer-boolean round-trip.
  assert.equal(before.pulls[0]?.isDraft, true);

  await syncForgeRepo(repoPath, {
    adapter,
    force: true,
    now: () => t0 + 60_000,
  });
  const after = await readProjectSnapshot(repoPath);
  assert.deepEqual(
    after.issues.map((i) => i.number),
    [2],
  );
  assert.equal(after.issues[0]?.title, "New issue");
  assert.deepEqual(after.pulls, []);
  assert.equal(after.fetchedAt, new Date(t0 + 10 * 60_000).toISOString());

  const overview = await readOverview();
  assert.equal(overview[0]?.openIssues, 1);
  assert.equal(overview[0]?.openPulls, 0);
});

test("a failing fetch records last_sync_status=failed + error and rethrows", async () => {
  useScenario("failure");
  const repoPath = await initRepo(
    "https://github.com/fake-owner/failing-repo.git",
  );
  const adapter = fakeAdapter({
    failWith: new Error("gh issue list failed: boom"),
  });

  await assert.rejects(
    syncForgeRepo(repoPath, { adapter }),
    /gh issue list failed: boom/,
  );
  assert.equal(adapter.calls.length, 1);

  const snapshot = await readProjectSnapshot(repoPath);
  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.lastSyncStatus, "failed");
  assert.ok(
    snapshot.lastSyncError?.includes("boom"),
    `lastSyncError recorded: ${String(snapshot.lastSyncError)}`,
  );
  assert.deepEqual(snapshot.issues, []);
  assert.deepEqual(snapshot.pulls, []);

  // The link row was persisted before the fetch failed, but no snapshot
  // ever landed — the overview must not fabricate zero counts for it.
  assert.deepEqual(await readOverview(), []);
});

test("a failed force-sync keeps the last good snapshot in the overview", async () => {
  useScenario("stale-but-real");
  const repoPath = await initRepo(
    "https://github.com/fake-owner/stale-repo.git",
  );
  const ref: ForgeRepoRef = {
    kind: "github",
    host: "github.com",
    slug: "fake-owner/stale-repo",
  };
  const t0 = Date.parse("2026-09-14T12:00:00.000Z");
  const fetchedAt = new Date(t0).toISOString();
  // The fake reads config per fetch, so flipping it to failing after the
  // good snapshot landed simulates a later force-sync outage.
  const config: FakeConfig = {
    snapshots: [
      snapshotOf(ref, {
        fetchedAt,
        issues: [makeIssue(1, "Kept issue"), makeIssue(2, "Also kept")],
        pulls: [makePull(5, "Kept pull")],
      }),
    ],
  };
  const adapter = fakeAdapter(config);

  await syncForgeRepo(repoPath, { adapter, now: () => t0 });
  config.failWith = new Error("gh issue list failed: later boom");
  await assert.rejects(
    syncForgeRepo(repoPath, { adapter, force: true, now: () => t0 + 60_000 }),
    /later boom/,
  );

  // recordSyncFailure marks the attempt but never clears lastSyncedAt: the
  // overview keeps the stale-but-real counts rather than dropping to zeros.
  const snapshot = await readProjectSnapshot(repoPath);
  assert.equal(snapshot.lastSyncStatus, "failed");
  assert.equal(snapshot.fetchedAt, fetchedAt);
  assert.deepEqual(await readOverview(), [
    {
      projectPath: repoPath,
      repoRef: ref,
      openIssues: 2,
      openPulls: 1,
      truncated: false,
      fetchedAt,
    },
  ]);
});

test("a project without an origin remote fails with a clear message", async () => {
  useScenario("no-remote");
  const repoPath = await initRepo();
  const adapter = fakeAdapter();
  await assert.rejects(
    syncForgeRepo(repoPath, { adapter }),
    /No git remote configured for this project/,
  );
  assert.equal(adapter.calls.length, 0);
});

test("a non-github remote fails with the unsupported-host message", async () => {
  useScenario("unsupported");
  const repoPath = await initRepo(
    "https://gitlab.com/fake-owner/unsupported-repo.git",
  );
  const adapter = fakeAdapter();
  await assert.rejects(
    syncForgeRepo(repoPath, { adapter }),
    /Forge host unsupported: gitlab — GitHub only for now/,
  );
  assert.equal(adapter.calls.length, 0);
});

test("an unavailable adapter short-circuits before any fetch", async () => {
  useScenario("unavailable");
  const repoPath = await initRepo(
    "https://github.com/fake-owner/unauth-repo.git",
  );
  const adapter = fakeAdapter({ available: false });

  await assert.rejects(
    syncForgeRepo(repoPath, { adapter }),
    /gh not authenticated — run `gh auth login`/,
  );
  assert.equal(adapter.calls.length, 0);
  assert.equal(adapter.probes, 1);

  // An availability failure is not a fetch failure: nothing was recorded as
  // a failed sync — the repo simply never synced.
  const snapshot = await readProjectSnapshot(repoPath);
  assert.equal(snapshot.lastSyncStatus, "never");

  // The link (persisted before the probe ran) has no snapshot — the
  // overview stays empty rather than faking zeros.
  assert.deepEqual(await readOverview(), []);
});

test("readProjectSnapshot distinguishes unknown / unsupported-host / ready", async () => {
  useScenario("statuses");
  const githubRepo = await initRepo(
    "https://github.com/fake-owner/status-repo.git",
  );
  const gitlabRepo = await initRepo(
    "https://gitlab.com/fake-owner/status-repo.git",
  );

  // No link, no remote supplied → nothing known about the project.
  assert.equal((await readProjectSnapshot(githubRepo)).status, "unknown");

  // No link, but the caller supplies the current remote → honest reason.
  const gitlabRemote = parseRemote("https://gitlab.com/fake-owner/status-repo.git");
  assert.ok(gitlabRemote !== null);
  const unsupported = await readProjectSnapshot(gitlabRepo, gitlabRemote);
  assert.equal(unsupported.status, "unsupported-host");
  assert.equal(unsupported.repoRef, null);

  // A github remote on an unlinked project reads as unknown (syncable), not
  // unsupported — github is supported, it just never synced.
  const githubRemote = parseRemote("https://github.com/fake-owner/status-repo.git");
  assert.ok(githubRemote !== null);
  assert.equal(
    (await readProjectSnapshot(githubRepo, githubRemote)).status,
    "unknown",
  );

  // After a real sync the same project reads ready.
  const adapter = fakeAdapter();
  await syncForgeRepo(githubRepo, { adapter });
  assert.equal((await readProjectSnapshot(githubRepo)).status, "ready");
});

test("truncation flags reach the result and the overview's count math", async () => {
  useScenario("truncated");
  const repoPath = await initRepo(
    "https://github.com/fake-owner/busy-repo.git",
  );
  const ref: ForgeRepoRef = {
    kind: "github",
    host: "github.com",
    slug: "fake-owner/busy-repo",
  };
  const fullPage = Array.from({ length: PAGE_LIMIT }, (_, i) =>
    makeIssue(i + 1, `Issue ${i + 1}`),
  );
  const adapter = fakeAdapter({
    snapshots: [snapshotOf(ref, { issues: fullPage, issuesTruncated: true })],
  });

  const result = await syncForgeRepo(repoPath, { adapter });
  assert.equal(result.openIssues, PAGE_LIMIT);
  assert.equal(result.truncated, true);

  // The overview derives truncation from the stored count, not stored flags.
  const overview = await readOverview();
  assert.equal(overview[0]?.openIssues, PAGE_LIMIT);
  assert.equal(overview[0]?.truncated, true);
});

test("syncAllRepos sweeps every github project (links created), skips no-remote/unsupported with reasons, feed rides along", async () => {
  useScenario("sync-all-sweep");
  const fleet = await initFleet("sweep");
  const t0 = Date.parse("2026-09-14T13:00:00.000Z");
  const t0Iso = new Date(t0).toISOString();
  // Named fixture dirs keep the path-sorted run order deterministic:
  // alpha-repo, beta-repo, plain-repo, zforeign-repo.
  const alpha = await initNamedRepo(
    fleet,
    "alpha-repo",
    "https://github.com/fake-owner/alpha-repo.git",
  );
  const beta = await initNamedRepo(
    fleet,
    "beta-repo",
    "https://github.com/fake-owner/beta-repo.git",
  );
  const plain = await initNamedRepo(fleet, "plain-repo");
  const foreign = await initNamedRepo(
    fleet,
    "zforeign-repo",
    "https://gitlab.com/fake-owner/foreign-repo.git",
  );
  const alphaRef: ForgeRepoRef = {
    kind: "github",
    host: "github.com",
    slug: "fake-owner/alpha-repo",
  };
  const betaRef: ForgeRepoRef = {
    kind: "github",
    host: "github.com",
    slug: "fake-owner/beta-repo",
  };
  const adapter = fakeAdapter({
    fetchDelayMs: 30,
    snapshots: [
      snapshotOf(alphaRef, {
        fetchedAt: t0Iso,
        issues: [makeIssue(1, "A one")],
        pulls: [makePull(2, "A two")],
      }),
      snapshotOf(betaRef, {
        fetchedAt: t0Iso,
        issues: [makeIssue(3, "B one")],
      }),
    ],
    feed: {
      fetchedAt: t0Iso,
      items: [makeFeedItem("issue", 1), makeFeedItem("pr", 2)],
      truncated: false,
    },
  });

  const result = await syncAllRepos({ adapter, now: () => t0 });

  assert.equal(result.fetchedAt, t0Iso);
  // All four projects reported, path-sorted — including the two non-github
  // ones as skips with reasons, never as errors or omissions.
  assert.deepEqual(
    result.results.map((r) => r.projectPath),
    [alpha, beta, plain, foreign],
  );
  assert.deepEqual(result.results[0], {
    projectPath: alpha,
    slug: "fake-owner/alpha-repo",
    status: "synced",
    openIssues: 1,
    openPulls: 1,
    truncated: false,
    fetchedAt: t0Iso,
  });
  assert.deepEqual(result.results[1], {
    projectPath: beta,
    slug: "fake-owner/beta-repo",
    status: "synced",
    openIssues: 1,
    openPulls: 0,
    truncated: false,
    fetchedAt: t0Iso,
  });
  assert.deepEqual(result.results[2], {
    projectPath: plain,
    slug: null,
    status: "skipped",
    reason: "no-remote",
  });
  assert.deepEqual(result.results[3], {
    projectPath: foreign,
    slug: null,
    status: "skipped",
    reason: "unsupported-host",
  });

  // The feed rode the same run.
  assert.deepEqual(result.feed, {
    status: "synced",
    itemCount: 2,
    issuesCount: 1,
    pullsCount: 1,
    truncated: false,
  });

  // Strictly sequential: exactly the two github fetches, windows disjoint.
  assert.equal(adapter.calls.length, 2);
  const [first, second] = [...adapter.calls].sort((x, y) => x.start - y.start);
  assert.ok(first !== undefined && second !== undefined, "both fetches recorded");
  assert.ok(
    second.start >= first.end,
    `fetches overlapped: [${first.start},${first.end}) vs [${second.start},${second.end})`,
  );

  // First syncs created the links: the repos listing sees both github repos
  // (slug-ordered, counts from the item tables), the non-github ones never.
  assert.deepEqual(await readRepoLinks(), [
    {
      projectPath: alpha,
      repoRef: alphaRef,
      remoteUrl: "https://github.com/fake-owner/alpha-repo.git",
      lastSyncedAt: t0Iso,
      lastSyncStatus: "ok",
      lastSyncError: null,
      openIssues: 1,
      openPulls: 1,
    },
    {
      projectPath: beta,
      repoRef: betaRef,
      remoteUrl: "https://github.com/fake-owner/beta-repo.git",
      lastSyncedAt: t0Iso,
      lastSyncStatus: "ok",
      lastSyncError: null,
      openIssues: 1,
      openPulls: 0,
    },
  ]);
  assert.equal((await readProjectSnapshot(alpha)).status, "ready");
});

test("syncAllRepos skips min-interval targets and a recently-synced feed; force sweeps both", async () => {
  useScenario("sync-all-interval");
  const fleet = await initFleet("interval");
  const repo = await initNamedRepo(
    fleet,
    "repo",
    "https://github.com/fake-owner/interval-repo.git",
  );
  const ref: ForgeRepoRef = {
    kind: "github",
    host: "github.com",
    slug: "fake-owner/interval-repo",
  };
  const t0 = Date.parse("2026-09-14T13:30:00.000Z");
  const t0Iso = new Date(t0).toISOString();
  const laterIso = new Date(t0 + 10 * 60_000).toISOString();
  const adapter = fakeAdapter({
    snapshots: [
      snapshotOf(ref, { fetchedAt: t0Iso, issues: [makeIssue(1, "First")] }),
      snapshotOf(ref, { fetchedAt: laterIso, issues: [makeIssue(2, "Second")] }),
    ],
    feed: {
      fetchedAt: t0Iso,
      items: [makeFeedItem("issue", 5)],
      truncated: false,
    },
  });

  // Seed both surfaces at t0 (3 minutes before the fleet run).
  await syncForgeRepo(repo, { adapter, now: () => t0 });
  await syncUserFeed({ adapter, now: () => t0 });
  assert.equal(adapter.calls.length, 1);
  assert.equal(adapter.feedCalls, 1);

  // Unforced at t0+3min: the repo AND the feed are inside their interval —
  // skipped rows, zero new fetches, never errors.
  const skipped = await syncAllRepos({ adapter, now: () => t0 + 3 * 60_000 });
  assert.deepEqual(skipped.results, [
    { projectPath: repo, slug: ref.slug, status: "skipped" },
  ]);
  assert.deepEqual(skipped.feed, { status: "skipped" });
  assert.equal(adapter.calls.length, 1);
  assert.equal(adapter.feedCalls, 1);

  // Forced at the same moment: both sweep.
  const forced = await syncAllRepos({
    adapter,
    force: true,
    now: () => t0 + 3 * 60_000,
  });
  assert.deepEqual(forced.results, [
    {
      projectPath: repo,
      slug: ref.slug,
      status: "synced",
      openIssues: 1,
      openPulls: 0,
      truncated: false,
      fetchedAt: laterIso,
    },
  ]);
  assert.deepEqual(forced.feed, {
    status: "synced",
    itemCount: 1,
    issuesCount: 1,
    pullsCount: 0,
    truncated: false,
  });
  assert.equal(adapter.calls.length, 2);
  assert.equal(adapter.feedCalls, 2);
});

test("a failing repo is isolated: the rest of the fleet and the feed still complete", async () => {
  useScenario("sync-all-failure");
  const fleet = await initFleet("failure");
  const alpha = await initNamedRepo(
    fleet,
    "alpha-repo",
    "https://github.com/fake-owner/fail-repo.git",
  );
  const beta = await initNamedRepo(
    fleet,
    "beta-repo",
    "https://github.com/fake-owner/ok-repo.git",
  );
  const adapter = fakeAdapter({
    failWith: new Error("gh issue list failed: fleet boom"),
    failSlugs: ["fake-owner/fail-repo"],
    failFeedWith: new Error("gh search issues failed: feed boom"),
  });

  const result = await syncAllRepos({ adapter });

  // alpha (path-first) failed with the recorded error; beta still synced —
  // one repo's outage never aborts the sweep.
  assert.deepEqual(result.results[0], {
    projectPath: alpha,
    slug: "fake-owner/fail-repo",
    status: "failed",
    error: "gh issue list failed: fleet boom",
  });
  assert.equal(result.results[1]?.projectPath, beta);
  assert.equal(result.results[1]?.status, "synced");
  assert.equal(result.results[1]?.openIssues, 1);
  assert.equal(adapter.calls.length, 2);

  // The feed failed too, isolated in its own summary — never a thrown run.
  assert.equal(result.feed.status, "failed");
  assert.equal(result.feed.error, "gh search issues failed: feed boom");

  // The failed FIRST sync still left a link — listed with its honest failure
  // state, never fabricated as fresh (lastSyncedAt stays null, counts zero).
  const links = await readRepoLinks();
  assert.equal(links.length, 2);
  assert.deepEqual(links[0], {
    projectPath: alpha,
    repoRef: {
      kind: "github",
      host: "github.com",
      slug: "fake-owner/fail-repo",
    },
    remoteUrl: "https://github.com/fake-owner/fail-repo.git",
    lastSyncedAt: null,
    lastSyncStatus: "failed",
    lastSyncError: "gh issue list failed: fleet boom",
    openIssues: 0,
    openPulls: 0,
  });
});

test("syncAllRepos over an empty workspace: no project rows, zero snapshot fetches, feed still runs", async () => {
  useScenario("sync-all-empty");
  const t0 = Date.parse("2026-09-14T14:00:00.000Z");
  const adapter = fakeAdapter();

  const result = await syncAllRepos({ adapter, now: () => t0 });

  assert.deepEqual(result.results, []);
  assert.equal(adapter.calls.length, 0);
  assert.equal(result.fetchedAt, new Date(t0).toISOString());
  // The feed step rides every run — a fresh scenario's feed never synced, so
  // it fetches (the only adapter traffic of the run).
  assert.equal(adapter.feedCalls, 1);
  assert.deepEqual(result.feed, {
    status: "synced",
    itemCount: 0,
    issuesCount: 0,
    pullsCount: 0,
    truncated: false,
  });
});

after(() => {
  closeDb();
  rmSync(SANDBOX, { recursive: true, force: true });
  rmSync(REPOS, { recursive: true, force: true });
});
