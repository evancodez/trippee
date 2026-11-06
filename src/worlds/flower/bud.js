// Bud: every flower closes to a circle, its petal count changes unseen while it's round, and it opens as another, with the rings still running through it. docs/MODES.md, section 3.
// Everything else glides, as in a slide, so the flowers wander to their new places as they go. One family, in its own place, on one flow clock: the numbers don't jump, so a ring keeps its birth ink through it.
import { OFF } from '../../pattern/layout.js';
import { lerp, smoother } from '../../score/curves.js';
import { applySlide } from '../../score/xform/slide.js';

const STEPPED = ['field.a', 'field._2', 'field.scale'].map(n => OFF[n]);      // only ever change while the flower is round
const DEPTH = OFF['field.ph'];
const flat = s => s[OFF['field.kind']] === 4 && s[OFF['surf.kind']] < 0.5;
// How far ahead of the clock the rings are, in lines per unit of budRest, over a Bud. Starts and ends at rest and at 0. Slowest at the middle, at 2 pi lines of budRest per Bud.
export const giveWay = x => Math.sin(2 * Math.PI * x) * Math.sin(Math.PI * x) ** 2;
const REST = [0.8, 1.4];       // lines. On a Bud of ten seconds, 1.4 takes .9 of a line a second off the rings at the middle and puts .3 back at the ends

export default {
  id: 'bud',
  // What a rehearsal can try on a Bud that flashes (motion.keep says it can't take it away). A tile sees a flash for each band that passes when the bands are as big as it is, and the rings are already about one a second. It's a Bud between patterns that put a very different number of lines in a corner that goes over, and only there and only then. Then it may take longer.
  levers: {
    'rings give way': G => { if (G.budRest) return null; G.budRest = REST[0]; return () => { delete G.budRest; }; },
    'rings give way more': G => { if (G.budRest !== REST[0]) return null; G.budRest = REST[1]; return () => { G.budRest = REST[0]; }; },
  },
  plan(a, b, ctx) {
    if (!flat(a) || !flat(b) || ctx.D < 5) return null;
    return { kind: 'bud', onClock: true, pair: [0, -1, -1, -1], flip: [false, false, false, false], offset: [0, 0, 0, 0], close: [], open: [], ratio: 1 };
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
