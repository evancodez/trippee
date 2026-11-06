// Dials: a family that runs along the bands, and usually one that runs across them, cut exactly at that one's edges (ph .25 puts an edge at every band), so when a band slips its cut
// is a line the picture already had, and when it locks there is nothing there at all. See src/score/moves/slip.js. Kept out of the pool: the director puts them on for a Countdown.
import { ring, logring, spokes } from '../kit.js';
import { idle } from '../../score/moves/slip.js';

const dial = (id, name, g, slip, flow, more = {}) => ({
  id: `dials.${id}`, name, family: 'dials', pool: false, g, slip, flow,
  drive(out, ctx) { idle(out, ctx, slip); },
  arcs: [{ path: 'scale', from: 0.8, to: 1.5, log: true }, { path: 'rot', from: -0.3, to: 0.3 }],
  axes: [
    { id: 'zoom', name: 'zoom', path: 'scale', min: 0.4, max: 3, log: true },
    { id: 'turn', name: 'turn', path: 'rot', min: -1.6, max: 1.6 },
  ],
  lambda: 0.13,
  ...more,
});

export default [
  // A dartboard: the plain one, the one the Countdown wants.
  dial('board', 'Dartboard', { fams: [ring(2.2, { ph: 0.25 }), spokes(12)] },
    { kind: 2, n: 4.4, m: [0, 1, 0, 0], bands: 8, pour: { 'f0.ph': -2 }, kick: { 'f0.ph': 1, 'f1.ph': 1 } }, { 'f1.ph': 1 }),
  // Even in log radius: square cells all the way in, and the rings get smaller as they get closer to home, so the end runs faster and faster to the eye.
  dial('target', 'Log Target', { fams: [logring(1.5, { ph: 0.25 }), spokes(10)] },
    { kind: 3, n: 3, m: [0, 1, 0, 0], bands: 8, closest: 5, pour: { 'f0.ph': -2 }, kick: { 'f0.ph': 1, 'f1.ph': 1 } }, { 'f1.ph': 1 }),
  // Square rooms: rings with corners, nested one in the next.
  dial('rooms', 'Square Rooms', { fams: [ring(2.2, { ph: 0.25 }), spokes(8)], 'p1.q': 1 },
    { kind: 2, n: 4.4, m: [0, 1, 0, 0], bands: 8, pour: { 'f0.ph': -2 }, kick: { 'f0.ph': 1, 'f1.ph': 1 } }, { 'f1.ph': 1 }),
  // Diamonds: the same, turned.
  dial('diamonds', 'Diamonds', { fams: [ring(2.2, { ph: 0.25 }), spokes(8)], 'p1.q': -1 },
    { kind: 2, n: 4.4, m: [0, 1, 0, 0], bands: 8, pour: { 'f0.ph': -2 }, kick: { 'f0.ph': 1, 'f1.ph': 1 } }, { 'f1.ph': 1 }),
  // Sectors with rings: wedges, each with its rings running in or out. They lock round the clock, and the last one closes the circle.
  dial('sectors', 'Sectors', { fams: [spokes(4, { ph: 0.25 }), ring(2.4)] },
    { kind: 4, n: 8, m: [0, 1, 0, 0], bands: 8, scale: [0.8, 1.5, 1.8], pour: { 'f0.ph': 2 }, kick: { 'f0.ph': 1, 'f1.ph': -1 } }, { 'f1.ph': -1 }),
  // A sunburst: nothing but rays, so whole there are no rings at all. They're only there while it's slipping.
  dial('sunburst', 'Sunburst', { fams: [spokes(14)] },
    { kind: 3, n: 3, m: [1, 0, 0, 0], bands: 8, closest: 5, kick: { 'f0.ph': 2 } }, { 'f0.ph': 1 }),
];
