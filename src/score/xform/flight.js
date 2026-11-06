// A flight, which works between anything: into one element of the pattern, found by rendering it small, with the next pattern inside that
// element (a dive), or the reverse (a rise). Its plan's kind is 'dive' or 'rise'.
import { OFF, FRAME } from '../../pattern/layout.js';
import { clamp, lerp, smoother } from '../curves.js';

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

export default {
  id: 'flight',
  plan(a, b, ctx) {
    const out = biggestElement(ctx.R, a, ctx.aspect), inn = biggestElement(ctx.R, b, ctx.aspect);
    const diag = Math.hypot(Math.max(ctx.aspect, 1.9), 1);
    const zoomFor = e => clamp((Math.hypot(e.x, e.y) + diag + 0.4) * 1.15 / Math.max(e.r, 0.012), 1.5, 240);    // with room for the song's lenses moving the frame a little
    const zo = zoomFor(out), zi = zoomFor(inn);
    // Out of the pattern with the bigger element, which is the shorter and more legible flight. Now and then the other way, for variety.
    const rise = ctx.rise ?? zi < zo * 0.8;
    const e = rise ? inn : out;
    return { kind: rise ? 'rise' : 'dive', lnZ: Math.log(rise ? zi : zo), q: [e.x, e.y], white: e.white, r: e.r };
  },
  // In a flight, the pattern being flown through has to hold still, or the element would slip out from under the camera. The one inside it reacts.
  enter(st) {
    const { plan, x, T, sa, sb, thA, thB, A, B } = st;
    const dive = plan.kind === 'dive';
    const seen = Math.log(Math.max(plan.r, 1e-3)) + plan.lnZ * (dive ? T : 1 - T);     // how big the element looks, as a log
    const near = (a, b) => ramp(seen, Math.log(a), Math.log(b));
    // The camera's own progress, not the clock's: while the camera hasn't moved the inner pattern can't have opened, or it reads as one laid over the other.
    const cam = dive ? T : 1 - T;
    const k = Math.min(near(FORM.r0, FORM.r1), ramp(cam, 0.005, 0.2));
    const kFar = FORM.xor ? k : FORM.o2 * Math.min(near(FORM.o0, FORM.o1), ramp(cam, 0.08, 0.4));
    const sign = plan.white ? -1 : 1;
    if (dive) {
      // Flying in: the other pattern opens up inside the element, starting out as that element's own colour
      st.theta = thA; st.solid = sa;
      st.thetaB = lerp(sign * sb, thB, k);
      st.thFar = lerp(sign * sb, thB, kFar);
      B[OFF.scale] *= Math.exp(-Math.min(0.35 * plan.lnZ, 0.7) * (1 - T));     // it grows on the way, but it's never so fine it greys
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
    F[FRAME.spare * 4 + 1] = smoother(((kind === 'dive' ? T : 1 - T) - 0.97) / 0.03);    // the last of a dive, the first of a rise: the frame is wholly in the element, so the outer pattern is exactly its colour
    A[OFF.theta] = st.theta; B[OFF.theta] = st.thetaB;
  },
};
