#!/usr/bin/env node
// Deterministic renderer for a seek(t) page (motion-graphic skill).
//
// Video:   node render.mjs <project> [--format 9:16|1:1|16:9 | --w W --h H]
//                          [--fps 60] [--sub 4] [--dur S] [--from S] [--to S] [--crf 16] [--out FILE]
// Stills:  node render.mjs <project> --stills 0,1.5,3 | --every 0.5 | --beats [beats.json]
//                          [--format ...] [--outdir DIR]       (also writes a labelled contact sheet)
//
// The project folder is served over a local HTTP server (fetch, fonts and images work),
// opened as index.html?w=W&h=H&render=1, and window.seek(t) is called for every
// frame. With --sub N each output frame averages N subframes (motion blur).
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, extname, relative, dirname } from 'node:path';
import { homedir, tmpdir } from 'node:os';

const argv = process.argv.slice(2);
const project = resolve(argv[0] && !argv[0].startsWith('--') ? argv.shift() : '.');
const has = (k) => argv.includes('--' + k);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const num = (k, d) => (opt(k) === undefined ? d : Number(opt(k)));

const FORMATS = { '9:16': [1080, 1920], '1:1': [1080, 1080], '16:9': [1920, 1080], '4:5': [1080, 1350] };
let [W, H] = FORMATS[opt('format', '')] || [num('w', 0), num('h', 0)];
const FPS = num('fps', 60), SUB = Math.max(1, num('sub', 4)), CRF = num('crf', 16);
const WORKERS = Math.max(1, num('workers', 4));   // parallel browser contexts; frames still written in order
// Capture: 'canvas' encodes the full-frame canvas inside the page (parallel across workers);
// 'screen' screenshots the viewport (needed when the film uses DOM/SVG layers). Auto-detected.
let CAPTURE = opt('capture', 'auto');
const entry = opt('page', 'index.html');
if (!existsSync(join(project, entry))) die(`no ${entry} in ${project}`);

// Runtime: Playwright lives in a shared cache installed by setup.sh.
const RUNTIME = process.env.MOTION_RUNTIME || join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'motion-graphic');
let chromium;
try { ({ chromium } = createRequire(join(RUNTIME, 'package.json'))('playwright')); }
catch { die(`Playwright runtime missing in ${RUNTIME}. Run scripts/setup.sh first.`); }
try { writeFileSync(join(tmpdir(), '.motion-probe'), ''); rmSync(join(tmpdir(), '.motion-probe')); }
catch { process.env.TMPDIR = join(project, 'out', '.tmp'); mkdirSync(process.env.TMPDIR, { recursive: true }); }  // sandboxes without /tmp

// Static server rooted at the project folder.
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
const server = createServer((req, res) => {
  const p = resolve(project, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (relative(project, p).startsWith('..') || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[extname(p).toLowerCase()] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--force-color-profile=srgb', '--hide-scrollbars'] });
const errors = [];
let page = await openPage(W || 1080, H || 1920);
if (!W || !H) {                                    // no size given: use the canvas size the page chose
  const size = await page.evaluate(() => { const c = document.querySelector('canvas'); return c ? [c.width, c.height] : null; });
  [W, H] = size || [1080, 1920];
  await page.close(); page = await openPage(W, H);
}
const DUR = num('dur', await page.evaluate(() => window.DURATION));
if (!(DUR > 0)) die('duration unknown: set window.DURATION in the page or pass --dur');
if (CAPTURE === 'auto') CAPTURE = await page.evaluate(([w, h]) => {
  const cs = [...document.querySelectorAll('canvas')];
  const others = [...document.body.children].filter((e) => !['CANVAS', 'SCRIPT', 'STYLE'].includes(e.tagName));
  return window.CAPTURE || (cs.length === 1 && cs[0].width === w && cs[0].height === h && !others.length ? 'canvas' : 'screen');
}, [W, H]);
const pages = [page];
while (pages.length < WORKERS) pages.push(await openPage(W, H));

const started = Date.now();
if (has('stills') || has('every') || has('beats')) await renderStills();
else await renderVideo();
await browser.close(); server.close();
if (errors.length) { console.error(`page reported ${errors.length} error(s); first: ${errors[0]}`); process.exitCode = 3; }

async function openPage(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(String(e.message || e)));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  p.on('response', (r) => {                         // missing assets, except the optional ones
    const path = new URL(r.url()).pathname;
    if (r.status() >= 400 && !/\/(beats\.json|favicon\.ico)$/.test(path)) errors.push(`HTTP ${r.status()} ${path}`);
  });
  await p.goto(`http://127.0.0.1:${port}/${entry}?w=${w}&h=${h}&render=1`);
  await p.waitForFunction(() => typeof window.seek === 'function', null, { timeout: 15000 })
    .catch(() => die('window.seek(t) never appeared — check the page for script errors: ' + errors.join(' | ')));
  await p.evaluate(async () => { if (window.ready) await window.ready; await document.fonts.ready; });
  return p;
}

async function frame(p, t) {
  if (CAPTURE === 'canvas') {
    const b64 = await p.evaluate(async (tt) => {
      await window.seek(tt);                          // seek may return a promise (video/image layers)
      const c = document.querySelector('canvas');
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(s);
    }, t);
    return Buffer.from(b64, 'base64');
  }
  await p.evaluate((tt) => window.seek(tt), t);
  return p.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } });
}

// Render times[] across all pages, calling sink(i, png) strictly in order.
async function renderAll(times, sink) {
  for (let i = 0; i < times.length; i += pages.length) {
    const batch = await Promise.all(pages.map((p, j) => (i + j < times.length ? frame(p, times[i + j]) : null)));
    for (let j = 0; j < batch.length && i + j < times.length; j++) await sink(i + j, batch[j]);
  }
}

async function renderVideo() {
  const from = num('from', 0), to = Math.min(num('to', DUR), DUR);
  const out = resolve(project, opt('out', `out/silent-${W}x${H}${has('from') || has('to') ? `-${from}-${to}` : ''}.mp4`));
  mkdirSync(dirname(out), { recursive: true });
  const rate = FPS * SUB;
  const vf = SUB > 1 ? ['-vf', `tmix=frames=${SUB},select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/${FPS}/TB`] : [];
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(rate), '-i', '-',
    ...vf, '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', String(CRF), '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const total = Math.round((to - from) * rate);
  const times = Array.from({ length: total }, (_, i) => from + i / rate);
  await renderAll(times, async (i, png) => {
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % rate === 0) console.error(`rendered ${(i / rate).toFixed(0)}s / ${(to - from).toFixed(1)}s`);
  });
  ff.stdin.end();
  const code = await new Promise((r) => ff.on('close', r));
  if (code !== 0) die('ffmpeg failed');
  console.log(JSON.stringify({ mode: 'video', out, w: W, h: H, fps: FPS, sub: SUB, from, to, seconds: ((Date.now() - started) / 1000).toFixed(1) }));
}

async function renderStills() {
  let times;
  if (has('stills')) times = String(opt('stills')).split(',').map(Number);
  else if (has('every')) { const e = num('every', 0.5); times = []; for (let t = 0; t < DUR - 1e-6; t += e) times.push(+t.toFixed(3)); }
  else {
    const f = resolve(project, opt('beats', 'beats.json'));
    if (!existsSync(f)) die(`--beats: ${f} not found`);
    times = JSON.parse(readFileSync(f, 'utf8')).beats.filter((t) => t < DUR);
  }
  const dir = resolve(project, opt('outdir', 'out/stills'));
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const index = [];
  await renderAll(times, (i, png) => {
    const name = `${String(i).padStart(3, '0')}_${times[i].toFixed(2)}s.png`;
    writeFileSync(join(dir, name), png);
    index.push({ tile: i, t: times[i], file: name });
  });
  writeFileSync(join(dir, 'index.json'), JSON.stringify(index, null, 1));
  // Labelled contact sheet: tile number + time burned into each thumbnail.
  const cols = Math.min(6, times.length), rows = Math.ceil(times.length / cols);
  const tw = W >= H ? 360 : 240;
  const sheet = join(dir, 'contact.png');
  buildSheet(dir, index, cols, rows, tw, sheet);
  console.log(JSON.stringify({ mode: 'stills', dir, contact: sheet, count: times.length, w: W, h: H, seconds: ((Date.now() - started) / 1000).toFixed(1) }));
}

function buildSheet(dir, index, cols, rows, tw, sheet) {
  // Label each thumbnail with "tile  time", then tile the numbered thumbnails.
  const thumbs = join(dir, '.thumbs');
  mkdirSync(thumbs, { recursive: true });
  const fs = Math.round(tw / 10);
  for (const { tile, t, file } of index) {
    const vf = `scale=${tw}:-2,drawtext=text='${tile}  ${t.toFixed(2)}s':x=8:y=8:fontsize=${fs}:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=6`;
    spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(dir, file), '-vf', vf, join(thumbs, `${String(tile).padStart(3, '0')}.png`)]);
  }
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', join(thumbs, '%03d.png'),
    '-vf', `tile=${cols}x${rows}:padding=4:margin=4:color=0x202020`, '-frames:v', '1', sheet]);
  if (r.status !== 0) console.error('contact sheet failed: ' + r.stderr);
  rmSync(thumbs, { recursive: true, force: true });
}

function die(msg) { console.error('render.mjs: ' + msg); process.exit(2); }
