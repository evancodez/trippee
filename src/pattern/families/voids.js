// Black Car, L'Inconnue. The silhouette exists only because the pattern stops: nothing is outlined, a field simply ends.
import { plane } from '../kit.js';
import { smoother, lerp } from '../../score/curves.js';

const TAU = Math.PI * 2;

// How far into the way in from, or the way out to, a solid of the colour that isn't the void's own. Such a solid can only be
// reached if the void has gone, so the void opens as that solid leaves, and closes as it lands.
const fromSolid = (G, t, pol) => G.pol0 === pol ? 1 - smoother((t - G.t0) / (G.inDur || 1)) : 0;
const toSolid = (G, t, pol) => G.pol1 === pol ? smoother((t - (G.t1 - (G.outDur || 1))) / (G.outDur || 1)) : 0;
const polOf = v => v > .5 ? -1 : 1;     // the void's colour (1 white, 0 black) as the theta sign of that solid

// The void takes the colour of the solid this gesture came out of: a crack opening in black or in white, as the film does both.
const voidFromEntry = (out, G, OFF) => { const v = G.pol0 === -1 ? 1 : 0; out[OFF['matte.outside']] = v; return v; };

export default [
  // Stripes pinched towards a black door. It grows out of the waist and either shuts over everything or closes up to nothing.
  { id: 'void.door', name: 'Door', family: 'void',
    g: {
      fams: [plane(4.2, 90)], bowtie: { a: 1, eps: .3, x0: 0, ang: 0 }, wob: .05, wobF: 1.3,
      matte: { kind: 1, q: 7, invert: 1, outside: 0, rx: .05, ry: .03 },
    },
    flow: { 'f0.ph': 1 },
    arcs: [
      { path: 'scale', from: .85, to: 2.8, log: true },
      { path: 'bowtie.eps', from: 1.1, to: .1, log: true },
      { path: 'matte.rx', from: .05, to: 1.25, log: true, at: [0, .8] },
      { path: 'matte.ry', from: .03, to: .74, log: true, at: [0, .8] },
      { path: 'wobT', from: 0, to: 4 },
    ],
    drive(out, { G, t, OFF }) {
      const shut = toSolid(G, t, 1), gone = Math.max(toSolid(G, t, -1), fromSolid(G, t, -1));
      for (const p of ['matte.rx', 'matte.ry']) out[OFF[p]] = Math.max(.002, out[OFF[p]] * (1 + .85 * shut) * (1 - gone));
    },
    axes: [
      { id: 'door', name: 'door', path: 'matte.rx', min: .02, max: 2.5, log: true },
      { id: 'pinch', name: 'pinch', path: 'bowtie.eps', min: .03, max: 2, log: true },
      { id: 'scale', name: 'zoom', path: 'scale', min: .2, max: 5, log: true },
    ],
    lambda: .1 },

  // A hairline crack in a solid widens into a band of herringbone, then into the whole field, and the zigzags swell.
  { id: 'void.crack', name: 'Crack', family: 'void',
    g: {
      fams: [plane(7, 62)], zig: { a: .12, c: 3, b: 0, n: 0 }, bowtie: { a: 0, eps: .35, x0: 1.2, ang: 0 }, wob: .06, wobF: 1.2,
      matte: { kind: 2, outside: 0, eps: .004, rot: -.6 },
    },
    flow: { 'f0.ph': 1 },
    arcs: [
      { path: 'matte.t', from: 0, to: 3.5 },
      { path: 'scale', from: .4, to: 4.5, log: true },
      { path: 'bowtie.a', from: 0, to: 1, at: [.45, 1] },
      { path: 'wobT', from: 0, to: 4 },
    ],
    drive(out, { u, G, OFF }) {
      voidFromEntry(out, G, OFF);
      out[OFF['matte.eps']] = .005 + 3 * u * u * u;      // slow, then it keeps opening, so the sliver has time to be a sliver
    },
    axes: [
      { id: 'eps', name: 'opening', path: 'matte.eps', min: .001, max: 3, log: true },
      { id: 'zig', name: 'chevrons', path: 'zig.a', min: 0, max: .4 },
      { id: 'scale', name: 'zoom', path: 'scale', min: .2, max: 6, log: true },
    ],
    lambda: .06 },

  // Stripes bending over lumps that float in the void and shear where they merge. The lump is only the stripes stopping.
  { id: 'void.zebra', name: 'Zebra', family: 'void',
    g: {
      fams: [{ y: 11, z: .55 }],
      blobs: { on: 1, beta: 1, x1: -.42, y1: .05, r1: .42, a1: .3, x2: .38, y2: -.12, r2: .36, a2: -.7, x3: .05, y3: .4, r3: .3, a3: 1.2 },
    },
    flow: { 'f0.ph': 1 },
    arcs: [
      { path: 'scale', from: .42, to: 3.5, log: true },
      { path: 'blobs.a1', from: .3, to: 1.3 },
      { path: 'blobs.a2', from: -.7, to: -2 },
      { path: 'blobs.x1', from: -.7, to: -.25 },
      { path: 'blobs.x2', from: .7, to: .22 },
    ],
    drive(out, { G, t, OFF }) {
      // landing on the other solid, the void has to be gone first: the lumps swell until nothing else is left
      const k = toSolid(G, t, -polOf(voidFromEntry(out, G, OFF)));
      if (k > 0) { const c = 3.4 / out[OFF.scale]; for (const p of ['blobs.r1', 'blobs.r2', 'blobs.r3']) out[OFF[p]] *= Math.pow(c / out[OFF[p]], k * k); }
    },
    axes: [
      { id: 'r', name: 'lump', path: 'blobs.r1', min: .05, max: 1.2 },
      { id: 'bend', name: 'bulge', path: 'f0.z', min: 0, max: 6 },
      { id: 'lines', name: 'lines', path: 'f0.y', min: 2, max: 24, log: true },
      { id: 'scale', name: 'zoom', path: 'scale', min: .1, max: 5, log: true },
    ],
    lambda: .08 },

  // L'Inconnue: a twisting ribbon of checker crawling across the frame, its outline a matte, its squares wrapped round it.
  { id: 'void.ribbon', name: 'Ribbon', family: 'void',
    g: {
      fams: [plane(1.5, 0), plane(1.5, 90)],
      ribbon: { on: 1, a: .42, w: .2, sig: 1.1, om: 3, t: 0, ang: .35, k: 10 },
    },
    flow: { 'f0.ph': 1 },
    arcs: [
      { path: 'ribbon.w', from: .14, to: .8, log: true },
      { path: 'ribbon.t', from: 0, to: 10.472 },
      { path: 'ribbon.sig', from: 2.3, to: 1.2 },
      { path: 'ribbon.a', from: .25, to: .6 },
      { path: 'scale', from: .7, to: 1.3, log: true },
    ],
    drive(out, { G, t, OFF }) {
      const v = voidFromEntry(out, G, OFF);
      // The back of a twist is the inverse, so it would never reach a solid: the ribbon untwists at both ends of the gesture.
      const e = Math.max(fromSolid(G, t, 1), fromSolid(G, t, -1), toSolid(G, t, 1), toSolid(G, t, -1));
      if (e > 0) {
        out[OFF['ribbon.sig']] = lerp(out[OFF['ribbon.sig']], 0, e);
        const T = out[OFF['ribbon.t']], whole = Math.round(T * .6 / TAU) * TAU / .6;
        out[OFF['ribbon.t']] = lerp(T, whole, e);
      }
      // landing on the other solid: it widens until it has covered the frame
      const k = toSolid(G, t, -polOf(v));
      if (k > 0) out[OFF['ribbon.w']] *= Math.pow(6 / out[OFF['ribbon.w']], k * k);
    },
    axes: [
      { id: 'w', name: 'width', path: 'ribbon.w', min: .03, max: 1.2, log: true },
      { id: 'sig', name: 'twists', path: 'ribbon.sig', min: 0, max: 4 },
      { id: 'a', name: 'wander', path: 'ribbon.a', min: 0, max: 1 },
      { id: 't', name: 'crawl', path: 'ribbon.t', min: 0, max: 21 },
    ],
    lambda: .1 },

  // Dive's turning window: tiny checks in a tilted square, growing past the frame while the checks swell and swirl.
  { id: 'void.diamond', pool: false, name: 'Diamond', family: 'void',
    g: {
      fams: [plane(4, 0), plane(4, 90)],
      matte: { kind: 1, q: 1, rx: .05, ry: .05, outside: 0 },
    },
    flow: { 'f0.ph': 1 },
    arcs: [
      { path: 'matte.rx', from: .16, to: 3.4, log: true, at: [0, .78] },
      { path: 'matte.ry', from: .16, to: 3.4, log: true, at: [0, .78] },
      { path: 'matte.rot', from: .3, to: 1.9 },
      { path: 'scale', from: .18, to: 2, log: true },
      { path: 'swirl.a', from: 0, to: 2.8, at: [.35, 1] },
      { path: 'swirl.sig', from: .9, to: 1.6 },
    ],
    drive(out, { G, OFF }) { voidFromEntry(out, G, OFF); },
    axes: [
      { id: 'size', name: 'window', path: 'matte.rx', min: .03, max: 4, log: true },
      { id: 'q', name: 'diamond to square', path: 'matte.q', min: .6, max: 8, log: true },
      { id: 'swirl', name: 'swirl', path: 'swirl.a', min: -3, max: 3 },
      { id: 'scale', name: 'zoom', path: 'scale', min: .1, max: 4, log: true },
    ],
    lambda: .12 },

  // A black disc drifts through stripes and the lines part round it like water round a stone.
  { id: 'void.eclipse', pool: false, name: 'Eclipse', family: 'void',
    g: {
      fams: [plane(5, 90)], bulge: { a: 3, r: .6 }, wob: .05, wobF: 1.3,
      matte: { kind: 1, q: 2, invert: 1, outside: 0, rx: .1, ry: .1 },
    },
    flow: { 'f0.ph': 1 },
    arcs: [
      { path: 'matte.rx', from: .1, to: .8, log: true },
      { path: 'matte.ry', from: .1, to: .8, log: true },
      { path: 'bulge.r', from: .22, to: 1.15, log: true },
      { path: 'scale', from: .75, to: 1.4, log: true },
      { path: 'bulge.cx', from: -.75, to: .25 },
      { path: 'matte.cx', from: -.56, to: .35 },
      { path: 'wobT', from: 0, to: 4 },
    ],
    drive(out, { G, t, OFF }) {
      const shut = toSolid(G, t, 1), gone = Math.max(toSolid(G, t, -1), fromSolid(G, t, -1));
      for (const p of ['matte.rx', 'matte.ry']) out[OFF[p]] = Math.max(.002, out[OFF[p]] * (1 + 3 * shut) * (1 - gone));
    },
    axes: [
      { id: 'r', name: 'disc', path: 'matte.rx', min: .02, max: 2.5, log: true },
      { id: 'lump', name: 'lump', path: 'bulge.a', min: 0, max: 8 },
      { id: 'lines', name: 'lines', path: 'f0.y', min: 1, max: 20, log: true },
    ],
    lambda: .1 },
];
