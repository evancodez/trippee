// The sheet in space, as a stretch of a song: a pattern on a sheet that has left the plane (src/gl/chunks/space.js). The numbers are the slot's own, so arcs, knobs, slides, flights, plates and the song all work on it. It's a camera and a
// surface, in front of everything the pattern is, so it doesn't care what the pattern is. At amount 0 and pitch 0 it is exactly the flat frame.
//
//   G.moves = [{ id: 'swell' }]      any of swell, terraces, pleats, ride, hall, on any pattern (strata, below, only on a sheet with three sets of stripes). Every number can be a plain number or a lane [[t, x], ...] in song seconds. Say nothing, and it comes up over `lead` seconds from where the shot starts and
//                                    goes back to flat over `coast` before `to` (song seconds; default the end of the shot's body), and in between it travels.
//     amp      how high the sheet goes
//     f, ph    its waves: how many a unit, and where they've got to
//     pitch, yaw, roll, dist    the camera
//     x, y, z  where it's looking, and how far up. y runs on by itself at `fly` units a second
//     bowl     the world curving up ahead, so there's no horizon
//     q, pix   terraces (height in steps of this), square columns (this wide)
//     fly      how fast it goes. heave: how hard it surges into each strong beat. lift: how far each strong beat lifts the sheet
//
// On the strong beats (the song's own, read off the score that's up, as handClock in surge.js does) the sheet heaves and the camera surges forward, with no change of brightness. The tune swings the camera a little. Both go through reaction: nothing here replaces it.
import { OFF, FAMILIES } from '../../pattern/layout.js';
import { clamp, smoother } from '../curves.js';
import { val } from './long.js';
import { melodyAt, reactAt } from '../react.js';

const pulses = () => globalThis.app?.stage?.score?.react?.pulses;
// A strong beat just happened: a moment's rise before it, and it dies away.
export function kickAt(t, tau = 0.45) {
  const P = pulses();
  if (!P || !P.length) return 0;
  let lo = 0, hi = P.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (P[m] <= t) lo = m + 1; else hi = m; }
  const after = lo > 0 ? Math.exp(-(t - P[lo - 1]) / tau) : 0, before = lo < P.length ? smoother(1 - (P[lo] - t) / 0.07) : 0;
  return Math.max(after, before);
}
// Going by more quickly into each strong beat and more slowly after it, the same distance on average: a position, so its speed is smooth and it never stops. In seconds of travel, per unit of surge.
export function surgeAt(t) {
  const P = pulses();
  if (!P || P.length < 2) return 0;
  let lo = 0, hi = P.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (P[m] <= t) lo = m + 1; else hi = m; }
  if (lo < 1 || lo >= P.length) return 0;
  const gap = P[lo] - P[lo - 1];
  return gap / (2 * Math.PI) * Math.sin(2 * Math.PI * (t - P[lo - 1]) / gap);
}
// The tune, 0 centred. Smooth already.
export function tuneAt(c) {
  const R = globalThis.app?.stage?.score?.react;
  return R?.melody ? melodyAt(R, c ?? 0) : 0;
}

// A big moment lifts the whole sheet higher: how much energy the song has here, 1 being about ordinary. With no song it's 1.
export function bigAt(c) {
  const R = globalThis.app?.stage?.score?.react;
  return R?.energy || R?.env ? 0.82 + 0.45 * reactAt(R, c ?? 0).energy : 1;
}

export function writeSpace(out, kind, n) {
  out[OFF['space.kind']] = kind;
  out[OFF['space.amp']] = n.amp ?? 0; out[OFF['space.f']] = n.f ?? 0; out[OFF['space.ph']] = n.ph ?? 0;
  out[OFF['space.pitch']] = n.pitch ?? 0; out[OFF['space.yaw']] = n.yaw ?? 0; out[OFF['space.roll']] = n.roll ?? 0; out[OFF['space.dist']] = n.dist ?? 2.4;
  out[OFF['space.x']] = n.x ?? 0; out[OFF['space.y']] = n.y ?? 0; out[OFF['space.z']] = n.z ?? 0; out[OFF['space.a']] = n.a ?? 0;
  out[OFF['space.bowl']] = n.bowl ?? 0; out[OFF['space.q']] = n.q ?? 0; out[OFF['space.pix']] = n.pix ?? 0; out[OFF['space.w']] = n.w ?? 0;
}

// Its life on a gesture, 0 flat to 1 fully up, and how far it has gone: an integral of that, so it picks up speed and never lurches. 
function life(G, t, m) {
  const from = m?.from ?? G.t0, lead = m?.lead ?? 5, to = m?.to ?? (G.morph ? G.t1 - G.morph : G.t1), coast = m?.coast ?? 5;
  const open = smoother((t - from) / lead), hold = G.t1 > 3000 ? 1 : smoother((to - t) / coast);
  // How far it's gone: the integral of smoother, so it picks up speed and never lurches
  const e = t - from, s = clamp(e / lead), d = e <= 0 ? 0 : e < lead ? lead * s * s * s * s * (s * (s - 3) + 2.5) : e - lead / 2;
  return { k: open * hold, d };
}

// Over a sheet of swells, flying. Used by name, and by the library's own.
export function reliefNumbers(G, t, c, m = {}) {
  const T = t, { k, d } = life(G, T, m), kick = kickAt(T), v = l => (l == null ? undefined : val(l, T));
  const amp0 = v(m.amp) ?? (m.A ?? 0.34) * k, f = v(m.f) ?? m.F ?? 2.2;
  const pitch = v(m.pitch) ?? (m.P ?? 0.98) * k, dist = v(m.dist) ?? 2.4 + ((m.D ?? 1.4) - 2.4) * k;
  const tune = tuneAt(c) * k;
  return {
    amp: amp0 * (1 + (m.lift ?? 0.22) * kick) * bigAt(c),
    f, ph: v(m.ph) ?? (m.drift ?? 0.1) * d + 0.3 * surgeAt(T) * k,
    pitch, yaw: v(m.yaw) ?? k * (0.5 * Math.sin(d * 0.07) + 0.06 * tune), roll: v(m.roll) ?? k * (0.14 * Math.sin(d * 0.11 + 1) + 0.03 * tune), dist,
    x: v(m.x) ?? 0, y: v(m.y) ?? (m.fly ?? 0.55) * d + (m.heave ?? 0.5) * surgeAt(T) * k, z: v(m.z) ?? 0,
    bowl: v(m.bowl) ?? (m.bow ?? 0.07) * k, q: v(m.q) ?? m.Q ?? 0, pix: v(m.pix) ?? m.PIX ?? 0,
  };
}
export function pleatNumbers(G, t, c, m = {}) {
  const T = t, { k, d } = life(G, T, m), kick = kickAt(T), v = l => (l == null ? undefined : val(l, T));
  return {
    amp: (v(m.amp) ?? (m.A ?? 1.05) * k) * (1 + (m.lift ?? 0.16) * kick) * bigAt(c),
    f: v(m.f) ?? m.F ?? 3,
    ph: -1e3 * 0.5, a: 1e3,      // no walk: every cell is half and half, and what moves it is a wave of share
    pitch: v(m.pitch) ?? (m.P ?? 0.74) * k, yaw: v(m.yaw) ?? k * 0.28 * Math.sin(d * 0.09), roll: k * 0.1 * Math.sin(d * 0.07), dist: v(m.dist) ?? 2.4 + ((m.D ?? 1.6) - 2.4) * k,
    x: v(m.x) ?? 0, y: v(m.y) ?? (m.fly ?? 0.2) * d + 0.25 * surgeAt(T) * k, z: 0,
    q: k * (m.wave ?? 0.42), bowl: (m.speed ?? 0.5) * d + 1.2 * surgeAt(T) * k + 0.5 * tuneAt(c),      // pleats read e.y, e.x as a wave of share: its size and phase
    w: m.dir ?? 0.3,
  };
}
export function rideNumbers(G, t, c, m = {}) {
  const T = t, { k, d } = life(G, T, { ...m, lead: m.lead ?? 7, coast: m.coast ?? 7 }), dst = m.D ?? 1.5;
  const roll = smoother(k / 0.55), look = smoother((k - 0.35) / 0.65);
  return {
    amp: roll / dst * 0.98, f: m.bw ?? 0.42, ph: (m.drift ?? 0.12) * d + 0.2 * tuneAt(c) * look,
    pitch: look * Math.PI / 2, yaw: 0, roll: (m.spin ?? 0.05) * d * look, dist: dst,
    x: 0, y: (m.fly ?? 1.1) * d + (m.heave ?? 0.9) * surgeAt(T) * k, z: 0, a: (m.bend ?? 1.0) * look,
    w: m.twist ?? 0,
  };
}

// A square hall, all of it the one sheet, turning over about you as you go along it.
export function hallNumbers(G, t, c, m = {}) {
  const T = t, { k, d } = life(G, T, { ...m, lead: m.lead ?? 10, coast: m.coast ?? 8 }), H = m.half ?? 2.3;
  const look = smoother((k - 0.1) / 0.9), on = smoother((d - 3) / 8);      // on: it's been turning at this rate for as long as it's been going, as far as anyone can see
  return {
    amp: H, ph: look * ((m.turn ?? 0.11) * on * d + 0.16 * surgeAt(T)) + 0.02 * tuneAt(c) * look,
    pitch: look * Math.PI / 2, dist: H + ((m.lens ?? 1.05) - H) * look,
    y: (m.fly ?? 0.9) * d + (m.heave ?? 0.6) * surgeAt(T) * k, bowl: 1 + ((m.bold ?? 0.45) - 1) * look,
  };
}

// A slice. A check is the flat cut through a solid of cubes; this one's a cut through a four-dimensional lattice, each family being one axis of it, and the cut turns. At no turn it's a plain check: two families have lines, and the other two are
// constant. Turning, those two come up from infinitely long lines, nothing appears and nothing tears, and the tiles go through squares, diamonds, triangles and tilings that never repeat, then come back. Four numbers per family and no shader: it
// costs nothing. Going further through the lattice, along the other two axes, opens and closes the tiles, slowly. (The shape only makes sense on four plain families, so it has its own pattern.)
export function writeSlice(out, a, depth, k) {
  const u = [1, 0, 0, 0], v = [0, 1, 0, 0], n = [0, 0, 1, 0], m = [0, 0, 0, 1], turn = (w, i, j, th) => { const c = Math.cos(th), s = Math.sin(th), p = w[i], q = w[j]; w[i] = c * p - s * q; w[j] = s * p + c * q; };
  const planes = [[0, 2], [1, 3], [0, 3], [1, 2], [0, 1], [2, 3]];
  planes.forEach(([i, j], q) => { if (a[q]) for (const w of [u, v, n, m]) turn(w, i, j, a[q]); });
  for (let i = 0; i < 4; i++) {
    out[OFF[`f${i}.x`]] = k * u[i]; out[OFF[`f${i}.y`]] = k * v[i];
    out[OFF[`f${i}.ph`]] += k * (depth[0] * n[i] + depth[1] * m[i]);
  }
}
export function sliceAngles(d, kk, turn = 0) {
  return [0.9 * Math.sin(d * 0.113) * kk, 0.9 * Math.sin(d * 0.079 + 1) * kk, 0.7 * Math.sin(d * 0.057 + 2) * kk, 0.7 * Math.sin(d * 0.097 + 4) * kk, 0.09 * d + turn, 0];
}
export function sliceDrive(out, { t, G }, m = {}) {
  const { k, d } = life(G, t, { lead: 8, coast: 8, ...m }), T = t;
  // The strong beats turn it, in the plane of the sheet. Going further through the lattice flips what's in its long lines, and on a beat that's the whole frame going light and dark.
  writeSlice(out, sliceAngles(d * (m.speed ?? 1), k, (m.heave ?? 0.28) * surgeAt(T) * k + 0.03 * tuneAt(t) * k), [(m.fly ?? 0.05) * d, 0.6 * (m.fly ?? 0.05) * d], m.k ?? 2.1);
}

// ---------------------------------------------------------------- strata
// A sheet of three or more sets of lines comes loose: each set lifts off to a pane of glass of its own (chunks/space.js, kind 8), and nothing morphs. Straight under the camera the sheet holds; away from there each
// pane slides by its own height, so triangles turn into hexagons, six-pointed stars and back, in broad bands that sweep as the camera leans. The sheet itself stays exactly the frame, so with the panes together it's the plain sheet.
//
//   G.moves = [{ id: 'strata', from, lands, sep }]   sep: a lane [[t, x], ...] of how far apart the panes are, in frame units, 0 at `from` and 0 at `lands`, which is where it locks back into register.
//     tilt   how far the camera leans as the panes part, radians. spin: how fast the way it leans goes round, radians a second. yaw: where that starts. peak: when they're furthest apart
//
// Sets that run nearly the same way at nearly the same size (within 30% and 20 degrees) stay on one pane, or the two of them could tune into big solid areas. A plain check is only a shear, so it isn't worn.
const PANE_K = 0.3, PANE_ANG = 20 * Math.PI / 180, POLES = ['r1', 'l1', 't1', 'r2', 'l2', 't2'];
const STRATA_D = 2.4;       // the camera's height: the panes are a fraction of it apart
export function panesOf(s) {
  const fams = [];
  for (let i = 0; i < FAMILIES; i++) {
    if (s[OFF[`f${i}.on`]] < 0.5 || Math.abs(s[OFF[`f${i}.d`]]) > 0.97) continue;
    const x = s[OFF[`f${i}.x`]], y = s[OFF[`f${i}.y`]], pole = POLES.map(n => s[OFF[`f${i}.${n}`]]);
    fams.push({ i, k: Math.hypot(x, y), ang: ((Math.atan2(y, x) % Math.PI) + Math.PI) % Math.PI, pole, round: pole.some(v => Math.abs(v) > 1e-4) });
  }
  const near = (a, b) => {
    const d = Math.abs(a.ang - b.ang), da = Math.min(d, Math.PI - d);
    return Math.abs(a.k - b.k) <= PANE_K * Math.max(a.k, b.k) && da <= PANE_ANG;
  };
  // Only stripes lift: rings and spokes stay on the sheet itself (a pane each would cost every program with the sheet in space a ring's worth of work per family, on every pixel, drawn or not)
  const panes = [];
  for (const f of fams) { if (f.round) continue; const p = panes.find(q => near(q[0], f)); if (p) p.push(f); else panes.push([f]); }
  if (panes.length < 3) return null;
  // Round the way the lines run, so the heights go round with them, and spread evenly about the sheet: the middle pane stays where it is
  panes.sort((a, b) => a[0].ang - b[0].ang);
  const e = [0, 0, 0, 0], n = panes.length;
  panes.forEach((p, j) => { for (const f of p) e[f.i] = -1 + 2 * j / (n - 1); });
  return e;
}
// Can it be worn: a flat sheet, and something to re-weave
export const strataFits = s => s[OFF['surf.kind']] < 0.5 && s[OFF['matte.kind']] < 0.5 && s[OFF['ribbon.on']] < 0.5 && s[OFF['blobs.on']] < 0.5 && s[OFF['droste.lnS']] === 0 && s[OFF['field.kind']] < 0.5 && s[OFF['slip.kind']] < 0.5 && !!panesOf(s);
// How far apart the panes are at t
export const strataSep = (m, t) => (t <= m.from || t >= m.lands ? 0 : Math.max(0, val(m.sep, t)));
// Its camera: it leans further as the panes part, the way it leans goes round, and the tune leans it. A strong beat heaves it in a little, a pulse you see in depth and not in brightness.
export function strataNumbers(t, c, sep, top, e, m = {}) {
  // It leans as the panes part, and comes upright as they sink back, a little ahead of them: the bands are about where it looks straight down, and balanced about the middle of the frame its brightness can't swing
  const k = clamp(sep / Math.max(top, 1e-4)), lean = m.peak != null && t >= m.peak ? k : Math.sqrt(k), tune = tuneAt(c), kick = kickAt(t);
  const yaw = (m.yaw ?? 0.6) + (m.spin ?? 0.12) * (t - (m.from ?? 0)) + 0.45 * tune;
  return {
    amp: sep, pitch: (m.tilt ?? 0.3) * lean + 0.06 * tune * k, yaw, roll: 0, dist: STRATA_D / (1 + 0.05 * kick * k),
    bowl: e[0], q: e[1], pix: e[2], w: e[3],
  };
}
const strata = {
  id: 'strata',
  needs(slot) { return strataFits(slot); },
  write(out, { t, c, m }) {
    const sep = strataSep(m, t);
    if (!(sep > 1e-6)) return;      // locked: the plain sheet, on the plain program
    const e = panesOf(out);
    if (!e) return;
    writeSpace(out, 8, strataNumbers(t, c ?? t, sep, m.top ?? sep, e, m));
  },
};
// With no song, or picked by hand: an endless round of it. It comes loose over 14 s, travels apart, and sinks back into register, then the sheet goes on whole for a few seconds.
const STRATA_LOOP = [[0, 0], [3, 0], [9, 0.16], [16, 0.3], [20, 0.32], [22.5, 0], [27, 0]];
export function strataLoop(out, t, t0) {
  const L = STRATA_LOOP.at(-1)[0], n = Math.floor((t - t0) / L), u = t - t0 - n * L;
  const sep = u <= 3 || u >= 22.5 ? 0 : Math.max(0, val(STRATA_LOOP, u)), e = sep > 1e-6 ? panesOf(out) : null;
  if (e) writeSpace(out, 8, strataNumbers(t, t, sep, 0.32, e, { from: t0 + n * L + 3, peak: t0 + n * L + 20, yaw: 0.6 + 1.9 * n, spin: 0.1 }));
}

// How each of them sits on the same relief
export const TERRACES = { Q: 0.2, A: 0.46, F: 1.7, P: 0.92, fly: 0.4 };
const move = (id, kind, numbers, more = {}) => ({
  id, flies: true,      // src/score/moves/index.js: at the end of its time it's flat, but not where it started
  needs() { return true; },
  write(out, { t, c, G, m }) { writeSpace(out, kind, numbers(G, t, c ?? t, { ...more, ...m })); },
});

export default {
  swell: move('swell', 1, reliefNumbers),
  terraces: move('terraces', 1, reliefNumbers, TERRACES),
  pleats: move('pleats', 4, pleatNumbers),
  ride: move('ride', 5, rideNumbers),
  hall: move('hall', 7, hallNumbers),
  slice: { id: 'slice', flies: true, needs(slot) { return [0, 1, 2, 3].every(i => slot[OFF[`f${i}.on`]] >= 0.5); }, write(out, c) { sliceDrive(out, c, c.m); } },
  strata,
};
