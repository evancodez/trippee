// The chill set, to be picked by hand: each of these is one long move that never ends. See src/score/moves/moire.js, vertigo.js, confocal.js, mirror.js. Out of the pool: a film only wears them when a cut asks.
// Their schedule runs on the clock (phi) and on the long move (u), so they keep time with a song, and the library's little picture moves too. When a cut puts the move on, the schedule gets out of its way.
import { Q } from '../genome.js';
import { plane } from '../kit.js';
import { writeBands, worn } from '../../score/moves/moire.js';
import { writeVertigo } from '../../score/moves/vertigo.js';
import { writeConfocal } from '../../score/moves/confocal.js';
import { writeMirror } from '../../score/moves/mirror.js';

const TAU = Math.PI * 2;
const wave = x => 0.5 - 0.5 * Math.cos(TAU * x);
const logmix = (a, b, k) => a * Math.pow(b / a, k);
const ZOOM = { id: 'zoom', name: 'zoom', path: 'scale', min: 0.5, max: 2.5, log: true };
const TURN = { id: 'turn', name: 'turn', path: 'rot', min: -1.6, max: 1.6 };
const item = (id, name, more) => ({ id: `still.${id}`, name, family: 'still', pool: false, arcs: [], axes: [ZOOM, TURN], lambda: 0.2, ...more });

export default [
  // Moire: chevrons in rows, a full turn of the wheel in about a minute and a half
  item('chevrons', 'Moire Chevrons', { fine: true,
    g: { fams: [{ x: 11 }, { x: 11 }] }, flow: { 'f1.ph': 1 },
    drive(out, c) {
      if (worn(c.G, 'moire')) return;
      const x = c.phi / 12 + c.u * 0.25;
      writeBands(out, { k: 10, turn: 0.25 + 0.5 * wave(x), beat: 1.1 + 0.3 * wave(x * 0.37), zig: 0.85, zigN: 0.55 });
    } }),
  // Moire: a soft pinwheel going round through lines that don't seem to move
  item('wheel', 'Moire Wheel', { fine: true,
    g: { fams: [{ x: 11 }, { x: 11 }] }, flow: { 'f1.ph': 1 },
    drive(out, c) {
      if (worn(c.G, 'moire')) return;
      const x = c.phi / 20 + c.u * 0.25;
      writeBands(out, { k: 10, beat: 0, arms: 4, coil: 1.1 * wave(x), px: 0.35 * Math.sin(TAU * x * 0.7), py: 0.2 * Math.sin(TAU * x) });
    } }),

  // Vertigo: a floor goes from steep perspective to plan and back, tipping a new way each time. The middle keeps its size.
  item('floor', 'Vertigo Floor', {
    g: { fams: [{ x: 2.4 }, { y: 2.4 }], surf: { kind: 1, map: 0 }, q: Q.plane, cam: { pitch: 0, dist: 2.4 } }, flow: {},
    drive(out, c) {
      if (worn(c.G, 'vertigo')) return;
      // Most of its time steep, tipping slowly round; through plan quickly, and it comes out of it tipping another way.
      const x = c.phi / 7 + c.u * 0.5, k = Math.pow(wave(x), 3);
      writeVertigo(out, { dist: logmix(0.75, 5, k), tip: 0.98 * Math.sqrt(1 - k + 1e-3), dir: x * 0.382, turn: 0.03 * Math.sin(TAU * x * 0.3) });
    } }),
  // Vertigo: the sheet curves away from the middle into a ball, its rim coming in from outside the frame, and out again through flat into a bowl
  item('ball', 'Vertigo Ball', {
    g: { fams: [{ x: 2.6, z: 1 }, { y: 2.6, z: 1 }], surf: { kind: 1, map: 0 }, q: Q.plane, cam: { pitch: 0, dist: 2.4 }, bg: { on: 1, rot: 0, scale: 1 } }, flow: {},
    drive(out, c) {
      if (worn(c.G, 'vertigo')) return;
      // The edge comes in from far outside the frame to the height of the frame at a steady rate, stays round there, and goes back out, past flat and into a bowl, which is the same move the other way up.
      const x = c.phi / 10 + c.u * 0.5, k = Math.sin(TAU * x), curve = 0.62 * (Math.exp(3 * k) - 1) / (Math.E ** 3 - 1) - 0.25 * k * k * (1 - k) / 2;
      writeVertigo(out, { dist: 1.6, curve, tip: 0.3 * k * k, dir: x * 0.618 });
    } }),

  // Confocal: hyperbolas, rings, ellipses, rings, hyperbolas
  item('confocal', 'Confocal', {
    g: { fams: [{ r1: 4.2, r2: -4.2 }], 'p1.x': -0.9, 'p2.x': 0.9 }, flow: { 'f0.ph': 0.25 },
    drive(out, c) {
      if (worn(c.G, 'confocal')) return;
      writeConfocal(out, { k: 4.2, way: -1 + c.phi / 4 + c.u, apart: 0.6 + 0.35 * wave(c.phi / 13) });
    } }),
  // Mirror Walk: one set of stripes turning under four mirrors. Nested squares streaming outward, that fold into four-pointed stars, then an X, then an asterisk, and back to squares.
  item('mirror', 'Mirror Walk', {
    g: { fams: [plane(3, 0)], fold: { n: 4 } }, flow: { 'f0.ph': -0.5 },
    drive(out, c) {
      if (worn(c.G, 'mirror')) return;
      writeMirror(out, { turn: 0.02 + (c.phi + c.u * 6) / 48, spin: 0.01 * Math.sin(TAU * c.phi / 31) });
    } }),
  // The same, under three mirrors: triangles and three-pointed stars
  item('mirror3', 'Mirror Walk, three', {
    g: { fams: [plane(3, 0)], fold: { n: 3 } }, flow: { 'f0.ph': -0.5 },
    drive(out, c) {
      if (worn(c.G, 'mirror')) return;
      writeMirror(out, { turn: (c.phi + c.u * 6) / 48, spin: 0.01 * Math.sin(TAU * c.phi / 31) });
    } }),
  // ...six mirrors: hexagons and six-pointed stars
  item('mirror6', 'Mirror Walk, six', {
    g: { fams: [plane(4, 0)], fold: { n: 6 } }, flow: { 'f0.ph': -0.5 },
    drive(out, c) {
      if (worn(c.G, 'mirror')) return;
      writeMirror(out, { turn: (c.phi + c.u * 6) / 64, spin: 0.01 * Math.sin(TAU * c.phi / 31) });
    } }),
];
