# Sources

Based on "How to build motion design studio with Opus 5.5 (Full-course)" by Movez
(@0xMovez), X article, 2026-09-27: https://x.com/0xMovez/status/2104216919033192746
— a 12-step synthesis of the posts that defined the code-rendered motion trend after
Claude Opus 5.5 shipped (2026-09-22). Figures quoted in this skill (views, prompt lengths,
run times, call counts) are as reported by the creators in that article, not measured here.

Repos referenced by the article:
- Music video, subagent-per-chapter pattern: https://github.com/JohnHeibel/PDoomVideo
- Starter: https://github.com/JohnHeibel/ClaudeAnimationBase
- Node canvas rigs + synthesized sound skill: https://github.com/buildwithhanif/claude-animation-skill
- HTML + GSAP framework: https://github.com/heygen-com/hyperframes
- React framework skills: https://www.remotion.dev/docs/ai/skills
- Long-form history film: https://github.com/WinterArc21/Battle-of-Austerlitz-Film
- Prompt library: https://github.com/guanmo-ai/awesome-ai-motion
- Dataset of trend videos ("brief contagion"): https://github.com/athemeroy/awesome-opus-5-5-videos

Code in this skill (render.mjs workers + canvas capture, synth.mjs voices/sends, inspect.sh,
finalize.py) extends the article's snippets; motion.js keeps its spring/track/indicator/
swapAlpha/loopT functions.
