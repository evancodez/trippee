// A bend: flat patterns whose families all have partners. Each line travels to its partner, phase by phase.
import { OFF, FAMILIES, FRAME } from '../../pattern/layout.js';
import { lerp } from '../curves.js';

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

export default {
  id: 'bend',
  plan(a, b, ctx) {
    const { m, D } = ctx;
    const flat = s => s[OFF['surf.kind']] < 0.5;
    if (!(m.plain && flat(a) && flat(b) && m.allPaired && m.closeEnough && D >= 8)) return null;
    const { pair, flip, offset, close, open, ratio } = m;
    return { kind: 'bend', pair, flip, offset, close, open, ratio };
  },
  enter(st) {
    st.theta = lerp(st.thA, st.thB, st.T); st.solid = lerp(st.sa, st.sb, st.T);
    st.moveA = true; st.moveB = true;
  },
  write(st, A, B, F) {
    applyBend(A, B, st.plan, st.T, F);
    B[OFF.theta] = st.theta; A[OFF.theta] = st.theta;
  },
};
