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
const POLE1 = ['x', 'y', 'q', 'ay'].map(n => OFF[`p1.${n}`]);
const FIELDS_LESS = FIELDS.filter(n => !POLE1.includes(n));
const measures = s => { for (let i = 0; i < FAMILIES; i++) if (s[OFF[`f${i}.on`]] >= 0.5 && ['r1', 'l1', 't1'].some(n => s[OFF[`f${i}.${n}`]] !== 0)) return true; return false; };
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

// What the second family does inside a band can't glide: it's a whole count, and a whole count of bands. So it's the numbers of whichever pattern has that family showing.
const INSIDE = [OFF['ribbon.a'], OFF['blobs.k']];
const holdInside = (A, B, plan, wasA, wasB) => { INSIDE.forEach((n, i) => { A[n] = wasB[i] !== 0 && (plan.open.length || plan.pair[1] === 1 || wasA[i] === 0) ? wasB[i] : wasA[i]; }); };
const insideOf = S => INSIDE.map(n => S[n]);

export const melt = {
  id: 'melt', enter: glideEnter,
  // A melt whose rings are a long way from the stripes under them sends them all across together. As a last thing, those two can go by a tide, which does it a pixel at a time.
  levers: { ...LEVERS, 'a tide instead': G => { const was = G.xform; if (!was) return null; G.xform = { id: 'tide', dir: 2, W: 0.8 }; return () => { G.xform = was; }; } },
  plan(a, b, ctx) {
    if (!flat(a) || !flat(b) || a[OFF['fold.n']] !== b[OFF['fold.n']] || ctx.D < 3) return null;
    // A family that goes by the first pole can't have it jump in the middle, field or no field.
    return { kind: 'melt', onClock: true, ...partners(a, b), fields: measures(a) || measures(b) ? FIELDS_LESS : FIELDS };
  },
  write(st, A, B) {
    const x = st.x, side = x < 0.5 ? A : B, F = st.plan.fields, kept = F.map(n => side[n]);
    // On x, not T: it's all the time there is, and on T all of it would go in the steepest third.
    const s = x < 0.5 ? 1 - smoother(x / 0.5) : smoother((x - 0.5) / 0.5);
    A[OFF.theta] = st.theta; B[OFF.theta] = st.theta;
    const inA = insideOf(A), inB = insideOf(B);
    applySlide(A, B, st.plan, st.x * st.x * (3 - 2 * st.x));
    holdInside(A, B, st.plan, inA, inB);
    F.forEach((n, i) => { A[n] = kept[i]; });
    A[SHARE] = kept[F.indexOf(SHARE)] * s;
    st.two = false;
  },
};

export default {
  id: 'bud', levers: LEVERS, enter: glideEnter,
  plan(a, b, ctx) {
    // With two different folds the only way across is a tide.
    if (a[OFF['fold.n']] !== b[OFF['fold.n']]) return tide.plan(a, b, ctx);
    if (!flat(a) || !flat(b) || ctx.D < 3) return null;
    // A pattern with no flowers can't close them. It melts.
    if (!hasField(a) || !hasField(b)) return melt.plan(a, b, ctx);
    // Nobody chose (a wander, or a film that didn't say): it isn't always the one thing. Which goes by the two patterns, so the same two always go the same way.
    if (!ctx.xform?.chosen) { const h = Math.abs(Math.round((a[OFF['field.k0']] + b[OFF['blobs.x1']] * 7 + a[OFF['blobs.y1']] * 13 + b[OFF['field.a']]) * 10)) % 5; if (h === 1) return melt.plan(a, b, ctx); if (h === 3) return tide.plan(a, b, { ...ctx, xform: { dir: 2 } }); }
    return { kind: 'bud', onClock: true, ...partners(a, b) };
  },
  write(st, A, B) {
    const x = st.x, from = x < 0.5 ? A : B, kept = STEPPED.map(n => from[n]), ta = A[TILE], tb = B[TILE], X = x * x * (3 - 2 * x);
    // Over all the time there is: on T, all of it would go in the steepest third, and a shape that's far from round would throw every ring across the frame.
    const depth = x < 0.5 ? A[DEPTH] * (1 - smoother(x / 0.5)) : B[DEPTH] * smoother((x - 0.5) / 0.5);
    A[OFF.theta] = st.theta; B[OFF.theta] = st.theta;
    const inA = insideOf(A), inB = insideOf(B);
    // Everything that isn't the petals goes a little gentler than T, or a change in how many lines there are sweeps the far rings by faster than the flash limit, right where T is steepest. It still starts and ends at rest.
    applySlide(A, B, st.plan, X);
    holdInside(A, B, st.plan, inA, inB);
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
  id: 'tide', enter: glideEnter,
  // As for a Bud, and it can go wider, so that each pixel takes longer about turning into the next.
  levers: { 'a wider tide': G => { if (!G.xform || G.xform.W) return null; G.xform.W = 0.8; return () => { delete G.xform.W; }; }, ...LEVERS },
  plan(a, b, ctx) {
    // Anything flat, whichever field it's on, as long as its numbered family has no angle in it: half way between two whole counts of turns there'd be a cut.
    if (a[OFF['surf.kind']] > 0.5 || b[OFF['surf.kind']] > 0.5 || winds(a, 0) || winds(b, 0) || ctx.D < 3) return null;
    const o = ctx.xform?.id === 'tide' || ctx.xform?.dir ? ctx.xform : {}, dir = o.dir ?? 2, centre = dir === 3 ? [0, 0] : o.centre ?? [b[OFF['blobs.x1']] || 0, b[OFF['blobs.y1']] || 0], reach = Math.hypot(ctx.aspect + Math.abs(centre[0]), 1 + Math.abs(centre[1])) * 1.05;
    return { kind: 'tide', onClock: true, ...partners(a, b), dir, centre, reach, W: o.W ?? WIDE, ang: o.ang ?? 0 };
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
