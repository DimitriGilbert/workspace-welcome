#!/usr/bin/env node
/**
 * settings-check.mjs — /settings coverage in the check harness (PC.3): the
 * page was manual-check-only through Stage A (matrix item 10); this closes
 * the known gap with the sentinel's architecture — one page, a handful of
 * contract checks, CDP DOM evaluation only.
 *
 * Checks:
 *   1. settings-hydrates        /settings mounts the SettingsProvider stamp
 *                               `div[data-providers="settings"]` exactly once
 *                               (the §3.4 provider stamp, settings-context).
 *                               The page renders no widget board, so it
 *                               stamps no [data-ready]; the settle contract
 *                               here is network quiet (the resource timeline
 *                               stops growing — hydration scripts and the
 *                               initial tRPC queries have landed) + double
 *                               rAF, like the sentinel's settle tail.
 *   2. settings-sections        all five sections render in the hydrated DOM:
 *                               each settings component is a WidgetShell and
 *                               its header title names it
 *                               (`[data-slot="widget-shell-title"]`), matched
 *                               case-tolerantly on text content — Workspace,
 *                               Open commands, gitsnitch, Exclude globs,
 *                               Ideation models. No per-section data
 *                               attribute exists; the title text IS the
 *                               section marker.
 *   3. settings-no-console-errors   zero error-level console entries during
 *                               load + settle: console.error, a failed
 *                               console.assert, or an uncaught exception
 *                               (Runtime.exceptionThrown). Warn-level and
 *                               below are allowed, and the two KNOWN dev-only
 *                               advisories (DEV_ADVISORY_PREFIXES below)
 *                               surface as WARN lines instead of FAILs —
 *                               every other error-level entry fails the
 *                               check. cdp.mjs exposes no event surface, so
 *                               events are tapped off the raw browser
 *                               WebSocket: flat sessions tag every page event
 *                               with its sessionId.
 *
 * Same output contract as run.mjs: PASS|FAIL|WARN lines, JSON via --out,
 * exit ≠ 0 on FAIL. Flags: --base-url <url> [--out <path>].
 */
import { fileURLToPath } from "node:url";

import { Browser } from "./lib/cdp.mjs";
import { Report, runEntry, writeJsonOut } from "./lib/report.mjs";

const DEFAULT_BASE_URL = process.env.WW_CHECK_BASE_URL ?? "http://127.0.0.1:37420";
const SETTINGS_PATH = "/settings";
/** The §3.4 provider stamp (apps/web/src/lib/contexts/settings-context.tsx). */
const PROVIDER_SELECTOR = 'div[data-providers="settings"]';
/**
 * The five /settings sections by the WidgetShell title each renders
 * (apps/web/src/components/settings/*.tsx → the common shell header's
 * `[data-slot="widget-shell-title"]`, apps/web/src/components/widgets/
 * widget-shell.tsx). Matched case-tolerantly on text content.
 */
const SECTION_TITLES = [
  "Workspace", // SettingsGeneral — components/settings/general.tsx
  "Open commands", // SettingsCommands — components/settings/commands.tsx
  "gitsnitch", // SettingsSnitch — components/settings/snitch.tsx
  "Exclude globs", // SettingsExcludeGlobs — components/settings/exclude-globs.tsx
  "Ideation models", // SettingsIdeation — components/settings/ideation.tsx
];
/**
 * Error-level entries that are development-mode ADVISORIES, not page
 * failures — they never appear in a production build. Surfaced as WARN
 * lines (never silently dropped) but do not fail the gate:
 * - React's dev-only hydration-mismatch diagnostic — fires app-wide (the
 *   theme flash-prevention script stamps `class="dark"` before hydration;
 *   SSR HTML rendered without it), observed on `/` too, not just here.
 * - Base UI's dev-only component advisories — on /settings: the header back
 *   button renders a Link through Button without `nativeButton={false}`
 *   (routes/settings.tsx); a one-line app fix, out of this tooling phase's
 *   boundary.
 */
const DEV_ADVISORY_PREFIXES = ["A tree hydrated but", "Base UI:"];
/** Settle timing: the Web IDE status query refetches every 5 s, so network
 *  quiet is a quiescence window, never total silence. */
const QUIET_WINDOW_MS = 750;
const QUIET_TIMEOUT_MS = 8000;
const PROVIDER_TIMEOUT_MS = 4000;
const POLL_INTERVAL_MS = 120;
const DETAIL_MAX_CHARS = 240;
const MAX_REPORTED_ERRORS = 5;

function parseArgs(argv) {
  const options = { baseUrl: DEFAULT_BASE_URL, out: undefined };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`flag ${flag} needs a value`);
      return argv[i];
    };
    switch (flag) {
      case "--base-url": options.baseUrl = value().replace(/\/$/, ""); break;
      case "--out": options.out = value(); break;
      default: throw new Error(`unknown flag: ${flag}`);
    }
  }
  return options;
}

/** Reachability gate (run.mjs): a dead origin or a missing route is a harness error, not a page FAIL. */
async function assertReachable(baseUrl, url) {
  let response;
  try {
    response = await fetch(url, { redirect: "follow" });
  } catch (error) {
    throw new Error(
      `cannot reach ${url} — is the app deployed and the service up? (${
        error instanceof Error ? error.message : String(error)
      })`,
    );
  }
  if (response.status === 404) {
    throw new Error(`404 for ${url} — route does not exist in the deployed build`);
  }
  if (response.status >= 500) {
    throw new Error(`${response.status} for ${url}`);
  }
}

/** Keep report lines bounded — console descriptions and stack traces can be enormous. */
function clip(text) {
  return text.length > DETAIL_MAX_CHARS ? `${text.slice(0, DETAIL_MAX_CHARS)}…` : text;
}

/**
 * Render a consoleAPICalled arg list as plain text — RemoteObjects are
 * (description | value | type); the advisory classification runs on this
 * text, so string values stay unquoted.
 */
function describeArgs(args) {
  const text = (Array.isArray(args) ? args : [])
    .map((arg) => {
      if (typeof arg !== "object" || arg === null) return String(arg);
      if (typeof arg.description === "string") return arg.description.split("\n")[0];
      if (arg.value !== undefined) {
        return typeof arg.value === "string" ? arg.value : JSON.stringify(arg.value);
      }
      return `<${typeof arg.type === "string" ? arg.type : "unknown"}>`;
    })
    .join(" ")
    .trim();
  return text === "" ? "(no message)" : text;
}

/** Render an exceptionThrown payload's headline (exception description, else its text). */
function describeException(details) {
  if (typeof details !== "object" || details === null) return "(no exception details)";
  const exception = details.exception;
  const headline =
    typeof exception === "object" && exception !== null
      ? (typeof exception.description === "string" ? exception.description.split("\n")[0] : undefined) ??
        (exception.value !== undefined
          ? typeof exception.value === "string"
            ? exception.value
            : JSON.stringify(exception.value)
          : undefined)
      : undefined;
  return headline ?? (typeof details.text === "string" ? details.text : "(no exception text)");
}

/** Tag one collected entry against the dev-only advisory allowlist. */
function classifyEntry(source, text) {
  return {
    source,
    text,
    advisory: DEV_ADVISORY_PREFIXES.some((prefix) => text.startsWith(prefix)),
  };
}

/**
 * Error-level console collector for one page session. cdp.mjs exposes no
 * event surface (its listener set is private and unused), so this taps the
 * raw browser-level WebSocket: in flat-session mode every page event rides
 * the same socket tagged with `sessionId`, and `newPage` has already enabled
 * the Runtime domain — consoleAPICalled / exceptionThrown flow from there.
 *
 * @param {import("./lib/cdp.mjs").Page} page
 * @returns {{ entries: { source: string, text: string, advisory: boolean }[], detach(): void }}
 */
function collectConsoleErrors(page) {
  /** @type {{ source: string, text: string, advisory: boolean }[]} */
  const entries = [];
  /** @param {MessageEvent} event */
  const onMessage = (event) => {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (typeof message !== "object" || message === null) return;
    if (message.sessionId !== page.sessionId || typeof message.method !== "string") return;
    if (message.method === "Runtime.consoleAPICalled") {
      const { type, args } = message.params ?? {};
      if (type !== "error" && type !== "assert") return; // warn-level and below: allowed
      entries.push(classifyEntry(`console.${type}`, describeArgs(args)));
    } else if (message.method === "Runtime.exceptionThrown") {
      entries.push(classifyEntry("exception", describeException(message.params?.exceptionDetails)));
    }
  };
  page.browser.ws?.addEventListener("message", onMessage);
  return {
    entries,
    detach() {
      page.browser.ws?.removeEventListener("message", onMessage);
    },
  };
}

/**
 * /settings stamps no [data-ready] (no widget board lives here), so its
 * settle contract is network quiet: the resource timeline stops growing for
 * QUIET_WINDOW_MS, meaning the hydration scripts and the page's initial
 * tRPC queries (settings.get, roots.list, projects.hidden, ide.status) have
 * all landed. Resolves false on timeout — the caller still proceeds after
 * load + double rAF and says so in the settle detail.
 *
 * @param {import("./lib/cdp.mjs").Page} page
 * @returns {Promise<boolean>}
 */
async function settleOnNetworkQuiet(page) {
  const deadline = Date.now() + QUIET_TIMEOUT_MS;
  let lastCount = -1;
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    const count = await page.eval(() => performance.getEntriesByType("resource").length);
    if (count !== lastCount) {
      lastCount = count;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= QUIET_WINDOW_MS) {
      return true;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

/** The settle tail cdp.mjs `settle` uses: two rAFs so layout/effects committed. */
async function doubleRaf(page) {
  await page.eval(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const body = async () => {
  const options = parseArgs(process.argv.slice(2));
  const report = new Report({ suite: "settings-check", meta: { baseUrl: options.baseUrl } });
  const url = `${options.baseUrl}${SETTINGS_PATH}`;
  await assertReachable(options.baseUrl, url);

  const browser = await Browser.launch();
  try {
    const page = await browser.newPage();
    // Subscribe before navigation — early load errors must be captured.
    const consoleCollector = collectConsoleErrors(page);
    try {
      await page.goto(url);

      // 1. The page mounts its SettingsProvider stamp (client render).
      {
        const stamped = await page.waitFor(
          (selector) => document.querySelector(selector) !== null,
          { timeoutMs: PROVIDER_TIMEOUT_MS },
          PROVIDER_SELECTOR,
        );
        const providerCount = stamped
          ? await page.eval(
              (selector) => document.querySelectorAll(selector).length,
              PROVIDER_SELECTOR,
            )
          : 0;
        const quiet = await settleOnNetworkQuiet(page);
        await doubleRaf(page);
        if (!quiet) {
          report.warn(
            "settle",
            `network never went quiet within ${QUIET_TIMEOUT_MS} ms — checks ran after provider mount + double rAF only`,
          );
        }
        if (!stamped || providerCount !== 1) {
          report.fail(
            "settings-hydrates",
            `/settings did not mount its provider stamp ${PROVIDER_SELECTOR} exactly once (present=${stamped}, count=${providerCount})`,
          );
        } else {
          report.pass(
            "settings-hydrates",
            `/settings mounts ${PROVIDER_SELECTOR} exactly once after client render (settled on network quiet + double rAF)`,
          );
        }
      }

      // 2. All five sections render in the hydrated DOM.
      {
        const sections = await page.eval(
          (titles) => {
            const normalize = (text) => text.trim().toLowerCase();
            const rendered = [...document.querySelectorAll('[data-slot="widget-shell-title"]')].map(
              (node) => normalize(node.textContent ?? ""),
            );
            return {
              missing: titles.filter((title) => !rendered.includes(normalize(title))),
              rendered,
            };
          },
          SECTION_TITLES,
        );
        if (sections.missing.length > 0) {
          report.fail(
            "settings-sections",
            `sections missing from the rendered DOM: ${sections.missing.join(", ")} (widget-shell titles on the page: ${
              sections.rendered.length === 0 ? "none" : sections.rendered.join(", ")
            })`,
          );
        } else {
          report.pass(
            "settings-sections",
            `all five sections render — ${SECTION_TITLES.join(", ")} (${sections.rendered.length} widget shell(s) titled on the page)`,
          );
        }
      }

      // 3. No error-level console entries during load + settle (the known
      //    dev-only advisories WARN, never silently dropped).
      {
        const { entries } = consoleCollector;
        const failures = entries.filter((entry) => !entry.advisory);
        for (const entry of failures.slice(0, MAX_REPORTED_ERRORS)) {
          report.fail("settings-no-console-errors", `${entry.source}: ${clip(entry.text)}`);
        }
        if (failures.length > MAX_REPORTED_ERRORS) {
          report.fail("settings-no-console-errors", `…and ${failures.length - MAX_REPORTED_ERRORS} more`);
        }
        for (const entry of entries.filter((entry) => entry.advisory)) {
          report.warn(
            "settings-no-console-errors",
            `dev-only advisory (does not fail the gate): ${entry.source}: ${clip(entry.text)}`,
          );
        }
        if (failures.length === 0) {
          report.pass(
            "settings-no-console-errors",
            `zero error-level console entries or uncaught exceptions during load + settle${
              entries.length > 0 ? ` (${entries.length} dev-only advisory line(s) WARNed)` : ""
            }`,
          );
        }
      }
    } finally {
      consoleCollector.detach();
      await page.close();
    }
  } finally {
    await browser.close();
  }

  await writeJsonOut(report, options.out);
  return report;
};

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runEntry(body);
}
