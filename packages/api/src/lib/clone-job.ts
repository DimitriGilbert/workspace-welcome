import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { buildCloneCommand } from "./clone-options";
import type { CloneInput } from "./clone-options";
import {
  deregisterExitCleanup,
  registerExitCleanup,
} from "./exit-cleanup";
import { networkGitEnv } from "./git";
import { newId } from "./id";
import { invalidateScanCache } from "./scan-cache";
import { readStore } from "./store";

/**
 * Clone a remote git repository into a registered root directory — the
 * create-project dialog's "Clone from git" tab's job, shaped after
 * ./scaffold: startCloneJob validates and returns a jobId immediately, the
 * client polls getCloneJob, and an attached `git clone` child streams its
 * progress into a bounded log tail. The clone is a full clone (all refs
 * fetched, the chosen branch checked out) so fetch/switch keep their normal
 * semantics; an empty branch means the remote's default. Unlike a failed
 * scaffold, a failed clone leaves nothing behind: the job verified the
 * target didn't exist before spawning, so a partial clone is removed and the
 * error says so.
 */

export interface CloneJobSnapshot {
  id: string;
  status: "running" | "success" | "error";
  startedAt: number;
  /**
   * Bounded tail of the clone child's output. git writes clone progress and
   * its failure reasons ("Repository not found", "Permission denied") to
   * stderr, so both streams fold in here.
   */
  logTail: string[];
  result?: {
    projectDirectory: string;
    reproducibleCommand: string;
    elapsedTimeMs: number;
  };
  error?: string;
}

interface JobRecord {
  snap: CloneJobSnapshot;
  /** Epoch ms of the moment the job reached a terminal status; null while running. */
  settledAt: number | null;
}

const jobs = new Map<string, JobRecord>();

const JOB_TIMEOUT_MS = 600_000;
const KILL_GRACE_MS = 5_000;
const GC_AFTER_MS = 900_000;
const LOG_TAIL_LINES = 40;
const LOG_TAIL_CHARS = 8 * 1024;
const SINGLE_FLIGHT_MESSAGE =
  "A clone job is already running — wait for it to finish before starting another.";

/** Thrown by startCloneJob while another clone job holds the single slot. */
export class CloneJobRunningError extends Error {
  constructor() {
    super(SINGLE_FLIGHT_MESSAGE);
    this.name = "CloneJobRunningError";
  }
}

async function runJob(input: CloneInput, rec: JobRecord): Promise<void> {
  const snap = rec.snap;
  let target: string | null = null;
  let cloneChild: ChildProcess | null = null;
  let graceTimer: NodeJS.Timeout | null = null;
  let timedOut = false;

  const killNow = (): void => {
    cloneChild?.kill("SIGKILL");
  };

  /**
   * Terminal error transition. When the job had begun writing a clone, the
   * partial directory is removed first — the job verified it didn't exist at
   * start and the directory name is schema-sanitized, so this can only ever
   * delete what this job itself created; a half-cloned repo is dead weight,
   * unlike a half-scaffolded project whose files are the user's own.
   */
  const fail = async (message: string): Promise<void> => {
    let removed = "";
    if (target !== null && cloneChild !== null) {
      try {
        await rm(target, { recursive: true, force: true });
        removed = " The partial clone was removed.";
      } catch {
        removed = ` The partial clone was left on disk at ${target} — remove it before retrying.`;
      }
    }
    settle("error", message + removed);
  };

  /** Idempotent terminal transition; the timeout path may beat normal completion. */
  const settle = (status: "success" | "error", error?: string): void => {
    if (snap.status !== "running") return;
    clearTimeout(timeoutTimer);
    if (graceTimer !== null) clearTimeout(graceTimer);
    if (cloneChild !== null) deregisterExitCleanup(killNow);
    rec.settledAt = Date.now();
    snap.status = status;
    if (error !== undefined) snap.error = error;
  };

  // On timeout the child is killed and the awaited outcome below settles the
  // job through fail() — after the kill ladder has actually reaped it.
  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    if (cloneChild !== null && cloneChild.exitCode === null) {
      cloneChild.kill("SIGTERM");
      graceTimer = setTimeout(
        () => cloneChild?.kill("SIGKILL"),
        KILL_GRACE_MS,
      );
    }
  }, JOB_TIMEOUT_MS);

  try {
    const store = await readStore();
    const rootAbs = resolve(input.root);
    if (!store.roots.some((r) => resolve(r.path) === rootAbs)) {
      await fail(
        `Not a tracked directory: ${rootAbs} — it must be registered as a root first.`,
      );
      return;
    }
    target = join(rootAbs, input.directoryName);
    const exists = await stat(target).then(
      () => true,
      (err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") return false;
        throw err;
      },
    );
    if (exists) {
      await fail(
        `A directory named "${input.directoryName}" already exists under ${rootAbs} — choose a different directory name.`,
      );
      return;
    }

    const branch = input.branch?.trim();
    const args = ["clone"];
    if (branch !== undefined && branch !== "") {
      args.push("--branch", branch);
    }
    // `--` is end-of-options armor: the schema already rejects
    // option-looking urls and names; this makes it structural.
    args.push("--", input.url.trim(), target);

    const child = spawn("git", args, {
      cwd: rootAbs,
      stdio: ["ignore", "pipe", "pipe"],
      env: networkGitEnv(),
    });
    cloneChild = child;
    registerExitCleanup(killNow);
    let tail = "";
    const appendTail = (chunk: Buffer): void => {
      tail = (tail + chunk.toString("utf8")).slice(-LOG_TAIL_CHARS);
      snap.logTail = tail
        .replaceAll("\r", "")
        .split("\n")
        .filter((line) => line.length > 0)
        .slice(-LOG_TAIL_LINES);
    };
    // git's clone progress and its error reasons both land on stderr, but a
    // chatty remote can talk on stdout too — both fold into the tail, and
    // neither stream is left undrained to block on a full pipe.
    child.stdout?.on("data", appendTail);
    child.stderr?.on("data", appendTail);

    const outcome = await new Promise<{
      code: number | null;
      error: Error | null;
    }>((res) => {
      let done = false;
      child.on("error", (err) => {
        if (done) return;
        done = true;
        res({ code: null, error: err });
      });
      child.on("exit", (code) => {
        if (done) return;
        done = true;
        res({ code, error: null });
      });
    });
    if (timedOut) {
      await fail(
        `Clone job timed out after ${JOB_TIMEOUT_MS / 60_000} minutes.`,
      );
      return;
    }
    if (outcome.error !== null) {
      await fail(
        `Failed to run git clone: ${outcome.error.message}.`,
      );
      return;
    }
    if (outcome.code !== 0) {
      // The tail is git's own failure text ("Repository not found",
      // "Permission denied (publickey)") — surface it in the error, since
      // the error view replaces the running log view.
      const tailText = snap.logTail.slice(-6).join("\n");
      await fail(
        `git clone failed with exit code ${outcome.code}${tailText ? ` — last output:\n${tailText}` : "."}`,
      );
      return;
    }

    invalidateScanCache();
    snap.result = {
      projectDirectory: target,
      reproducibleCommand: buildCloneCommand(input),
      elapsedTimeMs: Date.now() - snap.startedAt,
    };
    settle("success");
  } catch (err) {
    await fail(`Clone job failed: ${err instanceof Error ? err.message : String(err)}.`);
  }
}

export function getCloneJob(jobId: string): CloneJobSnapshot | null {
  const rec = jobs.get(jobId);
  if (!rec) return null;
  if (
    rec.settledAt !== null &&
    Date.now() - rec.settledAt > GC_AFTER_MS
  ) {
    jobs.delete(jobId);
    return null;
  }
  return rec.snap;
}

export function startCloneJob(input: CloneInput): { jobId: string } {
  const now = Date.now();
  for (const [id, rec] of jobs) {
    if (rec.snap.status === "running") throw new CloneJobRunningError();
    if (rec.settledAt !== null && now - rec.settledAt > GC_AFTER_MS) {
      jobs.delete(id);
    }
  }
  const id = newId();
  const rec: JobRecord = {
    snap: {
      id,
      status: "running",
      startedAt: now,
      logTail: [],
    },
    settledAt: null,
  };
  jobs.set(id, rec);
  // runJob never rejects (its whole body is a try/catch), so floating the
  // promise here is safe — the job lands in the Map either way.
  runJob(input, rec);
  return { jobId: id };
}
