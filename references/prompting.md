# Directing the film: briefs, specs and references

How the creators behind the Opus 5.5 motion trend (Sept 2026) actually got their results.
Use these as the internal plan you write for yourself, and as the questions you ask the user.
"The prompt is 10% of the video. The other 90% is the harness."

## Contents
1. The ladder: pick the level the request is at
2. L1 one-liner (test reel) and variants
3. L2 brand reel
4. Reference: name a look, feed a frame
5. L3 state spec (UI morph, product film)
6. L4 director's brief (long/autonomous films)

## 1. The ladder

| Level | Brief size | Typical run | Use for |
|-------|-----------|-------------|---------|
| L1 one-liner | ~150 chars | 15–50 min | testing the engine, a showreel with no product |
| L2 brand reel | ~350 chars | 30–45 min | launch/product video from a URL |
| L3 state spec | 1.5–3k chars | 1–2 h with fixes | UI-morph loops, product films with real data |
| L4 director brief | 9.5–19k chars | 6–12 h autonomous | music videos, story films, minutes long |

Prompt size and run time rise together. When the user gives an L1 sentence for an L2+ job
("make a launch video for my app"), you write the missing L2/L3 structure yourself and,
for a product film, show it before animating.

## 2. L1 one-liner

```
make a dynamic 15-second motion graphics video that shows what an incredible motion
designer you are, like it's your showreel for a résumé. go all out.
```

Why it works: "showreel" is a genre with known rules (fast cuts, a new technique every shot,
best work first); the subject is the designer, so it shows techniques and has no facts to get
wrong; 15 s fits 6–8 shots and finishes in one pass; "go all out" pushes effort.

Weakness: "brief contagion". Hundreds of identical prompts produced reels that rhyme with
each other. A one-liner tests the engine; it never tests an idea, because it contains none.
Variants that shipped:

```
# Longer, with a sound bar
make a dynamic 16:9, 60-second motion graphics showreel that shows your real creative limits.
S-tier sound design, no generic synth pads. Compose an original piano score and sync every
cut to it. Export 1080p MP4.

# Anti-slop guardrail
make a dynamic 10-second motion graphics video that introduces who you are.
Avoid frames and text in the corners, the usual giveaways of AI-made video.

# Story instead of techniques
use your showreel energy, but tell a story: the history of [TOPIC] from [START] to today,
surprise me with the storyboard. 45 seconds, vertical 9:16.

# Agency persona
make a 30-second showreel as if you were a niche branding studio for startup founders.
Create every graphic from scratch. One accent color. Every shot is a different technique.
```

When you get a bare one-liner, still pick a named look (section 4) and a shot list on a
beat grid before coding. Six to eight shots, each a different technique: kinetic type,
grid stagger, morphing container, camera push through layers, data drawing itself,
cut-out collage, pixel/dither, line drawing, 3D-ish parallax, split-screen.

## 3. L2 brand reel

Three extra lines turned the one-liner into a $1,000-agency replacement: the product URL,
"use actual product screenshots, logo, assets", and "must have music".

```
Make a dynamic 20-second motion graphics video for [PRODUCT] ([URL]), with the energy
of a motion designer's showreel. Go all out.

Assets
- Visit the site. Use real screenshots (Playwright), the real logo, real colors and fonts.
  Save everything to ./assets and list what you found before you animate.
- Never redraw the product UI from imagination. Crop and animate the real thing.

Story (one beat each, 2 to 4 seconds)
1. Hook: the problem in 5 words of huge kinetic type.
2. The product appears, the UI assembles itself piece by piece.
3. Three features, each as a UI moment with a cursor doing a real action.
4. One number that proves it works: [METRIC].
5. Logo lockup + [CTA].

Sound
- Original music, 120 BPM, synthesized in code. UI clicks and whooshes on the beat.

Format: 1080x1920 (9:16) first, then 1:1 and 16:9 from the same timeline.
Before the full render, show me a contact sheet of one frame per beat.
```

Asset gathering with the shared runtime (screenshots at 2× for crisp crops):
```
node -e "const {chromium}=require('$HOME/.cache/motion-graphic/node_modules/playwright');(async()=>{
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
await p.goto(process.argv[1],{waitUntil:'networkidle'});await p.screenshot({path:'assets/home.png',fullPage:true});
await b.close()})()" https://example.com
```
Also pull the logo (SVG if the site has one), the brand colors (computed styles of buttons,
links, headings) and the font family names; download free fonts into `assets/fonts/`.

Keep one session per brand: the second video for the same product is faster because the
assets, renderer and sound already exist. Voice or a talking mascot needs a TTS key
(e.g. ELEVENLABS_API_KEY) read from the environment or `.env`, never pasted into a prompt.

## 4. Reference: name a look, feed a frame

Without a reference the model falls back to its default: centered text, gradient
background, everything fading in. Naming a style beats describing one, and a reference
frame or video gives pacing, type and transitions to copy.

- **A frame**: one still of a video the user loves. Take palette, type, grain; not the subject.
- **A video**: extract frames and describe pacing shot by shot before writing code.
- **A library**: a folder of the user's images or past work; write a style guide from it first.
  Their own library is a reference nobody else can copy.
- Sources when the user has none: whatships.com (launch videos), Dribbble motion,
  competitors' launch films. Or name a look: Swiss/International grid, Bauhaus primaries,
  risograph print, Teenage Engineering manual, PC-98 pixel art, Saul Bass cut-paper,
  brutalist mono, Apple keynote product shots, 1970s NASA graphics standards manual.

```
Reference: ./refs/launch.mp4 (and ./refs/frames/*.png)
1. Extract one frame every 0.5s with ffmpeg. Study them.
2. Write ./docs/style_guide.md: palette (hex), type (family, weight, tracking),
   shot lengths, transition types, camera moves, texture/grain, how text enters and exits.
3. Write ./docs/shotlist.md for a [DURATION]s video about [SUBJECT] in THAT style.
   Take the grammar of the reference, never its content, logos or characters.
4. Show both files. Wait for OK before any code.
```
`ffmpeg -i refs/launch.mp4 -vf fps=2 refs/frames/%04d.png`

When given a reference, specify the look and constraints, not the library; let the
technique follow from the look (one creator suggested p5.js and the model wrote its own
paper renderer instead, which looked better). Rejecting a direction means rewriting the
shot list, not patching code.

## 5. L3 state spec

The most-bookmarked prompt of the trend (907K views, 19K bookmarks) was an XML spec, not a
one-liner. Concept: **one shape, never cut**. A single element morphs size, radius and fill
from state to state (button → loader → check → player → chart → ⌘K palette), a cursor drives
each change with real clicks, and the last frame equals the first so it loops.
Beat grid example at 120 BPM: a state on every downbeat (every 2 s) — logo 0s, CTA 2s,
email 4s, loader 6s, check 8s, card 10s, chart 12s, ⌘K 14s, logo 16s.

```
<inputs>
Ask me for: my product + URL, 8 to 12 UI states that tell its story, the real data shown in
each state, brand colors + fonts + one accent, a royalty-free track near 120 BPM, formats.
</inputs>

<direction>
Product-film UI motion. One container never cuts: every state is the same element changing
size, radius and fill while its content swaps behind a short blur. A cursor drives every change.
Warm neutral canvas, one accent. Springs with at most a tiny overshoot.
Banned: bouncy easing, glows, gradients on UI chrome, particle bursts, dead time.
</direction>

<structure>
120 BPM, 8 bars, something happens on every beat.
logo → CTA button → email field (typed) → loader → success check → dashboard card
→ chart draws itself → tooltip on hover → ⌘K palette → toast → logo.
</structure>

<build>
1. One HTML file, one canvas, window.seek(t). No CSS transitions, no timers, no carried state.
2. Closed-form springs. A value with many targets = sum of one spring per change.
3. Text inside a morphing container enters after the morph starts, leaves before the next one.
4. Tab indicators: leading and trailing edges on different springs so they stretch.
5. Beat grid from the track. Start on a downbeat. UI sounds on measured peaks.
6. Render at 60 fps, 4 subframes per frame, blended for motion blur.
</build>

<gotchas>
Never use will-change on anything the camera scales (blurry text).
The last frame must equal the first, cursor position and velocity included.
</gotchas>

<start>
Ask for the inputs, then show the state list on the beat grid before writing code.
</start>
```
A fake UI is a film set where every element has a known state; the same idea scales to a
story (an editor app editing itself, a desktop where windows act out a plot).

## 6. L4 director's brief

The overnight films (a 142 s music video from a 5-minute dictation and ~9,500 characters;
a robot short from 19,000) share one skeleton: they don't describe a video, they hire a crew.

```
You are the director, animator, sound designer and render engineer for a [DURATION] film
made in code. Treat this as a multi-session production. Don't rush to a final render.

## The film in one line
[LOGLINE. What the viewer should feel at the end.]

## References and inputs
- ./refs/ : [video / frames / image library]. Take the grammar, never the content.
- ./audio/track.wav : use it unchanged. Measure beats first.
- APIs in env: [ELEVENLABS_API_KEY, FAL_KEY, GEMINI_API_KEY]. Budget: [$X]. Be economical.

## Look
[3-5 lines: palette, type, texture, camera language. Banned looks.]

## Character bible (if any)
Proportions, palette sampled from a sheet, expressions, an identity lock that survives
every style change.

## Beat sheet
0:00-0:02  hook: [the single most striking image]
0:02-0:10  [act 1]
...        a new visual payoff every 3-5 seconds
[END]      the last frame sets up the first frame (loop)

## Text on screen
When lyrics/captions go huge, when they sit like subtitles. Composition leaves room for them.

## Workflow, with gates
1. docs/style_guide.md and docs/shotlist.md (every shot: frames, camera, text, SFX).
   Show the shot list. Continue without waiting if no answer in 10 minutes.
2. Stills for every shot. Contact sheet. Critique.
3. Animatic at 960x540 with placeholder audio. Fix pacing before polish.
4. Full animation, polish pass, sound pass, final render.
5. Split work per chapter. Write docs/ANIMATION_GUIDE.md first so every
   worker codes in the same style; STORYBOARD.md after the first pass.

## Critique loop (every shot, at least 3 rounds)
Render 3-5 stills, score 1-10 on: hook, readability at 360px wide, motion, composition,
depth, sound sync, polish. Log scores + 3 biggest problems in docs/review_log.md. Fix.
Repeat until all are 8+.

## Deliverables
out/final.mp4 · out/loop_check.mp4 · out/poster.png · out/contact.png · README.md
```

Chapter split that worked (PDoom, 1.1K stars): the director session writes
`ANIMATION_GUIDE.md` + `STORYBOARD.md`, parallel workers each own `src/ch/chNN.js`
exporting `draw(t)` for their time range, and `timeline.js` stitches them into one seek(t).
