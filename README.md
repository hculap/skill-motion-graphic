# motion-graphic

**An agent skill that turns a coding agent into a motion-graphics studio: the agent writes the film as code, a headless browser renders it frame by frame, ffmpeg encodes the MP4.**

Showreels, product and launch reels, UI-morph loops, kinetic type, animated explainers, music and story films. The skill is written in the [Agent Skills](https://code.claude.com/docs/en/skills) format (`SKILL.md` plus references and scripts). It was built for Claude Code; any agent that can read a skill and run shell commands can use it.

> The prompt is 10% of the film. The other 90% is the harness: a deterministic render engine, a reference, a beat grid, and looking at your own frames until they are good.

Without a harness, a model gives you its default video: centered text on a gradient, everything fading in, a logo at the end. This skill supplies the missing harness:

- **A deterministic engine.** `window.seek(t)` paints frame *t* as a pure function of time. Headless Chromium calls it for every subframe, and ffmpeg blends the subframes into motion blur. The same film always renders the same bytes, so a fix is a one-line edit plus a re-render.
- **Motion with mass.** Closed-form springs (`spring`, `track`, `trackN`, `indicator`) replace easing curves. A value with several targets never restarts.
- **Sound on the same timeline.** A dependency-free synthesizer writes the score and SFX to a beat grid. Cuts land on downbeats and UI sounds on the frame of the action. `finalize.py` masters to −14 LUFS.
- **ElevenLabs, if you have it.** With an `ELEVENLABS_API_KEY`, the agent can generate music from a section plan that matches the shot list, score a finished cut with video-to-music, and generate sound effects. All of it is optional and paid: without a key the skill uses its own synthesizer and nothing changes.
- **A critique loop.** The agent renders contact sheets, phone-width sheets and frame strips, then looks at them and scores the film on 7 axes. It fixes the 3 worst problems and repeats until every score is 8 or higher.

## Install

**As a Claude Code plugin** (recommended). In your shell:

```bash
claude plugin marketplace add hculap/skill-motion-graphic
claude plugin install motion-graphic@motion-graphic
```

Or both in one step inside a session: `/plugin install motion-graphic --marketplace hculap/skill-motion-graphic` (Claude Code v2.1.275 or later). The skill then appears as `motion-graphic:motion-graphic`. It adds about 110 tokens to every session (its name and description); the full skill, about 1.8k tokens, loads only when it runs.

To update, run `claude plugin update motion-graphic@motion-graphic`, or turn on auto-update for the marketplace under **Marketplaces** in `/plugin`.

**As a plain skill.** Clone it into a skills directory:

```bash
git clone https://github.com/hculap/skill-motion-graphic ~/.claude/skills/motion-graphic
```

Clone into `.claude/skills/motion-graphic` inside a repository instead to scope it to that repository. It loads as `motion-graphic`, without the plugin prefix, and `git pull` updates it.

Then ask for a video: *"make a 15-second launch reel for https://example.com"*, *"animated explainer of this paper, 1:1 for X"*, *"rolka 9:16 o naszym nowym API"*. The skill triggers on requests for motion graphics, animated videos, promo or launch films, reels, *rolka* or *animacja*. On first use, the agent installs the render runtime (`scripts/setup.sh`, once per machine).

### Requirements

| | |
|---|---|
| Node.js 18+ with npm | renderer, synthesizer, site grabber |
| ffmpeg + ffprobe | encoding, mixing, inspection |
| Python 3 | `init_studio.py`, `finalize.py` (standard library only) |
| [uv](https://docs.astral.sh/uv/) | only for `beats.py` (measuring a supplied or generated music track) |
| `ELEVENLABS_API_KEY` (optional) | generated music and SFX through `eleven.mjs`; paid, used only after the user approves the cost. Music needs the key's `music_generation` permission |

`setup.sh` is idempotent. It installs Playwright and headless Chromium once into a shared cache at `~/.cache/motion-graphic`, which you can move with `MOTION_RUNTIME`. Film projects never get their own `node_modules`. On a bare Debian or Ubuntu box, Chromium may also need its system libraries: `sudo npx --prefix ~/.cache/motion-graphic playwright install-deps chromium`.

## How a film gets made

The agent follows `SKILL.md`. In short:

1. **Read the request.** The level of the brief decides how much planning and approval happens, from L1 (a one-liner) to L4 (a director's brief for a long film). The route is code-drawn canvas by default; Remotion/HyperFrames, video models and footage edits are the alternatives.
2. **Set up a studio.** `init_studio.py` scaffolds `index.html` (the `seek(t)` skeleton), `lib/motion.js`, house rules in `STUDIO.md`, and `docs/` for the shot list and review log.
3. **Pre-production before any animation code.** Gather real assets (`grab_site.mjs` saves screenshots, logo, colors and fonts from a URL), name a look, put the shot list on a beat grid, and synthesize the score first.
4. **Build** the scenes against `layout(W, H)` with springs, so one timeline renders every format.
5. **Critique.** Render stills, look at them, score them, fix, repeat. Use at least 3 rounds for a new film.
6. **Render, mix, deliver** every requested format, each reframed rather than cropped.

```bash
SKILL=~/.claude/skills/motion-graphic   # the skill's folder; Claude Code shows it as "Base directory for this skill" when the skill loads
python3 $SKILL/scripts/init_studio.py motion/launch --format 9:16 --dur 15 --title "Launch film"
cd motion/launch
# write audio/score.json first (format in references/sound.md), then:
node $SKILL/scripts/synth.mjs audio/score.json out/score.wav --beats beats.json        # score + beat grid
node $SKILL/scripts/render.mjs . --format 9:16 --beats                                 # one still per beat → out/stills/contact.png
node $SKILL/scripts/render.mjs . --format 9:16 --fps 30 --sub 1                        # quick draft video
node $SKILL/scripts/render.mjs . --format 9:16                                         # final: 60 fps, 4 blended subframes
python3 $SKILL/scripts/finalize.py out/silent-1080x1920.mp4 out/score.wav              # mux + master to −14 LUFS
bash $SKILL/scripts/inspect.sh all out/final-1080x1920.mp4                             # contact sheet, phone sheet, seam, poster, loudness
```

Always pass `--format` (`9:16`, `1:1`, `16:9`, `4:5`) or `--w`/`--h` to `render.mjs`, for stills as well as video.

## What's inside

```
.claude-plugin/           plugin.json (the plugin) and marketplace.json (the catalog that lists it)
SKILL.md                 entry point: when to use, the 6-step method, hard rules
references/
  engine.md              render contract, routes A–D, springs, patterns, formats, performance
  prompting.md           brief ladder L1–L4, named looks, state specs, director briefs
  critique.md            the critique loop, scoring prompt, inspection commands
  sound.md               score.json format, voices, cues, ElevenLabs path, mixing to −14 LUFS
  sources.md             where the method and the quoted figures come from
scripts/
  setup.sh               shared Playwright + Chromium runtime (idempotent)
  init_studio.py         scaffold a film project from assets/template (never overwrites)
  render.mjs             deterministic renderer: video, stills, labelled contact sheets
  synth.mjs              score + SFX synthesizer, writes the beat grid
  eleven.mjs             optional ElevenLabs music, video-to-music and SFX (paid; --dry-run, never overwrites without --force)
  beats.py               beat grid from a supplied track (librosa via uv)
  finalize.py            mux picture + sound, two-pass loudness normalization
  inspect.sh             contact sheet, frame strip, phone sheet, loop seam, poster, loudness
  grab_site.mjs          real screenshots, logo, colors and fonts from a product URL
assets/template/         the studio skeleton init_studio.py copies
```

### The render contract

- `window.seek(t)` is a pure function of `t`. Without that, renders aren't reproducible and you can't fix one frame without re-checking all the others.
- Render mode uses no CSS transitions, timers, `requestAnimationFrame`, `Date` or `Math.random`. Use the seeded `rng`/`hash1` instead.
- Every font, image and data file is local and loaded in `window.ready` before frame 0.

`render.mjs` encodes inside the page when the film is one full-frame canvas, across parallel browser workers. It falls back to viewport screenshots when the film uses DOM or SVG layers. The 4 subframes per frame are blended into motion blur.

### Speed

A 64-second 1080×1080 explainer at 60 fps with 4 blended subframes, about 15,000 browser frames, rendered in about 4 minutes on an 8-vCPU ARM64 cloud server (Ubuntu 24.04, 4 workers). Draft video at 30 fps without subframes and still contact sheets take seconds.

## Credits

The method comes from Movez's (@0xMovez) synthesis of the code-rendered motion trend that followed Claude Opus 5.5, and from the creators and repositories it collects. See [`references/sources.md`](references/sources.md). Figures quoted in the references (views, prompt lengths, run times) are as reported there, not measured by this skill.

## License

[MIT](LICENSE)
