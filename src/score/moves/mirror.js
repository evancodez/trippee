// Mirror Walk. A kaleidoscope, but nothing turns: the mirrors are fixed round the middle of the frame and the sheet walks along under them, very slowly and in no particular direction. Everything
// that's seen is the same few square units folded into a star, so shapes come out of the mirror lines, meet their reflections, close and go back in, and every move of the sheet makes a new figure out of
// the same cells. It never repeats, and because a fold is continuous no line is ever cut. Different from a pattern with a fold on it, which zooms or turns the finished star. Here the star isn't finished.
//
//   G.moves = [{ id: 'mirror', x, y, turn, spin }]      every one a number or a lane (see long.js)
//     x, y   where the sheet has walked to, picture units. About .05 a second is as fast as it wants to go.
//     turn   how far the sheet has turned under the mirrors, in turns. A sixth of a turn makes a different star.
//     spin   how far the mirrors have turned in the frame, in turns
//
// It needs a pattern of flat families with a `fold`: still.mirror.*. The number of mirrors can't change here; that's a jump.
import { OFF, FAMILIES } from '../../pattern/layout.js';
import { val, laneT, worn } from './long.js';

const TAU = Math.PI * 2;

export function writeMirror(out, { x = 0, y = 0, turn = 0, spin = 0 }) {
  const c = Math.cos(TAU * turn), s = Math.sin(TAU * turn);
  for (let i = 0; i < FAMILIES; i++) {
    if (out[OFF[`f${i}.on`]] < 0.5) continue;
    const ax = out[OFF[`f${i}.x`]], ay = out[OFF[`f${i}.y`]], bx = c * ax - s * ay, by = s * ax + c * ay;
    out[OFF[`f${i}.x`]] = bx; out[OFF[`f${i}.y`]] = by;
    out[OFF[`f${i}.ph`]] += bx * x + by * y;
  }
  out[OFF['fold.rot']] += TAU * spin;
}

export default {
  id: 'mirror',
  needs(slot) { return slot[OFF['fold.n']] >= 2 && slot[OFF['surf.kind']] < 0.5; },
  write(out, c) {
    const t = laneT(c), m = c.m;
    writeMirror(out, { x: val(m.x, t, 0), y: val(m.y, t, 0), turn: val(m.turn, t, 0), spin: val(m.spin, t, 0) });
  },
};
export { worn };
