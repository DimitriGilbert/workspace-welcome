#!/usr/bin/env node
/**
 * legacy-sentinel.mjs — the continuity sentinel of the check harness
 * (master plan §3.8; recalibrated for the post-/app-kill world, P0.2):
 * `/` is THE app — a hydrated widget board over the preset registry — and
 * NOTHING under `/app` resolves (the dead redirect namespace was killed
 * outright; unknown routes get the router's default not-found). Portal
 * chrome must keep escaping any theme scope.
 *
 * Checks:
 *   1. entrypoint-board     `/` renders a hydrated widget board for the
 *                           default preset: a `[data-theme-scope][data-ww-theme]`
 *                           scope with a `[data-ready]` board inside (the
 *                           same settle contract run.mjs uses).
 *   2. app-namespace-dead   `/app` and `/app/mission-control` no longer
 *                           resolve: the app's unknown-route reality is
 *                           HTTP 404 with the router's default not-found
 *                           body — no widget board rendered, no redirect
 *                           carrying `/?preset=` cargo.
 *   3. dialog-portals-out   on `/`, the add-directory dialog OPENS as a
 *                           live, visible portal. Since the theme-scope
 *                           system, portal content renders INSIDE the
 *                           page's `[data-theme-scope]` BY DESIGN (so theme
 *                           tokens apply); what must hold is the scope's
 *                           CSS contract — it never creates a containing
 *                           block, so the fixed-position dialog surface
 *                           stays anchored to the viewport and is never
 *                           positioned or clipped against the scope.
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

/**
 * The dead-route probe: `redirect: "manual"` surfaces any redirect hop the
 * server still performs (the killed namespace used to 307 to `/?preset=`),
 * so the contract is asserted on the raw response — 404, no Location.
 */
async function probeDeadRoute(url) {
  try {
    const response = await fetch(url, { redirect: "manual" });
    return { status: response.status, location: response.headers.get("location") };
  } catch (error) {
    return { status: 0, location: null, error: error instanceof Error ? error.message : String(error) };
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
    // 1. The entrypoint renders a hydrated widget board for the default preset.
    {
      const page = await browser.newPage();
      try {
        await page.goto(`${options.baseUrl}/`);
        const { dataReady } = await page.settle({ readyTimeoutMs: 4000 });
        const board = await page.eval(() => {
          const scope = document.querySelector("[data-theme-scope][data-ww-theme]");
          return {
            theme: scope?.getAttribute("data-ww-theme") ?? null,
            ready: document.querySelector("[data-widget-board][data-ready]") !== null,
          };
        });
        if (board.theme === null || !board.ready) {
          report.fail(
            "entrypoint-board",
            `/ rendered without a hydrated widget board (theme=${board.theme}, data-ready=${board.ready}, settle.dataReady=${dataReady})`,
          );
        } else {
          report.pass("entrypoint-board", `/ renders the hydrated "${board.theme}" board (default preset, [data-ready] stamped)`);
        }
      } finally {
        await page.close();
      }
    }

    // 2. The dead /app namespace is gone: unknown-route reality, no redirect cargo.
    {
      const page = await browser.newPage();
      try {
        for (const deadPath of ["/app", "/app/mission-control"]) {
          const url = `${options.baseUrl}${deadPath}`;
          const raw = await probeDeadRoute(url);
          if (raw.status !== 404 || raw.location !== null) {
            report.fail(
              "app-namespace-dead",
              `${deadPath} must be a plain 404 with no redirect (got status=${raw.status}, location=${raw.location ?? "none"}${raw.error === undefined ? "" : ` , error: ${raw.error}`})`,
            );
            continue;
          }
          // Rendered reality: the router's default not-found body — no theme
          // scope, no board, and no client-side hop off the dead path.
          await page.goto(url);
          await page.settle({ readyTimeoutMs: 1500 });
          const rendered = await page.eval(() => ({
            path: location.pathname,
            scopes: document.querySelectorAll("[data-theme-scope]").length,
            themes: document.querySelectorAll("[data-ww-theme]").length,
            boards: document.querySelectorAll("[data-widget-board]").length,
            notFound: document.body.textContent?.includes("Not Found") ?? false,
          }));
          if (rendered.path !== deadPath || rendered.scopes > 0 || rendered.themes > 0 || rendered.boards > 0) {
            report.fail(
              "app-namespace-dead",
              `${deadPath} rendered a board or redirected (at ${rendered.path}: scopes=${rendered.scopes}, themes=${rendered.themes}, boards=${rendered.boards})`,
            );
          } else {
            report.pass(
              "app-namespace-dead",
              `${deadPath} is gone — 404 not-found rendered, no board, no redirect (notFound=${rendered.notFound})`,
            );
          }
        }
      } finally {
        await page.close();
      }
    }

    // 3. One dialog opens as a live portal the scope cannot clip.
    {
      const page = await browser.newPage();
      try {
        await page.goto(`${options.baseUrl}/`);
        await page.settle({ readyTimeoutMs: 4000 });
        // The add-directory flow has two doors depending on the default
        // preset's chrome: a directly-visible button (bento/meadow chrome)
        // or the header register's Actions menu (mission-control).
        const direct = await page.eval(() => {
          const button = [...document.querySelectorAll("button")].find(
            (candidate) => candidate.textContent?.trim().includes("Add directory") === true,
          );
          if (button === undefined) return false;
          button.click();
          return true;
        });
        let openedTrigger = direct;
        if (!direct) {
          const menuOpened = await page.eval(() => {
            const trigger = [...document.querySelectorAll("button")].find(
              (candidate) => candidate.textContent?.trim() === "Actions",
            );
            if (trigger === undefined) return false;
            trigger.click();
            return true;
          });
          if (menuOpened) {
            const menuMounted = await page.waitFor(
              () => document.querySelector('[data-slot="dropdown-menu-content"]') !== null,
              { timeoutMs: 5000 },
            );
            if (menuMounted) {
              openedTrigger = await page.eval(() => {
                const item = [...document.querySelectorAll('[data-slot="dropdown-menu-item"]')].find(
                  (candidate) => candidate.textContent?.trim().includes("Add directory") === true,
                );
                if (item === undefined) return false;
                item.click();
                return true;
              });
            }
          }
        }
        if (!openedTrigger) {
          report.fail("dialog-portals-out", `could not open the add-directory dialog on / (no "Add directory" button, no Actions menu item)`);
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
              const style = getComputedStyle(surface);
              return {
                describe: [
                  surface.tagName.toLowerCase(),
                  surface.getAttribute("data-slot") !== null ? `[data-slot=${surface.getAttribute("data-slot")}]` : "",
                  surface.getAttribute("role") !== null ? `role=${surface.getAttribute("role")}` : "",
                ]
                  .filter(Boolean)
                  .join(" "),
                inScope: surface.closest("[data-theme-scope]") !== null,
                position: style.position,
                // The ThemeScope contract: the scope hosts the portal but
                // must not become its containing block — a fixed surface
                // anchors to the viewport (offsetParent === null) unless an
                // ancestor illegally creates a containing block (transform,
                // filter, …), which would position/clip it against the scope.
                viewportAnchored:
                  style.position !== "fixed" || surface.offsetParent === null,
                attached: surface.isConnected,
                visible: surface.getBoundingClientRect().width > 0,
              };
            });
            if (
              portal === null ||
              !portal.attached ||
              !portal.visible ||
              !portal.viewportAnchored
            ) {
              report.fail(
                "dialog-portals-out",
                `dialog surface ${portal?.describe ?? "unknown"} is not a live viewport-anchored portal (inScope=${portal?.inScope}, position=${portal?.position}, viewportAnchored=${portal?.viewportAnchored}, visible=${portal?.visible})`,
              );
            } else {
              report.pass(
                "dialog-portals-out",
                `${portal.describe} opened inside the theme scope, fixed-position anchored to the viewport (scope cannot position or clip it)`,
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
