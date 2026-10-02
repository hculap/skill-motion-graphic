#!/usr/bin/env node
// ElevenLabs audio for a film: music on the shot list's grid, music scored to a rendered video,
// and sound effects. OPTIONAL AND PAID — the skill works without it (synth.mjs). Use it only when
// ELEVENLABS_API_KEY is set (environment, or .env in the current folder) and the user approved the spend.
//
//   node eleven.mjs check                                             key valid? tier and credits used (free)
//   node eleven.mjs plan "<prompt>" audio/music-plan.json [--ms 15000] [--model music_v2_5]
//   node eleven.mjs music audio/music-plan.json audio/music.mp3 [--model music_v2_5] [--format mp3_48000_192]
//   node eleven.mjs video out/silent-1080x1920.mp4 audio/music.mp3 [--description "…"] [--tags a,b] [--model …]
//   node eleven.mjs sfx audio/sfx.json audio/sfx/                     one file per entry, {name: {text, duration_seconds}}
//
// Every paid command takes --dry-run (print the request, call nothing) and --force (replace an existing
// output; without it an existing file is kept, because each generation costs credits and differs).
// Each output gets a sidecar <out>.request.json with the request and the response metadata.
// `music` reads the request body from the JSON file: {"composition_plan": {"chunks": [...]}} (or the older
// {"composition_plan": {"positive_global_styles", "sections"}}), or {"prompt", "music_length_ms", "force_instrumental"}.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, basename, extname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const API = 'https://api.elevenlabs.io';
const argv = process.argv.slice(2);
const has = (k) => argv.includes('--' + k);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const VALUED = new Set(['ms', 'model', 'format', 'description', 'tags']);
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && VALUED.has(argv[i - 1].slice(2))));
const [cmd, a1, a2] = pos;
const DRY = has('dry-run'), FORCE = has('force');

function die(msg, code = 2) { console.error('eleven.mjs: ' + msg); process.exit(code); }
function key() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  if (existsSync('.env')) {
    const m = readFileSync('.env', 'utf8').match(/^\s*(?:export\s+)?ELEVENLABS_API_KEY\s*=\s*["']?([^"'\s#]+)/m);
    if (m) return m[1];
  }
  die('ELEVENLABS_API_KEY is not set (environment or ./.env). Without it, score the film with synth.mjs.');
}
function seconds(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const s = parseFloat(r.stdout); return Number.isFinite(s) ? +s.toFixed(3) : null;
}
function guardOut(out) {
  if (existsSync(out) && !FORCE) {
    console.log(JSON.stringify({ skipped: out, reason: 'exists; pass --force to pay for a new generation', seconds: seconds(out) }));
    return false;
  }
  mkdirSync(dirname(resolve(out)), { recursive: true });
  return true;
}
async function call(path, { method = 'POST', json, form, query = {} } = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);
  const headers = { 'xi-api-key': key() };
  let body;
  if (json) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(15 * 60 * 1000) });
  if (!res.ok) {
    let detail = await res.text();
    try { const j = JSON.parse(detail); detail = JSON.stringify(j.detail ?? j); } catch {}
    const hint = res.status === 401 && path.startsWith('/v1/music') ? ' (a music 401 usually means the key lacks the music_generation permission)' : '';
    die(`${method} ${path} → HTTP ${res.status}${hint}: ${detail.slice(0, 600)}`, 1);
  }
  return res;
}
function meta(res) {
  const pick = {};
  for (const h of ['song-id', 'character-cost', 'request-id', 'content-type']) if (res.headers.get(h)) pick[h] = res.headers.get(h);
  return pick;
}
async function saveAudio(res, out, request, extra = {}) {
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(out, buf);
  const info = { out, bytes: buf.length, seconds: seconds(out), ...extra, response: meta(res) };
  writeFileSync(out + '.request.json', JSON.stringify({ request, ...info, at: new Date().toISOString() }, null, 1));
  return info;
}
function warnPlan(body) {
  const p = body.composition_plan, warn = [];
  const parts = p ? (p.chunks || p.sections || []) : [];
  parts.forEach((c, i) => {
    if (c.duration_ms < 3000 || c.duration_ms > 120000) warn.push(`part ${i} duration_ms ${c.duration_ms} outside 3000–120000`);
  });
  if (body.music_length_ms && (body.music_length_ms < 3000 || body.music_length_ms > 600000)) warn.push('music_length_ms outside 3000–600000');
  if (p && body.prompt) warn.push('prompt and composition_plan cannot be combined');
  const total = parts.reduce((s, c) => s + (c.duration_ms || 0), 0) || body.music_length_ms || null;
  return { warn, total_ms: total };
}

const commands = {
  async check() {
    const res = await call('/v1/user/subscription', { method: 'GET' });
    const s = await res.json();
    console.log(JSON.stringify({ ok: true, tier: s.tier, status: s.status, credits_used: s.character_count, credits_limit: s.character_limit,
      next_reset: s.next_character_count_reset_unix ? new Date(s.next_character_count_reset_unix * 1000).toISOString() : null }));
  },
  async plan() {
    if (!a1 || !a2) die('usage: plan "<prompt>" <out.json> [--ms N] [--model id]');
    const req = { prompt: a1, music_length_ms: opt('ms') ? +opt('ms') : undefined, model_id: opt('model', 'music_v2_5') };
    if (DRY) return console.log(JSON.stringify({ dry_run: true, endpoint: '/v1/music/plan', request: req }));
    const res = await call('/v1/music/plan', { json: req });
    const plan = await res.json();
    mkdirSync(dirname(resolve(a2)), { recursive: true });
    writeFileSync(a2, JSON.stringify({ model_id: req.model_id, composition_plan: plan }, null, 1));
    const parts = plan.chunks || plan.sections || [];
    console.log(JSON.stringify({ out: a2, parts: parts.length, total_ms: parts.reduce((s, c) => s + (c.duration_ms || 0), 0) }));
  },
  async music() {
    if (!a1 || !a2) die('usage: music <request.json> <out.mp3> [--model id] [--format mp3_48000_192]');
    const body = JSON.parse(readFileSync(a1, 'utf8'));
    if (opt('model')) body.model_id = opt('model');
    // chunks and prompt mode → newest model (section lengths always enforced on music_v2*);
    // the older {sections} plan format is the one proven on music_v1.
    body.model_id ||= body.composition_plan?.sections ? 'music_v1' : 'music_v2_5';
    const query = { output_format: opt('format', 'mp3_48000_192') };
    const { warn, total_ms } = warnPlan(body);
    if (DRY) return console.log(JSON.stringify({ dry_run: true, endpoint: '/v1/music', query, total_ms, warn, request: body }));
    if (warn.length) die('plan problems: ' + warn.join('; '));
    if (!guardOut(a2)) return;
    const res = await call('/v1/music', { json: body, query });
    console.log(JSON.stringify(await saveAudio(res, a2, { endpoint: '/v1/music', query, body }, { requested_ms: total_ms, model_id: body.model_id })));
  },
  async video() {
    if (!a1 || !a2) die('usage: video <film.mp4> <out.mp3> [--description "…"] [--tags a,b] [--model id]');
    if (!existsSync(a1)) die('no such video: ' + a1);
    const mb = statSync(a1).size / 1e6;
    if (mb > 200) die(`video is ${mb.toFixed(0)} MB; the endpoint accepts up to 200 MB — render a lighter proxy (e.g. --fps 30 --sub 1)`);
    const fields = { description: opt('description'), tags: opt('tags') ? opt('tags').split(',').map((s) => s.trim()).filter(Boolean) : [],
      model_id: opt('model', 'music_v2_5') };
    if (DRY) return console.log(JSON.stringify({ dry_run: true, endpoint: '/v1/music/video-to-music', video: a1, video_mb: +mb.toFixed(1), seconds: seconds(a1), ...fields }));
    if (!guardOut(a2)) return;
    const form = new FormData();
    form.append('videos', new Blob([readFileSync(a1)], { type: 'video/mp4' }), basename(a1));
    if (fields.description) form.append('description', fields.description);
    for (const t of fields.tags) form.append('tags', t);
    form.append('model_id', fields.model_id);
    const res = await call('/v1/music/video-to-music', { form });
    console.log(JSON.stringify(await saveAudio(res, a2, { endpoint: '/v1/music/video-to-music', video: a1, ...fields }, { video_seconds: seconds(a1) })));
  },
  async sfx() {
    if (!a1 || !a2) die('usage: sfx <sfx.json> <outdir> — sfx.json = {"name": {"text": "…", "duration_seconds": 1.2}}');
    const list = JSON.parse(readFileSync(a1, 'utf8')), results = [];
    // sound-generation has no 48 kHz MP3 (unlike /v1/music); ffmpeg resamples when mixing
    const query = { output_format: opt('format', 'mp3_44100_192') };
    for (const [name, spec] of Object.entries(list)) {
      const out = join(a2, name + (extname(name) ? '' : '.mp3'));
      const body = { model_id: 'eleven_text_to_sound_v2', ...spec };
      if (body.duration_seconds != null && (body.duration_seconds < 0.5 || body.duration_seconds > 30)) die(`${name}: duration_seconds must be 0.5–30`);
      if (DRY) { results.push({ name, out, request: body }); continue; }
      if (!guardOut(out)) { results.push({ name, out, skipped: true }); continue; }
      const res = await call('/v1/sound-generation', { json: body, query });
      results.push({ name, ...(await saveAudio(res, out, { endpoint: '/v1/sound-generation', query, body })) });
    }
    console.log(JSON.stringify({ dry_run: DRY || undefined, sfx: results }));
  },
};

if (!commands[cmd]) { console.error(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 17).join('\n')); process.exit(2); }
await commands[cmd]();
