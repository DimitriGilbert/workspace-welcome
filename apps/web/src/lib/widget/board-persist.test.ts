/**
 * board-persist tests (`pnpm --filter web test:board`) — node:test over the
 * pure parse/serialize/upsert/drop/reconcile core plus the storage adapter's
 * SSR guard (packages/api's `node --import tsx --test` idiom). No DOM: the
 * adapter's client path is exercised through a fake `window.localStorage`
 * installed on globalThis and always restored — the real window (when Node
 * ever grows one) is snapshot first.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BOARD_STORAGE_KEY,
  dropPage,
  dropPagesWithPrefix,
  parseSavedBoards,
  readSavedBoards,
  reconcileVersion,
  serializeSavedBoards,
  upsertPage,
  writeSavedBoards,
} from "./board-persist";
import type { SavedBoardPage, SavedBoards } from "./board-persist";

function emptyBoards(): SavedBoards {
  return { v: 1, pages: {} };
}

function samplePage(version: 1 | 2 = 2): SavedBoardPage {
  return {
    version,
    regions: {
      board: {
        columns: 12,
        items: {
          chrome: { x: 0, y: 0, cols: 12, rows: 1 },
          signals: { x: 0, y: 1, cols: 4, rows: 3 },
        },
      },
    },
  };
}

test("parse: null, empty, and non-JSON strings read as empty", () => {
  for (const raw of [null, "", "   ", "{not json", "undefined"]) {
    assert.deepEqual(parseSavedBoards(raw), emptyBoards(), `raw=${String(raw)}`);
  }
});

test("parse: wrong envelope (non-object, missing/unknown v, non-object pages) reads as empty", () => {
  for (const raw of [
    "42",
    '"boards"',
    "true",
    "[]",
    '{"pages":{}}',
    '{"v":2,"pages":{}}',
    '{"v":"1","pages":{}}',
    '{"v":1}',
    '{"v":1,"pages":[]}',
    '{"v":1,"pages":"nope"}',
  ]) {
    assert.deepEqual(parseSavedBoards(raw), emptyBoards(), `raw=${raw}`);
  }
});

test("parse: serialize→parse round-trips a valid store", () => {
  const boards: SavedBoards = {
    v: 1,
    pages: {
      "bento:dashboard": samplePage(2),
      "mission-control:dashboard": samplePage(1),
      "meadow:project": {
        version: 1,
        regions: { canvas: { columns: 6, items: { nav: { x: 0, y: 0, cols: 6, rows: 1 } } } },
      },
    },
  };
  const once = parseSavedBoards(serializeSavedBoards(boards));
  const twice = parseSavedBoards(serializeSavedBoards(once));
  assert.deepEqual(once, boards);
  assert.deepEqual(twice, once); // idempotent under re-serialization
});

test("parse: a malformed ITEM is dropped while its valid siblings survive", () => {
  const raw = JSON.stringify({
    v: 1,
    pages: {
      "bento:dashboard": {
        version: 2,
        regions: {
          board: {
            columns: 12,
            items: {
              good: { x: 0, y: 0, cols: 4, rows: 3 },
              negativeX: { x: -1, y: 0, cols: 2, rows: 2 },
              floatY: { x: 0, y: 1.5, cols: 2, rows: 2 },
              zeroCols: { x: 0, y: 0, cols: 0, rows: 2 },
              stringX: { x: "0", y: 0, cols: 2, rows: 2 },
              nullRows: { x: 0, y: 0, cols: 2, rows: null },
              notAnObject: "nope",
            },
          },
        },
      },
    },
  });
  const parsed = parseSavedBoards(raw);
  assert.deepEqual(Object.keys(parsed.pages["bento:dashboard"]?.regions.board?.items ?? {}), [
    "good",
  ]);
});

test("parse: a malformed REGION is dropped while its valid sibling region survives", () => {
  const raw = JSON.stringify({
    v: 1,
    pages: {
      "bento:dashboard": {
        version: 2,
        regions: {
          zeroColumns: { columns: 0, items: { a: { x: 0, y: 0, cols: 1, rows: 1 } } },
          floatColumns: { columns: 8.5, items: { a: { x: 0, y: 0, cols: 1, rows: 1 } } },
          noItems: { columns: 8 },
          itemsArray: { columns: 8, items: [] },
          fine: { columns: 8, items: { a: { x: 0, y: 0, cols: 1, rows: 1 } } },
        },
      },
    },
  });
  const parsed = parseSavedBoards(raw);
  assert.deepEqual(Object.keys(parsed.pages["bento:dashboard"]?.regions ?? {}), ["fine"]);
});

test("parse: huge finite integers are rejected as corrupted values", () => {
  const huge = 1_000_000_000; // finite integer — must still be refused (bound check)
  const raw = JSON.stringify({
    v: 1,
    pages: {
      p: {
        version: 2,
        regions: { r: { columns: huge, items: { a: { x: 0, y: huge, cols: 1, rows: 1 } } } },
      },
    },
  });
  const parsed = parseSavedBoards(raw);
  // columns invalid → region dropped → page carries no regions (kept, empty)
  assert.deepEqual(parsed.pages.p?.regions, {});

  const itemRaw = JSON.stringify({
    v: 1,
    pages: {
      q: {
        version: 2,
        regions: {
          r: {
            columns: 12,
            items: {
              ok: { x: 0, y: 0, cols: 4, rows: 3 },
              hugeX: { x: huge, y: 0, cols: 1, rows: 1 },
              hugeRows: { x: 0, y: 0, cols: 1, rows: huge },
            },
          },
        },
      },
    },
  });
  const itemParsed = parseSavedBoards(itemRaw);
  assert.deepEqual(Object.keys(itemParsed.pages.q?.regions.r?.items ?? {}), ["ok"]);
});

test("parse: a page beyond the total-item bound is invalid as a whole, at the bound is kept", () => {
  const items: Record<string, { x: number; y: number; cols: number; rows: number }> = {};
  for (let i = 0; i < 2_001; i++) {
    items[`w${i}`] = { x: 0, y: i, cols: 1, rows: 1 };
  }
  const overRaw = JSON.stringify({
    v: 1,
    pages: { big: { version: 2, regions: { r: { columns: 12, items } } } },
  });
  assert.equal("big" in parseSavedBoards(overRaw).pages, false);

  // The boundary itself: exactly MAX_PAGE_ITEMS stays valid (pins `>`, not
  // `>=` — a regression to a strict inequality would still drop it).
  const atBound: Record<string, { x: number; y: number; cols: number; rows: number }> = {};
  for (let i = 0; i < 2_000; i++) {
    atBound[`w${i}`] = { x: 0, y: i, cols: 1, rows: 1 };
  }
  const atRaw = JSON.stringify({
    v: 1,
    pages: { edge: { version: 2, regions: { r: { columns: 12, items: atBound } } } },
  });
  const atParsed = parseSavedBoards(atRaw);
  assert.equal(atParsed.pages.edge !== undefined, true);
  assert.equal(Object.keys(atParsed.pages.edge?.regions.r?.items ?? {}).length, 2_000);
});

test("parse: a page with an unknown version is dropped", () => {
  const raw = JSON.stringify({
    v: 1,
    pages: {
      v3: { version: 3, regions: { r: { columns: 4, items: {} } } },
      strVersion: { version: "2", regions: { r: { columns: 4, items: {} } } },
      ok: { version: 1, regions: { r: { columns: 4, items: {} } } },
    },
  });
  const parsed = parseSavedBoards(raw);
  assert.deepEqual(Object.keys(parsed.pages), ["ok"]);
});

test("reconcileVersion: matching generation keeps the page, mismatch drops it", () => {
  const page = samplePage(2);
  assert.equal(reconcileVersion(page, 2), page);
  assert.equal(reconcileVersion(page, 1), null);
  assert.equal(reconcileVersion(samplePage(1), 2), null);
});

test("upsertPage is immutable and replaces an existing page", () => {
  const boards = emptyBoards();
  const withPage = upsertPage(boards, "bento:dashboard", samplePage(1));
  assert.deepEqual(boards, emptyBoards()); // input untouched
  const replaced = upsertPage(withPage, "bento:dashboard", samplePage(2));
  assert.equal(replaced.pages["bento:dashboard"]?.version, 2);
  assert.equal(withPage.pages["bento:dashboard"]?.version, 1); // no in-place mutation
  const withTwo = upsertPage(replaced, "meadow:project", samplePage(1));
  assert.deepEqual(Object.keys(withTwo.pages), ["bento:dashboard", "meadow:project"]);
});

test("dropPage removes one page and returns the input reference when absent", () => {
  const boards = upsertPage(upsertPage(emptyBoards(), "bento:dashboard", samplePage()), "meadow:project", samplePage());
  const dropped = dropPage(boards, "bento:dashboard");
  assert.deepEqual(Object.keys(dropped.pages), ["meadow:project"]);
  assert.deepEqual(Object.keys(boards.pages), ["bento:dashboard", "meadow:project"]);
  assert.equal(dropPage(dropped, "bento:dashboard"), dropped); // nothing to copy
});

test("dropPagesWithPrefix drops exactly the theme's pages and reports their ids", () => {
  const boards = upsertPage(
    upsertPage(
      upsertPage(emptyBoards(), "bento:dashboard", samplePage()),
      "bento:project", samplePage()),
    "meadow:dashboard", samplePage(),
  );
  const { boards: pruned, droppedPageIds } = dropPagesWithPrefix(boards, "bento");
  assert.deepEqual(droppedPageIds, ["bento:dashboard", "bento:project"]);
  assert.deepEqual(Object.keys(pruned.pages), ["meadow:dashboard"]);
  assert.deepEqual(Object.keys(boards.pages), ["bento:dashboard", "bento:project", "meadow:dashboard"]);
  // A theme with nothing saved: same reference, empty report.
  const nothing = dropPagesWithPrefix(pruned, "bento");
  assert.equal(nothing.boards, pruned);
  assert.deepEqual(nothing.droppedPageIds, []);
});

test("storage adapter: without window, reads are empty and writes are no-ops", () => {
  const globals = globalThis as { window?: unknown };
  const hadWindow = "window" in globals;
  const originalWindow = globals.window;
  delete globals.window;
  try {
    assert.deepEqual(readSavedBoards(), emptyBoards());
    writeSavedBoards(upsertPage(emptyBoards(), "bento:dashboard", samplePage()));
    assert.deepEqual(readSavedBoards(), emptyBoards());
  } finally {
    if (hadWindow) globals.window = originalWindow;
  }
});

test("storage adapter: round-trips through a fake window.localStorage and swallows quota errors", () => {
  const globals = globalThis as { window?: unknown };
  const hadWindow = "window" in globals;
  const originalWindow = globals.window;
  const backing = new Map<string, string>();
  globals.window = {
    localStorage: {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => {
        backing.set(key, value);
      },
      removeItem: (key: string) => {
        backing.delete(key);
      },
    },
  };
  try {
    const boards = upsertPage(emptyBoards(), "bento:dashboard", samplePage());
    writeSavedBoards(boards);
    assert.equal(backing.get(BOARD_STORAGE_KEY), serializeSavedBoards(boards));
    assert.deepEqual(readSavedBoards(), boards);
    // Clearing is an empty-envelope write, not a removeItem.
    writeSavedBoards(emptyBoards());
    assert.deepEqual(readSavedBoards(), emptyBoards());
    // Quota/private-mode failure: the write must not throw (session-only).
    globals.window = {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
    };
    writeSavedBoards(boards);
    writeSavedBoards(emptyBoards());
  } finally {
    if (hadWindow) {
      globals.window = originalWindow;
    } else {
      delete globals.window;
    }
  }
});
