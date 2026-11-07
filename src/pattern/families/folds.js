// The fold set, to be picked by hand: each of these is one thing going on for ever. A cut asks for them by name on any pattern at all, with moves: [{ id: 'fan' }] and the rest (src/score/moves/folds.js). Out of the pool: a film only wears them when it's asked.
// A sheet here's a plain one on purpose. All of what you see is what's been done to it.
import { plane, ring } from '../kit.js';
import { fanDrive } from '../../score/moves/fan.js';
import { foreverWith } from '../../score/moves/forever.js';
import { screenWith } from '../../score/moves/screen.js';
import { limitWith } from '../../score/moves/limit.js';
import { crumpleWith } from '../../score/moves/crumple.js';
import { pearlsWith } from '../../score/moves/pearls.js';

const ZOOM = { id: 'zoom', name: 'zoom', path: 'scale', min: 0.5, max: 2.5, log: true };
const TURN = { id: 'turn', name: 'turn', path: 'rot', min: -1.6, max: 1.6 };
const item = (id, name, more) => ({ id: `folds.${id}`, name, family: 'folds', pool: false, arcs: [], axes: [ZOOM, TURN], lambda: 0.2, flow: {}, ...more });
const check = (k, a = 0) => ({ fams: [plane(k, a), plane(k, a + 90)] });
const waves = k => ({ fams: [plane(k, 90)], bend1: { a: 0.1, f: 2.2 } });

export default [
  item('fan', 'Fan', { g: { fams: [{ l1: 2.6 }], 'p1.q': 1, 'p1.ay': 1.6 }, flow: { 'f0.ph': -1 }, drive: fanDrive }),
  item('fanrings', 'Fan, Rings', { g: { fams: [ring(2.2), plane(1.3, 20)] }, flow: { 'f0.ph': -1 }, drive: fanDrive }),
  item('forever', 'Forever', { g: waves(2.6), drive: foreverWith() }),
  item('foreverstar', 'Forever, Three', { g: { ...check(2.4, 45), sf: { par: 1 } }, drive: foreverWith({ n: 3, tw: 0.8 }) }),
  item('screen', 'Screen', { g: check(1.5), drive: screenWith() }),
  item('screenwave', 'Screen, Waves', { g: waves(1.7), drive: screenWith({ turn: 0.7 }) }),
  item('screenrings', 'Screen, Rings', { g: { fams: [ring(1.6)] }, flow: { 'f0.ph': -1 }, drive: screenWith({ Sz: 0.45, turn: 0.3 }) }),
  item('limit', 'Limit', { g: { fams: [plane(2.2, 30)] }, flow: { 'f0.ph': 1 }, drive: limitWith({ sides: 4, corner: 6 }) }),
  item('limitcheck', 'Limit, Check', { g: check(2.2), drive: limitWith({ sides: 6, corner: 4 }) }),
  item('crumple', 'Crumple', { g: { fams: [plane(3.6, 30)] }, drive: crumpleWith() }),
  item('crumplerings', 'Crumple, Rings', { g: { fams: [ring(3)] }, drive: crumpleWith({ shrink: 0.85, turn: 0.95 }) }),
  item('pearls', 'Pearls', { g: { fams: [plane(2.2, 30)] }, flow: { 'f0.ph': 1 }, drive: pearlsWith({ n: 5, r: 0.5, far: 1 }) }),
  item('pearlscheck', 'Pearls, Check', { g: check(1.4), drive: pearlsWith({ n: 3 }) }),
];
