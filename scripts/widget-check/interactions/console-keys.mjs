/**
 * Interaction: console-keys (master plan §3.8 matrix; W4's console).
 *
 * Run against the themed dashboard: "/" focuses the page's single filter
 * affordance (resolveFilterSelector — the runtime header input where the
 * console header is shown, the theme chrome's search field where the theme
 * replaces the header; both drive the one workspace filter), typing fills
 * it, Escape clears + blurs; digit keys 1..N switch console views (tracked
 * via the page's `data-console-view` stamp), keys beyond N are no-ops,
 * Escape restores the default view; and typing while a field has focus
 * never triggers the console (the editable-target guard).
 *
 * Digit switching is asserted ONLY against the preset-declared console
 * views — the runtime renders the console tablist in the page header and
 * stamps `data-console-view` solely when the preset declares
 * `consoleViews` (render-layout). Per-widget tabs elsewhere on the board
 * are legitimate widget chrome (see tabs.mjs), NOT console views —
 * counting them made digit keys FAIL on themes that declare none (D3
 * calibration). On a theme without declared consoleViews the digits are a
 * runtime no-op: the harness asserts no crash and an intact board instead
 * of demanding view switches.
 *
 * If the console affordances are not mounted yet this WARNs — pending must
 * not look broken, nor pass silently.
 */
import { pressKey, resolveFilterSelector, readAttribute, typeInto } from "./helpers.mjs";

export const name = "console-keys";

const SETTLE_MS = 120;

async function activeView(page) {
  return page.eval(async (settleMs) => {
    await new Promise((resolve) => setTimeout(resolve, settleMs));
    return document.querySelector("[data-console-view]")?.getAttribute("data-console-view") ?? null;
  }, SETTLE_MS);
}

/**
 * The preset-declared console views as rendered: the page-header console
 * tablist exists only when the preset declares `consoleViews`, and
 * `data-console-view` is stamped with the active view id only then.
 * Returns null when this page declares no console views.
 */
async function declaredConsoleViews(page) {
  return page.eval(() => {
    const stamped = document.querySelector("[data-console-view]");
    if (stamped === null) return null;
    return {
      stamped: stamped.getAttribute("data-console-view"),
      tabs: document.querySelectorAll('[data-slot="page-header"] [data-slot="widget-tabs"] [role="tab"]').length,
    };
  });
}

export async function run(page, report, ctx) {
  const where = ctx.path ?? `/?preset=${ctx.theme}`;
  const filterSelector = await resolveFilterSelector(page);
  if (filterSelector === null) {
    report.warn(
      `interaction:${name}`,
      `no filter affordance on ${where} — console not mounted yet (renderer pending)`,
    );
    return { ok: true, pending: true };
  }

  const views = await declaredConsoleViews(page);
  let ok = true;

  // 1. "/" focuses the filter.
  await pressKey(page, "/");
  const focusedOnSlash = await page.eval(
    (selectorArg) => document.activeElement?.matches(selectorArg) ?? false,
    filterSelector,
  );
  if (!focusedOnSlash) {
    report.fail(`interaction:${name}`, 'pressing "/" did not focus the page\'s filter affordance');
    ok = false;
  } else {
    report.pass(`interaction:${name}`, `"/" focuses the console filter`);
  }

  // 2. Typing fills the single filter.
  if (!(await typeInto(page, filterSelector, "gamma"))) {
    report.fail(`interaction:${name}`, "filter input rejected the typed value");
    ok = false;
  }

  // 3. The editable-target guard: keys pressed while a field has focus
  // never switch views (they belong to the field).
  const beforeTyping = await activeView(page);
  await pressKey(page, "2", filterSelector);
  const afterTyping = await activeView(page);
  const valueWhileFocused = await readAttribute(page, filterSelector, "value");
  if (afterTyping !== beforeTyping || valueWhileFocused !== "gamma") {
    report.fail(
      `interaction:${name}`,
      `keys while focused: view ${beforeTyping}→${afterTyping}, value "${valueWhileFocused}" — the editable guard leaked`,
    );
    ok = false;
  }

  // 4. Escape clears + blurs the filter.
  await pressKey(page, "Escape", filterSelector);
  const cleared = await page.eval((selectorArg) => {
    const el = /** @type {HTMLInputElement | null} */ (document.querySelector(selectorArg));
    return el !== null && el.value.length === 0 && document.activeElement !== el;
  }, filterSelector);
  if (!cleared) {
    report.fail(`interaction:${name}`, "Escape did not clear and blur the filter");
    ok = false;
  } else {
    report.pass(`interaction:${name}`, "Escape clears and blurs the filter");
  }

  // 5. Digit keys — only meaningful against preset-declared console views.
  if (views === null || views.tabs === 0) {
    // D3 calibration: without declared consoleViews the runtime renders no
    // console tablist and digits are a deliberate no-op. Assert no crash
    // and an intact board instead of demanding view switches.
    const widgetsBefore = await page.eval(
      () => document.querySelectorAll("[data-widget-board] [data-widget]").length,
    );
    for (const key of ["1", "2", "9"]) {
      await pressKey(page, key);
    }
    const afterDigits = await page.eval(() => ({
      widgets: document.querySelectorAll("[data-widget-board] [data-widget]").length,
      stamped: document.querySelector("[data-console-view]") !== null,
    }));
    if (afterDigits.widgets !== widgetsBefore || afterDigits.stamped) {
      report.fail(
        `interaction:${name}`,
        `digit keys disturbed a board with no declared consoleViews (widgets ${widgetsBefore}→${afterDigits.widgets}, view stamp ${afterDigits.stamped ? "appeared" : "absent"})`,
      );
      ok = false;
    } else {
      report.pass(
        `interaction:${name}`,
        `digit keys are a no-op on a theme without declared consoleViews — board intact (${widgetsBefore} widgets, no view stamp)`,
      );
    }
    return { ok };
  }

  // 6. Digit keys switch views 1..N.
  const initial = await activeView(page);
  await pressKey(page, String(Math.min(3, views.tabs)));
  const switched = await activeView(page);
  if (switched === initial) {
    report.fail(`interaction:${name}`, `digit key did not switch the view (still ${initial})`);
    ok = false;
  } else {
    report.pass(`interaction:${name}`, `digit key switched the view ${initial} → ${switched}`);
  }

  // 7. Keys beyond N are no-ops.
  await pressKey(page, "9");
  const afterBeyond = await activeView(page);
  if (afterBeyond !== switched) {
    report.fail(`interaction:${name}`, `key "9" switched the view (${switched} → ${afterBeyond}) — out-of-range keys must be ignored`);
    ok = false;
  }

  // 8. Escape restores the default view (no field focused).
  await page.eval(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  await pressKey(page, "Escape");
  const restored = await activeView(page);
  if (restored !== initial) {
    report.fail(`interaction:${name}`, `Escape left the view at ${restored} — expected the default ${initial}`);
    ok = false;
  } else {
    report.pass(`interaction:${name}`, `Escape restored the default view (${restored})`);
  }

  return { ok };
}
