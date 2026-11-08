// Crumple. Plain stripes, folded. A chain of creases sweeps in, each one in the frame the last one left, and each turned and smaller than the last: the folding that makes a fractal, with no scaling in it. So a reflection changes no sizes and the lines stay exactly as bold as they started, however many folds there are, and what grows without end isn't finer lines but
// the way the pieces fit: bold hooked shapes, teeth, hand-cut things nobody drew. Past the size of a line a crease makes no difference, so it can't go to wallpaper. A small turn of the first crease swings everything after it. A plain check or a sheet of stripes grows that as the song builds, and goes back to being plain.
//
//   G.moves = [{ id: 'crumple', folds, c, shrink, turn, ... }]     and the options in cueFold (foldkit.js)
//     folds   how many creases by the end, up to 8. They come in one by one over the way in. Default 8
//     open, close   as in cueFold, and here the default's 6 and 4 bars: a crease going by is what's quick
//     c       how far the first is from the middle. Default about three of the sheet's lines, so a piece is never all one colour
//     shrink  each is this much nearer than the last. Default .74
//     turn    how far each is turned from the last, radians. Default 1.1
//     speed   how fast `turn` itself goes, radians a second on the strong beats' surge. Default .03. It swings back and forth, and a big moment throws it .25 further
// By hand: crumpleDrive.
import { clamp, smoother } from '../curves.js';
import { cueFold, inBy, songNow, boldUp, writeChain, lineM } from './foldkit.js';

const ON_MOVE = 4, ASPECT = 16 / 9;
// From nothing to all of it at an even pace, with gentle ends: the creases still come in evenly, and the last one out comes to rest where it's going instead of stopping dead, and so does the camera's push (Disclosure 133.8 s, 6.89x).
const steady = (u, e = 0.3) => { u = clamp(u); const v = 1 / (1 - e); return u < e ? v * u * u / (2 * e) : u > 1 - e ? 1 - v * (1 - u) * (1 - u) / (2 * e) : v * (u - e / 2); };

// Each crease in the frame the last one left: its normal's turned by `turn` and its foot is along the last crease by `c`, shrinking. All one coordinate system, since a fold's an isometry and the sheet's coordinates are where the point has got to.
const list = [];
function creases({ folds, c, shrink, turn, k }) {
  list.length = 0;
  let ox = 0, oy = 0, ang = 0.2, cc = c;
  for (let i = 0; i < folds; i++) {
    const nx = Math.cos(ang), ny = Math.sin(ang), d = nx * ox + ny * oy;
    const come = 1 - smoother(clamp((k * (folds + ON_MOVE) - i) / ON_MOVE));       // one after another, four of them on the move at once: it's the crease going by that's quick, so each gets as long as it can of the way in
    // Out of the way is just past the frame's edge from where this one's foot is. Sent a set 3.6 out, most of each crease's way was off the frame, so what you saw of it went by in a rush (Disclosure 133 s);
    // and down a long chain that wasn't far enough: with six or more, the last could still cut the frame with all of them gone, and letting go would jump.
    const clear = Math.max(0.3, Math.abs(nx) * ASPECT + Math.abs(ny) - d + 0.3);
    list.push(lineM(nx, ny, d + clear * come));
    ox += -ny * cc; oy += nx * cc; ang += turn; cc *= shrink;
  }
  return list;
}

const RANGE = 1.1;
function write(out, { k, folds = 8, c, lines = 3.6, shrink = 0.76, turn = 1.1, speed = 0.03, S }) {
  const f = boldUp(out, k, 4), x = (speed * S.sec + 0.25 * S.big) / RANGE;      // to and fro, RANGE radians one way, so it can't wander off to where the pieces are slivers
  const w = x - 2 * Math.floor(x / 2), t = turn + RANGE * (smoother(w < 1 ? w : 2 - w) - 0.5) + 0.05 * S.mel;
  writeChain(out, creases({ folds, c: (c ?? clamp(lines / f, 0.6, 1.8)) * (1 + 0.06 * S.mel), shrink, turn: t, k }), 1);
}

export const crumpleWith = o => (out, c) => {
  if (c.G.moves?.some(m => m.id === 'crumple')) return;
  const S = songNow(c);
  write(out, { k: 1, S, ...o });
};
export const crumpleDrive = crumpleWith();

export default {
  id: 'crumple',
  needs: () => true,
  cue(m, ctx) { m.open ??= 6; m.close ??= 4; return cueFold(m, ctx); },
  write(out, c) {
    const { m, t } = c, S = songNow(c), k = steady((t - m.from) / m.open) * (m.stay ? 1 : steady((m.to - t) / m.close));
    if (k <= 0) return;
    write(out, { k, S, folds: m.folds, c: m.c, shrink: m.shrink, turn: m.turn, speed: m.speed });
  },
};
