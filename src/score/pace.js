// Pace: how often a film changes, what it changes with, and how. The owner's note: "stays on an individual pattern too long almost always. Sometimes fair to hold on it but only if you're doing cool stuff/it fits."
//
// Behind directing.pace, on by default; ?pace=0 is the old film. A pure function of the song, like everything else that makes a film. compose() asks it three things:
//   How long should a gesture be, here?      By the song's own level at that bar (its ride) and its register: chill, travel or riot. Loud is a change every 2 to 4 bars, the middle every 4 to 8, quiet every 8 to 16.
//   What does a stretch of the song wear?    One way of changing per passage, and a section that comes back wears what it wore:
//                                              relay   one gesture whose patterns close into each other, a step on each of the song's own landings. The quick changes: flash clean at 2 s a step, where a flight in 2 bars isn't
//                                              riot    one gesture with a move that marches on the strong beats: Ratchet, Wring, Scissor, Bellows
//                                              still   one gesture evolving on its own: Confocal, Moire Wheel, Mirror Walk, Vertigo. Chill is slow, never a wobble on one pattern
//                                              suite   a short sequence of patterns, each transforming into the next on a landing
//   How long does each change take?          In bars, not 7 to 13 s, with its fastest frame on the hit: `lead` bars before it and `tail` after.
//
// A long stay has to be doing something. Whatever's left plain for more than HOLD bars after all this gets a move of its own in dress().
import { OFF, SLOT_FLOATS } from '../pattern/layout.js';
import { clamp, evalTrack, rng } from './curves.js';
import { base, fillSlot, fineness } from './slot.js';
import { matchFamilies } from './xform/plan.js';
import { MOVES } from './moves/index.js';
import { SEQS } from './moves/relay.js';

// By the ride's five levels: 0 whisper, 1 verse, 2 lift, 3 chorus, 4 peak. All in the song's bars. First guesses, gone over on strips of real frames.
const BARS = { chill: [12, 10, 8, 6, 5], travel: [9, 7, 5, 3, 2], riot: [7, 5, 3, 2, 2] };          // bars between changes
const LEAD = { chill: [5, 4, 3, 2.5, 2], travel: [3, 2.5, 2, 1.25, 1], riot: [2.5, 2, 1.25, 1, 0.75] };     // bars of a change before its hit...
const TAIL = { chill: [3.5, 3, 2, 1.5, 1], travel: [2.5, 2, 1.25, 0.75, 0.5], riot: [2, 1.25, 1, 0.5, 0.5] };     // ...and after
const ONE_MORE = 0, STIFF = 0.25;    // what another landing has to be worth in the composer's search, in place of its 3, and how hard it holds to the length it wants
const LEAST_S = 3.2, MOST_BARS = 18, MOST_S = 30;     // the shortest and longest a landing can leave behind it
const FLIGHT_LEAST = 5.6, FLIGHT_LEAD = 0.3;          // seconds: a flight in less than this flashes, where a glide doesn't. Its fastest frame on screen comes well before its middle (about 2 s in 5.6, measured on MGMT), so most of it goes after the hit: it sets off on the song's moment, this share of it before
const HOLD = 8;                     // bars a pattern can stay with nothing but its ordinary flow
const CLASS_LEAST = 6;              // bars
const ARC_SECONDS = 22;             // a pattern's long move is written for about this long. A shorter gesture rides the middle of it at that speed, not all of it at a run
const DROP = 0.25, DROP_WORTH = 6;  // a jump of this much energy across 2 bars each way is a moment, and this is what it's worth to land on it
const JUMP_WORTH = [[4, 7], [2.5, 3]];     // ...and the same for one of the song's own jumps, by how big
const KIND_LEAD = { rise: 0.8, fall: 1.35, break: 1.35 };     // a change takes longer where the song falls away, and it's quicker where it's rising
const JITTER = 0.18;
const HANG_TOP = 3, HANG_WORTH = 6, HANG_BARS = 2, HANG_SLOW = 0.35, HANG_FAST = 2;      // the song's biggest moments: what it's worth to land on one, and how the flow's clock goes for the bars either side of it
const IRIS_ROOM = 10.5;               // seconds the gesture before the climax's landing keeps, plain, so that the Iris can roll it up
const CLIMAX_NEAR = 16;             // bars around the climax that may go at the peak's pace. Everything else is held to the chorus's, so there's something saved
const OPENS = 14;                   // seconds: the arrival. The first thing that's looked at, plain
const CAP = { relay: 16, riot: 5, still: 12, suite: 10 };       // bars a way of changing runs before the next thing in its wardrobe
const LEAST = { relay: 3, riot: 3.5, still: 6 }, SUITE_LEAST = 6.8, RELAY_MOST = 0.36;      // ...seconds, and the share of the film        // bars. Any shorter and it's a suite
const GEAR = [32, 16, 12, 8, 6];     // beats to a cycle of flow, by level
const STEP = { chill: [12, 8, 8, 4, 2], travel: [8, 8, 4, 2, 1], riot: [4, 4, 2, 2, 1] };      // a Relay's bars between steps, at most: the song's own landings, and the breath's own bar lines where they're further apart than this, so a step falls on the phrase
const BOLD = [6, 8, 9];            // cycles per picture unit: how fine a chorus, a lift and the rest would rather not go

// How each register goes about each class of the song's level: a short routine of ways of changing, the next one for each new kind of section. A section coming back runs the routine it ran.
const MENU = {
  riot: { loud: [['riot', 'relay'], ['relay', 'riot'], ['relay', 'riot', 'relay']], mid: [['relay', 'suite'], ['suite', 'relay'], ['riot', 'relay']], quiet: [['still', 'suite'], ['suite', 'relay']] },
  travel: { loud: [['relay', 'riot'], ['riot', 'relay'], ['relay', 'riot', 'relay']], mid: [['relay', 'suite'], ['suite', 'relay'], ['still', 'relay'], ['suite', 'still']], quiet: [['suite', 'still'], ['still', 'suite'], ['suite']] },
  chill: { loud: [['relay', 'still'], ['still', 'relay']], mid: [['still', 'suite'], ['suite', 'relay'], ['relay', 'still']], quiet: [['still', 'suite'], ['suite', 'still']] },
};
const RELAYS = ['tour', 'star', 'whirl', 'saw', 'weave', 'floor', 'rooms'];       // not dipole: its rings go by as hairlines
const RIOTS = ['ratchet', 'wring', 'scissor', 'bellows'];
const STILLS = ['still.confocal', 'still.mirror', 'still.mirror6', 'still.floor', 'still.mirror3', 'still.ball'];     // not the Moire Wheel or the Chevrons, whose lines read as hairlines until something's asked them to be big

const meanOf = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const sdOf = a => { const m = meanOf(a); return Math.sqrt(meanOf(a.map(v => (v - m) ** 2))) || 1; };
const zOf = a => { const m = meanOf(a), sd = sdOf(a); return a.map(v => (v - m) / sd); };

// Bar means of an analysis stream
function perBar(A, key) {
  const bars = A.bars, src = A[key], out = [];
  for (let i = 0; i < bars.length; i++) {
    const a = Math.round(bars[i] * A.fps), b = Math.round((bars[i + 1] ?? bars[i] + 2) * A.fps);
    let v = 0, c = 0;
    for (let f = Math.max(0, a); f < b && f < (src?.length ?? 0); f++) { v += src[f]; c++; }
    out.push(c ? v / c : 0);
  }
  return out;
}

// The ride, docs/DIRECTION.md section 5: 0 whisper .. 4 peak per bar, cut at the song's own 15, 40, 70 and 90%, and nothing shorter than 4 bars.
export function rideOf(A) {
  const N = A.bars.length, loud = perBar(A, 'loud'), lz = zOf(loud), bz = zOf(perBar(A, 'bright')), pz = zOf(perBar(A, 'perc')), ez = zOf(perBar(A, 'E'));
  // The plan's formula, with the song's energy on top: it's what a change of pace has to follow
  const h0 = lz.map((v, i) => v + 0.5 * bz[i] * clamp(loud[i] / 0.4) + 0.4 * pz[i] + 1.2 * ez[i]);
  const heat = h0.map((_, i) => meanOf(h0.slice(Math.max(0, i - 1), Math.min(N, i + 3))));
  const sorted = [...heat].sort((a, b) => a - b), qs = [0.15, 0.4, 0.7, 0.9].map(q => sorted[Math.floor((N - 1) * q)]);
  const lv = heat.map(h => qs.filter(q => h >= q).length);
  for (let pass = 0; pass < 3; pass++) {
    let a = 0;
    for (let i = 1; i <= N; i++) {
      if (i < N && lv[i] === lv[a]) continue;
      if (i - a < 4 && (a > 0 || i < N)) {
        const L = lv[a - 1], R = lv[i], to = L === undefined ? R : R === undefined ? L : Math.abs(L - lv[a]) <= Math.abs(R - lv[a]) ? L : R;
        for (let k = a; k < i; k++) lv[k] = to;
      }
      a = i;
    }
  }
  return { lv, heat };
}

// The song's jumps, docs/DIRECTION.md section 5: how far each stream moves across 2 bars each way, over its own spread. A peak is the greatest within 4 bars either way.
export function jumpsOf(A, M = null) {
  const WEIGHT = { loud: 1, bright: 0.5, bass: 0.7, perc: 0.5, voiced: 0.3 }, N = A.bars.length, J = {};
  const span = (a, i, j) => meanOf(a.slice(Math.max(0, i), Math.max(0, j)));
  for (const k in WEIGHT) { const a = perBar(A, k), v = a.map((_, i) => span(a, i, i + 2) - span(a, i - 2, i)), sd = sdOf(v); J[k] = v.map(x => x / sd); }
  const ups = [], s = Array.from({ length: N }, (_, i) => { let up = 0, dn = 0; for (const k in WEIGHT) { up += WEIGHT[k] * Math.max(0, J[k][i]); dn += (k === 'bright' ? 0.4 : WEIGHT[k]) * Math.max(0, -J[k][i]); } ups.push(up >= dn); return Math.max(up, dn); });
  const out = [];
  for (let i = 4; i < N - 4; i++) { let top = s[i] > 0; for (let k = -4; k <= 4 && top; k++) if (k && s[i + k] > s[i]) top = false; if (top) out.push({ i, s: s[i], up: ups[i] }); }
  if (!M) return out;
  // Then to where it really is: a rise to the section's start or the arrival within 2 bars, a fall to the biggest single bar's drop within 2 bars
  const loud = perBar(A, 'loud'), bars = A.bars, marks = [...A.segments.slice(1).map(x => x.t0), ...(M.arrivals?.(0.3) ?? []).map(x => x.t)];
  for (const j of out) {
    if (j.up) {
      let best = 2.01 * M.bar, at = j.i;
      for (const t of marks) if (Math.abs(t - bars[j.i]) < best) { best = Math.abs(t - bars[j.i]); at = bars.reduce((b, x, i) => (Math.abs(x - t) < Math.abs(bars[b] - t) ? i : b), 0); }
      j.i = at;
    } else {
      let drop = 0;
      for (let k = Math.max(1, j.i - 2), e = Math.min(N - 1, j.i + 2), was = j.i; k <= e; k++) if (loud[k - 1] - loud[k] > drop) { drop = loud[k - 1] - loud[k]; j.i = k; }
    }
  }
  return out;
}

// The register, docs/DIRECTION.md section 5: how driven a song is, by four numbers between these four songs' extremes. Chill under .25, riot over .75, and when in doubt, travel.
export function registerOf(A, M) {
  const perc = meanOf(perBar(A, 'perc')), dur = Math.max(A.duration, 1), chords = (M.runs ?? []).filter(r => r.t1 - r.t0 >= 1.2).length / dur * 60;
  // Notes a second, while a voice is there: a move of a semitone or more held for 1/6 s
  let notes = 0, held = null, away = 0, voiced = 0;
  const step = Math.max(1, Math.round(A.fps / 12));
  for (let f = 0; f < (A.pitch?.length ?? 0); f += step) {
    if (!(A.voiced?.[f] > 0.35)) { held = null; continue; }
    voiced++;
    if (held === null) { notes++; held = A.pitch[f]; away = 0; }
    else if (Math.abs(A.pitch[f] - held) >= 1) { if (++away >= 2) { notes++; held = A.pitch[f]; away = 0; } } else away = 0;
  }
  const noteRate = voiced ? notes / (voiced * step / A.fps) : 0;
  // Jumps of 4 or more, per minute
  const jumps = jumpsOf(A).filter(j => j.s >= 4).length;
  const parts = [(perc - 0.46) / 0.17, (noteRate - 1.72) / 1.34, (chords - 10.7) / 11.8, jumps / dur * 60 / 1.59].map(x => clamp(x));
  const score = meanOf(parts);
  return { name: score < 0.25 ? 'chill' : score > 0.75 ? 'riot' : 'travel', score, parts };
}

// How fine a pattern's lines are in the middle of its long move
const fineSlot = new Float32Array(SLOT_FLOATS);
const fineOf = new Map();
function finest(p) {
  if (fineOf.has(p)) return fineOf.get(p);
  let k = Infinity;
  try {
    k = 0;
    for (const u of [0.2, 0.5, 0.8]) {
      fillSlot(fineSlot, { pattern: p, arcs: p.arcs ?? [], flow: p.flow, freezeU: u, t0: 0, t1: 1 }, 0.5, p, { phi: 0 });
      k = Math.max(k, fineness(fineSlot));
    }
  } catch { k = fineness(base(p)); }
  fineOf.set(p, k);
  return k;
}

// Can these two glide? The composer's own test for it, on the patterns as they stand. What really happens is found out when it's played.
export function glides(a, b) {
  if (!a || !b || a === b) return false;
  const x = base(a), y = base(b), m = matchFamilies(x, y);
  return m.plain && m.same('surf.kind') && x[OFF['surf.map']] < 0.5 && y[OFF['surf.map']] < 0.5 && m.fewExtras && m.closeEnough;
}

export function readPace(A, M, { seed = 7, songHash = 0, library = [], world = null } = {}) {
  const bar = Math.max(M.bar, 0.8), beat = M.beat, bars = A.bars, reg = registerOf(A, M), name = reg.name, { lv, heat } = rideOf(A);
  const rand = rng(((seed | 0) * 48611 + songHash) >>> 0), lib = id => library.find(p => p.id === id);
  const shuffled = list => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const barAt = t => { let lo = 0, hi = bars.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (bars[m] <= t) lo = m; else hi = m - 1; } return lo; };
  // The peak's pace is saved for around the climax
  const levelAt = t => { const l = lv[clamp(barAt(t), 0, lv.length - 1)] ?? 2; return Math.abs(t - A.climax) <= CLIMAX_NEAR * bar ? l : Math.min(l, 3); };
  // Which class of the song's level, for what it wears: nothing under 6 bars, or a chorus that dips for a bar or two would change its clothes.
  const labelClass = new Map();
  const classOfLabel = label => {
    if (labelClass.has(label)) return labelClass.get(label);
    let n = 0, s = 0;
    for (const x of A.segments) if (x.label === label) for (let i = barAt(x.t0); i < lv.length && bars[i] < x.t1; i++) { n++; s += lv[i]; }
    const m = n ? s / n : 2, c = m >= 2 ? 'loud' : m >= 1.2 ? 'mid' : 'quiet';
    labelClass.set(label, c);
    return c;
  };
  const classes = (() => {
    const c = lv.map(l => (l >= 3 ? 2 : l === 2 ? 1 : 0)), N = c.length;
    for (let pass = 0; pass < 3; pass++) {
      let a = 0;
      for (let i = 1; i <= N; i++) {
        if (i < N && c[i] === c[a]) continue;
        if (i - a < CLASS_LEAST && (a > 0 || i < N)) { const to = a > 0 ? c[a - 1] : c[i]; for (let k = a; k < i; k++) c[k] = to; }
        a = i;
      }
    }
    return c;
  })();
  const classAt = t => ['quiet', 'mid', 'loud'][classes[clamp(barAt(t), 0, classes.length - 1)] ?? 1];
  // A world goes about things in its own way (world.pace): how many bars at each level, and how long its own transformation can take. It wears nothing of the film's.
  const own = world?.pace ?? null;
  const barsWanted = t => (own ? own.bars : BARS[name])[levelAt(t)];

  const jumpAt = new Map();
  const jumps = jumpsOf(A, M), tops = [...jumps].filter(j => bars[j.i] > OPENS && j.s >= JUMP_WORTH[1][0]).sort((x, y) => y.s - x.s).slice(0, HANG_TOP).map(j => j.i);
  for (const j of jumps) { const w = JUMP_WORTH.find(x => j.s >= x[0]); if (w) jumpAt.set(j.i, w[1] + (tops.includes(j.i) ? HANG_WORTH : 0)); }

  // ---------------------------------------------------------------- what each kind of section wears
  const bags = {
    relay: shuffled(RELAYS.filter(k => lib(`relay.${k}`) && SEQS[k])),
    riot: shuffled(RIOTS.filter(k => lib(`riot.${k}`) && MOVES[k])),
    still: shuffled(STILLS.filter(lib)),
  };
  // Something nobody's seen yet, for the climax
  const saved = bags.relay.length > 3 ? bags.relay.pop() : null;
  const take = bag => { const k = bag.shift(); if (k !== undefined) bag.push(k); return k; };
  const turn = { loud: Math.floor(rand() * 2), mid: Math.floor(rand() * 2), quiet: Math.floor(rand() * 2) };
  const wardrobe = new Map();
  const has = way => way === 'suite' || bags[way].length > 0;
  const wardrobeOf = (key, cls) => {
    let w = wardrobe.get(key);
    if (w) return w;
    const menu = MENU[name][cls], pick = menu[turn[cls]++ % menu.length].filter(has);
    w = { key, ways: pick.length ? pick : ['suite'], at: 0, items: {}, used: {} };
    // The longer a kind of section is over the whole song, the more it has to wear
    let total = 0;
    for (const x of A.segments) if (x.label === key) total += x.t1 - x.t0;
    const many = clamp(Math.round(total / 40), 2, 3);
    for (const way of w.ways) if (way !== 'suite') w.items[way] = Array.from({ length: many }, () => take(bags[way]));
    wardrobe.set(key, w);
    return w;
  };

  // ---------------------------------------------------------------- passages: the song's landings, with what a way of changing wears run together into one gesture
  const parts = [];
  let climaxAt = null;
  const passages = (landIn, segAt, time = (x => x)) => {
    const out = [];
    let relayed = 0;
    // The climax gets its Iris, which rolls up a plain sheet: so there's a landing for it, on its own bar line unless there's already one that near, with a plain gesture coming to it
    let land = landIn;
    {
      const at = time(bars[clamp(barAt(A.climax + bar / 2), 0, bars.length - 1)]), inner = land.slice(1, -1), near = inner.reduce((b, t) => (Math.abs(t - at) < Math.abs(b - at) ? t : b), inner[0] ?? 0), c = Math.abs(near - at) <= bar ? near : at;
      if (c > OPENS + IRIS_ROOM && c < land.at(-1) - IRIS_ROOM) { climaxAt = c; land = [...land.filter(t => !(t > c - IRIS_ROOM && t < c + 3 * bar)), c].sort((x, y) => x - y); }
    }
    for (let k = 0; k + 1 < land.length; k++) {
      const a = land[k], b = land[k + 1], mid = (a + b) / 2, seg = segAt(mid), level = levelAt(mid), label = seg.label;
      // What a kind of section wears goes by the kind of section, so it's the same each time it comes back. A long stretch that isn't like the rest of it, an outro on the end of a chorus, has its own.
      const usual = classOfLabel(label), here = classAt(mid), key = (usual === 'loud' && here === 'quiet') || (usual === 'quiet' && here === 'loud') ? `${label}.${here}` : label;
      const w = wardrobeOf(key, key === label ? usual : here), last = out.at(-1), forced = a < OPENS || b === climaxAt;
      // A section coming back starts its routine from the top
      if (!last || last.w !== w || last.seg.visit !== seg.visit) { w.at = 0; w.used = {}; }
      let way = forced ? 'suite' : w.ways[w.at % w.ways.length];
      // Where the song gets somewhere, the picture does too: a section's start or a strong arrival is a whole new gesture, not a step
      const arrives = last && (last.seg !== seg || (M.arrivalAt?.(a) ?? 0) >= 0.5 || (jumpAt.get(barAt(a)) ?? 0) >= JUMP_WORTH[0][1]);
      if (arrives && last.w === w && way === last.way && !forced) way = w.ways[++w.at % w.ways.length];
      if (last && last.w === w && last.way === way && !last.forced && !forced && !arrives) {
        if ((b - last.a) / bar <= (last.saved ? 1.25 : 1) * CAP[way]) { last.hits.push(a); last.b = b; last.level = Math.max(last.level, level); continue; }
        way = w.ways[++w.at % w.ways.length];
      } else if (last?.w === w && !last.forced && !forced && last.way !== way) way = w.ways[w.at % w.ways.length];
      // Not more than this much of the film one way, or it's the one idea that gets boring
      if (way === 'relay' && relayed > RELAY_MOST * land.at(-1) && a !== climaxAt) way = w.ways.find(x => x !== 'relay') ?? 'suite';
      if (a === climaxAt && saved) way = 'relay';      // what opens at the climax is what's been saved for it
      if (out.at(-1)?.way === 'relay') relayed += out.at(-1).b - out.at(-1).a;
      const n = (w.used[way] = (w.used[way] ?? -1) + 1);
      out.push({ a, b, seg, level, way, w, hits: [], n, forced, saved: a === climaxAt && saved });
    }
    // What opens at the climax runs on for as long as the song stays up
    const top = out.findIndex(p => p.saved);
    if (top >= 0) while (out[top + 1] && out[top + 1].b < climaxAt + 1.5 * CAP.relay * bar && levelAt(out[top + 1].a + bar) >= 2) { const n = out.splice(top + 1, 1)[0]; out[top].hits.push(n.a, ...n.hits); out[top].b = n.b; }
    for (const p of out) if (p.way !== 'suite' && !p.saved && (p.b - p.a) / bar < LEAST[p.way]) p.way = 'suite';
    // What came back to a suite has its landings back
    const done = [];
    for (const p of out) {
      if (p.way !== 'suite' || !p.hits.length) { done.push(p); continue; }
      // A suite's changes are transformations, which want some time: quick runs are for a Relay
      const stops = [p.a];
      for (const t of p.hits) if (t - stops.at(-1) >= SUITE_LEAST && p.b - t >= SUITE_LEAST) stops.push(t);
      stops.push(p.b);
      for (let i = 0; i + 1 < stops.length; i++) done.push({ ...p, a: stops[i], b: stops[i + 1], hits: [] });
    }
    parts.length = 0; parts.push(...done);
    return [...done.map(p => p.a), done.at(-1).b];
  };

  // ---------------------------------------------------------------- which patterns
  const counts = new Map(), worn = new Map();
  // What pattern a passage wears. choose asks the composer for one that suits here; prev is what's just been on.
  const wear = (q, part, prev, choose) => {
    const { w, seg } = part, visit = `${w.key}/${seg.visit || 0}`;
    if (part.way !== 'suite') {
      w.items[part.way] ??= [take(bags[part.way])];
      const it = part.saved || w.items[part.way][part.n % w.items[part.way].length];
      if (part.way === 'relay') { part.seq = it; part.pat = lib(`relay.${it}`); }
      else if (part.way === 'riot') { part.riot = it; part.pat = lib(`riot.${it}`); }
      else part.pat = lib(it);
      if (part.pat === prev) {       // never the same picture twice running
        const o = w.items[part.way][(part.n + 1) % w.items[part.way].length];
        if (part.way === 'relay') { part.seq = o; part.pat = lib(`relay.${o}`); } else if (part.way === 'riot') { part.riot = o; part.pat = lib(`riot.${o}`); } else part.pat = lib(o);
      }
      return part.pat;
    }
    const n = counts.get(visit) ?? 0;
    counts.set(visit, n + 1);
    // A suite. A section coming back wears the sequence it wore, in order. Once it's got three or four it goes round them: a short sequence, recognisably this section's.
    const had = worn.get(w.key) ?? [], most = name === 'chill' ? 3 : 4;
    worn.set(w.key, had);
    if (n < had.length || had.length >= most) {
      const it = had[n % had.length];
      if (it.pat !== prev) { q.replayOf = it.k; return it.pat; }
      if (had.length > 1) { const o = had[(n + 1) % had.length]; if (o.pat !== prev) { q.replayOf = o.k; return o.pat; } }
    }
    const pat = choose();
    if (had.length < most) had.push({ pat, k: q.k });
    return pat;
  };
  // How much a pattern's fineness costs it here, in the composer's scoring. Bold on the loud parts.
  const fineCost = (p, level) => {
    const k = finest(p), lim = BOLD[level >= 3 ? 0 : level === 2 ? 1 : 2], over = clamp(Math.log(k / lim) / Math.log(2.5));
    return (level >= 3 ? 3.5 : level === 2 ? 2.5 : 1.5) * over + (p.fine ? 1 : 0) + (level >= 3 && p.family === 'lines' ? 1.5 : 0);
  };

  // ---------------------------------------------------------------- how long each change takes
  // How long a flight takes: not all the same, and a part keeps the one it drew
  const flightOf = (l, part) => { const D = Math.max(FLIGHT_LEAST, (LEAD[name][l] + TAIL[name][l]) * bar); return part ? (part.flight ??= D * (1 + 2 * JITTER * rand())) : D; };
  const leadOf = (part, pat, next, len, kind) => {
    const l = part.level;
    if (own) return clamp(LEAD.chill[l] * bar, own.morph[0], Math.max(own.morph[0], Math.min(own.morph[1], 0.75 * len)));
    // Not all the same length: that's what a generator does. It goes by how the song's moving, and a little by nothing at all.
    const by = (KIND_LEAD[kind] ?? 1) * (1 + JITTER * (2 * rand() - 1));
    const lead = glides(pat, next) ? LEAD[name][l] * bar * by : FLIGHT_LEAD * flightOf(l, part) * by;
    return clamp(lead, 1.5, Math.max(0.72 * len, 1.5));
  };
  const tailOf = (part, pat, next) => {
    return glides(pat, next) ? TAIL[name][part.level] * bar : (1 - FLIGHT_LEAD) * flightOf(part.level, part);
  };

  // ---------------------------------------------------------------- what a gesture's wearing
  // Runs just before the director. Everything's in the picture's seconds except what time() is for.
  const dress = (gestures, { time, react, tau, meter }) => {
    const score = { time, react }, ctx = G => ({ score, A, M, G, shot: null, at: time, bar, beat, meter, tau });
    const done = new Map();       // how far a relay has got, so that it's further along each time
    gestures.forEach((G, i) => {
      const part = parts[i];
      if (!part) return;
      if (part.way !== 'relay' && part.way !== 'riot') return;
      const lvl = part.level, a = G.t0, end = G.t1 - (G.morph || 0);
      const fixed = () => { G.fixedRange = true; G.range = [0, 1]; G.phiTrack = [{ t: tau(a), x: 0, v: 1 / GEAR[lvl] }]; G.gears = []; G.melMode = 0; };
      if (part.way === 'relay') {
        const lead = (lvl >= 3 ? 1.1 : lvl === 2 ? 1.5 : 2.2) * bar, tail = (lvl >= 3 ? 0.4 : lvl === 2 ? 0.75 : 1.25) * bar;
        // Not while the Iris is still opening onto it
        const clear = part.a === climaxAt ? 6 : 0.5 * bar;
        const keys = [part.a, ...part.hits, part.b], stops = [...part.hits];
        // Bar lines between them where it's too long to wait, counted from the breath, so that a step falls on the phrase and the half phrase
        const first = M.breath?.bar0 ?? 0;
        for (let i = barAt(part.a) + 1; i < bars.length && bars[i] < part.b - 0.5 * bar; i++) {
          const most = STEP[name][levelAt(bars[i])];
          if (((i - first) % most + most) % most === 0 && !keys.some(t => Math.abs(bars[i] - t) < 0.5 * bar)) stops.push(bars[i]);
        }
        const on = [], apart = (lvl >= 4 || (name === 'riot' && lvl >= 3) ? 0.8 : 1.5) * bar;
        const held = tops.map(i => time(bars[i]));      // nothing new in the 2 bars before one of the biggest moments
        for (const t of stops.sort((x, y) => x - y).map(time)) if (t - lead > a + clear && t + tail < end && (!on.length || t - on.at(-1) > apart) && !held.some(h => t > h - HANG_BARS * bar && t < h - 0.1)) on.push(t);
        if (on.length) {
          fixed();
          const from = done.get(part.seq) ?? 0;
          G.moves = [{ id: 'relay', seq: part.seq, on, lead: Math.max(lead, 1.2), tail: Math.max(tail, 0.4), from }];
          done.set(part.seq, from + on.length);
        }
        return;
      }
      const m = { id: part.riot, beats: lvl >= 4 ? 'half' : 'strong', from: a, to: end };
      if (part.riot === 'scissor' && part.hits.length) m.teeth = part.hits.map(time);
      const made = MOVES[part.riot].cue(m, ctx(G)) ?? MOVES[part.riot].cue({ ...m, beats: 'half' }, ctx(G));
      if (made) { fixed(); G.moves = [made]; G.hero = part.riot; }
    });
  };

  // The biggest moments are prepared. For the 2 bars before each, whatever flows hangs back, and it surges through the hit and catches up over the 2 bars after: nothing that lands has moved, only the flow's clock, and it's all one smooth curve.
  // A clock in film seconds, for score.phi. Not over a rest, whose clock is doing something of its own.
  const warp = (time, windows = []) => {
    const W = HANG_BARS * bar, e = 0.12, K = [];
    for (const h of tops.map(i => time(bars[i])).sort((x, y) => x - y)) {
      const a = h - W, b = h + W;
      if (windows.some(l => a < l.paid && b > l.from) || a < (K.at(-1)?.t ?? OPENS)) continue;
      const x0 = a + (W - e) * (1 + HANG_SLOW) / 2, x1 = x0 + 2 * e * (HANG_SLOW + HANG_FAST) / 2;
      K.push({ t: a, x: a, v: 1 }, { t: h - e, x: x0, v: HANG_SLOW }, { t: h + e, x: x1, v: HANG_FAST }, { t: b, x: b, v: 1 });
    }
    return K.length ? t => evalTrack(K, t) : null;
  };

  // A pattern's long move rides at its own speed. A gesture that has less time rides less of it, around the middle: at 4x it's a flash.
  const shrinkArcs = (arcs, seen) => {
    const share = clamp(seen / ARC_SECONDS, 0.2, 1);
    if (share >= 1) return arcs;
    return arcs.map(a => {
      if (a.ease === 'wave') return { ...a, cycles: (a.cycles || 1) * share };
      if (a.log && a.from > 0 && a.to > 0) { const m = Math.sqrt(a.from * a.to); return { ...a, from: m * Math.pow(a.from / m, share), to: m * Math.pow(a.to / m, share) }; }
      const m = (a.from + a.to) / 2;
      return { ...a, from: m + (a.from - m) * share, to: m + (a.to - m) * share };
    });
  };

  // ---------------------------------------------------------------- the fastest frame on the hit
  // land.js's idea, for changes this short: it starts `lead` before the hit, as composed, and coasts `tail` past it. A change that has to be home on time, or has no room, stays as it was.
  const forget = G => { delete G.plan; delete G.planFor; delete G.planning; };
  const roomIn = (N, cast) => {
    if (N.hero === 'countdown') return 0;
    let room = N.t1 - (N.morph || 0) - N.t0 - 0.5 * bar;
    for (const m of N.moves ?? []) {
      if (m.id === 'star') room = Math.min(room, m.t0 - N.t0);
      if (m.id === 'relay' && m.on?.length) room = Math.min(room, m.on[0] - (m.lead ?? 2) - N.t0);
    }
    const lock = cast.find(h => h.G === N && h.kind === 'lock');
    return lock ? Math.min(room, lock.a - N.t0) : room;
  };
  const timeHits = (score, cast = []) => {
    if (own) return;
    const g = score.gestures, lags = score.time?.windows ?? [], last = g.length - 1;
    earn(score, cast);
    for (let i = 0; i < last - 1; i++) {
      const G = g[i], N = g[i + 1];
      if (!G.morph || G.xform || G.peak) continue;
      const end = G.t1, atRest = score.landings?.find(l => Math.abs(l.B - end) < 0.05)?.rest;
      const part = G.part ?? { level: levelAt(end - bar) }, flying = !glides(G.pattern, N.pattern);
      // What has to be home on time, a landing on a rest or into a Countdown, gets all of its time before it
      const home = () => { if (flying && G.morph < FLIGHT_LEAST) { G.morph = Math.min(FLIGHT_LEAST, 0.8 * (G.t1 - G.t0)); forget(G); } };
      if (atRest || lags.some(x => end < x.b && end + bar > x.from)) { home(); continue; }
      const tail = Math.min(tailOf(part, G.pattern, N.pattern), roomIn(N, cast));
      if (tail < 0.5 * bar || tail < 0.5) { home(); continue; }
      G.t1 = N.t0 = end + tail;
      G.morph = Math.min(Math.max(G.morph + tail, flying ? FLIGHT_LEAST : 0), G.t1 - G.t0 - 0.25);
      G.peak = { hit: end, q: 2 };
      // A star's arcs are shares of its gesture, and its roll's on the clock, so where the gesture starts later they're rewritten to stay with it (land.js)
      if (N.fixedRange && N.arcs?.length && N.moves?.some(m => m.id === 'star' || m.id === 'coin')) { const was = end, E = N.arcEnd ?? N.t1, H0 = E - was, H1 = E - N.t0; for (const x of N.arcs) if (x.at) x.at = x.at.map(u => Math.max(0, (was + u * H0 - N.t0) / H1)); }
      if (!G.fixedRange && G.regear) G.arcEnd = G.t1 - G.morph + Math.min(G.morph * 0.4, 3.5) / 2;
      forget(G);
    }
    // No transformation starts while the picture's clock is catching up with the song
    for (let i = 0; i < last; i++) {
      const G = g[i];
      if (!G.morph || G.xform) continue;
      const start = G.t1 - G.morph, w = lags.find(l => start > l.from && start < l.paid);
      if (w && G.t1 - w.paid >= 2.5) { G.morph = G.t1 - w.paid; forget(G); }
    }
  };

  // A hold has to earn it. Whatever's still plain for more than HOLD bars, with its transformation counted out, whips its long move through the strongest bar in it: a Ramp, the same move on a clock that hangs and crosses at speed.
  // Or if it has no long move, it's wrung, gently, on the strong beats.
  const earn = (score, cast) => {
    const g = score.gestures, ctx = G => ({ score, A, M, G, shot: null, at: score.time ?? (x => x), bar, beat, meter: A.meter || 4, tau: score.tau });
    for (let i = 1; i < g.length - 1; i++) {
      const G = g[i];
      if (G.moves?.length || G.hero || G.pattern.drive || G.carry && G.t1 - G.t0 < HOLD * bar) continue;
      const a = G.t0, end = G.t1 - (G.morph || 0);
      if ((end - a) / bar <= HOLD) continue;
      let best = null, top = -Infinity;
      for (const b of A.bars) {
        if (b < a + 3 * bar || b > end - 2 * bar) continue;
        const s = (M.arrivalAt?.(b) ?? 0) + 0.01 * heat[clamp(barAt(b), 0, heat.length - 1)];
        if (s > top) { top = s; best = b; }
      }
      if (best == null) continue;
      const ramp = MOVES.ramp.cue({ id: 'ramp', hit: best, cap: 0.8 }, ctx(G));
      if (ramp) { G.moves = [...(G.moves ?? []), ramp]; continue; }
      const wrung = MOVES.wring.cue({ id: 'wring', beats: 'strong', amp: 0.5, from: a + bar, to: end, coast: 1 }, ctx(G));
      if (wrung) { G.moves = [...(G.moves ?? []), wrung]; delete G.calm; }
    }
  };

  return {
    register: name, registerScore: reg.score, least: own ? own.morph[0] + 4 : Math.max(LEAST_S, 1.8 * bar), most: Math.min(MOST_S, MOST_BARS * bar), oneMore: ONE_MORE, stiff: STIFF, bar,
    want: t => barsWanted(t) * bar, isLoud: t => classAt(t) === 'loud' || classOfLabel((A.segments.find(x => t >= x.t0 && t < x.t1) ?? A.segments.at(-1)).label) === 'loud', shrinkArcs, warp, dropWorth: (dE, i) => (Math.abs(dE) >= DROP ? DROP_WORTH : 0) + (jumpAt.get(i) ?? 0), levelAt, classAt, get climaxAt() { return climaxAt; }, passages, parts, wear, fineCost, leadOf, tailOf, dress, timeHits, glides, wardrobe,
  };
}
