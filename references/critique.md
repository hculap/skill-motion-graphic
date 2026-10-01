# Critique: watch your own frames

The model reads images, so it can look at what it rendered. That one habit separated the
clips that went viral from the ones posted with "it's a bit mid". The honest viral pieces
were not one-shots: one watercolor short took 163 model calls and ~7 hours; a 1.7M-view
launch piece had visible cleanup rounds. Iteration is the method, not a failure.

## The loop

```
render stills (1 per beat) → contact sheet → score 1–10 on 7 axes → fix worst 3 → repeat
```
until every score is 8+. New films: at least 3 rounds. Stop and report if two consecutive
rounds don't raise the lowest score (say what blocks it) or after ~8 rounds.

Cheap first, expensive last: stills (seconds) → draft video `--fps 30 --sub 1` for motion
checks → full render only after the stills converge.

## Commands

```
node SKILL/scripts/render.mjs . --beats            # one still per beat → out/stills/contact.png
node SKILL/scripts/render.mjs . --every 0.25        # denser, for fast sections
node SKILL/scripts/render.mjs . --stills 4.1,4.15,4.2,4.25 --outdir out/fix   # just the problem moment
bash SKILL/scripts/inspect.sh sheet  out/draft.mp4 2      # contact sheet from a video
bash SKILL/scripts/inspect.sh strip  out/draft.mp4 4.1 12 # 12 consecutive frames: pops, overlaps
bash SKILL/scripts/inspect.sh phone  out/draft.mp4        # 360 px wide: does it read on a phone?
bash SKILL/scripts/inspect.sh seam   out/draft.mp4        # last frames vs first frames (loops)
bash SKILL/scripts/inspect.sh all    out/final-1080x1920.mp4
```
Contact sheets label each tile with its time, so problems get timestamps for free.
Determinism check: render `--stills 5` twice into different `--outdir`s and compare hashes.

## Scoring prompt (use on yourself; be a harsh motion director, not a proud author)

```
Open the contact sheet, the strip and the phone sheet and look at them properly.

Score 1-10: hook in first 2s · readability at phone size · motion quality (springs, no
dead frames) · variety (new thing every 2-4s) · composition · brand accuracy · sound sync.

List the 3 biggest problems with timestamps. Hunt specifically for: text overlapping during
swaps, anything sliding instead of easing, corner labels and frame borders, centered-on-
gradient shots, blurry scaled text, a dead beat with nothing happening, a stutter at the
loop seam, the same composition twice in a row, type touching frame edges, low contrast.

Fix them, re-render only the affected moments, show the new contact sheet and new scores.
```

Axis notes:
- **Hook**: the first 2 s must be the most striking image, not a logo fade-in.
- **Phone readability**: at 360 px wide, every word on screen is readable and on screen long
  enough to read (~0.3 s per word minimum for key text).
- **Motion**: springs with mass; no linear slides; no frames where everything is static
  unless it is a deliberate hold on a beat.
- **Variety**: consecutive shots differ in technique, scale and composition.
- **Composition**: clear focal point, intentional negative space, safe margins respected.
- **Brand accuracy**: real assets, real colors and fonts, product claims match the source.
- **Sound sync**: cuts land on downbeats, UI sounds on the exact frame of the action
  (check with a strip around the cue time).

## review_log.md

Log every round: the scores table row, the 3 problems with timestamps, what changed. It is
the evidence for the final report and the brief for the next session if the work continues.

## Before delivering

- Final render of every requested format, `finalize.py` LUFS ≈ −14.
- `inspect.sh all` on each final: contact sheet, phone sheet, seam (loops), poster.
- Watch for encode problems in the final contact sheet (banding in gradients → lower CRF or
  add grain; flashing → a frame-dependent bug).
- Report honestly: scores of the last round, what you would improve next, and that the film
  took N rounds — no "one-shot" claims.
