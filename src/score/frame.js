// frame(score, t): what the picture is at any moment. A pure function, so seeking, export and exact landings are free.
//
// A score is a list of gestures end to end. Each is one pattern making one long move. In the last `morph` seconds of a gesture
// the next one is already there in the second slot, and the two become each other: families bend into their partners phase by
// phase, the rest open and close as slits while XOR-ed in. There are no solids and no hard shapes between patterns.
import { OFF, SLOT_FLOATS, FRAME, FAMILIES } from '../pattern/layout.js';
import { flatten } from '../pattern/genome.js';
import { clamp, lerp, smoother, evalTrack } from './curves.js';

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
const BOLD = 8;
const lim = new Float32Array(SLOT_FLOATS);
function boldRange(G) {
  if (G.range) return G.range;
  G.range = [0, 1];
  const n = 12, ks = [];
  const horizon = (G.arcEnd ?? G.t1) - G.t0;
  for (let i = 0; i <= n; i++) {
    G.freezeU = i / n;
    fillSlot(lim, G, G.t0 + horizon * i / n, G.pattern, { phi: 0 });
    ks.push(fineness(lim));
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
  if (G.freezeU != null) return G.freezeU;
  const [lo, hi] = boldRange(G);
  let x;
  if (t <= G.t0) x = 0;
  else if (G.period) { const w = ((t - G.t0) / G.period) % 2; x = smoother(w < 1 ? w : 2 - w); }
  // Arcs run to a fixed horizon, not to t1, so rewriting a gesture's end (the user picked something else) can't make them jump.
  else x = clamp((t - G.t0) / Math.max((G.arcEnd ?? G.t1) - G.t0, 1e-3));
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
  if (q('q.xx') + q('q.yy') + q('q.zz') + q('q.ww') > 1e-4) return;
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
    if (s[OFF[`f${i}.on`]] < 0.5) continue;
    const g = n => Math.abs(s[OFF[`f${i}.${n}`]]);
    k = Math.max(k, Math.hypot(g('x'), g('y')) + g('r1') + g('r2') + (g('l1') + g('l2')) / 0.7 + (g('t1') + g('t2')) / 4);
  }
  return Math.max(k * Math.max(s[OFF.freq], 1e-3) / Math.max(s[OFF.scale], 1e-4), 1e-3);
}

// Worked out once per morph, from the two patterns as they stand when it starts.
function makePlan(a, b) {
  const A = [], B = [];
  // A family with a huge duty isn't lines at all, just a constant some patterns use to lift their level. It stays out of this.
  const real = (s, i) => s[OFF[`f${i}.on`]] >= 0.5 && Math.abs(s[OFF[`f${i}.d`]]) <= 1.01;
  for (let i = 0; i < FAMILIES; i++) { if (real(a, i)) A.push(i); if (real(b, i)) B.push(i); }
  const pair = [-1, -1, -1, -1], flip = [false, false, false, false], offset = [0, 0, 0, 0], taken = new Set();
  const options = [];
  for (const i of A) for (const j of B) {
    if (winding(a, i) || winding(b, j)) continue;
    const ca = coef(a, i), cb = coef(b, j);
    const na = Math.hypot(...ca) || 1, nb = Math.hypot(...cb) || 1;
    const dot = ca.reduce((s, v, n) => s + v * cb[n], 0) / (na * nb);
    options.push({ i, j, dot });
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
  const ka = fineness(a), kb = fineness(b);
  const flat = s => s[OFF['surf.kind']] < 0.5;
  const ratio = flat(a) && flat(b) ? clamp(ka / kb, 1 / 8, 8) : 1;
  return { pair, flip, offset, close, open, ratio };
}

function applyMorph(A, B, plan, T, F) {
  // both zoom towards each other, so at every moment the two have about the same size of element
  if (plan.ratio !== 1) {
    A[OFF.scale] *= Math.pow(plan.ratio, T);
    B[OFF.scale] *= Math.pow(1 / plan.ratio, 1 - T);
  }
  for (let j = 0; j < FAMILIES; j++) {
    if (B[OFF[`f${j}.on`]] < 0.5) continue;
    if (plan.flip[j]) for (const n of ['x', 'y', 'z', 'ph', 'r1', 'l1', 't1', 'r2', 'l2', 't2']) B[OFF[`f${j}.${n}`]] = -B[OFF[`f${j}.${n}`]];
    B[OFF[`f${j}.ph`]] += plan.offset[j];
  }
  // A family with nowhere to go closes after the new ones have opened, so an open family is always there and the frame stays half and half.
  const op = smoother(T / 0.55), cl = smoother((T - 0.45) / 0.55);
  for (const j of plan.open) B[OFF[`f${j}.d`]] = lerp(-1, B[OFF[`f${j}.d`]], op);
  for (const i of plan.close) A[OFF[`f${i}.d`]] = lerp(A[OFF[`f${i}.d`]], -1, cl);
  // what's common to the whole slot slides across together
  const rnd = lerp(A[OFF.round], B[OFF.round], T), sum = lerp(A[OFF.sum], B[OFF.sum], T);
  A[OFF.round] = B[OFF.round] = rnd; A[OFF.sum] = B[OFF.sum] = sum;
  const P = FRAME.pair * 4;
  F[P] = plan.pair[0]; F[P + 1] = plan.pair[1]; F[P + 2] = plan.pair[2]; F[P + 3] = plan.pair[3];
  F[FRAME.compose * 4] = T;
  F[FRAME.compose * 4 + 1] = 1;
}

const scratch = new Float32Array(SLOT_FLOATS), scratch2 = new Float32Array(SLOT_FLOATS);

export function frame(score, t, R, edits) {
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

  const phi = phiOf(G, t);
  const aspect = R.canvas ? R.canvas.width / R.canvas.height : 16 / 9;
  let T = 0, two = false, plan = null, solid = pat.solid ?? 1, theta = thetaOf(G, t);

  const h = score.handover;
  if (h && t < h.t1 && t >= h.t0) {
    // Whatever was showing (another film, a held pattern) keeps going and becomes what's showing now.
    const from = h.G, tf = t + (h.dt || 0);
    fillSlot(A, from, tf, from.pattern, { phi: h.phi ? h.phi(tf, from) : phiOf(from, tf) });
    fillSlot(B, G, t, pat, { phi });
    if (!h.plan) {
      fillSlot(scratch, from, h.t0 + (h.dt || 0), from.pattern, { phi: h.phi ? h.phi(h.t0 + (h.dt || 0), from) : phiOf(from, h.t0 + (h.dt || 0)) });
      fillSlot(scratch2, G, h.t0, pat, { phi: phiOf(G, h.t0) });
      h.plan = makePlan(scratch, scratch2);
    }
    T = smoother((t - h.t0) / (h.t1 - h.t0)); plan = h.plan; two = true;
    theta = lerp(thetaOf(from, tf), theta, T);
    solid = lerp(from.pattern.solid ?? 1, solid, T);
  } else if (N && G.morph && t > G.t1 - G.morph) {
    const t0 = G.t1 - G.morph;
    fillSlot(A, G, t, pat, { phi });
    fillSlot(B, N, t, N.pattern, { phi: phiOf(N, t) });
    if (!G.plan || G.planFor !== N) {
      fillSlot(scratch, G, t0, pat, { phi: phiOf(G, t0) });
      fillSlot(scratch2, N, t0, N.pattern, { phi: phiOf(N, t0) });
      G.plan = makePlan(scratch, scratch2); G.planFor = N;
    }
    T = smoother((t - t0) / G.morph); plan = G.plan; two = true;
    theta = lerp(theta, thetaOf(N, t), T);
    solid = lerp(solid, N.pattern.solid ?? 1, T);
  } else {
    fillSlot(A, G, t, pat, { phi });
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
    // the threshold never quite reaches solid under the hand either
    if (edits.duty) theta = clamp(theta + edits.duty, -0.88 * solid, 0.88 * solid);
    if (edits.invert) A[OFF.invert] = 1 - A[OFF.invert];
  }
  noHorizon(A, aspect);
  if (two) { noHorizon(B, aspect); applyMorph(A, B, plan, T, F); B[OFF.theta] = theta; }
  A[OFF.theta] = theta;
  return { G, theta, solid, phi, T, N: two ? (h && t < h.t1 ? G : N) : null };
}

// The threshold a gesture wants at time t. Patterns can read it; `solid` isn't reached any more.
export const thetaAt = (G, t) => thetaOf(G, t);
