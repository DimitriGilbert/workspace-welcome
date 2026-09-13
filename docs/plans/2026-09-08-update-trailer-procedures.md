# Update trailer — reusable procedures (future-skill material)

Generic, project-agnostic knowledge distilled from planning (and, after
execution, from practice) the workspace-welcome October-2026 trailer. Written
so a future "app trailer video" skill can be cut from it: everything here
applies to *any* local web app + self-hosted TTS + YouTube-target trailer.
Project-specific details live in the sibling `…-plan.md`, `…-script.md`, and
`…-voice.md` docs and are referenced, not duplicated.

Phase 7 of the execution plan appends a **final actuals** section (real
versions, timings, deviations) — this section is a log target, not filler.

---

## The pipeline pattern (5 stages, one contract)

```
script  →  voice  →  capture  →  composition  →  finish
              │                                ▲
              └──────── timing.json ───────────┘
```

The single load-bearing contract is **`timing.json`** (per-VO-line durations
measured with ffprobe after generation). Scene durations, montage cuts, and
music cue points all derive from it. Generate audio FIRST, measure, then
build visuals to measured audio — never the reverse. This is what keeps a
90-second video editable without re-recording anything when a line changes.

## P1 — Trailer script grammar (parody format)

Beats that make the format work (each maps to a scene row in a script table):

1. Cold open — big music, tiny stakes ("This October." over a starfield).
2. Deflation setup — praise, then the gag beat: music hard-cuts, one deadpan
   close-mic line, beat of silence, music slams back. The hard cut is the
   joke; keep the deadpan line SHORT.
3. Feature beats with escalation — each feature shown in the REAL app
   (authenticity is the charm), VO tone escalating from product-demo to
   disbelief to mock outrage. End the escalation on the biggest feature.
4. Absurdist respect line — the "if this isn't the most overkill X, I don't
   know what is" beat, over a rapid flash-cut montage of earlier shots.
5. CTA — end card with one action (star the repo), music sting, "EVER"-style
   final word landing on the sting, 1–2 s tail.

VO manifest format: `{ id, text, direction }` — `direction` carries tone/
pace (bombast vs deadpan) because most TTS APIs expose only `speed`; the
direction field guides retries and A/B model picks, not the API call.

## P2 — Voice-clone TTS pipeline (service-agnostic)

1. **Reference sample**: 10–30 s, single speaker, no music/noise, WAV 16-bit
   PCM mono, 24 kHz. Prefer natively dry sources (solo videos, podcast
   interviews) over Demucs-separated stems — separation artifacts hurt
   cloning. Cleanup chain:
   `highpass=f=80, lowpass=f=7500, afftdn=nf=-25, silenceremove` →
   `-ar 24000 -ac 1 -c:a pcm_s16le`.
2. **Hard safety rules, enforced structurally**: the generation script's HTTP
   layer is a single wrapper with an exact-string path allowlist (only the
   speech-synthesis endpoint + read-only GETs). Heavy general-purpose
   endpoints (chat/LLM, STT, diarization, realtime) are never in the
   allowlist — the client then *cannot* call them, making the "don't hog the
   box" rule a code property, not a convention. Requests are serialized
   (one at a time, await each): shared self-hosted boxes serve one model at
   a time.
3. **Model A/B gate**: generate ONE representative line on each candidate
   model, pick by quality-per-cost, record the rationale in
   `model-choice.md`, then batch-generate the full manifest with the winner
   only.
4. **Idempotent batch generation**: `for…await` over the manifest, skip
   existing outputs, `--force <id>` for retakes, assert HTTP 200 + non-empty
   body per line, write `<id>.wav` per line.
5. **Measure**: ffprobe loop → `timing.json`. Validate: every file
   0.5–12 s, non-silent (mean_volume > −60 dB), correct rate/channels.
6. **Fallback ladder**: other clone model → cleaner reference segment →
   built-in "narrator" preset → ask the user.
7. **Provenance**: cloned real-person voices stay inside the one project,
   private, non-commercial; never redistribute sample or voice id; disclose
   "AI parody voice" in the video description.

## P3 — Scripted app capture (determinism checklist)

- **Settle before acting**: wait for the app's readiness signals (our case:
  `[data-widget-board]` + `data-ready` + double rAF), then act. Generic
  rule: find or ask for a data-ready attribute; never sleep-and-pray.
- **Deterministic data**: fixture repos with pinned `GIT_AUTHOR_DATE`/
  `GIT_COMMITTER_DATE`, seeded dirty/clean/cold states, local bare repos as
  `origin` to fake ahead/behind. Pre-generate any report/cached artifacts the
  UI lazily needs (skeleton screens don't film well). Pre-install heavy
  on-demand components (e.g. code-server ~100–200 MB) BEFORE recording.
- **State decision before capture (privacy or authenticity)**: default safe
  pattern is a state swap — back up the app's state store, swap to a
  fixtures-only state via the app's own API/UI (prefer supported mutations
  over file surgery), assert zero real data visible before every take,
  restore + verify afterwards. Equally valid: the owner explicitly opts to
  film the real dashboard (this project did — decision recorded in the plan).
  The checklist item is DECIDING and recording it, not defaulting to either.
  Either way, validators READ extracted frames looking for accidental
  sensitive data (tokens, keys, private notes).
- **Repeatable takes**: prefer app state that resets on reload (or engineer
  it); reload before each take; unique throwaway names for any destructive
  action (scaffolds); read-only git ops only (Fetch, never Push/Pull on real
  remotes).
- **Recording tech**: Playwright `recordVideo` is VP8 ~1 Mbps hardcoded,
  variable-frame-rate, no audio, no fps control, no cursor — fine for
  source footage that gets composited; always transcode to CFR
  (`ffmpeg -vf fps=30 -c:v libx264 -crf 18`) before editing. If text smears,
  move to CDP-frame capture (own encoder). Viewport 1920×1080,
  deviceScaleFactor 1. A synthetic cursor dot composited in the edit reads
  better than a real cursor anyway.
- **Validation by frame audit**: validators can't watch video — extract
  start/mid/end frames per clip with ffmpeg and READ them (vision): state
  changed as scripted, no data leaks, right route/theme per shot.

## P4 — Composition (Remotion patterns)

- **Architecture**: cinematic scenes as pure Remotion compositions; captured
  app clips imported with `<OffthreadVideo>`; ONE Root composition sequences
  everything. Do NOT record HTML/CSS animations via screen capture for
  motion graphics — real-time rAF capture drifts exactly where motion
  graphics need precision; Remotion is frame-deterministic.
- **Determinism rules**: all motion from `useCurrentFrame()` +
  `interpolate`/`spring`; seeded randomness only (`random(seed)`); zero
  `Date.now()`/wall-clock in render code.
- **Timing contract**: a `timing.ts` module loads `timing.json` and computes
  the cumulative frame map; scene components receive their offset, Root
  composes. Changing one VO line re-renders only downstream timings.
- **Audio**: `<Audio>` per VO line at scene offsets; music bed with
  `volume` keyframes for the cut/slam beats; SFX at cue frames. Loudness is
  deliberately NOT finalized here (edit stage), only placement.
- **License**: Remotion is free for individuals and ≤3-person teams
  (2026 terms); pre-warm its Chromium with `npx remotion browser ensure`.
- **Render**: `npx remotion render src/index.ts <Comp> out/x.mp4` (H.264
  default); minutes for ~2700 frames on a laptop.

## P5 — ffmpeg finishing chain (YouTube target)

1. Duck music under VO: `[vo]asplit[sc][mix]; [music][sc]sidechaincompress=
   threshold=0.03:ratio=20:attack=5:release=300[duck]; [duck][mix]amix`.
2. Two-pass EBU R128: pass 1 `loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json`
   → feed measured values into pass 2 with `linear=true`.
3. Encode: `libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags
   +faststart -c:a aac -b:a 192k` at the project fps.
4. Export a thumbnail frame from the end card.

## P6 — Music/SFX licensing quick reference

- **Pixabay** (Content License) and **Mixkit**: no attribution, safest
  default; some Pixabay tracks are Content-ID-registered — keep the license
  certificate; claims clear by dispute in ~72 h.
- **Incompetech / Kevin MacLeod** (CC-BY 4.0): great epic tracks ("The
  Complex", "Tectonic") but the catalog is deliberately in Content ID —
  requires description credit + dispute.
- **Freesound**: filter to CC0 only (avoid CC-BY-NC).
- Rule: every downloaded asset gets one provenance line (file, URL, license,
  date) in a LICENSE.md next to it, 1:1 coverage, no orphans.

## P7 — Orchestration mapping (how this runs under subagent-orchestration)

- Phases map 1:1 to plan phases: scaffold → assets/state (parallel) →
  voice → capture → composition (parallel sub-phases + phase-wide) →
  finish → distill/cleanup. One implementer + one validator per sub-phase;
  fixer loops ≤ 3.
- Validators verify three ways, in order: **read the code line-by-line**
  (allowlist! no blacklisted-path strings anywhere), **run gates**
  (check-types, render, ffprobe assertions), **extract and READ evidence
  frames/PNGs** for anything visual.
- Exactly one planned human checkpoint: the final video review (funny-check)
  — everything else runs to completion.
- Halt-and-ask conditions: app server down, TTS service unreachable, avatar
  asset missing, any real-data leak in a frame.
- The distill phase is mandatory: update this document with final actuals —
  that delta (plan vs practice) is the core value for the future skill.

## Research gotchas bank (pre-execution, verified 2026-09-08)

- Playwright recordVideo encoder is hardcoded (VP8, 1 Mbps, ~25fps VFR,
  closed feature requests) — transcode, don't fight it.
- Remotion ≥4.0.247 auto-downloads Chrome Headless Shell on first render;
  pre-warm. It bundles its own ffmpeg.
- Capture target was the LIVE LAN instance served from the same machine
  (the workstation IS 192.168.1.41) — film the deployed thing, but first
  probe it serves the build you're marketing: plain curl missed the
  client-stamped theme attributes; the real probe is a hydrated headless
  check (`?preset=bento` flips the theme picker).
- This app: themes forceable by URL (`?preset=&scheme=&bare=`), widget
  layout state is memory-only (reload = clean board), resize/drag handles
  are automation-safe (`data-resize-handle`/`data-drag-handle`), report
  widgets render skeletons until a report exists, scaffold jobs are
  single-flight with 10-min timeout, IDE = separate origin + popup tab.
- Speaches (the TTS box): cloning via `POST /api/voices` (multipart file+
  name), synthesis via `POST /v1/audio/speech`; chatterbox-turbo is the
  lightest clone-capable model; heavy endpoint to blacklist:
  `POST /v1/chat/completions` (+ STT/diarization/realtime).

## Final actuals

(filled by Phase 7 of the execution plan: real versions, render/generation
times, model-choice outcome, capture drift observed, deviations from plan.)
