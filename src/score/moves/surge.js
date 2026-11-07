// The clock the riot set runs on: ratchet.js, scissor.js, bellows.js, wring.js. A list of hits becomes s, a number that's whole exactly on each hit and goes smoothly everywhere,
// so a hit lands to the frame and nothing can jolt: it's made of evalTrack's quintics, C2 even across a change of tempo. Each move is then a pure function of s.
//
//   beatClock(hits, { lead, coast })   hits: seconds on the picture's clock, rising. lead: seconds it takes to get going before the first, from rest. coast: seconds to come to rest after the last, one more whole step on.
//   surged(s, peak)                    s with a surge on it: still whole on every whole s, and there it goes peak times its average speed. It never stops: at peak 1.85 the slowest moment, halfway between hits, is a quarter of the average. Like frontAt in xform/shock.js, but C2.
//   cueHits(m, ctx)                    what a hand cut says, as hits on the picture's clock. 'strong' (the film's own strong beats), 'half' (the 1 and 3), 'bar', 'beat', or a list of song seconds.
//   handClock(ctx, ghost)              s for a pattern picked by hand, which has no list of hits: the song's strong beats if one's playing, and otherwise phi, so it still marches with no song at all.
import { evalTrack } from '../curves.js';
import { drawnScore } from '../drawing.js';

export const PEAK = 1.85;
export const CALM = 0.12;    // how much of the song's own strong beats (the rings of line weight) and its lung a riot move leaves on: the move is the beat, and two of them fight. The tune and the chords stay

// One step, fastest at both ends. The same quintic as evalTrack with v0 = v1 = p.
export const stepOf = (u, p = PEAK) => u * (p + u * u * ((10 - 10 * p) + u * ((15 * p - 15) + u * (6 - 6 * p))));
export function surged(s, p = PEAK) { const k = Math.floor(s); return k + stepOf(s - k, p); }

// How fast it crosses a hit, given the slopes either side. The faster of the two, or the fastest frame slides off the hit into the shorter gap. A quintic can only go twice its slope before it starts to go back, so where the rhythm changes by more than that it's twice the slower.
const across = (a, b) => Math.min(Math.max(a, b), 2 * Math.min(a, b));

export function beatClock(hits, { lead = 0, coast = 0 } = {}) {
  const n = hits.length, gap = i => hits[i + 1] - hits[i], P = n > 1 ? (hits[n - 1] - hits[0]) / (n - 1) : 1;
  const knots = hits.map((t, i) => ({ t, x: i, v: i === 0 ? 1 / (n > 1 ? gap(0) : P) : i === n - 1 ? 1 / gap(n - 2) : across(1 / gap(i - 1), 1 / gap(i)) }));
  if (lead > 0) knots.unshift({ t: hits[0] - lead, x: -Math.min(0.5, lead / P * 0.5), v: 0 });
  if (coast > 0) knots.push({ t: hits[n - 1] + coast, x: n, v: 0 });
  return knots;
}

// A pick has no list, and its drive only gets a gesture, a time and phi. The film's strong beats aren't on any of those, so this one reads them off the film being drawn (src/score/drawing.js):
// it's the same numbers for the whole of a song, so a seek or a rehearsal gets the same picture. With no song, or in node, it goes by phi. The clock's memoised by the pulses themselves.
let seen = null, seenClock = null;
export function handClock({ t, phi, G }, ghost = 6) {
  G.calm ??= CALM;
  const P = drawnScore()?.react?.pulses;
  if (!P || P.length < 2) return phi * ghost;
  if (seen !== P) { seen = P; seenClock = beatClock(P); }
  return evalTrack(seenClock, t);
}

// A hand cut's hits, on the picture's clock. spec: 'strong' (the film's own strong beats), 'half' (the 1 and 3, or the 1 in 3/4), 'bar', 'beat', or a list of song seconds. from, to: on the picture's clock.
// Song seconds go through score.time, because a rest holds the picture's clock back.
export function hitsFor(spec, { score, A, from = -Infinity, to = Infinity }) {
  const time = score?.time ?? (x => x), beats = Array.from(A?.beats ?? []), meter = A?.meter || 4, downs = Array.from(A?.barBeats ?? []), first = downs[0] ?? 0, every = meter === 3 ? 3 : 2;
  const of = {
    strong: () => score?.react?.pulses ?? [],
    beat: () => beats,
    bar: () => downs.map(b => beats[b]).filter(x => x != null),
    half: () => beats.filter((_, b) => ((b - first) % every + every) % every === 0),
  };
  const list = Array.isArray(spec) ? spec : (of[spec] ?? of.strong)();
  return apart(Array.from(list).map(time).filter(t => t >= from - 1e-3 && t <= to + 1e-3));
}
// A rest holds the picture's clock, so every beat in one lands on the same moment. Those aren't hits: the picture's stopped.
export function apart(hits) {
  const gaps = hits.slice(1).map((t, i) => t - hits[i]).sort((a, b) => a - b), least = (gaps[gaps.length >> 1] ?? 1) * 0.3, out = [];
  for (const t of hits) if (!out.length || t - out[out.length - 1] >= least) out.push(t);
  return out;
}

// What every riot move's cue(m, ctx) shares, for src/score/cut.js: makes m.beats the hits. A shot says
//   beats: 'half'                           or 'strong', 'bar', 'beat', or a list of song seconds
//   times: { from: 70.07, to: 85.4 }        where it runs, song seconds. Default the whole of the shot's body
//   lead, coast                             bars to get going before the first hit, and to come to rest after the last. Default 1 and 2
// Answers null if there's nothing to hit, which cut.js logs as a refusal.
export function cueHits(m, { score, A, G, at, bar }, extra = []) {
  const own = G.pattern[m.id];      // what the pattern says about this move, unless the shot says otherwise
  if (own) for (const k in own) if (m[k] === undefined && !k.startsWith('_')) m[k] = own[k];
  const from = m.from ?? G.t0, to = m.to ?? G.arcEnd ?? G.t1;
  let hits = Array.isArray(m.beats) ? m.beats.map(at).filter(t => t >= from - 1e-3 && t <= to + 1e-3) : hitsFor(m.beats ?? 'strong', { score, A, from, to });
  // A hit named for itself lands even if the list didn't have it
  for (const t of extra) if (!hits.some(h => Math.abs(h - t) < 0.12)) hits.push(t);
  hits = apart(hits.sort((a, b) => a - b));
  if (hits.length < 2) return null;
  m.beats = hits;
  m.lead = Math.min((m.lead ?? 1) * bar, Math.max(hits[0] - G.t0, 0));
  m.coast = (m.coast ?? 2) * bar;
  G.calm ??= m.calm ?? CALM;
  return m;
}

export function clockOf(m) {
  if (!m._clock) m._clock = beatClock(m.beats, { lead: m.lead ?? 0, coast: m.coast ?? 0 });
  return m._clock;
}

// A share of a whole that eases in over the lead and out over the coast, or a lane [[t, x], ...] that a cut gave. For a move that has to start and end as the plain pattern.
export function ampOf(m, whole = 1) {
  if (Array.isArray(m.amp)) { const K = m.amp.map(([t, x]) => ({ t, x, v: 0 })); return t => evalTrack(K, t); }
  const n = m.beats.length, P = n > 1 ? (m.beats[n - 1] - m.beats[0]) / (n - 1) : 1, L = m.lead || P, C = m.coast || P, a = m.beats[0] - L, b = m.beats[n - 1] + C, A = m.amp ?? whole;
  return t => A * ease((t - a) / L) * ease((b - t) / C);
}
const ease = u => { u = Math.min(1, Math.max(0, u)); return u * u * u * (u * (u * 6 - 15) + 10); };
