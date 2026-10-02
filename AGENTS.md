# AGENTS.md — working in the motion-graphic skill repo

This repository is an agent skill. The skill itself is `SKILL.md`, plus the `references/` it links to, the `scripts/` it runs and the studio template in `assets/template/`. `README.md` is for humans.

## Using the skill or changing it?

- **You were asked to make a video.** Read `SKILL.md` and follow it. Create the film project outside this repository, for example `./motion/<slug>/` in the user's project or a scratch directory. Do not edit files here to make one film work.
- **You were asked to change the skill.** Read the rest of this file first.

## Layout and who reads what

| Path | Read by | Rule |
|---|---|---|
| `.claude-plugin/plugin.json` | Claude Code's plugin loader | The plugin manifest. `name` stays `motion-graphic` forever. `version` must change with every release (see Releasing). |
| `.claude-plugin/marketplace.json` | `claude plugin marketplace add` | The catalog: one entry, `source: "./"`, same `name` as the manifest. |
| `SKILL.md` | the agent, on every trigger | Keep it short: the method, the hard rules, pointers. Details go into `references/`. |
| `SKILL.md` frontmatter | the skill loader | `name: motion-graphic` must match the install directory name. `description` is the trigger: what it does plus "use when…" phrases, including the Polish *rolka* and *animacja*. |
| `references/*.md` | the agent, on demand | One topic per file, linked from `SKILL.md`. Each file starts with what it covers. |
| `scripts/*` | the agent, as commands | Zero dependencies beyond the shared Playwright runtime (`setup.sh`), Node 18+, ffmpeg and the Python 3 standard library. `beats.py` is the exception: uv installs librosa. `eleven.mjs` uses Node's built-in `fetch`. |
| `assets/template/` | `init_studio.py` | Copied into each new film project. `{{W}}`, `{{H}}`, `{{DUR}}`, `{{TITLE}}` and `{{SKILL_DIR}}` are substituted in `.html/.js/.md/.json/.css` files. |

## Invariants: don't break these

1. **Determinism.** A film is a pure function of time. `render.mjs` output must not depend on worker count, timing or machine load. When the frame pipeline changes, render the same stills twice with different `--workers` and compare hashes.
2. **No per-project installs.** Playwright and Chromium live only in `~/.cache/motion-graphic`, or `$MOTION_RUNTIME`. Scripts resolve them from there.
3. **Sandbox-safe.** Some agent sandboxes have no writable `/tmp`. Keep the existing fallbacks that move `TMPDIR` into the project or runtime folder.
4. **Never destroy user work.** `init_studio.py` never overwrites an existing file, and `finalize.py` refuses to overwrite its input. Keep it that way.
5. **Machine-readable output.** Scripts print a JSON result (or a short echo line) that an agent can parse. Progress goes to stderr.
6. **Paid calls are opt-in.** The skill must work fully without `ELEVENLABS_API_KEY`. `eleven.mjs` keeps an existing output unless `--force` is passed, offers `--dry-run` on every paid command, writes `<out>.request.json` next to each file, and never prints the key. Check request bodies against the official OpenAPI spec (`https://api.elevenlabs.io/openapi.json`), not memory.
7. **Honest figures.** Numbers in `references/` that come from the trend article (views, prompt sizes, run times) stay attributed to `references/sources.md`. Numbers measured by the skill say where and how they were measured.

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

The smoke test never spends credits. If you changed `eleven.mjs`, also run the free calls: `node $SK/scripts/eleven.mjs check` and every subcommand with `--dry-run`. Run a paid generation only with the owner's OK.

Then open `out/stills/contact.png` and `out/contact.png` and look at them. If you changed anything visual (template, `motion.js`, contact sheets), a passing exit code doesn't mean it looks right.

Pass `--format` (or `--w`/`--h`) to every `render.mjs` call, in tests and in docs.

## Releasing

The repository is both the plugin and its marketplace. Users install with
`claude plugin marketplace add hculap/skill-motion-graphic` and
`claude plugin install motion-graphic@motion-graphic`.

1. **Bump `version`** in `.claude-plugin/plugin.json` for every change users should get: patch for fixes, minor for
   features. Installed users receive a release only when this string changes. Don't set `version` in the marketplace entry.
2. **Validate:** `claude plugin validate --strict .` must end with `✔ Validation passed`.
3. **Install test in a throwaway config**, which leaves your own settings alone:
   ```bash
   T=$(mktemp -d)
   CLAUDE_CONFIG_DIR=$T claude plugin marketplace add ./
   CLAUDE_CONFIG_DIR=$T claude plugin install motion-graphic@motion-graphic
   CLAUDE_CONFIG_DIR=$T claude plugin details motion-graphic     # expect "Skills (1)  motion-graphic"
   ```
4. Commit and push, then repeat step 3 with `hculap/skill-motion-graphic` in place of `./` to test what users download.

Keep `SKILL.md` at the repository root, with `name: motion-graphic` in its frontmatter. That makes the plugin a
single-skill plugin, and it keeps the plain `git clone` into a skills directory working. Never rename the plugin;
change `displayName` instead, or follow the `renames` procedure in the Claude Code docs.

## Style

- Match the surrounding code: classic-script globals in `motion.js` (no modules, since the template loads it with a plain `<script>`), small pure functions, comments that explain why rather than what.
- Docs are written for an agent at work: imperative, specific, with commands that were actually run. Prefer a table or a command block over a paragraph.
- Commits: `<type>: <description>` with type one of feat, fix, docs, refactor, test, chore, perf, ci. One logical change per commit.
- Never commit renders, `out/`, `node_modules/`, API keys or `.env` files. Paid generation (video or TTS models) reads keys from the environment.
