// Pearl: dream pop. A lens an inch from watered silk: the picture is a film of varying thickness, and all the colour there is comes from how thick it is, in real interference.
// Lines hold, and colour travels. Razor in focus, melted out of it. What she sings goes out across the frame as thickness, and every line has a train of softer lines behind it, which is the reverb, drawn.
import { OFF } from '../pattern/layout.js';
import { pool, FILM } from './pearl/patterns.js';
import { FIELD, DEFS, WT, PREINK, COLOR } from './pearl/field.js';
import { SHEENS, CELLS, chips } from './pearl/sheens.js';

const filmOf = p => p?.film ?? FILM;
const writeFilm = (S, f) => { S[0] = f.H; S[1] = f.wedge; S[2] = f.R; S[3] = f.B; S[4] = f.C; S[5] = f.gap; S[6] = f.terrace; S[7] = f.rib; S[8] = f.ribs; S[9] = f.pool; S[10] = f.lets; S[11] = f.echo; S[12] = f.cell; S[13] = f.barbs; };
const copySheen = (tex, row, S, deep) => { const d = deep ? S.b : S.a; for (let i = 0; i < CELLS; i++) tex.set(i, row, d[i * 3], d[i * 3 + 1], d[i * 3 + 2], 1); };

export default {
  id: 'pearl', name: 'Pearl', chips, pool, borrow: [], needs: ['width'],
  glsl: { defs: DEFS, field: FIELD, preInk: PREINK, T: WT, color: COLOR },
  fuller: S => S[OFF['field.kind']] === 4 && S[OFF['field.a']] >= 1.5,
  table: {
    h: 5,
    fill(tex, ctx) {
      if (this._was === undefined) { const n = +(new URLSearchParams(location.search).get('sheen') ?? 0); copySheen(tex, 0, SHEENS[n], false); copySheen(tex, 1, SHEENS[n], true); copySheen(tex, 2, SHEENS[n], false); copySheen(tex, 3, SHEENS[n], true); this._was = 0; return true; }
      return false;
    },
  },
  uniforms(U, ctx) {
    const { from, to, G, t } = ctx, A = U.a, B = U.b, g = U.all;
    writeFilm(A, filmOf((from ?? G)?.pattern)); writeFilm(B, filmOf(to?.pattern ?? G?.pattern));
    const at = i => 4 * (i - 4) + 0;
    const set = (i, a, b, c, d) => { const o = 16 + at(i); g[o] = a; g[o + 1] = b; g[o + 2] = c; g[o + 3] = d; };
    const fy = 0.5 * Math.sin(t * 0.13), ang = 1.57 + 0.5 * Math.sin(t * 0.07);
    set(24, 0.3 * Math.sin(t * 0.09), fy, Math.cos(ang), Math.sin(ang));
    set(25, 0.16, 0.42, 0.012, 60);
    set(26, 0, -1, t * 0.18, t * 0.8);
    set(27, 0, 0, 0, 4);
    set(28, 800, 500, 0.28, 0);
    set(29, 0, 0, 0, 1);
    set(30, 0.16, 0.72, 0.02, 0);
  },
  motion: { len: [13, 22], morph: [6, 9] },
  hear: { pulse: 0.7, melody: 1.2, tone: 0.8, harmony: 0.7, lung: 1 },
};
