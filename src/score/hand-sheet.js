// The hand, on top of whatever the film is doing: everything in app.edits, written over what frame() has so far.
// In a flight, what the hand changes goes to the pattern that's free to move, never to the one being flown through.
import { OFF, FRAME } from '../pattern/layout.js';
import { clamp, lerp, smoother } from './curves.js';
import { pathOff } from './slot.js';

// A floor never tips far enough to show its horizon, however far out the hand has zoomed.
function noHorizonAt(s, zoom, aspect) {
  if (s[OFF['surf.kind']] !== 1) return;
  const q = n => Math.abs(s[OFF[n]]);
  if (q('q.xx') + q('q.yy') + q('q.xy') > 1e-4) return;
  const r = s[OFF['cam.roll']], reach = (Math.abs(Math.cos(r)) + Math.abs(Math.sin(r)) * aspect) * 1.5 * zoom;
  const max = Math.atan(s[OFF['cam.dist']] / reach);
  s[OFF['cam.pitch']] = clamp(s[OFF['cam.pitch']], -max, max);
}

// Knobs that mean the same on any pattern. Flying through one pattern, they turn the other by as much as they've turned this one.
const TIMES = new Set(['scale', 'freq']), PLUS = new Set(['rot', 'tx', 'ty']);

export function handSheet(st, edits) {
  if (!edits) return;
  const { A, B, F, two, kind, x } = st;
  const flight = kind === 'dive' || kind === 'rise';

  // The view: the whole frame, before either pattern, so both go together.
  const J = edits.journey || 0, spin = edits.spin || 0, jx = edits.jx || 0, jy = edits.jy || 0;
  if (J || spin || jx || jy) {
    let z = Math.exp(-J), hx = jx, hy = jy;
    const aspect = edits.aspect || 16 / 9;
    if (flight) {
      // A flight's element is only as big as the frame needs, with a little room. Zoomed right out you'd see past it, so the view comes in as it arrives.
      const room = 1.15 * Math.hypot(Math.max(aspect, 1.9), 1) + 0.46, far = z * Math.hypot(aspect, 1) + Math.hypot(hx, hy);
      if (far > room) { const c = lerp(1, room / far, kind === 'dive' ? smoother(x / 0.85) : 1); z *= c; hx *= c; hy *= c; }
    }
    const V = FRAME.handv * 4;
    F[V] = z; F[V + 1] = spin; F[V + 2] = hx; F[V + 3] = hy;
    if (z > 1) { noHorizonAt(A, z, aspect); if (two) noHorizonAt(B, z, aspect); }
  }

  if (edits.over) {
    for (const p in edits.over) {
      const o = pathOff(p), v = edits.over[p];
      if (kind === 'dive') {
        // In a handover the knob belongs to the pattern opening up. In a gesture's own dive it belongs to the one being flown through, which stays put.
        if (edits.inHandover) B[o] = v;
        else if (TIMES.has(p)) B[o] *= v / (A[o] || 1);
        else if (PLUS.has(p)) B[o] += v - A[o];
      } else if (two && edits.inHandover) B[o] = v;
      else A[o] = v;
    }
  }

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
  // Line weight, on what's free to move. Inside a dive the opening pattern starts out closed to its element's colour, so it only takes this as it opens.
  // The threshold never quite reaches solid under the hand either.
  if (edits.duty) {
    if (kind === 'dive') { const k = smoother((x - 0.1) / 0.5), lim = lerp(st.sb, 0.9 * st.sb, k); st.thetaB = clamp(st.thetaB + edits.duty * k, -lim, lim); }
    else st.theta += edits.duty;
  }
  if (edits.invert) A[OFF.invert] = 1 - A[OFF.invert];
}
