/**
 * Interaction: filter (keyboard-first, master plan §3.8 matrix).
 *
 * Contract: pressing "/" anywhere on a themed page focuses the page's ONE
 * filter affordance (resolveFilterSelector — the runtime header input where
 * the console header is shown, the theme chrome's search field where the
 * theme replaces the header; both bind the single WorkspaceContext filter);
 * typing narrows the board; Escape clears and blurs. Until D8/W4 mount a
 * filter this reports WARN — a feature that is not mounted yet must not
 * look broken, nor pass silently.
 */
import { pressKey, resolveFilterSelector, readAttribute, typeInto } from "./helpers.mjs";

export const name = "filter";

export async function run(page, report, ctx) {
  const inputSelector = await resolveFilterSelector(page);
  if (inputSelector === null) {
    report.warn(
      `interaction:${name}`,
      `no filter affordance on /?preset=${ctx.theme} — console filter not mounted yet (lands with D8/W4)`,
    );
    return { ok: true, pending: true };
  }

  // 1. "/" focuses the filter input.
  await pressKey(page, "/");
  const focused = await page.eval(
    (selectorArg) => document.activeElement?.matches(selectorArg) ?? false,
    inputSelector,
  );
  if (!focused) {
    report.fail(`interaction:${name}`, 'pressing "/" did not focus the page\'s filter affordance');
    return { ok: false };
  }

  // 2. Typing updates the single filter value.
  if (!(await typeInto(page, inputSelector, "ww-check"))) {
    report.fail(`interaction:${name}`, "could not type into the filter affordance (input event not accepted)");
    return { ok: false };
  }
  const value = await readAttribute(page, inputSelector, "value");
  if (value !== "ww-check") {
    report.fail(`interaction:${name}`, `filter input value is "${value}" after typing`);
    return { ok: false };
  }

  // 3. Escape clears and blurs.
  await pressKey(page, "Escape", inputSelector);
  const cleared = await page.eval((selectorArg) => {
    const el = /** @type {HTMLInputElement | null} */ (document.querySelector(selectorArg));
    return el !== null && el.value.length === 0 && document.activeElement !== el;
  }, inputSelector);
  if (!cleared) {
    report.fail(`interaction:${name}`, "Escape did not clear + blur the filter input");
    return { ok: false };
  }

  // Sanity: the "/" keystroke must not have leaked INTO the input.
  const leaked = await page.eval((selectorArg) => {
    const el = /** @type {HTMLInputElement | null} */ (document.querySelector(selectorArg));
    return el !== null && el.value.includes("/");
  }, inputSelector);
  if (leaked) {
    report.fail(`interaction:${name}`, 'the "/" shortcut leaked a "/" character into the filter input');
    return { ok: false };
  }
  report.pass(`interaction:${name}`, '"/" focuses, typing narrows, Escape clears and blurs');
  return { ok: true };
}
