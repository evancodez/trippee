// Starter patterns while the engine comes up.
import { plane, ring, logring, spokes, spiral, triLattice } from '../kit.js';
import { Q } from '../genome.js';

export default [
  { id: 'lines.field', name: 'Field', family: 'lines',
    g: { fams: [plane(7, 90)], bend1: { a: 0.08, f: 2.2, ang: 0 }, bend2: { a: 0.05, f: 1.3, ang: 1.57 } },
    flow: { 'f0.ph': 1 }, arcs: [{ path: 'scale', from: 3, to: 0.5, log: true }, { path: 'bend1.a', from: 0.02, to: 0.3 }] },
  { id: 'dots.sheet', name: 'Dots', family: 'dots',
    g: { round: 1, fams: [plane(4, 45), plane(4, 135)], bulge: { a: 2.5, r: 1.2, cx: 0.8, cy: 0.2 } },
    flow: { 'f0.ph': 1 }, arcs: [{ path: 'scale', from: 0.6, to: 2.2, log: true }] },
  { id: 'lattice.tri', name: 'Triangles', family: 'lattice', solid: 2 / 3,
    g: { fams: triLattice(3, 90), wob: 0.05, wobF: 1.5 },
    flow: { 'f0.ph': 1, 'f1.ph': -1 }, arcs: [{ path: 'scale', from: 0.25, to: 3.5, log: true }, { path: 'wobT', from: 0, to: 4 }] },
  { id: 'check.floor', name: 'Floor', family: 'check',
    g: { fams: [plane(1.6, 0), plane(1.6, 90)], surf: { kind: 1 }, cam: { pitch: 1.1, dist: 2.2 }, q: Q.plane },
    flow: { 'f1.ph': 1 }, arcs: [{ path: 'cam.pitch', from: 0.2, to: 1.32 }] },
  { id: 'pole.rings', name: 'Target', family: 'pole',
    g: { fams: [logring(4), spokes(24)], ripple: { a: 0.02, f: 10 } },
    flow: { 'f0.ph': -1 }, arcs: [{ path: 'scale', from: 1, to: 3, log: true }] },
  { id: 'body.planet', name: 'Planet', family: 'body',
    g: { round: 1, fams: [plane(1.3, 0), plane(1.3, 90)], surf: { kind: 1, map: 2, mapR: 12 }, q: Q.sphere(0.8), cam: { pitch: 0.3, dist: 3 } },
    arcs: [{ path: 'surf.spin', from: 0, to: 3 }, { path: 'cam.pitch', from: 0.2, to: -0.3 }] },
];
