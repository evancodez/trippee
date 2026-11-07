// Limit. The sheet is laid on the hyperbolic plane, and the camera swims. Circle Limit, in any pattern: tile on tile of regular polygons whose corners are too sharp to fit in a flat world, each the mirror image of its neighbours, every one exactly the same size where it really is and smaller the further it is from you. They swim up from the rim, grow past
// you and shrink away to the other side, and it never stops, because a walk of two polygons across is one of the group's own translations: the frame comes back to exactly itself. The disc is a little bigger than the frame and the plane outside it is folded back in, so there's no rim to see, no black and no hairline: the edges of the frame are as fine as it gets.
// It starts flat: at a big enough disc the plane has no curve to speak of, and the polygon's walls are off the frame. Then the disc comes down, and the walls come in, curving.
//
//   G.moves = [{ id: 'limit', sides, corner, per, par, ... }]     and the options in cueFold (foldkit.js)
//     sides    of each polygon. An even number, or the walk doesn't come back. Default 6
//     corner   how many of them meet at a corner, by pairs: corners are pi / corner. Default 4
//     every    seconds to a polygon going by, on the strong beats' surge. Default 3.5, and a big moment throws it one further on
//     par      1: each is the negative of the next, so it's a checkerboard of the plane. Default 1
// The tune turns the frame about the swimming sheet. By hand: limitDrive.
import { OFF } from '../../pattern/layout.js';
import { clamp, smoother } from '../curves.js';
import { cueFold, inBy, songNow, journey, boldUp, writeChain, writeMobius, circleIn, circleOut, TAU } from './foldkit.js';

const R_END = 2.3, R_FAR = 11, REPS = 12;

// The regular polygon of `sides` with corners pi/corner, in the disc of radius R: a is its apothem, as a hyperbolic distance
const apothem = (sides, corner) => Math.acosh(Math.cos(Math.PI / corner / 2) / Math.sin(Math.PI / sides));
export function polygon(sides, corner, R, rot = 0) {
  const t = Math.tanh(apothem(sides, corner) / 2), d = (1 + t * t) / (2 * t), r = (1 - t * t) / (2 * t);
  return Array.from({ length: sides }, (_, i) => { const a = rot + i / sides * TAU; return circleIn(R * d * Math.cos(a), R * d * Math.sin(a), R * r); });
}

// The whole of it. walk: how many pairs of polygons along. A turn of the frame is a rotation of the disc, which a Mobius map does as well as a walk.
function write(out, { k, walk, sides, corner, S, turn0 = 0 }) {
  boldUp(out, k, 2.4);
  const R = R_END * Math.pow(R_FAR / R_END, 1 - smoother(clamp(k / 0.85))), L = 4 * apothem(sides, corner), s = (walk - Math.floor(walk)) * L, a = Math.tanh(s / 2);
  const turn = turn0 + (0.24 * S.mel + 0.012 * S.sec) * k, c = Math.cos(turn), n = Math.sin(turn);
  // The disc's own walk, after the frame's turn: z -> (e z + a R) / (a e z / R + 1)
  writeMobius(out, [c, n], [a * R, 0], [a * c / R, a * n / R], [1, 0]);
  writeChain(out, [circleOut(0, 0, R), ...polygon(sides, corner, R)], REPS);
}

export const limitWith = ({ sides = 6, corner = 4, every = 3.5, par = 1 } = {}) => (out, c) => {
  if (c.G.moves?.some(m => m.id === 'limit')) return;
  const S = songNow(c);
  out[OFF['sf.par']] = par;
  write(out, { k: 1, walk: S.sec / (2 * every) + 0.5 * S.big, sides, corner, S });
};
export const limitDrive = limitWith();

export default {
  id: 'limit',
  needs: () => true,
  cue(m, ctx) {
    if (!cueFold(m, ctx)) return null;
    m.sides ??= 4; m.corner ??= 6; m.every ??= 3.5; m.par ??= 1;
    const go = m.from + m.open * 0.85, stop = m.stay ? m.to + 600 : m.to - m.close * 0.95;
    if (stop - go < 2) return null;
    m._go = journey(m, { go, stop, speed: 0.5 / m.every, lurch: 0.5, ramp: 2 * ctx.bar });
    return m;
  },
  write(out, c) {
    const { m, t } = c, S = songNow(c), k = inBy(m, t);
    if (k <= 0) return;
    out[OFF['sf.par']] = m.par;
    write(out, { k, walk: m._go(t), sides: m.sides, corner: m.corner, S });
  },
};
