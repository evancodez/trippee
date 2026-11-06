// The song, moment by moment, as curves the picture can read at any time. Worked out once when the film is composed, so frame() stays
// a pure function of t. Nothing here is a jump: a pulse has an attack that arrives on the beat, because the whole song is known.
//
//   pulse   the beat: every beat a soft swell, as strong as what's actually played on it
//   melody  the tune, in semitones about its local mean, held through short gaps
//   tone    how bright the sound is, slowly
//   energy  how big this moment of the song is, slowly
//   chords  when the harmony changes, and to what
import { clamp, rng, smoother, lerp } from './curves.js';

const HZ = 60;
const smooth = (a, r) => {
  const out = Float32Array.from(a);
  const k = Math.exp(-1 / Math.max(r, 1e-3));
  for (let i = 1; i < out.length; i++) out[i] = k * out[i - 1] + (1 - k) * out[i];
  for (let i = out.length - 2; i >= 0; i--) out[i] = k * out[i + 1] + (1 - k) * out[i];
  return out;
};
const pct = (a, p) => { const s = Array.from(a).sort((x, y) => x - y); return s[Math.floor((s.length - 1) * p)] || 0; };

export function buildReact(A, seed = 1) {
  const n = Math.ceil(A.duration * HZ) + 2, fps = A.fps;
  const at = (arr, t) => (arr ? arr[clamp(Math.round(t * fps), 0, arr.length - 1)] || 0 : 0);
  const resample = arr => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = at(arr, i / HZ); return o; };

  // the pulse
  const pulse = new Float32Array(n);
  const beats = A.beats || [], meter = A.meter || 4, down = new Set(A.barBeats ? Array.from(A.barBeats) : []);
  const strengths = [];
  for (let b = 0; b < beats.length; b++) {
    const t = beats[b]; let s = 0;
    for (let d = -0.05; d <= 0.07; d += 0.02) s = Math.max(s, at(A.perc, t + d) * 0.7 + at(A.bass, t + d) * 0.5 + at(A.onset, t + d) * 0.4);
    strengths.push(s);
  }
  const hi = Math.max(pct(strengths, 0.92), 1e-3);
  for (let b = 0; b < beats.length; b++) {
    const t = beats[b], next = beats[b + 1] ?? t + 0.6, len = Math.max(next - t, 0.2);
    const s = (0.35 + 0.65 * clamp(strengths[b] / hi)) * (down.has(b) ? 1 : 0.72);
    const atk = Math.min(0.11, len * 0.25), dec = Math.min(0.55, len * 0.62);
    const i0 = Math.max(0, Math.floor((t - atk) * HZ)), i1 = Math.min(n - 1, Math.ceil((t + dec * 3) * HZ));
    for (let i = i0; i <= i1; i++) {
      const x = i / HZ - t;
      const v = x < 0 ? smoother((x + atk) / atk) : Math.exp(-x / dec);
      pulse[i] = Math.max(pulse[i], v * s);
    }
  }
  // the melody, only while it's being sung or played
  const mRaw = resample(A.m), vRaw = resample(A.voiced);
  const melody = new Float32Array(n);
  let held = 0;
  for (let i = 0; i < n; i++) {
    const v = vRaw[i] > 0.35 ? clamp(mRaw[i] / 6, -1.4, 1.4) : held * 0.992;
    held = v; melody[i] = v;
  }
  const mel = smooth(melody, 2.5);
  // tone and size
  const br = smooth(resample(A.bright), HZ * 0.9), bLo = pct(br, 0.05), bHi = Math.max(pct(br, 0.95), bLo + 1e-3);
  const tone = br.map(v => clamp((v - bLo) / (bHi - bLo)) * 2 - 1);
  const en = smooth(resample(A.E || A.loud), HZ * 0.8), eHi = Math.max(pct(en, 0.97), 1e-3);
  const energy = en.map(v => clamp(v / eHi));
  // the chords: a change on a beat, and a shape for each chord
  const rand = rng((seed * 131 + 7) >>> 0), shapes = new Map();
  const shapeOf = c => {
    if (!shapes.has(c)) {
      const r = rng(((c + 3) * 2654435 + seed * 97) >>> 0);
      shapes.set(c, [0, 1, 2].map(() => ({ x: r.range(-1.25, 1.25), y: r.range(-0.75, 0.75), a: r.sign() * r.range(0.32, 0.62), R: r.range(0.45, 0.95) })));
    }
    return shapes.get(c);
  };
  const chords = [];
  if (A.chord && A.chordStep) {
    const step = A.chordStep / fps;
    let last = -1, lastT = -9;
    for (let i = 0; i < A.chord.length; i++) {
      const c = A.chord[i], t = i * step;
      if (c !== last && t - lastT > 0.8) { chords.push({ t, shape: shapeOf(c) }); last = c; lastT = t; }
    }
  }
  if (!chords.length) chords.push({ t: 0, shape: shapeOf(0) });
  const dummy = rand();
  return { hz: HZ, n, pulse, melody: mel, tone, energy, chords, dummy };
}

const read = (R, arr, t) => { const x = clamp(t * R.hz, 0, R.n - 1.001), i = Math.floor(x); return arr[i] + (arr[i + 1] - arr[i]) * (x - i); };

export function reactAt(R, t) {
  return { pulse: read(R, R.pulse, t), melody: read(R, R.melody, t), tone: read(R, R.tone, t), energy: read(R, R.energy, t) };
}

// The three lenses of the chord in the air at time t. A shape arrives exactly when its chord does.
const GLIDE = 1.4;
export function chordLenses(R, t, out) {
  const c = R.chords;
  let lo = 0, hi = c.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c[m].t <= t) lo = m; else hi = m - 1; }
  // Heading for the next chord in the last moments before it
  const next = c[lo + 1], cur = c[lo];
  const span = next ? Math.min(GLIDE, (next.t - cur.t) * 0.7) : 1;
  const k = next ? smoother((t - (next.t - span)) / span) : 0;
  for (let i = 0; i < 3; i++) {
    const a = cur.shape[i], b = next ? next.shape[i] : a;
    out[i * 4] = lerp(a.x, b.x, k); out[i * 4 + 1] = lerp(a.y, b.y, k); out[i * 4 + 2] = lerp(a.a, b.a, k); out[i * 4 + 3] = lerp(a.R, b.R, k);
  }
  return out;
}
