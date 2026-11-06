// Stripe fields, as in Dark Spring: one family of lines bending, pinching and crushing to moire.
import { plane, ring } from '../kit.js';

const lam = k => (1 / k) / 3.56;   // element size in frame widths, for k cycles per unit

export default [
  // The first thing the film shows: vertical lines drawn in to a waist, hair falling either side of it.
  { id: 'lines.river', name: 'River', family: 'lines',
    g: { fams: [plane(4.5, 0)], lens: { c: 0.55, cx: 0, cy: 0 }, bend1: { a: 0.1, f: 1.6, ang: Math.PI / 2 } },
    flow: { 'f0.ph': 1 },
    arcs: [
      { path: 'scale', from: 0.28, to: 2.6, log: true },
      { path: 'bend1.ph', from: 0, to: 9 },
      { path: 'lens.c', from: 0.42, to: 0.8 },
      { path: 'lens.cx', from: -0.5, to: 0.6 },
      { path: 'rot', from: -0.15, to: 0.75 },
      { path: 'bend1.a', from: 0.03, to: 0.2 },
    ],
    axes: [
      { id: 'waist', name: 'waist', path: 'lens.c', min: 0.3, max: 1.4 },
      { id: 'lines', name: 'lines', path: 'freq', min: 0.3, max: 6, log: true },
      { id: 'bend', name: 'bend', path: 'bend1.a', min: 0, max: 0.5 },
      { id: 'tilt', name: 'tilt', path: 'rot', min: -1.6, max: 1.6 },
    ],
    lambda: lam(4.5) },

  // Rays through one point: huge wedges at the frame edge, crushed to moire at the waist. Then upright slits open across them.
  { id: 'lines.bowtie', name: 'Bow-tie', family: 'lines',
    g: { fams: [plane(3.2, 90), plane(1.8, 0, { d: -1 })], bowtie: { a: 1, eps: 1, x0: 0 } },
    flow: { 'f0.ph': 1 },
    arcs: [
      { path: 'bowtie.eps', from: 1.2, to: 0.07, log: true, at: [0, 0.55] },
      { path: 'bowtie.x0', from: -0.7, to: 0.45 },
      { path: 'freq', from: 2.6, to: 0.6, log: true },
      { path: 'f1.d', from: -1, to: 0, at: [0.55, 0.9] },
    ],
    axes: [
      { id: 'waist', name: 'waist', path: 'bowtie.eps', min: 0.015, max: 2, log: true },
      { id: 'where', name: 'where', path: 'bowtie.x0', min: -1.5, max: 1.5 },
      { id: 'lines', name: 'lines', path: 'freq', min: 0.4, max: 8, log: true },
      { id: 'slits', name: 'slits', path: 'f1.d', min: -1, max: 0 },
    ],
    lambda: lam(3.2) },

  // Fine upright stripes open out into huge bars, and the bars pour through a band that crushes them to grey and walks across.
  { id: 'lines.squeeze', name: 'Crush', family: 'lines',
    g: { fams: [plane(3, 0)], squeeze: { a: 0.8, x0: 0, b: 0.06, ang: 0 }, bend1: { a: 0.05, f: 1.3, ang: Math.PI / 2 } },
    flow: { 'f0.ph': 1 },
    arcs: [
      { path: 'scale', from: 0.26, to: 2.6, log: true },
      { path: 'squeeze.a', from: 0.1, to: 1.25 },
      { path: 'squeeze.b', from: 0.2, to: 0.05, log: true },
      { path: 'squeeze.x0', from: 0.9, to: -0.35 },
      { path: 'bend1.a', from: 0.03, to: 0.16 },
      { path: 'rot', from: 0, to: 0.3 },
    ],
    axes: [
      { id: 'crush', name: 'crush', path: 'squeeze.a', min: 0, max: 1.6 },
      { id: 'band', name: 'band', path: 'squeeze.b', min: 0.02, max: 0.5, log: true },
      { id: 'where', name: 'where', path: 'squeeze.x0', min: -1.6, max: 1.6 },
      { id: 'lines', name: 'lines', path: 'freq', min: 0.3, max: 5, log: true },
    ],
    lambda: lam(3) },

  // Riley's lens: level lines swell over a lump that crosses the frame, and the lump turns inside out into a pinch.
  { id: 'lines.lens', name: 'Lens', family: 'lines',
    g: { fams: [plane(5, 90)], bulge: { a: 6, r: 0.8, cx: 0, cy: 0 } },
    flow: { 'f0.ph': 1 },
    arcs: [
      { path: 'bulge.a', from: 9, to: -0.86, at: [0.15, 0.85] },
      { path: 'bulge.r', from: 0.8, to: 1.5 },
      { path: 'bulge.cx', from: -0.9, to: 0.7 },
      { path: 'bulge.cy', from: 0.25, to: -0.2 },
      { path: 'freq', from: 0.3, to: 1.05, log: true },
      { path: 'rot', from: 0, to: 0.5 },
    ],
    axes: [
      { id: 'swell', name: 'swell', path: 'bulge.a', min: -0.92, max: 12 },
      { id: 'size', name: 'size', path: 'bulge.r', min: 0.15, max: 1.6, log: true },
      { id: 'lines', name: 'lines', path: 'freq', min: 0.3, max: 8, log: true },
    ],
    lambda: lam(5) },

  // Riley's Fall: one wave repeated across the frame, tightening towards the bottom until the lines vibrate.
  { id: 'lines.fall', name: 'Fall', family: 'lines',
    g: { fams: [plane(5, 0)], squeeze: { a: 1.4, x0: -1.25, b: 0.3, ang: Math.PI / 2 }, bend1: { a: 0.14, f: 2.4, ang: Math.PI / 2 } },
    flow: { 'bend1.ph': Math.PI },   // a half turn per cycle: it closes every two
    arcs: [
      { path: 'squeeze.a', from: 0.1, to: 2.2 },
      { path: 'squeeze.x0', from: 1.2, to: -1.2 },
      { path: 'bend1.a', from: 0.04, to: 0.19 },
      { path: 'scale', from: 0.3, to: 2.4, log: true },
    ],
    axes: [
      { id: 'fall', name: 'fall', path: 'squeeze.a', min: 0, max: 3.5 },
      { id: 'wave', name: 'wave', path: 'bend1.a', min: 0, max: 0.4 },
      { id: 'where', name: 'where', path: 'squeeze.x0', min: -1.6, max: 1.6 },
      { id: 'lines', name: 'lines', path: 'freq', min: 0.3, max: 5, log: true },
    ],
    lambda: lam(5) },

  // Two nearly equal fine families: a huge lattice out of nothing. The fringes are the picture; the carrier never moves much.
  { id: 'lines.ghost', name: 'Ghost', family: 'lines',
    g: { fams: [plane(42, 90), { x: 0, y: 42 }], bulge: { a: 3, r: 0.9, cx: 0.2, cy: 0 } },
    flow: { 'f0.ph': 1 },
    arcs: [
      { path: 'f1.y', from: 42.3, to: 47, log: true },
      { path: 'f1.x', from: 0.3, to: 4.5, log: true },
      { path: 'bulge.a', from: 0.5, to: 6 },
      { path: 'bulge.cx', from: -0.8, to: 0.7 },
    ],
    axes: [
      { id: 'beat', name: 'beat', path: 'f1.y', min: 42, max: 52 },
      { id: 'lean', name: 'lean', path: 'f1.x', min: -6, max: 6 },
      { id: 'swell', name: 'swell', path: 'bulge.a', min: 0, max: 10 },
    ],
    lambda: 0.2 },

  // Rings from two poles, slightly different in count: closed moire discs, as on the walls in Black Car.
  { id: 'lines.discs', name: 'Moire Discs', family: 'lines',
    g: { fams: [ring(30), ring(30, {}, 2)], 'p1.x': -0.1, 'p2.x': 0.1 },
    flow: { 'f0.ph': 1 },
    arcs: [
      { path: 'p1.x', from: -0.015, to: -0.2 },
      { path: 'p2.x', from: 0.015, to: 0.2 },
      { path: 'f1.r2', from: 30.2, to: 32 },
    ],
    axes: [
      { id: 'apart', name: 'apart', path: 'p2.x', min: 0, max: 1.5 },
      { id: 'count', name: 'count', path: 'f1.r2', min: 28, max: 36 },
      { id: 'y', name: 'height', path: 'p2.y', min: -1, max: 1 },
    ],
    lambda: 0.2 },
];
