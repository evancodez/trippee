// Woah: what makes a generated film go through everything the engine can do, chosen by the music. On by default, ?woah=0 is the film without it. A pure function of the song and the seed, like everything else that makes a film: it runs last in compose (before the camera), when everything's where it's going to be.
//
//   THE TAKE      a seed leans one way and not another: which of the three sets it favours, a few tricks it's fond of, how often it does something, what it saves for the climax. So another take is another film.
//   THE WALK      along the song, a trick every 20 to 40 s where the song's up for it, less often where it's chill. Each place is read for what's going on in the music there, each trick says how well that suits it, and the best one the pattern can wear goes on. Never the same one twice running.
//   SECTIONS      a section that comes back has a relation to last time: the same trick further on, or its answer.
//   THE CLIMAX    the biggest thing the take has, saved for it, with the build before it winding up and what opens after it going on.
//   THE GUARD     every trick says what else could go in its place (score.woah.swap), and the rehearsal swaps one it can't clear for the next. It's never just dropped, and whatever it does is in score.refused.
//
// Two kinds of trick. A stretch is a move on a gesture's body, which comes up and goes back to the plain sheet by itself, so what's either side of it stays as it was. A change is a transformation through space at a landing, with the hit in the middle of its journey.
import { rng, clamp, lerp } from './curves.js';
import { directing } from './flags.js';
import { MOVES } from './moves/index.js';
import { rewindClock } from './moves/time.js';
import { canShock } from './xform/shock.js';
import { base, fineness } from './slot.js';
import { momentsOf } from './hear.js';
import { OFF, FAMILIES } from '../pattern/layout.js';

const OPEN_AT = 13;                  // seconds: nothing before the film has arrived
const GAP = { energetic: [20, 34], chill: [28, 46], world: [38, 60] };      // seconds from one trick starting to the next, at the most and least the song's own level asks for
const END_KEEP = 9;                  // seconds before the end of the song that nothing new starts
const SPACE_D = { flood: [9, 13], drop: [8, 11], tube: [10, 13], pleat: [8, 12], hall: [10, 13], span: [10, 18] };
const SHARE = { flood: 0.55, drop: 0.45, tube: 0.55, pleat: 0.5, hall: 0.5, span: 0.5 };     // of a change, before its hit: most of what you see of it is around there
const ANSWER = {      // what a section that comes back can say instead of the same again
  forever: ['screen', 'limit'], screen: ['forever'], limit: ['forever', 'pearls'], pearls: ['fan', 'limit'], fan: ['pearls', 'crumple'], crumple: ['slit', 'fan'], slit: ['crumple', 'echo'], echo: ['slit', 'forever'],
  fringe: ['ghost', 'snakes'], ghost: ['fringe', 'snakes'], snakes: ['ouchi', 'ghost'], ouchi: ['snakes', 'fringe'], slice: ['snakes', 'terraces'], roll: ['screen', 'fan'],
  flood: ['pleat', 'tube'], pleat: ['flood', 'hall'], drop: ['tube', 'flood'], tube: ['drop', 'flood'], hall: ['pleat', 'ride'], span: ['pleat', 'flood'],
  swell: ['terraces', 'ride'], terraces: ['swell', 'pleats'], pleats: ['terraces', 'hall'], ride: ['hall', 'swell'],
};
const SET = {      // id: which set
  flood: 'space', drop: 'space', tube: 'space', pleat: 'space', hall: 'space', span: 'time',
  swell: 'space', terraces: 'space', pleats: 'space', ride: 'space', hallway: 'space', slice: 'space',
  crumple: 'folds', limit: 'folds', forever: 'folds', screen: 'folds', pearls: 'folds', fan: 'folds', roll: 'folds',
  slit: 'time', ghost: 'time', fringe: 'time', snakes: 'time', ouchi: 'time', echo: 'time', rewind: 'time',
};
const MOVE_OF = { hallway: 'hall' };      // the stretch of a hall, whose name a change has
const CHANGES = ['flood', 'drop', 'tube', 'pleat', 'hall', 'span'];
// Out of the casting, still clickable and still called by name in a cut or by directing.woahOnly: span (PPP 74-110: frames to 100 ms, the governor at .6, then fine diagonals for 35 s) and limit (plain bold stripes on all three songs that got it, in place of richer rooms).
// They're still read and scored, so the take's dice fall as they did, and only where one of them would have won does anything change.
const OFF_CAST = new Set(['span', 'limit']);
const STRETCHES = ['forever', 'limit', 'screen', 'pearls', 'fan', 'crumple', 'roll', 'slit', 'ghost', 'fringe', 'snakes', 'ouchi', 'echo', 'slice', 'swell', 'terraces', 'pleats', 'ride', 'hallway', 'rewind'];
const LINES_ONLY = new Set(['crumple', 'limit']), MARCH = new Set(['ratchet', 'wring', 'scissor', 'bellows']);
const OVER_RELAY = new Set(['forever', 'limit', 'screen', 'pearls', 'fan', 'roll', 'swell', 'terraces', 'pleats']);      // it doesn't care what's on the sheet, and a Relay's steps can go on under it

// How well each suits a place. All 0 to about 1. These started from what the lanes guessed, and were gone over on sheets of real frames.
const near = (x, c, w) => clamp(1 - Math.abs(x - c) / w);
const SUIT = {
  forever: f => 0.15 + 0.95 * f.loud * f.loud + 0.15 * f.climb,
  limit: f => 0.2 + 0.9 * f.loud,
  echo: f => 0.1 + 0.55 * f.loud + 0.2 * f.voiced,
  screen: f => 0.15 + 0.9 * f.bridge + 0.35 * near(f.lv, 2, 2),
  pearls: f => 0.1 + 0.7 * near(f.lv, 1.5, 1.5) + 0.25 * f.voiced + 0.2 * f.climb,
  fan: f => 0.1 + 0.5 * near(f.lv, 1.5, 2) + 0.55 * f.climb,
  crumple: f => 0.2 + 0.95 * f.build + 0.35 * f.climb,
  roll: f => 1.05 * f.big,
  slit: f => 0.05 + 0.95 * f.build + 0.25 * f.loud + 0.3 * f.climax,
  ghost: f => 0.1 + 0.5 * f.groove + 0.25 * near(f.lv, 2, 2),
  fringe: f => 0.05 + 0.75 * f.intro + 0.4 * (1 - f.loud) + 0.2 * f.voiced,
  snakes: f => 0.05 + 0.65 * (1 - f.loud) + 0.2 * f.voiced,
  ouchi: f => 0.1 + 0.9 * f.breakdown + 0.3 * (1 - f.loud),
  slice: f => 0.2 + 1.0 * f.chord + 0.2 * (1 - f.voiced),
  swell: f => 0.1 + 0.35 * (1 - f.voiced) + 0.4 * near(f.lv, 2, 1.5) + 0.2 * f.groove,
  terraces: f => 0.1 + 0.35 * (1 - f.voiced) + 0.3 * f.loud + 0.2 * f.groove,
  pleats: f => 0.1 + 0.35 * (1 - f.voiced) + 0.45 * near(f.lv, 1.5, 1.5),
  ride: f => 0.1 + 0.4 * f.climb + 0.3 * (1 - f.voiced) + 0.25 * f.loud,
  hallway: f => 0.1 + 0.6 * f.bridge + 0.3 * near(f.lv, 2, 1.5) + 0.15 * (1 - f.voiced),
  rewind: f => 1.0 * f.build * f.arrive + 0.2 * f.build,
  drop: f => 0.05 + 1.0 * f.arrive * f.up + 0.25 * f.up,
  tube: f => 0.05 + 0.7 * f.build + 0.5 * f.arrive,
  flood: f => 0.1 + 0.65 * f.turn + 0.45 * f.up,
  pleat: f => 0.1 + 0.8 * f.turn + 0.2 * near(f.lv, 1.5, 1.5),
  hall: f => 0.1 + 0.6 * f.bridge + 0.35 * f.turn,
  span: f => 0.1 + 0.3 * f.turn + 0.45 * (1 - f.loud),
};
const LEAST = { forever: 8, limit: 8, echo: 9, screen: 9, pearls: 9, fan: 9, crumple: 9, roll: 8, slit: 7, ghost: 9, fringe: 11, snakes: 10, ouchi: 10, slice: 11, swell: 11, terraces: 11, pleats: 10, ride: 13, hallway: 14, rewind: 0 };
const WANT = { forever: 18, limit: 18, echo: 14, screen: 18, pearls: 16, fan: 18, crumple: 14, roll: 9, slit: 12, ghost: 12, fringe: 16, snakes: 14, ouchi: 12, slice: 18, swell: 18, terraces: 16, pleats: 15, ride: 20, hallway: 20, rewind: 0 };
const MOST = 26;

const meanOf = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const forget = G => { if (G) { delete G.plan; delete G.planFor; delete G.planning; } };
const crossed = G => { const s = base(G.pattern); let n = 0; for (let i = 0; i < FAMILIES; i++) if (s[OFF[`f${i}.on`]] >= 0.5 && Math.abs(s[OFF[`f${i}.d`]]) <= 1.01) n++; return n > 1; };
const flatSheet = s => s[OFF['surf.kind']] < 0.5 && s[OFF['matte.kind']] < 0.5 && s[OFF['ribbon.on']] < 0.5 && s[OFF['blobs.on']] < 0.5;
const KEEP = ['moves', 'hero', 'xform', 'morph', 't0', 't1', 'peak', 'noGlide', 'rise', 'arcEnd', 'carry'];
const keepOf = G => { const o = {}; for (const k of KEEP) o[k] = G[k]; return o; };
const putBack = (G, o) => { for (const k of KEEP) { if (o[k] === undefined) delete G[k]; else G[k] = o[k]; } forget(G); };

export function castWoah(film, A, M, { seed = 7, songHash = 0, world = null, ctxOf }) {
  const P = film.pace, g = film.gestures, lib = id => (film.library ?? film.patterns ?? []).find(p => p.id === id);
  if (!M || M.neutral || g.length < 5 || !film.tau) return null;
  const rand = rng(((seed | 0) * 2741 + songHash + 17) >>> 0), bar = Math.max(M.bar, 0.8), fps = A.fps, tEnd = g.at(-1).t0;
  const time = film.time ?? (t => t);
  const refused = (film.refused ??= []);
  const note = (t, what, why) => refused.push({ t: +(+t).toFixed(2), what, why });

  // ---------------------------------------------------------------- the take
  const TRICKS = (world ? STRETCHES.filter(id => SET[id] !== 'space' && id !== 'rewind') : [...STRETCHES, ...CHANGES]).filter(id => !directing.woahOnly || directing.woahOnly.includes(id));
  const lean = { space: 0.2 + 1.5 * rand(), folds: 0.2 + 1.5 * rand(), time: 0.2 + 1.5 * rand() };
  const fond = Object.fromEntries(TRICKS.map(id => [id, 2.4 * (rand() - 0.5)]));
  const chill = P?.register === 'chill';
  const gaps = world ? GAP.world : chill ? GAP.chill : GAP.energetic, pace = 0.75 + 0.35 * rand();      // this take is a little busier, or a little less so

  // ---------------------------------------------------------------- reading the song
  const series = k => A[k] ?? null;
  const at = (k, t) => { const s = series(k); return s ? s[clamp(Math.round(t * fps), 0, s.length - 1)] || 0 : 0; };
  const mean = (k, a, b) => { let s = 0, n = 0; for (let t = a; t < b; t += 0.25) { s += at(k, t); n++; } return n ? s / n : 0; };
  const everyE = [...(A.E ?? [])].filter((_, i) => i % 8 === 0).sort((a, b) => a - b), eLo = everyE[Math.floor(everyE.length * 0.1)] ?? 0, eHi = everyE[Math.floor(everyE.length * 0.9)] ?? 1, eSpan = Math.max(eHi - eLo, 0.02);
  const everyP = [...(A.perc ?? [])].filter((_, i) => i % 8 === 0).sort((a, b) => a - b), pLo = everyP[Math.floor(everyP.length * 0.25)] ?? 0, pHi = everyP[Math.floor(everyP.length * 0.85)] ?? 1;
  const levelAt = t => P?.levelAt?.(t) ?? clamp(4 * (mean('E', t - 1, t + 1) - eLo) / eSpan, 0, 4);
  const segAt = t => A.segments?.find(s => t >= s.t0 && t < s.t1) ?? A.segments?.at(-1) ?? { label: '', visit: 0, t0: 0, t1: tEnd };
  const labelCount = new Map();
  for (const s of A.segments ?? []) labelCount.set(s.label, (labelCount.get(s.label) ?? 0) + 1);
  const firstLabel = A.segments?.[0]?.label, lastLabel = A.segments?.at(-1)?.label;
  const moments = momentsOf(A, M).map(x => ({ ...x, t: time(x.t) }));
  const runs = (M.runs ?? []).filter(r => r.t1 - r.t0 >= 2 * bar).map(r => ({ a: time(r.t0), b: time(r.t1) }));
  const climax = P?.climaxAt ?? time(A.climax ?? tEnd * 0.7);
  const buildInto = L => {
    let best = 0;
    for (let n = 6; n <= 16; n += 2) {
      const len = n * bar;
      if (L - len < 4) break;
      const rise = (mean('E', L, L + 2 * bar) - mean('E', L - len - 2 * bar, L - len)) / eSpan;
      // never dipping far on the way
      const mid = mean('E', L - 0.6 * len, L - 0.4 * len), start = mean('E', L - len - bar, L - len + bar);
      if (rise > best && mid >= start - 0.1 * eSpan) best = rise;
    }
    return clamp(best / 0.7);
  };
  const featuresOf = (a, b, landing) => {
    let lv = 0, n = 0;
    for (let t = a; t < b; t += bar) { lv += levelAt(t); n++; }
    lv /= Math.max(n, 1);
    const mid = (a + b) / 2, seg = segAt(mid), first = mean('E', a, mid), second = mean('E', mid, b), before = mean('E', a - 8 * bar, a);
    const chordLong = Math.max(0, ...runs.map(r => Math.min(r.b, b) - Math.max(r.a, a))) / Math.max(b - a, 1);
    const f = {
      lv, loud: clamp((lv - 1) / 2), climb: clamp((second - first) / eSpan * 3), voiced: clamp(mean('voiced', a, b) * 1.3),
      groove: clamp((mean('perc', a, b) - pLo) / Math.max(pHi - pLo, 1e-3)) * clamp(1 - Math.abs(second - first) / eSpan * 3),
      chord: clamp((chordLong - 0.35) / 0.4), intro: a < 30 && seg === A.segments?.[0] ? 1 : a < 26 ? 0.7 : 0,
      bridge: labelCount.get(seg.label) === 1 && seg.label !== firstLabel && seg.label !== lastLabel ? 1 : 0,
      breakdown: clamp((before - mean('E', a, b)) / eSpan / 0.45) * (lv <= 1.5 ? 1 : 0.4),
      big: moments.some(x => x.sign > 0 && x.s >= 0.45 && x.t > a + 0.25 * (b - a) && x.t < b - 0.25 * (b - a)) ? 1 : 0,
      climax: clamp(1 - Math.abs(mid - climax) / (8 * bar)),
      build: landing != null ? buildInto(landing) : 0, arrive: 0, up: 0, turn: 0,
    };
    if (landing != null) {
      const dE = (mean('E', landing, landing + 2 * bar) - mean('E', landing - 2 * bar, landing)) / eSpan;
      f.up = clamp(dE / 0.5);
      f.arrive = clamp(Math.max(M.arrivalAt?.(landing) ?? 0, ...moments.filter(x => x.sign > 0 && Math.abs(x.t - landing) < bar).map(x => x.s)));
      const s1 = segAt(landing - bar), s2 = segAt(landing + bar);
      f.turn = s1.label !== s2.label ? 1 : s1 !== s2 ? 0.5 : 0;
      const after = segAt(landing + bar);
      f.bridge = labelCount.get(after.label) === 1 && after.label !== firstLabel && after.label !== lastLabel ? 1 : 0;
    }
    return f;
  };

  // ---------------------------------------------------------------- what can be worn where
  const taken = [];      // [a, b] of what's been placed
  const clear = (a, b) => !taken.some(([x, y]) => a < y && b > x);
  const appointments = G => G.hero === 'countdown' || G.hero === 'star' || G.hero === 'coin' || G.moves?.some(m => ['star', 'coin', 'slip', 'snap', 'countdown'].includes(m.id));
  const relayOf = G => !!G.moves?.some(m => m.id === 'relay');
  // What marches on the strong beats can go on marching under a mirror or on a hill
  const marches = G => !!G.moves?.some(m => MARCH.has(m.id));
  const nothingElse = G => !G.moves?.some(m => !m.woah && m.id !== 'relay' && !MARCH.has(m.id));
  // A body that can wear a stretch: nothing on it but perhaps a Relay, which can go on under it
  const wearable = G => (!G.hero || MARCH.has(G.hero) || G.pattern.family === 'riley') && nothingElse(G);
  const absorbable = G => !G.hero && !G.moves?.length && !G.pattern.drive && G.k != null && G.xform?.id !== 'iris';
  const bodyOf = G => [G.t0, G.t1 - (G.morph || 0)];
  // What it could reach, taking in the plain gestures after it
  const reach = (i, want) => {
    let j = i, end = bodyOf(g[i])[1];
    while (end - g[i].t0 < want && j + 1 < g.length - 1 && absorbable(g[j + 1]) && g[j].xform?.id !== 'iris') { j++; end = bodyOf(g[j])[1]; }
    return { j, end };
  };
  // Its body runs on over those. What they were is what it can't get back: a guard's swap keeps this and changes what's worn.
  const absorb = (i, j) => {
    const G = g[i];
    if (j <= i) return;
    const L = g[j];
    G.t1 = L.t1; G.morph = L.morph; G.kindOut = L.kindOut; G.peak = L.peak; G.rise = L.rise; G.xform = L.xform; G.noGlide = L.noGlide;
    if (!G.fixedRange) G.arcEnd = G.t1 - (G.morph || 0) + Math.min((G.morph || 0) * 0.4, 3.5) / 2;
    forget(G);
    g.splice(i + 1, j - i);
  };

  // A trick that has a pattern of its own gets a gesture of its own, from `from` to `to`: what was there goes on before it and after it, if there's enough of it to be worth anything. So a Floating Disc is a moment and not the rest of the song.
  const OWN_MORPH = 5.5, OWN_LEAST = 5;
  const carve = (i, from, to, pattern) => {
    if (!film.remake || !pattern || g[i].k == null) return null;
    let G = g[i], k = i;
    const end = bodyOf(G)[1], copyOut = (H, T) => { for (const f of ['morph', 'peak', 'xform', 'rise', 'noGlide', 'kindOut', 'label', 'visit', 'part', 'quick']) { if (T[f] === undefined) delete H[f]; else H[f] = T[f]; } };
    // What's left after it, as itself
    let after = null;
    const out = to + OWN_MORPH;      // its transformation out starts when the trick's run out, on a plain sheet
    if (end - out >= OWN_LEAST + OWN_MORPH) {
      const rest = G.moves?.some(m => m.id === 'relay') ? { ...G, moves: G.moves.filter(m => m.id === 'relay').map(m => { const o = { ...m, on: m.on?.filter(u => u - (m.lead ?? 2) > to + 0.3) }; delete o._w; if (o.on && !o.on.length) o.on = [G.t1 + 3600]; return o; }), t0: out } : film.remake({ k: G.k, t0: out, t1: G.t1 }, G.pattern);
      copyOut(rest, G);
      rest.k = G.k;
      after = rest;
    }
    const own = film.remake({ k: G.k, t0: from, t1: after ? out : G.t1 }, pattern);
    own.k = G.k; own.t1 = after ? out : G.t1;
    if (after) { own.morph = OWN_MORPH; own.kindOut = 'level'; own.label = G.label; own.visit = G.visit; own.part = G.part; own.quick = G.quick; delete own.peak; delete own.xform; }
    else copyOut(own, G);
    own.fixedRange = true; own.range = [0, 1]; own.arcEnd = own.t1 - (own.morph || 0); own.arcs = [];
    if (from - G.t0 >= OWN_LEAST) {
      // It ends where this starts, and a transformation takes it there
      G.t1 = from; G.morph = Math.min(OWN_MORPH, from - G.t0 - 1); delete G.peak; delete G.xform; delete G.rise; delete G.noGlide; G.kindOut = 'level';
      if (!G.fixedRange) G.arcEnd = G.t1 - G.morph + Math.min(G.morph * 0.4, 3.5) / 2;
      holdRelay(G, G.t1 - G.morph, Infinity);
      forget(G);
      g.splice(i + 1, 0, own, ...(after ? [after] : []));
      k = i + 1;
    } else {
      own.t0 = G.t0; own.arcEnd = own.t1 - (own.morph || 0);
      g.splice(i, 1, own, ...(after ? [after] : []));
      forget(g[i - 1]);
    }
    return { G: own, i: k };
  };

  // A Relay holds still under a trick: two things changing the whole frame at once is a flash, and it's more than anyone can follow. Its steps either side of it stay where they were.
  const holdRelay = (G, a, b) => {
    if (!G?.moves?.some(m => m.id === 'relay' && m.on)) return;
    G.moves = G.moves.map(m => {
      if (m.id !== 'relay' || !m.on) return m;
      const L = m.lead ?? 2, T = m.tail ?? 1, on = m.on.filter(u => u + T < a - 0.2 || u - L > b + 0.2), o = { ...m, on: on.length ? on : [G.t1 + 3600] };
      delete o._w;
      return o;
    });
  };

  // ---------------------------------------------------------------- wearing one
  const cueIt = (id, m, G) => {
    const mv = MOVES[m.id ?? id];
    const done = mv?.cue ? mv.cue(m, ctxOf(G)) : m;
    if (!done) return null;
    done.woah = true;
    if (done.from == null && m.from != null) done.from = m.from;
    if (SET[id] !== 'time' || id === 'span') done.gate = true;      // nothing to write outside its time, so nothing's paid for it there
    return done;
  };
  const addMove = (G, m) => { G.moves = [...(G.moves ?? []), m]; };
  const foldOpts = (id, from, to, s) => {
    const len = (to - from) / bar, open = Math.min(id === 'crumple' ? 6 : 3.5, 0.3 * len), close = Math.min(2.5, 0.2 * len);
    return { id, from, to, open, close };
  };
  const MAPS = ['sweep', 'target', 'rings', 'spiral', 'wave', 'cells'];
  // Each takes what the music and the strength say, and answers a move or null. s: 0 is plain, and it goes up each time a section comes back.
  const MAKE = {
    forever: (G, from, to, s) => ({ ...foldOpts('forever', from, to, s), n: 4 + 2 * Math.round(1 + s), tw: 0.3 + 0.3 * s, speed: 0.34 + 0.16 * s }),
    limit: (G, from, to, s) => ({ ...foldOpts('limit', from, to, s), sides: s > 0.5 ? 8 : 6, corner: s > 0.5 ? 3 : 4 }),
    screen: (G, from, to, s) => ({ ...foldOpts('screen', from, to, s), Sz: 0.5, turn: 0.32 + 0.3 * s, speed: 0.26 + 0.1 * s }),
    pearls: (G, from, to, s) => ({ ...foldOpts('pearls', from, to, s), n: Math.min(5, 3 + Math.round(1.5 * s)), r: 0.62 - 0.08 * s }),
    fan: (G, from, to, s) => ({ ...foldOpts('fan', from, to, s), lo: 2, hi: Math.round(6 + 3 * s) }),
    crumple: (G, from, to, s) => ({ ...foldOpts('crumple', from, to, s), folds: Math.min(8, 5 + Math.round(2.5 * s)) }),
    roll: (G, from, to, s) => {
      const D = Math.max(7, 3.5 * bar), best = moments.filter(x => x.sign > 0 && x.s >= 0.45 && x.t - D / 2 >= from && x.t + D / 2 <= to).sort((a, b) => b.s - a.s)[0];
      return best ? { id: 'roll', from, to, D, hits: [best.t], way: 0.12 + 0.5 * rand() } : null;
    },
    slit: (G, from, to, s, { hit }) => {
      // It winds up to the strongest moment in it, and snaps back into register there. Failing that, the hit it ends on
      const inside = moments.filter(x => x.sign > 0 && x.s >= 0.3 && x.t > from + 3 * bar && x.t < to - 1.5 * bar).sort((a, b) => b.s - a.s)[0]?.t;
      const H = inside ?? (hit != null && hit > from + 3 * bar && hit < to + 1.5 * bar ? hit : null), map = MAPS[Math.floor(rand() * MAPS.length)], top = (map === 'wave' ? 1.1 : map === 'cells' ? 1.8 : 2.2) * (1 + 0.35 * s);
      const D = H ? [[from, 0], [Math.max(from + 2 * bar, H - 1.5 * bar), top], [H, 0.15 * top], [H + 2 * bar, top]] : [[from, 0], [from + 3 * bar, top], [to, top]];
      const o = { id: 'slit', from, to, beats: 'strong', D, lead: 0.5, coast: 2 };
      if (G.pattern.time?.id === 'slit') return o;      // it's one of its own, and says for itself
      Object.assign(o, { turn: 0.42 + 0.14 * s, push: map === 'target' || map === 'rings' ? 0.18 : 0 });
      if (map === 'rings') Object.assign(o, { map: 'target', bands: 7, register: 0.5 });
      else if (map === 'spiral') Object.assign(o, { map: 'spiral', arms: 1, wind: 0.9 });
      else if (map === 'wave') Object.assign(o, { map: 'wave', wave: 3, waveV: 0.6, ang: 0.4, spin: 0.08 });
      else if (map === 'cells') Object.assign(o, { map: 'cells', wave: 1.1, spin: 0.08, ang: 0.3 });
      else Object.assign(o, { map, spin: map === 'sweep' ? 0.1 : 0 });
      return o;
    },
    ghost: (G, from, to, s) => ({ id: 'ghost', from, to, beats: 'strong', turn: 0.7 + 0.15 * s, lead: 1, coast: 2 }),
    fringe: (G, from, to, s) => ({ id: 'fringe', from, to, beats: 'strong', lead: 2, coast: 2 }),
    snakes: (G, from, to, s) => ({ id: 'snakes', from, to, beats: 'strong', lead: 2, coast: 2 }),
    ouchi: (G, from, to, s) => ({ id: 'ouchi', from, to, beats: 'strong', on: 8, off: 4, lead: 2, coast: 2 }),
    echo: (G, from, to, s) => ({ id: 'echo', from, to, beats: 'strong', lag: 0.35, turn: 0.35 + 0.12 * s, amp: [[from, 0], [from + 2 * bar, 1], [to - 1.5 * bar, 1], [to, 0]] }),
    slice: (G, from, to, s) => ({ id: 'slice', from, to, lead: Math.min(6, 0.3 * (to - from)), coast: Math.min(5, 0.25 * (to - from)), speed: 1 + 0.5 * s }),
    swell: (G, from, to, s) => ({ id: 'swell', from, to, lead: Math.min(6, 0.3 * (to - from)), coast: Math.min(5, 0.25 * (to - from)), A: 0.3 + 0.1 * s }),
    terraces: (G, from, to, s) => ({ id: 'terraces', from, to, lead: Math.min(6, 0.3 * (to - from)), coast: Math.min(5, 0.25 * (to - from)) }),
    pleats: (G, from, to, s) => ({ id: 'pleats', from, to, lead: Math.min(5, 0.3 * (to - from)), coast: Math.min(5, 0.25 * (to - from)), A: 0.95 + 0.25 * s }),
    ride: (G, from, to, s) => ({ id: 'ride', from, to, lead: Math.min(7, 0.3 * (to - from)), coast: Math.min(7, 0.3 * (to - from)) }),
    hallway: (G, from, to, s) => ({ id: 'hall', from, to, lead: Math.min(8, 0.33 * (to - from)), coast: Math.min(7, 0.28 * (to - from)) }),
  };
  // The pattern a trick wants a sheet to be, if it isn't.
  const OWN = { slice: 'space.crystal', fringe: 'time.fringe', ouchi: 'time.ouchi' };
  // ...and those that can have one, if what's there can't take them. A Relay can't: a time trick reads the sheet's phases, and it's changing all of them.
  const OWN_IF = { ghost: ['time.ghostcheck', 'time.ghost'], snakes: ['time.snakes'], echo: ['time.echo'], slit: ['time.shutter', 'time.target', 'time.rings', 'time.venetian', 'time.wave', 'time.spiral', 'time.cells'], swell: ['space.swell'], terraces: ['space.terraces'], pleats: ['space.pleats'], ride: ['space.ride'], hallway: ['space.hall'], crumple: ['folds.crumple', 'folds.crumplerings'], limit: ['folds.limit'] };
  const ownFor = (id, G) => {
    if (world) return null;
    if (OWN[id]) return lib(OWN[id]);
    const list = OWN_IF[id];
    if (!list || directFits(id, G)) return null;
    return lib(list[Math.floor(rand() * list.length)]);
  };
  // Can this sheet wear it as it stands?
  const directFits = (id, G) => {
    const s = base(G.pattern), mv = MOVES[MOVE_OF[id] ?? id];
    if (!mv) return false;
    if (OWN[id] && !world) return false;
    if (LINES_ONLY.has(id) && (crossed(G) || relayOf(G))) return false;      // on a check they're only a busier check, and a Relay is a check as often as not
    if ((relayOf(G) || marches(G) || G.pattern.drive) && !OVER_RELAY.has(id)) return false;
    if ((id === 'slit' || id === 'echo') && !flatSheet(s)) return false;
    // A tube or a hall goes off to a point, and whatever's fine to start with is grey by there
    if ((id === 'ride' || id === 'hallway') && (relayOf(G) || fineness(s) > 4.5)) return false;
    // A sheet in space on a floor that's already gone off to its own horizon is hairlines to the horizon
    if (SET[id] === 'space' && id !== 'slice' && !flatSheet(s)) return false;
    if (mv.needs && !mv.needs(s, G)) return false;
    if (world && !flatSheet(s) && SET[id] === 'time') return false;
    return true;
  };
  const canCarve = G => !world && !!film.remake && G.k != null && !G.moves?.some(m => m.woah) && !marches(G) && !G.hero;
  const canWear = (id, G) => directFits(id, G) || (canCarve(G) && (OWN[id] ? !!lib(OWN[id]) : !!OWN_IF[id]?.some(lib)));

  const wearStretch = (id, i, from, to, s, more = {}) => {
    const G = g[i];
    if (id === 'rewind') {
      const hit = more.hit ?? G.peak?.hit ?? G.t1, back = Math.min(6 * bar, hit - G.t0 - 2 * bar);
      if (back < 2 * bar) return null;
      const m = cueIt('rewind', { id: 'rewind', hit, back: Math.min(back, 8), bars: 3 }, G);
      if (!m) return null;
      m.woahId = 'rewind';
      G.moves = [...(G.moves ?? []), m];
      const k = film.rewinds.at(-1);
      return { undo: () => { film.rewinds = film.rewinds.filter(x => x !== k); film.rewind = film.rewinds.length ? rewindClock(film.rewinds) : null; } };
    }
    let on = G;
    const own = ownFor(id, G);
    if (own) {
      const c = carve(i, from, to, own);
      if (!c) return null;
      on = c.G;
    }
    to = Math.min(to, bodyOf(on)[1]);
    if (to - Math.max(from, on.t0) < 4) return null;
    const made = MAKE[id](on, Math.max(from, on.t0), to, s, more);
    const m = made && cueIt(id, made, on);
    if (!m) return null;
    m.woahId = id;
    const before = keepOf(on);
    holdRelay(on, from, to);
    addMove(on, m);
    return { on, before };
  };

  // A change at a landing: the hit's in the middle of its journey. It keeps what it needs either side, taking in plain gestures on the way if it has to.
  const changeRoom = (i, id, hit) => {
    const G = g[i], N = g[i + 1], [lo, hi] = SPACE_D[id];
    if (!N || i + 1 >= g.length - 1) return null;
    const share = SHARE[id], need = hi;
    let back = i, a0 = G.t0;
    while (back > 1 && (hit - a0 - 1.2) / share < need && absorbable(g[back]) && !appointments(g[back - 1]) && !g[back - 1].moves?.some(m => m.woah) && g[back - 1].xform?.id !== 'iris' && !g[back - 1].hero) { back--; a0 = g[back].t0; }
    let fwd = i + 1, e0 = bodyOf(N)[1];
    while (fwd + 1 < g.length - 1 && (e0 - hit - 0.5) / (1 - share) < need && absorbable(g[fwd + 1]) && !N.moves?.some(m => m.woah)) { fwd++; e0 = bodyOf(g[fwd])[1]; }
    const D = Math.min(hi, (hit - a0 - 1.2) / share, (e0 - hit - 0.5) / (1 - share));
    if (D < lo) return null;
    return { D, a: hit - share * D, b: hit + (1 - share) * D, back, fwd };
  };
  const wearChange = (id, i, hit, D, s) => {
    const G = g[i], N = g[i + 1], t1 = hit + (1 - SHARE[id]) * D, o = {};
    if (id === 'flood') o.amp = 0.42 * (1 + 0.25 * s);
    if (id === 'drop') { o.depth = 3.2 * (1 + 0.3 * s); o.yaw = 0.45 * (rand() < 0.5 ? 1 : -1); }
    if (id === 'pleat') o.h = 1.15 * (1 + 0.2 * s);
    if (id === 'span') { o.ang = 0.2 + rand() * 1.2; o.wander = 0.25; if (!canShock(base(G.pattern), base(N.pattern), film.aspect ?? 16 / 9, { centre: [0, 0], any: true, D })) return null; }
    if (N.carry) delete N.carry;
    G.t1 = N.t0 = t1; G.morph = D; G.xform = { id, woah: true, ...o }; G.peak = { hit, q: 0 }; delete G.rise; delete G.noGlide;
    if (!G.fixedRange) G.arcEnd = G.t1 - G.morph + Math.min(G.morph * 0.4, 3.5) / 2;
    if (N.morph) N.morph = Math.min(N.morph, N.t1 - N.t0 - 1);
    holdRelay(G, t1 - D, t1); holdRelay(N, t1 - D, t1);
    forget(G); forget(N); forget(g[i - 1]);
    return {};
  };

  // ---------------------------------------------------------------- the walk
  const said = new Map();     // a section's label: the first thing it wore
  const uses = new Map(), list = [], slots = [];
  let lastId = null, lastSet = null;
  const recent = [];
  // What's there already, that counts: nothing else goes on top of these
  const heroes = g.slice(0, -1).filter(G => appointments(G) || G.xform?.id === 'iris').map(G => ({ a: G.xform?.id === 'iris' ? G.t1 - G.morph : G.t0, b: G.t1, kind: G.hero ?? G.xform?.id, G }));
  for (const h of heroes) taken.push([h.a, h.b]);

  const relationOf = (id, seg) => {
    const was = (seg.visit || 0) > 0 ? said.get(seg.label) : null;
    if (!was) return { bonus: 0, s: 0 };
    if (id === was.id) return { bonus: 1.9, s: was.s + 0.45, again: true };
    if (ANSWER[was.id]?.includes(id)) return { bonus: 1.5, s: was.s + 0.25, answers: was.id };
    return { bonus: 0, s: was.s * 0.5 };
  };
  const scoreOf = (id, f, seg, entry, mid, rel) => {
    const set = SET[id];
    let v = 2.4 * SUIT[id](f) + (lean[set] ?? 1) + (fond[id] ?? 0) + rel.bonus;
    v -= 1.6 * (uses.get(id) ?? 0);
    if (recent.includes(id)) v -= 1.2;
    if (set === lastSet) v -= 0.5;
    v -= 0.03 * Math.abs(entry - mid);
    return v + 0.35 * rand();
  };

  const place = (c, alts) => {
    const { id, kind, from, to, hit, D, rel, f } = c, seg = segAt((from + to) / 2);
    let i = c.i;
    if (kind === 'stretch' && c.j > i) absorb(i, c.j);
    if (kind === 'change') {
      if (c.fwd > i + 1) absorb(i + 1, c.fwd);
      if (c.back < i) { absorb(c.back, i); i = c.back; }
    }
    const G = g[i], N = g[i + 1], slot = { id, kind, G, N, from, to, hit, D, s: rel.s, alts, tried: [id] };
    slot.keptG = keepOf(G); slot.keptN = N ? keepOf(N) : null; slot.i = i;
    const did = kind === 'change' ? wearChange(id, i, hit, D, rel.s) : wearStretch(id, i, from, to, rel.s, { hit });
    if (!did) { putBack(G, slot.keptG); if (N) putBack(N, slot.keptN); return null; }
    slot.undo = did.undo ?? null;
    if (did.on) { slot.G = did.on; slot.keptG = did.before; slot.N = null; slot.keptN = null; }
    slot.alts = alts.filter(x => !OWN[x] && !OWN_IF[x]);
    forget(G); forget(g[i - 1]);
    const out = { id, kind, at: +(kind === 'change' ? hit : from).toFixed(2), t0: +from.toFixed(2), t1: +to.toFixed(2), pattern: (did.on ?? G).pattern.id, why: Object.entries(f).filter(([k, v]) => v >= 0.5 && k !== 'lv').map(([k]) => k).join(' '), ...(rel.again ? { again: true } : {}), ...(rel.answers ? { answers: rel.answers } : {}), ...(c.climax ? { climax: true } : {}) };
    list.push(out); slots.push(slot); slot.out = out;
    taken.push([from, to]);
    uses.set(id, (uses.get(id) ?? 0) + 1);
    if (!said.has(seg.label) && kind === 'stretch') said.set(seg.label, { id, s: rel.s });
    if (!said.has(segAt(hit ?? from).label) && kind === 'change') said.set(segAt((hit ?? from) + bar).label, { id, s: rel.s });
    lastId = id; lastSet = SET[id];
    recent.unshift(id); recent.length = Math.min(recent.length, 3);
    return out;
  };

  // Everything that could start in this window, best first
  const candidates = (lo, hi) => {
    const out = [], mid = (lo + hi) / 2;
    for (let i = 0; i < g.length - 1; i++) {
      const G = g[i];
      if (G.t0 > hi + 2) break;
      if (G.t1 < lo) continue;
      if (appointments(G)) continue;
      // A stretch
      if (wearable(G)) {
        const [a0, e0] = bodyOf(G), from0 = Math.max(a0, lo, OPEN_AT), from = from0 > a0 + 2 * bar ? (A.bars.find(t => t >= from0) ?? from0) : a0;
        if (from <= hi) {
          for (const id of STRETCHES) {
            if (!TRICKS.includes(id) || id === lastId || id === 'rewind' || !canWear(id, G)) continue;
            const { j, end } = reach(i, from - a0 + (world ? LEAST[id] + 2 : WANT[id])), to = Math.min(end, from + MOST);
            if (to - from < LEAST[id] || !clear(from, to)) continue;
            const f = featuresOf(from, to, G.peak?.hit ?? G.t1), seg = segAt((from + to) / 2), rel = relationOf(id, seg);
            if (SUIT[id](f) < 0.2 && !rel.bonus) continue;
            out.push({ id, kind: 'stretch', i, j, from, to, hit: G.peak?.hit ?? G.t1, f, rel, v: scoreOf(id, f, seg, from, mid, rel) });
          }
        }
      }
      // A rewind, on the last bars of a build
      if (!i) continue;
      if (!world && TRICKS.includes('rewind') && lastId !== 'rewind' && !G.xform && !G.hero && G.morph && !g[i + 1]?.hero) {
        const hit = G.peak?.hit ?? G.t1, a = hit - 3 * bar - 6 * bar;
        if (a >= lo && a <= hi && hit > G.t0 + 7 * bar && clear(hit - 3 * bar, hit + bar)) {
          const f = featuresOf(hit - 6 * bar, hit, hit), rel = relationOf('rewind', segAt(hit - bar));
          if (f.build > 0.25) out.push({ id: 'rewind', kind: 'stretch', i, j: i, from: hit - 3 * bar, to: hit + bar, hit, f, rel, v: scoreOf('rewind', f, segAt(hit - bar), a, mid, rel) });
        }
      }
      // A change, at its landing
      if (!world && G.xform?.id !== 'iris' && G.t1 - G.t0 > 2 && nothingElse(G) && !appointments(g[i + 1])) {
        const hit = G.peak?.hit ?? G.t1;
        for (const id of CHANGES) {
          if (!TRICKS.includes(id) || id === lastId || !!SAVED.has(id)) continue;
          const room = changeRoom(i, id, hit);
          if (!room || room.a < lo || room.a > hi || !clear(room.a, room.b)) continue;
          const f = featuresOf(room.a, room.b, hit), seg = segAt(hit + bar), rel = relationOf(id, seg);
          if (SUIT[id](f) < 0.25 && !rel.bonus) continue;
          out.push({ id, kind: 'change', i, back: room.back, fwd: room.fwd, from: room.a, to: room.b, hit, D: room.D, f, rel, v: scoreOf(id, f, seg, room.a, mid, rel) });
        }
      }
    }
    return out.filter(x => !OFF_CAST.has(x.id) || directing.woahOnly?.includes(x.id)).sort((x, y) => y.v - x.v);
  };

  // ---------------------------------------------------------------- the climax: what's saved
  const SAVED = new Set();
  const climaxG = !world ? g.findIndex(G => G.xform?.id === 'iris') : -1;
  let climaxIdea = null;
  if (!world) {
    const ideas = ['drop', 'tube', 'iris', 'iris'];
    climaxIdea = ideas[Math.floor(rand() * ideas.length)];
    if (climaxIdea !== 'iris') SAVED.add(climaxIdea);
  }
  const climaxPlace = () => {
    let i = climaxG;
    if (i < 1) { i = g.findIndex(G => Math.abs((G.peak?.hit ?? G.t1) - climax) < 2 * bar); }
    if (i < 1 || i + 1 >= g.length - 1) return;
    const G = g[i], N = g[i + 1], hit = G.peak?.hit ?? climax;
    // The crater or the wormhole, in place of the Iris, if there's room
    if (climaxIdea !== 'iris' && !appointments(N)) {
      const room = changeRoom(i, climaxIdea, hit);
      if (room && G.t1 - G.t0 > 3) {
        const iris = taken.findIndex(([a, b]) => Math.abs(b - G.t1) < 1e-3);
        if (iris >= 0) taken.splice(iris, 1);
        const f = featuresOf(room.a, room.b, hit), rel = { bonus: 0, s: 0.6 };
        place({ id: climaxIdea, kind: 'change', i, back: room.back, fwd: room.fwd, from: room.a, to: room.b, hit, D: room.D, f, rel, climax: true }, ['flood', 'tube', 'pleat'].filter(x => x !== climaxIdea));
        i = g.findIndex(x => x.xform?.id === climaxIdea);
      }
    }
    // What opens after it is the biggest stretch this take has
    const O = g[i + 1], [oa, oe] = bodyOf(O);
    const ids = [lean.folds >= lean.space ? 'forever' : 'ride', 'forever', 'screen', 'terraces'].filter(id => canWear(id, O));
    if (wearable(O) && oe - oa >= 10 && ids.length) {
      const id = ids[0], { j, end } = reach(i + 1, 18), to = Math.min(end, oa + MOST), f = featuresOf(oa, to, O.t1), rel = { bonus: 0, s: 1 };
      if (clear(oa, to)) place({ id, kind: 'stretch', i: i + 1, j, from: oa, to, hit: O.t1, f, rel, climax: true }, ids.slice(1));
    }
    // The build into it winds up
    const B = g[i], [ba, be] = bodyOf(B);
    if (wearable(B) && !relayOf(B) && be - ba >= 5 && directFits('slit', B) && clear(ba, be)) place({ id: 'slit', kind: 'stretch', i, j: i, from: ba, to: be, hit, f: featuresOf(ba, be, hit), rel: { bonus: 0, s: 0.5 }, climax: true }, ['crumple', 'fan']);
  };
  if (!world) climaxPlace();

  // ---------------------------------------------------------------- along the song
  let entry = OPEN_AT - gaps[0] * pace * 0.5;
  lastId = null;
  for (let guard = 0; guard < 80; guard++) {
    const level = levelAt(entry + gaps[0] * pace), gapHere = lerp(gaps[1], gaps[0], clamp(level / 3)) * pace, lo = Math.max(entry + 0.8 * gapHere, OPEN_AT), hi = entry + 1.2 * gapHere;
    if (lo > tEnd - END_KEEP) break;
    // What's already placed here counts as something new
    const here = list.map(x => x.t0).filter(t => t > entry + 6 && t <= hi).sort((a, b) => a - b)[0];
    if (here != null) { entry = here; const was = list.find(x => x.t0 === here); lastId = was.id; lastSet = SET[was.id]; continue; }
    // The first stretch of song from here that has anything it can wear. So there's no hole in a film just because of where a window happened to fall.
    let done = false;
    for (let a = lo, b = hi; a < tEnd - END_KEEP && !done; a = b, b += 0.5 * gapHere) {
      const cands = candidates(a, b);
      for (let n = 0; n < cands.length && !done; n++) {
        const c = cands[n], alts = cands.filter(x => x.id !== c.id && x.kind === c.kind).slice(0, 6).map(x => x.id);
        if (place(c, [...new Set(alts)])) { entry = c.from; done = true; }
      }
    }
    if (!done) break;
  }
  list.sort((a, b) => a.at - b.at);

  // ---------------------------------------------------------------- the guard's swap
  const swap = (slot, id) => {
    const { G, N } = slot, kept = { G: keepOf(G), N: N ? keepOf(N) : null, id: slot.id, undo: slot.undo };
    // Still never the same one twice running
    const k = slots.filter(x => x !== slot).sort((a, b) => a.from - b.from), before = k.filter(x => x.from < slot.from).at(-1), after = k.find(x => x.from > slot.from);
    if (id != null && (before?.id === id || after?.id === id)) return null;
    if (id != null && slot.kind === 'stretch' && (slot.to - slot.from < LEAST[id] || !directFits(id, G))) return null;
    slot.undo?.();
    putBack(G, slot.keptG); if (N) putBack(N, slot.keptN);
    const rel = { s: slot.s };
    let did = null;
    if (id == null) did = {};
    else if (slot.kind === 'change') did = wearChange(id, g.indexOf(G), slot.hit, Math.min(slot.D, SPACE_D[id]?.[1] ?? slot.D), rel.s);
    else did = wearStretch(id, g.indexOf(G), slot.from, slot.to, rel.s, { hit: slot.hit });
    if (!did) { putBack(G, kept.G); if (N) putBack(N, kept.N); return null; }
    slot.id = id; slot.undo = did.undo ?? null; slot.out.id = id ?? 'none';
    forget(G); forget(N); forget(g[g.indexOf(G) - 1]);
    return () => { slot.undo?.(); putBack(G, kept.G); if (N) putBack(N, kept.N); slot.id = kept.id; slot.undo = kept.undo; slot.out.id = kept.id; forget(g[g.indexOf(G) - 1]); };
  };

  return { list, slots, swap, climaxIdea, take: { lean, pace }, stats: list.map(x => `${x.id}@${Math.round(x.at)}`).join(' ') };
}
