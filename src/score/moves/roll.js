// Roll. The sheet is a sphere nobody can see, and on a big moment it rolls over once. Infinity comes up over the edge of the frame as an eye and everything falls in around it: straight stripes curl into rings, the eye crosses the frame with all the lines going round it, and goes out the other side, and the stripes lie down again, exactly where they were. A whole turn of the sphere is nothing at all, so there's nothing to get in or out of, and a roll can start and end on any pattern, in any shot.
// Rolled straight, the eye would be a knot of hairlines: there the whole plane is crushed into a few pixels (docs/DIRECTION.md, Sky Roll: "the knot greys and aliases"). So the plane's folded back at a circle out past the frame's corners first, and nothing's ever further away than that. Then the eye has as many lines in it as you can count, as bold as anywhere.
//
//   G.moves = [{ id: 'roll', hits, D, R, way, ... }]
//     hits   under times: song seconds, the moments it's inside out on, crossing at top speed. Leave them out, and it's the song's own biggest moments in the shot.
//     D      how long a roll takes, seconds. Default 6, or 3 bars
//     R      how big the sphere is. Default 1.5. Bigger is a slower, flatter roll.
//     way    which way the first goes, in turns. Each after it goes off by a golden angle.
// Each strong beat throws it on, and it hangs between them. The tune leans the way it's rolling. By hand: rollDrive.
import { OFF } from '../../pattern/layout.js';
import { clamp, smoother } from '../curves.js';
import { momentsOf } from '../hear.js';
import { cueFold, songNow, boldUp, writeChain, writeMobius, circleOut, TAU } from './foldkit.js';

const RIM = 2.3, GOLD = 0.382;
const circle = circleOut(0, 0, RIM);

// a: how far round, 0 to pi being a whole turn. The rotation of the sphere by 2a, about the axis through the frame's edge `dir`.
function write(out, a, R, dir) {
  const c = Math.cos(a), s = Math.sin(a), ex = Math.cos(dir), ey = Math.sin(dir);
  boldUp(out, Math.pow(s, 2), 2.4);
  writeMobius(out, [c, 0], [s * R * ex, s * R * ey], [-s / R * ex, s / R * ey], [c, 0]);
  writeChain(out, [circle], 1);
}

// How far through a roll, with the strong beats heaving it on: the same distance on average, and exact at both ends.
const heave = (x, S, D) => clamp(x + (0.42 * S.P / (TAU * D)) * Math.sin(TAU * S.e) * smoother(x / 0.15) * smoother((1 - x) / 0.15));

export function rollDrive(out, c) {
  if (c.G.moves?.some(m => m.id === 'roll')) return;
  const S = songNow(c), period = 9, n = S.sec / period, i = Math.floor(n), x = (n - i) / 0.82;       // a roll, then a moment of the sheet as it was, and off another way
  if (x >= 1) return;
  write(out, Math.PI * smoother(x), 1.5, (i * GOLD + 0.12) * TAU + 0.12 * S.mel);
}

export default {
  id: 'roll',
  needs: () => true,
  cue(m, ctx) {
    const { G, A, M, bar, score } = ctx;
    const from = m.from ?? G.t0, to = m.to ?? G.t1 - (G.morph || 0), D = m.D ?? Math.max(6, 3 * bar);
    let hits = m.hits ?? (A && M?.bar ? momentsOf(A, M).filter(x => x.sign > 0 && x.s >= 0.45).map(x => (score?.time ?? (t => t))(x.t)) : []);
    hits = hits.filter(t => t - D / 2 >= from && t + D / 2 <= to).reduce((a, t) => { if (!a.length || t - a.at(-1) >= D + 1) a.push(t); return a; }, []);
    if (!hits.length) return null;
    m.hits = hits; m.D = D; m.R ??= 1.5; m.way ??= 0.12;
    m._clock = cueFold({ id: 'roll', beats: m.beats ?? 'strong', from, to, lead: 0, coast: 0 }, ctx);      // its own clock of the strong beats, so it's a pure function of the film it's in. None to be had, and it rolls with no heave
    return m;
  },
  write(out, c) {
    const { m, t } = c;
    let i = -1;
    for (let k = 0; k < m.hits.length; k++) if (Math.abs(t - m.hits[k]) < m.D / 2) { i = k; break; }
    if (i < 0) return;
    const u = (t - m.hits[i] + m.D / 2) / m.D, S = m._clock ? songNow({ ...c, m: m._clock }) : null;
    write(out, Math.PI * smoother(S ? heave(u, S, m.D) : u), m.R, (m.way + i * GOLD) * TAU + (S ? 0.1 * S.mel : 0));
  },
};
