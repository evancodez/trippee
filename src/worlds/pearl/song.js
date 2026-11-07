// What Pearl hears. Not the drums first: the voice, what's left of the voice, how wide the sound is, and where the song arrives.
//   The clock. One clock for the film's lines, slow, on the strong beats, so a line keeps its place through every change.
//   The voice. Where she's singing from: a pearl floating over the frame, high when the note's high, with its echoes following it along the same path a beat or two behind, so a sung line draws a string of them.
//   The focus. It racks on the phrase, to a new place each time, and the louder the song the more is sharp.
//   The film. It thins with the song's energy, from pale to rich, and it drains all the time, faster when it's loud.
//   The sheens. A new one comes down the frame where the song arrives somewhere, the bigger the arrival the richer the sheen.
import { clockOf } from '../../score/compose.js';
import { surgedBeats } from '../../score/react.js';
import { CALM, MIDDLE, BIG, SHEENS } from './sheens.js';
import { FLOW } from './patterns.js';

const HZ = 20;
const LINE_MOST = 0.62;        // lines a second
export const beatsPerLine = A => { const rate = (A.bpm || 120) / 60, opts = (A.meter || 4) === 3 ? [3, 6, 12] : [2, 4, 8]; return opts.find(n => rate / n <= LINE_MOST) ?? opts.at(-1); };
export function flowClock(score, A) { const N = beatsPerLine(A), tau = score.tau, R = score.react; return t => surgedBeats(R, tau, t) / N / FLOW; }

const memo = new WeakMap();
const clamp01 = x => Math.max(0, Math.min(1, x));
const smooth = u => { u = clamp01(u); return u * u * u * (u * (u * 6 - 15) + 10); };
export function hearSong(A, M) {
  if (memo.has(A)) return memo.get(A);
  const n = Math.ceil(A.duration * HZ) + 2, fps = A.fps, voiced = new Float32Array(n), y = new Float32Array(n), amt = new Float32Array(n), drain = new Float32Array(n), width = new Float32Array(n);
  // The voice's range, in this song
  const P = [];
  for (let f = 0; f < A.pitch.length; f += 4) if (A.voiced[f] > 0.35) P.push(A.pitch[f]);
  P.sort((a, b) => a - b);
  const lo = P[Math.floor(P.length * 0.08)] ?? 48, hi = P[Math.floor(P.length * 0.92)] ?? 72, E = A.E || A.loud;
  let vs = 0, yy = 0, sum = 0;
  const W = A.x?.width, wHz = W?.hz ?? 10, wv = W?.value ?? W;
  for (let i = 0; i < n; i++) {
    const t = i / HZ, f = Math.min(A.pitch.length - 1, Math.round(t * fps)), v = A.voiced[f] > 0.35 ? 1 : 0;
    // Slow to come, and it takes a long time to die away: it's the reverb that's left.
    vs += (v - vs) * (v > vs ? 1 / (1.1 * HZ) : 1 / (5.5 * HZ));
    if (v) yy += (((A.pitch[f] - lo) / Math.max(hi - lo, 1)) * 2 - 1 - yy) * (1 / (0.9 * HZ));
    voiced[i] = vs; y[i] = yy;
    amt[i] = v ? Math.max(-1, Math.min(1, ((A.pitch[f] - lo) / Math.max(hi - lo, 1)) * 2 - 1)) : amt[Math.max(0, i - 1)] * 0.97;
    // Draining: nm a second, faster when it's loud
    const e = E ? clamp01(E[Math.min(E.length - 1, f)] ?? 0.5) : 0.5;
    sum += (22 + 75 * e) / HZ;
    drain[i] = sum;
    width[i] = wv?.length ? wv[Math.min(wv.length - 1, Math.round(t * wHz))] : 0.25;
  }
  // The focus racks on the phrase: every so many bars, to somewhere else.
  const bars = M?.bars?.length ? M.bars : Array.from({ length: Math.ceil(A.duration / 2) }, (_, i) => i * 2), each = 2 + ((M?.meter ?? 4) === 3 ? 2 : 0), racks = [];
  let seed = 7;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 8) / 16777216; };
  let py = 0;
  for (let i = 0; i < bars.length; i += each) { let q = 0; do { q = -0.8 + 1.6 * rnd(); } while (Math.abs(q - py) < 0.55); py = q; racks.push({ t: bars[i], y: q, a: 1.57 + 0.9 * (rnd() - 0.5) }); }
  // The sheens
  const washes = [{ t: -99, s: 0, dir: 0 }], end = A.duration, bigOnes = [...(M?.arrivals?.(0.2) ?? [])].filter(a => a.t > 6 && a.t < end - 6).sort((a, b) => a.t - b.t);
  const APART = 18, LONGEST = 30;
  let last = 0;
  const pick = (a, prev, two) => { const list = a >= 0.55 ? BIG : a >= 0.3 ? MIDDLE : CALM; return list.find(s => s !== prev && s !== two) ?? list[0]; };
  const plan = [];
  for (const a of bigOnes) { if (a.t - last < APART) continue; while (a.t - last > LONGEST + APART) { last += LONGEST; plan.push({ t: last, a: 0.15 }); } plan.push(a); last = a.t; }
  while (end - last > LONGEST) { last += LONGEST; plan.push({ t: last, a: 0.15 }); }
  let cur = 0, prev = -1, turn = 0;
  for (const p of plan) { const s = pick(p.a, cur, prev); prev = cur; cur = s; washes.push({ t: p.t, s, dir: (turn++ * 2.2) % 6.283, big: p.a }); }
  const out = { hz: HZ, n, voiced, y, amt, drain, width, racks, washes, id: A.hash ?? String(A.duration) };
  out.whoa = whoaOf(out, A, M);
  memo.set(A, out);
  return out;
}
const rd = (a, t) => { const x = Math.max(0, Math.min(a.length - 1.001, t * HZ)), i = Math.floor(x); return a[i] + (a[i + 1] - a[i]) * (x - i); };
export const voiceAt = rd;

// Where the focus is: on its way to the next place for the last of each stretch.
const RACK = 2.4;
export function focusAt(song, t) {
  const r = song.racks;
  if (!r?.length) return [0.6 * Math.sin(t * 0.17), 1.57 + 0.5 * Math.sin(t * 0.07)];
  let lo = 0, hi = r.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (r[m].t <= t) lo = m; else hi = m - 1; }
  const a = r[lo], b = r[lo + 1];
  if (!b) return [a.y, a.a];
  const k = smooth((t - (b.t - RACK)) / RACK);
  return [a.y + (b.y - a.y) * k, a.a + (b.a - a.a) * k];
}

// The wash that's on, or the sheen that's up. front 0..1
const WASH = 7.5;
export function sheenAt(song, t) {
  const w = song?.washes;
  if (!w) { const k = t / 34, i = Math.floor(k); return { from: ((i % SHEENS.length) + SHEENS.length) % SHEENS.length, to: (((i + 1) % SHEENS.length) + SHEENS.length) % SHEENS.length, x: clamp01((k - i - 0.75) / 0.25), dir: i * 2.2 }; }
  let lo = 0, hi = w.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (w[m].t <= t) lo = m; else hi = m - 1; }
  const on = w[lo];
  return { from: lo ? w[lo - 1].s : on.s, to: on.s, x: clamp01((t - on.t) / WASH), dir: on.dir };
}

// Where the voice is at time t, and how strong. It goes across the frame slowly on its own, and up and down with the note. It stays where the frame is.
export function voiceSpot(song, t, out) {
  const v = song ? rd(song.voiced, t) : 0.6 + 0.4 * Math.sin(t * 0.31), y = song ? rd(song.y, t) : Math.sin(t * 0.23);
  out[0] = 1.25 * Math.sin(t * 0.103 + 1.1) + 0.3 * Math.sin(t * 0.37);
  out[1] = 0.56 * y + 0.08 * Math.sin(t * 0.61);
  out[2] = v;
  return out;
}

// The whoa: a long high note, and the arrival that follows it. The film goes as thin as it can in the 12 seconds before, the frame all one river, and then the richest sheen comes down.
export function whoaOf(song, A, M) {
  const room = t => t > 14 && t < A.duration - 10;
  const big = [...(M?.arrivals?.(0.25) ?? [])].filter(a => room(a.t)).map(a => {
    let held = 0;
    for (let t = a.t - 8; t < a.t; t += 0.1) held += rd(song.voiced, t) * Math.max(0, rd(song.y, t) + 0.2) * 0.1;
    return { t: a.t, a: a.a, held, s: a.a * (1 + held) };
  }).sort((p, q) => q.s - p.s)[0];
  return big ? { t: big.t, before: 12, after: 8, why: `the film runs out thin over a held voice (${big.held.toFixed(1)}), then the richest sheen comes down on the arrival (${big.a.toFixed(2)})` } : null;
}
