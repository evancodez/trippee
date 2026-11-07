// How one of this world's patterns turns into another. Four ways, none of them anything laid over anything, all with the rings running on through. One numbered family stays where it is on the one clock, so a line keeps its treatment.
//   crank   every ring goes round, as if the knob's been rolled back; what it is changes unseen while it's round, and the knob comes up on the next.
//   bleed   the field lets go: rings relax into the stripes under them, and rise out of them as the next. Anything can.
//   feed    the next sheet feeds through the press: a straight front crosses the frame, and each line bends across at it.
//   fill    a drummer's fill: the frame's cut in strips and each goes over on its own hit, and the last lands on the crash. The hits are the fill's if there's one, and otherwise the strong beats.
import { OFF, FAMILIES, FRAME } from '../../pattern/layout.js';
import { lerp, smoother } from '../../score/curves.js';
import { applySlide } from '../../score/xform/slide.js';

const STEPPED = ['field.a', 'field.b', 'field.scale', 'star._1', 'star._2', 'blobs.beta'].map(n => OFF[n]);
const DEPTH = OFF['field.ph'], SHARE = OFF['field.k0'];
const FIELDS = [...STEPPED, DEPTH, SHARE, OFF['field.spin'], OFF['field._1'], OFF['field._2'], OFF['star._3'], OFF['spare.b'],
  ...['x1', 'y1', 'r1', 'a1', 'x2', 'y2', 'r2', 'a2', 'x3', 'y3', 'r3', 'a3'].map(n => OFF[`blobs.${n}`]), ...['x', 'y', 'q', 'ay'].flatMap(n => [OFF[`p1.${n}`], OFF[`p2.${n}`]])];
const POLE1 = ['x', 'y', 'q', 'ay'].map(n => OFF[`p1.${n}`]);
const FIELDS_LESS = FIELDS.filter(n => !POLE1.includes(n));
const measures = s => { for (let i = 0; i < FAMILIES; i++) if (s[OFF[`f${i}.on`]] >= 0.5 && ['r1', 'l1', 't1'].some(n => s[OFF[`f${i}.${n}`]] !== 0)) return true; return false; };
// A sheet the camera's tipped is a plane through the origin, which draws just what a flat sheet draws until it tips (src/score/camera.js). Anything else on a surface can't be glided.
const planar = s => s[OFF['surf.kind']] < 0.5 || (s[OFF['surf.kind']] < 1.5 && s[OFF['surf.map']] < 0.5 && Math.abs(s[OFF['q.xx']]) + Math.abs(s[OFF['q.yy']]) + Math.abs(s[OFF['q.xy']]) < 1e-4);
const flat = s => s[OFF['field.kind']] === 4 && planar(s) && s[OFF['droste.lnS']] === 0;
// Both on the plane, if either is, so nothing snaps half way.
const SURF = OFF['surf.kind'], MAP = OFF['surf.map'], ZW = OFF['q.zw'], PITCH = OFF['cam.pitch'], DIST = OFF['cam.dist'];
const samePlane = (A, B) => {
  if (A[SURF] < 0.5 === B[SURF] < 0.5) return;
  const [S, O] = A[SURF] < 0.5 ? [A, B] : [B, A];
  S[SURF] = O[SURF]; S[MAP] = 0; S[ZW] = O[ZW]; S[PITCH] = 0; S[DIST] = O[DIST]; S[OFF['cam.roll']] = O[OFF['cam.roll']]; S[OFF['cam.yaw']] = O[OFF['cam.yaw']];
};
export const hasField = s => s[SHARE] !== 0;
const rings = s => hasField(s) && s[OFF['star._1']] === 0;
const real = (s, i) => s[OFF[`f${i}.on`]] >= 0.5 && Math.abs(s[OFF[`f${i}.d`]]) <= 1.01;
const winds = (s, i) => Math.abs(s[OFF[`f${i}.t1`]]) + Math.abs(s[OFF[`f${i}.t2`]]) > 1e-6;
function partners(a, b) {
  const pair = [0, -1, -1, -1], offset = [0, 0, 0, 0], close = [], open = [];
  for (let i = 1; i < FAMILIES; i++) {
    const ra = real(a, i), rb = real(b, i);
    if (ra && rb && winds(a, i) === winds(b, i) && (!winds(a, i) || ['t1', 't2'].every(n => a[OFF[`f${i}.${n}`]] === b[OFF[`f${i}.${n}`]]))) { pair[i] = i; offset[i] = Math.round(a[OFF[`f${i}.ph`]] - b[OFF[`f${i}.ph`]]); }
    else { if (ra) close.push(i); if (rb) open.push(i); }
  }
  return { pair, flip: [false, false, false, false], offset, close, open, ratio: 1 };
}
const glideEnter = st => { st.theta = lerp(st.thA, st.thB, st.T); st.solid = lerp(st.sa, st.sb, st.T); st.moveA = true; st.moveB = true; };

export const bleed = {
  id: 'bleed', enter: glideEnter,
  levers: { 'a feed instead': G => { const was = G.xform; if (!was) return null; G.xform = { id: 'feed', dir: 3, W: 0.8 }; return () => { G.xform = was; }; } },
  plan(a, b, ctx) {
    if (ctx.noGlide || !flat(a) || !flat(b) || a[OFF['fold.n']] !== b[OFF['fold.n']] || ctx.D < 2) return null;
    return { kind: 'bleed', onClock: true, ...partners(a, b), fields: measures(a) || measures(b) ? FIELDS_LESS : FIELDS };
  },
  write(st, A, B) {
    const x = st.x, side = x < 0.5 ? A : B, F = st.plan.fields, kept = F.map(n => side[n]);
    const s = x < 0.5 ? 1 - smoother(x / 0.5) : smoother((x - 0.5) / 0.5);
    A[OFF.theta] = st.theta; B[OFF.theta] = st.theta;
    samePlane(A, B);
    applySlide(A, B, st.plan, st.x * st.x * (3 - 2 * st.x));
    F.forEach((n, i) => { A[n] = kept[i]; });
    A[SHARE] = kept[F.indexOf(SHARE)] * s;
    st.two = false;
  },
};

export const feed = {
  id: 'feed', enter: glideEnter,
  levers: { 'a wider front': G => { if (!G.xform || G.xform.W) return null; G.xform.W = 0.85; return () => { delete G.xform.W; }; } },
  plan(a, b, ctx) {
    // noGlide: a rehearsal's ruled it out, or it's a change of world, which has to be a flight to change programs half way.
    if (ctx.noGlide || !planar(a) || !planar(b) || winds(a, 0) || winds(b, 0) || ctx.D < 2) return null;
    const o = ctx.xform?.id === 'feed' || ctx.xform?.dir ? ctx.xform : {}, dir = o.dir ?? 3, centre = dir === 3 ? [0, 0] : o.centre ?? [b[OFF['blobs.x1']] || 0, b[OFF['blobs.y1']] || 0], reach = dir === 3 ? 2.3 : Math.hypot(ctx.aspect + Math.abs(centre[0]), 1 + Math.abs(centre[1])) * 1.05;
    return { kind: 'feed', onClock: true, ...partners(a, b), dir, centre, reach, W: o.W ?? 0.5, ang: o.ang ?? 0 };
  },
  write(st, A, B, F) {
    const { plan, T, x } = st;
    for (let j = 1; j < FAMILIES; j++) if (B[OFF[`f${j}.on`]] >= 0.5) B[OFF[`f${j}.ph`]] += plan.offset[j];
    A[OFF.theta] = st.theta; B[OFF.theta] = st.theta;
    const P = FRAME.pair * 4, X = FRAME.xf * 4, X2 = FRAME.xf2 * 4;
    for (let i = 0; i < 4; i++) F[P + i] = plan.pair[i];
    F[FRAME.compose * 4] = T; F[FRAME.compose * 4 + 1] = 1;
    F[X] = plan.dir; F[X + 1] = x; F[X + 2] = plan.W; F[X + 3] = plan.reach;
    F[X2] = plan.centre[0]; F[X2 + 1] = plan.centre[1]; F[X2 + 2] = plan.W; F[X2 + 3] = 0.03;
  },
};

// Strips over a frame this wide. The word for how far along each is goes straight to the shader, through uniforms (src/worlds/flyer.js): it's the world's own numbers.
export const STRIPS = 6;
export const fill = {
  id: 'fill', enter: glideEnter,
  levers: {},
  plan(a, b, ctx) {
    if (ctx.noGlide || !planar(a) || !planar(b) || winds(a, 0) || winds(b, 0) || ctx.D < 2) return null;
    const o = ctx.xform?.id === 'fill' ? ctx.xform : {};
    return { kind: 'fill', onClock: true, ...partners(a, b), ang: o.ang ?? 0, reach: 1.9, order: o.order ?? null, strips: o.strips ?? STRIPS };
  },
  write(st, A, B, F) {
    const { plan, T, x } = st;
    for (let j = 1; j < FAMILIES; j++) if (B[OFF[`f${j}.on`]] >= 0.5) B[OFF[`f${j}.ph`]] += plan.offset[j];
    A[OFF.theta] = st.theta; B[OFF.theta] = st.theta;
    const P = FRAME.pair * 4, X = FRAME.xf * 4, X2 = FRAME.xf2 * 4;
    for (let i = 0; i < 4; i++) F[P + i] = plan.pair[i];
    F[FRAME.compose * 4] = T; F[FRAME.compose * 4 + 1] = 1;
    // Local T, which the world's hook works out: the front's only here to say that families with no partner close and open with it.
    F[X] = 1; F[X + 1] = x; F[X + 2] = 0.5; F[X + 3] = 3;
    F[X2] = 0; F[X2 + 1] = 0; F[X2 + 2] = 0.5; F[X2 + 3] = 0;
  },
};

export default {
  id: 'crank', levers: {}, enter: glideEnter,
  plan(a, b, ctx) {
    if (ctx.noGlide) return null;
    if (a[OFF['fold.n']] !== b[OFF['fold.n']]) return feed.plan(a, b, ctx);
    if (!flat(a) || !flat(b) || ctx.D < 2) return null;
    // Nobody chose (a wander, or a film that didn't say): it isn't always the one thing. Which goes by the two patterns, so the same two always go the same way.
    if (!ctx.xform?.chosen) { const h = Math.abs(Math.round((a[OFF['field.k0']] * 7 + b[OFF['blobs.x1']] * 11 + a[OFF['blobs.y1']] * 13 + b[OFF['field.a']] * 3 + a[OFF['f0.y']] * 5) * 10)) % 4; if (h === 1) return fill.plan(a, b, ctx); if (h === 2) return feed.plan(a, b, { ...ctx, xform: { dir: 3, ang: h * a[OFF['f0.y']] } }); if (h === 3) return bleed.plan(a, b, ctx); }
    if (!rings(a) || !rings(b)) return bleed.plan(a, b, ctx);
    return { kind: 'crank', onClock: true, ...partners(a, b) };
  },
  write(st, A, B) {
    const x = st.x, from = x < 0.5 ? A : B, kept = STEPPED.map(n => from[n]), X = x * x * (3 - 2 * x), ta = A[OFF['blobs.beta']], tb = B[OFF['blobs.beta']];
    const depth = x < 0.5 ? A[DEPTH] * (1 - smoother(x / 0.5)) : B[DEPTH] * smoother((x - 0.5) / 0.5);
    A[OFF.theta] = st.theta; B[OFF.theta] = st.theta;
    samePlane(A, B);
    applySlide(A, B, st.plan, X);
    STEPPED.forEach((n, i) => { A[n] = kept[i]; });
    A[DEPTH] = depth;
    // A motif closes as the rings go round too: at the middle everything's a plain target.
    A[OFF['field.spin']] = x < 0.5 ? 1 * (1 - smoother(x / 0.5)) * from[OFF['field.spin']] : smoother((x - 0.5) / 0.5) * from[OFF['field.spin']];
    A[OFF['spare.b']] = lerp(A[OFF['spare.b']], B[OFF['spare.b']], X);
    if (ta !== tb) A[OFF['blobs.beta']] = Math.exp(lerp(Math.log(Math.max(ta, 0.08)), Math.log(Math.max(tb, 0.08)), X));
    st.two = false;
  },
};
