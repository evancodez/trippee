// Ratchet. A dartboard zooms and turns exactly one ring and one spoke per strong beat. It goes by the families' phases, so scale and rot are still free for a long move. Half a cycle of both families
// is one cell out and one cell round, and a checker comes back to itself: the frame on every hit is the frame on the last. It surges into each hit, fastest on it, and never stops between.
//
// A shot in a hand cut:
//   { at: 77.75, id: 'riot.ratchet', pulse: [[77.75, 0]], moves: [{ id: 'ratchet', beats: 'half' }] }
//     beats   'half', 'strong', 'bar', 'beat' or a list of song seconds. See cueHits in surge.js for from, to, lead and coast.
//     rings, spokes   cells per hit, default 1. Keep both odd or both even, or each hit is the negative of the last.
//     out     -1 rings come towards you, 1 they go away. Default 1: nothing grows at the camera.
//     turn    1 or -1, which way it turns
//     peak    how much faster than average it goes on the hit. Default 1.85.
// It'll wear any pattern with one family of rings and one of spokes. On rings even in radius it pumps rather than zooms.
import { FAMILIES } from '../../pattern/layout.js';
import { evalTrack } from '../curves.js';
import { clockOf, cueHits, surged, handClock, PEAK } from './surge.js';

function write(out, OFF, s, m) {
  const e = surged(s, m.peak ?? PEAK), rings = (m.rings ?? 1) * (m.out ?? 1), spokes = (m.spokes ?? 1) * (m.turn ?? 1);
  for (let i = 0; i < FAMILIES; i++) {
    if (out[OFF[`f${i}.on`]] < 0.5) continue;
    const l = out[OFF[`f${i}.l1`]] || out[OFF[`f${i}.r1`]], T = out[OFF[`f${i}.t1`]];
    if (l && !T) out[OFF[`f${i}.ph`]] += Math.sign(l) * rings * 0.5 * e;
    else if (T && !l) out[OFF[`f${i}.ph`]] += Math.sign(T) * spokes * 0.5 * e;
  }
}

export function ratchetDrive(out, ctx) {
  if (ctx.G.moves?.some(m => m.id === 'ratchet')) return;
  write(out, ctx.OFF, handClock(ctx), ctx.G.pattern.ratchet ?? {});
}

export default {
  id: 'ratchet',
  needs(slot, G) {
    const fams = G?.pattern?.g?.fams ?? [];
    return fams.some(f => (f.l1 || f.r1) && !f.t1) && fams.some(f => f.t1 && !f.l1 && !f.r1);
  },
  cue: cueHits,
  write(out, { t, OFF, m }) { write(out, OFF, evalTrack(clockOf(m), t), m); },
};
