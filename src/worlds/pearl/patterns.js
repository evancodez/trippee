// Pearl's pool. A pattern's lines are only half of it: film says how the thickness of the film goes with it (see field.js).
// group: contact (Newton's rings, bubbles: round things touching), water (silk, ink, caustics, light), shell (scales, nacre, nautilus, the things that are really iridescent), op (moire and the film's own).
import { byId } from '../../pattern/library.js';

const LINES = 2.2;
export const FLOW = 6;         // lines per cycle of the film's clock
const PH = 3;
const NAMES = [['blobs.x1', 'blobs.y1', 'blobs.a1'], ['blobs.x2', 'blobs.y2', 'blobs.a2'], ['blobs.x3', 'blobs.y3', 'blobs.a3'], ['p1.x', 'p1.y', 'p1.ay'], ['p2.x', 'p2.y', 'p2.ay']];
export const GAP = 0, GRAIN = 1, BUBBLE = 2, SCALE = 3, CAUSTIC = 4, DEW = 5, WAVES = 6, VEIL = 7, CELLS = 8, STRAND = 9;
// What a pattern's film is, unless it says. See field.js.
export const FILM = { H: 1500, wedge: 260, R: 130, B: 0, C: 0, gap: 90, terrace: 0, rib: 0, ribs: 60, pool: 170, lets: 1, echo: 110, cell: 0, barbs: 0 };

function pearl({ id, name, group = 'contact', kind = GAP, k = 2, n = 0, a = 1, beta = 1.6, size = 0, poles = [], orbit = 0.16, arcs = [], over = {}, fams = [], flow = null, field = true, f0 = null, film = {}, time = 0.2, lines = LINES, can = [], fine = true, swing = 0.5 }) {
  const P = [...poles, ...Array(5).fill([0, 0, 0, 0])].slice(0, 5);
  const g = {
    fams: [f0 ?? { y: lines, ph: PH }, ...fams],
    field: { kind: 4, a: kind, b: n, ph: a }, 'field._1': beta, 'field._2': size, 'star._3': k, 'field.k0': field ? k : 0,
    'blobs.on': 0,
    'blobs.x1': P[0][0], 'blobs.y1': P[0][1], 'blobs.r1': P[0][2], 'blobs.a1': P[0][3],
    'blobs.x2': P[1][0], 'blobs.y2': P[1][1], 'blobs.r2': P[1][2], 'blobs.a2': P[1][3],
    'blobs.x3': P[2][0], 'blobs.y3': P[2][1], 'blobs.r3': P[2][2], 'blobs.a3': P[2][3],
    'p1.x': P[3][0], 'p1.y': P[3][1], 'p1.q': P[3][2], 'p1.ay': P[3][3],
    'p2.x': P[4][0], 'p2.y': P[4][1], 'p2.q': P[4][2], 'p2.ay': P[4][3],
    ...over,
  };
  const phase = poles.map((_, i) => 1.7 * i + 0.4), moving = field && (kind === GAP || kind === BUBBLE || kind === WAVES || kind === VEIL);
  return {
    id, name, family: 'pearl', group, fine, lambda: 0.05, g, can, film: { ...FILM, ...film }, arcs,
    // What's declared as flow is on a family that's off, because the song's slideLines goes wherever flow says. The lines' own flow is in drive, one clock for all of them.
    flow: { 'f3.ph': 1, ...flow },
    drive(out, { phi, OFF }) {
      out[OFF['f0.ph']] -= FLOW * phi;
      out[OFF['field.scale']] += time * phi * 6;
      if (moving) for (let i = 0; i < poles.length; i++) {
        const [nx, ny] = NAMES[i], th = phi * 1.1 * (i % 2 ? -1 : 1) * (1 + 0.2 * i) + phase[i], A = orbit * (0.7 + 0.15 * i);
        if (A) { out[OFF[nx]] += A * Math.cos(th); out[OFF[ny]] += A * Math.sin(th); }
      }
    },
  };
}
// A film pattern in this film. Its first family on the world's clock, so it can go anywhere and the lines keep their place. Its other families keep their own flow.
function own(from, id, name, film = {}, more = {}) {
  const o = byId[from];
  if (!o) throw new Error(`no ${from}`);
  const flow = { ...o.flow };
  delete flow['f0.ph'];
  return { ...o, id: `pearl.${id}`, name, family: 'pearl', group: more.group ?? 'op', pool: true, fine: o.fine, flow, film: { ...FILM, lets: 0.55, ...film }, ...more,
    drive(out, ctx) { o.drive?.(out, ctx); out[ctx.OFF['f0.ph']] -= FLOW * ctx.phi; } };
}

const wide = [{ path: 'rot', from: -0.14, to: 0.14 }, { path: 'scale', from: 1.0, to: 1.28, log: true }, { path: 'tx', from: -0.16, to: 0.16 }];
const down = [{ path: 'ty', from: 0.2, to: -0.2 }, { path: 'scale', from: 1.2, to: 1.0, log: true }, { path: 'rot', from: 0.08, to: -0.08 }];

export const pool = [
  // ---------------------------------------------------------------- contact: round things touching. Rings crowd going out, and it's the rings' colour that runs
  pearl({ id: 'pearl.newton', name: "Newton's Rings", k: 1.5, beta: 1.2,
    poles: [[-0.75, 0.15, 1.05, 0], [1.05, -0.35, 0.8, 0], [0.35, 1.25, 0.55, 0]], arcs: wide,
    film: { H: 1250, R: 170, wedge: 180, pool: 150, echo: 130 } }),
  pearl({ id: 'pearl.fizeau', name: 'Fizeau Wedge', k: 1.1, beta: 1.4, orbit: 0.35,
    poles: [[-2.6, 1.8, 1.6, 0], [2.7, -1.5, 1.4, 0]], arcs: down,
    film: { H: 1600, wedge: 340, R: 140, pool: 210, lets: 1.1 } }),
  pearl({ id: 'pearl.bubbles', name: 'Soap Bubbles', kind: BUBBLE, k: 1.05, n: 5.5, a: 0.55, lines: 1.5, time: 0.12, orbit: 0.3,
    poles: [[-0.85, 0.18, 0.86, 0], [0.92, 0.5, 0.56, 0.8], [0.55, -0.62, 0.42, 1.6], [-1.75, -0.7, 0.34, 2.2], [1.85, -0.3, 0.3, 0.2]], arcs: wide,
    film: { H: 1120, wedge: 520, R: 190, pool: 120, lets: 0.8, echo: 80 } }),
  pearl({ id: 'pearl.chorus', name: 'Chorus', group: 'op', kind: WAVES, k: 0.75, n: 1.05, time: 0.9, orbit: 0.22,
    poles: [[-0.8, 0.1, 1, 0], [0.8, -0.1, 1, 0], [0.05, 1.5, 0.7, 1.1]], arcs: wide,
    film: { H: 1700, R: 200, wedge: 150, pool: 140, lets: 0.55 } }),
  pearl({ id: 'pearl.medusa', name: 'Medusae', kind: VEIL, k: 2.1, n: 0.8, beta: 1.4, time: 0.5, orbit: 0.22,
    poles: [[-0.85, 0.3, 0.62, 0.1], [0.95, -0.05, 0.46, -0.15], [0.2, 1.0, 0.3, 0.05], [1.95, 0.8, 0.26, 0.2], [-1.9, -0.85, 0.3, -0.1]], arcs: down,
    film: { H: 1300, R: 180, wedge: 300, pool: 130, lets: 0.9 } }),
  // ---------------------------------------------------------------- water: what the voice floats on
  pearl({ id: 'pearl.silk', name: 'Watered Silk', group: 'water', kind: GRAIN, k: 2.4, a: 0.9, time: 0.22,
    arcs: [{ path: 'tx', from: -0.3, to: 0.3 }, { path: 'scale', from: 1.05, to: 1.3, log: true }, { path: 'rot', from: -0.06, to: 0.06 }],
    film: { H: 1950, R: 150, wedge: 240, pool: 200, rib: 70, ribs: 58, lets: 0.75 } }),
  pearl({ id: 'pearl.ink', name: 'Ink Tank', group: 'water', field: false, f0: { y: 1.9, ph: PH }, flow: { 'bend1.ph': 0.8, 'bend2.ph': -0.6, 'swirl.a': 0 },
    over: { swirl: { a: 1.9, sig: 1.25, log: 0, cx: -0.3 }, bend1: { a: 0.32, f: 1.4, ph: 0, ang: 0.3 }, bend2: { a: 0.16, f: 2.9, ph: 1, ang: 1.8 } },
    arcs: [{ path: 'swirl.a', from: 1.5, to: 2.4 }, { path: 'scale', from: 1.0, to: 1.25, log: true }, { path: 'tx', from: 0.15, to: -0.15 }],
    film: { H: 1200, R: 210, wedge: 300, pool: 180, lets: 1.1, echo: 150 } }),
  pearl({ id: 'pearl.aurora', name: 'Aurora', group: 'water', field: false, f0: { x: 1.9, ph: PH }, flow: { 'bend1.ph': 0.9, 'bend2.ph': -1.2 },
    over: { bend1: { a: 0.42, f: 1.05, ph: 0, ang: 1.45 }, bend2: { a: 0.2, f: 2.4, ph: 1, ang: 1.62 } },
    arcs: [{ path: 'tx', from: -0.35, to: 0.35 }, { path: 'scale', from: 1.05, to: 1.25, log: true }],
    film: { H: 1100, R: 150, wedge: 620, pool: 150, lets: 0.9, echo: 170 } }),
  pearl({ id: 'pearl.pool', name: 'Pool Floor', group: 'water', kind: CAUSTIC, k: 1.5, time: 0.6, f0: { y: 0.8, ph: PH, d: -0.34 },
    arcs: [{ path: 'tx', from: -0.3, to: 0.3 }, { path: 'ty', from: 0.14, to: -0.14 }, { path: 'scale', from: 1.0, to: 1.3, log: true }],
    film: { H: 1450, R: 240, wedge: 180, pool: 230, lets: 0.7 } }),
  pearl({ id: 'pearl.dew', name: 'Dewdrops', group: 'water', kind: DEW, k: 2.5, a: 2.1, n: 0.66, size: 0.95, time: 0, lines: 2.5,
    arcs: [{ path: 'rot', from: -0.2, to: 0.2 }, { path: 'tx', from: 0.25, to: -0.25 }, { path: 'scale', from: 1.25, to: 1.0, log: true }],
    film: { H: 1650, R: 150, wedge: 260, pool: 170, lets: 0.6 } }),
  pearl({ id: 'pearl.drape', name: 'Drape', group: 'water', field: false, f0: { x: 2.3, ph: PH }, flow: { 'sheet.t': 1.1 },
    over: { sheet: { a: 0.3, f: 1.5, t: 0, ang: 0.35 } },
    arcs: [{ path: 'sheet.a', from: 0.22, to: 0.36 }, { path: 'scale', from: 1.05, to: 1.3, log: true }, { path: 'tx', from: -0.2, to: 0.2 }],
    film: { H: 1800, R: 190, wedge: 280, pool: 180, rib: 40, ribs: 42, lets: 0.8 } }),
  // ---------------------------------------------------------------- shell: the things that really are iridescent
  pearl({ id: 'pearl.nacre', name: 'Nacre', group: 'shell', kind: GRAIN, k: 1.9, a: 0.7, time: 0.1, fams: [{ x: 1.15, y: 0.3, ph: 0.2 }], flow: { 'f1.ph': 0.25 },
    arcs: [{ path: 'rot', from: -0.1, to: 0.18 }, { path: 'scale', from: 1.0, to: 1.3, log: true }, { path: 'tx', from: -0.14, to: 0.14 }],
    film: { H: 1500, R: 70, B: 0, terrace: 520, wedge: 120, pool: 130, gap: 60, lets: 0.6, echo: 60 } }),
  pearl({ id: 'pearl.scales', name: 'Fish Scales', group: 'shell', kind: SCALE, k: 3, size: 0.56, time: 0,
    arcs: [{ path: 'rot', from: -0.12, to: 0.12 }, { path: 'scale', from: 1.0, to: 1.32, log: true }, { path: 'tx', from: 0.2, to: -0.2 }],
    film: { H: 1500, R: 110, cell: 480, wedge: 150, pool: 130, lets: 0.55, echo: 90 } }),
  pearl({ id: 'pearl.peacock', name: 'Peacock', group: 'shell', kind: SCALE, k: 2.5, size: 0.86, time: 0,
    arcs: [{ path: 'ty', from: 0.2, to: -0.2 }, { path: 'scale', from: 1.3, to: 1.05, log: true }, { path: 'rot', from: 0.06, to: -0.06 }],
    film: { H: 1100, R: 240, cell: 170, barbs: 60, wedge: 80, pool: 90, lets: 0.5, echo: 70 } }),
  pearl({ id: 'pearl.scallop', name: 'Scallop', group: 'shell', field: false, f0: { t1: 15, ph: PH }, fams: [{ l1: 3.1, d: -1, on: 1 }], flow: { 'f1.ph': -0.45 },
    over: { p1: { x: -0.1, y: -1.5, q: 0, ay: 1 } },
    arcs: [{ path: 'p1.x', from: -0.3, to: 0.3 }, { path: 'scale', from: 1.0, to: 1.25, log: true }],
    film: { H: 1250, R: 70, C: 360, wedge: 130, pool: 110, lets: 0.8, echo: 50 } }),
  pearl({ id: 'pearl.nautilus', name: 'Nautilus', group: 'shell', field: false, f0: { l1: 2.7, t1: 4, ph: PH }, fams: [{ t1: 9, l1: -0.5, d: -1, on: 1 }], flow: { 'f1.ph': 0.5 },
    over: { p1: { x: 0.25, y: -0.1, q: 0, ay: 1 } },
    arcs: [{ path: 'p1.x', from: 0.45, to: -0.1 }, { path: 'scale', from: 1.0, to: 1.3, log: true }],
    film: { H: 1350, R: 150, C: 240, wedge: 170, pool: 110, lets: 0.9, echo: 120 } }),
  pearl({ id: 'pearl.lace', name: 'Lace', group: 'shell', k: 1.2, beta: 1.8, orbit: 0.1, fams: [{ t1: 24, l1: 1.2, d: 0.2, ph: 0.2 }], flow: { 'f1.ph': 0.3 },
    poles: [[1.0, 0.25, 0.5, 0], [0.45, 0.05, 0.3, 0]],
    over: { fold: { n: 8, rot: 0, cx: 0, cy: 0 }, p1: { x: 0, y: 0, q: 0, ay: 1 } },
    arcs: [{ path: 'fold.rot', from: -0.4, to: 0.4 }, { path: 'scale', from: 1.0, to: 1.25, log: true }],
    film: { H: 1800, R: 90, wedge: 60, pool: 130, lets: 0.7, echo: 60 } }),
  pearl({ id: 'pearl.agate', name: 'Agate', group: 'shell', kind: CELLS, k: 3.2, size: 0.95, time: 0, lines: 2,
    arcs: [{ path: 'rot', from: -0.14, to: 0.14 }, { path: 'scale', from: 1.0, to: 1.35, log: true }, { path: 'tx', from: -0.24, to: 0.24 }],
    film: { H: 1350, R: 150, cell: 620, wedge: 110, pool: 110, lets: 0.6, echo: 80 } }),
  pearl({ id: 'pearl.strand', name: 'Strand of Pearls', group: 'contact', kind: STRAND, k: 1, n: 4.2, a: 0.5, size: 0.62, time: 0.1, lines: 1.5,
    arcs: [{ path: 'tx', from: -0.3, to: 0.3 }, { path: 'scale', from: 1.05, to: 1.3, log: true }, { path: 'rot', from: -0.08, to: 0.08 }],
    film: { H: 1350, wedge: 320, R: 170, cell: 340, pool: 120, lets: 0.7, echo: 70 } }),
  pearl({ id: 'pearl.frost', name: 'Frost', group: 'shell', field: false, f0: { x: 2.2, ph: PH }, fams: [{ y: 1.1, d: -1, on: 1 }], flow: { 'f1.ph': 0.3 },
    over: { fold: { n: 6, rot: 0, cx: 0, cy: 0 }, zig: { a: 0.3, c: 1.5, b: 0, n: 0 } },
    arcs: [{ path: 'fold.rot', from: -0.35, to: 0.35 }, { path: 'zig.a', from: 0.22, to: 0.4 }, { path: 'scale', from: 1.0, to: 1.3, log: true }],
    film: { H: 2000, R: 120, C: 200, wedge: 60, pool: 130, lets: 0.7, echo: 70 } }),
  // ---------------------------------------------------------------- the film's own, in this film
  own('waves.silk', 'wavesilk', 'Silk Waves', { H: 1500, pool: 220, lets: 0.8 }, { group: 'water' }),
  own('waves.pond', 'pond', 'Pond', { H: 1250, wedge: 200, lets: 0.8 }, { group: 'water' }),
  own('waves.cloth', 'cloth', 'Cloth', { H: 1900, rib: 60, ribs: 54, lets: 0.8 }, { group: 'water' }),
  own('pole.rosette', 'rosette', 'Rosette', { H: 1300, R: 200 }, { group: 'op' }),
  own('checks.cloth', 'check', 'Woven Check', { H: 1650, terrace: 300, lets: 0.5, R: 60 }, { group: 'op' }),
  own('checks.twist', 'twist', 'Turning Check', { H: 1400, terrace: 340, lets: 0.5, R: 60 }, { group: 'op' }),
  own('riley.shift', 'shift', 'Shift', { H: 1200, lets: 0.5 }, { group: 'op' }),
  own('lines.fall', 'fall', 'Falls', { H: 1200, wedge: 500, lets: 0.8 }, { group: 'water' }),
];
export const FILMS = new Map(pool.map(p => [p.id, p.film]));
