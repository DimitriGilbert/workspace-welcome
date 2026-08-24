import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { parseRemote } from "./detect";
import type { GitInfo } from "./types";

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
