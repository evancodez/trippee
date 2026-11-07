// How one of Dusk's pictures turns into the next. Each line bends into its partner, behind a front, so what you see is the next place arriving and never one picture over another.
//   line     a straight front, coming the way the train's going: the next place comes into the window from ahead. A band of red light goes with it, the film's edge
//   fall     night comes down: the front's from the top of the frame, slowly
//   flare    from the sun outward: the light itself turns one place into the next
//   settle   everything at once: the level sets drift across to the next field, as mist moves
import { OFF, FAMILIES, FRAME } from '../../pattern/layout.js';
import { lerp } from '../../score/curves.js';

const real = (s, i) => s[OFF[`f${i}.on`]] >= 0.5 && Math.abs(s[OFF[`f${i}.d`]]) <= 1.01;
const winds = (s, i) => Math.abs(s[OFF[`f${i}.t1`]]) + Math.abs(s[OFF[`f${i}.t2`]]) > 1e-6;
const same = (a, b, i) => ['t1', 't2'].every(n => a[OFF[`f${i}.${n}`]] === b[OFF[`f${i}.${n}`]]);
function partners(a, b) {
  const pair = [-1, -1, -1, -1], offset = [0, 0, 0, 0], close = [], open = [];
  for (let i = 0; i < FAMILIES; i++) {
    const ra = real(a, i), rb = real(b, i);
    if (ra && rb && winds(a, i) === winds(b, i) && (!winds(a, i) || same(a, b, i))) { pair[i] = i; offset[i] = Math.round(a[OFF[`f${i}.ph`]] - b[OFF[`f${i}.ph`]]); }
    else { if (ra) close.push(i); if (rb) open.push(i); }
  }
  return { pair, flip: [false, false, false, false], offset, close, open, ratio: 1 };
}
const glideEnter = st => { st.theta = lerp(st.thA, st.thB, st.T); st.solid = lerp(st.sa, st.sb, st.T); st.moveA = true; st.moveB = true; };
// Flat, or flat and leaning: the camera tips a sheet by putting it on a plane, and a plane's as good as flat to these. A wrapped surface has seams, and a droste has generations.
const flat = s => s[OFF['droste.lnS']] === 0 && (s[OFF['surf.kind']] < 0.5 || (s[OFF['surf.kind']] === 1 && s[OFF['surf.map']] === 0 && Math.abs(s[OFF['q.xx']]) + Math.abs(s[OFF['q.yy']]) + Math.abs(s[OFF['q.zz']]) < 1e-4));
const easeX = x => x * x * (3 - 2 * x);

const WIDE = 0.6;
const across = (id, opts) => ({
  id, enter: glideEnter,
  levers: { 'a wider front': G => { if (!G.xform || G.xform.W) return null; G.xform.W = 0.85; return () => { delete G.xform.W; }; } },
  plan(a, b, ctx) {
    if (!flat(a) || !flat(b) || ctx.D < 3) return null;
    // Nobody chose (a wander, or a film that didn't say): it isn't always the one thing. Which goes by the two patterns, so the same two always go the same way.
    if (!ctx.xform?.chosen && id === 'line') { const h = Math.abs(Math.round((a[OFF['field.a']] * 3 + b[OFF['field.a']] * 7 + a[OFF['field._2']] * 11 + b[OFF['field._1']] * 13) * 10)) % 4; if (h) return KINDS[['line', 'fall', 'flare', 'settle'][h]].plan(a, b, { ...ctx, xform: { chosen: true, id: ['line', 'fall', 'flare', 'settle'][h] } }); }
    const o = ctx.xform?.id === id ? ctx.xform : {}, dir = opts.dir, ang = o.ang ?? opts.ang ?? 0, centre = dir === 3 ? [0, 0] : o.centre ?? [0, 0], reach = Math.hypot(ctx.aspect + Math.abs(centre[0]), 1 + Math.abs(centre[1])) * 1.05;
    return { kind: id, onClock: true, ...partners(a, b), dir, centre, reach, W: o.W ?? opts.W ?? WIDE, ang };
  },
  write(st, A, B, F) {
    const { plan, T, x } = st;
    for (let j = 0; j < FAMILIES; j++) if (plan.pair[j] >= 0) B[OFF[`f${j}.ph`]] += plan.offset[j];
    A[OFF.theta] = st.theta; B[OFF.theta] = st.theta;
    const P = FRAME.pair * 4, X = FRAME.xf * 4, X2 = FRAME.xf2 * 4;
    for (let i = 0; i < 4; i++) F[P + i] = plan.pair[i];
    F[FRAME.compose * 4] = plan.dir ? T : easeX(x); F[FRAME.compose * 4 + 1] = 1;
    F[X] = plan.dir; F[X + 1] = x; F[X + 2] = plan.W; F[X + 3] = plan.reach;
    F[X2] = plan.centre[0]; F[X2 + 1] = plan.centre[1]; F[X2 + 2] = plan.W; F[X2 + 3] = opts.push ?? 0;
  },
});
export const line = across('line', { dir: 3, ang: Math.PI, push: 0.03 });
export const fall = across('fall', { dir: 3, ang: -Math.PI / 2, W: 0.7 });
export const flare = across('flare', { dir: 2, W: 0.7, push: 0.05 });
export const settle = across('settle', { dir: 0 });
export const KINDS = { line, fall, flare, settle };
