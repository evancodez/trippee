// Retina's director. The film's own direction first, all of it (src/score/direct.js), so between its big moments Retina is the black-and-white film. Then its own two things, which make room
// for themselves: one or two Afterimage Drops (drops.js) and one Afterspin (afterspin.js). What it decided and why is in score.retina.notes.
import { direct as filmDirect } from '../../score/direct.js';
import { OFF, SLOT_FLOATS, FRAME } from '../../pattern/layout.js';
import { smoother } from '../../score/curves.js';
import { dropCandidates, putDrop, MOST, APART } from './drops.js';
import { spinCandidates, putSpin } from './afterspin.js';

const CHORD_APART = 1.6;      // seconds: a fringe swap's front takes about one, and two can't run over each other
const I5 = u => u * u * u * u * (u * (u - 3) + 2.5);

export function direct(score, A, M) {
  score = filmDirect(score, A, M);
  if (!score?.tau || !M || M.neutral || !score.remake || score.gestures.length < 6) return score;
  const plan = score.retina = { drops: [], spin: null, notes: [], chords: [] };
  choose(score, A, M, plan);
  plan.chords = chordsOf(M, score.time);
  // Nothing moves in the still, the fringe included
  if (plan.spin) { const s = plan.spin; plan.chords = plan.chords.filter(t => t < s.S - s.E - 1 || t > s.S + s.Dp + 0.5); }
  // While the layer that follows the song is down, what the song does to the sheet goes by score.ambient, on the picture's clock: it lets go for the still.
  if (plan.spin) { const was = score.ambient, q = quietOf(plan.spin); score.ambient = t => (was ? was(t) : 1) * q.reduce((k, w) => Math.min(k, w.f(t)), 1); }
  for (const d of plan.drops) plan.notes.push(`drop: ${d.why}`);
  if (plan.spin) plan.notes.push(`afterspin: ${plan.spin.why}`);
  return score;
}

// The drops and the spin, chosen together before anything's changed: one of each matters more than two drops, and two drops more than one. Then the best of those.
function choose(score, A, M, plan) {
  const drops = dropCandidates(score, A, M).slice(0, 8), spins = spinCandidates(score, A, M), fit = spins.filter(c => c.fits).slice(0, 4);
  const apart = (x, y) => x.to <= y.from || y.to <= x.from;
  let best = { v: -1, spin: null, drops: [] };
  for (const sp of [null, ...fit]) {
    const free = drops.filter(d => !sp || apart(d, sp));
    const sets = [[]];
    for (let i = 0; i < free.length; i++) { sets.push([free[i]]); for (let j = i + 1; j < free.length; j++) if (Math.abs(free[i].H - free[j].H) >= APART) sets.push([free[i], free[j]]); }
    for (const ds of sets) {
      if (ds.length > MOST) continue;
      const v = (sp ? 3 + 0.3 * sp.score : 0) + 2 * ds.length + ds.reduce((n, d) => n + d.s, 0);
      if (v > best.v) best = { v, spin: sp, drops: ds };
    }
  }
  // Latest first, so each one's room is made where the film is still as composed
  const all = [...best.drops.map(c => ({ c, put: () => putDrop(score, A, M, plan, c) })), ...(best.spin ? [{ c: best.spin, put: () => putSpin(score, A, M, plan, best.spin) }] : [])].sort((x, y) => y.c.from - x.c.from);
  for (const x of all) x.put();
  if (!plan.drops.length) plan.notes.push(`no drop: ${drops.length ? 'none that fits' : 'nothing landed on a big enough arrival'}`);
  if (!plan.spin) plan.notes.push(`no afterspin: ${spins.length ? `of ${spins.length} stops ${fit.length} had a loud stretch before them and room (${spins.map(c => `${c.S.toFixed(1)}: loud ${c.before.toFixed(2)}, after ${c.after.toFixed(2)}${c.fits ? '' : ', no'}`).join('; ')})` : 'no stop in the song'}`);
}

// Where the chords change, on the picture's clock, never closer than CHORD_APART.
function chordsOf(M, time = t => t) {
  const out = [];
  for (const r of (M.runs ?? []).slice(1)) { const t = time(r.t0); if (!out.length || t - out.at(-1) >= CHORD_APART) out.push(t); }
  return out;
}

// 1, letting go to `to` over E before a, `to` from a to b, and taking up again over E after b.
export const dipOf = (a, b, E, to = 0) => x => 1 - (1 - to) * smoother((x - a + E) / E) * smoother((b + E - x) / E);
// The spin keeps less of the song's layer while it turns, so the rings' turning is what reads, and none of it for the still: the still frame is the plain sheet.
function quietOf(s) {
  const w = [{ a: s.p0 + 1, b: s.S + s.Dp + s.post, E: 2, to: s.quiet }, { a: s.S, b: s.S + s.Dp, E: s.E, to: 0 }];
  for (const x of w) x.f = dipOf(x.a, x.b, x.E, x.to);
  return w;
}

// ---------------------------------------------------------------- after the camera's on (compose calls this last)
// A hear table that keeps the mode's own dips through the rehearsal's: it fills itself back with 1 when what it found has changed, and then these go back in.
class KeptEase extends Float32Array {
  fill(v, ...r) { super.fill(v, ...r); for (const f of this.kept ?? []) f(this); return this; }
}
function keepDip(H, a, b, E, to = 0) {
  if (!(H.ease instanceof KeptEase)) { const e = new KeptEase(H.n); e.kept = []; e.fill(1); if (H.ease) for (let i = 0; i < H.n; i++) e[i] = Math.min(e[i], H.ease[i]); H.ease = e; }
  const dip = dipOf(a, b, E, to), put = arr => { for (let i = Math.max(0, Math.floor((a - E) * H.hz)), n = Math.min(H.n - 1, Math.ceil((b + E) * H.hz)); i <= n; i++) arr[i] = Math.min(arr[i], dip(i / H.hz)); };
  H.ease.kept.push(put); put(H.ease);
}

// The build's camera: what the film's camera was doing lets go over a second and a half, and from then on it's only a push in about the middle, steady, with no pan, turn, whip or tip.
const SWITCH = new Set(['surf.kind', 'surf.map', 'q.zw'].map(k => OFF[k])), SCALE = OFF.scale, held = new Float32Array(SLOT_FLOATS);
function dressDrop(G, d) {
  const orig = G.cam, E = 1.5, a0 = d.a - E;
  const push = t => { const x = t - a0; return x <= 0 ? 0 : d.push * (x < E ? E * I5(x / E) : E / 2 + x - E); };
  G.cam = (out, t, GG) => {
    const w = smoother((t - a0) / E);
    if (w <= 0) { orig?.(out, t, GG); return; }
    held.set(out);
    orig?.(out, t, GG);
    if (w >= 1) out.set(held);
    else for (let i = 0; i < out.length; i++) {
      if (out[i] === held[i] || SWITCH.has(i)) continue;
      out[i] = i === SCALE && held[i] > 0 && out[i] > 0 ? held[i] * Math.pow(out[i] / held[i], 1 - w) : out[i] + (held[i] - out[i]) * w;
    }
    out[SCALE] *= Math.exp(push(t));
  };
}
const still = () => {};

export function dress(film, A, M) {
  const plan = film.retina;
  if (!plan) return;
  for (const d of plan.drops) { const G = film.gestures.find(x => x.retina?.kind === 'drop' && x.retina.H === d.H); if (G) dressDrop(G, d); }
  // The spin's camera holds still: the rings turning are all that moves. A function, so frame() doesn't put the film's camera back on it.
  for (const G of film.gestures) if (G.retina?.kind === 'spin') G.cam = still;
  // With the layer that follows the song up, all of what the song does goes through its ease table, on the song's own seconds and, in the song sheet, the song's tables' clock.
  const s = plan.spin, H = film.hear;
  if (s && H?.n) {
    for (const w of quietOf(s)) if (w.to > 0) keepDip(H, w.a, w.b, w.E, w.to);
    keepDip(H, s.real ? s.a : s.S, s.real ? s.b : s.S + s.Dp, s.E);
    const C = M?.C ?? (t => t), ca = C(s.real ? s.a : s.S), cb = C(s.real ? s.b : s.S + s.Dp);
    if (Math.abs(ca - (s.real ? s.a : s.S)) > 0.01 || s.real) keepDip(H, ca - 0.2, Math.max(cb, ca) + 0.2, s.E);
  }
}

// How much of the song's sway, turn and lift the frame keeps: a drop's build and the spin are a push in and a still camera. 1 everywhere else.
export function swayAt(plan, t) {
  let k = 1;
  for (const d of plan?.drops ?? []) if (t > d.a - 2 && t < d.H + 1) k = Math.min(k, 1 - 0.85 * smoother((t - d.a + 2) / 1.5) * smoother((d.H + 1 - t) / 1));
  const s = plan?.spin;
  if (s && t > s.p0 - 1 && t < s.end) k = Math.min(k, 1 - 0.7 * smoother((t - s.p0 + 1) / 2) * smoother((s.end - t) / 2));
  return k;
}
export const HEAR = FRAME.hear * 4;
