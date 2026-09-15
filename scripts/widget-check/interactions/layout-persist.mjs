/**
 * Interaction: layout-persist — manual arrangements survive reloads
 * (localStorage `ww.board.v1`, seeded on mount + mirrored per gesture by
 * `use-board-persistence`).
 *
 * Forces `?preset=bento` regardless of --theme: bento's dashboard board
 * region carries NO authored `at` anchors, so its widgets actually MOVE
 * (mission-control anchors every console widget — its board would refuse
 * every gesture and prove nothing about persistence).
 *
 * Contract under test, in order:
 * 1. from a clean storage start, a committed keyboard move (P1, pinned)
 *    persists across a reload — the SAME widget renders at P1 verbatim
 *    (`data-pinned`), not the authored pack (the core assertion);
 * 2. a second move (P2) persists across another reload the same way;
 * 3. after THAT reload, one more small edit + Escape reverts to the RELOADED
 *    start (P2), proving the seeded placement is the honest session-start
 *    baseline ("returned to its session start position"), not the authored
 *    placement;
 * 4. finally the storage key is cleared and the page reloaded (best-effort)
 *    so later scripts / parallel runs start from the authored board.
 *
 * Keyboard path only, per the harness contract (pointer-scripted drag is
 * intentionally not the test surface); the 150ms settle between keypress
 * and read is the drag-resize idiom.
 */
import { focus, pressKey } from "./helpers.mjs";

export const name = "layoutPersist";

const SETTLE_MS = 150;
const STORAGE_KEY = "ww.board.v1";
/** Keys tried (in order) whenever a step needs SOME committed change — the
 * first may clamp at an edge; southward is unbounded on auto-rows. */
const MOVE_KEYS = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];

/** Read one widget frame's placement truth + the board's announcement text
 * (drag-resize's idiom: settle first, then attributes). */
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
  a !== null &&
  b !== null &&
  a.x === b.x &&
  a.y === b.y &&
  a.cols === b.cols &&
  a.rows === b.rows;

const placementText = (p) =>
  p === null ? "absent" : `${p.x},${p.y} ${p.cols}x${p.rows}`;

/** Widget ids of the board's frames that carry a drag handle, in DOM order. */
async function framesWithHandles(page) {
  return page.eval(() =>
    [...document.querySelectorAll("[data-widget-board] [data-widget]")]
      .filter((frame) => frame.querySelector("[data-drag-handle]") !== null)
      .map((frame) => frame.getAttribute("data-widget")),
  );
}

/** Press `key` on the widget's drag handle and read the settled placement. */
async function pressMoveKey(page, widgetId, key) {
  const handleSelector = `[data-widget="${widgetId}"] [data-drag-handle]`;
  if (!(await focus(page, handleSelector))) return null;
  await pressKey(page, key, handleSelector);
  return readPlacement(page, widgetId);
}

/** Commit SOME move off `from` — tries each arrow until the placement
 * changes. Returns the new placement, or null when every key no-oped. */
async function commitAnyMove(page, widgetId, from) {
  for (const key of MOVE_KEYS) {
    const next = await pressMoveKey(page, widgetId, key);
    if (next === null) return null;
    if (!samePlacement(next, from)) return next;
  }
  return null;
}

export async function run(page, report, ctx) {
  const url = `${ctx.baseUrl}/?preset=bento`;
  let ok = true;
  try {
    // Clean slate: drop any stored arrangement from an earlier run, then
    // reload so the board mounts from the authored pack, not a seed.
    await page.goto(url);
    await page.settle();
    await page.eval((key) => localStorage.removeItem(key), STORAGE_KEY);
    await page.goto(url);
    await page.settle();

    const candidates = await framesWithHandles(page);
    if (candidates.length === 0) {
      report.warn(
        `interaction:${name}`,
        `no draggable widget on ${url} — renderer not mounted yet`,
      );
      return { ok: true, pending: true };
    }

    // The first frame whose ArrowRight actually MOVES it: full-width or
    // right-edge frames clamp (announced no-op) and anchors refuse — skip
    // them; a skipped keypress commits nothing, so the board stays authored.
    let targetId = null;
    let p1 = null;
    for (const id of candidates) {
      const before = await readPlacement(page, id);
      const after = await pressMoveKey(page, id, "ArrowRight");
      if (after !== null && before !== null && after.x === before.x + 1) {
        targetId = id;
        p1 = after;
        break;
      }
    }
    if (targetId === null || p1 === null) {
      report.fail(
        `interaction:${name}`,
        `no widget on ${url} moved under ArrowRight — persistence cannot be exercised`,
      );
      return { ok: false };
    }
    if (!p1.pinned) {
      report.fail(
        `interaction:${name}`,
        `committed move did not stamp data-pinned on ${targetId}`,
      );
      ok = false;
    }

    // THE core assertion: reload — the same widget must render at P1
    // verbatim (pinned), not the authored pack.
    await page.goto(url);
    await page.settle();
    const reloaded1 = await readPlacement(page, targetId);
    if (reloaded1 === null) {
      report.fail(
        `interaction:${name}`,
        `${targetId} disappeared from the reloaded board`,
      );
      return { ok: false };
    }
    if (!samePlacement(reloaded1, p1) || !reloaded1.pinned) {
      report.fail(
        `interaction:${name}`,
        `reload lost the saved arrangement — ${targetId} is at ${placementText(reloaded1)} (pinned=${reloaded1.pinned}), expected the saved ${placementText(p1)} pinned`,
      );
      ok = false;
    } else {
      report.pass(
        `interaction:${name}`,
        `reload restored ${targetId} to its saved ${placementText(p1)} verbatim (gridColumn "${reloaded1.gridColumn}", data-pinned)`,
      );
    }

    // A second gesture (P2) must persist the same way.
    const p2 = await commitAnyMove(page, targetId, reloaded1);
    if (p2 === null) {
      report.fail(
        `interaction:${name}`,
        `no arrow key moved ${targetId} off the reloaded ${placementText(reloaded1)}`,
      );
      return { ok: false };
    }
    await page.goto(url);
    await page.settle();
    const reloaded2 = await readPlacement(page, targetId);
    if (!samePlacement(reloaded2, p2) || !reloaded2.pinned) {
      report.fail(
        `interaction:${name}`,
        `reload lost the second save — ${targetId} is at ${placementText(reloaded2)} (pinned=${reloaded2.pinned}), expected the saved ${placementText(p2)} pinned`,
      );
      ok = false;
    } else {
      report.pass(
        `interaction:${name}`,
        `second save survived the reload too — ${targetId} at ${placementText(p2)} (pinned)`,
      );
    }

    // Escape baseline: after the reload the seeded P2 is the session start,
    // so one more edit + Escape must return to P2 (not the authored spot).
    const edited = await commitAnyMove(page, targetId, reloaded2);
    if (edited === null) {
      report.fail(
        `interaction:${name}`,
        `no arrow key moved ${targetId} off ${placementText(reloaded2)} before the Escape probe`,
      );
      return { ok: false };
    }
    await pressMoveKey(page, targetId, "Escape");
    const reverted = await readPlacement(page, targetId);
    if (!samePlacement(reverted, reloaded2)) {
      report.fail(
        `interaction:${name}`,
        `Escape left ${targetId} at ${placementText(reverted)} — the reloaded start ${placementText(reloaded2)} should be the revert baseline`,
      );
      ok = false;
    } else if (!reverted.message.includes("session start")) {
      report.fail(
        `interaction:${name}`,
        `Escape reverted to ${placementText(reverted)} but announced "${reverted.message}" — expected the session-start announcement`,
      );
      ok = false;
    } else {
      report.pass(
        `interaction:${name}`,
        `Escape returned ${targetId} to its reloaded session start ${placementText(reverted)} ("${reverted.message}")`,
      );
    }

    return { ok };
  } finally {
    // Leave the shared browser profile clean for later/parallel scripts:
    // drop the key this run wrote and reload onto the authored board.
    try {
      await page.eval((key) => localStorage.removeItem(key), STORAGE_KEY);
      await page.goto(url);
      await page.settle();
    } catch {
      // Best-effort by contract — a failed cleanup must not mask findings.
    }
  }
}
