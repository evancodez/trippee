// Pay No Mind: polka dots on curved space. They inflate until they merge, flip colour, and shrink to specks.
//
// round: 1 makes the field a product of waves, so theta 0 is a plain checker and dots only exist off-centre. The gesture's
// body sits at theta 0, so these patterns lift the whole field instead: a third family that is one big constant, let in by a
// tiny `sum`, adds a level to the field without changing its shape. `sum` is then the dot-size knob, and at 0 nothing is lifted,
// which is how every gesture still lands exactly in its solid.
import { plane } from '../kit.js';
import { smoother } from '../../score/curves.js';

const B = 40;                                   // the constant family's value
const LIFT = { ph: 0.25, d: -B };               // cos(pi/2) = 0, minus d: a family that is just the number B
const nr = n => 1 / Math.sqrt(n);
// Turn a level into a sum for a pattern with n families in all. level +1 is solid white, -1 solid black.
const sumFor = (level, n = 3) => level / (B * nr(n));
const SUM = n => 1.2 / (B * nr(n));

const TAU = Math.PI * 2;
// Quiet near the solids at both ends of the gesture, so the sweep in and out is still specks and nothing else.
const env = (u, a = 0.2) => smoother(u / a) * smoother((1 - u) / a);
const breathe = (phi, u, amp, n = 1, off = 0) => amp * Math.sin(TAU * (n * phi + off)) * env(u);
const lift = (amp, n = 1, off = 0, fams = 3) => (out, { u, phi, OFF }) => { out[OFF.sum] = sumFor(breathe(phi, u, amp, n, off), fams); };

export default [
  // The film's own, 262 to 280 s. Dots huge far from a pole and tiny at it. The pole comes in from outside the frame, so one big
  // dot becomes a whole falling field, while the spokes wind up into a spiral. They inflate, merge, flip, and shrink on the clock.
  { id: 'dots.inflate', name: 'Inflate', family: 'dots',
    g: { round: 1, fams: [{ l1: 4.775 }, { t1: 30 }, LIFT], 'p1.x': 3.8, 'p1.y': -2.3 },
    flow: { 'f0.ph': 1 },
    arcs: [
      { path: 'p1.x', from: 3.4, to: 1.05 },
      { path: 'p1.y', from: -2.1, to: -0.55 },
      { path: 'f1.l1', from: 0, to: -5.5, at: [0.3, 1] },
    ],
    drive: lift(1.03),
    axes: [
      { id: 'size', name: 'size', path: 'sum', min: -SUM(3), max: SUM(3) },
      { id: 'px', name: 'point x', path: 'p1.x', min: -2, max: 5 },
      { id: 'py', name: 'point y', path: 'p1.y', min: -3, max: 3 },
      { id: 'wind', name: 'wind', path: 'f1.l1', min: -12, max: 12 },
    ],
    lambda: 0.12 },

  // A sheet of dots made to roll: its own folds hide and crowd the rows. From big sparse dots to a fine rolling cloth.
  { id: 'dots.sheet', name: 'Rolling Sheet', family: 'dots',
    g: { round: 1, fams: [plane(4, 30), plane(4, 120), LIFT], sheet: { a: 0.3, f: 2, t: 0, ang: 0.45 } },
    flow: { 'f0.ph': 1 },
    arcs: [
      { path: 'scale', from: 3.6, to: 0.45, log: true },
      { path: 'sheet.a', from: 0.03, to: 0.3 },
      { path: 'sheet.t', from: 0, to: 9 },
    ],
    drive: lift(0.9, 1, 0.25),
    axes: [
      { id: 'size', name: 'size', path: 'sum', min: -SUM(3), max: SUM(3) },
      { id: 'folds', name: 'folds', path: 'sheet.a', min: 0, max: 0.8 },
      { id: 'zoom', name: 'zoom', path: 'scale', min: 0.25, max: 5, log: true },
      { id: 'width', name: 'fold width', path: 'sheet.f', min: 0.8, max: 6, log: true },
    ],
    lambda: 0.05 },

  // A size gradient right across the frame with no point in it at all: dots huge on one side, grains on the other. A conformal
  // power map from a pole beyond the left edge, so they stay round. The gradient grows out of a flat field and then spirals.
  { id: 'dots.gradient', name: 'Gradient', family: 'dots',
    g: { round: 1, fams: [plane(3.2, 45), plane(3.2, 135), LIFT],
      conf: { amt: 1, lam: 1, gam: 0, k: 1, x1: -2.05, y1: 0, c1: 1 } },
    flow: { 'f0.ph': 1 },
    arcs: [
      { path: 'conf.lam', from: 0.95, to: 0.08 },
      { path: 'conf.gam', from: 0, to: 1.25, at: [0.35, 1] },
      { path: 'conf.y1', from: -0.9, to: 0.7 },
    ],
    drive: lift(0.95, 1, 0.5),
    axes: [
      { id: 'size', name: 'size', path: 'sum', min: -SUM(3), max: SUM(3) },
      { id: 'grad', name: 'gradient', path: 'conf.lam', min: 0.02, max: 1 },
      { id: 'spiral', name: 'spiral', path: 'conf.gam', min: -1.5, max: 1.5 },
      { id: 'py', name: 'point', path: 'conf.y1', min: -1.5, max: 1.5 },
    ],
    lambda: 0.08 },

  // Dots down a real tunnel: round on the near wall, crushed flat as they run to the vanishing point, which drifts off-centre.
  { id: 'dots.funnel', name: 'Funnel', family: 'dots',
    g: { round: 1, fams: [{ x: 14 }, { y: 0.55 }, LIFT], surf: { kind: 1, map: 1, mapR: 1 },
      q: { xx: 1, yy: 1, zz: 0, ww: -1, zw: 0 }, cam: { dist: 1.2, pitch: 0 } },
    flow: { 'f1.ph': 1 },
    arcs: [
      { path: 'q.ww', from: -1.5, to: -0.6, log: true },
      { path: 'cam.pitch', from: -0.08, to: 0.48 },
      { path: 'cam.yaw', from: 0, to: 0.6 },
    ],
    drive(out, { u, phi, OFF }) {
      out[OFF.sum] = sumFor(breathe(phi, u, 0.85, 1, 0.75));
      // the far end of the tunnel is a black hole rather than grey dust. It closes before the landing, so a white solid is white.
      const r = 0.13 * env(u, 0.14);
      out[OFF['matte.kind']] = r > 1e-3 ? 1 : 0;
      out[OFF['matte.invert']] = 1;
      out[OFF['matte.cy']] = -out[OFF['cam.dist']] * Math.tan(out[OFF['cam.pitch']]);
      out[OFF['matte.rx']] = out[OFF['matte.ry']] = r;
    },
    axes: [
      { id: 'size', name: 'size', path: 'sum', min: -SUM(3), max: SUM(3) },
      { id: 'turn', name: 'turn', path: 'cam.yaw', min: -1.5, max: 1.5 },
      { id: 'wide', name: 'width', path: 'q.ww', min: -6, max: -0.5 },
      { id: 'deep', name: 'depth', path: 'f1.y', min: 0.3, max: 4, log: true },
    ],
    lambda: 0.1 },

  // Curved surfaces in black: a flat sheet swells, tears down the middle, and pulls back as two lobes crowding towards their limbs.
  { id: 'dots.lobes', name: 'Lobes', family: 'dots',
    g: { round: 1, fams: [{ y: 3.4 }, { r1: 3.4, z: 3 }, LIFT], 'p1.ay': 0, surf: { kind: 1 },
      q: { xx: 0, yy: 0, zz: 0, ww: 0, zw: 0.5 }, cam: { dist: 2.4 } },
    flow: { 'f0.ph': 1 },
    drive(out, { u, phi, OFF }) {
      // the plane z=0 slides into the two-sheet hyperboloid x² - y² - z² = r² and back, as one quadric, so it never jumps
      const k = smoother((u - 0.12) / 0.33) * smoother((0.96 - u) / 0.34);
      const r2 = 0.05 + 0.5 * u;
      out[OFF['q.xx']] = k; out[OFF['q.yy']] = -k * 0.6; out[OFF['q.zz']] = -k * 0.6;
      out[OFF['q.ww']] = -k * r2; out[OFF['q.zw']] = 0.5 * (1 - k);
      out[OFF.sum] = sumFor(breathe(phi, u, 0.7, 1, 0.25));
    },
    axes: [
      { id: 'size', name: 'size', path: 'sum', min: -SUM(3), max: SUM(3) },
      { id: 'dens', name: 'dots', path: 'f0.y', min: 1, max: 8, log: true },
      { id: 'pitch', name: 'tilt', path: 'cam.pitch', min: -0.8, max: 0.8 },
      { id: 'yaw', name: 'turn', path: 'cam.yaw', min: -0.8, max: 0.8 },
    ],
    lambda: 0.08 },
];
