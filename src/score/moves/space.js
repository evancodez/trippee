// The sheet in space, as a stretch of a song: a pattern on a sheet that has left the plane (src/gl/chunks/space.js). The numbers are the slot's own, so arcs, knobs, slides, flights, plates and the song all work on it. It's a camera and a
// surface, in front of everything the pattern is, so it doesn't care what the pattern is. At amount 0 and pitch 0 it is exactly the flat frame.
//
//   G.moves = [{ id: 'swell' }]      any of swell, terraces, pins, pleats, ride, on any pattern. Every number can be a plain number or a lane [[t, x], ...] in song seconds. Say nothing, and it comes up over `lead` seconds from where the shot starts and
//                                    goes back to flat over `coast` before `to` (song seconds; default the end of the shot's body), and in between it travels.
//     amp      how high the sheet goes
//     f, ph    its waves: how many a unit, and where they've got to
//     pitch, yaw, roll, dist    the camera
//     x, y, z  where it's looking, and how far up. y runs on by itself at `fly` units a second
//     bowl     the world curving up ahead, so there's no horizon
//     q, pix   terraces (height in steps of this), square columns (this wide). A pins move has pix, a terraces move has q
//     fly      how fast it goes. heave: how hard it surges into each strong beat. lift: how far each strong beat lifts the sheet
//
// On the strong beats (the song's own, read off the score that's up, as handClock in surge.js does) the sheet heaves and the camera surges forward, with no change of brightness. The tune swings the camera a little. Both go through reaction: nothing here replaces it.
import { OFF } from '../../pattern/layout.js';
import { clamp, smoother } from '../curves.js';
import { val } from './long.js';
import { melodyAt } from '../react.js';

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
    amp: amp0 * (1 + (m.lift ?? 0.22) * kick),
    f, ph: v(m.ph) ?? (m.drift ?? 0.1) * d + 0.3 * surgeAt(T) * k,
    pitch, yaw: v(m.yaw) ?? k * (0.5 * Math.sin(d * 0.07) + 0.06 * tune), roll: v(m.roll) ?? k * (0.14 * Math.sin(d * 0.11 + 1) + 0.03 * tune), dist,
    x: v(m.x) ?? 0, y: v(m.y) ?? (m.fly ?? 0.55) * d + (m.heave ?? 0.5) * surgeAt(T) * k, z: v(m.z) ?? 0,
    bowl: v(m.bowl) ?? (m.bow ?? 0.07) * k, q: v(m.q) ?? m.Q ?? 0, pix: v(m.pix) ?? m.PIX ?? 0,
  };
}
export function pleatNumbers(G, t, c, m = {}) {
  const T = t, { k, d } = life(G, T, m), kick = kickAt(T), v = l => (l == null ? undefined : val(l, T));
  return {
    amp: (v(m.amp) ?? (m.A ?? 1.05) * k) * (1 + (m.lift ?? 0.16) * kick),
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

// How each of them sits on the same relief
export const TERRACES = { Q: 0.2, A: 0.46, F: 1.7, P: 0.92, fly: 0.4 }, PINS = { PIX: 0.42, A: 0.5, F: 1.25, P: 0.8, bow: 0, fly: 0.3, D: 1.7, lift: 0.3 };
const move = (id, kind, numbers, more = {}) => ({
  id,
  needs() { return true; },
  write(out, { t, c, G, m }) { writeSpace(out, kind, numbers(G, t, c ?? t, { ...more, ...m })); },
});

export default {
  swell: move('swell', 1, reliefNumbers),
  terraces: move('terraces', 1, reliefNumbers, TERRACES),
  pins: move('pins', 1, reliefNumbers, PINS),
  pleats: move('pleats', 4, pleatNumbers),
  ride: move('ride', 5, rideNumbers),
};
