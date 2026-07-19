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
      git(["status", "--porcelain"], dir),
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
