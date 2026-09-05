/**
 * Minimal Chrome DevTools Protocol client for the widget-check harness.
 *
 * The harness is dependency-free on purpose (master plan §3.8: ONE harness,
 * no browser-automation stack in package.json): it drives a system Chromium
 * over CDP using Node's built-in WebSocket. Two layers:
 *
 * - `Browser` — spawns a headless Chromium with `--remote-debugging-port=0`,
 *   parses the DevTools endpoint from stderr, opens the browser-level
 *   WebSocket (flat sessions) and hands out `Page` instances.
 * - `Page` — one tab: `goto` (waits for `document.readyState === "complete"`,
 *   no event races), `eval` (serializes a function into the page, awaits the
 *   promise it returns, returns the value by value), `waitFor` polling,
 *   `settle` (load + `[data-ready]` + double rAF) and `setViewport`.
 *
 * Everything the probes/interactions/sentinel do is DOM evaluation in the
 * page — no screenshots, no vision (plan constraint).
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_BROWSER =
  process.env.WW_CHECK_BROWSER ?? "/usr/sbin/chromium-browser";

const LAUNCH_TIMEOUT_MS = 15_000;
const DEFAULT_NAV_TIMEOUT_MS = 20_000;
const DEFAULT_READY_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 120;

export class BrowserError extends Error {}

/** Resolve once the child printed its DevTools endpoint; reject on early exit. */
function waitForDevtoolsEndpoint(child) {
  return new Promise((resolve, reject) => {
    let buffered = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new BrowserError(
          `Chromium did not report a DevTools endpoint within ${LAUNCH_TIMEOUT_MS}ms`,
        ),
      );
    }, LAUNCH_TIMEOUT_MS);

    const onLine = (chunk) => {
      buffered += chunk.toString();
      const match = buffered.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match !== null) {
        cleanup();
        resolve(match[1]);
      }
    };
    const onExit = (code) => {
      cleanup();
      reject(
        new BrowserError(
          `Chromium exited early (code ${code}). Retry may be needed with sandbox disabled.`,
        ),
      );
    };

    function cleanup() {
      clearTimeout(timer);
      child.stdout.off("data", onLine);
      child.stderr.off("data", onLine);
      child.off("exit", onExit);
    }

    child.stdout.on("data", onLine);
    child.stderr.on("data", onLine);
    child.on("exit", onExit);
  });
}

async function connectWebSocket(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener(
      "error",
      () => reject(new BrowserError(`WebSocket connect failed: ${url}`)),
      { once: true },
    );
  });
  return ws;
}

export class Browser {
  /** @type {import("node:child_process").ChildProcess | null} */
  child = null;
  /** @type {WebSocket | null} */
  ws = null;
  #nextId = 1;
  #pending = new Map();
  #listeners = new Set();
  #userDataDir = null;
  /** Browser-level DevTools WebSocket URL, captured from the child's stderr. */
  #browserWsUrl = null;

  /**
   * Spawn headless Chromium and connect. Tries the platform sandbox first
   * and retries with `--no-sandbox` when the early exit suggests the
   * user-namespace sandbox is unavailable (common on locked-down hosts).
   */
  static async launch({
    executable = DEFAULT_BROWSER,
    headless = true,
  } = {}) {
    const browser = new Browser();
    try {
      await browser.#start(executable, headless, false);
    } catch (firstError) {
      if (browser.child !== null) {
        browser.child.kill("SIGKILL");
        browser.child = null;
      }
      try {
        await browser.#start(executable, headless, true);
      } catch (retryError) {
        throw new BrowserError(
          `Could not launch Chromium (${executable}): ${retryError.message} (first attempt: ${firstError.message})`,
        );
      }
    }
    await browser.#connect();
    return browser;
  }

  #start(executable, headless, noSandbox) {
    this.#userDataDir = mkdtempSync(join(tmpdir(), "ww-widget-check-"));
    const args = [
      "--remote-debugging-port=0",
      `--user-data-dir=${this.#userDataDir}`,
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--mute-audio",
    ];
    if (headless) args.push("--headless=new");
    if (noSandbox) args.push("--no-sandbox");
    args.push("about:blank");

    const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"] });
    child.stderr.resume(); // drain GCM/audio noise so the pipe never fills
    this.child = child;
    return waitForDevtoolsEndpoint(child).then((endpoint) => {
      this.#browserWsUrl = endpoint;
    });
  }

  async #connect() {
    this.ws = await connectWebSocket(this.#browserWsUrl);
    this.ws.addEventListener("message", (event) => {
      this.#onMessage(String(event.data));
    });
    this.ws.addEventListener("close", () => {
      for (const pending of this.#pending.values()) {
        pending.reject(new BrowserError("DevTools WebSocket closed"));
      }
      this.#pending.clear();
    });
  }

  async #onMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof message.id === "number") {
      const pending = this.#pending.get(message.id);
      if (pending !== undefined) {
        this.#pending.delete(message.id);
        if (message.error !== undefined) {
          pending.reject(
            new BrowserError(
              `${pending.method}: ${message.error.message ?? JSON.stringify(message.error)}`,
            ),
          );
        } else {
          pending.resolve(message.result);
        }
      }
      return;
    }
    if (typeof message.method === "string") {
      for (const listener of this.#listeners) listener(message);
    }
  }

  /**
   * CDP call. With `sessionId` (flat sessions), the id rides at the TOP
   * level of the message next to `id`/`method` — not inside `params`.
   */
  send(method, params = {}, sessionId) {
    if (this.ws === null || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new BrowserError("Browser WebSocket not open"));
    }
    const id = this.#nextId++;
    const message = { id, method, params };
    if (sessionId !== undefined) message.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { method, resolve, reject });
      this.ws.send(JSON.stringify(message));
    });
  }

  async newPage() {
    const { targetId } = await this.send("Target.createTarget", {
      url: "about:blank",
    });
    const { sessionId } = await this.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    const page = new Page(this, sessionId, targetId);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    return page;
  }

  async close() {
    if (this.ws !== null) {
      try {
        await this.send("Browser.close");
      } catch {
        // The browser may already be gone.
      }
      this.ws.close();
      this.ws = null;
    }
    if (this.child !== null) {
      this.child.kill("SIGKILL");
      this.child = null;
    }
    if (this.#userDataDir !== null) {
      rmSync(this.#userDataDir, { recursive: true, force: true });
      this.#userDataDir = null;
    }
  }
}

export class Page {
  /**
   * @param {Browser} browser
   * @param {string} sessionId
   * @param {string} targetId
   */
  constructor(browser, sessionId, targetId) {
    this.browser = browser;
    this.sessionId = sessionId;
    this.targetId = targetId;
  }

  /** Session-scoped CDP call. */
  send(method, params = {}) {
    return this.browser.send(method, params, this.sessionId);
  }

  /**
   * Navigate and wait for full load (`document.readyState === "complete"`).
   * Polling readyState avoids DevTools event races entirely.
   */
  async goto(url, { timeoutMs = DEFAULT_NAV_TIMEOUT_MS } = {}) {
    const result = await this.send("Page.navigate", { url });
    if (result?.errorText !== undefined) {
      throw new BrowserError(`Navigate to ${url} failed: ${result.errorText}`);
    }
    const complete = await this.waitFor(
      () => document.readyState === "complete",
      { timeoutMs, pollDescription: "document.readyState === complete" },
    );
    if (!complete) {
      throw new BrowserError(`Page ${url} never finished loading`);
    }
  }

  /**
   * Evaluate a function in the page. The function must be self-contained
   * (no closure references); args are JSON values. If the function returns
   * a promise it is awaited; the resolved value comes back by value.
   * Non-serializable results (functions/symbols/undefined) arrive as null.
   *
   * @template T
   * @param {(...args: unknown[]) => T} pageFunction
   * @param {unknown[]} args
   * @returns {Promise<T>}
   */
  async eval(pageFunction, ...args) {
    const expression = `(${pageFunction.toString()})(...${JSON.stringify(args)})`;
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (result?.exceptionDetails !== undefined) {
      const detail = result.exceptionDetails;
      const text =
        detail.exception?.description ??
        detail.exception?.value ??
        detail.text ??
        "unknown page exception";
      throw new BrowserError(`Page eval failed: ${text}`);
    }
    return /** @type {T} */ (result?.result?.value);
  }

  /**
   * Like `eval`, but the page function's FIRST parameter is the object
   * produced by evaluating `measureSource` (see lib/measure.mjs) — the
   * shared DOM-measurement helpers — followed by `args`.
   *
   * @template T
   * @param {string} measureSource
   * @param {(measure: unknown, ...args: unknown[]) => T} pageFunction
   * @param {unknown[]} args
   * @returns {Promise<T>}
   */
  async evalMeasured(measureSource, pageFunction, ...args) {
    const serializedArgs = args.map((arg) => JSON.stringify(arg)).join(", ");
    const expression = `(${pageFunction.toString()})(${measureSource}${
      serializedArgs.length > 0 ? `, ${serializedArgs}` : ""
    })`;
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (result?.exceptionDetails !== undefined) {
      const detail = result.exceptionDetails;
      const text =
        detail.exception?.description ??
        detail.exception?.value ??
        detail.text ??
        "unknown page exception";
      throw new BrowserError(`Page eval failed: ${text}`);
    }
    return /** @type {T} */ (result?.result?.value);
  }

  /** Poll a page predicate until truthy. Resolves false on timeout. */
  async waitFor(pageFunction, { timeoutMs = DEFAULT_READY_TIMEOUT_MS } = {}, ...args) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      let value;
      try {
        value = await this.eval(pageFunction, ...args);
      } catch {
        // A transient eval failure (navigation in flight) is not fatal.
        value = false;
      }
      if (value) return true;
      if (Date.now() > deadline) return false;
      await sleep(POLL_INTERVAL_MS);
    }
  }

  /**
   * Settle the page per §3.8: full load, then wait for `[data-ready]` (the
   * board's post-hydration stamp) within `readyTimeoutMs`, then two rAFs so
   * layout/effects committed. Resolves which readiness was reached.
   */
  async settle({ readyTimeoutMs = DEFAULT_READY_TIMEOUT_MS } = {}) {
    const ready = await this.waitFor(
      () => document.querySelector("[data-ready]") !== null,
      { timeoutMs: readyTimeoutMs, pollDescription: "[data-ready]" },
    );
    await this.eval(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    return { dataReady: ready };
  }

  /** Emulate a viewport (probe surface for --viewport). */
  async setViewport(width, height) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    // Give style/layout a beat after the metrics override.
    await this.eval(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
  }

  /** Current URL as the page sees it (post-SPA-navigation truth). */
  getLocation() {
    return this.eval(() => `${location.pathname}${location.search}`);
  }

  async close() {
    try {
      await this.browser.send("Target.closeTarget", { targetId: this.targetId });
    } catch {
      // Already closed with the browser.
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { DEFAULT_BROWSER };
