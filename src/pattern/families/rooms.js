// Rooms: Dive and the end of Drunk in LA. Nested squares, chevrons, corridors. Walls are only ever lines changing direction.
import { plane, spiral } from '../kit.js';

const lam = k => (1 / k) / 3.56;
// surf.map 1 has no effect on a room's geometry. It turns on the shader's wrap-safe gradient, which stops wall junctions and
// the corridor's seam from filtering to a dotted grey line. Walls then meet with nothing drawn on the join.

export default [
  // Rooms inside rooms: even in log radius, so each ring is the last one scaled. Square, through round, to diamond.
  { id: 'rooms.nested', name: 'Nested', family: 'rooms',
    g: { fams: [{ l1: 4 }], 'p1.q': 1, 'p1.ay': 1.6 },
    flow: { 'f0.ph': -1 },
    arcs: [
      { path: 'f0.l1', from: 12, to: 1.3, log: true },
      { path: 'p1.q', from: 1, to: -1, at: [0.3, 0.8] },
      { path: 'p1.ay', from: 1.7, to: 1 },
      { path: 'p1.x', from: -0.25, to: 0.25 },
      { path: 'swirl.log', from: 0, to: 0.45 },
    ],
    axes: [
      { id: 'rooms', name: 'rooms', path: 'f0.l1', min: 0.6, max: 18, log: true },
      { id: 'shape', name: 'diamond / square', path: 'p1.q', min: -1, max: 1 },
      { id: 'twist', name: 'twist', path: 'swirl.log', min: -1.2, max: 1.2 },
      { id: 'wide', name: 'wide', path: 'p1.ay', min: 0.6, max: 2.4 },
    ],
    lambda: 0.2 },

  // One line, wound in: nested squares that turn out to be a stair.
  { id: 'rooms.stair', name: 'Stair', family: 'rooms',
    g: { fams: [spiral(3, 2)], 'p1.q': 1, 'p1.ay': 1.5, swirl: { log: 0.1 } },
    flow: { 'f0.ph': -1 },
    arcs: [
      { path: 'f0.l1', from: 9, to: 1.1, log: true },
      { path: 'swirl.log', from: 0, to: 0.8 },
      { path: 'p1.ay', from: 1.6, to: 1.05 },
      { path: 'rot', from: 0, to: 0.9 },
    ],
    axes: [
      { id: 'rooms', name: 'rooms', path: 'f0.l1', min: 0.6, max: 14, log: true },
      { id: 'twist', name: 'twist', path: 'swirl.log', min: -1.5, max: 1.5 },
      { id: 'shape', name: 'diamond / square', path: 'p1.q', min: -1, max: 1 },
    ],
    lambda: 0.2 },

  // Chevrons from hairline to larger than the frame, tightening towards one band. At the top of the move, edges go hand-cut.
  { id: 'rooms.chevron', pool: false, name: 'Chevron', family: 'rooms',
    g: { fams: [plane(4, 90)], zig: { a: 0.28, c: 1.1 }, squeeze: { a: 0.6, x0: 0, b: 0.2, ang: Math.PI / 2 }, wobF: 0.8 },
    flow: { 'f0.ph': 1 },
    arcs: [
      { path: 'scale', from: 0.28, to: 5.5, log: true },
      { path: 'squeeze.x0', from: 0.8, to: -0.2 },
      { path: 'squeeze.a', from: 0.1, to: 0.9 },
      { path: 'zig.a', from: 0.34, to: 0.2 },
      { path: 'wob', from: 0, to: 0.05, at: [0.5, 1] },
      { path: 'wobT', from: 0, to: 4 },
    ],
    axes: [
      { id: 'teeth', name: 'teeth', path: 'zig.c', min: 0.3, max: 4, log: true },
      { id: 'sharp', name: 'sharp', path: 'zig.a', min: 0, max: 0.7 },
      { id: 'lines', name: 'lines', path: 'freq', min: 0.3, max: 6, log: true },
      { id: 'crush', name: 'crush', path: 'squeeze.a', min: 0, max: 1.6 },
    ],
    lambda: lam(4) },

  // One plane of lines folded into four quarters. Turning the lines inside the fold runs squares, through stars, to arrows, all pointing in.
  { id: 'rooms.arrows', name: 'Arrows', family: 'rooms',
    g: { fams: [plane(4, 90)], fold: { n: 4, rot: 0 }, lens: { c: 0.6 } },
    flow: { 'f0.ph': 1 },
    arcs: [
      { path: 'f0.x', from: 6, to: 0.3 },
      { path: 'f0.y', from: 1.2, to: 2.1 },
      { path: 'lens.c', from: 1, to: 0.5 },
      { path: 'scale', from: 0.5, to: 1, log: true },
      { path: 'fold.rot', from: 0, to: 0.8 },
    ],
    axes: [
      { id: 'lines', name: 'lines', path: 'freq', min: 0.3, max: 6, log: true },
      { id: 'star', name: 'square / arrow', path: 'f0.x', min: 0, max: 8 },
      { id: 'pinch', name: 'pinch', path: 'lens.c', min: 0.3, max: 1.3 },
      { id: 'turn', name: 'turn', path: 'fold.rot', min: -1.6, max: 1.6 },
    ],
    lambda: lam(4) },

  // An endless spiral corridor: every room is the one before it, scaled and turned. The zoom never has to stop.
  { id: 'rooms.corridor', name: 'Spiral Corridor', family: 'rooms',
    g: { fams: [{ l1: 6 / 2.2 }, { t1: 6, d: -1 }], 'p1.q': 1, droste: { lnS: 2.2 }, surf: { map: 1 } },
    flow: { 'droste.off': -2.2 },
    arcs: [
      { path: 'f1.d', from: -1, to: 0, at: [0.35, 0.8] },
      { path: 'rot', from: 0, to: 1.2 },
    ],
    axes: [
      { id: 'walls', name: 'walls', path: 'f1.d', min: -1, max: 0 },
      { id: 'shape', name: 'diamond / square', path: 'p1.q', min: -1, max: 1 },
      { id: 'turn', name: 'turn', path: 'rot', min: -3.2, max: 3.2 },
    ],
    lambda: 0.25 },

  // A true room with no drawn edges: lines run along the walls and across the floor, so only their direction shows a corner.
  { id: 'rooms.room', name: 'Black Car Room', family: 'rooms',
    g: { fams: [plane(6, 0)], surf: { kind: 2, map: 1 }, cam: { dist: 2.4 }, room: { hw: 1.1, hh: 0.6, depth: 5, back: 1, floorRot: Math.PI / 2 } },
    flow: { 'f0.ph': 1 },
    arcs: [
      { path: 'room.depth', from: 1.3, to: 7, log: true },
      { path: 'freq', from: 0.5, to: 0.85, log: true },
      { path: 'cam.yaw', from: -0.32, to: 0.32 },
      { path: 'cam.pitch', from: 0.14, to: -0.12 },
    ],
    axes: [
      { id: 'deep', name: 'deep', path: 'room.depth', min: 1, max: 20, log: true },
      { id: 'lines', name: 'lines', path: 'freq', min: 0.3, max: 6, log: true },
      { id: 'look', name: 'look', path: 'cam.yaw', min: -0.8, max: 0.8 },
      { id: 'floor', name: 'floor', path: 'room.floorRot', min: 0, max: 1.57 },
    ],
    lambda: 0.08 },

  // A square tunnel you fly down: bands of depth, crushed at the vanishing point, and then long lines opening along it.
  { id: 'rooms.tunnel', name: 'Square Tunnel', family: 'rooms',
    g: { fams: [plane(1.2, 90), plane(2.5, 0, { d: -1 })], surf: { kind: 2, map: 1 }, cam: { dist: 2.4 }, room: { hw: 0.9, hh: 0.9, depth: 60, back: 1 } },
    flow: { 'f0.ph': 1 },
    arcs: [
      { path: 'f0.y', from: 3, to: 0.34, log: true },
      { path: 'f1.d', from: -1, to: 0, at: [0.4, 0.85] },
      { path: 'cam.yaw', from: -0.22, to: 0.22 },
      { path: 'cam.pitch', from: -0.14, to: 0.14 },
      { path: 'cam.roll', from: -0.3, to: 0.5 },
    ],
    axes: [
      { id: 'bands', name: 'bands', path: 'f0.y', min: 0.2, max: 6, log: true },
      { id: 'long', name: 'long lines', path: 'f1.d', min: -1, max: 0 },
      { id: 'look', name: 'look', path: 'cam.yaw', min: -0.6, max: 0.6 },
      { id: 'roll', name: 'roll', path: 'cam.roll', min: -1.6, max: 1.6 },
    ],
    lambda: 0.1 },

  // A check hall that has been drinking: the walls run true at first, then every course starts to sway with depth.
  { id: 'rooms.hall', name: 'Hall', family: 'rooms',
    g: { fams: [plane(2.2, 0), plane(1.1, 90, { d: -1 })], surf: { kind: 2, map: 1 }, cam: { dist: 2.4 }, room: { hw: 1.25, hh: 0.7, depth: 40, back: 1 },
      bend1: { a: 0.05, f: 0.7, ang: Math.PI / 2 } },
    flow: { 'f1.ph': 1 },
    arcs: [
      { path: 'f1.d', from: -0.7, to: 0, at: [0, 0.3] },
      { path: 'freq', from: 0.4, to: 1.25, log: true },
      { path: 'bend1.a', from: 0, to: 0.4, at: [0.3, 1] },
      { path: 'cam.yaw', from: 0.26, to: -0.26 },
      { path: 'cam.roll', from: -0.16, to: 0.16 },
    ],
    axes: [
      { id: 'sway', name: 'sway', path: 'bend1.a', min: 0, max: 0.5 },
      { id: 'checks', name: 'checks', path: 'freq', min: 0.3, max: 6, log: true },
      { id: 'look', name: 'look', path: 'cam.yaw', min: -0.7, max: 0.7 },
      { id: 'wide', name: 'wide', path: 'room.hw', min: 0.5, max: 3, log: true },
    ],
    lambda: 0.12 },

  // Dive: zigzag lines mirrored in both axes, so diamonds chain up the centre with chevrons nesting out from them. No seams to hide.
  { id: 'rooms.dive', name: 'Dive', family: 'rooms',
    g: { fams: [plane(4, 90)], fold: { n: 2, rot: 0 }, zig: { a: 0.3, c: 0.9 }, lens: { c: 0.8 } },
    flow: { 'f0.ph': -1 },
    arcs: [
      { path: 'scale', from: 0.3, to: 3.4, log: true },
      { path: 'zig.a', from: 0.06, to: 0.36 },
      { path: 'lens.c', from: 1, to: 0.62 },
      { path: 'fold.rot', from: 0, to: 0.5 },
    ],
    axes: [
      { id: 'teeth', name: 'teeth', path: 'zig.c', min: 0.3, max: 3, log: true },
      { id: 'sharp', name: 'sharp', path: 'zig.a', min: 0, max: 0.7 },
      { id: 'lines', name: 'lines', path: 'freq', min: 0.3, max: 6, log: true },
      { id: 'pinch', name: 'pinch', path: 'lens.c', min: 0.4, max: 1.3 },
    ],
    lambda: lam(4) },
];
