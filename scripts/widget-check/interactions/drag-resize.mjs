/**
 * Interaction: drag-resize (master plan §3.8 matrix, W3's payoff).
 *
 * Keyboard-first, run against the themed dashboard: focus a widget's drag
 * handle, move it with arrow keys (live commit — `data-x/y` and the inline
 * `gridColumn/gridRow` must change, `data-pinned` stamped), resize from the
 * SE handle, verify the shrink path STOPS at the registry floor instead of
 * passing it, and confirm Escape reverts to the session start placement.
 *
 * A single keypress has THREE legitimate outcomes under the round-5
 * arrangement model (`.plans/session-widget-system/exec-runtime-bento.md`):
 * (1) COMMIT — placement changes, `data-pinned` stamped; (2) EDGE CLAMP —
 * the move never exceeds the grid, announced as "already at the edge";
 * (3) REFUSAL — a gesture that would overlap an authored `at` anchor (preset
 * geometry; mission-control authors every console widget as one) is refused
 * live with an announcement. The refusal exists so explicit user intent
 * never silently loses to preset geometry — but it must never be silent
 * itself: every no-op announces through the board's aria-live region. The
 * assertions below therefore accept a no-op only when the announcement
 * CHANGED on that keypress (a stale message must not vouch for a dead key).
 * Pointer-scripted drag is intentionally not the test surface — the
 * keyboard path is primary by contract.
 *
 * If no draggable board exists (lab not mounted / renderer pending) this
 * WARNs — pending must not look broken, nor pass silently.
 */
import { focus, pressKey } from "./helpers.mjs";

export const name = "drag-resize";

const SETTLE_MS = 150;

/** Read one widget frame's placement truth (attributes + inline grid style)
 * plus the board's announcement text (refusal/clamp verification). */
async function readPlacement(page, widgetId) {
  return page.eval(
    async (id, settleMs) => {
      await new Promise((resolve) => setTimeout(resolve, settleMs));
      const frame = document.querySelector(`[data-widget="${id}"]`);
      if (frame === null) return null;
      return {
        x: Number(frame.getAttribute("data-x")),
        y: Number(frame.getAttribute("data-y")),
        cols: Number(frame.getAttribute("data-cols")),
        rows: Number(frame.getAttribute("data-rows")),
        gridColumn: frame.style.gridColumn,
        gridRow: frame.style.gridRow,
        pinned: frame.hasAttribute("data-pinned"),
        message:
          document.querySelector("[data-widget-board] [aria-live='polite']")?.textContent ?? "",
      };
    },
    widgetId,
    SETTLE_MS,
  );
}

const samePlacement = (a, b) =>
  a !== null && b !== null && a.x === b.x && a.y === b.y && a.cols === b.cols && a.rows === b.rows;

/** True when `after` carries a FRESH announcement — the only witness that an
 * unchanged placement was a deliberate clamp/refusal rather than a dead key. */
const announcedNoOp = (after, before) =>
  after.message.length > 0 && after.message !== before.message;

export async function run(page, report, ctx) {
  const target = await page.eval(() => {
    const board = document.querySelector("[data-widget-board]");
    if (board === null) return { missing: "board" };
    // The affordances live INSIDE the frame (canvas-stamped), so match
    // frames that contain a drag handle.
    const frames = [...board.querySelectorAll("[data-widget]")].filter((f) =>
      f.querySelector("[data-drag-handle]"),
    );
    if (frames.length === 0) return { missing: "drag-handle" };
    const preferred =
      frames.find((f) => f.getAttribute("data-cols") === "2" && f.getAttribute("data-rows") === "2") ??
      frames[0];
    return {
      id: preferred.getAttribute("data-widget"),
      regionTracks: getComputedStyle(preferred.parentElement).gridTemplateColumns.split(" ").length,
      ariaLive: board.querySelector('[aria-live="polite"]') !== null,
      resizeEdges: [...preferred.querySelectorAll("[data-resize-handle]")].map((h) =>
        h.getAttribute("data-resize-handle"),
      ),
    };
  });

  if (target === null || target.missing !== undefined) {
    report.warn(
      `interaction:${name}`,
      `no draggable widget on ${ctx.path ?? `/app/${ctx.theme}`} (missing ${target?.missing ?? "page"}) — renderer not mounted yet`,
    );
    return { ok: true, pending: true };
  }
  if (!target.ariaLive) {
    report.fail(`interaction:${name}`, "board is missing its aria-live announcement region");
    return { ok: false };
  }
  for (const edge of ["e", "s", "se"]) {
    if (!target.resizeEdges.includes(edge)) {
      report.fail(`interaction:${name}`, `widget ${target.id} is missing the "${edge}" resize handle`);
      return { ok: false };
    }
  }

  const handleSelector = `[data-widget="${target.id}"] [data-drag-handle]`;
  const seSelector = `[data-widget="${target.id}"] [data-resize-handle="se"]`;
  const start = await readPlacement(page, target.id);
  let ok = true;

  // --- Keyboard MOVE -------------------------------------------------------
  if (!(await focus(page, handleSelector))) {
    report.fail(`interaction:${name}`, `could not focus the drag handle of ${target.id}`);
    return { ok: false };
  }
  await pressKey(page, "ArrowRight", handleSelector);
  const movedRight = await readPlacement(page, target.id);
  const atRightEdge = start.x + start.cols >= target.regionTracks;
  const moveCommitted = !samePlacement(movedRight, start);
  // A no-op is legitimate only as an announced clamp (grid edge) or refusal
  // (authored anchor in the target cells) — anything silent is a dead key.
  const moveNoOp = atRightEdge || announcedNoOp(movedRight, start);
  if (atRightEdge ? moveCommitted : (movedRight.x !== start.x + 1 && !moveNoOp)) {
    report.fail(
      `interaction:${name}`,
      `ArrowRight from x=${start.x} (${target.regionTracks}-col region, cols=${start.cols}) gave x=${movedRight.x} without an announcement — expected ${atRightEdge ? "no change at the edge" : `x=${start.x + 1}`}`,
    );
    ok = false;
  } else {
    report.pass(
      `interaction:${name}`,
      moveCommitted
        ? `ArrowRight moved ${target.id} to x=${movedRight.x} (gridColumn "${movedRight.gridColumn}")`
        : atRightEdge
          ? `ArrowRight at the right edge clamps to a no-op (${target.id} stays at x=${movedRight.x})`
          : `ArrowRight refused live and announced: "${movedRight.message}"`,
    );
  }
  // D4 calibration: the runtime deliberately does NOT commit a clamped
  // no-op move (use-grid-drag announces "already at the edge" or the anchor
  // refusal and returns before commitPlacement), and data-pinned reflects
  // committed placements only. So the pin stamp pairs with the move:
  // committed ⇒ stamped, no-op ⇒ unstamped. Either pairing is correct;
  // anything else is not.
  if (moveCommitted && !movedRight.pinned) {
    report.fail(`interaction:${name}`, `committed move did not stamp data-pinned on ${target.id}`);
    ok = false;
  } else if (!moveCommitted && movedRight.pinned) {
    report.fail(`interaction:${name}`, `clamped no-op move stamped data-pinned on ${target.id} — a no-op must not commit`);
    ok = false;
  }

  await pressKey(page, "ArrowDown", handleSelector);
  const movedDown = await readPlacement(page, target.id);
  const downCommitted = movedDown.y === movedRight.y + 1;
  // Southward is unbounded (auto-rows extend), so the only no-op is a
  // refusal by an authored anchor — which must announce.
  const downNoOp =
    !downCommitted && samePlacement(movedDown, movedRight) && announcedNoOp(movedDown, movedRight);
  if (!downCommitted && !downNoOp) {
    report.fail(
      `interaction:${name}`,
      `ArrowDown gave y=${movedDown.y} / gridRow "${movedDown.gridRow}" without an announcement — expected y=${movedRight.y + 1} and a changed gridRow`,
    );
    ok = false;
  } else {
    report.pass(
      `interaction:${name}`,
      downCommitted
        ? `ArrowDown moved ${target.id} to y=${movedDown.y}`
        : `ArrowDown refused live and announced: "${movedDown.message}"`,
    );
  }

  // --- Keyboard RESIZE (grow, then shrink to the floor) ---------------------
  if (!(await focus(page, seSelector))) {
    report.fail(`interaction:${name}`, `could not focus the SE resize handle of ${target.id}`);
    return { ok: false };
  }
  await pressKey(page, "ArrowRight", seSelector);
  const grew = await readPlacement(page, target.id);
  const atMaxWidth = grew.x + grew.cols >= target.regionTracks && grew.cols === movedDown.cols;
  const growCommitted = grew.cols === movedDown.cols + 1;
  // An east grow no-op is either the grid's right edge (the footprint max)
  // or a refusal by an authored anchor — both announce.
  const growNoOp =
    !growCommitted && !atMaxWidth && samePlacement(grew, movedDown) && announcedNoOp(grew, movedDown);
  if (!atMaxWidth && !growCommitted && !growNoOp) {
    report.fail(
      `interaction:${name}`,
      `SE ArrowRight gave cols=${grew.cols} without an announcement — expected ${movedDown.cols + 1}`,
    );
    ok = false;
  } else {
    report.pass(
      `interaction:${name}`,
      growCommitted
        ? `resize grew ${target.id} to ${grew.cols}x${grew.rows}`
        : atMaxWidth
          ? `resize is at the grid's right edge (${target.id} stays ${grew.cols}x${grew.rows})`
          : `SE grow refused live and announced: "${grew.message}"`,
    );
  }

  // Shrink until the controller refuses: the floor must STOP the shrink.
  let shrunk = grew;
  let shrinkSteps = 0;
  for (let i = 0; i < 12; i++) {
    await pressKey(page, "ArrowLeft", seSelector);
    const next = await readPlacement(page, target.id);
    if (samePlacement(next, shrunk)) break;
    shrunk = next;
    shrinkSteps += 1;
  }
  if (shrunk.cols < 1 || shrunk.rows < 1) {
    report.fail(`interaction:${name}`, `resize floor violated: ${target.id} reached ${shrunk.cols}x${shrunk.rows}`);
    ok = false;
  } else if (shrinkSteps === 0) {
    report.fail(`interaction:${name}`, `resize never shrank ${target.id} below ${grew.cols}x${grew.rows} — shrink path broken`);
    ok = false;
  } else {
    report.pass(
      `interaction:${name}`,
      `resize clamped at the registry floor ${shrunk.cols}x${shrunk.rows} after ${shrinkSteps} shrink step(s)`,
    );
  }

  // --- Escape reverts to the session start ----------------------------------
  await pressKey(page, "Escape", handleSelector);
  const reverted = await readPlacement(page, target.id);
  if (!samePlacement(reverted, start)) {
    report.fail(
      `interaction:${name}`,
      `Escape left ${target.id} at ${reverted.x},${reverted.y} ${reverted.cols}x${reverted.rows} — session start was ${start.x},${start.y} ${start.cols}x${start.rows}`,
    );
    ok = false;
  } else {
    report.pass(
      `interaction:${name}`,
      `Escape restored ${target.id} to its session start ${start.x},${start.y} ${start.cols}x${start.rows}`,
    );
  }

  return { ok };
}
