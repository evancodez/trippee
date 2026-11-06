// Bud: every flower closes to a circle, its petal count changes unseen while it's round, and it opens as another, with the rings still running through it. docs/MODES.md, section 3.
// Everything else glides, as in a slide, so the flowers wander to their new places as they go. One family, in its own place, on one flow clock: the numbers don't jump, so a ring keeps its birth ink through it.
import { OFF } from '../../pattern/layout.js';
import { lerp, smoother } from '../../score/curves.js';
import { applySlide } from '../../score/xform/slide.js';

const STEPPED = ['field.a', 'field._2', 'field.scale'].map(n => OFF[n]);      // only ever change while the flower is round
const DEPTH = OFF['field.ph'];
const flat = s => s[OFF['field.kind']] === 4 && s[OFF['surf.kind']] < 0.5;

export default {
  id: 'bud',
  plan(a, b, ctx) {
    if (!flat(a) || !flat(b) || ctx.D < 5) return null;
    return { kind: 'bud', pair: [0, -1, -1, -1], flip: [false, false, false, false], offset: [0, 0, 0, 0], close: [], open: [], ratio: 1 };
  },
  enter(st) {
    st.theta = lerp(st.thA, st.thB, st.T); st.solid = lerp(st.sa, st.sb, st.T);
    st.moveA = true; st.moveB = true;
  },
  write(st, A, B) {
    const T = st.T, from = T < 0.5 ? A : B, kept = STEPPED.map(n => from[n]);
    const depth = T < 0.5 ? A[DEPTH] * (1 - smoother(T / 0.5)) : B[DEPTH] * smoother((T - 0.5) / 0.5);
    A[OFF.theta] = st.theta; B[OFF.theta] = st.theta;
    // Everything that isn't the petals goes a little gentler than T, or a change in how many lines there are sweeps the far rings by faster than the flash limit, right where T is steepest. It still starts and ends at rest.
    applySlide(A, B, st.plan, st.x * st.x * (3 - 2 * st.x));
    STEPPED.forEach((n, i) => { A[n] = kept[i]; });
    A[DEPTH] = depth;
    st.two = false;
  },
};
