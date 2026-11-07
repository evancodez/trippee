// What the fold moves share: mirrors as numbers, and the numbers as slot numbers. See src/gl/chunks/fold.js for what each does.
import { OFF } from '../../pattern/layout.js';

// A mirror, for sf.m0...: a|z|^2 - 2 b.z + c = 0, |b|^2 - ac = 1. What's where it comes out positive gets reflected.
export const lineM = (nx, ny, d) => { const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n; return [0, -nx, -ny, -2 * d]; };     // reflects what's past n.z = d
export const lineAt = (turns, d) => lineM(Math.cos(turns * Math.PI * 2), Math.sin(turns * Math.PI * 2), d);
export const circleOut = (cx, cy, r) => { const a = 1 / r, x = cx * a, y = cy * a; return [a, x, y, (x * x + y * y - 1) / a]; };     // reflects what's outside it, in
export const circleIn = (cx, cy, r) => { const a = -1 / r, x = cx * a, y = cy * a; return [a, x, y, (x * x + y * y - 1) / a]; };     // reflects what's inside it, out

export function writeChain(out, mirrors, reps = 1) {
  out[OFF['sf.on']] = 1; out[OFF['sf.reps']] = reps; out[OFF['sf.n']] = mirrors.length;
  mirrors.forEach(([a, x, y, c], i) => { out[OFF[`m${i}.a`]] = a; out[OFF[`m${i}.x`]] = x; out[OFF[`m${i}.y`]] = y; out[OFF[`m${i}.c`]] = c; });
}
export function writeFan(out, { x = 0, y = 0, al = 0, rot = 0 }) {
  out[OFF['sf.on']] = 1; out[OFF['fan.x']] = x; out[OFF['fan.y']] = y; out[OFF['fan.al']] = al; out[OFF['fan.rot']] = rot;
}
export function writeLog(out, { a, b, off = 0, tw = 0 }) {
  out[OFF['sf.on']] = 1; out[OFF['lf.a']] = a; out[OFF['lf.b']] = b; out[OFF['lf.off']] = off; out[OFF['lf.tw']] = tw;
}
export function writeFeedback(out, { S, turn = 0, rx = 16 / 9, ry = 1, x = 0, y = 0, tau = 0 }) {
  out[OFF['sf.on']] = 1; out[OFF['sf.S']] = S; out[OFF['sf.turn']] = turn; out[OFF['sf.rx']] = rx; out[OFF['sf.ry']] = ry; out[OFF['sf.dx']] = x; out[OFF['sf.dy']] = y; out[OFF['sf.tau']] = tau;
}
export function writeMobius(out, [ax, ay], [bx, by], [cx, cy], [dx, dy]) {
  out[OFF['sf.on']] = 1;
  out[OFF['mob.ax']] = ax; out[OFF['mob.ay']] = ay; out[OFF['mob.bx']] = bx; out[OFF['mob.by']] = by;
  out[OFF['mob.cx']] = cx; out[OFF['mob.cy']] = cy; out[OFF['mob.dx']] = dx; out[OFF['mob.dy']] = dy;
}

// ---------------------------------------------------------------- what they all share about time and the song
import { evalTrack, clamp, smoother } from '../curves.js';
import { surged, clockOf, cueHits, handClock } from './surge.js';
import { reactAt } from '../react.js';
import { momentsOf } from '../hear.js';
import { fineness } from '../slot.js';

// Recursion goes to hairlines first. So the camera comes in on a fine sheet as it folds, until its lines are this bold, cycles per picture unit: a move, and the big shapes stay big.
export function boldUp(out, k, target = 3.4) { const f = fineness(out); if (f > target) out[OFF.scale] *= Math.pow(f / target, k); return Math.min(f, target); }

export const TAU = Math.PI * 2;
const ease = x => smoother(clamp(x));

// A cut's way in, for a move that opens over the first of its shot and shuts again before the shot's own transformation, so the next pattern gets a plain sheet.
//   beats    what it marches on: 'strong' (the default), 'half', 'bar', 'beat', or a list of song seconds
//   open, close   bars it takes to get in and to get out. Default 4 and 3.
//   stay     true: it doesn't shut, and the shot's transformation flies out of the folded sheet. Into a pattern wearing the same fold with open: 0, and times: { from } back where the change starts, the two glide into each other under the same mirrors.
//   times: { from, to }   where it runs, song seconds. Default the shot's body
// Unlike the riot set it asks the song's own reaction to carry on as it was: this sits on top of it.
export function cueFold(m, ctx) {
  const { G, bar, score, A, M } = ctx;
  m.from ??= G.t0; m.to ??= G.t1 - (G.morph || 0);
  m.calm ??= 1;
  m.open = (m.open ?? 4) * bar; m.close = (m.close ?? 3) * bar;
  m.coast ??= 2; m.lead ??= 2;
  m._R = score?.react ?? null;
  m._big = bigOf(A && M?.bar ? momentsOf(A, M) : []);
  if (!cueHits(m, ctx)) return null;
  m._P = medianGap(m.beats);
  return m;
}
const medianGap = list => { const g = []; for (let i = 1; i < list.length; i++) g.push(list[i] - list[i - 1]); g.sort((a, b) => a - b); return g[g.length >> 1] || 1; };
// How far in it is, 0 to 1. A pattern picked by hand is simply in.
export const inBy = (m, t) => (m?.beats ? (m.open > 0 ? ease((t - m.from) / m.open) : 1) * (m.stay || !(m.close > 0) ? 1 : ease((m.to - t) / m.close)) : 1);

// The song's big moments, as one number that only goes up, by how big each is, arriving through the moment. Anything that travels goes further on this, so the camera lurches on with the song and comes back to its stride.
const bigOf = list => list.filter(x => x.sign > 0 && x.s >= 0.45).map(x => [x.t - 0.4, x.s]);
const bigAt = (list, t) => { let s = 0; for (const [a, v] of list) { if (t <= a) break; s += v * ease((t - a) / 1.5); } return s; };
let seenH = null, seenB = [], seenPs = null, seenP = 1;

// The song as a fold wants it: e, how many strong beats have gone by, whole on each one; s, the same with a surge on it, so a thing that goes by s crosses each strong beat at speed and hangs between them; sec, s in about seconds, for things with a speed of their own; big, the moments so far.
// And the tune (mel, about +-1, slow), how loud (en) and how bright (tone). No song, and the clock is phi.
const now = { e: 0, s: 0, sec: 0, P: 1, big: 0, mel: 0, en: 0.6, tone: 0.5 };
export function songNow(c, ghost = 3, peak = 1.5) {
  const { t, phi, G, m } = c;
  let R = m?._R, B = m?._big;
  if (m?.beats) { now.e = evalTrack(clockOf(m), t); now.P = m._P; }
  else {
    G.calm ??= 1; now.e = handClock(c, ghost);
    const sc = globalThis.app?.stage?.score;
    R = sc?.react;
    if (sc?.hear?.moments !== seenH) { seenH = sc?.hear?.moments; seenB = bigOf(seenH ?? []); }
    B = seenB;
    if (R?.pulses !== seenPs) { seenPs = R?.pulses; seenP = seenPs?.length > 1 ? medianGap(seenPs) : 0; }
    now.P = seenP || 1 / (0.25 * ghost);
  }
  now.s = surged(now.e, peak); now.sec = now.s * now.P;
  now.big = B?.length ? bigAt(B, t) : 0;
  if (R?.energy) { const q = reactAt(R, R.C ? R.C(t) : t); now.mel = clamp(q.melSlow, -1.5, 1.5); now.en = q.energy; now.tone = q.tone; }
  else { now.mel = 0.6 * Math.sin(phi * 1.3) + 0.3 * Math.sin(phi * 3.1); now.en = 0.6; now.tone = 0.5; }
  return now;
}

// A journey along something whose every `whole` is the same picture, so it can go on for ever and still come back to nothing: it's still until `go`, goes `speed` wholes a second on the strong beats' surge, and `lurch` wholes further for each size-1 moment, and has come to rest by `stop`, on a whole number of them.
// Worked out once, from the beats, as a table. read(t) is how many wholes, and it's exact at both ends.
export function journey(m, { go, stop, speed, lurch = 0, peak = 1.5, ramp = 2 }) {
  const HZ = 60, n = Math.max(2, Math.ceil((stop - go) * HZ)), T = new Float32Array(n + 1), K = clockOf(m), B = m._big ?? [];
  let lastS = surged(evalTrack(K, go), peak), lastB = bigAt(B, go);
  for (let i = 1; i <= n; i++) {
    const t = go + i / HZ, s = surged(evalTrack(K, t), peak), b = bigAt(B, t), w = ease((t - go) / ramp) * ease((stop - t) / ramp);
    T[i] = T[i - 1] + (Math.max(0, s - lastS) * m._P * speed + (b - lastB) * lurch) * w; lastS = s; lastB = b;
  }
  const whole = Math.round(T[n]) || (T[n] > 0.2 ? 1 : 0), k = T[n] > 0 ? whole / T[n] : 0;
  for (let i = 0; i <= n; i++) T[i] *= k;
  T[n] = whole;
  return t => { const x = clamp((t - go) * HZ, 0, n), i = Math.min(n - 1, x | 0); return T[i] + (T[i + 1] - T[i]) * (x - i); };
}

// A list of numbers, one for each strong beat, as a smooth track on the beat clock. Speed is what the neighbours say, so it never overshoots a whole number and turns round at rest.
export function beatsTrack(list) {
  const n = list.length, K = [];
  for (let i = 0; i < n; i++) {
    const a = i ? list[i] - list[i - 1] : 0, b = i < n - 1 ? list[i + 1] - list[i] : 0;
    K.push({ t: i, x: list[i], v: a * b > 0 ? 2 * a * b / (a + b) : 0 });
  }
  return K;
}
