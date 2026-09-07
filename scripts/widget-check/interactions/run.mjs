#!/usr/bin/env node
/**
 * interactions/run.mjs — the keyboard-first interaction matrix runner
 * (master plan §3.8). Runs each script serially, fresh page per script,
 * same output contract as run.mjs.
 *
 * Flags: --theme <slug> --path <pathname> --viewport <WxH> --base-url <url>
 *        --script <name> (repeatable filter) --out <path>
 *
 * The target page is `--path` when given (e.g. /__lab for the lab
 * scripts), else `/?preset=<theme>` — the direct theme deep-link (the
 * dead `/app/<theme>` namespace was killed at P0.2).
 *
 * Script contract: `export const name` + `export async function run(page,
 * report, ctx)` reporting `interaction:<name>` findings. Affordances that
 * are not mounted yet (renderer pending before W4/D8) report WARN — pending
 * must not look broken, nor pass silently (the WARN is visible in the JSON).
 */
import { fileURLToPath } from "node:url";

import { Browser } from "../lib/cdp.mjs";
import { Report, runEntry, writeJsonOut } from "../lib/report.mjs";
import * as consoleKeys from "./console-keys.mjs";
import * as dragResize from "./drag-resize.mjs";
import * as filter from "./filter.mjs";
import * as navigation from "./navigation.mjs";
import * as sort from "./sort.mjs";
import * as tabs from "./tabs.mjs";

const SCRIPTS = [filter, sort, tabs, navigation, consoleKeys, dragResize];

const DEFAULT_BASE_URL = process.env.WW_CHECK_BASE_URL ?? "http://127.0.0.1:37420";
const DEFAULT_THEME = "mission-control";
const DEFAULT_VIEWPORT = "1440x900";

function parseArgs(argv) {
  const options = {
    theme: DEFAULT_THEME,
    path: undefined,
    viewport: DEFAULT_VIEWPORT,
    baseUrl: DEFAULT_BASE_URL,
    out: undefined,
    scripts: [],
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
      case "--path": options.path = value(); break;
      case "--viewport": options.viewport = value(); break;
      case "--base-url": options.baseUrl = value().replace(/\/$/, ""); break;
      case "--out": options.out = value(); break;
      case "--script": options.scripts.push(value()); break;
      default: throw new Error(`unknown flag: ${flag}`);
    }
  }
  return options;
}

const body = async () => {
  const options = parseArgs(process.argv.slice(2));
  const scripts = SCRIPTS.filter((script) => options.scripts.length === 0 || options.scripts.includes(script.name));
  const missing = options.scripts.filter(
    (wanted) => !SCRIPTS.some((script) => script.name === wanted),
  );
  if (missing.length > 0) {
    throw new Error(`unknown script(s): ${missing.join(", ")} (expected: ${SCRIPTS.map((s) => s.name).join(", ")})`);
  }
  const match = options.viewport.match(/^(\d{2,5})x(\d{2,5})$/);
  if (match === null) throw new Error(`--viewport must be WxH (got "${options.viewport}")`);

  const targetPath = options.path ?? `/?preset=${options.theme}`;
  const report = new Report({
    suite: "interactions",
    meta: {
      theme: options.theme,
      path: targetPath,
      viewport: options.viewport,
      scripts: scripts.map((s) => s.name),
    },
  });

  const browser = await Browser.launch();
  try {
    for (const script of scripts) {
      const page = await browser.newPage();
      try {
        await page.setViewport(Number(match[1]), Number(match[2]));
        await page.goto(`${options.baseUrl}${targetPath}`);
        await page.settle();
        await script.run(page, report, { baseUrl: options.baseUrl, theme: options.theme, path: targetPath });
      } catch (error) {
        report.fail(
          `interaction:${script.name}`,
          `harness error while running script: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        await page.close();
      }
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
