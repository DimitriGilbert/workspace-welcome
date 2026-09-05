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
      `no ${selector} on /app/${ctx.theme} — no tabbed widget is mounted yet`,
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

  const selected = await page.eval((selectorArg) => {
    const tabs = [...document.querySelectorAll(selectorArg)];
    return {
      selectedCount: tabs.filter((t) => t.getAttribute("aria-selected") === "true").length,
      activeMatches: tabs.every(
        (t) => (t.getAttribute("aria-selected") === "true") === t.hasAttribute("data-active"),
      ),
      focusedSelected: document.activeElement !== null && document.activeElement.getAttribute("aria-selected") === "true",
    };
  }, selector);
  if (selected === null) {
    report.fail(`interaction:${name}`, "could not read tab state");
    return { ok: false };
  }
  if (selected.selectedCount !== 1) {
    report.fail(`interaction:${name}`, `expected exactly 1 selected tab after Enter, got ${selected.selectedCount}`);
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

  report.pass(`interaction:${name}`, `${count} tab(s): focus + Enter selects, aria-selected/data-active agree`);
  return { ok: true };
}
