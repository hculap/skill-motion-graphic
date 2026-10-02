---
name: "motion-graphic"
description: "Make motion-graphics videos rendered from code (showreels, product or launch reels, UI-morph loops, kinetic type, animated explainers, music or story films) as MP4, using a deterministic seek(t) canvas engine, spring motion, synthesized sound and a frame-critique loop. Use when the user asks for a motion graphic, animated video, promo or launch film, reel/rolka or animacja, even without naming the technique."
metadata: {"clawdbot": {"emoji": "🎬", "requires": {"bins": ["node", "npm", "ffmpeg", "ffprobe"]}}}
---

# Motion graphic

Make videos the way the code-rendered motion trend did: you write a program, a headless
browser renders it frame by frame, ffmpeg encodes it. The prompt is 10% of the film. The other
90% is the harness: a deterministic render engine, a reference, a beat grid, and looking at
your own frames until they are good. Skip the harness and you get the default every model
produces: centered text on a gradient, everything fading in, a logo at the end.

`SKILL` below means the directory containing this SKILL.md. Resolve every script path from it.

## 1. Read the request

The level decides how much you plan and whether you pause for approval:

- **L1 one-liner**: a showreel, "go all out", no product. Plan it yourself and go, no questions.
- **L2 brand reel**: a product or URL is named. Gather real assets, show the shot list,
  then wait for OK unless the user said to just do it.
- **L3 state spec**: UI morph or a product film with real data. Ask for the missing inputs and
  show the state list on the beat grid before writing code.
- **L4 director brief**: a long film, music video or story. Treat it as a production with
  gates, and split the work into chapters.

Pick a route ([engine.md](references/engine.md) §2):

- **A, code-drawn canvas**: the default.
- **B, Remotion/HyperFrames**: only when asked for, or for a reusable series.
- **C, video/image models**: only with keys and a budget the user approved.
- **D, footage edit**: when the user supplies footage.

Brief and spec templates live in [prompting.md](references/prompting.md).

Ask only for things that change the film: product + URL, duration, formats, brand assets,
a reference, music (a file, synthesized, or ElevenLabs), and the language of on-screen text. Otherwise use
these defaults:

- 15 s, 9:16 at 1080×1920, 60 fps
- a synthesized 120 BPM score. Generate it with ElevenLabs only when `ELEVENLABS_API_KEY` is set and
  the user approved the cost ([sound.md](references/sound.md) Path 3). Without a key nothing changes.
- a named look you choose and commit to
- on-screen text in the user's language

For flagship pieces, tell the user that higher reasoning effort pays off. The viral one-shots
ran at the highest settings.

## 2. Set up

```
bash SKILL/scripts/setup.sh          # once per machine, idempotent: Playwright + Chromium in ~/.cache/motion-graphic
python3 SKILL/scripts/init_studio.py PROJECT --format 9:16 --dur 15 --title "Launch film"
```

Put PROJECT inside the current project or repo (`./motion/<slug>/`) when there is one.
Otherwise use a work or scratch directory, never the home root. `init_studio.py` never
overwrites files. Read the generated `STUDIO.md`: it holds the house rules every worker
follows (render contract, banned looks, the critique loop).

## 3. Pre-production, before any animation code

1. **Real assets.** `node SKILL/scripts/grab_site.mjs URL PROJECT/assets/site` saves
   screenshots, logo, OG image, computed brand colors, font families and headlines into
   `site.json`. Download the brand fonts into `assets/fonts/`. Never redraw a product's UI
   from imagination.
2. **Look.** With a reference (a frame, a video or an image folder), write
   `docs/style_guide.md`: palette hex, type, shot lengths, transitions, camera, texture. Take
   the grammar, never the content. Without one, name a look and commit to it
   (prompting.md §4). Naming a style beats describing one.
3. **Grid.** For a supplied track, run `uv run SKILL/scripts/beats.py track.wav > beats.json`.
   Otherwise write `audio/score.json` and run
   `node SKILL/scripts/synth.mjs audio/score.json out/score.wav --beats beats.json` now, so the
   picture is cut to the grid from the start ([sound.md](references/sound.md)).
   With ElevenLabs (key set and cost approved), sketch the section lengths first. Then generate
   the track from a plan with those lengths (`node SKILL/scripts/eleven.mjs music …`), measure it
   with `beats.py`, and finish the shot list on the measured grid.
4. **`docs/shotlist.md` on the grid.**
   - A hook in the first 2 s.
   - Something new every 2–4 s.
   - Cuts on downbeats and state changes on beats.
   - Consecutive shots use different techniques.
   - The ending resolves, or loops into frame 0.

**Gate (L2–L4):** show the shot list and style guide, then wait for OK unless told to run
autonomously. A rejection means rewriting the shot list, not patching code.

## 4. Build

Write `index.html` scenes against `layout(W, H)` with springs from `lib/motion.js`. Patterns
for morphing containers, cursors, kinetic type, camera, texture and data are in engine.md
§4–7. The render contract:

- `window.seek(t)` is a pure function of t.
- No CSS transitions, timers, requestAnimationFrame, Date or Math.random in render mode.
  Use seeded `rng`/`hash1`.
- Every asset and font is a local file, loaded in `window.ready`.
- Springs replace easing curves. A value with several targets uses `track()`.

For a long film, write `docs/ANIMATION_GUIDE.md` first. Then, if your harness has subagents
or parallel workers, give each one a chapter (`src/ch/chNN.js`, one time range) and stitch
them in `index.html`.

## 5. Critique loop: this is what makes it good

```
node SKILL/scripts/render.mjs PROJECT --beats       # one still per beat → out/stills/contact.png (or --every 0.5)
```

Open the contact sheet image and actually look at it. Each tile is labelled with its time.
Then:

1. Score 1–10 on hook, phone readability, motion, variety, composition, brand accuracy and
   sound sync.
2. Log the round in `docs/review_log.md`.
3. Fix the 3 worst problems.
4. Repeat until every score is 8+, with at least 3 rounds for a new film.

Check motion with a draft (`--fps 30 --sub 1`) plus `inspect.sh strip`. The hunt list, the
commands and the stop rules are in [critique.md](references/critique.md).

## 6. Render, mix, deliver

```
node SKILL/scripts/render.mjs PROJECT --format 9:16                      # 60 fps, 4 blended subframes
python3 SKILL/scripts/finalize.py PROJECT/out/silent-1080x1920.mp4 PROJECT/out/score.wav   # −14 LUFS
bash SKILL/scripts/inspect.sh all PROJECT/out/final-1080x1920.mp4         # sheet, phone, seam, loop, poster, loudness
```

Repeat for each requested format (`--format 1:1`, `16:9`). Reframe each one; don't crop.

**Deliver:**

- the final MP4s, `contact.png` and `poster.png`
- the last round's scores
- what you would improve next
- the honest number of rounds (no "one prompt" claims)

In Orbit, if the `artifacts` skill is available to you, register the film with
`artifacts_cli.py create --type video --title "…" FINAL.mp4 --thumb poster.png`. The file is
copied into the gallery. Otherwise give the file paths.

## Hard rules

- Real product UI, assets and claims only.
- Banned: corner labels, frame borders, a centered title on a gradient, everything fading in,
  generic particle bursts, glow on UI chrome.
- API keys come from the environment or `.env` and never go into prompts or committed files.
  Paid generation needs the user's OK on budget.
- Licensed music and fonts only: the user's own, royalty-free, synthesized, or generated under the
  user's ElevenLabs plan (check that the plan covers commercial use before an ad runs).

Attribution and repos: [sources.md](references/sources.md).
