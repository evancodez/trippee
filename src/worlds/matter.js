// Matter: the sheet is a material. Black and white, exactly the film's, and what's new is what the pattern does: it divides, it breaks, and it heals.
//   Mitosis   a grid of fat black dots, and going into each strong beat every dot stretches into a peanut, pinches, and splits in two on the hit, while the view pushes in and turns
//             an eighth of a turn, so by the next beat the halves sit where their parent was, at its size. It never runs out (src/worlds/matter/divide.js).
//   Shatter   on the biggest arrival the sheet breaks like a mirror, the shards drift with the tune, and through the last bar before the next section they swing back and the last one
//             locks on its downbeat (src/worlds/matter/shatter.js).
// docs/DESIGN.md's never-build line on living things binds the film, not a mode: cells dividing are this mode's own.
import { OFF, FRAME } from '../pattern/layout.js';
import { smoother } from '../score/curves.js';
import { pool, borrow } from './matter/patterns.js';
import { FIELD } from './matter/divide.js';
import { WARP, CELLS, shardsAt, writeShatter, fillShatter, layoutOf } from './matter/shatter.js';
import { cast, placeShatters, lengthen, divisions, moves, calmCamera } from './matter/direct.js';

const LEAN = 0.13;          // radians: how far the tune leans the split, at the middle of it
const FULL = OFF['star._3'];      // a slot marked so the frame draws with the mode's fuller programs, which have the shatter in them
const T = new Float32Array(CELLS * 4);
const live = { on: false, L: null };      // what uniforms worked out for this frame, for the table that's filled straight after it
// With no song (the wander), every other bold sheet that stays long enough breaks a few seconds after it lands and heals before it goes. Worked out once a gesture, from when it starts.
const wanderShatter = G => {
  if (!G || G._matterShatter !== undefined) return G?._matterShatter ?? null;
  const end = G.t1 - (G.morph || 0), on = G.pattern?.group === 'sheet' && end - G.t0 >= 14 && end - G.t0 < 600 && Math.floor(G.t0 * 7.3) % 2 === 0;
  return (G._matterShatter = on ? { hit: G.t0 + 4, back: end - 2, bar: 2, L: layoutOf((Math.floor(G.t0 * 1000) >>> 0) + 7, 0.3 * Math.sin(G.t0), 0.2 * Math.cos(G.t0 * 1.7)) } : null);
};
const shatterAt = (score, t, G) => {
  if (score?.matter?.bare) return null;      // bare: a test's look at the same frame with nothing broken
  if (score?.matter) return score.matter.shatters.find(S => t >= S.hit && t < S.back) ?? null;
  if (score?.song) return null;
  const S = wanderShatter(G);
  return S && t >= S.hit && t < S.back ? S : null;
};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const PO = FRAME.pose * 4, ML = FRAME.mel * 4, TU = FRAME.tune * 4, FO = FRAME.focus * 4, RP = FRAME.ripple * 4, HM = FRAME.hear * 4;
const isCells = H => (H?.pattern?.group === 'cells' ? 1 : 0);
// How near a shatter the frame is: up over the two bars before the hit, and down over the two after it heals.
export const nearShatter = (score, t) => { let w = 0; for (const S of score?.matter?.shatters ?? []) w = Math.max(w, smoother((t - S.hit + 2 * S.bar) / (2 * S.bar)) * (1 - smoother((t - S.back) / (2 * S.bar)))); return w; };

export default {
  id: 'matter', name: 'Matter', chips: [[0, 0, 0], [255, 255, 255], [0, 0, 0]],
  pool, borrow, ink: null, pass: null, needs: [],
  glsl: { field: FIELD, warp: WARP, color: 'vec3 worldColor(int k0,int k1,float c){ return film(c); }\n' },
  fuller: S => S[FULL] > 0.5,
  table: { h: 2, fill(tex) { if (!live.on) return false; fillShatter(tex, live.L, T); return true; } },
  direct(score, A, M) {
    if (!score.tau || !score.react) return score;
    cast(score, A, M);
    const shatters = placeShatters(score, A, M);
    lengthen(score, M);
    divisions(score, A, M);
    moves(score, A, M);
    score.matter = { shatters };
    return score;
  },
  dressCamera: film => calmCamera(film),
  uniforms(U, ctx) {
    const { A, B, from, to, G, t, score, geo } = ctx, s = ctx.at(ctx.c);
    // The tune leans the split a few degrees. Nothing at either end of it, so a step still lands where it should.
    const tune = s ? clamp(s.melSlow, -1.5, 1.5) * Math.min(1, 1.5 * s.voiced) : Math.sin(t * 0.21);
    for (const [S, H] of [[A, from ?? G], [B, to]]) if (H?.pattern?.group === 'cells' && S[OFF['field.kind']] === 4) S[OFF['field._2']] = LEAN * tune * Math.sin(Math.PI * S[OFF['field.spin']]);
    // The song's lenses, its travelling tune and its rings of line weight bend a dot into a blob and a crack into a curve, so on dots and round a shatter they're turned well down. By how much of the frame is either, so nothing steps.
    // What's left of the song there is the division itself on the strong beats, the tune leaning it, and a little of the rest. The beat's own weight and the lung step back on those stays too (G.calm, src/worlds/matter/direct.js).
    const F = ctx.F, cells = isCells(from ?? G) + (to ? (isCells(to) - isCells(from ?? G)) * ctx.T : 0), quiet = Math.max(cells, nearShatter(score, t));
    if (quiet > 0) {
      const k = 1 - 0.85 * quiet;
      for (let i = 0; i < 3; i++) F[PO + 4 * i + 2] *= k;
      // The tune travelling out through the sheet is a push that changes along the radius: it curls a waist into an S and waves a straight line. So it's nearly all gone.
      F[PO + 14] *= 1 - 0.7 * quiet; F[ML] *= 1 - 0.97 * quiet; F[TU] *= k; F[FO + 2] *= k;
      // The song's ripples (the back four of the block: the front's the hand's, and stays) curl a waist and wobble a crack, and its notes' lenses and bloom bend them.
      for (let i = 4; i < 8; i++) F[RP + 4 * i + 3] *= 1 - 0.9 * quiet;
      for (let i = 8; i < 20; i += 4) F[HM + i + 2] *= 1 - 0.7 * quiet;
      F[HM + 6] *= 1 - 0.6 * quiet;
      // And the song's own camera in front of it all, which pushes and turns on a hit: the division is its own push and turn, and a crack wants the lines it breaks to hold still.
      F[HM] *= 1 - 0.6 * quiet; F[HM + 1] *= 1 - 0.6 * quiet;
    }
    // The shatter, if one's on.
    const sh = shatterAt(score, t, from ?? G);
    live.on = false; U.a[0] = 0;
    if (sh && geo > 0 && shardsAt(sh, t, tune, T)) { writeShatter(U.a, U.b, sh, geo); live.on = true; live.L = sh.L; A[FULL] = 1; }
  },
  // src/score/woah.js casts these on the bold sheets, by the music. Never on the dots while they're dividing, and never on a sheet that's going to break: each of those is its own big moment.
  woah: { tricks: ['crumple', 'roll', 'slit', 'limit', 'pearls', 'echo'], fond: { crumple: 1.2, roll: 0.8, slit: 0.6 }, gap: [30, 50], least: 6,
    fits: (id, G, S) => !G.mitosis && !G.shatter && G.pattern.group !== 'cells' && S[OFF['surf.kind']] < 0.5 && S[OFF['fold.n']] < 2 },
  // Changes take a little longer than the film's: a flight over bold shapes in less swings a tile more than once a second.
  pace: { bars: [10, 8, 6, 5, 4], morph: [7, 10], most: 20 },
  motion: { len: [14, 24], morph: [7, 10] },
  // The division is the pulse, so the song's own beat on the threshold is turned down. The tune and the chords stay.
  hear: { pulse: 0.6, melody: 1, tone: 0.5, harmony: 0.8, lung: 0.8, threshold: 0.5 },
};
