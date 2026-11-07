// Ways of moving. A move is a pure function that writes slot numbers, so any gesture can wear any move it passes, and arcs, knobs, slides,
// flights, plates and the hand all work with no extra code. R.probe sees it because it sets the slot.
//   export default { id, needs(slot, G) {}, write(out, { u, t, phi, OFF, G, m }) {} };
// G.moves = [{ id, ...settings }]; fillSlot runs them after drive, before G.over. needs says whether a gesture can wear it.
import { flag } from '../flags.js';
import slip from './slip.js';
import star from './star.js';
import coin from './coin.js';
import snap from './snap.js';
import cue from './cue.js';
import relay from './relay.js';
import ramp from './ramp.js';
import moire from './moire.js';
import vertigo from './vertigo.js';
import confocal from './confocal.js';
import mirror from './mirror.js';
import riot from './riot.js';
import space from './space.js';
import folds from './folds.js';
import time from './time.js';

export const MOVES = { slip, star, coin, snap, cue, moire, vertigo, confocal, mirror, relay, ramp, ...riot, ...space, ...folds, ...time };

export function runMoves(out, ctx) {
  for (const m of ctx.G.moves) {
    const move = MOVES[m.id];
    // src/score/woah.js: at either end of its time it's the plain sheet, so outside that it needn't be drawn with what it's drawn with. A sheet in space has flown on by its end (it lands flat, but where it's looking has travelled), so it's kept to the end of its gesture and through the transformation out of it: dropped there it jumped (Disclosure 217.42 s, pleats into a rise, 123 against 2.5)
    if (m.gate && (ctx.t < m.from || (ctx.t > m.to && !move?.flies))) continue;
    if (move && flag(m.id)) move.write(out, { ...ctx, m });
  }
}
