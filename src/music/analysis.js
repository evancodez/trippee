// Listening to a whole song, once. Pure maths on a mono Float32Array at 22050 Hz: no DOM, so it runs in a worker and in Node.
//
// What comes out is a description of the song's form, not a stream of hits: a smooth beat clock tau(t), bars and phrases,
// sections with an identity (so a chorus can come back, even lifted a step), and slow curves. Drums help only the clock.
// Everything here is filtered forwards and backwards, so nothing lags.

export const SR = 22050;
export const HOP = 512;
export const FPS = SR / HOP;
export const ANALYSIS_VERSION = 5;
const TAU_HZ = 100;
// The flux of a frame peaks a little after the onset that caused it. Measured against synthetic ground truth.
const ONSET_LAG = -0.008;

// ---------------------------------------------------------------- small tools
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}
const hann = n => Float32Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));

// centred box smooth, r samples either side, with passes it tends to a Gaussian. Zero lag.
function smooth(a, r, passes = 1) {
  r = Math.max(1, Math.round(r));
  let src = a;
  for (let p = 0; p < passes; p++) {
    const out = new Float32Array(src.length);
    let sum = 0, n = 0;
    for (let i = 0; i < src.length + r; i++) {
      if (i < src.length) { sum += src[i]; n++; }
      if (i - 2 * r - 1 >= 0) { sum -= src[i - 2 * r - 1]; n--; }
      if (i - r >= 0 && i - r < src.length) out[i - r] = sum / n;
    }
    src = out;
  }
  return src;
}
const gaussK = sig => { const r = Math.ceil(sig * 3), k = new Float64Array(2 * r + 1); for (let i = -r; i <= r; i++) k[i + r] = Math.exp(-0.5 * (i / sig) ** 2); return { k, r }; };
function gauss64(a, sig) {
  const { k, r } = gaussK(sig), out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) { let s = 0, w = 0; for (let j = -r; j <= r; j++) { const q = i + j; if (q >= 0 && q < a.length) { s += a[q] * k[j + r]; w += k[j + r]; } } out[i] = s / w; }
  return out;
}
// scale to 0..1 between the quiet end and nearly the loudest, so one snare can't flatten the whole song
function norm(a, lo = 0.05, hi = 0.98) {
  const s = Float32Array.from(a).sort(), l = s[Math.floor(s.length * lo)] || 0, h = s[Math.floor(s.length * hi)] || 1;
  const out = new Float32Array(a.length), k = 1 / Math.max(h - l, 1e-9);
  for (let i = 0; i < a.length; i++) out[i] = Math.min(1, Math.max(0, (a[i] - l) * k));
  return out;
}
const pct = (a, p) => { const s = Float32Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0; };
const mean = a => { let s = 0; for (const x of a) s += x; return s / Math.max(a.length, 1); };
const std = a => { const m = mean(a); let s = 0; for (const x of a) s += (x - m) ** 2; return Math.sqrt(s / Math.max(a.length, 1)); };
const yieldNow = () => new Promise(r => setTimeout(r, 0));
function med(buf, n) {
  for (let i = 1; i < n; i++) { const x = buf[i]; let j = i - 1; while (j >= 0 && buf[j] > x) { buf[j + 1] = buf[j]; j--; } buf[j + 1] = x; }
  return buf[n >> 1];
}

// ---------------------------------------------------------------- 1. sustained sound and drums, apart (median-filter HPSS)
const BANDS = 64;
function bandEdges(win) {
  const mel = f => 2595 * Math.log10(1 + f / 700), inv = m => 700 * (Math.pow(10, m / 2595) - 1);
  const lo = mel(30), hi = mel(10500), hz = SR / win, e = [];
  for (let b = 0; b <= BANDS; b++) e.push(Math.max(1, Math.round(inv(lo + (hi - lo) * b / BANDS) / hz)));
  for (let b = 1; b <= BANDS; b++) if (e[b] <= e[b - 1]) e[b] = e[b - 1] + 1;
  return e;
}
async function separate(samples, tick) {
  const WIN = 1024, frames = Math.max(1, Math.floor((samples.length - WIN) / HOP) + 1), w = hann(WIN);
  const re = new Float32Array(WIN), im = new Float32Array(WIN), edges = bandEdges(WIN);
  const E = new Float32Array(frames * BANDS);
  const rms = new Float32Array(frames), centroid = new Float32Array(frames), flux = new Float32Array(frames);
  const prev = new Float32Array(WIN / 2);
  for (let f = 0; f < frames; f++) {
    const o = f * HOP;
    let e = 0;
    for (let i = 0; i < WIN; i++) { const s = samples[o + i]; e += s * s; re[i] = s * w[i]; im[i] = 0; }
    rms[f] = Math.sqrt(e / WIN);
    fft(re, im);
    let num = 0, den = 0, fl = 0;
    for (let k = 1; k < WIN / 2; k++) {
      const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      num += k * m; den += m;
      const l = Math.log1p(m * 8), dl = l - prev[k];
      if (dl > 0) fl += dl;
      prev[k] = l;
      re[k] = m;
    }
    flux[f] = fl;
    centroid[f] = den > 0 ? (num / den) * (SR / WIN) : 0;
    for (let b = 0; b < BANDS; b++) {
      let s = 0;
      for (let k = edges[b]; k < edges[b + 1] && k < WIN / 2; k++) s += re[k];
      E[f * BANDS + b] = s / Math.max(edges[b + 1] - edges[b], 1);
    }
    if (f % 1500 === 0) { tick(0.25 * f / frames); await yieldNow(); }
  }
  // along time, the median keeps what's sustained; across frequency, what's a broadband hit
  const HW = 8, PW = 4, buf = new Float32Array(32);
  const harm = new Float32Array(frames), perc = new Float32Array(frames), bass = new Float32Array(frames);
  const hzOf = b => (edges[b] + edges[b + 1]) * 0.5 * (SR / WIN);
  for (let f = 0; f < frames; f++) {
    for (let b = 0; b < BANDS; b++) {
      const x = E[f * BANDS + b];
      let n = 0;
      for (let t = Math.max(0, f - HW); t <= Math.min(frames - 1, f + HW); t++) buf[n++] = E[t * BANDS + b];
      const H = med(buf, n);
      n = 0;
      for (let q = Math.max(0, b - PW); q <= Math.min(BANDS - 1, b + PW); q++) buf[n++] = E[f * BANDS + q];
      const P = med(buf, n);
      const h2 = H * H, p2 = P * P, mask = h2 / Math.max(h2 + p2, 1e-12);
      harm[f] += x * mask; perc[f] += x * (1 - mask);
      if (hzOf(b) < 180) bass[f] += x;
    }
    if (f % 2000 === 0) { tick(0.25 + 0.1 * f / frames); await yieldNow(); }
  }
  return { frames, rms, centroid, flux, harm, perc, bass, E };
}

// ---------------------------------------------------------------- 2. the melody: harmonic salience, then a smooth Viterbi path
const PMIN = 45, SEMI = 5, STATES = 48 * SEMI;      // MIDI 45 (110 Hz) up four octaves, a fifth of a semitone apart

async function melody(samples, frames, tick) {
  const N = 2048, SR2 = SR / 2, half = Math.floor(samples.length / 2), low = new Float32Array(half);
  for (let i = 0; i < half; i++) low[i] = (samples[i * 2] + samples[i * 2 + 1]) * 0.5;
  const w = hann(N), re = new Float32Array(N), im = new Float32Array(N), hz = SR2 / N;
  const maxBin = Math.min(N / 2 - 2, Math.floor(3400 / hz)), H2 = HOP / 2;
  const sal = new Float32Array(frames * STATES), peakSum = new Float32Array(frames), chroma = new Float32Array(frames * 12);
  const mag = new Float32Array(maxBin + 2);
  const prior = Float32Array.from({ length: STATES }, (_, s) => { const m = PMIN + s / SEMI; return Math.exp(-0.5 * ((m - 68) / 17) ** 2); });
  const px = new Float32Array(24), pa = new Float32Array(24);
  for (let f = 0; f < frames; f++) {
    const o = f * H2 - N / 2 + H2;
    for (let i = 0; i < N; i++) { const j = o + i; re[i] = (j >= 0 && j < half ? low[j] : 0) * w[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k <= maxBin + 1; k++) mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    let np = 0, floor = 0;
    for (let k = 4; k <= maxBin; k++) floor += mag[k];
    floor = (floor / maxBin) * 1.4;
    for (let k = 4; k <= maxBin; k++) {
      const m = mag[k];
      if (m > floor && m >= mag[k - 1] && m > mag[k + 1] && m > mag[k - 2] * 1.05 && m > mag[k + 2] * 1.05) {
        const la = Math.log(mag[k - 1] + 1e-6), lb = Math.log(m + 1e-6), lc = Math.log(mag[k + 1] + 1e-6);
        const dk = 0.5 * (la - lc) / (la - 2 * lb + lc || 1), fr = (k + dk) * hz;
        if (np < 24) { px[np] = fr; pa[np] = m; np++; }
        else { let mi = 0; for (let q = 1; q < 24; q++) if (pa[q] < pa[mi]) mi = q; if (m > pa[mi]) { px[mi] = fr; pa[mi] = m; } }
      }
    }
    const base = f * STATES;
    let sum = 0;
    for (let i = 0; i < np; i++) {
      const a = Math.pow(pa[i], 0.7);
      sum += a;
      const midi = 69 + 12 * Math.log2(px[i] / 440);
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      if (midi > 36 && midi < 100) chroma[f * 12 + pc] += a;
      for (let h = 1; h <= 7; h++) {
        const m0 = midi - 12 * Math.log2(h), x = (m0 - PMIN) * SEMI, c = Math.round(x);
        if (c < 1 || c >= STATES - 1) continue;
        const wh = a * Math.pow(0.78, h - 1), d = x - c;
        sal[base + c] += wh * (1 - 0.5 * d * d);
        sal[base + c - 1] += wh * 0.42;
        sal[base + c + 1] += wh * 0.42;
      }
    }
    peakSum[f] = sum;
    for (let s = 0; s < STATES; s++) sal[base + s] *= prior[s];
    if (f % 1200 === 0) { tick(0.35 + 0.3 * f / frames); await yieldNow(); }
  }
  const best = new Float32Array(frames);
  for (let f = 0; f < frames; f++) { let m = 0; for (let s = 0; s < STATES; s++) { const v = sal[f * STATES + s]; if (v > m) m = v; } best[f] = m; }
  const ceil = smooth(best, FPS * 2, 2);
  for (let f = 0; f < frames; f++) { const k = 1 / Math.max(Math.max(best[f], ceil[f]), 1e-6); for (let s = 0; s < STATES; s++) sal[f * STATES + s] *= k; }

  const WINDOW = 14, JUMP = 2.6, STEP = 0.022;
  let score = new Float32Array(STATES), next = new Float32Array(STATES);
  const back = new Int16Array(frames * STATES);
  for (let f = 0; f < frames; f++) {
    let bi = 0, bv = -Infinity;
    for (let s = 0; s < STATES; s++) if (score[s] > bv) { bv = score[s]; bi = s; }
    const row = f * STATES;
    for (let s = 0; s < STATES; s++) {
      let v = bv - JUMP, from = bi;
      const a = Math.max(0, s - WINDOW), b = Math.min(STATES - 1, s + WINDOW);
      for (let q = a; q <= b; q++) { const c = score[q] - STEP * Math.abs(q - s); if (c > v) { v = c; from = q; } }
      next[s] = v + sal[row + s];
      back[row + s] = from;
    }
    [score, next] = [next, score];
    let mn = Infinity;
    for (let s = 0; s < STATES; s++) if (score[s] < mn) mn = score[s];
    for (let s = 0; s < STATES; s++) score[s] -= mn;
    if (f % 2000 === 0) { tick(0.65 + 0.1 * f / frames); await yieldNow(); }
  }
  let s = 0;
  for (let q = 1; q < STATES; q++) if (score[q] > score[s]) s = q;
  const path = new Int16Array(frames);
  for (let f = frames - 1; f >= 0; f--) { path[f] = s; s = back[f * STATES + s]; }
  const raw = new Float32Array(frames), conf = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const c = path[f], row = f * STATES;
    let num = 0, den = 0;
    for (let q = Math.max(0, c - 2); q <= Math.min(STATES - 1, c + 2); q++) { num += q * sal[row + q]; den += sal[row + q]; }
    raw[f] = PMIN + (den > 0 ? num / den : c) / SEMI;
    conf[f] = sal[row + c];
  }
  return { raw, conf, chroma, peakSum };
}

// ---------------------------------------------------------------- 3. harmony: chroma, 24 triads through a Viterbi, the key
const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
function harmony(chroma, frames) {
  const STEP = 4, n = Math.max(1, Math.floor(frames / STEP));
  const C = new Float32Array(n * 12);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < STEP * 3; k++) { const f = Math.min(frames - 1, Math.max(0, i * STEP + k - STEP)); for (let p = 0; p < 12; p++) C[i * 12 + p] += chroma[f * 12 + p]; }
    let m = 0; for (let p = 0; p < 12; p++) m = Math.max(m, C[i * 12 + p]);
    if (m > 0) for (let p = 0; p < 12; p++) C[i * 12 + p] /= m;
  }
  const total = new Float32Array(12);
  for (let i = 0; i < n * 12; i++) total[i % 12] += C[i];
  let key = 0, minor = false, bk = -Infinity;
  for (let r = 0; r < 12; r++) for (const [prof, isMin] of [[MAJ, false], [MIN, true]]) {
    let s = 0; for (let p = 0; p < 12; p++) s += total[(p + r) % 12] * prof[p];
    if (s > bk) { bk = s; key = r; minor = isMin; }
  }
  const T = [];
  for (let r = 0; r < 12; r++) for (let q = 0; q < 2; q++) T.push([r, (r + (q ? 3 : 4)) % 12, (r + 7) % 12]);
  let score = new Float32Array(24), next = new Float32Array(24);
  const back = new Uint8Array(n * 24), PEN = 2.2;
  for (let i = 0; i < n; i++) {
    let bi = 0; for (let t = 1; t < 24; t++) if (score[t] > score[bi]) bi = t;
    for (let t = 0; t < 24; t++) {
      const [a, b, c] = T[t];
      const obs = C[i * 12 + a] * 1.15 + C[i * 12 + b] + C[i * 12 + c];
      const stay = score[t], jump = score[bi] - PEN;
      next[t] = (stay >= jump ? stay : jump) + obs;
      back[i * 24 + t] = stay >= jump ? t : bi;
    }
    [score, next] = [next, score];
    const mn = Math.min(...score);
    for (let t = 0; t < 24; t++) score[t] -= mn;
  }
  let s = 0; for (let t = 1; t < 24; t++) if (score[t] > score[s]) s = t;
  const chord = new Uint8Array(n);
  for (let i = n - 1; i >= 0; i--) { chord[i] = s; s = back[i * 24 + s]; }
  return { C, chord, key, minor, step: STEP };
}

// ---------------------------------------------------------------- 4. the clock
// Tempogram: 12 s Hann windows at 1 s hop, Viterbi over 120 log-spaced tempos. Replaces one global BPM.
function tempoPath(on) {
  const frames = on.length, W = Math.min(frames, Math.round(12 * FPS)), H = Math.round(FPS), K = 120;
  const bpm = Float32Array.from({ length: K }, (_, i) => 50 * Math.pow(4, i / (K - 1)));
  const prior = bpm.map(b => Math.exp(-0.5 * (Math.log2(b / 120) / 0.75) ** 2));
  const nw = Math.max(1, Math.floor((frames - W) / H) + 1), maxLag = Math.ceil((60 / 50) * FPS * 2) + 2;
  const win = hann(W), x = new Float32Array(W), ac = new Float32Array(maxLag + 1), em = new Float32Array(nw * K);
  const lagAt = l => { const a = Math.floor(l), f = l - a; return ac[a] * (1 - f) + ac[Math.min(maxLag, a + 1)] * f; };
  for (let w = 0; w < nw; w++) {
    const o = w * H;
    let m = 0;
    for (let i = 0; i < W; i++) { x[i] = on[o + i] * win[i]; m += x[i]; }
    m /= W;
    for (let i = 0; i < W; i++) x[i] -= m;
    for (let l = 0; l <= maxLag; l++) { let s = 0; for (let i = 0; i + l < W; i++) s += x[i] * x[i + l]; ac[l] = s; }
    const n0 = ac[0] || 1;
    for (let k = 0; k < K; k++) {
      const L = 60 * FPS / bpm[k];
      const e = Math.max(0, lagAt(L) / n0) + 0.5 * Math.max(0, lagAt(Math.min(maxLag, 2 * L)) / n0);
      em[w * K + k] = e * prior[k];
    }
  }
  // Tempo stays put unless it has a good reason
  const JUMP = 24, step = Math.log2(4) / (K - 1);
  let score = new Float32Array(K), next = new Float32Array(K);
  const back = new Uint8Array(nw * K);
  for (let w = 0; w < nw; w++) {
    for (let k = 0; k < K; k++) {
      let bv = -Infinity, bi = k;
      for (let q = 0; q < K; q++) { const v = score[q] - JUMP * Math.abs(q - k) * step; if (v > bv) { bv = v; bi = q; } }
      next[k] = bv + em[w * K + k];
      back[w * K + k] = bi;
    }
    [score, next] = [next, score];
  }
  let s = 0;
  for (let k = 1; k < K; k++) if (score[k] > score[s]) s = k;
  const path = new Float32Array(nw);
  for (let w = nw - 1; w >= 0; w--) { path[w] = bpm[s]; s = back[w * K + s]; }
  return { path, hopFrames: H, centre: W / 2 };
}

// Ellis's dynamic-programming tracker, using the period of the moment
function trackBeats(on, tp) {
  const n = on.length, sd = std(on) || 1, C = new Float32Array(n), B = new Int32Array(n).fill(-1), TIGHT = 100;
  const periodAt = f => {
    const w = Math.max(0, Math.min(tp.path.length - 1, Math.round((f - tp.centre) / tp.hopFrames)));
    return 60 * FPS / tp.path[w];
  };
  for (let t = 0; t < n; t++) {
    const P = periodAt(t), lo = Math.round(P * 0.6), hi = Math.round(P * 1.6);
    let bv = -Infinity, bp = -1;
    for (let p = Math.max(0, t - hi); p <= t - lo; p++) {
      const lg = Math.log((t - p) / P), v = C[p] - TIGHT * lg * lg;
      if (v > bv) { bv = v; bp = p; }
    }
    const o = on[t] / sd;
    if (bp >= 0 && bv > 0) { C[t] = o + bv; B[t] = bp; } else C[t] = o;
  }
  const P0 = periodAt(n - 1);
  let t = n - 1, mx = -Infinity;
  for (let i = Math.max(0, n - Math.round(P0 * 2)); i < n; i++) if (C[i] > mx) { mx = C[i]; t = i; }
  const rev = [];
  for (; t >= 0; t = B[t]) rev.push(t);
  rev.reverse();
  // Before the first and after the last tracked beat, keep going at the local tempo so the clock covers the whole song
  const out = [];
  if (rev.length) {
    const first = rev[0];
    const pre = [];
    for (let f = first - periodAt(first); f > -periodAt(0); f -= periodAt(Math.max(0, f))) pre.push(f);
    out.push(...pre.reverse(), ...rev);
    for (let f = rev[rev.length - 1] + periodAt(n - 1); f < n + 2 * periodAt(n - 1); f += periodAt(n - 1)) out.push(f);
  }
  return Float64Array.from(out, f => (f + 1) / FPS - ONSET_LAG);
}

// A drum machine keeps perfect time and a tracker doesn't quite. If one straight line of beats explains the onsets as well as
// the tracked path does, it's the truth, and the clock has no wobble at all. A human band won't pass this and keeps its path.
function fitGrid(on, raw, duration) {
  const inside = [];
  for (const t of raw) if (t >= 0 && t < duration) inside.push(t);
  if (inside.length < 32) return null;
  const sm = smooth(on, 1);
  const at = t => { const x = Math.max(0, Math.min(sm.length - 1.001, (t + ONSET_LAG) * FPS - 1)), i = Math.floor(x), f = x - i; return sm[i] * (1 - f) + sm[i + 1] * f; };
  let dp = 0;
  for (const t of inside) dp += at(t);
  const P0 = (inside[inside.length - 1] - inside[0]) / (inside.length - 1);
  let best = -1, bP = P0, bA = 0;
  const steps = 200, span = 0.015;
  for (let k = -steps; k <= steps; k++) {
    const P = P0 * (1 + span * k / steps), n = Math.floor(duration / P);
    for (let ph = 0; ph < 32; ph++) {
      const a = (ph / 32) * P;
      let s = 0;
      for (let i = 0; i < n; i++) s += at(a + i * P);
      if (s > best) { best = s; bP = P; bA = a; }
    }
  }
  // refine the phase
  for (let d = -0.02; d <= 0.02; d += 0.002) {
    const n = Math.floor(duration / bP), a = bA + d;
    let s = 0;
    for (let i = 0; i < n; i++) s += at(a + i * bP);
    if (s > best) { best = s; bA = a; }
  }
  const scale = inside.length / Math.max(1, Math.floor(duration / bP));
  if (best * scale < dp * 0.9) return { used: false, ratio: best * scale / dp, bpm: 60 / bP };
  bA -= 0.012;      // the same small offset the path's calibration allows for
  const start = bA - bP * Math.ceil((bA + bP) / bP);
  const beats = [];
  for (let t = start; t < duration + 2 * bP; t += bP) beats.push(t);
  return { used: true, ratio: best * scale / dp, bpm: 60 / bP, beats: Float64Array.from(beats) };
}

// Beat intervals, 9-beat median, Gaussian sigma 8, integrate, add back the residual low-passed at sigma 16. Sampled at 100 Hz.
function buildTau(raw, duration) {
  const n = raw.length, d = new Float64Array(n - 1), buf = new Float32Array(9);
  for (let i = 0; i + 1 < n; i++) d[i] = raw[i + 1] - raw[i];
  const m9 = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) { let c = 0; for (let k = -4; k <= 4; k++) { const q = i + k; if (q >= 0 && q < n - 1) buf[c++] = d[q]; } m9[i] = med(buf, c); }
  const s = gauss64(m9, 8);
  const hat = new Float64Array(n); hat[0] = raw[0];
  for (let i = 1; i < n; i++) hat[i] = hat[i - 1] + s[i - 1];
  const res = new Float64Array(n);
  for (let i = 0; i < n; i++) res[i] = raw[i] - hat[i];
  const lp = gauss64(res, 16);
  const beats = new Float64Array(n);
  for (let i = 0; i < n; i++) beats[i] = hat[i] + lp[i];
  for (let i = 1; i < n; i++) if (beats[i] <= beats[i - 1]) beats[i] = beats[i - 1] + 1e-3;
  // tau at 100 Hz: piecewise-linear through the beats, then Gaussian smoothed to take out the kinks.
  // Worked out with margin either side and cropped, so smoothing never sees an edge.
  const PAD = 300, count = Math.ceil(duration * TAU_HZ) + 2, full = new Float64Array(count + 2 * PAD);
  const rate = new Float32Array(count);
  const beatAt = j => beats[Math.max(0, Math.min(n - 1, j))];
  const headP = beats[1] - beats[0], tailP = beats[n - 1] - beats[n - 2];
  let j = 0;
  for (let k = 0; k < full.length; k++) {
    const t = (k - PAD) / TAU_HZ;
    if (t <= beats[0]) { full[k] = (t - beats[0]) / headP; continue; }
    if (t >= beats[n - 1]) { full[k] = n - 1 + (t - beats[n - 1]) / tailP; continue; }
    while (j < n - 2 && beatAt(j + 1) <= t) j++;
    full[k] = j + (t - beats[j]) / (beats[j + 1] - beats[j]);
  }
  const sm0 = gauss64(full, 25), sm = sm0.slice(PAD, PAD + count);
  for (let k = 1; k < count; k++) if (sm[k] <= sm[k - 1]) sm[k] = sm[k - 1] + 1e-5;
  for (let k = 0; k < count; k++) {
    const a = Math.max(0, k - 5), b = Math.min(count - 1, k + 5);
    rate[k] = (sm[b] - sm[a]) * TAU_HZ / (b - a);
  }
  return { beats, tau: sm, rate };
}

// Bar position by Viterbi for meters 3 and 4, scored on chord change and bass onset. The better meter wins.
function findBars(beats, chordChange, bassOn) {
  const n = beats.length;
  const fit = meter => {
    const w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = 1.2 * chordChange[i] + 0.7 * bassOn[i];
    const SWITCH = 3 * (mean(w) + 0.01);
    let score = new Float32Array(meter), next = new Float32Array(meter);
    const back = new Uint8Array(n * meter);
    for (let i = 0; i < n; i++) {
      let bi = 0; for (let s = 1; s < meter; s++) if (score[s] > score[bi]) bi = s;
      for (let s = 0; s < meter; s++) {
        const prev = (s + meter - 1) % meter;
        const stay = score[prev], jump = score[bi] - SWITCH;
        next[s] = (stay >= jump ? stay : jump) + (s === 0 ? w[i] : 0);
        back[i * meter + s] = stay >= jump ? prev : bi;
      }
      [score, next] = [next, score];
    }
    let s = 0; for (let q = 1; q < meter; q++) if (score[q] > score[s]) s = q;
    const pos = new Uint8Array(n);
    for (let i = n - 1; i >= 0; i--) { pos[i] = s; s = back[i * meter + s]; }
    let a = 0, b = 0, na = 0, nb = 0;
    for (let i = 0; i < n; i++) { if (pos[i] === 0) { a += w[i]; na++; } else { b += w[i]; nb++; } }
    const contrast = (a / Math.max(na, 1) - b / Math.max(nb, 1)) / (std(w) + 1e-6);
    return { pos, contrast, meter };
  };
  const m4 = fit(4), m3 = fit(3);
  return m3.contrast > m4.contrast * 1.2 + 0.05 ? m3 : m4;
}

// ---------------------------------------------------------------- 5. sections and repetition
function dct13(logmel) {
  const out = new Float32Array(13), N = logmel.length;
  for (let k = 0; k < 13; k++) { let s = 0; for (let i = 0; i < N; i++) s += logmel[i] * Math.cos(Math.PI * k * (i + 0.5) / N); out[k] = s / N; }
  return out;
}

async function sections(F, barBeats, beats, duration, tick) {
  // F: per beat { chroma[12] mean-free unit, timbre[DIMT] unit }
  const n = F.n, DC = 12, DT = F.dimT, ch = F.chroma, tb = F.timbre;
  const dotC = (i, j, rot = 0) => { let s = 0; const a = i * DC, b = j * DC; for (let p = 0; p < 12; p++) s += ch[a + p] * ch[b + (p + rot) % 12]; return s; };
  const dotT = (i, j) => { let s = 0; const a = i * DT, b = j * DT; for (let d = 0; d < DT; d++) s += tb[a + d] * tb[b + d]; return s; };
  const sim0 = new Float32Array(n * n);
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) { const v = 0.5 * dotC(i, j) + 0.5 * dotT(i, j); sim0[i * n + j] = v; sim0[j * n + i] = v; }
  await yieldNow();

  // Foote novelty, kernels 16 and 64 beats wide
  const foote = H => {
    const out = new Float32Array(n), sig = H / 2;
    const k = new Float32Array(H * H);
    for (let a = 0; a < H; a++) for (let b = 0; b < H; b++) k[a * H + b] = Math.exp(-0.5 * ((a * a + b * b) / (sig * sig)));
    for (let c = 0; c < n; c++) {
      let s = 0, wsum = 0;
      for (let a = 0; a < H; a++) {
        const i0 = c - 1 - a, i1 = c + a;
        if (i0 < 0 || i1 >= n) continue;
        for (let b = 0; b < H; b++) {
          const j0 = c - 1 - b, j1 = c + b;
          if (j0 < 0 || j1 >= n) continue;
          const w = k[a * H + b];
          s += w * (sim0[i0 * n + j0] + sim0[i1 * n + j1] - sim0[i0 * n + j1] - sim0[i1 * n + j0]);
          wsum += w;
        }
      }
      out[c] = wsum > 0 ? Math.max(0, s / wsum) : 0;
    }
    return out;
  };
  const n16 = foote(8), n64 = foote(32);
  const p16 = pct(n16, 0.95) || 1, p64 = pct(n64, 0.95) || 1;
  const novelty = new Float32Array(n);
  for (let i = 0; i < n; i++) novelty[i] = 0.55 * n16[i] / p16 + 0.45 * n64[i] / p64;
  tick(0.86); await yieldNow();

  // Peaks of novelty, on the bar grid. Stronger peaks win, at least about 8 s and 4 bars apart.
  const barLen = barBeats.length > 1 ? (barBeats[barBeats.length - 1] - barBeats[0]) / (barBeats.length - 1) : 4;
  const beatDur = (beats[Math.min(n, beats.length - 1)] - beats[0]) / Math.max(1, Math.min(n, beats.length - 1));
  const barSec = barLen * beatDur;
  const gap = Math.round(Math.max(4 * barSec, Math.min(8 * barSec, 12)) / beatDur);
  const nearBar = b => { let best = barBeats[0] ?? 0, bd = 1e9; for (const x of barBeats) { const d = Math.abs(x - b); if (d < bd) { bd = d; best = x; } } return best; };
  const thr = mean(novelty) + 0.6 * std(novelty);
  const maxCuts = Math.max(2, Math.round(duration / 14));
  const peaks = [];
  for (let i = 2; i < n - 2; i++) {
    let isMax = novelty[i] > thr;
    for (let k = -4; k <= 4 && isMax; k++) if (k && i + k >= 0 && i + k < n && novelty[i + k] > novelty[i]) isMax = false;
    if (isMax) peaks.push([i, novelty[i]]);
  }
  peaks.sort((a, b) => b[1] - a[1]);
  const cuts = [];
  for (const [i] of peaks) {
    const b = nearBar(i);
    if (b < gap || n - b < gap) continue;
    if (cuts.length < maxCuts && cuts.every(c => Math.abs(c - b) >= gap)) cuts.push(b);
  }
  cuts.sort((a, b) => a - b);
  const edges = [0, ...cuts, n];
  const segs = [];
  for (let i = 0; i + 1 < edges.length; i++) segs.push({ b0: edges[i], b1: edges[i + 1] });

  // Recurrence: mutual nearest neighbours, thresholds per beat. A chorus lifted a step still matches, through a rotation of chroma.
  const TOP = 0.15;
  const tau = new Float32Array(n), row = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let c = 0;
    for (let j = 0; j < n; j++) if (Math.abs(i - j) >= 4) row[c++] = sim0[i * n + j];
    const part = row.subarray(0, c).sort();
    tau[i] = part[Math.floor(c * (1 - TOP))] ?? 1;
  }
  const meanChroma = s => { const m = new Float32Array(12); for (let i = s.b0; i < s.b1; i++) for (let p = 0; p < 12; p++) m[p] += ch[i * 12 + p]; return m; };
  segs.forEach(s => { s.mc = meanChroma(s); });
  const align = (A, B, rot, wantPath) => {
    const la = A.b1 - A.b0, lb = B.b1 - B.b0;
    const hit = new Uint8Array(la * lb);
    for (let i = 0; i < la; i++) for (let j = 0; j < lb; j++) {
      const a = A.b0 + i, b = B.b0 + j;
      const v = 0.5 * dotC(a, b, rot) + 0.5 * dotT(a, b);
      hit[i * lb + j] = v >= tau[a] && v >= tau[b] ? 1 : 0;
    }
    // diagonal majority over 16 beats, so one bar of luck doesn't count and one bad bar doesn't break a run
    const R = 8, dg = new Uint8Array(la * lb);
    for (let i = 0; i < la; i++) for (let j = 0; j < lb; j++) {
      let on = 0, c = 0;
      for (let k = -R; k <= R; k++) { const p = i + k, q = j + k; if (p >= 0 && p < la && q >= 0 && q < lb) { on += hit[p * lb + q]; c++; } }
      dg[i * lb + j] = on * 2 >= c ? 1 : 0;
    }
    // Smith-Waterman through it
    const H = new Float32Array((la + 2) * (lb + 2)), W = lb + 2, P = wantPath ? new Uint8Array((la + 2) * W) : null;
    let best = 0, bi = 0, bj = 0;
    for (let i = 2; i < la + 2; i++) for (let j = 2; j < lb + 2; j++) {
      const s = dg[(i - 2) * lb + (j - 2)] ? 1 : -1;
      const d = H[(i - 1) * W + j - 1] + s, u = H[(i - 2) * W + j - 1] + s - 1.5, l = H[(i - 1) * W + j - 2] + s - 1.5;
      let v = 0, from = 0;
      if (d > v) { v = d; from = 1; }
      if (u > v) { v = u; from = 2; }
      if (l > v) { v = l; from = 3; }
      H[i * W + j] = v;
      if (P) P[i * W + j] = from;
      if (v > best) { best = v; bi = i; bj = j; }
    }
    const score = best / Math.max(1, Math.min(la, lb));
    if (!wantPath) return { score, raw: best };
    const path = [];
    let i = bi, j = bj;
    while (i >= 2 && j >= 2 && P[i * W + j]) {
      path.push([i - 2, j - 2]);
      const f = P[i * W + j];
      if (f === 1) { i--; j--; } else if (f === 2) { i -= 2; j--; } else { i--; j -= 2; }
    }
    return { score, path: path.reverse() };
  };
  const rotsFor = (A, B) => {
    // A lifted chorus is a step or three away. Further than that, two different chord loops can look alike by accident.
    const r = [];
    for (const rot of [0, 1, 2, 3, 9, 10, 11]) { let s = 0; for (let p = 0; p < 12; p++) s += A.mc[p] * B.mc[(p + rot) % 12]; r.push([rot, s]); }
    r.sort((a, b) => b[1] - a[1]);
    const out = [0];
    for (const [rot] of r.slice(0, 2)) if (!out.includes(rot)) out.push(rot);
    return out;
  };
  const meanTimbre = g => { const m = new Float32Array(DT); for (let i = g.b0; i < g.b1; i++) for (let d = 0; d < DT; d++) m[d] += tb[i * DT + d]; let l = 0; for (let d = 0; d < DT; d++) l += m[d] * m[d]; l = Math.sqrt(l) || 1; for (let d = 0; d < DT; d++) m[d] /= l; return m; };
  const cosT = (A, B) => { let s = 0; for (let d = 0; d < DT; d++) s += A.mt[d] * B.mt[d]; return s; };
  const bestAlign = (A, B) => {
    let best = { score: 0, raw: 0, rot: 0 };
    for (const rot of rotsFor(A, B)) {
      const r = align(A, B, rot, false);
      if (r.raw > best.raw) best = { score: r.score, raw: r.raw, rot };
    }
    return best;
  };
  segs.forEach(g => { g.mt = meanTimbre(g); });
  // Neighbours saying the same thing are one section: a loop going round isn't a boundary. They must also sound alike overall.
  for (let i = segs.length - 1; i > 0; i--) {
    const a = segs[i - 1], b = segs[i], r = bestAlign(a, b);
    if (r.raw >= 12 && r.score >= 0.7 && cosT(a, b) >= 0.6) {
      a.b1 = b.b1;
      for (let p = 0; p < 12; p++) a.mc[p] += b.mc[p];
      a.mt = meanTimbre(a);
      segs.splice(i, 1);
    }
  }
  // Identity: each section against the first of every label so far. It has to repeat most of the longer of the two, and sound
  // alike overall. Against a prototype and not by chains, so that a shared chord loop can't glue a whole song into one label.
  const protos = [];
  for (const g of segs) {
    let pick = null, pickV = 0;
    for (const P of protos) {
      const r = bestAlign(P, g), v = r.raw / Math.max(P.b1 - P.b0, g.b1 - g.b0), c = cosT(P, g);
      if (r.raw >= 12 && v >= 0.45 && c >= 0.5 && v > pickV) { pick = P; pickV = v; }
    }
    if (pick) g.proto = pick; else { g.proto = g; protos.push(g); }
  }
  tick(0.93); await yieldNow();

  // Labels by order of first appearance, visit counts, and the map from each later beat to the beat it repeats
  const canon = Int32Array.from({ length: n }, (_, i) => i);
  segs.forEach(s => {
    const L = protos.indexOf(s.proto);
    s.label = L < 26 ? String.fromCharCode(65 + L) : 'Z' + L;
    const firstSeg = s.proto;
    s.visit = (firstSeg.visits = (firstSeg.visits || 0) + 1) - 1;
    s.rot = 0;
    if (s === firstSeg) return;
    let best = { score: -1 }, bestRot = 0;
    for (const rot of rotsFor(firstSeg, s)) {
      const res = align(firstSeg, s, rot, true);
      if (res.score > best.score + (rot === 0 ? 0 : 0.03)) { best = res; bestRot = rot; }
    }
    // rot says how far this visit is from the first, in semitones (-5..6)
    s.rot = bestRot > 6 ? bestRot - 12 : bestRot;
    if (!best.path || !best.path.length) {
      for (let j = s.b0; j < s.b1; j++) { const c = firstSeg.b0 + (j - s.b0); canon[j] = c < firstSeg.b1 ? c : j; }
      return;
    }
    const lb = s.b1 - s.b0, off = new Float32Array(lb).fill(NaN);
    for (const [a, b] of best.path) off[b] = a - b;
    let lastOff = best.path[0][0] - best.path[0][1];
    for (let j = 0; j < lb; j++) { if (Number.isNaN(off[j])) off[j] = lastOff; else lastOff = off[j]; }
    for (let j = 0; j < lb; j++) {
      const c = firstSeg.b0 + j + off[j];
      canon[s.b0 + j] = c >= firstSeg.b0 && c < firstSeg.b1 ? c : s.b0 + j;
    }
  });
  const out = segs.map(s => ({ b0: s.b0, b1: s.b1, t0: s.b0 === 0 ? 0 : beats[s.b0], t1: s.b1 >= n ? duration : beats[s.b1], label: s.label, visit: s.visit, rot: s.rot }));
  return { segments: out, canon, novelty };
}

// ---------------------------------------------------------------- all of it
export async function analyse(samples, onProgress = () => {}) {
  const duration = samples.length / SR;
  const S = await separate(samples, onProgress), frames = S.frames;
  const M = await melody(samples, frames, onProgress);
  onProgress(0.76); await yieldNow();
  const Hm = harmony(M.chroma, frames);
  onProgress(0.78); await yieldNow();

  const dbNorm = a => norm(a.map(x => Math.log1p(x * 30)));
  const loud = dbNorm(smooth(S.rms, FPS * 0.05, 2));
  const harm = dbNorm(smooth(S.harm, 3, 2)), perc = dbNorm(smooth(S.perc, 1));
  const bright = norm(smooth(S.centroid, FPS * 0.4));
  const bass = norm(smooth(S.bass, 1), 0.1, 0.99);
  const E = norm(smooth(Float32Array.from(S.rms, x => Math.log1p(x * 30)), FPS * 0.15, 3), 0.02, 0.98);

  // melody: how sure, its height, and a slow semitone curve about its local mean
  const presence = norm(smooth(M.peakSum, FPS * 0.15, 2), 0.1, 0.98);
  const conf = new Float32Array(frames);
  for (let i = 0; i < frames; i++) conf[i] = Math.min(1, M.conf[i] * 1.15) * Math.min(1, presence[i] * 1.6);
  const voiced = smooth(Float32Array.from(conf, x => (x > 0.26 ? 1 : 0)), FPS * 0.09, 2);
  const med5 = new Float32Array(frames), mbuf = new Float32Array(5);
  for (let i = 0; i < frames; i++) { let n = 0; for (let k = -2; k <= 2; k++) mbuf[n++] = M.raw[Math.min(frames - 1, Math.max(0, i + k))]; med5[i] = med(mbuf, 5); }
  const pitch = smooth(med5, 2, 2);

  // the clock, from onsets of drums and of new notes alike
  const fluxA = smooth(S.flux, FPS * 0.5), onsetRaw = new Float32Array(frames);
  for (let i = 0; i < frames; i++) onsetRaw[i] = Math.max(0, S.flux[i] - fluxA[i]);
  const onset = norm(onsetRaw, 0.1, 0.99);
  const tp = tempoPath(onset);
  const rawBeats = trackBeats(onset, tp);
  const grid = fitGrid(onset, rawBeats, duration);
  const clock = buildTau(grid?.used ? grid.beats : rawBeats, duration);
  onProgress(0.81); await yieldNow();
  // only the beats inside the song
  let bFirst = 0;
  while (bFirst < clock.beats.length && clock.beats[bFirst] < 0) bFirst++;
  let bLast = clock.beats.length;
  while (bLast > 0 && clock.beats[bLast - 1] >= duration) bLast--;
  const beats = clock.beats.slice(bFirst, bLast);
  // re-index tau so that tau(beats[i]) = i
  for (let k = 0; k < clock.tau.length; k++) clock.tau[k] -= bFirst;
  const N = beats.length;

  // beat-synchronous features
  const fOf = t => Math.max(0, Math.min(frames - 1, Math.round(t * FPS)));
  const chordAt = t => Hm.chord[Math.min(Hm.chord.length - 1, Math.floor(fOf(t) / Hm.step))];
  const DIMT = 13 + 4;
  const chroma = new Float32Array(N * 12), timbre = new Float32Array(N * DIMT), meanLog = new Float32Array(BANDS);
  const cc = new Float32Array(N), bo = new Float32Array(N);
  const pv = []; for (let i = 0; i < frames; i += 4) if (voiced[i] > 0.5) pv.push(pitch[i]);
  const pLow = pv.length ? pct(pv, 0.05) : 57, pHigh = pv.length ? pct(pv, 0.95) : 76, pMid = pv.length ? pct(pv, 0.5) : 66;
  const held = new Float32Array(frames);
  { let hp = pMid; for (let i = 0; i < frames; i++) { if (voiced[i] > 0.4) hp = pitch[i]; held[i] = hp; } }
  const localPitch = smooth(held, FPS * 3.5, 2);
  for (let i = 0; i < N; i++) {
    const t0 = beats[i], t1 = i + 1 < N ? beats[i + 1] : Math.min(duration, t0 + (i ? beats[i] - beats[i - 1] : 0.5));
    const f0 = fOf(t0), f1 = Math.max(f0 + 1, fOf(t1));
    meanLog.fill(0);
    let e = 0, hm = 0, pr = 0, vc = 0, reg = 0;
    for (let f = f0; f < f1; f++) {
      for (let p = 0; p < 12; p++) chroma[i * 12 + p] += M.chroma[f * 12 + p];
      for (let b = 0; b < BANDS; b++) meanLog[b] += Math.log1p(S.E[f * BANDS + b] * 40);
      e += E[f]; hm += S.harm[f]; pr += S.perc[f]; vc += voiced[f]; reg += localPitch[f];
    }
    const cnt = f1 - f0;
    for (let b = 0; b < BANDS; b++) meanLog[b] /= cnt;
    const d = dct13(meanLog);
    // c0 is loudness, handled apart
    for (let k = 1; k < 13; k++) timbre[i * DIMT + k - 1] = d[k] * 2;
    timbre[i * DIMT + 12] = d[0] * 0.5;
    timbre[i * DIMT + 13] = (e / cnt) * 1.2;
    timbre[i * DIMT + 14] = (pr / Math.max(pr + hm, 1e-6)) * 2;
    timbre[i * DIMT + 15] = (vc / cnt) * 0.8;
    timbre[i * DIMT + 16] = ((reg / cnt - pLow) / Math.max(pHigh - pLow, 2)) * 0.8;
    // chroma: mean free, unit length, so its dot product is a correlation
    let m = 0; for (let p = 0; p < 12; p++) m += chroma[i * 12 + p]; m /= 12;
    let l2 = 0; for (let p = 0; p < 12; p++) { chroma[i * 12 + p] -= m; l2 += chroma[i * 12 + p] ** 2; }
    l2 = Math.sqrt(l2) || 1;
    for (let p = 0; p < 12; p++) chroma[i * 12 + p] /= l2;
    // what changes on this beat?
    const dur = t1 - t0;
    cc[i] = chordAt(t0 + dur * 0.5) !== chordAt(t0 - dur * 0.5) ? 1 : 0;
    let b0 = 0, b1 = 0;
    for (let f = Math.max(0, f0 - 4); f < f0; f++) b0 += bass[f];
    for (let f = f0; f < Math.min(frames, f0 + 4); f++) b1 = Math.max(b1, bass[f]);
    bo[i] = Math.max(0, b1 - b0 / 4);
  }
  // timbre: z-score across the song, then unit length per beat
  for (let d = 0; d < DIMT; d++) {
    let m = 0, s = 0;
    for (let i = 0; i < N; i++) m += timbre[i * DIMT + d];
    m /= Math.max(N, 1);
    for (let i = 0; i < N; i++) s += (timbre[i * DIMT + d] - m) ** 2;
    s = Math.sqrt(s / Math.max(N, 1)) || 1;
    for (let i = 0; i < N; i++) timbre[i * DIMT + d] = (timbre[i * DIMT + d] - m) / s;
  }
  for (let i = 0; i < N; i++) {
    let l2 = 0; for (let d = 0; d < DIMT; d++) l2 += timbre[i * DIMT + d] ** 2;
    l2 = Math.sqrt(l2) || 1;
    for (let d = 0; d < DIMT; d++) timbre[i * DIMT + d] /= l2;
  }

  // bars
  const fit = findBars(beats, cc, bo);
  const meter = fit.meter, barBeats = [];
  for (let i = 0; i < N; i++) if (fit.pos[i] === 0) barBeats.push(i);
  if (!barBeats.length) barBeats.push(0);
  const bars = Float64Array.from(barBeats, i => beats[i]);
  onProgress(0.83); await yieldNow();

  const { segments, canon, novelty } = await sections({ n: N, chroma, timbre, dimT: DIMT }, barBeats, beats, duration, onProgress);

  // phrase length: which grid of bars do the changes keep falling on?
  const barNov = Float32Array.from(barBeats, b => { let m = 0; for (let k = -1; k <= 1; k++) m = Math.max(m, novelty[Math.max(0, Math.min(N - 1, b + k))] || 0); return m; });
  let phraseBars = 8, phrase0 = 0, bestP = -Infinity;
  const mB = mean(barNov), sB = std(barNov) || 1;
  for (const P of [2, 4, 8, 16]) for (let k = 0; k < P; k++) {
    let s = 0, c = 0;
    for (let i = k; i < barNov.length; i += P) { s += barNov[i]; c++; }
    if (c < 2) continue;
    // z-like: how far this comb sits above chance, with a nudge towards the common lengths
    const z = (s / c - mB) / sB * Math.sqrt(c) + (P === 8 ? 0.4 : P === 4 ? 0.3 : 0);
    if (z > bestP) { bestP = z; phraseBars = P; phrase0 = k; }
  }

  // the song's long shape: 16-bar energy
  const barDur = N > 1 ? (beats[N - 1] - beats[0]) / (N - 1) * meter : 2;
  const arc = norm(smooth(E, FPS * barDur * 4, 2));
  let climax = 0, cv = -1;
  for (let f = 0; f < frames; f += 4) { const u = f / frames, v = arc[f] * (u > 2 / 3 ? 1.15 : u > 1 / 3 ? 1 : 0.9); if (v > cv) { cv = v; climax = f / FPS; } }

  // chord onsets, autocorrelated at the phrase lag: does this song breathe in phrases?
  const barChord = new Float32Array(barBeats.length);
  for (let i = 0; i < barBeats.length; i++) { const b0 = barBeats[i], b1 = barBeats[i + 1] ?? N; let s = 0; for (let b = b0; b < b1; b++) s += bo[b] + cc[b] + (E[fOf(beats[b])] - 0.5); barChord[i] = s; }
  const acAt = lag => {
    const m = mean(barChord); let num = 0, den = 0;
    for (let i = 0; i < barChord.length; i++) { const x = barChord[i] - m; den += x * x; if (i + lag < barChord.length) num += x * (barChord[i + lag] - m); }
    return den > 0 ? num / den : 0;
  };
  const swellRegularity = Math.max(0, Math.min(1, Math.max(acAt(phraseBars), acAt(phraseBars * 2)) * 1.4));

  // character: each 0..1
  // A slide: the tune moving steadily, one way, between 2 and 15 semitones a second, for at least 200 ms. A new note is too quick.
  let glideFrames = 0, voicedFrames = 0, run = 0, sign = 0;
  for (let i = 2; i < frames - 2; i++) {
    if (voiced[i] < 0.5) { if (run >= 9) glideFrames += run; run = 0; continue; }
    voicedFrames++;
    const d = (pitch[i + 2] - pitch[i - 2]) * FPS / 4, a = Math.abs(d), sg = Math.sign(d);
    if (a >= 2 && a <= 15 && (run === 0 || sg === sign)) { run++; sign = sg; }
    else { if (run >= 9) glideFrames += run; run = 0; }
  }
  let pSum = 0, hSum = 0;
  for (let i = 0; i < frames; i++) { pSum += S.perc[i]; hSum += S.harm[i]; }
  let changes = 0;
  for (let i = 0; i < N; i++) changes += cc[i];
  const meanBpm = N > 1 ? 60 * (N - 1) / (beats[N - 1] - beats[0]) : 120;
  const character = {
    slide: Math.min(1, (glideFrames / Math.max(voicedFrames, 1)) * 6),
    perc: Math.min(1, Math.max(0, (pSum / Math.max(pSum + hSum, 1e-6) - 0.15) / 0.45)),
    tempo: Math.min(1, Math.max(0, (meanBpm - 60) / 120)),
    harmRate: Math.min(1, (changes / Math.max(barBeats.length, 1)) / 1.5),
  };

  // m: melody in semitones about a 16-bar local mean, held and decaying through gaps
  const span = smooth(held, FPS * barDur * 8);
  const m = new Float32Array(frames);
  { let last = 0; for (let i = 0; i < frames; i++) { const x = voiced[i] > 0.4 ? pitch[i] - span[i] : last * 0.995; last = Math.max(-12, Math.min(12, x)); m[i] = last; } }
  onProgress(1);

  return {
    version: ANALYSIS_VERSION, duration, fps: FPS, frames, samples: samples.length,
    loud, harm, perc, bright, bass, onset, E, pitch, voiced, m,
    chroma: Hm.C, chord: Hm.chord, chordStep: Hm.step, key: Hm.key, minor: Hm.minor,
    beats, tau: clock.tau, rate: clock.rate, tauHz: TAU_HZ, bpm: meanBpm,
    meter, bars, barBeats: Int32Array.from(barBeats), downbeat: barBeats[0], phraseBars, phrase0,
    novelty, segments, canon, arc, climax, swellRegularity, character,
    range: [pLow, pMid, pHigh], meterContrast: fit.contrast, grid: grid ? { used: grid.used, ratio: +grid.ratio.toFixed(3), bpm: +grid.bpm.toFixed(2) } : null,
  };
}
