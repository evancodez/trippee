// The chill set's shared part: a long move's numbers over time. See moire.js, vertigo.js, confocal.js, mirror.js.
// A lane is a plain number, or knots [[t, x], ...] in seconds, or [t, x, 'hit'] for a knot crossed at speed. It's C2, it never overshoots between knots, and nothing stops at a knot unless the knots either
// side of it say so. Before the first knot and after the last it holds still. A cut writes song seconds and cut.js puts them on the picture's clock before they get here, so the rests can't move a landing.
import { evalTrack } from '../curves.js';

const HIT = 2.2, STEADY = 2.5, PAST_HIT = 0.15;       // as in cut.js's laneKnots, which this has to agree with. It can't be imported from there: cut.js imports every move.
const made = new WeakMap();
function trackOf(keys, log) {
  let both = made.get(keys);
  if (!both) made.set(keys, both = {});
  const name = log ? 'log' : 'lin';
  if (both[name]) return both[name];
  const n = keys.length, x = keys.map(k => (log ? Math.log(k[1]) : k[1])), T = keys.map(k => k[0]), slope = i => (x[i + 1] - x[i]) / Math.max(T[i + 1] - T[i], 1e-3);
  const out = both[name] = [];
  for (let i = 0; i < n; i++) {
    let v = 0;
    if (i > 0 && i < n - 1) { const a = slope(i - 1), b = slope(i); v = a * b > 0 ? 2 * a * b / (a + b) : 0; }
    if (keys[i][2] === 'hit' && n > 1) {
      v = HIT * (i < n - 1 ? slope(i) : slope(i - 1));
      const p = out.at(-1);
      if (p && !p.v && Math.abs(v) * (T[i] - p.t) > STEADY * Math.abs(x[i] - p.x)) {
        const late = Math.max(STEADY * Math.abs(x[i] - p.x) / Math.abs(v), 2);
        if (late < T[i] - p.t - 1e-2) out.push({ t: T[i] - late, x: p.x, v: 0 });
      }
    }
    out.push({ t: T[i], x: x[i], v });
    if (i === n - 1 && v) { const C = Math.max(2 * PAST_HIT * Math.abs(x[i] - x[0]) / Math.abs(v), 0.5); out.push({ t: T[i] + C, x: x[i] + 0.5 * v * C, v: 0 }); }
  }
  return out;
}

const isLane = v => Array.isArray(v) && Array.isArray(v[0]);

// What a lane says at time t. log: the knots are read as multiples, so a move from 1 to 8 spends as long on each doubling.
export function val(lane, t, fallback = 0, log = false) {
  if (lane == null) return fallback;
  if (!isLane(lane)) return lane;
  const y = evalTrack(trackOf(lane, log), t);
  return log ? Math.exp(y) : y;
}

// The moment a lane reads. Told to stay, a gesture stays where its long move has got to, as cue.js does.
export const laneT = ({ t, u, G }) => (G.freezeU != null ? G.t0 + u * ((G.arcEnd ?? G.t1) - G.t0) : t);

// A pattern picked by hand runs its own endless schedule. In a cut (fixedRange) a shot says what it wants: its move if it has one, its lanes, or the pattern as it stands.
export const worn = (G, id) => !!G?.fixedRange || !!G?.moves?.some(m => m.id === id);
