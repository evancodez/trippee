// Star Sphere. See docs/NEXT.md 2.2 and src/gl/chunks/moves.js. The sheet is on a ball, folded by the icosahedron's mirrors into one chamber. One knob, R: at 40 a flat sheet, at 16 a crease
// comes in, at 2.2 the frame is full of flowers. The mirrors never move on the screen's ball; the ball rolls under them. So what's at the middle of the frame says which axis of the
// icosahedron the ball has come to: ten petals, six or four.
//
// It keeps its promises at both ends: until it starts, and after it closes, no number of the slot has changed at all, and between those it comes out of flat with no jump at any R.
//
//   starMove({ t0, open, R1, ... })   add this to G.moves. Only t0 and open are needed: a plain roll that goes on until the gesture ends.
//     t0      seconds: the sheet is exactly flat until here. The first crease comes a few seconds later.
//     open    seconds it takes to reach its smallest R, R1
//     R0, R1  R at the start, and at home. 40 and 2.8. A chord away from home, and the phrase's breath, take it lower: away is how much of a log, breath the same, tune how far it's rolled in radians.
//     close   { t, D }: from t it unrolls over D seconds and is exactly flat again, so anything at all can follow it. Without it, what follows is a flight, which is what you want if it's still in flowers.
//     v       a plain roll: how fast the middle of the frame travels over the ball, in picture units a second
//     dir     which way, radians on the screen. turn: how fast that changes. spin: how fast the ball turns about the middle of the frame, radians a second. pan: [x, y] picture units per second that the pattern itself slides through the chamber.
//     chords  { runs, home, bar }, from understand(A): the ball rolls so that each chord lands at the middle on the moment it starts. 0 fifths from home is a ten-petal star, +1 six, -1 four. Same chord, same star.
//     react, tau, meter  the song, for its breath, its tune and its strong beats. surge: how much of the roll's speed comes and goes with the strong beats. All optional.
//   placeStar(score, pattern, { start, end, M, ... }) does all of it in a composed film, for the director. freeStar is a pattern's drive, for one picked by hand.
import { OFF as OFFS } from '../../pattern/layout.js';
import { clamp, lerp, smoother, rng } from '../curves.js';
import { flag } from '../flags.js';
import { flatten } from '../../pattern/genome.js';
import { reactAt } from '../react.js';

const TAU = Math.PI * 2;
const R_FLAT = 40, R_FLOWERS = 2.8;
const RATE = 30, WIDE = 6;  // samples of the roll a second, and numbers in each: the quaternion, ln R, how far the tune has rolled it
const FLOW = 0.2;            // cycles a second through the chamber, at most: a chamber isn't many cycles across, and any faster the whole frame starts to swap colours
const LN_SMALLEST = Math.log(1.7), BREATH = 0.22, TUNE = 0.14;     // how far the phrase's swell can take R, and by how much of a log; how far the tune rolls the ball, in radians

// Quaternions as [x, y, z, w]. A rotation done first goes on the right.
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const qnorm = q => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; };
const qaxis = (a, ang) => { const s = Math.sin(ang / 2); return [a[0] * s, a[1] * s, a[2] * s, Math.cos(ang / 2)]; };
const ONE = [0, 0, 0, 1];
function qslerp(a, b, x) {
  let d = qdot(a, b), s = 1;
  if (d < 0) { d = -d; s = -1; }
  if (d > 0.9995) return qnorm(a.map((v, i) => lerp(v, s * b[i], x)));
  const w = Math.acos(d), p = Math.sin((1 - x) * w), r = s * Math.sin(x * w);
  return qnorm(a.map((v, i) => v * p + b[i] * r));
}

// The same numbers as the shader
const N3 = [-0.5, -0.809017, 0.309017];
const CH = [[0.008722, -0.991278, -0.131496], [-0.991278, 0.008722, -0.131496], [0.131496, 0.131496, -0.982557]];   // columns
const chMul = v => [0, 1, 2].map(r => CH[0][r] * v[0] + CH[1][r] * v[1] + CH[2][r] * v[2]);
const SOUTH = [0, 0, -1];
const unit = v => { const l = Math.hypot(...v); return v.map(x => x / l); };

// The axes of the icosahedron at the corners of the chamber: five-fold, three-fold, two-fold.
const V5 = [0.52573, 0, 0.85065], V3 = [0, 0.35682, 0.93417], V2 = [0, 0, 1];
const plus = (a, b) => unit(a.map((x, i) => x + b[i]));

// The 60 turns of the ball that leave the picture just as it was, closed from the three mirrors and written in the frame's own terms.
const m3 = (a, b) => a.map(row => [0, 1, 2].map(j => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
const mirror = n => [0, 1, 2].map(i => [0, 1, 2].map(j => (i === j ? 1 : 0) - 2 * n[i] * n[j]));
function toQuat(m) {     // m as rows
  const t = m[0][0] + m[1][1] + m[2][2];
  if (t > 0) { const s = Math.sqrt(t + 1) * 2; return qnorm([(m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s, s / 4]); }
  if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2; return qnorm([s / 4, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s, (m[2][1] - m[1][2]) / s]); }
  if (m[1][1] > m[2][2]) { const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2; return qnorm([(m[0][1] + m[1][0]) / s, s / 4, (m[1][2] + m[2][1]) / s, (m[0][2] - m[2][0]) / s]); }
  const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2;
  return qnorm([(m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, s / 4, (m[1][0] - m[0][1]) / s]);
}
function closeGroup() {
  const M = [mirror([1, 0, 0]), mirror([0, 1, 0]), mirror(unit(N3))];
  const gens = [m3(M[0], M[1]), m3(M[0], M[2]), m3(M[1], M[2])];
  const key = m => m.flat().map(x => Math.round(x * 100)).join();
  const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], seen = new Map([[key(I), I]]), todo = [I];
  while (todo.length) { const a = todo.pop(); for (const g of gens) { const b = m3(g, a), k = key(b); if (!seen.has(k)) { seen.set(k, b); todo.push(b); } } }
  const C = [0, 1, 2].map(r => [CH[0][r], CH[1][r], CH[2][r]]), Ct = [0, 1, 2].map(r => CH[r]);    // CH and its transpose, as rows
  return [...seen.values()].map(g => toQuat(m3(m3(C, g), Ct)));
}
export const SAME = closeGroup();

// Of all the ways the ball can show this same picture, the one nearest to where it is now
export function nearest(from, q) {
  let best = q, d = -1;
  for (const g of SAME) { const c = qmul(g, q), x = Math.abs(qdot(from, c)); if (x > d) { d = x; best = c; } }
  return qdot(from, best) < 0 ? best.map(v => -v) : best;
}

// How fine a slot is, in cycles per picture unit. slot.js has this too, but it imports the moves.
export function fineOf(s) {
  let k = 0;
  for (let i = 0; i < 4; i++) {
    if (s[OFFS[`f${i}.on`]] < 0.5 || Math.abs(s[OFFS[`f${i}.d`]]) > 0.98) continue;
    const g = n => Math.abs(s[OFFS[`f${i}.${n}`]]);
    k = Math.max(k, Math.hypot(g('x'), g('y')) + g('r1') + g('r2') + (g('l1') + g('l2')) / 0.7 + (g('t1') + g('t2')) / 4);
  }
  return Math.max(k * Math.max(s[OFFS.freq], 1e-3) / Math.max(s[OFFS.scale], 1e-4), 1e-3);
}
const baseSlot = pattern => flatten(pattern.g);

const relMajor = c => (c & 1 ? ((c >> 1) + 3) % 12 : c >> 1);
export function fifthsFrom(home, c) { let q = (((relMajor(c) - relMajor(home.c)) * 7) % 12 + 12) % 12; if (q > 6) q -= 12; return q; }

// Where a chord puts the ball: the turn that brings that chord's axis to the middle of the frame. Home is five-fold, a fifth up is three-fold, a fifth down two-fold; a minor chord is the same place turned by 36 degrees.
export function chordTurn(c, home) {
  const q = fifthsFrom(home, c);
  const v = q === 0 ? V5 : q === 1 ? V3 : q === -1 ? V2 : q === 2 ? plus(V3, V5) : q === -2 ? plus(V2, V5) : plus(V2, V3);
  const w = unit(chMul(v)), d = clamp(SOUTH[0] * w[0] + SOUTH[1] * w[1] + SOUTH[2] * w[2], -1, 1), a = [SOUTH[1] * w[2] - SOUTH[2] * w[1], SOUTH[2] * w[0] - SOUTH[0] * w[2], SOUTH[0] * w[1] - SOUTH[1] * w[0]];
  const l = Math.hypot(...a), to = l < 1e-6 ? ONE : qaxis(a.map(x => x / l), Math.acos(d));
  return qmul(to, qaxis(SOUTH, c & 1 ? Math.PI / 5 : 0));
}

// R over time, as a log, with no corner anywhere. x is how far open it is, and everything the song does to the ball goes by x, so a sheet that's still flat isn't touched.
function openOf(m) {
  const { t0, open, close } = m;
  return t => {
    const x = smoother((t - t0) / open);
    return close && t > close.t ? x * (1 - smoother((t - close.t) / close.D)) : x;
  };
}

// A share of a roll, weighted by 1/R so that on the screen it goes at an even speed: while R is huge the ball's merely a sheet and any turn at all is a long way across it.
function evenOnScreen(lnR, a, b) {
  const n = 96, y = new Float32Array(n + 1);
  for (let i = 0; i < n; i++) {
    const s = a + (b - a) * (i + 0.5) / n, w = smoother((b - s) / (0.5 * (b - a))) * smoother((s - a) / (0.25 * (b - a)));      // picks up speed and comes to rest, on the screen
    y[i + 1] = y[i] + Math.exp(-lnR(s)) * w;
  }
  const end = y[n] || 1;
  return t => { const f = clamp((t - a) / (b - a)) * n, i = Math.min(n - 1, f | 0); return (y[i] + (y[i + 1] - y[i]) * (f - i)) / end; };
}

// The chords that rule, each landing at the middle on its first moment. The ball sets off for it from the last one, so it's nearly always on its way, and takes two bars at the least: of what
// starts in the two bars after that, the one that lasts longest. A passing chord it lets go by. The further from home, the smaller the flowers and the more of them: home is where there's room.
export function keysOf(chords, b, end, R1, away) {
  const { runs, home, bar } = chords, keys = [], gap = 2 * bar;
  const size = c => Math.log(R1) - away * clamp(Math.abs(fifthsFrom(home, c)) / 2, 0, 1);
  let first = null, most = 0;
  for (const r of runs) { const o = Math.min(r.t1, b + gap) - Math.max(r.t0, b); if (o > most) { most = o; first = r; } }
  if (!first) return keys;
  keys.push({ t: b, c: first.c, lnR: size(first.c), q: nearest(ONE, chordTurn(first.c, home)) });
  for (let from = b + gap; from < end;) {
    const last = keys[keys.length - 1];
    let best = null, top = 1.2;
    for (const r of runs) { if (r.t0 >= from && r.t0 < from + gap && r.t0 < end && r.c !== last.c && r.t1 - r.t0 >= top) { best = r; top = r.t1 - r.t0 + 1e-3; } }
    if (!best) { from += gap; continue; }
    keys.push({ t: best.t0, c: best.c, lnR: size(best.c), q: nearest(last.q, chordTurn(best.c, home)) });
    from = best.t0 + gap;
  }
  return keys;
}

// How far along a roll from a to b, with its speed coming and going on the strong beats (1 and 3, or the 1 in 3/4), and a smooth start and stop. Whole numbers of strong beats, so it lands.
function surgeOf(m) {
  if (!m.tau || !m.surge) return (a, b, t) => smoother((t - a) / (b - a));
  const P = (m.meter ?? 4) % 3 === 0 ? (m.meter ?? 4) : 2;
  return (a, b, t) => {
    const n = Math.max(1, Math.round((m.tau(b) - m.tau(a)) / P)), y = clamp((m.tau(t) - m.tau(a)) / (m.tau(b) - m.tau(a)));
    return smoother(y + m.surge * Math.sin(TAU * n * y) / (TAU * n));
  };
}

// The whole roll, worked out once and kept as a table: it's built by walking along it, and a frame only has to look it up.
function tableOf(m, tEnd) {
  const { t0, open, close, R0, R1, spin = 0.05 } = m, b = t0 + open, n = Math.ceil((tEnd - t0) * RATE) + 2, tab = new Float32Array(n * WIDE), dt = 1 / RATE;
  const x = openOf(m), r = rng((m.seed ?? 1) * 73 + 5), dir0 = m.dir ?? r() * TAU, turn = m.turn ?? 0.05 * (r() < 0.5 ? -1 : 1), v = m.v ?? 0.3, away = m.away ?? 0.3;
  const keys = m.chords?.runs?.length ? keysOf(m.chords, b, tEnd - (close?.D ?? 0), R1, away) : null;
  if (keys?.length) m.keys = keys;
  const useKeys = keys?.length > 0, surge = surgeOf(m), bar = m.chords?.bar ?? 2;
  const P = (m.meter ?? 4) % 3 === 0 ? (m.meter ?? 4) : 2, pulse = t => (m.tau && m.surge ? 1 + m.surge * Math.cos(TAU * m.tau(t) / P) : 1);
  // The size it's aiming for at each moment, between the chords as between the two ends
  const held = t => {
    if (!useKeys) return Math.log(R1);
    if (t <= b) return keys[0].lnR;
    let k = keys.length - 1; while (k > 0 && keys[k].t > t) k--;
    const K = keys[k], N = keys[k + 1];
    if (!N) return K.lnR;
    const a = Math.max(K.t, N.t - 4 * bar);
    return lerp(K.lnR, N.lnR, surge(a, N.t, Math.max(a, t)));
  };
  const lnR = t => lerp(Math.log(R0), held(t), x(t));
  const inWay = useKeys ? evenOnScreen(lnR, t0, b) : null, closing = close ? evenOnScreen(lnR, close.t, close.t + close.D) : null;
  const start = t => smoother((t - t0) / (0.25 * open));      // from a standing start, or the sheet would set off the instant it's on a ball
  let q = ONE, phi = 0, closeTo = null;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * dt, K = Math.exp(-lnR(t)), w = pulse(t);
    let now;
    if (useKeys) {
      if (t < b) now = qslerp(ONE, keys[0].q, inWay(t));
      else {
        let k = keys.length - 1; while (k > 0 && keys[k].t > t) k--;
        const A = keys[k], N = keys[k + 1];
        if (N) { const a = Math.max(A.t, N.t - 4 * bar); now = qslerp(A.q, N.q, surge(a, N.t, Math.max(a, t))); } else now = A.q;
      }
    } else {
      // Rolling that way turns about the axis square to it. Its speed on the ball goes with 1/R, so on the screen it's the same from the first crease to the flowers.
      const a = dir0 + turn * (t - t0);
      q = qnorm(qmul(q, qaxis([-Math.sin(a), Math.cos(a), 0], 2 * v * K * w * start(t) * dt)));
      now = q;
    }
    // ...and the same for its turning about the middle of the frame
    phi += spin * R1 * K * w * start(t) * dt;
    now = qmul(now, qaxis(SOUTH, phi));
    if (closing && t >= close.t) { closeTo ??= nearest(now, ONE); now = qslerp(now, closeTo, closing(t)); }
    now = qnorm(now);
    if (i > 0 && tab[(i - 1) * WIDE] * now[0] + tab[(i - 1) * WIDE + 1] * now[1] + tab[(i - 1) * WIDE + 2] * now[2] + tab[(i - 1) * WIDE + 3] * now[3] < 0) now = now.map(c => -c);
    tab.set(now, i * WIDE);
    tab[i * WIDE + 4] = lnR(t);
  }
  listen(m, tab, n, x, bar);
  return { tab, n, x };
}

// What the song does to the ball besides the chords, written into the table so a frame has nothing to work out and there's nothing to go wrong in a seek. The phrase breathes it in. A voice going up
// rolls it up, slowly, and it knows the tune ahead: it's smoothed over a bar either way, so it's the line of the melody that moves it and not its notes. Neither touches a sheet that's still flat.
function listen(m, tab, n, x, bar) {
  const R = m.react;
  if (!R) return;
  const dt = 1 / RATE, mel = new Float32Array(n), hw = Math.max(2, Math.round(bar * RATE / 2));
  for (let i = 0; i < n; i++) {
    const t = m.t0 + i * dt, s = reactAt(R, R.C ? R.C(t) : t);
    mel[i] = s.melSlow * s.voiced;
    const lnR = tab[i * WIDE + 4], g = (m.breath ?? BREATH) * x(t) * s.lung;
    tab[i * WIDE + 4] = lnR - g * clamp((lnR - LN_SMALLEST) / 0.5);
  }
  // twice over a box, which is a smooth hump, and scaled by how far this song's tune goes in this stretch
  let v = mel;
  for (let pass = 0; pass < 2; pass++) {
    const o = new Float32Array(n);
    let sum = 0;
    for (let i = -hw; i < n; i++) {
      if (i + hw < n) sum += v[i + hw];
      if (i - hw - 1 >= 0) sum -= v[i - hw - 1];
      if (i >= 0) o[i] = sum / (Math.min(n - 1, i + hw) - Math.max(0, i - hw) + 1);
    }
    v = o;
  }
  const top = Math.max(0.05, [...v].map(Math.abs).sort((a, b) => a - b)[Math.floor(n * 0.95)]), amt = (m.tune ?? TUNE) * (m.mirror ? -1 : 1);
  for (let i = 0; i < n; i++) tab[i * WIDE + 5] = amt * x(m.t0 + i * dt) * clamp(v[i] / top, -1.2, 1.2);
}

export function starMove(o) {
  return { id: 'star', R0: R_FLAT, R1: R_FLOWERS, ...o };
}

function pathOf(m, G) {
  if (m._path) return m._path;
  const tEnd = m.close ? m.close.t + m.close.D : Math.max(G.t1, m.t0 + m.open) + 1;
  m._path = tableOf(m, Math.min(tEnd, m.t0 + 900));    // a quarter of an hour on one gesture, and it comes to rest
  m._path.tEnd = tEnd;
  return m._path;
}

const k_ = OFFS['star.k'], q_ = ['star.qx', 'star.qy', 'star.qz', 'star.qw'].map(n => OFFS[n]), PLAIN = OFFS['field.b'];


// Where the ball is at time t, or null while it's a flat sheet. Same t, same answer.
export function ballAt(m, G, t) {
  const p = pathOf(m, G);
  if (t <= m.t0 || (m.close && t >= p.tEnd)) return null;
  const f = Math.max(0, (t - m.t0) * RATE), i = Math.min(p.n - 2, f | 0), a = Math.min(1, f - i), T = p.tab, at = c => T[i * WIDE + c] + (T[(i + 1) * WIDE + c] - T[i * WIDE + c]) * a;
  let q = [at(0), at(1), at(2), at(3)];
  const up = at(5);
  if (up) q = qmul(q, qaxis([1, 0, 0], up));
  return { R: Math.exp(at(4)), q: qnorm(q) };
}

const star = {
  id: 'star',
  // Flat, with nothing else around it: a surface or a shape has a geometry of its own. And bold: what's in a chamber is seen many times over.
  needs(slot) {
    const off = n => slot[OFFS[n]];
    return off('surf.kind') < 0.5 && off('matte.kind') < 0.5 && off('ribbon.on') < 0.5 && off('blobs.on') < 0.5 && off('droste.lnS') === 0 && off('conf.amt') === 0 && off('field.kind') < 0.5 && fineOf(slot) <= 9;
  },
  write(out, { u, t, OFF, G, m }) {
    // The ball's clock is the film's, unless this gesture's been taken off the film's: told to stay, the ball stays where its long move has got to, and what's on it still flows; let go, it
    // goes on from there, along that same long move.
    m.G0 ??= G.t0; m.G1 ??= G.arcEnd ?? G.t1;
    const when = G.freezeU != null || G.t0 !== m.G0 ? m.G0 + u * (m.G1 - m.G0) : t;
    const b = ballAt(m, G, when);
    if (!b) return;
    out[k_] = 1 / b.R;
    for (let i = 0; i < 4; i++) out[q_[i]] = b.q[i];
    // While it's on a ball its numbers can't glide to a flat pattern's: as k went to nothing the turn would be a pan that jumped away at the very end. Saying so is enough: a field's number
    // that nothing reads while there's no field, which slides and bends already refuse to cross. So what comes next is a flight, or it's unrolled by then and anything can.
    out[PLAIN] = 1;
    if (m.tilt) out[OFF.rot] += m.tilt * smoother((when - m.t0) / m.open);     // no wall stays lined up with the pattern's own lines, or its creases come in as slivers
    if (m.pan) { const e = when - m.t0; out[OFF.tx] += m.pan[0] * e; out[OFF.ty] += m.pan[1] * e; }
  },
};
export default star;

// Patterns it looks best on: broad bodies with a shape of their own, kept in the order they were judged.
export const STAR_BODIES = ['lines.river', 'lines.fall', 'waves.current', 'rooms.dive', 'pole.dipole', 'lattice.teeth', 'checks.twist', 'lattice.master', 'coins.dart', 'coins.ziggurat', 'riley.mosaic'];

// Picked by hand: a pattern's drive, for a body with no star on it from a film. It opens once and rolls for as long as it's looked at, on the clock. A plain roll, so there's nothing to know about any song.
//   { id: 'star.river', name: 'River Ball', family: 'star', pool: false, g: river.g, flow: river.flow, arcs: [], drive: freeStar }
export function freeStar(out, ctx) {
  const { G, t } = ctx;
  if (G.moves?.length || !flag('star')) return;
  G._star ??= starMove({ t0: G.t0, open: 14, seed: 5, v: 0.26, tilt: safeTurn(G.pattern) });
  star.write(out, { ...ctx, m: G._star });
}

// The chamber's walls, as the direction of each one's normal on the sheet, seen from the middle of the frame. Worked out from the mirrors, so they're the shader's own.
const WALLS = [[1, 0, 0], [0, 1, 0], N3].map(n => { const w = chMul(n); return Math.atan2(w[1], w[0]); });
// How far to turn a pattern so its straight lines lie as far as they can from any wall: at most a third of a turn, the nearest good one going `way`.
export function safeTurn(pattern, way = 1) {
  const s = baseSlot(pattern), dirs = [];
  for (let i = 0; i < 4; i++) {
    if (s[OFFS[`f${i}.on`]] < 0.5 || Math.abs(s[OFFS[`f${i}.d`]]) > 0.98) continue;
    const x = s[OFFS[`f${i}.x`]], y = s[OFFS[`f${i}.y`]];
    if (Math.hypot(x, y) > 1e-3) dirs.push(Math.atan2(y, x));
  }
  if (!dirs.length) return way * 0.2;
  const off = r => { let d = 9; for (const a of dirs) for (const w of WALLS) { const e = (a + r - w) / Math.PI; d = Math.min(d, Math.abs(e - Math.round(e)) * Math.PI); } return d; };
  let best = 0, top = -1;
  for (let i = 8; i <= 60; i++) { const r = way * i * Math.PI / 180, q = off(r) - 0.0005 * i; if (q > top) { top = q; best = r; } }
  return best;
}

// A whole star, for the director: the ball opens over `bars` bars from where this gesture lands at start, rolls from chord to chord for the rest, and leaves by a flight as whatever came
// next would have. pattern is any that passes `needs`. Returns the new gesture, or null if the film has no room for it.
//   start, end   seconds, roughly: it starts at the first boundary it can after start, and ends at the first boundary it can after end
//   M            understand(A), for the chords. Without it, or with no chords, it's a plain roll.
//   bars         how long it takes to open, 8 by default
//   lead         bars of flat sheet before the first crease, 1 by default
//   size         how bold the sheet is, cycles per picture unit: as a flat sheet, and in flowers. [2.2, 3.4] by default.
//   landOn       seconds: the moment it finishes opening. By itself it finds the song's strongest arrival within 30 s, and failing that it's `bars` after the first crease.
//   mirror       everything the other way, for a section played again
export function placeStar(score, pattern, { start, end, M, bars = 8, lead = 1, landOn, size = [2.2, 3.4], seed = 1, mirror = false, close = false, ...more }) {
  if (!flag('star')) return null;
  const g = score.gestures, meter = score.song?.meter ?? M?.meter ?? 4, tau = score.tau;
  const spb = M?.beat ?? (tau ? 1 / Math.max(tau(start + 0.5) - tau(start - 0.5), 1e-3) : 0.5), bar = spb * meter;
  let a = g.findIndex(x => x.t1 >= start), b = g.findIndex(x => x.t1 >= end);
  if (a < 0 || b < 0 || b >= g.length - 1 || b <= a || g[a].t1 - g[a].t0 < 6) return null;
  const P = g[a], E = g[b], t0 = P.t1, t1 = E.t1, tm = t1 - (E.morph ?? 0), first = t0 + lead * bar;
  // If the song arrives somewhere soon enough, that's when it finishes opening.
  landOn ??= (M?.arrivals?.(0.3) ?? []).filter(p => p.t > first + 6 * bar && p.t < Math.min(first + 30, tm - 4 * bar))[0]?.t;
  const open = landOn > first + 4 * bar && landOn < tm ? landOn - first : Math.min(bars * bar, 0.6 * (tm - first));
  if (tm - first < 12) return null;
  // Bold while it's a sheet, and a little finer as the chamber closes in, or a chamber can fall wholly inside one line and the frame goes one colour.
  const fine = fineOf(baseSlot(pattern)), u0 = (first - t0) / (t1 - t0), u1 = (first + open - t0) / (t1 - t0), way = mirror ? -1 : 1;
  const arcs = (pattern.arcs || []).filter(x => x.path !== 'scale' && x.path !== 'tx' && x.path !== 'ty' && x.path !== 'rot');
  arcs.push({ path: 'scale', from: fine / size[0], to: fine / size[1], log: true, at: [u0, u1] });
  // Turned so that no wall of the chamber lies along its lines, and then a little more all the way, so nothing's ever at rest. Walls lined up with a pattern's lines come in as slivers.
  const r0 = safeTurn(pattern, way);
  arcs.push({ path: 'rot', from: 0, to: r0, at: [0, u0 + 0.25 * (u1 - u0)] }, { path: 'rot', from: r0, to: r0 + way * 0.14, at: [u0 + 0.25 * (u1 - u0), 1] });
  const m = starMove({
    t0: first, open, seed, tau, meter, surge: 0.5, react: score.react, mirror,
    chords: M?.runs?.length ? { runs: M.runs, home: M.home, bar } : null,
    close: close ? { t: tm - 4 * bar, D: 4 * bar } : null, ...more,
  });
  const H = { t0, t1, arcEnd: t1, pattern, arcs, morph: E.morph, moves: [m], gears: [], melMode: 0, fixedRange: true, range: [0, 1], kindIn: E.kindIn, kindOut: E.kindOut, label: E.label, visit: E.visit, replayOf: null, change: null,
    ...(tau ? { phiTrack: [{ t: tau(t0), x: 0, v: Math.min(1 / 8, FLOW * spb) }] } : {}), ...(E.xform ? { xform: E.xform } : {}) };
  g.splice(a + 1, b - a, H);
  return H;
}
