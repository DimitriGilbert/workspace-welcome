/**
 * no-inner-scroll probe (master plan §3.8).
 *
 * Walks the `[data-theme-scope]` subtree and FAILs any element that is a
 * user-scrollable container beyond a 2 px tolerance — vertical OR horizontal
 * — unless the scroll intent is declared (`data-scroll="widget"` on the
 * scroller or its widget frame) AND that widget is in the allowlist. The
 * shipped allowlist is EMPTY by design (G1 collects the exemptions); any
 * entry is an explicit, reviewed decision.
 *
 * Chrome exemption: subtrees under a portal container (`data-slot` ending in
 * `-portal` — dialog/dropdown/sheet portals hosted by ThemeScope) are skipped;
 * popup chrome may legitimately scroll. Drag ghosts and live regions are
 * skipped too.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { measureJs } from "../lib/measure.mjs";

export const name = "no-inner-scroll";

const SCROLL_TOLERANCE_PX = 2;
const MAX_REPORTED = 12;

function loadAllowlist() {
  const allowlistPath = fileURLToPath(new URL("./no-inner-scroll.allowlist.json", import.meta.url));
  const raw = JSON.parse(readFileSync(allowlistPath, "utf8"));
  const widgets = Array.isArray(raw.widgets) ? raw.widgets : null;
  if (widgets === null) {
    throw new Error(`Malformed allowlist ${allowlistPath}: expected { "widgets": string[] }`);
  }
  return { widgets };
}

/** @returns {Promise<{ok: boolean}>} */
export async function run(page, report) {
  const allowlist = loadAllowlist();
  const result = await page.evalMeasured(measureJs(), (M, allowlistArg) => {
    const scope = M.scopeElement();
    if (scope === null) {
      return { fatal: "no [data-theme-scope] element on page" };
    }
    const offenders = [];
    for (const el of scope.querySelectorAll("*")) {
      const tag = el.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "LINK" || tag === "META" || tag === "TEMPLATE" || tag === "NOSCRIPT") {
        continue;
      }
      // Chrome exemption: portal subtrees hosted by the scope.
      if (el.closest('[data-slot$="-portal"]') !== null) continue;
      if (el.closest("[data-drag-ghost]") !== null) continue;

      const overflowY = M.overflow(el, "y");
      const overflowX = M.overflow(el, "x");
      const scrollableY =
        (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
        el.scrollHeight - el.clientHeight > 2;
      const scrollableX =
        (overflowX === "auto" || overflowX === "scroll" || overflowX === "overlay") &&
        el.scrollWidth - el.clientWidth > 2;
      if (!scrollableY && !scrollableX) continue;

      const widgetFrame = el.closest("[data-widget]");
      const widgetId = widgetFrame?.getAttribute("data-widget") ?? null;
      const declared =
        el.getAttribute("data-scroll") === "widget" ||
        widgetFrame?.getAttribute("data-scroll") === "widget";
      const allowlisted = declared === true && widgetId !== null && allowlistArg.widgets.includes(widgetId);
      if (allowlisted) continue;

      const describe = [
        tag.toLowerCase(),
        el.getAttribute("data-slot") !== null ? `[data-slot=${el.getAttribute("data-slot")}]` : "",
        el.getAttribute("data-part") !== null ? `[data-part=${el.getAttribute("data-part")}]` : "",
        typeof el.className === "string" && el.className.length > 0
          ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}`
          : "",
        widgetId !== null ? ` (widget ${widgetId})` : "",
      ].join("");

      offenders.push({
        detail: `${describe} scrolls ${
          scrollableY ? `vertically ${el.scrollHeight - el.clientHeight}px` : `horizontally ${el.scrollWidth - el.clientWidth}px`
        }${declared ? " — data-scroll=widget declared but NOT allowlisted" : ""}`,
      });
      if (offenders.length >= 40) break;
    }
    return { fatal: null, total: offenders.length, offenders: offenders.slice(0, 12) };
  }, allowlist);

  if (result === null || result === undefined) {
    report.fail(name, "page evaluation returned nothing");
    return { ok: false };
  }
  if (result.fatal !== null) {
    report.fail(name, result.fatal);
    return { ok: false };
  }
  for (const offender of result.offenders) {
    report.fail(name, offender.detail);
  }
  if (result.total > result.offenders.length) {
    report.fail(name, `…and ${result.total - result.offenders.length} more scrollers`);
  }
  if (result.total === 0) {
    report.pass(name, `no inner scrollers inside [data-theme-scope] (tolerance ${SCROLL_TOLERANCE_PX}px, allowlist empty)`);
  }
  return { ok: result.total === 0 };
}
