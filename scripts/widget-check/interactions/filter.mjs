/**
 * Interaction: filter (keyboard-first, master plan §3.8 matrix).
 *
 * Contract: pressing "/" anywhere on a themed page moves focus to
 * `input[data-console-filter]` (use-console-keys); typing narrows the board
 * (the input reflects the single WorkspaceContext filter); Escape clears and
 * blurs. Until D8/W4 mount the console keys this reports WARN — a feature
 * that is not mounted yet must not look broken, nor pass silently.
 */
import { CONTRACT, focus, pressKey, queryExists, readAttribute, typeInto } from "./helpers.mjs";

export const name = "filter";

export async function run(page, report, ctx) {
  const inputSelector = CONTRACT.filterInput;
  if (!(await queryExists(page, inputSelector))) {
    report.warn(
      `interaction:${name}`,
      `no ${inputSelector} on /app/${ctx.theme} — console filter not mounted yet (lands with D8/W4)`,
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
    report.fail(`interaction:${name}`, `pressing "/" did not focus ${inputSelector}`);
    return { ok: false };
  }

  // 2. Typing updates the single filter value.
  if (!(await typeInto(page, inputSelector, "ww-check"))) {
    report.fail(`interaction:${name}`, `could not type into ${inputSelector} (input event not accepted)`);
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
    report.fail(`interaction:${name}`, `the "/" shortcut leaked a "/" character into ${inputSelector}`);
    return { ok: false };
  }
  void focus;
  report.pass(`interaction:${name}`, '"/" focuses, typing narrows, Escape clears and blurs');
  return { ok: true };
}
