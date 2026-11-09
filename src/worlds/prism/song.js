// What Prism hears. Three things move its colour, each on its own scale of time:
//   the strong beats push the colour along the pattern's own lines (a flow clock, surged on the beat, read each frame: flowAt);
//   the harmony and the song's big arrivals turn the whole wheel (a centre hue, baked here once per song: hearPrism, centreAt);
//   how big the song is opens the spectrum, and the tune bends it, as the frame's state, which pours out from the middle (read each frame from the song's own tables).
import { surgedBeats } from '../../score/react.js';

export const HZ = 20;
const EASE = 4, BIG_EASE = 6;      // seconds a turn of the wheel takes where it starts, and the half turn at the biggest arrival. It takes 2.6 s more to pour out across the bands. Quicker, the whole frame's red against cyan went up and back inside a second (PPP 71 s)
const APART = 14, LONGEST = 26;     // seconds between turns: at most and at least
const DRIFT = 0.0016;       // turns of the wheel a second, always: about one in ten minutes
const PER_FIFTH = 0.03, MINOR = 0.035;      // a chord a fifth away turns it this far, and a minor one cools it
const relMajor = c => (c & 1 ? ((c >> 1) + 3) % 12 : c >> 1);
const fifths = (from, to) => { let q = (((to - from) * 7) % 12 + 12) % 12; if (q > 6) q -= 12; return q; };
const smoother = x => { x = Math.max(0, Math.min(1, x)); return x * x * x * (x * (x * 6 - 15) + 10); };
const memo = new WeakMap();

// The wheel's turns, from the song as understand() heard it. The home key sets where it starts, round the circle of fifths. Each arrival turns it, the biggest one half way round, to the opposite colours.
export function hearPrism(A, M) {
  if (memo.has(A)) return memo.get(A);
  const end = A.duration, n = Math.ceil((end + 8) * HZ), centre = new Float32Array(n);
  const home = M?.home ?? { c: (A.key ?? 0) * 2 }, start = (((((home.c >> 1) * 7) % 12) + 12) % 12) / 12 + 0.04;
  // Turns: the arrivals, never closer than APART, and something at least every LONGEST
  const picked = [];
  const all = M?.arrivals?.(0.22) ?? [];
  for (const a of all) if (a.t > 8 && a.t < end - 6 && picked.every(p => Math.abs(p.t - a.t) >= APART)) picked.push(a);
  const biggest = picked.slice(0, all.length > 6 ? 2 : 1).map(p => p.t);
  picked.sort((p, q) => p.t - q.t);
  const bars = M?.bars ?? [], turns = [];
  const atBar = want => (bars.length ? bars.reduce((b, x) => (Math.abs(x - want) < Math.abs(b - want) ? x : b), bars[0]) : want);
  [{ t: 0, a: 0 }, ...picked, { t: end, a: 0 }].forEach((p, i, list) => {
    if (i) turns.push(p);
    const q = list[i + 1];
    if (!q) return;
    const gaps = Math.floor((q.t - p.t) / LONGEST);
    for (let k = 1; k <= gaps; k++) turns.push({ t: atBar(p.t + (k * (q.t - p.t)) / (gaps + 1)), a: 0.15 });
  });
  turns.pop();      // the end of the song isn't a turn
  let sign = 1;
  const steps = turns.map(p => {
    if (biggest.includes(p.t)) return { t: p.t, d: 0.5, big: true };
    sign = -sign;
    return { t: p.t, d: sign * (0.12 + 0.14 * Math.min(1, p.a / 0.7)) };
  });
  // The chord in the air, as a small lean of the wheel, eased so a change takes about a beat
  const runs = M?.runs ?? [], lean = new Float32Array(n);
  let r = 0;
  for (let i = 0; i < n; i++) {
    const t = i / HZ;
    while (r + 1 < runs.length && runs[r + 1].t0 <= t) r++;
    const c = runs[r]?.c;
    lean[i] = c == null ? 0 : PER_FIFTH * fifths(relMajor(home.c), relMajor(c)) - ((c & 1) && !(home.c & 1) ? MINOR : 0);
  }
  const k = Math.exp(-1 / (HZ * 0.35));
  for (let i = 1; i < n; i++) lean[i] = k * lean[i - 1] + (1 - k) * lean[i];
  for (let i = n - 2; i >= 0; i--) lean[i] = k * lean[i + 1] + (1 - k) * lean[i];
  for (let i = 0; i < n; i++) {
    const t = i / HZ;
    let v = start + DRIFT * t + lean[i];
    for (const s of steps) { if (t <= s.t) break; v += s.d * smoother((t - s.t) / (s.big ? BIG_EASE : EASE)); }
    centre[i] = v;
  }
  const out = { centre, steps, id: A.hash ?? String(A.duration) };
  memo.set(A, out);
  return out;
}
export const centreAt = (song, t) => { const c = song.centre, x = Math.max(0, Math.min(c.length - 1.001, t * HZ)), i = Math.floor(x); return c[i] + (c[i + 1] - c[i]) * (x - i); };

// Turns of the colour along the lines, a strong beat at a time: it surges just after one and glides to the next, so it's locked to the song and never jolts.
export const BEATS_PER_TURN = 16;
export function flowAt(score, t) {
  if (score?.react && score.tau) return surgedBeats(score.react, score.tau, t) / BEATS_PER_TURN;
  return t * 0.09;
}
// A table of the song's, read anywhere (src/score/react.js keeps them at R.hz, on the collapsed axis)
export const readR = (R, arr, c) => { if (!arr) return 0; const x = Math.max(0, Math.min(R.n - 1.001, c * R.hz)), i = Math.floor(x); return arr[i] + (arr[i + 1] - arr[i]) * (x - i); };

// prism12: the colour flows out through the pattern, a band at a time. On every strong beat each band's colour moves on to the next band out (it surges just after the beat and glides into the next one, as the flow does),
// and at every turn of the wheel (the song's sections) it turns round over FLIP seconds and flows the other way, in towards the middle. Counted in bands, so the shader's step from one band to the next is what a beat moves.
export const BANDS_PER_PULSE = 1;
const SURGE = 0.42, FLIP = 2.4;
function pulseCount(R, tau, t) {
  const P = R.pulses;
  if (!P || P.length < 2) return t * 0.5;
  if (t < P[0]) return (t - P[0]) / Math.max(P[1] - P[0], 0.5);
  const N = P.length - 1;
  if (t >= P[N]) return N + (t - P[N]) / Math.max(P[N] - P[N - 1], 0.5);
  let lo = 0, hi = N;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m] <= t) lo = m; else hi = m; }
  const b0 = tau(P[lo]), b1 = tau(P[lo + 1]), x = Math.max(0, Math.min(1, (tau(t) - b0) / Math.max(b1 - b0, 1e-3)));
  return lo + x + (SURGE / (2 * Math.PI)) * Math.sin(2 * Math.PI * x);
}
// The way the colour flows, +1 out and -1 in, turning round smoothly at each of the wheel's turns
const dirAt = (steps, t) => { let s = 1; for (const p of steps) { const x = (t - p.t + FLIP / 2) / FLIP; if (x <= 0) break; s *= 1 - 2 * smoother(x); } return s; };
const flows = new WeakMap();
// flow = the integral of dir over the pulses = dir(t)·B(t) − ∫ B dir' dτ. The last part is only nonzero while it turns round, so it's baked once per song, finely, at HZ.
export function flowBands(score, song, t) {
  const R = score?.react;
  if (!R || !score.tau || !song?.steps) return t * 0.5;
  let F = flows.get(song);
  if (!F || F.R !== R) {
    const n = song.centre.length, C = new Float32Array(n), dt = 1 / 120;
    let acc = 0, s0 = dirAt(song.steps, 0);
    for (let i = 1; i < n; i++) {
      for (let k = 1; k <= 6; k++) { const tt = (i - 1) / HZ + k * dt, s1 = dirAt(song.steps, tt); if (s1 !== s0) acc += pulseCount(R, score.tau, tt - dt / 2) * (s1 - s0); s0 = s1; }
      C[i] = acc;
    }
    flows.set(song, F = { R, C });
  }
  const x = Math.max(0, Math.min(F.C.length - 1.001, t * HZ)), i = Math.floor(x), C = F.C[i] + (F.C[i + 1] - F.C[i]) * (x - i);
  return BANDS_PER_PULSE * (dirAt(song.steps, t) * pulseCount(R, score.tau, t) - C);
}
