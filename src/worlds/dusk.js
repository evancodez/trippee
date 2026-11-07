// Dusk: wistful. Slow, sad, beautiful: the end of an afternoon seen from a train, and the room you got home to. docs/MODES.md, section 3.
// A whole way of seeing: colour is time since an edge passed, through film stock, in the light of one low sun. A song is one evening, its voice is the sun, its reverb is how long the light lingers, and the last few seconds of it are written along every line.
import { OFF, FRAME, RIPPLES } from '../pattern/layout.js';
import { pool } from './dusk/patterns.js';
import { FIELD } from './dusk/field.js';
import { DEFS, WARP, COLOR } from './dusk/light.js';
import { writeStock, lampsAt, gammaAt, sunAt, chips } from './dusk/stocks.js';
import { hearDusk, whoaOf, read, holdAt, eclipseAt } from './dusk/song.js';
import { KINDS } from './dusk/across.js';
import { cast, landings, moves, endings, PICK } from './dusk/direct.js';
import { wearDuskCamera } from './dusk/camera.js';
import './dusk/moves.js';

const clamp01 = x => Math.max(0, Math.min(1, x));
const smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const ASPECT = 16 / 9;
const CHART = 32, CHART_S = 5;     // the strip chart: how many samples and how many seconds a cycle's tail holds
const FREE_SUN = [0.55, 0.3, 0.3];
const LEAK = { line: 0.34, fall: 0.2, flare: 0.28, settle: 0 };
const NOLAKE = -3;
const RING = 0.24, GATHER = 0.2;     // a ring of light on the strong beat: how bright, and how long it gathers before it
const discOf = p => (p?.sun || p?.group === 'land' ? 1 : 0);      // the sun's a disc where there's a sky for it to be in. In a room or on a string it's only the light

// Where a pattern has its sun, in the frame, as its view has it now.
function sunIn(p, S, t, melSlow, path) {
  const s = p?.sun;
  if (!s) return [FREE_SUN[0] + 0.5 * Math.sin(t * 0.021), path[0] + melSlow, path[2]];
  const sc = S[OFF.scale], c = Math.cos(S[OFF.rot]), n = Math.sin(S[OFF.rot]), x = (s[0] - S[OFF.tx]) * sc, y = (s[1] - S[OFF.ty]) * sc;
  return [c * x - n * y, n * x + c * y, s[2] * sc];
}
function waterOf(G, t) {
  const p = G?.pattern;
  let y = p?.lake ?? NOLAKE;
  const w = G?.water;
  if (w) { const k = smooth((t - w.t0) / 3.5) * smooth((w.t1 - t) / 3.5); y = NOLAKE + (Math.max(y, w.y) - NOLAKE) * k; if (k <= 0) y = p?.lake ?? NOLAKE; }
  return y;
}

export default {
  id: 'dusk', name: 'Dusk', chips, pool, borrow: [],
  needs: ['trem', 'air', 'sustain'],
  glsl: { defs: DEFS, field: FIELD, warp: WARP, color: COLOR },
  camera: false,
  fuller: S => S[OFF['field.kind']] === 4 && S[OFF['field.a']] === 12,
  tables: (A, M) => hearDusk(A, M),
  whoa: (A, M) => whoaOf(A, M),
  direct(score, A, M) {
    if (!score.tau || !score.react) return score;
    cast(score, A, M);
    endings(score, A, PICK(score, A));
    landings(score);
    moves(score, A, M);
    wearDuskCamera(score, A, M, ((score.seed | 0) * 7919) >>> 0);
    return score;
  },
  uniforms(U, ctx) {
    const { A, B, t, c, T: Tm, from, to, kind, score, plan } = ctx, E = U.a, song = ctx.tables?.voice ? ctx.tables : null, s = ctx.at(c), G = from ?? ctx.G, N = to ?? null, Tx = N ? (Tm ?? ctx.x ?? 0) : 0;
    // The tune doesn't travel through this sheet in a line: where a broad band meets a walk of notes it comes out ragged. It's the sun, the lenses and the lift.
    const geo = ctx.geo ?? 1;     // the rule for a change of world: anything the film's own program would draw differently lets go with the geometry share, so the middle of a change can't tell
    ctx.F[FRAME.mel * 4] *= 1 - geo;
    // Nor the song's rings, which tear the edge of a band this broad: its strong beats are the rings of light out of the sun. The hand's own ripples fill from the front, and stay.
    for (let i = 4; i < RIPPLES; i++) ctx.F[(FRAME.ripple + i) * 4 + 3] *= 1 - geo;
    const melSlow = s ? Math.max(-0.5, Math.min(0.5, s.melSlow * 0.045)) : 0.1 * Math.sin(t * 0.17);
    // The sun.
    const day = (song ? read(song, song.day, t) + read(song, song.mood, t) : t * 0.03) % 8, path = sunAt(day), a = sunIn(G?.pattern, A, t, melSlow, path), b = N ? sunIn(N.pattern, B, t, melSlow, path) : a;
    const v = song ? read(song, song.voice, t) : 0.6 + 0.4 * Math.sin(t * 0.11), tune = s?.gains?.tune ?? 1;
    E[0] = a[0] + (b[0] - a[0]) * Tx; E[1] = a[1] + (b[1] - a[1]) * Tx;
    E[2] = (a[2] + (b[2] - a[2]) * Tx) * (0.92 + 0.14 * v);
    // How much sun: the voice's, and the evening's. A pattern that's built round the sun keeps it, as the moon if that's what's up.
    const keeps = p => (p?.sun ? 1 : 0), ka = keeps(G?.pattern), kk = ka + ((N ? keeps(N.pattern) : ka) - ka) * Tx;
    E[3] = (0.5 + 0.5 * v * Math.min(1, tune + 0.3)) * (path[1] + (Math.max(path[1], 0.7) - path[1]) * kk);
    // The tails, the film's halation, the strip chart, and the frame's light.
    const energy = song ? read(song, song.energy, t) : 0.4 + 0.2 * Math.sin(t * 0.07), lung = s ? Math.min(s.lung, 1.2) : 0.5, pulse = s ? Math.min(s.pulse, 1.2) : 0, air = song?.air ?? 2.6, hold = song ? holdAt(song, t) : 0;
    const held = song ? read(song, song.held, t) : 0.5, L = (0.34 + 0.1 * (air - 2.6) + 0.28 * held + 0.1 * lung + 0.14 * pulse) * (1 - 0.92 * hold);
    E[4] = Math.max(0.05, L);
    E[5] = 0.7 + 0.35 * energy;
    E[6] = 0.42;
    E[7] = (0.09 * energy + 0.05 * pulse) * (1 - hold);
    // Age, and the lake.
    E[8] = s ? 0.55 * smooth((s.tension - 0.45) / 0.8) : 0.12;
    const wa = waterOf(G, t), wb = N ? waterOf(N, t) : wa;
    E[9] = wa + (wb - wa) * Tx; E[10] = 1; E[11] = t * 0.55;
    // The rings of light out of the sun, on the strong beats. It gathers just before, and it's at its height on the beat, and then it goes out. The two nearest in time, one of which may not have left yet.
    let r0 = 0, a0 = 0, r1 = 0, a1 = 0, strong = 0;
    const pulsesAt = score.react?.pulses, time = score.time ?? (x => x), P = pulsesAt ? (score.duskPulses ??= Array.from(pulsesAt, time)) : null;
    if (P?.length) {
      let lo = 0, hi = P.length - 1;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (P[m] <= t) lo = m; else hi = m - 1; }
      const one = k => {
        if (k < 0 || k >= P.length) return [0, 0];
        const x = t - P[k], drums = Math.min(1, 0.4 + 0.6 * (s?.gains?.drums ?? 1));
        return x < -GATHER ? [0, 0] : x < 0 ? [0.12, RING * smooth((x + GATHER) / GATHER) * drums] : [0.12 + 1.6 * x, RING * Math.exp(-x / 1.05) * drums];
      };
      const near = P[lo + 1] != null && P[lo + 1] - t < GATHER ? lo + 1 : lo;
      [r0, a0] = one(near); [r1, a1] = one(near - 1);
      // And the whole picture breathes with it, just a little: the tails lengthen into the strong beat, and let go after it.
      const n1 = P[lo + 1], gather = n1 != null && n1 - t < GATHER ? smooth(1 - (n1 - t) / GATHER) : 0, after = Math.exp(-(t - P[lo]) / 0.55);
      strong = Math.max(gather, t >= P[lo] ? after : 0);
    }
    E[4] = Math.max(0.05, E[4] * (1 + 0.28 * strong * (1 - hold))); E[7] += 0.03 * strong * (1 - hold);
    E[12] = r0; E[13] = a0 * (1 - hold); E[14] = r1; E[15] = a1 * (1 - hold);
    // The dusk line's leak, the sun's path, the tremolo's ribs.
    const leak = plan && LEAK[kind] ? LEAK[kind] : 0, pa = G?.pattern?.path ?? 0, pb = N?.pattern?.path ?? 0;
    E[16] = leak;
    E[17] = (pa + (pb - pa) * Tx) * E[3];
    const trem = song ? read(song, song.trem.depth, t) : 0, rate = song ? read(song, song.trem.rate, t) : 0;
    E[18] = trem > 0.03 ? Math.min(0.5, trem * 1.2) : 0;
    E[19] = Math.max(3, Math.min(9, rate * 1.2));
    E[20] = song ? read(song, song.heave, t) : 0;
    const da = discOf(G?.pattern), db = N ? discOf(N.pattern) : da;
    E[21] = da + (db - da) * Tx;
    E[22] = 0.32;
    // The evening.
    writeStock(E, 24, day);
    // Lamps and windows, as the evening reaches them. They're on the land and the road and in the houses, and not in a pattern that isn't anywhere.
    const lampShare = p => (p ? (p.lamps ?? 0) * (p.group === 'land' || p.group === 'road' ? 1 : 0) : 0), litShare = p => (p?.lit ? 1 : 0), L0 = lampsAt(day);
    E[23] = L0 * (lampShare(G?.pattern) + ((N ? lampShare(N.pattern) : lampShare(G?.pattern)) - lampShare(G?.pattern)) * Tx);
    const Ub = U.b, lit = litShare(G?.pattern) + ((N ? litShare(N.pattern) : litShare(G?.pattern)) - litShare(G?.pattern)) * Tx;
    Ub[0] = lit * (0.22 + 0.7 * L0 + 0.08 * Math.sin(t * 0.3));
    // A patch of late sun on the wall: it climbs as the sun gets low, and it goes when the sun has.
    const wa2 = G?.pattern?.wall, wb2 = N ? N.pattern?.wall : wa2, wa1 = wa2 ? 1 : 0, wb1 = wb2 ? 1 : 0, wh = wa1 + (wb1 - wa1) * Tx, W0 = wa2 ?? wb2;
    Ub[4] = 0;
    if (W0) {
      const low = 1 - clamp01((path[0] + 0.2) / 0.85), sc = (G?.pattern?.wall ? A : B)[OFF.scale];
      Ub[4] = wh * Math.max(0.25, path[1]);
      Ub[5] = W0[0] + 0.55 * Math.sin(t * 0.017) + (low - 0.5) * 0.6; Ub[6] = W0[1] + (low - 0.5) * 0.42;
      Ub[7] = W0[2] + 0.8 * low;
      Ub[8] = W0[3] * sc * (1 + 0.3 * low); Ub[9] = W0[4] * sc * (1 - 0.3 * low); Ub[10] = W0[5];
    }
    // The birds on the wires: when the song falls away they've gone, and they come back one at a time.
    const ba = G?.pattern?.birds ?? 0, bb = N ? N.pattern?.birds ?? 0 : ba;
    Ub[11] = (ba + (bb - ba) * Tx) * (1 - hold);
    // The eclipse: everything looks at it. It's the one time the sun's somewhere it didn't choose.
    const ec = song ? eclipseAt(song, t) : null;
    Ub[1] = 0; Ub[2] = 0; Ub[3] = gammaAt(day);
    if (ec) {
      const out = 1 - Math.min(1, Math.abs(ec.x) * 1.05), k = smooth(out * 1.4);
      Ub[1] = ec.dark; Ub[2] = ec.x * E[2] * 2.2 * 1.1;
      E[0] += (0.1 - E[0]) * k; E[1] += (0.42 - E[1]) * k; E[2] += (0.34 - E[2]) * k; E[3] += (1 - E[3]) * k; E[21] += (1 - E[21]) * k;
    }
    for (let i = 3; i < 32; i += 4) E[24 + i] = 1;
    // The strip chart: a cycle's tail is the last CHART_S seconds, newest at the edge.
    for (let i = 0; i < CHART; i++) E[56 + i] = song ? read(song, song.level, t - (i / (CHART - 1)) * CHART_S) : 0.5 + 0.3 * Math.sin(t * 1.1 - i * 0.6);
    // Whichever way a change is going, the strings' slide goes with the tune.
    if (s) for (const S of [A, B]) if (S[OFF['squeeze.a']] !== 0) S[OFF['squeeze.x0']] += geo * (Math.max(-1.5, Math.min(1.5, s.melody * 0.14)) - S[OFF['squeeze.x0']]);
    // A string rings on the strong beat, at the room's own rate: anything that's lines.
    if (P?.length && s) {
      let lo = 0, hi = P.length - 1;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (P[m] <= t) lo = m; else hi = m - 1; }
      const x = t - P[lo];
      if (x >= 0) {
        const ring = geo * 0.02 * Math.exp(-x / Math.max(air * 0.35, 0.6)) * Math.sin(Math.min(x * 3, 1) * Math.PI / 2) * Math.cos(x * 7.5);
        for (const [S, p] of [[A, G?.pattern], [B, N?.pattern]]) if (p && (p.group === 'strings' || p.group === 'road') && S[OFF['bend2.a']] === 0) { S[OFF['bend2.a']] = ring; S[OFF['bend2.f']] = 3.1; S[OFF['bend2.ang']] = 0.02; }
      }
    }
  },
  pace: { bars: [8, 7, 5, 4, 3], morph: [6, 9], most: 17 },
  motion: { len: [14, 24], morph: [7, 11], xforms: KINDS, xform: 'line', keep: ['line', 'fall', 'flare', 'settle'], front: true },
  hear: { pulse: 0.6, melody: 0.9, tone: 0.5, harmony: 0.6, lung: 0.8, threshold: 0, depth: 0.4 },
};
