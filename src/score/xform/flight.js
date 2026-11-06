// A flight, which works between anything: into one element of the pattern, found by rendering it small, with the next pattern inside that
// element (a dive), or the reverse (a rise). Its plan's kind is 'dive' or 'rise'.
import { OFF, FRAME, SLOT_FLOATS, FAMILIES } from '../../pattern/layout.js';
import { fillSlot, fineness } from '../slot.js';
import { clamp, lerp, smoother } from '../curves.js';
import { flag } from '../flags.js';

// The biggest element in a small rendering of the pattern, near the middle if it can be: where to fly to, and what colour it is.
const found = new WeakMap();    // a plan walked over several frames asks again, and a look only needs working out once
export function biggestElement(R, slot, aspect, seen) {
  const { W, H, px } = seen ?? R.probe(slot, aspect);
  if (found.has(px)) return found.get(px);
  const best = { r: 0, score: -1, x: 0, y: 0, white: true };
  for (const white of [true, false]) {
    const d = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) d[i] = (white ? px[i * 4] > 225 : px[i * 4] < 30) ? 1e6 : 0;     // a mid value is an edge or lines too fine to tell
    const relax = (i, j, c) => { if (d[j] + c < d[i]) d[i] = d[j] + c; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) d[i] = Math.min(d[i], 1.2);   // an element can run off the frame
      if (x > 0) relax(i, i - 1, 1); if (y > 0) relax(i, i - W, 1); if (x > 0 && y > 0) relax(i, i - W - 1, 1.41); if (x < W - 1 && y > 0) relax(i, i - W + 1, 1.41);
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (x < W - 1) relax(i, i + 1, 1); if (y < H - 1) relax(i, i + W, 1); if (x < W - 1 && y < H - 1) relax(i, i + W + 1, 1.41); if (x > 0 && y < H - 1) relax(i, i + W - 1, 1.41);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, fx = ((x + 0.5) - W / 2) / H * 2, fy = ((y + 0.5) - H / 2) / H * 2;
      const score = d[i] * (1 - 0.3 * Math.hypot(fx / aspect, fy));
      if (score > best.score) { best.score = score; best.r = Math.max(d[i] - 0.5, 0.6) / H * 2; best.x = fx; best.y = fy; best.white = white; }
    }
  }
  found.set(px, best);
  return best;
}

// How far the inner pattern has opened goes by how big the element looks: its radius on screen, where the frame's half height is 1. Inside the element it
// opens from r0 to r1, so the element is never a big flat shape, and never later than t1 of the way in. Outside it the same lines open from o0 to o1 and only
// as far as o2, thin dots or hairlines, so nothing out there is flat either, yet its shapes still read as the pattern you're flying through and the element
// as a hole in it. Open the same on both sides (xor) and the outer pattern is gone but for a crack through the inner one, which reads as one laid over the other.
export const FORM = { r0: 0.06, r1: 0.45, t1: 0.37, o0: 0.25, o1: 1.2, o2: 0.6, xor: false };
const ramp = (v, a, b) => smoother((v - a) / (b - a));
const CLOSES = 0.93;      // how far in T the outer pattern starts to close up. Most of it has left the frame by then, and what hasn't goes as a shape closing, not all at once.

// How far a flight has to go to have the element fill the frame. With room for the song's lenses moving the frame a little, unless told how much.
const reachOf = (e, aspect, room = 0.4, over = 1.15) => clamp((Math.hypot(e.x, e.y) + Math.hypot(Math.max(aspect, 1.9), 1) + room) * over / Math.max(e.r, 0.012), 1.5, 240);

const flight = {
  id: 'flight',
  plan(a, b, ctx) {
    const out = biggestElement(ctx.R, a, ctx.aspect), inn = biggestElement(ctx.R, b, ctx.aspect);
    const zoomFor = e => reachOf(e, ctx.aspect);
    const zo = zoomFor(out), zi = zoomFor(inn);
    // Out of the pattern with the bigger element, which is the shorter and more legible flight. Now and then the other way, for variety.
    const rise = ctx.rise ?? zi < zo * 0.8;
    const e = rise ? inn : out;
    return { kind: rise ? 'rise' : 'dive', lnZ: Math.log(rise ? zi : zo), q: [e.x, e.y], white: e.white, r: e.r };
  },
  // In a flight, the pattern being flown through has to hold still, or the element would slip out from under the camera. The one inside it reacts.
  enter(st) {
    const { plan, x, sa, sb, thA, thB, A, B } = st;
    const dive = plan.kind === 'dive', f = plan.fall;
    if (f) { st.T = fallT(x, f); if (f.roll) rollAbout(A, plan.q, f.roll * st.T); }
    const { T } = st;
    const seen = Math.log(Math.max(plan.r, 1e-3)) + plan.lnZ * (dive ? T : 1 - T);     // how big the element looks, as a log
    const near = (a, b) => ramp(seen, Math.log(a), Math.log(b));
    // The camera's own progress, not the clock's: while the camera hasn't moved the inner pattern can't have opened, or it reads as one laid over the other.
    const cam = dive ? T : 1 - T;
    // In a fall the camera hardly moves for most of it, so that can't be what opens the inner pattern, or both would read at once all through the hang. It opens as the fall takes off.
    const k = Math.min(near(FORM.r0, FORM.r1), f ? ramp(x, f.open, f.open + 0.16) : ramp(cam, 0.005, 0.2));
    const kFar = FORM.xor ? k : FORM.o2 * Math.min(near(FORM.o0, FORM.o1), f ? ramp(x, f.open + 0.06, f.open + 0.26) : ramp(cam, 0.08, 0.4));
    const sign = plan.white ? -1 : 1;
    if (dive) {
      // Flying in: the other pattern opens up inside the element, starting out as that element's own colour
      st.theta = thA; st.solid = sa;
      st.thetaB = lerp(sign * sb, thB, k);
      st.thFar = lerp(sign * sb, thB, kFar);
      // it grows on the way, but it's never so fine it greys. In a fall it holds off until the last moments, then takes the camera's speed
      B[OFF.scale] *= Math.exp(f ? -f.cap * (1 - Math.exp(-f.v * (1 - x) * f.D / f.cap)) : -Math.min(0.35 * plan.lnZ, 0.7) * (1 - T));
      if (f?.w) B[OFF.rot] -= Math.sign(f.w) * TURN_CAP * (1 - Math.exp(-Math.abs(f.w) * (1 - x) * f.D / TURN_CAP));      // ...and the same for how it's turning
      st.moveA = false; st.moveB = true;
    } else {
      // Rising out: what's showing closes up to the element's colour and shrinks, until it's one element of the next pattern
      st.theta = lerp(sign * sa, thA, k); st.solid = sb;
      st.thetaB = thB;
      st.thFar = lerp(sign * sa, thA, kFar);
      A[OFF.scale] *= Math.exp(-Math.min(0.35 * plan.lnZ, 0.7) * T);
      st.moveA = true; st.moveB = false;
    }
  },
  write(st, A, B, F) {
    const { plan, kind, T } = st;
    const lnS = kind === 'dive' ? plan.lnZ * T : plan.lnZ * (1 - T);
    const Dv = FRAME.dive * 4;
    F[Dv] = plan.q[0]; F[Dv + 1] = plan.q[1]; F[Dv + 2] = Math.exp(lnS);
    F[Dv + 3] = kind === 'dive' ? (plan.white ? 1 : 2) : (plan.white ? 3 : 4);
    F[FRAME.spare * 4] = st.thFar;
    F[FRAME.spare * 4 + 1] = smoother(((kind === 'dive' ? T : 1 - T) - CLOSES) / (1 - CLOSES));    // the last of a dive, the first of a rise: whatever's left of the outer pattern closes up (chunks/main.js), and by the end it's exactly its element's colour
    A[OFF.theta] = st.theta; B[OFF.theta] = st.thetaB;
  },
};
export default flight;

// A fall: a dive that hangs and then falls, crossing at speed exactly on the beat, and what's inside carries on at the speed it arrived and coasts to rest.
// The speed of the crossing is what's set, v in ln per second, so a short flight hangs longer than a long one. What the inner pattern does around the landing doesn't depend on the plan,
// so the gesture after it comes out the same from any seek. Only a dive can do this: a rise has nothing to carry on.
//   a      how much of a fall this is, 0 a plain dive, 1 all of it: the arrival's strength
const V = 1.2;            // the speed of the crossing at a = 1, in ln per second
const CAP = 0.7;          // how much smaller the inner pattern is at the start of the fall than where it lands, as a log
const CARRY = 0.92;       // how far it carries on after landing, as a log
const PRE = 0.5;          // the most it lands small by, as a log
const SEEN = 9;           // how fine the inner pattern can be when it lands, in cycles per picture unit
const BACK = 0.09;        // how far the camera draws back while it hangs, as a log
const TURN_CAP = 0.5;     // how far round the inner pattern starts out from where it lands, in radians
const STROBE = 5;         // how many lines it can send past a point per second, near the middle of the frame. Any faster and fine lines strobe rather than move.
// How many lines per second go past, at a place halfway out, for each ln per second of zoom
function linesPerLn(s) {
  let most = 1e-3;
  for (let i = 0; i < FAMILIES; i++) {
    if (s[OFF[`f${i}.on`]] < 0.5 || Math.abs(s[OFF[`f${i}.d`]]) > 0.98) continue;
    const g = n => Math.abs(s[OFF[`f${i}.${n}`]]);
    most = Math.max(most, 1.2 * (Math.hypot(g('x'), g('y')) * s[OFF.freq] + g('r1') + g('r2')) / Math.max(s[OFF.scale], 1e-4) + g('l1') + g('l2'));
  }
  return s[OFF['surf.kind']] > 0.5 ? most * 1.6 : most;      // a surface crowds them somewhere
}
export function carryOf(a, s, bar = 2) {
  const fine = fineness(s), v = Math.min(V * clamp(a, 0, 1), STROBE / linesPerLn(s)), tau = Math.min(bar, CARRY / Math.max(v, 1e-3)), K = v * tau;
  // It lands a little small, so that it doesn't end up too far past the size it was rehearsed at, but no smaller than can be seen at this speed. Past that it ends up bigger, which is bolder.
  return { v, tau, K, pre: clamp(Math.log(SEEN / Math.max(fine, 1e-3)), 0, Math.min(K, PRE)) };
}
// While it hangs the camera draws back a little, an intake of breath, and comes back to where it was by the time the fall takes off.
export const fallT = (x, f) => lerp(smoother(x), Math.pow(x, f.n), f.a) - f.back * Math.sin(Math.PI * Math.min(x / f.bx, 1)) ** 2;
function fallOf(a, v, D, lnZ, roll) {
  const n = clamp(v * D / (Math.max(a, 0.05) * lnZ), 2.2, 5), f = { a, v, D, cap: CAP, n, open: 0, back: 0, bx: 1, roll: 0, w: 0 };
  // Where it takes off: a twentieth of the way along the camera's whole travel
  let x = 0.2; while (x < 0.8 && fallT(x, f) < 0.05) x += 0.01;
  f.open = x; f.back = a * BACK / lnZ; f.bx = x + 0.1;
  return f;
}

// The camera can corkscrew as it falls. The element stays where the camera's going, because it turns about that point, and only something whose view really is the frame's can do that:
// a floor's view is in its own texture, and a shape's edge wouldn't turn with its lines.
const canRoll = s => s[OFF['matte.kind']] < 0.5 && (s[OFF['surf.kind']] < 0.5 || (s[OFF['surf.kind']] < 1.5 && s[OFF['surf.map']] > 0.5));
function rollAbout(s, q, a) {
  const r = s[OFF.rot], k = s[OFF.scale], c = Math.cos(a), n = Math.sin(a), dx = q[0] - (c * q[0] - n * q[1]), dy = q[1] - (n * q[0] + c * q[1]), cr = Math.cos(r), sr = Math.sin(r);
  s[OFF.tx] += (cr * dx + sr * dy) / k; s[OFF.ty] += (-sr * dx + cr * dy) / k;
  s[OFF.rot] = r - a;
}

export const fall = {
  id: 'fall',
  plan(a, b, ctx) {
    const o = ctx.xform || {}, A = clamp(o.a ?? 1, 0, 1), v = o.v ?? V * A;
    const e = biggestElement(ctx.R, a, ctx.aspect);
    const lnZ = Math.log(reachOf(e, ctx.aspect, 0.08, 1.02));
    const f = fallOf(A, v, ctx.D, lnZ);
    f.w = o.w ?? 0; f.roll = canRoll(a) && v > 0 ? -f.w / v * lnZ : 0;
    return { kind: 'dive', lnZ, q: [e.x, e.y], white: e.white, r: e.r, fall: f };
  },
};

// The director's way in. G dives into N, crossing at G.t1, so G.t1 is the landing: nothing moves but where the flight starts. a from the arrival's strength; bar in seconds. D, how long
// the hang and the fall take in all, defaults to 4 bars, within 6 to 10 s. Returns false if it's switched off, in which case nothing has been touched.
const fallSlot = new Float32Array(SLOT_FLOATS);
//   spin: how far it corkscrews, in radians per ln of the fall, signed: which way is up to the director (mirror it in a replayed section). 0 goes straight in.
export function wearFall(G, N, { a = 1, bar = 2, D = clamp(4 * bar, 6, 10), phiOf, spin = 0.25 } = {}) {
  if (!flag('fall')) return false;
  fillSlot(fallSlot, N, N.t0, N.pattern, { phi: phiOf?.(N.t0, N) ?? 0 });
  const c = carryOf(a, fallSlot, bar), w = spin * c.v;
  G.morph = Math.min(D, G.t1 - G.t0);
  G.xform = { id: 'fall', a, v: c.v, w };
  N.carry = { t1: G.t1, v: c.v, tau: c.tau, K: c.K, pre: c.pre, w };
  delete G.plan; delete G.planFor; delete G.planning;
  return true;
}
