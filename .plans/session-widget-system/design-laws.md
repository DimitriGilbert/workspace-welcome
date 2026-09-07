# Owner design laws — STANDING, apply to every widget, every preset, every round

These are baseline taste, owner-ordered 2026-09-06 after repeated failures. Every agent order
includes them verbatim; every orchestrator gate enforces them BEFORE anything is reported.
No owner capture should ever be needed to justify any of these.

0. **TASTE IS NOT OPTIONAL.** Harness green, zero overlaps, exact geometry — all of it is the
   floor, not the product. Every widget crop is judged as a design: every pixel carries
   information, or the widget shrinks. Voids, stretched filler, duplicated metrics, decoration
   that encodes nothing, padded rows — rejected on sight by the agent's own eye and again by
   the orchestrator's. If your eye hesitates on a crop, it is not done.

1. **No voids.** Widget content FILLS its shell box on both axes at every rung — charts stretch
   (100%/100% in flex-1 min-h-0 parents, area fills, y-domains tight to data), lists distribute
   rows, table columns size to content with the flexible columns absorbing remaining width.
   A lone number in a box ≥2x1 is a FAIL. Backfill padding/spacers to fake fullness is a FAIL.
   If content cannot honestly fill a footprint, the footprint SHRINKS and neighbours take the width.
2. **No sparse label:value rows stretched over space** ("galactic void wording bullshit").
   Rows are dense edge to edge. Metrics the owner didn't ask for don't exist.
3. **No standalone subtitle rows.** Metadata rides the WidgetShell meta slot on the TITLE LINE,
   only when genuinely informative. Repeated "N hours ago HTML ↗"-style noise is deleted outright.
   Content starts directly under the titlebar.
4. **Real data only.** Show metrics the owner cares about from real report fields — never invented
   aggregates (tokens/record, cost/record), never a misleading $0. If honest data is missing,
   drop the metric; never fake it. Cost shown must be the correct total estimated value.
   NEVER pad a widget by repeating the same value under a second label (Units/Repos, Active/Fresh):
   duplication of content is filler and is rejected on sight.
5. **Pixel-exact sizing.** Block footprints match the owner's capture / the prototype proportions —
   "looks alike" is a FAIL. Prove with side-by-side or measured spans.
6. **Dense chrome.** Command/filter/settings chrome belongs in the common header, not loose canvas
   rows; duplicated controls are removed, not restyled.
7. **Responsive is not optional.** 3440x1440 is the owner's primary viewport; 1280x800 and 390x844
   must be clean (no clipped labels, no overlapping figures, sane reflow) — verified per round.
8. **Charts size to their content; bars never starve data.** A donut/chart renders at the size its
   band justifies — no floating margins, no oversized lone figure in an empty frame. Bar/strip
   columns get a bounded width that lets the bar read; ALL remaining width belongs to data columns
   (names, branches — never truncated while a bar is fat). Ratios derive from content, never fixed
   flex values that starve text to fatten a bar.
9. **Honest reporting.** Agents report what FAILS. "Ready" is claimed only after per-widget
   screenshot inspection; the orchestrator personally re-inspects before the owner hears anything.
   Every claimed fix ships with BEFORE/AFTER crops of the same widget at the same footprint — a
   fix with no visible delta is a no-op lie and is rejected as such. Full-page shots are not
   verification: each widget is cropped and judged at the footprints the owner actually uses.
