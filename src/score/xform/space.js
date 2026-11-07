// The sheet in space, as transformations: dive mode 6, so its own programs (SPACE | FLIGHT). See src/gl/chunks/space.js. Each kind here is a long smooth camera move over one physical thing, with both ends exact:
// at x = 0 the sheet is exactly flat and exactly the frame, and at x = 1 the next pattern is. No two of them use a fade, a mask or a slab of one colour: each pixel lands on one sheet or the other.
import { OFF, FRAME } from '../../pattern/layout.js';
import { clamp, lerp, smoother } from '../curves.js';

import { kickAt, surgeAt, tuneAt } from '../moves/space.js';

const k = (x, a, b) => smoother((x - a) / (b - a));

const put = (F, i, a, b, c, d) => { const n = (FRAME.space + i) * 4; F[n] = a; F[n + 1] = b; F[n + 2] = c; F[n + 3] = d; };

function flood(st, F, o) {
  const { x } = st, kick = kickAt(st.t), a = (o.amp ?? 0.42), rise = k(x, 0, 0.42), up = k(x, 0.04, 0.42) * (1 - k(x, 0.66, 1));
  const amp = a * rise * (1 + 0.16 * kick);
  const f = o.f ?? 2.3, ph = (o.ph ?? 0) + 1.6 * x * x + 0.35 * kick * up;
  const low = -a * 1.26 * 1.17 - 0.02, high = a * 1.26 * 1.17 + 0.02, L = lerp(low, high, k(x, 0.26, 0.74));
  const yEnd = o.fly ?? 5.2, y = yEnd * lerp(x, smoother(x), 0.6);
  const dist = lerp(o.dist ?? 2.4, 1.25, up), pitch = (o.pitch ?? 1.02) * up;
  put(F, 0, 1, amp, f, ph);
  put(F, 1, pitch, (o.yaw ?? 0.5) * (up - 0.0) * Math.sin(x * Math.PI), 0.16 * Math.sin(x * Math.PI * 2) * up, dist);
  put(F, 2, 0, y, lerp(0, high, k(x, 0.26, 0.74)), 0);      // it keeps its height over the water
  put(F, 3, (o.bowl ?? 0.1) * up, o.q ?? 0, o.pix ?? 0, 0);
  put(F, 4, L, 0, yEnd, 0);
}

function well(st, F, o) {
  const { x } = st, kick = kickAt(st.t), N = o.neck ?? 0.09, a = (o.a ?? 0.42) * k(x, 0, 0.42) * (1 + 0.1 * kick * (1 - k(x, 0.6, 0.8)));
  const D = (o.a ?? 0.42) / N;     // how deep the rim ends up
  const tip = k(x, 0.04, 0.3) * (1 - k(x, 0.36, 0.62));
  const pitch = (o.pitch ?? 0.95) * tip, L = -D - (o.far ?? 2.2);
  const dist = lerp(o.dist ?? 2.4, 1.15, k(x, 0, 0.5));
  // Down: the camera's over the sheet to start with, and at the end it's a lens-length above B.
  const z = lerp(0, L + dist, Math.pow(k(x, 0.34, 1), 1.0));
  put(F, 0, 2, a, N, 1);
  put(F, 1, pitch, (o.yaw ?? 1.2) * tip + 0.9 * x * x, 0, dist);
  put(F, 2, 0, 0, z, 0);
  put(F, 3, 0, o.q ?? 0, 0, 0);
  put(F, 4, L, 0, 0, 0);
}

function drop(st, F, o) {
  const { x } = st, kick = kickAt(st.t), pix = o.pix ?? 0.42, up = k(x, 0.02, 0.34) * (1 - k(x, 0.7, 1));
  const front = lerp(-0.4, 3.6, k(x, 0.16, 0.74)), depth = o.depth ?? 3.2, L = -(o.far ?? 2.0);
  const dist = lerp(o.dist ?? 2.4, 1.5, k(x, 0, 0.5));
  const z = lerp(0, L, k(x, 0.5, 1));
  put(F, 0, 3, depth, 0, front + 0.05 * kick);
  put(F, 1, (o.pitch ?? 0.86) * up, (o.yaw ?? 0.45) * up, 0, dist);
  put(F, 2, 0, 0, z, 0);
  put(F, 3, 0, 0, pix, o.scatter ?? 0.7);
  put(F, 4, L, 0, 0, 0);
}

function pleat(st, F, o) {
  const { x } = st, kick = kickAt(st.t), n = o.n ?? 2.8, up = k(x, 0, 0.32) * (1 - k(x, 0.68, 1)), tune = tuneAt(st.c);
  const width = o.width ?? 4.2, walk = lerp(-2 - width, 2, k(x, 0.08, 0.92));      // every cell in the frame is part way, all the time: it's the share of each that goes across
  put(F, 0, 4, (o.h ?? 1.15) * up * (1 + 0.14 * kick), n, walk);
  put(F, 1, (o.pitch ?? 0.72) * up, (o.yaw ?? 0.3) * up * Math.sin(Math.PI * x) + 0.03 * tune * up, 0.1 * Math.sin(Math.PI * x) * up, lerp(2.4, 1.55, up));
  put(F, 2, 0, 0, 0, width);
  put(F, 3, 0, 0, 0, o.dir ?? 0.3);
  put(F, 4, 0, 0, 0, 0);
}

function tube(st, F, o) {
  const { x } = st, kick = kickAt(st.t), d = o.dist ?? 1.5, tune = tuneAt(st.c);
  const roll = k(x, 0, 0.3) * (1 - k(x, 0.7, 1));
  const look = k(x, 0.18, 0.4) * (1 - k(x, 0.6, 0.82));
  const Yend = o.fly ?? 16, y = Yend * lerp(x, smoother(x), 0.5), neck = (o.neck ?? 0.55) * look * (1 + 0.16 * kick);
  put(F, 0, 5, roll / d * 0.98, o.bw ?? 0.42, 2.2 * x + 0.3 * tune * look);
  put(F, 1, look * Math.PI / 2, 0, 0.35 * look * Math.sin(Math.PI * x), d);
  put(F, 2, 0, y, 0, (o.bend ?? 1.0) * look);
  put(F, 3, Math.min(neck, 0.8), o.neckLong ?? 1.1, 0, 0);
  put(F, 4, 0, 0, Yend, Yend * 0.56);
}

const kinds = { flood, well, drop, pleat, tube };

function make(id) {
  return {
    id,
    plan(a, b, ctx) {
      if (ctx.R?.wp) return null;      // a world's programs don't have it
      return { kind: id, o: ctx.xform ?? {}, close: [0] };
    },
    enter(st) {
      st.theta = lerp(st.thA, st.thB, st.T); st.solid = lerp(st.sa, st.sb, st.T);
      st.moveA = true; st.moveB = true;
    },
    write(st, A, B, F) {
      // Everything goes by more quickly into each strong beat and more slowly after it. Both ends stay exact.
      const D = st.from && st.to ? Math.max(st.from.morph || st.plan.D || 12, 1) : 12, x0 = st.x;
      st.x = clamp(x0 + (st.plan.o.surge ?? 0.55) * surgeAt(st.t) / D * smoother(x0 / 0.12) * smoother((1 - x0) / 0.12));
      kinds[id](st, F, st.plan.o);
      st.x = x0;
      F[FRAME.dive * 4 + 3] = 6;
      const by = st.theta - lerp(st.thA, st.thB, st.T);
      A[OFF.theta] = st.thA + by; B[OFF.theta] = st.thB + by;
      F[FRAME.weight * 4 + 1] = F[FRAME.weight * 4];
    },
  };
}

export const SPACE_XFORMS = Object.fromEntries(Object.keys(kinds).map(id => [id, make(id)]));
