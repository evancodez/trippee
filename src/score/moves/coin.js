// The spun coin. See docs/NEXT.md 2.2. A cone of bold rings leans over and goes round, and the lean dies away as the turning speeds up, exactly as a coin settles on a table:
// the orbits close at 16, 8, 4, 2 and 1 beats to go, the rim of the lean keeps one speed all the way down, and it's dead flat on the downbeat. Builds only, and only once.
//
//   spliceCoin(score, land, pattern, opts)   the whole of it, for the director: a gesture running from before the build to the next boundary past the landing. Or by hand:
//   G.moves = [coinMove(score, land, opts)], G.phiTrack = coinFlow(score, G.moves[0]), and coinAmbient(G, t) for the song's lenses.
//
//   land   seconds: the downbeat it lands on. On that frame there is no lean at all: it's exactly the pattern with no coin.
//   beats  how long before the landing it starts, in beats. 30 s at most, by the plan.
//   a0     how steep the cone gets at its steepest. Under .85. A pattern can say how much it stands with `lean`.
//   peak   beats to go when it stops leaning further; from there on the lean shrinks in proportion to the beats left.
//   apex   which ring stays centred, in pattern units. The eye of the cone goes round the opposite way, by this times the lean.
//   rib    how strong the ribs running up the cone are, 0 none. A rib reaches the eye on every strong beat (1 and 3, or the 1 in 3/4), so the beat travels through the shape.
//   ribLen how far apart they are, in pattern units
//   after  how fast it zooms in once it's landed, natural logs per second, picking up over 2 bars. 0 for none.
//   turns  orbits per halving of the beats left
//   w0     which way it leans each time an orbit closes, radians, 0 is to the right. dir -1 goes round the other way. Mirror these for a replayed section.
//   meter  beats in a bar: orbits close on it. tau: the score's beat clock, t -> beats. spb: seconds per beat, which stands in for tau if there isn't one.
import { OFF as OFFS } from '../../pattern/layout.js';
import { smoother } from '../curves.js';
import { flag } from '../flags.js';

const TAU = Math.PI * 2;
const MAX_K = 0.85;
const LEAN = 0.56, APEX = 0.75, RIB = 0.45, RIB_LEN = 1.1, AFTER = 0.045;
const FASTEST = 1.5;       // radians per frame at 60 fps: past this a turn can't be seen as a turn, only as rattle. Under it, the last of the lean runs out at that speed.

const beatsLeft = (m, t) => (m.tau ? m.tau(m.land) - m.tau(t) : (m.land - t) / m.spb);
const peakOf = m => m.peak ?? Math.min(m.beats * 0.6, 24);

// The shape of the lean, whose top is 1. Proportional to the beats left from the peak on, and C1 throughout, so it has no corner in it until the landing, which is meant to have one.
function shape(m, x) {
  const X = m.beats, xm = peakOf(m);
  return (x / xm) * smoother((X - x) / Math.max(X - xm, 1e-3));
}
function top(m) {
  if (m._top) return m._top;
  let s = 0;
  for (let i = 1; i < 64; i++) s = Math.max(s, shape(m, m.beats * i / 64));
  return (m._top = s);
}
export function leanAt(m, x, a0 = m.a0 ?? LEAN) {
  return Math.min(MAX_K, a0 * shape(m, x) / top(m));
}
// How far round. Whole orbits at x = meter * 2^(i/turns), so one closes on every bar of the last few, however long they are.
export function turnAt(m, x) {
  const n = m.turns ?? 2, unit = m.meter ?? 4, spb = m.spb ?? 0.5;
  const xc = TAU * n / (Math.LN2 * spb * 60 * FASTEST);     // where the turning reaches the fastest it can be seen at
  const lg = x > xc ? Math.log2(x / unit) : Math.log2(xc / unit) + (x - xc) / (xc * Math.LN2);    // ...and it carries on at that rate, with no corner
  return (m.w0 ?? 0) + (m.dir ?? 1) * TAU * n * lg;
}

// What the director needs: a coin landing on this downbeat. The score knows the tempo and the bar.
export function coinMove(score, land, o = {}) {
  const tau = score.tau, spb = tau ? 1 / Math.max(tau(land) - tau(land - 1), 0.5) : (o.spb ?? 0.5);
  const meter = score.song?.meter ?? 4, most = Math.floor(30 / spb / meter) * meter;
  return { ...o, id: 'coin', land, beats: Math.min(most, o.beats ?? 15 * meter), tau, spb, meter };
}

// How much of the song's own pushing about (the chord lenses above all) a coin can have on it, 0..1. It's a wobble on one pattern if anything else is moving the lines, and the landing
// has to be seen to be flat. Eases out over the first bars of the coin, and back from a bar after the landing. For song-sheet.js: lens strengths times this, the rest by ambient.
export function coinAmbient(G, t) {
  const m = G?.moves?.find(x => x.id === 'coin');
  if (!m) return 1;
  const x = beatsLeft(m, t), bar = m.meter ?? 4, f = Math.min(4 * bar, m.beats / 3);
  return x > 0 ? smoother((x - (m.beats - f)) / f) : smoother((-x - bar) / (2 * bar));
}

// And the flow to go with it, as a gesture's phiTrack: what's on the coin slows to a stop for the last bars, so only the lean is moving, and it's let go on the landing and pours.
// A track in beats, as phi reads it. rate, after: cycles per beat before and after. hold: bars at a standstill.
export function coinFlow(score, m, { rate = 1 / 8, after = 1 / 4, hold = 2, slow = 2 } = {}) {
  const b = m.tau ? m.tau(m.land) : 0, bar = m.meter ?? 4, a0 = b - m.beats - 8, a1 = b - (hold + slow) * bar, a2 = b - hold * bar;
  const x1 = rate * (a1 - a0), x2 = x1 + rate * slow * bar / 2;
  return [{ t: a0, x: 0, v: rate }, { t: a1, x: x1, v: rate }, { t: a2, x: x2, v: 0 }, { t: b, x: x2, v: 0 }, { t: b + bar, x: x2 + after * bar / 2, v: after }];
}

// The whole of a coin, for the director. It wears `pattern` from before the build through the landing, up to the first boundary with room to land first; it ends with that boundary's
// morph, and what comes before it now morphs into it where it starts. Returns the new gesture, or null if the film has no room for it. beats: how long the build is, 30 s at most.
export function spliceCoin(score, land, pattern, o = {}) {
  if (!flag('coin')) return null;
  const g = score.gestures, m = coinMove(score, land, o), bar = m.meter * m.spb, start = land - m.beats * m.spb;
  let i = g.findIndex(x => x.t1 > start);
  if (i >= 0 && start - g[i].t0 < 14) i--;      // too little would be left of that one: the one before runs on to the coin instead
  let j = g.findIndex(x => x.t1 >= land);
  while (j >= 0 && j < g.length && g[j].t1 - (g[j].morph || 0) < land + 2 * bar) j++;     // the next transformation starts after the landing has had two bars to itself
  if (i < 0 || j < 0 || j >= g.length - 1 || start <= g[i].t0) return null;
  const P = g[i], E = g[j];
  const H = { t0: start, t1: E.t1, arcEnd: land, pattern, morph: E.morph, moves: [m], phiTrack: coinFlow(score, m, o.flow), gears: [],
    melMode: 0, fixedRange: true, range: [0, 1], kindIn: 'rise', kindOut: E.kindOut, label: E.label, visit: E.visit, replayOf: null, change: null, ...(E.xform ? { xform: E.xform } : {}) };
  P.t1 = P.arcEnd = start;       // it may run on a little: its long move stretches to fit, before anyone has seen it
  P.morph = Math.min(P.morph || 7, Math.max(7, (start - P.t0) * 0.5));
  g.splice(i + 1, j - i, H);
  return H;
}

// One lean, written into a slot. w is on the screen: the lean is measured there, however the pattern's own long move has turned it. As vectors, so a slide reading them goes straight across.
function lean(out, OFF, k, screenW, apex, rib, ribLen, ribPh) {
  const w = screenW - out[OFF.rot], c = Math.cos(w), sn = Math.sin(w), s = k * apex;
  out[OFF['lathe.k']] = k * c;
  out[OFF['lathe.w']] = k * sn;
  out[OFF.tx] += s * c;
  out[OFF.ty] += s * sn;
  const r = Math.min(rib, 0.82 / k - 1);
  if (r > 0) {
    out[OFF['spare.a']] = TAU / ribLen;
    out[OFF['spare.b']] = r * Math.cos(ribPh);
    out[OFF['spare.c']] = r * Math.sin(ribPh);
  }
}

// Picked by hand, a body with no coin on it goes round for ever at an easy lean, on the clock, so it can be looked at. A pattern's drive. Films don't pool these, or it's a wobble on one pattern.
export function freeCoin(out, { u, phi, OFF, G }) {
  if (G.moves || !flag('coin')) return;
  const k = (G.pattern.lean ?? LEAN) * 0.8 * smoother(u / 0.25);
  if (k > 0.002) lean(out, OFF, k, TAU * phi + Math.PI / 2, APEX, RIB * 0.7, RIB_LEN, TAU * 4 * phi);
}

export default {
  id: 'coin',
  // Anything flat that isn't on the move in depth. A surface has a geometry of its own, and a coin on it only looks like a mistake.
  needs(slot) {
    return slot[OFFS['surf.kind']] < 0.5 && slot[OFFS['matte.kind']] < 0.5 && slot[OFFS['ribbon.on']] < 0.5 && slot[OFFS['blobs.on']] < 0.5;
  },
  write(out, { t, OFF, G, m }) {
    const x = beatsLeft(m, t);
    if (x >= m.beats) return;
    if (x <= 0) {
      // Landed. Nothing has moved for a moment, and now it starts to travel again.
      const a = m.after ?? AFTER, spb = m.spb ?? 0.5, sec = -x * spb, T = 2 * (m.meter ?? 4) * spb, q = sec / T;
      if (a) out[OFF.scale] *= Math.exp(a * (q >= 1 ? sec - T / 2 : T * q * q * q * q * (q * q - 3 * q + 2.5)));
      return;
    }
    const k = leanAt(m, x, m.a0 ?? G.pattern.lean ?? LEAN);
    if (k <= 0) return;
    const gap = (m.meter ?? 4) % 3 === 0 ? m.meter : 2;     // beats from one strong beat to the next
    lean(out, OFF, k, turnAt(m, x), m.apex ?? APEX, m.rib ?? RIB, m.ribLen ?? RIB_LEN, -TAU * x / gap);
  },
};
