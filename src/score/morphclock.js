// Which transformation is running at time t, and how far along it is. A handover (a song arriving, another take, a pick) goes first;
// otherwise a gesture transforms into the next in its last `morph` seconds. Null when nothing's running.
//   from, to   the gestures. tf is from's own time (a handover's old score can be on a different clock). phiFrom is its clock, if it has its own.
//   t0, D, x   when it began, how long it takes, and how far along it is, 0..1
//   holder     whatever keeps the plan: the handover or the gesture
//
// A wall handover runs on real seconds (h.e, which the stage advances), so a pause, a rest or a colour stop can't stop it: from's own clock runs on
// from h.ts and comes to rest, however the film's clock is doing. A rushed transformation (h.rush) runs out on real seconds too, from wherever it was.
import { clamp } from './curves.js';

// From where it was to the end in a set time. It picks up speed from what it had over the first third and then holds it, so nothing passes through the middle
// of a transformation (where T moves fastest) any faster than it must. x can arrive at speed: T = smoother(x) has already come to rest by then.
const UP = 0.3;
function rushed(h, x) {
  const r = h.rush;
  if (!r) return x;
  const u = clamp(r.e / r.D), v0 = r.m, v = (1 - 0.5 * UP * v0) / (1 - 0.5 * UP), w = Math.min(1, u / UP);
  const got = UP * (v0 * w + (v - v0) * (w * w * w - 0.5 * w * w * w * w)) + v * Math.max(0, u - UP);
  return r.x0 + (1 - r.x0) * got;
}

// e0: how long it waited for its plan. What's showing has carried on meanwhile, on e; the transformation itself starts from 0 after that.
const wallX = h => clamp((h.e - (h.e0 ?? 0)) / h.D);
export const handoverOn = (h, t) => !!h && (h.wall ? wallX(h) < 1 || !!h.rush : t >= h.t0 && t < h.t1);

export function morphAt(score, G, N, t) {
  const h = score.handover;
  if (handoverOn(h, t)) {
    // t0 is whatever makes t0 + (tf - t) come out at h.ts, so the old pattern eases to rest from where it was, on real seconds.
    if (h.wall) return { from: h.G, to: G, tf: h.ts + h.e, t0: t - h.e, D: h.D, x: rushed(h, wallX(h)), holder: h, handover: true, phiFrom: h.phi };
    const D = h.t1 - h.t0;
    return { from: h.G, to: G, tf: t + (h.dt || 0), t0: h.t0, D, x: rushed(h, clamp((t - h.t0) / D)), holder: h, handover: true, phiFrom: h.phi };
  }
  if (N && G.morph && t > G.t1 - G.morph) {
    const t0 = G.t1 - G.morph, D = G.morph;
    return { from: G, to: N, tf: t, t0, D, x: rushed(G, clamp((t - t0) / D)), holder: G, handover: false, phiFrom: null };
  }
  return null;
}

// Where the next pattern's clock has got to in a gesture's own morph: it eases in to the landing, and frame() runs it just so.
export function clockOfTo(G, t) {
  const stop = Math.min(G.morph * 0.4, 3.5), u = Math.min(1, (G.t1 - t) / stop);
  return t >= G.t1 ? t : G.t1 - stop * (u - u * u / 2);
}
