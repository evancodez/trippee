// Drunk in LA and Girl of the Year: three families of lines, so triangles. Micro to macro, opened into hexagons, folded into a
// star that runs from huge to hairline, stretched into teeth, and laid on a floor.
//
// Each `solid` is measured, not the textbook 2/3: at exactly 2/3 the three bands still meet at a point, so fine lattices keep a grey
// speck per triangle. 0.72 is clean, and the wobbled and lensed ones need a little more.
import { triLattice } from '../kit.js';

// Triangles of any shape: base kx, height ky. The sum of the phases stays 1/4, so three lines always meet at a point.
const stretched = (kx, ky) => [{ y: ky, ph: 0.25 }, { x: -kx, y: -ky / 2 }, { x: kx, y: -ky / 2 }];
// A floor and a ceiling, the two planes z = ±h. The camera stays between them, so the frame is always covered and a sweep can land
// in either solid, with the horizon anywhere.
const slab = h => ({ zz: 1, ww: -h * h, zw: 0 });

export default [
  // The master lattice: hairline to larger than the frame in one gesture. Once it's huge the edges wobble like cut paper.
  { id: 'lattice.master', name: 'Micro to Macro', family: 'lattice', solid: 0.92,
    g: { fams: triLattice(3, 90), wob: 0.03, wobF: 1.2, rot: 0, lens: { c: 0.7, m: 1, cx: 0.9, cy: -0.45 } },
    flow: { 'f0.ph': 1, 'f1.ph': -1 },
    arcs: [
      { path: 'scale', from: 0.2, to: 6, log: true },
      { path: 'wob', from: 0.01, to: 0.085 },
      { path: 'wobF', from: 0.5, to: 15, log: true },
      { path: 'wobT', from: 0, to: 5 },
      { path: 'rot', from: -0.1, to: 0.32 },
    ],
    axes: [
      { id: 'zoom', name: 'zoom', path: 'scale', min: 0.12, max: 8, log: true },
      { id: 'cut', name: 'hand', path: 'wob', min: 0, max: 0.2 },
      { id: 'turn', name: 'turn', path: 'rot', min: -1.05, max: 1.05 },
    ],
    lambda: 0.1 },

  // Kagome: one family slides a quarter cycle, and the triangles open into hexagons without anything travelling. Then it closes again.
  { id: 'lattice.kagome', name: 'Kagome', family: 'lattice', solid: 0.72,
    g: { fams: triLattice(2.4, 90), rot: 0.12, lens: { c: 0.8, m: 1, cx: 0.7, cy: -0.3 } },
    flow: { 'f1.ph': 1, 'f2.ph': -1 },
    arcs: [
      { path: 'f0.ph', from: 0.25, to: 0, ease: 'wave', cycles: 1 },
      { path: 'scale', from: 0.4, to: 4.5, log: true },
      { path: 'rot', from: 0.12, to: -0.3 },
    ],
    axes: [
      { id: 'open', name: 'open', path: 'f0.ph', min: -0.25, max: 0.5 },
      { id: 'zoom', name: 'zoom', path: 'scale', min: 0.2, max: 6, log: true },
      { id: 'lens', name: 'lens', path: 'lens.c', min: 0.4, max: 1 },
    ],
    lambda: 0.14 },

  // The star lens. A kaleidoscope folds the lattice into six, and a lens pulls it so triangles run from huge to hairline at the centre.
  { id: 'lattice.star', name: 'Star Lens', family: 'lattice', solid: 0.85,
    g: { fams: triLattice(3.6, 0), fold: { n: 6, rot: 0.6 }, lens: { c: 0.9, m: 1 } },
    flow: { 'f0.ph': 1, 'f1.ph': -1 },
    arcs: [
      { path: 'lens.c', from: 1, to: 0.36 },
      { path: 'scale', from: 4, to: 0.7, log: true },
      { path: 'fold.rot', from: 0.6, to: 1.5 },
    ],
    axes: [
      { id: 'lens', name: 'lens', path: 'lens.c', min: 0.25, max: 1.1 },
      { id: 'zoom', name: 'zoom', path: 'scale', min: 0.2, max: 6, log: true },
      { id: 'fold', name: 'fold turn', path: 'fold.rot', min: 0, max: 2.1 },
    ],
    lambda: 0.1 },

  // A pinwheel: the same star, wound. Curved triangles run down a spiral into the middle.
  { id: 'lattice.pinwheel', name: 'Pinwheel', family: 'lattice', solid: 0.72,
    g: { fams: triLattice(2.8, 90), fold: { n: 5, rot: 0 }, lens: { c: 0.5, m: 1 }, swirl: { a: 0, sig: 1, log: 0 } },
    flow: { 'f1.ph': 1, 'f2.ph': -1 },
    arcs: [
      { path: 'swirl.log', from: 0, to: 1.6 },
      { path: 'lens.c', from: 0.8, to: 0.42 },
      { path: 'scale', from: 0.5, to: 3, log: true },
    ],
    axes: [
      { id: 'wind', name: 'wind', path: 'swirl.log', min: -3, max: 3 },
      { id: 'lens', name: 'lens', path: 'lens.c', min: 0.3, max: 1 },
      { id: 'zoom', name: 'zoom', path: 'scale', min: 0.2, max: 6, log: true },
    ],
    lambda: 0.12 },

  // Girl of the Year: long teeth stacked in columns, each column sliding against the next, huge on one side and crushed on the other.
  { id: 'lattice.teeth', name: 'Teeth', family: 'lattice', solid: 0.72,
    g: { fams: stretched(2, 0.8), teeth: { a: 0, c: 2, v: 0 }, bowtie: { a: 0, eps: 0.14, x0: -4, ang: 0 } },
    flow: { 'f0.ph': 2, 'f1.ph': -1, 'f2.ph': -1 },
    arcs: [
      { path: 'teeth.v', from: 0, to: 3.75 },
      { path: 'bowtie.a', from: 0, to: 0.97 },
      { path: 'bowtie.x0', from: -4, to: -0.45 },
      { path: 'scale', from: 0.42, to: 2.1, log: true },
    ],
    axes: [
      { id: 'slide', name: 'slide', path: 'teeth.v', min: -5, max: 5 },
      { id: 'waist', name: 'crush', path: 'bowtie.a', min: 0, max: 1 },
      { id: 'where', name: 'where', path: 'bowtie.x0', min: -4, max: 4 },
      { id: 'zoom', name: 'zoom', path: 'scale', min: 0.3, max: 4, log: true },
    ],
    lambda: 0.14 },

  // A floor of triangles tipping over the horizon and becoming a ceiling.
  { id: 'lattice.floor', name: 'Triangle Floor', family: 'lattice', solid: 0.72,
    g: { fams: triLattice(1.6, 90), surf: { kind: 1 }, q: slab(0.9), cam: { dist: 0.8, pitch: 0.05, yaw: 0 } },
    flow: { 'f0.ph': 1, 'f1.ph': -1 },
    arcs: [
      { path: 'cam.pitch', from: 0.05, to: 3.09 },
      { path: 'scale', from: 0.9, to: 3.2, log: true },
      { path: 'cam.yaw', from: 0, to: 0.9 },
    ],
    axes: [
      { id: 'tilt', name: 'tilt', path: 'cam.pitch', min: 0, max: 3.1 },
      { id: 'turn', name: 'turn', path: 'cam.yaw', min: -1.6, max: 1.6 },
      { id: 'zoom', name: 'zoom', path: 'scale', min: 0.2, max: 4, log: true },
    ],
    lambda: 0.15 },
];
