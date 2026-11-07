// Composing a film from a song's analysis. A pure function of (analysis, seed, opts): no audio, no clock, no Math.random.
//
// Long gestures, each transforming into the next exactly on one of the song's structural moments. A few families of pattern, one for
// each kind of section, and sections that come back move for move with one thing changed. Flow is locked to the beat clock and surges
// on it. Moment by moment the pulse, the melody and the tone act on the sheet (see react.js).
//
// What it reads from understand() (flag `form`, and all of it falls back if the song gave nothing to go on): gestures end on breaths, arrivals and the tonic coming home, and a landing near a rest
// moves to it, so the film stops on the new world. A gesture's zoom follows whether the song's growing or fading across it, a flight goes in where the song arrives somewhere and out where it falls
// away, loud stretches change world more often and quiet ones flow at half speed. Everything breathes: a threshold swell on each breath, or its own clock put on the breath if it swings by itself.
// Which pattern goes where (flag `spread`) is scored against what the film has had so far, so it can't sit in one family or one look.
import { rng, clamp, lerp, smoother, evalTrack } from './curves.js';
import { buildReact, surgedBeats, makeWalk } from './react.js';
import { buildTime } from './time.js';
import { direct } from './direct.js';
import { applyCut } from './cut.js';
import { flag, flags, hearing, hearOn, directing } from './flags.js';
import { readPace } from './pace.js';
import { understand } from '../music/understand.js';
import { base } from './slot.js';
import { OFF, SLOT_FLOATS } from '../pattern/layout.js';

// form: the film's form follows what understand() heard: breaths, arrivals, rests. spread: a film goes round the worlds, and no one of them takes it over.
flags.form ??= true;
flags.spread ??= true;

const AFFINITY = {          // slide, perc, tempo, harmRate
  lattice: [0, 0.8, 0.6, 0.5], poles: [1, 0, 0.3, 0.2], pole: [1, 0, 0.3, 0.2], rooms: [0.2, 0.7, 0.8, 0.6], room: [0.2, 0.7, 0.8, 0.6],
  lines: [0.8, 0.2, 0.3, 0.4], stripe: [0.8, 0.2, 0.3, 0.4], dots: [0.2, 0.2, 0.5, 0.7], bodies: [0.4, 0.5, 0.4, 0.3], body: [0.4, 0.5, 0.4, 0.3],
  checks: [0.3, 0.7, 0.6, 0.6], check: [0.3, 0.7, 0.6, 0.6], voids: [0.5, 0.3, 0.2, 0.3], waves: [0.9, 0.1, 0.3, 0.2],
};
const LENGTHS = { TARGET: 24, LMIN: 12, LMAX: 42 };      // gesture length, seconds
const BREATH_ON = 1.2, BREATH_HALF = 0.25, HOME_ON = 0.4, ARRIVE_NEAR = 0.5, ARRIVE_PEAK = 2.5;     // what a landing earns for falling on the song's form
const LONG_WHEN_QUIET = 1.3, SHORT_WHEN_LOUD = 0.85;
const HIT_REACH = [-1, 1, 2], HIT_BETTER = 1.35, HIT_MORE = 0.25;     // beats a landing can move to find the hit, how many times stronger that has to be, and by how much (a hit is bass + percussion, 0..2)
const ONE_MORE = 3;        // what another landing has to be worth. Most bars are something now, and without this a film would land on all of them
const REST_ROOM = 8;       // seconds, the shortest gesture a landing moved to a rest can leave behind it
const MORPHS = { MORPH_SHORTEST: 6.5, MORPH_LONGEST: 14 }, MORPH_AFTER_REST = 5.5;      // seconds
const ZOOM_FOLLOWS = 0.035;      // how much the energy has to change across a gesture for the zoom to follow it
const STRIPES_CYCLE = 3;   // seconds
const QUIET_ON = 0.1, QUIET_OFF = 0.35;      // of the way from the song's lower quartile of energy to its upper
const SWELL = 0.18;        // how far the threshold moves on a breath, of solid and per family, on top of the song's lung

// ---------------------------------------------------------------- hearing 11
// The flow turns round on the song's rarest chord: it slows, runs backward with the chord at the middle of that, and comes round again. What that loses it pays back over the next three bars, so nothing's different afterwards.
// Never in a hero, a transformation or a rest. Only ever a lag, like the rests: nothing that lands has moved.
const TURN_BACK = 1.6;       // speed taken off at the middle of it: 1 - this is how fast it runs backward
function surpriseTurns(film, M) {
  const W = Math.max(M.bar, 1.4), P = 3 * W, busy = (a, b) => (film.cast ?? []).some(h => a < h.t1 && b > h.t0) || film.gestures.some(G => G.morph && a < G.t1 && b > G.t1 - G.morph) || M.rests.some(r => a < r.b + 1 && b > r.a - 1);
  const at = M.surprises.filter(s => !busy(s.t - W / 2, s.t + W / 2));       // the paying back can go on under anything: it's only a clock running a little fast
  const lost = TURN_BACK * W / 2;
  const sin2Int = x => x / 2 - Math.sin(2 * Math.PI * x) / (4 * Math.PI);       // the integral of sin^2(pi x)
  const turn = t => {
    for (const { t: T } of at) {
      const a = T - W / 2, b = a + W, e = b + P;
      if (t <= a || t >= e) continue;
      return t < b ? -TURN_BACK * W * sin2Int((t - a) / W) : -lost + (lost / 0.5) * sin2Int((t - b) / P);
    }
    return 0;
  };
  return { turn, at };
}

// ---------------------------------------------------------------- the clock
// tau(t): beats since the start, closed form from the analysis table (Catmull-Rom at 100 Hz). Linear past both ends.
export function clockOf(A) {
  const T = A.tau, n = T.length, hz = A.tauHz || 100, span = Math.min(200, n - 1);
  const r0 = (T[span] - T[0]) * hz / span, r1 = (T[n - 1] - T[n - 1 - span]) * hz / span;
  const tau = t => {
    const x = t * hz;
    if (x <= 1) return T[1] + (t - 1 / hz) * r0;
    if (x >= n - 2) return T[n - 2] + (t - (n - 2) / hz) * r1;
    const i = Math.floor(x), f = x - i, a = T[i - 1], b = T[i], c = T[i + 1], d = T[i + 2];
    return b + 0.5 * f * (c - a + f * (2 * a - 5 * b + 4 * c - d + f * (3 * (b - c) + d - a)));
  };
  const rate = t => { const i = clamp(Math.round(t * hz), 0, A.rate.length - 1); return A.rate[i] || 2; };
  return { tau, rate };
}

// ---------------------------------------------------------------- reading a pattern
const arcValue = (arcs, path, u, dflt) => {
  let v = dflt;
  for (const a of arcs) {
    if (a.path !== path) continue;
    const k = a.ease === 'wave' ? 0.5 - 0.5 * Math.cos(u * Math.PI * 2 * (a.cycles || 1)) : smoother(a.at ? clamp((u - a.at[0]) / (a.at[1] - a.at[0])) : u);
    v = a.log ? a.from * Math.pow(a.to / a.from, k) : lerp(a.from, a.to, k);
  }
  return v;
};

// How far one cycle of Phi moves an edge, in frame widths, at scale 1
function lambdaOf(pat, aspect) {
  const flow = pat.flow || {}, w = 2 * aspect;
  let lam = 0, mMax = 0;
  for (const key in flow) {
    const m = /^f(\d)\.ph$/.exec(key);
    if (!m) continue;
    const c = Math.abs(flow[key]);
    mMax = Math.max(mMax, c);
    const fam = (pat.g.fams || [])[+m[1]] || {};
    const k = Math.hypot(fam.x || 0, fam.y || 0, fam.z || 0), r = Math.abs(fam.r1 || 0) + Math.abs(fam.r2 || 0), l = Math.abs(fam.l1 || 0) + Math.abs(fam.l2 || 0), tt = Math.abs(fam.t1 || 0) + Math.abs(fam.t2 || 0);
    const period = k > 0 ? 1 / k : r > 0 ? 1 / r : l > 0 ? 0.7 / l : tt > 0 ? (2 * Math.PI * 0.7) / tt : 0.3;
    lam = Math.max(lam, (period / w) * c);
  }
  if (pat.lambda) lam = pat.lambda * Math.max(mMax, 1);
  return lam || 0.1;
}

// Gears: the smallest N (one element passes per N beats) that keeps edges at or under 10% of the frame per second.
function gearFor(lamEff, rate, meter) {
  const G = meter === 3 ? [1, 3, 6, 12, 24, 48, 96, 192] : [1, 2, 4, 8, 16, 32, 64, 128];
  for (const N of G) if (N / rate >= 0.5 && lamEff * rate / N <= 0.10) return N;
  return G[G.length - 1];
}

// Few wide lines: at most about this many cycles per picture unit on the pattern's own numbers.
const BOLD_STRIPES = 4;
const WALK_MORPH = 0.7;     // how much of the stride a transformation takes, where it takes any
const boldStripes = pat => {
  const f = (pat.g.fams || []).find(x => Math.abs(x.d ?? 0) <= 1.01) || {}, k = Math.hypot(f.x || 0, f.y || 0) + Math.abs(f.r1 || 0) + Math.abs(f.r2 || 0);
  return k * (pat.g.freq ?? 1) / Math.max(pat.g.scale ?? 1, 1e-3) <= BOLD_STRIPES;
};

const percentile = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };
const median = a => percentile(a, 0.5);

// ---------------------------------------------------------------- what kind of world a pattern is
// How hard-edged a family reads: a loud section wants a hard world and a quiet one a liquid one.
const HARD = { lattice: 0.85, checks: 0.75, check: 0.75, rooms: 0.7, room: 0.7, body: 0.55, bodies: 0.55, riley: 0.5, void: 0.4, voids: 0.4, impossible: 0.4, dots: 0.35, lines: 0.25, stripe: 0.25, waves: 0.2, pole: 0.15, poles: 0.15 };
// What the eye reads, whichever family it's filed under: a checker on a globe is still a checker.
export const lookOf = p => {
  const real = (p.g.fams || []).filter(f => Math.abs(f.d ?? 0) <= 1.01).length;
  return (p.g.round ?? 0) > 0.5 ? 'dots' : real <= 1 ? 'lines' : real === 2 ? 'checks' : 'lattice';
};
const SHARE = { family: 0.28, primary: 0.33, looks: { checks: 0.38, lines: 0.5, dots: 0.28, lattice: 0.34 }, appearances: 2 };
const scaleTravel = p => { const s = (p.arcs || []).find(x => x.path === 'scale'); return s && s.from > 0 && s.to > 0 ? Math.abs(Math.log(s.to / s.from)) : 0; };

// Where on its clock a pattern that breathes is at its whitest, so that it can be there on the breath, when the song's own lung is thinning the threshold the same way. Null if it doesn't breathe.
const scratch = new Float32Array(SLOT_FLOATS);
function whitestPhase(pat, G) {
  if (!pat.drive) return null;
  let best = 0, top = -Infinity, low = Infinity, turns = false;
  const at = phi => { scratch.set(base(pat)); pat.drive(scratch, { u: 0.5, t: G.t0, phi, OFF, G }); return scratch[OFF.sum]; };
  try {
    for (let i = 0; i < 16; i++) {
      const v = at(i / 16);
      if (v > top) { top = v; best = i / 16; }
      low = Math.min(low, v);
      if (Math.abs(v - at(i / 16 + 1)) > 1e-6) turns = true;
    }
  } catch { return null; }
  // One that only comes round every other cycle (a Snap) goes the other way at each whole cycle, and that's the moment it's built around: that's what goes on the breath.
  return top > low ? (turns ? 0 : best) : null;
}

// ---------------------------------------------------------------- the whole film
export function compose(A, seed = 1, opts = {}) {
  // A world may go about things at its own pace. All of these are a film's own otherwise.
  const pace = opts.world?.motion;
  let { TARGET, LMIN, LMAX } = pace?.len ? { TARGET: (pace.len[0] + pace.len[1]) / 2, LMIN: pace.len[0], LMAX: pace.len[1] } : LENGTHS;
  const { MORPH_SHORTEST, MORPH_LONGEST } = pace?.morph ? { MORPH_SHORTEST: pace.morph[0], MORPH_LONGEST: pace.morph[1] } : MORPHS;
  // The seed and the song together: the same seed on two songs shouldn't pick the same things.
  let songHash = 0;
  for (const c of String(A.hash ?? A.duration)) songHash = (Math.imul(songHash, 31) + c.charCodeAt(0)) >>> 0;
  const rand = rng(((seed | 0) * 7919 + songHash) >>> 0);
  // What the song is, as a listener hears it. Neutral means there's nothing to go on, and the film falls back on the analysis's own phrases.
  // What this film hears, on top of what it always has. Read once, here. With none of them on nothing below has changed. docs/MODES.md section 6.
  const ears = {};
  for (const id in hearing) ears[id] = hearOn({ world: opts.world }, id);
  ears.depth = opts.world?.hear?.depth ?? 1;        // docs/MODES.md's table: how deep this world walks
  const M = understand(A, ears), form = flag('form') && !M.neutral && M.breath.beats > 0, spread = flag('spread');
  const time = buildTime(M);
  // Pace (src/score/pace.js). A hand cut says all this for itself. With it off, nothing below has changed.
  const P = form && directing.pace && !opts.cut ? readPace(A, M, { seed, songHash, library: opts.patterns ?? globalThis.app?.patterns ?? [], world: opts.world }) : null;
  if (P) { LMIN = P.least; LMAX = P.most; }
  const library = opts.patterns ?? globalThis.app?.patterns ?? [];
  // pool:false stays in the library to be picked by hand, and out of films
  const inPool = library.filter(p => p.pool !== false);
  const patterns = flag('pool') && inPool.length ? inPool : library;
  if (!patterns.length) throw new Error('compose: no patterns');
  const aspect = opts.aspect ?? 16 / 9;
  const { tau, rate } = clockOf(A);
  const meter = A.meter || 4, bars = A.bars, duration = A.duration, fps = A.fps;
  const beatsArr = A.beats;
  const segAt = t => A.segments.find(s => t >= s.t0 && t < s.t1) ?? A.segments[A.segments.length - 1];
  const Eat = t => A.E[clamp(Math.round(t * fps), 0, A.E.length - 1)];
  const meanE = (a, b) => { let s = 0, c = 0; for (let t = a; t < b; t += 0.1) { s += Eat(t); c++; } return c ? s / c : 0; };
  // Where is this moment's first visit? (Identity outside a repeat.)
  const canonTime = t => {
    const b = tau(t), i = Math.floor(b), f = b - i;
    if (i < 0 || i >= A.canon.length - 1) return t;
    const c = A.canon[i];
    if (c === i) return t;
    const c1 = Math.min(beatsArr.length - 1, c + 1);
    return beatsArr[c] + f * (beatsArr[c1] - beatsArr[c]);
  };

  // ----- 1. One family per song
  const byFam = new Map();
  for (const p of patterns) { if (!byFam.has(p.family)) byFam.set(p.family, []); byFam.get(p.family).push(p); }
  const ch = A.character || { slide: 0, perc: 0, tempo: 0, harmRate: 0 };
  const scored = [...byFam.keys()].map(f => {
    const aff = AFFINITY[f] || [0.3, 0.3, 0.3, 0.3];
    // A weighted mean of the song's character, so no family wins just by having larger numbers; the seed moves it a good way.
    let s = (aff[0] * ch.slide + aff[1] * ch.perc + aff[2] * ch.tempo + aff[3] * ch.harmRate) / (aff[0] + aff[1] + aff[2] + aff[3]) + 0.3 * rand();
    if (f === 'dots' && A.swellRegularity > 0.5) s += 0.5;
    const n = byFam.get(f).length;
    s += n < 3 ? -0.6 : Math.min(n, 10) * 0.02;
    return { f, s };
  }).sort((a, b) => b.s - a.s);
  const given = typeof opts.pattern === 'string' ? library.find(p => p.id === opts.pattern) : opts.pattern;
  const family = given?.family ?? (opts.family && byFam.has(opts.family) ? opts.family : scored[0].f);
  const shuffled = list => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  let pool = shuffled(byFam.get(family) || []);
  if (given) pool = [given, ...pool.filter(p => p !== given)];
  // A family still being written may be small: borrow from the next nearest, keeping its own first.
  for (const { f } of scored) { if (pool.length >= 3) break; if (f !== family) pool.push(...shuffled(byFam.get(f))); }

  // ----- 2. Landings: DP over the bar lines
  const tEnd = (() => {     // the last moment with sound; after that the film rests
    let t = duration;
    while (t > 1 && Eat(t) < 0.04) t -= 0.25;
    return Math.min(duration, t + 0.25);
  })();
  const mod = (x, n) => ((x % n) + n) % n;
  // A beat's place in its breath. In beats, not bars: the bar line wanders on some songs (mgmt's has nine two-beat bars in it) and the harmony's loop doesn't.
  const breathPlace = b => mod(b - M.breath.offset, M.breath.beats);
  const peaks = new Map(form ? M.arrivals(0.3).map(p => [p.bar, p.a]) : []);
  const nov = A.novelty, nm = nov.reduce((s, v) => s + v, 0) / Math.max(nov.length, 1);
  const nsd = Math.sqrt(nov.reduce((s, v) => s + (v - nm) ** 2, 0) / Math.max(nov.length, 1)) || 1;
  const nodes = [{ t: 0, S: 0, bar: -1 }];
  const boundaryAt = b => { let hit = null; A.segments.forEach((s, i) => { if (i > 0 && Math.abs(s.b0 - b) <= 1) hit = { s, prev: A.segments[i - 1] }; }); return hit; };
  // Every bar line is somewhere to land, and so is every breath, where the bar line has wandered away from it
  const places = Array.from(bars, (t, i) => ({ t, i, b: A.barBeats[i] }));
  if (form) {
    const near = t => { let lo = 0, hi = bars.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (bars[m] <= t) lo = m; else hi = m - 1; } return lo + 1 < bars.length && bars[lo + 1] - t < t - bars[lo] ? lo + 1 : lo; };
    for (let b = M.breath.offset; b < beatsArr.length; b += M.breath.beats) {
      const t = beatsArr[b], i = near(t);
      if (Math.abs(bars[i] - t) > 0.05) places.push({ t, i, b, off: true });
    }
    places.sort((x, y) => x.t - y.t);
  }
  for (const { t, i, b, off } of places) {
    if (t < 6 || t > tEnd - 6) continue;
    const bar = meter / Math.max(rate(t), 0.5);
    let nv = 0;
    for (let k = -1; k <= 1; k++) nv = Math.max(nv, nov[clamp(b + k, 0, nov.length - 1)] || 0);
    const nz = clamp((nv - nm) / nsd, 0, 3);
    const dE = meanE(t, t + 2 * bar) - meanE(t - 2 * bar, t);
    const hit = off ? null : boundaryAt(b);      // a section change lands on its own bar line
    const lc = hit ? (hit.s.label !== hit.prev.label ? 1 : 0.4) : 0;
    const ph = ((i - (A.phrase0 || 0)) % (A.phraseBars || 8) + (A.phraseBars || 8)) % (A.phraseBars || 8);
    let pb = ph === 0 ? 0.6 : ph === (A.phraseBars || 8) / 2 ? 0.2 : 0, peak = 0;
    if (form) {
      // A gesture ends where the harmony comes round. Then a flow locked to the beat comes round there too.
      pb = breathPlace(b) === 0 ? BREATH_ON : breathPlace(b) === M.breath.beats / 2 ? BREATH_HALF : 0;
      peak = off ? 0 : peaks.get(i) ?? 0;
      // Coming home is somewhere to arrive: the harmony gets back to its tonic right here
      if (M.runs.some(r => r.c === M.home.c && Math.abs(r.t0 - t) < M.beat)) pb += HOME_ON;
      pb += ARRIVE_NEAR * (M.arrival[i] ?? 0) + ARRIVE_PEAK * peak;
    }
    nodes.push({ t, bar: i, b, S: nz + 2 * Math.abs(dE) + 2 * lc + pb, boundary: !!hit, dE, peak });
  }
  nodes.push({ t: tEnd, S: 0, bar: -2 });
  const inner = nodes.slice(1, -1).map(n => n.S);
  const mandatory = percentile(inner, 0.85);

  // The bigger the song is at the moment, the more often the world changes: loud gestures run shorter, quiet ones longer, so the film's pace goes with the song's.
  const eOverall = form ? Array.from({ length: Math.floor(tEnd * 2) }, (_, i) => Eat(i / 2)) : [], eMin = percentile(eOverall, 0.1), eMax = percentile(eOverall, 0.9);
  const lengthWanted = (t0, t1) => {
    if (!form) return TARGET;
    if (P) return P.want((t0 + t1) / 2);
    const q = clamp((Eat((t0 + t1) / 2) - eMin) / Math.max(eMax - eMin, 1e-3));
    return TARGET * lerp(LONG_WHEN_QUIET, SHORT_WHEN_LOUD, q);
  };
  const solve = bonus => {
    const n = nodes.length, best = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1);
    best[0] = 0;
    for (let widen = 1; widen < 8 && !Number.isFinite(best[n - 1]); widen *= 1.5) {
      for (let j = 1; j < n; j++) {
        for (let i = 0; i < j; i++) {
          const L = nodes[j].t - nodes[i].t;
          if (L < LMIN / Math.min(widen, 2) || L > LMAX * widen || !Number.isFinite(best[i])) continue;
          const c = best[i] + (Math.log(L / lengthWanted(nodes[i].t, nodes[j].t)) / (P?.stiff ?? 0.35)) ** 2 - 1.5 * nodes[j].S - bonus[j] + (form ? P?.oneMore ?? ONE_MORE : 0);
          if (c < best[j]) { best[j] = c; from[j] = i; }
        }
      }
    }
    const pick = [];
    for (let j = n - 1; j > 0 && from[j] >= 0; j = from[j]) pick.push(j);
    return pick.reverse();
  };
  const bonus = nodes.map(n => (n.boundary && n.S >= mandatory ? 8 : 0) + (form ? 8 * clamp((n.peak ?? 0) / 0.5) : 0) + (P ? P.dropWorth(n.dE ?? 0, n.bar) : 0));
  // A rest is somewhere to land: the next world arrives and the film stops on it, until the band comes back.
  if (form) for (const r of M.rests) {
    let best = -1, d = 1.5 * M.bar;
    nodes.forEach((n, j) => { if (j && j < nodes.length - 1 && Math.abs(n.t - r.a) <= d) { d = Math.abs(n.t - r.a); best = j; } });
    if (best >= 0) bonus[best] += 20;
  }
  let chosen = solve(bonus);
  // Later visits copy the landings of the first, through the canon map
  const later = t => (segAt(t).visit || 0) > 0;
  const nearChosen = (t, set, tol) => set.some(j => Math.abs(nodes[j].t - t) <= tol);
  {
    const first = chosen.filter(j => !later(nodes[j].t));
    const bonus2 = nodes.map((n, j) => {
      if (j === 0 || j === nodes.length - 1) return 0;
      const bar = meter / Math.max(rate(n.t), 0.5);
      if (!later(n.t)) return bonus[j] + (first.includes(j) ? 4 : 0);
      return bonus[j] + (nearChosen(canonTime(n.t), first, bar * 0.6) ? 6 : -1.5);
    });
    chosen = solve(bonus2);
  }
  let land = [0, ...chosen.map(j => nodes[j].t)];
  if (land[land.length - 1] < tEnd - 1e-3) land.push(tEnd);
  // The bar line wanders on some songs and sits a beat out on others, and everything a film does lands exactly on its landing. So a landing goes where the hit is: the strongest beat from one before to two after,
  // if that's clearly stronger. landedFrom keeps the bar it was chosen for, which is the bar its arrival was measured on.
  const landedFrom = new Map();
  if (flag('onTheHit') && form) {
    const hitAt = t => { let h = 0; for (let d = -0.04; d <= 0.07; d += 0.02) { const i = clamp(Math.round((t + d) * fps), 0, A.E.length - 1); h = Math.max(h, (A.bass?.[i] || 0) + (A.perc?.[i] || 0)); } return h; };
    const beatAt = t => { let lo = 0, hi = beatsArr.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (beatsArr[m] < t) lo = m + 1; else hi = m; } return lo > 0 && t - beatsArr[lo - 1] < beatsArr[lo] - t ? lo - 1 : lo; };
    for (let j = 1; j < land.length - 1; j++) {
      const t = land[j], k = beatAt(t), here = hitAt(t);
      let best = t, top = here;
      for (const d of HIT_REACH) { const b = beatsArr[k + d]; if (b == null) continue; const h = hitAt(b) * (1 - 0.02 * Math.abs(d)); if (h > top) { top = h; best = b; } }
      if (best === t || top < HIT_BETTER * here || top - here < HIT_MORE || best - land[j - 1] < LMIN / 2 || land[j + 1] - best < LMIN / 2) continue;
      land[j] = best; landedFrom.set(best, t);
    }
  }
  // Where the picture's clock isn't the song's: from, a, b, paid
  const lags = form ? time.windows ?? [] : [];
  // A landing near a rest moves to its start, and one that would happen while the clock is still catching up does too. The picture only gets as far as time(a) before the band
  // stops, so that's where it lands: the next world arrives as the film comes to rest, and it stays on it until the band comes back.
  if (lags.length) {
    const moved = [];
    land.forEach((t, j) => {
      const r = j > 0 && j < land.length - 1 ? lags.find(l => t >= l.a - 1.5 * M.bar && t <= Math.max(l.b + 1.5 * M.bar, l.paid)) : null;
      const to = r ? time(r.a) : t, last = moved[moved.length - 1];
      if (last === undefined) { moved.push(to); return; }
      if (to - last >= (P ? P.least : REST_ROOM)) { moved.push(to); return; }
      // Too close to the last one to be a gesture. The one at the rest stays, unless the other's the start of the film, and the film's end is the film's end.
      if ((r || j === land.length - 1) && moved.length > 1) moved[moved.length - 1] = to;
    });
    land = moved;
  }

  // A way of changing runs its stretch of landings together into one gesture, whose steps are those landings
  if (P) land = P.passages(land, segAt, time);

  // ----- 3. Which earlier gesture does each gesture replay?
  const nG = land.length - 1, spec = [];
  for (let k = 0; k < nG; k++) {
    const a = land[k], b = land[k + 1], mid = (a + b) / 2, seg = segAt(mid);
    const out = { k, a, b, seg, replayOf: null };
    if (!P && (seg.visit || 0) > 0) {
      const d = canonTime(mid) - mid, ia = a + d, ib = b + d;
      let bestO = 0, bestK = null;
      for (let q = 0; q < k; q++) {
        const o = Math.min(ib, spec[q].b) - Math.max(ia, spec[q].a);
        if (o > bestO && spec[q].seg.label === seg.label) { bestO = o; bestK = q; }
      }
      if (bestK !== null && bestO >= 0.5 * Math.min(b - a, spec[bestK].b - spec[bestK].a)) out.replayOf = bestK;
    }
    spec.push(out);
  }

  // A few families, not one: each kind of section gets its own, so a song keeps changing character as it goes.
  const famNames = [family, ...scored.map(x => x.f).filter(f => f !== family)].slice(0, 3);
  const poolOf = new Map(famNames.map((f, i) => [f, i === 0 ? pool : shuffled(byFam.get(f) || [])]));
  const labels = [...new Set(A.segments.map(x => x.label))];
  const famForLabel = l => famNames[Math.max(0, labels.indexOf(l)) % famNames.length];
  const cursors = new Map();

  const biggest = [...pool].sort((a, b) => {
    const big = p => { const s = (p.arcs || []).find(x => x.path === 'scale'); return s && s.from > 0 && s.to > 0 ? Math.abs(Math.log(s.to / s.from)) : 0; };
    return big(b) - big(a);
  })[0];
  let cursor = 0, lastPat = null;
  const nextPat = (a, b, label) => {
    if (A.climax >= a && A.climax < b && biggest && biggest !== lastPat) return biggest;
    const f = famForLabel(label), list = poolOf.get(f)?.length ? poolOf.get(f) : pool;
    for (let tries = 0; tries < list.length; tries++) {
      const c = cursors.get(f) ?? 0; cursors.set(f, c + 1);
      const p = list[c % list.length];
      if (p !== lastPat || list.length === 1) return p;
    }
    return list[0];
  };
  // Spread: every pattern in the pool could go here. What's scored is how well it suits this section and how much of the film its world and its look have already had.
  // A section coming back still wears what it wore, so the film goes on making sense; what it doesn't do any more is sit in one world, or one look, for most of the song.
  const spreadPick = () => {
    const pick2 = rng(((seed | 0) * 104729 + songHash) >>> 0);
    const total = Math.max(tEnd, 1), spent = new Map(), looked = new Map(), uses = new Map(), home = new Map();
    const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
    const sLo = Math.min(...scored.map(x => x.s)), sHi = Math.max(...scored.map(x => x.s));
    const liking = new Map(scored.map(x => [x.f, (x.s - sLo) / Math.max(sHi - sLo, 1e-3)]));
    // How big each kind of section is, within this song
    const eOf = new Map();
    for (const l of labels) { let e = 0, d = 0; for (const x of A.segments) if (x.label === l) { e += meanE(x.t0, x.t1) * (x.t1 - x.t0); d += x.t1 - x.t0; } eOf.set(l, d ? e / d : 0); }
    const lo = Math.min(...eOf.values()), hi = Math.max(...eOf.values());
    const loudness = l => (eOf.get(l) - lo) / Math.max(hi - lo, 1e-3);
    const count = q => { add(spent, q.pat.family, q.b - q.a); add(looked, lookOf(q.pat), q.b - q.a); add(uses, q.pat, 1); if (!home.has(q.seg.label)) home.set(q.seg.label, q.pat.family); };
    const choose = (q, prev, prev2) => {
      const len = q.b - q.a, label = q.seg.label, e = loudness(label), first = !home.has(label);
      let best = null, top = -Infinity;
      for (const p of patterns) {
        const f = p.family, look = lookOf(p);
        let s = 0.8 * (liking.get(f) ?? 0) - 1.2 * Math.abs(e - (HARD[f] ?? 0.45));
        if (home.get(label) === f) s += 0.8;
        if (first && f === family && !spent.size) s += 3;      // the film opens in the family it's called after
        if (opts.family === f) s += 1;                         // ...and if that was asked for, it stays nearer to it
        s -= 14 * Math.max(0, ((spent.get(f) || 0) + len) / total - (f === family ? SHARE.primary : SHARE.family));
        s -= 10 * Math.max(0, ((looked.get(look) || 0) + len) / total - (SHARE.looks[look] ?? 0.4));
        if (prev?.family === f) s -= prev2?.family === f ? 4 : 1;
        if (prev && lookOf(prev) === look) s -= prev2 && lookOf(prev2) === look ? 2 : 0.6;
        s -= 1.5 * (uses.get(p) || 0);
        if (p === prev) s -= 10;
        if (A.climax >= q.a && A.climax < q.b) s += 1.5 * clamp(scaleTravel(p) / Math.log(8));
        if (P) s += (prev && P.glides(prev, p) ? 1.2 : 0) - P.fineCost(p, P.parts[q.k].level);
        s += 0.5 * pick2();
        if (s > top) { top = s; best = p; }
      }
      return best;
    };
    let prev = null, prev2 = null;
    for (const q of spec) {
      if (P) {
        q.pat = P.wear(q, P.parts[q.k], prev, () => (q.k === 0 && given ? given : choose(q, prev, prev2))) ?? choose(q, prev, prev2);
        count(q);
        prev2 = prev; prev = q.pat;
        continue;
      }
      const src = q.replayOf !== null ? spec[q.replayOf] : null;
      // A section can come back wearing what it wore, but not for ever: after that, something new from the same world.
      const crowded = src && ((prev?.family === src.pat.family && prev2?.family === src.pat.family) || ((spent.get(src.pat.family) || 0) + q.b - q.a) / total > (src.pat.family === family ? SHARE.primary : SHARE.family) + 0.1);
      if (src && src.pat !== prev && !crowded && (uses.get(src.pat) || 0) < SHARE.appearances) q.pat = src.pat;
      else { q.replayOf = null; q.pat = q.k === 0 && given ? given : choose(q, prev, prev2); }
      count(q);
      prev2 = prev; prev = q.pat;
    }
  };
  // Patterns first, because some of them decide the colour of their own landing
  if (spread) spreadPick();
  else {
    let prev = null;
    for (const q of spec) {
      const src = q.replayOf !== null ? spec[q.replayOf] : null;
      // A section saying the same thing again straight away gets a sibling, not the same picture twice running
      if (src && src.pat !== prev) q.pat = src.pat;
      else { q.replayOf = null; lastPat = prev; q.pat = q.k === 0 && given ? given : nextPat(q.a, q.b, q.seg.label); }
      prev = q.pat;
    }
    lastPat = null;
  }
  const ownMatte = p => !!(p.g.matte || p.g.ribbon || p.g.blobs);

  // ----- 4. What kind of landing, by what the music does
  // Breaks: quiet of at least 2 bars, inside the song
  const p15 = percentile(Array.from({ length: Math.floor(tEnd * 2) }, (_, i) => Eat(i / 2)), 0.15);
  const breaks = [];
  { let s = null; for (let t = 0; t < tEnd; t += 0.25) { const q = Eat(t) <= Math.max(p15, 0.08); if (q && s === null) s = t; if (!q && s !== null) { const bar = meter / Math.max(rate(s), 0.5); if (t - s >= 2 * bar && t - s <= 14 && s > 2) breaks.push({ t0: s, t1: t }); s = null; } } }
  const kindAt = B => {
    const beat = 1 / Math.max(rate(B), 0.5), bar = beat * meter;
    const brk = breaks.find(g => Math.abs(g.t0 - B) < bar * 1.5 || (B >= g.t0 && B < g.t1 - 2));
    const dE = meanE(B, B + 2 * bar) - meanE(B - 2 * bar, B);
    if (brk) return { kind: 'break', holdOut: 0, holdIn: clamp(brk.t1 - B, 0.8, 10), inDur: clamp(bar * 3, 3, 7), beat, bar, dE };
    if (dE < -0.1) return { kind: 'fall', holdOut: 0, holdIn: clamp(bar * 0.35, 0.3, 0.7), inDur: clamp(bar * 5, 4, 9), beat, bar, dE };
    if (dE > 0.1 || (form && dE > 0 && M.arrivalAt(B) >= 0.3)) return { kind: 'rise', holdOut: clamp(beat * 0.75, 0.25, 0.5), holdIn: 0, inDur: clamp(bar * 3, 3, 6.5), beat, bar, dE };
    return { kind: 'level', holdOut: 0.25, holdIn: 0.25, inDur: clamp(bar * 4, 3.5, 8), beat, bar, dE };
  };
  // Landing j is the one at land[j]: j = 0 is the start, j = nG is the end
  const L = land.map((B, j) => (j === 0 ? { B, kind: 'start', holdOut: 0, holdIn: 0, inDur: 6 } : { B, ...kindAt(B) }));
  // The start waits for the first sound
  { let t = 0; while (t < 12 && Eat(t) < 0.06) t += 0.1; L[0].holdIn = t; L[0].inDur = clamp((meter / Math.max(rate(t), 0.5)) * 4, 4, 8); }
  L[nG].kind = L[nG].kind === 'rise' ? 'level' : L[nG].kind;
  L[nG].holdOut = 0;

  // Colour of each solid, and its form. Plain solids stay the rule: at most about a third are hard shapes, never two running.
  L[0].pol = 1;
  let hard = 0, lastHard = -2;
  const allowHard = 0;     // no hard shapes closing over the picture: every change is a morph
  for (let j = 1; j <= nG; j++) {
    const l = L[j], before = spec[j - 1], after = spec[j];
    const src = before.replayOf !== null ? L[before.replayOf + 1] : null;
    const r = rand();
    l.pol = src ? src.pol : l.kind === 'fall' || l.kind === 'break' ? (r < 0.78 ? 1 : -1) : l.kind === 'rise' ? (r < 0.62 ? -1 : 1) : (r < 0.6 ? 1 : -1);
    // Never three of the same colour running: the solids should read as a rhythm of black and white
    if (j >= 3 && L[j - 1].pol === l.pol && L[j - 2].pol === l.pol) l.pol = -l.pol;
    if (j === nG) l.pol = 1;
    // A pattern wearing its own matte times the matte against its own t0 and t1 (see voids.js), so no held solid around it
    if (ownMatte(before.pat)) l.holdOut = 0;
    if (after && ownMatte(after.pat)) l.holdIn = 0;
    const srcEntry = after && after.replayOf !== null ? L[after.replayOf] : null;
    let form = 'duty';
    const room = before.b - before.a, roomNext = after ? after.b - after.a : 0;
    const can = hard < allowHard && j - lastHard > 1 && !ownMatte(before.pat) && !(after && ownMatte(after.pat));
    if (can && src && src.form === 'void' && room >= 13) form = 'void';
    else if (can && srcEntry && srcEntry.form === 'sliver' && roomNext >= 14 && after) form = 'sliver';
    else if (can && !src && !srcEntry) {
      const q = rand();
      if ((l.kind === 'fall' && q < 0.45 || l.kind === 'level' && q < 0.18 || j === nG && q < 0.5) && room >= 14) form = 'void';
      else if ((l.kind === 'rise' && q < 0.45 || l.kind === 'break' && q < 0.5 || l.kind === 'level' && q > 0.82) && roomNext >= 15 && after) form = 'sliver';
    }
    l.form = form;
    if (form !== 'duty') { hard++; lastHard = j; }
  }
  L[0].form = 'duty';

  // ----- 5. Build the gestures
  // Where the sound's getting bigger the sheet comes at you, and where it's dying away the sheet goes back; only where it stays put is the way free.
  const zoomWay = (a, b) => {
    if (!form) return 0;
    const mid = (a + b) / 2, d = meanE(mid, b) - meanE(a, mid);
    return Math.abs(d) < ZOOM_FOLLOWS ? 0 : Math.sign(d);
  };
  const journey = (pat, len, way = 0) => {
    const arcs = (pat.arcs || []).map(a => ({ ...a }));
    const maxLn = 0.5 * len / 1.875;      // |d ln s/dt| <= .5/s
    const sc = arcs.find(a => a.path === 'scale');
    const cam = arcs.some(a => a.path.startsWith('cam.') || a.path === 'surf.spin');
    const turns = arcs.some(a => a.path === 'rot' && Math.abs(a.to - a.from) > 0.5);
    if (sc) {
      sc.log = sc.log ?? (sc.from > 0 && sc.to > 0);
      const coin = rand() < 0.5;
      if (way ? (sc.to - sc.from) * way < 0 : coin) { const f = sc.from; sc.from = sc.to; sc.to = f; }
      if (sc.log) { const ln = Math.log(sc.to / sc.from); if (Math.abs(ln) > maxLn) sc.to = sc.from * Math.exp(Math.sign(ln) * maxLn); }
    } else if (!cam && !turns && !pat.drive) {
      const s0 = pat.g.scale ?? 1, ratio = Math.min(rand.range(3, 8), Math.exp(maxLn)), coin = rand() < 0.5, up = way ? way > 0 : coin;
      const lo = s0 / Math.sqrt(ratio), hi = s0 * Math.sqrt(ratio);
      arcs.push({ path: 'scale', from: up ? lo : hi, to: up ? hi : lo, log: true });
    }
    return arcs;
  };
  const CHANGES = ['wider', 'turn', 'reverse'];
  const changed = (src, seg, v) => {
    const arcs = src.arcs.map(a => ({ ...a }));
    let flow = src.flowOver, what;
    if (seg.rot) {
      what = 'lifted';
      const k = Math.pow(2, -seg.rot / 12) ** 2;
      const sc = arcs.find(a => a.path === 'scale');
      if (sc) { sc.from *= k; sc.to *= k; } else arcs.push({ path: 'scale', from: (src.pattern.g.scale ?? 1) * k, to: (src.pattern.g.scale ?? 1) * k });
    } else {
      what = CHANGES[(v - 1) % CHANGES.length];
      const sc = arcs.find(a => a.path === 'scale' && a.log);
      if (what === 'turn' && arcs.some(a => a.path === 'rot')) what = 'wider';
      if (what === 'reverse' && !src.pattern.flow) what = 'wider';
      if (what === 'wider') {
        if (sc) sc.to = sc.to * Math.pow(sc.to / sc.from, 0.45);
        else what = 'turn';
      }
      if (what === 'turn') { const r0 = src.pattern.g.rot ?? 0; arcs.push({ path: 'rot', from: r0, to: r0 + (rand() < 0.5 ? 0.8 : -0.8) }); }
      if (what === 'reverse') { flow = {}; for (const k in src.pattern.flow) flow[k] = -src.pattern.flow[k]; }
    }
    return { arcs, flow, what };
  };

  // A transformation starts where the phrase does: on a breath or half way through one, as near as it can to how long it wanted. And never while the picture's clock is
  // still catching up after a rest: it starts once that's paid, or, if that leaves too little, before the clock starts to stop, and rides straight through the rest.
  const halves = form ? (() => {
    const out = [], { offset, beats: B } = M.breath;
    for (let k = offset; k < beatsArr.length; k += B / 2) { const b = beatsArr[Math.round(k)]; if (b !== undefined) out.push(b); }
    return out;
  })() : [];
  const morphFor = (a, b, want, pat) => {
    if (!form) return want;
    if (P) {
      let start = b - want;
      for (const l of lags) if (start > l.from && start < l.paid) start = b - l.paid >= P.least ? l.paid : l.from - 0.05;
      return b - start;
    }
    // A Snap turns over on the breath, all at once. A transformation starts between two of those, not on top of one.
    const turns = pat.drive && whitestPhase(pat, { t0: a }) === 0;
    const room = Math.min(MORPH_LONGEST, 0.7 * (b - a));
    let start = b - want, near = Infinity;
    for (let i = 0; i < halves.length; i++) {
      const h = halves[i], D = b - h;
      if (D < MORPH_SHORTEST || D > room || (turns && i % 2 === 0)) continue;
      if (Math.abs(D - want) < near) { near = Math.abs(D - want); start = h; }
    }
    for (const l of lags) {
      if (start <= l.from || start >= l.paid) continue;
      start = b - l.paid >= MORPH_AFTER_REST || b - l.from > 0.8 * (b - a) ? l.paid : l.from - 0.05;
    }
    return b - start;
  };

  // Is the song quiet here, for itself? With some give, so that a level hovering at the line doesn't shift the flow up and down.
  const eLevels = form ? Array.from({ length: Math.floor(tEnd * 2) }, (_, i) => Eat(i / 2)) : [], eLo = percentile(eLevels, 0.25), eHi = percentile(eLevels, 0.75);
  const quietAt = (t, was) => {
    const bar = meter / Math.max(rate(t), 0.5), q = (meanE(t, t + 2 * bar) - eLo) / Math.max(eHi - eLo, 1e-3);
    return q < (was ? QUIET_OFF : QUIET_ON);
  };

  const swellable = p => p.swell ?? (p.family === 'dots' || p.family === 'bodies' || p.family === 'body' || (p.g.round ?? 0) > 0.5);
  const barIdxAt = t => { let lo = 0, hi = bars.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (bars[m] <= t) lo = m; else hi = m - 1; } return lo; };

  const gestures = [];
  // One gesture. `over` is the director asking for it again on another pattern, over the time it now has: a plain one, no replay of anything.
  const gestureFor = (k, over) => {
    const s = spec[k], a = over?.a ?? s.a, b = over?.b ?? s.b, l0 = L[k], l1 = L[k + 1], len = b - a;
    const srcG = !over && s.replayOf !== null ? gestures[s.replayOf] : null;
    const pat = over?.pattern ?? s.pat;
    // It has become the next pattern exactly on the boundary. Where the music falls away it takes longer over it; where it rises it's quicker.
    const morph = morphFor(a, b, P ? P.leadOf(P.parts[k], pat, spec[k + 1]?.pat, len, l1.kind) : clamp(len * (l1.kind === 'fall' || l1.kind === 'break' ? 0.5 : l1.kind === 'rise' ? 0.3 : 0.4), 7, 13), pat);
    // Its clock comes to rest in the transformation out of it (frame.js), so that's where its long move should end, or the last third of the ride would never be seen and the rest would be slow.
    const seen = form ? len - morph + Math.min(morph * 0.4, 3.5) / 2 : len;
    let arcs, flowOver, change = null;
    if (srcG) {
      const c = changed(srcG, s.seg, s.seg.visit || 1);
      arcs = c.arcs; flowOver = c.flow; change = c.what;
    } else {
      arcs = journey(pat, seen, zoomWay(a, b));
      if (P) arcs = P.shrinkArcs(arcs, seen);
    }
    // Triangles close by area, so they spend longer nearly solid: a shorter sweep keeps the solid moment the same length
    const tight = (pat.solid ?? 1) < 1 ? 0.75 : 1;
    const outDur = l1.form === 'void' ? 0.05 : clamp(Math.min(rand.range(4, 5.5), len * 0.3), 2.5, 5.5) * tight;
    const inDur = l0.form === 'sliver' ? 0.02 : clamp(l0.inDur, 2.5, len * 0.4) * tight;
    const G = {
      t0: a, t1: b, arcEnd: form ? a + seen : b, pattern: pat, arcs, kindIn: l0.kind, kindOut: l1.kind,
      morph,
      melMode: (() => { const f = (pat.g.fams || [])[0] || {}, ax = Math.abs(f.x || 0), ay = Math.abs(f.y || 0); return ay > ax * 2 ? 1 : ax > ay * 2 ? 2 : 0; })(),
      replayOf: over ? null : s.replayOf, change, label: s.seg.label, visit: s.seg.visit || 0, k,
    };
    if (form) {
      // Where the song is going to arrive somewhere the camera goes in, and where it falls away the camera comes out. The rehearsal can still turn a flight round that goes badly.
      if (l1.kind === 'rise') G.rise = false;
      else if (l1.kind === 'fall' || l1.kind === 'break') G.rise = true;
      G.arrival = M.arrivalAt(b);
    }
    if (flowOver) { G.flow = flowOver; G.flowOver = flowOver; }
    if (P) { G.part = P.parts[k]; G.quick = true; }

    // Gears: one element passes per N beats, N from lambda and the scale of the moment. Closed form: a track in tau.
    // The rehearsal may yet narrow the part of the long move this gesture rides, or add to it, so it can ask what the gears would then be. x is how far through the gesture.
    const lam = lambdaOf(pat, aspect), first = barIdxAt(a);
    const hasFamilyFlow = pat.flow && Object.keys(pat.flow).some(key => /^f\d\.ph$/.test(key));
    G.regear = ([lo, hi] = [0, 1], ridden = G.arcs, slower = 1) => {       // slower: what the rehearsal found it had to slow this one by, because it flashed
      const arcsU = x => {
        const u = lerp(lo, hi, x), s0 = arcValue(ridden, 'scale', u, pat.g.scale ?? 1), f0 = arcValue(ridden, 'freq', u, pat.g.freq ?? 1);
        // A lump magnifies what flows through it: the edge in the middle of a bulge travels (1 + a) times as far per cycle.
        const bulge = Math.max(0, arcValue(ridden, 'bulge.a', u, pat.g.bulge?.a ?? 0));
        return lam * s0 * (1 + bulge) / Math.max(f0, 1e-3);
      };
      const track = [];
      // Where the song's quiet the sheet flows at half speed, and it shifts up again as the sound comes back, on a bar line. Only a flow that's its own speed: a breathing clock keeps the breath.
      const eases = form && hasFamilyFlow && !pat.drive;
      let slow = eases && quietAt(a, false);
      // With nothing XOR-ed against them, a few bold lines change the whole frame's brightness as they go by, so one cycle of them is at least long enough not to read as a flash.
      const stripes = form && lookOf(pat) === 'lines';
      const geared = (g, on) => { let N = on ? g * 2 : g; if (stripes) while (N / Math.max(rate(a), 0.5) < STRIPES_CYCLE) N *= 2; return N * slower; };
      let cur = hasFamilyFlow ? geared(gearFor(arcsU(0), rate(a), meter), slow) : meter * 2;
      // A drive may breathe on the clock (dots inflating, merging, flipping). That needs a slow clock, one gear, and, where the song
      // breathes in phrases, the phrase itself. At the beat it would strobe.
      const breathes = !!pat.drive;
      if (breathes) {
        const r = Math.max(rate((a + b) / 2), 0.5), steps = meter === 3 ? [3, 6, 12, 24, 48, 96, 192] : [2, 4, 8, 16, 32, 64, 128];
        const slowest = pat.minPeriod ?? 5;
        let N = steps.find(n => n / r >= slowest) ?? steps[steps.length - 1];
        const phrase = (form ? M.breath.beats : (A.phraseBars || 8) * meter);
        if (form || A.swellRegularity > 0.5) { const P = phrase / r >= slowest && phrase / r <= 14 ? phrase : phrase * 2 / r <= 14 ? phrase * 2 : phrase / 2 / r >= slowest ? phrase / 2 : 0; if (P) N = P; }
        let worst = 0;
        for (let u = 0; u <= 1; u += 0.1) worst = Math.max(worst, gearFor(arcsU(u), r, meter));
        cur = Math.max(N, hasFamilyFlow ? worst : 0) * slower;
      }
      const tau0 = tau(a);
      // Its clock runs so that it's at its whitest on the breath
      let phiNow = 0, tauNow = tau0;
      const whitest = form && breathes && M.breath.t.length ? whitestPhase(pat, G) : null;
      if (whitest !== null) {
        const on = M.breath.t.find(x => x >= a) ?? M.breath.t[0];
        phiNow = mod(whitest - (tau(on) - tau0) / cur, 1);
      }
      track.push({ t: tau0, x: phiNow, v: 1 / cur });
      const list = [cur];
      if (hasFamilyFlow && !breathes) {
        for (let i = first + 1; i < bars.length && bars[i] < b - 0.5; i++) {
          const u = (bars[i] - a) / seen;
          if (eases) slow = quietAt(bars[i], slow);
          const want = geared(gearFor(arcsU(clamp(u + 0.05)), rate(bars[i]), meter), slow);
          if (want === cur || tau(bars[i]) < tauNow) continue;
          // shift over at least a bar and at least 3 s, on bar lines
          let j = i + 1;
          while (j < bars.length - 1 && bars[j] - bars[i] < 3) j++;
          if (bars[j] > b) break;
          const ta = tau(bars[i]), tb = tau(bars[j]);
          phiNow += (ta - tauNow) / cur;
          track.push({ t: ta, x: phiNow, v: 1 / cur });
          const dPhi = (tb - ta) * (1 / cur + 1 / want) / 2;
          phiNow += dPhi >= 1.5 ? Math.round(dPhi) : dPhi;
          track.push({ t: tb, x: phiNow, v: 1 / want });
          tauNow = tb; cur = want; list.push(cur);
          i = j - 1;
        }
      }
      return { phiTrack: track, gears: list, tau0 };
    };
    Object.assign(G, G.regear());

    // Swells, where the song breathes in phrases: attack of at least .5 s ending on the phrase, then a 4 s decay
    if ((form ? whitestPhase(pat, G) === null : A.swellRegularity > 0.5 && !pat.drive) && (form || swellable(pat) || rand() < 0.4)) {
      const P = A.phraseBars || 8, solid = pat.solid ?? 1;
      // A whole gesture breathes, until its clock comes to rest in the transformation out of it: seen is where that is, and a breath has to be all out by then, or it would be cut short.
      const lo = form ? a + Math.min(1.5, 0.1 * len) : a + (l0.holdIn || 0) + inDur + 0.8, hi = form ? a + seen : b - (l1.holdOut || 0) - outDur - 1;
      const on = [];
      if (form) { for (const l of M.lungs) if (l.t > lo && l.t + 0.6 * l.decay / 0.45 < hi && l.depth > 0.1) on.push(l.t); }
      else for (let i = first; i < bars.length && bars[i] < hi; i++) if (bars[i] > lo && ((i - (A.phrase0 || 0)) % P + P) % P === 0) on.push(bars[i]);
      if (on.length) {
        const knots = [{ t: a, x: 0 }], amp = -0.28 * solid;
        on.forEach((o, n) => {
          const nextOn = on[n + 1] ?? Infinity;
          if (form) {
            // A long slow breath in, as deep as the phrase is, and out again before the next. The threshold moves the brightness by about n/2 per unit with n families XOR-ed,
            // so a share per family makes it the same breath whatever the pattern's made of.
            const lung = M.lungs.find(l => l.t === o), atk = Math.max(0.7, Math.min(lung.attack, 0.3 * (nextOn - o)));
            if (o - atk <= knots[knots.length - 1].t) return;
            const n = Math.max(1, (pat.g.fams || []).filter(f => Math.abs(f.d ?? 0) <= 1.01).length);
            knots.push({ t: o - atk, x: 0 }, { t: o, x: -SWELL / n * solid * Math.min(lung.depth, 1.25) }, { t: Math.min(o + 0.6 * lung.decay / 0.45, nextOn - atk - 0.01), x: 0 });
          } else {
            const atk = Math.max(0.55, Math.min(0.8, 0.15 * (nextOn - o)));
            knots.push({ t: o - atk, x: 0 }, { t: o, x: amp }, { t: Math.min(o + 4, nextOn - atk - 0.01, hi + 0.5), x: 0 });
          }
        });
        G.thetaBody = knots;
      }
    }

    return G;
  };
  for (let k = 0; k < nG; k++) gestures.push(gestureFor(k));
  // After the last landing the film carries on, slowly, on its last pattern
  const finalPat = gestures.length ? gestures[gestures.length - 1].pattern : pool[0];
  gestures.push({ t0: tEnd, t1: tEnd + 3600, pattern: finalPat, arcs: [], phiTrack: [{ t: tau(tEnd), x: 0, v: 1 / 16 }], gears: [] });

  const react = buildReact(A, seed, ears);
  const surged = t => surgedBeats(react, tau, t);
  let walk = ears[1] ? makeWalk(react, time) : null;
  if (P) P.dress(gestures, { time, react, tau, meter });
  const landings = L.slice(1).map((l, j) => {
    const out = { B: +l.B.toFixed(3), kind: l.kind, form: l.form, pol: l.pol, holdOut: l.holdOut, holdIn: l.holdIn, dE: +(l.dE ?? 0).toFixed(3) };
    if (!form) return out;
    // What the director reads: how much of an arrival this is, in M.arrival's 0..1 and as the raw s; whether it falls on a breath; the rest it's on, if any.
    const was = landedFrom.get(l.B) ?? l.B, i = barIdxAt(was + 0.01);
    if (was !== l.B) out.from = +was.toFixed(3);
    out.a = +(M.arrivalAt(was) ?? 0).toFixed(3);
    out.s = +(M.arrivalS[i] ?? 0).toFixed(3);
    out.breath = M.breath.t.some(x => Math.abs(x - was) < 0.05);
    const r = M.rests.find(x => Math.abs(time(x.a) - l.B) < 2e-3);
    if (r) out.rest = { a: r.a, b: r.b };
    return out;
  });
  const lens = gestures.slice(0, -1).map(g => g.t1 - g.t0);
  const plain = landings.filter(l => l.form === 'duty').length;
  const stats = {
    gestures: gestures.length - 1, medianLen: +median(lens).toFixed(1), minLen: +Math.min(...lens).toFixed(1), maxLen: +Math.max(...lens).toFixed(1),
    plainFraction: +(plain / Math.max(landings.length, 1)).toFixed(2),
    kinds: landings.reduce((o, l) => { o[l.kind] = (o[l.kind] || 0) + 1; return o; }, {}),
    replays: gestures.filter(g => g.replayOf != null).length,
    black: landings.filter(l => l.pol > 0).length, white: landings.filter(l => l.pol < 0).length,
    boundaryLanded: A.segments.slice(1).filter(s => landings.some(l => Math.abs((l.from ?? l.B) - s.t0) < 0.3)).length + '/' + (A.segments.length - 1),
  };
  if (form) {
    const inner = landings.slice(0, -1);
    stats.onBreath = inner.filter(l => l.breath).length + '/' + inner.length;
    stats.arrivalsLanded = M.arrivals(0.3).filter(p => landings.some(l => Math.abs((l.from ?? l.B) - p.t) < 0.3)).length + '/' + M.arrivals(0.3).length;
    stats.restsLanded = M.rests.filter(r => landings.some(l => l.rest?.a === r.a)).length + '/' + M.rests.length;
  }
  if (spread) {
    const share = (key) => { const o = {}; gestures.slice(0, -1).forEach(g => { const k = key(g.pattern); o[k] = +(((o[k] || 0) + (g.t1 - g.t0))).toFixed(1); }); return o; };
    stats.families = share(p => p.family);
    stats.looks = share(lookOf);
  }
  const W = opts.world;
  let turn = null;      // hearing 11, once the director's said where the heroes are
  // Plain bold stripes flow steadily, since they change the whole frame's brightness as they go by. Their long move still walks.
  const walkFlow = G => (G.walkFlow ??= lookOf(G.pattern) === 'lines' && boldStripes(G.pattern) ? 0 : 1);
  const film = (W?.direct ?? direct)({
    gestures, landings, stats, tau, rate, family, pool: pool.map(p => p.id), patterns, seed, aspect,
    library, remake: (G, pattern) => gestureFor(G.k, { pattern, a: G.t0, b: G.t1 }),
    pace: P,
    // Flow surges on the strong beats and glides between, so it stays locked and never jolts
    phi: walk || ears[11]
      // Hearing 1 and 11. Told how much of the clock's speed is left (rho) and what the time really is, it walks to the beats you can hear while that clock slows into a transformation. Asked with neither, it's just walking.
      ? (t, G, now = t, rho = 1) => { const off = t + rho * ((walk ? walk(now) * walkFlow(G) : 0) + (turn ? turn(now) : 0)), s = walk ? tau(off) : surged(off), v = G.phiTrack ? evalTrack(G.phiTrack, s) : s / 8; return G.phiScale ? v * G.phiScale : v; }
      : (t, G) => { const s = surged(t), v = G.phiTrack ? evalTrack(G.phiTrack, s) : s / 8; return G.phiScale ? v * G.phiScale : v; },       // phiScale: a hero the rehearsal found flashing runs on a slower clock
    react, time, ears,
    song: { duration, bpm: A.bpm, hash: A.hash, meter, phraseBars: A.phraseBars },
  }, A, react.M);
  // A world's own: the tables it wants from the song, and how it goes about things. With none, nothing has been touched and no random number has been drawn.
  if (W) {
    film.world = W;
    film.tables = W.tables?.(A, react.M) ?? null;
    const m = W.motion;
    if (m?.slower) { const phi = film.phi; film.phi = (t, G) => phi(t, G) / m.slower; }
    if (m) for (const G of film.gestures) { if (m.glide === false) G.noGlide = true; if (m.rise != null) G.rise = m.rise; }
  }
  // A hand cut, if one's asked for: everything above has happened as it always does, so the seed's draws are untouched and with none there's nothing to see.
  if (opts.cut) applyCut(film, opts.cut, A, react.M);
  // A hand cut times its own hits, and they have to stay where they were cut, so the walk stops on those too.
  if (walk && opts.cut && film.sheet?.hits?.length) { const gain = walk.gain; walk = makeWalk(react, time, film.sheet.hits.map(h => h.t)); walk.gain = gain; }
  if (ears[11] && react.M.surprises?.length) {
    const made = surpriseTurns(film, react.M);
    turn = made.turn; film.turns = made.at;
  }
  if (walk) film.walk = walk;
  if (walk && ears.morph) film.walkMorph = (x, t, D) => x + WALK_MORPH * smoother(x / 0.2) * smoother((1 - x) / 0.2) * walk(t) / D;
  film.ears = ears;
  // Hearing 2: the tune lifts and sinks the whole sheet, one way everywhere, so it goes across the lines. Out from the middle pushes opposite sides opposite ways, and that reads as a swell, not a note going up.
  if (ears[2]) for (const G of film.gestures) G.melMode = (f => (Math.abs(f.x || 0) > Math.abs(f.y || 0) * 2 ? 2 : 1))((G.pattern.g.fams || [])[0] || {});
  return film;
}
