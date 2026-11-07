// Afterspin. Once a song, a dartboard's rings turn steadily through a loud stretch, every other ring the other way, each slipping against the next, for 20 s or more with the camera
// still. Then the band stops, or falls away into a quiet bar: the rings come to rest exactly in line, and the picture holds perfectly still, the plain board, while it goes on wringing the
// other way in your eyes. When it starts again the rings go the way your eyes were already seeing them go.
//
// The rings are the film's own slip (src/gl/chunks/moves.js): the board is cut into bands at its own ring edges and each band's spokes slide round by a whole isometry, so no line thins,
// and a whole number of cycles is no change at all. The eight nearest bands each read their own number, so they can go opposite ways. Past the eighth (only the corners, at this size) it's whole.
//
// The stop: on a real rest the film's own clock freezes (src/score/time.js), and the rings run on that clock, so they freeze with it. Where there's no rest it's a still of 2 to 4 s on the
// biggest fall, in a quiet bar, kept in the spin's own clock: nothing else on this gesture moves (no flow, no long move, no camera), so nothing has to be paid back after.
// Either way the song's layer is let go over the bar before it and taken up over the bar after it (src/worlds/retina/direct.js, quietOf and dress), so the still frame is the plain sheet. Through the spin it keeps a quarter of it.
import { OFF } from '../../pattern/layout.js';
import { MOVES } from '../../score/moves/index.js';
import { momentsOf } from '../../score/hear.js';
import { carve } from './carve.js';

export const SPIN = 0.35;      // cycles a second each band turns: with twelve spokes, 10 degrees a second, so a spoke at the rim passes a place well under twice a second
const BOARD = 'dials.board', SIZE = 1.3, BANDS = 8, LEAD = 24, POST_BARS = 6, MORPH = 6, CALM = 0.5, QUIET = 0.25;      // QUIET: how much of the song's layer the spin keeps, so the rings' turning is what reads
const TABLE = ['slip.left', 'slip.step', 'slip.ease', 'slip.seed', 'spare.a', 'spare.b', 'spare.c', 'spare.d'].map(k => OFF[k]);
const [KIND, N, U, ANG] = ['slip.kind', 'slip.n', 'slip.u', 'slip.ang'].map(k => OFF[k]), MS = [0, 1, 2, 3].map(i => OFF[`slip.m${i}`]);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const I5 = u => u * u * u * u * (u * (u - 3) + 2.5);      // the integral of smoother from 0 to u

// How far the bands have turned at picture time p, in cycles of the spokes. Picks up over E, steady at v, comes to rest over E exactly on a whole number at Ps, holds for Dp, then the other way.
export function spinAt(m, p) {
  const { p0, Ps, Dp, v, E, n } = m;
  if (p <= p0) return 0;
  if (p < p0 + E) return v * E * I5((p - p0) / E);
  if (p < Ps - E) return v * E / 2 + v * (p - p0 - E);
  if (p < Ps) { const u = (p - Ps + E) / E; return v * E / 2 + v * (Ps - p0 - 2 * E) + v * E * (u - I5(u)); }
  const r = Ps + Dp;
  if (p <= r) return n;
  if (p < r + E) return n - v * E * I5((p - r) / E);
  return n - v * E / 2 - v * (p - r - E);
}

MOVES['retina.spin'] = {
  id: 'retina.spin', needs: () => true,
  write(out, { t, m }) {
    const s = spinAt(m, t);
    // A whole number of steps is the plain board, so it's drawn as the plain board, by the same path: a whole number of cycles added in floating point is a few edge pixels out
    if (Number.isInteger(s)) { out[KIND] = 0; return; }
    out[KIND] = 2; out[N] = m.bandsPer; out[U] = 0; out[ANG] = 0;
    MS.forEach((o, i) => { out[o] = i === m.fam ? 1 : 0; });
    for (let k = 0; k < BANDS; k++) out[TABLE[k]] = (k % 2 ? -1 : 1) * s;
  },
};

// Where the spin could go, best first: a stop it can run into, with a loud stretch before it and the bar after it quieter. Nothing's changed yet.
export function spinCandidates(score, A, M) {
  const bar = M.bar, dur = A.duration, time = score.time ?? (t => t);
  const E = A.E ?? A.loud ?? [], fps = A.fps, at = t => E[clamp(Math.round(t * fps), 0, E.length - 1)] || 0;
  const mean = (a, b) => { let s = 0, n = 0; for (let t = a; t < b; t += 0.25) { s += at(t); n++; } return n ? s / n : 0; };
  const all = Array.from(E).filter((_, i) => i % 8 === 0).sort((x, y) => x - y), q = f => all[Math.floor((all.length - 1) * f)] ?? 0, span = Math.max(q(0.9) - q(0.1), 0.02);
  const stops = [];
  for (const r of M.rests ?? []) if (r.b - r.a >= 0.5) stops.push({ S: time(r.a), Dp: 0, real: true, a: r.a, b: r.b, s: 1.2, why: `the band stops at ${r.a.toFixed(2)} s for ${(r.b - r.a).toFixed(2)} s` });
  const D = clamp(2 * bar, 2, 4);
  for (const m of momentsOf(A, M)) if (m.kind === 'falls' && m.s >= 0.4) stops.push({ S: m.t, Dp: D, real: false, a: m.t, b: m.t + D, s: m.s, why: `the fall at ${m.t.toFixed(2)} s (${m.s.toFixed(2)})` });
  const lead = Math.round(LEAD / bar) * bar, post = Math.max(POST_BARS * bar, 10);
  for (const c of stops) {
    c.before = (mean(c.a - lead, c.a - bar) - q(0.1)) / span; c.after = (mean(c.a, c.a + bar) - q(0.1)) / span;
    c.score = c.s + (c.before - c.after) + (c.before > 0.5 ? 0.3 : 0);
    c.p0 = c.S - lead; c.end = c.S + c.Dp + post + MORPH; c.post = post;
    c.from = c.p0; c.to = c.end;
    c.fits = c.p0 >= 16 && c.end <= dur - 8 && c.before > c.after + 0.15 && c.before >= 0.35;
  }
  return stops.sort((x, y) => y.score - x.score);
}

export function putSpin(score, A, M, plan, c) {
  const g = score.gestures, bar = M.bar, board = (score.library ?? score.patterns ?? []).find(p => p.id === BOARD);
  if (!board || !score.remake) { plan.notes.push('no afterspin: no board'); return null; }
  const k = g.filter(G => G.k != null).sort((u, v) => Math.abs(u.t0 - c.p0) - Math.abs(v.t0 - c.p0))[0]?.k, X = score.remake({ k, t0: c.p0, t1: c.end }, board);
  X.t0 = c.p0; X.t1 = c.end; X.arcEnd = c.end; X.morph = MORPH;
  X.arcs = [{ path: 'scale', from: SIZE, to: SIZE, log: true }, { path: 'rot', from: 0, to: 0 }];
  X.flow = { 'f0.ph': 0, 'f1.ph': 0 };      // nothing flows, breathes or travels: the rings' turning is all that moves. fixedRange: the rehearsal keeps what it's given, and doesn't add a zoom and a turn to something that stands still on purpose
  X.range = [0, 1]; X.fixedRange = true; delete X.thetaBody;
  const Ein = Math.min(2 * bar, 4), turns = Math.max(1, Math.round(SPIN * (c.S - c.p0 - Ein)));
  X.moves = [{ id: 'retina.spin', p0: c.p0, Ps: c.S, Dp: c.Dp, E: Ein, n: turns, v: turns / (c.S - c.p0 - Ein), fam: 1, bandsPer: board.slip?.n ?? 4.4 }];
  if (!carve(score, c.p0, c.end, X)) { plan.notes.push(`no afterspin into ${c.why}: no room`); return null; }
  X.hero = 'retina'; X.retina = { kind: 'spin' };
  X.calm = CALM; X.calmWin = [c.p0, c.end];
  plan.spin = { p0: c.p0, S: c.S, Dp: c.Dp, real: c.real, a: c.a, b: c.b, end: c.end, E: Ein, turns, v: +X.moves[0].v.toFixed(3), quiet: QUIET, post: c.post,
    why: `${c.why}: ${(c.S - c.p0).toFixed(1)} s of rings turning before it (loud ${c.before.toFixed(2)}, the bar after ${c.after.toFixed(2)}), ${c.real ? 'the film freezes with the band' : `a still of ${c.Dp.toFixed(2)} s`}, ${turns} whole spoke steps (each band turns 30 degrees a step), then the other way` };
  return plan.spin;
}
