import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

import { closeDb, dbFile, getDb } from "@workspace-welcome/db";

import { parseRemote } from "../detect";
import { PAGE_LIMIT } from "./constants";
import { readOverview, readProjectSnapshot } from "./db";
import { syncForgeRepo } from "./sync";
import type {
  ForgeAdapter,
  ForgeIssue,
  ForgePull,
  ForgeRepoRef,
  ForgeSnapshot,
} from "./types";

/**
 * syncForgeRepo + forge DB persistence tests
 * (`pnpm --filter @workspace-welcome/api test:forge`).
 *
 * Isolation: XDG_CONFIG_HOME/XDG_DATA_HOME point at mkdtemp dirs under
 * os.tmpdir() BEFORE any db call — the real user dirs are never touched
 * (asserted in useScenario, Phase-3 idiom). Git fixtures are throwaway
 * `git init` repos under a second temp root: LOCAL git only — the remote URL
 * is never contacted and the real gh CLI adapter is never invoked; every
 * sync goes through the in-file fake adapter below.
 */

const execFileAsync = promisify(execFile);

const SANDBOX = mkdtempSync(join(tmpdir(), "ww-forge-sync-"));
const REPOS = mkdtempSync(join(tmpdir(), "ww-forge-repos-"));

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

// --- Fake adapter --------------------------------------------------------------

interface FakeFetchCall {
  ref: ForgeRepoRef;
  start: number;
  end: number;
}

interface FakeRecorder {
  calls: FakeFetchCall[];
  probes: number;
}

interface FakeConfig {
  available?: boolean;
  /** Simulated fetch duration so overlap (or its absence) is measurable. */
  fetchDelayMs?: number;
  /** Snapshots consumed in call order; later calls reuse the last one. */
  snapshots?: ForgeSnapshot[];
  failWith?: Error;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function fakeAdapter(config: FakeConfig = {}): ForgeAdapter & FakeRecorder {
  const calls: FakeFetchCall[] = [];
  let probeCount = 0;
  const adapter: ForgeAdapter & FakeRecorder = {
    kind: "github",
    style: "cli",
    calls,
    get probes() {
      return probeCount;
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
      if (config.failWith !== undefined) throw config.failWith;
      const queued = config.snapshots?.[calls.length - 1];
      return (
        queued ??
        snapshotOf(ref, { issues: [makeIssue(1, "Default issue")] })
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

after(() => {
  closeDb();
  rmSync(SANDBOX, { recursive: true, force: true });
  rmSync(REPOS, { recursive: true, force: true });
});
