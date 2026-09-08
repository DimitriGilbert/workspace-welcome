/**
 * Size classes — the widget-system size vocabulary (master plan §3.3, settled #6).
 *
 * The canonical ladder `1x1 < 2x1 < 2x2 < 2x3 < 3x3` doubles as the mosaic tier
 * vocabulary (compact/medium/large/feature/hero), so themes can remap cell density
 * without renaming tiers. Custom classes (e.g. "1x2", "3x2") are legal `SizeClass`
 * values and slot into the order deterministically via {@link rankOf} — area first,
 * taller wins ties.
 */

/** A widget footprint in cells, `` `${cols}x${rows}` ``. Template-literal typed so
 * class strings are parseable and typed, but arbitrary footprints still fit. */
export type SizeClass = `${number}x${number}`;

/** Canonical ladder, ascending (settled #6). Single source of truth for "the rungs". */
export const SIZE_LADDER = ["1x1", "2x1", "2x2", "2x3", "3x3"] as const satisfies readonly SizeClass[];

/** A parsed footprint: `cols` across, `rows` down. */
export interface ParsedSize {
  cols: number;
  rows: number;
}

const SIZE_PATTERN = /^(\d+)x(\d+)$/;

/**
 * Parse a size-class string into `{ cols, rows }`.
 *
 * Accepts any `string` (not just `SizeClass`) so runtime data — preset JSON,
 * registry keys, DOM attributes — can be probed without unsafe casts; every
 * well-formed `SizeClass` parses. Returns `null` for malformed input; never throws.
 */
export function parseSize(size: string): ParsedSize | null {
  const match = SIZE_PATTERN.exec(size);
  if (match === null) return null;
  const cols = Number.parseInt(match[1] ?? "", 10);
  const rows = Number.parseInt(match[2] ?? "", 10);
  if (Number.isNaN(cols) || Number.isNaN(rows)) return null;
  return { cols, rows };
}

/**
 * Total order over footprints: `cols * rows * 100 + rows` (area first, taller wins
 * ties). Ladder ranks: 1x1=101, 2x1=201, 2x2=402, 2x3=603, 3x3=903. Custom classes
 * slot in deterministically (e.g. "1x2"=202 sorts between 2x1 and 2x2, "3x2"=602
 * between 2x3 and 3x3). Unambiguous for any realistic rows count (< 100).
 */
export function rankOf(size: ParsedSize): number {
  return size.cols * size.rows * 100 + size.rows;
}

/**
 * Resolve the current footprint to the best authored size class.
 *
 * Ladder resolution cases (single source of truth — every consumer resolves through
 * this function; the lab route exercises these at W4):
 *
 * 1. **Exact rung** — `current` is defined → `current` itself
 *    (`resolveSizeClass(["2x2","1x1"], "2x2")` → `"2x2"`).
 * 2. **Between rungs** — largest defined rank ≤ current rank
 *    (`resolveSizeClass(["2x2","1x1"], "3x3")` → `"2x2"`;
 *    `resolveSizeClass(["2x2","1x1"], "2x1")` → `"1x1"`).
 * 3. **Below every defined rung** — smallest defined class, the nearest-defined
 *    fallback (`resolveSizeClass(["2x2"], "1x1")` → `"2x2"`).
 * 4. **Above every defined rung** — largest defined class (case 2's limit).
 * 5. **Nothing defined** — `current` unchanged (nothing authored to resolve against).
 * 6. **Malformed entries** — unparseable `defined` entries are ignored; an
 *    unparseable `current` degrades to the smallest defined class.
 *
 * Never throws, never returns `undefined`.
 */
export function resolveSizeClass(defined: readonly SizeClass[], current: SizeClass): SizeClass {
  const ranked: { entry: SizeClass; rank: number }[] = [];
  for (const entry of defined) {
    const parsed = parseSize(entry);
    if (parsed !== null) ranked.push({ entry, rank: rankOf(parsed) });
  }
  ranked.sort((a, b) => a.rank - b.rank);

  const smallest = ranked[0];
  if (smallest === undefined) return current;
  const parsedCurrent = parseSize(current);
  if (parsedCurrent === null) return smallest.entry;

  let resolved = smallest.entry;
  for (const candidate of ranked) {
    if (candidate.rank > rankOf(parsedCurrent)) break;
    resolved = candidate.entry;
  }
  return resolved;
}
