// Flower Power's pool. Every flat pattern is one numbered family on the world's field, plus what's XOR-ed through it, so they can all become each other.
// Numbers: field.a n (petals: SNAP, so nothing can glide across a change of count), field.b the motif on each pole, four bits a pole (src/worlds/flower/field.js has them), field.ph a (how much of its shape shows), field.scale kappa (how petals wind with the radius), field._1 beta (how flowers melt together), field._2 how fat a petal is,
// field.k0 lines per unit of log distance. spare.a the whiplash share, spare.b epsilon (a flower's cap), spare.c the flame share, spare.d lines per unit height, in flames. Poles: blobs 1-3 and p1, p2: x, y, size, turn.
// Under the field every pattern is plain stripes, LINES to the picture unit, and the field takes them away again: phase = share*k*S + (1-share)*LINES*y. With the field all there that's only k*S. With it gone (the middle of a change of world, where no program but this one can draw it, or a check) it's lines, and never a solid.
// group: flower, motif or op. The film goes round them by group (src/worlds/flower/direct.js).
const LINES = 2.2;
export const FLOW = 6;         // lines per cycle of the film's clock: with no song that's about one a second
const eps = 0.26;
export const base = (k, e = eps, swell = 0) => -k * (Math.log(e) + swell * e);     // so that a flower's centre sits at phase 0 before the flow: every flower gives birth to the same line at the same moment

// Where the two with no flower to centre on sit: about where those with one do (base() comes to 2.6 to 3.3), or a Bud into one of them sends several extra rings past on top of the flow, over the whole frame.
const PH = 3;

export const HEART = 1, STAR = 2, BUTTERFLY = 3, SUN = 4, CLOUD = 5, MUSHROOM = 6, EYE = 7, PEACE = 8, SMILE = 9;
const NAMES = [['blobs.x1', 'blobs.y1', 'blobs.a1'], ['blobs.x2', 'blobs.y2', 'blobs.a2'], ['blobs.x3', 'blobs.y3', 'blobs.a3'], ['p1.x', 'p1.y', 'p1.ay'], ['p2.x', 'p2.y', 'p2.ay']];
function flower({ id, name, group = 'flower', k = 2.6, n = 6, a = 0.5, kappa = 0, beta = 1.8, fat = 0.55, e = eps, poles = [], orbit = 0.26, arcs = [], over = {}, whip = 0, flame = 0, lobes = 0, ph = null, swell = 0.7, fade = 0.13, curl = 0, flow = null, motif = 0, spin = 0.6, sway = 0, field = true, fams = [], lines = LINES, tile = 0, turnOver = 0, every = 0, beads = 0, can = [], run = null }) {
  const P = [...poles, ...Array(5).fill([0, 0, 0, 0])].slice(0, 5);
  const kinds = Array.isArray(motif) ? motif : P.map(() => motif);
  const g = {
    fams: [{ y: lines, ph: ph ?? (field ? base(k, e, swell) : PH) }, ...fams],
    field: { kind: 4, a: n, b: kinds.reduce((sum, m, i) => sum + (m || 0) * 16 ** i, 0), ph: a }, 'field.spin': swell, 'star._1': fade, 'star._2': curl, 'star._3': k, 'field.scale': kappa, 'field._1': beta, 'field._2': fat, 'field.k0': field ? k : 0,
    'spare.a': whip, 'spare.b': e, 'spare.c': flame, 'spare.d': lobes, 'blobs.on': 0, 'blobs.beta': tile, 'blobs.t': turnOver, 'blobs.k': every, 'ribbon.a': beads,
    'blobs.x1': P[0][0], 'blobs.y1': P[0][1], 'blobs.r1': P[0][2], 'blobs.a1': P[0][3],
    'blobs.x2': P[1][0], 'blobs.y2': P[1][1], 'blobs.r2': P[1][2], 'blobs.a2': P[1][3],
    'blobs.x3': P[2][0], 'blobs.y3': P[2][1], 'blobs.r3': P[2][2], 'blobs.a3': P[2][3],
    'p1.x': P[3][0], 'p1.y': P[3][1], 'p1.q': P[3][2], 'p1.ay': P[3][3],
    'p2.x': P[4][0], 'p2.y': P[4][1], 'p2.q': P[4][2], 'p2.ay': P[4][3],
    ...over,
  };
  const phase = poles.map((_, i) => 1.7 * i + 0.4);
  return {
    id, name, family: 'flower', group, fine: true, lambda: 0.05, g, can, run,
    // The rings' flow is in drive, and what's declared as flow is on a family that's off, because the song's slideLines goes wherever flow says. It stays off: a line's number and place stay on the one clock.
    flow: { 'f1.ph': 1, ...flow },
    arcs,
    // Flowers orbit, each on its own small circle, and turn as they go. On the film's clock, so they go with the music and stop when it stops. A heart only sways: upside down it isn't one.
    drive(out, { phi, OFF }) {
      out[OFF['f0.ph']] -= FLOW * phi;
      const w = phi * 1.1;
      for (let i = 0; i < poles.length; i++) {
        const [nx, ny, na] = NAMES[i], th = w * (i % 2 ? -1 : 1) * (1 + 0.2 * i) + phase[i], A = orbit * (0.7 + 0.15 * i);
        if (A) { out[OFF[nx]] += A * Math.cos(th); out[OFF[ny]] += A * Math.sin(th); }
        if (sway) out[OFF[na]] += sway * Math.sin(th * 0.7);
        else if (spin) out[OFF[na]] += w * (i % 2 ? spin : -spin);
      }
    },
  };
}

const heartArcs = [{ path: 'rot', from: -0.12, to: 0.12 }, { path: 'scale', from: 1.0, to: 1.28, log: true }, { path: 'tx', from: -0.12, to: 0.12 }];
const opArcs = [{ path: 'rot', from: -0.3, to: 0.3 }, { path: 'scale', from: 0.95, to: 1.3, log: true }];

export const pool = [
  // ---------------------------------------------------------------- flowers, the heart of it
  flower({
    id: 'flower.daisy', name: 'Daisy Chain', n: 7, a: 0.62, fat: 0.5, k: 2.5,
    poles: [[-1.05, 0.42, 0.72, 0.3], [0.92, 0.5, 0.86, 1.0], [0.0, -0.45, 0.66, 2.2], [-1.75, -0.78, 0.46, 0.7], [1.72, -0.72, 0.52, 1.7]],
    arcs: [{ path: 'rot', from: -0.22, to: 0.22 }, { path: 'scale', from: 1.02, to: 1.32, log: true }, { path: 'tx', from: -0.14, to: 0.14 }],
  }),
  flower({
    id: 'flower.bloom', name: 'Big Bloom', n: 5, a: 0.85, fat: 0.42, k: 3.5, beta: 1.6,      // one flower fills the frame: with fewer rings than this, each one passing is the whole frame's chroma going up and down
    poles: [[-0.55, 0.05, 1.05, 0.2], [1.5, 0.72, 0.5, 1.2], [1.25, -0.8, 0.38, 2.6]],
    arcs: [{ path: 'rot', from: 0.2, to: -0.25 }, { path: 'scale', from: 1.3, to: 1.0, log: true }, { path: 'ty', from: 0.1, to: -0.1 }],
  }),
  flower({
    id: 'flower.pinwheel', name: 'Pinwheel', n: 5, a: 0.72, kappa: 2.2, fat: 0.7, k: 2.6, beta: 1.8,
    poles: [[-0.8, -0.1, 0.95, 0.2], [1.05, 0.34, 0.8, 2.0], [-0.1, 1.0, 0.36, 1.2], [0.25, -1.05, 0.34, 0.2]],
    arcs: [{ path: 'rot', from: -0.15, to: 0.35 }, { path: 'scale', from: 1.0, to: 1.25, log: true }, { path: 'tx', from: 0.12, to: -0.12 }],
  }),
  flower({
    id: 'flower.paisley', name: 'Paisley', n: 1, a: 2.6, kappa: 1.5, fat: 6, k: 2.1, beta: 2.2, fade: 0.03, swell: 0.5,
    poles: [[-1.0, 0.38, 0.62, 2.4], [0.68, 0.58, 0.68, 0.5], [0.1, -0.5, 0.6, 4.2], [-1.65, -0.62, 0.4, 5.2], [1.6, -0.5, 0.48, 3.1]],
    arcs: [{ path: 'rot', from: 0.2, to: -0.2 }, { path: 'scale', from: 1.2, to: 1.0, log: true }],
  }),
  flower({
    id: 'flower.whiplash', name: 'Whiplash', n: 6, a: 0, whip: 1, k: 1.9, beta: 2, e: 0.3, curl: 2.1, ph: PH,
    poles: [[-1.15, 0.5, 0.8, 0], [1.0, 0.55, -0.8, 0], [-0.4, -0.6, -0.7, 0], [1.35, -0.55, 0.75, 0]],
    orbit: 0.3,
    arcs: [{ path: 'rot', from: -0.2, to: 0.2 }, { path: 'scale', from: 1.0, to: 1.2, log: true }],
  }),
  flower({
    id: 'flower.flames', name: 'Flames', n: 1, a: 2.8, kappa: 0.7, fat: 1.1, k: 1.9, flame: 1, lobes: 3.4, ph: PH,
    poles: [[-1.0, 0, 0.6, 0], [1.0, 0, 0.6, 0]],
    orbit: 0,
    arcs: [{ path: 'rot', from: -0.05, to: 0.05 }],
    flow: { 'bend1.ph': -4, 'bend2.ph': -3 },
    over: { bend1: { a: 0.11, f: 1.7, ph: 0, ang: 1.57 }, bend2: { a: 0.05, f: 3.7, ph: 1, ang: 1.57 } },
  }),
  flower({
    id: 'flower.poppy', name: 'Poppies', n: 4, a: 1.25, fat: 0.26, k: 2.0, beta: 2.4, e: 0.2, fade: 0.05, spin: 0.35,
    poles: [[-0.85, 0.2, 0.95, 0.5], [1.05, -0.3, 0.8, 1.4], [0.3, 1.05, 0.42, 2.4], [-1.9, -0.8, 0.5, 0.2]],
    arcs: [{ path: 'rot', from: 0.14, to: -0.14 }, { path: 'scale', from: 1.25, to: 1.0, log: true }, { path: 'tx', from: -0.1, to: 0.1 }],
  }),
  flower({
    id: 'flower.moddaisy', name: 'Mod Daisies', n: 8, a: 0.72, fat: 0.5, k: 2.2, beta: 3, e: 0.26, tile: 0.62, turnOver: 1, fade: 0.05, orbit: 0, spin: 0.25,
    poles: [[0, 0, 0.5, 0.3], [0.8, 0.8, 0.24, 0]],
    arcs: [{ path: 'rot', from: -0.28, to: 0.28 }, { path: 'scale', from: 0.9, to: 1.3, log: true }, { path: 'tx', from: -0.3, to: 0.3 }],
  }),
  flower({
    id: 'flower.mandala', name: 'Mandala', n: 6, a: 0.8, fat: 0.5, k: 2.7, beta: 2.2, spin: 0.5, orbit: 0.2,
    poles: [[0.95, 0.28, 0.5, 0.2], [0.42, 0.05, 0.3, 1.1], [1.55, 0.3, 0.28, 2.1]],
    over: { fold: { n: 6, rot: 0, cx: 0, cy: 0 } },
    arcs: [{ path: 'fold.rot', from: -0.5, to: 0.5 }, { path: 'scale', from: 0.95, to: 1.25, log: true }],
  }),
  // ---------------------------------------------------------------- motifs: things anyone would know, and every echo of them is them again
  flower({
    id: 'flower.hearts', name: 'Hearts', group: 'motif', motif: HEART, a: 1, k: 2, beta: 3.4, e: 0.16, fade: 0.012, sway: 0.2, orbit: 0.2,
    poles: [[-1.0, 0.3, 0.62, 0], [0.86, 0.42, 0.74, 0], [-0.05, -0.56, 0.5, 0], [1.72, -0.6, 0.36, 0], [-1.78, -0.68, 0.34, 0]],
    arcs: heartArcs,
  }),
  flower({
    id: 'flower.stars', name: 'Stars', group: 'motif', motif: STAR, a: 1, k: 2.1, beta: 3.2, e: 0.16, fade: 0.012, spin: 0.25, orbit: 0.22,
    poles: [[-0.95, 0.36, 0.72, 0.3], [0.95, 0.2, 0.86, 1.0], [-0.1, -0.65, 0.42, 2.2], [1.8, 0.8, 0.34, 0.7], [-1.82, -0.5, 0.34, 1.7]],
    arcs: [{ path: 'rot', from: 0.12, to: -0.12 }, { path: 'scale', from: 1.25, to: 1.0, log: true }, { path: 'ty', from: -0.08, to: 0.08 }],
  }),
  flower({
    id: 'flower.butterflies', name: 'Butterflies', group: 'motif', motif: BUTTERFLY, a: 1, k: 2, beta: 3.6, e: 0.1, fade: 0.012, sway: 0.28, orbit: 0.2,
    poles: [[-0.85, 0.05, 0.62, 0.12], [0.95, 0.3, 0.46, -0.2], [0.35, -0.72, 0.28, 0.3], [-1.85, 0.78, 0.24, -0.25]],
    arcs: heartArcs,
  }),
  flower({
    id: 'flower.sun', name: 'Sunshine', group: 'motif', motif: SUN, a: 1, k: 2.2, beta: 2.4, e: 0.18, fade: 0.012, spin: 0.15, orbit: 0.05,
    poles: [[0.1, 0.05, 0.62, 0]],
    arcs: [{ path: 'scale', from: 1.0, to: 1.35, log: true }, { path: 'tx', from: -0.2, to: 0.2 }, { path: 'ty', from: 0.08, to: -0.08 }],
  }),
  flower({
    id: 'flower.mushrooms', name: 'Mushrooms', group: 'motif', motif: MUSHROOM, a: 1, k: 1.9, beta: 3.6, e: 0.12, fade: 0.06, sway: 0.1, orbit: 0.14,
    poles: [[-0.75, 0.1, 0.68, 0], [0.95, -0.22, 0.46, 0], [1.75, 0.6, 0.28, 0], [-1.85, -0.55, 0.3, 0], [0.2, 0.86, 0.2, 0]],
    arcs: heartArcs,
  }),
  flower({
    id: 'flower.clouds', name: 'Clouds', group: 'motif', motif: CLOUD, a: 1, k: 1.9, beta: 3.2, e: 0.14, fade: 0.012, sway: 0.06, orbit: 0.2,
    poles: [[-0.8, 0.42, 0.56, 0], [0.95, 0.5, 0.42, 0], [0.2, -0.45, 0.6, 0], [-1.85, -0.5, 0.3, 0]],
    arcs: [{ path: 'tx', from: 0.3, to: -0.3 }, { path: 'scale', from: 1.0, to: 1.2, log: true }],
  }),
  flower({
    id: 'flower.eyes', name: 'Eyes', group: 'motif', motif: EYE, a: 1, k: 2.2, beta: 3.4, e: 0.14, sway: 0.07, orbit: 0.12,
    poles: [[-0.92, 0.3, 0.62, 0], [0.92, 0.3, 0.62, 0]],
    arcs: [{ path: 'scale', from: 1.0, to: 1.3, log: true }, { path: 'ty', from: 0.07, to: -0.07 }],
  }),
  flower({
    id: 'flower.peace', name: 'Peace', group: 'motif', motif: PEACE, a: 1, k: 2.4, beta: 2.2, e: 0.1, sway: 0.1, orbit: 0.07,
    poles: [[0.05, 0, 0.82, 0]],
    arcs: [{ path: 'scale', from: 0.95, to: 1.2, log: true }, { path: 'tx', from: 0.18, to: -0.18 }],
  }),
  flower({
    id: 'flower.smile', name: 'Smile', group: 'motif', motif: SMILE, a: 1, k: 2.4, beta: 2.2, e: 0.1, sway: 0.1, orbit: 0.1,
    poles: [[-0.05, 0, 0.84, 0]],
    arcs: [{ path: 'scale', from: 1.2, to: 0.95, log: true }, { path: 'tx', from: -0.18, to: 0.18 }],
  }),
  flower({
    id: 'flower.garden', name: 'The Garden', group: 'motif', motif: [0, BUTTERFLY, MUSHROOM, HEART, STAR], n: 7, a: 0.9, fat: 0.5, k: 2, beta: 3.2, e: 0.14, fade: 0.012, sway: 0.1, orbit: 0.16,
    poles: [[-1.0, 0.08, 0.66, 0], [0.62, 0.52, 0.5, 0.1], [0.6, -0.56, 0.44, 0], [-1.85, 0.74, 0.26, 0], [1.72, 0.0, 0.3, 0.3]],
    arcs: heartArcs,
  }),
  // ---------------------------------------------------------------- the rest of the era's graphics, all in these inks
  flower({
    id: 'flower.check', name: 'Pop Check', group: 'op', field: false, poles: [[0, 0, 1, 0]],
    fams: [{ x: LINES }],
    over: { bulge: { a: 0.9, r: 1.0, cx: -0.5, cy: 0.1 } },
    arcs: [{ path: 'rot', from: -0.14, to: 0.2 }, { path: 'bulge.cx', from: -0.8, to: 0.7 }, { path: 'bulge.cy', from: 0.2, to: -0.2 }, { path: 'scale', from: 1.25, to: 1.05, log: true }],
  }),
  flower({
    id: 'flower.dart', name: 'Dartboard', group: 'op', a: 0, n: 6, k: 2.3, beta: 3, e: 0.2, spin: 0, orbit: 0, fams: [{ t1: 8 }],
    poles: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [-0.3, 0.05, 0.9, 1]],
    arcs: [{ path: 'scale', from: 1.0, to: 1.3, log: true }, { path: 'p1.x', from: -0.5, to: 0.5 }],
    can: ['turnstile'],
  }),
  flower({
    id: 'flower.burst', name: 'Sunburst', group: 'op', a: 0, n: 6, k: 0.75, beta: 3, e: 0.2, spin: 0, orbit: 0, fams: [{ t1: 16 }], flow: { 'f1.ph': -1.2 }, swell: 0, poles: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0.5, -0.62, 1, 1]],
    arcs: [{ path: 'p1.x', from: 0.9, to: -0.9 }, { path: 'p1.y', from: -0.75, to: -0.45 }],
    can: ['turnstile'],
  }),
  flower({
    id: 'flower.rainbow', name: 'Rainbow Hills', group: 'op', a: 0, n: 6, k: 2.6, beta: 3.2, e: 0.3, spin: 0, orbit: 0.08, run: 'rainbow',
    poles: [[-1.15, -1.3, 0.82, 0], [0.9, -1.45, 0.9, 0], [2.3, -0.9, 0.5, 0]],
    arcs: [{ path: 'tx', from: -0.25, to: 0.25 }, { path: 'scale', from: 1.05, to: 1.25, log: true }],
  }),
  flower({
    id: 'flower.circles', name: 'Mod Circles', group: 'op', a: 0, n: 6, k: 2.3, beta: 3.2, e: 0.2, tile: 0.8, turnOver: 1, orbit: 0, spin: 0,
    poles: [[0, 0, 0.5, 0]],
    arcs: [{ path: 'rot', from: 0.3, to: -0.3 }, { path: 'scale', from: 1.25, to: 0.95, log: true }, { path: 'tx', from: 0.3, to: -0.3 }],
  }),
  flower({
    id: 'flower.chevron', name: 'Chevrons', group: 'op', field: false, poles: [[0, 0, 1, 0]], lines: 2.6,
    over: { zig: { a: 0.42, c: 1.0, b: 0, n: 0 }, bend1: { a: 0.08, f: 1.3, ph: 0, ang: 0 } },
    arcs: [{ path: 'rot', from: -0.2, to: 0.2 }, { path: 'zig.a', from: 0.3, to: 0.6 }, { path: 'scale', from: 1.0, to: 1.25, log: true }],
    flow: { 'bend1.ph': 3 },
  }),
  flower({
    id: 'flower.dots', name: 'Pop Dots', group: 'op', field: false, poles: [[0, 0, 1, 0]], lines: 2.4,
    fams: [{ x: 2.4 }, { ph: 0.25, d: -40 }],       // a family that's just a number lifts the whole field, so these are dots and not a check: src/pattern/families/dots.js
    over: { round: 1, sum: 0.42 / (40 * 0.577), bulge: { a: 0.5, r: 0.9, cx: 0.4, cy: 0 } },
    arcs: [{ path: 'rot', from: 0.45, to: 0.75 }, { path: 'scale', from: 1.0, to: 1.25, log: true }, { path: 'bulge.cx', from: 0.7, to: -0.7 }],
  }),
  flower({
    id: 'flower.wave', name: 'Op Wave', group: 'op', field: false, poles: [[0, 0, 1, 0]], lines: 3,
    over: { bend1: { a: 0.3, f: 2.1, ph: 0, ang: 0 }, bend2: { a: 0.12, f: 3.3, ph: 1, ang: 0.5 } },
    arcs: [{ path: 'rot', from: -0.2, to: 0.25 }, { path: 'bend1.a', from: 0.18, to: 0.42 }],
    flow: { 'bend1.ph': 4, 'bend2.ph': -3 },
  }),
  // ---------------------------------------------------------------- pattern inside pattern
  flower({
    id: 'flower.beads', name: 'Bead Bloom', group: 'flower', n: 6, a: 0.72, fat: 0.5, k: 3, beta: 2, every: 2, beads: 14, fams: [{ y: 0.001 }], flow: { 'f1.ph': 1.6 },
    poles: [[-0.8, 0.12, 1, 0.3], [1.1, 0.5, 0.62, 1.1], [0.9, -0.75, 0.42, 2.2]],
    arcs: [{ path: 'rot', from: -0.18, to: 0.18 }, { path: 'scale', from: 1.15, to: 1.3, log: true }],
  }),
];
