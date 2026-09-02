import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { statSync, unlinkSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve, sep } from "node:path";

import {
  deregisterExitCleanup,
  registerExitCleanup,
} from "./exit-cleanup";
import type { Settings } from "./types";
import { reportsDir } from "./xdg";

/**
 * git-snitch report runs: command resolution (ADR-0001), deterministic report
 * keys, and the in-memory job registry the UI polls.
 *
 * Children are spawned ATTACHED with captured pipes — deliberately the
 * opposite of spawn.ts's detached launch(): we own the whole lifecycle, want
 * the exit code and stderr, and the child must die with this process. The map
 * is the only job state: after an app restart getJob returns null while the
 * report file, if written, stays servable. The file is the state; the
 * registry is just the live handle.
 */

export type ReportKind = "repo" | "scan";

export interface ReportJob {
  key: string;
  kind: ReportKind;
  targetPath: string;
  status: "running" | "done" | "failed";
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  /** Last ~8 KB of stderr — progress lines while running, the cause after. */
  stderrTail: string;
}

/** Local checkout checked before falling back to npx (ADR-0001). */
const LOCAL_SNITCH_ENTRY = join(
  homedir(),
  "workspace",
  "gitsnitch",
  "apps",
  "cli",
  "dist",
  "index.js",
);

/** Shape of every report key; shared by production and validation below. */
export const REPORT_KEY_RE = /^(repo|scan)-[a-z0-9.-]+-[a-f0-9]{8}$/;

/** Hard ceiling for one run — generous so a first-run npx download and the
 * --ai-usage attribution pass over a large workspace both fit. */
const REPORT_TIMEOUT_MS = 600_000;
/** Grace between SIGTERM and SIGKILL when a run times out. */
const KILL_GRACE_MS = 5_000;
/** How much stderr to keep on the job. */
const STDERR_TAIL_CHARS = 8 * 1024;

/** Expand a leading `~` to the home dir; anything else passes through. */
function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

/**
 * Resolve the git-snitch invocation (ADR-0001): a configured CLI path wins —
 * it is a FILE PATH run as `node <path>` (leading `~` expanded) and must
 * exist or this throws, so a bad setting fails loudly instead of silently
 * falling back. Else a built local checkout if present; else npx, which
 * downloads the CLI on first use.
 */
export function resolveSnitchCommand(settings: Settings): {
  command: string;
  baseArgs: string[];
} {
  const configured = settings.snitchPath?.trim();
  if (configured) {
    const entry = expandHome(configured);
    let isFile = false;
    try {
      isFile = statSync(entry).isFile();
    } catch {
      // Missing path — the throw below carries the message.
    }
    if (!isFile) throw new Error(`gitsnitch CLI path not found: ${entry}`);
    return { command: "node", baseArgs: [entry] };
  }
  try {
    if (statSync(LOCAL_SNITCH_ENTRY).isFile()) {
      return { command: "node", baseArgs: [LOCAL_SNITCH_ENTRY] };
    }
  } catch {
    // No checkout / not built — fall through to npx.
  }
  return { command: "npx", baseArgs: ["-y", "@git-snitch/cli"] };
}

/** File a finished report lands in: reportsDir/<key>.html. */
function reportPath(key: string): string {
  return join(reportsDir(), `${key}.html`);
}

/** Whether a finished report file is already cached for the key. */
export function reportFileExists(key: string): boolean {
  if (!REPORT_KEY_RE.test(key)) return false;
  try {
    return statSync(reportPath(key)).isFile();
  } catch {
    return false;
  }
}

/**
 * Synthetic done job for a report that is already on disk. The registry has
 * no entry — the file is the state — so the file's mtime stands in for the
 * run timestamps: for a cache hit that is honestly when the report was
 * written.
 */
export function cachedReportJob(
  kind: ReportKind,
  absPath: string,
  period?: string,
): ReportJob {
  const key = reportKey(kind, absPath, period);
  let finishedAt = new Date().toISOString();
  try {
    finishedAt = statSync(reportPath(key)).mtime.toISOString();
  } catch {
    // Raced away between the caller's existence check and here; the cache is
    // disposable and the tab will land on the waiting page instead.
  }
  return {
    key,
    kind,
    targetPath: absPath,
    status: "done",
    startedAt: finishedAt,
    finishedAt,
    exitCode: 0,
    stderrTail: "",
  };
}

/**
 * Deterministic key for a report target: kind + sanitized basename + the
 * first 8 hex chars of sha1(path). Stable across restarts, so re-running a
 * report overwrites its predecessor instead of accumulating files. A period
 * scopes the report to a time window (git-snitch --period): it is visible in
 * the slug and mixed into the hash, so each window keeps its own cache.
 */
export function reportKey(kind: ReportKind, absPath: string, period?: string): string {
  const base =
    basename(absPath)
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "report";
  const slug = period ? `${base}-${period}` : base;
  const hash8 = createHash("sha1")
    .update(period ? `${absPath}:${period}` : absPath)
    .digest("hex")
    .slice(0, 8);
  return `${kind}-${slug}-${hash8}`;
}

const jobs = new Map<string, ReportJob>();

export function getJob(key: string): ReportJob | null {
  return jobs.get(key) ?? null;
}

/**
 * Start (or join) a report run. Fully synchronous so two concurrent calls
 * dedupe on the map before either spawns — same shape as scan-cache's
 * in-flight promise, minus the promise. Returns a `failed` job (no spawn)
 * when the snitch path can't be resolved.
 */
export function startReportRun(
  kind: ReportKind,
  targetPath: string,
  settings: Settings,
  period?: string,
): ReportJob {
  const key = reportKey(kind, targetPath, period);
  const existing = jobs.get(key);
  if (existing?.status === "running") return existing;

  const output = reportPath(key);
  let command: string;
  let baseArgs: string[];
  try {
    ({ command, baseArgs } = resolveSnitchCommand(settings));
  } catch (err) {
    // A configured-but-missing snitch path fails the run itself: record it
    // as a failed job (the polling UI shows stderrTail) instead of throwing
    // out of the mutation.
    const failed: ReportJob = {
      key,
      kind,
      targetPath,
      status: "failed",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      exitCode: null,
      stderrTail: `error: ${(err as Error).message}`,
    };
    jobs.set(key, failed);
    return failed;
  }
  const job: ReportJob = {
    key,
    kind,
    targetPath,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    stderrTail: "",
  };

  const child = spawn(
    command,
    [
      ...baseArgs,
      kind,
      targetPath,
      // Scope the report to a time window; absent means all history.
      ...(period ? ["--period", period] : []),
      "--output",
      output,
      // Include attributable local AI assistant usage in the report.
      "--ai-usage",
      "--verbose",
    ],
    {
      cwd: targetPath,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    },
  );
  // Last state wins: a fresh run for a finished key replaces the old job.
  jobs.set(key, job);

  // A fresh run voids the previous file immediately: the cache is disposable
  // and the browser's waiting page must not race a stale report on reload.
  // Sync unlink so the dedupe-before-spawn guarantee above stays intact.
  try {
    unlinkSync(output);
  } catch {
    // ENOENT is the normal first-run case.
  }

  let tail = "";
  const appendTail = (chunk: Buffer): void => {
    tail = (tail + chunk.toString("utf8")).slice(-STDERR_TAIL_CHARS);
    job.stderrTail = tail;
  };
  child.stderr?.on("data", appendTail);
  // Drain stdout so a chatty child can't block on a full pipe; the report
  // itself goes to --output, so nothing on stdout is kept.
  child.stdout?.on("data", () => undefined);

  let timedOut = false;
  let graceTimer: NodeJS.Timeout | null = null;
  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
    // Escalate if the child ignores the term signal.
    graceTimer = setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS);
  }, REPORT_TIMEOUT_MS);

  // Exit cleanup kills outright: once this process is gone nobody is left to
  // escalate, and an orphaned report run serves no one.
  const killNow = (): void => {
    child.kill("SIGKILL");
  };
  registerExitCleanup(killNow);

  // Shared terminal path for 'exit'. Never rejects, so floating it from the
  // sync event handler below is safe.
  const finish = async (code: number | null): Promise<void> => {
    clearTimeout(timeoutTimer);
    if (graceTimer !== null) clearTimeout(graceTimer);
    deregisterExitCleanup(killNow);
    job.exitCode = code;
    job.finishedAt = new Date().toISOString();
    if (timedOut) {
      job.status = "failed";
      job.stderrTail = tail ? `${tail}\ntimed out` : "timed out";
      return;
    }
    if (code !== 0) {
      job.status = "failed";
      return;
    }
    const wrote = await stat(output).then(
      () => true,
      () => false,
    );
    if (!wrote) {
      job.status = "failed";
      job.stderrTail = tail
        ? `${tail}\nexited 0 but wrote no report`
        : "exited 0 but wrote no report";
      return;
    }
    job.status = "done";
  };

  child.on("exit", (code) => {
    finish(code);
  });
  // Spawn failure (e.g. ENOENT on the binary) — record it on the job, never
  // swallow it. 'exit' may or may not follow 'error', so both handlers clean
  // up independently; the deregistration is idempotent (Set semantics).
  child.on("error", (err) => {
    clearTimeout(timeoutTimer);
    if (graceTimer !== null) clearTimeout(graceTimer);
    deregisterExitCleanup(killNow);
    job.status = "failed";
    job.finishedAt = new Date().toISOString();
    job.stderrTail = err.message;
  });

  return job;
}

/**
 * Read a finished report's HTML. The key is validated against REPORT_KEY_RE
 * and the resolved path must stay inside reportsDir() — keys are opaque to
 * callers and never reach the filesystem unvalidated. Returns null for a
 * malformed key or a report that hasn't been generated yet.
 */
export async function readReportHtml(key: string): Promise<string | null> {
  if (!REPORT_KEY_RE.test(key)) return null;
  const dir = reportsDir();
  const file = resolve(dir, `${key}.html`);
  // Defense in depth: the regex already bars separators, this keeps the
  // containment explicit so a future regex edit can't open traversal.
  if (!file.startsWith(dir + sep)) return null;
  try {
    return await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return null;
  }
}
