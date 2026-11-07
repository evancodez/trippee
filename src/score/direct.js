// The director. The gestures are built; this decides what the song's big moments wear, so that everything the engine can do gets seen, where it means something. See docs/NEXT.md, Stage 3.
//
//   The first real arrival                       a Countdown: a dial shatters and its rings lock one per bar, the last on the downbeat
//   A build, the sound growing for 8+ bars       a Coin, once: it spins down and lands dead flat as the build lands
//   A long stretch with real chord changes       the Star, once: the sheet rolls up into a ball, and each chord turns its star to the middle
//   The strongest arrivals left                  a Fall: the flight hangs, then drops, crossing at speed on the beat
//   A change of section                          a Shock: the next pattern comes in from the rim as a ring, lines unbroken, the centre turning on the hit. Out from the centre where the song falls away
//   A dull body (stripes, checks)                a Lock: only sliding, it steps through a checker nobody drew and closes with no seam
//   A sheet of dots                              a Snap: every dot touches at once, on the breath
//   Riley's patterns                             heroes in their own right, chosen by how loud the section is
//   The climax                                   the Iris, once: the sheet rolls up from the rim and turns inside out into a flower on the song's biggest beat, and the next pattern closes over it
//   A section played again                       what it wore the first time, the other way round. A viewer feels the song repeat
//
// One hero at a time, with everything else stepped back to .3 while it plays (score.ambient, read in song-sheet.js, eased so it never pops). Never the same kind twice running. A film gets
// at least four kinds and one within 90 s. A different take is cast differently: other bodies, other turns, other sections. Pure: the same song and seed make the same film.
import { rng, clamp, lerp, smoother } from './curves.js';
import { flag } from './flags.js';
import { land } from './land.js';
import { base, boldRange, fillSlot, fineness } from './slot.js';
import { OFF, SLOT_FLOATS } from '../pattern/layout.js';
import { MOVES } from './moves/index.js';
import { countdown, lockMove, slipFor, whitneyMove } from './moves/slip.js';
import { spliceCoin } from './moves/coin.js';
import { placeStar, STAR_BODIES } from './moves/star.js';
import { shockFit, wearShock, wearFall } from './xform/index.js';
import { wearIris, canIris } from './xform/iris.js';
import { reactAt } from './react.js';

const DIALS = ['dials.board', 'dials.target', 'dials.board', 'dials.rooms', 'dials.target', 'dials.diamonds', 'dials.sunburst'];    // the plain dartboards come round most
const COINS = ['coins.star', 'coins.ziggurat', 'coins.spiral', 'coins.disc', 'coins.dart', 'coins.cone'];
const RILEY = {     // what suits how big the section is
  calm: ['riley.blaze', 'riley.zinnia', 'riley.pleats', 'riley.whorl'],
  mid: ['riley.metamorphosis', 'riley.labyrinth', 'riley.shift', 'riley.alhambra', 'riley.swarm'],
  loud: ['riley.octagrid', 'riley.mosaic', 'riley.rose', 'riley.snap', 'riley.snap3'],
};
const RING_CRACK = 0.25;    // beats from one ring breaking to the next
const RING_SURGE = 0.95;    // the share of a bar each surge takes: nearly all of it, so the rings lean into each downbeat and never stop dead between them
const RING_TUNE = 0.35;     // how much of the tune's push on the loose rings stays: they hang, and shouldn't look as if they're drifting
const RING_TUNE_OFF = 2;    // beats either end of the run that the tune leaves the rings alone
const BOARD_ARRIVES = [1.35, 0.32], BOARD_SETTLES = 2;     // the board comes in this much bigger and this far turned (radians), and settles over this many bars, so that it's arriving at the same time as it breaks
const QUIET = 0.3;          // what everything else is turned down to while a hero plays
const QUIET_BODY = 0.6;     // ...and while a pattern is the hero, which goes on for a whole gesture and still has to be listening
const QUIET_SNAP = 0.5;
const COUNTDOWN_BY = 90;    // seconds: the first hero
const SHORTEST_RUN = 9;     // seconds: a Countdown shorter than this can't be counted
const PAST = 12;            // seconds the dial carries on past the lock, at least
const COIN_BARS = 8, COIN_RISE = 0.1, COIN_SECONDS = [14, 30], COIN_GROWS = Math.log(1.5);
const FALLS = 3, FALL_MIN = 0.05, FALL_FINE = 9;       // top landings by arrival, into a pattern no finer than this, cycles per picture unit
const ROOM = 6;             // seconds a gesture keeps to itself besides its transformation
const STAR_LEN = [28, 60], STAR_SIZE = [2.6, 4];  // seconds; cycles per picture unit, as a sheet and in flowers: a little finer than its default, or a chamber can fall inside one line and be a flat shape
const LOCK_BARS = 8, LOCK_FINE = 12, LOCK_COARSE = 0.7, LOCKS = 2, LOCK_MORPH = 6.5;       // ...and its lines stay between these sizes, or the cuts have nothing to read by
const SNAPS = 2, RILEYS = 2;
const SHOCK_APART = 40;     // seconds between shocks that aren't asked for by the song's form
const LONG_HERO = 8;        // seconds
const WHITNEYS = 2, WHITNEY_SECONDS = 8;
const REPLAYS = 2;          // how many times a section's hero can come round again
const IRIS_D = 12, IRIS_HIT = 0.61, IRIS_NEAR = 30, IRIS_FINE = 9, IRIS_NEXT = 7, IRIS_AFTER = 16;     // seconds it takes; how far along it turns inside out; how far from the climax its landing can be; how fine a sheet it can roll up, cycles per picture unit: it comes in as it goes; seconds the gesture after it wants if it's cut out of a long one
const IRIS_BODIES = ['lattice.master', 'riley.octagrid', 'lines.river', 'pole.dipole', 'checks.twist', 'riley.rose', 'dots.inflate', 'riley.mosaic', 'waves.current', 'lattice.teeth'];     // what makes a good flower, for when what's there can't
const COUNT_OPENING = 13.1;
const LOOK_RUN = 50;        // seconds of one look, at most, unless it's all heroes
const OPENING = 14;         // seconds: a song arriving takes 7 s to fly in and wants 6 more to itself, and whatever's next in that time gets swallowed. So nothing that matters starts before this.

const slot = new Float32Array(SLOT_FLOATS);
const hashOf = s => { let h = 0; for (const c of String(s)) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0; return h; };
const flatBody = s => s[OFF['surf.kind']] < 0.5 && s[OFF['matte.kind']] < 0.5 && s[OFF['ribbon.on']] < 0.5 && s[OFF['blobs.on']] < 0.5;
const noMatte = s => s[OFF['matte.kind']] < 0.5 && s[OFF['ribbon.on']] < 0.5 && s[OFF['blobs.on']] < 0.5;

// The Countdown's rings tick. Each goes round one whole cycle per bar, in a surge centred on the downbeat, and between surges it hangs a quarter of a cycle off. Odd rings go the other way, so a
// quarter each way adds up to a half: on a dartboard all the loose rings line up into plain rays, and only what's locked is a board. So between the downbeats you can see just how far it's got, and
// on each one the rays whirl, the next ring falls into its place on the beat, and the board has grown by a ring. Whole cycles from start to finish, as in moves/slip.js, so it leaves the picture as it finds it.
function ringRuns(T, step, ease, seed, P, mirror) {
  return Array.from({ length: 8 }, (_, i) => {
    const D = T - i * (step + RING_CRACK);
    if (D <= 0) return null;
    const w = 1 / P, e = P / 2, e0 = Math.min(0.75, 0.25 * D), Q = D - 0.5 * (e + e0), kick = Math.min(2, D);
    return { D, Ds: D, B: 0, A: 0, e, e0, Q, K: Math.ceil(w * Q) - w * Q, kick, sign: (i % 2 ? -1 : 1) * (mirror && i ? -1 : 1), w };
  });
}
// The clock they run on, as beats to go: it stands still between the surges. x(y) is y on every downbeat, half a bar away the rest of the time.
const tickClock = (tau, L, P, W) => {
  const b0 = tau(L);
  return t => {
    const y = b0 - tau(t), k = Math.round(y / P), d = y - k * P;
    return -(k * P + (Math.abs(d) >= W / 2 ? Math.sign(d) * P / 2 : P * (smoother(d / W + 0.5) - 0.5)));
  };
};
// How far out a ring's outside edge is, in pattern units
const ringEdge = (sl, i) => (sl.kind === 3 ? Math.exp((i + 1) / sl.n - 2) : (i + 1) / sl.n);

export function direct(score, A, M) {
  if (!flag('direct') || !M || M.neutral || !score.tau || score.gestures.length < 4) return score;
  const g = score.gestures, meter = score.song?.meter ?? M.meter ?? 4, bar = M.bar, beat = M.beat, tau = score.tau;
  const rand = rng(((score.seed | 0) * 6151 + hashOf(A.hash ?? A.duration)) >>> 0);
  const lib = id => (score.library ?? score.patterns).find(p => p.id === id);
  const pick = list => list[Math.floor(rand() * list.length) % list.length];
  const phiOf = (t, G) => score.phi(t, G);
  const aspect = score.aspect ?? 16 / 9, seed = score.seed;
  const fps = A.fps, Eat = t => A.E[clamp(Math.round(t * fps), 0, A.E.length - 1)];
  const meanE = (a, b) => { let s = 0, n = 0; for (let t = a; t < b; t += 0.1) { s += Eat(t); n++; } return n ? s / n : 0; };
  const lags = score.time?.windows ?? [];
  const lagged = (a, b) => lags.some(w => a < w.paid && b > w.from);
  const landings = score.landings;
  // What the arrival would do to it anyway (stage._clearRunway), done now, so that the film's the same whichever way it starts.
  while (g.length > 3 && g[0].t1 < (score.pace ? 12 : OPENING)) { const n = g[1]; g[0].t1 = n.t1; g[0].morph = n.morph; g.splice(1, 1); }
  if (g[0].morph && g[0].t1 - g[0].morph < 7.5) g[0].morph = Math.max(g[0].t1 - 7.5, 5);
  // Pace (src/score/pace.js): the same moves, for what they do and not for how long they take over the film
  const P = score.pace, PAST_T = P ? Math.max(4 * bar, 6) : PAST, STAR_T = P ? [14, 26] : STAR_LEN, COIN_T = P ? [10, 18] : COIN_SECONDS, ROOM_T = P ? Math.max(1.5 * bar, 2.5) : ROOM, STAR_BODY = P ? 12 : 16, SHOCK_D = P ? clamp(3 * bar, 4, 7) : 10, SHOCK_ROOM = P ? 1 : 4;
  const lastG = () => g.length - 1;      // the film's tail: what carries on after the song, and nothing transforms into it

  // Who's on, and when. [a, b]: all the time it holds, so no one else can be put there. [wa, wb]: when everything else steps back for it. at: where it falls, for "never twice running".
  const cast = [];
  const free = (a, b) => !cast.some(h => a < h.b && b > h.a);
  const quiet = (a, b) => !cast.some(h => a < h.wb && b > h.wa);     // nobody's on: their own transformations out of a gesture are free for others to use
  // How much of the film the big moves can have between them, with pace: they're for what they do, and the rest of the film has to get a turn.
  const budget = (P ? 0.26 : Infinity) * (g.at(-2)?.t1 ?? A.duration), spent = () => cast.reduce((n, h) => n + (h.kind === 'lock' || h.kind === 'riley' || h.kind === 'shock' || h.kind === 'fall' ? 0 : h.b - h.a), 0);
  const put = (kind, G, at, a, b, wa, wb, more = {}) => { const h = { kind, G, at, a, b, wa, wb, gain: P ? 0.55 : QUIET, ...more }; cast.push(h); cast.sort((x, y) => x.at - y.at); return h; };
  const twiceRunning = (kind, at) => {
    let before = null, after = null;
    for (const h of cast) { if (h.at <= at) before = h; else { after = h; break; } }
    return before?.kind === kind || after?.kind === kind;
  };
  // A gesture a slide or a bend can't reach, for a hero that has to be arrived at by a flight or a shock: a field's number nothing reads while there's no field, which they refuse to cross.
  const noSlide = G => { G.over = { ...G.over, 'field.a': 1e-3 }; };
  const isPlain = G => !G.moves?.length && !G.hero && !G.xform && !G.carry;
  // Running from one gesture to the next, is this kind about to come twice with nothing between? What a gesture wears reads hero, transformation, moves.
  const lastOf = x => (x.moves?.length ? x.moves.at(-1).id : x.xform?.id ?? x.hero), firstOf = x => x.hero ?? x.xform?.id ?? x.moves?.[0]?.id;
  const clash = (i, kind) => {
    let a = i - 1, b = i + 1;
    while (a >= 0 && !lastOf(g[a])) a--;
    while (b < g.length && !firstOf(g[b])) b++;
    return (!g[i].hero && a >= 0 && lastOf(g[a]) === kind) || (!g[i].moves?.length && b < g.length && firstOf(g[b]) === kind);
  };

  // ------------------------------------------------------------- where the song says the same thing again
  const sectionAt = B => A.segments.find(s => Math.abs(s.t0 - B) <= 1.5 * bar);
  const replaysOf = (L, min = 0) => {
    const s = sectionAt(L);
    return s ? landings.filter(l => l.B > L + 8 * bar && !l.rest && l.s >= min && sectionAt(l.B)?.label === s.label && !lagged(l.B - 2 * bar, l.B + bar)) : [];
  };

  // ------------------------------------------------------------- Countdown
  const beatTime = (b, near) => { let lo = near - 120, hi = near + 120; for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (tau(m) < b) lo = m; else hi = m; } return (lo + hi) / 2; };
  const makeCountdown = (L, pat, mirror) => {
    let b = g.findIndex(x => x.t1 >= L + PAST_T - (P ? 0.5 : 0));
    if (b < 0 || b >= lastG()) return null;
    // A long passage isn't swallowed whole by a dial: the board lets go a few bars on, and what's left of the passage goes on from there.
    const cut = P && g[b].t1 > L + PAST_T + 3 * bar && g[b].t0 < L + PAST_T ? (A.bars.find(t => t >= L + PAST_T) ?? null) : null;
    const H = countdown(pat, { L, score, meter, t1: cut ?? g[b].t1, morph: cut ? P.leadOf({ level: 2 }, pat, g[b].pattern, cut - L) : g[b].morph ?? 0, seed, longest: 24 }), m = H.moves[0], sl = pat.slip;
    // As many rings as there's room for. The board stays where it is while it comes apart and falls back together, every ring in the frame, and lets go when it's done.
    const spb = 1 / Math.max(tau(L + 0.5) - tau(L - 0.5), 1e-3), longest = Math.min(P ? 18 : 24, L - COUNT_OPENING);
    const W = meter * RING_SURGE, run = (n, st) => (n - 1) * st + meter + W / 2;       // the first surge starts here, in beats to go
    let step = meter, bands = Math.min(sl.bands, 8);
    if (!P && run(bands, step) * spb < 12) step = 2 * meter;
    while (bands > 4 && run(bands, step) * spb > longest) bands--;
    if (run(bands, step) * spb > longest) step = meter;
    while (bands > 4 && run(bands, step) * spb > longest) bands--;
    // It breaks just as a surge sets off, from rest, so nothing about the break is sudden.
    const T = (bands - 1) * step + 1.5 * meter - 0.02, t0 = beatTime(tau(L) - run(bands, step) - 0.05, L);
    m.T = T; m.step = step; H.t0 = t0;
    m.runs = ringRuns(T, step, sl.ease ?? 2, seed, meter, mirror);
    m.tau = tickClock(tau, L, meter, W);
    const edge = sl.scale ? null : ringEdge(sl, bands - 1), s0 = sl.scale ? sl.scale[1] : clamp(1.72 / edge, sl.widest ?? 0.65, sl.closest ?? 2.8), end = H.arcEnd;
    const way = mirror ? -1 : 1, turn = way * (sl.turn ?? 0.9), settled = Math.min(beatTime(tau(t0) + BOARD_SETTLES * meter, t0), L - 1);
    m.travel = {
      rot: [{ t: t0, x: way * BOARD_ARRIVES[1], v: 0 }, { t: settled, x: 0, v: 0 }, { t: L, x: 0, v: 0 }, { t: end, x: turn, v: 0 }],
      // On log rings that much bigger is half a ring out, which with the turn's half a spoke would make the same picture again and it wouldn't be seen to arrive
      scale: [{ t: t0, x: Math.log(s0 * (sl.kind === 3 ? 1.2 : BOARD_ARRIVES[0])), v: 0 }, { t: settled, x: Math.log(s0), v: 0 }, { t: L, x: Math.log(s0), v: 0 }, { t: end, x: Math.log(s0 * 1.5), v: 0 }],
    };
    // The tune still moves the loose rings, a little, but it lets go as the run starts and as it ends, so the last ring comes to rest by itself.
    const R = score.react;
    if (R?.voiced) {
      const voiced = R.voiced.slice(), cA = (R.C ? R.C(t0) : t0) * R.hz, cB = (R.C ? R.C(L) : L) * R.hz, off = RING_TUNE_OFF * spb * R.hz;
      for (let i = Math.max(0, Math.floor(cA)); i < voiced.length && i <= cB + 1; i++) voiced[i] *= RING_TUNE * smoother((i - cA) / off) * smoother((cB - i) / off);
      m.react = Object.assign(Object.create(R), { voiced });
    }
    m.mirror = false;
    let a = g.findIndex(x => x.t1 > H.t0);
    while (a > 0 && H.t0 - g[a].t0 < (P ? Math.max(2 * bar, (g[a].morph ?? 0) * 1.2) : Math.max(10, (g[a].morph ?? 0) * 1.5))) a--;
    return a < 0 || a >= b || H.t0 - g[a].t0 < (P ? 3 : 6) || (a === 0 && H.t0 < COUNT_OPENING) ? null : { H, a, b, cut };
  };
  const putCountdown = (L, pat, mirror = false) => {
    if (!pat || !flag('countdown') || !flag('slip') || lagged(L - 24, L + bar)) return null;
    const c = makeCountdown(L, pat, mirror);
    if (!c || L - c.H.t0 < SHORTEST_RUN || !free(c.H.t0 - 10, c.H.t1)) return null;
    const { H, a, b, cut } = c, Pr = g[a];
    // What's before it now ends where the board arrives, with its morph kept, and whatever else lay in the way is gone. The Countdown morphs out as what it replaced would have.
    Pr.t1 = H.t0; Pr.plan = Pr.planFor = Pr.planning = null;
    Pr.morph = Math.min(Pr.morph ?? 8, (H.t0 - Pr.t0) * 0.7);
    H.label = g[b].label; H.visit = g[b].visit; H.kindIn = 'rise'; H.kindOut = cut ? 'level' : g[b].kindOut;
    if (cut) { g[b].t0 = cut; delete g[b].plan; }
    g.splice(a + 1, cut ? b - a - 1 : b - a, H);
    H.hero = 'countdown'; H.melMode = 0; H.gears = [];
    noSlide(H);
    return put('countdown', H, L, H.t0, H.t1, H.t0, L + bar, { mirror });
  };

  // ------------------------------------------------------------- Coin
  // How much the sound grows into L, and over how long, if it does: never dipping far on the way, at least 8 bars of it.
  const buildInto = L => {
    let best = null;
    const longest = Math.min(COIN_T[1], L - 12);
    for (let len = Math.max(P ? 6 * bar : COIN_BARS * bar, COIN_T[0]); len <= longest; len += 2 * bar) {
      const rise = meanE(L, L + 2 * bar) - meanE(L - len - 2 * bar, L - len);
      if (rise > COIN_RISE && (!best || rise > best.rise)) best = { rise, len };
    }
    return best;
  };
  const coinPlaces = landings.filter(l => !l.rest && l.B < g[lastG()].t0 - 20 && !lagged(l.B - 32, l.B + 3 * bar)).map(l => ({ l, build: buildInto(l.B) })).filter(c => c.build);
  const putCoin = (c, pat) => {
    if (!pat || !flag('coin')) return null;
    const { l, build } = c;
    // Better to start where the film already has a landing, if there's one that near: then that arrival still lands.
    const near = landings.filter(x => x.B < l.B - COIN_T[0] && l.B - x.B <= COIN_T[1] && Math.abs(l.B - x.B - build.len) <= 5).sort((x, y) => y.a - x.a)[0];
    const beats = Math.round((near ? l.B - near.B : build.len) / (beat * meter)) * meter, start = l.B - beats * beat;
    const j = g.findIndex(x => x.t1 >= l.B && x.t1 - (x.morph || 0) >= l.B + 2 * bar);
    if (j < 0 || j >= lastG() || start < OPENING || !free(start - 15, g[j].t1)) return null;
    if (P && (spent() + g[j].t1 - start > budget || g[j].t1 - l.B > 10 * bar)) return null;
    const dir = rand() < 0.5 ? 1 : -1;
    // It lands broad, so past the landing it draws back as it pours: going the other way, a few big shapes are all that's left of it by the end of a long tail.
    const tail = Math.max(g[j].t1 - (g[j].morph || 0) - l.B, 1), after = -Math.min(0.045, COIN_GROWS / tail);
    const H = spliceCoin(score, l.B, pat, { beats, dir, w0: rand() * Math.PI * 2, after, ...(P ? { least: 3 * bar } : null) });
    return H ? put('coin', H, l.B, H.t0, H.t1, H.t0 + 2 * bar, l.B + bar) : null;
  };

  // ------------------------------------------------------------- the two arrivals that open the film
  const arrivals = landings.filter(l => l.B < COUNTDOWN_BY && !l.rest);
  const asked = [...arrivals.filter(l => l.s >= 0.35), ...arrivals.filter(l => l.s < 0.35).sort((x, y) => y.s - x.s)];
  const dial = lib(pick(DIALS)) ?? lib('dials.board'), coinBody = () => lib(pick(COINS));
  const openCoin = rand() < 0.4 ? coinPlaces.find(c => c.l.B < COUNTDOWN_BY && c.l.a >= 0.2) : null;
  if (openCoin) putCoin(openCoin, coinBody());
  // Later arrivals too: if a coin opens the film the Countdown can come after it, and it must come somewhere.
  const asked2 = [...asked, ...landings.filter(l => l.B >= COUNTDOWN_BY && l.s >= 0.35 && !l.rest)];
  let cd = null;
  for (const l of asked2) if ((cd = putCountdown(l.B, dial))) break;
  const lateCoin = () => {
  if (!cast.some(h => h.kind === 'coin')) {
    const ranked = coinPlaces.map(c => ({ c, score: c.build.rise + 0.5 * c.l.a + 0.15 * rand() })).sort((x, y) => y.score - x.score);
    // Somewhere a Countdown won't want to come back to, if it can
    const back = cd ? replaysOf(cd.at, 0.35).slice(0, REPLAYS - 1).map(l => l.B) : [];
    ranked.sort((x, y) => (back.some(b => Math.abs(b - x.c.l.B) < 30) ? 1 : 0) - (back.some(b => Math.abs(b - y.c.l.B) < 30) ? 1 : 0));
    for (const { c } of ranked) if (putCoin(c, coinBody())) break;
  }
  };
  // ------------------------------------------------------------- Star: the longest stretch of real chord changes that's still open
  const comeback = cd ? replaysOf(cd.at, 0.35).slice(0, REPLAYS - 1).map(l => l.B) : [];
  const putTheStar = () => {
  if (flag('star') && M.runs?.length) {
    const ruling = M.runs.filter(r => r.t1 - r.t0 >= 1.2), places = [];
    for (let a = 0; a < lastG() - 1; a++) for (let b = a + 1; b < lastG(); b++) {
      const t0 = g[a].t1, t1 = g[b].t1, len = t1 - t0;
      if (len < STAR_T[0] || len > STAR_T[1] || !free(t0, t1) || lagged(t0, flag('iris') ? t1 - 1 : t1)) continue;     // with an Iris there's less room, and a transformation can land on a stop
      if ((!P && g[a].t1 - g[a].t0 < 6) || t0 < OPENING || t1 - (g[b].morph || 0) - t0 < STAR_BODY) continue;
      const here = ruling.filter(r => r.t0 >= t0 && r.t0 < t1), kinds = new Set(here.map(r => r.c)).size;
      if (kinds < 2 || here.length < 4) continue;
      if (P) { let on = 0, n = 0; for (let x = t0; x < t1; x += bar) { n++; if (P.classAt(x) === 'loud') on++; } if (on > 0.2 * n) continue; }      // a chorus is a run of quick changes
      // It leaves room for the Countdown to come back
      const inTheWay = comeback.some(b => t0 < b + PAST_T && t1 > b - 24);
      places.push({ t0, t1, s: Math.min(kinds, 6) / 6 + Math.min(here.length / len * 4, 1) + Math.min(len, 55) / 55 + 0.6 * rand() - (inTheWay ? 1.5 : 0) });
    }
    places.sort((x, y) => y.s - x.s);
    const bodies = STAR_BODIES.map(lib).filter(p => p && p.pool !== false);
    for (const p of places.slice(0, 4)) {
      if (P && spent() + p.t1 - p.t0 > budget) continue;
      const body = pick(bodies.length ? bodies : STAR_BODIES.map(lib).filter(Boolean));
      if (!body || !MOVES.star.needs(base(body))) continue;
      const H = placeStar(score, body, { start: p.t0, end: p.t1, M, seed: seed + 3, mirror: rand() < 0.5, size: STAR_SIZE });
      if (H) { put('star', H, H.t0, H.t0, H.t1, H.t0 + 2 * bar, H.t1 - (H.morph || 0)); break; }
    }
  }
  };

  // ------------------------------------------------------------- Iris: the climax, once
  const putIris = () => {
    if (!flag('iris') || A.climax <= OPENING + IRIS_D) return;
    const D0 = clamp(Math.round(IRIS_D / bar) * bar, 10, 14);
    const bold = (G, tm) => { fillSlot(slot, G, tm, G.pattern, { phi: phiOf(tm, G) }); return G.pattern.id !== 'checks.target' && canIris(slot) && fineness(slot) <= IRIS_FINE; };      // a target's fine spokes go round the tube as hairlines
    const fits = (G, L) => { const D = clamp((L - G.t0 - ROOM_T) / IRIS_HIT, 10, D0); return L - G.t0 >= IRIS_HIT * D + ROOM_T ? D : 0; };      // it's shorter if it has to be
    // Gesture i becomes the next one, turning inside out at L. On a sheet it can roll up, and if what's there isn't one, one that is, for the time it has.
    const irisOn = (i, L, D) => {
      let G = g[i];
      const N = g[i + 1], tm = L - IRIS_HIT * D;
      if (!isPlain(G) || (P ? N.moves?.some(x => x.id !== 'relay') : N.moves?.length) || (N.hero && !P) || !free(tm - bar, L + (1 - IRIS_HIT) * D + bar) || lagged(tm, L + D)) return false;
      if (!bold(G, tm)) {
        if (!score.remake || G.k == null) return false;
        const swap = IRIS_BODIES.map(lib).filter(p => p && p !== N.pattern && p !== g[i - 1].pattern).map(p => [rand(), p]).sort((a, b) => a[0] - b[0]).map(x => score.remake(G, x[1])).find(x => bold(x, tm));
        if (!swap) return false;
        G = swap;
      }
      const s = reactAt(score.react, score.react.C ? score.react.C(L) : L);
      const focus = [clamp((s.px ?? 0) * 0.45, -0.35, 0.35), clamp((s.py ?? 0) * 0.45, -0.25, 0.25)];
      // What it opens on is the film's biggest moment, so that had better be bold too. It's only swapped if it's doing nothing of its own, and only if something bolder is there to be had.
      let next = N;
      if (score.remake && N.k != null && N.replayOf == null && isPlain(N) && !N.fixedRange && N.t1 - N.t0 >= 10) {
        // Flat too: a globe sitting where the flower shrank away would look like the flower got stuck.
        const seen = x => { fillSlot(slot, x, x.t0 + 2, x.pattern, { phi: phiOf(x.t0 + 2, x) }); return canIris(slot) ? fineness(slot) : Infinity; };
        if (seen(N) > IRIS_NEXT) {
          const others = (score.patterns ?? []).filter(p => p !== G.pattern && p !== N.pattern && p !== g[i + 2]?.pattern && p.fine !== true).map(p => [rand(), p]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
          next = others.map(p => score.remake(N, p)).find(x => seen(x) <= IRIS_NEXT) ?? N;
        }
      }
      if (!wearIris(G, next, L, { D, aspect, focus, beats: score.react?.pulses ?? null, room: ROOM_T, way: rand() < 0.5 ? 1 : -1 })) return false;
      g[i] = G; g[i + 1] = next;
      put('iris', G, L, G.t1 - D, G.t1, G.t1 - D, G.t1 + bar);
      return true;
    };
    const places = landings.filter(l => !l.rest && Math.abs(l.B - A.climax) <= IRIS_NEAR).sort((x, y) => (Math.abs(x.B - (P?.climaxAt ?? A.climax)) - (P ? 0 : 16 * x.a)) - (Math.abs(y.B - (P?.climaxAt ?? A.climax)) - (P ? 0 : 16 * y.a)));
    for (const l of places) {
      let i = g.findIndex(x => Math.abs(x.t1 - l.B) < 0.05);
      if (i < 1 || i + 1 >= lastG()) continue;
      // Not long enough for it: it takes in the one before, as long as that isn't what the film opens on
      if (!fits(g[i], l.B) && i >= 2 && score.remake && g[i].k != null && isPlain(g[i]) && isPlain(g[i - 1]) && free(g[i - 1].t0, g[i].t1)) { g.splice(i - 1, 2, score.remake({ k: g[i].k, t0: g[i - 1].t0, t1: g[i].t1 }, g[i].pattern)); i--; }
      const D = fits(g[i], l.B);
      if (D && irisOn(i, l.B, D)) return;
    }
    // The climax can fall in the middle of a long gesture, with no landing near it. Then the film gets one: the breath near it that the song arrives on most, with the gesture cut in two there.
    if (!score.remake) return;
    const near = (M.breath.t ?? []).filter(t => Math.abs(t - A.climax) <= IRIS_NEAR).map(t => [Math.abs(t - A.climax) / IRIS_NEAR - (M.arrivalAt?.(t) ?? 0), t]).sort((x, y) => x[0] - y[0]);
    for (const [, L] of near) {
      const i = g.findIndex(x => x.t0 < L && x.t1 > L);
      if (i < 1 || i >= lastG() || !isPlain(g[i]) || g[i].t1 - L < IRIS_AFTER || g[i].k == null) continue;
      const G = g[i], D = fits(G, L);
      if (!D) continue;
      const others = (score.patterns ?? []).filter(p => p !== G.pattern && p !== g[i - 1].pattern && p !== g[i + 1].pattern && p.family !== G.pattern.family && p.fine !== true);
      if (!others.length) return;
      g.splice(i, 1, score.remake({ k: G.k, t0: G.t0, t1: L }, G.pattern), score.remake({ k: G.k, t0: L, t1: G.t1 }, others[Math.floor(rand() * others.length) % others.length]));
      if (irisOn(i, L, D)) return;
      g.splice(i, 2, G);
    }
  };
  // The climax gets its Iris before the Star and the Coin choose, and the Coin takes what's left: a film can most easily do without a Coin. With the flag off, as it's always been.
  if (flag('iris')) { putIris(); putTheStar(); lateCoin(); }
  else { lateCoin(); putTheStar(); }

  // A section that comes back wears it again, the other way round: another dial, turning and locking the other way.
  if (cd) {
    const others = DIALS.map(lib).filter(p => p && p !== dial);
    for (const L of comeback) if (!P || (P.classAt(L) !== 'loud' && spent() + 20 < budget)) putCountdown(L, (flag('lookRuns') && others.length ? others[Math.floor(rand() * others.length) % others.length] : null) ?? dial, true);
  }

  // ------------------------------------------------------------- not too long in one look
  // A dial, a check and a coin of rings and spokes are all a checker to the eye, and left alone a film can run two minutes of it. So the plainest gesture in the middle of a long run becomes something else.
  if (flag('lookRuns') && score.remake) {
    const checker = p => (p.g.round ?? 0) <= 0.5 && (p.g.fams || []).filter(f => Math.abs(f.d ?? 0) <= 1.01).length === 2;
    for (let round = 0; round < 8; round++) {
      let a = -1, b = -1, longest = 0;
      for (let i = 0; i < lastG();) {
        let j = i, len = 0;
        while (j < lastG() && checker(g[j].pattern)) { len += g[j].t1 - g[j].t0; j++; }
        if (len > longest) { longest = len; a = i; b = j; }
        i = Math.max(j, i + 1);
      }
      if (longest <= LOOK_RUN) break;
      const mid = (g[a].t0 + g[b - 1].t1) / 2, away = G => Math.abs((G.t0 + G.t1) / 2 - mid) + (G.replayOf != null ? 1e3 : 0);
      const spots = g.slice(Math.max(a, 1), b).filter(G => isPlain(G) && G.k != null && !g[g.indexOf(G) - 1]?.xform).sort((x, y) => away(x) - away(y));
      let swapped = false;
      for (const G of spots) {
        const i = g.indexOf(G), others = (score.patterns ?? []).filter(p => !checker(p) && p.fine !== true && p.family !== g[i - 1].pattern.family && p.family !== g[i + 1]?.pattern.family && !g.some(x => x.pattern === p)).map(p => [rand(), p]).sort((x, y) => x[0] - y[0]);
        if (!others.length) continue;
        g[i] = score.remake(G, others[0][1]);
        swapped = true;
        break;
      }
      if (!swapped) break;
    }
  }

  // ------------------------------------------------------------- Locks
  if (flag('lock') && flag('slip')) {
    const realFams = p => (p.g.fams || []).filter(f => Math.abs(f.d ?? 0) <= 1.01).length;
    const span = LOCK_BARS * meter * beat;
    const lockOf = (G, mirror) => {
      if (G.moves?.length || G.hero || G.xform?.id === 'shock') return null;
      // Its transformation can start a little later to give it room, unless it's already been timed
      const room = G.t1 - (G.xform ? G.morph : Math.min(G.morph || 0, LOCK_MORPH)) - G.t0;
      if (room < span + 2 || realFams(G.pattern) > 2 || !quiet(G.t1 - (G.morph || 0) - span, G.t1 - LOCK_MORPH) || twiceRunning('lock', G.t1 - (G.morph || 0) - span / 2)) return null;
      const u = x => ({ ...G, freezeU: x });
      let smallest = Infinity, coarse = Infinity, fine = 0;
      const [lo, hi] = boldRange(G);       // what the rehearsal can narrow further, but no wider
      for (let i = 0; i <= 12; i++) { fillSlot(slot, u(lo + (hi - lo) * i / 12), G.t0, G.pattern, { phi: 0 }); smallest = Math.min(smallest, slot[OFF.scale]); const k = fineness(slot); coarse = Math.min(coarse, k); fine = Math.max(fine, k); }
      fillSlot(slot, u((lo + hi) / 2), G.t0, G.pattern, { phi: 0 });
      if (!flatBody(slot) || fine > LOCK_FINE || coarse < LOCK_COARSE) return null;
      const tm0 = G.t1 - (G.morph || 0), keep = tm0 - G.t0 >= span + 2, tm = keep ? tm0 : G.t0 + span + 2;
      const fits = t => t >= G.t0 + 1.5 && tau(t) + LOCK_BARS * meter <= tau(tm) - 0.25;
      const t = M.breath.t.filter(fits).at(-1) ?? [...A.bars].filter(fits).at(-1);
      if (t == null) return null;
      const m = lockMove(slot, { t, tau, meter, smallest });
      if (!m) return null;
      if (mirror && m.kind === 1) m.ang = (m.ang ?? 0) + Math.PI;
      if (!keep) { G.morph = G.t1 - tm; delete G.plan; delete G.planFor; delete G.planning; }
      G.moves = [...(G.moves ?? []), m];
      G.hero = 'lock';
      return put('lock', G, t + span * 0.5, t, t + span, t, t + span, { mirror });
    };
    let n = 0;
    const order = g.slice(0, lastG()).map(G => [rand(), G]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    for (const G of order) {
      if (n >= LOCKS) break;
      if (!lockOf(G, false)) continue;
      n++;
      const again = g.slice(0, lastG()).find(x => x !== G && x.pattern === G.pattern && x.replayOf != null);
      if (again) lockOf(again, true);
    }
    // A film with nothing dull in it gets something dull, on the longest gesture that's doing nothing else, because that's what it takes to show a checker nobody drew.
    if (!n && score.remake && !P) {
      const spots = g.slice(1, lastG()).filter(G => isPlain(G) && G.replayOf == null && G.k != null && G.t1 - G.t0 - LOCK_MORPH >= span + 2 && quiet(G.t0, G.t1)).sort((a, b) => (b.t1 - b.t0) - (a.t1 - a.t0));
      const bodies = (score.patterns ?? []).filter(p => realFams(p) <= 2 && p.family !== 'dots' && flatBody(base(p)) && slipFor(base(p))).map(p => [rand(), p]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
      search: for (const G of spots.slice(0, 2)) for (const p of bodies.slice(0, 16)) {
        const N = score.remake(G, p);
        const i = g.indexOf(G);
        g[i] = N;
        if (lockOf(N, false)) break search;
        g[i] = G;
      }
    }
  }

  // ------------------------------------------------------------- Riley's patterns, as heroes: what's already there, and if there's none, one comes in where it suits the section
  const energyLo = meanE(0, 1), byLoud = (() => { const s = []; for (let t = 0; t < g[lastG()].t0; t += 2) s.push(Eat(t)); s.sort((a, b) => a - b); return [s[Math.floor(s.length * 0.33)] ?? energyLo, s[Math.floor(s.length * 0.66)] ?? energyLo]; })();
  const moodOf = G => { const e = meanE(G.t0, G.t1); return e < byLoud[0] ? 'calm' : e < byLoud[1] ? 'mid' : 'loud'; };
  const rileyKind = p => p.id.split('.')[1];
  const putRiley = G => {
    if (!flag('heroRiley') || G.pattern.family !== 'riley' || !isPlain(G) || twiceRunning('riley', G.t0)) return null;
    const tm = G.t1 - (G.morph || 0);
    if (tm - G.t0 < 8 || !quiet(G.t0 + 2, tm)) return null;
    G.hero = rileyKind(G.pattern);
    return put('riley', G, G.t0 + 0.01, G.t0 + 3, tm, G.t0 + 3, tm, { gain: P ? 1 : QUIET_BODY });
  };
  if (flag('heroRiley')) {
    let n = 0;
    for (const G of g.slice(0, lastG())) if (n < RILEYS && putRiley(G)) n++;
    // None? One of the plain gestures becomes one. Not at the very start: the film opens in its own family.
    if (!n && score.remake && !P) {
      const spots = g.slice(1, lastG()).filter(G => isPlain(G) && G.replayOf == null && G.k != null && G.t1 - G.t0 >= 16 && free(G.t0, G.t1));
      const G = spots[Math.floor(rand() * spots.length)];
      if (G) {
        const ids = RILEY[moodOf(G)], options = ids.map(lib).filter(p => p && p.pool !== false);
        const p = options.length ? pick(options) : null;
        if (p) {
          const N = score.remake(G, p);
          g[g.indexOf(G)] = N;
          putRiley(N);
        }
      }
    }
  }

  // ------------------------------------------------------------- Falls
  if (flag('fall')) {
    const spun = rand() < 0.5 ? 1 : -1, amount = 0.2 + 0.2 * rand();
    const fallOn = (l, mirror) => {
      const i = g.findIndex(x => Math.abs(x.t1 - l.B) < 0.05);
      if (i < 0 || i + 1 >= lastG()) return null;
      const G = g[i], N = g[i + 1], D = P ? clamp(3 * bar, 4.5, 8) : clamp(4 * bar, 6, 10);
      if (P && i === 0 && G.t1 < 14) return null;
      if (G.xform || G.t1 - G.t0 < D + ROOM_T || !quiet(G.t1 - D, G.t1 + bar) || twiceRunning('fall', G.t1) || clash(i, 'fall')) return null;
      if (N.hero === 'countdown' || N.moves?.some(m => m.id === 'slip') || lagged(G.t1 - D, G.t1 + bar)) return null;
      // It falls into something bold, or all that's seen on the way down is a fine weave
      fillSlot(slot, N, N.t0, N.pattern, { phi: 0 });
      if (fineness(slot) > FALL_FINE) return null;
      const ok = wearFall(G, N, { a: clamp(0.55 + 0.45 * l.a), bar, phiOf, spin: (mirror ? -1 : 1) * spun * amount, D });
      return ok ? put('fall', G, G.t1, G.t1 - G.morph, G.t1 + bar, G.t1 - G.morph, G.t1 + bar, { mirror }) : null;
    };
    const ranked = landings.filter(l => !l.rest && l.a >= FALL_MIN).sort((x, y) => y.a - x.a);
    let n = 0;
    for (const l of ranked) {
      if (n >= FALLS) break;
      if (!fallOn(l, false)) continue;
      n++;
      for (const r of replaysOf(l.B, 0.2).slice(0, REPLAYS - 1)) fallOn(r, true);
    }
  }

  // ------------------------------------------------------------- Shocks
  const uses = new Map();
  const count = () => { uses.clear(); for (const G of g) uses.set(G.pattern, (uses.get(G.pattern) || 0) + 1); };
  // Who could come next, so that it can be a shock: the same world first, then the same look, then anything the film isn't already full of
  const nextCandidates = (G, N) => {
    const after = g[g.indexOf(N) + 1]?.pattern, all = (score.patterns ?? []).filter(p => p !== G.pattern && p !== after && p !== N.pattern && (uses.get(p) || 0) < 2 && noMatte(base(p)));
    const shuffled = all.map(p => [rand(), p]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    return [...shuffled.filter(p => p.family === N.pattern.family), ...shuffled.filter(p => p.family !== N.pattern.family)];
  };
  const focusAt = t => { const s = reactAt(score.react, score.react.C ? score.react.C(t) : t), x = (s.px ?? 0) * 0.45, y = (s.py ?? 0) * 0.45; return [clamp(x, -0.7, 0.7), clamp(y, -0.5, 0.5)]; };
  const shockOn = (i, landing, dir, mirror, again) => {
    const G = g[i];
    let N = g[i + 1];
    if (P && i === 0) return null;     // the arrival would fly straight past it, and past the first pattern with it
    if (!N || i + 1 >= lastG() || G.xform || N.carry || G.moves?.some(m => m.id === 'star') || N.hero === 'countdown' || N.moves?.some(m => m.id === 'slip' || m.id === 'snap')) return null;
    const D = P ? SHOCK_D : Math.min(G.morph || 10, 10), span = dir === 2 ? D : 0;
    if (landing - G.t0 < D + SHOCK_ROOM || !quiet(landing - D, landing + span + bar) || twiceRunning('shock', landing) || lagged(landing - D, landing + span + bar) || clash(i, 'shock')) return null;
    if (!noMatte(base(G.pattern))) return null;
    const c0 = again?.centre ?? focusAt(landing), centre = mirror ? [-c0[0], c0[1]] : c0;
    const o = { dir, D, aspect, phiOf, centre, beats: score.react?.pulses ?? null, leave: P ? 3 : 7 };
    let fit = noMatte(base(N.pattern)) && shockFit(G, N, { D, aspect, phiOf, centre });
    if (!fit && score.remake && N.replayOf == null && N.k != null && isPlain(N) && !N.fixedRange) {
      for (const p of nextCandidates(G, N)) {
        if (!shockFit(G, { pattern: p, t0: N.t0, t1: N.t1, arcEnd: N.arcEnd, flow: p.flow, arcs: p.arcs, range: [0, 1] }, { D, aspect, phiOf, centre })) continue;
        const M2 = score.remake(N, p);
        if (shockFit(G, M2, { D, aspect, phiOf, centre })) { g[i + 1] = N = M2; fit = true; break; }
      }
    }
    if (!fit) return null;
    const worn = wearShock(G, N, landing, o);
    if (!worn) return null;
    return put('shock', G, landing, G.t1 - G.morph, G.t1, G.t1 - G.morph, G.t1 + bar, { mirror, centre: c0, dir });
  };
  if (flag('shock')) {
    count();
    const done = new Map();
    for (let i = 0; i < lastG() - 1; i++) {
      const G = g[i], N = g[i + 1], l = landings.find(x => Math.abs(x.B - G.t1) < 0.05);
      if (!l || l.rest || G.xform) continue;
      const out = l.dE < -0.1;
      if (G.label === N.label && !out) continue;
      // The same section coming back, the first time's centre mirrored
      const c = sectionAt(l.B)?.label ?? G.t1, first = done.get(c);
      const h = shockOn(i, l.B, out ? 2 : 1, !!first, first);
      if (h && !first) done.set(c, h);
    }
    // A film can have one more now and then where nothing else is going on, as long as what's there already allows it. These don't change what comes next.
    let lastShock = -Infinity;
    for (let i = 0; i < lastG() - 1; i++) {
      const G = g[i], N = g[i + 1], l = landings.find(x => Math.abs(x.B - G.t1) < 0.05);
      if (cast.some(h => h.kind === 'shock' && Math.abs(h.at - G.t1) < SHOCK_APART)) continue;
      if (!l || l.rest || G.xform || l.B - lastShock < SHOCK_APART || !shockFit(G, N, { D: P ? SHOCK_D : Math.min(G.morph || 10, 10), aspect, phiOf })) continue;
      if (shockOn(i, l.B, l.dE < -0.1 ? 2 : 1, false, null)) lastShock = l.B;
    }
  }

  // ------------------------------------------------------------- Snaps
  if (flag('snap') && M.breath.t?.length) {
    let n = 0;
    for (const G of g.slice(0, lastG())) {
      if (n >= SNAPS) break;
      if (G.moves?.length || !MOVES.snap.needs(base(G.pattern)) || (G.pattern.family !== 'dots' && G.pattern.family !== 'riley')) continue;
      const tm = G.t1 - (G.morph || 0);
      if (tm - G.t0 < 10 || twiceRunning('snap', G.t0 + 1) || clash(g.indexOf(G), 'snap') || cast.some(h => (h.G === G && h.kind === 'riley' ? false : G.t0 + 2 < h.wb && tm > h.wa))) continue;
      G.moves = [{ id: 'snap', breaths: M.breath.t, amp: 0.3, sharp: 3 }];
      cast.filter(h => h.G === G && h.kind === 'riley').forEach(h => { cast.splice(cast.indexOf(h), 1); G.hero = null; });
      put('snap', G, G.t0 + 1, G.t0, tm, G.t0 + 2, tm, { gain: QUIET_SNAP });
      n++;
    }
  }

  // ------------------------------------------------------------- a film needs at least four kinds, and one by 90 s
  const kinds = () => new Set(cast.map(h => (h.kind === 'riley' ? h.G.hero : h.kind))).size;
  if (flag('shock') && (kinds() < 4 || !cast.some(h => h.G.t0 < COUNTDOWN_BY))) {
    count();
    for (let i = 0; i < lastG() - 1 && (kinds() < 4 || !cast.some(h => h.G.t0 < COUNTDOWN_BY)); i++) {
      const l = landings.find(x => Math.abs(x.B - g[i].t1) < 0.05);
      if (l && !l.rest) shockOn(i, l.B, l.dE < -0.1 ? 2 : 1, false, null);
    }
  }

  // Never the same kind twice running: something goes between them, if anything can
  if (flag('shock')) {
    count();
    for (let k = 1; k < cast.length; k++) {
      const a = cast[k - 1], b = cast[k];
      if (a.kind !== b.kind) continue;
      for (let i = 0; i < lastG() - 1; i++) {
        const l = landings.find(x => Math.abs(x.B - g[i].t1) < 0.05);
        if (l && !l.rest && l.B > a.at && l.B < b.at && shockOn(i, l.B, l.dE < -0.1 ? 2 : 1, false, null)) break;
      }
    }
  }

  // ------------------------------------------------------------- what's been moved has to still make sense
  for (let i = 0; i < lastG(); i++) {
    const G = g[i];
    if (!G.morph) continue;
    const longest = 0.8 * (G.t1 - G.t0);
    if (G.morph > longest) { G.morph = longest; delete G.plan; delete G.planFor; delete G.planning; }
    // Its long move ends where its clock comes to rest, as the composer has it
    if (!G.fixedRange && G.regear) G.arcEnd = G.t1 - G.morph + Math.min(G.morph * 0.4, 3.5) / 2;
    // No transformation starts while the picture's clock is catching up with the song
    const start = G.t1 - G.morph, w = lags.find(l => start > l.from && start < l.paid);
    if (w && G.t1 - w.paid >= 5.5 && !G.xform) { G.morph = G.t1 - w.paid; delete G.plan; delete G.planFor; delete G.planning; }
  }

  // ------------------------------------------------------------- Hearing 9: Whitney bars, on the biggest plain stretch there's room for. Bars are what the song is counted in, and this shows them.
  if (score.ears?.[9] && flag('slip') && score.remake && lib('dials.sunburst')) {
    const E = A.E || A.loud, sizeOf = G => { let s = 0, c = 0; for (let t = G.t0; t < G.t1; t += 0.5) { s += E[Math.min(E.length - 1, Math.round(t * A.fps))] || 0; c++; } return c ? s / c : 0; };
    const room = G => G.t1 - (G.morph || 0) - G.t0 - 2;
    const spots = g.slice(1, lastG()).filter(G => isPlain(G) && G.replayOf == null && G.k != null && room(G) >= WHITNEY_SECONDS).sort((a, b) => sizeOf(b) - sizeOf(a));
    let done = 0, last = -1e9;
    for (const G of spots) {
      if (done >= WHITNEYS || Math.abs(G.t0 - last) < 40) continue;
      const i = g.indexOf(G), N = score.remake(G, lib('dials.sunburst')), tm = N.t1 - (N.morph || 0);
      const m = whitneyMove({ t0: N.t0 + 2, t1: tm - 0.5, tau, meter, bar, bars: Array.from(A.bars ?? []) });
      if (!m || !quiet(m.from, m.to)) continue;
      g[i] = N; N.moves = [m]; N.hero = 'whitney';
      put('whitney', N, (m.from + m.to) / 2, m.from, m.to, m.from, m.to, { gain: QUIET_SNAP });
      done++; last = G.t0;
    }
  }

  // ------------------------------------------------------------- everything else steps back, one hero at a time, eased at both ends
  const fade = Math.max(bar, 0.8);
  // Hearing 2: a long hero doesn't turn the song down so far that it's stopped singing.
  const wins = cast.map(h => ({ a: h.wa, b: h.wb, gain: score.ears?.[2] && h.wb - h.wa > LONG_HERO ? Math.max(h.gain, 0.5) : h.gain })).filter(w => w.b > w.a).sort((x, y) => x.a - y.a);
  score.ambient = t => {
    let k = 1;
    for (const w of wins) {
      if (t <= w.a - fade) break;
      if (t >= w.b + fade) continue;
      k = Math.min(k, 1 - (1 - w.gain) * smoother((t - w.a + fade) / fade) * smoother((w.b + fade - t) / fade));
    }
    return k;
  };

  // ------------------------------------------------------------- upkeep
  const onFilm = t => g.some(G => Math.abs(G.t1 - t) < 0.05) || cast.some(h => Math.abs(h.at - t) < 0.05);
  // A star opens on the arrival inside it: that's somewhere the film lands too.
  score.landings = landings.filter(l => onFilm(l.B) || (l.a >= 0.5 && cast.some(h => h.kind === 'star' && l.B > h.a && l.B < h.b)));
  for (const h of cast) { const l = score.landings.find(x => Math.abs(x.B - h.at) < 0.05); if (l) l.hero = h.kind; }
  score.cast = cast.map(h => ({ kind: h.kind === 'riley' ? h.G.hero : h.kind, at: +h.at.toFixed(2), t0: +h.a.toFixed(2), t1: +h.b.toFixed(2), id: h.G.pattern.id, mirror: !!h.mirror, gain: h.gain }));
  score.stats = { ...score.stats, gestures: g.length - 1, cast: score.cast.map(h => `${h.kind}@${h.at.toFixed(0)}`).join(' ') };
  score.kit = { cast, putCountdown, makeCountdown, rand, lib };     // what a hand cut places with (docs/DIRECTION.md section 7)
  score.pace?.timeHits(score, cast);
  land(score, A, M, cast);     // last of all. Behind directing.peak
  return score;
}
