// Span: the past on one side of the frame and the future on the other. The shock's own way of becoming: each line travels to its partner, or closes, or opens, by a time local to each pixel. But the front is straight, as wide as the frame or wider, and it takes a whole
// passage to cross, so for most of it you can see every stage of one pattern becoming another at once, spread across the sheet, and the whole of that slides by. On every strong beat it heaves forward.
//   via: 'span', D: 24, ang: 0.2, wander: 0.25     D: seconds, as long as a verse. ang: the way it travels. wander: how far the front bends from straight. Needs what a shock needs: canShock(a, b). If it can't, the planner picks another.
import { OFF, FRAME } from '../../pattern/layout.js';
import { clamp, lerp, smoother } from '../curves.js';
import { canShock } from './shock.js';
import shock from './shock.js';

const WIDE = 0.86, TILT = 0.2;
export default {
  id: 'span',
  plan(a, b, ctx) {
    const o = ctx.xform ?? {};
    if (ctx.D < 4) return null;
    const fit = canShock(a, b, ctx.aspect, { centre: [0, 0], any: true, D: ctx.D, ink: ctx.ink });
    if (!fit) return null;
    const ang = o.ang ?? TILT, ca = Math.abs(Math.cos(ang)), sa = Math.abs(Math.sin(ang));
    return { ...fit, kind: 'span', W: o.W ?? WIDE, dir: 1, push: 0, beats: o.beats ?? null, surge: o.surge ?? 0.5, y0: 0, turn: 0, ang, reach: (ca * ctx.aspect + sa + (o.wander ?? 0.3)) * 1.02, wander: o.wander ?? 0.3, waves: o.waves ?? 2.2 };
  },
  enter: shock.enter,
  write(st, A, B, F) {
    shock.write(st, A, B, F);
    const { plan } = st, X = FRAME.xf * 4, X2 = FRAME.xf2 * 4;
    F[X] = 4; F[X2 + 2] = plan.W; F[X2 + 3] = 0;       // a front the same width everywhere, that pushes nothing aside
  },
  // What the time program needs: chunks/xform.js reads these.
  time(T, st) { const { plan } = st; T[34] = Math.cos(plan.ang); T[35] = Math.sin(plan.ang); T[38] = plan.wander; T[39] = plan.waves; },
};
