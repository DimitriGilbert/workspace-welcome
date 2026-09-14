import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { RemoteInfo } from "../types";
import {
  AVAILABILITY_CACHE_MS,
  CALL_TIMEOUT_MS,
  PAGE_LIMIT,
} from "./constants";
import { isTruncated, parseIssueListJson, parsePullListJson } from "./parse";
import type {
  ForgeAdapter,
  ForgeFetchOptions,
  ForgeRepoRef,
  ForgeSnapshot,
} from "./types";

/**
 * GitHub adapter over the local `gh` CLI (gh 2.x), following the execFile
 * pattern of ../git.ts — promisify(execFile), per-call timeout + maxBuffer,
 * errors narrowed structurally and rewrapped so no raw exec error escapes.
 *
 * Unlike git.ts's inspection calls (which degrade to null), a failed
 * fetchSnapshot THROWS a contextual Error — the sync service must see the
 * failure to record last_sync_error and surface the toast.
 *
 * GitHub-account discipline: every gh invocation is user-visible sync work
 * against a rate-limited account. The two list calls inside one snapshot run
 * strictly sequentially (never two gh processes at once), and the auth probe
 * is cached for AVAILABILITY_CACHE_MS so a down probe is never re-hammered.
 * This module is exercised by fixtures/fake adapters only during development;
 * the single live smoke lives in Phase 8.
 */

const execFileAsync = promisify(execFile);

const MAX_BUFFER_BYTES = 1024 * 1024;

/** Capped so a sync-failure toast stays readable — one line, ~300 chars. */
const EXCERPT_MAX_CHARS = 300;

function excerpt(text: string): string {
  const collapsed = text.trim().replace(/\s+/g, " ");
  return collapsed.length <= EXCERPT_MAX_CHARS
    ? collapsed
    : `${collapsed.slice(0, EXCERPT_MAX_CHARS)}…`;
}

function commandLabel(args: readonly string[]): string {
  return `gh ${args.join(" ")}`;
}

/** Wrap an exec failure (spawn error, non-zero exit, timeout) with context. */
function ghFailure(args: readonly string[], err: unknown): Error {
  const e = err as { stderr?: string; message?: string };
  const detail =
    [e.stderr, e.message]
      .map((s) => (s ? excerpt(s) : ""))
      .filter((s) => s.length > 0)
      .join(" — ") || "no error output";
  return new Error(`${commandLabel(args)} failed: ${detail}`);
}

/** Run one gh command and return its JSON.parse'd stdout. Throws on failure. */
async function ghJson(args: string[]): Promise<unknown> {
  let stdout: string;
  try {
    const res = await execFileAsync("gh", args, {
      timeout: CALL_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER_BYTES,
    });
    stdout = res.stdout;
  } catch (err) {
    throw ghFailure(args, err);
  }
  try {
    return JSON.parse(stdout) as unknown;
  } catch {
    throw new Error(
      `${commandLabel(args)} failed: unparseable JSON output — ${excerpt(stdout)}`,
    );
  }
}

// --- Availability probe --------------------------------------------------

/** Module cache for the `gh auth status` probe; both outcomes are cached. */
let availabilityProbe: { ok: boolean; probedAt: number } | null = null;

/**
 * `gh auth status`, interpreted purely by exit code (stdout/stderr are gh's
 * human chatter and discarded). A missing binary, a timeout and a logged-out
 * CLI are all the same answer here: unavailable. Both positive and negative
 * results stick for AVAILABILITY_CACHE_MS — callers (the sync service's
 * sequential queue) may ask freely without re-probing.
 */
async function isAvailable(): Promise<boolean> {
  const now = Date.now();
  if (
    availabilityProbe !== null &&
    now - availabilityProbe.probedAt < AVAILABILITY_CACHE_MS
  ) {
    return availabilityProbe.ok;
  }
  let ok = false;
  try {
    await execFileAsync("gh", ["auth", "status"], {
      timeout: CALL_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER_BYTES,
    });
    ok = true;
  } catch {
    ok = false;
  }
  availabilityProbe = { ok, probedAt: now };
  return ok;
}

// --- Adapter ----------------------------------------------------------------

export const ghCliAdapter: ForgeAdapter = {
  kind: "github",
  style: "cli",

  matches(remote: RemoteInfo): boolean {
    return remote.host === "github";
  },

  isAvailable,

  async fetchSnapshot(
    ref: ForgeRepoRef,
    opts?: ForgeFetchOptions,
  ): Promise<ForgeSnapshot> {
    const pageLimit = opts?.pageLimit ?? PAGE_LIMIT;
    // `--repo` takes gh's own OWNER/REPO selector — the ref.slug as-is. The
    // CLI targets github.com implicitly; ref.host is registry/DB identity and
    // is never serialized into a URL here.
    // Strictly sequential: the issue call fully settles before the pr call
    // starts — never two gh invocations in flight for one snapshot.
    const issues = parseIssueListJson(
      await ghJson([
        "issue",
        "list",
        "--repo",
        ref.slug,
        "--state",
        "open",
        "--limit",
        String(pageLimit),
        "--json",
        "number,title,state,author,labels,updatedAt,url,comments",
      ]),
    );
    const pulls = parsePullListJson(
      await ghJson([
        "pr",
        "list",
        "--repo",
        ref.slug,
        "--state",
        "open",
        "--limit",
        String(pageLimit),
        "--json",
        "number,title,state,author,isDraft,reviewDecision,labels,updatedAt,url",
      ]),
    );
    return {
      ref,
      fetchedAt: new Date().toISOString(),
      issues,
      pulls,
      issuesTruncated: isTruncated(issues.length, pageLimit),
      pullsTruncated: isTruncated(pulls.length, pageLimit),
    };
  },
};

