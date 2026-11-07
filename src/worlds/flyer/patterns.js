// Flyer's pool. Everything's one numbered family on the world's field, plus what's XOR-ed through it, so anything can become anything. Numbers: see field.js.
// Under the field every pattern is plain stripes, LINES to the unit, and the field takes them away again: phase = share*k*S + (1-share)*LINES*y. With the field gone there's lines, and never a solid. It's how anything melts into anything.
// group: target, icon, plate, op, film. The director goes round them by group.
import { byId } from '../../pattern/library.js';

export const LINES = 2.4, FLOW = 4;     // lines per cycle of the film's clock: with no song about one a second
// A surge and a near stop: whole on each strong beat, and fastest there. The plan's x + .9 sin(2 pi x) / 2 pi.
export const ratchet = x => x + (0.86 * Math.sin(2 * Math.PI * x)) / (2 * Math.PI);
export const STAR = 1, BANG = 2, SPADE = 3, DIAMOND = 4, OCTAGON = 5, TRIANGLE = 6, STAGE = 7;
const NAMES = [['blobs.x1', 'blobs.y1', 'blobs.a1'], ['blobs.x2', 'blobs.y2', 'blobs.a2'], ['blobs.x3', 'blobs.y3', 'blobs.a3'], ['p1.x', 'p1.y', 'p1.ay'], ['p2.x', 'p2.y', 'p2.ay']];
const PH = 3;

// Where a ring-born line sits before the clock: so that a pole's centre has about the same number in every pattern, and a landing doesn't send rings past on top of the flow.
const atCentre = (k, swell, e) => -k * (swell > 0.5 ? Math.log(e + 0.12) : 0.2 * swell);
// Toner on a drum of its own, no more than a third of the sheet. A family's duty is how much of it stays white.
const TONER = -0.36;
function poster({ id, name, group = 'target', k = 2.5, n = 6, a = 0.2, kappa = 0, beta = 3, swell = 0.3, e = 0.16, motif = 0, poles = [], orbit = 0.12, spin = 0.14, arcs = [], over = {}, fams = [], lines = LINES, kind = 0, extra = 0, tile = 0, screen = 6, plates = 0, stencil = null, grid = null, ph = null, field = true, flow = null, can = [], pool = true, edition = null }) {
  const P = [...poles, ...Array(5).fill([0, 0, 0, 0])].slice(0, 5), kinds = Array.isArray(motif) ? motif : P.map(() => motif);
  const g = {
    fams: [{ y: lines, ph: ph ?? (field && kind === 0 ? atCentre(k, swell, e) : PH), ...(plates ? { d: TONER } : {}) }, ...fams],
    field: { kind: 4, a: n, b: kinds.reduce((sum, m, i) => sum + (m || 0) * 16 ** i, 0), ph: a }, 'field.spin': kinds.some(Boolean) ? 1 : 0, 'field.scale': kappa, 'field._1': beta, 'field._2': swell, 'field.k0': field ? k : 0,
    'star._1': kind, 'star._2': extra, 'star._3': k,
    'spare.a': plates, 'spare.b': e, 'spare.c': screen, 'spare.d': stencil ? 1 : 0,
    'blobs.on': 0, 'blobs.beta': tile,
    'blobs.x1': P[0][0], 'blobs.y1': P[0][1], 'blobs.r1': P[0][2], 'blobs.a1': P[0][3],
    'blobs.x2': P[1][0], 'blobs.y2': P[1][1], 'blobs.r2': P[1][2], 'blobs.a2': P[1][3],
    'blobs.x3': P[2][0], 'blobs.y3': P[2][1], 'blobs.r3': P[2][2], 'blobs.a3': P[2][3],
    'p1.x': P[3][0], 'p1.y': P[3][1], 'p1.q': P[3][2], 'p1.ay': P[3][3],
    'p2.x': P[4][0], 'p2.y': P[4][1], 'p2.q': P[4][2], 'p2.ay': P[4][3],
    ...over,
  };
  const phase = poles.map((_, i) => 1.7 * i + 0.4);
  return {
    id, name, family: 'flyer', group, fine: false, lambda: 0.05, g, can, stencil, grid, pool, edition, via: { id: 'feed', dir: 3, ang: id.length * 1.3 },
    flow: { 'f1.ph': 1, ...flow },
    arcs,
    // The film's one clock, surging. Poles go round on it too, so they go with the music and stop when it stops.
    drive(out, { phi, OFF }) {
      out[OFF['f0.ph']] -= ratchet(FLOW * phi);
      const w = phi * 1.1;
      for (let i = 0; i < poles.length; i++) {
        const [nx, ny, na] = NAMES[i], th = w * (i % 2 ? -1 : 1) * (1 + 0.2 * i) + phase[i], A = orbit * (0.7 + 0.15 * i);
        if (A) { out[OFF[nx]] += A * Math.cos(th); out[OFF[ny]] += A * Math.sin(th); }
        if (spin) out[OFF[na]] += w * (i % 2 ? spin : -spin);
      }
    },
  };
}

// A film pattern in this world's inks, as it is, with its first family on the world's clock. Its other families keep their own flow.
function film(from, id, name, more = {}) {
  const o = byId[from], flow = { ...o.flow };
  delete flow['f0.ph'];
  return {
    ...o, id: `flyer.${id}`, name, family: 'flyer', group: 'film', pool: true, fine: o.fine, flow, via: { id: 'feed', dir: 3, ang: id.length * 1.3 }, ...more,
    drive(out, ctx) { o.drive?.(out, ctx); out[ctx.OFF['f0.ph']] -= ratchet(FLOW * ctx.phi); },
  };
}

const swing = (r = 0.2, s = [1, 1.28]) => [{ path: 'rot', from: -r, to: r }, { path: 'scale', from: s[0], to: s[1], log: true }];

export const pool = [
  // ---------------------------------------------------------------- targets: the speaker. Rings, and the edges of the rings are the song's own wave
  poster({ id: 'flyer.target', name: 'The Who', k: 2.4, n: 10, a: 0.14, poles: [[-0.25, 0.02, 1, 0.2]], orbit: 0.1, screen: 6,
    arcs: [...swing(0.14), { path: 'tx', from: -0.14, to: 0.14 }] }),
  poster({ id: 'flyer.cones', name: 'PA Stack', k: 2.1, n: 8, a: 0.14, tile: 0.92, beta: 4, poles: [[0, 0, 0.42, 0]], orbit: 0, spin: 0, screen: 7,
    arcs: [...swing(0.2, [0.95, 1.3]), { path: 'tx', from: -0.3, to: 0.3 }] }),
  poster({ id: 'flyer.twin', name: 'Twin Reverb', k: 2.2, n: 12, a: 0.12, beta: 2.2, poles: [[-0.95, 0.1, 0.75, 0.3], [1.0, -0.15, 0.75, 1.3]], orbit: 0.18,
    arcs: [...swing(0.16), { path: 'ty', from: 0.1, to: -0.1 }] }),
  poster({ id: 'flyer.crowd', name: 'Front Row', k: 2.6, n: 7, a: 0.14, beta: 3, swell: 0.55, poles: [[-1.1, 0.45, 0.6, 0.3], [0.85, 0.55, 0.72, 1.0], [0.05, -0.55, 0.55, 2.2], [-1.85, -0.7, 0.42, 0.7], [1.75, -0.65, 0.5, 1.7]], orbit: 0.2,
    arcs: swing(0.2) }),
  poster({ id: 'flyer.hole', name: 'Soundhole', k: 2.7, n: 16, a: 0.08, swell: 1, e: 0.2, beta: 3, poles: [[0.1, -0.05, 0.6, 0]], orbit: 0.08, spin: 0.25,
    arcs: [{ path: 'scale', from: 1, to: 1.35, log: true }, { path: 'tx', from: 0.22, to: -0.22 }] }),
  // ---------------------------------------------------------------- icons: what's on the back of a jacket. Motifs echo; a stencil's cut
  poster({ id: 'flyer.star', name: 'Rock Star', group: 'icon', motif: STAR, k: 2.2, n: 5, a: 0.04, swell: 0.4, poles: [[-0.2, 0.0, 1, 0.1]], orbit: 0.08, spin: 0.2,
    arcs: swing(0.12, [1, 1.24]) }),
  poster({ id: 'flyer.bang', name: 'Pow', group: 'icon', motif: BANG, k: 2.3, n: 11, a: 0.05, swell: 0.4, poles: [[0.15, 0.02, 1, 0]], orbit: 0.08, spin: 0.3,
    arcs: swing(0.18) }),
  poster({ id: 'flyer.spade', name: 'Ace of Spades', group: 'icon', motif: SPADE, k: 2.3, n: 6, a: 0.02, swell: 0.3, e: 0.1, spin: 0, orbit: 0.06, poles: [[0.0, 0.05, 0.92, 0]],
    arcs: [{ path: 'scale', from: 1, to: 1.2, log: true }, { path: 'tx', from: -0.14, to: 0.14 }] }),
  poster({ id: 'flyer.stage', name: 'Stage Door', group: 'icon', motif: STAGE, k: 2.6, n: 8, a: 0.05, swell: 0.6, beta: 3, spin: 0, orbit: 0.05, poles: [[0, 0, 1, 0]],
    arcs: [{ path: 'scale', from: 0.95, to: 1.3, log: true }, { path: 'rot', from: -0.1, to: 0.1 }] }),
  poster({ id: 'flyer.skull', name: 'Skull', group: 'icon', field: false, poles: [[0, 0, 1, 0]], lines: 1.15, stencil: { key: 'skull', x: 0, y: -0.02, s: 0.98, rot: 0 }, screen: 6,
    arcs: [{ path: 'rot', from: -0.5, to: 0.1 }, { path: 'scale', from: 1, to: 1.2, log: true }] }),
  poster({ id: 'flyer.bolt', name: 'Thunderbolt', group: 'icon', field: false, poles: [[0, 0, 1, 0]], lines: 1.5, stencil: { key: 'bolt', x: 0, y: 0, s: 1.0, rot: 0.1 }, kind: 0, screen: 5,
    over: { rot: 0.8 },
    arcs: [{ path: 'rot', from: -0.25, to: 0.25 }, { path: 'scale', from: 1, to: 1.2, log: true }] }),
  poster({ id: 'flyer.ace', name: 'Black Spade', group: 'icon', k: 1.5, n: 9, a: 0.14, beta: 2.4, poles: [[-1.5, 0.3, 0.8, 0], [1.5, -0.3, 0.8, 1]], stencil: { key: 'spade', x: 0, y: 0, s: 0.97, rot: 0 }, screen: 6,
    arcs: swing(0.12) }),
  poster({ id: 'flyer.anarchy', name: 'Anarchy', group: 'icon', field: false, poles: [[0, 0, 1, 0]], lines: 1.25, fams: [{ x: 1.25 }], stencil: { key: 'anarchy', x: 0, y: 0, s: 0.97, rot: 0 }, screen: 6,
    arcs: [{ path: 'rot', from: 0.5, to: 0.9 }, { path: 'scale', from: 1, to: 1.15, log: true }] }),
  poster({ id: 'flyer.fist', name: 'Fist', group: 'icon', field: false, poles: [[0, 0, 1, 0]], lines: 1.5, stencil: { key: 'fist', x: 0, y: -0.02, s: 0.98, rot: 0 }, screen: 7,
    arcs: [{ path: 'rot', from: -0.3, to: 0.3 }, { path: 'scale', from: 1, to: 1.2, log: true }] }),
  // ---------------------------------------------------------------- Warhol: the same screen in panels, every panel in inks of its own
  poster({ id: 'flyer.factory', name: 'The Factory', group: 'pop', field: false, poles: [[0, 0, 1, 0]], lines: 2.1, stencil: { key: 'skull', x: 0, y: 0, s: 0.86, rot: 0 }, grid: [4, 2], screen: 11,
    arcs: [{ path: 'rot', from: 0.5, to: 0.9 }] }),
  poster({ id: 'flyer.fists', name: 'Power', group: 'pop', field: false, poles: [[0, 0, 1, 0.5]], lines: 2.3, stencil: { key: 'fist', x: 0, y: 0, s: 0.88, rot: 0 }, grid: [3, 2], screen: 10,
    arcs: [{ path: 'rot', from: -0.9, to: -0.5 }] }),
  poster({ id: 'flyer.stars', name: 'Superstars', group: 'pop', field: false, poles: [[0, 0, 1, 0]], lines: 2.2, stencil: { key: 'star', x: 0, y: 0, s: 0.92, rot: 0 }, grid: [4, 2], screen: 11, arcs: [{ path: 'rot', from: 1.1, to: 0.7 }] }),
  poster({ id: 'flyer.bolts', name: 'Sparks', group: 'pop', field: false, poles: [[0, 0, 1, 0.5]], lines: 2.4, stencil: { key: 'bolt', x: 0, y: 0, s: 0.92, rot: 0.08 }, grid: [5, 2], screen: 12,
    arcs: [{ path: 'rot', from: 0.2, to: 0.5 }] }),
  // ---------------------------------------------------------------- headlines: wood type, and the first is the song's own name
  poster({ id: 'flyer.headliner', name: 'Headliner', group: 'icon', field: false, poles: [[0, 0, 1, 0]], lines: 1.4, stencil: { key: 'title', x: 0, y: 0, s: 0.84, rot: -0.04 }, screen: 6,
    arcs: [{ path: 'rot', from: 0.6, to: 1 }, { path: 'scale', from: 1, to: 1.2, log: true }] }),
  poster({ id: 'flyer.loud', name: 'LOUD', group: 'icon', field: false, poles: [[0, 0, 1, 0]], lines: 1.7, fams: [{ x: 1.7 }], stencil: { key: 'word:LOUD', x: 0, y: 0, s: 0.9, rot: 0.03 }, screen: 7,
    arcs: [{ path: 'rot', from: 0.2, to: 0.5 }, { path: 'scale', from: 1, to: 1.2, log: true }] }),
  poster({ id: 'flyer.tonight', name: 'Tonight', group: 'icon', a: 0, k: 1.1, swell: 0, spin: 0, orbit: 0, fams: [{ t1: 14 }], flow: { 'f1.ph': -1.2 }, poles: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0.2, -1.1, 1, 1]], stencil: { key: 'word:LIVE\nTONIGHT', x: 0, y: 0.02, s: 0.92, rot: 0 }, screen: 6,
    arcs: [{ path: 'p1.x', from: 0.7, to: -0.7 }], can: ['turnstile'] }),
  // ---------------------------------------------------------------- plates: each family on its own drum, laid over the others. Not XOR: ink
  poster({ id: 'flyer.tartan', name: 'Bondage Trousers', group: 'plate', field: false, plates: 1, poles: [[0, 0, 1, 0]], lines: 1.7, screen: 8,
    fams: [{ x: 1.7, d: 0.05 }, { x: 1.7, y: 1.7, d: 0.5 }],
    arcs: [{ path: 'rot', from: 0.2, to: 0.48 }, { path: 'scale', from: 1, to: 1.25, log: true }, { path: 'tx', from: -0.2, to: 0.2 }] }),
  poster({ id: 'flyer.strat', name: 'Frankenstrat', group: 'plate', field: false, plates: 1, poles: [[0, 0, 1, 0]], lines: 1.5, screen: 7,
    fams: [{ x: 1.25, y: 0.75, d: -0.35 }, { x: -0.65, y: 1.5, d: 0.3 }],
    arcs: [{ path: 'rot', from: -0.15, to: 0.15 }, { path: 'scale', from: 1, to: 1.2, log: true }],
    flow: { 'f1.ph': 0.5, 'f2.ph': -0.35 } }),
  poster({ id: 'flyer.chord', name: 'Power Chord', group: 'plate', field: false, plates: 1, poles: [[0, 0, 1, 0]], lines: 2.0, screen: 6,
    fams: [{ y: 3.0, d: -0.2 }],
    over: { bend1: { a: 0.1, f: 0.9, ph: 0, ang: 0 } },
    arcs: [{ path: 'rot', from: -0.3, to: 0.3 }, { path: 'scale', from: 1, to: 1.3, log: true }],
    flow: { 'f1.ph': 1.5 } }),
  poster({ id: 'flyer.halo', name: 'Par Cans', group: 'plate', plates: 1, k: 2.4, n: 8, a: 0.1, poles: [[-0.6, 0.15, 1, 0.3]], screen: 6, fams: [{ t1: 12 }, { x: 1.3, d: 0.2 }], flow: { 'f1.ph': -0.8, 'f2.ph': 0.4 },
    over: { 'p1.x': -0.6, 'p1.y': 0.15, 'p1.ay': 1 },
    arcs: [{ path: 'scale', from: 1, to: 1.3, log: true }], can: ['turnstile'] }),
  // ---------------------------------------------------------------- what's on every flyer
  poster({ id: 'flyer.check', name: 'Checkerboard', group: 'op', field: false, poles: [[0, 0, 1, 0]], lines: 2.3, fams: [{ x: 2.3 }], screen: 7,
    over: { bulge: { a: 0.75, r: 1.0, cx: -0.5, cy: 0.1 } },
    arcs: [{ path: 'rot', from: -0.14, to: 0.2 }, { path: 'bulge.cx', from: -0.8, to: 0.7 }, { path: 'scale', from: 1.25, to: 1.05, log: true }] }),
  poster({ id: 'flyer.rays', name: 'Rising Sun', group: 'op', a: 0, k: 1.0, swell: 0, spin: 0, orbit: 0, fams: [{ t1: 18 }], flow: { 'f1.ph': -1.2 }, poles: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0.5, -0.85, 1, 1]], screen: 6,
    arcs: [{ path: 'p1.x', from: 0.9, to: -0.9 }, { path: 'p1.y', from: -0.9, to: -0.55 }], can: ['turnstile'] }),
  poster({ id: 'flyer.zig', name: 'Charlie Brown', group: 'op', field: false, poles: [[0, 0, 1, 0]], lines: 2.6, screen: 6,
    over: { zig: { a: 0.42, c: 1.0, b: 0, n: 0 } },
    arcs: [{ path: 'rot', from: -0.2, to: 0.2 }, { path: 'zig.a', from: 0.3, to: 0.6 }, { path: 'scale', from: 1.0, to: 1.25, log: true }] }),
  poster({ id: 'flyer.zebra', name: 'Spandex', group: 'op', field: false, poles: [[0, 0, 1, 0]], lines: 2.9, screen: 7,
    over: { bend1: { a: 0.3, f: 2.1, ph: 0, ang: 0.5 }, bend2: { a: 0.16, f: 3.7, ph: 1, ang: 2.0 }, swirl: { a: 1.4, sig: 1.3, log: 0, cx: 0.5 } },
    flow: { 'bend1.ph': 3, 'bend2.ph': -2.2 },
    arcs: [{ path: 'scale', from: 1, to: 1.3, log: true }, { path: 'rot', from: -0.2, to: 0.2 }] }),
  poster({ id: 'flyer.benday', name: 'Ben-Day', group: 'op', field: false, poles: [[0, 0, 1, 0]], lines: 2.2, fams: [{ x: 2.2 }, { ph: 0.25, d: -40 }], screen: 5,
    over: { round: 1, sum: 0.42 / (40 * 0.577), bulge: { a: 0.45, r: 0.9, cx: 0.4, cy: 0 } },
    arcs: [{ path: 'rot', from: 0.45, to: 0.75 }, { path: 'scale', from: 1.0, to: 1.25, log: true }, { path: 'bulge.cx', from: 0.7, to: -0.7 }] }),
  poster({ id: 'flyer.flames', name: 'Flame Job', group: 'op', kind: 1, extra: 3.2, k: 1.9, n: 1, a: 2.8, kappa: 0.7, swell: 1.1, poles: [[-1, 0, 0.6, 0], [1, 0, 0.6, 0]], orbit: 0, spin: 0, screen: 7, edition: 9,
    over: { bend1: { a: 0.11, f: 1.7, ph: 0, ang: 1.57 }, bend2: { a: 0.05, f: 3.7, ph: 1, ang: 1.57 } }, flow: { 'bend1.ph': -4, 'bend2.ph': -3 },
    arcs: [{ path: 'rot', from: -0.05, to: 0.05 }], ph: PH }),
  poster({ id: 'flyer.pulsar', name: 'Pulsar', group: 'op', kind: 2, k: 2.8, n: 1.1, a: 0.55, kappa: 0.45, swell: 1.05, poles: [[0, 0, 1, 0]], orbit: 0, spin: 0, screen: 7,
    arcs: [{ path: 'scale', from: 1, to: 1.15, log: true }, { path: 'rot', from: -0.05, to: 0.05 }], ph: PH }),
  poster({ id: 'flyer.scope', name: 'Scope', group: 'op', kind: 2, k: 2.5, n: 1.4, a: 0.32, kappa: 0.25, swell: 0, poles: [[0, 0, 1, 0]], orbit: 0, spin: 0, screen: 7,
    arcs: [{ path: 'rot', from: 0.35, to: 0.65 }, { path: 'scale', from: 1, to: 1.2, log: true }], ph: PH }),
  // ---------------------------------------------------------------- the film's, in this world's inks
  film('checks.vega', 'vega', 'Op Art Night'),
  film('checks.crush', 'crush', 'Backstage'),      // not a nested room: pure log rings, and the camera rides them (B.self) at any speed it likes
  film('riley.shift', 'shift', 'Bridget'),
  film('dots.inflate', 'inflate', 'Pop Art'),
  film('lattice.star', 'latstar', 'Sheriff'),
  film('void.zebra', 'blobs', 'Liquid Zebra'),
];
