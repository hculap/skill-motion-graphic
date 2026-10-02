# Sound: score it to the beat

Sound is where "AI video" starts feeling like a film. Viral pieces synthesized their whole
soundtrack in code and locked every cut to the grid (one biopic: 23 transitions on 120 BPM).
Three paths: if the user supplies a track, measure it; by default, synthesize it on the same
timeline as the picture; with an ElevenLabs key and the user's OK on cost, generate it (Path 3).

One timeline, three lanes: **music** (downbeats carry scene changes), **SFX** (beats carry
UI sounds and whooshes), **picture** (states change on the grid). Onset peaks place hits exactly.

## Path 1: supplied track

```
uv run SKILL/scripts/beats.py audio/track.wav > beats.json      # first run installs librosa (~20 s)
```
Output `{bpm, beats, downbeats, hits, duration}`. Downbeats assume 4/4 from the first beat;
listen-check by rendering a strip at two downbeats, and pass `--offset N` if bar one starts
later. Use the track unchanged; trim the film to it, not the other way round. Royalty-free
or user-owned audio only.

## Path 2: synthesized score (`synth.mjs`)

```
node SKILL/scripts/synth.mjs audio/score.json out/score.wav --beats beats.json
```
Writes 48 kHz stereo WAV and the grid the animation reads (`beats`, `downbeats`, `hits` =
cue times, `kicks`). Deterministic: same JSON, same file.

### score.json

```json
{
  "bpm": 120, "duration": 16, "swing": 0, "room": 0.84, "delay_beats": 0.75,
  "tracks": [
    { "voice": "kick",  "pattern": "X...x...X...x...", "bars": [1, 8], "gain": 0.9 },
    { "voice": "clap",  "pattern": "....X.......X...", "bars": [2, 8], "gain": 0.5, "reverb": 0.2 },
    { "voice": "hat",   "pattern": "..x...x...x.o.x.", "bars": [2, 8], "gain": 0.35, "pan": 0.25 },
    { "voice": "bass",  "notes": [[0, "A1", 0.5], [1.5, "A1", 0.25], [2, "C2", 0.5], [3, "G1", 0.5]],
      "loop": 4, "from": 4, "duck": 0.6, "gain": 0.6 },
    { "voice": "pad",   "notes": [[0, ["A3", "C4", "E4"], 4], [4, ["F3", "A3", "C4"], 4]],
      "loop": 8, "reverb": 0.35, "duck": 0.5, "gain": 0.5 },
    { "voice": "pluck", "notes": [[0, "E5", 0.25], [0.75, "A5", 0.25], [1.5, "C6", 0.25]],
      "loop": 2, "delay": 0.3, "pan": -0.3, "gain": 0.4 }
  ],
  "cues": [
    { "t": 0.0, "type": "impact" },
    { "t": 1.5, "type": "riser", "dur": 0.5 },
    { "t": 2.0, "type": "whoosh", "dur": 0.35 },
    { "t": 4.25, "type": "click" },
    { "t": 6.0, "type": "pop", "note": "C6" }
  ]
}
```

- `pattern`: one char per step (16 per bar by default, `steps` to change); `X` accent, `x`
  hit, `o` ghost, `.` rest; spaces and `|` ignored; repeats over `bars: [start, end)`.
  Optional `note` pitches a patterned voice (e.g. `tick`).
- `notes`: `[beat, note | [chord], lengthBeats, velocity?]`; `loop` repeats every N beats
  between `from` and `to` (beats). Notes: `A1`, `C#4`, `Bb3` or MIDI numbers.
- Per track: `gain`, `pan` (−1..1), `reverb` and `delay` sends (0..1), `duck` (sidechain
  depth against the kick, 0..1).
- Cues are in **seconds** (put them on `beat(n)` times or measured hits): `type`, `gain`,
  `pan`, `dur`, `note`, `reverb`.

Voices: `kick snare clap hat ohat tick` (drums) · `bass sub pluck keys bell pad lead`
(pitched) · `click pop thump whoosh swish riser impact tick` (SFX).

### Writing music that doesn't sound generic

- Arrange in sections that mirror the picture: sparse intro under the hook (impact + sub,
  maybe pluck motif), the beat drops when the product/main idea lands, a breakdown before the
  final payoff, an ending that resolves (or loops back into bar one for loop films).
- One memorable motif (3–5 notes) repeated and varied beats a wall of chords. "No generic
  synth pads": give pads a rhythm or drop them; let plucks/keys carry the melody.
- Choose a key and stay diatonic; minor (A minor, D minor) for tension/tech, major (C, F,
  G) for friendly products. A I–V–vi–IV or i–VI–III–VII loop is fine if the motif is distinct.
- Duck bass and pads against the kick (0.5–0.7) for pump; hats on offbeats for drive.
- SFX are the picture's foley: `click` on every cursor press, `whoosh/swish` on fast moves
  and cuts, `pop` when elements appear, `thump`/`impact` for logo lockups and drops,
  `riser` into the drop (end it exactly on the downbeat).
- Leave headroom; `finalize.py` sets loudness.

## Path 3: ElevenLabs music and SFX (optional, paid)

The skill never needs it: without a key, Path 2 scores the film and nothing else changes. Use
ElevenLabs only when `ELEVENLABS_API_KEY` is set (environment, or `.env` in the project folder)
**and** the user approved the spend for this film. Every generation costs credits and comes out
different, so `eleven.mjs` keeps an existing file unless you pass `--force`, writes the request and
the response metadata to `<out>.request.json`, and shows any paid call first with `--dry-run`.

```
node SKILL/scripts/eleven.mjs check                                   # key valid, tier, credits used (free)
node SKILL/scripts/eleven.mjs music audio/music-plan.json audio/music.mp3 --dry-run
node SKILL/scripts/eleven.mjs music audio/music-plan.json audio/music.mp3
uv run SKILL/scripts/beats.py audio/music.mp3 > beats.json            # measure what came back
```

Music needs the key's `music_generation` permission; without it the API answers 401.

### Music on the shot list's grid (default)

Write `audio/music-plan.json` from the shot list: one chunk per section, `duration_ms` equal to
the section's length on the grid. Each chunk, the last one included, must be 3000–120000 ms.

```json
{"model_id": "music_v2_5", "composition_plan": {"chunks": [
  {"text": "[Hook]\n{instrumental: short impact hit, plucked 4-note motif over a sub pulse, no drums yet}",
   "duration_ms": 4000, "context_adherence": "high",
   "positive_styles": ["minimal electronic", "exactly 120 BPM", "4/4", "C major", "instrumental"],
   "negative_styles": ["vocals", "fade in", "tempo change"]},
  {"text": "[Drop]\n{instrumental: four-on-the-floor kick, claps on 2 and 4, rolling bass, motif repeats}",
   "duration_ms": 8000, "positive_styles": ["driving groove"], "negative_styles": ["vocals", "breakdown"]}
]}}
```

- The first chunk sets the genre. Put the tempo, meter, key and "instrumental" there.
- `music_v2` and `music_v2_5` always enforce chunk durations, so section changes land on your cuts.
  The older `{"composition_plan": {"positive_global_styles", "negative_global_styles", "sections": [...]}}`
  format with `music_v1` is what production use has run on so far. On `music_v1`,
  `"respect_sections_durations": true` (the default) asks for the section lengths, but measure the result.
- Prompt mode is the quick alternative: `{"prompt": "…", "music_length_ms": 24000, "force_instrumental": true}`.
  `eleven.mjs plan "<prompt>" audio/music-plan.json --ms 24000` turns a prompt into a plan you can edit.
- The tempo in the styles is a request, not a promise. Measure the file with `beats.py` and cut
  to the measured downbeats and hits, then check a strip at every section change.
- Don't trust one whole-file tempo number either. In the skill's own test (`music_v2_5`, plan asking
  for exactly 120 BPM, drumless 4 s intro), whole-file tracking reported 160.7 BPM: the intro's motif
  fooled it. The drum section measured 119.7 BPM, and beat tracking on that section alone locked to half
  time. If the plan's tempo matches the drum section, build the grid from the plan's tempo, anchored
  to the first downbeat of that section.

### Music from the finished picture

When the cut is locked, let the model score the film itself:

```
node SKILL/scripts/eleven.mjs video out/silent-1080x1920.mp4 audio/music.mp3 \
  --description "warm minimal electronic, builds to the reveal at 9 s" --tags cinematic,upbeat
```

The upload limit is 200 MB, so send a light draft render (`--fps 30 --sub 1`) if the final is
bigger. Check sync with strips at the key hits, as with any track.

### Sound effects

```
node SKILL/scripts/eleven.mjs sfx audio/sfx.json audio/sfx/     # {"impact": {"text": "…", "duration_seconds": 1.2}, …}
```

Lengths are 0.5–30 s. Write prompts the way a sound designer would: what it is, how it should feel, how
it ends ("short punchy cinematic hit, tight, subtle sub thump, dry"). Place each file at its cue
time when mixing (below), or keep the synthesized SFX from Path 2.

### Mixing generated audio

Mix the music, the SFX files at their cue times (`adelay` in ms on both channels) and any synthesized
cue-only score, then master as usual:

```
ffmpeg -i audio/music.mp3 -i audio/sfx/impact.mp3 -i out/sfx-synth.wav -filter_complex \
  "[1]adelay=7000|7000[hit];[0][hit][2]amix=inputs=3:normalize=0" out/mix.wav
python3 SKILL/scripts/finalize.py out/silent-1080x1920.mp4 out/mix.wav
```

### What production use taught (talking-head reels, music_v1 section plans, Sep–Oct 2026)

- A track can stop before the requested length, or end abruptly. Ask for "a clean final hit and
  short tail" in the last section, check the final second, and regenerate if it cuts off: one reel
  needed a second generation because the first ended 0.5 s into the end card.
- The ending may land short of the film: in one 21.8 s reel the music ended at about 20.3 s and a
  sound effect carried the last 1.4 s. Plan for it rather than stretching the picture.
- Intros can come out much quieter than the groove (about −25 dB in one case). Measure before the
  hook relies on the music.
- Moving the whole track is cheaper than re-cutting: one track shifted 0.8 s put the groove's
  entry on the chart reveal.
- Generated audio falls under the ElevenLabs plan's terms. Before an ad runs, check that the plan
  covers commercial use.

## Voice

A narrator or a talking mascot needs a TTS provider (ElevenLabs, OpenAI, Gemini) with a key
in the environment; if the host has a TTS/audio-generation skill, use it to produce the
voice file. Mix voice ~6 dB above music: lower music `gain` under speech or duck it manually
by splitting the score. Never paste keys into prompts or files that get committed.

## Mix and master

```
python3 SKILL/scripts/finalize.py out/silent-1080x1920.mp4 out/score.wav     # → out/final-1080x1920.mp4
```
Two-pass loudnorm to −14 LUFS integrated, true peak ≤ −1.5 dBFS, audio trimmed/padded to
the picture, AAC 192k, video stream copied. It prints the measured LUFS; check it.
For an external track plus synthesized SFX, synthesize the SFX-only score (cues, no tracks)
and mix: `ffmpeg -i track.wav -i sfx.wav -filter_complex amix=inputs=2:normalize=0 mix.wav`.
