import { execFile, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createServer } from "node:net";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

import {
  deregisterExitCleanup,
  registerExitCleanup,
} from "./exit-cleanup";
import { ideDir } from "./xdg";

/**
 * Web IDE (code-server) install + lifecycle manager (ADRs 0003/0004).
 *
 * Two module singletons, mirroring the snitch registry pattern:
 *  - install state machine — the download/extract phases the UI polls;
 *  - the running server entry — one shared instance for all projects.
 *
 * The install never blocks a mutation: a 100–200 MB download must not hold a
 * tRPC call open, so ensureInstalled() kicks the work and returns the current
 * state immediately. Disk is the installed truth — the presence of
 * code-server-<V>/bin/code-server under ideDir() — nothing is persisted
 * elsewhere, so a wiped data dir simply reinstalls on next use.
 *
 * The server binds 0.0.0.0 (this dashboard runs on a dev box browsed from
 * other machines on the LAN) with --auth none, an accepted single-user-dev-box
 * trade-off. URLs are built CLIENT-side from window.location.hostname; the
 * server never knows which host the browser used, so it only ever reports the
 * port.
 */

const execFileAsync = promisify(execFile);

const RELEASES_API =
  "https://api.github.com/repos/coder/code-server/releases/latest";

/** Grace between SIGTERM and SIGKILL when stopping the server. */
const KILL_GRACE_MS = 5_000;
/** /healthz poll interval while waiting for the server to come up. */
const HEALTHZ_POLL_MS = 250;
/** Total budget for the server to answer /healthz before we give up. */
const READY_TIMEOUT_MS = 90_000;
/** Extraction leash — generous for a cold disk unpacking a few hundred MB. */
const TAR_TIMEOUT_MS = 300_000;
/** Leash for `code-server --version` — normally sub-second. */
const VERSION_TIMEOUT_MS = 15_000;
/** How much code-server stderr to keep for failure messages. */
const STDERR_TAIL_CHARS = 8 * 1024;

// --- Install -----------------------------------------------------------------

export type IdeInstallPhase =
  | "not-installed"
  | "downloading"
  | "extracting"
  | "ready"
  | "failed";

export interface IdeInstallState {
  phase: IdeInstallPhase;
  receivedBytes: number | null;
  totalBytes: number | null;
  error: string | null;
}

/** What the UI polls; the port is the only server-side fact of the URL. */
export interface IdeStatus {
  installed: boolean;
  install: IdeInstallState;
  running: boolean;
  port: number | null;
  version: string | null;
  startedAt: string | null;
}

const installState: IdeInstallState = {
  phase: "not-installed",
  receivedBytes: null,
  totalBytes: null,
  error: null,
};

let installInFlight = false;

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (s) => s.isFile(),
    () => false,
  );
}

/**
 * A tarball can be interrupted after `bin/` landed but before `out/` did.
 * bin/code-server is only a POSIX sh launcher that execs the bundled node on
 * the package root, which node loads via package.json main → out/node/entry.js
 * — if that entry is missing the child dies with "Cannot find module <dir>".
 * So a usable install needs BOTH files, as files.
 */
async function isUsableInstall(
  dir: string,
  name: string,
): Promise<boolean> {
  const binOk = await isFile(join(dir, name, "bin", "code-server"));
  const entryOk = await isFile(join(dir, name, "out", "node", "entry.js"));
  return binOk && entryOk;
}

/**
 * Locate the installed code-server binary: scan ideDir() for a complete
 * code-server-<V> tree. Newest-named dir wins on the rare occasion two are
 * installed (auto-install never prunes an older version; lexicographic order
 * is close enough for the 4.x series this covers).
 */
export async function findInstalled(): Promise<string | null> {
  const dir = ideDir();
  const names = (await readdir(dir))
    .filter((name) => name.startsWith("code-server-"))
    .sort()
    .reverse();
  for (const name of names) {
    if (await isUsableInstall(dir, name)) {
      return join(dir, name, "bin", "code-server");
    }
  }
  return null;
}

function snapshotInstall(): IdeInstallState {
  return { ...installState };
}

/**
 * Download and extract the latest code-server release (ADR-0004): GitHub
 * releases API for the tag, stream the linux-amd64 tarball into ideDir(),
 * extract with the system tar, re-scan for the binary. Any failure lands on
 * the state as phase "failed" for the polling UI — never throws, so floating
 * it from ensureInstalled() without awaiting is safe (same shape as snitch.ts).
 */
async function runInstall(): Promise<void> {
  let tarball: string | null = null;
  try {
    const dir = ideDir();
    // A partial tree would satisfy a shallow bin-only check and shadow the
    // fresh extraction, so drop anything unusable first.
    for (const name of await readdir(dir)) {
      if (
        name.startsWith("code-server-") &&
        !(await isUsableInstall(dir, name))
      ) {
        await rm(join(dir, name), { recursive: true, force: true });
      }
    }
    const release = await fetch(RELEASES_API);
    if (!release.ok) {
      await release.body?.cancel();
      throw new Error(`GitHub releases API returned ${release.status}`);
    }
    const meta: unknown = await release.json();
    const tag =
      typeof meta === "object" &&
      meta !== null &&
      "tag_name" in meta &&
      typeof meta.tag_name === "string"
        ? meta.tag_name
        : null;
    if (tag === null) throw new Error("GitHub release payload had no tag_name");
    const version = tag.replace(/^v/, "");

    const url = `https://github.com/coder/code-server/releases/download/v${version}/code-server-${version}-linux-amd64.tar.gz`;
    tarball = join(dir, `code-server-${version}-linux-amd64.tar.gz.part`);

    const download = await fetch(url);
    if (!download.ok) {
      await download.body?.cancel();
      throw new Error(`code-server download failed (${download.status})`);
    }
    const declared = Number.parseInt(
      download.headers.get("content-length") ?? "",
      10,
    );
    installState.totalBytes =
      Number.isFinite(declared) && declared > 0 ? declared : null;

    if (download.body === null) {
      throw new Error("code-server download returned no body");
    }
    // One runtime value, two ReadableStream declarations: this file is
    // type-checked under Node libs (packages/api) and again under the DOM lib
    // (apps/web), whose fetch/body types are mutually incompatible. The value
    // is a node web-stream either way, so bridge it through node's own type.
    const body = Readable.fromWeb(
      download.body as NodeWebReadableStream<Uint8Array>,
    );
    body.on("data", (chunk: Buffer) => {
      installState.receivedBytes = (installState.receivedBytes ?? 0) +
        chunk.length;
    });
    await pipeline(body, createWriteStream(tarball));

    installState.phase = "extracting";
    await execFileAsync("tar", ["-xzf", tarball, "-C", dir], {
      timeout: TAR_TIMEOUT_MS,
    });
    await rm(tarball, { force: true });
    tarball = null;

    if ((await findInstalled()) === null) {
      throw new Error("tarball extracted but no code-server binary appeared");
    }
    installState.phase = "ready";
    installState.receivedBytes = null;
    installState.totalBytes = null;
    installState.error = null;
  } catch (err) {
    if (tarball !== null) {
      // Best-effort: drop the partial tarball so a retry starts clean.
      await rm(tarball, { force: true }).catch(() => undefined);
    }
    installState.phase = "failed";
    installState.error = (err as Error).message;
  } finally {
    installInFlight = false;
  }
}

/**
 * Make sure code-server is installed, kicking off the install if needed.
 * Returns the CURRENT state without waiting — the UI polls `status` for
 * progress. Never throws: install failures surface as phase "failed".
 */
export async function ensureInstalled(): Promise<IdeInstallState> {
  if ((await findInstalled()) !== null) {
    installState.phase = "ready";
    installState.receivedBytes = null;
    installState.totalBytes = null;
    installState.error = null;
    return snapshotInstall();
  }
  if (!installInFlight) {
    // The check-and-set below is one synchronous block, so concurrent calls
    // can't double-kick the download.
    installInFlight = true;
    installState.phase = "downloading";
    installState.receivedBytes = 0;
    installState.totalBytes = null;
    installState.error = null;
    runInstall();
  }
  return snapshotInstall();
}

// --- Server lifecycle ----------------------------------------------------------

interface IdeServer {
  child: ChildProcess;
  pid: number;
  port: number;
  startedAt: string;
  ready: boolean;
  version: string | null;
  stderrTail: string;
}

/** The shared instance (ADR-0003) — null whenever nothing is running. */
let server: IdeServer | null = null;
/** Single-flight guard so concurrent starts share one startup. */
let starting: Promise<{ port: number }> | null = null;
/** The exit-cleanup fn currently registered for the running child. */
let exitKill: (() => void) | null = null;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ask the kernel for a free port: bind the SAME wildcard address code-server
 * will (0.0.0.0:0), read the assignment, close. Probing 127.0.0.1 can pass
 * while 0.0.0.0:<port> is held by another listener (the dashboard itself) —
 * Linux allows both across different addresses — and the spawn then dies with
 * EADDRINUSE. A port free on the wildcard is safe to hand to a wildcard
 * listener; the close-to-spawn TOCTOU window is inherent and acceptable locally.
 */
function allocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "0.0.0.0", () => {
      const addr = probe.address();
      if (addr === null || typeof addr === "string") {
        probe.close();
        reject(new Error("could not allocate a port for code-server"));
        return;
      }
      const { port } = addr;
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Kill the entry's whole process group: SIGTERM, 5 s grace, SIGKILL. Upstream
 * documents no SIGTERM behaviour (research Topic A), so the group kill is the
 * reliable path — it also reaches grandchildren a bare child.kill() misses.
 */
async function teardownServer(entry: IdeServer): Promise<void> {
  if (server === entry) server = null;
  if (exitKill !== null) {
    deregisterExitCleanup(exitKill);
    exitKill = null;
  }
  try {
    process.kill(-entry.pid, "SIGTERM");
  } catch {
    return; // Already gone.
  }
  await new Promise<void>((resolve) => {
    const grace = setTimeout(() => {
      try {
        process.kill(-entry.pid, "SIGKILL");
      } catch {
        // Already gone — the 'exit' event may still be in flight.
      }
      resolve();
    }, KILL_GRACE_MS);
    entry.child.once("exit", () => {
      clearTimeout(grace);
      resolve();
    });
  });
}

/**
 * Poll /healthz (any 2xx) until it answers or the budget runs out. Probed on
 * 127.0.0.1 — readiness is a server-local fact — even though the server binds
 * 0.0.0.0 for LAN browsers. A child that dies mid-wait is noticed within one
 * poll interval via the cleared singleton, not after the full budget.
 */
async function waitForReady(entry: IdeServer): Promise<void> {
  const url = `http://127.0.0.1:${entry.port}/healthz`;
  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    if (server !== entry) {
      await teardownServer(entry);
      const detail = entry.stderrTail ? `: ${entry.stderrTail}` : "";
      throw new Error(`code-server exited during startup${detail}`);
    }
    if (Date.now() >= deadline) {
      await teardownServer(entry);
      const detail = entry.stderrTail ? `: ${entry.stderrTail}` : "";
      throw new Error(
        `code-server did not answer /healthz within ${READY_TIMEOUT_MS / 1000} s${detail}`,
      );
    }
    try {
      const res = await fetch(url);
      const ok = res.ok;
      // Tiny body we never read — release the socket instead of holding it.
      await res.body?.cancel();
      if (ok) return;
    } catch {
      // Not listening yet — keep polling.
    }
    await delay(HEALTHZ_POLL_MS);
  }
}

/**
 * Spawn code-server and wait for readiness. detached: true puts the child in
 * its OWN process group — the opposite of snitch.ts's attached spawn, because
 * here shutdown must be a group kill (see teardownServer) rather than a
 * supervised exit — while stdio stays piped so we can keep a stderr tail.
 */
async function launchServer(binary: string): Promise<IdeServer> {
  const port = await allocatePort();
  // code-server's PORT env var overrides --bind-addr (verified empirically:
  // `PORT=x code-server --bind-addr h:p` binds x). The dashboard runs under
  // systemd with Environment=PORT=..., so passing it through makes every IDE
  // launch collide with the dashboard's port (EADDRINUSE). HOST can override
  // the bind address the same way. Strip both.
  const env = { ...process.env };
  delete env.PORT;
  delete env.HOST;
  const child = spawn(
    binary,
    // 0.0.0.0, not 127.0.0.1: the dashboard is browsed from other machines on
    // the LAN and the IDE must be reachable the same way (ADR-0003/0004);
    // --auth none is the accepted single-user-dev-box trade-off.
    ["--bind-addr", `0.0.0.0:${port}`, "--auth", "none"],
    {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env,
    },
  );

  // Async spawn/exec failures — an unhandled 'error' event crashes the
  // process. Clear the singleton so status stops reporting a running IDE; the
  // wait loop notices and fails the startup.
  child.on("error", (err) => {
    if (server !== null && server.child === child) {
      server.stderrTail = err.message;
      server = null;
    }
  });

  if (child.pid === undefined) {
    // The fork failed outright (broken binary path) — fail fast instead of
    // waiting out the healthz budget; the async 'error' emission is absorbed
    // by the handler above.
    throw new Error(`Failed to spawn code-server at ${binary}`);
  }

  const entry: IdeServer = {
    child,
    pid: child.pid,
    port,
    startedAt: new Date().toISOString(),
    ready: false,
    version: null,
    stderrTail: "",
  };
  server = entry;

  let tail = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    tail = (tail + chunk.toString("utf8")).slice(-STDERR_TAIL_CHARS);
    entry.stderrTail = tail;
  });
  // Drain stdout so a chatty child can't block on a full pipe; nothing there
  // is kept — the URL code-server prints is built client-side anyway.
  child.stdout?.on("data", () => undefined);

  // App exit must kill the group synchronously ("exit" cannot await). SIGTERM,
  // not SIGKILL: code-server persists user state and deserves a flush chance,
  // and after we're gone nobody is left to escalate anyway.
  const killGroupOnExit = (): void => {
    try {
      process.kill(-entry.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  };
  exitKill = killGroupOnExit;
  registerExitCleanup(killGroupOnExit);

  // Crash or external kill: stop reporting a running IDE. Idempotent with the
  // teardown path (Set-backed deregistration, guarded clears).
  child.on("exit", () => {
    if (server === entry) server = null;
    if (exitKill === killGroupOnExit) {
      deregisterExitCleanup(killGroupOnExit);
      exitKill = null;
    }
  });

  await waitForReady(entry);
  entry.ready = true;
  entry.version = await ideVersion();
  return entry;
}

/**
 * Ensure code-server's user settings enable OS theme auto-detection. The file
 * is code-server's own (~/.local/share/code-server/User/settings.json, honoring
 * XDG_DATA_HOME like code-server does), so we MERGE: keys are set only when
 * absent — a user-customized theme is never clobbered. Atomic temp+rename per
 * the store.ts idiom. Best-effort: any failure (unreadable/corrupt file, IO)
 * is swallowed — theming must never block an IDE start.
 */
async function ensureThemeSettings(): Promise<void> {
  try {
    const base =
      process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
    const userDir = join(base, "code-server", "User");
    const settingsPath = join(userDir, "settings.json");
    await mkdir(userDir, { recursive: true });

    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(await readFile(settingsPath, "utf8")) as Record<
        string,
        unknown
      >;
    } catch {
      // Missing here is fine (fresh install); anything unreadable/corrupt we
      // leave alone entirely rather than risk destroying user state.
      const exists = await stat(settingsPath).then(
        () => true,
        () => false,
      );
      if (exists) return;
    }

    const defaults: Record<string, unknown> = {
      "window.autoDetectColorScheme": true,
      "workbench.preferredDarkColorTheme": "Default Dark Modern",
      "workbench.preferredLightColorTheme": "Default Light Modern",
    };
    let changed = false;
    for (const [key, value] of Object.entries(defaults)) {
      if (!(key in settings)) {
        settings[key] = value;
        changed = true;
      }
    }
    if (!changed) return;

    const tmp = join(userDir, `.settings.${process.pid}.${Date.now()}.tmp`);
    await writeFile(tmp, JSON.stringify(settings, null, 2), "utf8");
    try {
      await rename(tmp, settingsPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EXDEV") {
        await unlink(tmp).catch(() => undefined);
        throw err;
      }
      await writeFile(settingsPath, await readFile(tmp, "utf8"), "utf8");
      await unlink(tmp).catch(() => undefined);
    }
  } catch {
    // Theming is cosmetic — never let it fail a start.
  }
}

/**
 * Start the shared code-server instance, or join one already starting, or
 * return the port of the running one. Resolves only once /healthz answered.
 */
export async function startServer(): Promise<{ port: number }> {
  if (starting !== null) return starting;
  if (server !== null) return { port: server.port };
  const attempt = (async () => {
    const binary = await findInstalled();
    if (binary === null) {
      throw new Error(
        "code-server is not installed yet — open a project once to trigger the automatic install",
      );
    }
    // Idempotent and best-effort — runs while nothing owns the settings yet.
    await ensureThemeSettings();
    // Wildcard-probed ports make EADDRINUSE nearly impossible, but a TOCTOU
    // race or an external grab can still hit it — retry once on a fresh port.
    let entry: IdeServer;
    try {
      entry = await launchServer(binary);
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes("EADDRINUSE")) {
        throw err;
      }
      entry = await launchServer(binary);
    }
    return { port: entry.port };
  })();
  starting = attempt;
  try {
    return await attempt;
  } finally {
    starting = null;
  }
}

/** Stop the shared instance (Settings). No-op when nothing is running. */
export async function stopServer(): Promise<void> {
  const entry = server;
  if (entry === null) return;
  await teardownServer(entry);
}

let cachedVersion: string | null | undefined;

/**
 * `code-server --version` (first line), run once per install and cached.
 * Returns null when nothing is installed (uncached, so it resolves once the
 * install lands) or when the probe fails.
 */
export async function ideVersion(): Promise<string | null> {
  if (cachedVersion !== undefined) return cachedVersion;
  const binary = await findInstalled();
  if (binary === null) return null;
  try {
    const { stdout } = await execFileAsync(binary, ["--version"], {
      timeout: VERSION_TIMEOUT_MS,
    });
    const firstLine = stdout.split("\n", 1)[0] ?? "";
    cachedVersion = firstLine.trim() || null;
  } catch {
    return null;
  }
  return cachedVersion;
}

/** Snapshot for the UI: disk truth, install progress, and lifecycle state. */
export async function ideStatus(): Promise<IdeStatus> {
  const binary = await findInstalled();
  const install: IdeInstallState =
    binary !== null
      ? { phase: "ready", receivedBytes: null, totalBytes: null, error: null }
      : snapshotInstall();
  return {
    installed: binary !== null,
    install,
    running: server !== null,
    port: server?.port ?? null,
    version: server?.version ?? (await ideVersion()),
    startedAt: server?.startedAt ?? null,
  };
}
