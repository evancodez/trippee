// Matter's pool. Two kinds of its own, and a few bold ones from the library.
//   cells   fat dots, under ten across, that divide (divide.js). Black on white, and white on black
//   sheet   bold stripes, checks and triangles: what breaks best, because every crack turns its lines
// group says which: the director goes round them by group (src/worlds/matter/direct.js). The library's are 'film'.
import { plane, triLattice } from '../../pattern/kit.js';
import { cellsDrive, R0, KB, LINES } from './divide.js';

// A sheet of dots. D: cells to a picture unit (the frame's 2 high), so 3.56 * D across a wide frame at the start of a step and that over root two at its end.
function cells({ id, name, D = 2.5, invert = 0, arcs = [] }) {
  return {
    id, name, family: 'matter', group: 'cells', lambda: 1 / (3.56 * D),
    g: { fams: [{ y: LINES }], invert, field: { kind: 4, a: 0, b: D, ph: 0 }, 'field.k0': 1, 'field.spin': 0, 'field.scale': R0 - (1 - Math.SQRT1_2) * KB, 'field._1': KB, 'field._2': 0, 'star._1': 1 },
    // What flows is on a family that's off: the song's slide goes wherever flow says, and a dot's size is its edge.
    flow: { 'f1.ph': 1 },
    arcs,
    drive: cellsDrive,
  };
}
// Their flow is slow: a bold check or triangle going past a place faster than once a second swings that part of the frame's brightness more often than a mode may.
const sheet = (id, name, fams, { solid, flow = { 'f0.ph': 0.6 }, arcs, more = {} } = {}) => ({ id, name, family: 'matter', group: 'sheet', lambda: 0.16, ...(solid ? { solid } : {}), g: { fams, ...more }, flow, arcs });

export const pool = [
  cells({ id: 'matter.cells', name: 'Cells', D: 2.5, arcs: [{ path: 'rot', from: -0.12, to: 0.12 }] }),
  cells({ id: 'matter.spores', name: 'Spores', D: 2.2, invert: 1, arcs: [{ path: 'rot', from: 0.1, to: -0.14 }] }),
  sheet('matter.slab', 'Slab', [plane(2.3, 62)], { arcs: [{ path: 'rot', from: -0.18, to: 0.22 }, { path: 'scale', from: 0.95, to: 1.25, log: true }] }),
  sheet('matter.tiles', 'Tiles', [plane(1.8, 18), plane(1.8, 108)], { flow: { 'f0.ph': 0.5, 'f1.ph': 0.25 }, arcs: [{ path: 'rot', from: 0.15, to: -0.2 }, { path: 'scale', from: 0.9, to: 1.2, log: true }] }),
  sheet('matter.facets', 'Facets', triLattice(1.55, 90), { solid: 0.72, flow: { 'f0.ph': 0.6, 'f1.ph': -0.6 }, arcs: [{ path: 'rot', from: -0.1, to: 0.26 }, { path: 'scale', from: 1.0, to: 1.3, log: true }] }),
];
// Bold ones from the library, by id.
export const borrow = ['checks.twist', 'lattice.kagome', 'lines.river'];
