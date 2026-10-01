#!/usr/bin/env node
// Gather a product's real assets from its website for a brand reel.
//
//   node grab_site.mjs <url> [outdir=assets/site]
//
// Writes: desktop.png (1440x900 @2x, first screen), desktop-full.png (full page @1x),
// mobile.png (390x844 @3x), logo.* / og.* / icon.* when found, and site.json with
// title, description, colors (computed from real elements), font families and every
// downloaded file. Animate these, never a redrawn-from-memory UI.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';

const [url, outArg = 'assets/site'] = process.argv.slice(2);
if (!url) { console.error('usage: node grab_site.mjs <url> [outdir]'); process.exit(2); }
const out = resolve(outArg); mkdirSync(out, { recursive: true });
const RUNTIME = process.env.MOTION_RUNTIME || join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'motion-graphic');
let chromium;
try { ({ chromium } = createRequire(join(RUNTIME, 'package.json'))('playwright')); }
catch { console.error(`Playwright runtime missing in ${RUNTIME}. Run scripts/setup.sh first.`); process.exit(2); }
try { writeFileSync(join(tmpdir(), '.motion-probe'), ''); rmSync(join(tmpdir(), '.motion-probe')); }
catch { process.env.TMPDIR = join(out, '.tmp'); mkdirSync(process.env.TMPDIR, { recursive: true }); }  // sandboxes without /tmp

const browser = await chromium.launch();
const files = [];
const shot = async (name, viewport, scale, fullPage = false) => {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => page.waitForLoadState('load'));
  await page.waitForTimeout(800);                       // let entrance animations settle
  await page.screenshot({ path: join(out, name), fullPage });
  files.push(name);
  return { ctx, page };
};

const { ctx, page } = await shot('desktop.png', { width: 1440, height: 900 }, 2);
const info = await page.evaluate(() => {
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return null; } };
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
  const pick = (sel) => [...document.querySelectorAll(sel)].filter(visible);
  const color = (v) => (v && v !== 'rgba(0, 0, 0, 0)' && v !== 'transparent' ? v : null);
  const count = (arr) => Object.entries(arr.filter(Boolean).reduce((m, c) => ((m[c] = (m[c] || 0) + 1), m), {}))
    .sort((a, b) => b[1] - a[1]).map(([c, n]) => ({ value: c, uses: n }));
  const buttons = pick('button, a[class*=btn], a[class*=button], [role=button], input[type=submit]').slice(0, 30);
  const logoImg = pick('header img, nav img, a[href="/"] img, img[alt*=logo i], img[src*=logo i], img[class*=logo i]')[0];
  const logoSvg = pick('header svg, nav svg, a[href="/"] svg, svg[class*=logo i], [class*=logo i] svg')[0];
  const meta = (n) => document.querySelector(`meta[property="${n}"], meta[name="${n}"]`)?.content || null;
  return {
    title: document.title, description: meta('description') || meta('og:description'),
    og_image: abs(meta('og:image') || ''),
    icon: abs(document.querySelector('link[rel*="apple-touch-icon"], link[rel~="icon"]')?.href || '/favicon.ico'),
    logo_img: logoImg ? abs(logoImg.currentSrc || logoImg.src) : null,
    logo_svg: logoSvg ? logoSvg.outerHTML : null,
    colors: {
      background: color(cs(document.body).backgroundColor) || color(cs(document.documentElement).backgroundColor),
      text: cs(document.body).color,
      headings: count(pick('h1, h2, h3').map((e) => cs(e).color)).slice(0, 4),
      buttons_bg: count(buttons.map((e) => color(cs(e).backgroundColor))).slice(0, 5),
      links: count(pick('a').slice(0, 80).map((e) => cs(e).color)).slice(0, 5),
    },
    fonts: {
      headings: count(pick('h1, h2').map((e) => cs(e).fontFamily)).slice(0, 3),
      body: cs(document.body).fontFamily,
      buttons: count(buttons.map((e) => cs(e).fontFamily)).slice(0, 2),
    },
    headlines: pick('h1, h2').slice(0, 8).map((e) => e.innerText.trim()).filter(Boolean),
  };
});

const save = async (name, src) => {
  if (!src) return null;
  try {
    const r = await ctx.request.get(src, { timeout: 20000 });
    if (!r.ok()) return null;
    const type = r.headers()['content-type'] || '';
    const ext = type.includes('svg') ? 'svg' : type.includes('png') ? 'png' : type.includes('webp') ? 'webp'
      : type.includes('jpeg') || type.includes('jpg') ? 'jpg' : type.includes('icon') ? 'ico' : (src.split('?')[0].split('.').pop() || 'bin').slice(0, 4);
    writeFileSync(join(out, `${name}.${ext}`), await r.body());
    files.push(`${name}.${ext}`); return `${name}.${ext}`;
  } catch { return null; }
};
if (info.logo_svg) { writeFileSync(join(out, 'logo-inline.svg'), info.logo_svg); files.push('logo-inline.svg'); }
info.logo_file = await save('logo', info.logo_img);
info.og_file = await save('og', info.og_image);
info.icon_file = await save('icon', info.icon);
delete info.logo_svg;

await ctx.close();
await (await shot('desktop-full.png', { width: 1440, height: 900 }, 1, true)).ctx.close();
await (await shot('mobile.png', { width: 390, height: 844 }, 3)).ctx.close();
await browser.close();

info.url = url; info.files = files;
writeFileSync(join(out, 'site.json'), JSON.stringify(info, null, 1));
console.log(JSON.stringify({ outdir: out, title: info.title, files, colors: info.colors.buttons_bg.slice(0, 3), fonts: info.fonts.headings }, null, 1));
