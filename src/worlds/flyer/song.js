// What Flyer hears: the drums and the guitars. Worked out once for a film, on the picture's clock, and read at any moment. docs/MODES.md, section 3.
//   HITS     the strong beats, the kick's: a hit pushes the cone out and knocks the plates out of register. Known ahead, so the cone draws back first.
//   SNARES   where a bar's snare falls: it knocks the other plate, the other way.
//   DRIVE    how far gone the sound is: edges go from round to square. A quiet verse has rolled the knob back.
//   WAVE     what the sound's shape is, as a triggered scope sees it, and every edge in the world is drawn with it.
//   FILLS    a drummer's fills, for The Fill: it runs across the frame on those hits and lands on the crash.
//   EDITIONS a new sheet comes up when the song moves somewhere new, through its own dots. A section that comes back wears what it wore.
//   THE WHOA the biggest arrival: the ring clock's held back, the edges go round, the par cans crawl to one point. On the downbeat it fires, and everything goes square.
import { evalTrack } from '../../score/curves.js';
import { beatClock } from '../../score/moves/surge.js';
import { reactAt } from '../../score/react.js';
import { EDITIONS } from './inks.js';

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const after = (list, t) => { let lo = 0, hi = list.length; while (lo < hi) { const m = (lo + hi) >> 1; if (list[m] <= t) lo = m + 1; else hi = m; } return lo; };      // the index of the first after t

const LOUD = [1, 5, 3, 6, 9, 2], QUIET = [0, 4, 8, 7];      // editions: the loud sections' and the quiet's
const RINGS_MOST = 1.3;     // a second
export function hearSong(score, A, M, whoaAt = null) {
  const time = score.time ?? (x => x), bar = M?.bar || 2;
  const P = Array.from(score.react?.pulses ?? []), mains = Array.from(score.react?.mains ?? []);
  const hits = P.map(time), power = hits.map((_, i) => (mains[i] === false ? 0.72 : 1));
  // Picture's seconds back to the song's, for what's on the song's clock.
  const dur = A.duration, HZ = 10, picture = new Float32Array(Math.ceil(dur * HZ) + 2);
  for (let i = 0; i < picture.length; i++) picture[i] = time(i / HZ);
  const songOf = t => { let lo = 0, hi = picture.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (picture[m] <= t) lo = m; else hi = m - 1; } return lo / HZ; };

  // The snares: of the beats, those the sidecar says have a body and a rattle. Failing that, the 2 and the 4.
  const beats = Array.from(A.beats ?? []), sn = A.x?.snare, downs = Array.from(A.barBeats ?? []), first = downs[0] ?? 0, meter = A.meter || 4, snares = [];
  beats.forEach((b, i) => {
    const on = ((i - first) % meter + meter) % meter, back = meter === 4 && (on === 1 || on === 3);
    if (sn ? sn[i] > 0.55 && !hits.some(h => Math.abs(h - time(b)) < 0.08) : back) snares.push(time(b));
  });
  // The whoa: where the song gets furthest with the most behind it.
  const arrive = (M?.arrivals?.(0.3) ?? []).filter(a => a.t > 16 && a.t < dur - 8)[0];
  const whoa = arrive ? { t: whoaAt ?? time(arrive.t), song: arrive.t, a: arrive.a, wind: 6 * bar } : null;

  // The ring clock: a surge on every strong beat, or every other if that's too fast. Held back into the whoa.
  const med = (() => { const g = hits.slice(1).map((h, i) => h - hits[i]).sort((a, b) => a - b); return g[g.length >> 1] || 1; })();
  const every = med * RINGS_MOST >= 1 ? 1 : 2;
  let ring = hits.filter((_, i) => i % every === 0);
  if (whoa) ring = ring.filter(h => !(h > whoa.t - 2 * bar && h < whoa.t - 0.02));
  const track = ring.length >= 2 ? beatClock(ring, { lead: 2, coast: 4 }) : null;
  const clock = t => (track ? evalTrack(track, t) : t * 0.9);

  const frame = (a, hz, t) => (a?.length ? a[clamp(Math.round(t * hz), 0, a.length - 1)] : null);
  const clip = A.x?.clip, loud = A.E;
  const driveRaw = t => {
    const s = songOf(t), c = clip ? frame(clip.value, clip.hz, s) : null, e = frame(loud, A.fps, s) ?? 0.5;
    return c != null ? clamp(0.65 * c + 0.45 * e) : clamp(e);
  };
  // Eased over about a bar, and worked out ahead so that a seek gets the same number: a knob's turned, it doesn't jump.
  const DZ = 12, nD = Math.ceil((dur + 8) * DZ), drive = new Float32Array(nD);
  { const raw = new Float32Array(nD); for (let i = 0; i < nD; i++) raw[i] = driveRaw(i / DZ); let v = raw[0]; const k = 1 - Math.exp(-1 / (DZ * 0.9)); for (let i = 0; i < nD; i++) { v += (raw[i] - v) * k; drive[i] = v; } v = drive[nD - 1]; for (let i = nD - 1; i >= 0; i--) { v += (drive[i] - v) * k; drive[i] = v; } }
  const driveAt = t => {
    const x = clamp(t * DZ, 0, nD - 1.001), i = Math.floor(x);
    let d = drive[i] + (drive[i + 1] - drive[i]) * (x - i);
    if (whoa) {
      const u = (t - (whoa.t - whoa.wind)) / whoa.wind;
      if (u > 0 && u < 1) d *= 1 - smooth(u);
      else if (u >= 1) { const a = t - whoa.t; d = Math.max(d, a < 0.18 ? smooth(a / 0.18) : Math.max(0, 1 - (a - 0.18) / (8 * bar))); }
    }
    return d;
  };

  // The sheets. One for each kind of section, and another for it when it's been round again.
  const segs = (A.segments ?? []).filter(s => s.t1 - s.t0 > 2);
  const eOf = s => { let e = 0, n = 0; for (let q = s.t0; q < s.t1; q += 0.5) { e += frame(loud, A.fps, q) ?? 0; n++; } return e / Math.max(n, 1); };
  const mean = segs.length ? segs.reduce((x, s) => x + eOf(s), 0) / segs.length : 0.5, worn = new Map();
  let lo = 0, qu = 0;
  const plan = [{ t: 0, e: 0, D: 0 }];
  let last = 0;
  for (const s of segs) {
    const big = eOf(s) >= mean, had = worn.get(s.label) ?? { list: [], seen: 0 };
    if (!had.list.length) { for (let k = 0; k < 2; k++) had.list.push(big ? LOUD[lo++ % LOUD.length] : QUIET[qu++ % QUIET.length]); worn.set(s.label, had); }
    const e = had.list[had.seen++ % 2], at = time(s.t0);
    if (at - last < 10 || e === plan.at(-1).e) continue;
    plan.push({ t: at - 2 * bar, e, D: Math.max(3 * bar, 3) }); last = at;
    // Never long on one sheet.
    if (s.t1 - s.t0 > 34) { const e2 = had.list[had.seen % 2]; if (e2 !== e) { plan.push({ t: time((s.t0 + s.t1) / 2) - 2 * bar, e: e2, D: Math.max(3 * bar, 3) }); last = time((s.t0 + s.t1) / 2); } }
  }
  if (whoa) {
    // It fires into the loudest there is. The front gets there on the hit.
    const e = LOUD[0], at = whoa.t - 0.5 * bar, i = plan.findIndex(p => p.t > at - 4), out = plan.filter(p => !(p.t > at - 6 && p.t < at + 8));
    out.push({ t: at, e: plan[i]?.e === e ? LOUD[1] : e, D: 1.2 * bar });
    out.sort((a, b) => a.t - b.t);
    plan.length = 0; plan.push(...out);
    if (plan[0]?.t > 0) plan.unshift({ t: 0, e: 0, D: 0 });
  }
  let starts = plan.map(p => p.t);
  // A pattern that has a sheet it belongs on (a flame job's are fire) asks for it. It goes back to what the song was wearing after.
  const wear = (t0, t1, e, D) => { const k = Math.max(0, after(starts, t0) - 1), was = plan[k].e; if (was === e) return; const kept = plan.filter(p => p.t < t0 - D || p.t > t1); kept.push({ t: t0 - D, e, D }); kept.push({ t: t1 - D, e: was, D }); kept.sort((x, y) => x.t - y.t); plan.length = 0; plan.push(...kept); starts = plan.map(p => p.t); };
  const editionAt = t => {
    const k = Math.max(0, after(starts, t) - 1), p = plan[k], q = p.D > 0 ? clamp((t - p.t) / p.D) : 1;
    if (q >= 1) { return { a: p.e, b: p.e, x: 0, way: 0 }; }
    return { a: plan[Math.max(0, k - 1)].e, b: p.e, x: q, way: (k * 2.4) % 6.283 };
  };

  return { hits, power, snares, clock, driveAt, editionAt, wear, whoa, every, plan, songOf, bar, wave: A.x?.wave ?? null, fills: A.x?.fill?.runs ?? [], time, react: score.react };
}

// With no song: a band that doesn't know you're there. 104 bpm, 1 and 3, four bars of one sheet and four of another, and a knob someone's going up and down.
const BPM = 104, NO = 60 / BPM * 2, SHEETS = [1, 0, 5, 3, 4, 6, 2, 7, 9, 8];
export const noSong = {
  clockNone: true,
  hitAt: t => Math.floor(t / NO),
  driveAt: t => 0.5 + 0.5 * Math.sin(t * 0.21 - 1),
  editionAt: t => {
    const LEN = 24, k = Math.floor(t / LEN), u = t / LEN - k, q = (u - 0.84) / 0.16;
    if (q <= 0) return { a: SHEETS[k % SHEETS.length], b: SHEETS[k % SHEETS.length], x: 0, way: 0 };
    return { a: SHEETS[k % SHEETS.length], b: SHEETS[(k + 1) % SHEETS.length], x: q, way: (k * 2.4) % 6.283 };
  },
};

// The cone. Known ahead, so it draws back first: a fifth of a second back, an eighth out, and it rings for a little under half a second.
export function popAt(hits, power, t) {
  const k = after(hits, t);
  let v = 0;
  if (k > 0) { const a = t - hits[k - 1], s = power[k - 1] ?? 1; v += a < 0.12 ? s * (1 - (1 - a / 0.12) ** 2) : s * Math.exp(-(a - 0.12) / 0.2) * Math.cos((a - 0.12) * 13); }
  if (k < hits.length) { const b = hits[k] - t, s = power[k] ?? 1; if (b < 0.2) v -= 0.3 * s * (1 - b / 0.2) ** 2; }
  return v;
}
// A plate knocked out of register: it goes at once, and swings back like something on a spring. Which way goes by which hit, so it's never the same twice running.
const knock = (a, s, out, ang, size) => { if (a > 0.9) return; const e = Math.min(1, a / 0.03) * Math.exp(-a / 0.17) * Math.cos(a * 17) * s * size; out[0] += e * Math.cos(ang); out[1] += e * Math.sin(ang); };
export function knocks(song, t, size, outA, outB) {
  const { hits, power, snares } = song;
  let k = after(hits, t);
  for (let i = k - 1; i >= Math.max(0, k - 2); i--) knock(t - hits[i], power[i] ?? 1, outA, (i * 2.399) % 6.283, size);
  k = after(snares, t);
  for (let i = k - 1; i >= Math.max(0, k - 2); i--) knock(t - snares[i], 1, outB, (i * 2.399 + 1.7) % 6.283, size * 0.9);
}

// What's sounding, as 32 samples, at this much drive. Round at no drive, its own shape after that, and past that flat-topped. A window nothing repeats in is a plain sine going square.
const SIN = Float32Array.from({ length: 32 }, (_, i) => Math.sin((2 * Math.PI * i) / 32));
export function waveAt(out, song, t, d, base) {
  const w = song?.wave;
  const gain = 1 + 5.5 * d * d;
  if (!w?.table?.length) { for (let i = 0; i < 32; i++) { const s = SIN[i]; out[base + i] = Math.max(-1, Math.min(1, gain * (s + 0.3 * d * SIN[(i * 3) & 31]))); } return; }
  const s = song.songOf(t), n = w.table.length / w.size, x = Math.min(n - 1.001, Math.max(0, s / w.hop)), q = Math.floor(x), u = x - q, conf = Math.min(1, (w.conf[q] ?? 0) / 0.5), step = w.size / 32;
  for (let i = 0; i < 32; i++) {
    const j = i * step, a = w.table[q * w.size + j] / 127, b = w.table[(q + 1) * w.size + j] / 127, v = a + (b - a) * u, m = SIN[i] + (v - SIN[i]) * conf * Math.min(1, 2 * d);
    out[base + i] = Math.max(-1, Math.min(1, gain * m));
  }
}

export const whoaOf = (A, M) => {
  const a = (M?.arrivals?.(0.3) ?? []).filter(x => x.t > 16 && x.t < A.duration - 8)[0];
  return a ? { t: a.t, before: 12, after: 6, why: `the edges go round and the clock's held back, and it fires into the strongest arrival, ${a.a.toFixed(2)}` } : null;
};
export { reactAt, EDITIONS };
