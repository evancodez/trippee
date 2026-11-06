// Bodies for the Coin: bold, centred on the frame, and with every line going round, so a lean reads as a cone and a landing as a flat disc. The move is on the gesture, not here
// (src/score/moves/coin.js). Out of the pool: the director hands these to a build. Picked by hand they go round for ever, on the clock (freeCoin).
// lean: how steep a cone it stands before its far side goes to hairlines.
import { ring, plane, spokes } from '../kit.js';
import { freeCoin } from '../../score/moves/coin.js';

const POOL = false;
const AXES = [
  { id: 'zoom', name: 'zoom', path: 'scale', min: 0.3, max: 3, log: true },
  { id: 'leanx', name: 'lean across', path: 'lathe.k', min: -0.7, max: 0.7 },
  { id: 'leany', name: 'lean up', path: 'lathe.w', min: -0.7, max: 0.7 },
  { id: 'lines', name: 'lines', path: 'freq', min: 0.4, max: 3, log: true },
];
const SLOW = { path: 'scale', from: 0.72, to: 1.25, log: true };

export default [
  // Duchamp's disc: nothing but rings. It's what a lean shows best.
  { id: 'coins.disc', name: 'Disc', family: 'coins', pool: POOL, lean: 0.6,
    g: { fams: [ring(2.4)] },
    flow: { 'f0.ph': -1 },
    arcs: [SLOW],
    axes: AXES, drive: freeCoin, lambda: 0.12 },

  // Rings and spokes: a checker going round a cone
  { id: 'coins.dart', name: 'Dartboard', family: 'coins', pool: POOL, lean: 0.55,
    g: { fams: [ring(2), spokes(6, { d: -1 })] },
    flow: { 'f0.ph': -1 },
    arcs: [SLOW, { path: 'rot', from: 0, to: 0.6 }, { path: 'f1.d', from: -1, to: 0, at: [0.25, 0.6] }],
    axes: AXES, drive: freeCoin, lambda: 0.14 },

  // Two arms going round and out, for ever: as it turns it climbs
  { id: 'coins.spiral', name: 'Rotorelief', family: 'coins', pool: POOL, lean: 0.6,
    g: { fams: [{ r1: 2.2, t1: 2 }] },
    flow: { 'f0.ph': -1 },
    arcs: [SLOW],
    axes: AXES, drive: freeCoin, lambda: 0.12 },

  // Arms going both ways, woven into diamonds: a pine cone from above
  { id: 'coins.cone', name: 'Pine cone', family: 'coins', pool: POOL, lean: 0.5,
    g: { fams: [{ r1: 1.5, t1: 4 }, { r1: 1.5, t1: -4 }] },
    flow: { 'f0.ph': -1, 'f1.ph': -1 },
    arcs: [SLOW, { path: 'rot', from: 0, to: 0.4 }],
    axes: AXES, drive: freeCoin, lambda: 0.16 },

  // Round rings go square and the faces open, each the negative of the next: a cone turning into a stepped pyramid as it goes round
  { id: 'coins.ziggurat', name: 'Ziggurat', family: 'coins', pool: POOL, lean: 0.55,
    g: { fams: [ring(2.2), spokes(2, { d: -1 })], p1: { q: 0 } },
    flow: { 'f0.ph': -1 },
    arcs: [SLOW, { path: 'rot', from: -0.2, to: 0.2 }, { path: 'p1.q', from: 0, to: 1, at: [0.15, 0.7] }, { path: 'f1.d', from: -1, to: 0, at: [0.35, 0.7] }],
    axes: AXES, drive: freeCoin, lambda: 0.14 },

  // Lines folded into nested rings, and as they tilt the rings grow points
  { id: 'coins.star', name: 'Star', family: 'coins', pool: POOL, lean: 0.5,
    g: { fams: [plane(2.2, 0)], fold: { n: 10, rot: 0 } },
    flow: { 'f0.ph': -1 },
    arcs: [SLOW, { path: 'rot', from: 0, to: 0.4 }, { path: 'f0.x', from: 2.2, to: 2.2 * Math.cos(0.94), at: [0.15, 0.8] }, { path: 'f0.y', from: 0, to: 2.2 * Math.sin(0.94), at: [0.15, 0.8] }],
    axes: AXES, drive: freeCoin, lambda: 0.12 },

];
