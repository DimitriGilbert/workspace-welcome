/**
 * Interaction: navigation — entrypoint redirect + same-theme project
 * navigation (§3.8 matrix; recalibrated after the owner's `/app` kill —
 * `/` is THE app and NOTHING under `/app` renders; `routes/app/*.tsx` are
 * permanent redirects, so the old "`/app` → `/app/<theme>`" expectation
 * tested a route shape that no longer exists).
 *
 * Contract under test today:
 * 1. `/app` permanently redirects to the entrypoint `/`, which renders a
 *    registered theme's dashboard scope. WHICH theme owns the default is an
 *    owner decision, so the harness accepts ANY registered theme's scope
 *    (D2 calibration) — the redirect mechanism itself is the contract.
 * 2. The dead `/app/<slug>` survives as a redirect that CARRIES the
 *    selection: `/?preset=<slug>` must render THAT slug's scope (the cargo
 *    contract the redirect's `search` documents).
 * 3. From the themed board, project links navigate to the project surface
 *    while the `[data-ww-theme][data-theme-scope]` scope REMAINS mounted.
 *    Boards may author top-level `/project/…` hrefs or the legacy
 *    `/app/<theme>/project/…` ones (mission-control does) — both land on
 *    the top-level route, so arrival accepts either pathname prefix (the
 *    legacy hop's redirect flips the pathname asynchronously).
 *
 * Project links mount with the renderer's projects query, which can lag
 * the settle stamp: arriving via a redirect, settle's `[data-ready]`+
 * double-rAF has fired before the anchors mount (observed 0 anchors at
 * settle vs 32 at +3s), so the harness waits bounded (`waitForSelector`)
 * instead of trusting one post-settle query (D5 calibration) — and the same
 * bounded wait covers the theme scope after the project navigation, whose
 * pathname can flip before the target page mounts. Themes whose project
 * links are not authored yet (T3 pending) WARN honestly; pending must not
 * look broken, nor pass silently.
 */
import { CONTRACT, waitForSelector } from "./helpers.mjs";

export const name = "navigation";

/** Themes the app registers (apps/web/src/widgets/themes/index.ts). */
const REGISTERED_THEMES = ["mission-control", "bento", "meadow"];

/** The registered theme whose dashboard scope is mounted, or null. */
async function scopeTheme(page) {
  return page.eval((themes) => {
    for (const theme of themes) {
      if (document.querySelector(`[data-ww-theme="${theme}"][data-theme-scope]`) !== null) {
        return theme;
      }
    }
    return null;
  }, REGISTERED_THEMES);
}

export async function run(page, report, ctx) {
  // 1. /app redirects to the entrypoint; a registered scope renders there.
  await page.goto(`${ctx.baseUrl}/app`);
  await page.settle();
  const entryPath = await page.getLocation();
  const landed = entryPath === "/" ? await scopeTheme(page) : null;
  if (landed === null) {
    report.fail(
      `interaction:${name}`,
      `/app did not redirect to the entrypoint with a registered theme dashboard (at ${entryPath}, expected "/" rendering one of /app/{${REGISTERED_THEMES.join(", ")}})`,
    );
    return { ok: false };
  }
  report.pass(`interaction:${name}`, `/app redirects to ${entryPath} — the entrypoint renders the "${landed}" scope`);

  // 2. The dead /app/<slug> redirect carries its slug: /?preset=<slug>
  // renders THAT theme's scope.
  await page.goto(`${ctx.baseUrl}/app/${ctx.theme}`);
  await page.settle();
  const presetPath = await page.getLocation();
  const presetTheme = await scopeTheme(page);
  if (presetTheme !== ctx.theme) {
    report.fail(
      `interaction:${name}`,
      `/app/${ctx.theme} landed at ${presetPath} rendering "${presetTheme ?? "no"}" scope — the redirect must carry the slug as ?preset=`,
    );
    return { ok: false };
  }
  report.pass(`interaction:${name}`, `/app/${ctx.theme} redirects to ${presetPath} with the "${presetTheme}" scope mounted`);

  // 3. Same-theme project navigation keeps the scope mounted.
  const linkSelector = CONTRACT.projectLink;
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
  const legacyPrefix = `/app/${ctx.theme}/project/`;
  const arrived = await page.waitFor(
    (prefixes) => prefixes.some((prefix) => location.pathname.startsWith(prefix)),
    { timeoutMs: 5000 },
    ["/project/", legacyPrefix],
  );
  if (!arrived) {
    const stuckAt = await page.getLocation();
    report.fail(`interaction:${name}`, `clicking a project link did not navigate (still at ${stuckAt})`);
    return { ok: false };
  }
  const afterPath = await page.getLocation();
  // The project anchor is a plain href, so arriving here can be a full
  // document load (or the legacy route's redirect hop) — the pathname flips
  // before React mounts the new page's scope. Wait bounded (D5: no
  // fixed-sleep settle assumptions) and only then judge the scope.
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
