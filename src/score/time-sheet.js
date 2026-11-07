// What a frame's time program is told. frame() calls this once a frame: a gesture wearing nothing from moves/time.js costs one look at G.moves and R.timeOn stays false.
// The table is the sheet at 48 other moments, as a difference from now: fillSlot and the song's camera at each, so it's as pure as the rest of the frame, and no frame is kept anywhere.
//   A move or a hand-picked pattern says what it wants through sheet(want, m, c), c being { t, tReal, st, score, edits, G, aspect }:
//     want.map 'sweep' | 'target' | 'wave' | 'spiral' | 'cells', want.bands, want.D (seconds of delay end to end, negative for the future), want.now (where along the map no delay is, 0..1), want.cx, cy, ang, reach, wave (frequency), wavePh
//     want.ghost { slide, shares, capsules: [[ax, ay, bx, by, r]] }, want.fringe { amp, shares, turn, size, bumps: [[x, y, rx, ry, a]] }, want.snakes { amt, dark, light, way, along, across }
import { OFF, SLOT_FLOATS, FRAME, FAMILIES } from '../pattern/layout.js';
import { fillSlot } from './slot.js';
import { writeHear } from './hear.js';
import { MOVES } from './moves/index.js';
import { XFORMS } from './xform/index.js';
import { T_N, T_B, T_C, T_R, T_G, T_ALL, CAPS, BUMPS } from '../gl/chunks/time.js';

const now = new Float32Array(SLOT_FLOATS), tmp = new Float32Array(SLOT_FLOATS), T = new Float32Array(T_ALL * 4);
const Fh = new Float32Array(FRAME.hear * 4 + 40), Hm = FRAME.hear * 4;
const PH = Array.from({ length: FAMILIES }, (_, i) => OFF[`f${i}.ph`]);
const MAPS = { sweep: 1, target: 2, wave: 3, spiral: 4, cells: 5 };
const MOSTLY = { sweep: 0.5, target: 0, wave: 0.5, spiral: 0, cells: 0.5 };

// The song's camera as a similarity: what takes where it is now to where it was at that moment.
function hearRel(out, st, score, edits, tk, tRealK, c0) {
  Fh.fill(0, Hm, Hm + 8);
  Fh[FRAME.focus * 4] = st.F[FRAME.focus * 4]; Fh[FRAME.focus * 4 + 1] = st.F[FRAME.focus * 4 + 1];
  writeHear({ t: tk, F: Fh, G: st.G }, score, edits, tRealK, st.songHx ?? 1);
  const z = Math.log((1 + c0[0]) / (1 + Fh[Hm])), a = Fh[Hm + 1] - c0[1], co = Math.cos(a) * Math.exp(z), si = Math.sin(a) * Math.exp(z);
  out[0] = z; out[1] = a; out[2] = Fh[Hm + 2] - (co * c0[2] - si * c0[3]); out[3] = Fh[Hm + 3] - (si * c0[2] + co * c0[3]);
}

const h = [0, 0, 0, 0], hc = [0, 0, 0, 0];
function table(want, st, score, edits, tReal, phiOf, walkT, G, t) {
  const D = want.D ?? 0, n0 = want.now ?? MOSTLY[want.map] ?? 0, hasH = score.hear && score.hearNow > 0;
  const fill = (out, tt) => fillSlot(out, G, tt, G.pattern, { phi: phiOf(G, tt), uT: walkT ? walkT(tt) : undefined });
  fill(now, t);
  const s = now[OFF.scale], r = now[OFF.rot], tx = now[OFF.tx], ty = now[OFF.ty], cr = Math.cos(r), sr = Math.sin(r);
  if (hasH) for (let i = 0; i < 4; i++) hc[i] = st.F[Hm + i];
  for (let k = 0; k < T_N; k++) {
    const e = k / (T_N - 1), tau = D * (e - n0), off = (T_B + 2 * k) * 4;
    if (!tau) { T.fill(0, off, off + 8); continue; }
    const tk = t - tau;
    fill(tmp, tk);
    const sk = tmp[OFF.scale], z2 = Math.log(s / sk), a2 = r - tmp[OFF.rot];
    const dx = s * (cr * (tmp[OFF.tx] - tx) - sr * (tmp[OFF.ty] - ty)), dy = s * (sr * (tmp[OFF.tx] - tx) + cr * (tmp[OFF.ty] - ty));
    let x = z2, y = a2, u = dx, v = dy;
    if (hasH) {
      hearRel(h, st, score, edits, st.t - tau, tReal - tau, hc);
      const zz = Math.exp(z2), ca = Math.cos(a2) * zz, sa = Math.sin(a2) * zz;
      x += h[0]; y += h[1]; u += ca * h[2] - sa * h[3]; v += sa * h[2] + ca * h[3];
    }
    T[off] = x; T[off + 1] = y; T[off + 2] = u; T[off + 3] = v;
    for (let i = 0; i < FAMILIES; i++) T[off + 4 + i] = tmp[PH[i]] - now[PH[i]];
  }
}

export function timeSheet(st, score, R, edits, tReal, phiOf, walkT) {
  R.timeOn = false;
  // A pattern picked by hand: when its trick starts is read while the flight into it is still on, and its program is built meanwhile. Read on the landing, the flight had already gone, so it was taken from the click, and the whole trick came on in that one frame (a pop of 80 to 110 /255, time.wave and time.fringe).
  const h = score.handover, to = st.to;
  if (h?.wall && to && to !== h.G && to.pattern.time && to._timeBegin == null) { handBegin(to, score); R._wantTime?.(0); }
  const G = st.from ?? st.G, xf = st.kind && XFORMS[st.kind]?.time;
  if (xf) { T.fill(0, 0, T_B * 4); xf(T, st); R.timeT = T; R.timeOn = true; }
  let m = G.pattern.time ?? null;
  if (G.moves) for (const w of G.moves) if (MOVES[w.id]?.sheet) { if (w.woah) { if (st.t >= w.from) m = w; continue; } m = w; break; }      // src/score/woah.js: a gesture can wear one after another. Each runs out in its own time, and the next takes over when it starts
  if (!m || xf) return;
  const mv = MOVES[m.id];
  if (!mv?.sheet) return;
  const t = st.t, aspect = R.canvas ? R.canvas.width / R.canvas.height : 16 / 9;
  // A transformation under way takes it down, so what's flying arrives as itself. Picked by hand, it waits for what's flying it in.
  const out = st.kind ? 1 - Math.min(1, st.x / 0.5) : 1;
  const want = {};
  mv.sheet(want, m, { t, tReal, st, score, edits, G, aspect, fade: out * out * (3 - 2 * out), hand: m === G.pattern.time, begin: handBegin(G, score), phi: phiOf(G, t) });
  if (want.echo) writeEcho(want.echo, st, score, edits, tReal, phiOf, walkT, G, t);
  if (!want.map && !want.ghost && !want.fringe && !want.snakes) return;
  T.fill(0, 0, T_B * 4);
  if (want.map) {
    T[0] = MAPS[want.map]; T[1] = want.bands ?? 0; T[2] = want.wavePh ?? 0;
    const a = want.ang ?? 0, ca = Math.cos(a), sa = Math.sin(a);
    T[4] = want.cx ?? 0; T[5] = want.cy ?? 0; T[6] = want.map === 'spiral' ? want.wind ?? 1 : ca; T[7] = want.map === 'spiral' ? want.arms ?? 1 : sa;
    if (want.map === 'cells') T[10] = a;
    T[8] = want.reach ?? (want.map === 'target' ? Math.hypot(aspect, 1) : Math.abs(aspect * ca) + Math.abs(sa)); T[9] = want.wave ?? 2;
    table(want, st, score, edits, tReal, phiOf, walkT, G, t);
  }
  const g = want.ghost;
  if (g) {
    const caps = g.capsules, n = Math.min(caps.length, CAPS);
    T[12] = g.slide ?? 0; T[13] = n; T[14] = g.turn ?? 0; T[15] = g.zoom ?? 0;
    if (g.about) { T[36] = g.about[0]; T[37] = g.about[1]; }
    for (let i = 0; i < FAMILIES; i++) T[16 + i] = g.shares?.[i] ?? 0;
    for (let i = 0; i < n; i++) { const c = caps[i], o = (T_C + i) * 4; T[o] = c[0]; T[o + 1] = c[1]; T[o + 2] = c[2]; T[o + 3] = c[3]; T[T_R * 4 + i] = c[4]; }
  }
  const f = want.fringe;
  if (f) {
    const b = f.bumps, n = Math.min(b.length, BUMPS);
    T[20] = f.amp; T[21] = n; T[22] = f.turn ?? 0; T[23] = f.size ?? 1;
    for (let i = 0; i < FAMILIES; i++) T[24 + i] = f.shares[i] ?? 0;
    for (let i = 0; i < n; i++) { const c = b[i], o = (T_G + 2 * i) * 4; T[o] = c[0]; T[o + 1] = c[1]; T[o + 2] = c[2]; T[o + 3] = c[3]; T[o + 4] = c[4]; }
  }
  const k = want.snakes;
  if (k) { T[28] = k.amt; T[29] = k.dark ?? 0.1; T[30] = k.light ?? 0.5; T[31] = k.way ?? 0; T[32] = k.along; T[33] = k.across; }
  R.timeT = T; R.timeOn = true;
}

// A copy of the sheet as it was a moment ago, XOR-ed on top (the hand's moire: uF[7]). It needs no time program, and where nothing's moved the two agree, so all that shows is a small turn of its own and what's moved since.
function writeEcho(e, st, score, edits, tReal, phiOf, walkT, G, t) {
  const fill = (out, tt) => fillSlot(out, G, tt, G.pattern, { phi: phiOf(G, tt), uT: walkT ? walkT(tt) : undefined });
  fill(now, t); fill(tmp, t - e.lag);
  const F = st.F, So = FRAME.sheetOfs * 4;
  // A point of the sheet that's at p now was at rot(now - then) p a moment ago, near enough. Never less of a turn than its own: at none at all the XOR is solid black
  F[So] = tmp[OFF.tx] - now[OFF.tx]; F[So + 1] = tmp[OFF.ty] - now[OFF.ty]; F[So + 2] = e.turn + Math.abs(tmp[OFF.rot] - now[OFF.rot]); F[So + 3] = e.amt;
}

// When a hand-picked pattern has finished arriving: what it's picked by flies for a while first.
function handBegin(G, score) {
  if (G._timeBegin == null) { const h = score.handover; G._timeBegin = G.t0 + (h && h.G !== G && h.wall ? h.D : 0); }
  return G._timeBegin;
}
