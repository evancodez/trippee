// Fan. A kaleidoscope that opens while you watch. One mirror sweeps in from off the frame and stops through the middle; then it parts, and more come round from the back, one to each strong beat. There's a seam at the back of the fan until the count comes out whole,
// and at every strong beat it does: the frame locks into exact symmetry on the hit, comes apart, and locks again with one more mirror. The sheet goes on walking under them, with the tune, so no two stars are the same.
// A fold's continuous for any number of mirrors at all (src/gl/chunks/fold.js), so this has no solid in it, no flip and no cut, and it goes on through any pattern.
//
//   G.moves = [{ id: 'fan', lo, hi, every, ... }]     and the options in cueFold (foldkit.js)
//     lo, hi   how few mirrors and how many, by how loud the song is at each strong beat. Default 2 and 9. A quiet song stays near lo.
//     step     how many mirrors a strong beat can add, on the way to where the song wants it. Default 1.
//     walk     how far the sheet walks, picture units a second. Default .08
// By hand: fanDrive, and it goes up and down for ever.
import { OFF } from '../../pattern/layout.js';
import { evalTrack, clamp, smoother } from '../curves.js';
import { cueFold, inBy, songNow, beatsTrack, boldUp, writeFan } from './foldkit.js';

const FAR = 7;
const mirrors = n => Math.PI / Math.max(n, 1);

function write(out, { k, n, S, walk = 0.08, rot0 = 0.2 }) {
  const rot = rot0 + 0.012 * S.sec + 0.24 * S.mel * k + 0.5 * S.big * k;
  boldUp(out, k, 3);
  // The first mirror comes in from below: the frame's all on its near side until it arrives
  const come = 1 - smoother(clamp(k / 0.4)), x = -FAR * come * Math.sin(rot), y = -FAR * come * Math.cos(rot);
  const open = smoother(clamp((k - 0.3) / 0.7));
  writeFan(out, { x, y, al: mirrors(1 + (n - 1) * open), rot });
  // The sheet goes on under the mirrors, in long curves. Each strong beat takes it a step, and the tune leans it.
  const w = walk * S.sec, sc = out[OFF.scale];
  out[OFF.tx] += k * (w * Math.cos(0.09 * S.sec) + 0.12 * S.mel) / sc * sc;
  out[OFF.ty] += k * w * Math.sin(0.06 * S.sec + 1);
  out[OFF.rot] += 0.012 * S.sec * k;
}

// Up and down for ever, by itself. One mirror to each strong beat, and a whole number on each.
const HAND = { lo: 2, hi: 8 };
const handList = (() => { const a = []; for (let n = HAND.lo; n <= HAND.hi; n++) a.push(n); for (let n = HAND.hi - 1; n > HAND.lo; n--) a.push(n); return [...a, HAND.lo]; })();
const handTrack = beatsTrack(handList), handP = handList.length - 1;
export function fanDrive(out, c) {
  if (c.G.moves?.some(m => m.id === 'fan')) return;
  const S = songNow(c), w = ((S.s % handP) + handP) % handP;
  write(out, { k: 1, n: evalTrack(handTrack, w), S });
}

export default {
  id: 'fan',
  needs: () => true,
  cue(m, ctx) {
    if (!cueFold(m, ctx)) return null;
    const { lo = 2, hi = 9, step = 1 } = m, R = m._R, n = [];
    let was = lo;
    for (const t of m.beats) {
      const e = R?.energy ? R.energy[clamp(Math.round((R.C ? R.C(t) : t) * R.hz), 0, R.n - 1)] : 0.6;
      const want = Math.round(lo + (hi - lo) * Math.pow(clamp(e), 1.1));
      was += clamp(want - was, -step, step); n.push(was);
    }
    m._n = beatsTrack(n);
    return m;
  },
  write(out, c) {
    const S = songNow(c), k = inBy(c.m, c.t);
    if (k <= 0) return;
    write(out, { k, n: evalTrack(c.m._n, S.s), S, walk: c.m.walk });
  },
};
