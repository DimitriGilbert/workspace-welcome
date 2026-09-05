/**
 * Interaction: navigation — same-theme navigation row (§3.8 matrix).
 *
 * Contract: `/app` redirects to the default theme's dashboard; from a themed
 * page, project links (`a[href^="/app/<theme>/project/"]`) navigate
 * client-side while the `[data-ww-theme="<theme>"][data-theme-scope]` scope
 * REMAINS mounted (same-theme navigation never tears the theme down).
 * Project links only exist once the renderer mounts widgets, so that half
 * pends with WARN; the redirect half is real today and must pass.
 */
import { CONTRACT, queryExists } from "./helpers.mjs";

export const name = "navigation";

export async function run(page, report, ctx) {
  // 1. /app redirects to the default theme dashboard.
  await page.goto(`${ctx.baseUrl}/app`);
  await page.settle();
  const path = await page.getLocation();
  if (!path.startsWith(`/app/${ctx.theme}`)) {
    report.fail(
      `interaction:${name}`,
      `/app did not land on /app/${ctx.theme} (at ${path})`,
    );
    return { ok: false };
  }
  report.pass(`interaction:${name}`, `/app redirects to ${path}`);

  // 2. Same-theme project navigation keeps the scope mounted.
  const linkSelector = `a[href^="${CONTRACT.projectLinkPrefix}${ctx.theme}/project/"]`;
  if (!(await queryExists(page, linkSelector))) {
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
    report.fail(`interaction:${name}`, `clicking a project link did not navigate (at ${afterPath})`);
    return { ok: false };
  }
  const scopeStillMounted = await queryExists(
    page,
    `[data-ww-theme="${ctx.theme}"][data-theme-scope]`,
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
