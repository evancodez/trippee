// Turning a readable description into the flat numbers the GPU reads, and blending any two of them.
import { OFF, SLOT_FLOATS, SNAP, FAMILIES } from './layout.js';

export const DEFAULTS = {
  round: 0, sum: 0, theta: 0, invert: 0,
  scale: 1, rot: 0, tx: 0, ty: 0,
  freq: 1, wob: 0, wobF: 1, wobT: 0,
  'p1.x': 0, 'p1.y': 0, 'p1.q': 0, 'p1.ay': 1,
  'p2.x': 0.5, 'p2.y': 0, 'p2.q': 0, 'p2.ay': 1,
  'swirl.sig': 1, 'bowtie.eps': 1, 'bulge.r': 0.5, 'squeeze.b': 0.1,
  'lens.c': 1, 'lens.m': 1, 'conf.lam': 1, 'conf.k': 1, 'conf.c1': 1, 'conf.c2': 0,
  'cam.dist': 2.4,
  'q.zw': 0.5,                 // the quadric starts as the plane z = 0
  'room.hw': 0.9, 'room.hh': 0.5, 'room.depth': 6,
  'matte.q': 2, 'matte.rx': 1, 'matte.ry': 1, 'matte.eps': 0,
  'ribbon.w': 0.2, 'ribbon.om': 3, 'ribbon.k': 10,
};

// fams is a list of up to four families, e.g. { y: 12 } (horizontal stripes), { l1: 8 } (rings, even in log radius).
export function flatten(spec, into = new Float32Array(SLOT_FLOATS)) {
  into.fill(0);
  for (const k in DEFAULTS) into[OFF[k]] = DEFAULTS[k];
  (spec.fams || []).slice(0, FAMILIES).forEach((f, i) => {
    into[OFF[`f${i}.on`]] = 1;
    for (const key in f) {
      const name = `f${i}.${key}`;
      if (!(name in OFF)) throw new Error(`no such family number: ${key}`);
      into[OFF[name]] = f[key];
    }
  });
  for (const k in spec) {
    if (k === 'fams') continue;
    const v = spec[k];
    if (v && typeof v === 'object') {      // nested, e.g. bend1: { a: .1, f: 3 }
      for (const c in v) {
        const name = `${k}.${c}`;
        if (!(name in OFF)) throw new Error(`no such number: ${name}`);
        into[OFF[name]] = v[c];
      }
    } else {
      if (!(k in OFF)) throw new Error(`no such number: ${k}`);
      into[OFF[k]] = v;
    }
  }
  return into;
}

export function mix(a, b, t, out) {
  for (let i = 0; i < SLOT_FLOATS; i++) out[i] = SNAP.has(i) ? (t < 0.5 ? a[i] : b[i]) : a[i] + (b[i] - a[i]) * t;
  return out;
}

// Quadrics, ready to use as a `q: {...}` value. All are x'Qx = 0 and can be interpolated into each other.
export const Q = {
  plane: { zw: 0.5 },
  sphere: r => ({ xx: 1, yy: 1, zz: 1, ww: -r * r, zw: 0 }),
  tube: r => ({ xx: 1, zz: 1, ww: -r * r, zw: 0 }),        // along the y axis
  tunnel: r => ({ xx: 1, yy: 1, ww: -r * r, zw: 0 }),      // along the z axis, viewed from inside
  saddle: c => ({ xx: 1, yy: -1, zw: -c }),                // z = (x² - y²) / 2c
  bowl: c => ({ xx: 1, yy: 1, zw: -c }),                   // z = (x² + y²) / 2c
};
