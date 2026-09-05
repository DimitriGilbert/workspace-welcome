/**
 * Interaction: navigation — redirect + same-theme navigation (§3.8 matrix).
 *
 * Contract: `/app` redirects to the configured default theme's dashboard
 * and the target renders a theme scope. WHICH theme owns the default is an
 * owner decision pending G1 (#3), so the harness accepts ANY registered
 * theme (`/app/<mission-control|bento|meadow>`) instead of baking in a
 * specific default (D2 calibration) — the redirect mechanism itself is the
 * contract under test. From a themed page, project links
 * (`a[href^="/app/<theme>/project/"]`) navigate while the
 * `[data-ww-theme="<theme>"][data-theme-scope]` scope REMAINS mounted.
 *
 * Project links mount with the renderer's projects query, which can lag
 * the settle stamp: arriving via the `/app` redirect, settle's
 * `[data-ready]`+double-rAF has fired before the anchors mount (observed
 * 0 anchors at settle vs 32 at +3s), so the harness waits bounded
 * (`waitForSelector`) instead of trusting one post-settle query (D5
 * calibration) — and the same bounded wait covers the theme scope after
 * the project navigation, whose pathname can flip before the target page
 * mounts. Themes whose project links are not authored yet (T3 pending)
 * WARN honestly; pending must not look broken, nor pass silently.
 */
import { CONTRACT, queryExists, waitForSelector } from "./helpers.mjs";

export const name = "navigation";

/** Themes the app registers (apps/web/src/widgets/themes/index.ts). */
const REGISTERED_THEMES = ["mission-control", "bento", "meadow"];

export async function run(page, report, ctx) {
  // 1. /app redirects to a registered theme dashboard whose scope mounts.
  await page.goto(`${ctx.baseUrl}/app`);
  await page.settle();
  const path = await page.getLocation();
  const landed = REGISTERED_THEMES.find((theme) => path.startsWith(`/app/${theme}`));
  if (landed === undefined) {
    report.fail(
      `interaction:${name}`,
      `/app did not redirect to a registered theme dashboard (at ${path}, expected one of /app/{${REGISTERED_THEMES.join(", ")}})`,
    );
    return { ok: false };
  }
  if (!(await queryExists(page, `[data-ww-theme="${landed}"][data-theme-scope]`))) {
    report.fail(
      `interaction:${name}`,
      `/app redirect target ${path} did not render a "${landed}" theme scope`,
    );
    return { ok: false };
  }
  report.pass(`interaction:${name}`, `/app redirects to ${path} — registered theme, scope mounted`);

  // 2. Same-theme project navigation keeps the scope mounted. The redirect
  // may have landed on a different (default) theme, so move to THIS
  // theme's dashboard before hunting for its project links.
  if (!path.startsWith(`/app/${ctx.theme}`)) {
    await page.goto(`${ctx.baseUrl}/app/${ctx.theme}`);
    await page.settle();
  }
  const linkSelector = `a[href^="${CONTRACT.projectLinkPrefix}${ctx.theme}/project/"]`;
  if (!(await waitForSelector(page, linkSelector, { timeoutMs: 5000 }))) {
    report.warn(
      `interaction:${name}`,
      `no ${linkSelector} on /app/${ctx.theme} — project links not mounted yet (renderer pending)`,
    );
    return { ok: true, pending: true };
  }
  await page.eval((selectorArg) => {
    const el = /** @type {HTMLAnchorElement | null} */ (document.querySelector(selectorArg));
    el?.click();
  }, linkSelector);
  const prefix = `/app/${ctx.theme}/project/`;
  const arrived = await page.waitFor(
    (expectedPrefix) => location.pathname.startsWith(expectedPrefix),
    { timeoutMs: 5000 },
    prefix,
  );
  if (!arrived) {
    const stuckAt = await page.getLocation();
    report.fail(`interaction:${name}`, `clicking a project link did not navigate (still at ${stuckAt})`);
    return { ok: false };
  }
  const afterPath = await page.getLocation();
  // The project anchor is a plain href, so arriving here can be a full
  // document load — the pathname flips before React mounts the new page's
  // scope. Wait bounded (D5: no fixed-sleep settle assumptions) and only
  // then judge the scope.
  const scopeStillMounted = await waitForSelector(
    page,
    `[data-ww-theme="${ctx.theme}"][data-theme-scope]`,
    { timeoutMs: 5000 },
  );
  if (!scopeStillMounted) {
    report.fail(
      `interaction:${name}`,
      `theme scope for "${ctx.theme}" was unmounted after same-theme navigation`,
    );
    return { ok: false };
  }
  report.pass(`interaction:${name}`, `same-theme navigation to ${afterPath} kept the theme scope mounted`);
  return { ok: true };
}
