/**
 * placement probe (master plan §3.8).
 *
 * On a ready `[data-widget-board]`:
 * - every widget frame's `data-x/y/cols/rows` must match its computed grid
 *   position (derived from the frame's rect relative to its region's tracks —
 *   never parsed FROM the attributes);
 * - each region's direct grid children carrying `data-widget` must equal its
 *   total `[data-widget]` descendant count (no widget frames buried inside
 *   another widget);
 * - top-level widget bounding boxes must be pairwise disjoint.
 *
 * No board (renderer pending) is a WARN — nothing to measure. A board
 * without `data-ready` after settling is a FAIL (readiness is a contract).
 */
import { measureJs } from "../lib/measure.mjs";

export const name = "placement";

const OVERLAP_TOLERANCE_PX2 = 1;
const MAX_REPORTED = 12;

export async function run(page, report) {
  const result = await page.evalMeasured(measureJs(), (M) => {
    const board = M.boardElement();
    if (board === null) return { noBoard: true };
    const ready = board.hasAttribute("data-ready");
    const marked = [...board.querySelectorAll("[data-region]")];
    const regionList = marked.length > 0 ? marked : [board];

    /** @type {{ kind: string, detail: string }[]} */
    const problems = [];
    /** @type {{ id: string | null, left: number, top: number, right: number, bottom: number, width: number, height: number }[]} */
    const boxes = [];
    let widgetCount = 0;

    for (const region of regionList) {
      const regionLabel = region.getAttribute("data-region") ?? "(board)";
      const style = getComputedStyle(region);
      const tracks = style.gridTemplateColumns.split(" ").filter((t) => t.length > 0);
      const cols = tracks.length;
      const colGap = M.px(style.columnGap);
      const rowGap = M.px(style.rowGap);
      const cellW = cols > 0 ? M.px(tracks[0]) : 0;
      const cellH = M.px(style.gridAutoRows);
      if (cols === 0 || cellW === 0 || cellH === 0) {
        problems.push({ kind: "metrics", detail: `region ${regionLabel}: grid metrics unavailable (tracks=${style.gridTemplateColumns}, autoRows=${style.gridAutoRows})` });
        continue;
      }

      const directWidgets = [...region.children].filter((el) => el.hasAttribute("data-widget"));
      const allWidgets = region.querySelectorAll("[data-widget]");
      widgetCount += directWidgets.length;
      if (allWidgets.length !== directWidgets.length) {
        problems.push({
          kind: "nesting",
          detail: `region ${regionLabel}: ${allWidgets.length - directWidgets.length} [data-widget] element(s) are not direct grid children`,
        });
      }

      for (const el of directWidgets) {
        const id = el.getAttribute("data-widget") ?? "?";
        // Rect deltas against the region's own box — offsetLeft would depend
        // on which ancestor happens to be the offsetParent.
        const regionRect = M.rect(region);
        const itemRect = M.rect(el);
        const relLeft = itemRect.left - regionRect.left;
        const relTop = itemRect.top - regionRect.top;
        const expected = {
          x: Math.round(relLeft / (cellW + colGap)),
          y: Math.round(relTop / (cellH + rowGap)),
          cols: Math.round((itemRect.width + colGap) / (cellW + colGap)),
          rows: Math.round((itemRect.height + rowGap) / (cellH + rowGap)),
        };
        for (const attr of /** @type {const} */ (["x", "y", "cols", "rows"])) {
          const declared = el.getAttribute(`data-${attr}`);
          if (declared === null) {
            problems.push({ kind: "attribute", detail: `widget ${id} is missing data-${attr}` });
            continue;
          }
          if (Number(declared) !== expected[attr]) {
            problems.push({
              kind: "position",
              detail: `widget ${id}: data-${attr}=${declared} but computed position is ${expected[attr]} (cell ${M.round(cellW)}x${M.round(cellH)}px, gap ${M.round(colGap)}/${M.round(rowGap)}px)`,
            });
          }
        }
        boxes.push({ id, ...M.rect(el) });
      }
    }

    const overlaps = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        // Page functions are serialized: the tolerance must be inline.
        const area = M.intersectionArea(boxes[i], boxes[j]);
        if (area > 1) {
          overlaps.push(`${boxes[i].id} × ${boxes[j].id} (${M.round(area)}px²)`);
        }
      }
    }
    return { noBoard: false, ready, widgetCount, regionCount: regionList.length, problems: problems.slice(0, 24), overlaps: overlaps.slice(0, 12) };
  });

  if (result === null || result === undefined) {
    report.fail(name, "page evaluation returned nothing");
    return { ok: false };
  }
  if (result.noBoard) {
    report.warn(name, "no [data-widget-board] mounted on page — nothing to measure");
    return { ok: true };
  }
  const ok =
    result.ready === true && result.problems.length === 0 && result.overlaps.length === 0;
  if (!result.ready) {
    report.fail(name, "board lacks data-ready after settle (post-hydration stamp missing)");
  }
  for (const problem of result.problems.slice(0, MAX_REPORTED)) {
    report.fail(name, problem.detail);
  }
  if (result.problems.length > MAX_REPORTED) {
    report.fail(name, `…and ${result.problems.length - MAX_REPORTED} more placement problems`);
  }
  for (const overlap of result.overlaps) {
    report.fail(name, `top-level widgets overlap: ${overlap}`);
  }
  if (ok) {
    report.pass(
      name,
      `${result.widgetCount} widget(s) across ${result.regionCount} region(s): data-attrs match computed positions, bboxes pairwise disjoint`,
    );
  }
  return { ok };
}
