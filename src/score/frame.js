// frame(score, t): what the picture is at any moment. A pure function, so seeking, export and exact landings are free.
//
// A score is a list of gestures end to end. A gesture is one pattern making one long move, entered from a solid and left
// through a solid. While the frame is solid anything can change unseen, which is the whole trick.
import { OFF, SLOT_FLOATS, FRAME } from '../pattern/layout.js';
import { flatten } from '../pattern/genome.js';
import { clamp, lerp, smoother, evalTrack } from './curves.js';

const cache = new Map();
export function base(pattern) {
  let b = cache.get(pattern);
  if (!b) { b = flatten(pattern.g); cache.set(pattern, b); }
  return b;
}

function gestureAt(score, t) {
  const g = score.gestures;
  let lo = 0, hi = g.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g[m].t0 <= t) lo = m; else hi = m - 1; }
  return g[lo];
}

const pathOff = p => { const o = OFF[p]; if (o === undefined) throw new Error('no such number: ' + p); return o; };

// One slot's numbers at time t for gesture G
export function fillSlot(out, G, t, pat, opts = {}) {
  out.set(base(pat));
  // Arcs run to a fixed horizon, not to t1, so rewriting a gesture's exit (the user picked something else) can't make them jump.
  let u = clamp((t - G.t0) / Math.max((G.arcEnd ?? G.t1) - G.t0, 1e-3));
  if (G.period) { const w = ((t - G.t0) / G.period) % 2; u = smoother(w < 1 ? w : 2 - w); }
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

// Leaves the solid at a finite rate. Nothing can be seen until the threshold enters the field's range, so the kink is hidden,
// and the first speck comes exactly when it's asked for, rather than after a second of nothing moving.
const CRISP_A = 0.5, CRISP_S = smoother(CRISP_A);
const crispEase = u => (smoother(CRISP_A + (1 - CRISP_A) * clamp(u)) - CRISP_S) / (1 - CRISP_S);

// The threshold for a gesture: out of a solid, a long body, into the next solid.
// holdIn and holdOut keep the solid on screen: the sweep out starts holdIn after t0, the sweep in finishes holdOut before t1.
export function thetaAt(G, t, solid) {
  const body = G.thetaBody ? evalTrack(G.thetaBody, t) : 0;
  const s0 = (G.pol0 || 0) * solid, s1 = (G.pol1 || 0) * solid;
  const hi = G.holdIn || 0, ho = G.holdOut || 0;
  let th = body;
  if (G.pol0 && t < G.t0 + hi + G.inDur) {
    const u = (t - G.t0 - hi) / G.inDur;
    th = lerp(s0, body, G.crisp ? crispEase(u) : smoother(u));
  }
  if (G.pol1 && t > G.t1 - ho - G.outDur) {
    const u = (t - (G.t1 - ho - G.outDur)) / G.outDur;
    th = lerp(th, s1, G.crisp ? 1 - crispEase(1 - u) : smoother(u));
  }
  return th;
}

export function frame(score, t, R, edits) {
  const G = gestureAt(score, t);
  const pat = G.pattern;
  const A = R.slotA, F = R.frame;
  const phi = score.phi ? score.phi(t, G) : t * 0.25;
  fillSlot(A, G, t, pat, { phi });
  const solid = pat.solid ?? 1;
  let theta = thetaAt(G, t, solid);
  F.fill(0);
  F.set(score.colors?.paper ?? [0, 0, 0, 1], FRAME.paper * 4);
  F.set(score.colors?.ink ?? [1, 1, 1, 1], FRAME.ink * 4);
  F.set(score.colors?.band1 ?? [1, 0.2, 0.1, 1], FRAME.band1 * 4);
  F[FRAME.plate * 4] = edits?.plate ?? 0;

  let usesB = false;
  if (G.matte) {
    // a hard shape: a void closing, an inset, a crack opening
    const m = G.matte(t, G);
    for (const k in m) A[pathOff(k)] = m[k];
    if (G.inset) {
      const B = R.slotB;
      fillSlot(B, G, t, G.inset, { phi });
      B[OFF.theta] = theta;
      usesB = true;
    }
  }
  F[FRAME.compose * 4 + 1] = usesB ? 1 : 0;

  if (edits) {
    // the hand, on top of whatever the film is doing
    if (edits.journey) {
      A[OFF.scale] *= Math.exp(edits.journey);
      A[OFF.tx] += edits.jx || 0; A[OFF.ty] += edits.jy || 0;
      if (usesB) { R.slotB[OFF.scale] *= Math.exp(edits.journey); }
    }
    if (edits.spin) A[OFF.rot] += edits.spin;
    if (edits.duty) theta = clamp(theta + edits.duty, -solid, solid);
    if (edits.over) for (const p in edits.over) A[pathOff(p)] = edits.over[p];
    const P = FRAME.press * 4;
    F[P] = edits.pressX || 0; F[P + 1] = edits.pressY || 0; F[P + 2] = edits.press || 0; F[P + 3] = edits.pressR || 0.5;
    const S = FRAME.sheetOfs * 4;
    F[S] = edits.sheetX || 0; F[S + 1] = edits.sheetY || 0; F[S + 2] = edits.sheetRot || 0; F[S + 3] = edits.sheet || 0;
  }
  A[OFF.theta] = theta;
  if (edits?.invert) A[OFF.invert] = 1 - A[OFF.invert];
  return { G, theta, solid, phi };
}
