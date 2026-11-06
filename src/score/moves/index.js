// Ways of moving. A move is a pure function that writes slot numbers, so any gesture can wear any move it passes, and arcs, knobs, slides,
// flights, plates and the hand all work with no extra code. R.probe sees it because it sets the slot.
//   export default { id, needs(slot, G) {}, write(out, { u, t, phi, OFF, G, m }) {} };
// G.moves = [{ id, ...settings }]; fillSlot runs them after drive, before G.over. needs says whether a gesture can wear it.
import { flag } from '../flags.js';
import slip from './slip.js';
import star from './star.js';
import coin from './coin.js';
import snap from './snap.js';

export const MOVES = { slip, star, coin, snap };

export function runMoves(out, ctx) {
  for (const m of ctx.G.moves) {
    const move = MOVES[m.id];
    if (move && flag(m.id)) move.write(out, { ...ctx, m });
  }
}
