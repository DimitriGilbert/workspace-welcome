#!/usr/bin/env node
/**
 * legacy-sentinel.mjs — the legacy-continuity row of the check harness
 * (master plan §3.8 / M2.7): while the widget system is built in its own
 * namespace, the legacy routes must keep working untouched, and portal
 * chrome must keep escaping any theme scope.
 *
 * Checks:
 *   1. legacy-root          `/` renders (200 + hydrated markers: the
 *                           "Add directory" toolbar button).
 *   2. legacy-design-mc     `/designs/mission-control` renders (200 + the
 *                           design's `.mc-label` chrome).
 *   3. dialog-portals-out   on `/`, the add-directory sheet OPENS and its
 *                           content portals OUTSIDE any
 *                           `[data-theme-scope]` (Base UI sheet content is
 *                           a dialog-role surface; containment inside a
 *                           scope would clip/position it against that scope).
 *
 * Same output contract as run.mjs: PASS|FAIL|WARN lines, JSON via --out,
 * exit ≠ 0 on FAIL. Flags: --base-url <url> [--out <path>].
 */
import { fileURLToPath } from "node:url";

import { Browser } from "./lib/cdp.mjs";
import { Report, runEntry, writeJsonOut } from "./lib/report.mjs";

const DEFAULT_BASE_URL = process.env.WW_CHECK_BASE_URL ?? "http://127.0.0.1:37420";

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

async function fetchStatus(url) {
  try {
    const response = await fetch(url, { redirect: "follow" });
    return response.status;
  } catch {
    return 0;
  }
}

const body = async () => {
  const options = parseArgs(process.argv.slice(2));
  const report = new Report({ suite: "legacy-sentinel", meta: { baseUrl: options.baseUrl } });

  if ((await fetchStatus(`${options.baseUrl}/`)) === 0) {
    throw new Error(`cannot reach ${options.baseUrl} — is the app deployed and the service up?`);
  }

  const browser = await Browser.launch();
  try {
    // 1. Legacy production root renders.
    {
      const page = await browser.newPage();
      try {
        await page.goto(`${options.baseUrl}/`);
        await page.settle({ readyTimeoutMs: 4000 });
        const markers = await page.eval(() => {
          const buttons = [...document.querySelectorAll("button")];
          const addDirectory = buttons.find(
            (button) => button.textContent?.trim().includes("Add directory") === true,
          );
          return {
            hydrated: document.querySelector("#root, [data-radix-root], body") !== null,
            bodyChars: document.body.textContent?.length ?? 0,
            addDirectory: addDirectory !== undefined,
          };
        });
        if (markers === null || !markers.addDirectory || markers.bodyChars < 200) {
          report.fail(
            "legacy-root",
            `/ rendered but legacy markers are missing (addDirectory=${markers?.addDirectory}, bodyChars=${markers?.bodyChars})`,
          );
        } else {
          report.pass("legacy-root", `/ renders with hydrated legacy chrome (${markers.bodyChars} chars of text)`);
        }
      } finally {
        await page.close();
      }
    }

    // 2. Legacy mission-control design route renders.
    {
      const page = await browser.newPage();
      try {
        await page.goto(`${options.baseUrl}/designs/mission-control`);
        await page.settle({ readyTimeoutMs: 4000 });
        const markers = await page.eval(() => ({
          labels: document.querySelectorAll(".mc-label").length,
          mcVars: [...document.styleSheets].some((sheet) => {
            try {
              return sheet.cssRules !== null;
            } catch {
              return false;
            }
          }),
          bodyChars: document.body.textContent?.length ?? 0,
        }));
        if (markers === null || markers.labels === 0 || markers.bodyChars < 200) {
          report.fail(
            "legacy-design-mc",
            `/designs/mission-control rendered without its .mc-label chrome (labels=${markers?.labels}, bodyChars=${markers?.bodyChars})`,
          );
        } else {
          report.pass("legacy-design-mc", `/designs/mission-control renders (${markers.labels} .mc-label nodes)`);
        }
      } finally {
        await page.close();
      }
    }

    // 3. One dialog opens and portals OUTSIDE any [data-theme-scope].
    {
      const page = await browser.newPage();
      try {
        await page.goto(`${options.baseUrl}/`);
        await page.settle({ readyTimeoutMs: 4000 });
        const clicked = await page.eval(() => {
          const button = [...document.querySelectorAll("button")].find(
            (candidate) => candidate.textContent?.trim().includes("Add directory") === true,
          );
          if (button === undefined) return false;
          button.click();
          return true;
        });
        if (!clicked) {
          report.fail("dialog-portals-out", `could not find the "Add directory" button on / to open a dialog`);
        } else {
          const opened = await page.waitFor(
            () => document.querySelector('[data-slot="sheet-content"], [role="dialog"]') !== null,
            { timeoutMs: 5000 },
          );
          if (!opened) {
            report.fail("dialog-portals-out", `clicking "Add directory" did not open any dialog/sheet surface`);
          } else {
            const portal = await page.eval(() => {
              const surface =
                document.querySelector('[data-slot="sheet-content"]') ??
                document.querySelector('[role="dialog"]');
              if (surface === null) return null;
              return {
                describe: [
                  surface.tagName.toLowerCase(),
                  surface.getAttribute("data-slot") !== null ? `[data-slot=${surface.getAttribute("data-slot")}]` : "",
                  surface.getAttribute("role") !== null ? `role=${surface.getAttribute("role")}` : "",
                ]
                  .filter(Boolean)
                  .join(" "),
                insideScope: surface.closest("[data-theme-scope]") !== null,
                attached: surface.isConnected,
                visible: surface.getBoundingClientRect().width > 0,
              };
            });
            if (
              portal === null ||
              !portal.attached ||
              !portal.visible ||
              portal.insideScope
            ) {
              report.fail(
                "dialog-portals-out",
                `dialog surface ${portal?.describe ?? "unknown"} is not a live portal outside [data-theme-scope] (insideScope=${portal?.insideScope}, visible=${portal?.visible})`,
              );
            } else {
              report.pass(
                "dialog-portals-out",
                `${portal.describe} opened and portals outside any [data-theme-scope]`,
              );
            }
            // Leave no open sheet behind (page is discarded right after).
            await page.eval(() => {
              document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
            });
          }
        }
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
