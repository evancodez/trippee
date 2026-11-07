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
  big: 1.4,                 // ...and the biggest, so nothing's one flat shape, and a few big shapes going by can't swing the whole frame's brightness
  whipTurn: 0.75, whipSlide: 1.5, whipTip: 0.42,    // a full moment's whip: radians, frame units, and how far it lurches
  pushIn: 0.75, windTurn: 0.5,       // the top of a build
  fallBack: 0.85,                    // a falling moment's crane
  linesBy: 3.5,             // lines a second a plain sheet can send past a place
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
  const s = lim, n = k => s[OFF[k]], H = Math.min(G.t1 - G.t0, 60);
  const B = { pan: 1, tip: 1, spin: 1, zoom: 1, free: true, self: false, marks: [], floor: false, lensy: false, room: false, layers: false, rings: false, arm: null, twin: -1, spareFam: -1 };
  // The lines: which families are open, and what they run about. A Relay's change as it goes, so it's looked at a few times.
  let plane = false, logs = 0, rings = 0, pole2 = false, planes = 0, armOf = 0, spare = 15, twinOf = 0;
  for (const u of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    fillSlot(s, G, G.t0 + H * u, G.pattern, { phi: 0, noCam: true });
    let here = 0;
    for (let i = 0; i < FAMILIES; i++) {
      if (n(`f${i}.on`) >= 0.5) spare &= ~(1 << i);
      if (n(`f${i}.on`) < 0.5 || Math.abs(n(`f${i}.d`)) > 0.97) continue;
      const g = k => Math.abs(n(`f${i}.${k}`));
      if (g('x') + g('y') > 1e-4) { plane = true; here++; if (Math.hypot(g('x'), g('y')) > twinOf && g('r1') + g('l1') + g('t1') + g('r2') + g('l2') + g('t2') < 1e-4) { twinOf = Math.hypot(g('x'), g('y')); B.twin = i; } }
      if (g('r1') > 1e-4) rings++;
      if (g('r2') > 1e-4) { rings++; pole2 = true; }
      if (g('l1') + g('t1') > 1e-4) logs++;
      if (g('l2') + g('t2') > 1e-4) { logs++; pole2 = true; }
      // The arm to ride: the strongest family that's about one pole
      const size = Math.hypot(n(`f${i}.l1`), n(`f${i}.t1`) / TAU);
      if (size > armOf) { armOf = size; B.arm = { l: n(`f${i}.l1`), t: n(`f${i}.t1`) }; }
    }
    planes = Math.max(planes, here);
  }
  const kind = n('surf.kind'), map = n('surf.map');
  for (let i = FAMILIES - 1; i >= 0; i--) if (spare & (1 << i)) B.spareFam = i;
  if (B.twin < 0 || n('round') > 0.01 || n('sum') > 0.01) B.spareFam = -1;
  if (rings + logs > 0) { B.free = false; B.marks.push([n('p1.x'), n('p1.y')]); if (pole2) B.marks.push([n('p2.x'), n('p2.y')]); }
  B.rings = rings > 0 && !plane;
  B.layers = !rings && !logs && planes >= 3 && kind < 0.5;
  // Warps with somewhere they are: past them there's only a plain sheet, which isn't why anyone's looking at this one.
  const at = (w, x, y) => { if (Math.abs(n(w)) > 1e-4) { B.free = false; B.marks.push([x, y]); } };
  at('swirl.a', n('swirl.cx'), 0); at('swirl.log', n('swirl.cx'), 0); at('bulge.a', n('bulge.cx'), n('bulge.cy')); at('ripple.a', n('ripple.cx'), 0);
  if (n('lens.c') !== 1 && Math.abs(n('lens.c')) > 1e-4) { B.free = false; B.marks.push([n('lens.cx'), n('lens.cy')]); }
  if (n('fold.n') >= 2) { B.free = false; B.marks.push([n('fold.cx'), n('fold.cy')]); }
  at('squeeze.a', n('squeeze.x0'), 0); at('bowtie.a', n('bowtie.x0'), 0);
  if (Math.abs(n('conf.amt')) > 1e-4) { B.free = false; B.marks.push([n('conf.x1'), n('conf.y1')], [n('conf.x2'), n('conf.y2')]); }
  if (n('ribbon.on') > 0.5 || n('blobs.on') > 0.5) { B.free = false; B.marks.push([0, 0]); }
  // A field draws something of its own about the middle (a blaze, a world's motif): you want to see it, so the camera stays where it can, and doesn't go in so far that it's gone.
  if (n('field.kind') > 0.5) { B.free = false; B.layers = false; if (!B.marks.length) B.marks.push([0, 0]); B.pan = Math.min(B.pan, 0.6); B.zoom = Math.min(B.zoom, 0.6); }
  const droste = Math.abs(n('droste.lnS')) > 1e-4;
  if (droste) { B.free = false; B.pan = 0; B.marks = [[0, 0]]; }
  // The same at every size: only log rings and spokes, about one point, and nothing that minds.
  const heroic = (G.moves ?? []).some(m => m.id === 'slip' || m.id === 'star' || m.id === 'coin') || !!G.hero;
  B.self = !heroic && (droste || (logs > 0 && !plane && !rings && !pole2 && Math.abs(n('swirl.a')) < 1e-4 && Math.abs(n('bulge.a')) < 1e-4 && n('fold.n') < 2 && n('field.kind') < 0.5 && kind < 0.5));
  if (B.self) B.marks = B.marks.slice(0, 1);
  if (heroic) { B.rings = false; B.spareFam = -1; }
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
  // A shot in a cut that draws its own size: nothing can draw back to keep the lines in hand, so it doesn't go far from what it was framed on.
  if (!B.free && locksOf(G).scale) B.pan = Math.min(B.pan, 0.3);
  return B;
}
// How much finer than its families' numbers a warp draws the lines: a zigzag or a bend steepens them, and those are what goes to wallpaper first.
const warpedBy = s => { const n = k => Math.abs(s[OFF[k]]); return (1 + 2.5 * n('zig.a') * n('zig.c')) * (1 + 0.8 * n('teeth.a')) * (1 + 0.5 * n('bend1.a') * n('bend1.f') + 0.5 * n('bend2.a') * n('bend2.f')); };
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
export const LANG = {
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
    h({ alt: [0.34, -0.06, 0.48, 0.02][i % 4] * P, tip: [0.86, 0.5, 0.9, 0.62][i % 4] * Math.min(P, 1.05), speed: [0.72, 0.5, 0.82, 0.6][i % 4] * P, lens: [1.9, 2.6, 1.4, 2.2][i % 4] });
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
// Two sheets, one under the other: a second lot of lines a little finer than the first opens up beneath it, and where they go in and out of step the lines swell and thin in great slow bands. They're what moves: a tiny move of the camera sends them right across the frame.
LANG.veil = (h, { i, way, P }, s) => {
  s.spin += way * 0.3 * P; s.head += way * (i % 2 ? 0.9 : -0.5); s.dir += way * 0.5;
  h({ veil: 1, alt: 0.12 * P, tip: i % 2 ? 0.34 : 0.12, speed: 0.34 * P, lens: LENS });
};
const POOL = { quiet: ['drift', 'plate', 'veil', 'survey'], mid: ['wander', 'veil', 'dolly', 'rock', 'survey', 'plate'], loud: ['sweep', 'corkscrew', 'swoop', 'rock', 'dolly'] };

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
const TRACKS = ['alt', 'spin', 'tip', 'dir', 'lens', 'speed', 'head', 'kick', 'veil'];
function buildHands(film, A, M, H, seed, only = null) {
  const time = film.time ?? (t => t), dur = A.duration, n = Math.ceil((dur + 12) * HZ) + 2;
  const bar = M.bar || 2, random = rng((seed ^ 0x5eed) >>> 0 || 1);
  const moments = H.moments ?? [], segs = A.segments?.length ? A.segments : [{ t0: 0, t1: dur, label: 'A' }];
  const eAt = t => H.e[clamp(Math.round(t * H.hz), 0, H.n - 1)] ?? 0;
  // How big a section is: its kind's loudness against the song's other kinds, and how many times it's been.
  const kinds = new Map();
  for (const s of segs) { const k = kinds.get(s.label) ?? { e: 0, c: 0, lang: null, way: random() < 0.5 ? 1 : -1 }; for (let t = s.t0; t < s.t1; t += 0.5) { k.e += eAt(t); k.c++; } kinds.set(s.label, k); }
  const order = [...kinds.keys()].sort((a, b) => kinds.get(a).e / Math.max(kinds.get(a).c, 1) - kinds.get(b).e / Math.max(kinds.get(b).c, 1));
  const rank = l => (order.length > 1 ? order.indexOf(l) / (order.length - 1) : 0.5);
  // Each kind of section gets its own routine of languages, from the pool its size allows: mostly one, and then a turn at another, so that a long section isn't one thing for minutes. A song uses as many as it has kinds of section.
  const used = new Set();
  for (const l of order) {
    const r = rank(l), mean = kinds.get(l).e / Math.max(kinds.get(l).c, 1), pool = (film.world?.camera?.pool ?? POOL)[r < 0.3 && mean < 0.55 ? 'quiet' : r > 0.62 || mean > 0.72 ? 'loud' : 'mid'];
    const pick = () => { const open = pool.filter(x => !used.has(x)), lang = random.pick(open.length ? open : pool); used.add(lang); return lang; };
    const a = only ?? pick();
    let b = only ?? pick(), c = only ?? pick();
    if (b === a) b = pool[(pool.indexOf(a) + 1) % pool.length];
    if (c === a || c === b) c = pool[(pool.indexOf(b) + 1) % pool.length];
    kinds.get(l).lang = only ? [a] : [a, a, a, b, b, a, a, c, c, c];
  }
  const phrase = bar * 4 >= 5.5 ? 4 : 8;
  // A knot goes on the strong moment nearest its bar line, if there's one close: a move arrives on something.
  const strong = moments.filter(m => (m.size ?? m.s) > 0.28);
  const toHit = t => { let b = null, d = 0.8 * bar; for (const m of strong) { const q = Math.abs(m.t - t); if (q < d) { d = q; b = m.t; } } return b ?? t; };
  const keys = {}; for (const k of TRACKS) keys[k] = [[0, k === 'lens' ? LENS : 0]];
  const s = { spin: 0, dir: 0, head: 0 }, knots = [], seen = new Map(), plan = [], spans = [];
  segs.forEach((seg, si) => {
    const kind = kinds.get(seg.label), visit = seen.get(seg.label) ?? 0;
    seen.set(seg.label, visit + 1);
    const way = kind.way * (visit % 2 ? -1 : 1), P = Math.min(1.8, lerp(0.8, 1.2, rank(seg.label)) * (1 + 0.2 * visit));
    const span = seg.t1 - seg.t0, count = Math.max(1, Math.round(span / (phrase * bar)));
    plan.push({ t0: +seg.t0.toFixed(1), label: seg.label, lang: [...new Set(kind.lang.slice(0, Math.max(count, 1)))].join('+'), way, P: +P.toFixed(2), phrases: count });
    let t = seg.t0;
    for (let i = 0; i < count; i++) {
      const raw = seg.t0 + span * (i + 1) / count, t1 = i === count - 1 && si < segs.length - 1 ? segs[si + 1].t0 : toHit(raw);
      const put = o => { const at = time(o.at ?? t1); for (const k of ['alt', 'tip', 'speed', 'lens', 'veil']) if ((o[k] != null || k === 'veil') && at > keys[k].at(-1)[0] + 0.05) keys[k].push([at, o[k] ?? 0]); for (const k of ['spin', 'dir', 'head']) if (at > keys[k].at(-1)[0] + 0.05) keys[k].push([at, s[k]]); knots.push(at); };
      const lang = kind.lang[i % kind.lang.length];
      spans.push({ t0: time(t), lang, way });
      LANG[lang](put, { i: i + visit, way, P, t0: t, t1, visit }, s);
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
  const crane = new Float32Array(n), pushed = new Float32Array(n), lurch = new Float32Array(n);
  // A build: pushing in and flattening, with a turn winding up, and the hit lets it go.
  for (let i = 0; i < n; i++) pushed[i] = H.wind[clamp(Math.round(i / HZ * H.hz), 0, H.n - 1)] ?? 0;
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
      add(lurch, at, atk, aft, Math.max(2 * bar, 2.2), a * side);       // ...and the whole sheet lurches as it goes, and settles
    }
  }
  const pullApart = smooth3(crane, HZ * 0.05);
  const ending = i => { const end = time(dur), t = i / HZ; return (1 - smoother((t - (end - 5)) / 5)); };
  const starting = i => smoother(i / HZ / 6);
  for (let i = 0; i < n; i++) {
    const c = clamp(pullApart[i], 0, 1.2), w = pushed[i], kEnd = ending(i), kStart = starting(i), e = loud(i);
    T.alt[i] = (T.alt[i] + SIZE.pushIn * w - SIZE.fallBack * c) * kEnd * kStart;
    T.tip[i] = clamp(T.tip[i] * (1 - 0.65 * w) * (1 - 0.75 * Math.min(c, 1)) + SIZE.whipTip * lurch[i], -0.92, 0.92) * kEnd * kStart;
    T.lens[i] = LENS + (T.lens[i] - LENS) * kEnd;
    T.speed[i] = T.speed[i] * lerp(0.65, 1.25, e) * kEnd * kStart;
    T.spin[i] += SIZE.windTurn * side * w;
  }
  const at = t => { let k = 0; for (let i = 0; i < spans.length; i++) if (spans[i].t0 <= t) k = i; return spans[k]; };
  return { T, n, knots: [...new Set(knots)].sort((a, b) => a - b), plan, dur: time(dur), moments, langAt: t => at(t).lang, wayAt: t => at(t).way };
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
  const t0 = G.t0, tEnd = Math.min(G.t1, cam.dur + 6), N = Math.max(2, Math.ceil((tEnd - t0 + BEFORE + AFTER) * HZ)), from = t0 - BEFORE, ix0 = Math.round(BEFORE * HZ);
  const x = new Float32Array(N), y = new Float32Array(N), z = new Float32Array(N), spin = new Float32Array(N), slot = new Float32Array(SLOT_FLOATS);
  // The pattern's own view over its time, a few times a second
  const STEP = 6, M_ = Math.ceil(N / STEP) + 2, baseS = new Float32Array(M_), baseR = new Float32Array(M_), baseK = new Float32Array(M_), baseX = new Float32Array(M_), baseY = new Float32Array(M_);
  const marks = B.marks, seenLines = new Array(M_);
  for (let j = 0; j < M_; j++) {
    fillSlot(slot, G, from + j * STEP / HZ, G.pattern, { phi: 0, noCam: true });
    baseS[j] = slot[OFF.scale]; baseR[j] = slot[OFF.rot]; baseK[j] = fineness(slot) * warpedBy(slot); baseX[j] = slot[OFF.tx]; baseY[j] = slot[OFF.ty];
    seenLines[j] = marks.length ? slot.slice() : null;
  }
  const base = (a, i) => { const f = i / STEP, k = Math.floor(f); return lerp(a[Math.min(k, M_ - 1)], a[Math.min(k + 1, M_ - 1)], f - k); };
  const q = (a, i) => rd(a, n, from * HZ + i);
  for (let i = 0; i < N; i++) spin[i] = q(T.spin, i) * B.spin;

  // How much this stretch of the song flies: a chorus's languages. A sheet about a point takes it as a circuit or as riding an arm.
  const flying = new Float32Array(N);
  for (let i = 0; i < N; i++) { const L = cam.langAt(from + i / HZ); flying[i] = L === 'sweep' || L === 'swoop' ? 1 : 0; }
  const fly = smooth3(flying, HZ * 0.55);
  for (let i = 0; i < N; i++) fly[i] *= smoother((i - ix0) / (2.5 * HZ));

  // Where it looks. A plain sheet goes wherever the tracks say, and picks up from where the last one was.
  const free = B.free && B.pan > 0;
  if (free) {
    let px = 0, py = 0;
    if (prev?.route?.free) { const r = prev.route, stop = Math.min((prev.morph || 0) * 0.4, 3.5), tt = prev.t1 - (prev.morph || 0) + stop / 2; px = r.at(r.x, tt); py = r.at(r.y, tt); }
    let lastKick = q(T.kick, ix0);
    for (let i = 0; i < N; i++) {
      if (i >= ix0) {
        const sc = base(baseS, i) * Math.exp(q(T.alt, i) * B.zoom), lines = Math.max(base(baseK, i) * base(baseS, i) / sc, 0.5);
        // Not so fast that the lines going past a place become a flicker
        const up = smoother((i - ix0) / (2 * HZ)), kick = q(T.kick, i), d = Math.min(q(T.speed, i) * B.pan, SIZE.linesBy / lines) * up / HZ + (kick - lastKick) * B.pan * up, head = q(T.head, i);
        lastKick = kick;
        const rot = base(baseR, i) + spin[i];
        // u = R(-head)(0,1), on the screen. Into the pattern: R(-rot) u / scale.
        const ux = Math.sin(head), uy = Math.cos(head), c = Math.cos(rot), s = Math.sin(rot);
        px += (c * ux + s * uy) * d / sc; py += (-s * ux + c * uy) * d / sc;
      }
      x[i] = px; y[i] = py;
    }
  } else if (B.pan > 0 && marks.length) {
    // A tour of its landmarks, arriving on the knots. Out from one by as far as the song's going, round it, and home to the next. It starts from where the pattern is.
    const start = [base(baseX, ix0), base(baseY, ix0)], iOf = t => clamp(Math.round((t - from) * HZ), 0, N - 1);
    const ks = cam.knots.filter(t => t > t0 + 1.5 && t < tEnd - 0.5);
    if (!ks.length || tEnd - ks.at(-1) > 9) ks.push(Math.max(t0 + 1.5, tEnd - 0.5));
    const wx = [0], wy = [0], wt = [t0];
    let ang = G.t0 * 1.7, m = 0;
    ks.forEach((t, j) => {
      const i = iOf(t), reach = clamp(0.5 + 2.2 * q(T.speed, i), 0.3, SIZE.leash) * B.pan / (base(baseS, i) * Math.exp(q(T.alt, i) * B.zoom));
      const home = j % 3 === 2;      // every third knot it arrives on the landmark itself
      ang += 2.05 * (q(T.spin, i) >= 0 ? 1 : -1);
      if (home) m = (m + 1) % marks.length;
      const mk = marks[m];
      wx.push((home ? mk[0] : mk[0] + reach * Math.cos(ang)) - start[0]); wy.push((home ? mk[1] : mk[1] + reach * Math.sin(ang)) - start[1]); wt.push(t);
    });
    const velo = (w, j) => (j > 0 && j < wt.length - 1 ? (w[j + 1] - w[j - 1]) / (wt[j + 1] - wt[j - 1]) : 0);
    const kx = wt.map((t, j) => ({ t, x: wx[j], v: velo(wx, j) })), ky = wt.map((t, j) => ({ t, x: wy[j], v: velo(wy, j) }));
    for (let i = 0; i < N; i++) { const tt = from + i / HZ; x[i] = evalTrack(kx, tt); y[i] = evalTrack(ky, tt); }
  }

  // Round and round it, on a ring road: what's going by runs up the screen, and the rings curve away with the road. Rings are the same all the way round, so it can go for as long as it's on.
  if (B.rings && B.pan >= 0.5 && marks.length && !B.floor && !B.room && !B.lensy) {
    const mk = marks[0], start = [base(baseX, ix0), base(baseY, ix0)], way = cam.wayAt(t0 + 1);
    let a = G.t0 * 0.9, lastKick = q(T.kick, ix0);
    for (let i = 0; i < N; i++) {
      const w = fly[i];
      const sc = base(baseS, i) * Math.exp(q(T.alt, i) * B.zoom), R = 1.9 / sc, kick = q(T.kick, i);
      if (i >= ix0) a += way * (q(T.speed, i) / HZ + (kick - lastKick)) / 1.9;
      lastKick = kick;
      if (w <= 0) continue;
      const cx = mk[0] + R * Math.cos(a) - start[0], cy = mk[1] + R * Math.sin(a) - start[1];
      x[i] = lerp(x[i], cx, w); y[i] = lerp(y[i], cy, w);
      // Screen up is along the road: R(-rot)(0,1) is the way round
      const along = way > 0 ? a + Math.PI / 2 : a - Math.PI / 2;
      spin[i] = lerp(spin[i], Math.PI / 2 - along - base(baseR, i), w);
    }
  }

  // How close: as near as the tracks say, held between sizes the lines can be, at the place it's looking.
  let wobs = null;
  for (let i = 0; i < N; i++) {
    const alt = q(T.alt, i) * B.zoom, sc = base(baseS, i), tip = q(T.tip, i) * B.tip, far = Math.abs(tip) > 0.01 ? farOf(tip, q(T.dir, i), q(T.lens, i)) : 1;
    let k = base(baseK, i);
    if (marks.length && !B.self) {
      // Read at the frame: at four places round the middle, and go by the second biggest, since one of them can be right on a pole.
      const S = seenLines[Math.min(Math.floor(i / STEP), M_ - 1)], cx = S[OFF.tx] + x[i], cy = S[OFF.ty] + y[i], r = 0.75 / (sc * Math.exp(alt));
      const v = [linesAt(S, cx + r, cy), linesAt(S, cx - r, cy), linesAt(S, cx, cy + r), linesAt(S, cx, cy - r)].sort((c, d) => c - d);
      k = v[2] / sc;
    }
    const lo = Math.log(Math.max(k, 1e-3) / SIZE.bold), hi = Math.log(Math.max(k, 1e-3) / SIZE.big), loFar = Math.log(Math.max(k * far, 1e-3) / SIZE.boldFar), floor = Math.max(lo, loFar);
    // Lines finer than it likes to begin with get a little larger, and stay about what they were rather than be blown up: it's what that pattern is.
    z[i] = B.self ? alt : between(alt, floor, Math.max(hi, floor + 0.3));
  }
  const held = smooth3(z, HZ * 0.18);
  z.set(B.self ? z : held);

  // A dial that's the same at every size. Quietly it falls into its own eye, turning as it goes. Flying, it rides an arm: the arm you're on holds still on the screen and everything else comes along it.
  if (B.self) {
    const mk = marks[0], start = [base(baseX, ix0), base(baseY, ix0)], way = cam.wayAt(t0 + 1);
    const arm = B.arm ?? { l: 1, t: 0 }, m = Math.hypot(arm.l, arm.t / TAU) || 1;
    let du = -arm.t / TAU / m, dth = arm.l / m;
    if (du < 0) { du = -du; dth = -dth; }      // outwards: there's more room that way
    const K = clamp(m / 3.2, 0.9, 2.4);          // frame units a unit of log radius takes: how big the cells look. And how far from the eye you ride
    const big = Math.log(K / base(baseS, ix0));
    let fallen = 0, spd = 0, u = 0, th = G.t0 * 1.1, lastKick = q(T.kick, ix0);
    const lean = Math.atan2(dth, du);       // how far the arm is from running straight out
    for (let i = 0; i < N; i++) {
      if (i >= ix0) {
        spd += ((0.35 + 1.4 * q(T.speed, i)) * SIZE.selfFall * B.zoom - spd) * 0.012; fallen = Math.min(fallen + spd / HZ, 7.5);
        const kick = q(T.kick, i), ds = Math.min(0.22, 0.7 * q(T.speed, i) / K) / HZ + (kick - lastKick) * 0.35 / K;
        lastKick = kick; u += du * ds; th += way * dth * ds;
      }
      const w = fly[i];
      const R = Math.exp(u) * 1.3 / base(baseS, i), zr = -u + Math.log(K / 1.3);
      const fallZ = z[i] + fallen;
      x[i] = lerp(mk[0] - start[0] > 0 ? (mk[0] - start[0]) * smoother((i - ix0) / (3 * HZ)) : (mk[0] - start[0]) * smoother((i - ix0) / (3 * HZ)), mk[0] + R * Math.cos(th) - start[0], w);
      y[i] = lerp((mk[1] - start[1]) * smoother((i - ix0) / (3 * HZ)), mk[1] + R * Math.sin(th) - start[1], w);
      z[i] = lerp(fallZ, zr + z[i] * 0.5, w);
      const heading = th + way * lean;       // the way along the arm, on the sheet
      spin[i] = lerp(spin[i] + way * 0.5 * fallen, Math.PI / 2 - heading - base(baseR, i), w);
    }
    wobs = true;
  }
  const at = (a, t) => rd(a, N, (t - from) * HZ);
  return { x, y, z, spin, N, from, t0: G.t0, t1: G.t1, free, at, wobz: !!wobs };
}

// ---------------------------------------------------------------- reading it, a frame at a time
const FAM = [0, 1, 2, 3].map(i => [`f${i}.x`, `f${i}.y`, `f${i}.z`, `f${i}.ph`, `f${i}.d`, `f${i}.on`, `f${i}.r1`, `f${i}.l1`, `f${i}.t1`, `f${i}.r2`, `f${i}.l2`, `f${i}.t2`].map(k => OFF[k]));
const LAYER = [0, 0.32, -0.32, 0.16];      // a sheet of three or more lots of lines has them at different heights, and what you see of each moves with how near it is
function makeWrite(cam) {
  const T = cam.T, n = cam.n;
  // Told to stay, a gesture stays where its camera had got to, and it runs out over the moment the long move does.
  const clockOf = (G, t) => { const e = G.freezeEase; if (G.freezeU == null || !e) return t; const q = Math.min(t - e.t0, e.tau); return e.t0 + q - q * q / (2 * e.tau); };
  return function camWrite(out, tIn, G) {
    const r = cam.routeFor(G);
    if (!r) return;
    const B = G.camBear, t1 = clockOf(G, tIn), t = cam.lag ? t1 - rd(cam.lag, n, t1 * HZ) : t1, locks = G.camLocks ??= locksOf(G);
    const p = t * HZ, z = r.at(r.z, t), spin = r.at(r.spin, t), tip = rd(T.tip, n, p) * B.tip, dir = rd(T.dir, n, p), lens = rd(T.lens, n, p), mx = r.at(r.x, t), my = r.at(r.y, t);
    if (!locks.scale) out[OFF.scale] *= Math.exp(z);
    if (!locks.tx) { out[OFF.tx] += mx; out[OFF.ty] += my; }
    if (B.room) { if (!locks.roll) out[OFF['cam.roll']] += spin; }
    else if (!locks.rot) out[OFF.rot] += spin;
    // A wobble stays in proportion on a sheet that's the same at every size
    if (r.wobz && out[OFF.wob] !== 0) out[OFF.wobF] *= Math.exp(z);
    if (B.layers && !locks.tx) {
      const fq = out[OFF.freq];
      for (let i = 1; i < FAMILIES; i++) if (out[OFF[`f${i}.on`]] > 0.5) out[OFF[`f${i}.ph`]] += LAYER[i] * fq * (out[OFF[`f${i}.x`]] * mx + out[OFF[`f${i}.y`]] * my);
    }
    if (B.spareFam >= 0) {
      const v = rd(T.veil, n, p);
      if (v > 1e-3) {
        const a = FAM[B.twin], b = FAM[B.spareFam], fq = out[OFF.freq];
        for (let k = 0; k < a.length; k++) out[b[k]] = out[a[k]];
        const ax = out[a[0]], ay = out[a[1]], lines = Math.max(Math.hypot(ax, ay) * fq / out[OFF.scale], 0.5);
        // Finer by a set number of bands across the frame, whatever size the lines are, so there's always a few and the frame's brightness stays where it was. They breathe, and a tiny change sends them a long way.
        const e = 1 + clamp((0.78 + 0.1 * Math.sin(spin * 1.3)) / lines, 0.05, 0.6), turn = 0.05 * Math.sin(spin * 0.7 + 1) / Math.max(lines / 3, 1), c = Math.cos(turn) * e, sn = Math.sin(turn) * e;
        out[b[0]] = c * ax - sn * ay; out[b[1]] = sn * ax + c * ay;
        // A little further down than the first, so it comes along a little behind it, and the bands run
        out[b[3]] += 0.035 * fq * (ax * mx + ay * my) + 0.25 * spin;
        out[b[4]] = v - 1; out[b[5]] = 1;
      }
    }
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

// The rehearsal found a flash here and the camera's part of it: for those seconds the camera goes at `rate` of its speed, on a clock of its own, and it makes up the time over the next few, so everything past that is where it was. Nothing stops.
const SLOW_EDGE = 0.5, SLOW_PAY = 6;
export function slowCamera(cam, a, b, rate) {
  const n = cam.n, lag = cam.lag ?? new Float32Array(n), lost = 1 - rate;
  const total = lost * (b - a + SLOW_EDGE);
  for (let i = Math.max(0, Math.floor((a - SLOW_EDGE) * HZ)); i < n; i++) {
    const t = i / HZ;
    // what's been lost by t, then paid back
    const inn = t <= a ? lost * SLOW_EDGE / 2 * smoother((t - a + SLOW_EDGE) / SLOW_EDGE) : t <= b ? lost * (SLOW_EDGE / 2 + t - a) : t <= b + SLOW_EDGE ? total - lost * SLOW_EDGE / 2 * (1 - smoother((t - b) / SLOW_EDGE)) : total;
    const pay = t <= b + SLOW_EDGE ? 0 : total * smoother((t - b - SLOW_EDGE) / SLOW_PAY);
    lag[i] += inn - pay;
  }
  cam.lag = lag;
}

// compose() calls this once a film is made. A world can refuse with world.camera === false.
export function wearCamera(film, A, M, seed = 7, { lang = null } = {}) {
  const H = film.hear;
  if (!H || !A?.duration) return null;
  const hands = buildHands(film, A, M, H, seed, lang);
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
export const wearOne = (score, G) => { if (G && !G.cam && score.camera) G.cam = score.camera.write; };
