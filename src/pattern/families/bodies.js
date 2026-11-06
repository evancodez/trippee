// True 3D with no lighting at all. Every surface reads only from how its pattern foreshortens.
import { plane } from '../kit.js';
import { Q } from '../genome.js';
import { smoother, lerp } from '../../score/curves.js';

const TAU = Math.PI * 2, PI = Math.PI;

// Whatever lies beyond a body takes the colour of the solid this gesture came out of. If the gesture lands on the other solid,
// the body must fill the frame first, so it swells over the way out.
function surround(out, { G, t, OFF }, cover) {
  const white = G.pol0 === -1;
  out[OFF['matte.outside']] = white ? 1 : 0;
  const land = white ? 1 : -1;
  const k = G.pol1 === land ? smoother((t - (G.t1 - (G.outDur || 1))) / (G.outDur || 1)) : 0;
  if (k > 0) cover(k);
}
const swellTo = (out, OFF, ww) => k => { out[OFF['q.ww']] = lerp(out[OFF['q.ww']], ww, k); };

// Dots from a product of waves. A constant third family, let in by a tiny `sum`, lifts the field's level without changing its
// shape: white dots below 0, plain checks at 0, black dots above. At level 0 the sweeps at each end are still only specks.
const B = 40, LIFT = { ph: .25, d: -B };
const levelToSum = level => level * Math.sqrt(3) / B;
const quietEnds = (u, a = .2) => smoother(u / a) * smoother((1 - u) / a);

export default [
  // The film's sphere, Pay No Mind's dots. A speck of a planet comes on until it is far bigger than the frame, and the dots
  // inflate on the way until they merge and flip to black on white.
  { id: 'body.planet', name: 'Planet', family: 'body',
    g: {
      round: 1, fams: [plane(1, 0), plane(1, 90), LIFT],
      surf: { kind: 1, map: 2, mapR: 36 }, q: Q.sphere(.3), cam: { pitch: .5, roll: .4, dist: 2.4 },
    },
    flow: { 'surf.spin': TAU / 36 * 2 },
    arcs: [
      { path: 'q.ww', from: -.05, to: -2.8, log: true, at: [0, .72] },
      { path: 'cam.pitch', from: .6, to: -.55 },
      { path: 'cam.roll', from: .5, to: -.2 },
    ],
    drive(out, c) {
      surround(out, c, swellTo(out, c.OFF, -2.8));
      out[c.OFF.sum] = levelToSum(lerp(-.62, .55, smoother(c.u)) * quietEnds(c.u));
    },
    axes: [
      { id: 'size', name: 'size', path: 'q.ww', min: -2.8, max: -.03 },
      { id: 'pitch', name: 'look at the pole', path: 'cam.pitch', min: -1.57, max: 1.57 },
      { id: 'roll', name: 'axis', path: 'cam.roll', min: -1.57, max: 1.57 },
      { id: 'dots', name: 'dots', path: 'sum', min: levelToSum(-.9), max: levelToSum(.9) },
    ],
    lambda: .03 },

  // Checks on a globe seen from over its pole, rolling down to the equator as it comes on.
  { id: 'body.globe', name: 'Pole On', family: 'body',
    g: {
      fams: [plane(1, 0), plane(1, 90)],
      surf: { kind: 1, map: 2, mapR: 24 }, q: Q.sphere(1.2), cam: { pitch: 1.57, dist: 2.4 },
    },
    flow: { 'surf.spin': TAU / 24 },
    arcs: [
      { path: 'cam.pitch', from: 1.5, to: .25 },
      { path: 'q.ww', from: -.2, to: -2.8, log: true },
    ],
    drive(out, c) { surround(out, c, swellTo(out, c.OFF, -2.8)); },
    axes: [
      { id: 'pitch', name: 'look at the pole', path: 'cam.pitch', min: -1.57, max: 1.57 },
      { id: 'size', name: 'size', path: 'q.ww', min: -2.8, max: -.05 },
    ],
    lambda: .05 },

  // A barber's pole leaning over until its far end runs away to a point at the edge of the frame.
  { id: 'body.tube', name: 'Tube', family: 'body',
    g: {
      fams: [{ x: 1, y: 3.5 }],
      surf: { kind: 1, map: 3, mapR: 8 }, q: Q.tube(.5), cam: { pitch: 0, roll: .5, dist: 3.2 },
    },
    flow: { 'f0.ph': -1 },
    arcs: [
      { path: 'q.ww', from: -.012, to: -.56, log: true },
      { path: 'cam.pitch', from: 0, to: 1.22 },
      { path: 'cam.roll', from: 1, to: .3 },
    ],
    drive(out, c) {
      // it can't swell into the camera, so it comes back upright as it fills the frame
      surround(out, c, k => { out[c.OFF['q.ww']] = lerp(out[c.OFF['q.ww']], -3.4, k); out[c.OFF['cam.pitch']] = lerp(out[c.OFF['cam.pitch']], .5, k); });
    },
    axes: [
      { id: 'size', name: 'girth', path: 'q.ww', min: -.9, max: -.005 },
      { id: 'pitch', name: 'tilt', path: 'cam.pitch', min: 0, max: 1.22 },
      { id: 'twist', name: 'twist', path: 'f0.y', min: 0, max: 8 },
      { id: 'roll', name: 'lean', path: 'cam.roll', min: -1.57, max: 1.57 },
    ],
    lambda: .1 },

  // Flying down a tunnel of checks, with the end of it swinging off to one side.
  { id: 'body.tunnel', name: 'Tunnel', family: 'body',
    g: {
      fams: [{ x: 1 }, { y: 1.5 }],
      surf: { kind: 1, map: 1, mapR: 10 }, q: Q.tunnel(1), cam: { pitch: 0, dist: 1.2 },
    },
    flow: { 'f1.ph': -1 },
    arcs: [
      { path: 'f1.y', from: .3, to: 1.5, log: true },
      { path: 'cam.pitch', from: 0, to: .72 },
    ],
    axes: [
      { id: 'rings', name: 'rings', path: 'f1.y', min: .1, max: 4, log: true },
      { id: 'pitch', name: 'look aside', path: 'cam.pitch', min: -1.2, max: 1.2 },
      { id: 'yaw', name: 'lean', path: 'cam.yaw', min: -3.14, max: 3.14 },
    ],
    lambda: .1 },

  // A burst of straight rays that winds up, rifling first, then a spiral you fall down.
  { id: 'body.helix', name: 'Helix', family: 'body',
    g: {
      fams: [{ x: 1, y: 1 }],
      surf: { kind: 1, map: 1, mapR: 7 }, q: Q.tunnel(1), cam: { pitch: 0, dist: 1.4 },
    },
    flow: { 'f0.ph': -1 },
    arcs: [
      { path: 'f0.y', from: .02, to: 1.5, log: true },
      { path: 'cam.pitch', from: .8, to: -.3 },
    ],
    axes: [
      { id: 'pitch', name: 'look aside', path: 'cam.pitch', min: -1.2, max: 1.2 },
      { id: 'twist', name: 'twist', path: 'f0.y', min: .01, max: 4, log: true },
    ],
    lambda: .1 },

  // A floor that buckles into a saddle and heels over until the far edge drops away and leaves a black gap.
  { id: 'body.saddle', name: 'Saddle Sea', family: 'body',
    g: {
      fams: [plane(1.6, 0), plane(1.6, 90)],
      surf: { kind: 1 }, q: Q.saddle(2), cam: { pitch: .9, dist: 2.4 },
    },
    flow: { 'f1.ph': 1 },
    arcs: [
      { path: 'q.zw', from: -5, to: -.75, log: true },
      { path: 'cam.pitch', from: .5, to: 1 },
      { path: 'scale', from: .65, to: 1.3, log: true },
    ],
    drive(out, c) {
      surround(out, c, k => { out[c.OFF['q.zw']] = lerp(out[c.OFF['q.zw']], -9, k); out[c.OFF['cam.pitch']] = lerp(out[c.OFF['cam.pitch']], .2, k); });
    },
    axes: [
      { id: 'c', name: 'flatness', path: 'q.zw', min: -8, max: -.5 },
      { id: 'pitch', name: 'tilt', path: 'cam.pitch', min: 0, max: 1.3 },
      { id: 'scale', name: 'zoom', path: 'scale', min: .15, max: 3, log: true },
    ],
    lambda: .1 },

  // Inside a bowl with rings and rays on it, looking further and further up its far wall.
  { id: 'body.bowl', name: 'Bowl', family: 'body',
    g: {
      fams: [{ r1: 1.2 }, { t1: 12 }],
      surf: { kind: 1 }, q: Q.bowl(2.5), cam: { pitch: .35, dist: 1.6 },
    },
    flow: { 'f0.ph': -1 },
    arcs: [
      { path: 'cam.pitch', from: .35, to: 1.25 },
      { path: 'q.zw', from: -6, to: -2.5, log: true },
    ],
    axes: [
      { id: 'pitch', name: 'tilt', path: 'cam.pitch', min: 0, max: 1.25 },
      { id: 'c', name: 'steep', path: 'q.zw', min: -8, max: -2.4 },
      { id: 'rings', name: 'rings', path: 'f0.r1', min: .3, max: 5, log: true },
    ],
    lambda: .1 },

  // Twin domes tip to tip, closing the gap until they touch at a point and join into an hourglass: one number, one topology change.
  { id: 'body.kiss', name: 'Kiss', family: 'body',
    g: {
      fams: [{ x: 1 }, { y: 2.2 }],
      surf: { kind: 1, map: 3, mapR: 12 }, q: { xx: 1, zz: 1, yy: -1, ww: .4, zw: 0 }, cam: { pitch: .1, roll: PI / 2, dist: 2.6 },
    },
    flow: { 'f1.ph': -1 },
    arcs: [
      { path: 'q.ww', from: 1.1, to: -.42 },
      { path: 'cam.pitch', from: .1, to: .35 },
    ],
    drive(out, c) { surround(out, c, swellTo(out, c.OFF, -2.6)); },
    axes: [
      { id: 'gap', name: 'apart to joined', path: 'q.ww', min: -2.5, max: 2 },
      { id: 'pitch', name: 'tilt', path: 'cam.pitch', min: -1, max: 1 },
      { id: 'rings', name: 'hoops', path: 'f1.y', min: .5, max: 8, log: true },
    ],
    lambda: .1 },

  // A zebra ball that lets out its waist: ball, then tube, then hourglass, on a single number.
  { id: 'body.vase', name: 'Vase', family: 'body',
    g: {
      fams: [{ y: 5 }],
      surf: { kind: 1, map: 3, mapR: 8 }, q: { xx: 1, zz: 1, yy: 1, ww: -.5, zw: 0 }, cam: { pitch: .3, dist: 2.6 },
    },
    flow: { 'f0.ph': -1 },
    arcs: [
      { path: 'q.yy', from: 1, to: -1 },
      { path: 'q.ww', from: -.08, to: -.5, log: true },
      { path: 'cam.pitch', from: .45, to: -.15 },
    ],
    drive(out, c) { surround(out, c, swellTo(out, c.OFF, -3)); },
    axes: [
      { id: 'yy', name: 'ball to tube to waist', path: 'q.yy', min: -1, max: 1 },
      { id: 'r', name: 'girth', path: 'q.ww', min: -3, max: -.05 },
      { id: 'hoops', name: 'hoops', path: 'f0.y', min: 1, max: 16, log: true },
    ],
    lambda: .05 },
];
