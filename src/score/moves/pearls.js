// Pearls. A few perfect mirror balls drift into the frame, and each one holds the whole sheet, turned inside out: what's far away is at its middle, what's near curls in round its rim, unbroken. And each holds the others, which hold it. Where two come close the reflections of reflections pile up between them into Indra's pearls, the nearer they get. With no lighting at all: only where the lines go.
// A ball's middle is the sheet's infinity, which would be hairlines, so the plane itself is folded back at a circle just off the frame's corners. Then nothing's infinite: a ball's middle is only the far side of that circle, small and bold.
// They come in from off the frame one at a time, on the strong beats, and leave the same way.
//
//   G.moves = [{ id: 'pearls', n, r, far, ... }]     and the options in cueFold (foldkit.js)
//     n      how many, up to 5. Default 3
//     r      how big. Default .62
//     far    how far they go round the middle. Default .85, and they come closer as the song gets louder, which is more of each in the others
//     orbit  radians a second they go round. Default .12, and a big moment takes them one place on
// Each strong beat swells one ball in turn. The tune lifts them all. By hand: pearlsDrive.
import { clamp, smoother } from '../curves.js';
import { cueFold, inBy, songNow, boldUp, writeChain, circleIn, circleOut, TAU } from './foldkit.js';

const RIM = 2.3, REPS = 8, OFF_FRAME = 4;
const list = [];
function write(out, { k, n = 3, r = 0.62, far = 0.85, orbit = 0.12, S }) {
  boldUp(out, smoother(clamp(k * 3)), 2.2);      // audit10: bold first and fine last, so the balls go out over a bold sheet, not grey on a fine one (Wildflower 64-66 s)
  const a0 = orbit * S.sec + (TAU / n) * S.big, near = far * (1.18 - 0.36 * S.en), beat = S.s - Math.floor(S.s), which = ((Math.floor(S.s) % n) + n) % n;
  list.length = 0;
  list.push(circleOut(0, 0, RIM * (1 + 5 * (1 - smoother(clamp(k * 3))))));
  for (let i = 0; i < n; i++) {
    const a = a0 + i / n * TAU, come = 1 - smoother(clamp(k * (n + 1) - i - 0.5)), d = near + OFF_FRAME * come;
    // Each beat one swells, gone by the next
    const swell = 1 + 0.13 * (i === which ? Math.sin(Math.PI * beat) ** 2 : 0);
    list.push(circleIn(d * 1.35 * Math.cos(a), d * Math.sin(a) + 0.13 * S.mel, r * swell));
  }
  writeChain(out, list, REPS);
}

export const pearlsWith = o => (out, c) => {
  if (c.G.moves?.some(m => m.id === 'pearls')) return;
  write(out, { k: 1, S: songNow(c), ...o });
};
export const pearlsDrive = pearlsWith();

export default {
  id: 'pearls',
  needs: () => true,
  cue(m, ctx) { return cueFold(m, ctx); },
  write(out, c) {
    const { m, t } = c, k = inBy(m, t);
    if (k <= 0) return;
    write(out, { k, S: songNow(c), n: m.n, r: m.r, far: m.far, orbit: m.orbit });
  },
};
