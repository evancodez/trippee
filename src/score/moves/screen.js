// Screen. The picture holds a smaller, turned picture of itself, which holds another: a camera pointed at its own monitor. The frame's own edge draws in and the picture goes back into it, a screen inside the sheet, and another
// draws in from that one's edge, and so on down, each quicker than the last, as each is half the size; then the camera flies through them. At every whole level the frame is exactly what it was, so it never gets there. At the end the
// windows shut from the inside out, each going back out to the edge of the one round it, while the camera flies on into the last of them: it fills the frame, and its edge goes out past the frame's, and that's the sheet as it was.
// Nothing starts as a dot or ends as one. Each level is the same size against its own frame, so the bold shapes are as bold in the first window as out here, only smaller, and they're under a few pixels only over the last few pixels of the middle.
// A little turn on each level adds up: the tenth level is turned ten times as far, so the tower twists as the tune bends it, and the deep levels swing the most.
//
//   G.moves = [{ id: 'screen', S, turn, per, ... }]     and the options in cueFold (foldkit.js)
//     S      how big each level is against the last. Default .5
//     turn   how far each is turned, radians. Default .5
//     speed  how fast the camera flies, ln a second on the strong beats' surge. Default .3, and a big moment throws it a level further on
//     par    1: each level is the negative of the last, so its edge always shows. Default 1
// By hand: screenDrive.
import { OFF } from '../../pattern/layout.js';
import { clamp, smoother } from '../curves.js';
import { cueFold, inBy, songNow, journey, boldUp, writeFeedback, FEEDBACK_ALL } from './foldkit.js';

// The screen's a little bigger than the frame, so anything the song's camera or a lens brings in from past the frame's edge still comes out the same at a whole level. Sized to the widest window worth minding.
const RX = 2.35, RY = 1.32;
// Levels it opens one at a time, from the outside: past these they're under two pixels across at 1080p, and all the rest open as one. How many are open goes as the cube of how far through the way in, so the first, which
// carries the whole picture, takes most of it and the deeper ones come quicker and quicker, each about as many pixels a second as the last. The way out is the same backwards.
const DEEP = 9, levelsAt = u => DEEP * u * u * u;

function write(out, { k, tau, Sz, turn, S, open = FEEDBACK_ALL }) {
  boldUp(out, k, 1.7);
  writeFeedback(out, { S: Sz, turn: turn * smoother(clamp((k - 0.3) / 0.7)) + 0.12 * S.mel * k, rx: RX, ry: RY, tau, open });
}

export const screenWith = ({ Sz = 0.5, turn = 0.5, speed = 0.3, par = 1, rx, ry } = {}) => (out, c) => {
  if (c.G.moves?.some(m => m.id === 'screen')) return;
  const S = songNow(c);
  out[OFF['sf.par']] = par;
  write(out, { k: 1, tau: (S.sec * speed / Math.log(1 / Sz) + 2 * S.big) % 2, Sz, turn, S });
};
export const screenDrive = screenWith();

export default {
  id: 'screen',
  needs: () => true,
  cue(m, ctx) {
    if (!cueFold(m, ctx)) return null;
    m.S ??= 0.5; m.turn ??= 0.5; m.speed ??= 0.3; m.par ??= 1;
    // It flies once it's all open, and on through the way out, into the last window, coming to rest as the way out does
    const go = m.from + m.open, stop = m.stay ? m.to + 600 : m.to;
    if (stop - go < 2) return null;
    m._go = journey(m, { go, stop, speed: m.speed / Math.log(1 / m.S), lurch: 2, ramp: ctx.bar, unit: 2 });      // two levels: with each the negative of the last, one level on is the whole frame inverted
    return m;
  },
  write(out, c) {
    const { m, t } = c, S = songNow(c), k = inBy(m, t), w = m._go(t);
    if (k <= 0) return;
    // How many are open, counted from the camera: going in, from the frame's edge; going out, the deepest shut first, while the camera flies on, so it lands inside the last one as it shuts, on a whole number of levels (tau 0), and that frame is the plain sheet
    const tau = w % 2, P = Math.min(levelsAt(clamp((t - m.from) / m.open)), m.stay ? DEEP : levelsAt(clamp((m.to - t) / m.close)));
    out[OFF['sf.par']] = m.par;
    write(out, { k, tau, Sz: m.S, turn: m.turn, S, open: P >= DEEP ? FEEDBACK_ALL : tau + P });
  },
};
