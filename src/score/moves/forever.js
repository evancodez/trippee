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

// fx10: how many pairs of rings are open, from the rim in, against how far in it is. Pair 0 is the first ring and the sheet inside it; past the third they're under two pixels at 1080p and all the rest open as one.
// It goes as the square, so the first, which carries the whole picture, takes most of the way and the deeper ones come quicker, each about as many pixels a second as the last.
const PAIRS = 3.2, pairsAt = k => PAIRS * Math.pow(clamp((k - 0.05) / 0.75), 2);

function write(out, { k, off, n, inner, outer, tw, S, rot0 = 0.2 }) {
  // The rim comes in from past the corners. Then (fx10) each ring opens where it lies, out of the sheet: a mirror band widening at its circle while the sheet inside it draws back and gets smaller, one pair of rings after another, from the rim in.
  // The sheet inside the deepest open one is the plain sheet, smaller, so nothing starts as a dot. Then the mirrors part.
  const c = smoother(clamp(k / 0.7)), D = outer - inner, b = outer + (FAR_OUT - outer) * (1 - c), P = pairsAt(k);
  boldUp(out, k, 3);
  fanIn(out, smoother(clamp((k - 0.15) / 0.85)), n, rot0 + 0.3 * S.mel + 0.012 * S.sec);
  writeLog(out, { a: b - D, b, off, tw: tw * smoother(clamp((k - 0.85) / 0.15)) * (0.35 + 0.65 * S.en) });      // once the fan's first mirror is through the middle (fanIn): a twist about another centre tears
  out[OFF['lf._1']] = P >= PAIRS ? 0 : 1 + P;
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
    const go = m.from + m.open * 0.75, stop = m.stay ? m.to + 600 : m.into ? m.to : m.to - m.close * 0.9;      // into (fx10): it doesn't shut, the flight comes to rest on a whole number as the change starts, and the change (a Window, src/score/xform/window.js) flies on into the next pattern
    if (stop - go < 2) return null;
    m._go = journey(m, { go, stop, speed: m.speed / (2 * m._D), lurch: 0.5, ramp: 2 * ctx.bar });
    return m;
  },
  write(out, c) {
    const { m, t } = c, S = songNow(c), k = m.into ? inBy({ ...m, close: 0 }, t) : inBy(m, t), wholes = m._go(t), period = 2 * m._D;
    if (k <= 0) return;
    const off = -(wholes - Math.floor(wholes)) * period;      // at a whole number it's the same picture, exactly: that's how it gets out at the end
    write(out, { k, off, n: m.n, inner: m.inner, outer: m.outer, tw: m.tw, S });
  },
};
