// Room for one of the mode's own gestures, X, from a to b. Whatever was wholly inside goes, the gesture before now ends at a and the one after starts at b, each keeping a stay of its own.
// A gesture whose end or start moves loses whatever was timed to the old one: its landing's timing, a hero's own transformation, moves that ran past the cut. Its plan is worked out again.
const BODY = 4;       // seconds a neighbour keeps to itself, besides its own landing
const HEROIC = new Set(['shock', 'fall', 'iris', 'flood', 'drop', 'tube', 'pleat', 'hall', 'span']);

export const forget = G => { delete G.plan; delete G.planFor; delete G.planning; };
const needs = G => Math.min(G.morph || 6, 9) + BODY;

function cutEnd(G, a) {
  if (Math.abs(G.t1 - a) < 1e-3) return;
  G.t1 = a;
  if ((G.arcEnd ?? a) > a) G.arcEnd = a;
  G.morph = Math.max(3, Math.min(G.morph || 6, 0.6 * (a - G.t0)));
  delete G.peak;
  if (G.xform && HEROIC.has(G.xform.id)) delete G.xform;
  // A move that was over before the cut stays (a Countdown that's already locked); anything still going, or that doesn't say when it ends, goes
  const endOf = m => m.to ?? (m.lockT != null ? m.lockT + (m.hold?.release ?? 2) : null);
  if (G.moves?.length) { G.moves = G.moves.filter(m => endOf(m) != null && endOf(m) <= a - G.morph); if (!G.moves.length) delete G.moves; }
  if (G.hero && !G.moves?.length) delete G.hero;
  forget(G);
}
function cutStart(G, b) {
  if (Math.abs(G.t0 - b) < 1e-3) return;
  G.t0 = b;
  if ((G.arcEnd ?? G.t1) < b + 3) G.arcEnd = G.t1;
  if (G.moves?.length) { G.moves = G.moves.filter(m => m.from != null && m.from >= b); if (!G.moves.length) delete G.moves; }
  if (G.hero && !G.moves?.length) delete G.hero;
  delete G.carry;
  forget(G);
}

// X may already be in the film (a Countdown, a landing kept as it is) or new. Returns X, or null with nothing changed.
export function carve(score, a, b, X) {
  const g = score.gestures, last = g.length - 1, others = g.filter(G => G !== X);
  // The one that ends at a, and the one that starts at b
  const ia = others.findIndex(G => G.t1 > a), ib = others.findIndex(G => G.t1 > b);
  if (ia < 0 || ib < 0) return null;
  const P = others[ia].t0 + needs(others[ia]) <= a ? others[ia] : others[ia - 1];
  const inB = others[ib], Q = inB.t0 < b && inB.t1 - b >= needs(inB) ? inB : others[ib + (inB.t0 < b ? 1 : 0)];
  // Only a side that moves has to keep its room
  if (!P || !Q || P === Q) return null;
  if (Math.abs(P.t1 - a) > 1e-3 && P.t0 + needs(P) > a) return null;
  if (Math.abs(Q.t0 - b) > 1e-3 && Q.t1 - b < needs(Q) && Q !== g[last]) return null;
  const p = g.indexOf(P), q = g.indexOf(Q);
  if (q <= p) return null;
  cutEnd(P, a); cutStart(Q, b);
  X.t0 = a; X.t1 = b;
  if ((X.arcEnd ?? b) > b) X.arcEnd = b;
  forget(X);
  g.splice(p + 1, q - p - 1, X);
  return X;
}
