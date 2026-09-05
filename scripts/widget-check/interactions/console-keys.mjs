/**
 * Interaction: console-keys (master plan §3.8 matrix; W4's console).
 *
 * Run against the widget lab (`--path /app/__lab`): "/" focuses the single
 * workspace filter input, typing fills it, Escape clears + blurs; digit
 * keys 1..N switch console views (tracked via the page's
 * `data-console-view` stamp), keys beyond N are no-ops, Escape restores the
 * default view; and typing while a field has focus never triggers the
 * console (the editable-target guard).
 *
 * If the console affordances are not mounted yet this WARNs — pending must
 * not look broken, nor pass silently.
 */
import { CONTRACT, pressKey, queryExists, readAttribute, typeInto } from "./helpers.mjs";

export const name = "console-keys";

const SETTLE_MS = 120;

async function activeView(page) {
  return page.eval(async (settleMs) => {
    await new Promise((resolve) => setTimeout(resolve, settleMs));
    return document.querySelector("[data-console-view]")?.getAttribute("data-console-view") ?? null;
  }, SETTLE_MS);
}

export async function run(page, report, ctx) {
  const where = ctx.path ?? `/app/${ctx.theme}`;
  if (!(await queryExists(page, CONTRACT.filterInput))) {
    report.warn(
      `interaction:${name}`,
      `no ${CONTRACT.filterInput} on ${where} — console not mounted yet (renderer pending)`,
    );
    return { ok: true, pending: true };
  }

  const views = await page.eval(() =>
    [...document.querySelectorAll('[data-slot="widget-tabs"] [role="tab"]')].map(
      (tab) => tab.textContent ?? "",
    ),
  );
  let ok = true;

  // 1. "/" focuses the filter.
  await pressKey(page, "/");
  const focusedOnSlash = await page.eval(
    (selectorArg) => document.activeElement?.matches(selectorArg) ?? false,
    CONTRACT.filterInput,
  );
  if (!focusedOnSlash) {
    report.fail(`interaction:${name}`, `pressing "/" did not focus ${CONTRACT.filterInput}`);
    ok = false;
  } else {
    report.pass(`interaction:${name}`, `"/" focuses the console filter`);
  }

  // 2. Typing fills the single filter.
  if (!(await typeInto(page, CONTRACT.filterInput, "gamma"))) {
    report.fail(`interaction:${name}`, "filter input rejected the typed value");
    ok = false;
  }

  // 3. The editable-target guard: keys pressed while a field has focus
  // never switch views (they belong to the field).
  const beforeTyping = await activeView(page);
  await pressKey(page, "2", CONTRACT.filterInput);
  const afterTyping = await activeView(page);
  const valueWhileFocused = await readAttribute(page, CONTRACT.filterInput, "value");
  if (afterTyping !== beforeTyping || valueWhileFocused !== "gamma") {
    report.fail(
      `interaction:${name}`,
      `keys while focused: view ${beforeTyping}→${afterTyping}, value "${valueWhileFocused}" — the editable guard leaked`,
    );
    ok = false;
  }

  // 4. Escape clears + blurs the filter.
  await pressKey(page, "Escape", CONTRACT.filterInput);
  const cleared = await page.eval((selectorArg) => {
    const el = /** @type {HTMLInputElement | null} */ (document.querySelector(selectorArg));
    return el !== null && el.value.length === 0 && document.activeElement !== el;
  }, CONTRACT.filterInput);
  if (!cleared) {
    report.fail(`interaction:${name}`, "Escape did not clear and blur the filter");
    ok = false;
  } else {
    report.pass(`interaction:${name}`, "Escape clears and blurs the filter");
  }

  if (views.length === 0) {
    return { ok };
  }

  // 5. Digit keys switch views 1..N.
  const initial = await activeView(page);
  await pressKey(page, String(Math.min(3, views.length)));
  const switched = await activeView(page);
  if (switched === initial) {
    report.fail(`interaction:${name}`, `digit key did not switch the view (still ${initial})`);
    ok = false;
  } else {
    report.pass(`interaction:${name}`, `digit key switched the view ${initial} → ${switched}`);
  }

  // 6. Keys beyond N are no-ops.
  await pressKey(page, "9");
  const afterBeyond = await activeView(page);
  if (afterBeyond !== switched) {
    report.fail(`interaction:${name}`, `key "9" switched the view (${switched} → ${afterBeyond}) — out-of-range keys must be ignored`);
    ok = false;
  }

  // 7. Escape restores the default view (no field focused).
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
