// Forever. A flight down a tunnel of stars that always goes in and never arrives. The radius folds between two circles, again and again, so every ring is the mirror image of the next and the sheet inside it is just the same sheet, smaller. No ring has a seam, because each is a reflection of the last, and
// because the fold goes by ln r the whole of it repeats exactly as the camera flies, whole rings at a time. Then the mirrors of a Fan cut across it and the rings go to stars, and a twist leans them: the rings zigzag, and the zigzag runs in as you go. A real spiral would tear where the angle wraps. This doesn't, because the angle's already folded.
// Cell size goes with the distance from the middle and only there does it get fine, in a few pixels. The rim's as bold as the sheet.
//
//   G.moves = [{ id: 'forever', n, D, per, tw, ... }]     and the options in cueFold (foldkit.js)
//     n       mirrors. Default 6. They open over the first half of the way in.
//     inner, outer  ln of the two circles. Default -.55, .35. Their difference is how wide a ring is, and the frame's corners are at .71.
//     speed   how fast the camera flies, in ln a second, on the strong beats' surge. Default .42, and a big moment throws it a ring or so further on
//     tw      how far the twist goes, at the song's loudest. Default .45
// The tune turns the whole star. Loudness leans it. Each strong beat throws the camera on, and it hangs between.
// By hand: foreverDrive.
import { OFF } from '../../pattern/layout.js';
import { clamp, smoother } from '../curves.js';
import { cueFold, inBy, songNow, journey, boldUp, fanIn, writeLog } from './foldkit.js';

const FAR_OUT = 1.25;

function write(out, { k, off, n, inner, outer, tw, S, rot0 = 0.2 }) {
  // The rim comes in from past the corners and the inner circle opens from a point, each at about the same speed across the frame. Then the mirrors part.
  const c = smoother(clamp(k / 0.7)), rIn = Math.exp(inner) * c + 1e-3 * (1 - c);
  boldUp(out, k, 3);
  fanIn(out, smoother(clamp((k - 0.15) / 0.85)), n, rot0 + 0.3 * S.mel + 0.012 * S.sec);
  writeLog(out, { a: Math.log(rIn), b: outer + (FAR_OUT - outer) * (1 - c), off, tw: tw * smoother(clamp((k - 0.75) / 0.25)) * (0.35 + 0.65 * S.en) });
  out[OFF.rot] += 0.01 * S.sec * k;
}

const IN0 = -0.55, OUT0 = 0.35;
export const foreverWith = ({ n = 6, tw = 0.45, speed = 0.42, turn = 0.2 } = {}) => (out, c) => {
  if (c.G.moves?.some(m => m.id === 'forever')) return;
  const S = songNow(c);
  write(out, { k: 1, off: -(S.sec * speed + (OUT0 - IN0) * S.big), n, inner: IN0, outer: OUT0, tw, S, rot0: turn });
};
export const foreverDrive = foreverWith();

export default {
  id: 'forever',
  needs: () => true,
  cue(m, ctx) {
    if (!cueFold(m, ctx)) return null;
    m.inner ??= IN0; m.outer ??= OUT0; m.n ??= 6; m.tw ??= 0.45; m.speed ??= 0.42;
    m._D = m.outer - m.inner;
    const go = m.from + m.open * 0.75, stop = m.stay ? m.to + 600 : m.to - m.close * 0.9;
    if (stop - go < 2) return null;
    m._go = journey(m, { go, stop, speed: m.speed / (2 * m._D), lurch: 0.5, ramp: 2 * ctx.bar });
    return m;
  },
  write(out, c) {
    const { m, t } = c, S = songNow(c), k = inBy(m, t), wholes = m._go(t), period = 2 * m._D;
    if (k <= 0) return;
    const off = -(wholes - Math.floor(wholes)) * period;      // at a whole number it's the same picture, exactly: that's how it gets out at the end
    write(out, { k, off, n: m.n, inner: m.inner, outer: m.outer, tw: m.tw, S });
  },
};
