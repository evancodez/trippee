// Bellows. Lines bunch and thin in waves that cross the sheet, and each strong beat takes the middle of the frame from its tightest to its widest, or back, at top speed. On plain lines a fat bar is a lot of one colour going by, so the frame's
// brightness rocks with every wave. XOR-ed with one family it can't touch, a checker, the columns stretch and squeeze and every tile stays half and half whatever the wave does: Riley's Movement in Squares,
// marching. That's the one to use. a * k stays under .85, and a * f under .92 or the sheet folds over.
//
// A shot in a hand cut:
//   { at: 77.75, id: 'riot.bellows', pulse: [[77.75, 0]], moves: [{ id: 'bellows', beats: 'half', f: 3.53 }] }
//     beats   the hits. See cueHits in surge.js for from, to, lead and coast.
//     amp     how hard: 0 to 1 of as far as it's allowed, or a lane [[t, x], ...] in song seconds. Default .9. Eases in over the lead and out over the coast, so it starts and ends as the plain pattern.
//     f       radians a picture unit. 3.53 is two whole waves across a 16:9 frame
//     cx      where it comes from, default 40: a straight wave from the right. -40 from the left. 0 goes out from the middle like a speaker: rings and spokes worn that way rocked the whole frame's brightness 10% on MGMT, so it isn't a pattern here
//     at      where the crest is on the hit, in units from cx. Default the middle of the frame
//     dir     1 or -1: out or in
//     waves   how many pass per hit. Default .5: the squeeze on one hit and the stretch on the next. At 1 on a pounding half note there's a pixel changing colour every few frames
import { FAMILIES } from '../../pattern/layout.js';
import { clamp, smoother, evalTrack } from '../curves.js';
import { ampOf, clockOf, cueHits, surged, handClock, PEAK } from './surge.js';

const TAU = Math.PI * 2;
const LIMIT = 0.85, FOLD = 0.92;

function fineOf(out, OFF) {
  let k = 0;
  for (let i = 0; i < FAMILIES; i++) {
    if (out[OFF[`f${i}.on`]] < 0.5 || Math.abs(out[OFF[`f${i}.d`]]) > 0.98) continue;
    k = Math.max(k, Math.hypot(out[OFF[`f${i}.x`]], out[OFF[`f${i}.y`]]) + Math.abs(out[OFF[`f${i}.r1`]]));
  }
  return Math.max(k * out[OFF.freq], 1e-3);
}

function write(out, OFF, s, amp, m) {
  const f = m.f ?? 3.53, cx = m.cx ?? 40, r0 = m.at ?? Math.abs(cx), a = Math.min(LIMIT / fineOf(out, OFF), FOLD / f) * amp;
  out[OFF['ripple.a']] = a; out[OFF['ripple.f']] = f; out[OFF['ripple.cx']] = cx;
  // sin(f r - ph) has a crest at r0 when ph = f r0 - pi / 2; more ph moves it out, towards bigger r
  out[OFF['ripple.ph']] = f * r0 - Math.PI / 2 + TAU * (m.waves ?? 0.5) * surged(s, m.peak ?? PEAK) * (m.dir ?? 1);
}

export function bellowsDrive(out, ctx) {
  if (ctx.G.moves?.some(m => m.id === 'bellows')) return;
  const o = ctx.G.pattern.bellows ?? {};
  write(out, ctx.OFF, handClock(ctx), (o.amp ?? 0.9) * smoother((ctx.t - ctx.G.t0) / 1.5), o);
}

export default {
  id: 'bellows',
  needs(slot, G) { return !!G?.pattern?.g?.fams?.some(f => f.x || f.y || f.r1); },
  cue: cueHits,
  write(out, { t, OFF, m }) {
    m._amp ??= ampOf(m, 0.9);
    write(out, OFF, evalTrack(clockOf(m), t), clamp(m._amp(t)), m);
  },
};
