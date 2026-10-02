# AGENTS.md — working in the motion-graphic skill repo

This repository is an agent skill. The skill itself is `SKILL.md`, plus the `references/` it links to, the `scripts/` it runs and the studio template in `assets/template/`. `README.md` is for humans.

## Using the skill or changing it?

- **You were asked to make a video.** Read `SKILL.md` and follow it. Create the film project outside this repository, for example `./motion/<slug>/` in the user's project or a scratch directory. Do not edit files here to make one film work.
- **You were asked to change the skill.** Read the rest of this file first.

## Layout and who reads what

| Path | Read by | Rule |
|---|---|---|
| `SKILL.md` | the agent, on every trigger | Keep it short: the method, the hard rules, pointers. Details go into `references/`. |
| `SKILL.md` frontmatter | the skill loader | `name: motion-graphic` must match the install directory name. `description` is the trigger: what it does plus "use when…" phrases, including the Polish *rolka* and *animacja*. |
| `references/*.md` | the agent, on demand | One topic per file, linked from `SKILL.md`. Each file starts with what it covers. |
| `scripts/*` | the agent, as commands | Zero dependencies beyond the shared Playwright runtime (`setup.sh`), Node 18+, ffmpeg and the Python 3 standard library. `beats.py` is the exception: uv installs librosa. |
| `assets/template/` | `init_studio.py` | Copied into each new film project. `{{W}}`, `{{H}}`, `{{DUR}}`, `{{TITLE}}` and `{{SKILL_DIR}}` are substituted in `.html/.js/.md/.json/.css` files. |

## Invariants: don't break these

1. **Determinism.** A film is a pure function of time. `render.mjs` output must not depend on worker count, timing or machine load. When the frame pipeline changes, render the same stills twice with different `--workers` and compare hashes.
2. **No per-project installs.** Playwright and Chromium live only in `~/.cache/motion-graphic`, or `$MOTION_RUNTIME`. Scripts resolve them from there.
3. **Sandbox-safe.** Some agent sandboxes have no writable `/tmp`. Keep the existing fallbacks that move `TMPDIR` into the project or runtime folder.
4. **Never destroy user work.** `init_studio.py` never overwrites an existing file, and `finalize.py` refuses to overwrite its input. Keep it that way.
5. **Machine-readable output.** Scripts print a JSON result (or a short echo line) that an agent can parse. Progress goes to stderr.
6. **Honest figures.** Numbers in `references/` that come from the trend article (views, prompt sizes, run times) stay attributed to `references/sources.md`. Numbers measured by the skill say where and how they were measured.

## Testing a change

There is no test suite. Run the end-to-end smoke test from a clean directory. Each step prints JSON; the last step must report about −14 LUFS.

```bash
SK=$PWD; T=$(mktemp -d)
bash $SK/scripts/setup.sh
python3 $SK/scripts/init_studio.py $T --format 1:1 --dur 4 --title Smoke
cd $T
printf '{"bpm":120,"duration":4,"tracks":[{"voice":"kick","pattern":"X...x...X...x...","bars":[0,2]}],"cues":[{"t":0,"type":"impact"}]}' > audio/score.json
node $SK/scripts/synth.mjs audio/score.json out/score.wav --beats beats.json
node $SK/scripts/render.mjs . --format 1:1 --every 1          # stills + out/stills/contact.png
node $SK/scripts/render.mjs . --format 1:1 --fps 30 --sub 1   # draft video → out/silent-1080x1080.mp4
python3 $SK/scripts/finalize.py out/silent-1080x1080.mp4 out/score.wav
bash $SK/scripts/inspect.sh all out/final-1080x1080.mp4
```

Then open `out/stills/contact.png` and `out/contact.png` and look at them. If you changed anything visual (template, `motion.js`, contact sheets), a passing exit code doesn't mean it looks right.

Pass `--format` (or `--w`/`--h`) to every `render.mjs` call, in tests and in docs.

## Style

- Match the surrounding code: classic-script globals in `motion.js` (no modules, since the template loads it with a plain `<script>`), small pure functions, comments that explain why rather than what.
- Docs are written for an agent at work: imperative, specific, with commands that were actually run. Prefer a table or a command block over a paragraph.
- Commits: `<type>: <description>` with type one of feat, fix, docs, refactor, test, chore, perf, ci. One logical change per commit.
- Never commit renders, `out/`, `node_modules/`, API keys or `.env` files. Paid generation (video or TTS models) reads keys from the environment.
