/**
 * Shared DOM-measurement helpers injected into the page by the probes.
 *
 * `measureJs()` returns the SOURCE of an object of pure page-side helper
 * functions. Probes pass that source to `page.evalMeasured`, which makes it
 * available to the probe's page function as its first parameter (`M`).
 *
 * Everything here is geometry/geometry-adjacent truth from the live DOM:
 * no thresholds, no verdicts — the probes own policy.
 */

/**
 * @returns {string} source of the page-side helper object (IIFE-free; the
 * caller wraps it). The source must be a standalone expression evaluating
 * to an object of pure functions.
 */
export function measureJs() {
  return `{
    round(n) { return Math.round(n * 100) / 100; },
    rect(el) {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, left: r.left, right: r.right, bottom: r.bottom };
    },
    area(r) { return Math.max(0, r.width) * Math.max(0, r.height); },
    /** Intersection area of two rects (0 when disjoint). */
    intersectionArea(a, b) {
      const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return Math.max(0, width) * Math.max(0, height);
    },
    /** Bounding box of the union of rects. */
    unionRect(rects) {
      if (rects.length === 0) return null;
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (const r of rects) {
        left = Math.min(left, r.left); top = Math.min(top, r.top);
        right = Math.max(right, r.right); bottom = Math.max(bottom, r.bottom);
      }
      return { left, top, right, bottom, width: right - left, height: bottom - top };
    },
    px(value) {
      const n = Number.parseFloat(value);
      return Number.isFinite(n) ? n : 0;
    },
    overflow(el, axis) {
      const style = getComputedStyle(el);
      return style.getPropertyValue(axis === "y" ? "overflow-y" : "overflow-x").trim();
    },
    customProp(el, name) {
      return getComputedStyle(el).getPropertyValue(name).trim();
    },
    /**
     * All custom-property declarations reachable in the CSSOM whose selector
     * mentions the needle argument (e.g. a data-ww-theme attribute selector).
     * Cross-origin sheets are skipped (none exist in this app).
     */
    cssDeclarations(needle) {
      const declared = new Set();
      for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules; } catch { continue; }
        if (rules === null) continue;
        const walk = (ruleList) => {
          for (const rule of ruleList) {
            if (rule.cssRules !== undefined) {
              // @media / @supports / @layer wrappers — recurse, but only
              // count declarations when the wrapper itself is active-ish
              // (condition text is not evaluated; over-approximation is the
              // safe direction: fewer false misses).
              if (rule.selectorText === undefined) { walk(rule.cssRules); continue; }
            }
            if (rule.selectorText === undefined || rule.style === undefined) continue;
            if (!rule.selectorText.includes(needle)) continue;
            for (let i = 0; i < rule.style.length; i++) {
              const prop = rule.style[i];
              if (prop.startsWith("--")) declared.add(prop);
            }
          }
        };
        walk(rules);
      }
      return [...declared];
    },
    scopeElement() { return document.querySelector("[data-theme-scope]"); },
    boardElement() { return document.querySelector("[data-widget-board]"); },
  }`;
}
