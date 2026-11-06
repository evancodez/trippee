// Moves you can click. None is in the pool: a film only wears these when a cut asks for them. See src/score/moves/relay.js.
// Each one here runs by itself on the clock, a step each cycle, so picking it in the library shows what it does.
import { SEQS, handRelay, compile, writeRelay, crossT } from '../../score/moves/relay.js';
import { rampLoop, rampLoopKnots } from '../../score/moves/ramp.js';
import { plane, logring, spokes } from '../kit.js';
import { Q } from '../genome.js';

const relay = (key, name) => {
  const s = SEQS[key], { slots } = compile(s);
  return {
    id: `relay.${key}`, name, family: 'relay', pool: false, relay: key,
    g: { ...s.g, fams: Array.from({ length: slots }, () => ({ x: 1, d: -1 })) },
    arcs: s.arcs ?? [],
    drive(out, { phi, G }) { if (!G.moves?.some(m => m.id === 'relay')) handRelay(out, s, phi); },
    axes: [
      { id: 'zoom', name: 'zoom', path: 'scale', min: 0.4, max: 3, log: true },
      { id: 'turn', name: 'turn', path: 'rot', min: -1.6, max: 1.6 },
    ],
    lambda: 0.1,
  };
};

// Ramps, going round by themselves: hang, draw back a hair, whip, cross at top speed, coast, hang. In real seconds, not on the clock, because the speed is the point.
const loop = (P, D, V, back) => ({ P, D, V, ...rampLoopKnots({ P, D, V, back }) });
const ramp = (id, name, g, drive, more = {}) => ({
  id: `ramp.${id}`, name, family: 'ramp', pool: false, g, arcs: [], drive,
  axes: [{ id: 'zoom', name: 'zoom', path: 'scale', min: 0.4, max: 3, log: true }, { id: 'turn', name: 'turn', path: 'rot', min: -1.6, max: 1.6 }],
  lambda: 0.1, ...more,
});
// There and back: a loop goes one way and the next goes the other
const swing = (t, k, from, to) => { const { n, y } = rampLoop(t, k), u = y / k.D; return from + (to - from) * (n % 2 ? 1 - u : u); };

// In a target that's even in log radius, a zoom of one whole ring is no change at all, so it can fall for ever. 2 rings per ln, 3 rings a loop, and it turns by two spokes on the way.
const TARGET = loop(7, 1.5, 1.2, 0.09), TARGET_TURN = 2 * (2 * Math.PI / 16) / 1.5;
// One set of cells turned about the centre: each loop a change of voice crosses on the whip. 3 rings per ln and two ln a loop is whole for all of them.
const WHIP = loop(8, 2, 0.8, 0.09);
const whipSeq = {
  // Spokes counts that share no odd harmonic: two that did would make rings of light and dark, and a zoom through those flashes the frame. Anything winding is half and half on every circle, so rings are never left holding it.
  voices: { l: { l1: 3, flow: -0.3 }, s: { t1: 12, flow: 0.2 }, p: { l1: 3, t1: 8, flow: -0.3 }, q: { l1: 3, t1: -6, flow: 0.3 }, w: { l1: 1.5, t1: 8, flow: -0.4 } },
  states: ['sl', 'sp', 'pq', 'qw', 'ws'],
};
const TILT = loop(6.5, 0.9, 1.1, 0.07), WRING = loop(10, 4.4, 1.5, 0.14);

const ramps = [
  ramp('target', 'Whip Target', { fams: [logring(2, { ph: 0.25 }), spokes(16)] }, (out, { t, phi, OFF }) => {
    const { y } = rampLoop(t, TARGET);
    out[OFF.scale] = Math.exp(y); out[OFF.rot] = TARGET_TURN * y; out[OFF['f1.ph']] = 0.5 * phi;
  }),
  ramp('relay', 'Whip Relay', { fams: Array.from({ length: compile(whipSeq).slots }, () => ({ x: 1, d: -1 })) }, (out, { t, phi, OFF }) => {
    const { n, y } = rampLoop(t, WHIP), e = t - n * WHIP.P;
    out[OFF.scale] = Math.exp(y);
    writeRelay(out, whipSeq, n, crossT((e - (WHIP.hit - 1.3)) / 2, 0.65), n, phi);
  }),
  ramp('tilt', 'Whip Tilt', { fams: [plane(1.4, 0), plane(1.4, 90)], surf: { kind: 1, map: 0 }, q: Q.plane, cam: { pitch: 0.05, dist: 2.4 } }, (out, { t, OFF }) => {
    out[OFF['cam.pitch']] = swing(t, TILT, 0.05, 0.95); out[OFF['cam.yaw']] = swing(t, TILT, -0.3, 0.3); out[OFF.scale] = swing(t, TILT, 0.9, 1.3);
  }),
  ramp('wring', 'Whip Wring', { fams: [plane(1.6, 15), plane(1.6, 105)], swirl: { sig: 1.2 } }, (out, { t, OFF }) => {
    out[OFF['swirl.a']] = swing(t, WRING, -2.2, 2.2);
  }),
];

export default [
  relay('tour', 'Relay Tour'),
  relay('weave', 'Relay Weave'),
  relay('whirl', 'Relay Whirl'),
  relay('dipole', 'Relay Dipole'),
  relay('star', 'Relay Star'),
  relay('saw', 'Relay Saw'),
  relay('rooms', 'Relay Rooms'),
  relay('floor', 'Relay Floor'),
  ...ramps,
];
