// The sheet in space, by hand: click one and whatever's showing goes there by a way nothing else does (`via`), and then this pattern carries on travelling, on a sheet that's left the plane. Out of the pool: a film wears them when a cut asks.
// See src/gl/chunks/space.js, src/score/xform/space.js and src/score/moves/space.js.
import { plane, ring, spokes } from '../kit.js';
import MOVES, { writeSpace, reliefNumbers, pleatNumbers, rideNumbers, TERRACES, sliceDrive, funnelNumbers, hallNumbers } from '../../score/moves/space.js';

const item = (id, name, via, g, drive, more = {}) => ({ id: `space.${id}`, name, family: 'space', pool: false, via: via && { id: via, D: 13 }, g, arcs: [], flow: {}, drive, lambda: 0.2, ...more });
const worn = G => G?.fixedRange || G?.moves?.some(m => MOVES[m.id]);       // a cut says what it wants. In a shot that wears nothing, it's the pattern as it stands: flat.
const relief = more => (out, { t, G }) => { if (!worn(G)) writeSpace(out, 1, reliefNumbers(G, t, t, more)); };

export default [
  // Rolling hills of a check, flying low. Arrives by what was showing falling away, column by column, into a crater with it at the bottom
  item('swell', 'Swell', 'drop', { fams: [plane(2.4, 0), plane(2.4, 90)] }, relief({})),
  // The same hills in steps, its lines poured down the walls. Arrives as a tide coming up through what was showing
  item('terraces', 'Terraces', 'flood', { fams: [plane(3.2, 35), plane(1.6, 125)] }, relief(TERRACES)),
  // The floor curls up round you into a tube, and it goes on bending ahead. Arrives down a tunnel
  item('ride', 'Ride', 'tube', { fams: [plane(2.6, 0), plane(2.6, 90)] }, (out, { t, G }) => { if (!worn(G)) writeSpace(out, 5, rideNumbers(G, t, t, {})); }),
  // The floor rolled up round you like a paper cone, with no stretch on it, the join showing. Arrives by going down one and through a hole at its point
  item('funnel', 'Paper Cone', 'funnel', { fams: [plane(1.8, 0), plane(1.8, 90)] }, (out, { t, G }) => { if (!worn(G)) writeSpace(out, 6, funnelNumbers(G, t, t, {})); }),
  // A square hall of one pattern, turning over about you as you fly along it. Arrives from a hall with what's showing on its floor and this on its walls, which turns over, and you look down at a wall
  item('hall', 'Turning Hall', 'hall', { fams: [plane(2.4, 0), plane(2.4, 90)] }, (out, { t, G }) => { if (!worn(G)) writeSpace(out, 7, hallNumbers(G, t, t, {})); }),
  // A flat cut through a lattice of four dimensions, turning: squares, diamonds, triangles, and tilings that never repeat. The sheet is the only thing moving
  item('crystal', 'Crystal Slice', null, { fams: [plane(2.1, 0), plane(2.1, 90), { x: 0, y: 0 }, { x: 0, y: 0 }] }, (out, c) => { if (!worn(c.G)) sliceDrive(out, c); }),
  // Corrugated: each fold shows you more of one face and less of the other, as a wave goes across it. Arrives by walking past an agamograph
  item('pleats', 'Pleats', 'pleat', { fams: [plane(1.9, 8), plane(3.4, 98)] }, (out, { t, G }) => { if (!worn(G)) writeSpace(out, 4, pleatNumbers(G, t, t, {})); }),
];
