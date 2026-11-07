// Every pattern, by family. Each family file default-exports an array and is owned by whoever writes that family.
import first from './families/first.js';
import lines from './families/lines.js';
import dots from './families/dots.js';
import lattice from './families/lattice.js';
import checks from './families/checks.js';
import rooms from './families/rooms.js';
import poles from './families/poles.js';
import voids from './families/voids.js';
import bodies from './families/bodies.js';
import waves from './families/waves.js';
import dials from './families/dials.js';
import relays from './families/relays.js';
import coins from './families/coins.js';
import riley from './families/riley.js';
import impossible from './families/impossible.js';
import still from './families/still.js';
import riot from './families/riot.js';
import space from './families/space.js';
import folds from './families/folds.js';

const groups = { lines, dots, lattice, checks, rooms, poles, voids, bodies, waves, dials, coins, riley, impossible, still, relays, riot, space, folds };
const authored = Object.values(groups).flat();
// The starter patterns stay only until their families have real ones.
export const patterns = authored.length >= 12 ? authored : [...authored, ...first];
export const families = [...new Set(patterns.map(p => p.family))];
export const byId = Object.fromEntries(patterns.map(p => [p.id, p]));
