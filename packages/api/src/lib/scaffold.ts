import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { CLIError, create, DirectoryConflictError } from "create-better-t-stack";
import type { CreateError } from "create-better-t-stack";

import { generateAgentsMdFromScaffoldInput } from "./agents-md";
import {
  deregisterExitCleanup,
  registerExitCleanup,
} from "./exit-cleanup";
import { newId } from "./id";
import { invalidateScanCache } from "./scan-cache";
import type { ScaffoldInput } from "./scaffold-options";
import { readStore } from "./store";

export {
  scaffoldDefaults,
  scaffoldInputSchema,
  scaffoldOptionLists,
} from "./scaffold-options";
export type { ScaffoldInput } from "./scaffold-options";

/**
 * Project scaffolding through the better-t-stack programmatic API.
 *
 * The option lists, defaults, and form schema — the single source of truth
 * the create-project form is generated from — live in the node-free
 * ./scaffold-options, re-exported above so server consumers keep one module;
 * startScaffoldJob runs the two-phase job the UI polls: phase 1 calls
 * create() in-process (install: false), phase 2 optionally spawns an
 * attached `<packageManager> install` child following snitch.ts
 * conventions (bounded stderr tail, SIGTERM→SIGKILL ladder, exit cleanup).
 * Once create() has succeeded the job also writes an AGENTS.md into the
 * project (never overwriting one that already exists); that step is
 * non-fatal — its outcome is recorded on the snapshot and can never fail
 * the scaffold. A failed job never deletes what was scaffolded — the
 * error says the directory was kept.
 */

export interface ScaffoldJobSnapshot {
  id: string;
  status: "running" | "success" | "error";
  startedAt: number;
  /** Last known phase; only meaningful while status is "running". */
  phase: "scaffolding" | "installing" | "agents-md";
  /** Bounded tail of the install child's stderr, live during install. */
  logTail: string[];
  result?: {
    projectDirectory: string;
    reproducibleCommand: string;
    elapsedTimeMs: number;
  };
  error?: string;
  /**
   * Outcome of the AGENTS.md step, which runs once create() has succeeded:
   * "written" after a fresh write, "skipped" when the scaffolded project
   * already contained an AGENTS.md (benign, not a warning), "failed" when
   * generation or the write threw. Absent for jobs that never got that far
   * (start-up or create() failures).
   */
  agentsMd?: {
    outcome: "written" | "skipped" | "failed";
    /** Present only when outcome is "failed": why nothing was written. */
    warning?: string;
  };
}

interface JobRecord {
  snap: ScaffoldJobSnapshot;
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
  "A scaffold job is already running — wait for it to finish before starting another.";

/** Thrown by startScaffoldJob while another scaffold job holds the single slot. */
export class ScaffoldJobRunningError extends Error {
  constructor() {
    super(SINGLE_FLIGHT_MESSAGE);
    this.name = "ScaffoldJobRunningError";
  }
}

/** True while create() owns the process cwd (see runJob); no other scaffold may start then. */
let createInFlight = false;

function mapCreateError(err: CreateError, target: string): string {
  const kept = ` The directory ${target} was kept on disk.`;
  if (err instanceof DirectoryConflictError) {
    return `Directory already exists: ${target} — choose a different project name.`;
  }
  if (err instanceof CLIError) {
    return `${err.message}${kept}`;
  }
  return `Scaffolding failed (${err.name}): ${err.message}${kept}`;
}

async function runJob(input: ScaffoldInput, rec: JobRecord): Promise<void> {
  const snap = rec.snap;
  let target: string | null = null;
  let scaffolded = false;
  let installChild: ChildProcess | null = null;
  let graceTimer: NodeJS.Timeout | null = null;
  let timedOut = false;

  const keptNote = (): string =>
    target !== null && scaffolded
      ? ` The directory ${target} was kept on disk.`
      : "";

  const killNow = (): void => {
    installChild?.kill("SIGKILL");
  };

  /** Idempotent terminal transition; the timeout path may beat normal completion. */
  const settle = (status: "success" | "error", error?: string): void => {
    if (snap.status !== "running") return;
    clearTimeout(timeoutTimer);
    if (graceTimer !== null) clearTimeout(graceTimer);
    if (installChild !== null) deregisterExitCleanup(killNow);
    rec.settledAt = Date.now();
    snap.status = status;
    if (error !== undefined) snap.error = error;
  };

  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    if (installChild !== null && installChild.exitCode === null) {
      installChild.kill("SIGTERM");
      graceTimer = setTimeout(
        () => installChild?.kill("SIGKILL"),
        KILL_GRACE_MS,
      );
    }
    const tail = snap.logTail.slice(-5).join("\n");
    settle(
      "error",
      `Scaffold job timed out after ${JOB_TIMEOUT_MS / 60_000} minutes${tail ? ` — last output:\n${tail}` : ""}.${keptNote()}`,
    );
  }, JOB_TIMEOUT_MS);

  try {
    const store = await readStore();
    const rootAbs = resolve(input.root);
    if (!store.roots.some((r) => resolve(r.path) === rootAbs)) {
      settle(
        "error",
        `Not a tracked directory: ${rootAbs} — it must be registered as a root first.`,
      );
      return;
    }
    target = join(rootAbs, input.projectName);
    const exists = await stat(target).then(
      () => true,
      (err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") return false;
        throw err;
      },
    );
    if (exists) {
      settle(
        "error",
        `A directory named "${input.projectName}" already exists under ${rootAbs} — choose a different project name.`,
      );
      return;
    }

    scaffolded = true;
    // create() anchors the project at process.cwd() and rejects paths outside
    // it, so the job must briefly own the cwd; single-flight plus the
    // createInFlight flag guarantee no concurrent chdir.
    const prevCwd = process.cwd();
    createInFlight = true;
    let result: Awaited<ReturnType<typeof create>>;
    try {
      process.chdir(rootAbs);
      result = await create(input.projectName, {
        frontend:
          input.native === "none"
            ? [input.frontend]
            : [input.frontend, input.native],
        backend: input.backend,
        runtime: input.runtime,
        api: input.api,
        auth: input.auth,
        payments: input.payments,
        database: input.database,
        orm: input.orm,
        dbSetup: input.dbSetup,
        packageManager: input.packageManager,
        git: input.git,
        install: false,
        webDeploy: input.webDeploy,
        serverDeploy: input.serverDeploy,
        addons: input.addons,
        examples: input.examples === "none" ? [] : [input.examples],
        directoryConflict: "error",
      });
    } finally {
      // Clear before the restore chdir so a throwing chdir cannot leave the
      // single-flight flag stuck; both statements run in the same tick anyway.
      createInFlight = false;
      process.chdir(prevCwd);
    }

    if (!result.isOk()) {
      settle("error", mapCreateError(result.error, target));
      return;
    }
    const init = result.value;
    if (timedOut) return;

    // AGENTS.md step: generated from the exact options the user picked and
    // written as soon as create() has succeeded, so it lands even if the
    // install phase later fails. Non-fatal by design — any failure here is
    // recorded on the snapshot and the scaffold result stands.
    snap.phase = "agents-md";
    const agentsMdPath = join(init.projectDirectory, "AGENTS.md");
    try {
      const agentsMdExists = await stat(agentsMdPath).then(
        () => true,
        (err: NodeJS.ErrnoException) => {
          if (err.code === "ENOENT") return false;
          throw err;
        },
      );
      if (agentsMdExists) {
        snap.agentsMd = { outcome: "skipped" };
      } else {
        await writeFile(agentsMdPath, generateAgentsMdFromScaffoldInput(input));
        snap.agentsMd = { outcome: "written" };
      }
    } catch (err) {
      snap.agentsMd = {
        outcome: "failed",
        warning: `AGENTS.md was not written: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    // The step awaited fs work, so re-check before touching job completion.
    if (timedOut) return;

    if (input.install) {
      snap.phase = "installing";
      const child = spawn(input.packageManager, ["install"], {
        cwd: init.projectDirectory,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });
      installChild = child;
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
      child.stderr?.on("data", appendTail);
      // Drain stdout so a chatty installer cannot block on a full pipe.
      child.stdout?.on("data", () => undefined);

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
      if (timedOut) return;
      if (outcome.error !== null) {
        settle(
          "error",
          `Failed to run ${input.packageManager} install: ${outcome.error.message}.${keptNote()}`,
        );
        return;
      }
      if (outcome.code !== 0) {
        settle(
          "error",
          `${input.packageManager} install failed with exit code ${outcome.code}.${keptNote()}`,
        );
        return;
      }
    }

    invalidateScanCache();
    snap.result = {
      projectDirectory: init.projectDirectory,
      reproducibleCommand: init.reproducibleCommand,
      // Upstream elapsedTimeMs measures create() only; install is our phase, so the job's total is the honest number.
      elapsedTimeMs: Date.now() - snap.startedAt,
    };
    settle("success");
  } catch (err) {
    settle(
      "error",
      `Scaffold job failed: ${err instanceof Error ? err.message : String(err)}.${keptNote()}`,
    );
  }
}

export function getScaffoldJob(jobId: string): ScaffoldJobSnapshot | null {
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

export function startScaffoldJob(input: ScaffoldInput): { jobId: string } {
  const now = Date.now();
  if (createInFlight) throw new ScaffoldJobRunningError();
  for (const [id, rec] of jobs) {
    if (rec.snap.status === "running") throw new ScaffoldJobRunningError();
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
      phase: "scaffolding",
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
