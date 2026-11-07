// The film's rotation. Who's on, how they get to the next one, and what they do there. A long stay runs several things; it never stays with one kind for long.
import { OFF } from '../../pattern/layout.js';
import { reactAt } from '../../score/react.js';
import { hitsFor } from '../../score/moves/surge.js';
import { rampTrack } from '../../score/moves/ramp.js';
import { MOVES } from '../../score/moves/index.js';
import { base } from '../../score/slot.js';

const SHARE = { contact: 0.3, water: 0.28, shell: 0.27, op: 0.15 };
const rng = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 8) / 16777216; };

export function cast(score, A, M) {
  const g = score.gestures, rand = rng(((score.seed | 0) * 7919 + (A.hash ? parseInt(String(A.hash).slice(0, 7), 16) : 3)) >>> 0), energyAt = t => { try { return reactAt(score.react, M?.C ? M.C(t) : t).energy; } catch { return 0.5; } };
  const P = score.patterns.filter(p => p.pool !== false), by = Object.fromEntries(Object.keys(SHARE).map(k => [k, P.filter(p => p.group === k)]));
  const had = { contact: 0, water: 0, shell: 0, op: 0 }, seen = new Map();
  let last = null, total = 0;
  const pickFrom = group => {
    const pool = by[group], least = Math.min(...pool.map(p => seen.get(p) ?? -1)), fresh = pool.filter(p => (seen.get(p) ?? -1) === least && p !== last), from = fresh.length ? fresh : pool.filter(p => p !== last);
    return from[Math.floor(rand() * from.length)] ?? pool[0];
  };
  for (let i = 0; i < g.length; i++) {
    const G = g[i], len = G.t1 - G.t0, e = energyAt((G.t0 + G.t1) / 2);
    let group = 'contact';
    if (i) {
      // Furthest behind its share. Quiet goes for water and contact, loud for shell and the film's op.
      const lean = { water: (0.5 - e) * 0.2, contact: (0.5 - e) * 0.1, shell: (e - 0.5) * 0.15, op: (e - 0.5) * 0.2 };
      group = Object.keys(SHARE).filter(k => k !== last?.group).sort((a, b) => (SHARE[b] - had[b] / Math.max(total, 1) + lean[b]) - (SHARE[a] - had[a] / Math.max(total, 1) + lean[a]))[0];
    }
    const p = i === 0 ? by.contact.find(x => x.id === 'pearl.bubbles') ?? by.contact[0] : pickFrom(group);
    last = p; seen.set(p, i); had[p.group] += len; total += len;
    if (G.pattern !== p && G.k == null) { G.pattern = p; G.arcs = p.arcs; delete G.flow; delete G.range; }
    else if (G.pattern !== p) { const N = score.remake(G, p); N.t0 = G.t0; N.t1 = G.t1; N.arcEnd = G.arcEnd; if (G.rise != null) N.rise = G.rise; g[i] = N; }
  }
  return g;
}

// The ways across: a rack from where the voice is, a drain down the frame, a breath. Each from its own place. Never the same twice running.
const WAYS = ['rack', 'drain', 'breath', 'rack', 'rim'];
export function landings(score) {
  const g = score.gestures;
  let at = 0;
  for (let i = 0; i + 1 < g.length; i++) {
    const G = g[i], way = WAYS[at++ % WAYS.length];
    if (way === 'rim') G.xform = { id: 'rack', dir: 1, W: 0.6, chosen: true };
    else if (way === 'rack') G.xform = { id: 'rack', dir: 2, centre: [[-0.7, 0.2], [0.8, -0.3], [0.1, 0.5], [-0.3, -0.5]][i % 4], chosen: true };
    else G.xform = { id: way, chosen: true };
  }
}

const ROT = ['chorus', 'ghost', 'pearls', 'lead', 'wring', 'fan', 'waltz', 'slit', 'chorus', 'bellows', 'limit', 'ghost', 'ramp', 'echo'];
const FOLDS = new Set(['pearls', 'fan', 'limit', 'forever', 'screen']), TIMES = new Set(['slit', 'echo']);
export function moves(score, A, M) {
  const g = score.gestures, bar = M?.bar ?? 2;
  let at = 0, big = 0;
  const fits = (id, G) => {
    const p = G.pattern, S = base(p), n = k => S[OFF[k]], fams = p.g.fams?.length ?? 1, ours = n('field.kind') === 4, fieldOn = ours && n('field.k0') !== 0;
    if (FOLDS.has(id)) return n('fold.n') < 2 && n('surf.kind') < 0.5 && !(id === 'limit' && fams > 1);
    if (id === 'slit') return n('surf.kind') < 0.5;
    if (id === 'echo') return n('surf.kind') < 0.5 && fams === 1;
    if (id === 'chorus') return fams <= 2 && !n('round') && n('f0.t1') === 0 && (p.g.fams?.[0]?.t1 ?? 0) === 0;
    if (id === 'ghost') return fams === 1 && !n('round');
    if (id === 'lead' || id === 'waltz') return fieldOn && [n('blobs.r1'), n('blobs.r2'), n('blobs.r3')].filter(x => x > 0).length > 1;
    if (id === 'wring') return n('surf.kind') < 0.5;
    if (id === 'bellows') return fams >= 2 && !n('round') && !n('shape.round');
    if (id === 'ramp') return true;
    return false;
  };
  for (let i = 1; i + 1 < g.length; i++) {
    const G = g[i], start = G.t0 + 0.5, end = G.t1 - (G.morph || 0), body = end - start;
    if (body < 3 * bar) continue;
    const parts = Math.max(1, Math.min(3, Math.round(body / 13)));
    for (let part = 0; part < parts; part++) {
      const from = start + (body * part) / parts, to = start + (body * (part + 1)) / parts;
      let id = null;
      for (let n = 0; n < ROT.length; n++) { const c = ROT[(at + n) % ROT.length]; if (fits(c, G) && !G.moves?.some(m => m.id === c) && !((FOLDS.has(c) || TIMES.has(c)) && G.moves?.length)) { id = c; at = (at + n + 1) % ROT.length; break; } }
      if (!id) continue;
      if (FOLDS.has(id) || TIMES.has(id)) {
        // Whatever comes in has to have room to get in and get out.
        if (to - from < Math.max(6.5, 3.2 * bar) || parts > 1 || (big++ % 2 && id === 'fan')) continue;
        const made = MOVES[id].cue(FOLDS.has(id) ? { id, from, to, open: Math.min(3, (0.3 * body) / bar), close: Math.min(2.5, (0.22 * body) / bar) } : { id, from, to, beats: 'strong', calm: 1 }, { score, A, M, G, shot: null, at: x => x, bar, beat: M?.beat ?? 0.5, meter: A.meter || 4, tau: score.tau });
        if (made) (G.moves ??= []).push(made);
        continue;
      }
      const beats = id === 'wring' || id === 'bellows' ? 'half' : 'bar';
      let hits = hitsFor(beats, { score, A, from: from + bar * 0.5, to: to - bar * 0.5 });
      if (hits.length > 1 && (hits.at(-1) - hits[0]) / (hits.length - 1) < 1.15) hits = hitsFor('bar', { score, A, from: from + bar * 0.5, to: to - bar * 0.5 });
      if (hits.length < 3 && id !== 'ramp') continue;
      if (id === 'ramp') {
        const a = (M?.arrivals?.(0.2) ?? []).find(x => x.t > from + 2 && x.t < to - 2)?.t ?? (from + to) / 2, k = rampTrack(G, { hit: a });
        if (k) { G.uTrack = k; (G.moves ??= []).push({ id: 'ramp', hit: a }); }
        continue;
      }
      (G.moves ??= []).push({ id, beats: hits, hits, lead: Math.min(bar, Math.max(hits[0] - from, 0.5)), coast: Math.min(bar, Math.max(to + 0.5 * bar - hits.at(-1), 0.5)), from, to });
    }
  }
}
