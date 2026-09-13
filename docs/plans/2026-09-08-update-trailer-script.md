# Update trailer — script & shot list (October 2026)

The creative source of truth for the trailer: every scene, voiceover line,
music/SFX cue, and the exact capture recipe per app shot. The execution plan
(`2026-09-08-update-trailer-plan.md`) reads this file; the voice procedure
lives in `2026-09-08-update-trailer-voice.md`.

**Format**: 1920×1080 @ 30 fps, H.264 + AAC, target runtime **~85–95 s**.
**Tone**: Honest Trailers parody — epic trailer bombast over an
overkill-but-beloved side project, one deadpan gag beat, escalating disbelief,
CTA.
**VO voice**: clone of Jon Bailey ("Epic Voice Guy"), see voice doc.

---

## Scene table

| # | VO | Est. | Visual | Source | Audio cues |
|---|----|------|--------|--------|-----------|
| S01 | 01 | 5 s | Cold open: starfield, slow fade-in, wordmark "workspace-welcome — the update". | Remotion comp | Music M1 epic swell starts forte; riser under |
| S02 | 02 | 4 s | Avatar card slides in from the right, small "hello" wave loop. | Remotion comp (asset: avatar PNG) | card-whoosh SFX |
| S03 | 03 | 5 s | GitHub star-counter card slides in from the right (same treatment, a little "hello" nudge). | Remotion comp (asset: ST-5 screenshot) | card-whoosh SFX |
| S03b | 04 | 3 s | **Gag beat**: music hard-cuts to silence, half a beat, deadpan line, star card slumps/dims. | Remotion comp | M1 hard stop (record-scratch optional); room tone only |
| S04 | 05 | 7 s | White flash → explosion, debris + smoke; the 3 theme stills fly in and arrange as a **triangle**, which **rotates one full cycle while each card counter-rotates to stay upright**; title slam "WITH THEMES". | Remotion comp (assets: ST-1..3) | M1 slams back in; explosion + riser SFX |
| S05 | 06 | 5 s | Zoom into mission-control dashboard; cursor drags `se` resize handle of a widget, it grows gracefully. | CAP-1 clip, zoom/pan + cursor overlay in comp | M1 continues |
| S06 | 07 | 4 s | "…too many": rapid-fire random drags/resizes mess the board up (sped up ~1.5–2×). | CAP-2 clip, sped up in comp | M1 + comedic stutter hits |
| S07 | 08 | 5 s | Widget tabs get clicked through (charts/graphs flip). "yeah, DATA!" lands on the busiest chart. | CAP-3 clip | M1 + UI click ticks |
| S08 | 09 | 9 s | Actions → Create project → wizard pages type themselves out; live CLI preview visibly updating; submit; cut on progress toast. | CAP-4 clip | M1 continues; subtle keystroke ticks |
| S09 | 10 | 8 s | Click first project in roster → project page; slow pan/scroll across the full widget board. | CAP-5 clip | M1 continues |
| S10 | 11 | 6 s | Zoom on the git cluster (Fetch click + toast), then the commit graph. | CAP-6 clip, digital zoom in comp | M1; UI tick |
| S11 | 12 | 7 s | Click IDE → new tab: code-server opens with `?folder=` deep link. | CAP-7 clip (both tabs) | M1 peak; whoosh on tab flip |
| S12 | 13 | 5 s | Rapid montage flash-cuts (0.3 s each) of S04–S11 hits. | reused clips in comp | M1 continues |
| S13 | 14 | 8 s | End card: repo name, big star button graphic + repo URL; "most stupid side project — EVER." lands; music sting out; 1.5 s tail. | Remotion comp | M1 final sting; deep boom |

Estimated total: ~81 s + tail ≈ **85–95 s** after real VO durations land
(`timing.json` refines every estimate; scene order never changes).

## VO manifest (`assets/voice/vo-manifest.json`)

| id | Text | Direction |
|----|------|-----------|
| 01 | "This October." | Full trailer-god bombast. Slow. Gravitas. |
| 02 | "From someone nobody knows." | Same bombast; a hint of pity on "nobody". |
| 03 | "Comes an update on something nobody cares about." | Bombast continues into the setup. |
| 04 | "I mean — literally — no one." | Deadpan, deflated, close-mic, dry. No bombast at all. |
| 05 | "With themes!" | Bombast slams back with the explosion. One-word punch. |
| 06 | "Resizable widgets." | Confident product-demo tone. |
| 07 | "Too many resizable widgets." | Escalating, slightly unhinged, a touch faster. |
| 08 | "And data… yeah — DATA!" | Gleeful nerd joy; "DATA" big. |
| 09 | "And what is that? Integration with Better T Stack? For real?! Daaaamn…" | Genuine surprise, mock-outrage; elongated "daaamn". |
| 10 | "And the project page… look at all those widgets, and data!" | Awed tour-guide. |
| 11 | "What do you mean, 'git integration'? C'mon now — this is getting ridiculous." | Mock outrage, trailed off at the end. |
| 12 | "A web IDE?! Get outta here!!" | Maximum disbelief. Biggest line. |
| 13 | "Well, if this isn't the most overkill 'welcome back' page project, I don't know what is." | Respect-through-absurdity, half-smiling. |
| 14 | "Go give that absolute unit a star — and come try the overkillness of the most stupid side project… EVER." | Final CTA; slow build; "EVER" lands on the sting. |

Each entry: `{ "id", "text", "direction" }`. Generation procedure + hard
service rules: see voice doc.

## Music & SFX plan

- **M1 — one epic trailer track**, carried start-to-finish with two
  interruptions (hard cut in S03b, slam-back in S04). Source: Pixabay Content
  License (no attribution) — pick from the "epic trailer" search; avoid
  Content-ID-shield tracks or keep the license certificate. Backup: Incompetech
  CC-BY (Kevin MacLeod "The Complex" / "Tectonic") — requires description
  credit. Record the pick + license URL in `assets/music/LICENSE.md`.
- **SFX (Pixabay/Mixkit, no attribution)**: card-whoosh ×2, explosion,
  riser, deep boom (end card), optional record-scratch, optional UI click/keystroke ticks.

## Capture shots (app footage — scripted, 1920×1080, deviceScaleFactor 1)

Preconditions for every shot (from the codebase recon):
- Live app at `http://192.168.1.41:37420` (served from this same machine —
  192.168.1.41 IS this box); settle = `[data-widget-board]` present
  + `data-ready` on the board root + double rAF.
- Theme forced by URL, e.g. `/?preset=mission-control` (never via menu clicks —
  flaky and it persists prefs). Layout state is **memory-only**: a reload
  resets the board, so every take starts clean.
- Real dashboard on camera (user's decision, recorded 2026-09-08): the
  user's actual roots are filmed as-is — no fake projects, no fixture
  seeding. A **git-snitch report pre-generated** for the tour project
  (report widgets are skeletons until then); code-server **pre-installed
  and running** before CAP-7.
- Popups allowed (IDE opens a new tab). Seatbelt: `store.json` copied to
  `/tmp/ww-trailer/` before capture; by default nothing is unregistered or
  restored.

| id | Shot | Route & recipe |
|----|------|----------------|
| CAP-1 | Graceful resize | `/` mission-control: hover widget `[data-widget="triage"]`, drag `button[data-resize-handle="se"]` outward ~200 px, hold, release. 6 s total. |
| CAP-2 | Chaos drags | `/`: scripted burst — 5–6 rapid `button[data-drag-handle]` drags + one resize + digit keys `2`, `3` (console views), overlapping. Record ~8 s (sped up in comp). |
| CAP-3 | Widget tabs | `/project/<hero>` mission-control: click through `[data-slot="widget-tabs"] [role="tab"]` (Files → Artifacts → Ideation) with beats between; also press console keys `1`–`4` on `/`. |
| CAP-4 | Create project | `/` mission-control: Actions dropdown → "Create project" → wizard: type project name `october-trailer-demo`, click through the 4 pages with a visible option toggle or two (live CLI preview updates), submit, capture progress toast, cut before scaffold finishes. |
| CAP-5 | Project page tour | `/`: click the **tour project** in the roster (picked in plan Phase 2b — busiest board) → `/project/<path>` → smooth slow scroll/pan across the whole board (state band → commits ledger → working surface). |
| CAP-6 | Git cluster | `/project/<hero>`: click **Fetch** (toast lands), then a slow digital push-in on the commit-graph rows (zoom finished in comp; capture steady frames). |
| CAP-7 | Web IDE | `/project/<hero>`: click the IDE button in `[data-mc-open-actions]` → switch to the new tab (`?folder=` URL) → brief editor pan. |
| ST-1..3 | Theme stills ×3 | Reuse the in-repo snapshot harness for `mission-control/console`, `bento/graphite`, `meadow/daylight` (dashboard, 1920-wide). |
| ST-4 | Dashboard wide | Mission-control dashboard hero still (S12 montage + S13 backdrop). |
| ST-5 | Star counter | Screenshot of `https://github.com/DimitriGilbert/workspace-welcome` (repo confirmed via `git remote -v`) — stars visible, the count is the joke. |
| AV-1 | Avatar | Download `https://github.com/DimitriGilbert.png` (verified 2026-09-08: 200, image/png). |

## Safety rails for capture

- CAP-4 scaffolds under a real root with a unique throwaway name per take
  (`october-trailer-demo-<n>`); the folder is deleted after capture and the
  roster rescanned.
- Seatbelt backup of `~/.config/workspace-welcome/store.json` to
  `/tmp/ww-trailer/` before capture; by default nothing is unregistered or
  restored (real dashboard filmed as-is, per user decision).
- Stop the IDE server from Settings after CAP-7; delete throwaway scaffold
  dirs after capture passes.
- Never push/pull on real repos — Fetch only (read-only against your
  remotes, harmless).
