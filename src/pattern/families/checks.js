// Lemon Glow, L'Inconnue, Lose Your Smile: the checker, and everything space can do to it.
import { plane, ring, spokes } from '../kit.js';

// A floor and a ceiling, the two planes z = ±h. The camera stays between them, so the frame is always covered and a sweep can land
// in either solid, with the horizon anywhere.
const slab = h => ({ zz: 1, ww: -h * h, zw: 0 });

export default [
  // Lemon Glow: broad checks with a band of crushed columns that travels across. The eye keeps falling into the band.
  { id: 'checks.crush', name: 'Crushed Band', family: 'checks',
    g: { fams: [plane(2.2, 0), plane(2.2, 90)], squeeze: { a: 0, x0: 0, b: 0.12, ang: 0 }, bend1: { a: 0.035, f: 2.6, ang: 0 } },
    flow: { 'f1.ph': 1 },
    arcs: [
      { path: 'squeeze.a', from: 0, to: 2.4 },
      { path: 'squeeze.x0', from: 1.8, to: -0.35 },
      { path: 'scale', from: 0.28, to: 2.4, log: true },
    ],
    axes: [
      { id: 'crush', name: 'crush', path: 'squeeze.a', min: 0, max: 2 },
      { id: 'where', name: 'where', path: 'squeeze.x0', min: -2, max: 2 },
      { id: 'band', name: 'band', path: 'squeeze.b', min: 0.02, max: 0.5, log: true },
      { id: 'zoom', name: 'zoom', path: 'scale', min: 0.2, max: 5, log: true },
    ],
    lambda: 0.2 },

  // A plain checker takes a twist: the centre drags round until diamonds wind in to hairlines.
  { id: 'checks.twist', name: 'Twist', family: 'checks',
    g: { fams: [plane(1.6, 0), plane(1.6, 90)], swirl: { a: 0, sig: 1.1, log: 0, cx: 0 }, lens: { c: 1, m: 1 } },
    flow: { 'f0.ph': 1 },
    arcs: [
      { path: 'swirl.a', from: 0, to: 9 },
      { path: 'lens.c', from: 1, to: 0.55 },
      { path: 'scale', from: 0.3, to: 1.7, log: true },
    ],
    axes: [
      { id: 'twist', name: 'twist', path: 'swirl.a', min: -12, max: 12 },
      { id: 'width', name: 'width', path: 'swirl.sig', min: 0.2, max: 3, log: true },
      { id: 'lens', name: 'lens', path: 'lens.c', min: 0.3, max: 1 },
      { id: 'zoom', name: 'zoom', path: 'scale', min: 0.2, max: 5, log: true },
    ],
    lambda: 0.2 },

  // Checks falling for ever down a log spiral: an endless fall with no reset, because each ring is the last one, bigger.
  { id: 'checks.fall', name: 'The Fall', family: 'checks',
    g: { fams: [{ l1: 1.27, t1: 8 }, { l1: 1.27, t1: -8 }], swirl: { a: 0, log: 0, sig: 1 }, tx: 0, ty: 0 },
    flow: { 'f0.ph': 1, 'f1.ph': 1 },
    arcs: [
      { path: 'swirl.log', from: -0.6, to: 1.1 },
      { path: 'tx', from: 0.9, to: -0.5 },
      { path: 'ty', from: -0.5, to: 0.2 },
    ],
    axes: [
      { id: 'wind', name: 'wind', path: 'swirl.log', min: -2.5, max: 2.5 },
      { id: 'x', name: 'centre x', path: 'tx', min: -1.7, max: 1.7 },
      { id: 'y', name: 'centre y', path: 'ty', min: -1, max: 1 },
      { id: 'lens', name: 'lens', path: 'lens.c', min: 0.3, max: 1.5 },
    ],
    lambda: 0.3 },

  // The floor: straight down at a checkerboard, tipping to the horizon, over it, and up to a ceiling.
  { id: 'checks.floor', name: 'Floor', family: 'checks',
    g: { fams: [plane(1, 0), plane(1, 90)], surf: { kind: 1 }, q: slab(0.9), cam: { dist: 0.8, pitch: 0.05, yaw: 0 } },
    flow: { 'f1.ph': 1 },
    arcs: [
      { path: 'cam.pitch', from: 0.05, to: 3.09 },
      { path: 'scale', from: 0.9, to: 3, log: true },
      { path: 'cam.yaw', from: -0.2, to: 0.8 },
    ],
    axes: [
      { id: 'tilt', name: 'tilt', path: 'cam.pitch', min: 0, max: 3.1 },
      { id: 'turn', name: 'turn', path: 'cam.yaw', min: -1.6, max: 1.6 },
      { id: 'zoom', name: 'zoom', path: 'scale', min: 0.2, max: 4, log: true },
    ],
    lambda: 0.2 },

  // Vasarely: fine checks with one enormous bulge rolling under them.
  { id: 'checks.vega', name: 'Vega', family: 'checks',
    g: { fams: [plane(6.5, 0), plane(6.5, 90)], bulge: { a: 0, r: 0.9, cx: 0, cy: 0 } },
    flow: { 'f0.ph': 1 },
    arcs: [
      { path: 'bulge.a', from: 0, to: 11, log: false },
      { path: 'bulge.r', from: 0.35, to: 1.2, log: true },
      { path: 'bulge.cx', from: -1.1, to: 0.8 },
      { path: 'bulge.cy', from: 0.45, to: -0.25 },
    ],
    axes: [
      { id: 'bulge', name: 'bulge', path: 'bulge.a', min: -0.9, max: 20 },
      { id: 'size', name: 'width', path: 'bulge.r', min: 0.2, max: 2, log: true },
      { id: 'x', name: 'x', path: 'bulge.cx', min: -1.7, max: 1.7 },
      { id: 'k', name: 'checks', path: 'freq', min: 0.3, max: 2.5, log: true },
    ],
    lambda: 0.08 },

  // The target: rings alone, then spokes open by slivers until it's a checker of rings. Round rings go square on the way.
  { id: 'checks.target', name: 'Target', family: 'checks',
    g: { fams: [ring(3), spokes(32, { d: -1 })], lens: { c: 0.55, m: 1 }, wob: 0.02, wobF: 1.1 },
    flow: { 'f0.ph': -1 },
    arcs: [
      { path: 'f1.d', from: -1, to: 0, ease: 'wave', cycles: 1 },
      { path: 'scale', from: 0.2, to: 3.2, log: true },
      { path: 'tx', from: -1.6, to: 0.1 },
      { path: 'wobT', from: 0, to: 3 },
    ],
    axes: [
      { id: 'spokes', name: 'spokes', path: 'f1.d', min: -1, max: 1 },
      { id: 'zoom', name: 'zoom', path: 'scale', min: 0.15, max: 5, log: true },
      { id: 'square', name: 'square', path: 'p1.q', min: -1, max: 1 },
      { id: 'x', name: 'centre', path: 'tx', min: -2, max: 2 },
      { id: 'lens', name: 'lens', path: 'lens.c', min: 0.3, max: 1 },
    ],
    lambda: 0.2 },

  // Lose Your Smile: a checker turned to cloth, folding over itself as it rolls.
  { id: 'checks.cloth', name: 'Cloth', family: 'checks',
    g: { fams: [plane(2.2, 8), plane(2.2, 98)], sheet: { a: 0.3, f: 1.3, t: 0, ang: 0.25 } },
    flow: { 'f0.ph': 1 },
    arcs: [
      { path: 'sheet.a', from: 0.02, to: 0.8 },
      { path: 'sheet.t', from: 0, to: 9 },
      { path: 'scale', from: 3.4, to: 1, log: true },
    ],
    axes: [
      { id: 'folds', name: 'folds', path: 'sheet.a', min: 0, max: 1 },
      { id: 'width', name: 'fold width', path: 'sheet.f', min: 0.6, max: 6, log: true },
      { id: 'roll', name: 'roll', path: 'sheet.t', min: 0, max: 25 },
      { id: 'zoom', name: 'zoom', path: 'scale', min: 0.2, max: 5, log: true },
    ],
    lambda: 0.2 },
];
