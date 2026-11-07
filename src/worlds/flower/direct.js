// The film's rotation. Who's on, how they get to the next one, and what they do while they're there. Flowers are the heart of it, and it never stays with any one kind for long.
import { OFF } from '../../pattern/layout.js';
import { reactAt } from '../../score/react.js';
import { hitsFor } from '../../score/moves/surge.js';
import { rampTrack } from '../../score/moves/ramp.js';
import { starMove } from '../../score/moves/star.js';
import { MOVES } from '../../score/moves/index.js';
import { base } from '../../score/slot.js';

// How much of a film each group should have.
const SHARE = { flower: 0.46, motif: 0.3, op: 0.24 };
const rng = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 8) / 16777216; };

export function cast(score, A, M) {
  let g = score.gestures;
  const rand = rng(((score.seed | 0) * 7919 + (A.hash ? parseInt(String(A.hash).slice(0, 7), 16) : 3)) >>> 0), energyAt = t => { try { return reactAt(score.react, M?.C ? M.C(t) : t).energy; } catch { return 0.5; } };
  const P = score.patterns.filter(p => p.pool !== false), by = { flower: P.filter(p => p.group === 'flower'), motif: P.filter(p => p.group === 'motif'), op: P.filter(p => p.group === 'op') };
  const had = { flower: 0, motif: 0, op: 0 }, seen = new Map();
  let last = null, run = 0, total = 0;
  const pickFrom = (group, i) => {
    const pool = by[group], least = Math.min(...pool.map(p => seen.get(p) ?? -1));
    const fresh = pool.filter(p => (seen.get(p) ?? -1) === least && p !== last);
    const from = fresh.length ? fresh : pool.filter(p => p !== last);
    return from[Math.floor(rand() * from.length)] ?? pool[0];
  };
  for (let i = 0; i < g.length; i++) {
    const G = g[i], len = G.t1 - G.t0, mid = (G.t0 + G.t1) / 2, e = energyAt(mid);
    let group;
    if (i === 0) group = 'flower';
    else {
      // The group furthest behind its share, and loud goes for the bold op, quiet for a flower.
      const lean = { flower: (0.5 - e) * 0.15, motif: 0, op: (e - 0.5) * 0.15 };
      group = Object.keys(SHARE).filter(k => !(k === last?.group && run >= (k === 'flower' ? 2 : 1))).sort((a, b) => (SHARE[b] - had[b] / Math.max(total, 1) + lean[b]) - (SHARE[a] - had[a] / Math.max(total, 1) + lean[a]))[0];
    }
    const p = i === 0 ? by.flower.find(x => x.id === 'flower.daisy') ?? by.flower[0] : pickFrom(group, i);
    run = last?.group === p.group ? run + 1 : 1;
    last = p; seen.set(p, i); had[p.group] += len; total += len;
    if (G.pattern !== p && G.k == null) { G.pattern = p; G.arcs = p.arcs; delete G.flow; delete G.range; }      // the film's tail, which compose made by hand
    else if (G.pattern !== p) { const N = score.remake(G, p); N.t0 = G.t0; N.t1 = G.t1; N.arcEnd = G.arcEnd; if (G.rise != null) N.rise = G.rise; g[i] = N; }
  }
  return g;
}

// The ways across, and how much each is wanted: Bud's the signature. Anything flat can melt or tide; a fold can only tide, and something's only a dive if there's nothing better.
const WEIGHT = { bud: 3, tide: 2, melt: 2, dive: 1, iris: 0.5 };
export function landings(score) {
  const g = score.gestures, used = {};
  let prev = null;
  for (let i = 0; i + 1 < g.length; i++) {
    const G = g[i], N = g[i + 1], a = base(G.pattern), b = base(N.pattern), D = G.morph || 0, num = (S, n) => S[OFF[n]];
    const sameFold = num(a, 'fold.n') === num(b, 'fold.n'), flat = S => num(S, 'surf.kind') < 0.5, ours = S => flat(S) && num(S, 'field.kind') === 4, field = S => ours(S) && num(S, 'field.k0') !== 0, wound = S => num(S, 'f0.t1') !== 0 || num(S, 'f0.t2') !== 0;
    const open = [];
    if (sameFold && field(a) && field(b)) open.push('bud');
    if (sameFold && ours(a) && ours(b)) open.push('melt');
    if (flat(a) && flat(b) && !wound(a) && !wound(b)) open.push('tide');
    if (!open.length) open.push('dive');
    if (D >= 5) open.push('dive');
    if (D >= 5 && i % 5 === 3) open.push('iris');
    const score1 = k => WEIGHT[k] / (1 + (used[k] ?? 0)) * (k === prev ? 0.001 : 1);
    const k = open.sort((x, y) => score1(y) - score1(x))[0];
    used[k] = (used[k] ?? 0) + 1;
    prev = k;
    // A tide: out of a flower, in from the rim, or straight across the frame, in turn.
    G.xform = k === 'tide' ? { id: 'tide', dir: [2, 3, 1][used.tide % 3], centre: tideCentre(N.pattern), ang: (used.tide * 2.4) % 6.283 } : { id: k, chosen: true };
  }
  return used;
}
const tideCentre = p => { const g = p.g, c = [[g['blobs.r1'], g['blobs.x1'], g['blobs.y1']], [g['blobs.r2'], g['blobs.x2'], g['blobs.y2']], [g['p1.q'], g['p1.x'], g['p1.y']]].sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]))[0]; return [c[1] || 0, c[2] || 0]; };

// What it does while it's there. A gesture has at most one of these and there's a rest now and then: not everything has to be doing something.
export function moves(score, A, M) {
  const g = score.gestures, bar = M?.bar ?? 2, rotation = ['pump', 'scissor', 'turnover', 'wind', 'lead', 'wring', 'bellows', 'beads', 'waltz', 'ratchet', 'ramp'];
  let at = 0, sinceStar = 99, runs = 0;
  const fits = (id, G) => {
    const p = G.pattern, S = base(p), num = n => S[OFF[n]], ours = num('field.kind') === 4, field = ours && num('field.k0') !== 0, whip = num('spare.a') !== 0 || num('spare.c') !== 0;
    if (id === 'ratchet') return (p.g.fams ?? []).some(f => f.t1);
    if (id === 'scissor') return p.id === 'flower.check';
    if (id === 'turnover') return num('blobs.beta') > 0;
    if (id === 'bellows') return (p.g.fams?.length ?? 1) >= 2 && !num('shape.round') && !num('round');
    if (id === 'wring') return num('surf.kind') < 0.5;
    if (id === 'ramp') return true;
    if (id === 'beads') return field && !whip && p.group !== 'op' && !num('ribbon.a') && (p.g.fams?.length ?? 1) < 2;
    if (id === 'wind') return field && !whip && !num('field.b');
    if (id === 'pump') return field && !whip && num('field.ph') > 0;
    if (id === 'lead' || id === 'waltz') return field && !num('blobs.beta') && countPoles(p) > 1;
    return false;
  };
  for (let i = 1; i + 1 < g.length; i++) {
    const G = g[i], from = G.t0 + 0.5, to = G.t1 - (G.morph || 0), body = to - from;
    if (body < 3 * bar || (i % 4 === 0 && body < 12)) continue;
    let id = null;
    for (let n = 0; n < rotation.length; n++) { const c = rotation[(at + n) % rotation.length]; if (fits(c, G)) { id = c; at = (at + n + 1) % rotation.length; break; } }
    if (!id) continue;
    const beats = (id === 'pump' || id === 'wring' || id === 'ratchet' || id === 'bellows' || id === 'scissor' || id === 'turnover') ? 'half' : 'bar';
    // A tile takes one edge a second, near enough, and the rings are already using most of that. So never faster than a hit every so often, whatever the tempo.
    let hits = hitsFor(beats, { score, A, from: from + bar * 0.5, to: to - bar * 0.5 });
    if (hits.length > 1 && (hits.at(-1) - hits[0]) / (hits.length - 1) < 1.15) hits = hitsFor('bar', { score, A, from: from + bar * 0.5, to: to - bar * 0.5 });
    if (hits.length < 3 && id !== 'ramp') continue;
    if (id === 'ramp') {
      const a = (M?.arrivals?.(0.2) ?? []).find(x => x.t > from + 2 && x.t < to - 2)?.t ?? (from + to) / 2, k = rampTrack(G, { hit: a });
      if (k) { G.uTrack = k; (G.moves ??= []).push({ id: 'ramp', hit: a }); }
      continue;
    }
    const m = { id, beats: hits, hits, lead: Math.min(bar, Math.max(hits[0] - G.t0, 0.5)), coast: Math.min(bar, Math.max(G.t1 - hits.at(-1), 0.5)), from: G.t0, to };
    // The film's own need setting up by their own cue, which goes in bars.
    if (id === 'scissor') { m.lead = 0.5; m.coast = 1; m.every = 4; if (!MOVES.scissor.cue(m, { score, A, M, G, at: x => x, bar, beat: M?.beat ?? 0.5, meter: M?.meter ?? 4, tau: score.tau })) continue; }
    (G.moves ??= []).push(m);
  }
  // A colour run now and then: what's born while this one's on wears a cycle, not the tune. Every so often, and never two together.
  const CYCLE = ['fire', 'sea', 'rainbow', 'stick'];
  for (let i = 3; i + 1 < g.length; i += 4) {
    const G = g[i];
    if (G.pattern.run || g[i - 1].pattern.run || g[i + 1].pattern.run) continue;
    G.run = CYCLE[runs++ % CYCLE.length];
  }
  // The ball, once or twice in a song, in a quiet stretch on something with flowers.
  for (let i = 2; i + 1 < g.length; i++) {
    const G = g[i], to = G.t1 - (G.morph || 0), S = base(G.pattern);
    if (++sinceStar < 7 || G.moves?.length || to - G.t0 < 10 || G.pattern.group !== 'flower' || S[OFF['blobs.beta']] || S[OFF['surf.kind']] > 0.5) continue;
    G.moves = [{ ...starMove({ t0: G.t0 + 0.5, open: (to - G.t0) * 0.45, close: { t: to - (to - G.t0) * 0.45, D: (to - G.t0) * 0.45 } }), id: 'ball' }];
    sinceStar = 0;
  }
}
const countPoles = p => ['blobs.r1', 'blobs.r2', 'blobs.r3', 'p1.q', 'p2.q'].filter(n => (p.g[n] ?? 0) > 0).length;
