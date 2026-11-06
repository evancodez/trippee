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

const groups = { lines, dots, lattice, checks, rooms, poles, voids, bodies, waves };
const authored = Object.values(groups).flat();
// The starter patterns stay only until their families have real ones.
export const patterns = authored.length >= 12 ? authored : [...authored, ...first];
export const families = [...new Set(patterns.map(p => p.family))];
export const byId = Object.fromEntries(patterns.map(p => [p.id, p]));
