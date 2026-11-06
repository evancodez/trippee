// One slot's numbers: what one gesture is at one moment. A pure function of (gesture, t, phi).
import { OFF, SLOT_FLOATS, FAMILIES } from '../pattern/layout.js';
import { flatten } from '../pattern/genome.js';
import { clamp, lerp, smoother, evalTrack } from './curves.js';
import { runMoves } from './moves/index.js';
import { flag } from './flags.js';

const cache = new Map();
export function base(pattern) {
  let b = cache.get(pattern);
  if (!b) { b = flatten(pattern.g); cache.set(pattern, b); }
  return b;
}

export const pathOff = p => { const o = OFF[p]; if (o === undefined) throw new Error('no such number: ' + p); return o; };

// The film's strength is bold shapes, with hairlines only in passing, and a morph between two fine patterns is only wallpaper. So a
// gesture rides just the part of its long move that stays this bold. In cycles per picture unit: at 720p that's a period of about 20 px.
const BOLD = 12;
const limR = new Float32Array(SLOT_FLOATS);
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

// A gesture's arcs with more of a move on top, over just the part [lo, hi] of its long move that it rides. Later arcs win, so these replace whatever those numbers
// were doing there. They start from where those numbers already were, so nothing else changes.
export function withTravel(arcs, lo, hi, { rot, scale }) {
  const at = [lo, hi], more = arcs.map(a => ({ ...a }));
  if (rot) more.push({ path: 'rot', from: rot[0], to: rot[1], at });
  if (scale) more.push({ path: 'scale', from: scale[0], to: scale[1], log: true, at });
  return more;
}

const ARC_START = 3;      // seconds
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
  if (G.uTrack) x = clamp(evalTrack(G.uTrack, t));     // a Ramp: the long move on a clock of its own. See moves/ramp.js
  else if (t <= G.t0) x = 0;
  else if (G.period) { const w = ((t - G.t0) / G.period) % 2; x = smoother(w < 1 ? w : 2 - w); }
  // Arcs run to a fixed horizon, not to t1, so rewriting a gesture's end (the user picked something else) can't make them jump.
  else {
    // Arriving from a transformation the long move has been at rest, so it picks up speed over the first moments and has caught up by the end of them.
    const H = Math.max((G.arcEnd ?? G.t1) - G.t0, 1e-3), e = t - G.t0, tau = Math.min(ARC_START, H / 3), s = e / tau;
    x = clamp((e < tau ? tau * s * s * (2 - s) : e) / H);
  }
  // ...and let go, it picks up speed the same way
  const e = G.thaw;
  if (e && t < e.t0 + e.tau) { const k = 1 - clamp((t - e.t0) / e.tau); x = Math.min(1, x + e.a * k * k); }
  return lo + (hi - lo) * x;
}

// One slot's numbers at time t for gesture G
export function fillSlot(out, G, t, pat, opts = {}) {
  out.set(base(pat));
  const u = arcU(G, opts.uT ?? t);       // uT: the long move's own clock, where a film walks (hearing 1). Otherwise it's t.
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
  if (G.moves) runMoves(out, { u, t, phi, OFF, G, uT: opts.uT ?? t });
  // A fall lands at speed, and this pattern carries on at that speed and coasts to rest. It lands a little small so as to end up about the size it was rehearsed at.
  const c = G.carry;
  if (c && G.freezeU == null && Math.abs(G.t0 - c.t1) < 1e-3 && flag('fall')) {      // a gesture rewritten to start at some other moment (a pick) didn't arrive by a fall
    const left = t <= c.t1 ? 0 : 1 - Math.exp(-(t - c.t1) / c.tau);
    out[OFF.scale] *= Math.exp(c.K * left - c.pre);
    if (c.w) out[OFF.rot] += c.w * c.tau * left;
  }
  if (G.over) for (const p in G.over) out[pathOff(p)] = G.over[p];
}

// A flat floor never tips far enough to show its horizon: there's nothing beyond it worth seeing.
export function noHorizon(s, aspect) {
  if (s[OFF['surf.kind']] !== 1) return;
  const q = n => Math.abs(s[OFF[n]]);
  if (q('q.xx') + q('q.yy') + q('q.xy') > 1e-4) return;     // a plane or a slab: anything that runs off to the horizon, and nothing that curves
  const r = s[OFF['cam.roll']], reach = (Math.abs(Math.cos(r)) + Math.abs(Math.sin(r)) * aspect) * 1.5;   // well past the top of the frame, or the far lines thicken into a grey band
  const max = Math.atan(s[OFF['cam.dist']] / reach);
  s[OFF['cam.pitch']] = clamp(s[OFF['cam.pitch']], -max, max);
}

export function thetaOf(G, t) { return G.thetaBody ? evalTrack(G.thetaBody, t) : 0; }

export function fineness(s) {
  let k = 0;
  for (let i = 0; i < FAMILIES; i++) {
    if (s[OFF[`f${i}.on`]] < 0.5 || Math.abs(s[OFF[`f${i}.d`]]) > 0.98) continue;
    const g = n => Math.abs(s[OFF[`f${i}.${n}`]]);
    k = Math.max(k, Math.hypot(g('x'), g('y')) + g('r1') + g('r2') + (g('l1') + g('l2')) / 0.7 + (g('t1') + g('t2')) / 4);
  }
  return Math.max(k * Math.max(s[OFF.freq], 1e-3) / Math.max(s[OFF.scale], 1e-4), 1e-3);
}
