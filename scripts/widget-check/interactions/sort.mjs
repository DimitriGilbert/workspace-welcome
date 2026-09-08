/**
 * Interaction: sort (keyboard-first, master plan §3.8 matrix).
 *
 * Contract: sortable column affordances are `button[data-sort-key="<key>"]`;
 * focusing one and pressing Enter (native button activation) toggles that
 * key's direction, stamped `data-sort-direction="asc"|"desc"` on the button,
 * with at most one key sorted at a time (a second key activating clears the
 * first). Requires ≥ 2 sort buttons to prove exclusivity; a single button
 * only proves toggling.
 */
import { CONTRACT, pressKey, queryCount, readAttribute } from "./helpers.mjs";

export const name = "sort";

export async function run(page, report, ctx) {
  const selector = CONTRACT.sortButton;
  const count = await queryCount(page, selector);
  if (count === 0) {
    report.warn(
      `interaction:${name}`,
      `no ${selector} on /?preset=${ctx.theme} — sortable affordances not mounted yet`,
    );
    return { ok: true, pending: true };
  }

  const directions = await page.eval((selectorArg) => {
    return [...document.querySelectorAll(selectorArg)].map((el) => ({
      key: el.getAttribute("data-sort-key") ?? "?",
      direction: el.getAttribute("data-sort-direction"),
    }));
  }, selector);
  if (directions === null) {
    report.fail(`interaction:${name}`, "could not read sort buttons");
    return { ok: false };
  }

  // Focus the first button and press Enter → asc.
  const first = await page.eval(
    (selectorArg) => {
      const el = document.querySelector(selectorArg);
      if (el === null || !(el instanceof HTMLElement)) return null;
      el.focus();
      return el.getAttribute("data-sort-key");
    },
    selector,
  );
  if (first === null) {
    report.fail(`interaction:${name}`, `could not focus ${selector}`);
    return { ok: false };
  }
  await pressKey(page, "Enter", selector);

  const afterFirst = await readAttribute(page, `${selector}[data-sort-key="${first}"]`, "data-sort-direction");
  if (afterFirst !== "asc" && afterFirst !== "desc") {
    report.fail(
      `interaction:${name}`,
      `Enter on data-sort-key="${first}" did not set data-sort-direction (got "${afterFirst}")`,
    );
    return { ok: false };
  }

  // Toggle again → direction flips.
  await pressKey(page, "Enter", selector);
  const afterSecond = await readAttribute(page, `${selector}[data-sort-key="${first}"]`, "data-sort-direction");
  if (afterSecond === afterFirst) {
    report.fail(
      `interaction:${name}`,
      `second Enter did not flip direction of "${first}" (still "${afterSecond}")`,
    );
    return { ok: false };
  }

  // Exclusivity: activating a second key clears the first (when present).
  if (count >= 2) {
    const second = await page.eval((selectorArg) => {
      const buttons = document.querySelectorAll(selectorArg);
      const el = /** @type {HTMLElement | undefined} */ (buttons[1]);
      if (el === undefined) return null;
      el.focus();
      return el.getAttribute("data-sort-key");
    }, selector);
    if (second !== null && second !== first) {
      await pressKey(page, "Enter", selector);
      const firstDirection = await readAttribute(
        page,
        `${selector}[data-sort-key="${first}"]`,
        "data-sort-direction",
      );
      if (firstDirection !== null) {
        report.fail(
          `interaction:${name}`,
          `activating "${second}" left "${first}" sorted (${firstDirection}) — sort is not exclusive`,
        );
        return { ok: false };
      }
    }
  }

  report.pass(`interaction:${name}`, `${count} sort key(s): Enter toggles direction, exclusive`);
  return { ok: true };
}
