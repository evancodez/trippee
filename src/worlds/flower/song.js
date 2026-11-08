// What Flower Power hears. One flow clock for the whole film, in rings, locked to the beat: so a line's number never jumps at a landing, and every line was born at one moment of the song.
import { clockOf } from '../../score/compose.js';
import { surgedBeats } from '../../score/react.js';
import { groundOf, SETS } from './inks.js';
import { FLOW } from './patterns.js';

const RING_MOST = 1.25;         // rings a second. The plan's limit is 1.5, but where bands are as big as a tile each ring going by is a flash there, and a Bud's push comes on top. Any higher reads two a second on tiles all through the film.
export const beatsPerRing = A => {
  const rate = (A.bpm || 120) / 60, opts = (A.meter || 4) === 3 ? [1, 3, 6, 12] : [1, 2, 4, 8];
  return opts.find(n => rate / n <= RING_MOST) ?? opts.at(-1);
};

// The film's clock. phi is cycles of the pattern's flow, so rings = phi * FLOW.
export function flowClock(score, A) {
  const N = beatsPerRing(A), tau = score.tau, R = score.react;
  return t => surgedBeats(R, tau, t) / N / FLOW;
}

const relMajor = c => (c & 1 ? ((c >> 1) + 3) % 12 : c >> 1);
const fifths = (from, to) => { let q = (((to - from) * 7) % 12 + 12) % 12; if (q > 6) q -= 12; return q; };
const memo = new WeakMap();

// For every ring of the song, when it's born, what it wears: { bloom, ground } by ring number.
// A poster has few inks. So a song's tune gets five blooms and no more: its five commonest notes, each by its place round the circle of fifths from the commonest, and any other note takes the ink of its nearest neighbour on the circle.
// A ring wears the note that held through the moment it was born, and it takes more than a passing note to change that. The ground changes only every BLOCK rings, whichever chord had most of them, or it's confetti.
const BLOCK = 4, KEEP = 0.34;
export function hearSong(A, M) {
  if (memo.has(A)) return memo.get(A);
  const N = beatsPerRing(A), { tau } = clockOf(A), home = M?.home ?? { c: (A.key ?? 0) * 2, minor: 0 };
  const fps = A.fps, frameAt = t => Math.max(0, Math.min(A.pitch.length - 1, Math.round(t * fps)));
  const runs = M?.runs ?? [];
  const chordAt = t => { let lo = 0, hi = runs.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (runs[m].t0 <= t) lo = m; else hi = m - 1; } return runs[lo]?.c ?? (A.chord?.[Math.min(A.chord.length - 1, Math.floor(t * fps / (A.chordStep || 1)))] ?? home.c); };
  const end = A.duration, rings = Math.ceil(tau(end) / N) + 1, bloom = new Int8Array(rings), ground = new Int8Array(rings), when = new Float32Array(rings);
  // The tune's own notes, by how much they're sung
  const heard = new Float32Array(12);
  for (let f = 0; f < A.pitch.length; f += 2) if (A.voiced[f] > 0.35) heard[((Math.round(A.pitch[f]) % 12) + 12) % 12]++;
  const byUse = [...heard.keys()].sort((p, q) => heard[q] - heard[p]), centre = heard[byUse[0]] > 0 ? byUse[0] : home.c >> 1;
  const on = byUse.slice(0, 5).map(pc => ({ pc, q: fifths(centre, pc) })).sort((p, q) => Math.abs(p.q) - Math.abs(q.q) || q.q - p.q);
  // The commonest is lemon, and then outward: tangerine, hot pink, rose, with lime for the one the far way round the circle
  const inks = on.map((o, i) => (o.q < 0 && i > 0 && !on.slice(0, i).some(x => x.q < 0) ? 7 : [0, 1, 2, 3, 1][i]));
  const inkOfPc = new Int8Array(12);
  for (let pc = 0; pc < 12; pc++) { let best = 0, gap = 99; on.forEach((o, i) => { const d = Math.abs(fifths(o.pc, pc)); if (d < gap) { gap = d; best = i; } }); inkOfPc[pc] = inks[best]; }
  // How many inks a bar can carry: the notes sounding in it (A.x.voices, 2 to 6 at the use), and the ground is one of them. A thin bar wears the commonest few, and a full one all five. With no extras, all five.
  const vox = A.x?.voices, edges = A.x?.barEdges;
  const inksAt = t => {
    if (!vox?.length || !edges) return 5;
    let lo = 0, hi = vox.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (edges[m] <= t) lo = m; else hi = m - 1; }
    return Math.max(1, Math.min(5, Math.round(Math.max(2, Math.min(6, vox[lo]))) - 1));
  };
  const rankOf = k => { const r = inks.indexOf(k); return r < 0 ? 0 : r; };
  let t = 0, last = inkOfPc[centre];
  for (let i = 0; i < rings; i++) {
    while (t < end && tau(t) / N < i) t += 0.01;
    when[i] = t;
    const span = (60 / (A.bpm || 120)) * N, votes = new Float32Array(8);
    for (let d = -0.1 * span; d <= 0.5 * span; d += 0.04) { const f = frameAt(t + d); votes[A.voiced[f] > 0.35 ? inkOfPc[((Math.round(A.pitch[f]) % 12) + 12) % 12] : last] += 1; }
    let top = last, sum = 0;
    for (let k = 0; k < 8; k++) { sum += votes[k]; if (votes[k] > votes[top]) top = k; }
    if (votes[last] < KEEP * sum) last = top;
    const room = inksAt(t);
    bloom[i] = rankOf(last) < room ? last : inks[room - 1];
  }
  for (let b = 0; b < rings; b += BLOCK) {
    const share = new Map();
    for (let i = b; i < Math.min(rings, b + BLOCK); i++) { const c = chordAt(when[i]); share.set(c, (share.get(c) ?? 0) + 1); }
    let c = home.c, top = 0;
    for (const [k, v] of share) if (v > top) { top = v; c = k; }
    const g = groundOf(fifths(relMajor(home.c), relMajor(c)), (c & 1) !== 0);
    for (let i = b; i < Math.min(rings, b + BLOCK); i++) ground[i] = g;
  }
  const out = { bloom, ground, when, rings, N, inks, on: on.map(o => o.pc), id: A.hash ?? String(A.duration), set: setsOf(A, M, when, rings), ...buzzOf(A, M) };
  // The whoa: the buzz stops dead, and the next ring out is in another set altogether.
  const w = whoaOf(out, M);
  if (w) { const at = when.findIndex(x => x >= w.t), was = out.set[at], to = was === 4 ? 1 : 4; for (let i = at; at >= 0 && i < Math.min(rings, at + 16) && out.set[i] === was; i++) out.set[i] = to; }
  memo.set(A, out);
  return out;
}

// Which set of inks each ring is born in. A new set comes in where the song arrives somewhere, the bigger the arrival the stronger the set, and it's never long without one. It's the ring that's born in it, so it comes out of the flowers and takes a few seconds to reach the corners.
const APART = 16, LONGEST = 26;       // seconds between one set and the next
const BY_SIZE = [4, 1, 3, 0, 5, 2];     // acid, pop and day-glo for the biggest arrivals, cosmic for the least
function setsOf(A, M, when, rings) {
  const set = new Int8Array(rings), end = A.duration, picked = [];
  for (const a of M?.arrivals?.(0.25) ?? []) if (a.t > 8 && a.t < end - 8 && picked.every(p => Math.abs(p.t - a.t) >= APART)) picked.push(a);
  const bars = M?.bars ?? [];
  picked.sort((p, q) => p.t - q.t);
  const all = [{ t: 0, a: 0 }, ...picked, { t: end, a: 0 }], plan = [];
  all.forEach((p, i) => {
    plan.push(p);
    const n = all[i + 1];
    if (!n) return;
    const gaps = Math.floor((n.t - p.t) / LONGEST);
    for (let k = 1; k <= gaps; k++) { const want = p.t + (k * (n.t - p.t)) / (gaps + 1), bar = bars.length ? bars.reduce((b, x) => (Math.abs(x - want) < Math.abs(b - want) ? x : b), bars[0]) : want; plan.push({ t: bar, a: 0.2 }); }
  });
  // The strength of an arrival picks the set, but never the one that's up, or the one before it.
  let cur = 0, prev = -1;
  const onSet = plan.map((p, i) => {
    if (i === 0) return { t: 0, s: 0 };
    const order = p.a >= 0.6 ? BY_SIZE : p.a >= 0.35 ? [1, 3, 5, 0, 4, 2] : [5, 0, 3, 1, 2, 4], s = order.find(x => x !== cur && x !== prev) ?? 0;
    prev = cur; cur = s;
    return { t: p.t, s };
  });
  let k = 0;
  for (let i = 0; i < rings; i++) { while (k + 1 < onSet.length && onSet[k + 1].t <= when[i]) k++; set[i] = Math.min(onSet[k].s, SETS.length - 1); }
  return set;
}

// The buzz: harmony's pull as how close the inks' luminances are. It builds slowly, and a cadence stills it, dead, on the chord. It's never held for long: past HOLD bars on one chord it eases off, because held, it hurts.
const HZ = 20, HOLD = 8, DEAD = 0.14;
const up = (x, a, b) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
export const pullOf = (M, c) => up(M.tension?.(c) ?? 0, 0.45, 1.25);       // a relative minor is no pull at all, and a step or two round the circle is
function buzzOf(A, M) {
  const n = Math.ceil(A.duration * HZ) + 2, buzz = new Float32Array(n), cadences = [];
  const runs = (M?.runs ?? []).filter(r => r.t1 - r.t0 >= 1.2), bar = M?.bar ?? 2;
  if (!runs.length) return { buzz, cadences };
  const merged = [];
  for (const r of runs) { const l = merged.at(-1); if (l && l.c === r.c) l.t1 = r.t1; else merged.push({ ...r }); }
  let v = 0;
  merged.forEach((r, k) => {
    const want = pullOf(M, r.c), from = v, i0 = Math.round(r.t0 * HZ), i1 = Math.min(n, Math.round((merged[k + 1]?.t0 ?? A.duration) * HZ));
    const falling = want < from - 0.02, dead = falling && want < 0.3 && from > 0.35, rise = 2 * bar, fall = dead ? DEAD : M.beat ?? 0.5;
    if (dead) cadences.push({ t: r.t0, from, to: want, held: k ? merged[k - 1].t1 - merged[k - 1].t0 : 0 });
    for (let i = i0; i < i1; i++) {
      const e = i / HZ - r.t0, x = Math.min(1, e / (falling ? fall : rise)), ease = x * x * (3 - 2 * x);
      v = from + (want - from) * (falling && dead ? x : ease);
      const over = (e - HOLD * bar) / (2 * bar);
      if (over > 0) v *= 1 - 0.65 * Math.min(1, over) * Math.min(1, over);
      buzz[i] = v;
    }
  });
  buzz.fill(v, Math.min(n, Math.round(merged.at(-1).t1 * HZ)));
  return { buzz, cadences };
}
export const buzzAt = (song, t) => { const x = Math.max(0, Math.min(song.buzz.length - 1.001, t * HZ)), i = Math.floor(x); return song.buzz[i] + (song.buzz[i + 1] - song.buzz[i]) * (x - i); };

// The whoa: the cadence that lets go of the most, after the longest pull.
export function whoaOf(song, M) {
  const room = c => c.t > 12 && c.t < (M?.duration ?? Infinity) - 6;
  const best = [...song.cadences].filter(room).sort((p, q) => q.from * Math.min(q.held, 16) - p.from * Math.min(p.held, 16))[0];
  return best ? { t: best.t, before: 12, after: 6, why: `the buzz stops dead: the strongest cadence, from ${best.from.toFixed(2)} after ${best.held.toFixed(1)} s` } : null;
}
