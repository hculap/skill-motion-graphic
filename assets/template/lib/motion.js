// motion.js — pure functions of time for a seek(t) film. Classic script: every
// function below is a global, so index.html can use it without modules.
// Nothing here reads a clock, keeps state between frames or calls Math.random.

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, p) => a + (b - a) * p;
const mixColor = (c1, c2, p) => {            // '#rrggbb' → '#rrggbb'
  const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
  const ch = (s) => Math.round(lerp((a >> s) & 255, (b >> s) & 255, clamp(p)));
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
};

// Spring presets [stiffness k, damping d]. Pick by mass, not by taste:
//   snappy  – buttons, toggles, leading edges     (~0.25 s, no visible overshoot)
//   base    – cards, containers, camera           (~0.45 s, critically damped)
//   heavy   – big type, 3D objects, logo lockups  (~0.7 s, slow settle)
//   playful – mascots, stickers                   (visible ~18% overshoot)
const SPRING = { snappy: [320, 30], base: [170, 26], heavy: [90, 20], playful: [220, 14] };

// Closed-form damped spring, 0 → 1, for t seconds after it starts.
function spring(t, k = 170, d = 26) {
  if (Array.isArray(k)) [k, d] = k;
  if (t <= 0) return 0;
  const w0 = Math.sqrt(k), z = d / (2 * w0);
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);   // z >= 1 treated as critical
}

// A value that changes target several times: one spring per change, summed.
// keys: [[time, value], ...] sorted by time. Frame 812 never needs frames 0–811.
function track(t, keys, k = 170, d = 26) {
  if (Array.isArray(k)) [k, d] = k;
  let v = keys[0][1];
  for (let i = 1; i < keys.length; i++)
    v += (keys[i][1] - keys[i - 1][1]) * spring(t - keys[i][0], k, d);
  return v;
}

// Same as track() for [x, y] or any numeric array (cursor paths, rects).
function trackN(t, keys, k = 170, d = 26) {
  return keys[0][1].map((_, j) => track(t, keys.map(([tt, v]) => [tt, v[j]]), k, d));
}

// Stretchy indicator: leading edge stiffer than trailing edge. stops: [[time, x], ...]
function indicator(t, stops, width = 120) {
  const lead = track(t, stops, SPRING.snappy), trail = track(t, stops, 140, 22);
  return { left: Math.min(lead, trail), right: Math.max(lead, trail) + width };
}

// Text inside a morphing box: in after the morph starts, out before the next one.
function swapAlpha(t, tIn, tOut) {
  return Math.min(clamp((t - tIn - 0.08) / 0.12), clamp((tOut - 0.1 - t) / 0.1));
}

// Seamless loop: map any t into [0, dur).
const loopT = (t, dur) => ((t % dur) + dur) % dur;

// Stagger: start time of item i of n spread over `spread` seconds.
const stagger = (i, n, spread = 0.4) => (n <= 1 ? 0 : (i / (n - 1)) * spread);

// Seeded noise (mulberry32). rng(seed)() → [0, 1). Same seed, same sequence, every run.
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Stateless hash noise for per-frame jitter/grain: hash1(i, frame) → [0, 1).
const hash1 = (a, b = 0) => rng((a * 374761393 + b * 668265263) | 0)();

// Beat grid. BEATS is filled from beats.json by index.html (or stays null).
let BEATS = null;
const BPM = () => (BEATS && BEATS.bpm) || 120;
const beat = (i) => (BEATS && BEATS.beats && BEATS.beats[i] != null ? BEATS.beats[i] : i * 60 / BPM());
const bar = (i, beatsPerBar = 4) => beat(i * beatsPerBar);

// Layout against the frame, not fixed pixels: one timeline renders 9:16, 1:1 and 16:9.
// u = one "design pixel" on a 1080-wide short side; margins keep type off the edges.
function layout(w, h) {
  const u = Math.min(w, h) / 1080;
  return {
    w, h, u, cx: w / 2, cy: h / 2,
    portrait: h > w * 1.2, landscape: w > h * 1.2, square: Math.abs(w - h) <= Math.min(w, h) * 0.2,
    margin: 96 * u,
    safe: { x: 96 * u, y: (h > w ? 220 : 96) * u, w: w - 192 * u, h: h - (h > w ? 440 : 192) * u },
  };
}

// Canvas helpers.
function roundRect(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath(); g.roundRect(x, y, w, h, r);
}
// Largest font size (px) at which `text` fits maxWidth, for font template 'TEMPLATE' e.g. '700 {px}px Inter'.
function fitText(g, text, maxWidth, template, maxPx = 400) {
  let lo = 4, hi = maxPx;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    g.font = template.replace('{px}', mid);
    if (g.measureText(text).width <= maxWidth) lo = mid; else hi = mid;
  }
  g.font = template.replace('{px}', lo);
  return lo;
}
