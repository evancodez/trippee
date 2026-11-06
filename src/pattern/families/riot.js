// The riot set: moves for a pounding chorus or a build, hitting exactly and never jolty. See src/score/moves/ratchet.js, scissor.js, bellows.js and wring.js. Kept out of the pool: a hand cut asks for
// them by name, or someone clicks one in the library, and then each one marches on the song's strong beats (on its own steady clock with no song).
import { logring, spokes, plane } from '../kit.js';
import { ratchetDrive } from '../../score/moves/ratchet.js';
import { scissorDrive } from '../../score/moves/scissor.js';
import { bellowsDrive } from '../../score/moves/bellows.js';
import { wringDrive } from '../../score/moves/wring.js';

const riot = (id, name, g, drive, more = {}) => ({ id: `riot.${id}`, name, family: 'riot', pool: false, g, arcs: [], flow: {}, drive, lambda: 0.2, ...more });

export default [
  // Cells are square, l = t / 2 pi, and big: about ten of them from the rim of the frame to where they go too small to matter.
  riot('ratchet', 'Ratchet', { fams: [logring(10 / (2 * Math.PI)), spokes(10)] }, ratchetDrive),
  riot('scissor', 'Scissor', { fams: [plane(1.8 * Math.SQRT2, 45), plane(1.8 * Math.SQRT2, -45)] }, scissorDrive),
  // One whole cycle of the rows to each of the judge's tiles, 2 a unit up the frame, so a tile's half and half whatever a column does.
  riot('bellows', 'Bellows', { fams: [plane(3, 0), plane(2, 90)] }, bellowsDrive, { bellows: { f: 3.53 } }),
  riot('wring', 'Wring', { fams: [plane(2.25, 0), plane(2, 90)] }, wringDrive),
];
