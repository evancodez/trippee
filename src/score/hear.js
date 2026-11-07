// How hard the picture follows the song: everything the owner asked for by saying it wasn't nearly reactive enough. A layer over the film, on the song's own seconds, worked out once when the film's composed and read at
// any moment, so frame() stays a pure function of t and flipping it (the h key, ?hear=0) composes nothing and costs nothing. With score.hearNow at 0 nothing here writes anything, and the film is exactly the film.
//
// It works on the whole sheet, as a camera and a few lenses in front of everything (FRAME.hear, src/gl/chunks/main.js), so it goes on answering through every transformation, every hero and every world:
//   BEATS    on each strong beat the sheet pushes toward you and blooms from the middle, falling into the beat and easing away, and a ring runs out. Chosen per section (react.js), gentler on a soft song, never none
//   TUNE     high notes lift the sheet and low ones sink it as you hear them, and each note starts a bulge at its pitch, walking along a stave
//   TONE     a brighter sound leans the sheet and tightens the bloom. A dark one spreads it. (The line density it also moves is in song-sheet.js.)
//   MOMENTS  every jump in the song, section edge, arrival, stop, landing and big chord gets an answer, whether or not the pattern changes. A build winds up and the arrival lets go. Falls recede
//   SHAPE    sections go by how big they are and how often they've been: a chorus coming back is bigger than last time
//   LOUDNESS louder is bigger and faster: the sizes, a sway that picks up speed, and the flow's own clock (flowLag; hearRates)
import { clamp, lerp, smoother } from './curves.js';
import { FRAME } from '../pattern/layout.js';
import { hearing } from './flags.js';

const HZ = 60, ATTACK = 0.14, HIT_ATTACK = 0.45, LAND_LATE = 0.32;      // how far ahead of a note its bulge starts to come up; how long a moment takes to arrive

// All first guesses against what the eye sees. Sizes: zoom in natural logs, shifts and lens radii in picture units (the frame's half height is 1).
export const SIZE = {
  push: 0.13, bloom: 0.3, bloomR: 1.1,      // a full strong beat
  hitPush: 0.2, hitBloom: 0.3, hitTurn: 0.07,     // a full moment
  windPull: 0.14, windPinch: 0.26,          // the top of a build
  fallPull: 0.1,                            // a falling moment
  lift: 0.15, note: 0.3, noteR: 0.6,      // the tune: per 6 semitones, and each note
  lean: 0.05,                               // the tone
  ringBeat: 0.008, ringHit: 0.022, ringSpeed: 1.15, ringLife: 1.5,
  swayShift: 0.055, swayTurn: 0.035,        // loud
};

const smooth = (a, r) => {
  const out = Float32Array.from(a), k = Math.exp(-1 / Math.max(r, 1e-3));
  for (let i = 1; i < out.length; i++) out[i] = k * out[i - 1] + (1 - k) * out[i];
  for (let i = out.length - 2; i >= 0; i--) out[i] = k * out[i + 1] + (1 - k) * out[i];
  return out;
};
const meanOf = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sdOf = a => { const m = meanOf(a); return Math.sqrt(meanOf(a.map(v => (v - m) ** 2))) || 1; };
const skew = u => smoother(Math.pow(clamp(u), 1.7));      // sets off gently and is going fastest late, so the fastest frame's near the beat. It still stops on it

// ---------------------------------------------------------------- the song's moments
// tests/shotlist.mjs's jumps: how much each bar line changes the two bars after it against the two before, in each of five things, by the song's own spread. Then section edges, arrivals, stops and landings, and the big chords.
export function momentsOf(A, M, { hits = [] } = {}) {
  const bars = Array.from(A.bars ?? []), N = bars.length, dur = A.duration, out = [];
  if (N < 8) return out;
  const bar = M.bar || (bars[N - 1] - bars[0]) / Math.max(N - 1, 1) || 2, fps = A.fps;
  const at = (a, t) => (a ? a[clamp(Math.round(t * fps), 0, a.length - 1)] || 0 : 0);
  const per = {}, WEIGHT = { loud: 1, bright: 0.5, bass: 0.7, perc: 0.5, voiced: 0.3 };
  for (const k in WEIGHT) per[k] = bars.map((t, i) => { const t1 = bars[i + 1] ?? t + bar; let s = 0, c = 0; for (let q = t; q < t1; q += 0.1) { s += at(A[k], q); c++; } return s / Math.max(c, 1); });
  const span = (a, i, j) => meanOf(a.slice(Math.max(0, i), Math.max(0, j)));
  const J = {};
  for (const k in WEIGHT) { const v = bars.map((_, i) => span(per[k], i, i + 2) - span(per[k], i - 2, i)), sd = sdOf(v); J[k] = v.map(x => x / sd); }
  const score = bars.map((t, i) => {
    let up = 0, dn = 0;
    for (const k in WEIGHT) { up += WEIGHT[k] * Math.max(0, J[k][i]); dn += (k === 'bright' ? 0.4 : WEIGHT[k]) * Math.max(0, -J[k][i]); }
    return { i, t, s: Math.max(up, dn), sign: up >= dn ? 1 : -1 };
  });
  const peaks = score.filter(x => x.t > 2 * bar && x.t < dur - 2).filter(x => { for (let k = -4; k <= 4; k++) if (k && score[x.i + k]?.s > x.s) return false; return true; });
  const segs = (A.segments ?? []).slice(1), arrivals = M.arrivals ? M.arrivals(0.3) : [], marks = [...segs.map(s => s.t0), ...arrivals.map(a => a.t)];
  for (const p of peaks) {
    if (p.s < 1) continue;
    let t = p.t;
    if (p.sign < 0) {
      let best = p.i, drop = 0;
      for (let k = Math.max(1, p.i - 2); k <= Math.min(N - 1, p.i + 2); k++) { const v = per.loud[k - 1] - per.loud[k]; if (v > drop) { drop = v; best = k; } }
      t = bars[best];
    } else {
      const m = marks.reduce((b, x) => (Math.abs(x - p.t) < Math.abs(b - p.t) ? x : b), Infinity);
      if (Math.abs(m - p.t) <= 2 * bar) t = m;
    }
    out.push({ t, s: clamp(0.3 + (p.s - 1) / 4.5), sign: p.sign, kind: p.sign > 0 ? 'jump' : 'falls' });
  }
  for (const s of segs) out.push({ t: s.t0, s: 0.42, sign: 1, kind: 'section' });
  for (const a of arrivals) out.push({ t: a.t, s: clamp(0.25 + 0.75 * a.a), sign: 1, kind: 'arrival' });
  for (const r of M.rests ?? []) { out.push({ t: r.a, s: 0.5, sign: -1, kind: 'stop' }); out.push({ t: r.b, s: 0.9, sign: 1, kind: 'lands', rest: r }); }
  for (const h of hits) out.push({ t: h.t, s: clamp(h.s ?? 0.7), sign: 1, kind: 'cut' });
  // A big chord: where the harmony goes far, and has stayed a while. Only one every eight bars or so: most chords aren't an event.
  let last = null, lastBig = -1e9;
  for (const r of M.runs ?? []) {
    if (r.t1 - r.t0 < 1.5 * (M.beat || 0.5)) continue;
    if (last) { const [ax, ay] = M.place(last.c), [bx, by] = M.place(r.c), far = Math.hypot(ax - bx, ay - by); if (far > 1.1 && r.t0 - lastBig > 7.5 * bar) { out.push({ t: r.t0, s: clamp(0.08 + 0.13 * far, 0, 0.3), sign: 1, kind: 'chord' }); lastBig = r.t0; } }
    last = r;
  }
  // A fill: the drums bunching up in the last beat before a four-bar line.
  for (let i = 4; i < N; i += 4) {
    const t = bars[i], w = (M.beat || 0.5);
    const inFill = (at(A.perc, t - 0.25 * w) + at(A.perc, t - 0.5 * w) + at(A.perc, t - 0.75 * w)) / 3, before = (at(A.perc, t - 2 * w) + at(A.perc, t - 2.5 * w) + at(A.perc, t - 3 * w)) / 3;
    if (inFill > before * 1.6 && inFill > 0.3) out.push({ t, s: 0.32, sign: 1, kind: 'fill' });
  }
  // Moments within a bar of each other are one, the strongest. A landing stays a landing.
  out.sort((a, b) => b.s - a.s);
  const kept = [];
  for (const m of out) if (m.t > 0.5 && m.t < dur && !kept.some(k => Math.abs(k.t - m.t) < bar * 0.9 && (k.sign === m.sign || k.kind === 'stop' || m.kind === 'stop'))) kept.push(m);
  kept.sort((a, b) => a.t - b.t);
  return kept;
}

// ---------------------------------------------------------------- the tables
export function buildHear(A, R, { hits = [] } = {}) {
  const M = R.M, dur = A.duration, n = Math.ceil(dur * HZ) + 2, fps = A.fps, bar = M.bar || 2, beat = M.beat || 0.5, C = R.C ?? (t => t);
  const at = (a, t) => (a ? a[clamp(Math.round(t * fps), 0, a.length - 1)] || 0 : 0);
  const rd = (arr, t) => { const x = clamp(C(t) * R.hz, 0, R.n - 1.001), i = Math.floor(x); return arr[i] + (arr[i + 1] - arr[i]) * (x - i); };
  const e = new Float32Array(n), raw = new Float32Array(n);
  for (let i = 0; i < n; i++) { e[i] = rd(R.energy, i / HZ); raw[i] = at(A.E || A.loud, i / HZ); }

  // The ladder: how big a section gets to be. Its rank among the song's kinds of section, and how many times it's been.
  const segs = A.segments?.length ? A.segments : [{ t0: 0, t1: dur, label: 'A' }], seen = new Map(), labels = new Map();
  for (const s of segs) { let q = 0, c = 0; for (let t = s.t0; t < s.t1; t += 0.5) { q += at(A.E || A.loud, t); c++; } const L = labels.get(s.label) ?? { e: 0, c: 0 }; L.e += q; L.c += c; labels.set(s.label, L); }
  const order = [...labels.keys()].sort((a, b) => labels.get(a).e / Math.max(labels.get(a).c, 1) - labels.get(b).e / Math.max(labels.get(b).c, 1));
  const rank = l => (order.length > 1 ? order.indexOf(l) / (order.length - 1) : 0.5);
  const rungs = segs.map((s, k) => { const v = seen.get(s.label) ?? 0; seen.set(s.label, v + 1); return { t0: s.t0, label: s.label, visit: v, size: Math.min(1.7, lerp(0.72, 1.18, rank(s.label)) * (1 + 0.16 * v) * (k === 0 ? 0.85 : 1)) }; });
  const climb = new Float32Array(n);
  for (let i = 0, k = 0; i < n; i++) {
    const t = i / HZ;
    while (k + 1 < rungs.length && rungs[k + 1].t0 <= t + bar) k++;     // k is the section you're in, or the one you're in the bar before
    const b = rungs[k], a = rungs[Math.max(0, k - 1)], x = smoother((t - (b.t0 - bar)) / bar);
    climb[i] = lerp(a.size, b.size, x);
  }
  const big = i => lerp(0.42, 1.28, Math.pow(clamp(e[clamp(i, 0, n - 1)]), 1.3)) * climb[clamp(i, 0, n - 1)];

  // ---- the strong beats: the sheet falls into each, is at the top of its push on it, and eases away until the next one sets off
  const P = [];
  (R.pulses ?? []).forEach((t, k) => {
    const rest = M.restAt?.(t);
    if (rest && t < rest.b - 0.1) return;
    const present = clamp((at(A.E || A.loud, t) - 0.03) / 0.15), when = rest ? rest.b : t;
    const a = (0.3 + 0.7 * clamp(R.depths?.[k] ?? 0.6)) * (R.mains?.[k] === false ? 0.72 : 1) * present * big(Math.round(when * HZ));
    if (a > 0.01 && (!P.length || when - P.at(-1).t > 0.3)) P.push({ t: when, a: Math.min(a, 1.3) });
  });
  const pump = new Float32Array(n);
  const K = [];       // knots of a smooth curve: [t, value, skewed]
  for (let k = 0; k < P.length; k++) {
    const p = P[k], L = k ? p.t - P[k - 1].t : 2, atk = clamp(0.36 * L, 0.2, 0.55);
    K.push([p.t - atk, 0, false]); K.push([p.t, p.a, true]);
  }
  for (let k = 1, i = 0; k < K.length; k++) {
    const [ta, va] = K[k - 1], [tb, vb, up] = K[k];
    if (tb <= ta) continue;
    for (i = Math.max(0, Math.ceil(ta * HZ)); i < n && i / HZ <= tb; i++) {
      const u = (i / HZ - ta) / (tb - ta);
      if (up) pump[i] = lerp(va, vb, skew(u));
      else pump[i] = lerp(va, vb, smoother(Math.min(1, (i / HZ - ta) / Math.min(tb - ta, 2.4))));      // a long gap doesn't take forever to let go
    }
  }

  // ---- the moments
  const moments = momentsOf(A, M, { hits }), hit = new Float32Array(n), fall = new Float32Array(n), turn = new Float32Array(n), wind = new Float32Array(n), slow = new Float32Array(n), rings = [];
  const add = (arr, m, atk, dec, k = 1) => {
    const i0 = Math.max(0, Math.floor((m.t - atk) * HZ)), i1 = Math.min(n - 1, Math.ceil((m.t + dec) * HZ));
    for (let i = i0; i <= i1; i++) { const x = i / HZ - m.t; arr[i] += k * (x < 0 ? smoother((x + atk) / atk) : 1 - smoother(x / dec)); }
  };
  // Each time a kind of section comes back its first bar is bigger than the last time, whatever the jump was. Disclosure's four drops are the same music.
  const visitAt = t => { let v = 0; for (const r of rungs) { if (r.t0 <= t + bar * 0.5) v = r.visit; else break; } return v; };
  let side = 1;
  for (const m of moments) {
    const i = Math.round(m.t * HZ), sized = Math.min(1.5, m.s * lerp(0.5, 1.15, clamp(e[clamp(i, 0, n - 1)])) * (1 + 0.22 * visitAt(m.t)));
    m.size = sized;
    if (m.sign > 0) {
      // A rest has been still, right up to the sound: what lands, lands as you hear it. Everything else has arrived by then.
      const on = m.kind === 'lands' ? { t: m.t + LAND_LATE } : m, atk = m.kind === 'lands' ? LAND_LATE + 0.04 : HIT_ATTACK;
      add(hit, on, atk, Math.max(1.5 * bar, 1.2), sized);
      add(turn, on, atk, Math.max(1.5 * bar, 1.2), sized * (side = -side));
      if (sized > 0.25) rings.push({ t: m.t, a: SIZE.ringHit * clamp(sized, 0.2, 1.4) });
    } else add(fall, m, Math.min(0.5, beat), Math.max(1.5 * bar, 1.2), sized);
  }
  for (const p of P) if (p.a > 0.55) rings.push({ t: p.t, a: SIZE.ringBeat * p.a });
  rings.sort((a, b) => a.t - b.t);

  // A build. From the last low in the song's size, or a few bars, up to the arrival: it winds up, hangs in the last beat, and lets go on the hit.
  const eSmooth = smooth(raw, HZ * 0.7), eTop = Math.max(...eSmooth.filter((_, i) => i % 30 === 0), 1e-3);
  for (const m of moments) {
    if (m.sign < 0 || m.s < 0.42 || m.kind === 'section' || m.kind === 'chord' || m.kind === 'fill') continue;
    const iHit = Math.round(m.t * HZ);
    let i0 = iHit, low = eSmooth[clamp(iHit, 0, n - 1)];
    const reach = Math.max(0, iHit - Math.round(16 * bar * HZ));
    for (let i = iHit; i >= reach; i -= 6) { if (eSmooth[i] < low) { low = eSmooth[i]; i0 = i; } }
    if (iHit - i0 < 2 * bar * HZ) i0 = Math.max(0, iHit - Math.round(4 * bar * HZ));
    const s = clamp(m.s * (1 + 0.15 * visitAt(m.t))), hang = Math.max(0.2, beat), let_ = Math.min(0.35, beat);
    for (let i = i0; i <= iHit + let_ * HZ && i < n; i++) {
      const t = i / HZ;
      if (i <= iHit) {
        const x = clamp((i - i0) / Math.max(iHit - i0, 1));
        wind[i] = Math.max(wind[i], s * Math.pow(x, 2.5));
        slow[i] = Math.max(slow[i], s * (0.55 * Math.pow(x, 1.5) + 0.35 * smoother((t - (m.t - hang)) / hang)));       // .1 of its speed by the last beat, on the biggest
      } else wind[i] = Math.max(wind[i], s * (1 - smoother((t - m.t) / let_)));
    }
  }
  wind.set(smooth(wind, HZ * 0.03));

  // The flow's own clock against the song's, in seconds. It falls behind through a build, and pays it back after the hit; and it runs a little quicker where the song's just got louder, and slower where it's just got quieter.
  const lag = new Float32Array(n);
  { let L = 0, most = 0;
    for (let i = 1; i < n; i++) {
      let r = 1 - clamp(slow[i], 0, 0.9);
      if (L < 0 && slow[i] < 0.02) r = 1 + Math.min(0.9, -L * 1.2);     // paying back
      if (L < -4.5 && r < 1) r = 1;
      L = Math.min(0, L + (r - 1) / HZ);
      lag[i] = L; most = Math.min(most, L);
    }
  }
  const quick = new Float32Array(n);
  { let I = 0; for (let i = 0; i < n; i++) { I += (lerp(0.65, 1.55, clamp(e[i])) - 1) / HZ; quick[i] = I; } }
  const quickSlow = smooth(quick, HZ * 6);
  const flowLag = smooth(lag.map((v, i) => v + clamp(quick[i] - quickSlow[i], -1.6, 1.6)), HZ * 0.08);

  // ---- the tune: notes, at their pitch, walking along a stave. A note starts where the pitch has settled somewhere new, or the voice has come in.
  const notes = [];
  { let held = null, lastT = -1;
    for (let i = 0; i < n; i += 2) {
      const t = i / HZ, v = at(A.voiced, t);
      if (v < 0.4) { held = null; continue; }
      const m = at(A.m, t), later = at(A.m, t + 0.07);
      if (held != null && Math.abs(m - held) < 1.5) continue;
      if (Math.abs(later - m) > 0.7 || t - lastT < 0.24) continue;
      held = m; lastT = t;
      const s = 0.55 + 0.45 * clamp(Math.max(at(A.onset, t), at(A.onset, t + 0.03), at(A.onset, t - 0.03)));
      notes.push({ t, y: clamp(m / 6 * 0.72, -0.8, 0.8), s });
    }
  }
  const bars = Array.from(A.bars ?? []), stave = t => { let lo = 0, hi = bars.length - 1; if (hi < 0) return 0; while (lo < hi) { const q = (lo + hi + 1) >> 1; if (bars[q] <= t) lo = q; else hi = q - 1; } return (lo % 2 + clamp((t - bars[lo]) / bar)) / 2; };
  for (const q of notes) q.x = (stave(q.t) * 2 - 1) * 1.25;

  // ---- how it goes about things at this loudness: the sway picks up speed, and the tune leads where the rest is quiet
  const sway = new Float32Array(n), swayAmt = new Float32Array(n), lead = new Float32Array(n);
  { let q = 0; for (let i = 0; i < n; i++) { const v = clamp(e[i]); q += lerp(0.05, 0.95, Math.pow(v, 1.5)) / HZ; sway[i] = q; swayAmt[i] = lerp(0.12, 1.15, v * v) * climb[i]; lead[i] = lerp(1.45, 0.85, clamp(v * 1.2)); } }

  // A rest really rests: everything holds where it was as the band stopped, and comes back to what it should be over the moment the sound's back. The landing's in the moments.
  const hold = new Float32Array(n);
  for (const r of M.rests ?? []) {
    const ia = Math.round(r.a * HZ), ib = Math.round((r.b - 0.03) * HZ), ic = Math.min(n - 1, ib + Math.round((LAND_LATE + 0.03) * HZ));
    if (ia < 0 || ib <= ia) continue;
    for (const T of [pump, hit, fall, turn, wind, swayAmt]) {
      const v0 = T[ia], v1 = T[ic];
      for (let i = ia; i <= ic; i++) T[i] = i <= ib ? v0 : lerp(v0, v1, smoother((i - ib) / Math.max(ic - ib, 1)));
    }
    { const v0 = sway[ia]; for (let i = ia; i <= ib; i++) sway[i] = v0; const by = sway[ib + 1] - v0; for (let i = ib + 1; i < n; i++) sway[i] -= by; }
    for (let i = Math.max(0, ia - 6); i < n && i <= ib + 6; i++) hold[i] = smoother((i - ia + 6) / 6) * smoother((ib + 6 - i) / 6);
  }
  // Nothing stops or starts in one frame, however a rest fell.
  if (M.rests?.length) for (const T of [pump, hit, fall, turn, wind]) T.set(smooth(T, HZ * 0.025));

  return { hz: HZ, n, dur, pump, hit, fall, turn, wind, flowLag, notes, rings, sway, swayAmt, lead, climb, hold, moments, beats: P, e };
}

// How far a hero can turn the song down, while this is up.
export const HEAR_FLOOR = 0.9;
const rt = (H, arr, t) => { const x = clamp(t * HZ, 0, H.n - 1.001), i = Math.floor(x); return arr[i] + (arr[i + 1] - arr[i]) * (x - i); };

export const flowLagAt = (H, t) => rt(H, H.flowLag, t);

// How fast a gesture's flow runs, by how loud the song is while it's on. By the song's own loudness, so a soft song has a loud part too. A gesture landing somewhere timed by hand keeps its clock. Set once, when a film's composed with this on.
export function hearRates(film, H) {
  for (const G of film.gestures) {
    if (G.hero || G.t1 - G.t0 > 3000) continue;
    let s = 0, c = 0;
    for (let t = G.t0; t < Math.min(G.t1, H.dur); t += 0.5) { s += rt(H, H.e, t); c++; }
    G.hearRate = lerp(0.6, 1.35, Math.pow(clamp(c ? s / c : 0.5), 1.4));
  }
}

// However much a beat and a moment pile up, a lens can't turn the sheet inside out, and a push can't leave the pattern. Nearly straight until it's close to the top.
const soft = (x, top) => top * (1 - Math.exp(-Math.max(x, 0) / top));
const Hm = FRAME.hear * 4;
export function hearSheet(st, score, edits, tReal, hx = 1) {
  const H = score.hear, h = score.hearNow;
  if (!H || !(h > 0)) return;
  const F = st.F, t = tReal, G = st.G;
  let amt = h * (edits?.reactAmt ?? 1) * hx;
  if (score.songFades != null) amt *= 1 - smoother((st.t - score.songFades) / 3);
  if (!(amt > 0)) return;
  const W = score.world?.hear, calm = G.calm ? lerp(1, Math.max(G.calm, 0.6), smoother((st.t - G.t0) / 1.5) * smoother((G.t1 - st.t) / 1.5)) : 1;
  const lane = score.pulseLane ? 0.5 + 0.5 * score.pulseLane(st.t) : 1;
  const mP = (edits?.reactPulse ?? 1) * amt * (W?.pulse ?? 1) * calm * lane, mM = (edits?.reactMelody ?? 1) * amt * (W?.melody ?? 1), mT = (edits?.reactTone ?? 1) * amt * (W?.tone ?? 1);
  const mH = (0.75 * (edits?.reactPulse ?? 1) + 0.25 * (edits?.reactMelody ?? 1)) * amt * calm * (W?.pulse ?? 1);
  const R = score.heard, c = R?.C ? R.C(t) : t, tone = R ? rdR(R, R.tone, c) : 0, still = 1 - rt(H, H.hold, t);
  const pump = rt(H, H.pump, t), hit = rt(H, H.hit, t), fall = rt(H, H.fall, t), wind = rt(H, H.wind, t), turn = rt(H, H.turn, t), lead = rt(H, H.lead, t);
  const mel = R?.melNow ? rdR(R, R.melNow, c) : 0, sw = rt(H, H.sway, t), swA = rt(H, H.swayAmt, t) * amt;
  // The camera. Positive zoom: the picture larger. It's a real push, so the middle of the frame stays still and the corners run furthest.
  const z = soft(SIZE.push * pump * mP + SIZE.hitPush * hit * mH, 0.38) - SIZE.windPull * wind * mH - SIZE.fallPull * Math.min(fall, 1.4) * mH;
  const rot = SIZE.hitTurn * clamp(turn, -1.4, 1.4) * mH + SIZE.lean * tone * mT + SIZE.swayTurn * swA * Math.sin(0.61 * sw + 1.1);
  const lift = SIZE.lift * mel * lead * mM;
  const sx = SIZE.swayShift * swA * Math.sin(sw), sy = SIZE.swayShift * 0.6 * swA * Math.cos(0.83 * sw);
  F[Hm] = Math.exp(z) - 1; F[Hm + 1] = rot; F[Hm + 2] = -sx; F[Hm + 3] = -(lift + sy);
  // The bloom: from where the rings close, as tight as the sound's bright. A build pinches in; the hit bursts.
  const fx = F[FRAME.focus * 4], fy = F[FRAME.focus * 4 + 1];
  F[Hm + 4] = fx; F[Hm + 5] = fy;
  F[Hm + 6] = -soft(SIZE.bloom * pump * mP + SIZE.hitBloom * hit * mH, 0.55) + SIZE.windPinch * wind * mH;
  F[Hm + 7] = SIZE.bloomR * (1 - 0.22 * clamp(tone * Math.max(mT, 0.001) / Math.max(amt, 0.001), -1.5, 1.5));
  // The notes
  const N = H.notes;
  if (N.length && mM > 0) {
    let lo = 0, hi = N.length - 1;
    const ahead = t + ATTACK;
    while (lo < hi) { const q = (lo + hi + 1) >> 1; if (N[q].t <= ahead) lo = q; else hi = q - 1; }
    for (let k = Math.max(0, lo - 2); k <= lo; k++) {
      const q = N[k], x = t - q.t;
      if (x < -ATTACK) continue;
      // Three lenses: a note gives its lens up to the third note after it, gone by then
      const next = N[k + 3]?.t ?? Infinity;
      const env = (x < 0 ? smoother((x + ATTACK) / ATTACK) : Math.exp(-x / 0.42)) * smoother((next - t) / 0.12);
      const off = Hm + 8 + (k % 3) * 4;
      F[off] = q.x + 0.08 * Math.sin(k); F[off + 1] = q.y; F[off + 2] = -SIZE.note * q.s * env * lead * mM * still; F[off + 3] = SIZE.noteR;
    }
  }
  // The rings. The hand's ripples fill from the front of the same block, and the song's from the back.
  const Rg = H.rings, Rp = FRAME.ripple * 4;
  if (Rg.length && mP + mH > 0 && !edits?.ripples) {
    let lo = 0, hi = Rg.length - 1;
    while (lo < hi) { const q = (lo + hi + 1) >> 1; if (Rg[q].t <= t) lo = q; else hi = q - 1; }
    for (let k = Math.max(0, lo - 3); k <= lo; k++) {
      const q = Rg[k], x = t - q.t;
      if (x < 0 || x > SIZE.ringLife) continue;
      const off = Rp + (7 - (k % 4)) * 4, v = x / SIZE.ringLife;
      F[off] = fx; F[off + 1] = fy; F[off + 2] = 0.08 + SIZE.ringSpeed * x; F[off + 3] = q.a * smoother(x / 0.12) * (1 - smoother(v)) * Math.max(mP, mH) * still;
    }
  }
}
const rdR = (R, arr, c) => { const x = clamp(c * R.hz, 0, R.n - 1.001), i = Math.floor(x); return arr[i] + (arr[i + 1] - arr[i]) * (x - i); };

// What's on when nobody's said (a test's shot). The picture has edits.hear, eased by the h key.
export const hearStart = () => (hearing.on ? 1 : 0);
