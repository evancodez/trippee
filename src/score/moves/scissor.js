// Scissor. Two families of lines at +a and -a. At 45 degrees they're a board of diamonds; as a closes the diamonds go to rhombi, then long teeth shooting off the top and bottom of the frame; past 45 the
// other way they're teeth lying on their sides. It notches on the strong beats, each notch surging, and the teeth get there on the hit going fast and coast on from it.
//
// The two sit a quarter of a cycle apart at the pivot, so what's above the middle is the negative of what's below: the frame is half and half at any angle, where at no offset it goes black as a closes.
//
// A shot in a hand cut:
//   { at: 64.31, id: 'riot.scissor', pulse: [[64.31, 0]], moves: [{ id: 'scissor', beats: 'half', times: { teeth: [77.75, 85.43] } }] }
//     beats   what it notches on. See cueHits in surge.js for from, to, lead and coast.
//     teeth   the hits, song seconds, under times. Default every `every`th beat, from the first
//     every   beats from teeth to teeth, default 8
//     sides   a list of -1 teeth upright, 1 teeth on their sides, one for each of teeth. Default they take turns, so each stroke goes through the diamonds. [-1] means upright every time, opening as far as `open` degrees between.
//     open    how far it opens on its way between teeth of the same side, default 45
//     hit, past   how close to shut on the hit, and where it coasts on to: degrees from shut. Default 11 and 7. Never under 6 or the teeth are longer than anything can see
//     start, end  degrees it's at before the first stroke and after the last. Default the diamonds
//     saw     cycles a beat the teeth march along them. Default .5, one tooth a beat. 0 stands still
import { OFF, FAMILIES } from '../../pattern/layout.js';
import { evalTrack, clamp, smoother } from '../curves.js';
import { clockOf, cueHits, surged, handClock } from './surge.js';

const RAD = Math.PI / 180;
const lnTan = d => Math.log(Math.tan(d * RAD));     // 45 degrees is 0, and it's how long the teeth are
const FAST = 1.4;       // how much faster than the stroke's own slope the hit arrives. Much more than this and it's the one fast thing in a slow picture: Jerk went to 5 at 2.2
const NOTCH = 1.5;      // the surge on the beats. A notch is a smaller thing than Ratchet's whole step

export const planes = s => { const p = []; for (let i = 0; i < FAMILIES; i++) if (s[OFF[`f${i}.on`]] > 0.5 && Math.abs(s[OFF[`f${i}.d`]]) < 0.98 && Math.hypot(s[OFF[`f${i}.x`]], s[OFF[`f${i}.y`]]) > 1e-3) p.push(i); return p; };

// The angle, as lnTan, against the surged clock, whose whole numbers are the beats.
//   teeth: which beats, sides(i): -1 or 1, n: how many beats there are
export function strokes(teeth, sides, n, { hit = 11, past = 7, open = 45, start = 45, end = 45, coast = 1 } = {}) {
  const Xh = -lnTan(Math.max(hit, 6)), Xe = -lnTan(Math.max(past, 6)), K = [], Xo = lnTan(open);
  const arrive = (E, x) => { const p = K[K.length - 1]; K.push({ t: E, x, v: p ? FAST * (x - p.x) / Math.max(E - p.t, 1e-3) : 0 }); };
  if (teeth[0] > 0) K.push({ t: 0, x: lnTan(start), v: 0 });
  teeth.forEach((E, i) => {
    const sd = sides(i), p = K[K.length - 1];
    if (p && Math.sign(p.x) === sd && Math.abs(p.x) >= Math.abs(Xo) + 1e-3 && E - p.t > 2) K.push({ t: (p.t + E) / 2, x: sd * Math.abs(Xo), v: 0 });
    arrive(E, sd * Xh);
    const v = K[K.length - 1].v;
    K.push({ t: E + (v ? clamp(2 * (Xe - Xh) / Math.abs(v), 0.4, 2) : coast), x: sd * Xe, v: 0 });
  });
  const last = K[K.length - 1];
  if (n - 1 - last.t >= 4) K.push({ t: n - 1, x: lnTan(end), v: 0 });      // only if there's room: closing up or opening in a hurry is a jump
  return K;
}

// The saw: the teeth march along, by one tooth a beat, so it's still going while the angle rests. Upright they march sideways and lying down they march up, or the frame's brightness rocks: that way
// the big bands the teeth make go by. Nothing marches through the diamonds, so its rate fades with the angle, and how far it's got is a sum, kept in a table against the surged clock.
const STEPS = 16;
const upright = x => smoother(-x), lying = x => smoother(x);
function sawTable(K, E0, E1) {
  const n = Math.ceil((E1 - E0) * STEPS), v = new Float32Array(n + 1), h = new Float32Array(n + 1);
  for (let i = 0; i < n; i++) { const x = evalTrack(K, E0 + (i + 0.5) / STEPS); v[i + 1] = v[i] + upright(x) / STEPS; h[i + 1] = h[i] + lying(x) / STEPS; }
  return { E0, n, v, h, K };
}
function sawAt(T, E, out) {
  const f = Math.max(0, Math.min(T.n, (E - T.E0) * STEPS)), i = Math.min(T.n - 1, f | 0), u = f - i, past = (E - T.E0) * STEPS - f, x = evalTrack(T.K, E);
  out[0] = T.v[i] + (T.v[i + 1] - T.v[i]) * u + upright(x) * past / STEPS;
  out[1] = T.h[i] + (T.h[i + 1] - T.h[i]) * u + lying(x) * past / STEPS;
}

// A quarter of a cycle between the two, and between one and the other's negative, so the bands the teeth make are centred on the frame whichever way they lie: it stays half and half.
const ran = [0, 0];
function writeAngle(out, x, m) {
  const P = planes(out);
  if (P.length < 2) return;
  const [a, b] = P, K = Math.hypot(out[OFF[`f${a}.x`]], out[OFF[`f${a}.y`]]), th = Math.atan(Math.exp(x)), tong = Math.cosh(x * 0.25), saw = m.saw ?? 0.5;
  // Teeth get a little finer as they get longer, as a real lazy tongs does
  const kx = K * Math.cos(th) * tong, ky = K * Math.sin(th) * tong;
  out[OFF[`f${a}.x`]] = kx; out[OFF[`f${a}.y`]] = ky; out[OFF[`f${b}.x`]] = kx; out[OFF[`f${b}.y`]] = -ky;
  out[OFF[`f${a}.ph`]] += 0.25 + saw * (ran[0] + ran[1]); out[OFF[`f${b}.ph`]] += saw * (ran[0] - ran[1]);
}

// A pick has no list: it goes on for ever, upright on one hit and lying down on the next. Two strokes make a period.
const handStrokes = (N, o) => strokes([0, N, 2 * N], i => (i % 2 ? -1 : 1), 2 * N, o);
export function scissorDrive(out, ctx) {
  const { G } = ctx;
  if (G.moves?.some(m => m.id === 'scissor')) return;
  const o = G.pattern.scissor ?? {}, N = o.every ?? 8, period = 2 * N;
  o._h ??= handStrokes(N, o);
  o._s ??= sawTable(o._h, 0, period);
  const e = surged(handClock(ctx), o.peak ?? NOTCH), round = Math.floor(e / period), w = e - round * period;
  sawAt(o._s, w, ran);
  ran[0] += round * o._s.v[o._s.n]; ran[1] += round * o._s.h[o._s.n];
  writeAngle(out, evalTrack(o._h, w), o);
}

export default {
  id: 'scissor',
  needs(slot) { return planes(slot).length >= 2; },
  cue(m, ctx) {
    const done = cueHits(m, ctx, m.teeth ?? []);
    if (!done) return null;
    const nearest = h => { let b = 0; for (let i = 1; i < m.beats.length; i++) if (Math.abs(m.beats[i] - h) < Math.abs(m.beats[b] - h)) b = i; return b; };
    const every = m.every ?? 8, teeth = m.teeth ? m.teeth.map(nearest) : m.beats.map((_, i) => i).filter(i => i && i % every === 0);
    if (!teeth.length) return null;
    const sides = m.sides ?? teeth.map((_, i) => (i % 2 ? 1 : -1));
    m._x = strokes(teeth, i => sides[i % sides.length], m.beats.length, m);
    m._s = sawTable(m._x, 0, m.beats.length);
    return m;
  },
  write(out, { t, m }) {
    const e = surged(evalTrack(clockOf(m), t), m.peak ?? NOTCH);
    sawAt(m._s, e, ran);
    writeAngle(out, evalTrack(m._x, e), m);
  },
};
