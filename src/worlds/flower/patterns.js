// Flower Power's pool. Every pattern is one family on the world's field, so they can all become each other.
// Numbers: field.a n (petals: SNAP, so nothing can glide across a change of count), field.ph a (petal depth), field.scale kappa (how petals wind with the radius), field._1 beta (how flowers melt together), field._2 how fat a petal is,
// field.k0 lines per unit of log distance. spare.a the whiplash share, spare.b epsilon (a flower's cap), spare.c the flame share, spare.d lines per unit height, in flames. Poles: blobs 1-3 and p1, p2: x, y, size, turn.
// Under the field every pattern is plain stripes, LINES to the picture unit, and the field takes them away again: phase = share*k*S + (1-share)*LINES*y. With the field all there that's only k*S. With it gone (the middle of a change of world, where no program but this one can draw it) it's lines, and never a solid.
const LINES = 2.2;
export const FLOW = 6;         // lines per cycle of the film's clock: with no song that's about one a second
const eps = 0.26;
export const base = (k, e = eps, swell = 0) => -k * (Math.log(e) + swell * e);     // so that a flower's centre sits at phase 0 before the flow: every flower gives birth to the same line at the same moment

const pole = (x, y, q, ay) => ({ x, y, q, ay });
const blob = (x, y, r, a) => ({ [`x`]: x, [`y`]: y, r, a });
function flower({ id, name, k = 2.6, n = 6, a = 0.5, kappa = 0, beta = 1.8, fat = 0.55, e = eps, poles, orbit = 0.26, arcs = [], over = {}, whip = 0, flame = 0, lobes = 0, ph = null, swell = 0.7, fade = 0.13, curl = 0, flow = null }) {
  const P = [...poles, ...Array(5).fill([0, 0, 0, 0])].slice(0, 5);
  const g = {
    fams: [{ y: LINES, ph: ph ?? base(k, e, swell) }],
    field: { kind: 4, a: n, b: 0, ph: a }, 'field.spin': swell, 'star._1': fade, 'star._2': curl, 'star._3': k, 'field.scale': kappa, 'field._1': beta, 'field._2': fat, 'field.k0': k,
    'spare.a': whip, 'spare.b': e, 'spare.c': flame, 'spare.d': lobes, 'blobs.on': 0,
    'blobs.x1': P[0][0], 'blobs.y1': P[0][1], 'blobs.r1': P[0][2], 'blobs.a1': P[0][3],
    'blobs.x2': P[1][0], 'blobs.y2': P[1][1], 'blobs.r2': P[1][2], 'blobs.a2': P[1][3],
    'blobs.x3': P[2][0], 'blobs.y3': P[2][1], 'blobs.r3': P[2][2], 'blobs.a3': P[2][3],
    'p1.x': P[3][0], 'p1.y': P[3][1], 'p1.q': P[3][2], 'p1.ay': P[3][3],
    'p2.x': P[4][0], 'p2.y': P[4][1], 'p2.q': P[4][2], 'p2.ay': P[4][3],
    ...over,
  };
  const phase = poles.map((_, i) => 1.7 * i + 0.4);
  const home = P.map(p => p.slice());
  return {
    id, name, family: 'flower', fine: true, lambda: 0.05, g,
    // The rings' flow is in drive, and what's declared as flow is on a family that's off, because the song's slideLines goes wherever flow says. It stays off: a line's number and place stay on the one clock.
    flow: { 'f1.ph': 1, ...flow },
    arcs,
    // Flowers orbit, each on its own small circle, and turn as they go. On the film's clock, so they go with the music and stop when it stops.
    drive(out, { phi, OFF }) {
      out[OFF['f0.ph']] -= FLOW * phi;
      const w = phi * 1.1, names = [['blobs.x1', 'blobs.y1', 'blobs.a1'], ['blobs.x2', 'blobs.y2', 'blobs.a2'], ['blobs.x3', 'blobs.y3', 'blobs.a3'], ['p1.x', 'p1.y', 'p1.ay'], ['p2.x', 'p2.y', 'p2.ay']];
      for (let i = 0; i < poles.length; i++) {
        const [nx, ny, na] = names[i], th = w * (i % 2 ? -1 : 1) * (1 + 0.2 * i) + phase[i], A = orbit * (0.7 + 0.15 * i);
        out[OFF[nx]] += A * Math.cos(th); out[OFF[ny]] += A * Math.sin(th);
        out[OFF[na]] += w * (i % 2 ? 0.6 : -0.6);
      }
    },
  };
}

export const pool = [
  flower({
    id: 'flower.daisy', name: 'Daisy Chain', n: 7, a: 0.62, fat: 0.5, k: 2.5,
    poles: [[-1.05, 0.42, 0.72, 0.3], [0.92, 0.5, 0.86, 1.0], [0.0, -0.45, 0.66, 2.2], [-1.75, -0.78, 0.46, 0.7], [1.72, -0.72, 0.52, 1.7]],
    arcs: [{ path: 'rot', from: -0.22, to: 0.22 }, { path: 'scale', from: 1.02, to: 1.32, log: true }, { path: 'tx', from: -0.14, to: 0.14 }],
  }),
  flower({
    id: 'flower.bloom', name: 'Big Bloom', n: 5, a: 0.85, fat: 0.42, k: 2.8, beta: 1.6,
    poles: [[-0.55, 0.05, 1.25, 0.2], [1.5, 0.72, 0.5, 1.2], [1.25, -0.8, 0.38, 2.6]],
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
    id: 'flower.whiplash', name: 'Whiplash', n: 6, a: 0, whip: 1, k: 1.9, beta: 2, e: 0.3, curl: 2.1, ph: 4.7,
    poles: [[-1.15, 0.5, 0.8, 0], [1.0, 0.55, -0.8, 0], [-0.4, -0.6, -0.7, 0], [1.35, -0.55, 0.75, 0]],
    orbit: 0.3,
    arcs: [{ path: 'rot', from: -0.2, to: 0.2 }, { path: 'scale', from: 1.0, to: 1.2, log: true }],
  }),
  flower({
    id: 'flower.flames', name: 'Flames', n: 1, a: 2.8, kappa: 0.7, fat: 1.1, k: 1.9, flame: 1, lobes: 3.4, ph: 2.1,
    poles: [[-1.0, 0, 0.6, 0], [1.0, 0, 0.6, 0]],
    orbit: 0,
    arcs: [{ path: 'rot', from: -0.05, to: 0.05 }],
    flow: { 'bend1.ph': -4, 'bend2.ph': -3 },
    over: { bend1: { a: 0.11, f: 1.7, ph: 0, ang: 1.57 }, bend2: { a: 0.05, f: 3.7, ph: 1, ang: 1.57 } },
  }),
];
