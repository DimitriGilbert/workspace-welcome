/**
 * use-board-persistence — the additive persistence layer around the session
 * store (grid-session.ts stays the single write funnel and stays untouched).
 *
 * One mount effect per board, two jobs:
 *
 * 1. SEED — when the page has no in-memory session yet, read `ww.board.v1`
 *    and re-commit the saved regions through the engine's own
 *    `commitArrangement` with EMPTY `editedIds`/`preItems`: no baselines are
 *    recorded, so the first user edit after a reload baselines from the
 *    SEEDED placement — Escape "reverts to the session start" honestly means
 *    the saved arrangement the reload started from, not the authored pack.
 *    A saved page whose stored `version` ≠ the preset's current version is
 *    dropped AND pruned from storage (write-back) so the next write-through
 *    can never resurrect it (the layout-types version contract, enforced by
 *    `board-persist.reconcileVersion`).
 *
 * 2. MIRROR — subscribe to the page's session and write-through on every
 *    emit: one localStorage write per committed gesture (last-write-wins,
 *    no multi-tab sync by design — see board-persist.ts). A cleared session
 *    (null) never writes, so "Reset layout" cannot be un-done by its own
 *    echo. During MOUNT the seed runs before the mirror subscribes, so the
 *    seed's emits cost nothing; `reapplySavedBoard` (the reset Undo) seeds
 *    while the mirror is live, so its emits echo one IDENTICAL write-back —
 *    same content, harmless, documented here.
 *
 * SSR/first paint render the authored preset (reads before mount return
 * null); the saved arrangement swaps in on mount — the owner-accepted
 * one-paint tradeoff, same contract as `ww.prefs.v1`.
 */
import { useEffect } from "react";

import {
  dropPage,
  readSavedBoards,
  reconcileVersion,
  upsertPage,
  writeSavedBoards,
} from "@/lib/widget/board-persist";
import {
  clearPageSession,
  commitArrangement,
  getPageSession,
  subscribeSession,
} from "@/lib/widget/grid-session";

/**
 * Seed the page's session store from storage — the shared body of the mount
 * effect and {@link reapplySavedBoard}. No-op when the page already carries
 * a live session (never clobber in-memory truth) or when nothing valid is
 * saved for it.
 */
function seedFromStorage(pageId: string, layoutVersion: 1 | 2): void {
  if (getPageSession(pageId) !== null) return;
  const boards = readSavedBoards();
  const saved = boards.pages[pageId];
  if (saved === undefined) return;
  const reconciled = reconcileVersion(saved, layoutVersion);
  if (reconciled === null) {
    // Stale format generation: prune the page from storage too, or the next
    // mirrored commit would upsert around it and keep the dead entry alive.
    writeSavedBoards(dropPage(boards, pageId));
    return;
  }
  for (const [regionId, region] of Object.entries(reconciled.regions)) {
    // Empty editedIds + empty preItems → no baselines recorded (see header):
    // the seeded placement itself becomes the first edit's Escape baseline.
    commitArrangement(pageId, regionId, region.columns, region.items, [], {});
  }
}

/**
 * Persistence for one board. No-op when `layoutVersion` is omitted (the
 * caller does not know the preset's format generation — e.g. an embedded
 * static board — and an unversioned arrangement can never be reconciled).
 * Must be called AFTER `useViewportBoard` inside the canvas: effect
 * declaration order then guarantees the seed runs after the viewport sync,
 * in the same post-mount flush as the `data-ready` stamp.
 */
export function useBoardPersistence({
  pageId,
  layoutVersion,
}: {
  pageId: string;
  layoutVersion?: 1 | 2;
}): void {
  useEffect(() => {
    if (layoutVersion === undefined) return;
    seedFromStorage(pageId, layoutVersion);
    const unsubscribe = subscribeSession(pageId, () => {
      // Write-through per committed gesture; `regions` is the session
      // snapshot's own immutable record (committed by the engine).
      const session = getPageSession(pageId);
      if (session === null) return;
      writeSavedBoards(
        upsertPage(readSavedBoards(), pageId, {
          version: layoutVersion,
          regions: session.regions,
        }),
      );
    });
    return unsubscribe;
  }, [pageId, layoutVersion]);
}

/**
 * Drop the page's live session and re-seed it from storage (the reset
 * Undo): the board re-renders the saved arrangement without a reload. When
 * nothing valid is saved the session simply stays empty and the authored
 * pack keeps rendering — the honest no-op.
 */
export function reapplySavedBoard(pageId: string, layoutVersion: 1 | 2): void {
  clearPageSession(pageId);
  seedFromStorage(pageId, layoutVersion);
}
