# October-2026 update trailer — Subagent Orchestration Plan

**Status: PLAN — awaiting user approval.** Executed per the
`subagent-orchestration` skill: user approves this plan once, then the
orchestrator dispatches implementer → validator → (fixer) subagents per phase
with no mid-flight stops.

A ~90-second Honest-Trailers-style parody trailer for the workspace-welcome
October update (themes, resizable widgets, widget tabs/data, Better T Stack
scaffolding, project page, git, web IDE). Cinematic scenes in **Remotion**,
app footage from **scripted Playwright capture**, narration from the
**Speaches** voice-clone service, finished with **ffmpeg**.

## Canonical specs every dispatch reads

- **Script & shot list**: `docs/plans/2026-09-08-update-trailer-script.md` —
  scene table, VO manifest, capture recipes, safety rails.
- **Voice procedure**: `docs/plans/2026-09-08-update-trailer-voice.md` —
  Speaches endpoints, hard rules, cloning + generation procedure.
- **Prior art**: `docs/plans/2026-09-01-welcome-workspace-demo-plan.md`
  (the earlier product-demo plan — background only; its fixture/privacy
  strategy is deliberately NOT used here) and `scripts/widget-check/`
  (in-repo CDP harness + snapshot/interaction suites — read-only reference,
  still used for the theme stills).
- **Build location**: the trailer project is a NEW standalone workspace at
  `/home/didi/workspace/trailer-workspace-welcome/` — deliberately outside the
  monorepo. Nothing in the monorepo is modified by this plan except these
  `docs/plans/2026-09-08-update-trailer-*.md` files.

## Ground rules for EVERY dispatch (paste into each implementer/fixer prompt)

**NO-SLOP policy (verbatim, mandatory):**

- NO `any`, `as any`, `: any` ANYWHERE
- NO placeholder code, NO `// TODO`, NO `// FIXME`
- NO unused imports, NO unused variables — if a variable is not used, it must not exist
- NO console.log hacks to suppress errors. NO void hacks.
- Use `import type` for type-only imports (`verbatimModuleSyntax: true`)
- External imports first, blank line, then local imports

**Project adaptations (override generic rules where they conflict):**

- pnpm only, run from `/home/didi/workspace/trailer-workspace-welcome/` once
  it exists (Phase 1 from the repo root context). Never add trailer deps to
  the monorepo catalog or lockfile.
- **🚨 Voice service hard rules (from the voice doc, non-negotiable):**
  NEVER call `POST /v1/chat/completions` (or transcriptions / translations /
  diarization / speech/embedding / realtime) on
  `http://192.168.1.41:18800`. Speech generation ONLY via
  `POST /v1/audio/speech` with the cloned voice `jon_trailer`, serialized
  one-at-a-time, through the allowlisted client script. GETs are free.
- The app is captured at the LIVE instance `http://192.168.1.41:37420`,
  which is served from this same machine (192.168.1.41 IS this box) — no dev
  server is started by anyone. Before the first app-dependent phase, verify
  the live build is CURRENT (includes themes + the widget system — the
  update being trailed); if unreachable or stale, HALT and ask the user to
  serve the current build there.
- Never commit or push anything, in either repo, unless the user asks.
- `~/.config/workspace-welcome/store.json`: back up before capture work,
  restore after (Phase 2 protocol); prefer UI/tRPC mutations over file edits.
- Throwaway artifacts: the scaffold project lives under the chosen real root
  (unique name, deleted in Phase 7); everything else transient lives under
  `/tmp/ww-trailer/` and is deleted in Phase 7.
- Assets are never hand-edited binary blobs; every downloaded asset gets a
  provenance line in its `LICENSE.md`/`README.md`.

**Gatekeeping commands** (implementers/fixers run these in the trailer
project before reporting done; fix everything they surface):

```
pnpm run check-types        # tsc --noEmit, strict
node --test scripts/        # any unit-tested helper (timing math, allowlist)
```

Plus phase-specific gates listed below. Validators: read the actual code
line-by-line, re-run gates, and for visual/audio outputs extract evidence
(ffmpeg frames / ffprobe json) instead of trusting filenames.

---

## Phase 1 — Trailer project scaffold
**Type**: Sequential

**Requirements**:

- Create `/home/didi/workspace/trailer-workspace-welcome/` as a standalone
  pnpm project (its own lockfile): `pnpm init`, deps `remotion`, `@remotion/cli`,
  `react`, `react-dom`, `typescript`; dev deps `@playwright/test` +
  `playwright` with chromium browser installed, `@types/react`, `@types/node`.
- Folder tree: `src/` (`index.ts` register Root, `Root.tsx`, `scenes/`),
  `assets/voice/lines/`, `assets/music/`, `assets/sfx/`, `assets/shots/{raw,cfr}/`,
  `assets/stills/`, `scripts/`, `out/`, `bin/`.
- `package.json` scripts: `check-types` (`tsc --noEmit`), `studio`
  (`remotion studio`), `render` (`remotion render src/index.ts Trailer
  out/trailer-raw.mp4`), plus empty placeholders `capture`, `voice`, `timing`
  wired in later phases (create the script files then; no stub files now).
- `src/Root.tsx`: composition `Trailer`, 1920×1080, 30 fps, 2700 frames
  (90 s placeholder), rendering a single placeholder full-bleed `<AbsoluteFill>`
  — real scenes arrive in Phase 5.
- Strict `tsconfig.json` (`strict`, `verbatimModuleSyntax`, `moduleResolution:
  bundler`).
- Download the `yt-dlp` standalone binary to `bin/yt-dlp` (`chmod +x`); verify
  `bin/yt-dlp --version`. No pip.
- Pre-warm Remotion's browser: `npx remotion browser ensure`.

**Inputs**: Read this plan + script doc. No app access needed.

**Outputs**: Create the project tree above (≈10 files).

**Validation Criteria**:

- `pnpm run check-types` passes in the trailer project.
- `npx remotion compositions src/index.ts` lists `Trailer` at 1920×1080/30.
- `bin/yt-dlp --version` prints a version.
- Playwright chromium launch test succeeds (headless `about:blank`).

**Dependencies**: None (first phase).

---

## Phase 2 — Assets & app prep
**Type**: Parallel (2a, 2b), then Sequential (2c)

### 2a: Music + SFX acquisition
**Requirements**:

- Download per the script doc's music/SFX plan: one epic trailer track (M1)
  from Pixabay (Content License; keep the license certificate/URL), and the
  SFX set (card-whoosh, explosion, riser, deep boom, optional record-scratch,
  optional UI ticks) from Pixabay/Mixkit.
- Normalize every SFX to WAV (24 kHz or 48 kHz PCM) with `ffmpeg` peak
  normalization; keep M1 as downloaded (full quality).
- `assets/music/LICENSE.md` + `assets/sfx/LICENSE.md`: one line per file —
  filename, source URL, license name, date. No file without a line.

**Outputs**: `assets/music/m1.<ext>`, `assets/sfx/*.wav`, both LICENSE.md.

**Validation**: every listed file exists, non-empty, `ffprobe`-readable
audio; LICENSE.md covers 1:1; implementer listened/spot-checked is not
required, validator verifies via ffprobe duration > 0.

### 2b: App prep (live-build probe + pre-warm)
**Requirements**:

- Probe the live instance: HTTP 200 AND current-build evidence — after
  hydration, a headless check shows `[data-widget-board]` and the theme
  system responds to `?preset=bento` (a plain curl can miss client-stamped
  attributes). If the live build predates the update, HALT and ask the user
  to serve the current build.
- **No store swap — the user films their REAL dashboard (decision recorded
  2026-09-08).** Seatbelt only: copy
  `~/.config/workspace-welcome/store.json` to
  `/tmp/ww-trailer/store.backup.json`; nothing is unregistered or replaced.
- **No fake projects on camera (user call, 2026-09-08): the real dashboard
  IS the demo.** If the real board happens to be all-green on shoot day, the
  affected shots film what's actually there — no fixture seeding, ever.
- CAP-4 scaffold target: a REAL root (pick one in this phase — the tour
  project's parent root works), unique throwaway name per take
  (`october-trailer-demo-<n>`); the created folder is deleted after capture.
- Pick the **tour project** (CAP-5/6/7 subject): the real project with the
  busiest board; generate a git-snitch **Report** for it if none exists
  (report widgets are skeletons until then); warm the snitch path first.
- Pre-warm the web IDE on the tour project (Open IDE once, wait `ide.status`
  Running, close the tab, keep it running).
- Download `assets/stills/avatar.png` from
  `https://github.com/DimitriGilbert.png` (verified 2026-09-08: 200,
  image/png).

**Outputs**: `/tmp/ww-trailer/store.backup.json`, report for the tour
project, warmed IDE, `assets/stills/avatar.png`, chosen CAP-4 scaffold root.

**Validation**: live-build probe PASS (logged command + observation); report
widget on the tour project shows charts, not skeletons (screenshot);
`ide.status` Running.

### 2c: Stills (after 2a+2b)
**Requirements**:

- ST-1..3 theme stills via the in-repo harness against the LIVE instance,
  output INTO the trailer project (read-only use of the monorepo):
  `pnpm --dir /home/didi/workspace/workspace-welcome widget-check:snapshot --
  --base-url http://192.168.1.41:37420
  --out <trailer>/assets/stills --themes mission-control,bento,meadow
  --pages dashboard --width 1920 --height 1080` (inspect the script in root
  `package.json` before running; report if it can't run and fall back to
  Playwright screenshots with `?preset=X&scheme=Y` URLs).
- ST-4 mission-control dashboard wide still; ST-5 screenshot of
  `https://github.com/DimitriGilbert/workspace-welcome` (repo confirmed via
  `git remote -v`) — stars visible, the count is the joke.

**Outputs**: `assets/stills/` populated (5+ PNGs, 1920-wide).

**Validation**: PNGs exist, ≥1900 px wide (verify with `ffprobe`/ImageMagick
`identify` or Playwright); theme stills visibly different (validator Reads
the three PNGs and confirms three distinct themes/schemes).

**Phase-level Validation**: integration only — 2c used 2b's state (theme
stills come from the live instance and show the real dashboard as-is —
that's intended; validator Reads the PNGs to check the three themes/schemes
are distinct and no secrets/tokens are visible).

**Dependencies**: Phase 1 complete; live instance reachable + serving the
current build (halt if not).

---

## Phase 3 — Voice pipeline (clone + generate + timing)
**Type**: Sequential

**Requirements** (procedure + payloads: voice doc; hard rules verbatim above):

- Service preflight (GET only): `/health` OK; `/v1/models` lists
  `ResembleAI/chatterbox-turbo` and `SWivid/F5-TTS`; `/v1/audio/voices` works.
- Reference sample: download a Jon Bailey trailer-voice video via
  `bin/yt-dlp` (source ranking in the voice doc — @EpicVoiceguy first);
  audition offline; extract 15–25 s of continuous solo speech; clean with the
  documented ffmpeg chain to `assets/voice/ref-jon-bailey.wav`
  (mono, 24 kHz, s16, no clipping). Demucs only if music bleed.
- Clone: `POST /api/voices` (`file`, `name=jon_trailer`); verify via
  `GET /v1/audio/voices`.
- A/B gate: generate VO line `01` on `chatterbox-turbo`, then `F5-TTS`
  (serialized, one at a time, wait for each); listen (user checkpoint NOT
  required — pick by spectrogram/waveform sanity + duration; the Phase 6
  user review catches bad timbre); record winner + rationale in
  `assets/voice/model-choice.md`; delete the loser take.
- Write `assets/voice/vo-manifest.json` from the script doc's VO table
  (ids 01–14, `text`, `direction`).
- `scripts/gen-voice.mjs`: reads the manifest; **HTTP layer is a single
  wrapper whose allowlist is exactly `['POST /v1/audio/speech', 'GET
  /v1/audio/voices']`** (exact-string path check before any request — this is
  the structural guarantee the blacklisted endpoints can never be called);
  serialized `for…await` loop; skip existing outputs; `--force <id>` for
  singles; saves `assets/voice/lines/<id>.wav`; asserts 200 + non-empty body.
- Run it; then `scripts/timing.mjs` (or a mode of gen-voice) writes
  `assets/voice/timing.json` via ffprobe for all 14 ids.

**Inputs**: voice doc; script doc VO table.

**Outputs**: `assets/voice/ref-jon-bailey.wav`, `vo-manifest.json`,
`model-choice.md`, `scripts/gen-voice.mjs`, `assets/voice/lines/01..14.wav`,
`timing.json`.

**Validation Criteria**:

- 14 WAVs exist, each 0.5–12 s, non-silent (`ffmpeg -af astats` / volumedetect
  mean_volume > −60 dB), 24 kHz mono.
- Validator READS `gen-voice.mjs` line-by-line: allowlist enforced before
  fetch, single-flight serialization, no `chat/completions` string anywhere
  in the trailer project (`grep -R "chat/completions"` returns nothing).
- `timing.json` has 14 numeric entries matching per-file ffprobe output.
- `grep` the whole trailer project for any other `fetch`/`http` usage against
  `192.168.1.41` — must all resolve to the allowlisted wrapper.

**Dependencies**: Phase 1 complete (project + yt-dlp binary). Independent of
Phase 2 in substance, but sequenced after it to keep one service-touching
phase.

---

## Phase 4 — App footage capture
**Type**: Sequential

**Requirements**:

- `scripts/capture.mjs` (Playwright chromium, `viewport 1920×1080`,
  `deviceScaleFactor: 1`, `recordVideo: { size: 1920×1080 }`, popups allowed):
  a shot registry implementing CAP-1..CAP-7 exactly per the script doc
  (routes, selectors `[data-widget]`, `button[data-resize-handle]`,
  `button[data-drag-handle]`, `[data-slot="widget-tabs"] [role="tab"]`,
  Actions → Create project wizard, roster click → `/project/<path>`, IDE
  button in `[data-mc-open-actions]` → tab switch). Every shot: wait for
  `[data-widget-board]` + `data-ready` settle before acting; reload before
  each shot (memory-only layout state resets the board); unique scaffold name
  per CAP-4 take; Fetch-only git ops.
- Films the user's REAL dashboard (approved at planning, 2026-09-08):
  capture scripts must not unregister or modify anything; CAP-4 scaffolds
  under the chosen real root with a unique `october-trailer-demo-<n>` name.
  The frame audit additionally eyeballs for accidental secrets (tokens/keys)
  in view — real project names/paths are expected and fine.
- Post-step `scripts/transcode.mjs`: every raw WebM → CFR 30 fps
  `libx264 crf 18 preset slow -an` intermediate in `assets/shots/cfr/`.
- Safety tail: stop IDE server (Settings); the seatbelt backup stays in
  `/tmp/ww-trailer/` until Phase 7.

**Inputs**: script doc capture table; Phase 2 state; Phase 1 project.

**Outputs**: `scripts/capture.mjs`, `scripts/transcode.mjs`,
`assets/shots/raw/*.webm`, `assets/shots/cfr/CAP-{1..7}.mp4`.

**Validation Criteria**:

- 7 CFR clips exist; ffprobe: 1920×1080, 30 fps CFR, durations within the
  script doc's per-shot spec.
- Frame audit: validator extracts start/mid/end PNGs per clip (`ffmpeg -ss`)
  and READS them — CAP-1 shows the widget larger at end than start; CAP-4
  shows the wizard + CLI preview; CAP-7 shows code-server with `?folder=`;
  no secrets/tokens visible (real project names are expected — the user
  opted into filming the real dashboard).
- The only new directory under the scaffold root is
  `october-trailer-demo-<n>` (deleted after capture, roster rescanned).

**Dependencies**: Phases 1–3 complete (3 not strictly needed, but capture
scripts are reviewed against the same allowlist rules; keep order).

---

## Phase 5 — Remotion composition
**Type**: Parallel (5a cinema scenes, 5b app scenes + audio), then phase-wide

### 5a: Cinema scenes
**Requirements**:

- `src/scenes/ColdOpen.tsx` (S01: deterministic seeded starfield, wordmark
  fade-in), `Cards.tsx` (S02/S03 avatar + star-card slide-ins with "hello"
  nudge; S03b slump on gag beat), `ThemesTriangle.tsx` (S04: flash, explosion
  scale-out, smoke overlay, three stills fly in → triangle, group rotates one
  full cycle while cards counter-rotate upright, "WITH THEMES" slam),
  `Montage.tsx` (S12 flash-cuts), `EndCard.tsx` (S13: repo name, star button,
  URL; "★ 0" mock if ST-5 absent).
- All animation driven by `useCurrentFrame()` + `interpolate/spring`; zero
  wall-clock timing; seeded randomness (`random(seed)`).

### 5b: App scenes + audio bed
**Requirements**:

- `src/scenes/AppScenes.tsx`: S05–S11 as `<OffthreadVideo>` of the CFR clips
  with comp-side zooms/pans (`scale`/`translate` springs), S06 sped up
  1.5–2× (`playbackRate`), optional cursor dot overlay for drag clarity.
- `src/timing.ts`: loads `assets/voice/timing.json`, computes per-scene
  durations (VO + breathing pad, min beat floors per script doc), exports the
  cumulative frame map used by Root.
- Audio: `<Audio>` per VO line at its scene offset; M1 music bed with the two
  interruptions (hard cut at S03b, slam at S04 — `volume` keyframes); SFX at
  cue points from the script doc.

**Phase-wide requirements** (after both pass):

- `src/Root.tsx`: the single `Trailer` composition sequencing S01→S13 per the
  script table with the computed frame map; total ≈ 85–95 s.
- `pnpm render` produces `out/trailer-raw.mp4` (video + pre-mixed audio bed
  is acceptable here; final loudness pass is Phase 6).

**Outputs**: `src/scenes/*.tsx`, `src/timing.ts`, updated `src/Root.tsx`,
`out/trailer-raw.mp4`.

**Validation Criteria**:

- `pnpm run check-types` clean; `pnpm render` succeeds.
- ffprobe: 1920×1080, 30 fps, duration 85–95 s, has an audio stream.
- Scene-boundary audit: validator extracts a frame at each computed boundary
  and READs them in order — starfield → avatar card → star card → triangle →
  app resize → chaos → tabs → wizard → project tour → git → IDE → montage →
  end card. Order and content must match.
- VO coverage: total VO time from timing.json ≤ total duration − 4 s (room
  for music tail).

**Dependencies**: Phases 2–4 complete.

---

## Phase 6 — Finish + review
**Type**: Sequential

**Requirements**:

- `scripts/finish.mjs` (or documented ffmpeg chain in `scripts/finish.md`
  executed by the implementer): sidechain-duck M1 under the VO mix
  (`sidechaincompress`, threshold 0.03–0.1, release ~300 ms), two-pass EBU
  R128 `loudnorm` (`I=-14:TP=-1.5:LRA=11`, second pass `linear=true` with
  measured values), mux over trailer-raw video, final encode
  `libx264 crf 18 preset slow -pix_fmt yuv420p -movflags +faststart
  -c:a aac -b:a 192k` → `out/trailer-october-2026.mp4`.
- Export `out/thumbnail.png` (frame from S13).
- Automated review: 10 evenly spaced frames extracted and READ by the
  validator (content + no real data leak); loudness verified from the
  loudnorm pass-2 print (≈ −14 LUFS integrated).
- **Planned user checkpoint** (the one and only): present
  `out/trailer-october-2026.mp4` to the user for the funny-check; fix-loop
  any notes (re-render only affected scenes).

**Outputs**: `out/trailer-october-2026.mp4`, `out/thumbnail.png`,
`scripts/finish.md`.

**Validation Criteria**: final file exists; ffprobe H.264/AAC 1080p30,
faststart (moov before mdat), LUFS −14 ±1; validator frame audit PASS; user
sign-off recorded.

**Dependencies**: Phase 5 complete.

---

## Phase 7 — Distill, clean up, hand-off
**Type**: Sequential

**Requirements**:

- Delete the `october-trailer-demo-<n>` scaffold folder(s); trigger one
  Rescan; verify the roster no longer lists them.
- Stop the IDE server if running; delete `/tmp/ww-trailer/` (seatbelt backup
  — after the user confirms the final video is good).
- Update `docs/plans/2026-09-08-update-trailer-procedures.md` (already
  seeded by this planning session) with **final actuals**: real tool
  versions, what differed from plan, per-phase time spent, gotchas hit
  (capture drift, model choice outcome, Remotion render time).
- `out/README.md`: file inventory + ready-to-paste YouTube description block
  (credits: music/SFX per LICENSE.md lines; "voice is an AI parody, not Jon
  Bailey" disclosure line).

**Outputs**: restored store, cleaned `/tmp/ww-trailer/`, updated procedures
doc, `out/README.md`.

**Validation Criteria**: roster shows no `october-trailer-demo-*` entries;
`/tmp/ww-trailer/` deleted; store.json untouched (seatbelt copy was never
needed); procedures doc updated (diff shows new actuals sections); README
complete.

**Dependencies**: Phase 6 complete (user sign-off given).

---

## Success Criteria

- All 7 phases complete and validated; fix loops ≤ 3 per phase.
- `out/trailer-october-2026.mp4`: 1080p30, 85–95 s, −14 LUFS, faststart,
  every scene from the script table present; no secrets in any frame (real
  project data appears by the user's explicit choice).
- Voice: 14/14 lines from the cloned voice via the allowlisted client; zero
  requests to any blacklisted Speaches endpoint (structural guarantee,
  verified by code review + grep).
- Monorepo untouched except the four `docs/plans/2026-09-08-update-trailer-*.md`
  documents; user's dashboard back to its pre-shoot roots (nothing
  unregistered; any demo root removed).
- Reusable pipeline knowledge captured in the procedures doc for a future
  skill.
