# Motion studio rules — {{TITLE}}

House rules for every agent (and subagent) working in this folder. Read before touching code.
Tools live in the motion-graphic skill: `{{SKILL_DIR}}/scripts/`.

## Render contract
- The film is a pure function of time: `window.seek(t)` paints frame t of `index.html`.
- No CSS transitions/animations, no setTimeout/setInterval, no requestAnimationFrame in render
  mode, no state carried between frames. Seeded noise only (`rng(seed)`, `hash1`), never
  Math.random, never Date.
- All motion uses springs from `lib/motion.js` (`spring`, `track`, `SPRING.*`). No easing curves.
- Layout from `layout(W, H)`, never hard-coded pixels, so 9:16 / 1:1 / 16:9 come from one timeline.
- Fonts, images and data are local files loaded in `window.ready` before frame 0.

## Look
- Banned defaults: centered title on a gradient, everything fading in, corner labels, frame
  borders, glow on UI chrome, generic particle bursts, stock "tech" blue-purple gradients.
- One display face, one UI face. One accent color unless the brief says otherwise.
- Something new happens on screen every 2–4 seconds. Hook in the first 2 seconds.
- Real product UI and assets only. Never invent a product's screens.

## Sound
- Score and SFX are synthesized (`synth.mjs`) unless a track is supplied (`beats.py`).
- Cuts on downbeats, state changes on beats, SFX on hits. Final loudness −14 LUFS.

## Commands
```
node {{SKILL_DIR}}/scripts/render.mjs . --every 0.5          # stills + out/stills/contact.png
node {{SKILL_DIR}}/scripts/render.mjs . --fps 30 --sub 1     # fast draft video
node {{SKILL_DIR}}/scripts/render.mjs . --format 9:16        # final, 60 fps, 4 subframes
node {{SKILL_DIR}}/scripts/synth.mjs audio/score.json out/score.wav --beats beats.json
python3 {{SKILL_DIR}}/scripts/finalize.py out/silent-1080x1920.mp4 out/score.wav
bash {{SKILL_DIR}}/scripts/inspect.sh all out/final-1080x1920.mp4
```

## Loop before showing anyone anything
1. Render one still per beat (or every 0.5 s) and LOOK at the contact sheet.
2. Score 1–10: hook, readability at phone size, motion quality, variety, composition,
   brand accuracy, sound sync. Log in `docs/review_log.md`.
3. Fix the 3 worst problems. Repeat until every score is 8+ (minimum 3 rounds on new films).
4. Only then the full render.
