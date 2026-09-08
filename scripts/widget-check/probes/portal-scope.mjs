/**
 * portal-scope probe (master plan §3.8).
 *
 * Any OPEN portal surface in the page (dialog-role elements and Base UI
 * `*-content` slots — dialogs, sheets, dropdown/popover content) must carry
 * the same computed `--background` as the `[data-theme-scope]` element.
 * Portaled content styled by the scope's tokens passes; content that escaped
 * the theme (portaled outside the scope, or overriding the token) FAILs.
 * With no portal surface open the probe has nothing to verify and reports
 * WARN — interactions suites open real dialogs before this probe matters.
 */
import { measureJs } from "../lib/measure.mjs";

export const name = "portal-scope";

const MAX_REPORTED = 8;

export async function run(page, report) {
  const result = await page.evalMeasured(measureJs(), (M) => {
    const scope = M.scopeElement();
    if (scope === null) {
      return { fatal: "no [data-theme-scope] element on page" };
    }
    const scopeBg = M.customProp(scope, "--background");
    const seen = new Set();
    const surfaces = [];
    for (const el of document.querySelectorAll('[role="dialog"], [data-slot$="-content"]')) {
      if (seen.has(el)) continue;
      seen.add(el);
      const bg = M.customProp(el, "--background");
      const insideScope = scope.contains(el);
      surfaces.push({
        insideScope,
        bg,
        matches: bg === scopeBg,
        describe: [
          el.tagName.toLowerCase(),
          el.getAttribute("role") !== null ? `role=${el.getAttribute("role")}` : "",
          el.getAttribute("data-slot") !== null ? `[data-slot=${el.getAttribute("data-slot")}]` : "",
          typeof el.textContent === "string" && el.textContent.trim().length > 0
            ? `"${el.textContent.trim().slice(0, 40)}"`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      });
    }
    return { fatal: null, scopeBg, surfaces: surfaces.slice(0, 24) };
  });

  if (result === null || result === undefined) {
    report.fail(name, "page evaluation returned nothing");
    return { ok: false };
  }
  if (result.fatal !== null) {
    report.fail(name, result.fatal);
    return { ok: false };
  }
  if (result.surfaces.length === 0) {
    report.warn(name, `no open portal content to inspect (scope --background: ${result.scopeBg || "unset"})`);
    return { ok: true };
  }
  let failures = 0;
  for (const surface of result.surfaces) {
    if (surface.matches) continue;
    failures++;
    if (failures <= MAX_REPORTED) {
      report.fail(
        name,
        `${surface.describe} renders ${surface.insideScope ? "inside" : "OUTSIDE"} [data-theme-scope] with --background "${surface.bg}" ≠ scope's "${result.scopeBg}"`,
      );
    }
  }
  if (failures > MAX_REPORTED) {
    report.fail(name, `…and ${failures - MAX_REPORTED} more mismatched portal surfaces`);
  }
  if (failures === 0) {
    report.pass(
      name,
      `${result.surfaces.length} portal surface(s) inherit the scope's --background`,
    );
  }
  return { ok: failures === 0 };
}
