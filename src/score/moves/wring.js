// Wring. Not on anyone's list: a riot move of its own. A plain board is wrung one way, whips back dead straight on the strong beat, and is wrung the other way. It's a pendulum, so it's fastest exactly on
// the beat, and it rests at the ends of its swing without ever stopping dead. What lands on the hit is a shape anyone can see, a plain board going by at top speed, with no flash and no change of brightness.
// The twist moves over to the other side of the frame with each swing, so it isn't one spot being stirred.
//
// A shot in a hand cut:
//   { at: 77.75, id: 'riot.wring', pulse: [[77.75, 0]], moves: [{ id: 'wring', beats: 'half' }] }
//     beats   it crosses straight on each. See cueHits in surge.js for from, to, lead and coast.
//     amp     radians at the ends of the swing, or a lane [[t, x], ...] in song seconds: wind it up over a build. Default 1.2, which keeps a tile under 2 flashes a second on a half note. Eases in over the lead and out over the coast, so it starts and ends plain.
//     sig     how wide the twist is. Default 1
//     cx      how far to the side it goes. Default .7
import { clamp, evalTrack, smoother } from '../curves.js';
import { ampOf, clockOf, cueHits, handClock } from './surge.js';

const AMP = 1.2;

// Crosses 0 on the whole numbers, going the other way each time.
const swing = s => { const k = Math.floor(s); return (((k % 2) + 2) % 2 ? -1 : 1) * Math.sin(Math.PI * (s - k)); };

function write(out, OFF, s, amp, m) {
  const x = swing(s), side = Math.tanh(x * 2) / Math.tanh(2);
  out[OFF['swirl.a']] = x * amp; out[OFF['swirl.sig']] = m.sig ?? 1; out[OFF['swirl.cx']] = (m.cx ?? 0.7) * side;
}

export function wringDrive(out, ctx) {
  if (ctx.G.moves?.some(m => m.id === 'wring')) return;
  const o = ctx.G.pattern.wring ?? {};
  write(out, ctx.OFF, handClock(ctx), (o.amp ?? AMP) * smoother((ctx.t - ctx.G.t0) / 1.5), o);
}

export default {
  id: 'wring',
  needs() { return true; },
  cue: cueHits,
  write(out, { t, OFF, m }) {
    m._amp ??= ampOf(m, AMP);
    write(out, OFF, evalTrack(clockOf(m), t), m._amp(t), m);
  },
};
