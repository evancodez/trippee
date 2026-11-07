// How one of this world's patterns turns into another, with the rings still running through it. One family, in its own place, on one flow clock: the numbers don't jump, so a ring keeps its birth ink all the way. docs/MODES.md, section 3.
// Bud: every flower closes to a circle, its petal count or its motif changes unseen while it's round, and it opens as another. Everything else glides, as in a slide, so the flowers wander to their new places as they go.
// Melt: the field lets go altogether. Rings relax into the stripes they're lying on, what's XOR-ed through them can open or close, and rings rise out of the stripes as the next pattern. Anything can melt, and it's how a flower gets to a check.
// Tide: the next pattern arrives as a front that crosses the frame, or runs out of one flower. In front of it the old pattern, behind it the new one, and each line bends across. Two different folds of the sheet can do this: nothing else can.
import { OFF, FAMILIES, FRAME } from '../../pattern/layout.js';
import { lerp, smoother } from '../../score/curves.js';
import { applySlide } from '../../score/xform/slide.js';

const STEPPED = ['field.a', 'field.b', 'field._2', 'field.scale'].map(n => OFF[n]);      // only ever change while the flower is round
const DEPTH = OFF['field.ph'], SHARE = OFF['field.k0'], TILE = OFF['blobs.beta'];
// Everything only the field reads. Once the field's gone these can be anything at all.
const FIELDS = [...STEPPED, DEPTH, SHARE, TILE, OFF['field.spin'], OFF['field._1'], OFF['star._1'], OFF['star._2'], OFF['star._3'], OFF['spare.a'], OFF['spare.b'], OFF['spare.c'], OFF['spare.d'],
  ...['x1', 'y1', 'r1', 'a1', 'x2', 'y2', 'r2', 'a2', 'x3', 'y3', 'r3', 'a3'].map(n => OFF[`blobs.${n}`]), ...['x', 'y', 'q', 'ay'].flatMap(n => [OFF[`p1.${n}`], OFF[`p2.${n}`]])];
const flat = s => s[OFF['field.kind']] === 4 && s[OFF['surf.kind']] < 0.5 && s[OFF['droste.lnS']] === 0;
export const hasField = s => s[SHARE] !== 0;
// How far ahead of the clock the rings are, in lines per unit of budRest, over a Bud. Starts and ends at rest and at 0. Slowest at the middle, at 2 pi lines of budRest per Bud.
export const giveWay = x => Math.sin(2 * Math.PI * x) * Math.sin(Math.PI * x) ** 2;
const REST = [0.8, 1.4];       // lines. On a Bud of ten seconds, 1.4 takes .9 of a line a second off the rings at the middle and puts .3 back at the ends

const real = (s, i) => s[OFF[`f${i}.on`]] >= 0.5 && Math.abs(s[OFF[`f${i}.d`]]) <= 1.01;
const winds = (s, i) => Math.abs(s[OFF[`f${i}.t1`]]) + Math.abs(s[OFF[`f${i}.t2`]]) > 1e-6;
// The numbered family stays where it is. What's XOR-ed through it stays if it can and otherwise closes, and whatever the next one has opens.
function partners(a, b) {
  const pair = [0, -1, -1, -1], offset = [0, 0, 0, 0], close = [], open = [];
  for (let i = 1; i < FAMILIES; i++) {
    const ra = real(a, i), rb = real(b, i);
    if (ra && rb && winds(a, i) === winds(b, i) && (!winds(a, i) || ['t1', 't2'].every(n => a[OFF[`f${i}.${n}`]] === b[OFF[`f${i}.${n}`]]))) { pair[i] = i; offset[i] = Math.round(a[OFF[`f${i}.ph`]] - b[OFF[`f${i}.ph`]]); }
    else { if (ra) close.push(i); if (rb) open.push(i); }
  }
  return { pair, flip: [false, false, false, false], offset, close, open, ratio: 1 };
}
const LEVERS = {
  // What a rehearsal can try on one that flashes (motion.keep says it can't take it away). A tile sees a flash for each band that passes when the bands are as big as it is, and the rings are already about one a second. It's a Bud between patterns that put a very different number of lines in a corner that goes over, and only there and only then. Then it may take longer.
  'rings give way': G => { if (G.budRest) return null; G.budRest = REST[0]; return () => { delete G.budRest; }; },
  'rings give way more': G => { if (G.budRest !== REST[0]) return null; G.budRest = REST[1]; return () => { G.budRest = REST[0]; }; },
};
const glideEnter = st => {
  st.theta = lerp(st.thA, st.thB, st.T); st.solid = lerp(st.sa, st.sb, st.T);
  st.moveA = true; st.moveB = true;
};

export const melt = {
  id: 'melt', levers: LEVERS, enter: glideEnter,
  plan(a, b, ctx) {
    if (!flat(a) || !flat(b) || a[OFF['fold.n']] !== b[OFF['fold.n']] || ctx.D < 4) return null;
    return { kind: 'melt', onClock: true, ...partners(a, b) };
  },
  write(st, A, B) {
    const T = st.T, side = T < 0.5 ? A : B, kept = FIELDS.map(n => side[n]);
    const s = T < 0.5 ? 1 - smoother(T / 0.5) : smoother((T - 0.5) / 0.5);
    A[OFF.theta] = st.theta; B[OFF.theta] = st.theta;
    applySlide(A, B, st.plan, st.x * st.x * (3 - 2 * st.x));
    FIELDS.forEach((n, i) => { A[n] = kept[i]; });
    A[SHARE] = kept[FIELDS.indexOf(SHARE)] * s;
    st.two = false;
  },
};

export default {
  id: 'bud', levers: LEVERS, enter: glideEnter,
  plan(a, b, ctx) {
    if (!flat(a) || !flat(b) || a[OFF['fold.n']] !== b[OFF['fold.n']] || ctx.D < 4) return null;
    // A pattern with no flowers can't close them. It melts.
    if (!hasField(a) || !hasField(b)) return melt.plan(a, b, ctx);
    return { kind: 'bud', onClock: true, ...partners(a, b) };
  },
  write(st, A, B) {
    const T = st.T, from = T < 0.5 ? A : B, kept = STEPPED.map(n => from[n]), ta = A[TILE], tb = B[TILE], X = st.x * st.x * (3 - 2 * st.x);
    const depth = T < 0.5 ? A[DEPTH] * (1 - smoother(T / 0.5)) : B[DEPTH] * smoother((T - 0.5) / 0.5);
    A[OFF.theta] = st.theta; B[OFF.theta] = st.theta;
    // Everything that isn't the petals goes a little gentler than T, or a change in how many lines there are sweeps the far rings by faster than the flash limit, right where T is steepest. It still starts and ends at rest.
    applySlide(A, B, st.plan, X);
    STEPPED.forEach((n, i) => { A[n] = kept[i]; });
    A[DEPTH] = depth;
    // Tiles grow as a whole, so the walls fly off the frame all the way to one flower, and don't all go at the start.
    if (ta !== tb) A[TILE] = Math.exp(lerp(Math.log(Math.max(ta, 0.08)), Math.log(Math.max(tb, 0.08)), X));
    st.two = false;
  },
};

// The front's width as a share of its travel, how far it reaches, and how hard it pushes the sheet aside going by. Wide, so no line whips.
const WIDE = 0.55, PUSH = 0.05;
export const tide = {
  id: 'tide', levers: {}, enter: glideEnter,
  plan(a, b, ctx) {
    if (a[OFF['surf.kind']] > 0.5 || b[OFF['surf.kind']] > 0.5 || a[OFF['field.kind']] !== 4 || b[OFF['field.kind']] !== 4 || ctx.D < 4) return null;
    const o = ctx.xform ?? {}, dir = o.dir ?? 2, centre = o.centre ?? [b[OFF['blobs.x1']] || 0, b[OFF['blobs.y1']] || 0], reach = Math.hypot(ctx.aspect + Math.abs(centre[0]), 1 + Math.abs(centre[1])) * 1.05;
    return { kind: 'tide', onClock: true, ...partners(a, b), dir, centre, reach, W: WIDE };
  },
  write(st, A, B, F) {
    const { plan, T, x } = st;
    for (let j = 1; j < FAMILIES; j++) if (B[OFF[`f${j}.on`]] >= 0.5) B[OFF[`f${j}.ph`]] += plan.offset[j];
    A[OFF.theta] = st.theta; B[OFF.theta] = st.theta;
    const P = FRAME.pair * 4, X = FRAME.xf * 4, X2 = FRAME.xf2 * 4;
    for (let i = 0; i < 4; i++) F[P + i] = plan.pair[i];
    F[FRAME.compose * 4] = T; F[FRAME.compose * 4 + 1] = 1;
    F[X] = plan.dir; F[X + 1] = x; F[X + 2] = plan.W; F[X + 3] = plan.reach;
    F[X2] = plan.centre[0]; F[X2 + 1] = plan.centre[1]; F[X2 + 2] = plan.W; F[X2 + 3] = PUSH;
  },
};
