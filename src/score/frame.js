// frame(score, t): what the picture is at any moment. A pure function, so seeking, export and exact landings are free.
//
// A score is a list of gestures end to end. Each is one pattern making one long move. In the last `morph` seconds of a gesture it
// transforms into the next, in one of three ways, and only one thing moves while it does:
//   slide   the same kind of pattern: its numbers glide to the next one's, so warps grow and lines straighten
//   bend    lines of one become lines of the other, phase by phase
//   dive    a flight into one element of the pattern, which has the next pattern inside it (or, rising, out of one)
// Nothing is laid over anything else.
import { OFF, SLOT_FLOATS, FRAME, FAMILIES, SNAP } from '../pattern/layout.js';
import { flatten } from '../pattern/genome.js';
import { clamp, lerp, smoother, evalTrack } from './curves.js';
import { reactAt, chordLenses } from './react.js';

const cache = new Map();
export function base(pattern) {
  let b = cache.get(pattern);
  if (!b) { b = flatten(pattern.g); cache.set(pattern, b); }
  return b;
}

function indexAt(g, t) {
  let lo = 0, hi = g.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g[m].t0 <= t) lo = m; else hi = m - 1; }
  return lo;
}

const pathOff = p => { const o = OFF[p]; if (o === undefined) throw new Error('no such number: ' + p); return o; };

// The film's strength is bold shapes, with hairlines only in passing, and a morph between two fine patterns is only wallpaper. So a
// gesture rides just the part of its long move that stays this bold. In cycles per picture unit: at 720p that's a period of about 20 px.
const BOLD = 12;
const WHIP = 3;   // how far a slide's lines can stray from the steady path between the two sizes
const GREY_MAX = 0.4;   // in a probe at 180 px high, what share can be edges and lines too fine to tell before a slide counts as going grey
const lim = new Float32Array(SLOT_FLOATS), lim3 = new Float32Array(SLOT_FLOATS), limR = new Float32Array(SLOT_FLOATS), lensTmp = new Float32Array(12);
export function boldRange(G) {
  if (G.range) return G.range;
  G.range = [0, 1];
  const n = 12, ks = [];
  const horizon = (G.arcEnd ?? G.t1) - G.t0;
  for (let i = 0; i <= n; i++) {
    G.freezeU = i / n;
    fillSlot(limR, G, G.t0 + horizon * i / n, G.pattern, { phi: 0 });
    ks.push(fineness(limR));
  }
  G.freezeU = null;
  let lo = 0, hi = n;
  if (!G.pattern.fine) {
    const ok = ks.map(k => k <= BOLD);
    if (ok.some(Boolean)) { while (!ok[lo]) lo++; hi = lo; while (hi < n && ok[hi + 1]) hi++; if (hi === lo) hi = Math.min(n, lo + 1); }
    else { const best = ks.indexOf(Math.min(...ks)); lo = best; hi = best; }
  }
  G.range = [lo / n, hi / n];
  return G.range;
}

// How far along its long move a gesture is. Held gestures swing; frozen ones stay put.
export function arcU(G, t) {
  if (G.freezeU != null) {
    // Told to stay, it doesn't stop dead: what it was doing runs out over a moment, and it comes to rest just there.
    const e = G.freezeEase;
    if (e && t < e.t0 + e.tau) { const k = 1 - clamp((t - e.t0) / e.tau); return G.freezeU - e.a * k * k; }
    return G.freezeU;
  }
  const [lo, hi] = boldRange(G);
  let x;
  if (t <= G.t0) x = 0;
  else if (G.period) { const w = ((t - G.t0) / G.period) % 2; x = smoother(w < 1 ? w : 2 - w); }
  // Arcs run to a fixed horizon, not to t1, so rewriting a gesture's end (the user picked something else) can't make them jump.
  else x = clamp((t - G.t0) / Math.max((G.arcEnd ?? G.t1) - G.t0, 1e-3));
  // ...and let go, it picks up speed the same way
  const e = G.thaw;
  if (e && t < e.t0 + e.tau) { const k = 1 - clamp((t - e.t0) / e.tau); x = Math.min(1, x + e.a * k * k); }
  return lo + (hi - lo) * x;
}

// One slot's numbers at time t for gesture G
export function fillSlot(out, G, t, pat, opts = {}) {
  out.set(base(pat));
  const u = arcU(G, t);
  const phi = opts.phi ?? 0;
  // the pattern's own long moves, ridden across the gesture
  for (const a of G.arcs || pat.arcs || []) {
    const off = pathOff(a.path);
    const k = a.ease === 'wave' ? 0.5 - 0.5 * Math.cos(u * Math.PI * 2 * (a.cycles || 1)) : smoother(a.at ? clamp((u - a.at[0]) / (a.at[1] - a.at[0])) : u);
    out[off] = a.log ? a.from * Math.pow(a.to / a.from, k) : lerp(a.from, a.to, k);
  }
  // whatever flows, flows on the clock: phases only, so the frame returns to itself
  const flow = G.flow || pat.flow;
  if (flow) for (const p in flow) out[pathOff(p)] += flow[p] * phi;
  if (pat.drive) pat.drive(out, { u, t, phi, OFF, G });
  if (G.over) for (const p in G.over) out[pathOff(p)] = G.over[p];
}

// A flat floor never tips far enough to show its horizon: there's nothing beyond it worth seeing.
function noHorizon(s, aspect) {
  if (s[OFF['surf.kind']] !== 1) return;
  const q = n => Math.abs(s[OFF[n]]);
  if (q('q.xx') + q('q.yy') + q('q.xy') > 1e-4) return;     // a plane or a slab: anything that runs off to the horizon, and nothing that curves
  const r = s[OFF['cam.roll']], reach = (Math.abs(Math.cos(r)) + Math.abs(Math.sin(r)) * aspect) * 1.5;   // well past the top of the frame, or the far lines thicken into a grey band
  const max = Math.atan(s[OFF['cam.dist']] / reach);
  s[OFF['cam.pitch']] = clamp(s[OFF['cam.pitch']], -max, max);
}

export function thetaOf(G, t) { return G.thetaBody ? evalTrack(G.thetaBody, t) : 0; }

// ---------------------------------------------------------------- how two patterns become each other
const winding = (s, i) => {
  const k = n => Math.abs(s[OFF[`f${i}.${n}`]]);
  if (k('t1') + k('t2') > 1e-6) return true;
  if (s[OFF['droste.lnS']] !== 0) return true;
  return s[OFF['surf.kind']] === 1 && s[OFF['surf.map']] > 0.5 && k('x') > 1e-6;   // the around-count on a wrapped surface
};
const coef = (s, i) => ['x', 'y', 'r1', 'l1', 'r2', 'l2'].map(n => s[OFF[`f${i}.${n}`]]);

function fineness(s) {
  let k = 0;
  for (let i = 0; i < FAMILIES; i++) {
    if (s[OFF[`f${i}.on`]] < 0.5 || Math.abs(s[OFF[`f${i}.d`]]) > 0.98) continue;
    const g = n => Math.abs(s[OFF[`f${i}.${n}`]]);
    k = Math.max(k, Math.hypot(g('x'), g('y')) + g('r1') + g('r2') + (g('l1') + g('l2')) / 0.7 + (g('t1') + g('t2')) / 4);
  }
  return Math.max(k * Math.max(s[OFF.freq], 1e-3) / Math.max(s[OFF.scale], 1e-4), 1e-3);
}

// The biggest element in a small rendering of the pattern, near the middle if it can be: where to fly to, and what colour it is.
function biggestElement(R, slot, aspect, seen) {
  const { W, H, px } = seen ?? R.probe(slot, aspect);
  const best = { r: 0, score: -1, x: 0, y: 0, white: true };
  for (const white of [true, false]) {
    const d = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) d[i] = (white ? px[i * 4] > 225 : px[i * 4] < 30) ? 1e6 : 0;     // a mid value is an edge or lines too fine to tell
    const relax = (i, j, c) => { if (d[j] + c < d[i]) d[i] = d[j] + c; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) d[i] = Math.min(d[i], 1.2);   // an element can run off the frame
      if (x > 0) relax(i, i - 1, 1); if (y > 0) relax(i, i - W, 1); if (x > 0 && y > 0) relax(i, i - W - 1, 1.41); if (x < W - 1 && y > 0) relax(i, i - W + 1, 1.41);
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (x < W - 1) relax(i, i + 1, 1); if (y < H - 1) relax(i, i + W, 1); if (x < W - 1 && y < H - 1) relax(i, i + W + 1, 1.41); if (x > 0 && y < H - 1) relax(i, i + W - 1, 1.41);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, fx = ((x + 0.5) - W / 2) / H * 2, fy = ((y + 0.5) - H / 2) / H * 2;
      const score = d[i] * (1 - 0.3 * Math.hypot(fx / aspect, fy));
      if (score > best.score) { best.score = score; best.r = Math.max(d[i] - 0.5, 0.6) / H * 2; best.x = fx; best.y = fy; best.white = white; }
    }
  }
  return best;
}

// Worked out once per transition, from the two patterns as they stand when it starts.
function makePlan(a, b, ctx) {
  const A = [], B = [];
  // A family with a huge duty isn't lines at all, just a constant some patterns use to lift their level. It stays out of this.
  const real = (s, i) => s[OFF[`f${i}.on`]] >= 0.5 && Math.abs(s[OFF[`f${i}.d`]]) <= 1.01;
  for (let i = 0; i < FAMILIES; i++) { if (real(a, i)) A.push(i); if (real(b, i)) B.push(i); }
  const pair = [-1, -1, -1, -1], flip = [false, false, false, false], offset = [0, 0, 0, 0], taken = new Set();
  const options = [];
  for (const i of A) for (const j of B) {
    if (winding(a, i) !== winding(b, j)) continue;
    if (winding(a, i)) {
      const same = ['t1', 't2'].every(n => Math.abs(a[OFF[`f${i}.${n}`]] - b[OFF[`f${j}.${n}`]]) < 1e-6);
      if (!same) continue;
    }
    const ca = coef(a, i), cb = coef(b, j);
    const na = Math.hypot(...ca) || 1, nb = Math.hypot(...cb) || 1;
    options.push({ i, j, dot: ca.reduce((s, v, n) => s + v * cb[n], 0) / (na * nb) });
  }
  options.sort((p, q) => Math.abs(q.dot) - Math.abs(p.dot));
  for (const o of options) {
    if (pair[o.i] >= 0 || taken.has(o.j)) continue;
    pair[o.i] = o.j; taken.add(o.j); flip[o.j] = o.dot < 0;
    // Whole cycles are invisible, so start with the two phases as close as they can be, or the lines would whip across.
    const pa = a[OFF[`f${o.i}.ph`]], pb = (o.dot < 0 ? -1 : 1) * b[OFF[`f${o.j}.ph`]];
    offset[o.j] = Math.round(pa - pb);
  }
  const close = A.filter(i => pair[i] < 0), open = B.filter(j => !taken.has(j));
  const ratio = fineness(a) / fineness(b);
  const flat = s => s[OFF['surf.kind']] < 0.5;
  const same = n => a[OFF[n]] === b[OFF[n]];
  const shaped = s => s[OFF['ribbon.on']] > 0.5 || s[OFF['blobs.on']] > 0.5 || s[OFF['matte.kind']] > 0.5;
  const closeEnough = ratio < 6 && ratio > 1 / 6;
  const allPaired = !close.length && !open.length;
  const fewExtras = close.length + open.length <= 2 && pair.some(p => p >= 0);
  // A surface can't glide into a different surface: part way there the rays miss it, or it fills the frame.
  const sameBody = ['q.xx', 'q.xy', 'q.xz', 'q.xw', 'q.yy', 'q.yz', 'q.yw', 'q.zz', 'q.zw', 'q.ww'].every(n => Math.abs(a[OFF[n]] - b[OFF[n]]) < 1e-3);
  const plain = !shaped(a) && !shaped(b) && sameBody && same('fold.n') && a[OFF['droste.lnS']] === 0 && b[OFF['droste.lnS']] === 0 && a[OFF['conf.amt']] === b[OFF['conf.amt']];
  // The same kind of thing: its numbers can simply glide. Otherwise lines can bend into lines if they're near enough in size.
  // Otherwise it's a flight, which works between anything.
  if (plain && same('surf.kind') && a[OFF['surf.map']] < 0.5 && b[OFF['surf.map']] < 0.5 && fewExtras && closeEnough && ctx.D >= 6) {
    const plan = { kind: 'slide', pair, flip, offset, close, open, ratio };
    if (slideStaysBusy(a, b, plan, ctx)) return plan;
  }
  if (plain && flat(a) && flat(b) && allPaired && closeEnough && ctx.D >= 8) return { kind: 'bend', pair, flip, offset, close, open, ratio };
  const out = biggestElement(ctx.R, a, ctx.aspect), inn = biggestElement(ctx.R, b, ctx.aspect);
  const diag = Math.hypot(Math.max(ctx.aspect, 1.9), 1);
  const zoomFor = e => clamp((Math.hypot(e.x, e.y) + diag + 0.4) * 1.15 / Math.max(e.r, 0.012), 1.5, 240);    // with room for the song's lenses moving the frame a little
  const zo = zoomFor(out), zi = zoomFor(inn);
  // Out of the pattern with the bigger element, which is the shorter and more legible flight. Now and then the other way, for variety.
  const rise = ctx.rise ?? zi < zo * 0.8;
  const e = rise ? inn : out;
  return { kind: rise ? 'rise' : 'dive', lnZ: Math.log(rise ? zi : zo), q: [e.x, e.y], white: e.white };
}

// Time runs on for a moment and then comes to rest (or starts from rest), so only the transformation moves while it happens.
const easeOut = (t, t0, stop) => (t <= t0 ? t : t0 + stop * (x => x - x * x / 2)(Math.min(1, (t - t0) / stop)));
const easeIn = (t, t1, stop) => (t >= t1 ? t : t1 - stop * (x => x - x * x / 2)(Math.min(1, (t1 - t) / stop)));

// A slide whose numbers pass through a place with nothing much in it would fill the frame with one colour on the way, and numbers crossing
// zero would blow the lines up huge and shrink them again. Look before leaving: its size has to stay near the straight path between the two.
const slA = new Float32Array(SLOT_FLOATS), slB = new Float32Array(SLOT_FLOATS);
function slideStaysBusy(a, b, plan, ctx) {
  // Only the lines that go somewhere can whip: a family opening or closing has one size all the way.
  const fine = (s, i) => {
    const g = n => Math.abs(s[OFF[`f${i}.${n}`]]);
    return Math.max(Math.hypot(g('x'), g('y')) + g('r1') + g('r2') + (g('l1') + g('l2')) / 0.7 + (g('t1') + g('t2')) / 4, 1e-3) * Math.max(s[OFF.freq], 1e-3) / Math.max(s[OFF.scale], 1e-4);
  };
  for (let i = 0; i < FAMILIES; i++) {
    const j = plan.pair[i];
    if (j < 0) continue;
    const ka = Math.log(fine(a, i)), kb = Math.log(fine(b, j));
    for (const T of [0.15, 0.3, 0.4, 0.5, 0.6, 0.7, 0.85]) {
      slA.set(a); slB.set(b);
      applySlide(slA, slB, plan, T);
      if (Math.abs(Math.log(fine(slA, i)) - lerp(ka, kb, T)) > Math.log(WHIP)) return false;
    }
  }
  for (const T of [0.2, 0.35, 0.5, 0.65, 0.8, 0.9]) {
    slA.set(a); slB.set(b);
    applySlide(slA, slB, plan, T);
    const { W, H, px } = ctx.R.probe(slA, ctx.aspect);
    let sum = 0, grey = 0;
    for (let i = 0; i < W * H; i++) { sum += px[i * 4]; if (px[i * 4] > 40 && px[i * 4] < 215) grey++; }
    const white = sum / (W * H * 255);
    if (white < 0.12 || white > 0.88) return false;
    if (grey / (W * H) > GREY_MAX) return false;
    if (biggestElement(ctx.R, slA, ctx.aspect, { W, H, px }).r > 0.8) return false;
  }
  return true;
}

const lim2 = new Float32Array(SLOT_FLOATS);
function applySlide(A, B, plan, T) {
  // Glide A's numbers to B's, family by family, where each family's partner is. B's own numbers are left alone.
  lim2.set(B);
  for (let i = 0; i < FAMILIES; i++) {
    const j = plan.pair[i];
    if (j < 0) continue;
    const sign = plan.flip[j] ? -1 : 1;
    for (const n of ['x', 'y', 'z', 'ph', 'r1', 'l1', 't1', 'r2', 'l2', 't2']) lim2[OFF[`f${i}.${n}`]] = sign * B[OFF[`f${j}.${n}`]] + (n === 'ph' ? plan.offset[j] : 0);
    lim2[OFF[`f${i}.d`]] = B[OFF[`f${j}.d`]]; lim2[OFF[`f${i}.on`]] = 1;
  }
  for (const i of plan.close) { for (const n of ['x', 'y', 'z', 'ph', 'r1', 'l1', 't1', 'r2', 'l2', 't2']) lim2[OFF[`f${i}.${n}`]] = A[OFF[`f${i}.${n}`]]; lim2[OFF[`f${i}.d`]] = -1; lim2[OFF[`f${i}.on`]] = 1; }
  // A new family needs a place of its own, and starts closed. A family with a huge duty is only a constant, nothing at all to the XOR, and the dots use one
  // to lift their level. It keeps its place and stays one: gliding its duty to zero would open it up and flip the whole picture.
  const NUMS = ['x', 'y', 'z', 'ph', 'r1', 'l1', 't1', 'r2', 'l2', 't2'];
  const isConst = (s, i) => s[OFF[`f${i}.on`]] > 0.5 && Math.abs(s[OFF[`f${i}.d`]]) > 1.01;
  const used = new Set(plan.pair.map((j, i) => (j >= 0 ? i : -1)).concat(plan.close));
  const moved = [];
  const place = (j, closed) => {
    let free = 0; while (used.has(free) && free < FAMILIES - 1) free++;
    used.add(free);
    for (const n of NUMS) { A[OFF[`f${free}.${n}`]] = B[OFF[`f${j}.${n}`]]; lim2[OFF[`f${free}.${n}`]] = B[OFF[`f${j}.${n}`]]; }
    A[OFF[`f${free}.d`]] = closed; lim2[OFF[`f${free}.d`]] = B[OFF[`f${j}.d`]]; A[OFF[`f${free}.on`]] = 1; lim2[OFF[`f${free}.on`]] = 1;
    return free;
  };
  const keep = [];
  for (let i = 0; i < FAMILIES; i++) if (!used.has(i) && isConst(A, i)) { keep.push(i); used.add(i); }
  for (const j of plan.open) moved.push([j, place(j, -1)]);
  // ...and one the next pattern needs that a family of this one is sitting on goes somewhere else
  for (let j = 0; j < FAMILIES; j++) if (isConst(B, j) && !keep.includes(j) && (plan.pair[j] >= 0 || plan.close.includes(j))) moved.push([j, place(j, -1)]);
  for (const [j, at] of moved) if (at !== j && !used.has(j)) lim2[OFF[`f${j}.on`]] = 0;
  plan.places = moved;   // colour's second plate needs to know where each went
  for (const i of keep) { for (const n of NUMS) lim2[OFF[`f${i}.${n}`]] = A[OFF[`f${i}.${n}`]]; lim2[OFF[`f${i}.d`]] = A[OFF[`f${i}.d`]]; lim2[OFF[`f${i}.on`]] = 1; }
  const s0 = A[OFF.scale], s1 = B[OFF.scale];
  for (let i = 0; i < FAMILIES; i++) if (lim2[OFF[`f${i}.on`]] > 0.5 && A[OFF[`f${i}.on`]] < 0.5) { A[OFF[`f${i}.d`]] = -1; A[OFF[`f${i}.on`]] = 1; for (const n of ['x', 'y', 'z', 'ph', 'r1', 'l1', 't1', 'r2', 'l2', 't2']) A[OFF[`f${i}.${n}`]] = lim2[OFF[`f${i}.${n}`]]; }
  for (let n = 0; n < SLOT_FLOATS; n++) if (!SNAP.has(n)) A[n] = A[n] + (lim2[n] - A[n]) * T;
  A[OFF.scale] = s0 * Math.pow(s1 / s0, T);
}

function applyBend(A, B, plan, T, F) {
  for (let j = 0; j < FAMILIES; j++) {
    if (B[OFF[`f${j}.on`]] < 0.5) continue;
    if (plan.flip[j]) for (const n of ['x', 'y', 'z', 'ph', 'r1', 'l1', 't1', 'r2', 'l2', 't2']) B[OFF[`f${j}.${n}`]] = -B[OFF[`f${j}.${n}`]];
    B[OFF[`f${j}.ph`]] += plan.offset[j];
  }
  // both zoom towards each other, so at every moment the two have about the same size of element
  A[OFF.scale] *= Math.pow(plan.ratio, T);
  B[OFF.scale] *= Math.pow(1 / plan.ratio, 1 - T);
  const rnd = lerp(A[OFF.round], B[OFF.round], T), sum = lerp(A[OFF.sum], B[OFF.sum], T);
  A[OFF.round] = B[OFF.round] = rnd; A[OFF.sum] = B[OFF.sum] = sum;
  const P = FRAME.pair * 4;
  F[P] = plan.pair[0]; F[P + 1] = plan.pair[1]; F[P + 2] = plan.pair[2]; F[P + 3] = plan.pair[3];
  F[FRAME.compose * 4] = T;
  F[FRAME.compose * 4 + 1] = 1;
}

export function frame(score, t, R, edits) {
  const tReal = t, beyond = edits?.beyond;
  if (beyond) t = beyond.time(t, score);   // Beyond's stops: the picture's clock with a rest taken out of it
  const g = score.gestures, A = R.slotA, B = R.slotB, F = R.frame;
  const i = indexAt(g, t);
  const held = edits?.staticG;
  const G = held ?? g[i], N = held ? null : g[i + 1];
  const pat = G.pattern;
  const phiOf = (gg, tt, sc = score) => (sc.phi ? sc.phi(tt, gg) : tt * 0.25);
  F.fill(0);
  F.set(score.colors?.paper ?? [0, 0, 0, 1], FRAME.paper * 4);
  F.set(score.colors?.ink ?? [1, 1, 1, 1], FRAME.ink * 4);
  F.set(score.colors?.band1 ?? [1, 0.2, 0.1, 1], FRAME.band1 * 4);
  F[FRAME.plate * 4] = edits?.plate ?? 0;
  F[FRAME.pair * 4] = F[FRAME.pair * 4 + 1] = F[FRAME.pair * 4 + 2] = F[FRAME.pair * 4 + 3] = -1;

  const aspect = R.canvas ? R.canvas.width / R.canvas.height : 16 / 9;
  const phi = phiOf(G, t);
  let solid = pat.solid ?? 1, theta = thetaOf(G, t), two = false, T = 0, kind = null, thetaB = 0;

  // Which transformation is under way, if any: from `from` (at its own time) into `to`, over x from 0 to 1.
  const h = score.handover;
  let from = null, to = null, x = 0, tf = t, plan = null, t0 = 0, D = 0, holder = null, phiFrom = null;
  if (h && t >= h.t0 && t < h.t1) { from = h.G; to = G; tf = t + (h.dt || 0); t0 = h.t0; D = h.t1 - h.t0; holder = h; phiFrom = h.phi; }
  else if (N && G.morph && t > G.t1 - G.morph) { from = G; to = N; t0 = G.t1 - G.morph; D = G.morph; holder = G; }

  if (from) {
    x = clamp((t - t0) / D);
    const stop = Math.min(D * 0.4, 3.5), dtf = tf - t;
    const pf = tt => (phiFrom ? phiFrom(tt, from) : phiOf(from, tt));
    const tA = easeOut(tf, t0 + dtf, stop), tA0 = t0 + dtf + stop / 2;
    const t1 = t0 + D;
    const tB = holder === h ? t : easeIn(t, t1, stop);
    const tB0 = t1 - stop / 2;
    if (!holder.plan || holder.planFor !== to) {
      fillSlot(lim, from, tA0, from.pattern, { phi: pf(tA0) });
      fillSlot(lim3, to, tB0, to.pattern, { phi: phiOf(to, tB0) });
      noHorizon(lim, aspect); noHorizon(lim3, aspect);
      lim[OFF.theta] = thetaOf(from, tA0); lim3[OFF.theta] = thetaOf(to, tB0);
      // A handover can only ever fly in. Rising needs the next pattern at rest with its element where the plan found it, and a film's clock doesn't
      // stop for that: its element would have moved on, and the frame would sit inside whatever had moved there, one flat colour.
      holder.plan = makePlan(lim, lim3, { R, aspect, D, rise: holder === h ? false : from.rise });
      holder.planFor = to;
    }
    plan = holder.plan; kind = plan.kind;
    fillSlot(A, from, tA, from.pattern, { phi: pf(tA) });
    fillSlot(B, to, tB, to.pattern, { phi: phiOf(to, tB) });
    const sa = from.pattern.solid ?? 1, sb = to.pattern.solid ?? 1;
    T = smoother(x);
    const thA = thetaOf(from, tA), thB = thetaOf(to, tB);
    if (kind === 'slide' || kind === 'bend') { theta = lerp(thA, thB, T); solid = lerp(sa, sb, T); }
    else if (kind === 'dive') {
      // Flying in: the other pattern opens up inside the element, starting out as that element's own colour
      const k = smoother((x - 0.1) / 0.5);
      theta = thA; solid = sa;
      thetaB = lerp(plan.white ? -sb : sb, thB, k);
      B[OFF.scale] *= Math.exp(-Math.min(0.35 * plan.lnZ, 0.7) * (1 - T));     // it grows on the way, but it's never so fine it greys
    } else {
      // Rising out: what's showing closes up to the element's colour and shrinks, until it's one element of the next pattern
      const k = smoother((x - 0.5) / 0.45);
      theta = lerp(thA, plan.white ? -sa : sa, k); solid = sb;
      thetaB = thB;
      A[OFF.scale] *= Math.exp(-Math.min(0.35 * plan.lnZ, 0.7) * T);
    }
    two = true;
  } else {
    fillSlot(A, G, t, pat, { phi });
  }

  // ---------- the song. Balance: the tune leads, the beat keeps time under it, and the chords shape the sheet. No one of them takes over.
  const Rc = score.react, amt = edits?.reactAmt ?? 1;
  if (Rc && amt > 0) {
    const s = reactAt(Rc, t), big = 0.5 + 0.7 * s.energy;
    const mPulse = (edits?.reactPulse ?? 1) * amt, mMel = (edits?.reactMelody ?? 1) * amt, mTone = (edits?.reactTone ?? 1) * amt;
    // In a flight, the pattern being flown through has to hold still, or the element would slip out from under the camera. The one inside it reacts.
    const moveA = kind !== 'dive', moveB = two && kind !== 'rise';
    // Tone: brighter sound, finer lines. Only on flat patterns, slowly.
    if (moveA && A[OFF['surf.kind']] < 0.5) A[OFF.freq] *= 1 + 0.16 * s.tone * mTone;
    if (moveB && B[OFF['surf.kind']] < 0.5) B[OFF.freq] *= 1 + 0.16 * s.tone * mTone;
    // The pulse: lines fatten a little on the strong beats and the middle swells. It steps back while the tune is playing.
    const beat = s.pulse * big * mPulse * (1 - 0.45 * s.voiced);
    if (moveA) theta -= 0.13 * (solid || 1) * beat;
    if (kind === 'dive') thetaB -= 0.13 * (solid || 1) * beat * smoother((x - 0.6) / 0.4);
    const Po = FRAME.pose * 4;
    chordLenses(Rc, t, lensTmp);
    for (let n = 0; n < 12; n += 4) { F[Po + n] = lensTmp[n]; F[Po + n + 1] = lensTmp[n + 1]; F[Po + n + 2] = lensTmp[n + 2] * big * mTone; F[Po + n + 3] = lensTmp[n + 3]; }
    F[Po + 12] = 0; F[Po + 13] = 0; F[Po + 14] = 0.1 * beat; F[Po + 15] = 1.15;
    // The tune: it leaves the middle and travels out through the lines, a sample every eighth of a second
    const Ml = FRAME.mel * 4, step = 0.125, speed = 0.62;
    F[Ml] = (0.085 + 0.09 * s.energy) * mMel; F[Ml + 1] = 1 / (step * speed); F[Ml + 2] = G.melMode ?? 0;
    const Ms = FRAME.melS * 4;
    for (let n = 0; n < 32; n++) F[Ms + n] = reactAt(Rc, Math.max(0, t - n * step)).melody;
    // ...and it carries the lines with it: as the note climbs they slide one way, as it falls they slide back, so a guitar slide pulls
    // the whole sheet. The sheet also leans a little with it.
    const slide = 0.42 * s.melSlow * s.voiced * mMel;
    const lean = 0.05 * s.melSlow * s.voiced * mMel;
    if (moveA) { A[OFF['f0.ph']] += slide; A[OFF.rot] += lean; }
    if (moveB) { B[OFF['f0.ph']] += slide; B[OFF.rot] += lean; }
  }

  if (edits) {
    // the hand, on top of whatever the film is doing
    const hand = s => {
      if (edits.journey) { s[OFF.scale] *= Math.exp(edits.journey); s[OFF.tx] += edits.jx || 0; s[OFF.ty] += edits.jy || 0; }
      if (edits.spin) s[OFF.rot] += edits.spin;
    };
    hand(A);
    if (two) hand(B);
    if (edits.over) for (const p in edits.over) A[pathOff(p)] = edits.over[p];
    const P = FRAME.press * 4;
    F[P] = edits.pressX || 0; F[P + 1] = edits.pressY || 0; F[P + 2] = edits.press || 0; F[P + 3] = edits.pressR || 0.5;
    const S = FRAME.sheetOfs * 4;
    F[S] = edits.sheetX || 0; F[S + 1] = edits.sheetY || 0; F[S + 2] = edits.sheetRot || 0; F[S + 3] = edits.sheet || 0;
    if (edits.ripples) {
      const Rp = FRAME.ripple * 4;
      edits.ripples.slice(0, 8).forEach((r, n) => { F[Rp + n * 4] = r.x; F[Rp + n * 4 + 1] = r.y; F[Rp + n * 4 + 2] = r.radius; F[Rp + n * 4 + 3] = r.height; });
    }
    if (edits.hand) {
      const H = FRAME.hand * 4, e = edits.hand;
      F[H] = e.x; F[H + 1] = e.y; F[H + 2] = e.height; F[H + 3] = e.on;
      F[H + 4] = e.curl; F[H + 5] = e.spread; F[H + 6] = e.turn; F[H + 7] = e.size;
    }
    if (edits.warp) {
      // twist, pinch, bulge: one place on the sheet, kept in the block's spare numbers
      const e = edits.warp, M = FRAME.misc * 4;
      F[M + 1] = e.x; F[M + 2] = e.y; F[M + 3] = e.r; F[FRAME.compose * 4 + 3] = e.twist; F[FRAME.plate * 4 + 3] = e.pinch;
    }
    // the threshold never quite reaches solid under the hand either
    if (edits.duty) theta += edits.duty;
    if (edits.invert) A[OFF.invert] = 1 - A[OFF.invert];
  }
  // Never empty, however much the song and the hand push it, except while a flight is closing one up inside an element
  if (kind !== 'rise') theta = clamp(theta, -0.9 * solid, 0.9 * solid);
  noHorizon(A, aspect);
  if (two) noHorizon(B, aspect);

  if (kind === 'slide') { A[OFF.theta] = theta; B[OFF.theta] = theta; applySlide(A, B, plan, T); two = false; }
  else if (kind === 'bend') { applyBend(A, B, plan, T, F); B[OFF.theta] = theta; A[OFF.theta] = theta; }
  else if (kind === 'dive' || kind === 'rise') {
    const lnS = kind === 'dive' ? plan.lnZ * T : plan.lnZ * (1 - T);
    const Dv = FRAME.dive * 4;
    F[Dv] = plan.q[0]; F[Dv + 1] = plan.q[1]; F[Dv + 2] = Math.exp(lnS);
    F[Dv + 3] = kind === 'dive' ? (plan.white ? 1 : 2) : (plan.white ? 3 : 4);
    A[OFF.theta] = theta; B[OFF.theta] = thetaB;
  } else A[OFF.theta] = theta;
  if (beyond) beyond.write(F, tReal, score, from ?? G, from ? to : null, T, plan);
  return { G, theta, solid, phi, T, kind, from, N: from ? to : null };
}

// The threshold a gesture wants at time t. Patterns can read it; `solid` isn't reached any more.
export const thetaAt = (G, t) => thetaOf(G, t);
