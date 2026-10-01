# Sound: score it to the beat

Sound is where "AI video" starts feeling like a film. Viral pieces synthesized their whole
soundtrack in code and locked every cut to the grid (one biopic: 23 transitions on 120 BPM).
Two paths: if the user supplies a track, measure it; if not, synthesize it on the same
timeline as the picture.

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
