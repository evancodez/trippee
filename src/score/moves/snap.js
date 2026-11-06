// Dots that all touch at once. Dots sit on a field that's a product of waves, and at level 0 that field is a plain checker: every dot touches every neighbour at the same moment, and past it
// black dots on white have become white dots on black. So the level crosses 0 on a breath, quickly, and otherwise stays well away from it, and no dot ever seems to be doing anything until
// all of them do. See docs/NEXT.md, Stage 4. The level is lifted through `sum` and a constant family (LIFT in src/pattern/families/dots.js), because the threshold belongs to the song.
//
//   G.moves = [{ id: 'snap', amp, sharp, breaths }]
//     amp      how far from touching the dots get, as a level. Default .5
//     sharp    how quick the crossing is against the breath. Default 3: about a tenth of the breath
//     breaths  seconds of the breaths to cross on (score.react.M.breath.t). Without them it crosses on every whole phi, which is what a pattern's own drive gets.
import { OFF, FAMILIES } from '../../pattern/layout.js';

const isConst = (s, i) => s[OFF[`f${i}.on`]] > 0.5 && Math.abs(s[OFF[`f${i}.d`]]) > 1.01;
const liftOf = s => { for (let i = 0; i < FAMILIES; i++) if (isConst(s, i)) return Math.abs(s[OFF[`f${i}.d`]]); return 0; };
const opened = s => { let n = 0; for (let i = 0; i < FAMILIES; i++) if (s[OFF[`f${i}.on`]] > 0.5) n++; return n; };

// How far through the breaths: whole on a breath, and it keeps going at the last breath's pace either side
function breathX(T, t) {
  const n = T.length;
  if (n < 2) return t;
  if (t <= T[0]) return (t - T[0]) / (T[1] - T[0]);
  if (t >= T[n - 1]) return n - 1 + (t - T[n - 1]) / (T[n - 1] - T[n - 2]);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
  return lo + (t - T[lo]) / (T[lo + 1] - T[lo]);
}

// Crosses 0 on every whole x, going the other way each time. Eased so its speed never jumps, and it never quite stops.
export function snapLevel(x, amp = 0.5, sharp = 3) {
  return amp * Math.tanh(sharp * Math.sin(Math.PI * x)) / Math.tanh(sharp);
}

export function writeSnap(out, x, m = {}) {
  const lift = liftOf(out);
  if (lift) out[OFF.sum] = snapLevel(x, m.amp ?? 0.5, m.sharp ?? 3) * Math.sqrt(opened(out)) / lift;
}

export default {
  id: 'snap',
  needs(slot) { return slot[OFF.round] > 0.5 && liftOf(slot) > 0; },
  write(out, { t, phi, m }) { writeSnap(out, m.breaths ? breathX(m.breaths, t) : phi, m); },
};
