// The fold set, to be picked by hand: each of these is one thing going on for ever. A cut asks for them by name on any pattern at all, with moves: [{ id: 'fan' }] and the rest (src/score/moves/folds.js). Out of the pool: a film only wears them when it's asked.
// A sheet here's a plain one on purpose. All of what you see is what's been done to it.
import { plane, ring } from '../kit.js';
import { fanDrive } from '../../score/moves/fan.js';
import { foreverWith } from '../../score/moves/forever.js';
import { screenWith } from '../../score/moves/screen.js';
import { limitWith } from '../../score/moves/limit.js';
import { crumpleWith } from '../../score/moves/crumple.js';

const ZOOM = { id: 'zoom', name: 'zoom', path: 'scale', min: 0.5, max: 2.5, log: true };
const TURN = { id: 'turn', name: 'turn', path: 'rot', min: -1.6, max: 1.6 };
const item = (id, name, more) => ({ id: `folds.${id}`, name, family: 'folds', pool: false, arcs: [], axes: [ZOOM, TURN], lambda: 0.2, flow: {}, ...more });
const check = (k, a = 0) => ({ fams: [plane(k, a), plane(k, a + 90)] });

export default [
  item('fan', 'Fan', { g: check(2.2, 8), flow: { 'f0.ph': 1 }, drive: fanDrive }),
  item('fanrings', 'Fan, Rings', { g: { fams: [ring(2.2), plane(1.3, 20)] }, flow: { 'f0.ph': -1 }, drive: fanDrive }),
  item('forever', 'Forever', { g: check(2.2), drive: foreverWith() }),
  item('forever3', 'Forever, Three', { g: { ...check(2.4, 45), 'sf': { par: 1 } }, drive: foreverWith({ n: 3, tw: 0.8, per: 2 }) }),
  item('screen', 'Screen', { g: check(2.2), flow: { 'f1.ph': 1 }, drive: screenWith() }),
  item('screendiag', 'Screen, Square On', { g: check(2.4, 45), drive: screenWith({ Sz: 0.62, turn: 0.5 }) }),
  item('limit', 'Limit', { g: { fams: [plane(2.2, 30)] }, flow: { 'f0.ph': 1 }, drive: limitWith({ sides: 4, corner: 6, per: 4 }) }),
  item('limitcheck', 'Limit, Check', { g: check(2.2), drive: limitWith({ sides: 6, corner: 4, par: 1 }) }),
  item('crumple', 'Crumple', { g: { fams: [plane(2.2, 30)] }, flow: { 'f0.ph': 1 }, drive: crumpleWith() }),
];
