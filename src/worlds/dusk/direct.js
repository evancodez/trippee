// Dusk's film: who's on, how they get to the next, and what they do on the way. The heart is land and road, and it never stays with one kind for long.
import { OFF } from '../../pattern/layout.js';
import { reactAt } from '../../score/react.js';
import { hitsFor } from '../../score/moves/surge.js';
import { MOVES } from '../../score/moves/index.js';
import { base } from '../../score/slot.js';
import { directing } from '../../score/flags.js';

export const PICK = (score, A) => { const left = score.patterns.filter(p => p.pool !== false && p.group); let n = 0; return G => { const seen = new Set(score.gestures.map(x => x.pattern)), fresh = left.filter(p => !seen.has(p)), from = fresh.length ? fresh : left; return from[(n++ * 7 + (A.hash ? parseInt(String(A.hash).slice(0, 4), 16) : 3)) % from.length]; }; };
const SHARE = { land: 0.38, road: 0.2, strings: 0.14, room: 0.18, film: 0.1 };
const rng = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 8) / 16777216; };
export const groupOf = p => p.group ?? 'film';

export function cast(score, A, M) {
  const g = score.gestures, rand = rng(((score.seed | 0) * 7919 + (A.hash ? parseInt(String(A.hash).slice(0, 7), 16) : 3)) >>> 0), energyAt = t => { try { return reactAt(score.react, M?.C ? M.C(t) : t).energy; } catch { return 0.5; } };
  const P = score.patterns.filter(p => p.pool !== false), by = {};
  for (const p of P) (by[groupOf(p)] ??= []).push(p);
  const had = {}, seen = new Map();
  let last = null, run = 0, total = 0;
  const pickFrom = group => {
    const pool = by[group], least = Math.min(...pool.map(p => seen.get(p) ?? -1)), fresh = pool.filter(p => (seen.get(p) ?? -1) === least && p !== last);
    const from = fresh.length ? fresh : pool.filter(p => p !== last);
    return from[Math.floor(rand() * from.length)] ?? pool[0];
  };
  const groups = Object.keys(SHARE).filter(k => by[k]?.length);
  for (let i = 0; i < g.length; i++) {
    const G = g[i], len = G.t1 - G.t0, e = energyAt((G.t0 + G.t1) / 2);
    let group = 'land';
    if (i) {
      const lean = { land: (0.5 - e) * 0.12, room: (0.5 - e) * 0.15, road: (e - 0.5) * 0.15, strings: (e - 0.5) * 0.1, film: (e - 0.5) * 0.12 };
      group = groups.filter(k => !(k === groupOf(last) && run >= (k === 'land' ? 2 : 1))).sort((a, b) => (SHARE[b] - (had[b] ?? 0) / Math.max(total, 1) + lean[b]) - (SHARE[a] - (had[a] ?? 0) / Math.max(total, 1) + lean[a]))[0];
    }
    const p = i === 0 ? by.land.find(x => x.id === 'dusk.ridge') ?? by.land[0] : pickFrom(group);
    run = last && groupOf(last) === groupOf(p) ? run + 1 : 1;
    last = p; seen.set(p, i); had[groupOf(p)] = (had[groupOf(p)] ?? 0) + len; total += len;
    if (G.pattern !== p && G.k == null) { G.pattern = p; G.arcs = p.arcs; delete G.flow; delete G.range; }
    else if (G.pattern !== p) { const N = score.remake(G, p); N.t0 = G.t0; N.t1 = G.t1; N.arcEnd = G.arcEnd; if (G.rise != null) N.rise = G.rise; g[i] = N; }
  }
  return g;
}

// The ways across. The dusk line's the signature. Between two places on the road or the land it's that, and into a room from outside it's the light that does it.
const WEIGHT = { line: 3, flare: 2, fall: 2, settle: 1.2 };
export function landings(score) {
  const g = score.gestures, used = {};
  let prev = null;
  for (let i = 0; i + 1 < g.length; i++) {
    const G = g[i], N = g[i + 1], a = base(G.pattern), b = base(N.pattern), flat = S => S[OFF['surf.kind']] < 0.5, wants = N.pattern.sun && N.pattern.cam === 'anchor', open = [];
    // Not the drift out of or into one of the film's own patterns: their bands are dense, and drifting all of them at once went by a tile 4 to 5 times a second (Wildflower 56.5 s, MGMT). A front or a fall has the same energy and goes by one band at a time.
    // Nor into or out of a room: an interior's lines stand at their own angles, and the mist drifting from crowns into smoke went by a tile 5 times a second (MGMT 223 s). Into a room it's the light that does it.
    const drifts = p => groupOf(p) !== 'film' && groupOf(p) !== 'room';
    if (flat(a) && flat(b)) open.push('line', 'fall', ...(drifts(G.pattern) && drifts(N.pattern) ? ['settle'] : []));
    if (flat(a) && flat(b) && wants) open.push('flare');
    if (!open.length) { G.xform = { id: 'dive', chosen: true }; continue; }
    const score1 = k => WEIGHT[k] / (1 + (used[k] ?? 0)) * (k === prev ? 0.001 : 1) * (k === 'flare' && wants ? 1.5 : 1), k = open.sort((x, y) => score1(y) - score1(x))[0];
    used[k] = (used[k] ?? 0) + 1;
    prev = k;
    const s = N.pattern.sun;
    G.xform = k === 'flare' ? { id: 'flare', chosen: true, centre: [s[0], s[1]] } : { id: k, chosen: true };
  }
  return used;
}

// What it does while it's there. Long stays have to earn it: a thing of its own for each part, and every so often one of the film's big ideas, which come out differently in this light.
const BIG = ['pearls', 'slit', 'screen', 'limit', 'fan', 'forever'];
export function moves(score, A, M) {
  const g = score.gestures, bar = M?.bar ?? 2, ctxOf = G => ({ score, A, M, G, shot: null, at: score.time ?? (x => x), bar, beat: M?.beat ?? 0.5, meter: A.meter || 4, tau: score.tau });
  const rotation = ['gust', 'sway', 'water', 'breath', 'gust', 'sway'];
  let at = 0, big = 0, since = 0;
  for (let i = 1; i + 1 < g.length; i++) {
    const G = g[i], start = G.t0 + 0.5, end = G.t1 - (G.morph || 0), body = end - start;
    if (body < 2.5 * bar) continue;
    // A land's field isn't continuous, and in a mirror its crests only come out as lace. It can have the slit.
    const isLand = G.pattern.group === 'land';
    // With the casting on (src/score/woah.js, W.woah in dusk.js) the film's big ideas are cast, by the music, and not every third stay.
    if (!directing.woah && ++since >= 3 && body >= 6 && !G.pattern.lake && !G.pattern.g?.rot) {
      const id = isLand ? 'slit' : BIG[big % BIG.length], made = id === 'slit' ? MOVES.slit.cue({ id, beats: 'strong', map: 'sweep', D: Math.min(body, 2 * bar), from: start, to: end }, ctxOf(G)) : MOVES[id].cue({ id, from: G.t0, to: end, open: Math.min(3, (0.3 * body) / bar), close: Math.min(2.5, (0.22 * body) / bar) }, ctxOf(G));
      if (!isLand) big++;
      if (made) { G.moves = [made]; since = 0; continue; }
    }
    const parts = Math.max(1, Math.min(3, Math.round(body / 12)));
    for (let part = 0; part < parts; part++) {
      const from = start + (body * part) / parts, to = start + (body * (part + 1)) / parts, id = rotation[at++ % rotation.length];
      if (id === 'water') { if (G.pattern.lake != null || G.pattern.g?.rot) continue; G.water = { t0: from, t1: to, y: -0.35 - 0.2 * (i % 3) }; continue; }
      const hits = hitsFor(id === 'gust' ? 'bar' : 'half', { score, A, from: from + bar * 0.5, to: to - bar * 0.5 });
      if (hits.length < 2) continue;
      (G.moves ??= []).push({ id: `dusk.${id}`, beats: hits, hits, lead: Math.min(bar, Math.max(hits[0] - from, 0.5)), coast: Math.min(bar, Math.max(to + 0.5 * bar - hits.at(-1), 0.5)), from, to });
    }
  }
}

// The last gesture has the rest of time. What it has of the song is cut up, so the end of a song doesn't sit on one thing.
const LONGEST_END = 13;
export function endings(score, A, by) {
  const g = score.gestures, end = A.duration;
  for (let last = g.at(-1); last && end - last.t0 > LONGEST_END + 5; last = g.at(-1)) {
    const at = last.t0 + LONGEST_END, p = by(last), far = last.t1;
    const N = { t0: at, t1: far, arcEnd: at + 26, pattern: p, arcs: p.arcs, morph: 0 };
    last.t1 = at; last.arcEnd = at; last.morph = 7;
    g.push(N);
  }
}
