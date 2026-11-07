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
const limitRate = (a, most) => {
  const o = Float32Array.from(a);
  for (let i = 1; i < o.length; i++) o[i] = clamp(o[i], o[i - 1] - most, o[i - 1] + most);
  for (let i = o.length - 2; i >= 0; i--) o[i] = clamp(o[i], o[i + 1] - most, o[i + 1] + most);
  return o;
};
const TUNE_RATE = 3.5;     // of the melody's units (6 semitones) per second
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

// Hearing 5: the bass under the sheet. Where the bump is goes with the chord's root, each to the octave nearest the last, arriving over the beat before the chord. How hard it pushes comes from the low end smoothed
// over .4 s, so the kick can't get in. Passing chords don't count.
function bassTables(M, A, n, resample) {
  const y = new Float32Array(n), S = [];
  let v = null, low = 0, high = 0;
  for (const r of M.runs) {
    if (r.t1 - r.t0 < 1.2 * M.beat) continue;
    const root = r.c >> 1;
    let w = root;
    if (v != null) { while (w - v > 6) w -= 12; while (v - w > 6) w += 12; }
    v = w; low = Math.min(low, w); high = Math.max(high, w);
    S.push({ at: M.C(r.t0), w });
  }
  const mid = (low + high) / 2;
  if (S.length) for (let i = 0, k = 0; i < n; i++) {
    const c = i / HZ;
    while (k + 1 < S.length && S[k + 1].at <= c) k++;
    const a = S[k], b = S[k + 1], span = b ? Math.min(M.beat, 0.9 * (b.at - a.at)) : 1, x = b ? smoother((c - (b.at - span)) / span) : 0;
    y[i] = BASS_RISE * (lerp(a.w, b ? b.w : a.w, x) - mid);
  }
  const lows = smooth(resample(A.bass), HZ * 0.4), hi = Math.max(pct(lows, 0.95), 1e-3);
  return { bassY: y, bassA: lows.map(v => clamp(v / hi)), bassKick: resample(A.perc) };
}
const BASS_RISE = 0.05;     // picture units per semitone

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

// ears: which of the hearing changes this film has (docs/MODES.md section 6), { 1: true, ... }. None, and this is exactly what it always was.
export function buildReact(A, seed = 1, ears = {}) {
  const M = understand(A, ears), C = M.C, T = M.T;
  const n = Math.ceil(C(A.duration) * HZ) + 2, fps = A.fps;
  const at = (arr, t) => (arr ? arr[clamp(Math.round(t * fps), 0, arr.length - 1)] || 0 : 0);
  const resample = arr => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = at(arr, T(i / HZ)); return o; };

  // The pulse. Hitting every drum is what makes a picture jerky, so each kind of section gets one rhythm of strong beats and keeps it:
  // the 1 and the 3, or only the 1, or (where the tempo is quick) every other bar. In 3/4 it's the 1. How often depends on the tempo and how
  // big the section is, because a pulse should feel like breathing: quiet sections breathe slowly. It only goes where something's played.
  const pulse = new Float32Array(n), pulses = [], R_song = {};
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
  const byLabel = new Map(), choices = [], percHi = ears[1] && A.perc ? pct(A.perc, 0.9) : 1;
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
      // Three in a bar: a chord can change on any of them, so go by what's hit hardest.
      if (meter === 3 && flag('onTheHit')) {
        const hits = [0, 0, 0];
        for (let b = b0; b < b1; b++) { let h = 0; for (let d = -0.04; d <= 0.07; d += 0.02) h = Math.max(h, at(A.bass, beats[b] + d) + at(A.perc, beats[b] + d) + at(A.onset, beats[b] + d)); hits[posOf(b)] += h; }
        const top = hits.indexOf(Math.max(...hits));
        if (hits[top] > hits[0] * 1.15) start = top;
      }
      const beatLen = (seg.t1 - seg.t0) / Math.max(b1 - b0, 1);
      let e = 0, c = 0; for (let t = seg.t0; t < seg.t1; t += 0.5) { e += energyAt(t); c++; }
      const big = clamp((c ? e / c : 0.5) / 0.6);
      const want = ears[1] ? lerp(1.3, 0.9, big) : lerp(3, 1.6, big);        // seconds between pulses
      const opts = meter === 3 ? [3, 6, 12] : [2, 4, 8];
      let best = opts[1], bestCost = 1e9;
      for (const every of opts) {
        let cost = Math.abs(Math.log(every * beatLen / want));
        // The 3 has to be earning its place: if there's little on it, the 1 alone is the rhythm.
        if (meter === 4 && every === 2 && acc[(start + 2) % 4] < (ears[1] ? 0.55 : 0.6) * acc[start]) cost += 0.8;
        // A gait you can walk to: no gap over two seconds unless the song itself is that slow. A quiet section walks shallower, not slower.
        if (ears[1] && every * beatLen > 2 && beatLen < 0.75) cost += 4;
        // ...and not every drum hit either, which is what makes a picture jerky. On a song counted double time, the 1 and 3 are every 4.
        if (ears[1] && every * beatLen < WALK_QUICKEST) cost += 1;
        if (cost < bestCost) { bestCost = cost; best = every; }
      }
      choice = { every: best, start };
      if (ears[1]) {
        choice.acc = acc.map(v => +v.toFixed(2));
        // How deep the stride is, section by section: big sections walk, small ones pour.
        let p = 0, q = 0; for (let t = seg.t0; t < seg.t1; t += 0.25) { p += at(A.perc, t); q++; }
        choice.deep = lerp(WALK_LEAST, 1, clamp(0.55 * big + 0.45 * clamp((q ? p / q : 0) / Math.max(percHi, 1e-3))));
      }
      byLabel.set(seg.label, choice);
    }
    choices.push({ t0: seg.t0, label: seg.label, every: choice.every, start: choice.start, acc: choice.acc, deep: choice.deep });
    for (let b = b0; b < b1; b++) {
      // Counted through the whole song, so the rhythm doesn't restart at a section's edge
      const fromDown = ((b - firstDown - choice.start) % (choice.every) + choice.every) % choice.every;
      if (fromDown === 0) pulses.push({ b, t: beats[b], main: posOf(b) === choice.start, deep: choice.deep });
    }
  }
  // Where a section's rhythm hands over to the next one's it can leave a long gap. The sheet's walking, so it takes a step in the middle of it.
  if (ears[1]) for (let k = pulses.length - 2; k >= 0; k--) {
    const a = pulses[k], z = pulses[k + 1];
    if (z.t - a.t <= WALK_LONGEST || (z.b - a.b) * (z.t - a.t) / Math.max(z.b - a.b, 1) > WALK_LONGEST * 2 || M.restNear((a.t + z.t) / 2, z.t - a.t)) continue;
    const mid = Math.round((a.b + z.b) / 2);
    if (mid > a.b && mid < z.b) pulses.splice(k + 1, 0, { b: mid, t: beats[mid], main: false, deep: a.deep });
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
  const voicedNow = ears[2] ? smooth(vRaw.map(v => (v > 0.35 ? 1 : 0)), HZ * 0.35) : null;
  // Hearing 2: the tune moves the whole sheet now, not a wave of it, so how fast it can get there is how hard it can jolt. A note arrives as fast as this and no faster, half of the way before you hear it. A voice coming in from nothing is the worst case.
  // A voice coming in from nothing fades in: it's the note it comes in on that would be the jolt, not the notes after it.
  const melNow = ears[2] ? smooth(limitRate(smooth(melody, HZ * 0.08).map((v, i) => v * voicedNow[i]), TUNE_RATE / HZ), HZ * 0.05) : null;
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
  // The stride's depth at each pulse: the section's, and however quiet the drums are, some of it stays. It only goes where something's played.
  if (ears[1]) { const m = a => (a?.length ? a.reduce((x, y) => x + y, 0) / a.length : 0); R_song.perc = m(A.perc); R_song.p90 = percHi; R_song.E = m(A.E || A.loud); R_song.onset = m(A.onset); R_song.bass = m(A.bass); R_song.loud = m(A.loud); }
  // The sound coming back after a rest is going fast already, paying back what it lost, so it doesn't take a stride as well until it's found its feet.
  const settling = t => M.rests.reduce((k, r) => k * (t < r.a - 0.5 ? 1 : lerp(0.15, 1, smoother((t - r.b - M.bar) / (2 * M.bar)))), 1);
  // A chill song walks shallower, not slower. How much of a song is percussion is the one thing here that isn't relative to the song itself: Wildflower .46, MGMT .54, Disclosure .63.
  const chill = (ears.depth ?? 1) * (ears[1] && A.perc ? lerp(WALK_CHILL, 1, clamp((A.perc.reduce((x, y) => x + y, 0) / A.perc.length - 0.38) / 0.22)) : 1);
  const depths = ears[1] ? Float32Array.from(pulses, p => chill * p.deep * settling(p.t) * (WALK_DRUMS + (1 - WALK_DRUMS) * (M.conductor.length ? read({ hz: HZ, n }, gDrums, C(p.t)) : 1)) * clamp((energyAt(p.t) - 0.03) / 0.15)) : null;
  const bass = ears[5] && !M.neutral && A.bass ? bassTables(M, A, n, resample) : null;
  return { hz: HZ, n, ...bass, pulse, pulses: pulses.map(p => p.t), mains: pulses.map(p => p.main), depths, songIs: R_song, choices, melody: mel, melNow, melSlow, voiced, tone, energy, chords, dummy, M, C, T, lung, px, py, tension, gDrums, gTune, gTone, gHarm, conducted: M.conductor.length > 0 };
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

// Hearing 1: the sheet walks. Between two strong beats it sets off from nearly nothing, falls faster and faster into the next one, brakes over the last moment and is nearly stopped on the beat.
// That's the speed law LOW + x^1.5, normalised so each interval covers the same ground, with its top about 2.1 times its mean. Set off and arrival are both smooth: speed is continuous and flat where it starts.
// WALK_DRUMS: the plan has .35 here, and the depth at .35 + .65 x the drums' gain. But the drums' gain is .35 whenever anything else leads, which on these songs is nearly all the time, so that never walks at all.
export const WALK_DRUMS = 0.6, WALK_CHILL = 0.6, WALK_LEAST = 0.35, WALK_QUICKEST = 0.8, WALK_LONGEST = 2;      // the shallowest a section walks; the least and most seconds from one strong beat to the next
const LOW = 0.15, BRAKE = 0.08, LONGEST = 2.5;
export function strideAt(x, L) {
  const b = Math.min(BRAKE / Math.max(L, 1e-3), 0.25), xb = 1 - b, fb = LOW + Math.pow(xb, 1.5), up = LOW * xb + Math.pow(xb, 2.5) / 2.5, all = up + b * (LOW + fb) / 2;
  if (x < xb) return (LOW * x + Math.pow(x, 2.5) / 2.5) / all;
  const u = (x - xb) / b;
  return (up + b * (fb * u - (fb - LOW) * (u * u * u - u * u * u * u / 2))) / all;
}
// How far the sheet's own clock is behind the picture's, in seconds, at picture time p. Zero on every strong beat, so nothing that lands on one has moved. The beats go on the picture's clock: time(t) stands still through a rest, and it
// lags the song while it pays that back, and a beat is still where you hear it. Depth eases from beat to beat, so speed is continuous across them.
export function makeWalk(R, time, also = []) {
  const P = [], D = [];
  const all = R.pulses.map((t, k) => [time(t), R.depths[k]]);
  for (const t of also) all.push([time(t), null]);
  all.sort((a, b) => a[0] - b[0]);
  for (const [p, d] of all) {
    const last = P.length - 1;
    if (last >= 0 && p - P[last] < 0.25) { if (d != null && D[last] == null) D[last] = d; continue; }     // a beat in a rest stands where the rest does
    P.push(p); D.push(d);
  }
  for (let i = 0; i < D.length; i++) if (D[i] == null) D[i] = D[i - 1] ?? D[i + 1] ?? 0.5;
  const n = P.length;
  let span = 1;
  const walk = p => {
    if (n < 2 || p <= P[0] || p >= P[n - 1] || !walk.gain) return 0;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m] <= p) lo = m; else hi = m; }
    const L = span = P[hi] - P[lo], x = (p - P[lo]) / L;
    // Nothing's going to fall four seconds into a beat. A long gap just pours.
    const d = lerp(D[lo], D[hi], smoother(x)) * (L > LONGEST ? Math.pow(LONGEST / L, 3) : 1);
    return walk.gain * d * (strideAt(x, L) - x) * L;
  };
  walk.gain = 1;      // for tests/hear.mjs, to see what the stride alone is responsible for
  walk.lag = p => walk(p) / span;      // the same as a share of the step it's in: 0 on the beat, about -.25 at its deepest on a full stride
  return walk;
}

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
export const melodyNowAt = (R, c) => read(R, R.melNow, c);
export const bassAt = (R, c, out) => { out[0] = read(R, R.bassY, c); out[1] = read(R, R.bassA, c); return out; };

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
