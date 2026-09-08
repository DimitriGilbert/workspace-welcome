/**
 * density probe (master plan §3.8).
 *
 * For every `[data-widget]` frame on the board: union-of-children bbox ÷
 * content-box area must be ≥ 0.70. The content box is the shell's
 * `[data-slot="widget-shell-content"]` (it stretches, so the measurement is
 * honest); without a shell, the frame itself. Children = element children
 * plus the client rects of direct text (text nodes are measured through
 * ranges). Skips frames smaller than 40 px and frames carrying
 * `data-density-exempt` — that attribute is reserved for loading/error/empty
 * states; abuse is a review question, not a probe question.
 */
import { measureJs } from "../lib/measure.mjs";

export const name = "density";

const DENSITY_FLOOR = 0.7;
const MIN_MEASURABLE_PX = 40;

export async function run(page, report) {
  const result = await page.evalMeasured(measureJs(), (M) => {
    const board = M.boardElement();
    if (board === null) return { noBoard: true };
    const sparse = [];
    let measured = 0;
    let skipped = 0;
    for (const frame of board.querySelectorAll("[data-widget]")) {
      const frameRect = M.rect(frame);
      if (frameRect.width < 40 || frameRect.height < 40) {
        skipped++;
        continue;
      }
      if (frame.hasAttribute("data-density-exempt")) {
        skipped++;
        continue;
      }
      const content =
        frame.querySelector('[data-slot="widget-shell-content"]') ?? frame;
      const contentRect = M.rect(content);

      const rects = [];
      for (const node of content.childNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = /** @type {Element} */ (node);
          if (
            el.hasAttribute("data-drag-ghost") ||
            el.hasAttribute("data-drag-handle") ||
            el.hasAttribute("data-resize-handle")
          ) {
            continue;
          }
          rects.push(M.rect(el));
        } else if (node.nodeType === Node.TEXT_NODE) {
          const text = /** @type {Text} */ (node).textContent ?? "";
          if (text.trim().length === 0) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const r of range.getClientRects()) {
            rects.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
          }
        }
      }
      measured++;
      const union = M.unionRect(rects);
      const ratio =
        union === null
          ? 0
          : Math.min(1, M.area(union) / Math.max(1, M.area(contentRect)));
      if (ratio < 0.7) {
        sparse.push({
          widget: frame.getAttribute("data-widget") ?? "?",
          ratio: M.round(ratio),
          detail:
            union === null
              ? "content box has no visible children"
              : `union ${M.round(union.width)}x${M.round(union.height)}px in content box ${M.round(contentRect.width)}x${M.round(contentRect.height)}px`,
        });
      }
    }
    return { noBoard: false, measured, skipped, sparse };
  });

  if (result === null || result === undefined) {
    report.fail(name, "page evaluation returned nothing");
    return { ok: false };
  }
  if (result.noBoard) {
    report.warn(name, "no [data-widget-board] mounted on page — nothing to measure");
    return { ok: true };
  }
  for (const entry of result.sparse) {
    report.fail(
      name,
      `widget ${entry.widget} is under-dense: fill ${entry.ratio} < ${DENSITY_FLOOR} (${entry.detail})`,
    );
  }
  if (result.sparse.length === 0) {
    report.pass(
      name,
      `${result.measured} widget(s) measured ≥ ${DENSITY_FLOOR} fill (${result.skipped} skipped: <40px or data-density-exempt)`,
    );
  }
  return { ok: result.sparse.length === 0 };
}
