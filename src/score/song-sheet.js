// The song acting on the sheet, written over a slot or two that frame() has already filled. Balance: the tune leads, the beat keeps time under it,
// and the chords shape the sheet. No one of them takes over.
import { OFF, FRAME, FAMILIES } from '../pattern/layout.js';
import { smoother } from './curves.js';
import { reactAt, chordLenses } from './react.js';

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

export function songSheet(st, score, edits) {
  const Rc = score.react, amt = edits?.reactAmt ?? 1;
  if (!(Rc && amt > 0)) return;
  const { t, G, A, B, F, kind, x, solid, moveA, moveB } = st;
  const s = reactAt(Rc, t), big = 0.5 + 0.7 * s.energy;
  const mPulse = (edits?.reactPulse ?? 1) * amt, mMel = (edits?.reactMelody ?? 1) * amt, mTone = (edits?.reactTone ?? 1) * amt;
  // Tone: brighter sound, finer lines. Only on flat patterns, slowly.
  if (moveA && A[OFF['surf.kind']] < 0.5) A[OFF.freq] *= 1 + 0.16 * s.tone * mTone;
  if (moveB && B[OFF['surf.kind']] < 0.5) B[OFF.freq] *= 1 + 0.16 * s.tone * mTone;
  // The pulse: lines fatten a little on the strong beats and the middle swells. It steps back while the tune is playing.
  const beat = s.pulse * big * mPulse * (1 - 0.45 * s.voiced);
  st.pulse = PULSE * beat;
  if (moveA) st.theta -= st.pulse / openFamilies(A) * (solid || 1);
  if (kind === 'dive') st.thetaB -= st.pulse / openFamilies(B) * (solid || 1) * smoother((x - 0.6) / 0.4);
  const Po = FRAME.pose * 4;
  chordLenses(Rc, t, lensTmp);
  for (let n = 0; n < 12; n += 4) { F[Po + n] = lensTmp[n]; F[Po + n + 1] = lensTmp[n + 1]; F[Po + n + 2] = lensTmp[n + 2] * big * mTone; F[Po + n + 3] = lensTmp[n + 3]; }
  F[Po + 12] = 0; F[Po + 13] = 0; F[Po + 14] = 0.07 * beat; F[Po + 15] = 1.15;
  // The tune: it leaves the middle and travels out through the lines, a sample every eighth of a second
  const Ml = FRAME.mel * 4, step = 0.125, speed = 0.62;
  F[Ml] = (0.085 + 0.09 * s.energy) * mMel; F[Ml + 1] = 1 / (step * speed); F[Ml + 2] = G.melMode ?? 0;
  const Ms = FRAME.melS * 4;
  for (let n = 0; n < 32; n++) F[Ms + n] = reactAt(Rc, Math.max(0, t - n * step)).melody;
  // ...and it carries the lines with it: as the note climbs they slide one way, as it falls they slide back, so a guitar slide pulls
  // the whole sheet. The sheet also leans a little with it.
  const slide = 0.42 * s.melSlow * s.voiced * mMel;
  const lean = 0.05 * s.melSlow * s.voiced * mMel;
  if (moveA) { slideLines(A, st.from ?? G, slide); A[OFF.rot] += lean; }
  if (moveB) { slideLines(B, st.to, slide); B[OFF.rot] += lean; }
}
