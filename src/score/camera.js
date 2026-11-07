// A camera that travels, with someone operating it to the song. On by default for a film, a hand cut and a world; ?cam=0 is the film without it.
//
// It works in the numbers of the sheet, so every transformation, the planner, a flight's landing and the rehearsal see what the viewer sees and need no telling. In a transformation it rests with the rest of the gesture's clock, and the transformation is the move.
// src/score/hear.js stays on top of it, in front of the sheet: this is where the camera goes, and that's how it answers the beat on the way. frame() stays a pure function of the score and t: all of it's worked out here from the song, as tables.
//
//   THE HANDS     seven tracks over the whole song on the picture's clock, each a curve through knots that land on phrases and strong moments, and never stop dead except where they turn round:
//                   alt    how close: log zoom. Plus is nearer the sheet
//                   spin   how far round the sheet has turned. It never comes back unless a language says so
//                   tip    how far the sheet has tipped, -1..1. 1 is as far as it can go and keep its horizon out of the frame (it's the Vertigo move's own reach), and signed, so it can rock through flat
//                   dir    which way it tips, on the screen. Moving this alone is a plate wobbling on a table. Moving it to and fro is banking
//                   lens   how wide the lens is. Short and tipped is a floor rushing away. Long is nearly a plan. The middle of the frame keeps its size either way: a dolly zoom
//                   speed, head   how fast it travels over the sheet, in frame units a second, and which way on the screen. head = dir is flying forwards
//   LANGUAGES     each kind of section gets one way of doing these, by how big a section it is: a verse wanders, a chorus sweeps, a quiet passage drifts and still goes somewhere. It comes back as itself and goes further, and the mirror way round.
//   THE SONG      a build pushes in with a turn winding up, and the hit lets it go. A fall pulls back and flattens to show the whole design. A big hit gets a whip: a turn and a slide fastest on the hit, coasting to rest after it.
//   THE ROUTE     what those tracks mean on this pattern, one gesture at a time (routeOf). A plain sheet goes on for ever and the path chains from pattern to pattern. A sheet with somewhere to be (poles, a swirl, a bulge) gets a tour of its own landmarks, arriving at them on the knots.
//                 A dial with nothing but log rings and spokes looks the same at every size, so the camera can go on falling into it for as long as it likes.
//   THE MARGINS   what stays bold: log zoom is held softly between sizes the lines can be, by reading the lines at the frame from the pattern's own numbers. What can't take something doesn't get it (bearingOf).
//
// Hand-drawn lanes in a cut win: a number a shot draws by hand isn't touched.
import { OFF, SLOT_FLOATS, FAMILIES } from '../pattern/layout.js';
import { clamp, lerp, smoother, evalTrack, rng } from './curves.js';
import { fillSlot, fineness } from './slot.js';

const TAU = Math.PI * 2, ASPECT = 16 / 9;
const HZ = 30;              // the tables
const LENS = 2.4;           // cam.dist where nothing's been asked for

// Sizes, all first guesses against what the eye sees on the sheets.
export const SIZE = {
  bold: 8,  boldFar: 19,    // cycles per picture unit: the finest the lines can be across the frame, and at the far side of a tipped sheet. 8 is a period of 45 px at 720p
  big: 0.95,                // ...and the biggest, so nothing's one flat shape
  whipTurn: 0.75, whipSlide: 1.5,    // a full moment's whip, in radians and frame units
  pushIn: 0.75, windTurn: 0.5,       // the top of a build
  fallBack: 0.85,                    // a falling moment's crane
  leash: 1.35,              // how far off its landmark a sheet with somewhere to be wanders, in frame units
  selfFall: 0.2,            // natural logs a second a dial's fall goes at, at full size
};

// ---------------------------------------------------------------- tipping a sheet
const reachOf = roll => { const c = Math.cos(roll), s = Math.sin(roll); return 1.5 * Math.sqrt(c * c + ASPECT * ASPECT * s * s + 2 * ASPECT * Math.sqrt(s * s * c * c + 0.01)); };

// A flat sheet goes on a plane through the origin, where a pixel lands on the same spot as ever until it tips. Below this it's left flat, so a transformation between two untipped sheets is what it always was.
const FLAT = 1e-4;
export function writeTip(out, tip, dir, lens) {
  if (Math.abs(tip) < FLAT) return;
  if (out[OFF['surf.kind']] < 0.5) { out[OFF['surf.kind']] = 1; out[OFF['surf.map']] = 0; out[OFF['q.zw']] = 0.5; }
  const was = out[OFF['cam.roll']] + out[OFF['cam.yaw']];
  out[OFF['cam.dist']] = lens;
  out[OFF['cam.pitch']] = tip * Math.atan(lens / reachOf(dir));
  out[OFF['cam.roll']] = dir;
  out[OFF['cam.yaw']] = was - dir;
}
// How much finer the lines get at the far side of a tipped sheet, across the way it's going
const farOf = (tip, dir, lens) => { const th = Math.abs(tip) * Math.atan(lens / reachOf(dir)); return lens / Math.max(lens * Math.cos(th) - 0.8 * Math.sin(th), 0.05); };

// ---------------------------------------------------------------- what a pattern can bear
// Read from its numbers at the middle of its time, and proved by looking (tests/cambear.mjs).
const lim = new Float32Array(SLOT_FLOATS);
function bearingOf(G) {
  const s = lim;
  fillSlot(s, G, Math.min((G.t0 + G.t1) / 2, G.t0 + 30), G.pattern, { phi: 0, noCam: true });
  const n = k => s[OFF[k]], kind = n('surf.kind'), map = n('surf.map');
  const B = { pan: 1, tip: 1, spin: 1, zoom: 1, free: true, self: false, marks: [], floor: false, lensy: false, room: false };
  // The lines: which families are open, and what they run about.
  let plane = false, polar = false, logs = 0, rings = 0, pole2 = false;
  for (let i = 0; i < FAMILIES; i++) {
    if (n(`f${i}.on`) < 0.5 || Math.abs(n(`f${i}.d`)) > 1.01) continue;
    const g = k => Math.abs(n(`f${i}.${k}`));
    if (g('x') + g('y') > 1e-4) plane = true;
    if (g('r1') > 1e-4) rings++;
    if (g('r2') > 1e-4) { rings++; pole2 = true; }
    if (g('l1') + g('t1') > 1e-4) logs++;
    if (g('l2') + g('t2') > 1e-4) { logs++; pole2 = true; }
  }
  polar = rings + logs > 0;
  if (polar) { B.free = false; B.marks.push([n('p1.x'), n('p1.y')]); if (pole2) B.marks.push([n('p2.x'), n('p2.y')]); }
  // Warps with somewhere they are: past them there's only a plain sheet, which isn't why anyone's looking at this one.
  const at = (w, x, y) => { if (Math.abs(n(w)) > 1e-4) { B.free = false; B.marks.push([x, y]); } };
  at('swirl.a', n('swirl.cx'), 0); at('swirl.log', n('swirl.cx'), 0); at('bulge.a', n('bulge.cx'), n('bulge.cy')); at('ripple.a', n('ripple.cx'), 0);
  if (n('lens.c') !== 1 && Math.abs(n('lens.c')) > 1e-4) { B.free = false; B.marks.push([n('lens.cx'), n('lens.cy')]); }
  if (n('fold.n') >= 2) { B.free = false; B.marks.push([n('fold.cx'), n('fold.cy')]); }
  at('squeeze.a', n('squeeze.x0'), 0); at('bowtie.a', n('bowtie.x0'), 0);
  if (Math.abs(n('conf.amt')) > 1e-4) { B.free = false; B.marks.push([n('conf.x1'), n('conf.y1')], [n('conf.x2'), n('conf.y2')]); }
  if (n('ribbon.on') > 0.5 || n('blobs.on') > 0.5) { B.free = false; B.marks.push([0, 0]); }
  const droste = Math.abs(n('droste.lnS')) > 1e-4;
  if (droste) { B.free = false; B.pan = 0; B.marks = [[0, 0]]; }
  // The same at every size: only log rings and spokes, about one point, and nothing that minds.
  B.self = droste || (logs > 0 && !plane && !rings && !pole2 && Math.abs(n('swirl.a')) < 1e-4 && Math.abs(n('bulge.a')) < 1e-4 && n('fold.n') < 2);
  if (B.self) B.marks = B.marks.slice(0, 1);
  // A shape's edge is in the frame, not on the sheet: it stays where it is, and the lines inside it go about their business.
  if (n('matte.kind') > 0.5) { B.pan = 0; B.tip = 0; B.free = false; B.zoom = 0.5; }
  if (kind > 2.5) { B.pan = 0; B.tip = 0; B.spin = 0; B.zoom = 0; }                 // a world's own surface
  else if (kind > 1.5) { B.room = true; B.tip = 0.35; B.pan = 0.2; B.zoom = 0.6; B.free = false; if (!B.marks.length) B.marks.push([0, 0]); }     // a room: the view's in the walls' texture, so it turns by the camera
  else if (kind > 0.5 && map > 0.5) { B.lensy = true; B.tip = 0.3; B.pan = 0.25; B.free = false; B.marks = [[0, 0]]; }      // a tunnel: the view's a lens on it, which can look around in it
  else if (kind > 0.5) {
    const curved = Math.abs(n('q.xx')) + Math.abs(n('q.yy')) + Math.abs(n('q.xy')) > 1e-4;
    B.floor = true; B.tip = curved ? 0 : 0.5;      // it has its own tip and its own lens
    if (curved) { B.pan = 0.3; B.free = false; }
  }
  // Moves that keep their own appointments. A Countdown's dial, a star's sheet, a coin: the view can go along, but they don't take well to being tipped or carried off.
  for (const m of G.moves ?? []) {
    if (m.id === 'star') { B.tip = 0; B.pan = 0; B.zoom = Math.min(B.zoom, 0.4); B.spin = 0.5; }
    if (m.id === 'coin') { B.tip = 0.35; B.pan = Math.min(B.pan, 0.4); B.spin = 0.4; B.zoom = Math.min(B.zoom, 0.5); }
    if (m.id === 'slip') { B.tip = Math.min(B.tip, 0.7); B.pan = Math.min(B.pan, 0.5); }
  }
  return B;
}
// The lines at a place on the sheet, in cycles per pattern unit: the families' own gradients there, with no warps.
function linesAt(s, x, y) {
  const n = k => s[OFF[k]], p1x = n('p1.x'), p1y = n('p1.y'), p2x = n('p2.x'), p2y = n('p2.y');
  const d1 = Math.max(Math.hypot(x - p1x, y - p1y), 0.05), d2 = Math.max(Math.hypot(x - p2x, y - p2y), 0.05), fq = Math.max(n('freq'), 1e-3);
  let most = 0;
  for (let i = 0; i < FAMILIES; i++) {
    if (n(`f${i}.on`) < 0.5 || Math.abs(n(`f${i}.d`)) > 1.01) continue;
    const g = k => Math.abs(n(`f${i}.${k}`));
    most = Math.max(most, Math.hypot(g('x'), g('y')) * fq + g('r1') + g('r2') + (g('l1') + g('t1') / TAU) / d1 + (g('l2') + g('t2') / TAU) / d2);
  }
  return most;
}

// ---------------------------------------------------------------- the operator's languages
// One phrase each. Called with where it'll arrive, adds a knot to each track. way is which way round this visit goes; P how big this section is, more each time it comes back.
const LANG = {
  // A quiet passage: one slow curve that still goes somewhere. The sheet leans a little and the lean goes round.
  drift(h, { i, way, P }, s) {
    s.dir += way * 0.75; s.spin += way * 0.16 * P; s.head += way * 0.55;
    h({ alt: 0.1 + (i % 2 ? 0.12 : -0.05) * P, tip: 0.26 * (i % 2 ? 1 : 0.7), speed: 0.14 * P, lens: LENS });
  },
  // A verse: drifting off one part of it and finding another. Each phrase goes somewhere new and takes its time looking.
  wander(h, { i, way, P }, s) {
    s.dir += way * 1.05; s.spin += way * (i % 2 ? 0.46 : 0.22) * P; s.head += way * (i % 2 ? 1.35 : -0.8);
    h({ alt: (i % 2 ? 0.34 : -0.08) * P, tip: [0.3, 0.55, 0.2, 0.5][i % 4] * Math.min(P, 1.25), speed: 0.34 * P, lens: LENS });
  },
  // Flat on, with the whole design under you: a journey across it, turning as it goes.
  survey(h, { i, way, P }, s) {
    s.spin += way * (i % 3 === 2 ? -0.5 : 0.62) * P; s.head += way * (i % 2 ? 1.2 : -0.95);
    h({ alt: (i % 2 ? -0.12 : 0.26) * P, tip: i % 3 === 2 ? 0.34 : 0, speed: 0.55 * P, lens: LENS });
  },
  // A chorus: flying low and banking one way and the other, the ground swinging under it.
  sweep(h, { i, way, P }, s) {
    const side = way * (i % 2 ? -1 : 1), bank = side * Math.min(0.62, 0.42 * P);
    s.dir = bank; s.head = s.dir; s.spin -= side * 0.95 * P;
    h({ alt: 0.2 + (i % 2 ? 0.14 : -0.04) * P, tip: Math.min(0.9, 0.74 * P), speed: 0.72 * P, lens: i % 4 === 3 ? 1.5 : 1.9 });
  },
  // Falling while turning: a corkscrew in over two phrases, and out over one.
  corkscrew(h, { i, way, P }, s) {
    s.spin += way * 2.3 * P; s.dir += way * 1.4; s.head += way * 0.9;
    h({ alt: [0.48, 0.92, -0.2][i % 3] * P, tip: [0.2, 0.38, 0.1][i % 3], speed: 0.3 * P, lens: LENS });
  },
  // A see-saw: the sheet rocks through flat, crossing it at speed on each knot, leaning furthest in between.
  rock(h, { i, way, P, t0, t1 }, s) {
    const lean = way * (i % 2 ? -1 : 1) * Math.min(0.86, 0.7 * P);
    s.spin += way * 0.3 * P; s.head += way * 0.5;
    h({ at: (t0 + t1) / 2, tip: lean, alt: 0.16 * P, speed: 0.26 * P, lens: 2 });
    h({ tip: 0, alt: 0.04, speed: 0.26 * P, lens: 2 });
  },
  // A plate wobbling on a table: the lean itself goes round, and the sheet doesn't turn.
  plate(h, { way, P }, s) {
    s.dir += way * TAU * Math.min(0.75, 0.52 * P); s.head = s.dir; s.spin -= way * 0.12;
    h({ alt: 0.14 * P, tip: Math.min(0.88, 0.72 * P), speed: 0.16 * P, lens: 2.1 });
  },
  // The dolly zoom: the lens goes wide as the sheet tips, and the middle of the frame stays exactly where and what it was. Everything round it stretches away.
  dolly(h, { i, way, P }, s) {
    s.dir += way * 0.45; s.head = s.dir; s.spin += way * 0.2 * P;
    h(i % 2 ? { tip: 0.28, lens: 5.2, alt: 0.1, speed: 0.2 * P } : { tip: Math.min(0.92, 0.82 * P), lens: 0.95, alt: 0.2 * P, speed: 0.36 * P });
  },
  // The crane: up and flat to see the whole of it, then back down and in low.
  swoop(h, { i, way, P }, s) {
    s.spin += way * 0.7 * P; s.dir = way * (i % 2 ? 0.3 : -0.3); s.head = s.dir;
    h(i % 2 ? { alt: 0.44 * P, tip: Math.min(0.85, 0.72 * P), speed: 0.66 * P, lens: 1.8 } : { alt: -0.42 * P, tip: 0.04, speed: 0.2 * P, lens: LENS });
  },
};
const POOL = { quiet: ['drift', 'plate', 'survey'], mid: ['wander', 'dolly', 'rock', 'survey', 'plate'], loud: ['sweep', 'corkscrew', 'swoop', 'rock', 'dolly'] };

// A track from knots [t, x]: nothing stops at a knot unless the two sides disagree, and nothing overshoots between them.
function trackOf(keys) {
  const out = [], n = keys.length, slope = i => (keys[i + 1][1] - keys[i][1]) / Math.max(keys[i + 1][0] - keys[i][0], 1e-3);
  for (let i = 0; i < n; i++) {
    let v = 0;
    if (i > 0 && i < n - 1) { const a = slope(i - 1), b = slope(i); v = a * b > 0 ? 2 * a * b / (a + b) : 0; }
    out.push({ t: keys[i][0], x: keys[i][1], v });
  }
  return out;
}
const smooth3 = (a, r) => {
  const out = Float32Array.from(a), k = Math.exp(-1 / Math.max(r, 1e-3));
  for (let pass = 0; pass < 2; pass++) { for (let i = 1; i < out.length; i++) out[i] = k * out[i - 1] + (1 - k) * out[i]; for (let i = out.length - 2; i >= 0; i--) out[i] = k * out[i + 1] + (1 - k) * out[i]; }
  return out;
};
// Fastest through the hit: as hear.js's push. Gathers over atk, spends what it had over aft.
const through = (x, atk, aft) => { const f = (2 / aft) / (3 / atk + 2 / aft); return x < 0 ? f * Math.pow(clamp((x + atk) / atk), 3) : f + (1 - f) * (1 - Math.pow(1 - clamp(x / aft), 2)); };

// ---------------------------------------------------------------- the whole song's tracks
const TRACKS = ['alt', 'spin', 'tip', 'dir', 'lens', 'speed', 'head', 'kick'];
function buildHands(film, A, M, H, seed) {
  const time = film.time ?? (t => t), dur = A.duration, n = Math.ceil((dur + 12) * HZ) + 2;
  const bar = M.bar || 2, random = rng((seed ^ 0x5eed) >>> 0 || 1);
  const moments = H.moments ?? [], segs = A.segments?.length ? A.segments : [{ t0: 0, t1: dur, label: 'A' }];
  const eAt = t => H.e[clamp(Math.round(t * H.hz), 0, H.n - 1)] ?? 0;
  // How big a section is: its kind's loudness against the song's other kinds, and how many times it's been.
  const kinds = new Map();
  for (const s of segs) { const k = kinds.get(s.label) ?? { e: 0, c: 0, lang: null, way: random() < 0.5 ? 1 : -1 }; for (let t = s.t0; t < s.t1; t += 0.5) { k.e += eAt(t); k.c++; } kinds.set(s.label, k); }
  const order = [...kinds.keys()].sort((a, b) => kinds.get(a).e / Math.max(kinds.get(a).c, 1) - kinds.get(b).e / Math.max(kinds.get(b).c, 1));
  const rank = l => (order.length > 1 ? order.indexOf(l) / (order.length - 1) : 0.5);
  // Each kind of section gets its own language, from the pool its size allows. A song uses as many as it has kinds of section.
  const used = new Set();
  for (const l of order) {
    const r = rank(l), mean = kinds.get(l).e / Math.max(kinds.get(l).c, 1), pool = POOL[r < 0.3 && mean < 0.55 ? 'quiet' : r > 0.62 || mean > 0.72 ? 'loud' : 'mid'];
    const open = pool.filter(x => !used.has(x)), lang = random.pick(open.length ? open : pool);
    used.add(lang); kinds.get(l).lang = lang;
  }
  const phrase = bar * 4 >= 5.5 ? 4 : 8;
  // A knot goes on the strong moment nearest its bar line, if there's one close: a move arrives on something.
  const strong = moments.filter(m => (m.size ?? m.s) > 0.28);
  const toHit = t => { let b = null, d = 0.8 * bar; for (const m of strong) { const q = Math.abs(m.t - t); if (q < d) { d = q; b = m.t; } } return b ?? t; };
  const keys = {}; for (const k of TRACKS) keys[k] = [[0, k === 'lens' ? LENS : 0]];
  const s = { spin: 0, dir: 0, head: 0 }, knots = [], seen = new Map(), plan = [];
  segs.forEach((seg, si) => {
    const kind = kinds.get(seg.label), visit = seen.get(seg.label) ?? 0;
    seen.set(seg.label, visit + 1);
    const way = kind.way * (visit % 2 ? -1 : 1), P = Math.min(1.8, lerp(0.8, 1.2, rank(seg.label)) * (1 + 0.2 * visit));
    const span = seg.t1 - seg.t0, count = Math.max(1, Math.round(span / (phrase * bar)));
    plan.push({ t0: +seg.t0.toFixed(1), label: seg.label, lang: kind.lang, way, P: +P.toFixed(2), phrases: count });
    let t = seg.t0;
    for (let i = 0; i < count; i++) {
      const raw = seg.t0 + span * (i + 1) / count, t1 = i === count - 1 && si < segs.length - 1 ? segs[si + 1].t0 : toHit(raw);
      const put = o => { const at = time(o.at ?? t1); for (const k of ['alt', 'tip', 'speed', 'lens']) if (o[k] != null && at > keys[k].at(-1)[0] + 0.05) keys[k].push([at, o[k]]); for (const k of ['spin', 'dir', 'head']) if (at > keys[k].at(-1)[0] + 0.05) keys[k].push([at, s[k]]); knots.push(at); };
      LANG[kind.lang](put, { i: i + visit, way, P, t0: t, t1, visit }, s);
      t = t1;
    }
  });
  const K = {}; for (const k of TRACKS) K[k] = trackOf(keys[k]);
  const T = {}; for (const k of TRACKS) { T[k] = new Float32Array(n); for (let i = 0; i < n; i++) T[k][i] = evalTrack(K[k], i / HZ); }
  const loud = i => clamp(H.e[clamp(Math.round(i / HZ * H.hz), 0, H.n - 1)] ?? 0.5);

  // ---- the song on top. All on the picture's clock, read at the song's own second it's standing at
  const add = (arr, t, atk, aft, dec, k) => {
    const i0 = Math.max(0, Math.floor((t - atk) * HZ)), i1 = Math.min(n - 1, Math.ceil((t + aft + dec) * HZ));
    for (let i = i0; i <= i1; i++) { const x = i / HZ - t; arr[i] += k * (x <= aft ? through(x, atk, aft) : 1 - smoother((x - aft) / dec)); }
  };
  const step = (arr, t, atk, aft, k) => {
    const i0 = Math.max(0, Math.floor((t - atk) * HZ)), i1 = Math.min(n - 1, Math.ceil((t + aft) * HZ));
    for (let i = i0; i <= i1; i++) arr[i] += k * through(i / HZ - t, atk, aft);
    for (let i = i1 + 1; i < n; i++) arr[i] += k;
  };
  const crane = new Float32Array(n), pushed = new Float32Array(n), wound = new Float32Array(n);
  // A build: pushing in and flattening, with a turn winding up, and the hit lets it go.
  for (let i = 0; i < n; i++) { const w = H.wind[clamp(Math.round(i / HZ * H.hz), 0, H.n - 1)] ?? 0; pushed[i] = w; wound[i] = w; }
  let side = 1;
  for (const m of moments) {
    const size = m.size ?? m.s, at = time(m.t);
    if (m.sign < 0) { if (size > 0.2) add(crane, at, 0.5, 0.35, Math.max(3 * bar, 3), Math.min(size * 1.2, 1.2)); continue; }
    // A big hit gets a whip, fastest on it, and it doesn't come back. A section edge alone doesn't: only what you'd jump at.
    if (size > 0.5 && m.kind !== 'section' && m.kind !== 'chord' && m.kind !== 'fill') {
      side = -side;
      const a = clamp((size - 0.35) / 0.7, 0.25, 1.2), atk = clamp(1.2 * (M.beat || 0.5), 0.35, 0.7), aft = 0.6;
      step(T.spin, at, atk, aft, side * SIZE.whipTurn * a);
      step(T.kick, at, atk, aft, SIZE.whipSlide * a);
    }
  }
  const pullApart = smooth3(crane, HZ * 0.05);
  const ending = i => { const end = time(dur), t = i / HZ; return (1 - smoother((t - (end - 5)) / 5)); };
  const starting = i => smoother(i / HZ / 6);
  for (let i = 0; i < n; i++) {
    const c = clamp(pullApart[i], 0, 1.2), w = pushed[i], kEnd = ending(i), kStart = starting(i), e = loud(i);
    T.alt[i] = (T.alt[i] + SIZE.pushIn * w - SIZE.fallBack * c) * kEnd * kStart;
    T.tip[i] = T.tip[i] * (1 - 0.65 * w) * (1 - 0.75 * Math.min(c, 1)) * kEnd * kStart;
    T.lens[i] = LENS + (T.lens[i] - LENS) * kEnd;
    T.speed[i] = T.speed[i] * lerp(0.65, 1.25, e) * kEnd * kStart;
    T.spin[i] += SIZE.windTurn * side * w;
  }
  return { T, n, knots: [...new Set(knots)].sort((a, b) => a - b), plan, dur: time(dur), moments };
}

// The tables are read smoothly: Catmull-Rom, so a table's steps aren't a jolt at 60 frames a second.
const rd = (a, n, x) => {
  const f = clamp(x, 0, n - 1.001), i = Math.floor(f), u = f - i, p0 = a[Math.max(i - 1, 0)], p1 = a[i], p2 = a[i + 1], p3 = a[Math.min(i + 2, n - 1)];
  return p1 + 0.5 * u * (p2 - p0 + u * (2 * p0 - 5 * p1 + 4 * p2 - p3 + u * (3 * (p1 - p2) + p3 - p0)));
};

// ---------------------------------------------------------------- what the tracks mean on this pattern
const BEFORE = 8, AFTER = 8;     // a gesture's camera is read this far either side of its own time: the next pattern's clock eases in from before it starts
// The softest of limits: nearly straight between lo and hi, and it can't go past them. Smooth at any speed, so nothing's seen to hit anything.
const plus = (x, w) => w * Math.log1p(Math.exp(Math.min(x / w, 30)));
const between = (x, lo, hi, w = 0.22) => { if (hi < lo) { const m = (lo + hi) / 2; lo = hi = m; } return lo + plus(x - lo, w) - plus(x - hi, w); };

function buildRoute(cam, G, prev) {
  const { T, n } = cam, B = G.camBear ??= bearingOf(G);
  const t0 = G.t0, tEnd = Math.min(G.t1, cam.dur + 6), N = Math.max(2, Math.ceil((tEnd - t0 + BEFORE + AFTER) * HZ)), from = t0 - BEFORE;
  const x = new Float32Array(N), y = new Float32Array(N), z = new Float32Array(N), slot = new Float32Array(SLOT_FLOATS);
  // The pattern's own view over its time, a few times a second
  const STEP = 6, M_ = Math.ceil(N / STEP) + 2, baseS = new Float32Array(M_), baseR = new Float32Array(M_), baseK = new Float32Array(M_);
  const self = B.self, marks = B.marks;
  const seenLines = new Array(M_);
  for (let j = 0; j < M_; j++) {
    const tt = from + j * STEP / HZ;
    fillSlot(slot, G, tt, G.pattern, { phi: 0, noCam: true });
    baseS[j] = slot[OFF.scale]; baseR[j] = slot[OFF.rot]; baseK[j] = fineness(slot);
    seenLines[j] = marks.length ? slot.slice() : null;
  }
  const base = (a, i) => { const f = i / STEP, k = Math.floor(f); return lerp(a[Math.min(k, M_ - 1)], a[Math.min(k + 1, M_ - 1)], f - k); };
  const tipAt = i => rd(T.tip, n, (from + i / HZ) * HZ) * B.tip, dirAt = i => rd(T.dir, n, (from + i / HZ) * HZ), lensAt = i => rd(T.lens, n, (from + i / HZ) * HZ);
  const altAt = i => rd(T.alt, n, (from + i / HZ) * HZ) * B.zoom;

  // Where it looks. A plain sheet goes wherever the tracks say, and picks up from where the last one was.
  let px = 0, py = 0;
  const free = B.free && B.pan > 0;
  if (free && prev?.route && prev.route.free && prev.camBear.pan > 0) { const r = prev.route, stop = Math.min((prev.morph || 0) * 0.4, 3.5); px = r.at(r.x, prev.t1 - (prev.morph || 0) + stop / 2); py = r.at(r.y, prev.t1 - (prev.morph || 0) + stop / 2); }
  const ix0 = Math.round(BEFORE * HZ);
  if (free) {
    let lastKick = rd(T.kick, n, t0 * HZ);
    for (let i = 0; i < N; i++) {
      if (i >= ix0) {
        const tt = from + i / HZ, up = smoother((tt - t0) / 2);
        const sp = rd(T.speed, n, tt * HZ) * B.pan * up, kick = rd(T.kick, n, tt * HZ), head = rd(T.head, n, tt * HZ) * 1;
        const d = sp / HZ + (kick - lastKick) * B.pan * up; lastKick = kick;
        const rot = base(baseR, i) + rd(T.spin, n, tt * HZ) * B.spin, sc = base(baseS, i) * Math.exp(altAt(i));
        // u = R(-head)(0,1), on the screen. Into the pattern: R(-rot) u / scale.
        const ux = Math.sin(head), uy = Math.cos(head), c = Math.cos(rot), s = Math.sin(rot);
        px += (c * ux + s * uy) * d / sc; py += (-s * ux + c * uy) * d / sc;
      }
      x[i] = px; y[i] = py;
    }
  } else if (B.pan > 0 && marks.length) {
    // A tour of its landmarks, arriving on the knots. Out from one by as far as the song's going, round it, and home to the next. It starts from where the pattern is.
    const sc0 = base(baseS, ix0), own = [slot[OFF.tx], slot[OFF.ty]];
    fillSlot(slot, G, t0, G.pattern, { phi: 0, noCam: true }); const start = [slot[OFF.tx], slot[OFF.ty]];
    const ks = cam.knots.filter(t => t > t0 + 1.5 && t < tEnd - 0.5);
    if (!ks.length || tEnd - ks.at(-1) > 9) ks.push(Math.max(t0 + 1.5, tEnd - 0.5));
    const wx = [0], wy = [0], wt = [t0];
    let ang = G.t0 * 1.7, m = 0;
    ks.forEach((t, j) => {
      const sp = rd(T.speed, n, t * HZ), reach = clamp(0.5 + 2.2 * sp, 0.3, SIZE.leash) * B.pan / (base(baseS, Math.min(N - 1, Math.round((t - from) * HZ))) * Math.exp(altAt(Math.min(N - 1, Math.round((t - from) * HZ)))));
      const home = j % 3 === 2;      // every third knot it arrives on the landmark itself
      ang += 2.05 * (rd(T.spin, n, t * HZ) >= 0 ? 1 : -1);
      if (home) m = (m + 1) % marks.length;
      const mk = marks[m], tx = home ? mk[0] : mk[0] + reach * Math.cos(ang), ty = home ? mk[1] : mk[1] + reach * Math.sin(ang);
      wx.push(tx - start[0]); wy.push(ty - start[1]); wt.push(t);
    });
    const velo = (w, j) => (j > 0 && j < wt.length - 1 ? (w[j + 1] - w[j - 1]) / (wt[j + 1] - wt[j - 1]) : 0);
    const kx = wt.map((t, j) => ({ t, x: wx[j], v: velo(wx, j) })), ky = wt.map((t, j) => ({ t, x: wy[j], v: velo(wy, j) }));
    for (let i = 0; i < N; i++) { const tt = from + i / HZ; x[i] = evalTrack(kx, tt); y[i] = evalTrack(ky, tt); }
  }
  // How close: as near as the tracks say, held between sizes the lines can be, at the place it's looking.
  let fallen = 0, spd = 0;
  for (let i = 0; i < N; i++) {
    const tt = from + i / HZ, alt = altAt(i), sc = base(baseS, i);
    const tip = tipAt(i), far = Math.abs(tip) > 0.01 ? farOf(tip, dirAt(i), lensAt(i)) : 1;
    if (self) {
      // The same at every size, so it can go on falling for as long as it's on, at the speed the song's going. It goes in on a plain track and comes to rest with it.
      if (i >= ix0) { spd += ((0.35 + 1.4 * rd(T.speed, n, tt * HZ)) * SIZE.selfFall * B.zoom - spd) * 0.012; fallen += spd / HZ; }
      z[i] = alt + fallen;
      continue;
    }
    let k = base(baseK, i);
    if (marks.length) {
      // Read at the frame: at four places round the middle, and go by the second biggest, since one of them can be right on a pole.
      const S = seenLines[Math.min(Math.floor(i / STEP), M_ - 1)], cx = S[OFF.tx] + x[i], cy = S[OFF.ty] + y[i], r = 0.75 / (sc * Math.exp(alt));
      const v = [linesAt(S, cx + r, cy), linesAt(S, cx - r, cy), linesAt(S, cx, cy + r), linesAt(S, cx, cy - r)].sort((a, b) => b - a);
      k = v[1] / sc;
    }
    const lo = Math.log(Math.max(k, 1e-3) / SIZE.bold), hi = Math.log(Math.max(k, 1e-3) / SIZE.big), loFar = Math.log(Math.max(k * far, 1e-3) / SIZE.boldFar);
    // Lines finer than it likes to begin with stay as they were rather than be blown up: it's what that pattern is.
    z[i] = between(alt, Math.max(lo, loFar), Math.max(hi, Math.max(lo, loFar) + 0.3));
  }
  const smoothZ = smooth3(z, HZ * 0.18);
  const at = (a, t) => rd(a, N, (t - from) * HZ);
  return { x, y, z: self ? z : smoothZ, N, from, t0: G.t0, t1: G.t1, free, at };
}

// ---------------------------------------------------------------- reading it, a frame at a time
const noRoute = { };
function makeWrite(cam) {
  const T = cam.T, n = cam.n;
  // Told to stay, a gesture stays where its camera had got to, and it runs out over the moment the long move does.
  const clockOf = (G, t) => { const e = G.freezeEase; if (G.freezeU == null || !e) return t; const q = Math.min(t - e.t0, e.tau); return e.t0 + q - q * q / (2 * e.tau); };
  const scratch = {};
  return function camWrite(out, tIn, G) {
    const r = cam.routeFor(G);
    if (!r) return;
    const B = G.camBear, t = clockOf(G, tIn), locks = G.camLocks ??= locksOf(G);
    const p = t * HZ, z = r.at(r.z, t), spin = rd(T.spin, n, p), tip = rd(T.tip, n, p) * B.tip * (G.camCalm ?? 1), dir = rd(T.dir, n, p), lens = rd(T.lens, n, p);
    if (!locks.scale) out[OFF.scale] *= Math.exp(z);
    if (!locks.tx) { out[OFF.tx] += r.at(r.x, t); out[OFF.ty] += r.at(r.y, t); }
    if (B.room) { if (!locks.roll) out[OFF['cam.roll']] += spin * B.spin; }
    else if (!locks.rot) out[OFF.rot] += spin * B.spin;
    if (locks.tip || !B.tip) return;
    if (B.floor || B.room || B.lensy) {
      // It has a tip of its own. This leans it about that, as far as there's room, and goes round with dir.
      const d = out[OFF['cam.dist']] || LENS, room = Math.atan(d / reachOf(out[OFF['cam.roll']])) - Math.abs(out[OFF['cam.pitch']]);
      if (room > 0) out[OFF['cam.pitch']] += tip * room * Math.cos(dir);
      if (!B.room) out[OFF['cam.yaw']] += 0.5 * tip * Math.sin(dir);
      return;
    }
    writeTip(out, tip, dir, lens);
  };
}
// What a shot in a cut draws by hand. Its one-knot fit of a size isn't drawing, only something like a lane is.
function locksOf(G) {
  const L = { scale: false, rot: false, tx: false, tip: false, roll: false };
  if (!G.fixedRange) return L;
  for (const m of G.moves ?? []) for (const l of m.lanes ?? []) {
    if (l.track?.length < 2) continue;
    if (l.off === OFF.scale) L.scale = true; if (l.off === OFF.rot) L.rot = true;
    if (l.off === OFF.tx || l.off === OFF.ty) L.tx = true;
    if (l.off === OFF['cam.pitch'] || l.off === OFF['cam.dist']) L.tip = true;
    if (l.off === OFF['cam.roll'] || l.off === OFF['cam.yaw']) L.roll = true;
  }
  return L;
}

// compose() calls this once a film is made. A world can refuse with world.camera === false.
export function wearCamera(film, A, M, seed = 7) {
  const H = film.hear;
  if (!H || !A?.duration) return null;
  const hands = buildHands(film, A, M, H, seed);
  const cam = { ...hands, routes: new Map(), film };
  cam.write = makeWrite(cam);
  cam.routeFor = G => {
    let r = G.route;
    if (r && r.t0 === G.t0 && r.t1 === G.t1) return r;
    const list = film.gestures, i = list.indexOf(G);
    r = buildRoute(cam, G, i > 0 ? list[i - 1] : null);
    G.route = r;
    return r;
  };
  for (const G of film.gestures) {
    G.cam = cam.write;
    if (G.t0 < cam.dur + 6) cam.routeFor(G);
  }
  film.camera = cam;
  return cam;
}
// A gesture made after the film was (a pick from the library) wears it too.
export const wearOne = (score, G) => { if (G && !G.cam && score.camera && !G.hold) G.cam = score.camera.write; };
