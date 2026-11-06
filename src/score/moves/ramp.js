// Ramp. A long move that hangs, draws back a hair, whips through, crosses its moment at top speed and coasts. It's the same long move, the pattern's arcs, ridden on a different clock: G.uTrack, which
// arcU in slot.js reads through evalTrack instead of running steadily. So anything arcs can do can ramp, and nothing about the pattern changes.
//
//   rampTrack(G, { hit, ... })   the knots for G.uTrack. Null if G has no long move to ride.
//     hit      song seconds. Inside the gesture, a turn with no change of pattern. At G.t0, the landing: what's arriving is already moving, and crosses the landing at top speed with nothing come to rest.
//     cap      the fastest the picture may go, in ln per second: how fast its size changes, or radians, whichever is more. The Fall's 1.2, or less if the lines would strobe (flight.js, carryOf) or flash a part of the frame (tileLimit)
//     whip     the longest the whip may take, in seconds. Default all there is
//     least    the shortest. A small move takes this long rather than go fast for no reason. Default 1.2
//     back     how far it draws back first, in ln. The Fall's .09. 0: no intake of breath
//     coast    the longest it may take to coast out, in seconds. Default what's left of the gesture
//     safe     false: only the strobe limit, not the tile flash limit. Default true
//
// From a cut, by name: { at, id, arcs: true, moves: [{ id: 'ramp', times: { hit: 64.31 } }] }. arcs: true rides the pattern's own long move, or give it arcs of its own, which is how to make it big.
// Landing on a flight this way, make it a dive: a rise needs what it's rising out of to be standing still.
//
// By hand there's no G to keep a track on, so a pattern loops the same shape by itself, in seconds: rampLoop. See src/pattern/families/relays.js.
import { OFF, SLOT_FLOATS } from '../../pattern/layout.js';
import { evalTrack, clamp } from '../curves.js';
import { fillSlot, boldRange } from '../slot.js';
import { carryOf } from '../xform/flight.js';

export const CAP = 1.2;      // the Fall's speed of crossing
const BACK = 0.09;           // and its intake of breath
const COAST_Q = 0.4;         // a coast is one quintic that starts fast and has a long end. Under .4 its speed wouldn't fall steadily

// How much of the picture changes in each step along the long move
// A family counts only while it's open: one that shuts on the way isn't the picture jumping to another size.
const FAM = [0, 1, 2, 3].map(i => ['x', 'y', 'r1', 'r2', 'l1', 'l2', 't1', 't2', 'on', 'd'].map(n => OFF[`f${i}.${n}`]));
const sizeOf = (s, [x, y, r1, r2, l1, l2, t1, t2, on, d]) => {
  if (s[on] < 0.5 || Math.abs(s[d]) > 0.98) return NaN;
  return Math.log(Math.max((Math.hypot(s[x], s[y]) + Math.abs(s[r1]) + Math.abs(s[r2]) + (Math.abs(s[l1]) + Math.abs(s[l2])) / 0.7 + (Math.abs(s[t1]) + Math.abs(s[t2])) / 4) * Math.max(s[OFF.freq], 1e-3) / Math.max(s[OFF.scale], 1e-4), 1e-3));
};
export const moveReads = s => [Math.log(Math.max(s[OFF.scale], 1e-4)), Math.log(Math.max(s[OFF.freq], 1e-3)), s[OFF.rot], s[OFF['cam.pitch']], s[OFF['cam.yaw']], s[OFF['cam.roll']], s[OFF['swirl.a']] / 2, s[OFF['fold.rot']], s[OFF['sheet.t']] / 2, ...FAM.map(f => sizeOf(s, f))];
export const moveStep = (a, b) => { let m = 0; for (let k = 0; k < a.length; k++) { const d = Math.abs(a[k] - b[k]); if (d > m) m = d; } return m; };     // NaN never wins
// The local flash limit, as a speed. Lines sweeping across a tile of the frame swing its brightness once a line, so zooming at v ln/s, with k lines per unit about a unit from the middle, makes about v * k flashes a second there.
// A family much finer than a tile averages out inside it, unless a warp bunches it up. XOR-ing another coarse family only takes some of the swing away. These rates are measured (tests/ramp.mjs), and they cost a lot: a bold pattern tops out
// around .3 to .7 ln/s, not 1.2. safe: false in rampTrack leaves only the strobe limit, for someone who'd rather look at what the flash guard makes of it.
const TILE = 0.6, RATE_ONE = 1.2, RATE_MANY = 2.4;
function tileLimit(s) {
  let most = 0, coarse = 0, warped = s[OFF['sheet.a']] !== 0 || s[OFF['ripple.a']] !== 0 || s[OFF['lens.c']] !== 1;
  for (let i = 0; i < 4; i++) {
    const [x, y, r1, r2, l1, l2, t1, t2, on, d] = FAM[i];
    if (s[on] < 0.5 || Math.abs(s[d]) > 0.98) continue;
    const k = (Math.hypot(s[x], s[y]) * s[OFF.freq] + Math.abs(s[r1]) + Math.abs(s[r2])) / Math.max(s[OFF.scale], 1e-4) + Math.abs(s[l1]) + Math.abs(s[l2]);
    if (warped || 1 / (Math.PI * Math.max(k, 1e-3) * TILE) > 0.1) { most = Math.max(most, 1.2 * k); coarse++; }
  }
  return most > 0 ? (coarse > 1 ? RATE_MANY : RATE_ONE) / most : Infinity;
}
const slot = new Float32Array(SLOT_FLOATS);
export function moveTable(G, n = 64) {
  const [lo, hi] = boldRange(G), keep = G.freezeU, vals = [];
  const lim = [];
  const at = x => { G.freezeU = lo + (hi - lo) * x; fillSlot(slot, G, G.t0, G.pattern, { phi: 0 }); return moveReads(slot); };
  for (let i = 0; i <= n; i++) { vals.push(at(i / n)); lim.push(tileLimit(slot)); }
  const R = [0], y = [0];
  for (let i = 1; i <= n; i++) {
    const r = moveStep(vals[i], vals[i - 1]) * n;
    R.push(r); y.push(y[i - 1] + r / n);
  }
  // Where it crosses: where it's moving fastest, well inside the long move so that it has a run-up and somewhere to coast to. How much the lines would strobe there.
  const i0 = Math.ceil(0.25 * n), i1 = Math.floor(0.75 * n);
  let best = i0;
  for (let i = i0; i <= i1; i++) if (R[i] > R[best] + 1e-6 || (Math.abs(R[i] - R[best]) <= 1e-6 && Math.abs(i / n - 0.5) < Math.abs(best / n - 0.5))) best = i;
  // R[i] is the step into i, so it sits half a step back. A parabola through the top finds the real peak, which the whip has to meet exactly.
  const a = R[best - 1], c = R[best + 1] ?? R[best], bend = a - 2 * R[best] + c, inside = best > i0 && best < i1, xh = clamp((best - 0.5 + (inside && bend < -1e-9 ? 0.5 * (a - c) / bend : 0)) / n);
  at(xh);
  const strobe = carryOf(1, slot, 2).v;
  G.freezeU = keep;
  return { n, R, y, xh, lim, rate: Math.max(R[best], 1e-6), strobe };
}
const invert = (T, want) => { for (let i = 1; i <= T.n; i++) if (T.y[i] >= want) return (i - 1 + (want - T.y[i - 1]) / Math.max(T.y[i] - T.y[i - 1], 1e-9)) / T.n; return 1; };
const yAt = (T, x) => { const f = clamp(x) * T.n, i = Math.min(Math.floor(f), T.n - 1); return T.y[i] + (T.y[i + 1] - T.y[i]) * (f - i); };
// The fastest the picture really goes on these knots and when, and how far that is over any limit on the way
function topSpeed(T, K, topLn) {
  const dt = 1 / 120, rate = x => { const f = clamp(x) * T.n + 0.5, i = clamp(Math.floor(f), 1, T.n - 1); return T.R[i] + (T.R[i + 1] - T.R[i]) * clamp(f - i); };
  let top = 0, when = K[0].t, over = 0;
  for (let t = K[0].t; t < K.at(-1).t; t += dt) {
    const a = evalTrack(K, t), b = evalTrack(K, t + dt), speed = rate((a + b) / 2) * Math.abs(b - a) / dt;
    if (speed > top) { top = speed; when = t + dt / 2; }
    over = Math.max(over, speed / Math.min(topLn, T.lim[Math.round(clamp((a + b) / 2) * T.n)]));
  }
  return { top, when, over };
}

export function rampTrack(G, { hit, cap = CAP, whip = Infinity, least = 1.2, back = BACK, coast = Infinity, safe = true } = {}) {
  const T = moveTable(G);
  if (!safe) T.lim.fill(Infinity);
  if (T.y[T.n] < 1e-2) return null;
  const { xh } = T, topLn = Math.min(cap, T.strobe) * 0.985, yh = yAt(T, xh), landing = hit - G.t0 < 1;
  const room = landing ? Math.min(whip, 3.5) : Math.min(whip, hit - G.t0);
  back = Math.min(back, 0.2 * yh);
  const breath = landing || back <= 0 ? 0 : 1;
  const build = v => {
    // Where the whip starts from, and how far back of where it hangs
    let xb = invert(T, 0.03 * T.y[T.n]), need = 2 * (xh - xb) / v;
    if (need < least) { v = 2 * (xh - xb) / least; need = least; }     // a small move doesn't need to rush
    const tBack = breath ? clamp(0.6 * need, 0.7, 2.2) : 0;
    if (need + tBack > room) {                                          // no time for the whole run up: it starts further along
      need = Math.max(room - tBack, 0.5);
      if (xh - v * need / 2 < 0) v = 2 * xh / need;
      xb = xh - v * need / 2;
    }
    const tb = hit - need, ta = tb - tBack, xHang = breath ? invert(T, yAt(T, xb) + back) : xb, K = [];
    if (!landing && ta - G.t0 > 0.5) K.push({ t: G.t0, x: 0, v: 0 });   // what's left is a slow move up to where it hangs
    if (breath) K.push({ t: ta, x: xHang, v: 0 });
    K.push({ t: tb, x: xb, v: 0 }, { t: hit, x: xh, v });
    // ...and it coasts as far as it has time to, from there to the end of its long move
    const end = (G.morph ? G.t1 - G.morph : G.t1) - hit, left = Math.min((1 - xh) / (COAST_Q * v), coast, Math.max(end, 0.5));
    K.push({ t: hit + left, x: Math.min(1, xh + COAST_Q * v * left), v: 0 });
    return K;
  };
  let v = topLn / T.rate, K = build(v);
  for (let i = 0; i < 5; i++) {
    const { over } = topSpeed(T, K, topLn);
    if (over <= 1) break;
    v *= 0.98 / over;
    K = build(v);
  }
  // The long move may be speeding up or slowing down by itself as it's crossed, which brings the top speed a few frames off the knot. It's the picture that has to be on the moment.
  for (let i = 0; i < 2; i++) { const off = hit - topSpeed(T, K, topLn).when; for (const k of K) k.t += off; }
  return K;
}

// The same shape going round: y(t) from 0 to D in every P seconds, with the breath and the whip inside it. Whole loops can be taken away, so a pattern that repeats when it's D bigger can go on for ever.
//   { P, D, V, back }   seconds a loop, how far, the top speed in the same units, the draw-back. Answers { n: which loop, y: how far along this one, -back..D }, and it's at top speed .6 into the moving part.
export function rampLoopKnots({ P, D, V = CAP, back = BACK }) {
  const yh = 0.42 * D, tw = 2 * (yh + back) / V, tc = (D - yh) / (COAST_Q * V), tb = clamp(0.6 * tw, 0.7, 2.2), hang = P - tw - tc - tb;
  if (hang < 0) throw new Error(`ramp: a loop of ${D} at ${V} needs ${(tw + tc + tb).toFixed(2)} s`);
  return { hit: hang + tb + tw, knots: [{ t: hang, x: 0, v: 0 }, { t: hang + tb, x: -back, v: 0 }, { t: hang + tb + tw, x: yh, v: V }, { t: P, x: D, v: 0 }] };
}
export function rampLoop(t, k) {
  const n = Math.floor(t / k.P);
  return { n, y: evalTrack(k.knots, t - n * k.P) };
}

export default {
  id: 'ramp',
  needs: () => true,
  // A cut asks here: it hasn't anything to write, only a clock to leave on the gesture.
  cue(m, { G }) {
    if (m.hit == null) return null;
    const K = rampTrack(G, m);
    if (!K) return null;
    G.uTrack = K;
    return m;
  },
  write() {},
};
