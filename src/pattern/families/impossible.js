// River and Arcade: the parity of a reflection group, so every tile is exactly the same tile, however crushed it looks. All of this is one family reading the field: tri(.25+.25S)=S, so its edge
// is S's zero set, and the threshold, XOR, plates and flights just work. See src/gl/chunks/field-impossible.js.
//   field.ph      along the flow. A whole cycle changes no pixel, so nothing ever resets.
//   field.spin    which way through the centre it flows. Turned by a whole 2 PI/P it's the same tiling with the flow on another branch.
//   field.scale   how much of the plane shows. Above .94 the top and bottom go to hairlines.
// Each stays out of films with its flag off (src/score/flags.js). Picked by hand they're always there.
import { flag } from '../../score/flags.js';
import { smoother } from '../../score/curves.js';

// tri(.25+.25S)=S. It's the last family on purpose. The tune slides family 0 along and takes a quarter of a cycle off a tile's whole colour, and fattens family 0 most and family 3 least. On lines that's
// music, but all these tiles being the same size is the whole picture.
const TILES = { ph: 0.25 }, NONE = { on: 0 };
// A film sends the tune through a pattern across its first family's lines. Round from the middle it folds a big shape over itself and bites holes in it. Up and down, it can't fold: it's a shear, and the
// tune goes out across the frame as a wave in the tiles' edges. So the first family, off, says level lines.
const LEVEL = { on: 0, y: 1 };
const ROOM = { id: 'room', name: 'how far it shows', path: 'field.scale', min: 0.7, max: 0.94 };
const WAY = { id: 'way', name: 'which way', path: 'field.spin', min: -1.6, max: 1.6 };
const SIZE = { id: 'room', name: 'size', path: 'field.scale', min: 0.4, max: 1.1, log: true };
// A film gives anything without a zoom of its own a big one. These can't take it: smaller than 1 and the frame runs out past where the plane's been drawn, much bigger and it's one huge tile.
const NEAR = { path: 'scale', from: 1, to: 1.18, log: true };

// The river takes another branch at a junction: every so many cycles of its clock it turns by one of the tiling's own rotations, over one of them, and the flow leaves the same tiling a new way.
// A drive puts its clock on the song's breath, so a cycle is a phrase. It's a turn that takes a phrase to happen: nothing about it is a jolt.
const branches = (P, every, sign = 1) => (out, { phi, OFF }) => {
  const x = phi / every, n = Math.floor(x), k = smoother(Math.min((x - n) * every, 1));
  out[OFF['field.spin']] += sign * (n + k) * 2 * Math.PI / P;
};

// The River is drawn only by a program built with FIELD_RIVER, which nothing asks for yet (see src/gl/chunks/field-impossible.js). Until something does these would be blank, so they aren't offered.
const RIVER_BUILT = false;
const RIVERS = [
  // Identical triangles pour across the frame, swell through the middle and crush at top and bottom. There's no source, no sink and no reset, and they are all the same size.
  { id: 'impossible.river', name: 'River', family: 'impossible', fine: true, get pool() { return flag('river'); },
    g: { fams: [LEVEL, NONE, NONE, TILES], field: { kind: 1, a: 6, b: 4, k3: 0.25, _1: 11, scale: 0.82 } },
    flow: { 'field.ph': 2 },
    arcs: [{ path: 'field.scale', from: 0.78, to: 0.86 }, NEAR],
    drive: branches(6, 2),
    axes: [ROOM, WAY],
    lambda: 0.1 },

  // Fewer and bigger: flowers of sixteen petals, sliding past each other
  { id: 'impossible.bloom', name: 'Bloom', family: 'impossible', fine: true, get pool() { return flag('river'); },
    g: { fams: [LEVEL, NONE, NONE, TILES], field: { kind: 1, a: 8, b: 4, k3: 0.25, _1: 11, scale: 0.84 } },
    flow: { 'field.ph': 1 },
    arcs: [{ path: 'field.scale', from: 0.78, to: 0.88 }, NEAR],
    drive: branches(8, 3, -1),
    axes: [ROOM, WAY],
    lambda: 0.1 },

  // The same river with the mirrors through each centre left out: triangles and diamonds, interlocked
  { id: 'impossible.loom', name: 'Loom', family: 'impossible', fine: true, get pool() { return flag('river'); },
    g: { fams: [LEVEL, NONE, NONE, TILES], field: { kind: 1, a: 106, b: 4, k3: 0.25, _1: 7, scale: 0.86 } },
    flow: { 'field.ph': 2 },
    arcs: [{ path: 'field.scale', from: 0.82, to: 0.9 }, NEAR],
    drive: branches(6, 3),
    axes: [ROOM, WAY],
    lambda: 0.1 },

  // No flow at all, only the turn: the middle wheels and everything further out goes round the frame the long way, crushed flat at the top and bottom and swelling down the sides
  { id: 'impossible.whirl', name: 'Whirl', family: 'impossible', fine: true, get pool() { return flag('river'); },
    g: { fams: [LEVEL, NONE, NONE, TILES], field: { kind: 1, a: 4, b: 6, k3: 0.25, _1: 11, scale: 0.76 } },
    flow: { 'field.spin': Math.PI / 2 },
    arcs: [{ path: 'field.scale', from: 0.72, to: 0.8 }, NEAR],
    axes: [ROOM],
    lambda: 0.1 },

  // Rings going out from the middle XOR-ed with the river going past: each tile a window onto the rings, in negative
  { id: 'impossible.window', name: 'Window', family: 'impossible', fine: true, get pool() { return flag('river'); },
    g: { fams: [LEVEL, { r1: 2.2 }, NONE, TILES], field: { kind: 1, a: 6, b: 4, k3: 0.25, _1: 11, scale: 0.84 } },
    flow: { 'field.ph': 1, 'f1.ph': -1 },
    arcs: [{ path: 'field.scale', from: 0.74, to: 0.82 }, NEAR],
    axes: [ROOM, WAY],
    lambda: 0.12 },

];

export default [
  ...(RIVER_BUILT ? RIVERS : []),

  // Arches pour from one point on the bottom edge into another, and on the way they are giant pillars, then fans. M = [[2,1],[1,1]], one turn of it per 4 bars.
  { id: 'impossible.arcade', name: 'Arcade', family: 'impossible', fine: true, get pool() { return flag('arcade'); },
    g: { fams: [LEVEL, NONE, NONE, TILES], field: { kind: 2, k3: 0.25, _1: 6, scale: 0.92, _2: 1.2 } },
    flow: { 'field.ph': 0.5 },
    arcs: [{ path: 'field.scale', from: 0.82, to: 1.02, log: true }, NEAR],
    axes: [SIZE],
    lambda: 0.1 },

  // The arches XOR-ed with level bands, so each pillar is cut into bricks that stay put while the arches go through them
  { id: 'impossible.viaduct', name: 'Viaduct', family: 'impossible', fine: true, pool: false,
    g: { fams: [{ y: 1.5 }, NONE, NONE, TILES], field: { kind: 2, k3: 0.25, _1: 6, scale: 0.8, _2: 1.25 } },
    flow: { 'field.ph': 0.5 },
    arcs: [{ path: 'field.scale', from: 0.7, to: 0.9, log: true }, NEAR],
    axes: [SIZE],
    lambda: 0.1 },
];
