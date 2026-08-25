import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { CLIError, create, DirectoryConflictError } from "create-better-t-stack";
import type { CreateError } from "create-better-t-stack";
import { z } from "zod";

import {
  deregisterExitCleanup,
  registerExitCleanup,
} from "./exit-cleanup";
import { newId } from "./id";
import { invalidateScanCache } from "./scan-cache";
import { readStore } from "./store";

/**
 * Project scaffolding through the better-t-stack programmatic API.
 *
 * The exported option lists and defaults are the single source of truth the
 * create-project form is generated from; startScaffoldJob runs the two-phase
 * job the UI polls: phase 1 calls create() in-process (install: false), phase
 * 2 optionally spawns an attached `<packageManager> install` child following
 * snitch.ts conventions (bounded stderr tail, SIGTERM→SIGKILL ladder, exit
 * cleanup). A failed job never deletes what was scaffolded — the error says
 * the directory was kept.
 */

const optionLists = {
  frontend: [
    "tanstack-start",
    "tanstack-router",
    "next",
    "nuxt",
    "svelte",
    "solid",
    "astro",
  ],
  // Native frontends additionally require Node ^22.13.0 || ^24.3.0 || >=26
  // when the package manager is not bun (this host runs v24.19.0, which
  // satisfies the range).
  native: ["none", "native-bare", "native-uniwind", "native-unistyles"],
  backend: ["self", "hono", "express", "fastify", "elysia"],
  runtime: ["none", "node", "bun"],
  api: ["trpc", "none"],
  auth: ["better-auth", "none"],
  payments: ["none", "polar"],
  database: ["sqlite", "postgres", "mysql", "mongodb"],
  orm: ["drizzle", "prisma"],
  dbSetup: [
    "none",
    "turso",
    "neon",
    "prisma-postgres",
    "planetscale",
    "mongodb-atlas",
    "supabase",
    "d1",
    "docker",
  ],
  packageManager: ["pnpm", "npm", "bun"],
  webDeploy: ["docker", "none", "vercel", "cloudflare", "prisma"],
  serverDeploy: ["none", "docker", "vercel", "cloudflare", "prisma"],
  addons: [
    "pwa",
    "tauri",
    "electrobun",
    "starlight",
    "biome",
    "lefthook",
    "husky",
    "mcp",
    "turborepo",
    "nx",
    "vite-plus",
    "fumadocs",
    "ultracite",
    "oxlint",
    "opentui",
    "wxt",
    "skills",
    "evlog",
  ],
  examples: ["none", "todo", "ai"],
} as const;

type BackendValue = (typeof optionLists)["backend"][number];
type RuntimeValue = (typeof optionLists)["runtime"][number];
type ServerDeployValue = (typeof optionLists)["serverDeploy"][number];
type DatabaseValue = (typeof optionLists)["database"][number];
type DbSetupValue = (typeof optionLists)["dbSetup"][number];

const dependentLists = {
  /** dbSetup values selectable per database (mirrors upstream compatibility rules). */
  dbSetupByDatabase: {
    sqlite: ["none", "turso", "d1"],
    postgres: [
      "none",
      "neon",
      "prisma-postgres",
      "supabase",
      "planetscale",
      "docker",
    ],
    mysql: ["none", "planetscale", "docker"],
    mongodb: ["none", "mongodb-atlas", "docker"],
  } satisfies Record<DatabaseValue, readonly DbSetupValue[]>,
  runtimeByBackend: {
    self: ["none"],
    hono: ["node", "bun"],
    express: ["node", "bun"],
    fastify: ["node", "bun"],
    elysia: ["node", "bun"],
  } satisfies Record<BackendValue, readonly RuntimeValue[]>,
  serverDeployByBackend: {
    self: ["none"],
    hono: ["docker", "vercel", "cloudflare", "prisma", "none"],
    express: ["docker", "vercel", "cloudflare", "prisma", "none"],
    fastify: ["docker", "vercel", "cloudflare", "prisma", "none"],
    elysia: ["docker", "vercel", "cloudflare", "prisma", "none"],
  } satisfies Record<BackendValue, readonly ServerDeployValue[]>,
  /** Default a dependent option should take when it becomes visible. */
  visibleDefaults: {
    runtime: "node",
    serverDeploy: "docker",
  } satisfies {
    runtime: RuntimeValue;
    serverDeploy: ServerDeployValue;
  },
};

export const scaffoldOptionLists = {
  ...optionLists,
  ...dependentLists,
  /** Which options have value lists dependent on another option's value. */
  dependentOn: {
    dbSetup: "database",
    runtime: "backend",
    serverDeploy: "backend",
  },
} as const;

function databasesForDbSetup(dbSetup: DbSetupValue): readonly DatabaseValue[] {
  const databases: DatabaseValue[] = [];
  for (const [database, setups] of Object.entries(
    scaffoldOptionLists.dbSetupByDatabase,
  ) as [DatabaseValue, readonly DbSetupValue[]][]) {
    if (setups.includes(dbSetup)) databases.push(database);
  }
  return databases;
}

const projectNameSchema = z
  .string()
  .trim()
  .min(1, "Project name is required")
  .max(100, "Project name must be 100 characters or fewer")
  .refine(
    (name) => !/[/\u0000-\u001f]/.test(name) && name !== "." && name !== "..",
    "Project name must be a plain directory name",
  )
  .refine(
    (name) => !name.startsWith(".") && !name.startsWith("-"),
    "Project name cannot start with a dot or a dash",
  )
  .refine(
    (name) => !/[<>:"|?*]/.test(name),
    "Project name cannot contain any of < > : \" | ? *",
  )
  .refine(
    (name) => name.toLowerCase() !== "node_modules",
    "Project name is reserved",
  );

export const scaffoldInputSchema = z
  .object({
    projectName: projectNameSchema,
    root: z.string().startsWith("/"),
    frontend: z.enum(scaffoldOptionLists.frontend),
    native: z.enum(scaffoldOptionLists.native),
    backend: z.enum(scaffoldOptionLists.backend),
    runtime: z.enum(scaffoldOptionLists.runtime),
    api: z.enum(scaffoldOptionLists.api),
    auth: z.enum(scaffoldOptionLists.auth),
    payments: z.enum(scaffoldOptionLists.payments),
    database: z.enum(scaffoldOptionLists.database),
    orm: z.enum(scaffoldOptionLists.orm),
    dbSetup: z.enum(scaffoldOptionLists.dbSetup),
    packageManager: z.enum(scaffoldOptionLists.packageManager),
    git: z.boolean(),
    install: z.boolean(),
    webDeploy: z.enum(scaffoldOptionLists.webDeploy),
    serverDeploy: z.enum(scaffoldOptionLists.serverDeploy),
    addons: z.array(z.enum(scaffoldOptionLists.addons)),
    examples: z.enum(scaffoldOptionLists.examples),
  })
  .superRefine((input, ctx) => {
    if (input.backend === "self" && input.runtime !== "none") {
      ctx.addIssue({
        code: "custom",
        path: ["runtime"],
        message:
          "A fullstack (self) backend runs its own server — runtime must be 'none'",
      });
    }
    if (input.backend === "self" && input.serverDeploy !== "none") {
      ctx.addIssue({
        code: "custom",
        path: ["serverDeploy"],
        message:
          "A fullstack (self) backend has no separate server — serverDeploy must be 'none' (use webDeploy for docker)",
      });
    }
    const databases = databasesForDbSetup(input.dbSetup);
    if (!databases.includes(input.database)) {
      ctx.addIssue({
        code: "custom",
        path: ["dbSetup"],
        message: `dbSetup '${input.dbSetup}' requires database ${databases.join(" or ")}`,
      });
    }
    if (input.database === "mongodb" && input.orm !== "prisma") {
      ctx.addIssue({
        code: "custom",
        path: ["orm"],
        message: "The mongodb database requires the prisma orm",
      });
    }
  });

export type ScaffoldInput = z.infer<typeof scaffoldInputSchema>;

export const scaffoldDefaults = {
  frontend: "tanstack-start",
  native: "none",
  backend: "self",
  runtime: "none",
  api: "trpc",
  auth: "better-auth",
  payments: "none",
  database: "sqlite",
  orm: "drizzle",
  dbSetup: "none",
  packageManager: "pnpm",
  git: true,
  install: true,
  webDeploy: "docker",
  serverDeploy: "none",
  addons: ["turborepo"],
  examples: "none",
} satisfies Omit<ScaffoldInput, "projectName" | "root">;

export interface ScaffoldJobSnapshot {
  id: string;
  status: "running" | "success" | "error";
  startedAt: number;
  /** Last known phase; only meaningful while status is "running". */
  phase: "scaffolding" | "installing";
  /** Bounded tail of the install child's stderr, live during install. */
  logTail: string[];
  result?: {
    projectDirectory: string;
    reproducibleCommand: string;
    elapsedTimeMs: number;
  };
  error?: string;
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
      process.chdir(prevCwd);
      createInFlight = false;
    }

    if (!result.isOk()) {
      settle("error", mapCreateError(result.error, target));
      return;
    }
    const init = result.value;
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
      elapsedTimeMs: init.elapsedTimeMs,
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
  if (createInFlight) throw new Error(SINGLE_FLIGHT_MESSAGE);
  for (const [id, rec] of jobs) {
    if (rec.snap.status === "running") throw new Error(SINGLE_FLIGHT_MESSAGE);
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
