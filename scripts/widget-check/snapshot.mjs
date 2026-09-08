#!/usr/bin/env node
/**
 * widget-check snapshot.mjs — owner-evidence baseline screenshots (master
 * plan P0.4).
 *
 * The probes are deliberately DOM-only (no vision); this tool is the ONE
 * place screenshots exist: it captures every theme × page × declared color
 * scheme so later normalization phases can be eyeballed or diffed against a
 * baseline captured on the untouched tree.
 *
 * Flags:
 *   --out <dir>        output directory
 *                      (default: <repo>/.plans/widget-normalization/snapshots/run)
 *   --base-url <url>   deployed app origin (default: $WW_CHECK_BASE_URL or
 *                      http://127.0.0.1:37420)
 *   --themes <csv>     themes to capture (default: every theme declared in
 *                      snapshot.config.json)
 *   --pages <csv>      dashboard,project (default: both)
 *   --width <px>       viewport width  (default: 1280)
 *   --height <px>      viewport height (default: 800)
 *
 * Behavior: mirrors run.mjs URL construction (`/?preset=` dashboard,
 * `/project/<repo-root-splat>?preset=` project) and settle ([data-ready] +
 * double rAF) per target, then captures the emulated viewport via CDP
 * (Page.captureScreenshot) and writes `<out>/<theme>-<page>-<scheme>.png`.
 * The scheme matrix comes from snapshot.config.json — the ids discovered
 * from the presets' own declarations, in declaration order (the FIRST id is
 * each preset's default); the literal id "default" renders with no
 * `?scheme=` param. Reachability gate like run.mjs: a dead origin or 5xx is
 * a harness error (exit 2). A missing/zero-byte capture is a FAIL line and
 * exit 1; success prints one PASS line per file plus the summary (exit 0).
 */
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Browser } from "./lib/cdp.mjs";
import { Report, runEntry } from "./lib/report.mjs";

const DEFAULT_BASE_URL = process.env.WW_CHECK_BASE_URL ?? "http://127.0.0.1:37420";
const DEFAULT_OUT = fileURLToPath(
  new URL("../../.plans/widget-normalization/snapshots/run", import.meta.url),
);
const PAGES = ["dashboard", "project"];
/** The one scheme id that renders with NO `?scheme=` param — each preset's
 * real default is its first declared id, so this only applies if the config
 * ever lists it explicitly. */
const NO_SCHEME_ID = "default";
const MIN_VIEWPORT_PX = 200;

function usage() {
  process.stdout.write(
    `usage: node scripts/widget-check/snapshot.mjs [--out <dir>] [--base-url <url>]\n` +
      `          [--themes <csv>] [--pages <csv>] [--width <px>] [--height <px>]\n`,
  );
}

function parseCsv(flag, raw) {
  const items = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (items.length === 0) {
    throw new Error(`flag ${flag} needs at least one comma-separated value`);
  }
  return items;
}

function parseDimension(flag, raw) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < MIN_VIEWPORT_PX) {
    throw new Error(`flag ${flag} must be an integer >= ${MIN_VIEWPORT_PX} (got "${raw}")`);
  }
  return value;
}

/** Minimal flag parser — the contract is fixed, no dependency needed. */
function parseArgs(argv) {
  const options = {
    out: DEFAULT_OUT,
    baseUrl: DEFAULT_BASE_URL,
    themes: [],
    pages: PAGES,
    width: 1280,
    height: 800,
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
      case "--out": options.out = value(); break;
      case "--base-url": options.baseUrl = value().replace(/\/$/, ""); break;
      case "--themes": options.themes = parseCsv(flag, value()); break;
      case "--pages": options.pages = parseCsv(flag, value()); break;
      case "--width": options.width = parseDimension(flag, value()); break;
      case "--height": options.height = parseDimension(flag, value()); break;
      case "--help": case "-h": options.help = true; break;
      default: throw new Error(`unknown flag: ${flag}`);
    }
  }
  return options;
}

/**
 * The discovered scheme matrix `{ theme: [scheme-id, ...] }` from
 * snapshot.config.json — generated from the presets' own `schemes`
 * declarations (first id = the preset's default). Kept beside the tool so
 * the capture matrix matches the shipped presets without the harness
 * importing app code.
 */
function loadSchemeMap() {
  const configPath = fileURLToPath(new URL("./snapshot.config.json", import.meta.url));
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new Error(
      `cannot read scheme config ${configPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${configPath} must be a JSON object mapping theme -> [scheme ids]`);
  }
  /** @type {Record<string, string[]>} */
  const schemeMap = {};
  for (const [theme, schemes] of Object.entries(parsed)) {
    if (
      !Array.isArray(schemes) ||
      schemes.some((id) => typeof id !== "string" || id.length === 0)
    ) {
      throw new Error(`${configPath}: theme "${theme}" must map to an array of scheme id strings`);
    }
    schemeMap[theme] = schemes;
  }
  return schemeMap;
}

/**
 * Target URL mirroring run.mjs exactly: dashboard = `/?preset=<slug>`,
 * project = `/project/<splat>?preset=<slug>` where the splat is the repo
 * root path minus its leading "/" (the same default run.mjs uses — a real
 * scanned project with a cached report). `?scheme=<id>` rides both unless
 * the scheme is the no-param "default".
 */
function targetUrl(baseUrl, theme, page, scheme, projectSplat) {
  const params = new URLSearchParams();
  params.set("preset", theme);
  if (scheme !== NO_SCHEME_ID) params.set("scheme", scheme);
  const query = `?${params.toString()}`;
  if (page === "project") {
    return `${baseUrl}/project/${projectSplat}${query}`;
  }
  return `${baseUrl}/${query}`;
}

/** Reachability gate: a dead origin is a harness error, not a page FAIL. */
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

const body = async () => {
  const options = parseArgs(process.argv.slice(2));
  const schemeMap = loadSchemeMap();
  if (options.help) {
    usage();
    return new Report({ suite: "snapshot", meta: { help: true } });
  }
  const themes = options.themes.length > 0 ? options.themes : Object.keys(schemeMap);
  if (themes.length === 0) {
    throw new Error("snapshot.config.json declares no themes — regenerate it from the presets");
  }
  const unknownThemes = themes.filter((theme) => schemeMap[theme] === undefined);
  if (unknownThemes.length > 0) {
    throw new Error(
      `unknown theme(s): ${unknownThemes.join(", ")} (expected: ${Object.keys(schemeMap).join(", ")})`,
    );
  }
  const unknownPages = options.pages.filter((page) => !PAGES.includes(page));
  if (unknownPages.length > 0) {
    throw new Error(`unknown page(s): ${unknownPages.join(", ")} (expected: ${PAGES.join(", ")})`);
  }

  // The project page's splat: this repo's own root, the same default run.mjs
  // uses (see its resolveProjectPath).
  const projectSplat = fileURLToPath(new URL("../../", import.meta.url))
    .replace(/\/+$/, "")
    .replace(/^\/+/, "");

  /** @type {{ name: string, url: string, file: string }[]} */
  const targets = [];
  for (const theme of themes) {
    for (const page of options.pages) {
      for (const scheme of schemeMap[theme]) {
        targets.push({
          name: `${theme}-${page}-${scheme}`,
          url: targetUrl(options.baseUrl, theme, page, scheme, projectSplat),
          file: join(options.out, `${theme}-${page}-${scheme}.png`),
        });
      }
    }
  }

  // Reachability gate like run.mjs — every target checked BEFORE spawning
  // Chromium, so a dead origin or 5xx is exit 2 with zero captures.
  for (const target of targets) {
    await assertReachable(options.baseUrl, target.url);
  }

  const report = new Report({
    suite: "snapshot",
    meta: {
      out: options.out,
      baseUrl: options.baseUrl,
      themes,
      pages: options.pages,
      viewport: `${options.width}x${options.height}`,
    },
  });

  mkdirSync(options.out, { recursive: true });
  const browser = await Browser.launch();
  try {
    const page = await browser.newPage();
    await page.setViewport(options.width, options.height);
    for (const target of targets) {
      try {
        await page.goto(target.url);
        const { dataReady } = await page.settle();
        if (!dataReady) {
          report.warn(
            "settle",
            `${target.name} — [data-ready] not observed within timeout; captured after load + double rAF only`,
          );
        }
        const written = await page.capture(target.file);
        const size = statSync(target.file).size;
        if (size === 0) {
          report.fail(
            "capture",
            `${target.name} — ${target.file} is zero bytes on disk (wrote ${written})`,
          );
        } else {
          report.pass("capture", `${target.name} — ${target.file} (${size} bytes)`);
        }
      } catch (error) {
        report.fail(
          "capture",
          `${target.name} — ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    await page.close();
  } finally {
    await browser.close();
  }
  return report;
};

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runEntry(body);
}
