// Dusk's pool: what you'd see looking out of a train window at the end of the day, and what you'd hear from the room you got home to. Land, road, strings and room. Each is one field (field.js) over plain stripes.
// A pattern can say where the sun is (sun: [x, y, r] on the sheet, or free) and whether there's water (lake: where the waterline sits in the frame), which light.js and dusk.js read.
import { byId } from '../../pattern/library.js';

const LINES = 2.2;
const KIND = { land: 1, sea: 2, wires: 3, road: 4, cloister: 5, rings: 6, moon: 7, tremolo: 8, curtain: 9, blinds: 10, furrows: 11, dapple: 12, viaduct: 13, smoke: 14 };
const FIELD = ['spin', 'scale', '_1', '_2'];
function field({ id, name, group, kind, a = 0, f2 = [0, 0, 0, 0], sp = [0, 0, 0, 0], arcs = [], over = {}, fams = [], sun = null, lake = null, path = 0, flow = 0, train = 0, slide = 0, cam = 'sheet', turn = 0, ph = 0.25, drive = null, poles = null, lit = 0, lamps = 1, wall = null, birds = 0 }) {
  const P = poles ? [...poles, ...Array(5).fill([0, 0, 0, 0])].slice(0, 5) : null;
  const g = {
    fams: [{ y: LINES, ph }, ...fams],
    field: { kind: 4, a: KIND[kind], b: 0, ph: a }, 'field.k0': 1, 'star._3': 1,
    ...Object.fromEntries(FIELD.map((n, i) => [`field.${n}`, f2[i]])),
    'spare.a': sp[0], 'spare.b': sp[1], 'spare.c': sp[2], 'spare.d': sp[3],
    ...(P ? { 'blobs.x1': P[0][0], 'blobs.y1': P[0][1], 'blobs.r1': P[0][2], 'blobs.x2': P[1][0], 'blobs.y2': P[1][1], 'blobs.r2': P[1][2], 'blobs.x3': P[2][0], 'blobs.y3': P[2][1], 'blobs.r3': P[2][2], 'p1.x': P[3][0], 'p1.y': P[3][1], 'p1.q': P[3][2], 'p2.x': P[4][0], 'p2.y': P[4][1], 'p2.q': P[4][2] } : {}),
    ...over,
  };
  return {
    id, name, family: 'dusk', group, fine: true, lambda: 0.05, g, arcs, sun, lake, path, cam, turn, lit, lamps, wall, birds,
    flow: { 'f1.ph': 0.3 },
    // Lines go by on the film's clock: flow in cycles of the pattern's phase, train in how far along the sheet it's got. So they go with the music, and stop when it stops.
    drive(out, ctx) {
      const { OFF, phi } = ctx;
      if (flow) out[OFF['f0.ph']] += flow * phi;
      if (train) out[OFF['spare.b']] += train * phi;
      if (slide) out[OFF.tx] += slide * phi;
      drive?.(out, ctx);
    },
  };
}
// A land's white is the far part of a hill, or going by the coverage there'd be more of it than anything else: duty .4, and its phase moved by what that moves the edge by. light.js goes by the edge.
const land = ({ amp, hz, q, D, fr, sharp = 0, seed = 1, train = 0.5, ...more }) => { const p = field({ kind: 'land', group: 'land', cam: 'train', a: amp, f2: [hz, q, D, fr], sp: [sharp, 0, 0, seed], train, ph: 0.35, ...more }); p.g.fams[0].d = 0.4; return p; };

const crane = (a, b) => ({ path: 'ty', from: a, to: b });
const push = (a, b) => ({ path: 'scale', from: a, to: b, log: true });
const pan = (a, b) => ({ path: 'tx', from: a, to: b });
const bank = (a, b) => ({ path: 'rot', from: a, to: b });

export const pool = [
  // ---------------------------------------------------------------- land: looking out of the window
  land({ id: 'dusk.ridge', name: 'Ridgeline', amp: 0.95, hz: 0.5, q: 1.36, D: 0.19, fr: 1.5, seed: 1.3, train: 0.55, arcs: [crane(-0.05, 0.08), push(1, 1.08)] }),
  land({ id: 'dusk.sierra', name: 'Far Mountains', sharp: 1, amp: 1.7, hz: 0.4, q: 1.32, D: 0.17, fr: 1.5, seed: 2.7, train: 0.4, arcs: [crane(0.1, -0.08), push(1.08, 1)] }),
  land({ id: 'dusk.dunes', name: 'Dunes', sharp: 2, amp: 0.9, hz: 0.3, q: 1.5, D: 0.18, fr: 1.3, seed: 4.1, train: 0.42, arcs: [crane(-0.08, 0.06), push(1, 1.1)] }),
  land({ id: 'dusk.crowns', name: 'Tree Crowns', sharp: -1, amp: 0.7, hz: 0.5, q: 1.42, D: 0.2, fr: 8, seed: 0.7, train: 0.7, arcs: [crane(0.06, -0.06)] }),
  land({ id: 'dusk.lake', name: 'Still Water', amp: 0.8, hz: 0.5, q: 1.4, D: 0.11, fr: 1.4, seed: 3.3, train: 0.3, lake: -0.05, path: 0.0, arcs: [crane(0.02, 0.09)] }),
  land({ id: 'dusk.mackerel', name: 'Mackerel Sky', sharp: -1, amp: 0.55, hz: 0.8, q: 1.26, D: 0.2, fr: 7, seed: 5.1, train: 0.3, over: { rot: 3.1416 }, arcs: [push(1.05, 1.18)], cam: 'train' }),
  field({ id: 'dusk.sea', name: 'Long Swell', group: 'land', kind: 'sea', a: 0.05, f2: [0.14, 0, 0.1, 1.3], sp: [0, 0, 1.25, 0], flow: 0.5, train: 0.8, path: 0.55, sun: [0.15, 0.32, 0.24], cam: 'train', arcs: [crane(-0.04, 0.05), push(1, 1.12)] }),
  field({ id: 'dusk.lowsun', name: 'Low Sun', group: 'land', kind: 'rings', lamps: 0, f2: [0.1, 0.26, 0.2, 2.3], flow: 0.45, lake: -0.28, path: 0.2, sun: [0.1, 0.26, 0.3], cam: 'anchor', arcs: [pan(-0.12, 0.1), push(1, 1.14)] }),
  field({ id: 'dusk.viaduct', name: 'Viaduct', group: 'land', kind: 'viaduct', a: 0.5, f2: [0, 0, 0, 1.5], sp: [0, 0, 1.15, 0], train: 0.35, cam: 'train', lake: -0.3, over: { ty: 0.15 }, arcs: [crane(0.05, 0.2), push(1, 1.08)] }),
  // ---------------------------------------------------------------- the road: going somewhere, or away
  field({ id: 'dusk.wires', name: 'Wires', group: 'road', kind: 'wires', birds: 0.3, lamps: 0, a: 0.42, f2: [0, 0, 0, 1.75], sp: [0, 0, 0.42, 0], train: 0.2, cam: 'train', flow: 0, arcs: [crane(0, 0.3), push(1, 1.1)] }),
  field({ id: 'dusk.road', name: 'Slip Road', group: 'road', kind: 'road', a: 0.34, f2: [1.1, 0.3, 0.4, 0], sp: [2, 0, 1.6, 0], flow: 0.5, sun: [1.1, 0.34, 0.22], cam: 'anchor', arcs: [pan(0.04, -0.1), push(1, 1.18)], drive(out, { OFF, phi }) { out[OFF['spare.b']] += 0.5 * phi; } }),
  field({ id: 'dusk.furrows', name: 'Furrows', group: 'road', kind: 'furrows', lamps: 0, a: 0.55, f2: [0.32, 0, 0.26, 0.95], sp: [0, 0, -0.25, 0], flow: 0.6, sun: [-0.25, 0.36, 0.26], cam: 'anchor', arcs: [pan(-0.1, 0.1), crane(0, 0.06)] }),
  { ...field({ id: 'dusk.rays', name: 'Long Rays', group: 'road', kind: 'rings', lamps: 0, sun: [-0.5, -0.38, 0.32], flow: 0, cam: 'anchor', arcs: [pan(0, 0), push(1, 1.14)], f2: [0, 0, 1, 1] }) },
  field({ id: 'dusk.drive', name: 'Night Drive', group: 'road', kind: 'rings', lamps: 0, f2: [0.55, 0.12, 0.08, 1.9], flow: 0.55, sun: [0.55, 0.12, 0.13], cam: 'anchor', arcs: [pan(-0.1, 0.12), push(1.1, 1.3)] }),
  // ---------------------------------------------------------------- strings: the guitar itself, and the room it's in
  field({ id: 'dusk.strings', name: 'Six Strings', group: 'strings', kind: 'none', cam: 'sheet', ph: 0.25, flow: 0.25, arcs: [pan(-0.2, 0.2), crane(-0.1, 0.1), push(1.05, 1.2)], over: { squeeze: { a: 0.8, x0: 0, b: 0.25, ang: 1.5708 } } }),
  field({ id: 'dusk.tremolo', name: 'Tremolo', group: 'strings', kind: 'tremolo', a: 0.56, f2: [0, 0, 0.82, 3.2], sp: [0, 0, 1.15, 0], arcs: [push(1, 1.14)], drive(out, { OFF, phi }) { out[OFF['spare.b']] += 2.2 * phi; } }),
  field({ id: 'dusk.harmonics', name: 'Harmonics', group: 'strings', kind: 'none', flow: 0.2, arcs: [push(1, 1.15), bank(-0.12, 0.08)], over: { freq: 0.62, bend1: { a: 0.17, f: 2.4, ph: 0, ang: 0 }, bend2: { a: 0.08, f: 5.1, ph: 1, ang: 0 } }, drive(out, { OFF, phi }) { out[OFF['bend1.ph']] += 1.4 * phi; out[OFF['bend2.ph']] -= 2.2 * phi; } }),
  field({ id: 'dusk.cloister', name: 'Cloister', group: 'strings', kind: 'cloister', f2: [0.05, -0.05, 0.12, 2.2], flow: 0.45, sun: [0.05, 0.02, 0.15], cam: 'anchor', arcs: [pan(-0.07, 0.07), push(1, 1.22)] }),
  // ---------------------------------------------------------------- the room: where the light ends up
  field({ id: 'dusk.blinds', name: 'Blinds', group: 'room', kind: 'blinds', wall: [-0.1, 0.05, 0.42, 0.78, 0.62, 0.34], a: 0.38, f2: [0, 0, 0, 2.2], sp: [0.2, 0, 0.3, 0], flow: 0.12, cam: 'wall', fams: [{ x: 0.42, ph: 0.2, d: 0.95 }], arcs: [{ path: 'field.ph', from: 0.28, to: 0.5 }, pan(-0.12, 0.12), push(1, 1.12)] }),
  field({ id: 'dusk.curtain', name: 'Curtain', group: 'room', kind: 'curtain', a: 0.3, f2: [0, 0, 0, 1.25], sp: [0.42, 0, 2.1, 0], flow: 0.08, cam: 'sheet', arcs: [push(1, 1.1), crane(-0.05, 0.05)], drive(out, { OFF, phi }) { out[OFF['spare.b']] += 0.8 * phi; } }),
  field({ id: 'dusk.dapple', name: 'Dapples', group: 'room', kind: 'dapple', f2: [0, 3, 0, 1.55], flow: 0.4, cam: 'sheet', poles: [[-0.9, 0.3, 0.55], [0.7, 0.45, 0.42], [0.15, -0.5, 0.5], [-1.5, -0.6, 0.34], [1.45, -0.42, 0.36]], arcs: [pan(-0.1, 0.1), push(1, 1.12)], drive(out, { OFF, phi }) { const w = phi * 0.5; for (const [x, y, i] of [['blobs.x1', 'blobs.y1', 0], ['blobs.x2', 'blobs.y2', 1], ['blobs.x3', 'blobs.y3', 2], ['p1.x', 'p1.y', 3], ['p2.x', 'p2.y', 4]]) { out[OFF[x]] += 0.16 * Math.cos(w * (i % 2 ? 1 : -1) * (1 + 0.2 * i) + i * 1.7); out[OFF[y]] += 0.16 * Math.sin(w * (i % 2 ? 1 : -1) * (1 + 0.2 * i) + i * 1.7); } } }),
  field({ id: 'dusk.moon', name: 'New Moon', group: 'room', kind: 'moon', f2: [0.1, 0.14, 0.08, 2.1], sp: [0.42, 0.34, 0.26, 0.4], flow: 0.42, sun: [-1.6, 1.3, 0.1], cam: 'anchor', arcs: [pan(-0.08, 0.08), push(1, 1.2)] }),
  field({ id: 'dusk.smoke', name: 'Chimney Smoke', group: 'room', kind: 'smoke', a: 0.1, f2: [0, 0, 0, 1.5], sp: [2.1, 0, 0, 0], flow: 0.14, arcs: [pan(-0.1, 0.1), crane(-0.1, 0.1), push(1.05, 1.15)], drive(out, { OFF, phi }) { out[OFF['spare.b']] += 1.6 * phi; } }),
  field({ id: 'dusk.windows', name: 'Lit Windows', group: 'room', kind: 'none', flow: 0.1, lit: 1, lamps: 0, cam: 'sheet', fams: [{ x: 1.25, ph: 0.25 }], over: { freq: 0.72 }, arcs: [pan(-0.2, 0.2), crane(0.1, -0.1), push(1, 1.14)], drive(out, { OFF, phi }) { out[OFF['f1.ph']] += 0.2 * phi; } }),
];
// Long Rays and Six Strings have nothing for the field to do.
const rays = pool.find(p => p.id === 'dusk.rays');
rays.g.field = { kind: 0, a: 0, b: 0, ph: 0 }; rays.g['field.k0'] = 0; rays.g.fams = [{ t1: 22, ph: 0.25 }]; rays.g['p1.x'] = -0.5; rays.g['p1.y'] = -0.38; rays.g['p1.q'] = 0; rays.flow = {}; rays.drive = (out, { OFF, phi }) => { out[OFF['f0.ph']] += 0.5 * phi; };
for (const id of ['dusk.strings', 'dusk.harmonics', 'dusk.windows']) { const p = pool.find(x => x.id === id); p.g.field = { kind: 0, a: 0, b: 0, ph: 0 }; p.g['field.k0'] = 0; }
// The film's own patterns, in this evening's light: ones with one or two families and no field of their own, which is what a tail can show. Copies, so that a click on one can come by this world's way across, and the library's own stay as they are.
const film = (from, name) => { const o = byId[from]; return o ? [{ ...o, id: `dusk.${from}`, name: name ?? o.name, group: 'film', family: 'dusk', pool: true, cam: 'sheet', lamps: 0 }] : []; };
pool.push(...film('lines.river'), ...film('lines.fall'), ...film('waves.current'), ...film('pole.whirl'), ...film('pole.dipole'), ...film('rooms.nested'), ...film('void.zebra'), ...film('checks.vega'), ...film('rooms.arrows'), ...film('riley.metamorphosis'));
// How a click on each comes: by this world's own ways across. The next place comes into the window, the light does it, or it drifts.
const COMES = { land: 'line', road: 'line', strings: 'settle', room: 'flare', film: 'fall' };
for (const p of pool) p.arrive = p.sun && p.group !== 'land' ? { id: 'flare', chosen: true, centre: [p.sun[0], p.sun[1]] } : { id: COMES[p.group] ?? 'line', chosen: true };
