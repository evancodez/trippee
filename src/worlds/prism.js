// Prism: the film's own patterns, with the spectrum running through them. A colour mode that does more with colour than print it.
//   Every band is one flat ink, and the hue goes by the pattern's own structure, counted in bands out from the middle of the frame: rings are rings of spectrum, stripes stripes of it, a check diamonds of it, and it rides the sheet wherever the camera or a warp takes it.
//   The white side is light and the black side deep, at a mirrored hue (yellow meets magenta, green meets violet, blue meets teal), so every edge is two colours at once, as Riley's and Anuszkiewicz's colour is.
//   The strong beats push the colour out across the bands. The song's size opens the spectrum, from a few neighbouring hues when it's quiet to most of the wheel when it's loud. The tune bends it.
//   The harmony leans the wheel, and each big arrival turns it, the biggest half way round to the opposite colours. Those changes pour across the bands, band by band, over a few seconds.
// Nothing here changes c, so everything that reads the picture reads it as the film. No lighting, no chrome: lightness belongs to the side of the edge, never to a slope.
import { OFF } from '../pattern/layout.js';
import { wheels, HUES, sRGB } from './prism/wheel.js';
import { DEFS, PHASE, COLOR } from './prism/shader.js';
import { hearPrism, centreAt, flowAt, readR } from './prism/song.js';

const POUR = 2.6;           // seconds for a change to go out two turns of colour across the bands
const PALETTES = 256;
// The table is linear the way the engine's gamma() undoes it: the byte the screen shows, to the power 2.2.
const engineLin = c => sRGB(c).map(v => Math.pow(v / 255, 2.2));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// How many turns of colour a line is worth on this slot, and how calm its colour has to be. Both go by the slot's first family that's on and open.
// Big bands go by a tile, or the whole frame, one at a time, and each one that goes by changes what's there by the step from its colour to the next one's. So the bolder the pattern, the smaller the step: a fine one can carry most of the wheel across the frame and a bold one only a stretch of it.
// Spokes round a pole come back to their own line after their turns, so there it's a whole number of turns of colour, or a cut would show.
// Calm: on a sheet that's a surface (a tunnel, a room, a body) or very bold, the light and the deep side come nearer in brightness and the steps get smaller still. Rings rushing out of a tunnel are each most of the frame, and at full contrast they swung the whole frame's brightness twice a second (MGMT 29 s).
const FAM_N = ['x', 'y', 'z', 'r1', 'l1', 't1', 'd', 'r2', 'l2', 't2', 'on'];
const FAMS = [0, 1, 2, 3].map(i => Object.fromEntries(FAM_N.map(n => [n, OFF[`f${i}.${n}`]])));
const FREQ = OFF.freq, FIELDK = [0, 1, 2, 3].map(i => OFF[`field.k${i}`]), SURF = OFF['surf.kind'];
const gcd = (p, q) => (q ? gcd(q, p % q) : p);
export function colourOf(S) {
  let a = 0, calm = 0, n = 0;
  for (let i = 0; i < 4; i++) {
    const F = FAMS[i];
    if (S[F.on] < 0.5 || Math.abs(S[F.d]) >= 1) continue;
    const t1 = Math.abs(S[F.t1]), t2 = Math.abs(S[F.t2]), radial = S[F.r1] || S[F.l1] || S[F.r2] || S[F.l2];      // as the shader tells spokes from a spiral
    // Spokes, turns and nothing else: every one of them a whole number of turns of colour
    if ((t1 || t2) && !radial) for (const t of [t1, t2]) if (t) n = Math.abs(t - Math.round(t)) < 1e-3 ? gcd(n, Math.round(t)) : n;
    if (a) continue;
    const f = Math.hypot(S[F.x], S[F.y]) * Math.abs(S[FREQ] || 1) + 0.5 * Math.abs(S[F.z]) + Math.abs(S[F.r1]) + Math.abs(S[F.r2]) + 0.8 * (Math.abs(S[F.l1]) + Math.abs(S[F.l2])) + 0.8 * Math.abs(S[FIELDK[i]]) + 0.15 * (t1 + t2);
    a = clamp(f / 36, 1 / 24, 1 / 6);
    calm = Math.max(S[SURF] > 0.5 ? 0.75 : 0, 0.7 * clamp((2.6 - f) / 1.6, 0, 1));
  }
  if (!a) return [0.1, 0];
  return [n ? Math.max(1, Math.round(a * n)) / n : a, calm];
}
// Where each family's structure stands at the middle of the frame, in lines (without its offset or its turns): the colour counts bands from there, so a sheet turning or zooming about somewhere far off doesn't sweep the colours across the frame.
// The sheet's own view only, no warps: near enough, and it's smooth in time, which is all it has to be.
const P1 = ['p1.x', 'p1.y', 'p1.ay'].map(n => OFF[n]), P2 = ['p2.x', 'p2.y', 'p2.ay'].map(n => OFF[n]), TX = OFF.tx, TY = OFF.ty;
export function centreOf(S, out) {
  const x0 = S[TX], y0 = S[TY], fq = Math.abs(S[FREQ] || 1);
  const rho = P => Math.max(0.1, Math.hypot(x0 - S[P[0]], (y0 - S[P[1]]) * (S[P[2]] || 1)));
  const r1 = rho(P1), r2 = rho(P2);
  for (let i = 0; i < 4; i++) { const F = FAMS[i]; out[i] = (S[F.x] * x0 + S[F.y] * y0) * fq + S[F.r1] * r1 + S[F.l1] * Math.log(r1) + S[F.r2] * r2 + S[F.l2] * Math.log(r2); }
}

// With no song: the wheel turns slowly on its own, and the spectrum opens and closes over about two minutes.
const idle = t => [0.62 + 0.004 * t + 0.12 * Math.sin(t * 0.021), 0.32 + 0.22 * (0.5 + 0.5 * Math.sin(t * 0.05 - 1)), 0];

export default {
  id: 'prism', name: 'Prism',
  chips: [[255, 92, 200], [255, 196, 40], [0, 196, 220], [80, 70, 230]],
  pool: [], borrow: [],
  glsl: { defs: DEFS, phase: PHASE, color: COLOR },
  table: {
    h: 3,
    fill(tex, ctx) {
      if (!tex.prism) {
        const { light, deep } = wheels();
        for (let i = 0; i < HUES; i++) { tex.set(i, 1, ...engineLin(light[i])); tex.set(i, 2, ...engineLin(deep[i])); }
        tex.prism = true;
      }
      const song = ctx.tables, R = ctx.score?.react;
      for (let i = 0; i < PALETTES; i++) {
        const lag = (i / PALETTES) * POUR, t = ctx.t - lag, c = ctx.c - lag;
        let centre, width, bend = 0;
        if (song && R) {
          centre = centreAt(song, t);
          // Quiet, a few neighbouring hues; loud, most of the wheel. The phrase's breath opens it a little more.
          width = clamp(0.24 + 0.46 * readR(R, R.energy, c) + 0.07 * readR(R, R.lung, c), 0.2, 0.78);
          // The tune, a semitone at a time: an octave's climb turns the hue about a sixth of the way round.
          bend = 0.014 * readR(R, R.melSlow, c) * clamp(readR(R, R.gTune, c) * 1.4, 0.35, 1);
        } else [centre, width] = idle(t);
        tex.set(i, 0, centre - Math.floor(centre), width, bend, 0);
      }
      return true;
    },
  },
  tables: (A, M) => hearPrism(A, M),
  uniforms(U, ctx) {
    [U.a[0], U.a[2]] = colourOf(ctx.A); [U.b[0], U.b[2]] = colourOf(ctx.B);
    centreOf(ctx.A, U.a.subarray(4, 8)); centreOf(ctx.B, U.b.subarray(4, 8));
    U.a[1] = flowAt(ctx.score, ctx.t) % 64;
  },
  // The film's own tricks, but not the ones in space, which a mode's programs don't have.
  woah: { gap: [30, 48], fond: { well: 1.3 } },      // well11: Time Well
};
