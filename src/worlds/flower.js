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
const POLE_SIZES = ['blobs.r1', 'blobs.r2', 'blobs.r3', 'p1.q', 'p2.q'].map(n => OFF[n]), POLE_TURNS = ['blobs.a1', 'blobs.a2', 'blobs.a3', 'p1.ay', 'p2.ay'].map(n => OFF[n]), MOTIFS = OFF['field.b'];
const PH0 = 3;      // about where a pattern's rings sit before the flow
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
      // In a film everything's on the one clock, so it's the clock that says, whichever slot's showing: in a flight the slot flown out of has come to rest, and going by that the buzz's sweep would jump at the landing.
      const S = ctx.change && ctx.x >= 0.5 ? ctx.B : ctx.A, clockOn = ctx.score.phi && ctx.score.tables && !ctx.change, nNow = Math.floor(clockOn ? PH0 - FLOW * ctx.score.phi(ctx.t, ctx.G) : S[OFF['f0.ph']]) - 4;
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
      if (bar - G.t0 - (G.morph || 0) >= 4) { G.t1 = bar; G.arcEnd = bar; N.t0 = bar; }
      else {
        // No room before it: it lands just after, if that leaves the next one a stay of its own. Carrying on through the two of them would be half a minute on one picture.
        const after = w.t + 1 + (G.morph || 0);
        if (N.t1 - after >= (N.morph || 0) + 4) { G.t1 = after; G.arcEnd = after; N.t0 = after; }
        else { G.t1 = N.t1; G.arcEnd = N.t1; G.morph = N.morph; g.splice(i + 1, 1); i--; }
      }
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
      // A garden of several flowers opens further on the strong beats than it used to. One that's the whole frame (a single motif, a peace sign, a smile) doesn't: every ring in the frame changing shape at once is the whole frame's brightness on the beat.
      const many = POLE_SIZES.filter(p => A[p] >= 0.3).length >= 3, k = 1 + 0.3 * Math.min(s.lung, 1.2) + (many ? 0.26 : 0.16) * Math.min(s.pulse, 1.2);
      // A peace sign and a smile are drawn exactly at their depth, and past it their lines cross and the face tears down the middle. They take the beat in the rest of it.
      const tender = p => p?.id === 'flower.smile' || p?.id === 'flower.peace', kOf = p => (tender(p) ? 1 + 0.15 * (k - 1) : k);
      A[OFF['field.ph']] *= kOf((from ?? ctx.G)?.pattern); B[OFF['field.ph']] *= kOf(to?.pattern);
      // What has no petals takes the beat in whatever shape it has: a check's bulge, a chevron's teeth, a wave's bend.
      const p = 1 + Math.min(s.pulse, 1.2);
      for (const S of [A, B]) { S[BULGE] *= 1 + 0.5 * (p - 1); S[TEETH] *= 1 + 0.3 * (p - 1); S[BEND] *= 1 + 0.4 * (p - 1); }
      // The tune: whichever flower it's singing to swells, and the rest make room. Each pole has its place on the scale.
      const m = s.voiced * Math.min(1, s.gains?.tune ?? 1) * 0.16;
      // A film pattern's own p1 and p2 are its own (how square, how tall), so only the three flowers it was given answer.
      const poles = [[A, (from ?? ctx.G)?.pattern], [B, to?.pattern]].map(([S, p]) => [S, p?.group === 'film' ? 3 : 5]);
      if (m > 0.002) for (const [S, n] of poles) POLE_SIZES.forEach((p, i) => { if (i < n && S[p] > 0) { const d = s.melody * 0.32 - (i - 1.5) * 1.2; S[p] *= Math.exp(m * (Math.exp(-d * d) - 0.4)); } });
      // And the flowers turn with it: up the scale one way, down it the other, every other one against the rest, as if the tune were stirring them. Slowly: it's the phrase's line, not each note.
      const turn = 0.32 * Math.max(-1.5, Math.min(1.5, s.melSlow ?? 0)) * Math.min(1, (s.gains?.tune ?? 1) * 1.3);
      if (turn) for (const [S, n] of poles) POLE_TURNS.forEach((p, i) => { if (i < n && S[POLE_SIZES[i]] > 0 && !S[MOTIFS]) S[p] += i % 2 ? -turn : turn; });
    }
  },
  // src/score/woah.js casts these, by the music, on its own patterns and with its own landings. Space isn't in a mode's programs; folds and time are. Its own moves on a stay give way to a trick there.
  // The kaleidoscope's fan and forever's zoom were what it was fond of. gap: seconds between tricks, loud to quiet. Not echo or the screen: on its zigzags and mandalas they came out as checkered mush and a grey middle (MGMT 86 and 148 s).
  // Forever and the fan are out of the casting, still scored so the take's dice fall as they did (off). On these bands forever's flight puts one ring over most of the frame and its inks change as it flies: the whole frame swung cream, blue, yellow, navy, 2 a second in luma and in red-cyan (MGMT 174-188 s, on flower.poppy). The fan's mirror coming in swung a tile purple and orange 4 a second (MGMT 28 s, on flower.garden).
  woah: { tricks: ['fan', 'forever', 'pearls', 'crumple', 'slit', 'roll', 'limit'], off: ['forever', 'fan'], fond: { fan: 1.2, forever: 1.1, pearls: 0.6, crumple: 0.4 }, gap: [26, 44], least: 6 },
  pace: { bars: [9, 7, 5, 4, 3], morph: [5, 8], most: 18 },       // src/score/pace.js: bars between changes by the song's level, and how long a landing takes. ?pace=0: motion's len and morph
  motion: { len: [13, 22], morph: [6, 9], xforms: { bud, melt, tide }, xform: 'bud', keep: ['bud', 'melt', 'tide'], front: true },
  hear: { pulse: 1, melody: 1, tone: 0.4, harmony: 0.7, lung: 1 },
};
