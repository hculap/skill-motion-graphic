#!/usr/bin/env node
// Deterministic score + SFX synthesizer for motion-graphic films. No dependencies.
//
//   node synth.mjs <score.json> <out.wav> [--beats beats.json]
//
// score.json (see references/sound.md for the full format):
// {
//   "bpm": 120, "duration": 16,               // seconds; the picture's DURATION
//   "tracks": [
//     { "voice": "kick",  "pattern": "X...x...X...x...", "bars": [0, 8] },
//     { "voice": "bass",  "notes": [[0, "A1", 0.5], [1.5, "A1", 0.5]], "loop": 4, "duck": 0.6 },
//     { "voice": "pad",   "notes": [[0, ["A3", "C4", "E4"], 8]], "loop": 16, "reverb": 0.4, "duck": 0.5 },
//     { "voice": "pluck", "notes": [[0, "E5", 0.25], [0.75, "A5", 0.25]], "loop": 2, "delay": 0.3, "pan": 0.3 }
//   ],
//   "cues": [ { "t": 0.5, "type": "click" }, { "t": 2.0, "type": "whoosh", "dur": 0.4 } ]
// }
// Writes 48 kHz 16-bit stereo WAV, peak-normalized to -1 dBFS (finalize.py sets loudness).
// --beats writes the grid {bpm, beats, downbeats, hits} the animation reads.
import { readFileSync, writeFileSync } from 'node:fs';

const [scoreFile, outFile] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--beats');
if (!scoreFile || !outFile) { console.error('usage: node synth.mjs <score.json> <out.wav> [--beats beats.json]'); process.exit(2); }
const bi = process.argv.indexOf('--beats');
const beatsFile = bi > 0 ? process.argv[bi + 1] : null;

const S = JSON.parse(readFileSync(scoreFile, 'utf8'));
const SR = S.sr || 48000, BPM = S.bpm || 120, SPB = 60 / BPM;
const DUR = S.duration || (S.bars || 8) * 4 * SPB;
const N = Math.ceil((DUR + (S.tail || 0)) * SR);
const L = new Float32Array(N), R = new Float32Array(N);
const revBus = new Float32Array(N), dlyL = new Float32Array(N), dlyR = new Float32Array(N);
const TAU = 2 * Math.PI;

// ---- helpers -----------------------------------------------------------------
function lcg(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2147483648 - 1); }
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(n) {
  if (typeof n === 'number') return n;
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(n);
  if (!m) throw new Error('bad note ' + n);
  return 12 * (+m[3] + 1) + NOTE[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const hz = (n) => 440 * 2 ** ((midi(n) - 69) / 12);
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) * d));
function onePoleLP(x, cutoff) { // cutoff: number or (i) => Hz
  let y = 0; const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const c = typeof cutoff === 'function' ? cutoff(i) : cutoff;
    const a = 1 - Math.exp(-TAU * c / SR); y += a * (x[i] - y); out[i] = y;
  }
  return out;
}
function onePoleHP(x, cutoff) { const lp = onePoleLP(x, cutoff); return x.map((v, i) => v - lp[i]); }
function buf(sec, fn) { const n = Math.max(1, Math.ceil(sec * SR)), b = new Float32Array(n); for (let i = 0; i < n; i++) b[i] = fn(i / SR, i); return b; }
const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));

// ---- voices: (freq, dur, vel, seed, opts) → mono Float32Array -------------------
const VOICES = {
  kick: (f, d, v) => { let ph = 0; return buf(0.55, (t) => { ph += (45 + 115 * Math.exp(-t * 32)) / SR;
    return (Math.sin(TAU * ph) * env(t, 0.002, 7) + (t < 0.004 ? 0.4 * (1 - t / 0.004) : 0)) * v; }); },
  snare: (f, d, v, seed) => { const n = lcg(seed);
    const noise = onePoleHP(buf(0.3, () => n()), 1800);
    return buf(0.3, (t, i) => (0.45 * (Math.sin(TAU * 185 * t) + 0.5 * Math.sin(TAU * 330 * t)) * Math.exp(-t * 20) + 0.8 * noise[i] * Math.exp(-t * 15)) * v); },
  clap: (f, d, v, seed) => { const n = lcg(seed);
    const raw = buf(0.4, (t) => { const burst = [0, 0.011, 0.022].reduce((s, o) => s + (t >= o && t < o + 0.008 ? 1 : 0), 0);
      return n() * (burst ? 0.9 : 0.6 * Math.exp(-(t - 0.022) * 13) * (t > 0.022 ? 1 : 0)); });
    return onePoleLP(onePoleHP(raw, 900), 5000).map((x) => x * v * 1.4); },
  hat: (f, d, v, seed) => { const n = lcg(seed); return onePoleHP(buf(0.12, () => n()), 7000).map((x, i) => x * Math.exp(-i / SR * 55) * 0.5 * v); },
  ohat: (f, d, v, seed) => { const n = lcg(seed); return onePoleHP(buf(0.5, () => n()), 6500).map((x, i) => x * Math.exp(-i / SR * 8) * 0.4 * v); },
  tick: (f, d, v) => buf(0.04, (t) => Math.sin(TAU * (f || 1700) * t) * Math.exp(-t * 140) * 0.6 * v),
  bass: (f, d, v) => { let ph = 0;
    const raw = buf(d + 0.08, (t) => { ph += f / SR; const a = t < 0.004 ? t / 0.004 : t > d ? Math.exp(-(t - d) * 60) : 1;
      return (0.6 * saw(ph) + 0.5 * Math.sin(TAU * ph)) * a; });
    return onePoleLP(raw, (i) => 180 + 1400 * Math.exp(-i / SR * 9)).map((x) => x * v * 1.3); },
  sub: (f, d, v) => buf(d + 0.05, (t) => Math.sin(TAU * f * t) * Math.min(1, t / 0.01) * (t > d ? Math.exp(-(t - d) * 60) : 1) * v),
  pluck: (f, d, v, seed) => { const n = lcg(seed), P = Math.max(2, Math.round(SR / f)), line = Float32Array.from({ length: P }, () => n());
    const len = Math.ceil((d + 0.6) * SR), out = new Float32Array(len); let prev = 0;
    for (let i = 0; i < len; i++) { const j = i % P, x = line[j]; line[j] = 0.5 * (x + prev) * 0.996; prev = x; out[i] = x * 0.6 * v * (i / SR > d ? Math.exp(-(i / SR - d) * 8) : 1); }
    return onePoleLP(out, 4500); },
  keys: (f, d, v) => buf(d + 0.6, (t) => { const idx = 1.8 * Math.exp(-t * 4);
    const a = Math.exp(-t * 1.4) * (t > d ? Math.exp(-(t - d) * 7) : 1) * Math.min(1, t / 0.003);
    return (Math.sin(TAU * f * t + idx * Math.sin(TAU * f * t)) + 0.08 * Math.sin(TAU * 14 * f * t) * Math.exp(-t * 25)) * a * 0.45 * v; }),
  bell: (f, d, v) => buf(d + 1.5, (t) => Math.sin(TAU * f * t + 3 * Math.exp(-t * 2.5) * Math.sin(TAU * 3.5 * f * t)) * Math.exp(-t * 2.2) * Math.min(1, t / 0.002) * 0.35 * v),
  pad: (f, d, v) => { const det = [-0.07, 0, 0.07].map((c) => f * 2 ** (c / 12)); const ph = [0.1, 0.4, 0.7];
    const raw = buf(d + 1.0, (t) => { let s = 0; for (let k = 0; k < 3; k++) { ph[k] += det[k] / SR; s += saw(ph[k]); }
      const a = Math.min(1, t / 0.45) * (t > d ? Math.exp(-(t - d) * 3.5) : 1); return s * a * 0.16 * v; });
    return onePoleLP(raw, 1600); },
  lead: (f, d, v) => { let ph = 0; const raw = buf(d + 0.15, (t) => { ph += f * (1 + 0.004 * Math.sin(TAU * 5.5 * t) * Math.min(1, t / 0.3)) / SR;
      const sq = ph % 1 < 0.42 ? 1 : -1; const a = Math.min(1, t / 0.01) * (t > d ? Math.exp(-(t - d) * 25) : 1); return sq * a * 0.22 * v; });
    return onePoleLP(raw, 2800); },
  // ---- SFX (cues) ----
  click: (f, d, v) => buf(0.05, (t) => Math.sin(TAU * (f || 1800) * t) * Math.exp(-t * 90) * 0.5 * v),
  pop: (f, d, v) => buf(0.15, (t) => Math.sin(TAU * ((f || 600) + 900 * t) * t) * Math.exp(-t * 30) * 0.45 * v),
  thump: (f, d, v) => buf(0.5, (t) => Math.sin(TAU * ((f || 90) - 60 * t) * t) * Math.exp(-t * 9) * 0.9 * v),
  whoosh: (f, d, v, seed) => { const n = lcg(seed), L2 = d || 0.35;
    const raw = buf(L2, () => n());
    return onePoleLP(raw, (i) => 300 + 5000 * Math.sin(Math.PI * Math.min(1, i / SR / L2))).map((x, i) => x * Math.sin(Math.PI * Math.min(1, i / SR / L2)) * 0.5 * v); },
  riser: (f, d, v, seed) => { const n = lcg(seed), L2 = d || 1.5; let ph = 0;
    return onePoleHP(buf(L2, (t) => { const p = t / L2; ph += ((f || 200) * (1 + 3 * p * p)) / SR;
      return (0.6 * n() * p + 0.25 * saw(ph)) * p * p * v * 0.5; }), 400); },
  impact: (f, d, v, seed) => { const n = lcg(seed); const nz = onePoleLP(buf(1.2, () => n()), 2500);
    return buf(1.2, (t, i) => (Math.sin(TAU * (55 - 25 * t) * t) * Math.exp(-t * 4) + 0.5 * nz[i] * Math.exp(-t * 6)) * 0.8 * v); },
  swish: (f, d, v, seed) => VOICES.whoosh(f, d || 0.18, v * 0.8, seed),
};

// ---- sequencing ----------------------------------------------------------------
let seedCounter = 1;
const kickTimes = [];
function place(mono, t0, gain, pan, sends) {
  const s0 = Math.round(t0 * SR); if (s0 >= N) return;
  const lg = Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2 * gain, rg = Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2 * gain;
  for (let i = 0; i < mono.length && s0 + i < N; i++) {
    if (s0 + i < 0) continue;
    const x = mono[i] * (sends.duckEnv ? sends.duckEnv[s0 + i] : 1);
    L[s0 + i] += x * lg; R[s0 + i] += x * rg;
    if (sends.reverb) revBus[s0 + i] += x * gain * sends.reverb;
    if (sends.delay) { dlyL[s0 + i] += x * lg * sends.delay; dlyR[s0 + i] += x * rg * sends.delay; }
  }
}
function events(tr) {   // → [{t, freqs[], dur, vel}]
  const out = [], swing = (S.swing || 0) * SPB / 4;
  if (tr.pattern) {
    const steps = tr.steps || 16, stepSec = 4 * SPB / steps, pat = tr.pattern.replace(/\s|\|/g, '');
    const [b0, b1] = tr.bars || [0, Math.ceil(DUR / (4 * SPB))];
    for (let s = b0 * steps; s < b1 * steps; s++) {
      const ch = pat[(s - b0 * steps) % pat.length], vel = { X: 1, x: 0.8, o: 0.45 }[ch];
      if (vel) out.push({ t: s * stepSec + (s % 2 ? swing : 0), freqs: [tr.note ? hz(tr.note) : 0], dur: stepSec, vel });
    }
  }
  if (tr.notes) {
    const loop = tr.loop || 0, start = tr.from || 0, end = tr.to ?? DUR / SPB;
    for (let off = start; off < end; off += loop || Infinity) {
      for (const [b, n, len = 1, vel = 0.8] of tr.notes) {
        const beat = off + b; if (beat >= end) continue;
        out.push({ t: beat * SPB, freqs: (Array.isArray(n) ? n : [n]).map(hz), dur: len * SPB, vel });
      }
      if (!loop) break;
    }
  }
  return out;
}

// Kick hits drive sidechain ducking for any track with "duck".
for (const tr of S.tracks || []) if (tr.voice === 'kick') for (const e of events(tr)) kickTimes.push(e.t);
kickTimes.sort((a, b) => a - b);
let duckCache = {};
function duckEnv(depth) {
  if (duckCache[depth]) return duckCache[depth];
  const e = new Float32Array(N).fill(1); let k = 0;
  for (let i = 0; i < N; i++) { const t = i / SR; while (k + 1 < kickTimes.length && kickTimes[k + 1] <= t) k++;
    if (kickTimes.length && kickTimes[k] <= t) e[i] = 1 - depth * Math.exp(-(t - kickTimes[k]) / 0.11); }
  return (duckCache[depth] = e);
}

for (const tr of S.tracks || []) {
  const voice = VOICES[tr.voice]; if (!voice) throw new Error('unknown voice ' + tr.voice + ' (have: ' + Object.keys(VOICES).join(', ') + ')');
  const sends = { reverb: tr.reverb || 0, delay: tr.delay || 0, duckEnv: tr.duck ? duckEnv(tr.duck) : null };
  for (const e of events(tr))
    for (const f of e.freqs) place(voice(f, e.dur, e.vel, seedCounter++), e.t, (tr.gain ?? 0.8) / Math.sqrt(e.freqs.length), tr.pan || 0, sends);
}
const hitTimes = [];
for (const c of S.cues || []) {
  const voice = VOICES[c.type]; if (!voice) throw new Error('unknown cue type ' + c.type);
  place(voice(c.note ? hz(c.note) : 0, c.dur || 0, 1, seedCounter++), c.t, c.gain ?? 0.9, c.pan || 0, { reverb: c.reverb ?? 0.15 });
  hitTimes.push(c.t);
}

// ---- sends: ping-pong delay (dotted eighth) + Freeverb-style reverb --------------
{
  const D = Math.round((S.delay_beats || 0.75) * SPB * SR), fb = 0.38;
  for (let i = D; i < N; i++) { dlyL[i] += dlyR[i - D] * fb; dlyR[i] += dlyL[i - D] * fb; }
  const dl = onePoleLP(dlyL, 3500), dr = onePoleLP(dlyR, 3500);
  for (let i = 0; i < N; i++) { L[i] += dl[i]; R[i] += dr[i]; }
}
{
  const sc = SR / 44100, room = S.room ?? 0.84, damp = 0.25;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], aps = [556, 441, 341, 225];
  const run = (spread) => {
    const out = new Float32Array(N);
    for (const c of combs) { const len = Math.round((c + spread) * sc), line = new Float32Array(len); let idx = 0, store = 0;
      for (let i = 0; i < N; i++) { const y = line[idx]; store = y * (1 - damp) + store * damp; line[idx] = revBus[i] * 0.015 + store * room; out[i] += y; idx = (idx + 1) % len; } }
    for (const a of aps) { const len = Math.round((a + spread) * sc), line = new Float32Array(len); let idx = 0;
      for (let i = 0; i < N; i++) { const b = line[idx]; line[idx] = out[i] + b * 0.5; out[i] = b - out[i]; idx = (idx + 1) % len; } }
    return out;
  };
  const rl = run(0), rr = run(23);
  for (let i = 0; i < N; i++) { L[i] += rl[i] * 3; R[i] += rr[i] * 3; }
}

// ---- master: soft clip, -1 dBFS peak, 20 ms end fade ------------------------------
let peak = 1e-9;
for (let i = 0; i < N; i++) { L[i] = Math.tanh(L[i] * 1.1); R[i] = Math.tanh(R[i] * 1.1); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
const norm = 10 ** (-1 / 20) / peak, fade = Math.round(0.02 * SR);
const wav = Buffer.alloc(44 + N * 4);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + N * 4, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28);
wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const f = i > N - fade ? (N - i) / fade : 1;
  wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * norm * f)) * 32767), 44 + i * 4);
  wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * norm * f)) * 32767), 46 + i * 4);
}
writeFileSync(outFile, wav);

if (beatsFile) {
  const beats = []; for (let t = 0; t < DUR - 1e-9; t += SPB) beats.push(+t.toFixed(3));
  writeFileSync(beatsFile, JSON.stringify({ bpm: BPM, beats, downbeats: beats.filter((_, i) => i % 4 === 0),
    hits: [...new Set(hitTimes.map((t) => +t.toFixed(3)))].sort((a, b) => a - b),
    kicks: kickTimes.map((t) => +t.toFixed(3)), source: 'synth.mjs' }, null, 1));
}
console.log(JSON.stringify({ out: outFile, seconds: +(N / SR).toFixed(2), bpm: BPM, tracks: (S.tracks || []).length, cues: (S.cues || []).length, beats: beatsFile }));
