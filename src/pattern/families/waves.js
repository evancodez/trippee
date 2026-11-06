// Waves: rolling sheets of lines and checks, in pure black and white. The surface reads as water or silk only from how the lines crowd.
import { plane, ring } from '../kit.js';
import { Q } from '../genome.js';
import { thetaAt } from '../../score/frame.js';
import { lerp, smoother } from '../../score/curves.js';

const TAU = Math.PI * 2;
const lam = k => (1 / k) / 3.56;
// The sheet's three waves all close when sheet.t has advanced by 10 pi, so a half turn per cycle returns every ten cycles, at the film's speed.
const ROLL = Math.PI;

// The sky beyond a floor's horizon stays black whatever the threshold does, so a floor can't close to white with its horizon up.
// If the frame closes towards white while the sky is showing, the camera tips down and takes the horizon out of frame first.
const CLEAR_PITCH = 0.98;   // at the default camera distance, no sky is in frame below this pitch
function tipDown(out, { t, OFF, G }) {
  if (!G) return;
  const k = smoother(-thetaAt(G, t, 1) * 1.2);
  if (k > 0) out[OFF['cam.pitch']] = Math.min(out[OFF['cam.pitch']], lerp(out[OFF['cam.pitch']], CLEAR_PITCH, k));
}

export default [
  // A sheet of lines rolling under its own weight: the parallax map folds, and lines hide behind the crests.
  { id: 'waves.swell', pool: false, name: 'Swell', family: 'waves',
    g: { fams: [plane(5, 90)], sheet: { a: 0.2, f: 2.2, ang: 0.35 } },
    flow: { 'sheet.t': ROLL },
    arcs: [
      { path: 'sheet.a', from: 0.05, to: 0.42 },
      { path: 'freq', from: 4, to: 0.5, log: true },
      { path: 'sheet.f', from: 3.2, to: 1.5 },
      { path: 'rot', from: -0.1, to: 0.35 },
    ],
    axes: [
      { id: 'height', name: 'height', path: 'sheet.a', min: 0, max: 0.8 },
      { id: 'length', name: 'length', path: 'sheet.f', min: 0.6, max: 6, log: true },
      { id: 'lines', name: 'lines', path: 'freq', min: 0.3, max: 8, log: true },
      { id: 'turn', name: 'turn', path: 'sheet.ang', min: -1.5, max: 1.5 },
    ],
    lambda: lam(5) },

  // The sea: swells that bunch and spread as they run in from a horizon. The horizon only comes in at the top of the tilt.
  { id: 'waves.sea', pool: false, name: 'Sea', family: 'waves',
    g: { fams: [plane(2, 0)], surf: { kind: 1 }, q: Q.plane, cam: { pitch: 1.3, dist: 2.2 }, rot: Math.PI / 2,
      sheet: { a: 0.05, f: 3.4, ang: 0.25 }, ripple: { a: 0.05, f: 12, cx: -9 }, bend1: { a: 0.1, f: 1.7, ang: Math.PI / 2 } },
    flow: { 'ripple.ph': -TAU, 'sheet.t': ROLL },
    arcs: [
      { path: 'cam.pitch', from: 0.7, to: 1.42, ease: 'wave' },
      { path: 'scale', from: 0.16, to: 1.6, log: true, ease: 'wave' },
      { path: 'ripple.a', from: 0.012, to: 0.058, ease: 'wave' },
      { path: 'sheet.a', from: 0.012, to: 0.12, ease: 'wave' },
      { path: 'cam.roll', from: -0.1, to: 0.1 },
    ],
    axes: [
      { id: 'tilt', name: 'tilt', path: 'cam.pitch', min: 0.2, max: 1.5 },
      { id: 'swell', name: 'swell', path: 'ripple.a', min: 0, max: 0.08 },
      { id: 'chop', name: 'chop', path: 'sheet.a', min: 0, max: 0.3 },
      { id: 'lines', name: 'lines', path: 'freq', min: 0.3, max: 6, log: true },
    ],
    drive: tipDown,
    lambda: lam(2) },

  // A flag of checks: the same rolling sheet with a second family, so it reads as cloth.
  { id: 'waves.cloth', pool: false, name: 'Cloth', family: 'waves',
    g: { fams: [plane(2.2, 35), plane(2.2, 125)], sheet: { a: 0.28, f: 1.9, ang: -0.5 } },
    flow: { 'sheet.t': ROLL },
    arcs: [
      { path: 'sheet.a', from: 0.05, to: 0.5, log: true },
      { path: 'freq', from: 4.5, to: 0.55, log: true },
      { path: 'sheet.f', from: 2.4, to: 1.5 },
      { path: 'rot', from: 0, to: 0.4 },
    ],
    axes: [
      { id: 'height', name: 'height', path: 'sheet.a', min: 0, max: 0.9 },
      { id: 'length', name: 'length', path: 'sheet.f', min: 0.6, max: 6, log: true },
      { id: 'size', name: 'checks', path: 'freq', min: 0.3, max: 10, log: true },
    ],
    lambda: lam(2.2) },

  // Riley's Current: one wave repeated at an angle to itself, so the lines crowd along false ridges and the flat sheet looks corrugated.
  { id: 'waves.current', name: 'Current', family: 'lines',
    g: { fams: [plane(5, 0)], bend1: { a: 0.3, f: 6, ang: Math.PI / 4 } },
    flow: { 'bend1.ph': ROLL },   // a half turn per cycle: it closes every two
    arcs: [
      { path: 'bend1.a', from: 0.05, to: 0.44 },
      { path: 'bend1.f', from: 7, to: 3.5 },
      { path: 'freq', from: 5, to: 0.7, log: true },
      { path: 'rot', from: -0.2, to: 0.5 },
    ],
    axes: [
      { id: 'ridge', name: 'ridge', path: 'bend1.a', min: 0, max: 0.6 },
      { id: 'length', name: 'length', path: 'bend1.f', min: 1.5, max: 14, log: true },
      { id: 'lean', name: 'lean', path: 'bend1.ang', min: 0.2, max: 1.4 },
      { id: 'lines', name: 'lines', path: 'freq', min: 0.3, max: 8, log: true },
    ],
    lambda: lam(5) },

  // A stone in a pond, seen from low down: rings bunch and spread on their way out, ellipses to a grazing shore.
  { id: 'waves.pond', pool: false, name: 'Pond', family: 'waves',
    g: { fams: [ring(3)], surf: { kind: 1 }, q: Q.plane, cam: { pitch: 1, dist: 2.4 }, ripple: { a: 0.09, f: 8, cx: 0 } },
    flow: { 'ripple.ph': TAU, 'f0.ph': -1 },
    arcs: [
      { path: 'cam.pitch', from: 0.2, to: 1.34, ease: 'wave' },
      { path: 'scale', from: 0.35, to: 1.5, log: true },
      { path: 'ripple.a', from: 0.03, to: 0.11 },
    ],
    axes: [
      { id: 'tilt', name: 'tilt', path: 'cam.pitch', min: 0, max: 1.5 },
      { id: 'steep', name: 'steep', path: 'ripple.a', min: 0, max: 0.13 },
      { id: 'lines', name: 'rings', path: 'f0.r1', min: 0.5, max: 12, log: true },
    ],
    drive: tipDown,
    lambda: lam(3) },

  // Dunes: a check floor rolled into hills that hide behind each other, going away to a hard black sky.
  { id: 'waves.dune', pool: false, name: 'Dunes', family: 'waves',
    g: { fams: [plane(1.4, 0), plane(1.4, 90)], surf: { kind: 1 }, q: Q.plane, cam: { pitch: 1.1, dist: 2.2 }, sheet: { a: 0.2, f: 1.6, ang: 0.3 } },
    flow: { 'sheet.t': ROLL },
    arcs: [
      { path: 'cam.pitch', from: 0.5, to: 1.36, ease: 'wave' },
      { path: 'scale', from: 0.42, to: 1.4, log: true, ease: 'wave' },
      { path: 'sheet.a', from: 0.04, to: 0.72, ease: 'wave' },
      { path: 'cam.roll', from: 0.12, to: -0.12 },
    ],
    axes: [
      { id: 'tilt', name: 'tilt', path: 'cam.pitch', min: 0.2, max: 1.5 },
      { id: 'hills', name: 'hills', path: 'sheet.a', min: 0, max: 0.8 },
      { id: 'length', name: 'length', path: 'sheet.f', min: 0.5, max: 5, log: true },
      { id: 'checks', name: 'checks', path: 'freq', min: 0.3, max: 6, log: true },
    ],
    drive: tipDown,
    lambda: lam(1.4) },

  // Silk: fine lines draped in long folds. The lines stay fine, so the fold lines are drawn by nothing but crowding.
  { id: 'waves.silk', pool: false, name: 'Silk', family: 'waves',
    g: { fams: [plane(13, 80)], sheet: { a: 0.3, f: 1.3, ang: 0.6 } },
    flow: { 'sheet.t': ROLL },
    arcs: [
      { path: 'sheet.a', from: 0.03, to: 0.46 },
      { path: 'freq', from: 1.7, to: 0.5, log: true },
      { path: 'sheet.f', from: 1, to: 1.5 },
      { path: 'sheet.ang', from: 0.2, to: 1 },
    ],
    axes: [
      { id: 'drape', name: 'drape', path: 'sheet.a', min: 0, max: 1 },
      { id: 'folds', name: 'folds', path: 'sheet.f', min: 0.5, max: 4, log: true },
      { id: 'lines', name: 'lines', path: 'freq', min: 0.1, max: 2.5, log: true },
      { id: 'turn', name: 'turn', path: 'sheet.ang', min: -1.5, max: 1.5 },
    ],
    lambda: lam(13) },
];
