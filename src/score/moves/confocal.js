// Confocal. One set of lines, measured from two points at once: the distance from one less the distance from the other is a field of hyperbolas, the distance from one alone is rings, the two added
// are ellipses, and every one of them shares the same two foci. It's one number going round a circle, with nothing cut and no line ever broken, so a stripe becomes a ring while you watch it.
//
//   G.moves = [{ id: 'confocal', k, way, apart, pin, drift }]     every one a number or a lane (see long.js)
//     k      lines. 3 to 5 per picture unit, and half as many again where the lines are closest. Bold.
//     way    where on the circle, in eighths of a turn: -1 hyperbolas, 0 rings round the left point, 1 ellipses, 2 rings round the right, 3 hyperbolas the other way, and so on for ever. Slowly: 20 s to a quarter turn at least.
//     apart  how far each point is from the middle. Over about 2.5 the hyperbolas are nearly straight stripes.
//     drift  the lines' own travel, in lines
import { OFF } from '../../pattern/layout.js';
import { val, laneT, worn } from './long.js';

const EIGHTH = Math.PI / 4;
// Pins the line nearest this far from a point, so a change of way moves what's out at the edge of the frame as little as it can, rather than everything by a lot.
const PIN = 1.25;

export function writeConfocal(out, { k = 4.2, way = -1, apart = 0.9, drift = 0 }) {
  const a = way * EIGHTH, c1 = Math.SQRT2 * k * Math.cos(a), c2 = Math.SQRT2 * k * Math.sin(a);
  out[OFF['p1.x']] = -apart; out[OFF['p1.y']] = 0; out[OFF['p2.x']] = apart; out[OFF['p2.y']] = 0;
  out[OFF['f0.r1']] = c1; out[OFF['f0.r2']] = c2;
  out[OFF['f0.ph']] += drift - (c1 + c2) * PIN;
}

export default {
  id: 'confocal',
  needs(slot) { return slot[OFF['f0.on']] > 0.5 && slot[OFF['surf.kind']] < 0.5; },
  write(out, c) {
    const t = laneT(c), m = c.m;
    writeConfocal(out, { k: val(m.k, t, 4.2), way: val(m.way, t, -1), apart: val(m.apart, t, 0.9), drift: val(m.drift, t, 0) });
  },
};
export { worn };
