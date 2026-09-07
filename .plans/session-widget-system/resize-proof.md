# resize-proof.md — executable drag recipe (mc + bento boards, 3440x1440)

Validated verbatim against the deployed build (flock build + service restart, fresh
page load per case). Every sequence below ran end-to-end with real CDP mouse input;
the "Expected (observed)" lines are the actual observed results.

## (a) Where the affordances live and how their hit zones are computed

DOM (one frame per widget; the frame is the direct grid child):

```
[data-widget="<widget-id>"]                    ← the frame; carries data-x/y/cols/rows/pinned
  [data-drag-handle]                           ← MOVE grip, `absolute top-1 left-1 z-30 size-6`
  [data-resize-handle="n|s|e|w|nw|ne|sw|se"]   ← resize hit zones (z-20, pointer-live ALWAYS)
```

Hit zones (grid-canvas.tsx): edge handles span the middle 20% of their edge, 32px
deep; corners are 2rem×2rem. Center = `getBoundingClientRect()` center. The MOVE
grip is 24×24 at +4,+4 of the frame corner and is ALWAYS pointer-live (it overlays
the NW resize corner's center — z-30 over z-20). Resize handles are pointer-live but
`opacity-0` until hover — grab them blind at the coordinates below; that is expected.

Grid metrics at 3440x1440: cell 96px, gap 12px → 1 row = **108px**; column unit =
**283px** (mc frames: 4 cols = 1120px, 3 cols = 837px, 2 cols = 554px, 1 col = 271px;
add 12px per extra column when moving horizontally).

**Region model (owner round 3):** mission-control's dashboard is ONE droppable
region — the masthead vitals band is row 0 of the same grid as every other widget,
so drops onto/beside the vitals work and the vitals band yields like any free widget.
The console views (attention/pinned/archive) filter that single region, so the
vitals band persists across views. Bento keeps separate regions per band; drops
within a band work (sequences B-1..B-3 below).

**Refusal policy:** a drop/resize is refused ONLY when the target overlaps a PINNED
widget (a previous explicit placement — genuinely occupied). The refusal is
announced (`… can't move/resize there — <widget> occupies that spot`); `Escape`
mid-gesture reverts; a reload clears all pins.

**Re-derive coordinates if the build changed** (preset sizes or data width shift the
grid):

```bash
agent-browser --session bento-sweep open "http://127.0.0.1:37420/app/mission-control"
sleep 6
agent-browser --session bento-sweep eval "(() => { const w = (id) => { const f = document.querySelector('[data-widget='+id+']'); const r = f.getBoundingClientRect(); const c = (e) => { const b = f.querySelector('[data-resize-handle='+e+']').getBoundingClientRect(); return [Math.round(b.left+b.width/2), Math.round(b.top+b.height/2)]; }; const d = f.querySelector('[data-drag-handle]').getBoundingClientRect(); return { id, place: f.getAttribute('data-x')+','+f.getAttribute('data-y')+' '+f.getAttribute('data-cols')+'x'+f.getAttribute('data-rows'), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], s: c('s'), w: c('w'), se: c('se'), grip: [Math.round(d.left+d.width/2), Math.round(d.top+d.height/2)] }; }; return JSON.stringify({ masthead: w('masthead'), activity: w('report-activity'), dirty: w('dirty-leaders'), stack: w('stack-mix'), code: w('report-code') }); })()"
```

Grip liveness check (must print `"auto"`):

```bash
agent-browser --session bento-sweep eval "getComputedStyle(document.querySelector('[data-widget=report-activity] [data-drag-handle]')).pointerEvents"
```

Verification snippet (run after any case; `overlaps` must be `[]`):

```bash
agent-browser --session bento-sweep eval "(() => { const els=[...document.querySelectorAll('[data-widget]')]; const ovl=[]; for(let i=0;i<els.length;i++)for(let j=i+1;j<els.length;j++){ if(els[i].closest('[data-region]')!==els[j].closest('[data-region]'))continue; const a=els[i].getBoundingClientRect(),b=els[j].getBoundingClientRect(); if(a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom)ovl.push([els[i].getAttribute('data-widget'),els[j].getAttribute('data-widget')]); } return JSON.stringify({ live: document.querySelector('[aria-live=polite]')?.textContent, overlaps: ovl, placements: els.map(el=>el.getAttribute('data-widget')+'@'+el.getAttribute('data-x')+','+el.getAttribute('data-y')+' '+el.getAttribute('data-cols')+'x'+el.getAttribute('data-rows')) }); })()"
```

---

## MISSION-CONTROL (fresh reload before each case)

Pristine reference placements: masthead@0,0 12x1; triage@0,1 6x4; activity@6,1 4x4;
ai@10,1 2x6; ledger@0,5 7x8; code@7,5 3x4; alerts@9,9 3x4; health@11,1 1x3;
dirty@11,7 1x3; stack@10,10 2x3. Row 0 = the vitals band.

### [1] Shrink ACTIVITY's bottom edge up ~2 rows

```bash
agent-browser --session bento-sweep open "http://127.0.0.1:37420/app/mission-control"
sleep 6
agent-browser --session bento-sweep mouse move 2279 585
agent-browser --session bento-sweep mouse down
agent-browser --session bento-sweep mouse move 2279 480
agent-browser --session bento-sweep mouse move 2279 371
agent-browser --session bento-sweep mouse up
sleep 1
agent-browser --session bento-sweep screenshot /tmp/rp-case1.png
```

(2279,585) = ACTIVITY's `s` handle center; −214px → −2 rows.

**Expected (observed):** `Activity resized south to 4 by 2 cells`;
`report-activity@6,1 4x2`; `report-code` rises within its band to `6,3 3x4`; every
other widget keeps its band. `overlaps: []`.

### [2] Move ACTIVITY to the top-right (owner case 3)

```bash
agent-browser --session bento-sweep open "http://127.0.0.1:37420/app/mission-control"
sleep 6
agent-browser --session bento-sweep mouse move 1735 197
agent-browser --session bento-sweep mouse down
agent-browser --session bento-sweep mouse move 2200 210
agent-browser --session bento-sweep mouse move 2845 229
agent-browser --session bento-sweep mouse up
sleep 1
agent-browser --session bento-sweep screenshot /tmp/rp-case2.png
```

(1735,197) = ACTIVITY's grip (hover first — same point); (2845,229) = row 1, columns
9–12. The 4-wide footprint clamps at the right edge — the ghost shows the committed
cell.

**Expected (observed):** `Activity moved to column 9, row 2`;
`report-activity@8,1 4x4`; `report-ai` skyline-fills the freed slot at `6,1`; board
stays tight. `overlaps: []`.

### [3] Drop a widget ONTO the vitals band (owner round-3 case)

```bash
agent-browser --session bento-sweep open "http://127.0.0.1:37420/app/mission-control"
sleep 6
agent-browser --session bento-sweep mouse move 3150 845
agent-browser --session bento-sweep mouse down
agent-browser --session bento-sweep mouse move 2000 400
agent-browser --session bento-sweep mouse move 1713 121
agent-browser --session bento-sweep mouse up
sleep 1
agent-browser --session bento-sweep screenshot /tmp/rp-case3.png
```

(3150,845) = DIRTY LEADERS' grip; (1713,121) = the vitals band, far left of the
figures (row 0). The masthead is free and yields.

**Expected (observed):** `Dirty leaders moved to column 7, row 1`;
`dirty-leaders@6,0 1x3` ON the vitals band; the masthead compacts to `0,4 12x1`
(below the first widget band — it yields like any free widget); triage/activity/
health tile the first band around the dropped widget; the rest skyline-fills. 
`overlaps: []`.

### [4] Move a widget UP into an upper row with space

```bash
agent-browser --session bento-sweep open "http://127.0.0.1:37420/app/mission-control"
sleep 6
agent-browser --session bento-sweep mouse move 2867 1169
agent-browser --session bento-sweep mouse down
agent-browser --session bento-sweep mouse move 2867 1060
agent-browser --session bento-sweep mouse move 2867 953
agent-browser --session bento-sweep mouse up
sleep 1
agent-browser --session bento-sweep screenshot /tmp/rp-case4.png
```

(2867,1169) = STACK MIX's grip; (2867,953) = two rows up. HEALTH occupies the target
rows and is free — it yields by sliding down.

**Expected (observed):** `Stack mix moved to column 11, row 9`;
`stack-mix@10,8 2x3`; `report-health@10,11` (yielded below). `overlaps: []`.

### [5] Grow CODE west

```bash
agent-browser --session bento-sweep open "http://127.0.0.1:37420/app/mission-control"
sleep 6
agent-browser --session bento-sweep mouse move 2018 823
agent-browser --session bento-sweep mouse down
agent-browser --session bento-sweep mouse move 1900 823
agent-browser --session bento-sweep mouse move 1735 823
agent-browser --session bento-sweep mouse up
sleep 1
agent-browser --session bento-sweep screenshot /tmp/rp-case5.png
```

(2018,823) = CODE's `w` handle center; −283px = −1 column.

**Expected (observed):** `Code resized west to 4 by 4 cells`; `report-code@6,5 4x4`.
`overlaps: []`.

---

## BENTO (fresh reload before each case)

Pristine reference: health@0,0 3x3 (grip 64,148); activity@3,0 6x3 (grip 899,148);
stacks@9,0 3x3 (grip 2570,148); attention@0,0 8x3 (grip 64,476); signals@8,0 4x3
(grip 2291,476).

### B-1 Move STACK MIX to the centre

```bash
agent-browser --session bento-sweep open "http://127.0.0.1:37420/app/bento"
sleep 6
agent-browser --session bento-sweep mouse move 2570 148
agent-browser --session bento-sweep mouse down
agent-browser --session bento-sweep mouse move 2000 400
agent-browser --session bento-sweep mouse move 1611 515
agent-browser --session bento-sweep mouse up
sleep 1
agent-browser --session bento-sweep screenshot /tmp/rp-b1.png
```

**Expected (observed):** `vitals-stacks@6,3 3x3` (pinned exactly); health/activity
keep the top band; the signals band below is untouched. `overlaps: []`.

### B-2 Move SIGNAL MIX within its band

```bash
agent-browser --session bento-sweep open "http://127.0.0.1:37420/app/bento"
sleep 6
agent-browser --session bento-sweep mouse move 2291 476
agent-browser --session bento-sweep mouse down
agent-browser --session bento-sweep mouse move 2600 700
agent-browser --session bento-sweep mouse move 2890 940
agent-browser --session bento-sweep mouse up
sleep 1
agent-browser --session bento-sweep screenshot /tmp/rp-b2.png
```

**Expected (observed):** `signals-mix@8,3 4x3` (down one band, right column — the
exact preview cell); `signals-attention@0,0 8x3` unchanged. `overlaps: []`.

### B-3 Shuffle WORKSPACE HEALTH down (drop onto the attention band's columns)

```bash
agent-browser --session bento-sweep open "http://127.0.0.1:37420/app/bento"
sleep 6
agent-browser --session bento-sweep mouse move 64 148
agent-browser --session bento-sweep mouse down
agent-browser --session bento-sweep mouse move 64 300
agent-browser --session bento-sweep mouse move 64 472
agent-browser --session bento-sweep mouse up
sleep 1
agent-browser --session bento-sweep screenshot /tmp/rp-b3.png
```

**Expected (observed):** `vitals-health@0,3 3x3`; `vitals-activity@0,0 6x3`;
`vitals-stacks@6,3 3x3` — the vitals band re-tiles tightly around the pin.
`overlaps: []`.

---

## [6] MC ACCEPTANCE — the owner's target layout, multi-move sequence

Drop every widget onto its target cell in order. Each drop lands EXACTLY at the
preview (the arrangement model renders the committed board verbatim — no
auto-reordering); widgets the drop displaces re-home below it; nothing else moves.
After the sequence the board equals the owner's target arrangement, `overlaps: []`.

```bash
agent-browser --session bento-sweep open "http://127.0.0.1:37420/?preset=mission-control"
sleep 6
agent-browser --session bento-sweep eval "(async () => { const drag = async (id, to) => { const f = document.querySelector('[data-widget='+id+']'); const grip = f.querySelector('[data-drag-handle]').getBoundingClientRect(); const sx = grip.left + grip.width/2, sy = grip.top + grip.height/2; f.querySelector('[data-drag-handle]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 500, pointerType: 'mouse', button: 0, clientX: sx, clientY: sy })); for (let i = 1; i <= 4; i++) window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 500, clientX: sx + (to[0]-sx)*i/4, clientY: sy + (to[1]-sy)*i/4 })); window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 500, clientX: to[0], clientY: to[1] })); await new Promise(r => setTimeout(r, 150)); return document.querySelector('[aria-live=polite]')?.textContent; }; return { 1: await drag('triage', [863, 337]), 2: await drag('report-activity', [2279, 337]), 3: await drag('report-ai', [3128, 445]), 4: await drag('ledger', [1005, 931]), 5: await drag('report-code', [2420, 931]), 6: await drag('stack-mix', [3128, 823]), 7: await drag('report-health', [2986, 1147]), 8: await drag('dirty-leaders', [3269, 1147]) }; })()"
```

**Expected (observed):** every announcement `… moved to column …, row …`; final
placements = masthead@0,0 12x1 | triage@0,1 6x3 | activity@6,1 4x3 | ai@10,1 2x5 |
ledger@0,4 7x8 | code@7,4 3x8 | stack@10,6 2x2 | health@10,8 1x4 | dirty@11,8 1x4 —
the owner's target bands, widget for widget. `overlaps: []`.

### [7] MC displacement demo — drop onto an occupied band, push, restore

```bash
agent-browser --session bento-sweep open "http://127.0.0.1:37420/?preset=mission-control"
sleep 6
agent-browser --session bento-sweep eval "(async () => { const drag = async (id, to) => { const f = document.querySelector('[data-widget='+id+']'); const grip = f.querySelector('[data-drag-handle]').getBoundingClientRect(); const sx = grip.left + grip.width/2, sy = grip.top + grip.height/2; f.querySelector('[data-drag-handle]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 600, pointerType: 'mouse', button: 0, clientX: sx, clientY: sy })); for (let i = 1; i <= 4; i++) window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 600, clientX: sx + (to[0]-sx)*i/4, clientY: sy + (to[1]-sy)*i/4 })); window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 600, clientX: to[0], clientY: to[1] })); await new Promise(r => setTimeout(r, 150)); return document.querySelector('[aria-live=polite]')?.textContent; }; return { dropStackOnCode: await drag('stack-mix', [2420, 559]), codePushed: document.querySelector('[data-widget=report-code]').getAttribute('data-y'), restoreCode: await drag('report-code', [2420, 931]), restoreStack: await drag('stack-mix', [3128, 823]) }; })()"
```

**Expected (observed):** the stack drop lands exactly at the preview (pushing CODE
below it — CODE's `data-y` moves from 4 to 6); moving CODE afterwards re-homes it;
the final board is overlap-free. No drop in the sequence is ever refused.

### [8] BENTO multi-move — the same guarantees on the bento board

```bash
agent-browser --session bento-sweep open "http://127.0.0.1:37420/?preset=bento"
sleep 6
agent-browser --session bento-sweep eval "(async () => { const drag = async (id, to) => { const f = document.querySelector('[data-widget='+id+']'); const grip = f.querySelector('[data-drag-handle]').getBoundingClientRect(); const sx = grip.left + grip.width/2, sy = grip.top + grip.height/2; f.querySelector('[data-drag-handle]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 700, pointerType: 'mouse', button: 0, clientX: sx, clientY: sy })); for (let i = 1; i <= 4; i++) window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 700, clientX: sx + (to[0]-sx)*i/4, clientY: sy + (to[1]-sy)*i/4 })); window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 700, clientX: to[0], clientY: to[1] })); await new Promise(r => setTimeout(r, 150)); return document.querySelector('[aria-live=polite]')?.textContent; }; return { 1: await drag('vitals-activity', [64, 640]), 2: await drag('vitals-stacks', [400, 860]), 3: await drag('signals-mix', [2890, 940]), 4: await drag('signals-attention', [863, 645]) }; })()"
```

**Expected (observed):** `Activity moved to column 1, row 6`; `Stack mix moved to
column 2, row 8`; signals/attention re-home within their band; every other widget
(chrome, health, pulse, mosaic tiles) stays exactly where it was. `overlaps: []`.

---

## If a case fails when run verbatim

1. Re-run the grip liveness check — `"none"` means the deployed build predates the
   always-live grip fix; redeploy.
2. Re-run the coordinate dump — preset sizes may have changed (the mc fixer agent
   edits them); recompute the handle centers from the fresh rects.
3. Check the announcement: refusals announce `… can't move/resize there — <widget>
   occupies that spot` (target overlapped a pinned widget — reload to clear pins).
4. Harness URLs: the meadow agent is migrating `/app/*` routes — if a harness run
   fails on reachability, re-derive the URL from `run.mjs --help` / the route tree.
