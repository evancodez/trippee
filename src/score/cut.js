// A hand cut: a film written out by someone, as times, pattern ids and the names and numbers of moves. See docs/DIRECTION.md section 7. compose() runs as ever and then this replaces its gestures, so a
// cut draws nothing from the seed and a film with no cut never comes here. All the song's own reactions, the rehearsal and the flash guard work on it as on any film.
//
//   applyCut(score, cut, A, M)   lays the cut over a composed film. What couldn't run is in score.refused, as { t, what, why }. A cut for another recording, or with a pattern nobody has, isn't laid at all.
//   auditCut(score, rehearsal)   after the rehearsal: adds whatever it changed to score.refused. Call it once a cut has been rehearsed. A refusal nobody sees is how a climax goes missing.
//
// A shot, in song seconds. All of them are snapped to a bar or a beat within .06 s, and go through score.time, so a rest can't move a landing.
//   at          the hit: where this pattern arrives
//   id          the pattern
//   via         how it comes from the last shot: plain (the planner picks), slide, rise, dive, fall, shock, shockout, iris, or any id in xform/index.js
//   from        when that starts. Default at - 4 bars
//   tail        bars it coasts past the hit, for plain, slide, rise and dive. Default 2
//   q           how sharp the hit is, for those. 2 is the fastest frame the tail allows, and it passes the hit at T' = 1.875 q / (2 tail) a second. 1 is half that, for a flight that flashes. Default 2
//   a, D, centre, spin, turn    the via's own numbers. A fall's a and spin, a shock's centre and turn, an iris's D, centre and way.
//   lanes       { path: [[t, x], [t, x, 'hit'], ...] }: numbers from pattern/layout.js. Each holds still outside its knots, and nothing stops at a knot unless the two sides disagree. 'hit' is crossed at speed:
//               a long approach hangs first and whips through, and a last knot coasts on past. scale, freq and cam.dist are read as multiples.
//   arcs        leave it out and the pattern's own long move isn't ridden: a cut says what it wants. true rides it, or give arcs of its own
//   gear        [[t, N], ...]: one cycle of flow per N beats, shifting over a bar or 3 s. Default one per 8
//   ambient     [[t, gain], ...]: how much of the song the sheet takes, eased. A shot that doesn't say takes all of it
//   pulse       [[t, gain], ...]: the same for the strong beats alone, on top of ambient
//   countdown   { L, start, mirror, grow, release } on this shot's dial: moves/slip.js, countdownOn. start: it shatters no sooner than this. The shot's scale and rot lanes run until then, and the board goes on from them
//   star        { landOn, freq, size, lead, mirror, bars, schedule } on this shot's sheet: moves/star.js. schedule is [[t, R], ...]: it can try, retreat and bloom
//   coin        { land, beats, dir, w0, a0, after, pour } on this shot's sheet: moves/coin.js
//   moves       [{ id, ...its own options }]: any move in moves/index.js, by name, for as long as the shot lasts. Any option that's a lane [[t, x], ...] is in song seconds and is retimed, as are the
//               names under times: { times: { land: 77.75, hits: [70.07, 72] } } arrives as m.land and m.hits. A move with a cue(m, ctx) gets to finish its own settings there, ctx being
//               { score, A, M, G, shot, at, bar, beat, meter, tau }, and can answer null to refuse. A name nobody knows, or a pattern its needs() says no to, is a refusal and the shot plays without it.
import { OFF } from '../pattern/layout.js';
import { evalTrack, smoother } from './curves.js';
import { base } from './slot.js';
import { MOVES } from './moves/index.js';
import { XFORMS, wearFall, wearShock } from './xform/index.js';
import { wearIris } from './xform/iris.js';
import { starMove, fineOf, safeTurn } from './moves/star.js';
import { countdownOn } from './moves/slip.js';
import { coinMove, coinFlow } from './moves/coin.js';

const LOGS = new Set(['scale', 'freq', 'cam.dist']);
const HIT = 2.2;              // how much faster than the lane's own slope a 'hit' is crossed
const STEADY = 2.5;           // how much faster than its own slope a quintic can arrive from rest without going backwards first. A hit that wants more waits, and goes from there
const PAST_HIT = 0.15;        // how far past a last 'hit' a lane goes, as a share of its whole travel
const GEAR_SHIFT = 3;         // seconds a change of gear takes, at least, or a bar
const SNAP = 0.06;            // seconds
const MORPH_LEAST = 3;        // seconds: anything quicker than this is a cut, and a film has none
const BODY_LEAST = 2;         // seconds a shot keeps to itself before it starts to leave
const SHOCK_PAST = 0.35;      // how much of a rim shock comes after its hit: most of a ring's sweep is near the rim
const STAR_SIZE = [2.6, 4], STAR_FLOW = 0.2, R_FLAT = 40;
const GAIN = { countdown: 0.3, iris: 0.3, shock: 0.3, fall: 0.3 };      // the song steps back for these, as it does for the director: a Countdown's rings hang, which you can't see if everything's moving, and the song's lift on the big shapes of a change at speed is a flash. PPP's shock at 65 s went from one whole-frame flash to none on this alone

const FLOWN = new Set(['plain', 'slide', 'rise', 'dive']), WORN = new Set(['shock', 'shockout', 'fall', 'iris']);
const isLane = v => Array.isArray(v) && Array.isArray(v[0]);

// Times as a list of [t, x, 'hit'?], already on the picture's clock. No two knots at once: a rest can bring them together.
function apart(keys) {
  const out = [];
  for (const k of keys) { const t = out.length ? Math.max(k[0], out.at(-1)[0] + 1e-3) : k[0]; out.push([t, k[1], k[2]]); }
  return out;
}

// The knots. Interior speed is the harmonic mean of the slopes either side, so nothing overshoots and nothing stops at a knot, and where they disagree it turns at rest.
export function laneKnots(keysIn, { log = false, bar = 2 } = {}) {
  const keys = apart(keysIn), n = keys.length, x = keys.map(k => (log ? Math.log(k[1]) : k[1])), t = keys.map(k => k[0]);
  const slope = i => (x[i + 1] - x[i]) / (t[i + 1] - t[i]);
  const out = [];
  for (let i = 0; i < n; i++) {
    let v = 0;
    if (i > 0 && i < n - 1) { const a = slope(i - 1), b = slope(i); v = a * b > 0 ? 2 * a * b / (a + b) : 0; }
    if (keys[i][2] === 'hit' && n > 1) {
      v = HIT * (i < n - 1 ? slope(i) : slope(i - 1));
      // From rest, too fast to get there on the way it's going: it holds where it was, and goes from as late as it can. That's what a hit wants, and without it the lane first swings well back.
      const p = out.at(-1), T = t[i] - p?.t, d = x[i] - p?.x;
      if (p && !p.v && Math.abs(v) * T > STEADY * Math.abs(d)) {
        const k = Math.max(STEADY * Math.abs(d) / Math.abs(v), bar);
        if (k < T - 1e-2) out.push({ t: t[i] - k, x: p.x, v: 0 });
      }
    }
    out.push({ t: t[i], x: x[i], v });
    // It can't stop dead at the end of a lane: it comes to rest a little past where it was told, by this share of the way it's come. The last knot is where the hit is, not where it ends up.
    if (i === n - 1 && v) { const C = Math.max(2 * PAST_HIT * Math.abs(x[i] - x[0]) / Math.abs(v), 0.5); out.push({ t: t[i] + C, x: x[i] + 0.5 * v * C, v: 0 }); }
  }
  return out;
}

// One cycle of flow per N beats, on phi's clock: beats, as compose.js's score.phi reads them.
function gearKnots(keys, tau, bar) {
  const shift = Math.max(bar, GEAR_SHIFT), out = [];
  let phi = 0, cur = keys[0][1], now = tau(keys[0][0]);
  out.push({ t: now, x: 0, v: 1 / cur });
  for (let i = 1; i < keys.length; i++) {
    const a = Math.max(tau(keys[i][0]), now + 1e-3), b = Math.max(tau(Math.min(keys[i][0] + shift, keys[i + 1]?.[0] ?? Infinity)), a + 1e-3), want = keys[i][1];
    phi += (a - now) / cur;
    out.push({ t: a, x: phi, v: 1 / cur });
    phi += (b - a) * (1 / cur + 1 / want) / 2;
    out.push({ t: b, x: phi, v: 1 / want });
    now = b; cur = want;
  }
  return out;
}

// A share of the song over the whole film. A shot that says nothing takes all of it, eased back over a bar from what the last one left.
function shareLane(shots, get, bar) {
  if (!shots.some(s => get(s)?.length)) return null;
  const knots = [];
  const put = (t, x) => { if (!knots.length || t > knots.at(-1).t + 1e-3) knots.push({ t, x, v: 0 }); };
  let now = 1;
  for (const s of shots) {
    const keys = get(s);
    if (keys?.length) {
      if (now !== keys[0][1]) put(keys[0][0] - bar, now);
      for (const k of keys) put(k[0], k[1]);
      now = keys.at(-1)[1];
    } else if (now !== 1) { put(s.t, now); put(s.t + bar, 1); now = 1; }
  }
  return t => evalTrack(knots, t);
}

export function applyCut(score, cut, A, M) {
  const refused = score.refused = [];
  const refuse = (t, what, why) => { refused.push({ t: +(+t).toFixed(2), what, why }); };
  const library = score.library ?? score.patterns ?? [], lib = id => library.find(p => p.id === id);
  const notLaid = why => { refuse(0, `cut ${cut?.name ?? ''}`.trim(), why); return score; };
  if (!cut?.shots?.length) return notLaid('nothing in it');
  if (cut.hash !== A.hash) return notLaid('it was cut to another recording');
  if (!M || M.neutral || !score.tau) return notLaid('nothing to read the song with');
  const unknown = cut.shots.find(s => !lib(s.id));
  if (unknown) return notLaid(`no pattern ${unknown.id}`);

  const g = score.gestures, bar = M.bar, beat = M.beat, meter = score.song?.meter ?? M.meter ?? 4, tau = score.tau, time = score.time ?? (t => t), aspect = score.aspect ?? 16 / 9;
  const phiOf = (t, G) => score.phi(t, G);
  const beats = score.react?.pulses ?? null;
  // Song seconds to the picture's: on a bar or beat if it's that close, otherwise it means what it says.
  const grid = [...(A.bars ?? []), ...(A.beats ?? [])];
  const snapped = t => { let best = t, d = SNAP; for (const b of grid) { const e = Math.abs(b - t); if (e <= d) { d = e; best = b; } } return best; };
  const at = t => time(snapped(t));
  const keysAt = keys => keys.map(([t, ...rest]) => [at(t), ...rest]);
  const trackFor = (path, keys) => {
    const off = OFF[path];
    if (off === undefined) return null;
    return { off, log: LOGS.has(path), track: laneKnots(keysAt(keys), { log: LOGS.has(path), bar }) };
  };
  const sectionAt = t => A.segments?.find(s => s.t0 <= t && t < s.t1) ?? A.segments?.at(-1);

  const shots = cut.shots, tail = g.at(-1), tEnd = tail.t0;
  // ------------------------------------------------------------- the gestures, end to end, each landing on its hit
  const made = shots.map((s, i) => {
    const pattern = lib(s.id), next = shots[i + 1], lanes = [];
    for (const [path, keys] of Object.entries(s.lanes ?? {})) {
      const L = trackFor(path, keys);
      if (L) lanes.push(L); else refuse(s.at, `lane ${path}`, 'no such number');
    }
    const sec = sectionAt(s.at);
    const G = { t0: at(s.at), t1: next ? at(next.at) : tEnd, pattern, arcs: s.arcs === true ? pattern.arcs : s.arcs ?? [], flow: s.flow ?? pattern.flow, range: [0, 1], fixedRange: true, morph: 0,
      moves: [{ id: 'cue', lanes }], gears: [], melMode: 0, replayOf: null, change: null, kindIn: 'level', kindOut: 'level', label: sec?.label ?? null, visit: sec?.visit ?? 0, shot: i };
    G.arcEnd = G.t1;
    G.phiTrack = gearKnots(s.gear?.length ? keysAt(s.gear) : [[G.t0, 8]], tau, bar);
    return G;
  });

  // A sheet that's going to roll up has its size from here, which is what a fall or a shock into it has to know.
  const stars = new Map();
  shots.forEach((s, i) => {
    if (!s.star) return;
    const pattern = made[i].pattern;
    if (!MOVES.star.needs(base(pattern))) { refuse(s.at, `star on ${s.id}`, "this pattern can't wear it"); return; }
    const size = s.star.size ?? STAR_SIZE, fine = fineOf(base(pattern));
    stars.set(i, { size, fine, way: s.star.mirror ? -1 : 1 });
    made[i].arcs = (pattern.arcs ?? []).filter(a => a.path !== 'scale' && a.path !== 'tx' && a.path !== 'ty' && a.path !== 'rot')
      .map(a => (a.path === 'freq' && s.star.freq ? { ...a, from: s.star.freq[0], to: s.star.freq[1] } : a));
    made[i].moves[0].lanes.push({ off: OFF.scale, log: true, track: [{ t: made[i].t0, x: Math.log(fine / size[0]), v: 0 }] });
    if (!s.gear?.length) made[i].phiTrack = [{ t: tau(made[i].t0), x: 0, v: Math.min(1 / 8, STAR_FLOW * beat) }];
  });

  // ------------------------------------------------------------- how each comes to the next
  const hits = [];
  // The next shot's morph has to start after this one's over, so it's as long as there's room for and no longer.
  const fromOf = s => (s.from != null ? at(s.from) : at(s.at - 4 * bar));
  for (let i = 0; i + 1 < made.length; i++) {
    const G = made[i], N = made[i + 1], s = shots[i + 1], hit = at(s.at), want = s.via ?? 'plain';
    let from = fromOf(s);
    const body = G.t0 + BODY_LEAST;
    if (from < body) { refuse(s.at, `${G.pattern.id}>${N.pattern.id}`, `it was to start at ${from.toFixed(2)}, before the last shot had landed at ${G.t0.toFixed(2)}`); from = body; }
    // What the next one wants of N, for those that look: its own morph is laid out later
    const after = shots[i + 2] ? fromOf(shots[i + 2]) : tEnd;
    N.t1 = Math.max(N.t1, after + 0.01);
    N.morph = shots[i + 2] ? N.t1 - after : 0;
    let done = false;
    if (WORN.has(want) && s.countdown) refuse(s.at, `${want} into a countdown`, 'a countdown has to be landed on, whole');
    else if (want === 'shock' || want === 'shockout') {
      const dir = want === 'shock' ? 1 : 2;
      const fit = wearShock(G, N, hit, { dir, D: Math.max(hit - from, 4) / (dir === 1 ? 0.7 : 1), aspect, phiOf, centre: s.centre ?? [0, 0], beats, turn: s.turn ?? 0 });
      if (fit) {
        if (dir === 1) {
          // Most of a ring's sweep is near the rim, so its centre arriving is the least of it. The hit goes this far from the end, with the rest of the sweep behind it.
          const by = hit + SHOCK_PAST * G.morph - G.t1;
          if (by > 0) {
            G.t1 += by; N.t0 = G.t1;
            const t0 = G.t1 - G.morph, inside = beats ? beats.filter(b => b > t0 && b < G.t1).map(b => (b - t0) / G.morph) : [];
            G.xform.beats = inside.length >= 2 ? inside : null;
          }
        }
        G.peak = { hit, q: 0 };
        done = true;
      } else refuse(s.at, `shock ${G.pattern.id}>${N.pattern.id}`, 'these two have no family that can travel');
    } else if (want === 'fall') {
      G.t1 = N.t0 = hit;
      const ok = wearFall(G, N, { a: s.a ?? 0.9, bar, phiOf, spin: s.spin ?? 0.25, D: hit - from });
      if (ok) { G.peak = { hit, q: 0 }; done = true; } else refuse(s.at, `fall ${G.pattern.id}>${N.pattern.id}`, "it can't");
    } else if (want === 'iris') {
      const ok = wearIris(G, N, hit, { D: s.D ?? 12, aspect, focus: s.centre ?? [0, 0], beats, room: BODY_LEAST, way: s.way ?? 1 });
      if (ok) { G.peak = { hit, q: 0 }; done = true; } else refuse(s.at, `iris ${G.pattern.id}>${N.pattern.id}`, 'no room for it');
    } else if (!FLOWN.has(want)) {
      if (XFORMS[want]) G.xform = { id: want, ...s.xform };
      else refuse(s.at, `via ${want}`, 'nobody knows how');
    }
    if (!done) {
      // The fastest frame on the hit, and it coasts on from there. morphclock.js's peaked() does the rest.
      let tailT = (s.tail ?? 2) * bar;
      const room = after - hit - BODY_LEAST;
      if (tailT > room) { tailT = Math.max(room, 0); refuse(s.at, `tail of ${N.pattern.id}`, `only room for ${tailT.toFixed(2)} s`); }
      G.t1 = N.t0 = hit + tailT;
      G.morph = G.t1 - from;
      if (G.morph < MORPH_LEAST) { G.morph = Math.min(MORPH_LEAST, G.t1 - G.t0); refuse(s.at, `${G.pattern.id}>${N.pattern.id}`, `a change this quick is a cut: ${(G.t1 - from).toFixed(2)} s`); }
      G.peak = { hit, q: s.q ?? (XFORMS[want]?.long ? 0 : 2) };      // a long journey (src/score/xform/space.js) takes its time and isn't squeezed onto the hit: say from and tail so that its middle is
      if (want === 'rise') { G.rise = true; G.noGlide = true; } else if (want === 'dive') { G.rise = false; G.noGlide = true; }
    }
    G.cutAsked = { xform: G.xform?.id ?? null, rise: G.rise ?? null, q: G.peak?.q ?? 0, morph: G.morph, noGlide: !!G.noGlide };
    hits.push({ t: s.at, picture: +hit.toFixed(3), via: want, id: s.id, depth: 'change', shape: 'cross', why: '' });
  }
  const last = made.at(-1);
  last.t1 = tEnd; last.morph = 0;

  // ------------------------------------------------------------- now the times are settled: where each one's clock comes to rest, and what it wears
  const named = new Set();      // what a shot wears by name. The last shot's goes on past the song's end with it: its lanes hold, and without them the sheet would go back to the pattern's own numbers on one frame
  const cast = [], steps = [], comes = (G, kind, t, a, b, gain = 1, id = G.pattern.id, mirror = false) => cast.push({ kind, at: +t.toFixed(2), t0: +a.toFixed(2), t1: +b.toFixed(2), id, mirror, gain });
  made.forEach((G, i) => {
    const s = shots[i], end = G.morph ? G.t1 - G.morph : G.t1;
    G.arcEnd = stars.has(i) ? G.t1 : end;
    const xf = G.xform?.id;
    if (xf && i + 1 < made.length) {
      comes(G, xf, G.peak.hit, G.t1 - G.morph, G.t1, GAIN[xf] ?? 1, shots[i + 1].id);
      if (GAIN[xf]) steps.push({ a: G.t1 - G.morph, b: G.t1, gain: GAIN[xf] });
    }
    if (s.countdown) {
      const o = s.countdown, L = at(o.L), laneOf = off => G.moves[0].lanes.find(x => x.off === off)?.track;
      const done = countdownOn(G, G.pattern, { L, score, meter, seed: o.seed ?? score.seed ?? 1, mirror: !!o.mirror, grow: o.grow ?? 1, release: o.release ?? 0.5, from: o.start != null ? at(o.start) : G.t0, end, before: { scale: laneOf(OFF.scale), rot: laneOf(OFF.rot) } });
      if (!done) refuse(s.at, `countdown on ${s.id}`, `no room for four rings between ${G.t0.toFixed(2)} and ${L.toFixed(2)}, or it isn't a dial`);
      else {
        G.moves.push(done.move); G.hero = 'countdown';
        steps.push({ a: done.start, b: L, gain: GAIN.countdown });
        comes(G, 'countdown', L, done.start, G.t1, GAIN.countdown, s.id, !!s.countdown.mirror);
        hits.push({ t: s.countdown.L, picture: +L.toFixed(3), via: 'countdown', id: s.id, depth: 'turn', shape: 'lock', why: '' });
      }
    }
    const star = stars.get(i);
    if (star) {
      const o = s.star, first = G.t0 + (o.lead ?? 1) * bar, tm = end, land = o.landOn != null ? at(o.landOn) : null;
      const open = land > first + 4 * bar && land < tm ? land - first : Math.min((o.bars ?? 8) * bar, 0.6 * (tm - first));
      if (tm - first < 12) refuse(s.at, `star on ${s.id}`, 'no room for it');
      else {
        const r0 = safeTurn(G.pattern, star.way), lanes = G.moves[0].lanes;
        lanes.splice(lanes.findIndex(L => L.off === OFF.scale), 1);
        lanes.push({ off: OFF.scale, log: true, track: [{ t: first, x: Math.log(star.fine / star.size[0]), v: 0 }, { t: first + open, x: Math.log(star.fine / star.size[1]), v: 0 }] });
        lanes.push({ off: OFF.rot, log: false, track: [{ t: G.t0, x: 0, v: 0 }, { t: first + 0.25 * open, x: r0, v: 0.14 * star.way / (G.t1 - first - 0.25 * open) }, { t: G.t1, x: r0 + star.way * 0.14, v: 0 }] });
        const schedule = o.schedule?.length ? laneKnots([[first, R_FLAT], ...keysAt(o.schedule).filter(k => k[0] > first)], { log: true, bar }) : null;
        G.moves.push(starMove({ t0: first, open, seed: o.seed ?? 11, tau, meter, surge: 0.5, react: score.react, mirror: !!o.mirror, chords: M.runs?.length ? { runs: M.runs, home: M.home, bar } : null, ...(schedule ? { schedule } : {}) }));
        G.hero = 'star';
        comes(G, 'star', G.t0, G.t0, G.t1, 1, s.id, !!o.mirror);
        if (land != null) hits.push({ t: o.landOn, picture: +land.toFixed(3), via: 'star', id: s.id, depth: 'turn', shape: 'release', why: '' });
      }
    }
    if (s.coin) {
      const o = s.coin, land = at(o.land), m = coinMove(score, land, { dir: 1, ...o, land: undefined, pour: undefined });
      m.land = land;
      if (!MOVES.coin.needs(base(G.pattern))) refuse(s.at, `coin on ${s.id}`, "this pattern can't wear it");
      else if (land - m.beats * m.spb < G.t0 || land >= end) refuse(s.at, `coin on ${s.id}`, `it needs ${m.beats} beats before ${land.toFixed(2)}, inside the shot`);
      else {
        G.moves.push(m);
        G.phiTrack = coinFlow(score, m, { pour: o.pour ?? 0.5 });
        G.hero = 'coin';
        comes(G, 'coin', land, land - m.beats * m.spb, G.t1, 1, s.id);
        hits.push({ t: o.land, picture: +land.toFixed(3), via: 'coin', id: s.id, depth: 'turn', shape: 'lock', why: '' });
      }
    }
    // Anything else, by name.
    for (const o of s.moves ?? []) {
      const mv = MOVES[o.id];
      if (!mv) { refuse(s.at, `move ${o.id}`, 'nobody knows it'); continue; }
      if (mv.needs && !mv.needs(base(G.pattern), G)) { refuse(s.at, `move ${o.id} on ${s.id}`, "this pattern can't wear it"); continue; }
      const m = {};
      for (const k in o) if (k !== 'times') m[k] = isLane(o[k]) ? keysAt(o[k]) : o[k];
      for (const k in o.times ?? {}) { const v = o.times[k]; m[k] = Array.isArray(v) ? v.map(at) : at(v); }
      const done = mv.cue ? mv.cue(m, { score, A, M, G, shot: s, at, bar, beat, meter, tau }) : m;
      if (done) { G.moves.push(done); named.add(done); } else refuse(s.at, `move ${o.id}`, 'it says no here');
    }
    // A hit in a lane is one too
    for (const [path, keys] of Object.entries(s.lanes ?? {})) for (const k of keys) if (k[2] === 'hit') hits.push({ t: k[0], picture: +at(k[0]).toFixed(3), via: 'lane', id: s.id, path, depth: 'turn', shape: 'cross', why: '' });
  });

  // ------------------------------------------------------------- the film
  // After the song the last shot carries on as it is: the same numbers, the same clock.
  Object.assign(tail, { pattern: last.pattern, arcs: last.arcs, flow: last.flow, moves: last.moves.filter(m => m.id === 'cue' || named.has(m)), phiTrack: last.phiTrack, t0: tEnd, arcEnd: tEnd + 1e-3, fixedRange: true, range: [0, 1], melMode: 0 });
  g.length = 0; g.push(...made, tail);

  const song = made.map((G, i) => ({ t: G.t0, a: shots[i].ambient ? keysAt(shots[i].ambient) : null, p: shots[i].pulse ? keysAt(shots[i].pulse) : null }));
  const said = shareLane(song, s => s.a, bar), fade = Math.max(bar, 0.8);
  score.ambient = t => {
    let k = said ? said(t) : 1;
    for (const w of steps) if (t > w.a - fade && t < w.b + fade) k = Math.min(k, 1 - (1 - w.gain) * smoother((t - w.a + fade) / fade) * smoother((w.b + fade - t) / fade));
    return k;
  };
  score.pulseLane = shareLane(song, s => s.p, bar);
  hits.sort((a, b) => a.t - b.t);
  score.sheet = { hash: cut.hash, by: 'cut', line: cut.line, register: cut.register ?? null, hits, shots, rhymes: cut.rhymes ?? null, stays: cut.stays ?? [], close: cut.close ?? null };
  score.cut = { name: cut.name, line: cut.line };
  cast.sort((a, b) => a.at - b.at);
  score.cast = cast;
  score.landings = hits.filter(h => h.depth === 'change').map(h => ({ B: h.picture, kind: h.via, form: 'cut', a: 1 }));
  score.landed = [];
  score.stats = { ...score.stats, gestures: made.length, cast: cast.map(h => `${h.kind}@${h.at.toFixed(0)}`).join(' ') };
  return score;
}

// What a rehearsal did to a cut that nobody asked for, in score.refused. Flow slowing and the song lifting it less aren't here: those change how a shot breathes, not what it does. They're in rehearsal.flash.fixes.
export function auditCut(score, rehearsal) {
  const refused = score.refused ??= [], seen = new Set(refused.map(r => `${r.t}|${r.what}`));
  const note = (t, what, why) => { const r = { t: +(+t).toFixed(2), what, why }, key = `${r.t}|${r.what}`; if (!seen.has(key)) { seen.add(key); refused.push(r); } };
  const g = score.gestures;
  for (let i = 0; i + 1 < g.length; i++) {
    const G = g[i], a = G.cutAsked;
    if (!a) continue;
    const what = `${G.pattern.id}>${g[i + 1].pattern.id}`, t = G.peak?.hit ?? G.t1;
    if (a.xform && G.xform?.id !== a.xform) note(t, what, `the guard took its ${a.xform} away`);
    if (a.q && !G.peak?.q) note(t, what, "the guard took the fastest frame off its hit");
    if (a.rise != null && G.rise !== a.rise) note(t, what, `it was to ${a.rise ? 'rise' : 'dive'} and it ${G.rise ? 'rises' : 'dives'}`);
    if (!a.noGlide && G.noGlide) note(t, what, "the guard made a flight of it");
    if (Math.abs(G.morph - a.morph) > 0.05) note(t, what, `its morph went from ${a.morph.toFixed(2)} to ${G.morph.toFixed(2)} s`);
  }
  for (const t of rehearsal?.flash?.left ?? []) note(t, 'flash', 'the guard could not clear it');
  for (const j of rehearsal?.jumps ?? []) note(j.t, `jump ${j.id}`, `the brightness jumps by ${j.by}`);
  return refused;
}
