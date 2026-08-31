import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { z } from "zod";

import { parseRemote } from "./detect";
import { ideStatus } from "./ide";
import type {
  BranchList,
  CommitLogEntry,
  GitInfo,
  SwitchSafety,
} from "./types";

/**
 * Git inspection via the `git` CLI.
 *
 * Every operation is wrapped: if git is missing, the dir isn't a repo, or any
 * command fails, we return a degraded `GitInfo` rather than throwing. The UI
 * degrades gracefully on `isRepo: false`.
 */

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 4000;

interface GitCommandResult {
  stdout: string;
  stderr: string;
}

async function git(
  args: string[],
  cwd: string,
): Promise<GitCommandResult | null> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
    return { stdout, stderr };
  } catch {
    return null;
  }
}

function trim(s: string): string {
  return s.replace(/\s+$/g, "");
}

/**
 * A branch name safe to hand to `git fetch origin <branch>` / `git switch
 * <branch>` as a single argv element. Mirrors git's own refname rules for the
 * cases that matter here: no option-looking names (leading `-`), no
 * whitespace/control characters, no refspec/glob syntax (`~ ^ : ? * [ \`),
 * no `..` range syntax, and no trailing `.` / `/` / `.lock`. Applied on the
 * fetchBranch and switchBranch inputs so mistakes surface as validation
 * errors, not opaque git failures.
 */
export const branchNameSchema = z
  .string()
  .min(1, "Branch name is required")
  .max(200, "Branch name must be 200 characters or fewer")
  .refine(
    (name) => !name.startsWith("-"),
    "Branch name cannot start with a dash",
  )
  .refine(
    (name) => !/[\s\u0000-\u001f\u007f]/.test(name),
    "Branch name cannot contain whitespace or control characters",
  )
  .refine(
    (name) => !/[~^:?*\\[\`]/.test(name) && !name.includes(".."),
    "Branch name cannot contain refspec characters or '..'",
  )
  .refine(
    (name) =>
      !name.endsWith(".") && !name.endsWith("/") && !name.endsWith(".lock"),
    "Branch name cannot end with '.', '/' or '.lock'",
  );

/** Tiny non-crypto string hash (djb2) — enough to fold porcelain output. */
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/**
 * Cheap working-tree fingerprint for a git repo: a stable hash of
 * `git status --porcelain` output. Used by the scan cache to detect uncommitted
 * edits to tracked files (which don't bump any directory mtime on Linux)
 * without a full rescan.
 *
 * `--untracked-files=no` keeps the probe focused on tracked-file content
 * changes — the only case stat sentinels miss. New/deleted files already
 * surface via the project dir mtime, so skipping untracked here is safe and
 * faster (~15% on this repo set).
 *
 * Returns null when the dir isn't a repo or git fails — callers should treat
 * that as "no git signal available" and fall back to stat-based invalidation.
 *
 * NB: `--no-optional-locks` avoids contending on the index lock when a git
 * process (or editor integration) is holding it, and avoids writing the index
 * refresh cache (which would bump `.git/` mtimes and create fingerprint drift).
 */
export async function gitStatusHash(dir: string): Promise<string | null> {
  const res = await git(
    ["--no-optional-locks", "status", "--porcelain", "--untracked-files=no"],
    dir,
  );
  if (!res) return null;
  return hashString(res.stdout);
}

/**
 * Inspect a directory's git state in a handful of git calls.
 * Cheap enough to run across many projects in parallel.
 */
export async function gitInspect(dir: string): Promise<GitInfo> {
  const isRepo = await git(["rev-parse", "--is-inside-work-tree"], dir);
  if (!isRepo || trim(isRepo.stdout) !== "true") {
    return emptyGit();
  }

  const [branchRes, remoteRes, countsRes, dirtyRes, lastCommitRes] =
    await Promise.all([
      git(["symbolic-ref", "--short", "HEAD"], dir),
      git(["config", "--get", "remote.origin.url"], dir),
      git(["rev-list", "--left-right", "--count", "@{u}...HEAD"], dir),
      // --no-optional-locks: don't write the index lock/refresh cache, which
      // would bump `.git/` mtimes and create spurious fingerprint drift between
      // a cold scan and the next warm probe.
      git(["--no-optional-locks", "status", "--porcelain"], dir),
      git(
        [
          "log",
          "-1",
          "--format=%H%x09%s%x09%an%x09%aI",
          "--date=iso-strict",
        ],
        dir,
      ),
    ]);

  const branch = branchRes ? trim(branchRes.stdout) || null : null;

  const remoteUrl = remoteRes ? trim(remoteRes.stdout) || null : null;
  const remote = remoteUrl ? parseRemote(remoteUrl) : null;

  // rev-list --left-right --count @{u}...HEAD prints "<behind>\t<ahead>".
  let ahead: number | null = null;
  let behind: number | null = null;
  if (countsRes) {
    const [behindStr, aheadStr] = trim(countsRes.stdout).split("\t");
    if (behindStr !== undefined) {
      const n = Number.parseInt(behindStr, 10);
      behind = Number.isFinite(n) ? n : null;
    }
    if (aheadStr !== undefined) {
      const n = Number.parseInt(aheadStr, 10);
      ahead = Number.isFinite(n) ? n : null;
    }
  }

  let dirtyCount: number | null = null;
  if (dirtyRes) {
    const lines = dirtyRes.stdout
      .split("\n")
      .filter((line) => line.length > 0);
    dirtyCount = lines.length;
  }

  let lastCommit: GitInfo["lastCommit"] = null;
  if (lastCommitRes) {
    const line = trim(lastCommitRes.stdout);
    if (line.length > 0) {
      // %H%x09%s%x09%an%x09%aI
      const [_hash, subject, author, isoDate] = line.split("\t");
      if (subject !== undefined && author !== undefined) {
        lastCommit = {
          message: subject,
          author,
          date: isoDate || null,
        };
      }
    }
  }

  return {
    isRepo: true,
    branch,
    remote,
    ahead,
    behind,
    dirtyCount,
    lastCommit,
  };
}

function emptyGit(): GitInfo {
  return {
    isRepo: false,
    branch: null,
    remote: null,
    ahead: null,
    behind: null,
    dirtyCount: null,
    lastCommit: null,
  };
}

// --- Branch / history / safety inspection ------------------------------------

const ORIGIN_PREFIX = "origin/";
const ORIGIN_HEAD = "origin/HEAD";

/** Sorted, trimmed ref names of a `git branch` invocation. Empty on failure. */
async function branchLines(args: string[], dir: string): Promise<string[]> {
  const res = await git(["branch", ...args], dir);
  if (!res) return [];
  return res.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Local and origin branch names for the fetch/switch pickers. Remote names
 * lose their `origin/` prefix (`origin/main` → `main`); the `origin/HEAD`
 * symref is dropped and refs from any other remote are kept as-is. Never
 * throws: a non-repo or a git failure degrades to empty lists.
 */
export async function listBranches(dir: string): Promise<BranchList> {
  // %(refname:lstrip=N) rather than %(refname:short): git's shortening
  // renders the origin/HEAD symref as bare "origin", while lstrip is
  // mechanical and keeps "origin/HEAD" — which we drop explicitly below.
  const [local, remoteRaw] = await Promise.all([
    branchLines(["--format=%(refname:lstrip=2)"], dir),
    branchLines(["-r", "--format=%(refname:lstrip=2)"], dir),
  ]);
  const remote = remoteRaw
    .filter((name) => name !== ORIGIN_HEAD)
    .map((name) =>
      name.startsWith(ORIGIN_PREFIX) ? name.slice(ORIGIN_PREFIX.length) : name,
    )
    .sort((a, b) => a.localeCompare(b));
  return { local, remote };
}

/**
 * Fresh probe for the switch-branch confirmation dialog: signals that an
 * agent (or any process) may be mid-work in the repo — uncommitted changes,
 * a git operation holding the index lock, a recently-written index, or the
 * shared web IDE being up. Read-only: `--no-optional-locks` never contends
 * on or writes the index, and the scan cache is left alone.
 */
export async function switchSafety(dir: string): Promise<SwitchSafety> {
  const [statusRes, gitLock, indexMtimeMs, ide] = await Promise.all([
    git(["--no-optional-locks", "status", "--porcelain"], dir),
    stat(join(dir, ".git", "index.lock")).then(
      () => true,
      () => false,
    ),
    stat(join(dir, ".git", "index")).then(
      (s) => s.mtimeMs,
      () => null,
    ),
    ideStatus(),
  ]);

  const dirtyCount = statusRes
    ? statusRes.stdout.split("\n").filter((line) => line.length > 0).length
    : 0;

  return {
    dirtyCount,
    gitLock,
    indexIdleSeconds:
      indexMtimeMs === null
        ? null
        : Math.max(0, Math.floor((Date.now() - indexMtimeMs) / 1000)),
    ideRunning: ide.running,
  };
}

/** Default history depth for the graph block. */
const DEFAULT_COMMIT_LOG_LIMIT = 200;

/** Field separator inside one commit record (NUL — cannot appear in git text). */
const FIELD_SEP = "\x00";
/** Record separator between commits (ASCII RS). */
const RECORD_SEP = "\x1e";

/**
 * Parse a `%d` decorations field (" (HEAD -> main, origin/main, tag: v1)")
 * into ref names plus the HEAD marker. `HEAD -> <name>` contributes the
 * branch name and sets isHead; a bare `HEAD` (detached) sets isHead and is
 * kept as a name; everything else (`origin/main`, `tag: v1`) is kept as-is.
 */
function parseDecorations(field: string): { refs: string[]; isHead: boolean } {
  const trimmed = field.trim();
  if (!trimmed.startsWith("(") || !trimmed.endsWith(")")) {
    return { refs: [], isHead: false };
  }
  const refs: string[] = [];
  let isHead = false;
  for (const raw of trimmed.slice(1, -1).split(",")) {
    const entry = raw.trim();
    if (entry.length === 0) continue;
    if (entry === "HEAD" || entry.startsWith("HEAD -> ")) {
      isHead = true;
      refs.push(
        entry.startsWith("HEAD -> ")
          ? entry.slice("HEAD -> ".length).trim()
          : entry,
      );
      continue;
    }
    refs.push(entry);
  }
  return { refs, isHead };
}

/**
 * Commit history for the graph block, newest first (`--date-order`).
 *
 * Each commit is one record prefixed with RS (%x1e) so records split
 * unambiguously, fields separated by NUL (%x00) which cannot occur inside
 * git's commit metadata: hash, parents, decorations, subject, author name,
 * author timestamp. Records that don't parse (truncated output, git
 * failure) are skipped rather than throwing; a non-repo or an empty repo
 * yields [].
 */
export async function commitLog(
  dir: string,
  limit: number = DEFAULT_COMMIT_LOG_LIMIT,
): Promise<CommitLogEntry[]> {
  const res = await git(
    [
      "log",
      "--date-order",
      `--max-count=${limit}`,
      "--format=%x1e%H%x00%P%x00%d%x00%s%x00%an%x00%at",
    ],
    dir,
  );
  if (!res) return [];

  const entries: CommitLogEntry[] = [];
  for (const record of res.stdout.split(RECORD_SEP)) {
    const fields = record.split(FIELD_SEP);
    const hash = fields[0]?.trim();
    const subject = fields[3];
    const timestamp = Number.parseInt(fields[5]?.trim() ?? "", 10);
    if (
      hash === undefined ||
      hash.length === 0 ||
      subject === undefined ||
      !Number.isFinite(timestamp)
    ) {
      continue;
    }
    const { refs, isHead } = parseDecorations(fields[2] ?? "");
    entries.push({
      hash,
      parents: (fields[1] ?? "").split(" ").filter((p) => p.length > 0),
      subject,
      author: fields[4] ?? "",
      timestamp,
      refs,
      isHead,
    });
  }
  return entries;
}

// --- Mutating actions (fetch / pull) ----------------------------------------

/**
 * Network-bound git actions get a much longer leash than inspection calls —
 * a fetch over a slow link can legitimately take tens of seconds.
 */
const NETWORK_TIMEOUT_MS = 60_000;

export interface GitActionResult {
  ok: boolean;
  /**
   * Trimmed stdout+stderr. git writes its human-facing summaries ("Fast-forward",
   * "Already up to date.", conflict reasons) to stderr, so both are merged and
   * surfaced to the client for toasts.
   */
  output: string;
}

async function gitAction(
  args: string[],
  cwd: string,
): Promise<GitActionResult> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      timeout: NETWORK_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
    return {
      ok: true,
      output: [trim(stdout), trim(stderr)].filter(Boolean).join("\n"),
    };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const output =
      [e.stdout, e.stderr]
        .map((s) => (s ? trim(s) : ""))
        .filter(Boolean)
        .join("\n") || e.message || "git failed";
    return { ok: false, output };
  }
}

/** Fetch all remotes, pruning deleted upstream branches. */
export function gitFetch(dir: string): Promise<GitActionResult> {
  return gitAction(["fetch", "--all", "--prune"], dir);
}

/**
 * Fast-forward-only pull. Deliberately refuses to create merge commits or
 * rebase — if the branches diverged, the user reconciles from a terminal, not
 * through a web UI.
 */
export function gitPull(dir: string): Promise<GitActionResult> {
  return gitAction(["pull", "--ff-only"], dir);
}

/**
 * Push the current branch to origin and set upstream. `-u origin HEAD` covers
 * both first-push (no upstream yet) and the already-tracked case with one
 * standard command — HEAD resolves to the checked-out branch name on origin.
 */
export function gitPush(dir: string): Promise<GitActionResult> {
  return gitAction(["push", "-u", "origin", "HEAD"], dir);
}

/**
 * Fetch a single branch from origin. An unknown ref fails in git with a clear
 * message that surfaces through the standard `{ ok, output }` — the caller
 * validated the name against `branchNameSchema` first.
 */
export function gitFetchBranch(
  dir: string,
  branch: string,
): Promise<GitActionResult> {
  return gitAction(["fetch", "origin", branch], dir);
}

/**
 * Switch branches. git's DWIM creates a local branch tracking the unique
 * `origin/<branch>` when no local one exists; it refuses (rather than
 * clobbering) when the switch would conflict with uncommitted changes.
 */
export function gitSwitchBranch(
  dir: string,
  branch: string,
): Promise<GitActionResult> {
  return gitAction(["switch", branch], dir);
}
