// Tricks with when and how the eye sees. Each is a move, by name from a film or a cut, and a pattern you can click (src/pattern/families/time.js). See src/gl/chunks/time.js and src/score/time-sheet.js.
//
//   slit      a slit-scan with no frames kept: each part of the frame sees the sheet at its own moment. A rolling shutter on a turning sheet bends straight spokes into blades, and every strong beat runs across the frame as a wave.
//   ghost     a figure that exists only while it moves. What's inside it slides one whole cycle through each strong beat, and at rest it's in register with the sheet and simply isn't there.
//   fringe    a face in the moire of two line sets. Nothing else draws it, and it turns its head.
//   snakes    Rotating Snakes on any board: a picture that isn't moving at all drifts, and the song's camera nudges it into going.
//   waterfall a spiral runs dead steady for a long while and then stops: the still picture swims backward, in the viewer's own eye. It's no shader at all.
import { OFF, FAMILIES } from '../../pattern/layout.js';
import { clamp, lerp, smoother, evalTrack } from '../curves.js';
import { val } from './long.js';
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
const beatsAt = (c, m) => (m.beats ? evalTrack(clockOf(m), c.t) : timeClock(c));
// A riot move is the beat itself, so it turns the song's own beats down. These sit on top of them, and it's only a pick's clock asking.
export const timeClock = c => { c.G.calm ??= 1; return handClock({ t: c.t, phi: c.phi ?? 0, G: c.G }, 6); };
const cueTime = (m, ctx) => { m.calm ??= 1; return cueHits(m, ctx); };
const ampAt = (c, m, up = 4) => (c.hand ? smoother((c.t - c.begin) / up) : (m._amp ??= ampOf(m, 1))(c.t));

// ---------------------------------------------------------------- Slit
// Worn: { id: 'slit', map: 'sweep', D: 1.5, turn: 0.5, push: 0, beats: 'strong', amp: [[t, x], ...], bands: 0, ang: 1.57, spin: 0, wave, waveV, future }
//   map     sweep: a rolling shutter across the frame. target: the middle is now and the rim is the past. wave: a wave of delay sweeps across. bands + rings cut it into pieces that fall out of step
//   D       seconds of delay, end to end. A lane. A big moment takes it to nothing, so everything falls into register on the hit, and it winds up again after
//   turn    radians the sheet turns on each strong beat, surging. spin: radians a second on top. push: natural logs it pushes and comes back on each one
const slit = {
  id: 'slit',
  needs() { return true; },
  cue: cueTime,
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
  const D = val(m.D, t, 1.5) * a;
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
const FINGERS = [[-0.09, 0.09, 0.8, 0.028], [-0.03, 0.105, 1.0, 0.03], [0.03, 0.103, 1.06, 0.03], [0.09, 0.085, 0.9, 0.0275]];
export function handCapsules({ x = 0, y = 0, turn = 0, size = 2.6, curl = 0, spread = 1, flip = 1 }) {
  const out = [], cs = Math.cos(turn), sn = Math.sin(turn);
  const P = (a, b) => { const X = a * size * flip, Y = b * size; return [x + cs * X - sn * Y, y + sn * X + cs * Y]; };
  const cap = (ax, ay, bx, by, r) => { const [a0, a1] = P(ax, ay), [b0, b1] = P(bx, by); out.push([a0, a1, b0, b1, r * size]); };
  // the palm and the wrist
  cap(-0.08, 0.06, -0.06, -0.07, 0.042); cap(0.08, 0.06, 0.06, -0.07, 0.042); cap(0, 0.07, 0, -0.08, 0.06);
  cap(0, -0.08, 0, -0.36, 0.062);
  FINGERS.forEach(([fx, fy, len, r], i) => {
    let dx = (i - 1.5) * spread * 0.17, dy = 1, ax = fx, ay = fy, seg = 0.5;
    const l0 = Math.hypot(dx, dy); dx /= l0; dy /= l0;
    const L = len * 0.28;
    for (let j = 0; j < 3; j++) {
      // A curled finger folds down over the palm: seen from the front it only gets shorter
      const k = j === 0 ? 1 - 0.6 * curl : 1 - curl, bx = ax + dx * L * seg * k, by = ay + dy * L * seg * k;
      if (k > 0.02) cap(ax, ay, bx, by, r * Math.pow(0.93, j));
      ax = bx; ay = by; seg = j === 0 ? 0.3 : 0.2;
    }
  });
  const th = lerp(1, 0.2, curl), mx = 0.115, my = -0.06, s1 = lerp(0.12, 0.09, curl);
  cap(mx, my, mx + s1 * Math.sin(th), my + s1 * Math.cos(th), 0.036);
  cap(mx + s1 * Math.sin(th), my + s1 * Math.cos(th), mx + (s1 + 0.075) * Math.sin(th - 0.2 * (1 + curl)), my + (s1 + 0.075) * Math.cos(th - 0.2 * (1 + curl)), 0.031);
  return out;
}
// Where it comes up each time. It only ever moves while it isn't there, so it's in a new place each beat, and it's coming closer.
const POSES = [
  { x: 0, y: -0.15, turn: 0, size: 2.5, spread: 1 },
  { x: -0.95, y: -0.12, turn: 0.3, size: 2.2, spread: 1.4 },
  { x: 0.95, y: -0.12, turn: -0.3, size: 2.2, spread: 1.4, flip: -1 },
  { x: 0, y: 0.12, turn: Math.PI, size: 2.5, spread: 0.8 },
  { x: -0.7, y: -0.25, turn: 0.1, size: 2.9, spread: 0.6, curl: 0.95 },
  { x: 0.7, y: -0.25, turn: -0.1, size: 2.9, spread: 0.6, flip: -1, curl: 0.95 },
  { x: 0, y: -0.38, turn: 0, size: 3.6, spread: 1.5 },
];
function firstOpen(s) {
  const out = [0, 0, 0, 0];
  for (let i = 0; i < FAMILIES; i++) if (s[OFF[`f${i}.on`]] >= 0.5 && Math.abs(s[OFF[`f${i}.d`]]) <= 0.98) { out[i] = 1; break; }
  return out;
}
const ghost = {
  id: 'ghost',
  needs() { return true; },
  cue: cueTime,
  write() {},
  sheet(want, m, c) { sheetGhost(want, m, c, beatsAt(c, m)); },
};
function sheetGhost(want, m, c, s) {
  if (c.fade <= 0) return;
  const { k, y } = transit(s, m.width ?? WHOLE);
  if (y <= 0 || y >= 1) return;       // in register: it isn't there, and it costs nothing
  const poses = m.poses ?? POSES, pose = poses[((k % poses.length) + poses.length) % poses.length], side = k % 2 ? -1 : 1, g = want.ghost = { capsules: handCapsules(pose) };
  // Turning: inside the figure the sheet swings away and comes back, so any sheet at all shows it, and at both ends it's exactly as it was. Sliding: what's inside moves one whole cycle.
  if (m.how === 'slide') { g.slide = y * (m.dir ?? 1) * (m.cycles ?? 1); g.shares = m.shares ?? firstOpen(c.st.A); }
  else { const w = Math.sin(Math.PI * y); g.turn = (m.turn ?? 0.7) * side * w; g.zoom = (m.zoom ?? 0.25) * w; g.about = [pose.x, pose.y]; }
}

// ---------------------------------------------------------------- Fringe
// The face lies in the sheet: a shallow mask, with parts above it and parts sunk below, and no round skull. Each bump: x, y, rx, ry, height, how far forward it stands (which is how far it goes as the head turns).
const FACE = [
  [0, 0.05, 0.7, 0.96, 0.95, 0.15],        // the mask
  [-0.3, 0.33, 0.2, 0.07, 0.07, 0.5], [0.3, 0.33, 0.2, 0.07, 0.07, 0.5],      // brows
  [-0.29, 0.14, 0.15, 0.09, -0.4, 0.2], [0.29, 0.14, 0.15, 0.09, -0.4, 0.2],    // sockets
  [-0.29, 0.135, 0.075, 0.055, 0.2, 0.4], [0.29, 0.135, 0.075, 0.055, 0.2, 0.4],       // lids
  [0, 0.1, 0.05, 0.17, 0.13, 0.7], [0, -0.14, 0.09, 0.085, 0.32, 1],                 // the nose
  [-0.1, -0.18, 0.05, 0.05, 0.1, 0.7], [0.1, -0.18, 0.05, 0.05, 0.1, 0.7],
  [-0.42, -0.16, 0.16, 0.18, 0.14, 0.35], [0.42, -0.16, 0.16, 0.18, 0.14, 0.35],     // cheeks
  [0, -0.4, 0.18, 0.04, 0.17, 0.7], [0, -0.5, 0.14, 0.05, 0.2, 0.7], [0, -0.45, 0.2, 0.022, -0.2, 0.6],     // lips
  [0, -0.63, 0.12, 0.05, -0.08, 0.5], [0, -0.79, 0.17, 0.1, 0.2, 0.55],       // under the lip, the chin
];
export function faceBumps(yaw, nod) { return FACE.map(([x, y, rx, ry, a, z]) => [x + yaw * z * 0.5, y + nod * z * 0.4, rx * (1 - 0.25 * Math.abs(yaw) * (1 - z)), ry, a]); }
const fringe = {
  id: 'fringe',
  needs(slot) { return slot[OFF['f0.on']] > 0.5 && slot[OFF['f1.on']] > 0.5; },
  cue: cueTime,
  write(out, c) { writeFringe(out, c.m, surged(evalTrack(clockOf(c.m), c.t))); },
  sheet(want, m, c) { sheetFringe(want, m, c, beatsAt(c, m), ampAt(c, m, 6)); },
};
function writeFringe(out, m, s) {
  out[OFF['f1.ph']] += (m.dir ?? 1) * (m.perBeat ?? 0.5) * s;     // half a fringe to each strong beat, everything travelling up the head. A whole one takes every part of the frame from black to white and back on each
}
function sheetFringe(want, m, c, s, amp) {
  const { mel, hit } = heard(c.score, c.tReal), a = amp * c.fade;
  if (a <= 0.001) return;
  const yawTo = m.yaw ?? 1, way = Math.sin(TAU * s / (m.turnEvery ?? 16));       // it looks about, slowly: one look to each so many strong beats, and the tune nods it
  want.fringe = { amp: (m.height ?? 6.5) * a * (1 + 0.25 * hit), shares: m.shares ?? [0, 1, 0, 0], size: m.size ?? 1.08, turn: 0, bumps: faceBumps(yawTo * way, (m.nod ?? 0.35) * mel) };
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

// ---------------------------------------------------------------- Snakes
// A still picture that turns. It goes on any board of two families: a shade comes up in the back half of every cell, and from there on the picture has only to be nudged, which the song's camera does on every strong beat, for the rows to run past each other.
// A big moment reverses it, through a moment with no direction at all.
//   { id: 'snakes', dark: .1, light: .5, beats: 'strong', amp: [[t, x], ...], flips: [song seconds] }
const FLIP_D = 0.5;
function openPair(s) {
  const out = [];
  for (let i = 0; i < FAMILIES && out.length < 2; i++) if (s[OFF[`f${i}.on`]] >= 0.5 && Math.abs(s[OFF[`f${i}.d`]]) <= 0.98) out.push(i);
  return out.length === 2 ? out : null;
}
// Which way it's going, from the song's big moments: each one turns it round, over half a second centred on the hit.
function wayAt(m, c) {
  const list = m.flips ?? c.score.hear?.moments?.filter(q => q.size > 0.6 && q.sign > 0).map(q => q.t) ?? [];
  const t = c.tReal; let n = 0, w = 0;
  for (const h of list) { if (t >= h + FLIP_D / 2) n++; else if (t > h - FLIP_D / 2) { w = smoother((t - h + FLIP_D / 2) / FLIP_D); break; } else break; }
  return n % 2 ? 1 - w : w;
}
const snakes = {
  id: 'snakes',
  needs(slot) { return !!openPair(slot); },
  cue: cueTime,
  write() {},
  sheet(want, m, c) {
    const a = ampAt(c, m, 5) * c.fade, pair = openPair(c.st.A);
    if (a <= 0.001 || !pair || c.st.kind) return;
    want.snakes = { amt: a, dark: m.dark, light: m.light, way: wayAt(m, c), along: m.along ?? pair[1], across: m.across ?? pair[0] };
  },
};

export { writeSlit, writeFringe, writeWater };
export default { slit, ghost, fringe, waterfall, snakes };
