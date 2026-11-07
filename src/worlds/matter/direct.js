// Matter's director. Who's on, where the sheet breaks, and how the dots divide to the song.
//
//   Dots divide on every stay they're on: once a bar in a verse, on the 1 and the 3 in a chorus, twice as often for the bar of a fill. In a rest they hold half-stretched, like a held breath.
//   A section edge swaps the diagonal they split along, and the way the view turns.
//   The sheet shatters on the one or two biggest arrivals, and heals on the next section's downbeat. That stay is one bold sheet from before the hit to after the lock, with nothing landing in it.
//   In between, the film's own ways from one pattern to the next, and on the bold sheets the film's riot moves.
import { OFF } from '../../pattern/layout.js';
import { reactAt } from '../../score/react.js';
import { evalTrack, smoother } from '../../score/curves.js';
import { hitsFor, apart } from '../../score/moves/surge.js';
import { rampTrack } from '../../score/moves/ramp.js';
import { base } from '../../score/slot.js';
import { W } from './divide.js';
import { layoutOf } from './shatter.js';

const SHARE = { cells: 0.4, sheet: 0.35, film: 0.25 };
const SHATTERS = 2, APART = 70, EDGE = [22, 26];       // at most this many, this many seconds apart, and not in the first or last seconds
const HEAL = [4, 18];        // bars from the hit to the downbeat it heals on: at least, at most
const HOLD_U = 0.37;         // where in a step a held breath holds: half-stretched
const SHORTEST = 0.85;       // seconds: no step quicker than this, even in a fill. Each is an eighth of a turn, and quicker than this the sheet spins
const rngOf = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 8) / 16777216; };
const groupOf = p => p.group ?? 'film';

// ---------------------------------------------------------------- who's on
export function cast(score, A, M) {
  const g = score.gestures, rand = rngOf(((score.seed | 0) * 7919 + (A.hash ? parseInt(String(A.hash).slice(0, 7), 16) : 3)) >>> 0);
  const P = score.patterns.filter(p => p.pool !== false), by = { cells: P.filter(p => groupOf(p) === 'cells'), sheet: P.filter(p => groupOf(p) === 'sheet'), film: P.filter(p => groupOf(p) === 'film') };
  const had = { cells: 0, sheet: 0, film: 0 }, seen = new Map();
  let last = null, total = 0;
  const pickFrom = group => {
    const pool = by[group].length ? by[group] : P, least = Math.min(...pool.map(p => seen.get(p) ?? -1));
    const fresh = pool.filter(p => (seen.get(p) ?? -1) === least && p !== last), from = fresh.length ? fresh : pool.filter(p => p !== last);
    return from[Math.floor(rand() * from.length)] ?? pool[0];
  };
  for (let i = 0; i < g.length; i++) {
    const G = g[i], len = G.t1 - G.t0;
    // Dots first, so the opening names the mode. Then whoever's furthest behind its share, and never the same group twice running.
    const group = i === 0 ? 'cells' : Object.keys(SHARE).filter(k => k !== groupOf(last ?? {})).sort((a, b) => (SHARE[b] - had[b] / Math.max(total, 1)) - (SHARE[a] - had[a] / Math.max(total, 1)))[0];
    const p = i === 0 ? by.cells[0] : pickFrom(group);
    last = p; seen.set(p, i); had[groupOf(p)] += len; total += len;
    put(score, g, i, p);
  }
}
// Who's on a gesture: the film's tail compose made by hand takes it as it is, and the rest are made again for it.
function put(score, g, i, p) {
  const G = g[i];
  if (G.pattern === p) return G;
  if (G.k == null) { G.pattern = p; G.arcs = p.arcs; delete G.flow; delete G.range; return G; }
  const N = score.remake(G, p);
  for (const k of ['t0', 't1', 'arcEnd', 'morph', 'xform', 'rise']) if (G[k] !== undefined) N[k] = G[k];
  g[i] = N;
  return N;
}

// ---------------------------------------------------------------- where it breaks
const segOf = (A, t) => A.segments?.find(s => t >= s.t0 && t < s.t1) ?? null;
export function placeShatters(score, A, M) {
  const g = score.gestures, time = score.time ?? (x => x), bar = M?.bar ?? 2, dur = A.duration ?? 0, out = [];
  const bars = Array.from(A.bars ?? M?.bars ?? []);
  const picked = [];
  for (const a of (M?.arrivals?.(0.25) ?? [])) {
    if (picked.length >= SHATTERS) break;
    if (a.t < EDGE[0] || a.t > dur - EDGE[1]) continue;
    if (picked.some(p => Math.abs(p.t - a.t) < APART)) continue;
    // It heals on the next section's downbeat, far enough on to hang a while and not so far it hangs for ever. With no section there, on the bar line eight bars on.
    const next = (A.segments ?? []).map(s => s.t0).filter(x => x >= a.t + HEAL[0] * bar - 0.1 && x <= a.t + HEAL[1] * bar).sort((x, y) => x - y)[0];
    let back = next ?? a.t + 8 * bar;
    const bi = bars.findIndex(b => b >= back - 0.25 * bar);
    if (bi >= 0 && Math.abs(bars[bi] - back) < 0.5 * bar) back = bars[bi];
    if (back > dur - 8) continue;
    picked.push({ t: a.t, back, a: a.a });
  }
  picked.sort((x, y) => x.t - y.t);
  const sheets = score.patterns.filter(p => p.pool !== false && groupOf(p) === 'sheet');
  let n = 0;
  for (const p of picked) {
    const hit = time(p.t), back = time(p.back);
    let i = g.findIndex(G => hit >= G.t0 && hit < G.t1);
    if (i < 0) continue;
    // Nothing lands in it. A landing on the hit itself becomes the shatter: what was on goes on, and breaks.
    if (i > 0 && hit - g[i].t0 < 2 * bar) { merge(g, i - 1); i--; }
    while (i + 1 < g.length && g[i].t1 - (g[i].morph || 0) < back + 2 * bar) merge(g, i);
    const G = g[i];
    if (G.t1 - (G.morph || 0) < back + bar || hit - G.t0 < bar) continue;      // the song ends first, or it can't be got into
    // A bold sheet, or the cracks have nothing to break.
    const H = groupOf(G.pattern) === 'sheet' ? G : put(score, g, i, sheets[n % sheets.length] ?? G.pattern);
    const s = reactAt(score.react, M?.C ? M.C(p.t) : p.t), cx = Math.max(-0.6, Math.min(0.6, 0.45 * (s?.px ?? 0))), cy = Math.max(-0.4, Math.min(0.4, 0.45 * (s?.py ?? 0)));
    H.shatter = { hit, back, bar, L: layoutOf(((score.seed | 0) * 31 + n * 977 + 13) >>> 0, cx, cy, score.aspect ?? 16 / 9), a: p.a, song: [p.t, p.back] };
    delete H.moves;
    H.calm = 0.15; H.calmWin = [hit - 2 * bar, back + 2 * bar];      // the song's beat weight and lung step back round it, so the lines it breaks are straight
    H.hero = 'matter';      // nothing runs on over it, and nothing's cast on it
    out.push(H.shatter);
    n++;
  }
  return out;
}
// Dots get long enough to divide a good few times: a stay of at least LONG bars before its way out, run on over whatever came next.
// Then no two stays of dots run together: the second becomes a sheet, or one of the library's, in turn.
const LONG = 7;
export function lengthen(score, M) {
  const g = score.gestures, bar = M?.bar ?? 2;
  for (let i = 0; i + 2 < g.length; i++) {
    const G = g[i];
    if (groupOf(G.pattern) !== 'cells' || G.shatter) continue;
    while (i + 2 < g.length && !g[i + 1].shatter && G.t1 - (G.morph || 0) - G.t0 < LONG * bar) merge(g, i);
  }
  const P = score.patterns.filter(p => p.pool !== false), other = [...P.filter(p => groupOf(p) === 'sheet'), ...P.filter(p => groupOf(p) === 'film')];
  let n = 0;
  for (let i = 1; i < g.length; i++) if (groupOf(g[i].pattern) === 'cells' && groupOf(g[i - 1].pattern) === 'cells' && !g[i].shatter) {
    const last = g[i - 1].pattern, next = g[i + 1]?.pattern;
    const p = other.filter(q => q !== next && q !== last)[(n++ * 2) % Math.max(1, other.length - 2)] ?? other[0];
    if (p) put(score, g, i, p);
  }
}
// The gesture at i runs on through the next: one fewer landing.
function merge(g, i) {
  const G = g[i], N = g[i + 1];
  if (!N) return;
  G.t1 = N.t1; G.arcEnd = Math.max(G.arcEnd ?? G.t1, N.t1 - (N.morph || 0)); G.morph = N.morph; G.xform = N.xform; delete G.range;
  g.splice(i + 1, 1);
}

// ---------------------------------------------------------------- how the dots divide
function loudness(score, A, M) {
  const segs = A.segments?.length ? A.segments : [{ t0: 0, t1: A.duration ?? 0 }];
  const mean = segs.map(s => { let e = 0, n = 0; for (let t = s.t0; t < s.t1; t += 0.5) { try { e += reactAt(score.react, M?.C ? M.C(t) : t).energy; n++; } catch { /* past the end */ } } return n ? e / n : 0; });
  const sorted = [...mean].sort((a, b) => a - b), top = sorted[Math.floor(sorted.length * 0.6)] ?? 1;
  return t => { const i = segs.findIndex(s => t >= s.t0 && t < s.t1); return i >= 0 && mean[i] >= top; };
}
// The bars a drummer fills: the last before a section, as busy again as the bars before it.
function fillsOf(A) {
  const bars = Array.from(A.bars ?? []), on = A.onset, fps = A.fps, set = new Set();
  if (!on || !fps || bars.length < 10) return set;
  const busy = bars.slice(0, -1).map((b, i) => { let s = 0; for (let f = Math.floor(b * fps); f < Math.floor(bars[i + 1] * fps) && f < on.length; f++) s += on[f]; return s / Math.max(1, (bars[i + 1] - b) * fps); });
  for (const sg of (A.segments ?? []).slice(1)) {
    const i = bars.findIndex(b => b >= sg.t0 - 0.1) - 1;
    if (i < 4 || i >= busy.length) continue;
    const before = busy.slice(Math.max(0, i - 8), i).sort((a, b) => a - b), med = before[before.length >> 1];
    if (busy[i] >= 1.3 * med) set.add(i);
  }
  return set;
}

export function divisions(score, A, M) {
  const g = score.gestures, time = score.time ?? (x => x), bar = M?.bar ?? 2;
  const songBars = Array.from(A.bars ?? []), loud = loudness(score, A, M), fills = fillsOf(A);      // bars are the song's seconds, hits the picture's
  const rests = (M?.rests ?? []).map(r => [time(r.a), time(r.b)]);
  const beats = hitsFor('beat', { score, A }), halves = hitsFor('half', { score, A });
  let n = 0;
  for (const G of g) {
    if (groupOf(G.pattern) !== 'cells') continue;
    const from = G.t0 + Math.max(0.6, 0.5 * bar), to = G.t1 - (G.morph || 0) - 0.6 * bar;
    let hits = [];
    songBars.forEach((b, i) => {
      const t = time(b), e = i + 1 < songBars.length ? time(songBars[i + 1]) : t + bar;
      if (t < from || t > to) return;
      const rate = (loud(b) ? 2 : 1) * (fills.has(i) ? 2 : 1);
      if (rate === 1) hits.push(t);
      else if (rate === 2) hits.push(t, ...halves.filter(h => h > t + 0.2 * bar && h < e - 0.1 * bar && h <= to));
      else hits.push(t, ...beats.filter(h => h > t + 0.1 && h < e - 0.1 && h <= to));
    });
    hits = apart(hits.sort((a, b) => a - b));
    const kept = [];
    for (const h of hits) if (!kept.length || h - kept[kept.length - 1] >= SHORTEST) kept.push(h);
    hits = kept.filter(h => !rests.some(([a, b]) => h > a - 0.1 && h < b + 0.1));
    if (hits.length < 2) continue;
    G.mitosis = clockFor(G, hits, rests, bar);
    G.mitosis.sigma0 = n++ % 2 ? -1 : 1;
    // A section edge swaps the diagonal, on the first whole step after it.
    G.mitosis.flips = (A.segments ?? []).slice(1).map(s => time(s.t0)).filter(t => t > hits[0] && t < hits[hits.length - 1]).map(t => Math.floor(evalTrack(G.mitosis.knots, t)) + 1);
    // The division is the beat: the song's own rings of weight step back while it's on, and the tune and the chords stay.
    G.calm = 0.12;
    G.hero = 'matter';
  }
}
// s, whole between steps and k + W on the kth hit. It starts from rest on a whole number and ends at rest on one, and where the beat goes away it holds half-stretched.
function clockFor(G, hits, rests, bar) {
  const n = hits.length, gaps = hits.slice(1).map((h, i) => h - hits[i]), med = [...gaps].sort((a, b) => a - b)[gaps.length >> 1];
  const across = (a, b) => Math.min(Math.max(a, b), 2 * Math.min(a, b));
  const knots = [{ t: hits[0] - Math.min(1.6 * gaps[0], Math.max(0.6, hits[0] - G.t0 + 0.4)), x: 0, v: 0 }];
  let x = W;
  for (let i = 0; i < n; i++) {
    const before = i ? gaps[i - 1] : gaps[0], after = i < n - 1 ? gaps[i] : gaps[n - 2], held = g => g > 2.2 * med;
    const v = across(1 / (held(before) ? med : before), 1 / (held(after) ? med : after));
    knots.push({ t: hits[i], x, v });
    if (i < n - 1 && held(gaps[i])) {
      // A held breath: on through this step and into the next stretch, half way, and wait there.
      knots.push({ t: hits[i] + 1.1 * med, x: x + 1 - W + HOLD_U, v: 0 }, { t: hits[i + 1] - 0.9 * med, x: x + 1 - W + HOLD_U, v: 0 });
    }
    x += 1;
  }
  knots.push({ t: hits[n - 1] + (1 - W) * 1.7 * gaps[n - 2], x: x - W, v: 0 });
  return { knots, hits, flips: [], sigma0: 1 };
}

// ---------------------------------------------------------------- what the bold sheets do between
export function moves(score, A, M) {
  const g = score.gestures, bar = M?.bar ?? 2, rotation = ['wring', 'bellows'];      // not the ramp: its long move all at once on the hit is a zoom too fast for a mode's limit
  let at = 0;
  const fits = (id, G) => {
    const p = G.pattern, S = base(p), fams = p.g.fams?.length ?? 1;
    if (id === 'wring') return S[OFF['surf.kind']] < 0.5 && S[OFF['swirl.a']] === 0;
    if (id === 'bellows') return fams >= 2 && !S[OFF.round];
    return id === 'ramp';
  };
  for (let i = 1; i + 1 < g.length; i++) {
    const G = g[i];
    if (G.mitosis || G.shatter || groupOf(G.pattern) === 'cells') continue;
    const start = G.t0 + 0.5, end = G.t1 - (G.morph || 0), body = end - start;
    if (body < 3 * bar) continue;
    const parts = Math.max(1, Math.min(3, Math.round(body / 14)));
    for (let part = 0; part < parts; part++) {
      const from = start + (body * part) / parts, to = start + (body * (part + 1)) / parts;
      let id = null;
      for (let k = 0; k < rotation.length; k++) { const c = rotation[(at + k) % rotation.length]; if (fits(c, G) && !G.moves?.some(m => m.id === c) && !(c === 'ramp' && part)) { id = c; at = (at + k + 1) % rotation.length; break; } }
      if (!id) continue;
      if (id === 'ramp') {
        const a = (M?.arrivals?.(0.2) ?? []).find(x => x.t > from + 2 && x.t < to - 2)?.t ?? (from + to) / 2, k = rampTrack(G, { hit: a });
        if (k) { G.uTrack = k; (G.moves ??= []).push({ id: 'ramp', hit: a }); }
        continue;
      }
      // Once a bar: on a half note these sit at the film's two flashes a second on a tile, and a mode has one.
      const hits = hitsFor('bar', { score, A, from: from + bar * 0.5, to: to - bar * 0.5 });
      if (hits.length < 3) continue;
      // And half as hard as the film's: a full wring on these bold sheets swung a corner of the frame three times a second (PPP 86.5 s, on River).
      (G.moves ??= []).push({ id, beats: hits, hits, lead: Math.min(bar, Math.max(hits[0] - from, 0.5)), coast: Math.min(bar, Math.max(to + 0.5 * bar - hits.at(-1), 0.5)), from, to, amp: id === 'wring' ? 0.55 : 0.5 });
    }
  }
}

// ---------------------------------------------------------------- the camera, on a stay the dots are dividing on
// The division is a push-in and a turn of its own, so the film's camera keeps to a slow drift there: a little of its turn and its zoom, none of its travel, and only a little tip. The same share all the stay, so it's only slower.
// On a stay that shatters, the camera goes on its own clock at a third of the speed, all stay long: the cracks read as straight breaks in straight lines and a whip meant for a hit is a slow
// turn. Slowing it only round the shatter left it behind for the rest of the stay, and it caught up with a whip in the wrong place (PPP 49.5 s); slowing it and letting it catch up swung the
// sheet through all the turn it had held back (9 flashes a second on a tile, MGMT 208 s). The same share all stay, so it's only slower, never faster.
const SCALE = OFF.scale, ROT = OFF.rot, TX = OFF.tx, TY = OFF.ty, PITCH = OFF['cam.pitch'];
const SHATTER_CAM = 0.3;
// And on a sheet of three or more sets of lines, the camera doesn't lift them to different heights: each set sliding by its own share as it pans takes triangles to all-white hexagons and
// all-black ones and back, the whole frame swinging with it (PPP 172 s, 199 to 73 to 146 in a second and a half).
const PH = [1, 2, 3].map(i => OFF[`f${i}.ph`]), ON = [1, 2, 3].map(i => OFF[`f${i}.on`]);
const layered = G => (G.pattern.g.fams ?? []).filter(f => (f.x || f.y) && !f.r1 && !f.l1 && !f.t1).length >= 3;
export function calmCamera(film) {
  for (const G of film.gestures) {
    if (!G.cam || G.cam._matter || !(G.shatter || G.mitosis || layered(G))) continue;
    const cam = G.cam;
    let calm = cam;
    if (G.shatter) { const t0 = G.t0; calm = (out, t, g) => cam(out, t0 + SHATTER_CAM * (t - t0), g); }
    else if (G.mitosis) calm = function (out, t, g) {
      const s0 = out[SCALE], r0 = out[ROT], x0 = out[TX], y0 = out[TY], p0 = out[PITCH];
      cam(out, t, g);
      out[SCALE] = s0 * Math.pow(Math.max(out[SCALE], 1e-6) / Math.max(s0, 1e-6), 0.25);
      out[ROT] = r0 + (out[ROT] - r0) * 0.3;
      out[TX] = x0 + (out[TX] - x0) * 0.12; out[TY] = y0 + (out[TY] - y0) * 0.12;
      out[PITCH] = p0 + (out[PITCH] - p0) * 0.35;
    };
    if (layered(G)) { const inner = calm; calm = (out, t, g) => { const was = PH.map((o, i) => (out[ON[i]] > 0.5 ? out[o] : null)); inner(out, t, g); PH.forEach((o, i) => { if (was[i] !== null) out[o] = was[i]; }); }; }
    calm._matter = true;
    G.cam = calm;
  }
}
