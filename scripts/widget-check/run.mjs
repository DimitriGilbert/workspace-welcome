#!/usr/bin/env node
/**
 * widget-check run.mjs — the ONE validation harness (master plan §3.8 / M2).
 *
 * Flags:
 *   --theme <slug>        theme under test (default: mission-control)
 *   --page <kind>         dashboard | project   (default: dashboard)
 *   --path <projectPath>  absolute project path for --page project (splat
 *                         after the leading "/"; default: this repo's own
 *                         root, a real scanned project with a cached report)
 *   --viewport <WxH>      emulated viewport      (default: 1440x900)
 *   --suite <name>        theme | lab | parts-preview | self-test (default: theme)
 *   --bare                append ?bare=1 (custom.css dropped from the head)
 *   --base-url <url>      deployed app origin (default: http://127.0.0.1:37420)
 *   --out <path>          write the JSON summary to this file
 *   --probe <name>        repeatable; run only these probes
 *
 * Behavior: settles the page (waits for `[data-ready]`, then double rAF),
 * runs the probes serially, prints `PASS|FAIL|WARN <check> <detail>` lines
 * and exits non-zero on any FAIL. `--suite self-test` targets the known-bad
 * panel (folded into the lab at W4: `/__lab?self-test=1`) and INVERTS
 * the contract: the run is only OK when every probe reported FAIL on it
 * (expected failures prove detection); a probe that passes there is a FAIL.
 *
 * `theme`/`lab`/`parts-preview` map to the surviving routes (§3.2).
 *
 * Suite probe sets: `theme`/`lab`/`self-test` run every probe; the
 * parts-preview suite (P5) runs part-min — the P5-finalized assertions
 * (part floors at every rendered rung, per-scope token resolution,
 * fixed-box == viewport, overflow, open-dialog overlays). The board probes
 * are excluded: density/placement have no `[data-widget-board]` here —
 * and portal-scope is single-scope (it compares
 * every surface's --background to the FIRST scope's), which false-FAILs
 * surfaces living in the preview's other theme scopes. `--probe` overrides
 * the suite default explicitly.
 */
import { fileURLToPath } from "node:url";

import { Browser } from "./lib/cdp.mjs";
import { Report, runEntry, writeJsonOut } from "./lib/report.mjs";
import * as density from "./probes/density.mjs";
import * as partMin from "./probes/part-min.mjs";
import * as placement from "./probes/placement.mjs";
import * as portalScope from "./probes/portal-scope.mjs";
import * as tokenCompleteness from "./probes/token-completeness.mjs";

const PROBES = [density, tokenCompleteness, portalScope, placement, partMin];

const SUITES = {
  theme: { target: "theme", expectProbeFailures: false },
  lab: { target: "lab", expectProbeFailures: false },
  "parts-preview": {
    target: "parts-preview",
    expectProbeFailures: false,
    probes: ["part-min"],
  },
  "self-test": { target: "self-test", expectProbeFailures: true },
};

const DEFAULT_BASE_URL = process.env.WW_CHECK_BASE_URL ?? "http://127.0.0.1:37420";
const DEFAULT_THEME = "mission-control";
const DEFAULT_VIEWPORT = "1440x900";

function usage() {
  process.stdout.write(
    `usage: node scripts/widget-check/run.mjs [--suite theme|lab|parts-preview|self-test]\n` +
      `          [--theme <slug>] [--page dashboard|project] [--path <projectPath>]\n` +
      `          [--scheme <id>] [--viewport WxH]\n` +
      `          [--bare] [--base-url <url>] [--out <path>] [--probe <name>]...\n`,
  );
}

/** Minimal flag parser — the contract is fixed, no dependency needed. */
function parseArgs(argv) {
  const options = {
    theme: DEFAULT_THEME,
    page: "dashboard",
    path: undefined,
    scheme: undefined,
    viewport: DEFAULT_VIEWPORT,
    suite: "theme",
    bare: false,
    baseUrl: DEFAULT_BASE_URL,
    out: undefined,
    probes: [],
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`flag ${flag} needs a value`);
      return argv[i];
    };
    switch (flag) {
      case "--theme": options.theme = value(); break;
      case "--page": options.page = value(); break;
      case "--path": options.path = value(); break;
      case "--scheme": options.scheme = value(); break;
      case "--viewport": options.viewport = value(); break;
      case "--suite": options.suite = value(); break;
      case "--bare": options.bare = true; break;
      case "--base-url": options.baseUrl = value().replace(/\/$/, ""); break;
      case "--out": options.out = value(); break;
      case "--probe": options.probes.push(value()); break;
      case "--help": case "-h": options.help = true; break;
      default: throw new Error(`unknown flag: ${flag}`);
    }
  }
  return options;
}

/**
 * The project path behind `--page project` (D-V3-2): the splat route
 * `/project/<path…>` carries the absolute project path minus its
 * leading "/" (see apps/web/src/lib/open-project.ts). Default when omitted:
 * this repo's own root — a real scanned project with a cached report, so the
 * page under test is a real project readout, not the null-project shell.
 */
function resolveProjectPath(options) {
  if (options.page !== "project") {
    if (options.path !== undefined) {
      throw new Error(`--path only applies to --page project (got --page ${options.page})`);
    }
    return undefined;
  }
  const raw = options.path ?? fileURLToPath(new URL("../../", import.meta.url));
  if (!raw.startsWith("/")) {
    throw new Error(`--path must be an absolute filesystem path (got "${raw}")`);
  }
  const trimmed = raw.replace(/\/+$/, "");
  if (trimmed === "") throw new Error(`--path must name a project directory (got "${raw}")`);
  return trimmed;
}

function parseViewport(spec) {
  const match = spec.match(/^(\d{2,5})x(\d{2,5})$/);
  if (match === null) throw new Error(`--viewport must be WxH (got "${spec}")`);
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 200 || height < 200) throw new Error(`--viewport too small: ${spec}`);
  return { width, height };
}

function targetUrl(baseUrl, suiteName, options) {
  const suite = SUITES[suiteName];
  const params = new URLSearchParams();
  if (options.bare) params.set("bare", "1");
  if (options.scheme !== undefined) params.set("scheme", options.scheme);
  // Theme URLs are top-level (`/` dashboard, `/project/<path…>`) carrying
  // `?preset=<slug>` directly — the killed `/app/<slug>` routes are gone
  // (404). Targeting the top-level URLs keeps the harness on the app's real
  // surfaces while staying theme-specific.
  if (suite.target === "theme") params.set("preset", options.theme);
  const query = params.size > 0 ? `?${params.toString()}` : "";
  switch (suite.target) {
    case "theme": {
      if (options.page === "project") {
        const splat = options.path.replace(/^\/+/, "");
        return `${baseUrl}/project/${splat}${query}`;
      }
      return `${baseUrl}/${query}`;
    }
    case "lab":
      return `${baseUrl}/__lab${query}`;
    case "parts-preview":
      return `${baseUrl}/parts-preview`;
    case "self-test":
      return `${baseUrl}/__lab?self-test=1`;
    default:
      throw new Error(`unknown suite target: ${suite.target}`);
  }
}

/** Reachability gate: a dead origin is a harness error, not a page FAIL. */
async function assertReachable(baseUrl, url) {
  let response;
  try {
    response = await fetch(url, { redirect: "follow" });
  } catch (error) {
    throw new Error(
      `cannot reach ${url} — is the app deployed and the service up? (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  if (response.status === 404) {
    throw new Error(`404 for ${url} — route does not exist in the deployed build`);
  }
  if (response.status >= 500) {
    throw new Error(`${response.status} for ${url}`);
  }
}

const body = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return new Report({ suite: "widget-check", meta: { help: true } });
  }
  const suite = SUITES[options.suite];
  if (suite === undefined) {
    throw new Error(`unknown suite "${options.suite}" (expected: ${Object.keys(SUITES).join(", ")})`);
  }
  if (!["dashboard", "project"].includes(options.page)) {
    throw new Error(`unknown page "${options.page}" (expected: dashboard, project)`);
  }
  const viewport = parseViewport(options.viewport);
  const projectPath = resolveProjectPath(options);
  if (projectPath !== undefined) options.path = projectPath;
  const url = targetUrl(options.baseUrl, options.suite, options);
  await assertReachable(options.baseUrl, url);

  // Suite default probe set (all probes unless the suite narrows them);
  // an explicit --probe list overrides it.
  const defaultProbeNames = suite.probes ?? PROBES.map((probe) => probe.name);
  const effectiveNames = options.probes.length > 0 ? options.probes : defaultProbeNames;
  const probes = PROBES.filter((probe) => effectiveNames.includes(probe.name));
  const missing = effectiveNames.filter((wanted) => !PROBES.some((probe) => probe.name === wanted));
  if (missing.length > 0) {
    throw new Error(`unknown probe(s): ${missing.join(", ")} (expected: ${PROBES.map((p) => p.name).join(", ")})`);
  }

  const report = new Report({
    suite: options.suite,
    meta: {
      url,
      theme: options.theme,
      page: options.page,
      ...(projectPath !== undefined ? { projectPath } : {}),
      ...(options.scheme !== undefined ? { scheme: options.scheme } : {}),
      viewport: options.viewport,
      bare: options.bare,
    },
    // Self-test inversion: raw probe FAILs against the known-bad panel are
    // the expected outcome and must not decide the exit code — the
    // "self-test" detection lines below do.
    expectedFailChecks: suite.expectProbeFailures ? probes.map((probe) => probe.name) : [],
  });

  const browser = await Browser.launch();
  try {
    const page = await browser.newPage();
    await page.setViewport(viewport.width, viewport.height);
    await page.goto(url);
    const { dataReady } = await page.settle();
    if (!dataReady) {
      report.warn(
        "settle",
        `[data-ready] not observed within timeout — probes ran after load + double rAF only`,
      );
    }

    /** @type {Record<string, { failed: boolean, warned: boolean, failedDetails: string[] }>} */
    const probeResults = {};
    // Serial probe eval (§3.8): one probe at a time, shared settled page.
    for (const probe of probes) {
      const outcome = await probe.run(page, report);
      probeResults[probe.name] = outcome;
    }

    if (suite.expectProbeFailures) {
      // Self-test inversion: every probe MUST have failed the known-bad panel.
      for (const probe of probes) {
        const outcome = probeResults[probe.name] ?? { ok: false };
        if (outcome.ok) {
          report.fail(
            "self-test",
            `probe ${probe.name} did NOT detect any known-bad element on /__lab?self-test=1 — detection is broken`,
          );
        } else {
          report.pass("self-test", `probe ${probe.name} correctly reported failures (detection proven)`);
        }
      }
    }
    await page.close();
  } finally {
    await browser.close();
  }

  await writeJsonOut(report, options.out);
  return report;
};

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runEntry(body);
}
