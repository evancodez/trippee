// Tricks with when and how the eye sees. Each is a move, by name from a film or a cut, and a pattern you can click (src/pattern/families/time.js). See src/gl/chunks/time.js and src/score/time-sheet.js.
//
//   slit      a slit-scan with no frames kept: each part of the frame sees the sheet at its own moment. A rolling shutter on a turning sheet bends straight spokes into blades, and every strong beat runs across the frame as a wave.
//   ghost     a figure that exists only while it moves. What's inside it slides one whole cycle through each strong beat, and at rest it's in register with the sheet and simply isn't there.
//   fringe    a face in the moire of two line sets. Nothing else draws it, and it turns its head.
//   waterfall a spiral runs dead steady for a long while and then stops: the still picture swims backward, in the viewer's own eye. It's no shader at all.
//   fence     a zoetrope: slits slide over a picture that doesn't move at all, and the picture moves.
import { OFF, FAMILIES } from '../../pattern/layout.js';
import { clamp, lerp, smoother, evalTrack } from '../curves.js';
import { val, laneT } from './long.js';
import { surged, handClock, cueHits, clockOf, ampOf } from './surge.js';
import { flag } from '../flags.js';

const TAU = Math.PI * 2;
const rtH = (H, arr, t) => { if (!H || !arr) return 0; const x = clamp(t * H.hz, 0, H.n - 1.001), i = Math.floor(x); return arr[i] + (arr[i + 1] - arr[i]) * (x - i); };
const rdR = (R, arr, c) => { const x = clamp(c * R.hz, 0, R.n - 1.001), i = Math.floor(x); return arr[i] + (arr[i + 1] - arr[i]) * (x - i); };
// What the music's doing at the song's own second: the tune, a big moment, how loud.
function heard(score, tReal) {
  const H = score.hear, R = score.heard, on = score.hearNow > 0;
  return { hit: on ? Math.min(1, rtH(H, H?.hit, tReal)) : 0, mel: on && R?.melNow ? rdR(R, R.melNow, R.C ? R.C(tReal) : tReal) : 0, loud: on ? rtH(H, H?.e, tReal) : 0.5 };
}
// The clock of strong beats: whole on each hit, worn or picked. And how much of it is on: a cut's lane or lead and coast, or by hand, up over a few seconds once the picture's arrived.
const beatsAt = (c, m) => (m.beats ? evalTrack(clockOf(m), c.t) : handClock({ t: c.t, phi: c.phi ?? 0, G: c.G }, 6));
const ampAt = (c, m, up = 4) => (c.hand ? smoother((c.t - c.begin) / up) : (m._amp ??= ampOf(m, 1))(c.t));

// ---------------------------------------------------------------- Slit
// Worn: { id: 'slit', map: 'sweep', D: 1.5, turn: 0.5, push: 0, beats: 'strong', amp: [[t, x], ...], bands: 0, ang: 1.57, spin: 0, wave, waveV, future }
//   map     sweep: a rolling shutter across the frame. target: the middle is now and the rim is the past. wave: a wave of delay sweeps across. bands + rings cut it into pieces that fall out of step
//   D       seconds of delay, end to end. A lane. A big moment takes it to nothing, so everything falls into register on the hit, and it winds up again after
//   turn    radians the sheet turns on each strong beat, surging. spin: radians a second on top. push: natural logs it pushes and comes back on each one
const slit = {
  id: 'slit',
  needs() { return true; },
  cue: cueHits,
  write(out, c) {
    const m = c.m, s = surged(evalTrack(clockOf(m), c.t));
    writeSlit(out, m, s, c.t);
  },
  sheet(want, m, c) { sheetSlit(want, m, c, ampAt(c, m)); },
};
function writeSlit(out, m, s, t) {
  if (m.turn) out[OFF.rot] += m.turn * s;
  if (m.spin) out[OFF.rot] += m.spin * t;
  if (m.push) out[OFF.scale] *= Math.exp(m.push * Math.sin(Math.PI * (s - Math.floor(s))));
}
function sheetSlit(want, m, c, amp) {
  const { hit, mel } = heard(c.score, c.tReal), t = c.t;
  const a = amp * c.fade * (1 - (m.register ?? 0.9) * hit);
  const D = val(m.D, laneT({ t, u: 0, G: c.G }), 1.5) * a;
  if (Math.abs(D) < 1e-4) return;
  want.map = m.map ?? 'sweep'; want.D = D; want.bands = m.bands ?? 0;
  want.ang = (m.ang ?? Math.PI / 2) + (m.lean ?? 0.3) * mel + (m.angV ?? 0) * t;
  want.cx = m.cx ?? 0; want.cy = (m.cy ?? 0) + (want.map === 'target' ? 0.25 * mel : 0);
  if (m.wave) { want.wave = m.wave; want.wavePh = (m.waveV ?? 1.2) * t; }
  if (m.reach) want.reach = m.reach;
}

// ---------------------------------------------------------------- Ghost
// The transit of each slide, whole number to whole number, centred on the hit, with a long dwell between where it isn't there at all. u: how far from one hit, in hits, from -.5 to .5.
const WHOLE = 0.5;
function transit(s, w = WHOLE) {
  const k = Math.floor(s + 0.5), u = s - k, y = smoother(clamp(u / w + 0.5));
  return { k, y };
}
// A hand, as capsules. Pose: x, y, turn, size, curl (0 open, 1 a fist), spread.
const FINGERS = [[-0.066, 0.078, 0.78, 0.0225], [-0.022, 0.085, 0.99, 0.0238], [0.022, 0.085, 1.06, 0.0251], [0.066, 0.078, 0.95, 0.0264]];
export function handCapsules({ x = 0, y = 0, turn = 0, size = 3.2, curl = 0, spread = 1, flip = 1 }) {
  const out = [], cs = Math.cos(turn), sn = Math.sin(turn);
  const P = (a, b) => { const X = a * size * flip, Y = b * size; return [x + cs * X - sn * Y, y + sn * X + cs * Y]; };
  const cap = (ax, ay, bx, by, r) => { const [a0, a1] = P(ax, ay), [b0, b1] = P(bx, by); out.push([a0, a1, b0, b1, r * size]); };
  // the palm and the wrist
  cap(-0.042, 0.05, -0.042, -0.07, 0.042); cap(0.042, 0.05, 0.042, -0.07, 0.042); cap(0, 0.06, 0, -0.08, 0.05);
  cap(0, -0.09, 0, -0.34, 0.05);
  FINGERS.forEach(([fx, fy, len, r], i) => {
    let dx = (i - 1.5) * spread * 0.2, dy = 1, ax = fx, ay = fy, L = len * 0.245, seg = 0.5;
    const l0 = Math.hypot(dx, dy); dx /= l0; dy /= l0;
    for (let j = 0; j < 3; j++) {
      const k = 1 - curl * (j === 0 ? 0.55 : 0.8), bx = ax + dx * L * seg * k, by = ay + dy * L * seg * k * (1 - curl * 0.6) - (curl * j * 0.02);
      cap(ax, ay, bx, by, r * Math.pow(0.92, j));
      ax = bx; ay = by; seg = j === 0 ? 0.3 : 0.2;
    }
  });
  const th = 0.9 - 0.6 * curl;
  cap(0.06, -0.05, 0.06 + 0.1 * Math.sin(th), -0.05 + 0.1 * Math.cos(th), 0.03);
  cap(0.06 + 0.1 * Math.sin(th), -0.05 + 0.1 * Math.cos(th), 0.06 + 0.17 * Math.sin(th - 0.25), -0.05 + 0.17 * Math.cos(th - 0.25), 0.026);
  return out;
}
// Where it comes up each time. It only ever moves while it isn't there, so it's in a new place each beat, and it's coming closer.
const POSES = [
  { x: 0, y: -0.25, turn: 0, size: 3.6, spread: 1 },
  { x: -0.95, y: -0.2, turn: 0.35, size: 3, spread: 1.3 },
  { x: 0.95, y: -0.2, turn: -0.35, size: 3, spread: 1.3, flip: -1 },
  { x: 0, y: 0.1, turn: 3.14, size: 3.4, spread: 0.7 },
  { x: -0.55, y: -0.35, turn: 0.15, size: 4, spread: 1, curl: 0.95 },
  { x: 0.6, y: -0.35, turn: -0.15, size: 4, spread: 1, flip: -1, curl: 0.95 },
  { x: 0, y: -0.45, turn: 0, size: 5.2, spread: 1.4 },
];
function firstOpen(s) {
  const out = [0, 0, 0, 0];
  for (let i = 0; i < FAMILIES; i++) if (s[OFF[`f${i}.on`]] >= 0.5 && Math.abs(s[OFF[`f${i}.d`]]) <= 0.98) { out[i] = 1; break; }
  return out;
}
const ghost = {
  id: 'ghost',
  needs() { return true; },
  cue: cueHits,
  write() {},
  sheet(want, m, c) { sheetGhost(want, m, c, beatsAt(c, m)); },
};
function sheetGhost(want, m, c, s) {
  if (c.fade <= 0) return;
  const { k, y } = transit(s, m.width ?? WHOLE);
  if (y <= 0 || y >= 1) return;       // in register: it isn't there, and it costs nothing
  const poses = m.poses ?? POSES, pose = poses[((k % poses.length) + poses.length) % poses.length];
  want.ghost = { slide: y * (m.dir ?? 1) * (m.cycles ?? 1), shares: m.shares ?? firstOpen(c.st.A), capsules: handCapsules(pose) };
}

// ---------------------------------------------------------------- Fringe
// The face lies in the sheet: a shallow mask, with parts above it and parts sunk below, and no round skull. Each bump: x, y, rx, ry, height, how far forward it stands (which is how far it goes as the head turns).
const FACE = [
  [0, 0.05, 0.72, 0.98, 0.95, 0.15],        // the mask
  [-0.27, 0.31, 0.2, 0.075, 0.1, 0.5], [0.27, 0.31, 0.2, 0.075, 0.1, 0.5],      // brows
  [-0.27, 0.15, 0.14, 0.085, -0.34, 0.2], [0.27, 0.15, 0.14, 0.085, -0.34, 0.2],    // sockets
  [-0.27, 0.15, 0.06, 0.05, 0.14, 0.4], [0.27, 0.15, 0.06, 0.05, 0.14, 0.4],       // lids
  [0, 0.14, 0.055, 0.2, 0.2, 0.7], [0, -0.13, 0.095, 0.085, 0.3, 1],                 // the nose
  [-0.095, -0.17, 0.05, 0.05, 0.09, 0.7], [0.095, -0.17, 0.05, 0.05, 0.09, 0.7],
  [-0.37, -0.16, 0.17, 0.2, 0.16, 0.35], [0.37, -0.16, 0.17, 0.2, 0.16, 0.35],     // cheeks
  [0, -0.38, 0.17, 0.04, 0.14, 0.7], [0, -0.47, 0.13, 0.045, 0.16, 0.7], [0, -0.425, 0.18, 0.02, -0.14, 0.6],     // lips
  [0, -0.6, 0.12, 0.05, -0.08, 0.5], [0, -0.76, 0.17, 0.11, 0.2, 0.55],       // under the lip, the chin
];
export function faceBumps(yaw, nod) { return FACE.map(([x, y, rx, ry, a, z]) => [x + yaw * z * 0.5, y + nod * z * 0.4, rx * (1 - 0.25 * Math.abs(yaw) * (1 - z)), ry, a]); }
const fringe = {
  id: 'fringe',
  needs(slot) { return slot[OFF['f0.on']] > 0.5 && slot[OFF['f1.on']] > 0.5; },
  cue: cueHits,
  write(out, c) { writeFringe(out, c.m, surged(evalTrack(clockOf(c.m), c.t))); },
  sheet(want, m, c) { sheetFringe(want, m, c, beatsAt(c, m), ampAt(c, m, 6)); },
};
function writeFringe(out, m, s) {
  out[OFF['f1.ph']] += (m.dir ?? 1) * s;     // one whole fringe to each strong beat, everything travelling up the head
}
function sheetFringe(want, m, c, s, amp) {
  const { mel, hit } = heard(c.score, c.tReal), a = amp * c.fade;
  if (a <= 0.001) return;
  const yawTo = m.yaw ?? 1, way = Math.sin(TAU * s / (m.turnEvery ?? 16));       // it looks about, slowly: one look to each so many strong beats, and the tune nods it
  want.fringe = { amp: (m.height ?? 5) * a * (1 + 0.25 * hit), shares: m.shares ?? [0, 1, 0, 0], size: m.size ?? 1.08, turn: 0, bumps: faceBumps(yawTo * way, (m.nod ?? 0.35) * mel) };
}

// ---------------------------------------------------------------- Waterfall
// Dead steady, for long enough that the eye has got used to it, and then it stops. What you see then isn't on the screen.
//   { id: 'waterfall', rate: 2.2, times: { stop: 77.75, go: 81 } }   rate: cycles a second. It comes to rest over one beat and doesn't move at all until go, which starts it again over a bar.
function waterClock(t, stops, rate, ease) {
  // Piecewise: run, stop, run. Each stop is [a, b]. The speed goes 1 to 0 over ease before a... the distance is the integral of that.
  let x = t, lost = 0;
  for (const [a, b] of stops) {
    if (t <= a - ease) break;
    if (t < a) { const u = (t - (a - ease)) / ease; x = t - lost - ease * (u * u * u - 0.5 * u * u * u * u); return rate * x; }       // from 1 to 0, smoothly, over ease. Costs ease/2 by the end of it
    if (t < b) return rate * (a - lost - ease / 2);
    const up = Math.min(1, (t - b) / (2 * ease));
    if (t < b + 2 * ease) return rate * (a - lost - ease / 2 + 2 * ease * (up * up * up - 0.5 * up * up * up * up));
    lost += (b - a) + ease / 2 + ease;
  }
  return rate * (t - lost);
}
const waterfall = {
  id: 'waterfall',
  needs() { return true; },
  cue(m, { G, beat, at, score }) {
    const own = G.pattern[m.id]; if (own) for (const k in own) if (m[k] === undefined) m[k] = own[k];
    m.ease = m.ease ?? (beat ?? 0.5);
    m.stops = (m.stops ?? (m.stop != null ? [[m.stop, m.go ?? m.stop + 8]] : [])).map(([a, b]) => [a, b]);
    if (!m.stops.length) return null;
    G.calm ??= 0.6;
    return m;
  },
  write(out, { t, m }) { writeWater(out, m, t); },
};
function writeWater(out, m, t) {
  const ph = waterClock(t, m.stops, m.rate ?? 2.2, m.ease ?? 0.5);
  for (const i of m.fams ?? [0]) out[OFF[`f${i}.ph`]] += ph * (m.way ?? 1);
}

// ---------------------------------------------------------------- Fence
// A zoetrope. The picture under the fence is cut into n columns of frames, one after another, and doesn't move at all. Only the slits move. Through them you see one frame at a time, so the picture moves, and when the fence stops, it stops.
//   { id: 'fence', n: 3, k: 3, spin: .52, flow: [1, 0, 0, 0], perBeat: 1 }   k: slits a unit. spin: radians, and flow: cycles of each family, that the sheet moves through in one loop of the frames. perBeat: slits per strong beat, one whole loop.
const framesFor = m => (m._frames ??= Array.from({ length: m.n ?? 3 }, (_, j) => { const x = j / (m.n ?? 3), f = m.flow ?? [1, 0, 0, 0]; return [(m.zoom ?? 0) * x, (m.spin ?? 0) * x, 0, 0, f[0] * x, f[1] * x, f[2] * x, f[3] * x]; }));
const fence = {
  id: 'fence',
  needs() { return true; },
  cue: cueHits,
  write() {},
  sheet(want, m, c) { sheetFence(want, m, c, surged(beatsAt(c, m))); },
};
function sheetFence(want, m, c, s) {
  if (c.fade <= 0) return;
  want.map = 'interlace'; want.frames = framesFor(m); want.ang = m.ang ?? 0;
  want.fence = { k: m.k ?? 3, slide: s * (m.perBeat ?? 1), n: m.n ?? 3, ang: m.ang ?? 0, open: ampAt(c, m) * c.fade };
}

export { writeSlit, writeFringe, writeWater };
export default { slit, ghost, fringe, waterfall, fence };
