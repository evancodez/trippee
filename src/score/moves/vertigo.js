// Vertigo. The dolly zoom: the camera goes back as the lens gets longer, so the middle of the picture keeps its size exactly and only what's round it changes. The renderer's focal length is cam.dist
// and the sheet goes through the origin, so a log arc on cam.dist is the whole of it and no `scale` is needed. A floor goes from steep perspective to plan. A ball isn't made and doesn't grow: the sheet
// itself curves away from the point it's touching, so its edge comes in from outside the frame and the middle stays exactly where and what it was.
//
//   G.moves = [{ id: 'vertigo', dist, tip, dir, turn, curve }]     every one a number or a lane (see long.js)
//     dist   the camera. .8 is a wide lens very close, 8 is nearly flat. Read as multiples: a log arc.
//     tip    how far the floor tips, 1 being as far as it can go and keep its horizon off the top of the frame
//     dir    which way it tips, in turns. Costs nothing to change while tip is 0, and it doesn't turn the floor.
//     turn   how far the floor has turned on the spot, in turns
//     rim    or say how big the ball is by where its edge is, picture units from the middle: .9 is about the height of the frame, over 2 it's off the frame altogether and all you see is the sheet starting to curve.
//            Read as multiples, so its edge comes in at a steady rate. Wins over curve.
//     curve  1 / the ball's radius. 0 flat. Under 0 the sheet is the inside of a bowl, which can't go past about -1/(2 dist).
//
// It needs a surface: still.floor and still.ball, or anything of `surf.kind` 1 on a plane or a sphere, with `surf.map` 0.
import { OFF } from '../../pattern/layout.js';
import { val, laneT, worn } from './long.js';

const TAU = Math.PI * 2;
const A = 16 / 9;
// A smooth stand-in for slot.js's noHorizon reach, a little over it, so a tip under 1 is never clamped: a clamp would be a corner in the move.
const reachOf = roll => { const c = Math.cos(roll), s = Math.sin(roll); return 1.5 * Math.sqrt(c * c + A * A * s * s + 2 * A * Math.sqrt(s * s * c * c + 0.01)); };

// The radius a ball tangent to the sheet needs for its edge to look to be `rim` from the middle, seen from dist
export const curveFor = (rim, dist) => dist / (rim * rim + rim * Math.sqrt(rim * rim + dist * dist));

export function writeVertigo(out, { dist = 2.4, tip = 0, dir = 0, turn = 0, curve = 0 }) {
  const roll = TAU * dir, k = curve / 2;
  out[OFF['cam.dist']] = dist;
  out[OFF['cam.pitch']] = tip * Math.atan(dist / reachOf(roll));
  out[OFF['cam.roll']] = roll;
  out[OFF['cam.yaw']] = TAU * turn - roll;
  out[OFF['q.xx']] = out[OFF['q.yy']] = out[OFF['q.zz']] = k;
  out[OFF['q.zw']] = 0.5;
}

export default {
  id: 'vertigo',
  needs(slot) { return slot[OFF['surf.kind']] === 1 && slot[OFF['surf.map']] === 0; },
  write(out, c) {
    const t = laneT(c), m = c.m, dist = val(m.dist, t, 2.4, true);
    writeVertigo(out, { dist, tip: val(m.tip, t, 0), dir: val(m.dir, t, 0), turn: val(m.turn, t, 0), curve: m.rim != null ? curveFor(val(m.rim, t, 1, true), dist) : val(m.curve, t, 0) });
  },
};
export { worn };
