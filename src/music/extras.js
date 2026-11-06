// What the worlds hear that the film doesn't (docs/MODES.md section 6). Pure maths on the stereo song at 22050 Hz, with the main analysis A beside it:
// no DOM above the line marked "the browser's end", so it runs in a worker and in Node. A is only read, never written, and the film never sees any of this.
//
// What each field is, and how far to believe it. tests/extras.mjs is the evidence: signals with a known answer, and known things done to the real songs. Nobody has judged any of it by ear.
//   wave       table Int8 (64 x n, 4 a second), conf, share, hz    Exact on held tones. On a mix, only what repeats at the bass's period: use conf, it's low a lot of the time on house.
//   snare      0..1 per beat                                       Exact on a kit. On songs it shows bar patterns, but no one has checked them against the drums. A kick with a hat on it still reads about .4.
//   clip       value 0..1 within this song, 10 Hz, vsLoud          Rises with drive added at equal level on all four songs. Not an absolute: every song spans 0..1. Clean hats lift it a little.
//   fill       ratio per beat, runs [{t0,t1,land,crash,hits}]      Exact on a kit. On songs, unjudged: it can't tell a drummer from any busy bar that lands hard.
//   trem       rate, depth, 2 Hz, 0 = none; share                  No false alarms on the four songs. Misses a lot: it must be a big part of the mix and last, 10 s at least, or it says none. Believe a yes more than a no.
//   air        rt seconds per 4 s, song, share, 0 = can't tell     Only from free decays. Within 40% where there are some. On ppp and wildflower there aren't: it says 0, and the world must use its own number.
//   shim       raw only, reliable: false                           Works on a synthetic chorus and can't see one on a real mix (a 5-10% rise). Use A.E, as section 9 of the plan says.
//   width      value 0..1, 10 Hz, song                             Exact. rmsS/(rmsM+rmsS).
//   echo       per section lag, grid, wet, feedback; song          A delay on a whole mix: right lag 9 times in 12, wrong 0. The four songs as they are: nothing heard. A delay on one instrument: not tested. Dry floors at 67 ms.
//   voices     chroma bins above half the peak, per bar            Exact on chords. Raw: clamp it to 2..6 at the use.
//   sustain    0..1 per bar                                        Right on pad, kit and plucks. On songs it only moves about .1 within a song, so stretch it at the use.
//   bassPitch  midi, conf, 21.5 Hz                                 Exact on a known line under a kit. On songs its note is in the chord 75-97% of the time, against 25% by chance. No true line to check it against.
//   cut        RG8 data, 512 x bars, edges, zero 128, midPeak, sidePeak    Exact on known tones. Bass is mono on these songs, so side is 13-20% of mid and scaled up to fill its channel.
import { SR, HOP, FPS } from './analysis.js';

export const EXTRAS_VERSION = 1;

// ---------------------------------------------------------------- small tools
export function makeFFT(n) {
  const cos = new Float64Array(n >> 1), sin = new Float64Array(n >> 1), rev = new Uint32Array(n);
  for (let i = 0; i < n >> 1; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = -Math.sin((2 * Math.PI * i) / n); }
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; rev[i] = j; }
  return (re, im) => {
    for (let i = 1; i < n; i++) { const j = rev[i]; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1, step = n / len;
      for (let i = 0; i < n; i += len) for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half, c = cos[k * step], s = sin[k * step];
        const tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
      }
    }
  };
}
const hann = n => Float32Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const yieldNow = () => new Promise(r => setTimeout(r, 0));
const pct = (a, p) => { const s = Float32Array.from(a).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * p)))] || 0; };
const median = a => (a.length ? pct(a, 0.5) : 0);
function boxSmooth(a, r) {
  const out = new Float32Array(a.length);
  if (r < 1) { out.set(a); return out; }
  let sum = 0, n = 0;
  for (let i = 0; i < a.length + r; i++) {
    if (i < a.length) { sum += a[i]; n++; }
    if (i - 2 * r - 1 >= 0) { sum -= a[i - 2 * r - 1]; n--; }
    if (i - r >= 0 && i - r < a.length) out[i - r] = sum / n;
  }
  return out;
}
const barEdges = A => {
  // Where each bar starts, in seconds, with the bars before the first and after the last kept going so the song is covered.
  const bars = Array.from(A.bars ?? []), dur = A.duration;
  if (bars.length < 2) { const P = (A.meter || 4) * 60 / (A.bpm || 120), out = []; for (let t = 0; t < dur + P; t += P) out.push(t); return out; }
  const head = bars[1] - bars[0], tail = bars[bars.length - 1] - bars[bars.length - 2];
  while (bars[0] > 0) bars.unshift(bars[0] - head);
  while (bars[bars.length - 1] < dur) bars.push(bars[bars.length - 1] + tail);
  return bars;
};

// ---------------------------------------------------------------- the spectrum, once. Everything below reads this
const NB = 24, BAND_LO = 150, BAND_HI = 7000;
function bandEdges(win) {
  const hz = SR / win, e = [];
  for (let b = 0; b <= NB; b++) e.push(Math.max(2, Math.round((BAND_LO * Math.pow(BAND_HI / BAND_LO, b / NB)) / hz)));
  for (let b = 1; b <= NB; b++) if (e[b] <= e[b - 1]) e[b] = e[b - 1] + 1;
  return e;
}
// T: tonal magnitude per band, what stands up out of its neighbours, so a noisy drum hit barely shows and a note does. B: all of the band.
async function spectra(x, tick) {
  const WIN = 1024, frames = Math.max(1, Math.floor((x.length - WIN) / HOP) + 1), w = hann(WIN), fft = makeFFT(WIN), edges = bandEdges(WIN);
  const re = new Float32Array(WIN), im = new Float32Array(WIN), mag = new Float32Array(WIN / 2 + 1), cum = new Float64Array(WIN / 2 + 2);
  const T = new Float32Array(frames * NB), B = new Float32Array(frames * NB);
  const flat = new Float32Array(frames), rms = new Float32Array(frames), prev = new Float32Array(WIN / 2 + 1);
  const dLow = new Float32Array(frames), dBody = new Float32Array(frames), dMid = new Float32Array(frames), dNoise = new Float32Array(frames), dFlat = new Float32Array(frames);      // the energy that's new in this frame, in each of the snare's bands
  const hz = SR / WIN, bin = f => Math.round(f / hz), R = 6;
  const kLow = [1, bin(120)], kBody = [bin(180), bin(400)], kMid = [bin(400), bin(2000)], kNoise = [bin(2000), bin(6000)], kFlat = [bin(1000), bin(5000)];
  const newIn = r => { let s = 0; for (let k = r[0]; k <= r[1]; k++) { const d = mag[k] - prev[k]; if (d > 0) s += d * d; } return s; };
  for (let f = 0; f < frames; f++) {
    const o = f * HOP;
    let e = 0;
    for (let i = 0; i < WIN; i++) { const s = o + i < x.length ? x[o + i] : 0; e += s * s; re[i] = s * w[i]; im[i] = 0; }
    rms[f] = Math.sqrt(e / WIN);
    fft(re, im);
    for (let k = 0; k <= WIN / 2; k++) { mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / (WIN / 4); cum[k + 1] = cum[k] + mag[k]; }
    dLow[f] = newIn(kLow); dBody[f] = newIn(kBody); dMid[f] = newIn(kMid); dNoise[f] = newIn(kNoise);
    { // A hit's new energy is spread over the bins, and a note's sits in a few of them
      let dm = 0, c = 0;
      for (let k = kFlat[0]; k <= kFlat[1]; k++) { const d = mag[k] - prev[k]; if (d > dm) dm = d; }
      for (let k = kFlat[0]; k <= kFlat[1]; k++) if (mag[k] - prev[k] > 0.15 * dm) c++;
      dFlat[f] = dm > 0 ? c / (kFlat[1] - kFlat[0] + 1) : 0;
    }
    prev.set(mag);
    let lg = 0, ar = 0;
    for (let k = kFlat[0]; k <= kFlat[1]; k++) { const p = mag[k] * mag[k] + 1e-12; lg += Math.log(p); ar += p; }
    const nf = kFlat[1] - kFlat[0] + 1;
    flat[f] = Math.exp(lg / nf) / (ar / nf);
    for (let b = 0; b < NB; b++) {
      let all = 0, ton = 0;
      for (let k = edges[b]; k < edges[b + 1]; k++) {
        const m = mag[k];
        all += m;
        if (m > mag[k - 1] && m >= mag[k + 1]) {
          const a = Math.max(0, k - R), c = Math.min(WIN / 2, k + R), mu = (cum[c + 1] - cum[a]) / (c - a + 1);
          if (m > 1.6 * mu) ton += m - mu;
        }
      }
      B[f * NB + b] = all / (edges[b + 1] - edges[b]);
      T[f * NB + b] = ton;
    }
    if (f % 2000 === 0) { tick(f / frames); await yieldNow(); }
  }
  const widths = Float32Array.from({ length: NB }, (_, b) => edges[b + 1] - edges[b]);
  return { frames, T, B, dLow, dBody, dMid, dNoise, dFlat, flat, rms, widths };
}

// ---------------------------------------------------------------- wave: the shape of one cycle, standing still like a triggered scope
// 4 tables a second, 64 points, one cycle of the window's strongest period folded and averaged, so whatever doesn't repeat at that period falls away.
// Rotated so the first harmonic is +sin: being periodic it closes round a ring, and the same note gives the same table. waveConf is the share of the
// window's energy that really does repeat. A window that doesn't repeat gets the nearest one that does, and a song with none is a plain sine.
const WAVE_N = 64, WAVE_HOP = 0.25, WAVE_OK = 0.35;
function waves(x, duration, bass) {
  const N = 4096, F = 8192, fft = makeFFT(F), w = hann(N), n = Math.max(1, Math.ceil(duration / WAVE_HOP));
  const re = new Float32Array(F), im = new Float32Array(F), tables = new Float32Array(n * WAVE_N), conf = new Float32Array(n), hz = new Float32Array(n);
  // How much overlap a Hann window has with itself at each lag, so a long lag isn't marked down for having less to compare
  const wac = new Float64Array(F), lo = Math.floor(SR / 800), hi = Math.ceil(SR / 50);
  for (let i = 0; i < N; i++) { re[i] = w[i]; im[i] = 0; }
  for (let i = N; i < F; i++) { re[i] = 0; im[i] = 0; }
  fft(re, im);
  for (let k = 0; k < F; k++) { re[k] = re[k] * re[k] + im[k] * im[k]; im[k] = 0; }
  fft(re, im);
  for (let l = 0; l < F; l++) wac[l] = re[l] / re[0];
  const ac = new Float32Array(hi + 2), sum = new Float64Array(WAVE_N), cnt = new Float64Array(WAVE_N), H = new Float64Array(2 * (WAVE_N >> 1) + 2);
  const COS = new Float64Array(WAVE_N), SIN = new Float64Array(WAVE_N);
  for (let i = 0; i < WAVE_N; i++) { COS[i] = Math.cos((2 * Math.PI * i) / WAVE_N); SIN[i] = Math.sin((2 * Math.PI * i) / WAVE_N); }
  const MAXH = 24;
  for (let q = 0; q < n; q++) {
    const c = Math.round(q * WAVE_HOP * SR), o = c - (N >> 1);
    let m = 0, e = 0;
    for (let i = 0; i < N; i++) { const j = o + i; m += j >= 0 && j < x.length ? x[j] * w[i] : 0; }
    m /= N * 0.5;
    for (let i = 0; i < N; i++) { const j = o + i, s = j >= 0 && j < x.length ? x[j] - m : 0; re[i] = s * w[i]; im[i] = 0; e += re[i] * re[i]; }
    if (e < 1e-7) continue;
    for (let i = N; i < F; i++) { re[i] = 0; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < F; k++) { re[k] = re[k] * re[k] + im[k] * im[k]; im[k] = 0; }
    fft(re, im);
    const r0 = re[0] || 1;
    let top = 0;
    for (let l = lo; l <= hi + 1; l++) { ac[l] = re[l] / r0 / Math.max(wac[l], 0.05); if (l <= hi && ac[l] > top) top = ac[l]; }
    if (top <= 0.05) continue;
    // Where a bass is held, its period, found by the Viterbi and so not changing its mind every window. A guitar on the same root repeats there too.
    let L = -1;
    if (bass) {
      const bq = Math.min(bass.midi.length - 1, Math.round(q * WAVE_HOP * bass.hz));
      if (bass.conf[bq] >= 0.25) {
        const want = SR / (440 * Math.pow(2, (bass.midi[bq] - 69) / 12)), a = Math.max(lo + 1, Math.floor(want * 0.96)), b = Math.min(hi, Math.ceil(want * 1.04));
        let bv = 0;
        for (let l = a; l <= b; l++) if (ac[l] > bv && ac[l] >= ac[l - 1] && ac[l] >= ac[l + 1]) { bv = ac[l]; L = l; }
      }
    }
    // Otherwise the shortest lag nearly as good as the best: a period, and not a multiple of one
    if (L < 0) for (let l = lo + 1; l <= hi; l++) if (ac[l] >= 0.88 * top && ac[l] >= ac[l - 1] && ac[l] >= ac[l + 1]) { L = l; break; }
    if (L < 0) continue;
    const den = ac[L - 1] - 2 * ac[L] + ac[L + 1], P = L + (Math.abs(den) > 1e-9 ? 0.5 * (ac[L - 1] - ac[L + 1]) / den : 0);
    // fold. Weighted by the window, so the middle of the window speaks loudest
    sum.fill(0); cnt.fill(0);
    let eAll = 0;
    for (let i = 0; i < N; i++) {
      const j = o + i; if (j < 0 || j >= x.length) continue;
      const s = x[j] - m, ph = (i / P) % 1, p = ph * WAVE_N, a = Math.floor(p) % WAVE_N, b = (a + 1) % WAVE_N, fr = p - Math.floor(p);
      sum[a] += s * w[i] * (1 - fr); cnt[a] += w[i] * (1 - fr);
      sum[b] += s * w[i] * fr; cnt[b] += w[i] * fr;
      eAll += s * s * w[i];
    }
    let eFold = 0, wAll = 0;
    for (let i = 0; i < WAVE_N; i++) { sum[i] = cnt[i] > 0 ? sum[i] / cnt[i] : 0; eFold += sum[i] * sum[i] * cnt[i]; wAll += cnt[i]; }
    conf[q] = clamp01(eFold / Math.max(eAll, 1e-12));
    hz[q] = SR / P;
    // the harmonics, each turned so that the first lands on +sin
    let eH = 0;
    for (let h = 1; h <= MAXH; h++) {
      let a = 0, b = 0;
      for (let i = 0; i < WAVE_N; i++) { const idx = (h * i) % WAVE_N; a += sum[i] * COS[idx]; b -= sum[i] * SIN[idx]; }
      H[2 * h] = a; H[2 * h + 1] = b;
      eH += a * a + b * b;
    }
    const e1 = H[2] * H[2] + H[3] * H[3];
    if (e1 < 0.02 * eH) { conf[q] = 0; continue; }     // nothing to line it up by
    const psi = Math.atan2(H[3], H[2]), turn = -Math.PI / 2 - psi;
    let peak = 0;
    const base = q * WAVE_N;
    for (let i = 0; i < WAVE_N; i++) {
      let v = 0;
      for (let h = 1; h <= MAXH; h++) {
        const ang = h * turn + (2 * Math.PI * h * i) / WAVE_N;
        v += H[2 * h] * Math.cos(ang) - H[2 * h + 1] * Math.sin(ang);
      }
      tables[base + i] = v;
      peak = Math.max(peak, Math.abs(v));
    }
    if (peak > 0) for (let i = 0; i < WAVE_N; i++) tables[base + i] /= peak;
  }
  // Lined up as they are, neighbours can be averaged: each table leans on the two beside it by how sure they are, so one bad window can't kick the shape
  const held = new Float32Array(tables.length);
  for (let q = 0; q < n; q++) {
    const a = q > 0 ? conf[q - 1] : 0, c = q + 1 < n ? conf[q + 1] : 0, me = 2 * conf[q], sum2 = a + me + c, base = q * WAVE_N;
    if (sum2 <= 0) continue;
    for (let i = 0; i < WAVE_N; i++) held[base + i] = (me * tables[base + i] + (a ? a * tables[base - WAVE_N + i] : 0) + (c ? c * tables[base + WAVE_N + i] : 0)) / sum2;
    let pk = 0; for (let i = 0; i < WAVE_N; i++) pk = Math.max(pk, Math.abs(held[base + i]));
    if (pk > 0) for (let i = 0; i < WAVE_N; i++) held[base + i] /= pk;
  }
  tables.set(held);
  // Windows that don't repeat take the nearest that does. Int8: 60 KB for a 4-minute song
  const out = new Int8Array(n * WAVE_N), good = [];
  for (let q = 0; q < n; q++) if (conf[q] >= WAVE_OK) good.push(q);
  let g = 0;
  for (let q = 0; q < n; q++) {
    while (g + 1 < good.length && Math.abs(good[g + 1] - q) <= Math.abs(good[g] - q)) g++;
    const base = q * WAVE_N;
    if (good.length) { const s = good[g] * WAVE_N; for (let i = 0; i < WAVE_N; i++) out[base + i] = Math.round(127 * tables[s + i]); }
    else for (let i = 0; i < WAVE_N; i++) out[base + i] = Math.round(127 * SIN[i]);
  }
  return { table: out, size: WAVE_N, hop: WAVE_HOP, conf, hz, share: good.length / n };
}

// ---------------------------------------------------------------- snare: per beat, a hit with both a body (180-400 Hz) and a rattle (2-6 kHz), minus what the kick accounts for
// Judged from the energy that's new at the hit, so what's already sounding doesn't count. A hit is a snare to the degree that body and rattle are both in it, which marks down a hat
// (no body) and a tom (no rattle), and that its new energy is spread out, which marks down a note. Body runs up to 2 kHz, or a clap has none.
// The bass is then subtracted and doesn't go in the ratio: a clap on top of a four-on-the-floor kick is still a clap.
function snares(S, A) {
  const b = A.beats, N = b.length, out = new Float32Array(N), n = S.frames, strength = new Float32Array(n), like = new Float32Array(n), kick = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    const B = S.dBody[f] + S.dMid[f], H = S.dNoise[f];
    strength[f] = Math.sqrt(B + H);
    like[f] = clamp01((B / Math.max(H, 1e-12)) / 0.5) * clamp01((H / Math.max(B, 1e-12)) / 0.05) * clamp01(S.dFlat[f] / 0.4);
    kick[f] = Math.sqrt(S.dLow[f]);
    like[f] *= clamp01((1 - S.dLow[f] / Math.max(S.dLow[f] + B + H, 1e-12)) / 0.15);       // nearly all bass is a kick with a hat on it, whatever else is in it
  }
  const top = pct(strength, 0.995) || 1, topK = pct(kick, 0.995) || 1;
  for (let i = 0; i < N; i++) {
    const f0 = Math.max(0, Math.round((b[i] - 0.035) * FPS)), f1 = Math.min(n - 1, Math.round((b[i] + 0.07) * FPS));
    let m = 0;
    for (let f = f0; f <= f1; f++) { const v = Math.min(1, strength[f] / top) * like[f] - 0.25 * Math.min(1, kick[f] / topK); if (v > m) m = v; }
    out[i] = m;
  }
  // Over its own best, unless its best is poor: a song with no snare shouldn't get one by being scaled up
  const best = Math.max(pct(out, 0.98), 0.25);
  for (let i = 0; i < N; i++) out[i] = Math.min(1, out[i] / best);
  return out;
}

// ---------------------------------------------------------------- clip: flat-topped and noisy where it should be neither. 10 Hz, 0..1 within this song
// Inverse crest factor, and how flat 1-5 kHz is. Neither is distortion by itself: a limiter flattens tops and hi-hats flatten the spectrum. vsLoud says how far it's only loudness on this song.
function clips(x, S, duration, E) {
  const HZ = 10, n = Math.max(1, Math.floor(duration * HZ)), ic = new Float32Array(n), fl = new Float32Array(n), hop = SR / HZ, win = Math.round(SR * 0.2);
  for (let q = 0; q < n; q++) {
    const o = Math.round((q + 0.5) * hop - win / 2);
    let e = 0, pk = 0, c = 0;
    for (let i = Math.max(0, o); i < Math.min(x.length, o + win); i++) { const v = x[i]; e += v * v; const a = v < 0 ? -v : v; if (a > pk) pk = a; c++; }
    ic[q] = c && pk > 1e-5 ? Math.sqrt(e / c) / pk : 0;
    const f0 = Math.max(0, Math.round(q * hop / HOP)), f1 = Math.min(S.frames, Math.round((q + 1) * hop / HOP));
    // the lower middle of the frames in about 0.4 s: a hat is gone by the next frame, and what's distorted stays
    const a0 = Math.max(0, f0 - 6), a1 = Math.min(S.frames, f1 + 6);
    fl[q] = a1 > a0 ? pct(S.flat.subarray(a0, a1), 0.35) : 0;
  }
  const scale = a => { const lo = pct(a, 0.05), hi = pct(a, 0.95), d = Math.max(hi - lo, 1e-4); return a.map(v => clamp01((v - lo) / d)); };
  const mix = new Float32Array(n), a = scale(ic), b = scale(fl);
  for (let q = 0; q < n; q++) mix[q] = 0.5 * a[q] + 0.5 * b[q];
  const value = boxSmooth(mix, 3);
  let vsLoud = 0;
  if (E?.length) {
    let ma = 0, mb = 0, c = 0, xx = 0, yy = 0;
    const at = q => E[Math.min(E.length - 1, Math.floor(((q + 0.5) / n) * E.length))];
    for (let q = 0; q < n; q++) { ma += value[q]; mb += at(q); }
    ma /= n; mb /= n;
    for (let q = 0; q < n; q++) { const u = value[q] - ma, v = at(q) - mb; c += u * v; xx += u * u; yy += v * v; }
    vsLoud = c / Math.sqrt(xx * yy || 1);
  }
  return { hz: HZ, value, vsLoud };
}

// ---------------------------------------------------------------- how much of the sound is held, how much is hits
// What a band's median over about 0.4 s accounts for is held, and what stands above it is a hit. analysis.js also takes a median across frequency, which its 64 narrow bands can
// afford. Here a smooth pad would come out half drums, so a held chord would read as half struck.
function hpss(S) {
  const { frames, B } = S, HW = 8, buf = new Float32Array(32), harm = new Float32Array(frames), perc = new Float32Array(frames);
  const med = n => { for (let i = 1; i < n; i++) { const v = buf[i]; let j = i - 1; while (j >= 0 && buf[j] > v) { buf[j + 1] = buf[j]; j--; } buf[j + 1] = v; } return buf[n >> 1]; };
  for (let f = 0; f < frames; f++) for (let b = 0; b < NB; b++) {
    const v = B[f * NB + b];
    let n = 0;
    for (let t = Math.max(0, f - HW); t <= Math.min(frames - 1, f + HW); t++) buf[n++] = B[t * NB + b];
    const H = med(n), h = v < H ? v : H;
    harm[f] += h; perc[f] += v - h;
  }
  return { harm, perc };
}

// ---------------------------------------------------------------- fill: a run of hits far thicker than this part of the song's own usual
const FILL_RATIO = 1.6, FILL_MAX_BEATS = 4;
function fills(S, A) {
  const b = A.beats, N = b.length, n = S.frames, on = new Float32Array(n);
  for (let f = 0; f < n; f++) on[f] = Math.sqrt(S.dLow[f] + S.dBody[f] + S.dNoise[f]);       // new energy, so kick and snare count for what they're worth and a hat for what it's worth
  // Strong hits only: hats going steadily aren't a drummer filling. Strong for here, over about 4 s, and not nothing for the song
  const R = Math.round(2 * FPS), hits = [], most = pct(on, 0.995);
  for (let i = 2; i < n - 2; i++) {
    if (!(on[i] > on[i - 1] && on[i] >= on[i + 1] && on[i] > on[i - 2] && on[i] >= on[i + 2])) continue;
    let top = 0;
    for (let j = Math.max(0, i - R); j <= Math.min(n - 1, i + R); j += 2) if (on[j] > top) top = on[j];
    if (on[i] >= 0.3 * top && on[i] >= 0.1 * most) hits.push(i / FPS);
  }
  const count = new Float32Array(N);
  { let h = 0; for (let i = 0; i < N; i++) { const t1 = i + 1 < N ? b[i + 1] : A.duration; while (h < hits.length && hits[h] < b[i] - 0.04) h++; let q = h; while (q < hits.length && hits[q] < t1 - 0.04) { count[i]++; q++; } } }
  const dens = boxSmooth(count, 1), ratio = new Float32Array(N), W = 32, win = [];
  for (let i = 0; i < N; i++) {
    win.length = 0;
    for (let j = Math.max(0, i - W); j <= Math.min(N - 1, i + W); j++) win.push(dens[j]);
    ratio[i] = dens[i] / Math.max(median(win), 0.75);
  }
  const barSet = new Set(Array.from(A.barBeats ?? []));
  const runs = [];
  for (let i = 0; i < N; i++) {
    if (ratio[i] < FILL_RATIO) continue;
    let j = i; while (j + 1 < N && ratio[j + 1] >= FILL_RATIO) j++;
    const whole = j;
    // The density is smoothed over three beats, so its run is wider than the fill. Back to the beats that really are thick.
    const usual = dens[i] / Math.max(ratio[i], 1e-3), thick = q => count[q] >= usual * FILL_RATIO;
    while (i < j && !thick(i)) i++;
    while (j > i && !thick(j)) j--;
    let hitsIn = 0; for (let q = i; q <= j; q++) hitsIn += count[q];
    if (thick(i) && j - i + 1 <= FILL_MAX_BEATS && hitsIn >= Math.max(4, 2 * (j - i + 1))) {
      // A fill goes somewhere: the bar line within a beat of where it stops, and a real hit there
      let land = j + 1; while (land < N && land - j <= 2 && !barSet.has(land)) land++;
      if (land < N && barSet.has(land)) {
        const f = Math.round(b[land] * FPS);
        let at = 0, near = 0;
        for (let q = Math.max(0, f - 3); q <= Math.min(n - 1, f + 4); q++) if (on[q] > at) at = on[q];
        for (let q = Math.max(0, f - R); q <= Math.min(n - 1, f + R); q += 2) if (on[q] > near) near = on[q];
        if (at >= 0.5 * near) {
          const t0 = b[i], t1 = b[j + 1];
          runs.push({ b0: i, b1: j + 1, t0, t1, land: b[land], crash: near > 0 ? at / near : 0, hits: Float32Array.from(hits.filter(t => t >= t0 - 0.04 && t < t1 - 0.04)) });
        }
      }
    }
    i = whole;
  }
  return { ratio, runs, hits: hits.length };
}

// ---------------------------------------------------------------- the modulation of each band, as complex spectra: tremolo and chorus
// log tonal envelope per band, so depth comes out as depth whatever the band's level.
function logEnvelopes(T, frames) {
  const mean = new Float32Array(NB);
  let mx = 0;
  for (let b = 0; b < NB; b++) { let s = 0; for (let f = 0; f < frames; f += 4) s += T[f * NB + b]; mean[b] = s / Math.max(1, frames / 4); mx = Math.max(mx, mean[b]); }
  const L = new Float32Array(frames * NB), eps = new Float32Array(NB);
  for (let b = 0; b < NB; b++) eps[b] = 0.04 * mean[b] + 0.002 * mx + 1e-6;
  for (let f = 0; f < frames; f++) for (let b = 0; b < NB; b++) L[f * NB + b] = Math.log(T[f * NB + b] + eps[b]);
  return { L, mean };
}

// tremolo: one gain moving every band together, smoothly and in phase. |ΣZ|/Σ|Z| near 1. Strumming moves them together too, so it has to be smooth as well:
// what a hit does to a level has harmonics and a steep front, and a tremolo's doesn't.
const TREM_LO = 2, TREM_HI = 12, TREM_SEC = 6, TREM_COH = 0.6, TREM_STANDS = 5, TREM_MIN_SEC = 10;
function tremolo(L, S, duration) {
  const { frames, T, B, widths } = S;
  // Six seconds: a tremolo keeps its phase and the song doesn't, so the longer the window the further it stands out. A burst shorter than that isn't heard.
  const WIN = Math.min(frames, Math.round(TREM_SEC * FPS)), HOPW = Math.round(FPS), F = 512, fft = makeFFT(F), w = hann(WIN), nw = Math.max(1, Math.floor((frames - WIN) / HOPW) + 1);
  const re = new Float32Array(F), im = new Float32Array(F), sumRe = new Float32Array(F / 2 + 1), sumIm = new Float32Array(F / 2 + 1), sumAbs = new Float32Array(F / 2 + 1);
  const hz = FPS / F, k0 = Math.ceil(TREM_LO / hz), k1 = Math.floor(TREM_HI / hz);
  let sw = 0; for (let i = 0; i < WIN; i++) sw += w[i];
  const rate = new Float32Array(nw), depth = new Float32Array(nw), coh = new Float32Array(nw), sharp = new Float32Array(nw), stood = new Float32Array(nw), pass = new Uint8Array(nw), tone = new Float64Array(NB), all = new Float64Array(NB), together = new Float32Array(WIN), lean = new Float32Array(nw);
  const FOLD = 24, fold = new Float32Array(FOLD), foldN = new Float32Array(FOLD);
  for (let q = 0; q < nw; q++) {
    const o = q * HOPW;
    sumRe.fill(0); sumIm.fill(0); sumAbs.fill(0);
    let active = 0;
    together.fill(0);
    // Only bands that hold a tone in this window: a hat's noise has peaks too, and they come and go with the hat. And none so quiet it's only rounding.
    let loudest = 0;
    for (let b = 0; b < NB; b++) { let t = 0, a = 0; for (let i = 0; i < WIN; i += 2) { t += T[(o + i) * NB + b]; a += B[(o + i) * NB + b] * widths[b]; } tone[b] = t; all[b] = a; if (t > loudest) loudest = t; }
    for (let b = 0; b < NB; b++) {
      if (!(tone[b] >= 0.2 * all[b] && tone[b] >= 0.03 * loudest)) continue;
      let m = 0, tilt = 0;
      for (let i = 0; i < WIN; i++) m += L[(o + i) * NB + b];
      m /= WIN;
      for (let i = 0; i < WIN; i++) tilt += (L[(o + i) * NB + b] - m) * (i - (WIN - 1) / 2);
      tilt /= (WIN * (WIN * WIN - 1)) / 12;
      for (let i = 0; i < WIN; i++) { const v = L[(o + i) * NB + b] - m - tilt * (i - (WIN - 1) / 2); together[i] += v; re[i] = v * w[i]; im[i] = 0; }
      re.fill(0, WIN); im.fill(0, WIN);
      fft(re, im);
      active++;
      for (let k = 0; k <= F / 2; k++) { sumRe[k] += re[k]; sumIm[k] += im[k]; sumAbs[k] += Math.sqrt(re[k] * re[k] + im[k] * im[k]); }
    }
    if (active < 2) continue;
    let bk = -1, bv = 0;
    for (let k = k0; k <= k1; k++) {
      const a = Math.hypot(sumRe[k], sumIm[k]);
      if (a > bv && a >= Math.hypot(sumRe[k - 1], sumIm[k - 1]) && a >= Math.hypot(sumRe[k + 1], sumIm[k + 1])) { bv = a; bk = k; }
    }
    if (bk < 0) continue;
    // The analysis window itself takes a little off a fast tremolo: its transform at this rate puts that back
    const xw = (bk * hz * 1024) / SR, lobe = (Math.sin(Math.PI * xw) / (Math.PI * xw)) / (1 - xw * xw);
    const amp = (2 * bv) / (active * sw * lobe), d = (4 * amp) / (4 + amp * amp);     // a is the first harmonic of log(1+d cos): d = 4a/(4+a^2)
    const C = bv / Math.max(sumAbs[bk], 1e-9);
    const at = k => (k <= F / 2 ? Math.hypot(sumRe[k], sumIm[k]) : 0);
    const sh = (at(2 * bk) + at(3 * bk)) / Math.max(bv, 1e-9);
    // does this one peak stand out of the rest of the modulation?
    let other = 0, cnt = 0;
    for (let k = Math.ceil(1 / hz); k <= Math.min(F / 2, Math.floor(16 / hz)); k++) { if (Math.abs(k - bk) > 8) { other += at(k); cnt++; } }
    const stands = bv / Math.max(other / Math.max(cnt, 1), 1e-9);
    // A tremolo falls as it rises. A strum jumps up and dies away, whatever the rate. One cycle of the shared level, folded, so only what repeats at this rate gets a say
    const period = FPS / (bk * hz);
    fold.fill(0); foldN.fill(0);
    for (let i = 0; i < WIN; i++) { const c = Math.floor(((i / period) % 1) * FOLD); fold[c] += together[i]; foldN[c]++; }
    let d2 = 0, d3 = 0;
    for (let c = 0; c < FOLD; c++) fold[c] /= Math.max(foldN[c], 1);
    for (let c = 0; c < FOLD; c++) { const dv = fold[(c + 1) % FOLD] - fold[c]; d2 += dv * dv; d3 += dv * dv * dv; }
    const skew = (d3 / FOLD) / Math.max(Math.pow(d2 / FOLD, 1.5), 1e-9);
    rate[q] = bk * hz; depth[q] = d; coh[q] = C; sharp[q] = sh; stood[q] = stands; lean[q] = skew;
    pass[q] = C >= TREM_COH && sh < 0.45 && skew < 0.6 && stands >= TREM_STANDS && d >= 0.06 ? 1 : 0;
  }
  // A tremolo stays at its rate for seconds. Lone windows are chance.
  const hzOut = 2, n = Math.max(1, Math.ceil(duration * hzOut)), outRate = new Float32Array(n), outDepth = new Float32Array(n), R = 3;
  const toWin = i => Math.min(nw - 1, Math.max(0, Math.round((i / hzOut * FPS - WIN / 2) / HOPW)));
  for (let i = 0; i < n; i++) {
    const c = toWin(i), rates = [], ds = [];
    for (let q = Math.max(0, c - R); q <= Math.min(nw - 1, c + R); q++) if (pass[q]) { rates.push(rate[q]); ds.push(depth[q]); }
    if (rates.length < 3) continue;
    const mr = median(rates), near = [];
    for (let j = 0; j < rates.length; j++) if (Math.abs(rates[j] - mr) <= 0.08 * mr) near.push(ds[j]);
    if (near.length < 3) continue;
    outRate[i] = mr; outDepth[i] = median(near);
  }
  let heard = 0; for (let i = 0; i < n; i++) if (outDepth[i] > 0) heard++;
  // Under ten seconds of it in a whole song is chance (two of the four test songs do that, on a sequencer's sixteenths and on nothing in particular). Silence, then.
  if (heard / hzOut < TREM_MIN_SEC) { outRate.fill(0); outDepth.fill(0); heard = 0; }
  return { hz: hzOut, rate: outRate, depth: outDepth, share: heard / n, raw: { rate, depth, coh, sharp, stood, lean, pass } };
}

// shimmer: the bands moving slowly and each its own way, the way a chorus beats. Band spectra times (1-coherence). The plan said from 0.4 Hz; here from 1.2, since the median takes the slow part.
// reliable: false. It separates a synthetic chorus from dry by 2-5 times. A chorus put on a whole real song moves it 5-10%, less than it wanders by itself, so there's no value here to use.
function shimmer(L0, frames, duration) {
  // A chord change is a step in every band it touches, and that's most of what a band spectrum holds. A running median keeps steps, so what's left beside it is what's wobbling.
  const L = new Float32Array(L0.length), R = Math.round(0.4 * FPS), buf = new Float32Array(2 * R + 2);
  for (let b = 0; b < NB; b++) for (let f = 0; f < frames; f += 2) {
    let n = 0;
    for (let t = Math.max(0, f - R); t <= Math.min(frames - 1, f + R); t += 2) { const v = L0[t * NB + b]; let j = n - 1; while (j >= 0 && buf[j] > v) { buf[j + 1] = buf[j]; j--; } buf[j + 1] = v; n++; }
    const m = buf[n >> 1];
    L[f * NB + b] = L0[f * NB + b] - m;
    if (f + 1 < frames) L[(f + 1) * NB + b] = L0[(f + 1) * NB + b] - m;
  }
  const WIN = Math.round(4 * FPS), HOPW = Math.round(FPS), F = 512, fft = makeFFT(F), w = hann(WIN), nw = frames >= WIN ? Math.floor((frames - WIN) / HOPW) + 1 : 0;
  const re = new Float32Array(F), im = new Float32Array(F), hz = FPS / F, k0 = Math.ceil(1.2 / hz), k1 = Math.floor(6 / hz);
  const sumRe = new Float32Array(F / 2 + 1), sumIm = new Float32Array(F / 2 + 1), sumAbs = new Float32Array(F / 2 + 1);
  let sw = 0; for (let i = 0; i < WIN; i++) sw += w[i];
  const raw = new Float32Array(nw), cohOut = new Float32Array(nw);
  for (let q = 0; q < nw; q++) {
    const o = q * HOPW;
    sumRe.fill(0); sumIm.fill(0); sumAbs.fill(0);
    for (let b = 0; b < NB; b++) {
      let m = 0;
      for (let i = 0; i < WIN; i++) m += L[(o + i) * NB + b];
      m /= WIN;
      for (let i = 0; i < WIN; i++) { re[i] = (L[(o + i) * NB + b] - m) * w[i]; im[i] = 0; }
      re.fill(0, WIN); im.fill(0, WIN);
      fft(re, im);
      for (let k = k0; k <= k1; k++) { sumRe[k] += re[k]; sumIm[k] += im[k]; sumAbs[k] += Math.sqrt(re[k] * re[k] + im[k] * im[k]); }
    }
    let incoh = 0, abs = 0, co = 0;
    for (let k = k0; k <= k1; k++) { const c = Math.hypot(sumRe[k], sumIm[k]); abs += sumAbs[k]; co += c; incoh += sumAbs[k] - c; }
    raw[q] = (incoh / (k1 - k0 + 1)) * 2 / (NB * sw);
    cohOut[q] = co / Math.max(abs, 1e-9);
  }
  return { reliable: false, hz: 1, t0: 2, raw, coherence: cohOut };
}

// ---------------------------------------------------------------- air: how long this room rings, in seconds to fall 60 dB
// Free decays: a band's level from one real onset to the next, a straight line in dB. The fastest fifth over 8 s are the ones nearest the room, since a note ringing on can only make a
// decay slower. Sustained music gives few of them, and then the answer is 0, which means can't tell. A note that rings for long by itself reads as a long room, and nothing here can tell them apart.
// The plan's fallback, low over high modulation energy, was tried and isn't here: adding a room moves it the opposite way to what was assumed (4 s on ppp 1.19, dry 1.66), and dry songs differ
// by more than any room does (disclosure dry 1.01). So does the fastest slope of the level, which moved .31 to .36 between a .5 and a 4 s room.
const AIR_MIN_DROP = 10, AIR_WIN = 8, AIR_RISE = 9, AIR_MIN_FRAMES = 8, AIR_R2 = 0.75;
function airs(S, duration) {
  const { frames, T } = S, fps = FPS, decays = [], WIDE = 6, SKIP = 2;
  // Wide bands, about an octave, and tonal, or a dry drum kit would be all it heard. One partial's tail fades in and out by chance and that looks just like a fast decay,
  // so a decay runs from one real onset to the next and the line is fitted through all of it, dips included.
  for (let w = 0; w < NB / WIDE; w++) {
    const db = new Float32Array(frames);
    for (let f = 0; f < frames; f++) { let e = 0; for (let b = w * WIDE; b < (w + 1) * WIDE; b++) { const v = T[f * NB + b]; e += v * v; } db[f] = 10 * Math.log10(e + 1e-10); }
    const sm = boxSmooth(db, 1), floor = Math.max(pct(sm, 0.03) + 6, pct(sm, 0.97) - 45), onsets = [];
    for (let f = 3; f < frames; f++) {
      const before = Math.min(sm[f - 1], sm[f - 2], sm[f - 3]);
      if (sm[f] - before >= AIR_RISE && (!onsets.length || f - onsets[onsets.length - 1] > 4)) onsets.push(f);
    }
    onsets.push(frames - 1);
    for (let i = 0; i + 1 < onsets.length; i++) {
      let p = onsets[i];
      const end0 = onsets[i + 1] - 3;
      while (p < end0 && p < onsets[i] + 8 && sm[p + 1] >= sm[p]) p++;
      if (sm[p] < floor + AIR_MIN_DROP) continue;
      let end = end0;
      for (let f = p; f <= end0; f++) if (sm[f] <= floor) { end = f; break; }
      const start = p + SKIP;
      if (end - start < AIR_MIN_FRAMES) continue;
      let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
      for (let f = start; f <= end; f++) { const x = (f - start) / fps, y = sm[f]; n++; sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y; }
      const den = n * sxx - sx * sx, slope = den > 0 ? (n * sxy - sx * sy) / den : 0, ssy = n * syy - sy * sy, r2 = ssy > 0 && den > 0 ? ((n * sxy - sx * sy) ** 2) / (den * ssy) : 0;
      if (slope < -2 && -slope * (end - start) / fps >= AIR_MIN_DROP && r2 >= AIR_R2) decays.push({ t: p / fps, rt: -60 / slope, band: w, r2 });
    }
  }
  decays.sort((a, c) => a.t - c.t);
  const n = Math.max(1, Math.ceil(duration / (AIR_WIN / 2))), rt = new Float32Array(n), free = new Uint16Array(n), MINFREE = 4;
  for (let i = 0; i < n; i++) {
    const c = (i + 0.5) * (AIR_WIN / 2), inW = decays.filter(d => Math.abs(d.t - c) <= AIR_WIN / 2).map(d => d.rt).sort((a, c2) => a - c2);
    free[i] = inW.length;
    if (inW.length >= MINFREE) { const k = Math.max(1, Math.round(inW.length * 0.2)); rt[i] = inW[Math.floor(k / 2)]; }
  }
  const good = rt.filter(v => v > 0);
  return { hop: AIR_WIN / 2, rt, free, song: good.length >= 3 ? median(good) : 0, share: good.length / n, decays: decays.length };
}

// ---------------------------------------------------------------- width: side over mid. 10 Hz. rmsS/(rmsM+rmsS): 0 mono, .5 uncorrelated or one side only, 1 out of phase
function widths(mid, side, duration) {
  const HZ = 10, n = Math.max(1, Math.floor(duration * HZ)), out = new Float32Array(n), hop = SR / HZ;
  let mm = 0, ss = 0;
  for (let q = 0; q < n; q++) {
    const a = Math.round(q * hop), b = Math.min(mid.length, Math.round((q + 1) * hop));
    let m = 0, s = 0;
    for (let i = a; i < b; i++) { m += mid[i] * mid[i]; s += side[i] * side[i]; }
    mm += m; ss += s;
    const rm = Math.sqrt(m), rs = Math.sqrt(s);
    out[q] = rm + rs > 1e-6 ? rs / (rm + rs) : 0;
  }
  const rm = Math.sqrt(mm), rs = Math.sqrt(ss);
  return { hz: HZ, value: boxSmooth(out, 2), song: rm + rs > 1e-6 ? rs / (rm + rs) : 0 };
}

// ---------------------------------------------------------------- echo: the song's own delay
// Autocorrelate the flux of the tonal bands. A rhythm correlates at its own lags just as a delay does, and only a delay is lopsided in time: each repeat is quieter
// than what it repeats, while a rhythm's accents come back round. So a lag only counts if strong-then-weak outweighs weak-then-strong.
const ECHO_LO = 0.08, ECHO_HI = 0.7, ECHO_FLOOR = 0.067, ECHO_LOP_MAX = 4, GRID = [0.25, 0.5, 0.75, 1];
function echoSums(F, nb, f0, f1) {
  const n = f1 - f0, hiLag = Math.round(ECHO_HI * FPS);
  if (n < 3 * hiLag) return null;
  const maxLag = 2 * hiLag + 2, R = new Float64Array(maxLag + 2), A3 = new Float64Array(maxLag + 2), B3 = new Float64Array(maxLag + 2);
  for (let b = 0; b < nb; b++) {
    let m = 0;
    for (let t = f0; t < f1; t++) m += F[t * nb + b];
    m /= n;
    for (let l = 0; l <= maxLag + 1; l++) {
      let r = 0, a3 = 0, b3 = 0;
      for (let t = f0; t + l < f1; t++) {
        const x = F[t * nb + b], y = F[(t + l) * nb + b], xm = x - m, ym = y - m;
        r += xm * ym; a3 += x * x * y; b3 += x * y * y;
      }
      R[l] += r; A3[l] += a3; B3[l] += b3;
    }
  }
  return { R, A3, B3, maxLag };
}
function echoBest(sums) {
  if (!sums || sums.R[0] <= 0) return null;
  const { R, A3, B3, maxLag } = sums, loLag = Math.max(3, Math.round(ECHO_LO * FPS)), hiLag = Math.round(ECHO_HI * FPS);
  const lobe = (arr, l) => arr[l - 1] + arr[l] + arr[l + 1], zero = R[0] + 2 * Math.max(0, R[1]), at = l => (l <= maxLag ? lobe(R, l) / zero : 0);
  // Unrelated onsets land on any lag, in a busy song most of them, and they aren't lopsided. What matters is what's above that.
  const ped = arr => 3 * median(Float32Array.from(arr.subarray(loLag, hiLag + 1)));
  const pa = ped(A3), pb = ped(B3);
  let best = null;
  const cands = [];
  for (let l = loLag; l <= hiLag; l++) {
    if (!(R[l] > R[l - 1] && R[l] >= R[l + 1])) continue;
    const g1 = at(l), L2 = 2 * l, g2 = L2 <= maxLag ? at(L2) / Math.max(g1, 1e-6) : 0, xa = lobe(A3, l) - pa, xb = lobe(B3, l) - pb, lop = xa <= 0 ? 0 : xb <= 0 ? ECHO_LOP_MAX : Math.min(ECHO_LOP_MAX, xa / xb);
    // the score: how much there is, and how lopsided it is
    const s = g1 * clamp01((lop - 1.05) / 0.5);
    const den = R[l - 1] - 2 * R[l] + R[l + 1], fine = l + (Math.abs(den) > 1e-12 ? 0.5 * (R[l - 1] - R[l + 1]) / den : 0);
    const c = { s, lag: fine / FPS, g1, g2, lop, l };
    cands.push(c);
    if (!best || s > best.s) best = c;
  }
  // Each repeat is the last one times the same number, or there's only one. A second peak far stronger than the first says it's a rhythm that happens to lean.
  for (const c of cands) if (c.g2 > 1.6 * c.g1 + 0.1) c.s = 0;
  best = null;
  for (const c of cands) if (!best || c.s > best.s) best = c;
  // A delay also correlates at twice itself, and that second repeat can win. If there's a good peak at half the lag, that's the delay
  if (best) for (const c of cands) if (Math.abs(c.lag * 2 - best.lag) <= 1.5 / FPS && c.g1 >= 0.6 * best.g1 && c.lop > 1.05) { best = c; break; }
  return best;
}
const addSums = (a, b) => { if (!b) return a; if (!a) return { R: Float64Array.from(b.R), A3: Float64Array.from(b.A3), B3: Float64Array.from(b.B3), maxLag: b.maxLag }; for (let l = 0; l < a.R.length; l++) { a.R[l] += b.R[l]; a.A3[l] += b.A3[l]; a.B3[l] += b.B3[l]; } return a; };
const ECHO_HEARD = 0.2, ECHO_LEVEL = 0.2, ECHO_HEARD_SONG = 0.05, ECHO_LEVEL_SONG = 0.1;
function echoes(S, A) {
  const { frames, T } = S, F = new Float32Array(frames * NB);
  for (let b = 0; b < NB; b++) {
    let last = 0, e = 0;
    for (let f = 0; f < frames; f++) { const v = T[f * NB + b]; const d = v > last ? v - last : 0; F[f * NB + b] = d; e += d * d; last = v; }
    const k = e > 0 ? Math.sqrt(frames / e) : 0;
    for (let f = 0; f < frames; f++) F[f * NB + b] *= k;
  }
  const segs = A.segments?.length ? A.segments : [{ t0: 0, t1: A.duration }], n = segs.length;
  const lag = new Float32Array(n), feedback = new Float32Array(n), wet = new Float32Array(n), level = new Float32Array(n), grid = new Float32Array(n), lop = new Float32Array(n), spb = 60 / (A.bpm || 120);
  const nearGrid = t => { let bd = 1e9, bl = t; for (const G of GRID) { const d = Math.abs(G * spb - t); if (d < bd) { bd = d; bl = G * spb; } } return bd <= 0.03 ? bl : t; };
  let whole = null;
  const each = segs.map(g => { const s = echoSums(F, NB, Math.max(0, Math.round(g.t0 * FPS)), Math.min(frames, Math.round(g.t1 * FPS))); whole = addSums(whole, s); return echoBest(s); });
  // A delay is usually on for the whole song, and a section is short evidence. So the song speaks first, and a section can overrule it only if its own case is good.
  const song = echoBest(whole), songHeard = !!song && song.s >= ECHO_HEARD_SONG && song.g1 >= ECHO_LEVEL_SONG;
  each.forEach((r, i) => {
    lag[i] = grid[i] = ECHO_FLOOR;
    if (r) { lop[i] = r.lop; level[i] = r.g1; }
    const mine = r && r.s >= ECHO_HEARD && r.g1 >= ECHO_LEVEL;
    const use = mine ? r : songHeard ? song : null;
    if (!use) { if (r) wet[i] = clamp01(r.s); return; }
    wet[i] = clamp01(use.s); lag[i] = use.lag; feedback[i] = clamp01(use.g2); grid[i] = nearGrid(use.lag);
  });
  return { lag, feedback, wet, level, grid, lop, floor: ECHO_FLOOR, t0: Float32Array.from(segs, g => g.t0), t1: Float32Array.from(segs, g => g.t1), song: songHeard ? { lag: song.lag, wet: song.s, feedback: clamp01(song.g2), grid: nearGrid(song.lag) } : null, songScore: song ? song.s : 0, songLop: song ? song.lop : 0, songLevel: song ? song.g1 : 0 };
}

// ---------------------------------------------------------------- voices: chroma bins above half the peak, per bar
function voicesOf(A, edges, level) {
  const quiet = level ? 0.03 * pct(level, 0.95) : 0;
  const C = A.chroma, step = A.chordStep || 4, n = C ? Math.floor(C.length / 12) : 0, out = new Float32Array(Math.max(0, edges.length - 1));
  for (let i = 0; i + 1 < edges.length; i++) {
    const a = Math.max(0, Math.floor((edges[i] * FPS) / step)), b = Math.min(n, Math.ceil((edges[i + 1] * FPS) / step));
    let s = 0, c = 0;
    for (let q = a; q < b; q++) {
      if (level && level[Math.min(level.length - 1, q * step)] < quiet) continue;     // chroma is scaled to its own peak, so silence would look like every note at once
      let on = 0;
      for (let p = 0; p < 12; p++) if (C[q * 12 + p] > 0.5) on++;
      s += on; c++;
    }
    out[i] = c ? s / c : 0;
  }
  return out;
}

// ---------------------------------------------------------------- sustain: per bar, harm/(harm+perc)
function sustains(hp, edges) {
  const out = new Float32Array(Math.max(0, edges.length - 1)), n = hp.harm.length;
  for (let i = 0; i + 1 < edges.length; i++) {
    const a = Math.max(0, Math.round(edges[i] * FPS)), b = Math.min(n, Math.round(edges[i + 1] * FPS));
    let h = 0, p = 0;
    for (let f = a; f < b; f++) { h += hp.harm[f]; p += hp.perc[f]; }
    out[i] = h + p > 1e-9 ? h / (h + p) : 0;
  }
  return out;
}

// ---------------------------------------------------------------- bassPitch: MIDI 28-60 through a Viterbi, as for melody
// 8192-sample windows, read at semitones and with the first harmonics counted, from a zero-padded spectrum of the song taken down to 2756 Hz (the same numbers
// as a Goertzel at each semitone, a tenth of the work). A semitone at MIDI 28 is 2.4 Hz and the window's lobe is 5.4 Hz wide, so down there a note is told by its harmonics.
const BASS_LO = 28, BASS_HI = 60, BASS_HZ = FPS / 2;
function bassLine(x, duration) {
  const D = 8, nd = Math.floor(x.length / D), low = new Float32Array(nd);
  // windowed sinc, about 1 kHz
  const TAPS = 65, fir = new Float32Array(TAPS), fc = 1000 / SR;
  for (let i = 0; i < TAPS; i++) { const m = i - (TAPS - 1) / 2, s = m === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * m) / (Math.PI * m); fir[i] = s * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (TAPS - 1))); }
  for (let q = 0; q < nd; q++) {
    const c = q * D - (TAPS >> 1);
    let s = 0;
    for (let i = 0; i < TAPS; i++) { const j = c + i; if (j >= 0 && j < x.length) s += x[j] * fir[i]; }
    low[q] = s;
  }
  const W = 1024, F = 4096, fft = makeFFT(F), w = hann(W), hopD = Math.round(HOP * 2 / D), n = Math.max(1, Math.floor(nd / hopD) + 1), S = BASS_HI - BASS_LO + 1;
  const re = new Float32Array(F), im = new Float32Array(F), hz = (SR / D) / F, mag = new Float32Array(F / 2 + 1), sal = new Float32Array(n * S), rms = new Float32Array(n), lowShare = new Float32Array(n), kBass = Math.round(300 / hz);
  const bins = Array.from({ length: S }, (_, s) => { const f = 440 * Math.pow(2, (BASS_LO + s - 69) / 12); return [f / hz, 2 * f / hz, 3 * f / hz]; });
  const peekMag = b => { const i = Math.floor(b), fr = b - i; return i + 1 < mag.length ? mag[i] * (1 - fr) + mag[i + 1] * fr : 0; };
  for (let q = 0; q < n; q++) {
    const o = q * hopD - (W >> 1);
    let e = 0;
    for (let i = 0; i < W; i++) { const j = o + i, s = j >= 0 && j < nd ? low[j] : 0; re[i] = s * w[i]; im[i] = 0; e += re[i] * re[i]; }
    re.fill(0, W); im.fill(0, W);
    rms[q] = Math.sqrt(e / W);
    if (e < 1e-8) continue;
    fft(re, im);
    let eLow = 0, eAll = 1e-12;
    for (let k = 0; k <= F / 2; k++) { const p = re[k] * re[k] + im[k] * im[k]; mag[k] = Math.sqrt(p); eAll += p; if (k <= kBass) eLow += p; }
    lowShare[q] = eLow / eAll;
    let top = 1e-9;
    for (let s = 0; s < S; s++) {
      const [a, b, c] = bins[s], v = peekMag(a) + 0.5 * peekMag(b) + 0.33 * peekMag(c);
      sal[q * S + s] = v;
      if (v > top) top = v;
    }
    for (let s = 0; s < S; s++) sal[q * S + s] /= top;
  }
  // A kick is short and low. Over about a third of a second a pitch is held and a kick has gone, so each semitone's salience is taken as its median-like low percentile over time
  const STAY = 0, JUMP = 0.65, STEP = 0.02;
  let score = new Float32Array(S), next = new Float32Array(S);
  const back = new Uint8Array(n * S);
  for (let q = 0; q < n; q++) {
    let bi = 0; for (let s = 1; s < S; s++) if (score[s] > score[bi]) bi = s;
    for (let s = 0; s < S; s++) {
      const stay = score[s] - STAY, jump = score[bi] - JUMP - STEP * Math.abs(s - bi);
      next[s] = (stay >= jump ? stay : jump) + sal[q * S + s];
      back[q * S + s] = stay >= jump ? s : bi;
    }
    [score, next] = [next, score];
    let mn = Infinity; for (let s = 0; s < S; s++) if (score[s] < mn) mn = score[s];
    for (let s = 0; s < S; s++) score[s] -= mn;
  }
  let s = 0; for (let q = 1; q < S; q++) if (score[q] > score[s]) s = q;
  // Sure of it when there's a low part held for longer than a kick lasts, standing above what's higher up, and one note stands out of the semitones around.
  const midi = new Float32Array(n), conf = new Float32Array(n), top = pct(rms, 0.95) || 1, heldRms = new Float32Array(n), W2 = Math.round(BASS_HZ * 0.2);
  { const buf = []; for (let q = 0; q < n; q++) { buf.length = 0; for (let k = Math.max(0, q - W2); k <= Math.min(n - 1, q + W2); k += 2) buf.push(rms[k]); buf.sort((a, c) => a - c); heldRms[q] = buf[Math.floor(buf.length * 0.35)]; } }
  for (let q = n - 1; q >= 0; q--) {
    let num = 0, den = 0;
    for (let d = -1; d <= 1; d++) { const k = s + d; if (k >= 0 && k < S) { const v = sal[q * S + k] ** 4; num += k * v; den += v; } }
    midi[q] = BASS_LO + (den > 0 ? num / den : s);
    let row = 0; for (let k = 0; k < S; k++) row += sal[q * S + k];
    conf[q] = clamp01(heldRms[q] / top) * clamp01((lowShare[q] - 0.2) / 0.5) * clamp01((S / Math.max(row, 1e-6) - 1.3) / 1.5) * sal[q * S + s];
    s = back[q * S + s];
  }
  return { hz: (SR / D) / hopD, midi, conf };
}

// ---------------------------------------------------------------- cut: the groove. Mid and side low-passed, resampled at 512 samples a bar, as RG8 (128 is zero)
const CUT_W = 512, CUT_HZ = 120;
function biquadLP(x, fc) {
  // two Butterworth sections, forwards and backwards: no lag, about 48 dB an octave
  const out = Float64Array.from(x);
  for (const Q of [0.5412, 1.3066]) {
    const w0 = (2 * Math.PI * fc) / SR, al = Math.sin(w0) / (2 * Q), c = Math.cos(w0), a0 = 1 + al;
    const b0 = (1 - c) / 2 / a0, b1 = (1 - c) / a0, b2 = b0, a1 = (-2 * c) / a0, a2 = (1 - al) / a0;
    for (const dir of [1, -1]) {
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let n = 0; n < out.length; n++) {
        const i = dir > 0 ? n : out.length - 1 - n, v = out[i], y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = v; y2 = y1; y1 = y; out[i] = y;
      }
    }
  }
  return out;
}
function cuts(mid, side, A, edges) {
  // Slow bars would alias at 120 Hz, since 512 a bar is all there is: the cutoff comes down with the longest bar
  let longest = 0;
  for (let i = 0; i + 1 < edges.length; i++) longest = Math.max(longest, edges[i + 1] - edges[i]);
  const fc = Math.min(CUT_HZ, 0.42 * CUT_W / Math.max(longest, 1e-3));
  const m = biquadLP(mid, fc), s = biquadLP(side, fc), bars = edges.length - 1, data = new Uint8Array(bars * CUT_W * 2);
  const peak = a => { const h = new Float32Array(Math.floor(a.length / 8)); for (let i = 0; i < h.length; i++) h[i] = Math.abs(a[i * 8]); return pct(h, 0.999) || 1e-6; };
  const pm = peak(m), ps = peak(s), gm = 127 / pm, gs = 127 / Math.max(ps, pm / 8);     // side has its own scale, but noise isn't raised more than 8 times over mid
  const read = (a, t) => { const x = t * SR; if (x < 0 || x >= a.length - 1) return 0; const i = Math.floor(x), f = x - i; return a[i] * (1 - f) + a[i + 1] * f; };
  // Even in beats through the bar, on the song's own clock: the tau table, inverted
  const tau = A.tau, tauHz = A.tauHz || 100, tauAt = t => { const x = Math.max(0, Math.min(tau.length - 1.001, t * tauHz)), i = Math.floor(x), f = x - i; return tau[i] * (1 - f) + tau[i + 1] * f; };
  let k = 0;
  const timeAt = b => { while (k + 2 < tau.length && tau[k + 1] < b) k++; while (k > 0 && tau[k] > b) k--; const d = tau[k + 1] - tau[k]; return (k + (d > 0 ? (b - tau[k]) / d : 0)) / tauHz; };
  for (let i = 0; i < bars; i++) {
    const t0 = edges[i], t1 = edges[i + 1];
    const inside = tau && t0 >= 0 && t1 <= (tau.length - 1) / tauHz, b0 = inside ? tauAt(t0) : 0, b1 = inside ? tauAt(t1) : 0;
    for (let j = 0; j < CUT_W; j++) {
      const u = j / CUT_W, t = inside ? timeAt(b0 + (b1 - b0) * u) : t0 + (t1 - t0) * u, o = 2 * (i * CUT_W + j);
      data[o] = Math.max(0, Math.min(255, Math.round(128 + gm * read(m, t))));
      data[o + 1] = Math.max(0, Math.min(255, Math.round(128 + gs * read(s, t))));
    }
  }
  return { data, width: CUT_W, height: bars, format: 'RG8', zero: 128, cutoff: fc, edges: Float64Array.from(edges), midPeak: pm, sidePeak: ps };
}

// ---------------------------------------------------------------- all of it
// L, R: Float32Array at 22050 Hz. A: the main analysis, read only.
export async function extras(L, R, A, onProgress = () => {}) {
  const t0 = Date.now(), lap = {}, n = Math.min(L.length, R.length), duration = n / SR;
  const stamp = (name, p) => { lap[name] = Date.now() - stamp.t; stamp.t = Date.now(); onProgress(p); };
  stamp.t = t0;
  const mid = new Float32Array(n), side = new Float32Array(n);
  for (let i = 0; i < n; i++) { mid[i] = (L[i] + R[i]) * 0.5; side[i] = (L[i] - R[i]) * 0.5; }
  const S = await spectra(mid, p => onProgress(0.25 * p));
  stamp('spectra', 0.25); await yieldNow();
  const edges = barEdges(A);
  const bassPitch = bassLine(mid, duration);
  stamp('bass', 0.33); await yieldNow();
  const wave = waves(mid, duration, bassPitch);
  stamp('wave', 0.42); await yieldNow();
  const hp = hpss(S);
  stamp('hpss', 0.45);
  const snare = snares(S, A), clip = clips(mid, S, duration, A.E);
  stamp('snareclip', 0.48); await yieldNow();
  const fill = fills(S, A);
  stamp('fill', 0.5);
  const { L: logs } = logEnvelopes(S.T, S.frames);
  const trem = tremolo(logs, S, duration);
  stamp('trem', 0.55); await yieldNow();
  const shim = shimmer(logs, S.frames, duration);
  stamp('shim', 0.62); await yieldNow();
  const air = airs(S, duration);
  stamp('air', 0.68);
  const width = widths(mid, side, duration);
  const echo = echoes(S, A);
  stamp('echo', 0.75); await yieldNow();
  const voices = voicesOf(A, edges, S.rms), sustain = sustains(hp, edges);
  stamp('voices', 0.9); await yieldNow();
  const cut = cuts(mid, side, A, edges);
  stamp('cut', 1);
  return {
    version: EXTRAS_VERSION, duration, sr: SR, seconds: (Date.now() - t0) / 1000, lap,
    barEdges: Float64Array.from(edges),
    wave, snare, clip, fill, trem, shim, air, width, echo, voices, sustain, bassPitch, cut,
    // Did this song give an answer at all? A world can look here instead of finding a row of zeros.
    heard: { wave: wave.share, trem: trem.share > 0, air: air.song > 0, echo: !!echo.song, fills: fill.runs.length },
  };
}

// All the typed arrays in it, for handing over from a worker without a copy.
export function buffersOf(o, out = new Set()) {
  if (ArrayBuffer.isView(o)) out.add(o.buffer);
  else if (Array.isArray(o)) o.forEach(v => buffersOf(v, out));
  else if (o && typeof o === 'object') Object.values(o).forEach(v => buffersOf(v, out));
  return out;
}

// What a worker needs of A. No audio, and much less to copy than the whole of it.
export const slimA = A => ({
  duration: A.duration, beats: A.beats, bars: A.bars, barBeats: A.barBeats, meter: A.meter, bpm: A.bpm,
  tau: A.tau, tauHz: A.tauHz, chroma: A.chroma, chordStep: A.chordStep, chord: A.chord, segments: A.segments, E: A.E,
});

// ---------------------------------------------------------------- the browser's end: stereo at 22050, a worker, and its own cache
// Its own database, so nothing about the film's cached analyses can change: the key is EXTRAS_VERSION:hash.
const DB = 'trippee-extras', STORE = 'extras';
const openDB = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
export async function cacheGet(key) {
  try {
    const db = await openDB();
    return await new Promise(res => { const q = db.transaction(STORE).objectStore(STORE).get(key); q.onsuccess = () => res(q.result ?? null); q.onerror = () => res(null); });
  } catch { return null; }
}
export async function cachePut(key, value) {
  try {
    const db = await openDB();
    await new Promise(res => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(value, key); tx.oncomplete = () => res(); tx.onerror = () => res(); });
  } catch { /* a private window: it just listens again next time */ }
}
function inWorker(L, R, A, onProgress) {
  return new Promise((res, rej) => {
    let w;
    try { w = new Worker(new URL('./extras.worker.js', import.meta.url), { type: 'module' }); }
    catch { extras(L, R, A, onProgress).then(res, rej); return; }
    w.onmessage = e => {
      if (e.data.progress !== undefined) onProgress(e.data.progress);
      else if (e.data.result) { w.terminate(); res(e.data.result); }
      else if (e.data.error) { w.terminate(); rej(new Error(e.data.error)); }
    };
    w.onerror = e => { w.terminate(); rej(new Error(e.message || 'extras worker failed')); };
    w.postMessage({ L, R, A: slimA(A) }, [L.buffer, R.buffer]);
  });
}
// decoded: the song's AudioBuffer. A: its analysis. hash: its song hash. Resolves with the extras, from the cache if they've been heard before.
export async function listenExtras(decoded, A, hash, onProgress = () => {}) {
  const key = `${EXTRAS_VERSION}:${hash}`, hit = await cacheGet(key);
  if (hit) return hit;
  const off = new OfflineAudioContext(2, Math.ceil(decoded.duration * SR), SR);
  const s = off.createBufferSource(); s.buffer = decoded; s.connect(off.destination); s.start();
  const r = await off.startRendering();
  const X = await inWorker(r.getChannelData(0).slice(0), r.getChannelData(1).slice(0), A, onProgress);
  X.hash = hash; X.channels = decoded.numberOfChannels;
  await cachePut(key, X);
  return X;
}
