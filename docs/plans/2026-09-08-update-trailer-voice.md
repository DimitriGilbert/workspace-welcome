# Update trailer — voice generation procedure (Speaches)

Voice pipeline for the October-2026 update trailer. The TTS service is
**Speaches** at `http://192.168.1.41:18800/` (self-hosted, FastAPI,
OpenAI-compatible `/v1` API, no auth on LAN). It already carries custom cloned
voices (`didi_0`, `frommic`, `mictest`, `smokey`), confirming the clone-then-
speak workflow works on this box.

Target voice: a clone of **Jon Bailey** — the "Epic Voice Guy" narrator of
Honest Trailers (see `2026-09-08-update-trailer-script.md` for the line
manifest).

---

## 🚨 Hard rules — read before ANY request to the service

1. **NEVER call `POST /v1/chat/completions`.** That is the heavy general-purpose
   LLM endpoint. It is permanently blacklisted for this project. This is a
   shared box — do not hog its CPU.
2. **Blacklisted unless the user explicitly re-authorizes** (all heavyweight,
   none needed for narration): `POST /v1/audio/transcriptions`,
   `POST /v1/audio/translations`, `POST /v1/audio/diarization`,
   `POST /v1/audio/speech/embedding`, `WS /v1/realtime`.
3. **Speech generation uses ONLY the custom-voice path**: `POST /v1/audio/speech`
   (or the UI proxy `POST /api/speak`) with a **cloned voice id**. Never a
   stock-LLM or chat path.
4. **Serialize generation**: one synthesis request at a time, wait for the
   response before the next (single GPU/CPU box shared with other uses).
5. GET endpoints are always safe and free: `/health`, `/v1/models`,
   `/v1/audio/voices` (use these to verify state, never to generate).
6. During **planning** (this repo, before execution starts): zero POSTs at all.
   Everything above runs only in the execution phases of the trailer plan.

Implementers of the voice phase must embed rules 1–4 in the generation script
itself (an allowlist of exact paths the client may call — see below), not just
in docs.

---

## Endpoints used

| Purpose | Method + path | Body |
|---|---|---|
| List voices (verify clone landed) | `GET /v1/audio/voices` | — |
| List models (verify clone-capable model up) | `GET /v1/models` | — |
| **Clone a voice** (one-time) | `POST /api/voices` | multipart FormData: `file` (audio sample, `audio/*`), `name` (voice id) |
| **Synthesize a line** | `POST /v1/audio/speech` | JSON: `model`, `input` (text), `voice` (cloned id), `response_format`, `speed`, optional `sample_rate` |
| Synthesize (UI proxy, same semantics) | `POST /api/speak` | JSON: `{input, model, voice, response_format, speed}` |

Cloning-capable models on this box (from `/v1/models`):
`Qwen/Qwen3-TTS-12Hz-0.6B-Base`, `Qwen/Qwen3-TTS-12Hz-1.7B-Base`,
`ResembleAI/chatterbox`, `ResembleAI/chatterbox-turbo`, `SWivid/F5-TTS`.
Fixed-voice models (no cloning): Kokoro (54 built-ins), Piper (`lessac`).

Output formats: `mp3` (default), `wav`, `flac`, `opus`, `aac`, `pcm`. Native
sample rate for the cloning models is 24 kHz; request `wav` + `sample_rate:
24000` for clean intermediate files.

---

## Step 1 — Reference sample (acquire + clean)

Ranked sources (best first) for clean Jon Bailey narration:

1. **@EpicVoiceguy (his own channel)** — "Trailer Voice" review videos: solo,
   in-character trailer-voice reads. Long dry narration segments.
2. **VO BOSS podcast — "Epic Voiceover with Jon Bailey"** — no music bed,
   studio quality, one host; conversational timbre (not trailer delivery).
3. **Honest Trailers Commentaries** (Screen Junkies) — raw VO passes get
   played, but 3–4 competing speakers; last resort.
4. **"JON BAILEY: EPIC VOICE ACTOR REEL" playlist** — genuine trailer reads
   but demo reels carry music beds → needs Demucs separation.

Procedure:

```bash
# acquire (run inside the trailer project dir)
yt-dlp -x -f bestaudio --audio-format wav "<video-url>"

# extract + clean a 10–30 s continuous solo-speech stretch (audition -ss/-t by ear first)
ffmpeg -i in.wav -ss 00:01:23 -t 20 \
  -af "highpass=f=80,lowpass=f=7500,afftdn=nf=-25,silenceremove=stop_periods=-1:stop_duration=0.3:stop_threshold=-45dB" \
  -ar 24000 -ac 1 -c:a pcm_s16le assets/voice/ref-jon-bailey.wav
```

Target spec (cross-stack consensus for cloning references): **10–30 s, single
speaker, no music/noise, WAV 16-bit PCM mono 24 kHz**. Only if there is music
bleed, separate first (`demucs -n htdemucs_ft`, keep the `vocals` stem) —
prefer natively dry sources over Demucs; separation artifacts hurt cloning.

## Step 2 — Clone (one-time per session)

```bash
curl -s -X POST http://192.168.1.41:18800/api/voices \
  -F "file=@assets/voice/ref-jon-bailey.wav" \
  -F "name=jon_trailer"

# verify it landed:
curl -s http://192.168.1.41:18800/v1/audio/voices | grep jon_trailer
```

Voice id used for the rest of the project: **`jon_trailer`**.

## Step 3 — Model pick (A/B gate on ONE line, then lock)

Synthesis quality per cloned voice differs per model. Gate: generate VO line
`01` (see script manifest) on `ResembleAI/chatterbox-turbo`, then
`SWivid/F5-TTS`, serialized. Listen to both (or check waveform/spectrogram
sanity + duration reasonableness), pick the winner, record the choice in
`assets/voice/model-choice.md`. Default ladder if undecided:
`chatterbox-turbo` (lightest) → `F5-TTS` (usually best zero-shot fidelity) →
`Qwen/Qwen3-TTS-12Hz-0.6B-Base` (lighter than the 1.7B; never reach for 1.7B
first). Regenerate the whole manifest with the winning model only.

## Step 4 — Generate the manifest (serialized, scripted)

The line manifest lives in `assets/voice/vo-manifest.json` (created by the
script phase; ids `01`–`14`). Generation is a script in the trailer project
(`scripts/gen-voice.mjs`), never ad-hoc curls, so every request is:

- **allowlisted**: the script's HTTP layer may only call
  `POST /v1/audio/speech` (exact string match on path — enforce in code);
- **serialized**: `for` loop with `await`, one line at a time;
- **idempotent**: skips ids whose `assets/voice/lines/<id>.wav` already exists
  and passes `--force` to regenerate one;
- **verified**: after each response, assert HTTP 200 + non-empty body, write to
  `assets/voice/lines/<id>.wav`.

Per-line payload:

```json
{
  "model": "ResembleAI/chatterbox-turbo",
  "input": "This October.",
  "voice": "jon_trailer",
  "response_format": "wav",
  "sample_rate": 24000,
  "speed": 1.0
}
```

(Direction per line — pace, deadpan vs bombast — comes from the manifest's
`direction` field; `speed` is the only knob the API exposes, so casting notes
mostly guide retries.)

## Step 5 — Durations (drives the edit)

```bash
for f in assets/voice/lines/*.wav; do
  printf "%s %s\n" "$(basename "$f")" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")"
done
```

Emit `assets/voice/timing.json` (`{ "01": 1.82, ... }`) — the composition
phase reads this to set scene durations and music cues.

---

## Fallbacks (in order)

1. Different cloning model (Step 3 ladder) — cheap, try first.
2. Different/cleaner reference segment (Step 1, another 15 s window).
3. Built-in deep "narrator"-style preset (from `/v1/audio/voices` fixed
   voices) — loses the joke but ships the video.
4. Ask the user — they have cloning experience on this box (`didi_0`,
   `smokey` exist).

## Provenance note

Jon Bailey's voice is cloned here for one private, non-commercial parody
trailer of the user's own project, in the spirit of the Honest Trailers
format. Do not redistribute the reference sample or the cloned voice id
outside this project, and do not publish the clone as a reusable TTS voice.
