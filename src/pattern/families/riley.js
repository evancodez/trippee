// After Bridget Riley, and past her. Each of these does what a plain field can't: the eye is told the picture is moving in a way it isn't. See docs/NEXT.md, Stage 4.
// Each stays out of films with its flag off (src/score/flags.js), so a film without it is the film it would have been. Picked by hand they're always there.
//
// What they're made of, past plain families:
//   field   Blaze's zigzag going into a family's phase. field.a zigzags round the pole (whole, or there's a seam), field.b winds them, field.ph turns them, field.k0..3 how much each family takes.
//   meta    Metamorphosis: two shears after the view. meta.amt at most .85, meta.k cells to a unit, star._1 waves of the amount per unit (0: the same everywhere), star._2 how far along they are.
//   matte   kind 3, a slice through a gyroid: matte.t how deep, matte.rx how big, matte.eps which side has more room. What's outside it is bg: turned by bg.rot, shifted by bg.x.
//   snap    a level through `sum` that crosses 0 on every whole phi: src/score/moves/snap.js
import { plane, triLattice } from '../kit.js';
import { flag } from '../../score/flags.js';
import { writeSnap } from '../../score/moves/snap.js';

const R2 = Math.SQRT1_2;
const LIFT = { ph: 0.25, d: -40 };             // the dots' constant family: see src/pattern/families/dots.js
const ZOOM = { id: 'zoom', name: 'zoom', path: 'scale', min: 0.4, max: 3, log: true };
const TURN = { id: 'turn', name: 'turn', path: 'rot', min: -1.6, max: 1.6 };
const WIND = { id: 'wind', name: 'wind', path: 'field.b', min: -3, max: 3 };
const ZIG = { id: 'zig', name: 'zigzag', path: 'field.k0', min: 0, max: 0.8 };
const HOOKS = { id: 'hooks', name: 'hooks', path: 'meta.amt', min: 0, max: 0.85 };
const WALLS = { id: 'walls', name: 'walls', path: 'matte.rx', min: 0.25, max: 2, log: true };
const ROOM = { id: 'room', name: 'which side', path: 'matte.eps', min: -0.8, max: 0.8 };
const DEEP = { id: 'deep', name: 'how deep', path: 'matte.t', min: 0, max: 6.3 };
// Patterns with four real families can't slide with one that has a constant family (the dots) or any other: there's nowhere to put the fourth, and it pops at the end. A field number left at
// this and no field at all says so to the planner, and they slide only among themselves.
const FOUR = { a: 8 }, ALONE = { a: 9 };      // ALONE, and the two Snaps with numbers of their own: their ink or their constant is somewhere else, and they always fly
const OCTA = { 'f0.ph': 1, 'f1.ph': -R2, 'f2.ph': 0, 'f3.ph': R2 };   // cos(135 j): a phason. Each set of lines creeps, and the places they agree swim much faster.

export default [
  // Rings of zigzags. The eye makes the corners into blades turning round the middle, and they turn even when nothing does.
  { id: 'riley.blaze', name: 'Blaze', family: 'riley', get pool() { return flag('blaze'); },
    g: { fams: [{ l1: 5 }], field: { kind: 3, a: 12, b: 0, k0: 0.32 }, 'p1.x': 0.12, 'p1.y': -0.08 },
    flow: { 'f0.ph': -1, 'field.ph': 1 },
    arcs: [
      { path: 'field.b', from: 0, to: 2.2 },
      { path: 'field.k0', from: 0.24, to: 0.36 },
      { path: 'scale', from: 0.8, to: 1.5, log: true },
    ],
    axes: [WIND, ZIG, ZOOM],
    lambda: 0.1 },

  // The same in square rings: a stepped pit, whose walls begin to spin.
  { id: 'riley.pit', name: 'Square Blaze', family: 'riley', get pool() { return flag('blaze'); },
    g: { fams: [{ l1: 4.2 }], field: { kind: 3, a: 16, b: 0, k0: 0.36 }, 'p1.q': 1 },
    flow: { 'f0.ph': -1, 'field.ph': 1 },
    arcs: [
      { path: 'field.b', from: 0, to: 2 },
      { path: 'rot', from: -0.15, to: 0.3 },
      { path: 'scale', from: 0.8, to: 1.5, log: true },
    ],
    axes: [WIND, ZIG, ZOOM, TURN],
    lambda: 0.1 },

  // Zigzag rings cut by spokes: every cell a chevron, and they lock and unlock as they wind
  { id: 'riley.zinnia', name: 'Zinnia', family: 'riley', get pool() { return flag('blaze'); },
    g: { fams: [{ l1: 3.2 }, { t1: 12, ph: 0.25 }], field: { kind: 3, a: 12, b: 0, k0: 0.3 } },
    flow: { 'f0.ph': -1, 'field.ph': 1 },
    arcs: [
      { path: 'field.b', from: 0, to: 2.2 },
      { path: 'scale', from: 0.8, to: 1.5, log: true },
    ],
    axes: [WIND, ZIG, ZOOM],
    lambda: 0.1 },

  // Straight lines, zigzagged by where they are round a point below the frame: a fan of pleats, swinging
  { id: 'riley.pleats', name: 'Pleats', family: 'riley', get pool() { return flag('blaze'); },
    g: { fams: [plane(2.6, 90)], field: { kind: 3, a: 18, b: 0, k0: 0.5 }, 'p1.y': -1.5 },
    flow: { 'f0.ph': -1, 'field.ph': 0.5 },
    arcs: [
      { path: 'field.b', from: -1.5, to: 1.5 },
      { path: 'p1.x', from: -0.5, to: 0.5 },
      { path: 'rot', from: -0.15, to: 0.15 },
      { path: 'scale', from: 0.8, to: 1.3, log: true },
    ],
    axes: [WIND, { ...ZIG, max: 1 }, TURN, ZOOM],
    lambda: 0.1 },

  // Lines at four angles, each one family, all XOR-ed: a pattern that never repeats, with rosettes in it. Each set of lines creeps, and the rosettes swim far faster than any line moves.
  { id: 'riley.octagrid', name: 'Octagrid', family: 'riley', get pool() { return flag('octagrid'); },
    g: { fams: [plane(1.7, 0), plane(1.7, 45), plane(1.7, 90), plane(1.7, 135)], field: FOUR },
    flow: OCTA,
    arcs: [
      { path: 'scale', from: 0.7, to: 1.5, log: true },
      { path: 'rot', from: -0.2, to: 0.2 },
    ],
    axes: [ZOOM, TURN],
    lambda: 0.08 },

  // The same lines added, not XOR-ed, with one threshold across the sum: rings of octagons and stars, which part and join
  { id: 'riley.mosaic', name: 'Mosaic', family: 'riley', get pool() { return flag('octagrid'); },
    g: { sum: 1, fams: [plane(2.4, 0), plane(2.4, 45), plane(2.4, 90), plane(2.4, 135)], field: ALONE },
    flow: OCTA,
    arcs: [
      { path: 'scale', from: 0.8, to: 1.5, log: true },
      { path: 'rot', from: 0.2, to: -0.2 },
    ],
    axes: [ZOOM, TURN],
    lambda: 0.08 },

  // Octagrid wrapped round a point, whole in its turns: rosettes for ever, each smaller than the one outside it
  { id: 'riley.rose', name: 'Rose Window', family: 'riley', get pool() { return flag('octagrid'); },
    g: { fams: [{ l1: 1.8 }, { l1: 1.3, t1: 8 }, { t1: 12 }, { l1: -1.3, t1: 8 }], 'p1.x': 0.1, 'p1.y': -0.05, field: FOUR },
    flow: OCTA,
    arcs: [
      { path: 'scale', from: 0.8, to: 1.5, log: true },
      { path: 'rot', from: -0.4, to: 0.4 },
    ],
    axes: [ZOOM, TURN],
    lambda: 0.08 },

  // Escher's scroll, and you're moving along it. Plain checks at one side of the frame have grown hooks by the other, each hook fitting the next one's notch, and as the sheet travels every
  // square becomes a creature and goes back. Every shape keeps its area, and the sheet is half black all the way.
  { id: 'riley.metamorphosis', name: 'Metamorphosis', family: 'riley', get pool() { return flag('metamorphosis'); },
    g: { fams: [plane(1.4, 0), plane(1.4, 90)], meta: { amt: 0.85, k: 2.8 }, star: { _1: 0.17 } },
    flow: { 'f0.ph': 1e-3, 'f1.ph': 1e-3 },      // so a tune slides both families, along the diagonal, and not one alone
    // It travels, for ever. Not wrapped round by a whole sheet: the song makes the lines finer or broader, and at any freq but 1 a whole sheet isn't a whole number of lines, so that was a pop right across the frame.
    drive(out, { phi, OFF }) { out[OFF.tx] = 1.1 * phi; out[OFF.ty] = 0.7 * phi; },
    arcs: [
      { path: 'star._2', from: 0, to: 1 },
      { path: 'f0.ph', from: 0, to: 0.5 },
      { path: 'f1.ph', from: 0, to: 0.5 },
      { path: 'scale', from: 0.8, to: 1.3, log: true },
    ],
    axes: [HOOKS, ZOOM],
    lambda: 0.24 },

  // Triangles growing the hooks: they don't fit any more, and it's a shoal
  { id: 'riley.swarm', name: 'Swarm', family: 'riley', solid: 2 / 3, get pool() { return flag('metamorphosis'); },
    g: { fams: triLattice(1.7, 90), meta: { amt: 0.6, k: 1.7 } },
    flow: { 'f0.ph': 1, 'f1.ph': -1 },
    arcs: [
      { path: 'meta.amt', from: 0.1, to: 0.7 },
      { path: 'scale', from: 0.9, to: 1.5, log: true },
    ],
    axes: [HOOKS, ZOOM],
    lambda: 0.08 },

  // Octagrid with hooks: glass that's been melted and hasn't cracked
  { id: 'riley.alhambra', name: 'Alhambra', family: 'riley', get pool() { return flag('metamorphosis'); },
    g: { fams: [plane(1.5, 0), plane(1.5, 45), plane(1.5, 90), plane(1.5, 135)], meta: { amt: 0.5, k: 1.5 }, field: FOUR },
    flow: OCTA,
    arcs: [
      { path: 'meta.amt', from: 0.1, to: 0.6 },
      { path: 'scale', from: 0.9, to: 1.5, log: true },
    ],
    axes: [HOOKS, ZOOM],
    lambda: 0.08 },

  // One slice through a gyroid, as the border between lines going one way and lines going the other. The slice moves, and walls wander, meet and part. There's no wall: only lines turning,
  // and marching in one side and out the other, round the corner.
  { id: 'riley.labyrinth', name: 'Labyrinth', family: 'riley', get pool() { return flag('labyrinth'); },
    g: { fams: [plane(6.5, 90)], matte: { kind: 3, rx: 0.5 }, bg: { on: 1, rot: Math.PI / 2 } },
    flow: { 'f0.ph': -1, 'matte.t': 0.25 },
    arcs: [
      { path: 'matte.rx', from: 0.42, to: 0.75, log: true },
      { path: 'matte.t', from: 0, to: 3 },
      { path: 'matte.rot', from: -0.2, to: 0.2 },
      { path: 'scale', from: 0.9, to: 1.5, log: true },
    ],
    axes: [WALLS, DEEP, ROOM, ZOOM],
    lambda: 0.1 },

  // The walls again, but the lines don't turn: they only swap black for white at each. Straight stripes, and a shape in them nothing draws.
  { id: 'riley.shift', name: 'Shift', family: 'riley', get pool() { return flag('labyrinth'); },
    g: { fams: [plane(5, 0)], matte: { kind: 3, rx: 0.4 }, bg: { on: 1, rot: 0, x: 0.1 } },
    flow: { 'f0.ph': 1, 'matte.t': 0.25 },
    arcs: [
      { path: 'matte.rx', from: 0.3, to: 0.6, log: true },
      { path: 'matte.t', from: 0, to: 3 },
      { path: 'scale', from: 0.9, to: 1.6, log: true },
    ],
    axes: [WALLS, DEEP, ROOM, ZOOM],
    lambda: 0.1 },

  // A spiral across the same walls. It's the quarter-turn that swaps its colours, so its arms flip at each wall and carry on.
  { id: 'riley.whorl', name: 'Whorl', family: 'riley', get pool() { return flag('labyrinth'); },
    g: { fams: [{ l1: 3.5, t1: 6 }], matte: { kind: 3, rx: 0.4 }, bg: { on: 1, rot: Math.PI / 2 } },
    flow: { 'f0.ph': 1, 'matte.t': 0.25 },
    arcs: [
      { path: 'matte.rx', from: 0.3, to: 0.6, log: true },
      { path: 'matte.t', from: 0, to: 3 },
      { path: 'scale', from: 0.85, to: 1.4, log: true },
    ],
    axes: [WALLS, DEEP, ROOM, ZOOM],
    lambda: 0.1 },

  // Dots on a sheet with a lump travelling under it, doing nothing much, until on a breath every dot touches every other at once and they're the other colour's dots.
  { id: 'riley.snap', name: 'Snap', family: 'riley', get pool() { return flag('snap'); },
    g: { round: 1, fams: [plane(2.4, 45), plane(2.4, 135), LIFT], bulge: { a: 1.6, r: 0.9 }, field: { a: 11 } },
    flow: { 'f0.ph': 1 },
    arcs: [
      { path: 'bulge.cx', from: -1.3, to: 1.3 },
      { path: 'bulge.cy', from: 0.45, to: -0.45 },
      { path: 'rot', from: -0.2, to: 0.2 },
      { path: 'scale', from: 0.8, to: 1.3, log: true },
    ],
    drive(out, { phi }) { writeSnap(out, phi, { amp: 0.24, sharp: 2.5 }); },
    axes: [{ id: 'lump', name: 'lump', path: 'bulge.a', min: 0, max: 3 }, TURN],
    lambda: 0.1 },

  // The same with three waves: round triangles, all meeting at their points
  { id: 'riley.snap3', name: 'Tri Snap', family: 'riley', get pool() { return flag('snap'); },
    g: { round: 1, fams: [...triLattice(2.1, 90), LIFT], bulge: { a: 1.4, r: 0.9 }, field: { a: 10 } },
    flow: { 'f0.ph': 1, 'f1.ph': -1 },
    arcs: [
      { path: 'bulge.cx', from: 1.3, to: -1.3 },
      { path: 'bulge.cy', from: -0.45, to: 0.45 },
      { path: 'scale', from: 0.8, to: 1.3, log: true },
    ],
    drive(out, { phi }) { writeSnap(out, phi, { amp: 0.16, sharp: 2.5 }); },
    axes: [{ id: 'lump', name: 'lump', path: 'bulge.a', min: 0, max: 3 }],
    lambda: 0.1 },
];
