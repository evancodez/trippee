// frame(score, t): what the picture is at any moment. A pure function, so seeking, export and exact landings are free.
//
// A score is a list of gestures end to end. Each is one pattern making one long move. In the last `morph` seconds of a gesture it
// transforms into the next, in one of three ways, and only one thing moves while it does:
//   slide   the same kind of pattern: its numbers glide to the next one's, so warps grow and lines straighten
//   bend    lines of one become lines of the other, phase by phase
//   dive    a flight into one element of the pattern, which has the next pattern inside it (or, rising, out of one)
// Nothing is laid over anything else.
import { OFF, SLOT_FLOATS, FRAME } from '../pattern/layout.js';
import { clamp, lerp, smoother } from './curves.js';
import { fillSlot, noHorizon, thetaOf } from './slot.js';
import { morphAt } from './morphclock.js';
import { planSteps } from './xform/plan.js';
import { xformOf } from './xform/index.js';
import { songSheet, openFamilies, melOf } from './song-sheet.js';
import { handSheet } from './hand-sheet.js';
import { hearSheet, hearStart } from './hear.js';
import { wearOne } from './camera.js';
import { timeSheet } from './time-sheet.js';

export { base, fillSlot, arcU, boldRange, fineness, thetaOf, noHorizon } from './slot.js';

function indexAt(g, t) {
  let lo = 0, hi = g.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g[m].t0 <= t) lo = m; else hi = m - 1; }
  return lo;
}

const lim = new Float32Array(SLOT_FLOATS), lim3 = new Float32Array(SLOT_FLOATS);

// Set by src/worlds/engine.js when it loads, which is when someone first asks for a world. Until then this is one check of a null.
let worldWrite = null;
export const wearWorlds = f => { worldWrite = f; };

// Time runs on for a moment and then comes to rest (or starts from rest), so only the transformation moves while it happens.
const easeOut = (t, t0, stop) => (t <= t0 ? t : t0 + stop * (x => x - x * x / 2)(Math.min(1, (t - t0) / stop)));
const easeIn = (t, t1, stop) => (t >= t1 ? t : t1 - stop * (x => x - x * x / 2)(Math.min(1, (t1 - t) / stop)));

// Worked out once per transition, from both patterns at rest, which doesn't depend on when anyone asks: starting early only moves the cost.
// A plan a transformation is waiting on finishes at once. One that's only coming up takes a step and may answer null.
function planFor(m, dtf, stop, phiOf, R, aspect, now, world) {
  const { from, to, t0, D, holder, phiFrom, handover } = m;
  if (holder.plan && holder.planFor === to) return holder.plan;
  let w = holder.planning;
  if (!w || w.to !== to || (!handover && w.t0 !== t0) || w.D !== D) {     // a handover's t0 only comes out the same to within rounding
    const tA0 = holder.still ? holder.ts : t0 + dtf + stop / 2, tB0 = t0 + D - stop / 2;
    fillSlot(lim, from, tA0, from.pattern, { phi: phiFrom ? phiFrom(tA0, from, tA0, 0) : phiOf(from, tA0, undefined, 0) });
    fillSlot(lim3, to, tB0, to.pattern, { phi: phiOf(to, tB0, undefined, 0) });
    noHorizon(lim, aspect); noHorizon(lim3, aspect);
    lim[OFF.theta] = thetaOf(from, tA0); lim3[OFF.theta] = thetaOf(to, tB0);
    // A handover can only ever fly in. Rising needs the next pattern at rest with its element where the plan found it, and a film's clock doesn't
    // stop for that: its element would have moved on, and the frame would sit inside whatever had moved there, one flat colour.
    const hurry = { now };
    w = holder.planning = { to, t0, D, hurry, steps: planSteps(lim, lim3, { R, aspect, D, rise: handover ? false : from.rise, xform: handover ? to.pattern.via ?? to.pattern.arrive ?? null : from.xform ?? world?._xform, noGlide: handover ? holder.noGlide : from.noGlide, quick: !handover && from.quick, ink: world?.ink }, hurry) };
  }
  w.hurry.now = now;
  let step = w.steps.next();
  while (now && !step.done) step = w.steps.next();
  if (!step.done) return null;
  holder.planning = null;
  holder.plan = step.value; holder.planFor = to;
  return step.value;
}

const LOOK_AHEAD = 2;     // seconds before a morph that its plan starts being worked out, a look a frame
const PLAN_PATIENCE = 0.4;     // seconds of a handover by hand

// In a flight only what's inside the element may follow the song, or the element would slip out from under the camera. But a slot can't just stop
// following it or start to: wherever the song had pushed it to would be gone in one frame, and on a sheet of fine lines that's the whole picture
// jumping. So the one being flown through lets go over the start of the flight, or takes up over the end, while it's still barely moving.
const SONG_NUMS = ['freq', 'f0.ph', 'f1.ph', 'f2.ph', 'f3.ph', 'rot'];       // what the song writes into a slot
// A knob held into a gesture's own transformation goes onto the gesture (leaving() in src/tools/input.js), and nothing may move as it does. Held, it was written over the song, and
// the song worked from the pattern's own number: how fine the lines are says how far the tune slides them. So on the gesture too the song works from that number and the knob has the last word.
const fromKnob = (S, g) => {
  if (!g?.over || !g.overWas) return null;
  const kept = [];
  for (const p in g.overWas) if (g.over[p] != null) { const o = OFF[p]; kept.push(o, S[o]); S[o] = g.overWas[p]; }
  return kept;
};
const backToKnob = (S, kept) => { if (kept) for (let i = 0; i < kept.length; i += 2) S[kept[i]] = kept[i + 1]; };
function songInFlight(st, score, edits) {
  const { x, A, B, sa, sb, kind, solid, moveA, moveB } = st, dive = kind === 'dive';
  const wA = dive ? 1 - smoother(x / 0.35) : 1, wB = dive ? 1 : smoother((x - 0.65) / 0.35);
  const a0 = SONG_NUMS.map(n => A[OFF[n]]), b0 = SONG_NUMS.map(n => B[OFF[n]]), thA = st.theta, thB = st.thetaB;
  st.moveA = st.moveB = true; st.solid = 1;
  songSheet(st, score, edits);
  SONG_NUMS.forEach((n, i) => { A[OFF[n]] = lerp(a0[i], A[OFF[n]], wA); B[OFF[n]] = lerp(b0[i], B[OFF[n]], wB); });
  // Each pattern takes the pulse at its own size, so landing on the plain path changes nothing
  const pulse = st.pulse ?? 0;
  st.theta = thA - pulse / openFamilies(A) * sa * (dive ? wA : 1 - smoother((x - 0.55) / 0.4));     // what's closing up has to end up exactly closed
  st.thetaB = thB - pulse / openFamilies(B) * sb * (dive ? smoother((x - 0.6) / 0.4) : wB);
  st.moveA = moveA; st.moveB = moveB; st.solid = solid;
}

export function frame(score, t, R, edits) {
  const tReal = t, beyond = edits?.beyond;
  const tFilm = score.time ? score.time(t) : t;       // the film's own stops: it freezes while the band stops, and pays the time back
  if (beyond) t = beyond.time(tFilm, score);          // Beyond's stops: the picture's clock with a rest taken out of it
  else t = tFilm;
  // The song's tables don't lag behind a rest: they stand still for it on their own axis and are in step the moment the sound's back. Colour's lag they share, since it's the picture's own.
  // No rests in this song: the axis is the picture's clock itself.
  const c = score.time?.c ? score.time.c(tReal) - (tFilm - t) : t;
  if (score.rewind) t = score.rewind(t);       // the picture's clock runs backward for a while, and the song's own tables don't: src/score/moves/time.js
  const g = score.gestures, A = R.slotA, B = R.slotB, F = R.frame;
  const i = indexAt(g, t);
  const held = edits?.staticG;
  const G = held ?? g[i], N = held ? null : g[i + 1];
  const pat = G.pattern;
  // How far the layer that follows the song is turned up: src/score/hear.js. At 0 nothing it does reaches this frame.
  const hearNow = score.hear ? edits?.hear ?? hearStart() : 0;
  score.hearNow = hearNow;
  if (score.walk) { score.walk.on = hearNow; score.walk.gain = hearNow * Math.min(1.5, edits?.reactPulse ?? 1); }
  // rho: how much of that clock's speed is left, as it slows into or picks up out of a transformation. A film that walks needs it, and every other clock ignores it.
  const phiOf = (gg, tt, sc = score, rho) => (sc.phi ? (rho == null ? sc.phi(tt, gg) : sc.phi(tt, gg, t, rho)) : tt * 0.25);
  const walkT = hearNow > 0 && score.walk ? (tt, rho = 1) => tt + rho * score.walk(t) : null;
  F.fill(0);
  F.set(score.colors?.paper ?? [0, 0, 0, 1], FRAME.paper * 4);
  F.set(score.colors?.ink ?? [1, 1, 1, 1], FRAME.ink * 4);
  F.set(score.colors?.band1 ?? [1, 0.2, 0.1, 1], FRAME.band1 * 4);
  F[FRAME.plate * 4] = edits?.plate ?? 0;
  F[FRAME.pair * 4] = F[FRAME.pair * 4 + 1] = F[FRAME.pair * 4 + 2] = F[FRAME.pair * 4 + 3] = -1;

  const aspect = R.canvas ? R.canvas.width / R.canvas.height : 16 / 9;
  const phi = phiOf(G, t);
  // What the frame has so far, handed round to the transformation, the song and the hand. moveA, moveB: which slots they may move.
  const st = { t, c, G, A, B, F, x: 0, T: 0, kind: null, plan: null, two: false, solid: pat.solid ?? 1, theta: thetaOf(G, t), thetaB: 0, moveA: true, moveB: false, sa: 0, sb: 0, thA: 0, thB: 0 };

  // Which transformation is under way, if any: from `from` (at its own time) into `to`, over x from 0 to 1.
  let m = morphAt(score, G, N, t), shown = G, xf = null;
  if (score.camera) { wearOne(score, G); if (m) wearOne(score, m.to); }      // a gesture made after the film was, by a pick
  if (m) {
    const { from, to, tf, t0, D, phiFrom } = m;
    const stop = Math.min(D * 0.4, 3.5), dtf = tf - t;
    const h = m.handover && m.holder.wall ? m.holder : null;
    const rhoA = h?.still ? 1 : 1 - Math.min(1, (t - t0) / stop), rhoB = m.handover ? 1 : 1 - Math.min(1, (t0 + D - t) / stop);
    // What's being left stays on its own film's song, wherever a seek has just put this frame: the flow's clock leans on the song's bars, and a jump in them would jump it. A paused picture stays exactly where it was.
    const nowA = h?.still ? h.ts : m.handover ? tf : t, pf = tt => (phiFrom ? phiFrom(tt, from, nowA, rhoA) : phiOf(from, tt, score, rhoA));
    const tA = h?.still ? h.ts : easeOut(tf, t0 + dtf, stop);
    const tB = m.handover ? t : easeIn(t, t0 + D, stop);
    // A click's plan hasn't had a look ahead. Looking all at once would stall the picture the moment it's clicked, so what's showing carries on for the few frames it takes,
    // and the transformation starts from 0 when it's ready. One that's been waited on this long finishes at once.
    st.plan = planFor(m, dtf, stop, phiOf, R, aspect, !(h && h.e < PLAN_PATIENCE), score.world);
    if (!st.plan) h.e0 = h.e;
    fillSlot(A, from, tA, from.pattern, { phi: pf(tA), uT: walkT && !m.handover ? walkT(tA, rhoA) : undefined });
    shown = st.from = from;
    if (st.plan) {
      st.kind = st.plan.kind; st.x = score.walkMorph && !m.handover ? score.walkMorph(m.x, t, D) : m.x; st.to = to;
      fillSlot(B, to, tB, to.pattern, { phi: phiOf(to, st.plan.onClock ? t : tB, score, rhoB), uT: walkT ? walkT(tB, rhoB) : undefined });      // onClock: a transformation that keeps the film's clock running through it (a world's)
      st.sa = from.pattern.solid ?? 1; st.sb = to.pattern.solid ?? 1;
      st.T = smoother(st.x);
      st.thA = thetaOf(from, tA); st.thB = thetaOf(to, tB);
      xf = xformOf(st.kind);
      xf.enter(st);
      st.two = true;
    } else {
      st.G = from; st.solid = from.pattern.solid ?? 1; st.theta = thetaOf(from, tA);
      m = null;
    }
  } else {
    fillSlot(A, G, t, pat, { phi, uT: walkT ? walkT(t) : undefined });
  }
  if (N && G.morph) {
    const t0 = G.t1 - G.morph;
    if (t <= t0 && t > t0 - LOOK_AHEAD) planFor({ from: G, to: N, t0, D: G.morph, holder: G, handover: false, phiFrom: null }, 0, Math.min(G.morph * 0.4, 3.5), phiOf, R, aspect, false, score.world);
  }

  const keptA = fromKnob(A, st.from ?? G), keptB = st.two ? fromKnob(B, st.to) : null;
  if (score.react && (st.kind === 'dive' || st.kind === 'rise')) songInFlight(st, score, edits);
  else songSheet(st, score, edits);
  backToKnob(A, keptA); backToKnob(B, keptB);
  // The tune's field takes its shape from the gesture, and a shape can't change while it's pushing anything: it dies away to the middle of the transformation and returns in the new one.
  if (m && score.react && melOf(m.from, hearNow) !== melOf(m.to, hearNow)) {
    const Ml = FRAME.mel * 4;
    F[Ml] *= smoother(Math.abs(2 * m.x - 1));
    F[Ml + 2] = melOf(m.x < 0.5 ? m.from : m.to, hearNow);
  }
  handSheet(st, edits);
  hearSheet(st, score, edits, tReal, st.songHx ?? 1);
  timeSheet(st, score, R, edits, tReal, phiOf, walkT);

  // Never empty, however much the song and the hand push it, except while a flight is closing one up inside an element
  if (st.kind !== 'rise') st.theta = clamp(st.theta, -0.9 * st.solid, 0.9 * st.solid);
  noHorizon(A, aspect);
  if (st.two) noHorizon(B, aspect);

  if (xf) xf.write(st, A, B, F);
  else A[OFF.theta] = st.theta;
  if (beyond) beyond.write(F, tFilm, score, shown, m ? m.to : null, st.T, st.plan);     // the plates stand still in a rest with everything else
  if (worldWrite) worldWrite(st, score, R, edits);
  return { G, c, theta: st.theta, solid: st.solid, phi, T: st.T, kind: st.kind, from: m ? m.from : null, N: m ? m.to : null };
}

// The threshold a gesture wants at time t. Patterns can read it; `solid` isn't reached any more.
export const thetaAt = (G, t) => thetaOf(G, t);
