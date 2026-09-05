/**
 * part-min probe (master plan §3.8).
 *
 * Every element stamping `data-part-min-w` / `data-part-min-h` (the
 * exported MIN_CONTENT floors, mirrored onto the DOM by definePart) must
 * render at least that large at its current rung — a smaller box means the
 * theme's cell density makes the floor unsatisfiable, which is a harness
 * finding, not runtime behavior. Also FAILs horizontal overflow inside the
 * scope. Assertion vocabulary is stable, but thresholds/attribute handling
 * are finalized jointly with P5 (parts preview) — do not add new attribute
 * spellings without P5.
 */
import { measureJs } from "../lib/measure.mjs";

export const name = "part-min";

const TOLERANCE_PX = 1;
const OVERFLOW_TOLERANCE_PX = 2;
const MAX_REPORTED = 12;

export async function run(page, report) {
  const result = await page.evalMeasured(measureJs(), (M) => {
    const scope = M.scopeElement();
    if (scope === null) {
      return { fatal: "no [data-theme-scope] element on page" };
    }
    const parts = [...scope.querySelectorAll("[data-part-min-w], [data-part-min-h]")];
    const problems = [];
    for (const el of parts) {
      const rect = M.rect(el);
      const label =
        el.getAttribute("data-part") ??
        el.getAttribute("data-slot") ??
        el.tagName.toLowerCase();
      const minW = M.px(el.getAttribute("data-part-min-w") ?? "0");
      const minH = M.px(el.getAttribute("data-part-min-h") ?? "0");
      if (minW > 0 && rect.width < minW - 1) {
        problems.push({ kind: "width", detail: `part ${label} renders ${M.round(rect.width)}px wide < data-part-min-w ${minW}px` });
      }
      if (minH > 0 && rect.height < minH - 1) {
        problems.push({ kind: "height", detail: `part ${label} renders ${M.round(rect.height)}px tall < data-part-min-h ${minH}px` });
      }
    }
    const overflowX = scope.scrollWidth - scope.clientWidth;
    return {
      fatal: null,
      partCount: parts.length,
      problems: problems.slice(0, 24),
      overflowX: M.round(overflowX),
    };
  });

  if (result === null || result === undefined) {
    report.fail(name, "page evaluation returned nothing");
    return { ok: false };
  }
  if (result.fatal !== null) {
    report.fail(name, result.fatal);
    return { ok: false };
  }
  const ok = result.problems.length === 0 && result.overflowX <= OVERFLOW_TOLERANCE_PX;
  for (const problem of result.problems.slice(0, MAX_REPORTED)) {
    report.fail(name, problem.detail);
  }
  if (result.problems.length > MAX_REPORTED) {
    report.fail(name, `…and ${result.problems.length - MAX_REPORTED} more undersized parts`);
  }
  if (result.overflowX > OVERFLOW_TOLERANCE_PX) {
    report.fail(name, `horizontal overflow inside [data-theme-scope]: content is ${result.overflowX}px wider than the scope`);
  }
  if (ok) {
    report.pass(
      name,
      result.partCount === 0
        ? "no data-part-min-* markers rendered yet (parts land with P4/P5)"
        : `${result.partCount} part box(es) ≥ their data-part-min-w/h, no horizontal overflow`,
    );
  }
  return { ok };
}
