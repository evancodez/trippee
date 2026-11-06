// The song acting on the sheet, written over a slot or two that frame() has already filled. Balance: the tune leads, the beat keeps time under it,
// and the chords shape the sheet. No one of them takes over.
//
// With the weight field on there's no global pulse any more. Nothing here moves the whole frame's brightness in time with the drums: the strong beats are rings of line weight that close on
// the harmony's focus (src/gl/chunks/song.js), and the only thing that lifts the whole sheet is the phrase's lung, which is slow. Who gets how much is the conductor's say, breath by breath.
//   edits.conductor = 0    fixed balance, for A/B
//   edits.reactPulse, reactMelody, reactTone, reactHarmony, reactLung    each channel by itself, for the judge. edits.reactAmt scales all of it.
import { OFF, FRAME, FAMILIES } from '../pattern/layout.js';
import { clamp, lerp, smoother } from './curves.js';
import { fineness } from './slot.js';
import { reactAt, chordLenses, pulseAt, melodyAt } from './react.js';
import { flag } from './flags.js';
import { handoverOn } from './morphclock.js';
import { coinAmbient } from './moves/coin.js';

const lensTmp = new Float32Array(12);

// How far the threshold moves the frame's brightness goes with how many families are XOR-ed: white = 1 - (1 - t)^n / 2, so about n/2 per unit. A pulse takes the same share of
// brightness out of every pattern, whatever it's made of, or a triangle lattice flashes on a beat that a sheet of stripes only leans into.
const PULSE = 0.13;
export const openFamilies = S => { let n = 0; for (let i = 0; i < FAMILIES; i++) if (S[OFF[`f${i}.on`]] >= 0.5 && Math.abs(S[OFF[`f${i}.d`]]) <= 1.01) n++; return Math.max(n, 1); };

// The tune pulls the lines along. It goes the way the pattern flows, because that's the way this pattern's lines can move without changing it: families can depend on each other
// (a triangle lattice's three phases add up to how big its triangles are), and moving one alone takes the whole frame from half white to mostly black and back with the tune.
function slideLines(S, g, by) {
  const flow = g?.flow || g?.pattern?.flow;
  let top = 0;
  if (flow) for (const k in flow) if (/^f\d\.ph$/.test(k)) top = Math.max(top, Math.abs(flow[k]));
  if (!top) { S[OFF['f0.ph']] += by; return; }
  for (const k in flow) if (/^f\d\.ph$/.test(k)) S[OFF[k]] += by * flow[k] / top;
}

// The numbers, all first guesses until a test says otherwise. See docs/NEXT.md 2.5.
const WEIGHT = 0.8;       // how far a strong beat moves the threshold at the top of its ring 0.6 from the focus, on one family
const GATHER = 2.14;      // ...and how much more that is once it's closed on the focus
const CLOSED = 0.72;      // the most that can reach, of solid: past this the lines of a fine pattern go to hairlines and the middle of the frame to a pale smudge
const SPEED = 0.7;        // how fast it travels, frame heights per second. Halved near the rim of a tall frame, this reaches every corner within the table
const LUNG = 0.22;         // how far the phrase's breath moves the threshold across the whole sheet
const LUNG_LENS = 0.13, LUNG_R = 1.6;
const SLIDE_MAX = 0.42, SLIDE_FAR = 0.085;   // how far the tune slides the lines, in cycles, and on broad ones in picture units: half a cycle of a broad line is half the frame changing colour
const RING_TENS = 0.42;   // the carrier of fat and thin lines at full tension
const RING_MEL = 0.34;    // the tune's own rings, per 6 semitones
const RING_V = 0.55;      // how fast the rings go out
const RING_LET = 1, RING_BACK = 1.5;     // seconds they take to let go before a transformation, and to come back after one
const SONG_FADE = 3, SONG_COMES = 0.3;   // seconds the song takes to leave a wander that's standing in; how far into a handover from no song it's arrived
const RING_DROP = 0.12;   // how far into a click's flight what's showing has let go of them
const MEL_STEP = 0.125, MEL_SPEED = 0.62;
const SHARP = 3.5;        // lines that move twice as far don't look twice as busy, so a lead has to be more than twice what's under it to read as one

const readArr = (R, arr, c) => { const x = clamp(c * R.hz, 0, R.n - 1.001), i = Math.floor(x); return arr[i] + (arr[i + 1] - arr[i]) * (x - i); };

// Moves what's drawn by (dx, dy) of frame, whatever size and turn the slot has.
function pan(S, dx, dy) {
  const r = S[OFF.rot], k = Math.max(S[OFF.scale], 1e-4), c = Math.cos(r), n = Math.sin(r);
  S[OFF.tx] -= (c * dx + n * dy) / k; S[OFF.ty] -= (-n * dx + c * dy) / k;
}

// How much of the rings each slot has, as a share [slot A, slot B]. On a plain frame it's only A. They've let go before a gesture's own transformation, and come back after it.
// A click's flight, which nobody saw coming, can't have let go first. So what's showing lets go over the very start of it, while it's barely moving, and what it's flying into, closed all that time and holding none
// of it, takes them up again as it lands. That has to be per slot: a duty that isn't zero opens a slot that's meant to be shut.
const plainRings = (G, t) => { const end = G.ringsEnd ?? (G.morph ? G.t1 - G.morph : null); return smoother((t - G.t0) / RING_BACK) * (end != null ? smoother((end - t) / RING_LET) : 1); };
const ringShares = [0, 0];
function ringsNow(st, score, edits, flight, dive) {
  const { x, G, t } = st;
  ringShares[0] = ringShares[1] = 0;
  if (st.two) {
    if (flight) {
      const h = score.handover;
      if (dive && st.from === h?.G) {
        ringShares[1] = smoother((x - 0.75) / 0.25);
        if (h.rings) ringShares[0] = (edits?.staticG ? 1 : plainRings(st.from, h.ts ?? t)) * (1 - smoother(x / RING_DROP));
      }
    } else if (!(st.plan?.close?.length || st.plan?.open?.length)) ringShares[0] = ringShares[1] = smoother(x / 0.1) * smoother((1 - x) / 0.1);
    return ringShares;
  }
  ringShares[0] = edits?.staticG ? 1 : plainRings(G, t);
  return ringShares;
}

export function songSheet(st, score, edits) {
  const Rc = score.react;
  let amt = edits?.reactAmt ?? 1;
  // The song leaving (a wander standing in for a film keeps its tables for a moment, score.songFades) or arriving where it wasn't (a handover from something with no song on it) comes and goes
  // gradually: it's been pushing the whole frame about, and that can't stop or start between two frames.
  if (score.songFades != null) amt *= 1 - smoother((st.t - score.songFades) / SONG_FADE);
  const hd = score.handover, hOn = !!hd && handoverOn(hd, st.t), hx = hOn ? smoother((hd.wall ? (hd.e - (hd.e0 ?? 0)) / hd.D : (st.t - hd.t0) / (hd.t1 - hd.t0)) / SONG_COMES) : 1;
  if (hOn && hd.rings === false) amt *= hx;
  if (!(Rc && amt > 0)) return;
  const { G, A, B, F, kind, x, solid, moveA, moveB } = st;
  const c = st.c ?? st.t, s = reactAt(Rc, c), big = 0.5 + 0.7 * s.energy;
  // One hero at a time, and everything else steps back for it. Eased at both ends (score.ambient, src/score/direct.js), and a coin takes the chords' pushing about off altogether, or it's a wobble on one pattern.
  let ambient = score.ambient && !edits?.staticG ? score.ambient(st.t) : 1, chordRoom = ambient * coinAmbient(G, st.t);
  // A click takes the film to another take, which has its own heroes. How far things had stepped back goes with what's showing, and comes round to the new take's as it flies.
  if (hOn && hd.ambient != null) { chordRoom = lerp(hd.ambient * coinAmbient(hd.G, hd.ts ?? st.t), chordRoom, hx); ambient = lerp(hd.ambient, ambient, hx); }
  // A gesture the rehearsal found flashing with the song on it takes less of it (src/music/rehearse.js), letting go of that at both ends so nothing steps.
  const calm = G.calm ? lerp(1, G.calm, smoother((st.t - G.t0) / 1.5) * smoother((G.t1 - st.t) / 1.5)) : 1;
  const mPulse = (edits?.reactPulse ?? 1) * amt * ambient * calm, mMel = (edits?.reactMelody ?? 1) * amt * ambient, mTone = (edits?.reactTone ?? 1) * amt * ambient, mHarm = (edits?.reactHarmony ?? 1) * amt * chordRoom, mLung = (edits?.reactLung ?? 1) * amt * ambient * calm;
  const flight = kind === 'dive' || kind === 'rise', dive = kind === 'dive';
  const knows = flag('understand') && !!Rc.M && !Rc.M.neutral;
  const weighs = flag('weight'), lensMap = knows && flag('lensMap'), lung = knows && flag('lung'), rings = knows && flag('tuneRings');
  // Who's leading. Without the conductor, the tune quietens the beat and everything else stays as it was.
  const conducted = Rc.conducted && flag('conductor') && edits?.conductor !== 0, g = s.gains;
  const gDrums = conducted ? g.drums : 1 - 0.45 * s.voiced, gTune = conducted ? Math.pow(g.tune, SHARP) : 1, gTone = conducted ? Math.pow(g.tone, SHARP) : 1, gHarm = conducted ? Math.pow(g.harm, SHARP) : 1;
  // In a flight what's being flown through can't follow the song. These are the shares frame() gives the numbers it knows about, for the ones it doesn't.
  const shareA = flight ? (dive ? 1 - smoother(x / 0.35) : 1) : (moveA ? 1 : 0), shareB = flight ? (dive ? 1 : smoother((x - 0.65) / 0.35)) : (moveB ? 1 : 0);

  // Tone: brighter sound, finer lines. Only on flat patterns, slowly.
  if (moveA && A[OFF['surf.kind']] < 0.5) A[OFF.freq] *= 1 + 0.16 * s.tone * mTone * gTone;
  if (moveB && B[OFF['surf.kind']] < 0.5) B[OFF.freq] *= 1 + 0.16 * s.tone * mTone * gTone;
  // A surface's lines can't change how many there are, and when the tone's leading it can't just have nothing to do. Its view comes in a little instead. That isn't a number frame() knows about.
  if (conducted) {
    const near = 1 - 0.09 * s.tone * mTone * gTone;
    if (shareA > 0 && A[OFF['surf.kind']] > 0.5) A[OFF.scale] *= lerp(1, near, shareA);
    if (shareB > 0 && B[OFF['surf.kind']] > 0.5) B[OFF.scale] *= lerp(1, near, shareB);
  }

  const fx = knows ? s.px * 0.45 : 0, fy = knows ? s.py * 0.45 : 0, Fo = FRAME.focus * 4;
  const Po = FRAME.pose * 4;
  let beat = 0;
  if (weighs) {
    // The only thing left that lifts the whole sheet is the lung. It goes through st.pulse so that frame() shares it out in a flight the way it always has.
    const breath = lung ? LUNG * Math.min(s.lung, 1.1) * mLung : 0;
    st.pulse = breath;
    const nA = 1 / openFamilies(A), nB = 1 / openFamilies(B), n = st.two && !flight ? lerp(nA, nB, st.T) : nA;     // a slide's slot A is still only A here, and ends up as B
    if (moveA) st.theta -= breath * n * (solid || 1);
    if (kind === 'dive') st.thetaB -= breath * nB * (solid || 1) * smoother((x - 0.6) / 0.4);
    // A ring is local, so what matters is that each family's lines visibly fatten in it. It still takes something off for how many there are, since they add up where they cross.
    const rA = Math.sqrt(nA), rB = Math.sqrt(nB), rn = st.two && !flight ? lerp(rA, rB, st.T) : rA;
    // A beat's weight never pushes anything past 90% of closing, and what's closing up in a flight has to end up exactly closed: that's why the ends of a flight have shares of their own.
    const w = WEIGHT * big * mPulse * (0.35 + 0.65 * gDrums);     // however quiet the drums are, a strong beat still lands. What they lose is reach
    let wa, wb = 0;
    if (flight) {
      wa = w * rA * st.sa * (dive ? 1 - smoother(x / 0.35) : 1 - smoother((x - 0.55) / 0.4));
      wb = w * rB * st.sb * (dive ? smoother((x - 0.6) / 0.4) : smoother((x - 0.65) / 0.35));
      wb = Math.min(wb, Math.max(0, Math.min(CLOSED * st.sb, 0.9 * st.sb - Math.abs(st.thetaB))) / GATHER);
      wa = Math.min(wa, Math.max(0, Math.min(CLOSED * st.sa, 0.9 * st.sa - Math.abs(st.theta))) / GATHER);
    } else {
      wa = moveA ? w * rn * (solid || 1) : 0;
      wa = Math.min(wa, Math.max(0, Math.min(CLOSED, 0.9 - Math.abs(st.theta) / (solid || 1))) * (solid || 1) / GATHER);
    }
    const Fw = FRAME.weight * 4, Wt = FRAME.wt * 4;
    if (wa > 0 || wb > 0) {
      F[Fw] = wa; F[Fw + 1] = wb; F[Fw + 2] = 1 / SPEED;
      for (let i = 0; i < 64; i++) { const v = pulseAt(Rc, c + (i - 32) / 8); F[Wt + i] = Math.min(1, 1.3 * v * v); }     // a swell in time is a band too wide to see as a ring, so it's squared
    }
    F[Fo] = fx; F[Fo + 1] = fy;
  } else {
    // The pulse: lines fatten a little on the strong beats and the middle swells. It steps back while the tune is playing.
    beat = s.pulse * big * mPulse * gDrums;
    st.pulse = PULSE * beat;
    if (moveA) st.theta -= st.pulse / openFamilies(A) * (solid || 1);
    if (kind === 'dive') st.thetaB -= st.pulse / openFamilies(B) * (solid || 1) * smoother((x - 0.6) / 0.4);
  }

  // The chord's shape. Mapped, it's three lenses set round where the harmony has gone, as strong as it's pulling, so the same chord always makes the same shape, and the slots go with them.
  if (lensMap) {
    const a = (0.12 + 0.4 * s.tension) * mHarm * gHarm;
    for (let i = 0; i < 3; i++) {
      const th = i * 2.0943951;
      F[Po + i * 4] = s.px + 0.45 * Math.cos(th); F[Po + i * 4 + 1] = s.py + 0.45 * Math.sin(th); F[Po + i * 4 + 2] = i === 1 ? -a : a; F[Po + i * 4 + 3] = 0.7;
    }
    const dx = 0.2 * s.px * mHarm * gHarm, dy = 0.2 * s.py * mHarm * gHarm;
    if (shareA > 0) pan(A, dx * shareA, dy * shareA);
    if (shareB > 0) pan(B, dx * shareB, dy * shareB);
  } else {
    chordLenses(Rc, c, lensTmp);
    for (let n = 0; n < 12; n += 4) { F[Po + n] = lensTmp[n]; F[Po + n + 1] = lensTmp[n + 1]; F[Po + n + 2] = lensTmp[n + 2] * big * mTone; F[Po + n + 3] = lensTmp[n + 3]; }
  }
  // The fourth lens: what swells the whole sheet. Once that was the beat. Now it's the phrase.
  if (weighs) { if (lung) { F[Po + 12] = fx; F[Po + 13] = fy; F[Po + 14] = LUNG_LENS * s.lung * mLung; F[Po + 15] = LUNG_R; } }
  else { F[Po + 12] = 0; F[Po + 13] = 0; F[Po + 14] = 0.07 * beat; F[Po + 15] = 1.15; }

  // The tune: it leaves the middle and travels out through the lines, a sample every eighth of a second
  const Ml = FRAME.mel * 4;
  // In a flight only the transformation moves: the tune pushing a big element's edge back and forth would be the whole frame changing colour with it.
  const still = weighs && flight ? (x < 0.25 ? 1 - smoother(x / 0.25) : x > 0.75 ? smoother((x - 0.75) / 0.25) : 0) : 1;
  F[Ml] = (0.085 + 0.09 * s.energy) * (rings ? 0.9 : 1) * mMel * gTune * still; F[Ml + 1] = 1 / (MEL_STEP * MEL_SPEED); F[Ml + 2] = G.melMode ?? 0;
  const Ms = FRAME.melS * 4;
  for (let n = 0; n < 32; n++) F[Ms + n] = melodyAt(Rc, Math.max(0, c - n * MEL_STEP));
  // ...and it carries the lines with it: as the note climbs they slide one way, as it falls they slide back, so a guitar slide pulls
  // the whole sheet. The sheet also leans a little with it.
  const carried = s.melSlow * s.voiced * mMel * gTune;
  const lean = 0.05 * carried;
  const slid = S => (weighs ? Math.min(SLIDE_MAX, SLIDE_FAR * fineness(S)) : SLIDE_MAX) * carried;
  if (moveA) { slideLines(A, st.from ?? G, slid(A)); A[OFF.rot] += lean; }
  if (moveB) { slideLines(B, st.to, slid(B)); B[OFF.rot] += lean; }

  // The rings going out. They work on each family's duty, and a duty that isn't zero opens a slot that's meant to be shut: a flight's inner pattern, closed at its start, would be all over the
  // frame in one jump, and a rise's outer one could never finish closing. So a flight has none. They've let go before it starts and come back after it lands, and a click's flight, which nobody
  // saw coming, can only drop them when it starts and bring them back as it lands, since it only ever flies in. A slide or a bend has them through its middle, unless it opens or closes a family.
  if (rings) {
    const M = Rc.M, one = M.bar < 1.2 ? 2 * M.bar : M.bar, lam = RING_V * one, down = M.bars?.length ? Rc.C(M.bars[0]) : 0;
    const [fa, fb] = ringsNow(st, score, edits, flight, dive), any = fa > 0 || fb > 0 ? 1 : 0;
    const Tu = FRAME.tune * 4, Ts = FRAME.tens * 4, Sp = FRAME.spare * 4;
    F[Sp + 2] = fa; F[Sp + 3] = fb;
    F[Tu] = RING_TENS * mHarm * gHarm * any; F[Tu + 1] = 1 / lam; F[Tu + 2] = (c - down) / one; F[Tu + 3] = 1 / (0.25 * RING_V);
    for (let k = 0; k < 16; k++) F[Ts + k] = clamp(readArr(Rc, Rc.tension, Math.max(0, c - k * 0.25)));
    F[Fo] = fx; F[Fo + 1] = fy; F[Fo + 2] = RING_MEL * mMel * gTune * any; F[Fo + 3] = 1 / (MEL_STEP * MEL_SPEED);
  }
}
