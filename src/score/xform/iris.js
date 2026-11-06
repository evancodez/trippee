// Iris: the climax's transformation, and a flight mode, so no new program. The sheet you've been looking at rolls in from the rim like a carpet, a fat tube with the next pattern lying flat
// behind it. When the tube reaches the middle what was inside is gone and it turns inside out: a flower, the sheet's far-off lines all drawn into one disc, that shrinks away inside the next pattern.
//
// A sheet is wound on a tube of radius Rt centred c from the focus. Across the tube, s = q - c, you see the top half of it, which is the sheet from further out: at radius c + Rt * (PI - asin(s / Rt)).
// That's all of it. The lines bunch at both edges of the tube because they're going round it, and the top of it moves at twice the tube's speed, like a tank's tread, with nothing to tell you but the lines. No lighting.
// Neither sheet is laid on the other. Each leans in towards the tube where they meet, so the next pattern is dragged along as the tube goes, closes over the flower as it shrinks, and lets go.
// Both ends are exact. At the start the tube is off every corner of the frame, and at the end it has shrunk away behind the focus and nothing leans.
//   uF[F_DIVE] x, y: the focus; z: c; w: 5.   uF[F_XF2] x: how far the lean reaches; y: how far B leans; z: Rt; w: how far A leans.   uF[F_XF] y: how far the tube has turned.   The shader's half of this is in src/gl/chunks/main.js.
import { OFF, FRAME, FAMILIES } from '../../pattern/layout.js';
import { clamp, lerp, smoother } from '../curves.js';
import { fineness } from '../slot.js';
import { flag } from '../flags.js';

export const R0 = 0.3, GROW = 0.5;      // how fat the tube is to start with, and how it grows: the area of its end is how much sheet it's taken up
const LEAN_W = 0.45, LEAN_B = 0.34, LEAN_A = 0.22;
const OFF_FRAME = 0.25;                 // how far past the corners it starts, for the song's lenses to move the frame about in
const EASE = 0.6;                       // how much of its speed goes on the ease at each end. Linear would start at full speed; off the frame nobody would see, and a smoother would rush the middle
const SURGE = 0.45;                     // how much its speed swings with the strong beats
const SPIN = 1.3;                       // how far the tube's surface turns about the focus on its way, in radians: what's going down turns, like water
const BOLD = 3.5;                       // how fine a sheet goes round the tube, cycles per picture unit. The flower multiplies what's there, so it comes in to this while the tube arrives, as a long move
const ZOOM_MAX = 4, ZOOM_BY = 0.45;
// How fine it looks. Several families crossing cut each other into smaller pieces than any of them has lines.
const busy = s => { let n = 0; for (let i = 0; i < FAMILIES; i++) if (s[OFF[`f${i}.on`]] >= 0.5 && Math.abs(s[OFF[`f${i}.d`]]) <= 1.01) n++; return fineness(s) * Math.max(1, n / 1.5); };
const tube = x => Math.sqrt(R0 * R0 + GROW * GROW * x);
const R1 = tube(1) + 0.05;
const along = x => lerp(x, smoother(x), EASE);
const startOf = (aspect, f) => Math.hypot(aspect + Math.abs(f[0]), 1 + Math.abs(f[1])) + OFF_FRAME + R0;
// How far along the tube reaches the focus and what was inside it is gone: the moment it turns inside out, and what lands on the beat.
function hitOf(c0) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (lerp(c0, -R1, along(m)) > tube(m)) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// What's wound on the tube comes from far outside the frame. A surface has a horizon out there, a shape's edge is a hard ring wound round it, and River's and Arcade's fine edges are kept just off the frame. So this is for flat sheets.
export const canIris = a => !(a[OFF['surf.kind']] > 0.5 || a[OFF['matte.kind']] > 0.5 || a[OFF['ribbon.on']] > 0.5 || a[OFF['blobs.on']] > 0.5 || (a[OFF['field.kind']] > 0.5 && a[OFF['field.kind']] < 2.5));

// The director's way in. G becomes N by an iris that turns inside out exactly on `landing`, which moves where G ends. Returns false, having touched nothing, if there's no room.
//   beats: strong beats, in seconds: the tube heaves forward on each one it passes.
export function wearIris(G, N, landing, { D = 12, aspect = 16 / 9, focus = [0, 0], beats = null, surge = SURGE, room = 2, way = 1 } = {}) {
  if (!flag('iris')) return false;
  const t1 = landing + (1 - hitOf(startOf(aspect, focus))) * D, t0 = t1 - D;
  if (t0 - G.t0 < room || N.t1 - t1 < (N.morph ? 7 : 2)) return false;
  G.t1 = t1; N.t0 = t1; G.morph = D;
  if (N.morph) { N.morph = Math.min(N.morph, N.t1 - N.t0 - 1); delete N.plan; delete N.planFor; delete N.planning; }
  delete G.plan; delete G.planFor; delete G.planning;
  const inside = beats ? beats.filter(b => b > t0 && b < t1).map(b => (b - t0) / D) : [];
  G.xform = { id: 'iris', focus, beats: inside.length >= 2 ? inside : null, surge, way };
  return true;
}

// It surges into each strong beat and eases off after, the same distance on average, so nothing about where it lands changes.
function heave(x, beats, surge) {
  if (!beats || !surge) return x;
  const n = beats.length;
  let k = 0; while (k < n - 2 && beats[k + 1] <= x) k++;
  const P = beats[k + 1] - beats[k], phase = (x - beats[k]) / P;
  return x + surge * P / (2 * Math.PI) * Math.sin(2 * Math.PI * phase) * smoother(x / 0.12) * smoother((1 - x) / 0.12);
}

export default {
  id: 'iris',
  plan(a, b, ctx) {
    if (!canIris(a)) return null;
    const o = ctx.xform ?? {}, focus = o.focus ?? [0, 0], c0 = startOf(ctx.aspect, focus);
    return { kind: 'iris', focus, c0, hit: hitOf(c0), zoom: clamp(busy(a) / BOLD, 1, ZOOM_MAX), beats: o.beats ?? null, surge: o.surge ?? SURGE, spin: SPIN * (o.way ?? 1), close: [0] };      // close: it wants no rings of the tune on either side of it (song-sheet.js)
  },
  enter(st) {
    st.theta = lerp(st.thA, st.thB, st.T); st.solid = lerp(st.sa, st.sb, st.T);
    st.moveA = true; st.moveB = true;      // nothing here depends on either holding still, and each has to be just as the plain path has it at its own end
  },
  write(st, A, B, F) {
    const { plan, x, T } = st, Dv = FRAME.dive * 4, W = FRAME.weight * 4, X2 = FRAME.xf2 * 4, y = clamp(heave(x, plan.beats, plan.surge));
    A[OFF.scale] *= Math.pow(plan.zoom, smoother(y / ZOOM_BY));
    F[Dv] = plan.focus[0]; F[Dv + 1] = plan.focus[1]; F[Dv + 2] = lerp(plan.c0, -R1, along(y)); F[Dv + 3] = 5;
    F[FRAME.xf * 4 + 1] = plan.spin * y * y;
    F[X2] = LEAN_W; F[X2 + 1] = LEAN_B * smoother((1 - y) / 0.22); F[X2 + 2] = tube(y); F[X2 + 3] = LEAN_A * smoother(y / 0.12);
    // What the song and the hand have done to the threshold, each slot taking it on its own: both can be seen at once, and each ends up as the plain path has it
    const by = st.theta - lerp(st.thA, st.thB, T);
    A[OFF.theta] = st.thA + by; B[OFF.theta] = st.thB + by;
    F[W + 1] = F[W];
  },
};
