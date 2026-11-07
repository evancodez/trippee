// Where a transformation's fastest frame falls. T = smoother(x) with x linear is fastest half a morph before it lands, and at the landing it has come to rest with the next pattern's long move not yet
// started, so the song's hit was the slowest frame of the film. This runs last, after every placement, and moves a change so that it crosses on its hit (docs/DIRECTION.md section 3, Timing). Only behind
// directing.peak, on unless ?peak=0: with that off nothing here runs and a film is exactly the film it was before this.
//
//   Plain, slide, bend, flight   it coasts past the hit, by its share of the change if there's room, and peaked() in morphclock.js puts the fastest frame on the hit
//   A Shock in from the rim      most of a ring's sweep is near the rim, so its centre arriving on the hit is the least of it. The hit goes .35 of the way before the end instead
//   Fall, Iris                   they already cross at speed, and are left alone. The hit's written down, for tests
//   What has to be home on time  a landing on a rest, where the film stops, and one into a Countdown, whose board breaks whole from there. Or just no room. Nothing moves: it crosses on the strongest bar
//                                line a couple of bars before, and coasts in to exactly where it was going
//
// A change starts at most LEAD tails before its hit. T's top speed is 1.875 / tail however long the lead is, and the shape of its crossing hardly changes, so a longer lead buys only a hang: what's
// showing has come to rest and T hasn't started. On MGMT that was 5 s with nothing moving before a hit. So what's showing carries on until it's nearly time.
//
// It keeps the length it was given, up to that: a one-bar change stays one bar, moved along so that it crosses on the hit, and its tail is its share of that. It doesn't grow by a tail, or every short change would be three bars.
//
// G.peak = { hit, q }. hit is what tests read as the hit, in the film's seconds; q how long the decay after it is, and q 0 is no warp at all. What it did goes in score.landed, and what it couldn't in score.refused.
import { directing } from './flags.js';

const TAIL_BARS = 2;        // how far past the hit a change coasts, at most
const TAIL_SHARE = 0.4;     // of the change
const TAIL_LEAST = 0.6;     // bars, up to 1.2 s. Any less and it goes by in a whip
const TAIL_LEAST_S = 1.2;
const LEAD = 1.5;           // tails
const ROOM = 4;             // seconds the next pattern keeps to itself, between the tail and its own transformation
const SHOCK_PAST = 0.35;    // how much of a rim Shock comes after its hit
const Q = 2;

const forget = G => { delete G.plan; delete G.planFor; delete G.planning; };
// Its long move ends where its clock comes to rest, as the composer has it, unless a director has fixed that in time
const restEnd = G => { if (!G.fixedRange && G.regear) G.arcEnd = G.t1 - G.morph + Math.min(G.morph * 0.4, 3.5) / 2; };

// How far a change into N can run on before it would cover something N has fixed in time, in seconds
function roomIn(N, cast) {
  if (N.hero === 'countdown') return 0;
  let room = N.t1 - (N.morph || 0) - N.t0 - ROOM;
  for (const m of N.moves ?? []) if (m.id === 'star') room = Math.min(room, m.t0 - N.t0);
  const lock = cast.find(h => h.G === N && h.kind === 'lock');
  return lock ? Math.min(room, lock.a - N.t0) : room;
}
// A star's own arcs are shares of its gesture, and its roll is on the clock, so where the gesture starts later they're rewritten to stay with it.
function shiftArcs(N, was) {
  if (!N.fixedRange || !N.arcs?.length) return;
  const end = N.arcEnd ?? N.t1, H0 = end - was, H1 = end - N.t0, at = u => Math.max(0, (was + u * H0 - N.t0) / H1);
  for (const a of N.arcs) if (a.at) a.at = [at(a.at[0]), at(a.at[1])];
}

export function land(score, A, M, cast = []) {
  if (!directing.peak) return score;
  const g = score.gestures, bar = M.bar, last = g.length - 1, lags = score.time?.windows ?? [], beats = score.react?.pulses ?? null, time = score.time ?? (t => t);
  const refused = score.refused ??= [], landed = score.landed = [];
  const heroOf = (G, kind) => cast.find(h => h.G === G && h.kind === kind);
  // Up to where the clock starts to stop, if it does. Paying the lag back afterwards is only running a little fast.
  const toStop = (hit, tail) => { const w = lags.find(x => hit < x.b && hit + tail > x.from); return w ? Math.min(tail, w.from - hit) : tail; };
  // The bar line the song arrives on most, a couple of bars before t. Later ones if it's a tie.
  const barBefore = t => {
    let best = null, top = -1;
    for (const b of A.bars ?? []) {
      const f = time(b);
      if (f < t - 3 * bar || f > t - 1.5 * bar) continue;
      const a = M.arrivalAt?.(b) ?? 0;
      if (a >= top) { top = a; best = f; }
    }
    return best;
  };
  const shorter = (G, tail) => { G.morph = Math.min(G.morph, (LEAD + 1) * tail); };

  for (let i = 0; i < last - 1; i++) {
    const G = g[i], N = g[i + 1], id = G.xform?.id;
    if (!G.morph) continue;
    if (id === 'fall' || id === 'iris') {
      G.peak = { hit: heroOf(G, id)?.at ?? G.t1, q: 0 };
      landed.push([id, +G.peak.hit.toFixed(2)]);
      continue;
    }
    if (id === 'shock') {
      const hit = heroOf(G, 'shock')?.at ?? G.t1, want = hit + SHOCK_PAST * G.morph - G.t1;
      G.peak = { hit, q: 0 };
      // Out from the centre the hit's already where the ring sets off, with all of its sweep to come.
      const by = want > 0 ? Math.min(want, Math.max(roomIn(N, cast), 0), Math.max(toStop(G.t1, want), 0)) : 0;
      if (by > 0.05) {
        const was = N.t0, t0 = G.t1 + by - G.morph;
        G.t1 += by; N.t0 = G.t1;
        shiftArcs(N, was); restEnd(G); forget(G);
        if (G.xform.beats) { const inside = beats ? beats.filter(b => b > t0 && b < G.t1).map(b => (b - t0) / G.morph) : []; G.xform.beats = inside.length >= 2 ? inside : null; }
      }
      landed.push(['shock', +hit.toFixed(2), +by.toFixed(2)]);
      continue;
    }
    const end = G.t1, atRest = score.landings?.find(l => Math.abs(l.B - end) < 0.05)?.rest;
    // How long it's going to take, and how much of that comes after the hit
    const total = Math.min(G.morph, (LEAD + 1) * TAIL_BARS * bar), least = Math.min(TAIL_LEAST * bar, TAIL_LEAST_S);
    const tail = atRest ? 0 : toStop(end, Math.min(Math.max(TAIL_SHARE * total, least), TAIL_BARS * bar, roomIn(N, cast)));
    if (tail >= least && tail < total) {
      const was = N.t0;
      G.t1 = N.t0 = end + tail;
      G.morph = total;
      G.peak = { hit: end, q: Q };
      shiftArcs(N, was); restEnd(G); forget(G);
      landed.push(['plain', +end.toFixed(2), +tail.toFixed(2), +G.morph.toFixed(2)]);
      continue;
    }
    // It has to be home by its landing, so it crosses before. Only where that's inside the morph it has: nothing here makes one longer.
    const hit = barBefore(end);
    if (hit == null || hit <= end - G.morph + 0.2 * Math.min(G.morph, (LEAD + 1) * (end - hit))) {
      refused.push({ t: +end.toFixed(2), what: `${G.pattern.id}>${N.pattern.id}`, why: 'no bar line to cross on before it lands' });
      landed.push(['stays', +end.toFixed(2)]);
      continue;
    }
    shorter(G, end - hit);
    G.peak = { hit, q: Q };
    restEnd(G); forget(G);
    landed.push(['home', +hit.toFixed(2), +(end - hit).toFixed(2), +G.morph.toFixed(2), atRest ? 'rest' : N.hero === 'countdown' ? 'countdown' : 'no room']);
  }
  return score;
}
