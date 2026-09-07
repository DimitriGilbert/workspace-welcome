/**
 * Shared page-side helpers for interaction scripts. Every function here is
 * serialized into the page by `page.eval` — self-contained, no imports.
 */

/**
 * Dispatch a keyboard event (keydown + keyup) on the given target selector,
 * or the active element when `selector` is null. Returns the tag of the
 * element that received it (null when no target matched).
 */
export async function pressKey(page, key, selector = null, { bubbles = true, cancelable = true } = {}) {
  return page.eval(
    (keyArg, selectorArg, bubblesArg, cancelableArg) => {
      const target =
        selectorArg === null
          ? document.activeElement ?? document.body
          : document.querySelector(selectorArg);
      if (target === null) return null;
      const init = { key: keyArg, bubbles: bubblesArg, cancelable: cancelableArg };
      target.dispatchEvent(new KeyboardEvent("keydown", init));
      target.dispatchEvent(new KeyboardEvent("keyup", init));
      return target.tagName.toLowerCase();
    },
    key,
    selector,
    bubbles,
    cancelable,
  );
}

/** Focus an element by selector; returns whether focus actually moved. */
export async function focus(page, selector) {
  return page.eval((selectorArg) => {
    const el = document.querySelector(selectorArg);
    if (el === null) return false;
    if (el instanceof HTMLElement) el.focus();
    return document.activeElement === el;
  }, selector);
}

/**
 * Set an `<input>` value the way React sees it: native value setter + a
 * bubbling `input` event (React's onChange listens for synthetic input).
 */
export async function typeInto(page, selector, value) {
  return page.eval((selectorArg, valueArg) => {
    const el = /** @type {HTMLInputElement | null} */ (document.querySelector(selectorArg));
    if (el === null) return false;
    const setter = /** @type {(v: string) => void} */ (
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
    );
    if (setter === undefined) return false;
    setter.call(el, valueArg);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return el.value === valueArg;
  }, selector, value);
}

/** Query helpers. */
export async function queryExists(page, selector) {
  return page.eval(
    (selectorArg) => document.querySelector(selectorArg) !== null,
    selector,
  );
}

/**
 * Resolve the page's filter affordance to a unique selector; null when no
 * filter is mounted (the scripts WARN pending on that). The runtime header
 * input (`data-console-filter` — use-console-keys' "/" target) is the
 * affordance where the console header is shown (mission-control). Themes
 * that replace the header hide it with CSS (bento/meadow `custom.css`:
 * `[data-slot="page-header"] { display: none }`) and bind the SAME
 * workspace filter to their own search field (meadow masthead, bento
 * command palette) — a display:none input can never take focus, so the
 * contract must resolve the VISIBLE affordance, not the first attribute
 * match. The resolved element is stamped `data-ww-check-filter` (a
 * throwaway page-scoped mark) so every step of a script targets the SAME
 * input.
 */
export async function resolveFilterSelector(page) {
  return page.eval(() => {
    const candidates = document.querySelectorAll(
      "input[data-console-filter], input[type='search'][aria-label='Filter projects']",
    );
    for (const el of candidates) {
      const visible =
        typeof el.checkVisibility === "function"
          ? el.checkVisibility()
          : el.offsetParent !== null;
      if (!visible) continue;
      el.setAttribute("data-ww-check-filter", "");
      return "[data-ww-check-filter]";
    }
    return null;
  });
}

export async function queryCount(page, selector) {
  return page.eval(
    (selectorArg) => document.querySelectorAll(selectorArg).length,
    selector,
  );
}

/** Read a data attribute (null when the element is absent). */
export async function readAttribute(page, selector, attribute) {
  return page.eval(
    (selectorArg, attrArg) => document.querySelector(selectorArg)?.getAttribute(attrArg) ?? null,
    selector,
    attribute,
  );
}

/** Wait (bounded) until a page predicate selector exists. */
export async function waitForSelector(page, selector, { timeoutMs = 5000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await queryExists(page, selector)) return true;
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** The harness's standard interaction contract selectors (see scripts).
 * The filter input is NOT a fixed selector — resolve it per page with
 * {@link resolveFilterSelector} (the visible affordance; see its doc). */
export const CONTRACT = {
  sortButton: "button[data-sort-key]",
  tab: '[data-slot="widget-tabs"] [role="tab"]',
  /** Substring shared by every project anchor: top-level `/project/…`
   * hrefs (the only form post-/app-kill — the dead `/app/<theme>/project/…`
   * namespace was killed at P0.2). */
  projectLink: 'a[href*="/project/"]',
};
