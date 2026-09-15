import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

import { closeDb, dbFile } from "@workspace-welcome/db";

import { getCloneJob, startCloneJob } from "./clone-job";
import type { CloneJobSnapshot } from "./clone-job";
import {
  buildCloneCommand,
  cloneInputSchema,
  deriveRepoName,
  normalizeCloneInput,
} from "./clone-options";
import { newId } from "./id";
import { invalidateScanCache } from "./scan-cache";
import { mutateStore } from "./store";

/**
 * clone-job + clone-options tests (`pnpm --filter @workspace-welcome/api
 * test:clone`).
 *
 * Isolation: XDG_CONFIG_HOME/XDG_DATA_HOME point at mkdtemp dirs under
 * os.tmpdir() BEFORE any db/store call — the real user dirs are never touched
 * (asserted in useScenario, store.import.test.ts idiom). Git fixtures are a
 * LOCAL bare "remote" plus a seed repo under a second temp root: local git
 * only, zero network. The user-facing schema deliberately accepts just
 * ssh/https/scp-like URLs, while the job itself clones from anywhere git
 * can — so the job tests pass local fixture paths straight to startCloneJob,
 * the same way the forge tests run through in-file fakes instead of the real
 * gh CLI.
 */

const execFileAsync = promisify(execFile);

const SANDBOX = mkdtempSync(join(tmpdir(), "ww-clone-job-"));
const REPOS = mkdtempSync(join(tmpdir(), "ww-clone-repos-"));

/** Redirect both XDG vars at a fresh scenario and drop every open handle. */
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

/** Register a throwaway dir as the scenario's one store root. */
async function registerRoot(name: string): Promise<string> {
  const dir = mkdtempSync(join(REPOS, `root-${name}-`));
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

async function commitAll(dir: string, message: string): Promise<void> {
  writeFileSync(join(dir, `${message}.txt`), message, "utf8");
  await execFileAsync("git", ["add", "."], { cwd: dir });
  await execFileAsync(
    "git",
    [
      "-c",
      "user.email=ww@test",
      "-c",
      "user.name=ww-test",
      "commit",
      "-m",
      message,
    ],
    { cwd: dir },
  );
}

/**
 * A local stand-in remote: a bare repo whose `main` and `feature` branches
 * each carry one commit. Cloning from this path exercises the exact code
 * path a real remote takes, minus the network.
 */
async function initRemoteFixture(): Promise<string> {
  const origin = mkdtempSync(join(REPOS, "origin-"));
  await execFileAsync("git", ["init", "--bare", "-b", "main", origin]);

  const seed = mkdtempSync(join(REPOS, "seed-"));
  await execFileAsync("git", ["init", "-b", "main", seed]);
  await execFileAsync("git", ["remote", "add", "origin", origin], {
    cwd: seed,
  });
  await commitAll(seed, "main-commit");
  await execFileAsync("git", ["push", "-u", "origin", "main"], { cwd: seed });
  await execFileAsync("git", ["checkout", "-b", "feature"], { cwd: seed });
  await commitAll(seed, "feature-commit");
  await execFileAsync("git", ["push", "-u", "origin", "feature"], {
    cwd: seed,
  });
  return origin;
}

/** The currently checked-out branch of a repo on disk. */
async function currentBranch(dir: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["rev-parse", "--abbrev-ref", "HEAD"],
    { cwd: dir },
  );
  return stdout.trim();
}

/** Poll the in-memory registry until the job reaches a terminal status. */
async function waitForSettled(jobId: string): Promise<CloneJobSnapshot> {
  for (let i = 0; i < 500; i++) {
    const snap = getCloneJob(jobId);
    assert.ok(snap !== null, "job must stay in the registry while polled");
    if (snap.status !== "running") return snap;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("clone job did not settle in time");
}

// --- Job tests -----------------------------------------------------------------

useScenario("a");
let origin: string;
let root: string;

test("clones the default branch into a registered root", async () => {
  origin = await initRemoteFixture();
  root = await registerRoot("a");

  const { jobId } = startCloneJob({
    url: origin,
    root,
    directoryName: "cloned",
    branch: undefined,
  });
  const snap = await waitForSettled(jobId);

  assert.equal(snap.status, "success");
  const dest = join(root, "cloned");
  assert.ok(existsSync(join(dest, ".git")), "cloned repo exists on disk");
  assert.equal(await currentBranch(dest), "main");
  assert.equal(snap.result?.projectDirectory, dest);
  assert.equal(snap.result?.reproducibleCommand, `git clone -- ${origin} ${dest}`);
  assert.ok(
    typeof snap.result?.elapsedTimeMs === "number" &&
      snap.result.elapsedTimeMs >= 0,
  );
});

test("clones a chosen branch", async () => {
  const { jobId } = startCloneJob({
    url: origin,
    root,
    directoryName: "on-feature",
    branch: "feature",
  });
  const snap = await waitForSettled(jobId);

  assert.equal(snap.status, "success");
  assert.equal(await currentBranch(join(root, "on-feature")), "feature");
  assert.equal(
    snap.result?.reproducibleCommand,
    `git clone --branch feature -- ${origin} ${join(root, "on-feature")}`,
  );
});

test("a pre-existing directory is refused, never touched, never removed", async () => {
  const dest = join(root, "taken");
  mkdirSync(dest);
  writeFileSync(join(dest, "keep.txt"), "keep", "utf8");

  const { jobId } = startCloneJob({
    url: origin,
    root,
    directoryName: "taken",
    branch: undefined,
  });
  const snap = await waitForSettled(jobId);

  assert.equal(snap.status, "error");
  assert.match(snap.error ?? "", /already exists/);
  assert.ok(!snap.error?.includes("partial clone was removed"));
  assert.ok(existsSync(join(dest, "keep.txt")), "pre-existing dir untouched");
});

test("a failed clone removes its partial directory and reports git's own reason", async () => {
  const { jobId } = startCloneJob({
    url: join(REPOS, "not-a-repo"),
    root,
    directoryName: "doomed",
    branch: undefined,
  });
  const snap = await waitForSettled(jobId);

  assert.equal(snap.status, "error");
  assert.match(snap.error ?? "", /git clone failed/);
  assert.match(snap.error ?? "", /partial clone was removed/);
  assert.ok(!existsSync(join(root, "doomed")), "partial clone cleaned up");
});

test("an unregistered root is refused before anything spawns", async () => {
  useScenario("no-root");
  const outside = mkdtempSync(join(REPOS, "outside-"));

  const { jobId } = startCloneJob({
    url: "https://example.invalid/owner/repo.git",
    root: outside,
    directoryName: "nowhere",
    branch: undefined,
  });
  const snap = await waitForSettled(jobId);

  assert.equal(snap.status, "error");
  assert.match(snap.error ?? "", /Not a tracked directory/);
  assert.ok(!existsSync(join(outside, "nowhere")));
});

test("single-flight: a second start while one runs is rejected", async () => {
  useScenario("sf");
  const sfOrigin = await initRemoteFixture();
  const sfRoot = await registerRoot("sf");

  // Deterministic window: runJob suspends at its first await (readStore) the
  // moment it is called, so the job is guaranteed "running" when the second
  // synchronous start arrives.
  const { jobId } = startCloneJob({
    url: sfOrigin,
    root: sfRoot,
    directoryName: "busy",
    branch: undefined,
  });
  assert.throws(
    () =>
      startCloneJob({
        url: sfOrigin,
        root: sfRoot,
        directoryName: "second",
        branch: undefined,
      }),
    /A clone job is already running/,
  );
  assert.equal((await waitForSettled(jobId)).status, "success");
});

// --- Schema / pure option tests --------------------------------------------------

test("cloneInputSchema accepts the remote grammars and clean names", () => {
  for (const url of [
    "https://github.com/owner/repo.git",
    "http://gitlab.example.com:8443/owner/repo",
    "ssh://git@github.com/owner/repo.git",
    "ssh://host:2222/owner/repo",
    "git@github.com:owner/repo.git",
  ]) {
    const check = cloneInputSchema.safeParse({
      url,
      root: "/projects",
      directoryName: "repo",
      branch: "",
    });
    assert.ok(check.success, `url should parse: ${url}`);
  }
  const branch = cloneInputSchema.safeParse({
    url: "https://github.com/owner/repo.git",
    root: "/projects",
    directoryName: "repo",
    branch: "feature/x",
  });
  assert.ok(branch.success, "slash-namespaced branch is a valid ref");
});

test("cloneInputSchema rejects option-looking, helper-syntax, and local-path urls", () => {
  for (const url of [
    "--upload-pack=sh",
    "ext::sh -c id",
    "/home/you/repos/repo.git",
    "not a url",
    "",
  ]) {
    const check = cloneInputSchema.safeParse({
      url,
      root: "/projects",
      directoryName: "repo",
      branch: "",
    });
    assert.ok(!check.success, `url should be rejected: ${url}`);
  }
});

test("cloneInputSchema maps bad branch names onto the branch field", () => {
  const check = cloneInputSchema.safeParse({
    url: "https://github.com/owner/repo.git",
    root: "/projects",
    directoryName: "repo",
    branch: "../evil",
  });
  assert.ok(!check.success);
  const issue = check.error?.issues.find((i) => i.path.includes("branch"));
  assert.ok(issue, "branch issue mapped to the branch field");
});

test("normalizeCloneInput turns an empty branch into the default-branch clone", () => {
  assert.deepEqual(
    normalizeCloneInput({
      url: "https://github.com/owner/repo.git",
      root: "/projects",
      directoryName: "repo",
      branch: "",
    }).branch,
    undefined,
  );
});

test("deriveRepoName extracts the repo segment across the grammars", () => {
  assert.equal(
    deriveRepoName("https://github.com/alice/wpterminate.git"),
    "wpterminate",
  );
  assert.equal(deriveRepoName("git@host:owner/repo.git"), "repo");
  assert.equal(deriveRepoName("ssh://git@host:22/owner/repo"), "repo");
  assert.equal(deriveRepoName("https://host/owner/repo/"), "repo");
  assert.equal(deriveRepoName("garbage"), "");
  assert.equal(deriveRepoName(""), "");
});

test("buildCloneCommand renders flags, placeholders, and the end-of-options guard", () => {
  const base = {
    url: "git@host:owner/repo.git",
    root: "/projects/ws",
    directoryName: "repo",
  };
  assert.equal(
    buildCloneCommand({ ...base, branch: "dev" }),
    "git clone --branch dev -- git@host:owner/repo.git /projects/ws/repo",
  );
  assert.equal(
    buildCloneCommand({ ...base, root: "/projects/ws/", branch: undefined }),
    "git clone -- git@host:owner/repo.git /projects/ws/repo",
  );
  assert.equal(
    buildCloneCommand({
      url: "  ",
      root: "",
      directoryName: "",
      branch: "",
    }),
    "git clone -- <url> <root>/<name>",
  );
});

after(() => {
  closeDb();
  rmSync(SANDBOX, { recursive: true, force: true });
  rmSync(REPOS, { recursive: true, force: true });
});
