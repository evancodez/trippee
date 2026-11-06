// Woo. Rings born at poles and pushed outward, circle systems tangent at a point, and the whole thing tilting from straight
// above down to a grazing landscape of pools. Everything here is conformal or foreshortened, never noise.
import { logring, spokes } from '../kit.js';
import { Q } from '../genome.js';
import { smoother, clamp, lerp } from '../../score/curves.js';

const PI = Math.PI;
const smoothMax = (a, b) => Math.pow(a ** 4 + b ** 4, 1 / 4);

// How far into the way out towards a white solid. A sky can't go white, so the horizon lifts off the top of the frame instead.
const toWhite = (G, t) => G.pol1 === -1 ? smoother((t - (G.t1 - (G.outDur || 1))) / (G.outDur || 1)) : 0;
const fromWhite = (G, t) => G.pol0 === -1 ? 1 - smoother((t - G.t0) / (G.inDur || 1)) : 0;

// Keeps the horizon at height yh in the frame however far the camera has tilted: a long lens does the rest.
function horizon(out, { G, t, OFF }, yh, d0 = 2.4) {
  const clear = Math.max(toWhite(G, t), fromWhite(G, t));
  const y = lerp(yh, 1.15, clear);
  out[OFF['cam.dist']] = smoothMax(d0, y * Math.tan(clamp(out[OFF['cam.pitch']], 0, 1.53)));
}

export default [
  // One number, lambda, runs parallel stripes through confocal parabolas and rings to circles tangent at the poles.
  { id: 'pole.garden', name: 'Garden', family: 'pole',
    g: {
      fams: [{ y: 1.1 }], rot: PI / 2,
      conf: { amt: 1, lam: 1, gam: 0, k: 1.4, c1: 1, c2: 1, x1: -.42, y1: 0, x2: .42, y2: 0 },
    },
    flow: { 'f0.ph': -1 },
    arcs: [
      { path: 'conf.lam', from: 1, to: -1 },
      { path: 'conf.k', from: 2.4, to: .5, log: true },
      { path: 'conf.x1', from: -.9, to: -.26 },
      { path: 'conf.x2', from: .9, to: .26 },
    ],
    axes: [
      { id: 'lam', name: 'stripes to rings to circles', path: 'conf.lam', min: -1, max: 1 },
      { id: 'k', name: 'how many', path: 'conf.k', min: .1, max: 4, log: true },
      { id: 'gam', name: 'turn', path: 'conf.gam', min: 0, max: PI / 2 },
      { id: 'sep', name: 'poles apart', path: 'conf.x2', min: .02, max: 1.4 },
    ],
    lambda: .12 },

  // The film's own passage, 2188 to 2232 s. One oval, a tangent pair, a nested system that turns and splits, then the whole
  // ground tips over into a grazing landscape of pools with their poles near the horizon.
  { id: 'pole.woo', name: 'Pools', family: 'pole',
    g: {
      fams: [{ x: 1 }],
      conf: { amt: 1, lam: -1, gam: 0, k: .12, c1: 1, c2: 1, x1: 0, y1: .2, x2: 0, y2: -.2, x3: 0, y3: .2 },
      surf: { kind: 1 }, q: Q.plane, cam: { pitch: 0, dist: 2.4 },
    },
    flow: { 'f0.ph': -1 },
    arcs: [
      { path: 'conf.k', from: .12, to: 1.1, log: true, at: [0, .55] },
      { path: 'conf.gam', from: 0, to: 1.1, at: [.3, .75] },
      { path: 'conf.x3', from: 0, to: .85, at: [.4, .85] },
      { path: 'conf.y3', from: .2, to: 1.3, at: [.4, .85] },
      { path: 'cam.pitch', from: 0, to: 1.36, at: [.42, 1] },
      { path: 'ty', from: 0, to: -1.25, at: [.5, 1] },
    ],
    drive(out, c) { horizon(out, c, .92); },
    axes: [
      { id: 'pitch', name: 'tilt', path: 'cam.pitch', min: 0, max: 1.5 },
      { id: 'k', name: 'how many', path: 'conf.k', min: .03, max: 3, log: true },
      { id: 'gam', name: 'turn', path: 'conf.gam', min: 0, max: PI },
      { id: 'y1', name: 'poles apart', path: 'conf.y1', min: 0, max: 1 },
    ],
    lambda: .3 },

  // A spiral with whole arms that comes apart into two whirlpools, each winding the other way.
  { id: 'pole.whirl', name: 'Whirlpools', family: 'pole',
    g: { fams: [{ l1: 1.3, t1: 3, l2: 1.3, t2: -3 }], 'p1.x': -.02, 'p2.x': .02 },
    flow: { 'f0.ph': -1 },
    arcs: [
      { path: 'p1.x', from: -.03, to: -1.25 },
      { path: 'p2.x', from: .03, to: 1.25 },
      { path: 'f0.l1', from: 3.5, to: .9, log: true },
      { path: 'f0.l2', from: 3.5, to: .9, log: true },
      { path: 'rot', from: -.5, to: .5 },
    ],
    axes: [
      { id: 'tight', name: 'tightness', path: 'f0.l1', min: .2, max: 6, log: true },
      { id: 'apart', name: 'poles apart', path: 'p2.x', min: .01, max: 2 },
      { id: 'scale', name: 'zoom', path: 'scale', min: .2, max: 4, log: true },
    ],
    lambda: .15 },

  // Checks in log-polar: rings and rays. A conformal twist winds them into a whirl while the disc tips away.
  { id: 'pole.rosette', name: 'Rosette', family: 'pole',
    g: { fams: [logring(1.7), spokes(12)], surf: { kind: 1 }, q: Q.plane, cam: { pitch: 0, dist: 2.4 } },
    flow: { 'f0.ph': -1 },
    arcs: [
      { path: 'scale', from: .3, to: 2.8, log: true },
      { path: 'swirl.log', from: 0, to: 1.5, at: [.15, .85] },
      { path: 'cam.pitch', from: 0, to: 1.05, at: [.3, 1] },
    ],
    axes: [
      { id: 'twist', name: 'twist', path: 'swirl.log', min: -2.5, max: 2.5 },
      { id: 'pitch', name: 'tilt', path: 'cam.pitch', min: 0, max: 1.15 },
      { id: 'rings', name: 'rings', path: 'f0.l1', min: .5, max: 6, log: true },
    ],
    lambda: .1 },

  // Bipolar checks: circles round two eyes, arcs running from one to the other. The eyes start nearly touching.
  { id: 'pole.dipole', name: 'Dipole', family: 'pole',
    g: { fams: [{ l1: 1.6, l2: -1.6 }, { t1: 6, t2: -6 }], 'p1.x': -.1, 'p2.x': .1 },
    flow: { 'f0.ph': -1 },
    arcs: [
      { path: 'p1.x', from: -.1, to: -1.2, log: true },
      { path: 'p2.x', from: .1, to: 1.2, log: true },
      { path: 'rot', from: .9, to: -.2 },
    ],
    axes: [
      { id: 'apart', name: 'poles apart', path: 'p2.x', min: .02, max: 2.5, log: true },
      { id: 'rings', name: 'rings', path: 'f0.l1', min: .3, max: 5, log: true },
      { id: 'scale', name: 'zoom', path: 'scale', min: .25, max: 4, log: true },
    ],
    lambda: .15 },

  // Two ring systems XOR-ed, born together, on ground that tips to a low horizon: drops falling on a pond.
  { id: 'pole.rain', name: 'Rain', family: 'pole',
    g: {
      fams: [{ l1: 2.4 }, { l2: 2.4 }], 'p1.x': -.5, 'p1.y': .1, 'p2.x': .55, 'p2.y': -.15,
      surf: { kind: 1 }, q: Q.plane, cam: { pitch: 0, dist: 2.4 },
    },
    flow: { 'f0.ph': -1, 'f1.ph': -1 },
    arcs: [
      { path: 'cam.pitch', from: .1, to: 1.42 },
      { path: 'f0.l1', from: 1, to: 3.2, log: true },
      { path: 'f1.l2', from: 1, to: 3.2, log: true },
      { path: 'p2.x', from: .08, to: .9 },
    ],
    drive(out, c) { horizon(out, c, .8); },
    axes: [
      { id: 'pitch', name: 'tilt', path: 'cam.pitch', min: 0, max: 1.5 },
      { id: 'apart', name: 'poles apart', path: 'p2.x', min: 0, max: 1.6 },
      { id: 'rings', name: 'rings', path: 'f0.l1', min: .5, max: 6, log: true },
    ],
    lambda: .15 },
];
