// The song, moment by moment, as curves the picture can read at any time. Worked out once when the film is composed, so frame() stays
// a pure function of t. Nothing here is a jump: a pulse has an attack that arrives on the beat, because the whole song is known.
//
//   pulse   the strong beats, not every drum hit: a soft swell on a rhythm chosen for each kind of section
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

  // The pulse. Hitting every drum is what makes a picture jerky, so each kind of section gets one rhythm of strong beats and keeps it:
  // the 1 and the 3, or only the 1, or (where the tempo is quick) every other bar. In 3/4 it's the 1. How often depends on the tempo and how
  // big the section is, because a pulse should feel like breathing: quiet sections breathe slowly. It only goes where something's played.
  const pulse = new Float32Array(n), pulses = [];
  const beats = A.beats || [], meter = A.meter || 4;
  const downs = A.barBeats ? Array.from(A.barBeats) : [];
  const firstDown = downs.length ? downs[0] : 0;
  const posOf = b => ((b - firstDown) % meter + meter) % meter;
  // What's on each beat: the low end and where the harmony moves. Snares sit on 2 and 4, so they don't count here.
  const chordAt = t => (A.chord && A.chordStep ? A.chord[clamp(Math.floor(t * fps / A.chordStep), 0, A.chord.length - 1)] : 0);
  const weight = beats.map((t, b) => {
    let low = 0;
    for (let d = -0.04; d <= 0.07; d += 0.02) low = Math.max(low, at(A.bass, t + d));
    const moved = b > 0 && chordAt(t + 0.06) !== chordAt(beats[b - 1] + 0.06) ? 0.5 : 0;
    return low + moved;
  });
  const hi = Math.max(pct(weight, 0.92), 1e-3);
  const energyAt = t => at(A.E || A.loud, t);
  const segs = A.segments?.length ? A.segments : [{ t0: 0, t1: A.duration, label: 'A' }];
  const byLabel = new Map(), choices = [];
  const beatIdx = t => { let lo = 0, h = beats.length - 1; while (lo < h) { const m = (lo + h) >> 1; if (beats[m] < t) lo = m + 1; else h = m; } return lo; };
  for (const seg of segs) {
    const b0 = beatIdx(seg.t0), b1 = Math.max(b0, beatIdx(seg.t1));
    let choice = byLabel.get(seg.label);
    if (!choice) {
      const acc = new Array(meter).fill(0), cnt = new Array(meter).fill(0);
      for (let b = b0; b < b1; b++) { const q = posOf(b); acc[q] += weight[b]; cnt[q]++; }
      for (let q = 0; q < meter; q++) acc[q] /= Math.max(cnt[q], 1);
      // If the bar's been found a beat out, the weight sits on the "wrong" beats. Then it's the music that's right.
      let start = 0;
      if (meter === 4 && acc[1] + acc[3] > (acc[0] + acc[2]) * 1.3) start = acc[1] >= acc[3] ? 1 : 3;
      else if (meter === 4 && acc[2] > acc[0] * 1.35) start = 2;
      const beatLen = (seg.t1 - seg.t0) / Math.max(b1 - b0, 1);
      let e = 0, c = 0; for (let t = seg.t0; t < seg.t1; t += 0.5) { e += energyAt(t); c++; }
      const big = clamp((c ? e / c : 0.5) / 0.6);
      const want = lerp(3, 1.6, big);        // seconds between pulses
      const opts = meter === 3 ? [3, 6, 12] : [2, 4, 8];
      let best = opts[1], bestCost = 1e9;
      for (const every of opts) {
        let cost = Math.abs(Math.log(every * beatLen / want));
        // The 3 has to be earning its place: if there's little on it, the 1 alone is the rhythm.
        if (meter === 4 && every === 2 && acc[(start + 2) % 4] < 0.6 * acc[start]) cost += 0.8;
        if (cost < bestCost) { bestCost = cost; best = every; }
      }
      choice = { every: best, start };
      byLabel.set(seg.label, choice);
    }
    choices.push({ t0: seg.t0, label: seg.label, every: choice.every, start: choice.start });
    for (let b = b0; b < b1; b++) {
      // Counted through the whole song, so the rhythm doesn't restart at a section's edge
      const fromDown = ((b - firstDown - choice.start) % (choice.every) + choice.every) % choice.every;
      if (fromDown === 0) pulses.push({ b, t: beats[b], main: posOf(b) === choice.start });
    }
  }
  for (let k = 0; k < pulses.length; k++) {
    const { b, t, main } = pulses[k], next = pulses[k + 1]?.t ?? t + 2, len = Math.max(next - t, 0.5);
    const present = clamp((energyAt(t) - 0.03) / 0.15);
    const s = (0.55 + 0.45 * clamp(weight[b] / hi)) * (main ? 1 : 0.72) * present;
    const atk = Math.min(0.2, len * 0.14), dec = Math.min(1, len * 0.42);
    const i0 = Math.max(0, Math.floor((t - atk) * HZ)), i1 = Math.min(n - 1, Math.ceil((t + dec * 4) * HZ));
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
  // A sung note changes pitch in a moment. Smoothed over a tenth of a second, it arrives as a glide, or the lines would twitch on every note.
  const mel = smooth(melody, HZ * 0.1);
  // How much the tune is there at all, and a slower version of it, for what moves the whole sheet
  const voiced = smooth(vRaw.map(v => (v > 0.35 ? 1 : 0)), HZ * 0.5);
  const melSlow = smooth(melody, HZ * 0.45);
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
  return { hz: HZ, n, pulse, pulses: pulses.map(p => p.t), choices, melody: mel, melSlow, voiced, tone, energy, chords, dummy };
}

// Flow surges just after a strong beat and glides until the next, arriving at the same place on the beat clock each time, so it stays
// locked to the song and nothing jumps. tau is the beat clock.
const SURGE = 0.42;
export function surgedBeats(R, tau, t) {
  const P = R.pulses;
  if (!P || P.length < 2 || t < P[0] || t >= P[P.length - 1]) return tau(t);
  let lo = 0, hi = P.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m] <= t) lo = m; else hi = m; }
  const b0 = tau(P[lo]), b1 = tau(P[lo + 1]), x = (tau(t) - b0) / Math.max(b1 - b0, 1e-3);
  return b0 + (b1 - b0) * (x + (SURGE / (2 * Math.PI)) * Math.sin(2 * Math.PI * x));
}

const read = (R, arr, t) => { const x = clamp(t * R.hz, 0, R.n - 1.001), i = Math.floor(x); return arr[i] + (arr[i + 1] - arr[i]) * (x - i); };

export function reactAt(R, t) {
  return { pulse: read(R, R.pulse, t), melody: read(R, R.melody, t), melSlow: read(R, R.melSlow, t), voiced: read(R, R.voiced, t), tone: read(R, R.tone, t), energy: read(R, R.energy, t) };
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
