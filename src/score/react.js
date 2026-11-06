// The song, moment by moment, as curves the picture can read at any time. Worked out once when the film is composed, so frame() stays
// a pure function of t. Nothing here is a jump: a pulse has an attack that arrives on the beat, because the whole song is known.
//
//   pulse   the strong beats, not every drum hit: a soft swell on a rhythm chosen for each kind of section
//   melody  the tune, in semitones about its local mean, held through short gaps
//   tone    how bright the sound is, slowly
//   energy  how big this moment of the song is, slowly
//   chords  when the harmony changes, and to what
//   lung    the phrase breathing: a slow swell that ends on each breath, and how deep it is
//   tension, px, py   how far the harmony has gone from home, and where to: arrives with its chord
//   gains   who's leading: drums, tune, tone, harm, each 0.2..1, eased over the bar before a breath
//
// Every table runs on the collapsed axis, c = M.C(t): the song's seconds with its rests taken out. So a table holds still through a rest, and the sound coming back
// finds it exactly in step, however long the picture's own clock takes to catch up. Read them with reactAt(R, c), where c = R.C(song seconds), never the picture's clock.
// With no rests in a song c is t. Only R.pulses stays on the song's own seconds, because the flow it surges is the picture's.
import { clamp, rng, smoother, lerp } from './curves.js';
import { understand } from '../music/understand.js';
import { flag } from './flags.js';

const HZ = 60;
const LENS_WALK = 4.5;    // seconds it takes the chord lenses to get all the way to a new chord's shape
const smooth = (a, r) => {
  const out = Float32Array.from(a);
  const k = Math.exp(-1 / Math.max(r, 1e-3));
  for (let i = 1; i < out.length; i++) out[i] = k * out[i - 1] + (1 - k) * out[i];
  for (let i = out.length - 2; i >= 0; i--) out[i] = k * out[i + 1] + (1 - k) * out[i];
  return out;
};
const pct = (a, p) => { const s = Array.from(a).sort((x, y) => x - y); return s[Math.floor((s.length - 1) * p)] || 0; };

// The lungs. An attack that ends on the breath, then a decay, each from wherever the last left off, so nothing jumps however the breaths fall.
function lungTable(M, n) {
  const L = new Float32Array(n), P = M.lungs.map(l => ({ c: M.C(l.t), d: l.depth, a: l.attack, k: l.decay }));
  if (!P.length || !flag('lung')) return L;
  const decayed = (k, c) => (k < 0 ? 0 : P[k].d * Math.exp(-(c - P[k].c) / P[k].k));
  for (let i = 0, k = -1; i < n; i++) {
    const c = i / HZ;
    while (k + 1 < P.length && P[k + 1].c <= c) k++;
    const nx = P[k + 1];
    if (nx && c > nx.c - nx.a) {
      const c0 = nx.c - nx.a;
      L[i] = lerp(decayed(k, c0), nx.d, smoother((c - c0) / nx.a));
    } else L[i] = decayed(k, c);
  }
  return smooth(L, HZ * 0.06);      // the top of a breath is round
}
// Where the harmony is. A chord under 1.2 s is passing through and doesn't move anything. The move ends on the chord: it arrives with it, as far ahead as the last chord lasted, a bar at most.
function placeTables(M, n) {
  const px = new Float32Array(n), py = new Float32Array(n), tension = new Float32Array(n), S = [];
  for (const r of M.runs) {
    if (S.length && (r.c === S.at(-1).c || r.t1 - r.t0 < 1.2)) continue;
    const [x, y] = M.place(r.c);
    S.push({ c: r.c, at: M.C(r.t0), x, y, ten: M.tension(r.c) });
  }
  if (!S.length) return { px, py, tension };
  for (let i = 0, k = 0; i < n; i++) {
    const c = i / HZ;
    while (k + 1 < S.length && S[k + 1].at <= c) k++;
    const a = S[k], b = S[k + 1], span = b ? Math.min(M.bar, 0.9 * (b.at - a.at)) : 1, x = b ? smoother((c - (b.at - span)) / span) : 0;
    px[i] = b ? lerp(a.x, b.x, x) : a.x; py[i] = b ? lerp(a.y, b.y, x) : a.y; tension[i] = b ? lerp(a.ten, b.ten, x) : a.ten;
  }
  return { px, py, tension };
}

// Who's leading, eased on this axis, so a rest in the bar before a breath can't cut a piece out of the ease.
function gainTables(M, n) {
  const gDrums = new Float32Array(n).fill(1), gTune = new Float32Array(n).fill(1), gTone = new Float32Array(n).fill(1), gHarm = new Float32Array(n).fill(1);
  const B = M.conductor.map(g => ({ ...g, c: M.C(g.t) }));
  if (!B.length) return { gDrums, gTune, gTone, gHarm };
  for (let i = 0, k = 0; i < n; i++) {
    const c = i / HZ;
    while (k + 1 < B.length && B[k + 1].c <= c) k++;
    const a = B[k], b = B[k + 1], x = b ? smoother((c - (b.c - M.bar)) / M.bar) : 0, to = b ?? a;
    gDrums[i] = lerp(a.drums, to.drums, x); gTune[i] = lerp(a.tune, to.tune, x); gTone[i] = lerp(a.tone, to.tone, x); gHarm[i] = lerp(a.harm, to.harm, x);
  }
  return { gDrums, gTune, gTone, gHarm };
}

export function buildReact(A, seed = 1) {
  const M = understand(A), C = M.C, T = M.T;
  const n = Math.ceil(C(A.duration) * HZ) + 2, fps = A.fps;
  const at = (arr, t) => (arr ? arr[clamp(Math.round(t * fps), 0, arr.length - 1)] || 0 : 0);
  const resample = arr => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = at(arr, T(i / HZ)); return o; };

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
    // Nothing's played in a rest. A beat that's nearly the sound coming back goes with it: it swells into the rest and holds there.
    const rest = M.restAt(t);
    if (rest && t < rest.b - 0.1) continue;
    const tc = C(t);
    const present = clamp((energyAt(t) - 0.03) / 0.15);
    const s = (0.55 + 0.45 * clamp(weight[b] / hi)) * (main ? 1 : 0.72) * present;
    const atk = Math.min(0.32, len * 0.2), dec = Math.min(1, len * 0.42);     // a swell that arrives on the beat, not a kick: the whole sheet takes it
    const i0 = Math.max(0, Math.floor((tc - atk) * HZ)), i1 = Math.min(n - 1, Math.ceil((tc + dec * 4) * HZ));
    for (let i = i0; i <= i1; i++) {
      const x = i / HZ - tc;
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
  // A sung note changes pitch in a moment. Smoothed over about a seventh of a second, it arrives as a glide, or the lines would twitch on every note.
  const mel = smooth(melody, HZ * 0.14);
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
      // Each lens keeps its sign from chord to chord. One turning inside out in the two seconds before a chord pulled the whole picture with it, and that's a lurch, not a shape arriving.
      shapes.set(c, [0, 1, 2].map(i => ({ x: r.range(-1.25, 1.25), y: r.range(-0.75, 0.75), a: (i === 1 ? -1 : 1) * r.range(0.32, 0.62), R: r.range(0.45, 0.95) })));
    }
    return shapes.get(c);
  };
  const chords = [];
  if (A.chord && A.chordStep) {
    const step = A.chordStep / fps;
    let last = -1, lastT = -9;
    for (let i = 0; i < A.chord.length; i++) {
      const c = A.chord[i], t = i * step;
      if (c !== last && t - lastT > 2.0) {
        // Two changes inside one rest land on the same place on this axis: the later one is what the sound comes back to
        if (chords.length && chords.at(-1).t === C(t)) chords.pop();
        chords.push({ t: C(t), shape: shapeOf(c) }); last = c; lastT = t;
      }
    }
  }
  if (!chords.length) chords.push({ t: 0, shape: shapeOf(0) });
  // A chord's shape arrives with it, and it's only reached if there's time. Harmony changing every two seconds would otherwise sweep three lenses across the whole frame
  // from one random place to another, nonstop: so they head that way, as far as they can go at a walk, and a chord that's been waited for gets all of it.
  for (let k = 1; k < chords.length; k++) {
    const b = clamp((chords[k].t - chords[k - 1].t) / LENS_WALK), was = chords[k - 1].shape;
    chords[k].shape = chords[k].shape.map((s, i) => ({ x: lerp(was[i].x, s.x, b), y: lerp(was[i].y, s.y, b), a: lerp(was[i].a, s.a, b), R: lerp(was[i].R, s.R, b) }));
  }
  const dummy = rand();
  // Understanding: the phrase, the harmony, and who's leading. Read in the picture only through what song-sheet.js does with them.
  const lung = lungTable(M, n), { px, py, tension } = placeTables(M, n);
  const gains = gainTables(M, n), { gDrums, gTune, gTone, gHarm } = gains;
  return { hz: HZ, n, pulse, pulses: pulses.map(p => p.t), choices, melody: mel, melSlow, voiced, tone, energy, chords, dummy, M, C, T, lung, px, py, tension, gDrums, gTune, gTone, gHarm, conducted: M.conductor.length > 0 };
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

// Everything at once, at c = R.C(song seconds). Gains are { drums, tune, tone, harm }; px, py is where the harmony has gone from home, tension how far it pulls, lung the phrase's swell (0..1.5).
export function reactAt(R, c) {
  return {
    pulse: read(R, R.pulse, c), melody: read(R, R.melody, c), melSlow: read(R, R.melSlow, c), voiced: read(R, R.voiced, c), tone: read(R, R.tone, c), energy: read(R, R.energy, c),
    lung: read(R, R.lung, c), tension: read(R, R.tension, c), px: read(R, R.px, c), py: read(R, R.py, c),
    gains: { drums: read(R, R.gDrums, c), tune: read(R, R.gTune, c), tone: read(R, R.gTone, c), harm: read(R, R.gHarm, c) },
  };
}
// One table alone, for what reads many samples a frame: the weight field and the tune's history.
export const pulseAt = (R, c) => read(R, R.pulse, c);
export const melodyAt = (R, c) => read(R, R.melody, c);

// The three lenses of the chord in the air at time t (on the collapsed axis, like everything here). A shape arrives exactly when its chord does.
const GLIDE = 3;
export function chordLenses(R, t, out) {
  const c = R.chords;
  let lo = 0, hi = c.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c[m].t <= t) lo = m; else hi = m - 1; }
  // Heading for the next chord in the last moments before it
  const next = c[lo + 1], cur = c[lo];
  const span = next ? Math.min(GLIDE, (next.t - cur.t) * 0.9) : 1;
  const k = next ? smoother((t - (next.t - span)) / span) : 0;
  for (let i = 0; i < 3; i++) {
    const a = cur.shape[i], b = next ? next.shape[i] : a;
    out[i * 4] = lerp(a.x, b.x, k); out[i * 4 + 1] = lerp(a.y, b.y, k); out[i * 4 + 2] = lerp(a.a, b.a, k); out[i * 4 + 3] = lerp(a.R, b.R, k);
  }
  return out;
}
