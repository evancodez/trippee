// How one of this world's patterns turns into another. There's no dissolve and no flight in any of them: a band of gauze crosses the frame, and it's inside the gauze that each line goes from what it was to what it's going to be, with Newton's rings running in it.
//   rack    the focus racks: out from where the voice is, and what's behind the band is the next pattern.
//   drain   the film drains: the same, straight down the frame, as water leaves a soap film.
//   breath  it all goes out of focus and comes back, in a band so wide it's nearly the whole frame at once. Every line travels to its new place while nobody can quite see.
// All of them are a bend, each pixel on its own time, with the two patterns on the one clock.
import { OFF, FAMILIES, FRAME } from '../../pattern/layout.js';
import { lerp } from '../../score/curves.js';

const real = (s, i) => s[OFF[`f${i}.on`]] >= 0.5 && Math.abs(s[OFF[`f${i}.d`]]) <= 1.01;
const winds = (s, i) => Math.abs(s[OFF[`f${i}.t1`]]) + Math.abs(s[OFF[`f${i}.t2`]]) > 1e-6;
function partners(a, b) {
  const pair = [-1, -1, -1, -1], offset = [0, 0, 0, 0], close = [], open = [];
  for (let i = 0; i < FAMILIES; i++) {
    const ra = real(a, i), rb = real(b, i);
    if (ra && rb && winds(a, i) === winds(b, i) && (!winds(a, i) || ['t1', 't2'].every(n => a[OFF[`f${i}.${n}`]] === b[OFF[`f${i}.${n}`]]))) { pair[i] = i; offset[i] = Math.round(a[OFF[`f${i}.ph`]] - b[OFF[`f${i}.ph`]]); }
    else { if (ra) close.push(i); if (rb) open.push(i); }
  }
  return { pair, flip: [false, false, false, false], offset, close, open, ratio: 1 };
}
const enter = st => { st.theta = lerp(st.thA, st.thB, st.T); st.solid = lerp(st.sa, st.sb, st.T); st.moveA = true; st.moveB = true; };
// Flat, or a flat sheet the camera's tipped (src/score/camera.js puts it on a plane). Each slot's drawn on its own sheet, so a tip's no obstacle: only a real surface is, with a horizon of its own.
const flat = s => (s[OFF['surf.kind']] < 0.5 || (s[OFF['surf.kind']] < 1.5 && s[OFF['surf.map']] < 0.5 && Math.abs(s[OFF['q.xx']]) + Math.abs(s[OFF['q.yy']]) + Math.abs(s[OFF['q.xy']]) < 1e-4)) && s[OFF['droste.lnS']] === 0;

function write(st, A, B, F) {
  const { plan, T, x } = st;
  for (let j = 0; j < FAMILIES; j++) if (B[OFF[`f${j}.on`]] >= 0.5 && plan.pair[j] >= 0) B[OFF[`f${j}.ph`]] += plan.offset[j];
  A[OFF.theta] = st.theta; B[OFF.theta] = st.theta;
  const P = FRAME.pair * 4, X = FRAME.xf * 4, X2 = FRAME.xf2 * 4;
  for (let i = 0; i < 4; i++) F[P + i] = plan.pair[i];
  F[FRAME.compose * 4] = T; F[FRAME.compose * 4 + 1] = 1;
  F[X] = plan.dir; F[X + 1] = x; F[X + 2] = plan.W; F[X + 3] = plan.reach;
  F[X2] = plan.centre[0]; F[X2 + 1] = plan.centre[1]; F[X2 + 2] = plan.W; F[X2 + 3] = plan.push;
}
// What a rehearsal can try on one that flashes. It's a band that's too narrow, then: a wider one gives each pixel longer about it.
const levers = { 'a wider band': G => { if (!G.xform || G.xform.W >= 0.8) return null; const w = G.xform.W; G.xform.W = 0.82; return () => { if (w == null) delete G.xform.W; else G.xform.W = w; }; } };
// A breath where no line has a partner on the other side has nothing to carry across: every line of the one closes and every line of the next opens, and with the band nearly the
// whole frame that's the whole frame gone to the film's pale side at once, a fade through white (MGMT 148.3 s in Pearl, Nautilus into Medusae: 95% of it white, sd 8.5 of 255). So that
// one breathes in a band a rack's width, out from the middle, and what's going stays bold round what's coming.
const ALONE_W = 0.5;
function make(id, { dir, W, push = 0.05, ang = null }) {
  return {
    id, enter, write, levers,
    plan(a, b, ctx) {
      if (!flat(a) || !flat(b) || ctx.D < 3 || ctx.noGlide) return null;      // noGlide: a change of world, which has to be a flight, or a rehearsal that's watched this one flash
      const o = ctx.xform ?? {}, d = o.dir ?? dir, centre = d === 3 ? [0, 0] : o.centre ?? [0, 0], reach = Math.hypot(ctx.aspect + Math.abs(centre[0]), 1 + Math.abs(centre[1])) * 1.05;
      const P = partners(a, b), alone = id === 'breath' && P.pair.every(p => p < 0);
      return { kind: id, onClock: true, ...P, dir: d, centre, reach, W: alone ? ALONE_W : o.W ?? W, ang: ang ?? o.ang ?? 0, push };
    },
  };
}
export const rack = make('rack', { dir: 2, W: 0.5 });
export const drain = make('drain', { dir: 3, W: 0.5, ang: -Math.PI / 2 });
export const breath = make('breath', { dir: 2, W: 0.92, push: 0.02 });
