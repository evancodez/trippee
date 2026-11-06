// Lock and Tumblers. See docs/NEXT.md 2.2 and src/gl/chunks/moves.js: the shader cuts the picture into bands and looks up how far each has slipped, and all the motion is worked out here.
//
// The Countdown: a dial shatters, its rings lock one per bar from the outside in, and the last falls on the downbeat. Nothing morphs: every line only slides. While it runs the rings
// surge on the strong beats and glide between, and the tune travels out through the rings that are still loose. Flow is held until that downbeat, then lets go over a bar.
//   placeCountdown(score, pattern, { L, meter }) puts one in a composed film. countdown(pattern, { L, score, meter }) is the gesture alone.
// Lock: lockMove(...) on a gesture of plain stripes, checks or rays.
import { OFF, FAMILIES } from '../../pattern/layout.js';
import { clamp, lerp, smoother, evalTrack, rng } from '../curves.js';
import { reactAt } from '../react.js';
import { flag } from '../flags.js';

const num = p => OFF[p];
const TAU = Math.PI * 2;
const TABLE = ['slip.left', 'slip.step', 'slip.ease', 'slip.seed', 'spare.a', 'spare.b', 'spare.c', 'spare.d'].map(num);   // how far each of the nearest eight bands has slipped
export const MOST_BANDS = TABLE.length;
const CRACK = 0.25;     // beats from one band breaking to the next: it starts in the middle and spreads to the rim
const SURGE = 0.6;      // how much of a band's speed comes and goes with the strong beats
const TUNE = 0.3;       // cycles a loose ring moves with the tune, each a little after the one inside it
const TUNE_LAG = 0.16;  // seconds

// One band's whole run: at rest and whole until it breaks, then a kick, a coast, surging on the strong beats (1 and 3, or the 1 in 3/4), and it comes to rest exactly on its beat. Whole numbers of
// cycles from start to finish, so it leaves the picture as it finds it. D is how long it runs, in beats.
function runOf(i, T, step, ease, seed) {
  const D = T - i * (step + CRACK);
  if (D <= 0) return null;
  // The last few spin faster and take longer to settle, like a wheel coming to rest, so the eye is on the last one when it falls
  const near = Math.max(0, 1 - i / 3), r = rng(seed * 97 + i * 13 + 1), W = lerp(0.12, 0.28, r()) * (1 + 1.2 * near), K = lerp(0.35, 0.85, r());
  const P = step % 3 === 0 ? 3 : 2, B = TAU / P, A = SURGE / B;
  const Ds = D + A * Math.sin(B * D), e = Math.min(ease * (1 + near), step, 0.5 * Ds), e0 = Math.min(0.75, 0.25 * Ds), Q = Ds - 0.5 * (e + e0);
  return { D, Ds, B, A, e, e0, Q, K, kick: Math.min(2, D), sign: i % 2 ? -1 : 1, w: (Math.max(1, Math.round(W * Q + K)) - K) / Q };
}
// x: beats until this band locks.
function slipOfRun(b, x) {
  x = Math.min(x, b.D);
  const X = x + b.A * Math.sin(b.B * x), { e, e0, Ds, Q } = b;
  const q = X <= e ? X * X / (2 * e) : X < Ds - e0 ? X - 0.5 * e : Q - (Ds - X) * (Ds - X) / (2 * e0);
  return b.sign * (b.w * q + b.K * (1 - smoother((b.D - x) / b.kick)));
}
const runsOf = (T, step, ease, seed) => Array.from({ length: MOST_BANDS }, (_, i) => runOf(i, T, step, ease, seed));

function writeOn(out, m) {
  out[num('slip.kind')] = m.kind; out[num('slip.n')] = m.n;
  const mm = m.m || [0, 1, 0, 0];
  for (let i = 0; i < FAMILIES; i++) out[num(`slip.m${i}`)] = mm[i];
}

function writeTumblers(out, runs, left, step, tuneAt, way = 1) {
  for (let i = 0; i < MOST_BANDS; i++) {
    const b = runs[i], x = left - i * step;
    if (!b || x <= 0 || x >= b.D) { out[TABLE[i]] = 0; continue; }     // locked, or still whole
    let l = slipOfRun(b, x);
    if (tuneAt) l += TUNE * tuneAt(i) * smoother(x / 2) * smoother((b.D - x) / 2);
    out[TABLE[i]] = way * l;
  }
}

// Which way a family runs tells where it can be cut: bands along it, so a whole isometry of each band is a slide of its lines.
export function slipFor(s) {
  for (let i = 0; i < FAMILIES; i++) {
    if (s[OFF[`f${i}.on`]] < 0.5 || Math.abs(s[OFF[`f${i}.d`]]) > 0.98) continue;
    const g = n => s[OFF[`f${i}.${n}`]], m = [0, 0, 0, 0]; m[i] = 1;
    const radial = Math.abs(g('r1')) + Math.abs(g('l1')) + Math.abs(g('r2')) + Math.abs(g('l2')), turn = Math.abs(g('t1')), plane = Math.hypot(g('x'), g('y'));
    if (turn > 1e-3 && radial < 1e-3 && plane < 1e-3) return { kind: 2, n: 4.4, m };
    if (plane > 1e-3 && radial < 1e-3 && turn < 1e-3) return { kind: 1, n: 2 * plane, ang: Math.atan2(g('y'), g('x')) + Math.PI / 2, m };
  }
  return null;
}

// Straight cuts only where the bands stay at least 90 px wide at 1080p, or it reads as aliasing: at most this many a unit, at scale 1.
const WIDEST_N = 540 / 90;

export default {
  id: 'slip',
  // Can this slot wear it? A dial can; otherwise a family has to run along the bands.
  needs(slot, G) { return !!(G?.pattern?.slip || slipFor(slot)); },
  write(out, { u, t, phi, G, m }) {
    // A travel of its own, along the gesture's long move, so that it can come to rest on a beat and start again
    if (m.travel) {
      const at = G.t0 + u * ((G.arcEnd ?? G.t1) - G.t0);
      out[num('scale')] = Math.exp(evalTrack(m.travel.scale, at));
      out[num('rot')] = evalTrack(m.travel.rot, at);
    }
    if (m.whitney) {    // Whitney bars: band n has slipped n times this many cycles, so a whole number is the plain rays, a half is a dartboard, and everything between is spirals
      const v = evalTrack(m.whitney, m.tau(t));
      if (Math.abs(v - Math.round(v)) > 1e-4) { writeOn(out, m); out[num('slip.u')] = v; out[num('slip.ang')] = 0; }
    }
    else if (m.lock) {       // Lock: only ever grows, and a whole cycle is nothing
      const v = evalTrack(m.lock, m.tau(t));
      if (v > 0 && v < 1) { writeOn(out, m); out[num('slip.u')] = v; out[num('slip.ang')] = m.ang ?? 0; }
    }
    else if (m.lockT != null) {   // Tumblers: off before the shatter and after the lock, where it's exactly the same picture
      const left = m.tau(m.lockT) - m.tau(t);
      if (left > 0 && left < m.T) {
        writeOn(out, m);
        out[num('slip.ang')] = 0;
        m.runs ??= runsOf(m.T, m.step, m.ease, m.seed);
        const R = m.react;
        // The tune: a voice going up moves the loose rings one way and going down, back. It leaves the middle and reaches each ring a moment later than the last.
        writeTumblers(out, m.runs, left, m.step, R ? i => { const c = t - i * TUNE_LAG, s = reactAt(R, R.C ? R.C(c) : c); return s.melSlow * s.voiced; } : null, m.mirror ? -1 : 1);
      }
    }
    // Flow is held until the downbeat, then lets go over a bar. Whatever else pours starts only then.
    const h = m.hold;
    if (h) {
      const x = clamp((t - h.t) / h.release), w = x * x * (3 - 2 * x), now = w >= 1 ? phi : h.phi + (phi - h.phi) * w;
      const flow = G.flow || G.pattern.flow;
      if (flow) for (const p in flow) out[num(p)] += flow[p] * (now - phi);
      if (h.pour) for (const p in h.pour) out[num(p)] += h.pour[p] * (now - h.phi);
      // ...and what's been held back goes off on the downbeat: whole cycles, so where it ends up is no different
      if (h.kick) { const k = 1 - smoother((t - h.t) / (2 * h.release)); for (const p in h.kick) out[num(p)] += h.kick[p] * k; }
    }
  },
};

// Hearing 9: Whitney bars. Rays on one bar line, a dartboard on the next, and spirals scattering between. A staircase in slip.u, C2, resting on each step, which only goes up. It starts and ends on a whole number, so it leaves the picture as it finds it.
// Speed at the rim goes as bands x slip.u's speed x two edges a cycle, so a step takes as many bars as keep that under the limit.
export const WHITNEY = { kind: 3, n: 1.6, rim: 2.05, crossings: 3.4, peak: 1.875 };
export function whitneyMove({ t0, t1, tau, meter, bar, bars }) {
  const { kind, n, rim, crossings, peak } = WHITNEY, bandsAtRim = n * (Math.log(rim) + 2);
  const secondsLeast = (0.5 * peak * bandsAtRim * 2) / crossings, every = Math.max(1, Math.ceil(secondsLeast / bar - 1e-6));
  const lines = bars.filter(b => b >= t0 && b <= t1);
  const steps = lines.filter((_, i) => i % every === 0);
  if (steps.length < 3) return null;
  const even = steps.length % 2 ? steps : steps.slice(0, -1);       // whole cycles: an even number of half steps
  const track = even.map((t, i) => ({ t: tau(t), x: i / 2, v: 0 }));
  return { id: 'slip', kind, n, m: [1, 0, 0, 0], whitney: track, tau, from: even[0], to: even.at(-1), every, bandsAtRim };
}

// The time at which tau reaches this many beats. tau only ever grows.
function timeOfBeat(tau, beat, t) {
  let lo = t - 600, hi = t + 600;
  for (let i = 0; i < 48; i++) { const mid = (lo + hi) / 2; if (tau(mid) < beat) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

// The long move. The camera follows the rings as they lock: each is just filling the frame on its beat, so the ones still loose are always what you're looking at and the board narrows
// in on the last. It comes to rest on the downbeat, and everything lets go from there. A dial that doesn't lock in rings has its own numbers: sl.scale is [start, at the lock, end].
function travelOf(sl, { bands, step, L, t0, end, tau, mirror }) {
  const rot = [{ t: L, x: 0 }, { t: end, x: (mirror ? -1 : 1) * (sl.turn ?? 0.9) }];
  if (sl.scale) { const [a, b, c] = sl.scale.map(Math.log); return { rot, scale: [{ t: t0, x: a }, { t: L, x: b }, { t: end, x: c }] }; }
  const outer = i => (sl.kind === 3 ? Math.exp((i + 1) / sl.n - 2) : (i + 1) / sl.n);
  const at = i => (i >= bands ? t0 : timeOfBeat(tau, tau(L) - i * step, L));
  const fit = i => Math.log(clamp(0.95 / outer(i), sl.widest ?? 0.65, sl.closest ?? 2.8));      // bold from the start: the first rings lock with their tops out of frame
  const K = [];
  for (let i = bands; i >= 0; i--) K.push({ t: at(i), x: fit(i), v: 0 });
  for (let j = 1; j < K.length - 1; j++) K[j].v = (K[j + 1].x - K[j - 1].x) / (K[j + 1].t - K[j - 1].t);
  K.push({ t: end, x: K.at(-1).x + Math.log(1.15), v: 0 });
  return { rot, scale: K };
}

// A whole Countdown gesture, on a dial (family 'dials'): its data's in pattern.slip. Whatever comes before transforms into it as usual and lands at its t0, with the board whole.
//   L       seconds: the downbeat the last ring falls on
//   score   needs tau(t) in beats; phi(t, G) and react if it has them
//   meter   beats per bar. step is one bar, or two if that keeps the run at 12-24 s
//   t1, morph, seed: the gesture's end and its morph, as usual. lead: bars of the whole board before it breaks. mirror: everything the other way, for a section played again.
//   longest: seconds the run may take, at most 24
// The run is one ring per step, cut to fit by leaving the outermost rings whole, four at the least. It returns { t0, t1, pattern, flow, arcs, moves, range, fixedRange, ... }.
export function countdown(pattern, { L, score, meter = 4, t1, morph = 0, seed = 1, lead = 0, mirror = false, longest = 24 }) {
  const { tau } = score, sl = pattern.slip;
  const beat = 1 / Math.max(tau(L + 0.5) - tau(L - 0.5), 1e-3), bar = beat * meter;
  let step = meter, bands = Math.min(sl.bands, MOST_BANDS);
  const run = (b, s) => (b - 1) * (s + CRACK) + s;
  if (run(bands, step) * beat < 12) step = 2 * meter;
  while (bands > 4 && run(bands, step) * beat > longest) bands--;
  if (run(bands, step) * beat > longest) step = meter;
  while (bands > 4 && run(bands, step) * beat > longest) bands--;
  const T = run(bands, step), t0 = timeOfBeat(tau, tau(L) - T - lead * meter, L), end = t1 ?? L + Math.max(12, 8 * bar);
  const travel = travelOf(sl, { bands, step, L, t0, end: Math.min(end, L + 40), tau, mirror });
  const G = { t0, t1: end, arcEnd: Math.min(end, L + 40), pattern, morph, arcs: [], flow: pattern.flow, range: [0, 1], fixedRange: true };
  G.moves = [{ id: 'slip', kind: sl.kind, n: sl.n, m: sl.m, seed, tau, lockT: L, T, step, ease: sl.ease ?? 2, travel, react: score.react, mirror,
    hold: { t: L, release: bar, phi: score.phi ? score.phi(L, G) : 0, pour: sl.pour, kick: sl.kick } }];
  return G;
}

// Puts a Countdown into a composed film and makes room for it, for the director. L is a landing's time. The gesture before it now ends where the board arrives, with its morph
// kept, and whatever else lay in the way is gone. The Countdown runs to the next landing at least `past` seconds after L, and morphs out as that gesture would have. Returns it, or null if it won't fit.
export function placeCountdown(score, pattern, { L, meter = 4, seed = 1, lead = 0, past = 12, mirror = false }) {
  if (!flag('slip')) return null;
  const g = score.gestures, b = g.findIndex(x => x.t1 >= L + past);
  if (b < 0) return null;
  const G = countdown(pattern, { L, score, meter, t1: g[b].t1, morph: g[b].morph ?? 0, seed, lead, mirror, longest: Math.min(24, L - g[0].t0 - 8) });
  let a = g.findIndex(x => x.t1 > G.t0);
  while (a > 0 && G.t0 - g[a].t0 < Math.max(10, (g[a].morph ?? 0) * 1.5)) a--;
  if (a < 0 || a >= b || G.t0 - g[a].t0 < 6) return null;     // no room for what's before it to arrive
  const A = g[a];
  A.t1 = G.t0; A.plan = A.planFor = A.planning = null;
  A.morph = Math.min(A.morph ?? 8, (G.t0 - A.t0) * 0.7);
  g.splice(a + 1, b - a, G);
  return G;
}

// Lock, on plain stripes, checks or rays: rests on 0, 1/4, 1/3, 1/2, 2/3, 3/4, 1 at bars 0, 2, 3, 4, 5, 6, 8 from a phrase's downbeat, and only ever grows. At 1/2 a checker nobody drew;
// at 1, nothing at all. Add what this returns to G.moves. t is the phrase's downbeat, smallest the gesture's smallest scale over the 8 bars, so straight cuts are never too fine to read.
export function lockMove(slot, { t, tau, meter = 4, smallest }) {
  const f = flag('slip') ? slipFor(slot) : null;
  if (!f) return null;
  const n = f.kind === 1 ? f.n / Math.ceil(f.n / (WIDEST_N * (smallest ?? slot[OFF.scale]))) : f.n;
  const b0 = tau(t), R = [[0, 0], [2, 1 / 4], [3, 1 / 3], [4, 1 / 2], [5, 2 / 3], [6, 3 / 4], [8, 1]];
  return { id: 'slip', kind: f.kind, n, ang: f.ang, m: f.m, tau, lock: R.map(([b, x]) => ({ t: b0 + b * meter, x })) };
}

// A dial shown by itself, with no countdown to fall on: it comes apart and locks over and over. Its own drive, off with the flag.
const idleRuns = new WeakMap();
export function idle(out, { phi, G }, sl) {
  if (G.moves?.length || !flag('slip')) return;
  const bands = Math.min(sl.bands, MOST_BANDS), T = (bands - 1) * (2 + CRACK) + 2, P = T + 8, x = ((-phi * 8 % P) + P) % P;
  if (x <= 0 || x >= T) return;
  let runs = idleRuns.get(sl);
  if (!runs) idleRuns.set(sl, runs = runsOf(T, 2, sl.ease ?? 2, 1));
  writeOn(out, sl);
  writeTumblers(out, runs, x, 2, null);
}

// ---------------------------------------------------------------- the Countdown, as a hand cut wears it
// The ticking Countdown of src/score/direct.js (ringRuns, tickClock and these numbers are its own, and a film with no cut never comes here), on a gesture a cut has already laid out, so nothing's spliced
// or searched for. It differs in how it lets go. At the director's it takes a bar to pick up, and its long move sets off from rest, so a lock reads a second or two late. Here everything arrives on the hit
// and lets go at once: flow in `release` bars, and the sheet leaves at speed.
//   L        the picture's seconds: the hit the last ring falls on
//   from     the picture's seconds: where the board has landed, so the run starts no earlier. Before the run it's coming in, bigger and turned, so it's never at rest
//   end      when the sheet's long move has to be over: where the gesture's clock comes to rest
//   grow     how much bigger the board is, for a return
//   release  bars the flow takes to let go. leave: how much faster than its average the sheet leaves
//   before   { scale, rot }: knots the sheet is already on, ln x for scale, if this dial has been showing for a while. It goes on from there to where the rings want it, and nothing has to change to get there.
// Returns { move, start }, start being when the first ring breaks, or null if there isn't room for four rings.
const RING_CRACK = 0.25, RING_SURGE = 0.95, RING_TUNE = 0.35, RING_TUNE_OFF = 2, BOARD_ARRIVES = [1.35, 0.32], BOARD_SETTLES = 2, RUN_LEAST = 9;
const ringRuns = (T, step, seed, P, mirror) => Array.from({ length: MOST_BANDS }, (_, i) => {
  const D = T - i * (step + RING_CRACK);
  if (D <= 0) return null;
  const w = 1 / P, e = P / 2, e0 = Math.min(0.75, 0.25 * D), Q = D - 0.5 * (e + e0), kick = Math.min(2, D);
  return { D, Ds: D, B: 0, A: 0, e, e0, Q, K: Math.ceil(w * Q) - w * Q, kick, sign: (i % 2 ? -1 : 1) * (mirror && i ? -1 : 1), w };
});
const tickClock = (tau, L, P, W) => {
  const b0 = tau(L);
  return t => {
    const y = b0 - tau(t), k = Math.round(y / P), d = y - k * P;
    return -(k * P + (Math.abs(d) >= W / 2 ? Math.sign(d) * P / 2 : P * (smoother(d / W + 0.5) - 0.5)));
  };
};
export function countdownOn(G, pattern, { L, score, meter = 4, seed = 1, mirror = false, grow = 1, release = 0.5, leave = 2.2, from = G.t0, end = G.arcEnd ?? G.t1, before = {} }) {
  const { tau } = score, sl = pattern.slip;
  if (!sl || !flag('slip') || !tau) return null;
  const spb = 1 / Math.max(tau(L + 0.5) - tau(L - 0.5), 1e-3), bar = spb * meter, longest = Math.min(24, L - from);
  const W = meter * RING_SURGE, run = (n, st) => (n - 1) * st + meter + W / 2;
  let step = meter, bands = Math.min(sl.bands, MOST_BANDS);
  if (run(bands, step) * spb < 12) step = 2 * meter;
  while (bands > 4 && run(bands, step) * spb > longest) bands--;
  if (run(bands, step) * spb > longest) step = meter;
  while (bands > 4 && run(bands, step) * spb > longest) bands--;
  if (run(bands, step) * spb > longest || longest < RUN_LEAST) return null;
  const T = (bands - 1) * step + 1.5 * meter - 0.02, start = timeOfBeat(tau, tau(L) - run(bands, step) - 0.05, L);
  const edge = sl.scale ? null : (sl.kind === 3 ? Math.exp(bands / sl.n - 2) : bands / sl.n);
  const s0 = (sl.scale ? sl.scale[1] : clamp(1.72 / edge, sl.widest ?? 0.65, sl.closest ?? 2.8)) * grow;
  const way = mirror ? -1 : 1, turn = way * (sl.turn ?? 0.9), first = Math.min(from, start - 0.01), settled = Math.min(timeOfBeat(tau, tau(start) + BOARD_SETTLES * meter, start), L - 1);
  // It leaves at speed and coasts to rest at `end`. A knot half a bar on, reached from standing, so the speed picks up with the flow.
  // ...and it doesn't try to go as far in less time. With a dozen seconds it goes all the way, as the director's does.
  const r = release * bar, rest = end - L - r, far = clamp(rest / 12, 0.3, 1);
  const on = (knots, x) => { const k = knots?.filter(q => q.t < settled - 0.5); return k?.length ? k : [{ t: first, x, v: 0 }]; };
  const out = (x0, x1) => (rest > 1 ? (v => [{ t: L + r, x: x0 + 0.5 * v * r, v }, { t: end, x: x1, v: 0 }])(leave * (x1 - x0) / rest) : [{ t: Math.max(end, L + 1), x: x1, v: 0 }]);
  const travel = {
    rot: [...on(before.rot, way * BOARD_ARRIVES[1]), { t: settled, x: 0, v: 0 }, { t: L, x: 0, v: 0 }, ...out(0, turn * far)],
    // On log rings that much bigger is half a ring out, which with the turn's half a spoke would make the same picture again and it wouldn't be seen to arrive
    scale: [...on(before.scale, Math.log(s0 * (sl.kind === 3 ? 1.2 : BOARD_ARRIVES[0]))), { t: settled, x: Math.log(s0), v: 0 }, { t: L, x: Math.log(s0), v: 0 }, ...out(Math.log(s0), Math.log(s0) + Math.log(1.5) * far)],
  };
  // The tune still moves the loose rings, a little, and lets go as the run starts and as it ends, so the last ring comes to rest by itself.
  let react = score.react;
  if (react?.voiced) {
    const voiced = react.voiced.slice(), cA = (react.C ? react.C(start) : start) * react.hz, cB = (react.C ? react.C(L) : L) * react.hz, off = RING_TUNE_OFF * spb * react.hz;
    for (let i = Math.max(0, Math.floor(cA)); i < voiced.length && i <= cB + 1; i++) voiced[i] *= RING_TUNE * smoother((i - cA) / off) * smoother((cB - i) / off);
    react = Object.assign(Object.create(react), { voiced });
  }
  const move = { id: 'slip', kind: sl.kind, n: sl.n, m: sl.m, seed, tau: tickClock(tau, L, meter, W), lockT: L, T, step, ease: sl.ease ?? 2, runs: ringRuns(T, step, seed, meter, mirror), travel, react, mirror: false,
    hold: { t: L, release: r, phi: score.phi ? score.phi(L, G) : 0, pour: sl.pour, kick: sl.kick } };
  return { move, start };
}
