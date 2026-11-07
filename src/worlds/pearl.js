// Pearl, dream pop: a lens an inch from watered silk. docs/MODES.md, section 3. The picture is a film of varying thickness, and all the colour there is comes from how thick it is. A pattern's lines only step the film and shape it.
// Lines hold and colour travels. Razor in focus and melted out of it, a band of focus racking on the phrase. Her voice is a pearl floating over the frame, sharp through whatever's melted behind it, with its echoes on the same path behind it. What she's sung goes out from it across the film, as thickness: no line moves for it. And every line has softer copies of itself behind it, which is the reverb, drawn.
import { OFF, FRAME } from '../pattern/layout.js';
import { pool, FILM } from './pearl/patterns.js';
import { FIELD, DEFS, WT, WARP, PREINK, COLOR } from './pearl/field.js';
import { SHEENS, CELLS, chips } from './pearl/sheens.js';
import { hearSong, flowClock, voiceAt, focusAt, sheenAt, voiceSpot } from './pearl/song.js';
import { rack, drain, breath } from './pearl/rack.js';
import { cast, landings, moves } from './pearl/direct.js';
import './pearl/moves.js';
import './pearl/camera.js';

const KEYS = ['H', 'wedge', 'R', 'B', 'C', 'gap', 'terrace', 'rib', 'ribs', 'pool', 'lets', 'echo', 'cell', 'barbs'];
const filmOf = p => p?.film ?? FILM;
const writeFilm = (S, f, g = null, k = 0) => { for (let i = 0; i < KEYS.length; i++) S[i] = g ? f[KEYS[i]] + (g[KEYS[i]] - f[KEYS[i]]) * k : f[KEYS[i]]; };
const copySheen = (tex, row, S, deep) => { const d = deep ? S.b : S.a; for (let i = 0; i < CELLS; i++) tex.set(i, row, d[i * 3], d[i * 3 + 1], d[i * 3 + 2], 1); };
const clamp01 = x => Math.max(0, Math.min(1, x));
const smooth = u => { u = clamp01(u); return u * u * (3 - 2 * u); };
const AGE_CELL = 8 / CELLS, RING = 0.42;      // seconds a cell of the voice's table holds, and how fast what she's sung goes out, in picture units a second
const ORBS = 4, ORB_LAG = 1.25, spot = [0, 0, 0];
const read = (R, arr, c) => { const x = Math.max(0, Math.min(R.n - 1.001, c * R.hz)), i = Math.floor(x); return arr[i] + (arr[i + 1] - arr[i]) * (x - i); };

export default {
  id: 'pearl', name: 'Pearl', chips, pool, borrow: [], needs: ['width'],
  glsl: { defs: DEFS, field: FIELD, warp: WARP, preInk: PREINK, T: WT, color: COLOR },
  fuller: S => S[OFF['field.kind']] === 4 && S[OFF['field.a']] >= 1.5,
  table: {
    h: 5,
    fill(tex, ctx) {
      // Filtered: RGBA16F can be, in WebGL2, and it's one fetch to a look where it was two.
      if (!tex._filtered && tex.gl) { const gl = tex.gl; gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex.tex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.activeTexture(gl.TEXTURE0); tex._filtered = true; }
      const song = ctx.tables, sh = sheenAt(song, ctx.t), key = sh.from * 16 + sh.to;
      if (tex._key !== key) { copySheen(tex, 0, SHEENS[sh.from], false); copySheen(tex, 1, SHEENS[sh.from], true); copySheen(tex, 2, SHEENS[sh.to], false); copySheen(tex, 3, SHEENS[sh.to], true); tex._key = key; }
      // What's been sung, by how long ago: r its thickness, g a little light, b the strong beats.
      const R = ctx.score?.react, c = ctx.c;
      for (let i = 0; i < CELLS; i++) {
        const age = i * AGE_CELL, fade = Math.exp(-age / 3.2);
        if (R) { const cc = c - age, v = cc > 0 ? read(R, R.voiced, cc) : 0, m = cc > 0 ? read(R, R.melody, cc) : 0, p = cc > 0 ? read(R, R.pulse, cc) : 0; tex.set(i, 4, v * m * 0.16 * fade, 0.05 * v * fade * fade, Math.min(p, 1.4) * fade, 1); }
        else { const s = Math.sin((ctx.t - age) * 0.9); tex.set(i, 4, 0.5 * s * fade, 0, 0, 1); }
      }
      return true;
    },
  },
  tables: (A, M) => hearSong(A, M),
  whoa: (A, M) => hearSong(A, M).whoa,
  direct(score, A, M) {
    if (!score.tau || !score.react) return score;
    const clock = flowClock(score, A);
    score.phi = t => clock(t);
    cast(score, A, M);
    landings(score, hearSong(A, M));
    moves(score, A, M);
    return score;
  },
  uniforms(U, ctx) {
    const { from, to, G, t, kind, A, B, F, plan } = ctx, g = U.all, song = ctx.tables, s = ctx.at(ctx.c);
    const set = (i, a, b, c, d) => { const o = 4 * i; g[o] = a; g[o + 1] = b; g[o + 2] = c; g[o + 3] = d; };
    // The two patterns' films. A change that isn't a bend (a slide, by a click) has only the one slot to show them both in.
    const fa = filmOf((from ?? G)?.pattern), fb = filmOf((to ?? from ?? G)?.pattern), two = F[FRAME.compose * 4 + 1] > 0.5 || F[FRAME.dive * 4 + 3] > 0.5;
    if (to && from && !two) { writeFilm(U.a, fa, fb, ctx.T); writeFilm(U.b, fb); } else { writeFilm(U.a, fa); writeFilm(U.b, fb); }
    // A landing's B is a whole number of cycles from where it'll be once it's landed, which nothing can see but a cell's own thickness. That's told what the offset is, so a cell keeps its colour across the landing.
    const own = from && to && (kind === 'rack' || kind === 'drain' || kind === 'breath');
    set(46, own ? plan.offset[0] : 0, own ? plan.offset[1] : 0, 0, 0);
    if (own) U.e[15] = plan.ang ?? 0;
    const e = s ? clamp01(s.energy) : 0.45, lung = s ? Math.min(s.lung, 1.2) : 0.5 + 0.5 * Math.sin(t * 0.4), tone = s ? s.tone : 0, tens = s ? Math.min(s.tension, 1.5) : 0, pulse = s ? Math.min(s.pulse, 1.3) : 0;
    // The focus. Loud is sharp across most of the frame. Quiet's a slit, with the rest melting. Her voice takes everything further out of focus: it's what the pearl's for.
    voiceSpot(song, t, spot);
    const [fy, ang] = song ? focusAt(song, t) : focusAt({}, t), v = spot[2], mel = s ? s.melSlow : 0;
    // The strong beats open it: on each one, for a moment, more of the frame is sharp. And a big arrival is a pull (song.js).
    const pull = song ? voiceAt(song.pull, t) : 0, melt = Math.max(pull, 0), snap = Math.max(-pull, 0);
    // Bolder than it was (the palest, softest look in the app): a wider band in focus even when it's quiet, and less melt per unit away from it, so more of the frame has an edge.
    const fw = 0.4 + 0.7 * e * e + 0.05 * lung + 0.13 * pulse + 1.9 * snap;
    set(24, 0.3 * Math.sin(t * 0.09), fy + 0.12 * mel, Math.cos(ang), Math.sin(ang));
    set(25, fw, (0.24 - 0.13 * e) * (1 + 1.1 * melt) * (1 - 0.8 * snap), (0.008 + 0.05 * v * (1 - e)) * (1 - snap) + 0.1 * melt, 40 + 130 * (song ? Math.min(1, voiceAt(song.width, t) * 2) : 0.2));
    // The film: down tilts with the harmony's pull, and the pool goes by on the music's own time.
    const lean = 0.8 * tens + 0.5 * Math.sin(t * 0.05), dr = song ? voiceAt(song.drain, t) : t * 40;
    set(26, Math.sin(lean), -Math.cos(lean), dr * 0.0042, t * (0.5 + e));
    set(27, spot[0], spot[1], 300 + 240 * e, 1 / (RING * AGE_CELL));
    // Energy thins it from pale to rich. The drain goes round a long way on top of that. A whoa runs it out as thin as it'll go.
    let thin = 820 - 1300 * Math.pow(e, 1.2) + 480 * Math.sin(dr / 480), whoa = 0, bump = 620;
    const w = song?.whoa;
    if (w) { const q = smooth((t - (w.t - 11)) / 9) * (1 - smooth((t - w.t) / 7)); whoa = q; thin -= 520 * q; }
    set(28, thin, bump, 0.07 + 0.07 * (1 - e) + 0.04 * lung, 0.02 * lung + 0.015 * tone);      // bloom and the haze over all of it, both by screen: less of each when it's loud, so a sheen's deep side stays deep
    const sh = sheenAt(song, t), dx = Math.cos(sh.dir - 1.57), dy = Math.sin(sh.dir - 1.57), width = 1.3;
    set(29, -2.2 + sh.x * (4.4 + width), width, dx, dy);
    set(30, 0.11 + 0.1 * lung, 0.66 + 0.1 * (1 - e), 0.018 + 0.012 * lung, 0);
    // z: how much deeper the dark side of every line is than its sheen says. A little when it's quiet, so it stays pearly, and a lot on a loud passage, where the edges want to be bold.
    set(31, kind === 'breath' ? 0.16 : 0.2, 80 + 190 * e, 0.22 + 0.45 * e * e, 0);      // not on the beat: the whole frame's dark side going deeper on each strong beat is a whole-frame flash
    // The pearls: the voice, and its echoes along the same path, each a beat or two behind.
    for (let i = 0; i < ORBS; i++) {
      voiceSpot(song, t - i * ORB_LAG, spot);
      const off = i ? 0.82 ** i : 1;
      set(40 + i, spot[0], spot[1], (0.5 + 0.1 * lung + 0.1 * e + 0.05 * pulse) * off, spot[2] * (i ? 0.62 ** i : 1));
    }
    // A ghost voice, written by the moves.
    set(44, A[OFF['spare.d']], 0, 0, 0); set(45, B[OFF['spare.d']], 0, 0, 0);
    // The tune goes into the film here, and only a little into the lines: the sheet's own travelling tune tears a big shape's edge, and a jittery note tears it worse. Smooth it, and keep some.
    const ML = FRAME.mel * 4, MS = FRAME.melS * 4;
    if (F[ML] !== 0) { F[ML] *= 0.32; for (let pass = 0; pass < 2; pass++) { let a = F[MS]; for (let i = 1; i < 31; i++) { const b = F[MS + i]; F[MS + i] = 0.25 * a + 0.5 * b + 0.25 * F[MS + i + 1]; a = b; } } }
    // Lung: the contacts breathe.
    if (s) { const k = 1 + 0.1 * lung + 0.06 * pulse; for (const S of [A, B]) for (const n of ['blobs.r1', 'blobs.r2', 'blobs.r3', 'p1.q', 'p2.q']) if (S[OFF['field.kind']] === 4 && S[OFF['field.a']] < 0.5 && S[OFF[n]] > 0) S[OFF[n]] *= k; }
  },
  camera: { pool: { quiet: ['float', 'sink', 'tideway', 'veil'], mid: ['float', 'tideway', 'sink', 'plate', 'wander'], loud: ['rise', 'sink', 'sweep', 'dolly'] } },      // src/score/camera.js. Weightless: it hardly turns, and it goes up and down as much as along.
  // src/score/woah.js casts these, by the music: pearls, echo, ghost, fringe, and the softer folds. Never on a surface, or one already folded.
  woah: { tricks: ['pearls', 'echo', 'ghost', 'fringe', 'forever', 'fan', 'slit'], fond: { pearls: 1.2, echo: 1, ghost: 0.8, fringe: 0.8 }, gap: [28, 46], least: 6,
    fits: (id, G, S) => S[OFF['surf.kind']] < 0.5 && S[OFF['fold.n']] < 2 && ((id !== 'echo' && id !== 'ghost') || (G.pattern.g.fams?.length ?? 1) === 1) },
  pace: { bars: [8, 7, 6, 5, 4], morph: [4.5, 6.5], most: 15 },
  motion: { len: [12, 20], morph: [6, 9], xforms: { rack, drain, breath }, xform: 'rack', keep: ['rack', 'drain', 'breath'], front: true },
  hear: { pulse: 0.8, melody: 1.2, tone: 0.8, harmony: 0.7, lung: 1 },
};
