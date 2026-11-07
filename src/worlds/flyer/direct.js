// The film's rotation. Who's on, how they get to the next one, and what they do while they're there. It never stays with any one kind for long, and what's loud goes for what's biggest.
import { OFF } from '../../pattern/layout.js';
import { reactAt } from '../../score/react.js';
import { hitsFor } from '../../score/moves/surge.js';
import { rampTrack } from '../../score/moves/ramp.js';
import { MOVES } from '../../score/moves/index.js';
import { base } from '../../score/slot.js';
import './moves.js';

const SHARE = { target: 0.24, icon: 0.3, plate: 0.14, op: 0.22, film: 0.1 };
const rng = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 8) / 16777216; };

export function cast(score, A, M) {
  const g = score.gestures, rand = rng(((score.seed | 0) * 6131 + (A.hash ? parseInt(String(A.hash).slice(0, 7), 16) : 11)) >>> 0), energyAt = t => { try { return reactAt(score.react, M?.C ? M.C(t) : t).energy; } catch { return 0.5; } };
  const P = score.patterns.filter(p => p.pool !== false), by = {};
  for (const k in SHARE) by[k] = P.filter(p => p.group === k);
  const had = Object.fromEntries(Object.keys(SHARE).map(k => [k, 0])), seen = new Map();
  let last = null, total = 0;
  const pick = group => {
    const pool = by[group], least = Math.min(...pool.map(p => seen.get(p) ?? -1)), fresh = pool.filter(p => (seen.get(p) ?? -1) === least && p !== last), from = fresh.length ? fresh : pool.filter(p => p !== last);
    return from[Math.floor(rand() * from.length)] ?? pool[0];
  };
  for (let i = 0; i < g.length; i++) {
    const G = g[i], len = G.t1 - G.t0, e = energyAt((G.t0 + G.t1) / 2);
    let group;
    if (i === 0) group = 'target';
    else {
      const lean = { target: (0.5 - e) * 0.12, icon: (e - 0.5) * 0.16, plate: 0, op: (e - 0.5) * 0.08, film: 0 };
      group = Object.keys(SHARE).filter(k => by[k].length && k !== last?.group).sort((a, b) => (SHARE[b] - had[b] / Math.max(total, 1) + lean[b]) - (SHARE[a] - had[a] / Math.max(total, 1) + lean[a]))[0];
    }
    const p = i === 0 ? by.target.find(x => x.id === 'flyer.target') ?? by.target[0] : pick(group);
    last = p; seen.set(p, i); had[p.group] += len; total += len;
    if (G.pattern !== p && G.k == null) { G.pattern = p; G.arcs = p.arcs; delete G.flow; delete G.range; }
    else if (G.pattern !== p) { const N = score.remake(G, p); N.t0 = G.t0; N.t1 = G.t1; N.arcEnd = G.arcEnd; if (G.rise != null) N.rise = G.rise; g[i] = N; }
    g[i].page = i % 2;      // which page of the table its stencil's on: two in a row are never on the same one
  }
  return g;
}

// The ways across. Each wants to be different from the last. A fill wants a fill: it goes where the drummer plays one, if one's there.
const WEIGHT = { crank: 2.2, bleed: 1.6, feed: 2.2, fill: 2.6, dive: 0.6, iris: 1 };
export function landings(score, song) {
  const g = score.gestures, used = {};
  let prev = null;
  const fillNear = t => song?.fills?.find(f => Math.abs(song.time(f.land) - t) < (song.bar ?? 2));
  for (let i = 0; i + 1 < g.length; i++) {
    const G = g[i], N = g[i + 1], a = base(G.pattern), b = base(N.pattern), D = G.morph || 0, num = (S, n) => S[OFF[n]];
    const sameFold = num(a, 'fold.n') === num(b, 'fold.n'), ours = S => num(S, 'surf.kind') < 0.5 && num(S, 'field.kind') === 4, field = S => ours(S) && num(S, 'field.k0') !== 0 && num(S, 'star._1') === 0, wound = S => num(S, 'f0.t1') !== 0 || num(S, 'f0.t2') !== 0;
    const flat = S => num(S, 'surf.kind') < 0.5, open = [];
    if (sameFold && field(a) && field(b)) open.push('crank');
    if (sameFold && ours(a) && ours(b)) open.push('bleed');
    if (flat(a) && flat(b) && !wound(a) && !wound(b)) { open.push('feed'); if (D >= 2.5) open.push('fill'); }
    if (!open.length) open.push('dive');
    if (D >= 5 && i % 6 === 4) open.push('iris');
    const hit = fillNear(G.t1);
    const score1 = k => WEIGHT[k] / (1 + (used[k] ?? 0)) * (k === prev ? 0.001 : 1) * (hit && k === 'fill' ? 6 : 1);
    const k = open.sort((x, y) => score1(y) - score1(x))[0];
    used[k] = (used[k] ?? 0) + 1;
    prev = k;
    if (k === 'feed') G.xform = { id: 'feed', dir: 3, ang: (used.feed * 2.4) % 6.283, chosen: true };
    else if (k === 'fill') G.xform = { id: 'fill', ang: [0, Math.PI / 2, 0.5, Math.PI, -0.5][used.fill % 5], order: used.fill % 3, hits: hit ? Array.from(hit.hits).map(song.time) : null, chosen: true };
    else G.xform = { id: k, chosen: true };
  }
  return used;
}

// What it does while it's there. A long stay has to earn it: one thing after another, each a dozen seconds or so.
export function moves(score, A, M) {
  const g = score.gestures, bar = M?.bar ?? 2, rotation = ['windmill', 'upstroke', 'crumple', 'headbang', 'crank', 'lead', 'wring', 'fan', 'slit', 'bellows', 'rotator', 'ratchet', 'scissor', 'echo', 'ramp', 'forever'];
  let at = 0;
  const fits = (id, G) => {
    const p = G.pattern, S = base(p), num = n => S[OFF[n]], flat = num('surf.kind') < 0.5, field = num('field.kind') === 4 && num('field.k0') !== 0 && num('star._1') === 0, plain = (p.g?.fams?.length ?? 1) < 2;
    if (id === 'ratchet') return (p.g?.fams ?? []).some(f => f.t1);
    if (id === 'scissor') return p.id === 'flyer.check';
    if (id === 'upstroke') return flat && plain && num('field.kind') === 4 && !num('round') && !num('spare.a');
    if (id === 'bellows') return (p.g?.fams?.length ?? 1) >= 2 && !num('shape.round') && !num('round');
    if (id === 'wring') return flat;
    if (id === 'ramp') return true;
    if (id === 'crank') return field && num('field.ph') > 0;
    if (id === 'lead' || id === 'rotator') return field && !num('blobs.beta') && countPoles(p) > 1;
    if (id === 'windmill' || id === 'headbang') return flat;
    if (id === 'crumple' || id === 'fan' || id === 'forever') return flat && !p.stencil && p.group !== 'film';
    if (id === 'slit' || id === 'echo') return flat && !p.stencil;
    return false;
  };
  for (let i = 1; i + 1 < g.length; i++) {
    const G = g[i], start = G.t0 + 0.5, end = G.t1 - (G.morph || 0), body = end - start;
    if (body < 2.5 * bar) continue;
    const parts = Math.max(1, Math.min(3, Math.round(body / 12)));
    for (let part = 0; part < parts; part++) {
      const from = start + (body * part) / parts, to = start + (body * (part + 1)) / parts;
      let id = null;
      for (let n = 0; n < rotation.length; n++) { const c = rotation[(at + n) % rotation.length]; if (fits(c, G) && !G.moves?.some(m => m.id === c) && !(c === 'ramp' && part)) { id = c; at = (at + n + 1) % rotation.length; break; } }
      if (!id) continue;
      const half = ['windmill', 'upstroke', 'headbang', 'wring', 'ratchet', 'bellows', 'scissor'].includes(id);
      let hits = hitsFor(half ? 'half' : 'bar', { score, A, from: from + bar * 0.5, to: to - bar * 0.5 });
      if (hits.length > 1 && (hits.at(-1) - hits[0]) / (hits.length - 1) < 1.1) hits = hitsFor('bar', { score, A, from: from + bar * 0.5, to: to - bar * 0.5 });
      if (hits.length < 3 && id !== 'ramp') continue;
      if (id === 'ramp') {
        const a = (M?.arrivals?.(0.2) ?? []).find(x => x.t > from + 2 && x.t < to - 2)?.t ?? (from + to) / 2, k = rampTrack(G, { hit: a });
        if (k) { G.uTrack = k; (G.moves ??= []).push({ id: 'ramp', hit: a }); }
        continue;
      }
      const m = { id, beats: hits, hits, lead: Math.min(bar, Math.max(hits[0] - from, 0.5)), coast: Math.min(bar, Math.max(to + 0.5 * bar - hits.at(-1), 0.5)), from, to };
      if (id === 'windmill') m.way = i % 2 ? 1 : -1;
      // The film's own, cued as a hand cut cues them.
      const mv = MOVES[id];
      if (mv.cue && !['wring', 'ratchet', 'bellows'].includes(id)) { m.lead = Math.min(m.lead, 1); if (id === 'scissor') { m.lead = 0.5; m.coast = 1; m.every = 4; } const ok = mv.cue(m, { score, A, M, G, at: x => x, bar, beat: M?.beat ?? 0.5, meter: M?.meter ?? 4, tau: score.tau }); if (!ok) continue; }
      (G.moves ??= []).push(m);
    }
  }
}
const countPoles = p => ['blobs.r1', 'blobs.r2', 'blobs.r3', 'p1.q', 'p2.q'].filter(n => (p.g?.[n] ?? 0) > 0).length;
