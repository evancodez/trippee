// The Afterimage Drop. For the 16 to 24 seconds before one of the song's biggest arrivals the film prints in two inks, in zones that hold still on the screen while the lines go on travelling.
// The colour runs out from the middle to the rim in the last 0.8 s before the hit and is gone exactly on it, and the chorus lands in black and white. What the eye was looking at answers in
// its opposite over the black and white for a few seconds after. Black and white holds at least 6.5 s, and the fringe comes back over four bars.
//
// Where: on the builds into the biggest arrivals (the film's own landings and Countdowns that fall on them), at most twice, 90 s apart, only on round radial sheets, with the camera dressed to a
// pure push in about the middle and the song's beat push calmed under it and for a second after.
import { OFF, FAMILIES } from '../../pattern/layout.js';
import { base } from '../../score/slot.js';
import { smoother } from '../../score/curves.js';
import { momentsOf } from '../../score/hear.js';
import { MOVES } from '../../score/moves/index.js';
import { RUNGS, rungFor } from './inks.js';
import { carve } from './carve.js';

export const ARRIVE = 4, LEAVE = 0.8, HOLD = 6.5, BACK_BARS = 4, APART = 90, MOST = 2, CALM = 0.15;
const BUILD = [16, 24], WANT = 20, OPENING = 13, ENDING = 16, LEAST = 0.9;
const TARGET = 'dials.target';      // what a build that isn't round already goes on: a log target, the same at every size, so it can push in for as long as it likes

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

// Round and radial: every open family about one pole near the middle, nothing straight across, flat, no fold or matte.
export function radial(p) {
  const S = base(p), n = k => S[OFF[k]];
  if (n('surf.kind') > 0.5 || n('matte.kind') > 0.5 || n('fold.n') >= 2 || n('ribbon.on') > 0.5 || n('blobs.on') > 0.5) return false;
  if (Math.hypot(n('p1.x'), n('p1.y')) > 0.3) return false;
  let round = false;
  for (let i = 0; i < FAMILIES; i++) {
    if (n(`f${i}.on`) < 0.5 || Math.abs(n(`f${i}.d`)) > 0.97) continue;
    const g = k => Math.abs(n(`f${i}.${k}`));
    if (g('x') + g('y') > 1e-4 || g('r2') + g('l2') + g('t2') > 1e-4) return false;
    if (g('r1') + g('l1') > 1e-4) round = true;
  }
  return round;
}
// The same at every size: log rings and spokes and nothing else, so a push in can go on for ever and nothing grows at the camera.
export function selfSame(p) {
  const S = base(p), n = k => S[OFF[k]];
  for (let i = 0; i < FAMILIES; i++) if (n(`f${i}.on`) >= 0.5 && Math.abs(n(`f${i}.d`)) <= 0.97 && Math.abs(n(`f${i}.r1`)) > 1e-4) return false;
  return radial(p);
}

// How much the song builds into a landing at L, as src/score/woah.js reads it: the rise in energy over 6 to 16 bars, never dipping far on the way. 0..1.
function buildInto(A, M, L) {
  const bar = M.bar, fps = A.fps, E = A.E ?? A.loud ?? [];
  const at = t => E[clamp(Math.round(t * fps), 0, E.length - 1)] || 0;
  const mean = (a, b) => { let s = 0, n = 0; for (let t = a; t < b; t += 0.25) { s += at(t); n++; } return n ? s / n : 0; };
  const all = Array.from(E).filter((_, i) => i % 8 === 0).sort((x, y) => x - y), span = Math.max((all[Math.floor(all.length * 0.9)] ?? 1) - (all[Math.floor(all.length * 0.1)] ?? 0), 0.02);
  let best = 0;
  for (let n = 6; n <= 16; n += 2) {
    const len = n * bar;
    if (L - len < 4) break;
    const rise = (mean(L, L + 2 * bar) - mean(L - len - 2 * bar, L - len)) / span, mid = mean(L - 0.6 * len, L - 0.4 * len), start = mean(L - len - bar, L - len + bar);
    if (rise > best && mid >= start - 0.1 * span) best = rise;
  }
  return clamp(best / 0.7);
}

// Nothing of its own happens on the build: a dial left alone comes apart and locks over and over (src/score/moves/slip.js idle), and this says something's on.
MOVES['retina.hold'] = { id: 'retina.hold', needs: () => true, write() {} };

// Where the drops could go, best first: the song's biggest moments, each on the film's own hit nearest it. Nothing's changed yet.
export function dropCandidates(score, A, M) {
  const g = score.gestures, bar = M.bar, dur = A.duration;
  const moments = momentsOf(A, M), arrivals = M.arrivals?.(0.2) ?? [];
  const nearest = (list, t, w) => Math.max(0, ...list.filter(x => Math.abs(x.t - t) <= w).map(x => x.v));
  const jumps = moments.filter(m => m.kind === 'jump').map(m => ({ t: m.t, v: m.s })), arr = arrivals.map(x => ({ t: x.t, v: x.a }));
  // The film's own hits: where it lands, and where a Countdown's last ring falls
  const hits = [];
  for (let i = 1; i + 2 < g.length; i++) if (g[i].morph) hits.push({ H: g[i].peak?.hit ?? g[i].t1, G: g[i], via: 'landing' });
  for (const h of score.cast ?? []) if (h.kind === 'countdown') { const G = g.find(x => x.hero === 'countdown' && h.at > x.t0 && h.at < x.t1); if (G) hits.push({ H: h.at, G, via: 'countdown' }); }
  // The song's big moments, each on the film's hit nearest it within a bar and a half, or on itself where the film doesn't land near it: then the colour runs out mid-gesture
  const L = clamp(Math.round(WANT / bar) * bar, BUILD[0], BUILD[1]), cands = [];
  for (const m of [...arr.filter(x => x.v >= 0.3), ...jumps.filter(x => x.v >= 0.5)]) {
    const h = hits.filter(x => Math.abs(x.H - m.t) <= 1.5 * bar).sort((x, y) => Math.abs(x.H - m.t) - Math.abs(y.H - m.t))[0];
    const G = h?.G ?? g.find(x => x.t0 < m.t && x.t1 > m.t);
    if (!G || G === g[0] || G === g.at(-1)) continue;
    const c = { H: h?.H ?? m.t, G, via: h ? h.via : 'the music', at: m.t, L };
    c.arrival = nearest(arr, m.t, 0.6 * bar); c.jump = nearest(jumps, m.t, 0.6 * bar); c.build = buildInto(A, M, m.t);
    c.s = c.arrival + 0.8 * c.jump + 0.5 * c.build;
    c.from = c.H - L; c.to = c.H + HOLD + 2;      // what it needs to itself: the gesture before its build may be the spin, which then lands into it
    if (!cands.some(x => Math.abs(x.H - c.H) < 0.5 && x.s >= c.s)) cands.push(c);
  }
  return cands.filter(c => c.H - L >= OPENING + 4 && c.H <= dur - ENDING && c.s >= LEAST).sort((a, b) => b.s - a.s);
}

export function putDrop(score, A, M, plan, c) {
  const lib = id => (score.library ?? score.patterns ?? []).find(p => p.id === id);
  const d = put(score, c, c.L, lib, M.bar);
  if (!d) { plan.notes.push(`no drop at ${c.H.toFixed(2)} s: no room to make its build one round sheet`); return null; }
  d.rung = rungFor(A, M, d.H);
  d.why = `${c.via} at ${c.H.toFixed(2)} s, for the song's moment at ${c.at.toFixed(2)} s: arrival ${c.arrival.toFixed(2)}, jump ${c.jump.toFixed(2)}, build ${c.build.toFixed(2)} (score ${c.s.toFixed(2)}); `
    + `build ${d.L.toFixed(1)} s on ${d.on}${d.kept ? ' (the film\'s own, kept)' : ''}; inks ${d.rung.name} (minor ${d.rung.minor}, ${d.rung.bright ? 'bright' : 'dark'}), leaving ${RUNGS[d.rung.name].leaves}`;
  plan.drops.push(d);
  plan.drops.sort((a, b) => a.H - b.H);
  return d;
}

// One drop's build made a single round gesture from H - L up to its landing.
function put(score, c, L, lib, bar) {
  const g = score.gestures, H = c.H, a = H - L;
  let X = c.G, kept = true;
  // A round landing of the film's own is kept if nothing's timed on it. Anything else is made over on the target, with the landing it had.
  const busy = X.hero !== 'countdown' && (X.hero || X.moves?.length);
  if (c.via !== 'countdown' && (!radial(X.pattern) || busy)) {
    const p = lib(TARGET);
    // A hero the film's director made has no place in the composer's own list: it borrows the nearest that has
    const k = X.k ?? g.filter(x => x.k != null).sort((u, v) => Math.abs(u.t0 - X.t0) - Math.abs(v.t0 - X.t0))[0]?.k;
    if (!p || k == null) return null;
    const N = score.remake({ k, t0: X.t0, t1: X.t1 }, p);
    N.t0 = X.t0; N.t1 = X.t1; N.arcEnd = X.t1; N.morph = X.morph; if (X.peak) N.peak = { ...X.peak }; if (X.rise != null) N.rise = X.rise;
    N.arcs = []; N.moves = [{ id: 'retina.hold' }]; N.range = [0, 1]; N.fixedRange = true;      // the push is its move: the rehearsal isn't to add a turn of its own
    g[g.indexOf(X)] = N; X = N; kept = false;
  } else if (!X.moves?.length) X.moves = [{ id: 'retina.hold' }];
  if (X.t0 > a + 0.01 && !carve(score, a, X.t1, X)) return null;
  // A Countdown's long move keeps its own appointments, and has no turn before its hit. Anything else rides only its own size here: no turn, no slide. The push is the move.
  if (kept && X.hero !== 'countdown') { X.arcs = (X.arcs ?? X.pattern.arcs ?? []).filter(q => q.path === 'scale'); X.fixedRange = true; }
  const i = g.indexOf(X), N = g[i + 1];
  X.hero ??= 'retina';
  X.retina = { kind: 'drop', H };
  X.calm = CALM; X.calmWin = [a, H + 3];
  if (N && N.t0 <= H + 0.01) { N.calm = CALM; N.calmWin = [N.t0 - 3, H + 2]; }      // and a second after the hit: nothing swings back against that one brightening
  else if (N) { X.calmWin = [a, H + 2]; }
  const self = selfSame(X.pattern);
  return { H, a, L: H - a, arrive: ARRIVE, leave: LEAVE, hold: HOLD, back: BACK_BARS * bar, on: X.pattern.id, kept, push: self ? 0.22 : Math.log(1.3) / L, self };
}

// What a frame of the drops is: how far the inks have come and gone, which rung, and how much of the fringe there is.
export function dropsAt(plan, t) {
  let arrive = 0, leave = 0, rung = RUNGS.glow, fringe = 1;
  for (const d of plan?.drops ?? []) {
    if (t >= d.a && t < d.H) { arrive = clamp((t - d.a) / d.arrive); leave = clamp((t - (d.H - d.leave)) / d.leave); rung = RUNGS[d.rung.name]; }
    if (t >= d.a + d.arrive && t < d.H + d.hold) fringe = 0;
    else if (t >= d.H + d.hold && t < d.H + d.hold + d.back) fringe = Math.min(fringe, smoother((t - d.H - d.hold) / d.back));
  }
  return { arrive, leave, rung, fringe };
}
