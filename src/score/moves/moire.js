// Moire Wheel. Two sets of fine lines XOR-ed: where they're in step the frame is white, where they're opposed it's black, and in between the lines thin and fatten, so the eye sees huge soft
// shapes that aren't drawn anywhere. They are the difference of the two sets' phases, so a tiny change to one set moves them a very long way: a 5 degree swing of one set wheels the shape a whole
// turn, and a third of a line's width slides it a whole band. The lines barely move while the shapes go by.
//
//   G.moves = [{ id: 'moire', k, turn, beat, drift, zig, zigN, arms, coil, px, py }]     every one a number or a lane (see long.js)
//     k      the lines: cycles per picture unit. 9 to 13. Under about 8 it stops reading as soft.
//     turn   which way the bands run, in turns. 0 upright; a quarter, lying down. A lane that climbs is the wheel.
//     beat   how many bands to a picture unit. Around 1. Small is big bands, and under .5 a band is more than the frame: a slow swell, not a shape.
//     drift  how far they've travelled, in bands. The pattern's own flow carries them too.
//     zig    how deep the chevrons are, picture units. 0 straight bands. .8 is deep. Needs some of the turn lying down: upright bands have no chevrons in them.
//     zigN   chevrons a picture unit across
//     arms   whole number: a pinwheel of that many soft arms round (px, py). Changing it is a jump, so it's a number, not a lane.
//     coil   winds the arms into a spiral: bands a picture unit, along the radius
//
// It needs a sheet of two flat families: the still.* moire patterns, or anything with `needs`.
import { OFF } from '../../pattern/layout.js';
import { val, laneT, worn } from './long.js';

const TAU = Math.PI * 2;
const F0 = { x: OFF['f0.x'], y: OFF['f0.y'] };
const F1 = { x: OFF['f1.x'], y: OFF['f1.y'], ph: OFF['f1.ph'], r1: OFF['f1.r1'], t1: OFF['f1.t1'] };

export function writeBands(out, { k = 11, turn = 0, beat = 1.2, drift = 0, zig = 0, zigN = 0.6, arms = 0, coil = 0, px = 0, py = 0 }) {
  const a = TAU * turn;
  out[F0.x] = k; out[F0.y] = 0;
  out[F1.x] = k + beat * Math.cos(a); out[F1.y] = beat * Math.sin(a);
  out[F1.ph] += drift;
  if (zig) { out[OFF['zig.a']] = zig; out[OFF['zig.c']] = zigN; out[OFF['zig.b']] = 0; out[OFF['zig.n']] = 0; }
  if (arms || coil) { out[F1.t1] = arms; out[F1.r1] = coil; out[OFF['p1.x']] = px; out[OFF['p1.y']] = py; }
}

export default {
  id: 'moire',
  needs(slot) { return slot[OFF['f0.on']] > 0.5 && slot[OFF['f1.on']] > 0.5 && slot[OFF['surf.kind']] < 0.5; },
  write(out, c) {
    const t = laneT(c), m = c.m;
    writeBands(out, { k: val(m.k, t, 11), turn: val(m.turn, t, 0.25), beat: val(m.beat, t, 1.2), drift: val(m.drift, t, 0), zig: val(m.zig, t, 0), zigN: val(m.zigN, t, 0.6), arms: m.arms ?? 0, coil: val(m.coil, t, 0), px: val(m.px, t, 0), py: val(m.py, t, 0) });
  },
};
export { worn };
