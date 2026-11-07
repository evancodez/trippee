// Flower Power, the first world. docs/MODES.md, section 3. Sixties psychedelia: flat hot inks and no black, thick bands swelling round a few big flowers, borders buzzing when the harmony pulls.
// A line's ink is what was sounding when it was born: its note on one side, its chord on the other. So the rings going out are the last bars of the song.
import { OFF } from '../pattern/layout.js';
import { pool, FLOW } from './flower/patterns.js';
import { FIELD, PHASE, COLOR } from './flower/field.js';
import { ROWS, paint, chips, SETS } from './flower/inks.js';
import { flowClock, hearSong, buzzAt, whoaOf } from './flower/song.js';
import bud, { giveWay, melt, tide } from './flower/bud.js';
import { cast, landings, moves } from './flower/direct.js';
import './flower/moves.js';

// With no song, a made-up tune and slow changes. It goes through the sets on its own.
const TUNE = [0, 1, 2, 0, 1, 7, 0, 2, 1, 0, 3, 1, 0, 2, 1, 2];
const CHANGES = [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 3, 3, 5, 5, 1, 1];
const LINES_PER_SET = 28, NO_SONG_RATE = FLOW * 0.25, RUN_LEAD = 4;       // lines a second with no song. A pattern's run starts a few seconds ahead of it, so what's showing by the time it arrives is the run.
const made = n => [TUNE[((n % 16) + 16) % 16], CHANGES[(((n >> 1) % 16) + 16) % 16], (((Math.floor(-n / LINES_PER_SET)) % SETS.length) + SETS.length) % SETS.length];
const runAt = (g, t) => { if (!g?.length) return null; let lo = 0, hi = g.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g[m].t0 <= t) lo = m; else hi = m - 1; } return g[lo].run ?? g[lo].pattern.run ?? null; };
// What line n wears. The tune and the changes when it was born, unless what was on then, or what was just about to be, wears a run.
const inkOf = (song, score) => {
  const g = score?.gestures;
  const f = n => {
    const i = -n;
    if (song && i >= 0 && i < song.rings) return [song.bloom[i], song.ground[i], song.set[i], runAt(g, song.when[i] + RUN_LEAD), 2 * i];
    return [...made(n), song ? null : runAt(g, (3 - n) / NO_SONG_RATE + RUN_LEAD), 2 * i];
  };
  f.id = song?.id ?? 'made';
  return f;
};
const clamp01 = x => Math.max(0, Math.min(1, x));
const POLE_SIZES = ['blobs.r1', 'blobs.r2', 'blobs.r3', 'p1.q', 'p2.q'].map(n => OFF[n]);
const BULGE = OFF['bulge.a'], TEETH = OFF['zig.a'], BEND = OFF['bend1.a'];
const SWEEP = 1.2, SWEEP_LINES = 6;      // seconds from the line being born to the farthest showing: bands this bold are only about this many lines out from a flower to the corner

export default {
  id: 'flower', name: 'Flower Power', chips, pool, borrow: [], needs: ['voices'],
  glsl: { field: FIELD, phase: PHASE, color: COLOR },
  ink: { R: ROWS, fams: [0], roll: false, weights: [1, 0, 0, 0] },
  fuller: S => S[OFF['spare.a']] !== 0 || S[OFF['spare.c']] !== 0 || S[OFF['star._2']] !== 0 || (S[OFF['field.kind']] === 4 && S[OFF['field.b']] !== 0) || S[OFF['blobs.beta']] !== 0 || S[OFF['blobs.k']] !== 0 || S[OFF['ribbon.a']] !== 0,      // Whiplash's lines, Flames', the curl, the motifs, tiles, and what goes inside a band
  table: {
    h: 2,
    fill(tex, ctx) {
      // The window of lines that can be showing: one flight's clock ahead of what's being born now, and everything out to the far corner. Read off what's drawn, so a change of world's old clock counts too.
      const S = ctx.change && ctx.x >= 0.5 ? ctx.B : ctx.A, nNow = Math.floor(S[OFF['f0.ph']]) - 4;
      // The buzz stops from the flowers out, over about a second. All at once it's the whole frame's chroma stepping, one half of a whole-frame flash, and the eye can't follow it anyway.
      // With no song it comes and goes on its own, more often gone.
      const song = ctx.tables, none = Math.pow(clamp01(0.5 + 0.5 * Math.sin(ctx.t * 0.13 - 1.2)), 3);
      return paint(tex, nNow - 12, song ? n => buzzAt(song, ctx.t - SWEEP * clamp01((n - nNow - 1) / SWEEP_LINES)) : () => none, inkOf(song, ctx.score));
    },
  },
  tables: (A, M) => hearSong(A, M),
  whoa: (A, M) => whoaOf(hearSong(A, M), M),
  // Its own director: one flow clock for the whole film, and each landing a Bud where it can be.
  direct(score, A, M) {
    if (!score.tau || !score.react) return score;
    const clock = flowClock(score, A);
    score.phi = t => clock(t);
    const g = cast(score, A, M);
    // The whoa has nothing but rings moving: no landing in the bars before it. A landing there comes earlier if there's room, or else the gesture carries on through.
    const w = whoaOf(hearSong(A, M), M), QUIET = 10;
    if (w) for (let i = 0; i + 2 < g.length; i++) {
      const G = g[i], N = g[i + 1];
      if (!(G.t1 - (G.morph || 0) < w.t + 1 && G.t1 > w.t - QUIET)) continue;
      const bars = M?.bars ?? [], at = w.t - QUIET, bar = [...bars].reverse().find(b => b <= at) ?? at;
      if (bar - G.t0 - (G.morph || 0) >= 8) { G.t1 = bar; G.arcEnd = bar; N.t0 = bar; }
      else { G.t1 = N.t1; G.arcEnd = N.t1; G.morph = N.morph; g.splice(i + 1, 1); i--; }
    }
    // Who's on, how they get to the next, and what they do. A rehearsal can't take a landing away (motion.keep): what it has instead is what the landing offers, then taking longer. A flash in one has to be fixed in that one. tests/flashworld.mjs holds it to the limit.
    landings(score);
    moves(score, A, M);
    return score;
  },
  // Lung: petal depth.
  uniforms(U, ctx) {
    const { A, B, kind, from, to, t, score } = ctx;
    // In a world's landing the rings don't ease to rest and catch up, as other transformations' clocks do: they run on the one clock, right through it.
    if (from && to && (kind === 'bud' || kind === 'melt')) {
      const a = from.pattern.g.fams[0].ph ?? 0, b = to.pattern.g.fams[0].ph ?? 0;
      // A rehearsal that's watched one flash can ask the rings to give way (bud.js, its levers): behind at the middle, where everything else is moving fastest, and paying it back at the ends, where nothing is. They land exactly on the clock.
      A[OFF['f0.ph']] = a + (b - a) * ctx.T - FLOW * score.phi(t, to) - (from.budRest ?? 0) * giveWay(ctx.x);
    } else if (from && to && kind === 'tide') {
      const now = FLOW * score.phi(t, to) + (from.budRest ?? 0) * giveWay(ctx.x);
      A[OFF['f0.ph']] = (from.pattern.g.fams[0].ph ?? 0) - now; B[OFF['f0.ph']] = (to.pattern.g.fams[0].ph ?? 0) - now;
      U.e[15] = ctx.plan.ang ?? 0;      // the way a straight tide goes
    }
    const s = ctx.at(ctx.c);
    if (s) {
      // Lung and the strong beats: petal depth. A flower opens on the beat, and with the phrase.
      const k = 1 + 0.3 * Math.min(s.lung, 1.2) + 0.18 * Math.min(s.pulse, 1.2);
      A[OFF['field.ph']] *= k; B[OFF['field.ph']] *= k;
      // What has no petals takes the beat in whatever shape it has: a check's bulge, a chevron's teeth, a wave's bend.
      const p = 1 + Math.min(s.pulse, 1.2);
      for (const S of [A, B]) { S[BULGE] *= 1 + 0.5 * (p - 1); S[TEETH] *= 1 + 0.3 * (p - 1); S[BEND] *= 1 + 0.4 * (p - 1); }
      // The tune: whichever flower it's singing to swells, and the rest make room. Each pole has its place on the scale.
      const m = s.voiced * Math.min(1, s.gains?.tune ?? 1) * 0.16;
      if (m > 0.002) for (const S of [A, B]) {
        const on = POLE_SIZES.filter(p => S[p] > 0);
        if (on.length > 1) on.forEach((p, i) => { const d = s.melody * 0.32 - (i - (on.length - 1) / 2) * 1.2; S[p] *= Math.exp(m * (Math.exp(-d * d) - 0.4)); });
      }
    }
  },
  motion: { len: [13, 22], morph: [6, 9], xforms: { bud, melt, tide }, xform: 'bud', keep: ['bud', 'melt', 'tide'], front: true },
  hear: { pulse: 0.75, melody: 1, tone: 0.4, harmony: 0.7, lung: 1 },      // pulse: each strong beat's ring shoves a band's edge out and back across a tile
};
