/**
 * Interaction: tabs/views (keyboard-first, master plan §3.8 matrix).
 *
 * Contract: the ONE WidgetTabs implementation (`[data-slot="widget-tabs"]
 * [role="tab"]`) is keyboard-operable — focusing a tab and pressing Enter
 * (native button activation) selects it: `aria-selected="true"` moves,
 * `data-active` lands on the same tab, and exactly one tab is selected.
 * Arrow-key roving becomes assertable once use-console-keys wires 1..N view
 * switching (W4); until tabs exist at all this pends with WARN.
 */
import { CONTRACT, pressKey, queryCount, readAttribute } from "./helpers.mjs";

export const name = "tabs";

export async function run(page, report, ctx) {
  const selector = CONTRACT.tab;
  const count = await queryCount(page, selector);
  if (count === 0) {
    report.warn(
      `interaction:${name}`,
      `no ${selector} on /?preset=${ctx.theme} — no tabbed widget is mounted yet`,
    );
    return { ok: true, pending: true };
  }

  // Keyboard-activate the first tab via focus + Enter.
  const focused = await page.eval((selectorArg) => {
    const el = document.querySelector(selectorArg);
    if (el === null || !(el instanceof HTMLElement)) return null;
    el.focus();
    return el.textContent?.trim() ?? el.id;
  }, selector);
  if (focused === null) {
    report.fail(`interaction:${name}`, `could not focus ${selector}`);
    return { ok: false };
  }
  await pressKey(page, "Enter", selector);

  // Boards legitimately mount MULTIPLE tabs components (per-widget tabs).
  // Scope every assertion to the tablist the focused tab belongs to —
  // "exactly one selected" is a per-tablist invariant, never document-wide.
  const selected = await page.eval((selectorArg) => {
    const tabs = [...document.querySelectorAll(selectorArg)];
    const focused = document.activeElement;
    const focusedIsTab = focused !== null && tabs.includes(focused);
    const focusedTablist = focusedIsTab ? focused.closest("[role=tablist]") : null;
    const group = focusedTablist
      ? tabs.filter((t) => t.closest("[role=tablist]") === focusedTablist)
      : tabs;
    return {
      focusedIsTab,
      groupSize: group.length,
      selectedCount: group.filter((t) => t.getAttribute("aria-selected") === "true").length,
      activeMatches: group.every(
        (t) => (t.getAttribute("aria-selected") === "true") === t.hasAttribute("data-active"),
      ),
      focusedSelected: focusedIsTab && focused.getAttribute("aria-selected") === "true",
    };
  }, selector);
  if (selected === null || !selected.focusedIsTab) {
    report.fail(`interaction:${name}`, "could not read tab state (focused element is not a tab)");
    return { ok: false };
  }
  if (selected.selectedCount !== 1) {
    report.fail(`interaction:${name}`, `expected exactly 1 selected tab in its tablist after Enter, got ${selected.selectedCount}`);
    return { ok: false };
  }
  if (!selected.activeMatches) {
    report.fail(`interaction:${name}`, "aria-selected and data-active disagree across tabs");
    return { ok: false };
  }
  if (!selected.focusedSelected) {
    report.fail(`interaction:${name}`, "the focused tab is not the selected tab after Enter");
    return { ok: false };
  }

  report.pass(`interaction:${name}`, `${count} tab(s) in a ${selected.groupSize}-tab tablist: focus + Enter selects, aria-selected/data-active agree`);
  return { ok: true };
}
