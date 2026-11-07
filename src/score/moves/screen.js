// Screen. The picture holds a smaller, turned picture of itself, which holds another: a camera pointed at its own monitor. A little window opens in the middle of the sheet, and in it is the sheet with a window in it, and so on down; the window comes up to size, and the camera flies through it. At
// every whole level the frame is exactly what it was, so it never gets there. Each level is the same size against its own frame, so the bold shapes are as bold in the first window as out here, only smaller, and they're under a few pixels only over the last few pixels of the middle.
// A little turn on each level adds up: the tenth level is turned ten times as far, so the tower twists as the tune bends it, and the deep levels swing the most.
//
//   G.moves = [{ id: 'screen', S, turn, per, ... }]     and the options in cueFold (foldkit.js)
//     S      how big each level is against the last. Default .42
//     turn   how far each is turned, radians. Default .34
//     per    strong beats to a level going by. Default 3
//     par    1: each level is the negative of the last, so its edge always shows. Default 1
// By hand: screenDrive.
import { OFF } from '../../pattern/layout.js';
import { clamp, smoother } from '../curves.js';
import { cueFold, inBy, songNow, journey, boldUp, writeFeedback } from './foldkit.js';

// The screen's a little bigger than the frame, so anything the song's camera or a lens brings in from past the frame's edge still comes out the same at a whole level. Sized to the widest window worth minding.
const RX = 2.35, RY = 1.32, FROM = 0.002;

function write(out, { k, tau, Sz, turn, S }) {
  const open = smoother(clamp(k / 0.8));
  boldUp(out, k, 2.6);
  writeFeedback(out, { S: FROM * Math.pow(Sz / FROM, open), turn: turn * smoother(clamp((k - 0.3) / 0.7)) + 0.09 * S.mel * k, rx: RX, ry: RY, tau });
}

export const screenWith = ({ Sz = 0.42, turn = 0.34, per = 3, par = 1 } = {}) => (out, c) => {
  if (c.G.moves?.some(m => m.id === 'screen')) return;
  const S = songNow(c, 3, 1.5);
  out[OFF['sf.par']] = par;
  write(out, { k: 1, tau: (S.s / per) % 1, Sz, turn, S });
};
export const screenDrive = screenWith();

export default {
  id: 'screen',
  needs: () => true,
  cue(m, ctx) {
    if (!cueFold(m, ctx)) return null;
    m.S ??= 0.42; m.turn ??= 0.34; m.per ??= 3; m.par ??= 1;
    const go = m.from + m.open * 0.9, stop = m.stay ? m.to + 1e3 : m.to - m.close * 0.95;
    if (stop - go < 2) return null;
    m._go = journey(m, { go, stop, perBeat: 1 / m.per, ease: ctx.bar });
    return m;
  },
  write(out, c) {
    const { m, t } = c, S = songNow(c, 3, 1.5), k = inBy(m, t), w = m._go(t);
    if (k <= 0) return;
    out[OFF['sf.par']] = m.par;
    write(out, { k, tau: w - Math.floor(w), Sz: m.S, turn: m.turn, S });
  },
};
