// Flyer: rock'n'roll. docs/MODES.md, section 3. A gig poster run off on a bad photocopier and a one-drum press: toner and fluorescent ink on coloured stock, plates out of register, fat dots, and a stencil cut with a knife.
// Nothing here's lit and nothing fades: a pixel's got ink on it or it hasn't, and every in-between is dots. The kick pushes the cone and knocks the plates out of register. How far gone the guitars are is how square every edge is, and an edge is the shape of the sound itself.
import { OFF } from '../pattern/layout.js';
import { fineness } from '../score/slot.js';
import { pool, FLOW, ratchet } from './flyer/patterns.js';
import { FIELD, COLOR, T_HOOK } from './flyer/field.js';
import { INKS, chips, writeSchedules } from './flyer/inks.js';
import { hearSong, noSong, popAt, knocks, waveAt, whoaOf } from './flyer/song.js';
import { PAGE_ROWS, PAGE_ASPECT, TABLE_H, writePage } from './flyer/stencil.js';
import crank, { bleed, feed, fill, STRIPS } from './flyer/change.js';
import { cast, landings, moves, sheets } from './flyer/direct.js';

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const ease = x => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const POLE_SIZES = ['blobs.r1', 'blobs.r2', 'blobs.r3', 'p1.q', 'p2.q'].map(n => OFF[n]);
const DEPTH = OFF['field.ph'], F0 = OFF['f0.ph'], BEND = OFF['bend2.a'], BEND_F = OFF['bend2.f'], BEND_ANG = OFF['bend2.ang'], BULGE = OFF['bulge.a'], ZIG = OFF['zig.a'];
const REGISTER = 0.0035, KNOCK = 0.03;      // as a share of the frame's height: how far off the plates always are, and how far a full hit throws them
const HOLLOW = 0.9;

const putInks = (a, n, E) => {
  const put = (i, c, w) => { const k = 4 * (n + i); a[k] = c[0]; a[k + 1] = c[1]; a[k + 2] = c[2]; a[k + 3] = w; };
  put(0, E.stock, E.sched); put(1, E.a, E.sw[0]); put(2, E.a2, E.sw[1]); put(3, E.b, E.sw[2]); put(4, E.k, 0);
};
// What the headline says: the song's own name, or LOUD with no song.
const titleOf = () => { const n = globalThis.app?.ui?.song?.file?.name ?? globalThis.app?.ui?.song?.name; if (!n) return 'word:LOUD'; const w = String(n).replace(/\.[a-z0-9]+$/i, '').replace(/^.*-\s*/, '').replace(/[_]+/g, ' ').trim().toUpperCase(); return `word:${w.slice(0, 14) || 'LOUD'}`; };
const keyOf = st => (st.key === 'title' ? titleOf() : st.key);

// What a slot's stencil is doing, and which page it's on. share: how much of it is cut, 0..1, and it goes through dots.
const slotPage = G => G?.page ?? 0;
function writeStencil(a, G, t, pop, share, S, f) {
  const P = G?.pattern, st = P?.stencil;
  a[4 * 25] = 0; a[4 * 26] = 0;
  if (!st || share <= 0) return;
  const drift = t * 0.05, sway = Math.sin(drift * 2.1), lift = 0.03 * Math.sin(drift * 1.3 + 1), rows = P.grid?.[1] ?? 1, s = (st.s / rows) * (1 + 0.035 * clamp(pop, -0.4, 1.2));
  a[4 * 24] = (st.x + 0.05 * sway) / rows; a[4 * 24 + 1] = (st.y + lift) / rows; a[4 * 24 + 2] = s; a[4 * 24 + 3] = st.rot + 0.025 * sway;
  a[4 * 25] = share; a[4 * 25 + 1] = PAGE_ROWS[slotPage(G)]; a[4 * 25 + 2] = 0; a[4 * 25 + 3] = PAGE_ASPECT;
  if (P.grid) { a[4 * 26] = P.grid[0]; a[4 * 26 + 1] = P.grid[1]; a[4 * 26 + 2] = S; a[4 * 26 + 3] = f; }
}
const WARHOL = [[1, 5, 6, 3], [7, 5, 2, 9], [6, 1, 3, 8], [5, 4, 6, 1]];

export default {
  id: 'flyer', name: 'Flyer', chips, pool, borrow: [], needs: ['wave', 'snare', 'clip', 'fill'],
  glsl: { field: FIELD, T: T_HOOK, color: COLOR },
  ink: { R: 8, fams: [0], roll: false, weights: [1, 0, 0, 0] },
  // Motifs, stencils, flames, ridges and tiles all go in programs of their own.
  fuller: S => S[OFF['spare.d']] !== 0 || S[OFF['star._1']] !== 0 || (S[OFF['field.kind']] === 4 && S[OFF['field.b']] !== 0) || S[OFF['blobs.beta']] !== 0,
  table: {
    h: TABLE_H,
    fill(tex, ctx) {
      let changed = false;
      if (!tex.flyer) { tex.flyer = { pages: [null, null] }; writeSchedules(tex); changed = true; }
      // Each stencil on its own page. The page goes by the gesture, so nothing that's showing is ever written over.
      const want = (G, p) => { if (!p?.stencil) return; const k = keyOf(p.stencil), i = slotPage(G); if (tex.flyer.pages[i] !== k) { writePage(tex, PAGE_ROWS[i], k); tex.flyer.pages[i] = k; changed = true; } };
      const A = ctx.from ?? ctx.G; want(A, A?.pattern); if (ctx.to) want(ctx.to, ctx.to.pattern);
      return changed;
    },
  },
  whoa: (A, M) => whoaOf(A, M),
  // The camera's the band's too: all of its travel falls into each strong beat, and hangs between them. A clock of its own, on the camera's own table, so it costs nothing and lands where it would have.
  dressCamera(film) {
    const song = film.flyer, cam = film.camera, hits = song?.hits;
    if (!hits || hits.length < 4) return;
    const lag = cam.lag ?? new Float32Array(cam.n);
    for (let k = 0; k + 1 < hits.length; k++) {
      const a = hits[k], b = hits[k + 1], gap = b - a;
      if (gap > 3 || gap < 0.2) continue;
      for (let i = Math.ceil(a * 30); i <= Math.floor(b * 30) && i < cam.n; i++) lag[i] -= gap * (0.75 * Math.sin(2 * Math.PI * ((i / 30 - a) / gap))) / (2 * Math.PI);
    }
    cam.lag = lag;
  },
  direct(score, A, M) {
    if (!score.tau || !score.react) return score;
    let song = hearSong(score, A, M);
    cast(score, A, M, song);
    // The name's come on on the landing nearest the whoa, so that's where the whoa is now.
    if (score.whoaAt != null) song = hearSong(score, A, M, score.whoaAt);
    score.flyer = song;
    score.phi = t => score.flyer.clock(t) / FLOW;
    sheets(score, song);
    landings(score, song);
    moves(score, A, M);
    return score;
  },
  uniforms(U, ctx) {
    const { A, B, kind, from, to, t, score, plan, x } = ctx, song = score?.flyer ?? null, a = U.a, b = U.b;
    const here = from ?? ctx.G, phi = score?.phi;
    if (from && to && slotPage(from) === slotPage(to)) to.page = 1 - slotPage(from);      // a pick has no page of its own
    // In a world's landing the rings run on the one clock, right through it.
    if (from && to && phi) {
      const now = ratchet(FLOW * phi(t, to));
      if (kind === 'crank' || kind === 'bleed') { const p0 = from.pattern.g.fams?.[0]?.ph ?? 0, p1 = to.pattern.g.fams?.[0]?.ph ?? 0; A[F0] = p0 + (p1 - p0) * ctx.T - now; }
      else if (kind === 'feed' || kind === 'fill') { A[F0] = (from.pattern.g.fams?.[0]?.ph ?? 0) - now; B[F0] = (to.pattern.g.fams?.[0]?.ph ?? 0) - now; U.e[15] = plan?.ang ?? 0; }
    }
    const s = ctx.at(ctx.c);
    const d = song ? song.driveAt(t) : noSong.driveAt(t);
    const pop = song ? popAt(song.hits, song.power, t) : Math.exp(-((t * 104 / 120) % 1) * 3.2) - 0.25;
    // The edges: as deep as the sound's far gone. Rolled right back they're a plain target, and the wave's in them as they come up.
    const depthK = 0.12 + 0.88 * d, sizeK = 1 + 0.085 * pop;
    for (const S of [A, B]) {
      S[DEPTH] *= S[OFF['star._1']] > 0.5 || S[OFF['field.b']] !== 0 ? 1 : depthK;
      if (S[OFF['star._1']] > 1.5) S[DEPTH] *= 0.35 + 0.65 * depthK + 0.25 * clamp(pop, 0, 1);
      for (const p of POLE_SIZES) if (S[p] > 0) S[p] *= sizeK;
      S[BULGE] *= 1 + 0.5 * clamp(pop, -0.3, 1);
      S[ZIG] *= 1 + 0.25 * clamp(pop, -0.3, 1);
      // The fret: the tune bows every line in the frame, as far as it's bending.
      if (s && S[BEND] === 0) { S[BEND] = 0.075 * s.voiced * clamp(s.melody, -1.5, 1.5) * Math.min(1, s.gains?.tune ?? 1); S[BEND_F] = 0.95; S[BEND_ANG] = 0; }
    }
    waveAt(a, song, t, d, 0);
    // The plates. Always a little off, and the drums knock them.
    const oA = [REGISTER, REGISTER * 0.6], oB = [-REGISTER * 0.8, REGISTER];
    // A stay can let the plates drift right apart, three ghosts of one picture, and they slam home on a hit. So does the wind-up to the whoa.
    const sep = here?.moves?.find(m => m.id === 'separate'), wW = song?.whoa;
    let apart = sep ? ease((t - sep.from) / Math.max(sep.to - sep.from - 0.3, 1)) * (t < sep.to ? 1 : 0) : 0;
    if (wW && t > wW.t - wW.wind && t < wW.t) apart = Math.max(apart, ease((t - (wW.t - wW.wind)) / wW.wind));
    if (apart > 0) { const ang = (sep?.from ?? 0) * 1.7; oA[0] += 0.075 * apart * Math.cos(ang); oA[1] += 0.075 * apart * Math.sin(ang); oB[0] -= 0.075 * apart * Math.cos(ang + 0.9); oB[1] -= 0.075 * apart * Math.sin(ang + 0.9); }
    if (song) knocks(song, t, KNOCK * (0.45 + 0.55 * d), oA, oB);
    else { const n = (t * 104 / 120), k = Math.floor(n), u = (n - k) * 120 / 104, e = Math.min(1, u / 0.03) * Math.exp(-u / 0.17) * Math.cos(u * 17) * KNOCK * (0.45 + 0.55 * d); oA[0] += e * Math.cos(k * 2.399); oA[1] += e * Math.sin(k * 2.399); }
    a[32] = oA[0]; a[33] = oA[1]; a[34] = oB[0]; a[35] = oB[1];
    // The par cans, from over the stage. They come on with the sound, and crawl.
    const w = song?.whoa, into = w ? ease((t - (w.t - w.wind)) / w.wind) * (t < w.t ? 1 : 0) : 0;
    const on = clamp((d - 0.42) / 0.3) * 0.11;
    a[36] = 0.9 * Math.sin(t * 0.37 + 1) * (1 - into); a[37] = 0.9 * Math.sin(t * 0.29 + 4) * (1 - into) + 0.04 * into; a[38] = Math.max(on, 0.05 * into); a[39] = 1.5;
    // Hollow toner, and which sheet's up.
    const E = song ? song.editionAt(t) : noSong.editionAt(t);
    a[40] = HOLLOW; a[41] = E.x; a[42] = E.way; a[43] = 0.9;
    putInks(a, 11, INKS[E.a]); putInks(a, 16, INKS[E.b]);
    // The Fill. How far along each strip is goes by its hit.
    a[84] = 0;
    if (kind === 'fill' && plan && ctx.G) {
      const G = from, n = plan.strips ?? STRIPS, t0 = G.t1 - G.morph, D = G.morph, hits = (G.xform?.hits?.filter(h => h >= t0 && h <= G.t1) ?? []).slice(-n);
      const each = hits.length >= 3 ? hits : (song ? song.hits.concat(song.snares).sort((p, q) => p - q).filter(h => h >= t0 + 0.05 && h <= G.t1 - 0.05) : []);
      a[84] = n; a[85] = plan.ang ?? 0; a[86] = plan.reach ?? 1.9; a[87] = 0;
      // A strip goes over in most of a second: in less, two patterns far apart in phase whip every line in it past, and that's a strobe in one strip (mgmt 208 s, red 13 a second on a tile, at 0.42 s).
      const STEP = Math.max(0.95, D * 0.4);
      for (let i = 0; i < n; i++) {
        const order = plan.order === 1 ? n - 1 - i : plan.order === 2 ? (i * 3) % n : i, frac = (order + 0.5) / n;
        const when = each.length >= 3 ? each[Math.min(each.length - 1, Math.floor(frac * each.length))] : t0 + frac * (D - STEP);
        const go = Math.min(when, G.t1 - STEP);
        a[88 + i] = clamp((t - go) / STEP);
      }
    }
    // Warhol's panels: a strong beat hands one panel new inks.
    let hopS = 0, hopF = 1;
    if (song) { let lo = 0, hi = song.hits.length; while (lo < hi) { const m = (lo + hi) >> 1; if (song.hits[m] <= t) lo = m + 1; else hi = m; } hopS = lo; hopF = lo ? clamp((t - song.hits[lo - 1]) / 0.42) : 1; }
    else { const n = t * 104 / 120; hopS = Math.floor(n); hopF = clamp(((n - hopS) * 120 / 104) / 0.42); }
    const showing = [here, to].find(G => G?.pattern?.grid);
    if (showing) { const set = WARHOL[(showing.page ?? 0) + (showing.pattern.g['blobs.a1'] ? 2 : 0)] ?? WARHOL[0]; set.forEach((e, i) => putInks(b, 5 * i, INKS[e])); }
    // Stencils. A flight's two patterns are each drawn with their own. Anything else has only the one colour stage: the old one goes through its dots by half way, and the new one comes up through them after.
    if (kind === 'dive' || kind === 'rise' || kind === 'iris' || kind === 'fall') { writeStencil(a, here, t, pop, 1, hopS, hopF); writeStencil(b, to, t, pop, 1, hopS, hopF); }
    else if (from && to) { const u = x < 0.5 ? 1 - ease(x / 0.45) : ease((x - 0.55) / 0.45); writeStencil(a, x < 0.5 ? from : to, t, pop, u, hopS, hopF); writeStencil(b, null, t, pop, 0, 0, 1); }
    else { writeStencil(a, here, t, pop, 1, hopS, hopF); writeStencil(b, null, t, pop, 0, 0, 1); }
  },
  // src/score/woah.js casts these, by the music: the screen, crumple, the fan, ghost hands on the strong beats, a roll on the biggest hit. Loud songs more often.
  // The ones that go small (the screen's corridor, limit's tiles, forever's rings) only on a bold sheet: on fine dots and checks they were a busy middle (MGMT 151-156 and 217-221 s).
  // Not the fan: its shards in toner and day-glo swung the whole frame's red twice at MGMT 66 s (judged on fd1fd53). Crumple, the ghost hands and the roll are as big.
  woah: { tricks: ['screen', 'crumple', 'ghost', 'roll', 'forever', 'limit'], fond: { crumple: 1.1, ghost: 0.9, roll: 0.9, screen: 0.4 }, gap: [24, 40], least: 5.5,
    fits: (id, G, S) => S[OFF['surf.kind']] < 0.5 && !G.pattern.stencil && (G.pattern.group !== 'film' || id === 'ghost' || id === 'screen' || id === 'roll') && !((id === 'screen' || id === 'limit' || id === 'forever') && fineness(S) > 2.45) },
  pace: { bars: [8, 6, 4, 3, 2], morph: [3.2, 6.5], most: 15 },
  motion: { len: [10, 16], morph: [4.5, 7], xforms: { crank, bleed, feed, fill }, xform: 'crank', keep: ['crank', 'bleed', 'feed', 'fill'], front: true },
  hear: { pulse: 1.25, melody: 0.8, tone: 0.3, harmony: 0.5, lung: 0.5, threshold: 0.3 },
};
