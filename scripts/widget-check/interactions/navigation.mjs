/**
 * Interaction: navigation — preset deep-link + same-theme project
 * navigation (§3.8 matrix; recalibrated after the /app kill, P0.2: the
 * `/app` namespace is GONE — `/` is THE app, and `?preset=<slug>` is a
 * DIRECT deep-link with no redirect hop carrying it anymore).
 *
 * Contract under test today:
 * 1. registry-sync — the script's theme list mirrors the preset registry
 *    on disk (the ids declared by each theme's preset.ts module under
 *    apps/web/src/components/themes). Divergence FAILs: the list is a sync
 *    tripwire, not a second source of truth.
 * 2. `/?preset=<slug>` directly renders THAT slug's board scope hydrated
 *    (`[data-ww-theme="<slug>"][data-theme-scope]` with the board's
 *    `[data-ready]` stamp after settle).
 * 3. From the themed board, project links navigate to the project surface
 *    while the `[data-ww-theme][data-theme-scope]` scope REMAINS mounted.
 * 4. (PC.5) The clicked project link lands on a CLEAN URL — no `?preset=`
 *    cargo. User links never carry the param (owner order: it is agent
 *    deep-link cargo only); same-theme continuity rides the persisted
 *    prefs (`ww.prefs.v1`), not the URL.
 *
 * Project links mount with the renderer's projects query, which can lag
 * the settle stamp: settle's `[data-ready]`+ double-rAF has fired before
 * the anchors mount (observed 0 anchors at settle vs 32 at +3s), so the
 * harness waits bounded (`waitForSelector`) instead of trusting one
 * post-settle query (D5 calibration) — and the same bounded wait covers
 * the theme scope after the project navigation, since the target page
 * mounts after the pathname flips (a plain project href is a full
 * document load). Themes whose project links are not authored yet WARN
 * honestly; pending must not look broken, nor pass silently.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { CONTRACT, waitForSelector } from "./helpers.mjs";

export const name = "navigation";

/**
 * Themes the app registers — MUST mirror the ids declared by each theme's
 * `preset.ts` module under apps/web/src/components/themes (verified against
 * disk at run start; divergence FAILs).
 */
const REGISTERED_THEMES = ["mission-control", "bento", "meadow"];

const THEMES_DIR = fileURLToPath(
  new URL("../../../apps/web/src/components/themes", import.meta.url),
);

/**
 * The registry's theme ids, parsed from the preset modules on disk the
 * same way the runtime registry keys them: every `<slug>/preset.ts`
 * default-exports a `ThemePreset` whose `id` is the first property.
 */
function readRegistryThemeIds() {
  const ids = [];
  for (const entry of readdirSync(THEMES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    let content;
    try {
      content = readFileSync(path.join(THEMES_DIR, entry.name, "preset.ts"), "utf8");
    } catch {
      continue; // no preset module — the registry glob skips it too
    }
    const match = content.match(/ThemePreset\s*=\s*\{[^{}]*?\bid:\s*["']([\w-]+)["']/);
    if (match !== null) ids.push(match[1]);
  }
  return ids;
}

export async function run(page, report, ctx) {
  // 1. The theme list mirrors the preset registry on disk.
  {
    const diskIds = readRegistryThemeIds();
    const unregistered = REGISTERED_THEMES.filter((theme) => !diskIds.includes(theme));
    const unlisted = diskIds.filter((theme) => !REGISTERED_THEMES.includes(theme));
    if (unregistered.length > 0 || unlisted.length > 0) {
      report.fail(
        `interaction:${name}`,
        `theme list out of sync with apps/web/src/components/themes/*/preset.ts (listed but not registered: [${unregistered.join(", ")}]; registered but not listed: [${unlisted.join(", ")}])`,
      );
      return { ok: false };
    }
    report.pass(
      `interaction:${name}`,
      `theme list mirrors the preset registry on disk ([${diskIds.join(", ")}])`,
    );
  }

  // 2. /?preset=<slug> directly renders that slug's hydrated board scope.
  const scopeSelector = `[data-ww-theme="${ctx.theme}"][data-theme-scope]`;
  await page.goto(`${ctx.baseUrl}/?preset=${encodeURIComponent(ctx.theme)}`);
  const { dataReady } = await page.settle();
  const landed = await page.getLocation();
  const scopeMounted = await waitForSelector(page, scopeSelector, { timeoutMs: 5000 });
  if (!scopeMounted || !dataReady) {
    report.fail(
      `interaction:${name}`,
      `/?preset=${ctx.theme} landed at ${landed} without the theme's hydrated scope (scope=${scopeMounted}, data-ready=${dataReady})`,
    );
    return { ok: false };
  }
  report.pass(
    `interaction:${name}`,
    `/?preset=${ctx.theme} directly renders the "${ctx.theme}" scope hydrated ([data-ready] stamped)`,
  );

  // 3. Same-theme project navigation keeps the scope mounted.
  const linkSelector = CONTRACT.projectLink;
  if (!(await waitForSelector(page, linkSelector, { timeoutMs: 5000 }))) {
    report.warn(
      `interaction:${name}`,
      `no ${linkSelector} on /?preset=${ctx.theme} — project links not mounted yet (renderer pending)`,
    );
    return { ok: true, pending: true };
  }
  await page.eval((selectorArg) => {
    const el = /** @type {HTMLAnchorElement | null} */ (document.querySelector(selectorArg));
    el?.click();
  }, linkSelector);
  const arrived = await page.waitFor(
    () => location.pathname.startsWith("/project/"),
    { timeoutMs: 5000 },
  );
  if (!arrived) {
    const stuckAt = await page.getLocation();
    report.fail(`interaction:${name}`, `clicking a project link did not navigate (still at ${stuckAt})`);
    return { ok: false };
  }
  const afterPath = await page.getLocation();
  // PC.5: the clicked link is user-facing, so it must land CLEAN — `?preset=`
  // is agent deep-link cargo; continuity comes from the persisted prefs.
  if (afterPath.includes("preset=")) {
    report.fail(
      `interaction:${name}`,
      `project link carried ?preset= cargo (${afterPath}) — user links must be clean URLs (PC.5)`,
    );
    return { ok: false };
  }
  // The project anchor is a plain href, so arriving here can be a full
  // document load — the pathname flips before React mounts the new page's
  // scope. Wait bounded (D5: no fixed-sleep settle assumptions) and only
  // then judge the scope.
  const scopeStillMounted = await waitForSelector(page, scopeSelector, { timeoutMs: 5000 });
  if (!scopeStillMounted) {
    report.fail(
      `interaction:${name}`,
      `theme scope for "${ctx.theme}" was unmounted after same-theme navigation`,
    );
    return { ok: false };
  }
  report.pass(
    `interaction:${name}`,
    `same-theme navigation to ${afterPath} kept the theme scope mounted (clean URL, no ?preset= cargo)`,
  );
  return { ok: true };
}
