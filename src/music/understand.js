// What a song is, as a listener hears it: home, the harmony's place and tension, the phrase's breath, rests, arrivals, and who's leading.
// Pure, from what the analysis has already cached (no ANALYSIS_VERSION bump). Nothing here touches the picture: react.js turns it into tables, and
// the lanes read those. See docs/NEXT.md 2.5.
//
//   M = { neutral, home: { root, minor, c, name }, key,
//         runs: [{ t0, t1, c }], place(c) -> [x, y], tension(c),
//         breath: { beats, seconds, bars, bar0, offset, loop, loopSeconds, t: [...] }, lungs: [{ t, depth, attack, decay }],
//         rests: [{ a, b, db }], C(t), T(c), restAt(t), restNear(t, within),
//         arrival: [per bar, 0..1], arrivalS: [per bar, the raw s], arrivalAt(t), arrivals(min): the peaks, strongest first,
//         conductor: [{ t, lead, second, margin, drums, tune, tone, harm }], gains(t) -> { drums, tune, tone, harm },
//         beats, bars, meter, beat, bar, duration }
//
// All times in M are the song's own seconds, except C(t), which is the song's seconds with its rests taken out. Every table in react.js runs on C.
import { flag } from '../score/flags.js';

const EVEN = Object.freeze({ drums: 1, tune: 1, tone: 1, harm: 1 });
const same = t => t;
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const chordName = c => NAMES[c >> 1] + (c & 1 ? 'm' : '');

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smoother = x => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const pct = (a, p) => { const s = Array.from(a).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) * p)] : 0; };
const meanOf = (a, i0, i1) => { let s = 0, n = 0; for (let i = Math.max(0, i0); i < i1 && i < a.length; i++) { s += a[i]; n++; } return n ? s / n : 0; };
const relMajor = c => (c & 1 ? ((c >> 1) + 3) % 12 : c >> 1);
const fifths = (from, to) => { let q = (((to - from) * 7) % 12 + 12) % 12; if (q > 6) q -= 12; return q; };

// The neutral M: no rests, one even clock, nobody leads. What a flag off, or a song with no beats in it, gets.
function neutral(A) {
  return {
    neutral: true, home: { root: 0, minor: 0, c: 0, name: 'C' }, key: 0, runs: [], place: () => [0, 0], tension: () => 0,
    breath: { beats: 0, seconds: 0, bars: 0, bar0: 0, offset: 0, loop: 0, loopSeconds: 0, t: [] }, lungs: [], rests: [], C: same, T: same, restAt: () => null, restNear: () => null,
    arrival: [], arrivalS: [], arrivalAt: () => 0, arrivals: () => [], conductor: [], gains: () => EVEN,
    beats: A?.beats ?? [], bars: A?.bars ?? [], meter: A?.meter ?? 4, beat: 0.5, bar: 2, duration: A?.duration ?? 0,
  };
}

// ---------------------------------------------------------------- harmony: the chord on each beat, then runs of them
function chordsOnBeats(A, N) {
  const step = A.chordStep / A.fps, last = A.chord.length - 1, out = new Uint8Array(N), hist = new Uint16Array(24);
  for (let b = 0; b < N; b++) {
    const t0 = A.beats[b], t1 = A.beats[b + 1] ?? t0 + (N > 1 ? A.beats[N - 1] - A.beats[N - 2] : 0.5);
    hist.fill(0);
    const i0 = Math.min(last, Math.floor(t0 / step)), i1 = Math.min(last, Math.max(i0, Math.ceil(t1 / step) - 1));
    for (let i = i0; i <= i1; i++) hist[A.chord[i]]++;
    let best = A.chord[i0];
    for (let c = 0; c < 24; c++) if (hist[c] > hist[best]) best = c;
    out[b] = best;
  }
  return out;
}
function runsOf(ch, A, N) {
  const runs = [];
  for (let b = 0, s = 0; b <= N; b++) {
    if (b === N || ch[b] !== ch[s]) {
      runs.push({ t0: s === 0 ? 0 : A.beats[s], t1: b >= N ? A.duration : A.beats[b], c: ch[s], b0: s, b1: b });
      s = b;
    }
  }
  return runs;
}
// The key signature that holds most of the song's chords, then I or vi. The analysis's own A.key disagrees with the chords too often to use (right 11/20 on synthetic loops).
function findHome(ch, runs, A) {
  const K = q => (q === 0 ? 1 : Math.abs(q) === 1 ? 0.8 : -0.3);
  const sc = new Float64Array(12);
  for (const r of runs) { const d = r.t1 - r.t0, m = relMajor(r.c); for (let k = 0; k < 12; k++) sc[k] += d * K(fifths(k, m)); }
  let key = 0;
  for (let k = 1; k < 12; k++) if (sc[k] > sc[key]) key = k;
  const cI = key * 2, cvi = ((key + 9) % 12) * 2 + 1;
  const down = new Set(Array.from(A.barBeats || []));
  let sI = 0, svi = 0;
  for (let b = 0; b < ch.length; b++) { const w = down.has(b) ? 2 : 1; if (ch[b] === cI) sI += w; else if (ch[b] === cvi) svi += w; }
  const c = svi > sI * 1.1 ? cvi : cI;
  return { key, home: { root: c >> 1, minor: c & 1, c, name: chordName(c) } };
}

// ---------------------------------------------------------------- the breath: how long before the harmony comes round again, and where it starts
function findBreath(A, ch, N, bs) {
  const m = A.meter || 4, step = A.chordStep / A.fps, last = A.chord.length - 1;
  // chroma per beat, mean free and unit length, so its dot product is a cosine
  const C = new Float32Array(N * 12);
  for (let b = 0; b < N; b++) {
    const t0 = A.beats[b], t1 = A.beats[b + 1] ?? t0 + bs;
    const i0 = Math.min(last, Math.floor(t0 / step)), i1 = Math.min(last, Math.max(i0, Math.ceil(t1 / step) - 1));
    for (let i = i0; i <= i1; i++) for (let p = 0; p < 12; p++) C[b * 12 + p] += A.chroma[i * 12 + p];
    let mean = 0; for (let p = 0; p < 12; p++) mean += C[b * 12 + p]; mean /= 12;
    let l = 0; for (let p = 0; p < 12; p++) { C[b * 12 + p] -= mean; l += C[b * 12 + p] ** 2; }
    l = Math.sqrt(l) || 1; for (let p = 0; p < 12; p++) C[b * 12 + p] /= l;
  }
  const R = L => { let s = 0, n = 0; for (let i = 0; i + L < N; i++) { let d = 0; for (let p = 0; p < 12; p++) d += C[i * 12 + p] * C[(i + L) * 12 + p]; s += d; n++; } return n ? s / n : 0; };
  const cands = [];
  for (let k = 1; k <= 32 && k * m < N; k++) cands.push([k * m, R(k * m)]);
  if (!cands.length) return null;
  const top = Math.max(...cands.map(c => c[1]));
  const loop = (cands.find(c => c[0] >= m * 2 && c[1] >= 0.88 * top) ?? cands[0])[0];
  // Into 5-11 s, staying on whole bars
  let B = loop;
  while (B * bs > 11 && B % (2 * m) === 0) B /= 2;
  while (B * bs < 5) B *= 2;
  // Which bar of it starts one: where chords most often change, and where the song's form changes
  const offs = new Float32Array(B);
  for (let i = 1; i < N; i++) if (ch[i] !== ch[i - 1]) offs[i % B]++;
  for (let i = 0; i < N; i++) offs[i % B] += 2 * (A.novelty?.[i] || 0);
  const downPhase = new Set(Array.from(A.barBeats || [0], b => b % m));
  let offset = -1, v = -1;
  for (let k = 0; k < B; k++) if (downPhase.has(k % m) && offs[k] > v) { v = offs[k]; offset = k; }
  if (offset < 0) offset = 0;
  const t = [];
  for (let i = offset; i < N; i += B) t.push(A.beats[i]);
  // The same thing counted in bars: a bar i starts a breath when (i - bar0) % bars is 0
  const bar0 = Math.max(0, Array.from(A.barBeats || []).indexOf(offset));
  return { beats: B, seconds: B * bs, bars: B / m, bar0, offset, loop, loopSeconds: loop * bs, t };
}

// ---------------------------------------------------------------- the lungs: each breath's depth, from how much bigger the next is than this one
function findLungs(breath, A, bar) {
  const E = A.E || A.loud, fps = A.fps, out = [];
  const size = (t0, t1) => meanOf(E, Math.round(t0 * fps), Math.max(Math.round(t0 * fps) + 1, Math.round(t1 * fps)));
  const T = breath.t;
  for (let i = 0; i < T.length; i++) {
    const P = (T[i + 1] ?? T[i] + breath.seconds) - T[i], Pb = i ? T[i] - T[i - 1] : breath.seconds;
    const here = size(T[i], T[i] + P), was = size(T[i] - Pb, T[i]);
    const depth = clamp(here / Math.max(was, 1e-3), 0.5, 1.5) * clamp((here - 0.03) / 0.15);
    out.push({ t: T[i], depth, attack: Math.min(bar, 0.18 * P), decay: 0.45 * P });
  }
  return out;
}

// ---------------------------------------------------------------- rests: the band stops, all together, and comes back
//
// Measured on the four test songs against the decoded audio: the first guess, loud < .45 * local p70, finds dozens of gaps between hits and soft patches of 2-7 dB. A real stop goes all the way
// down (under .25, for most of a beat at least), has the band on both sides of it (a soft passage has none on one side or the other), and has no drums in it (a sparse verse's gap between two hits does).
// .45 only says where its edges are.
const REST_MAX = 4, REST_CORE = 0.25, REST_EDGE = 0.45, REST_LOCAL = 0.25, REST_MIN_BEATS = 0.9, REST_LONGEST = 8, REST_BAND = 0.4, REST_DRUMS = 0.3;
function findRests(A, bar, bs) {
  const loud = A.loud, fps = A.fps, frames = loud.length, perc = A.perc;
  // the local level, on a coarse grid: p70 of the loudness within 4 bars either way
  const hop = Math.max(1, Math.round(fps * 0.25)), span = Math.round(4 * bar * fps);
  const local = new Float32Array(Math.ceil(frames / hop) + 1);
  for (let i = 0; i < local.length; i++) {
    const v = [], f = i * hop;
    for (let k = Math.max(0, f - span); k <= Math.min(frames - 1, f + span); k += 2) v.push(loud[k]);
    local[i] = pct(v, 0.7);
  }
  const localAt = f => local[Math.min(local.length - 1, Math.round(f / hop))];
  const below = (f, k) => loud[f] < k * localAt(f);
  const w = Math.round(bar * fps), out = [];
  for (let f = 0; f < frames;) {
    if (!(localAt(f) > REST_LOCAL && below(f, REST_CORE))) { f++; continue; }
    let e = f;
    while (e < frames && below(e, REST_CORE)) e++;
    const core0 = f, core1 = e;
    f = e + 1;
    if ((core1 - core0) / fps < REST_MIN_BEATS * bs) continue;
    let fa = core0, fb = core1;
    while (fa > 0 && below(fa - 1, REST_EDGE)) fa--;
    while (fb < frames && below(fb, REST_EDGE)) fb++;
    f = Math.max(f, fb + 1);
    const a = fa / fps, b = fb / fps;
    if (b - a > REST_LONGEST) continue;       // that's a quiet section, not a stop
    const before = meanOf(loud, fa - w, fa), after = meanOf(loud, fb, fb + w);
    if (before < REST_BAND || after < REST_BAND) continue;       // this also rules out the song's own beginning and end
    const percIn = meanOf(perc, core0, core1), percOut = (meanOf(perc, fa - w, fa) + meanOf(perc, fb, fb + w)) / 2;
    if (percIn > REST_DRUMS * percOut) continue;
    // A.loud is a normalised log, not dB, so this is only a rough figure: tests/understand.mjs measures the real drop from the decoded audio.
    const depth = meanOf(loud, core0, core1), near = Math.max(before, after), rough = x => Math.expm1(0.6 + 1.6 * x);
    out.push({ a, b, db: +(20 * Math.log10(rough(near) / rough(depth))).toFixed(1), drop: near - depth });
  }
  // At most four, the deepest and longest
  out.sort((x, y) => y.drop * Math.min(y.b - y.a, 4) - x.drop * Math.min(x.b - x.a, 4));
  return out.slice(0, REST_MAX).sort((x, y) => x.a - y.a).map(({ a, b, db }) => ({ a: +a.toFixed(3), b: +b.toFixed(3), db }));
}
// The song's seconds with its rests taken out, and back
function collapse(rests) {
  if (!rests.length) return { C: same, T: same };
  const A = rests.map(r => r.a), B = rests.map(r => r.b), P = [];
  let paid = 0;
  for (const r of rests) { P.push(paid); paid += r.b - r.a; }
  const C = t => {
    let lo = -1, hi = A.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (A[m] <= t) lo = m; else hi = m - 1; }
    if (lo < 0) return t;
    return t < B[lo] ? A[lo] - P[lo] : t - P[lo] - (B[lo] - A[lo]);
  };
  // c0: a rest's place on the collapsed axis. Just past it is the rest's end; at it exactly, the rest's start.
  const c0 = A.map((a, i) => a - P[i]);
  const T = c => {
    let lo = -1, hi = c0.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c0[m] < c) lo = m; else hi = m - 1; }
    return lo < 0 ? c : c + P[lo] + (B[lo] - A[lo]);
  };
  return { C, T };
}

// ---------------------------------------------------------------- arrivals: how much of somewhere the song arrives at on each bar
function findArrivals(A, bar) {
  const E = A.E || A.loud, perc = A.perc, fps = A.fps, bars = A.bars, n = bars?.length || 0;
  const s = new Float32Array(n), a = new Float32Array(n), w4 = Math.round(4 * bar * fps), w2 = Math.round(2 * bar * fps);
  for (let i = 0; i < n; i++) {
    const f = Math.round(bars[i] * fps);
    const dE = meanOf(E, f, f + w4) - meanOf(E, f - w4, f);
    const dP = meanOf(perc, f, f + w2) - meanOf(perc, f - w2, f);
    const b = A.barBeats[i]; let nov = 0;
    for (let k = -1; k <= 1; k++) nov = Math.max(nov, A.novelty?.[clamp(b + k, 0, (A.novelty?.length || 1) - 1)] || 0);
    // The song starting isn't an arrival: there's nowhere it came from yet
    s[i] = (2 * Math.max(0, dE) + Math.max(0, dP) + 0.3 * nov) * smoother((bars[i] - 2 * bar) / (2 * bar));
    a[i] = clamp((s[i] - 0.35) / 0.5);
  }
  return { s, a };
}

// ---------------------------------------------------------------- the conductor: who's saying something new, breath by breath
//
// Each stream's distance from the same beat one loop ago. A stream that repeats itself has nothing to tell anyone, and a drum machine repeats itself. Normalised per stream,
// so they compete fairly; drums pay DRUM_TAX for it, because the eye takes drums as louder than the ear does: a pulse moves the whole sheet at once.
const LEAD = 1, SECOND = 0.45, OTHERS = 0.2, DRUMS_MIN = 0.35, SWITCH_MARGIN = 0.08, DWELL = 2, CUT_IN = 0.25, DRUM_TAX = 0.7;
export const STREAMS = ['drums', 'tune', 'tone', 'harm'];
function findConductor(A, ch, N, breath, ears = {}) {
  const fps = A.fps, L = breath.loop, tb = A.beats, m = breath.beats, last = A.duration;
  const at = (arr, t) => arr[clamp(Math.round(t * fps), 0, arr.length - 1)];
  const bins = (arr, k) => {
    const out = new Float32Array(N * k);
    for (let b = 0; b < N; b++) { const t0 = tb[b], d = (tb[b + 1] ?? t0 + 0.5) - t0; for (let j = 0; j < k; j++) out[b * k + j] = at(arr, Math.min(last, t0 + d * (j + 0.5) / k)); }
    return out;
  };
  const P = bins(A.perc, 6), Pit = bins(A.pitch || A.m, 4), V = bins(A.voiced, 4), Br = bins(A.bright, 1);
  const S = { drums: new Float32Array(N), tune: new Float32Array(N), tone: new Float32Array(N), harm: new Float32Array(N) };
  for (let b = 0; b < N; b++) {
    const q = b >= L ? b - L : b + L;
    if (q >= N) continue;
    let d = 0;
    for (let k = 0; k < 6; k++) d += Math.abs(P[b * 6 + k] - P[q * 6 + k]);
    S.drums[b] = d / 6;
    d = 0; let c = 0;
    for (let k = 0; k < 4; k++) {
      const va = V[b * 4 + k] > 0.35, vb = V[q * 4 + k] > 0.35;
      if (va && vb) { d += Math.min(1, Math.abs(Pit[b * 4 + k] - Pit[q * 4 + k]) / 5); c++; } else if (va !== vb) { d += 1; c++; }
    }
    S.tune[b] = c ? d / c : 0;
    S.harm[b] = ch[b] === ch[q] ? 0 : 1;
    S.tone[b] = Math.abs(Br[b] - Br[q]);
  }
  const hi = {};
  for (const k of STREAMS) hi[k] = Math.max(pct(S[k], 0.9), 1e-3);
  const out = [];
  let cur = null, held = 0;
  breath.t.forEach((t, i) => {
    const b0 = breath.offset + i * m, b1 = Math.min(N, b0 + m), sc = {};
    for (const k of STREAMS) { let s = 0; for (let b = b0; b < b1; b++) s += Math.min(1.5, S[k][b] / hi[k]); sc[k] = s / Math.max(b1 - b0, 1); }
    sc.drums *= DRUM_TAX;
    // A tune nobody's playing can't lead
    { let v = 0, c = 0; for (let b = b0; b < b1; b++) for (let k = 0; k < 4; k++) { v += V[b * 4 + k] > 0.35 ? 1 : 0; c++; } sc.tune *= clamp(v / Math.max(c, 1) / 0.35);
      // Hearing 2: a chorus sung the same way twice has nothing new in it, and it's still what everyone's listening to. So a tune scores for being there and for going somewhere, as well as for being new.
      if (ears[2]) {
        const pitches = []; for (let b = b0; b < b1; b++) for (let k = 0; k < 4; k++) if (V[b * 4 + k] > 0.35) pitches.push(Pit[b * 4 + k]);
        const there = clamp(v / Math.max(c, 1) / 0.5), goes = pitches.length ? clamp((pct(pitches, 0.9) - pct(pitches, 0.1)) / 7) : 0;
        sc.tune = Math.max(sc.tune, 0.45 * sc.tune + there * (0.35 + 0.4 * goes));
      }
    }
    const order = STREAMS.slice().sort((x, y) => sc[y] - sc[x]);
    const margin = sc[order[0]] - sc[cur ?? order[1]];
    // A lead gets a phrase to say what it's saying. Only something plainly bigger can cut in after one breath.
    if (!cur || (order[0] !== cur && margin > SWITCH_MARGIN && (held >= DWELL || margin > CUT_IN))) { if (cur !== order[0]) held = 0; cur = order[0]; }
    held++;
    const second = cur === order[0] ? order[1] : order[0];
    const g = {};
    for (const k of STREAMS) g[k] = k === cur ? LEAD : k === second ? SECOND : OTHERS;
    g.drums = Math.max(g.drums, DRUMS_MIN);
    out.push({ t, lead: cur, second, margin: +margin.toFixed(3), ...g, sc });
  });
  return out;
}
function gainsFrom(conductor, bar) {
  if (!conductor.length) return () => EVEN;
  const n = conductor.length;
  // Eased over the bar that ends on the breath, so a new lead has arrived by the time its breath starts
  return t => {
    let lo = 0, hi = n - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (conductor[m].t <= t) lo = m; else hi = m - 1; }
    const a = conductor[lo], b = conductor[lo + 1];
    const x = b ? smoother((t - (b.t - bar)) / bar) : 0;
    return { drums: a.drums + (b ? (b.drums - a.drums) * x : 0), tune: a.tune + (b ? (b.tune - a.tune) * x : 0), tone: a.tone + (b ? (b.tone - a.tone) * x : 0), harm: a.harm + (b ? (b.harm - a.harm) * x : 0) };
  };
}

// ---------------------------------------------------------------- hearing 11: the song's rarest chords, where it had settled into repeating itself
// How surprising a chord is: -log P(this chord | the last), counted over the whole song. It only counts after four bars that said the same as the four before them, since a chord can't surprise anyone in the middle of a wander.
const SURPRISES = 6, SURPRISE_APART = 20, SURPRISE_SAME = 0.75;
function findSurprises(ch, runs, A, m) {
  const N = ch.length, count = new Float32Array(24), pair = new Float32Array(24 * 24), W = 4 * m;
  for (let i = 1; i < runs.length; i++) { count[runs[i - 1].c]++; pair[runs[i - 1].c * 24 + runs[i].c]++; }
  const out = [];
  for (let i = 1; i < runs.length; i++) {
    const b = runs[i].b0;
    if (b < 2 * W || b >= N) continue;
    let same = 0; for (let k = 1; k <= W; k++) if (ch[b - k] === ch[b - k - W]) same++;
    if (same / W < SURPRISE_SAME) continue;
    const a = runs[i - 1].c, c = runs[i].c, s = -Math.log((pair[a * 24 + c] + 0.5) / (count[a] + 12));
    out.push({ t: A.beats[b], c, s: +s.toFixed(3) });
  }
  out.sort((x, y) => y.s - x.s);
  const kept = [];
  for (const o of out) { if (kept.length >= SURPRISES) break; if (kept.every(k => Math.abs(k.t - o.t) >= SURPRISE_APART)) kept.push(o); }
  return kept.sort((x, y) => x.t - y.t);
}

// ---------------------------------------------------------------- all of it. compose and react can both ask: it's worked out once per song and per set of flags.
const memo = new WeakMap();
const flagKey = () => `${flag('understand')}${flag('rests')}${flag('conductor')}`;
export function understand(A, ears = {}) {
  // A film keeps two readings of the song, the plain one and the one src/score/hear.js follows, so each has its own place.
  const key = flagKey() + !!ears[2] + !!ears[11];
  let kept = memo.get(A);
  if (!kept) memo.set(A, kept = new Map());
  if (kept.has(key)) return kept.get(key);
  const M = work(A, ears);
  kept.set(key, M);
  return M;
}
function work(A, ears) {
  const N = A?.beats?.length || 0;
  if (!flag('understand') || N < 16 || !A.chord?.length || !A.chroma?.length) return neutral(A);
  const meter = A.meter || 4, bs = (A.beats[N - 1] - A.beats[0]) / Math.max(N - 1, 1) || 60 / (A.bpm || 120), bar = bs * meter;
  const ch = chordsOnBeats(A, N), runs = runsOf(ch, A, N);
  const { key, home } = findHome(ch, runs, A);
  // Place: how far round the circle of fifths from home, and whether it's gone minor. Home is the origin, whichever it is.
  const place = c => {
    const q = fifths(relMajor(home.c), relMajor(c)), mm = (c & 1) - home.minor;
    let x = 0.62 * q, y = -0.46 * mm;
    const l = Math.hypot(x, y);
    if (l > 1.3) { x *= 1.3 / l; y *= 1.3 / l; }
    return [x, y];
  };
  // Tension: that distance, and more if this song tends to go home from here
  const count = new Float32Array(24), toHome = new Float32Array(24);
  for (let i = 0; i + 1 < runs.length; i++) { count[runs[i].c]++; if (runs[i + 1].c === home.c) toHome[runs[i].c]++; }
  const tension = c => { const [x, y] = place(c); return Math.hypot(x, y) * (1 + 0.5 * (count[c] ? toHome[c] / count[c] : 0)); };

  const breath = findBreath(A, ch, N, bs);
  if (!breath) return neutral(A);
  const lungs = findLungs(breath, A, bar);
  const rests = flag('rests') && A.loud && A.perc ? findRests(A, bar, bs) : [];
  const { C, T } = collapse(rests);
  const restAt = t => rests.find(r => t >= r.a && t < r.b) ?? null;
  const restNear = (t, within) => rests.find(r => t >= r.a - within && t <= r.b + within) ?? null;
  const { s: arrivalS, a: arrival } = findArrivals(A, bar);
  const bars = A.bars ?? [];
  const arrivalAt = t => {
    if (!bars.length) return 0;
    let lo = 0, hi = bars.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (bars[m] <= t) lo = m; else hi = m - 1; }
    const i = lo + 1 < bars.length && bars[lo + 1] - t < t - bars[lo] ? lo + 1 : lo;
    return arrival[i];
  };
  const arrivals = (min = 0.3) => {
    const out = [];
    for (let i = 0; i < arrival.length; i++) if (arrival[i] >= min && (arrival[i] >= (arrival[i - 1] ?? 0)) && arrival[i] > (arrival[i + 1] ?? 0)) out.push({ bar: i, t: bars[i], a: arrival[i], s: arrivalS[i] });
    return out.sort((x, y) => y.a - x.a);
  };
  const conductor = flag('conductor') && A.perc && A.bright && A.voiced ? findConductor(A, ch, N, breath, ears) : [];
  return {
    neutral: false, home, key, runs: runs.map(({ t0, t1, c }) => ({ t0, t1, c })), place, tension,
    breath, lungs, rests, C, T, restAt, restNear, arrival, arrivalS, arrivalAt, arrivals,
    conductor, gains: gainsFrom(conductor, bar), surprises: ears[11] ? findSurprises(ch, runs, A, meter) : [],
    beats: A.beats, bars, meter, beat: bs, bar, duration: A.duration,
  };
}
