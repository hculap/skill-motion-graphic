# The engine: seek(t), springs, layout, routes

## Contents
1. Render contract and why
2. Routes A–D: which pipeline
3. Project anatomy
4. Springs that feel expensive
5. Patterns: scenes, morphs, cursor, type, camera, texture
6. One timeline, every format
7. Images, footage and fonts
8. Gotchas and performance
9. Route B / C / D specifics

## 1. Render contract

The model cannot emit an MP4. Every video is a program; something else turns it into frames.
The trick is determinism: `window.seek(t)` paints the exact frame for any time t, a headless
browser calls it for every (sub)frame, ffmpeg stitches the frames. Nothing depends on a
timer, so renders are identical every run and a fix is a one-line edit plus a re-render.
`render.mjs` verified this: the same film rendered with 1, 4 and 6 parallel workers is
byte-identical.

Breaks determinism (never in render mode): CSS transitions/animations, setTimeout,
setInterval, requestAnimationFrame, Date/performance.now, Math.random, state mutated in one
frame and read in the next (particles integrated step by step, "current position" variables),
`<video>` elements played rather than seeked.

## 2. Routes

| Route | Best for | Strength | Weakness |
|-------|----------|----------|----------|
| **A · Code-drawn** (default) | showreels, UI motion, loops, pixel art, kinetic type | zero dependencies, fully editable, what the model defaults to | characters and photoreal need a lot of spec |
| **B · Framework** | explainers, product videos, series, templates | studio preview, reusable components | Remotion needs a company license above 3 people |
| **C · Mixed** | music videos, character stories | physics and faces from video models | API spend, sync work, less determinism |
| **D · Footage** | talking heads, reels, launch edits | the user's real face and voice | needs raw footage and clean audio |

Use A unless the user names a framework, the film is a reusable template/series (B), it needs
characters with real physics (C, and only with keys and budget), or it is an edit of supplied
footage (D). A model given both options picked A and skipped the frameworks; ask explicitly
if a framework is wanted.

## 3. Project anatomy (created by init_studio.py)

```
index.html        canvas + window.seek(t) + SCENES; reads ?w=&h= for the format
lib/motion.js     spring, track, trackN, indicator, swapAlpha, stagger, rng, hash1, layout,
                  beat()/bar() from beats.json, fitText, roundRect, mixColor
STUDIO.md         house rules every worker reads first
docs/             shotlist.md, review_log.md (+ style_guide.md, ANIMATION_GUIDE.md as needed)
assets/ fonts/    real logos, screenshots, local font files
audio/score.json  synthesized score → out/score.wav
beats.json        beat grid (from synth.mjs --beats or beats.py)
out/              renders, stills, contact sheets
```

The template's "REPLACE ME" scene is a placeholder; delete it.

## 4. Springs

Cheap motion eases from A to B on a fixed curve. Expensive motion has mass: it accelerates,
overshoots a hair, settles. Closed-form springs stay a pure function of time.

| Preset | k / d | Use for |
|--------|-------|---------|
| `SPRING.snappy` | 320 / 30 | buttons, toggles, leading edges |
| `SPRING.base` | 170 / 26 | cards, containers, camera |
| `SPRING.heavy` | 90 / 20 | big type, 3D objects, logo lockups |
| `SPRING.playful` | 220 / 14 | mascots, stickers (visible overshoot) |

Tiny overshoot on UI, none on type. A value with several targets (cursor, container width)
is never "restarted": `track(t, [[t0, v0], [t1, v1], ...])` sums one spring per change, so
motion stays continuous and frame 812 renders without simulating 0–811.

```js
const s = spring(t - 0.2, SPRING.heavy);                     // 0 → 1 starting at 0.2 s
const x = track(t, [[0, 100], [2, 540], [4, 900]], SPRING.base);
const [cx, cy] = trackN(t, [[0, [200, 1400]], [1.8, [540, 980]], [3.6, [760, 1210]]], SPRING.snappy);
const ind = indicator(t, [[0, 120], [1, 420], [2, 720]]);    // stretchy tab underline
g.globalAlpha = swapAlpha(t, 2.0, 4.0);                     // content inside a morph
```

Refactor prompt that worked in one pass: "Replace every easing curve with closed-form
springs from lib/motion.js. Tiny overshoot on UI, none on type. Any value with more than
one target uses track()."

## 5. Patterns

**Scenes on the grid.** `{ from: bar(2), to: bar(4), draw(t) {...} }`. Cuts on downbeats,
state changes on beats. Overlap scenes by a few frames for transitions that carry motion
across the cut (match cuts, whip pans with motion blur from subframes).

**One container, never cut (morph).** Keep one rect whose x/y/w/h/radius/fill are `track()`s
keyed on state times; draw content per state with `swapAlpha` so text enters after the morph
starts and leaves before the next. Blur the swap briefly with `g.filter = 'blur(6px)'` scaled
by the spring velocity (difference of two nearby samples).

**Cursor.** A drawn arrow driven by `trackN` to each target; a click = 0.12 s scale dip
(spring) plus a ring that expands and fades; cue a `click` SFX at the same time.

**Kinetic type.** Measure with `fitText`, split into words/letters, stagger with
`stagger(i, n, 0.3)`, move on `SPRING.heavy`. Big type is a layout element, not a caption:
crop it off-frame, mask it, let it be the transition.

**Camera.** Wrap scene drawing in `g.translate/scale/rotate` driven by one camera `track()`;
parallax by multiplying offsets per layer depth. Keep text crisp: scale the camera, not
pre-rendered bitmaps of text.

**Texture.** Grain = small rects/pixels from `hash1(i, frameIndex)` with frameIndex =
`Math.round(t * 60)`; paper/riso = offset color plates with `globalCompositeOperation =
'multiply'`; dither/pixel = draw to a small offscreen canvas then scale up with
`imageSmoothingEnabled = false`.

**Data.** Charts draw themselves with `spring()` on the path length (`setLineDash` +
`lineDashOffset`), numbers count up with `Math.round(lerp(a, b, s))` in tabular figures.

## 6. One timeline, every format

Write scenes against `L = layout(W, H)` (unit `L.u`, margins, `L.safe`, orientation flags),
never fixed pixels. Reframe type and UI per format; never crop a 16:9 render to vertical.
Render each format separately from the same page:
```
node render.mjs . --format 9:16   # 1080x1920 Reels/TikTok
node render.mjs . --format 1:1    # 1080x1080 X feed
node render.mjs . --format 16:9   # 1920x1080 YouTube/site
```
Check each format's contact sheet; vertical usually needs stacked layouts and bigger type.

## 7. Images, footage and fonts

- Load every image in `window.ready` (`loadImage`) before frame 0; draw with `drawImage`.
- Footage inside a code film: pre-extract frames (`ffmpeg -i clip.mp4 -vf fps=30 assets/clip/%04d.png`)
  and draw frame `Math.floor(t * 30)`; for long clips make `seek(t)` async and load the needed
  frame on demand (render.mjs awaits a returned promise). Never `video.play()`.
- Fonts: local files in `assets/fonts/` + `@font-face`, listed in `FONTS` so `window.ready`
  loads them. A canvas font that is not loaded silently falls back. Free sources: Google
  Fonts (github.com/google/fonts), Fontshare. Installed on this kind of host already: Inter,
  Lato, DejaVu, Liberation, Latin Modern.

## 8. Gotchas and performance

- `will-change` / CSS transforms on scaled DOM text → blurry text. Prefer canvas.
- Fractional `fillText` positions shimmer at small sizes; round positions for small UI text.
- `g.filter = 'blur()'` and shadowBlur are slow at 1080×1920; use sparingly or on offscreen
  canvases at lower resolution.
- Reset state per frame: `draw()` starts with `setTransform(1,0,0,1,0,0)` and alpha 1;
  wrap each scene in `save()/restore()`.
- Render speed on an 8-core ARM server (canvas capture, 4 workers): ~17 ms per subframe, so
  a 15 s film at 60 fps × 4 subframes ≈ 1 min plus encode; heavy scenes are slower.
  Drafts: `--fps 30 --sub 1`. Stills: `--every 0.5` takes seconds.
- Capture mode is auto: `canvas` (in-page encode, parallel) when the page is one full-frame
  canvas, `screen` (viewport screenshot) when DOM/SVG layers exist. Force with `--capture`
  or `window.CAPTURE = 'screen'`.

## 9. Routes B, C, D

**B · Remotion (React).** Series, templates, data-driven. `npx create-video@latest film`,
optional `npx skills add remotion-dev/skills`, preview `npx remotion studio`, render
`npx remotion render Main out/film.mp4`. Use `spring()`/`interpolate()` from Remotion, which
are also pure functions of frame. License: free for individuals and companies up to 3 people.

**B · HyperFrames (HTML + GSAP).** `npx hyperframes init film`, `npx hyperframes preview`,
`npx hyperframes render`. GSAP timelines must be seeked (`tl.seek(t)`), never played.

**C · Generate, then trace.** A video model (e.g. Seedance via fal) renders base shots with
characters and physics; an image model makes character sheets; then code redraws the whole
video on top, so the viewer only sees the code-drawn layer. Video models give motion that is
hard to hand-code; the JS layer gives a consistent, ownable look. Requires API keys and a
budget the user approved; extract base-shot frames and trace them in seek(t) as in section 7.

**D · Footage edit.** Cuts, captions, B-roll and PiP with ffmpeg (`trim`, `concat`,
`overlay`, `subtitles`), or a code layer composited over pre-extracted frames. Captions:
transcribe if a speech-to-text tool is available, then animate words on their timestamps.
