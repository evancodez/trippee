// How a film hears: docs/MODES.md section 6, changes 1 and 2. Muted, as ever; nobody here hears anything, and nothing in this file can say a film feels musical. That's the owner's, through ?hear=.
//
//   SONG=media/mgmt.mp3 node tools/lab.mjs tests/hear.mjs --url 'http://localhost:5300/?hear=1' --out lab-out/<lane>       writes <song>.hear.json, says what it found
//   ROWS=gait,follow,decode,share                                                                                         only those
//   CUT=1                                                                                                                 the song's hand cut, once rehearsed, in place of the generated film
//   node tests/hear.mjs --selftest                                                                                        the speed law and the decoder, on made-up numbers, no browser
//
//   gait     how often the strong beats come, section by section. No gap over 2 s above 80 bpm
//   follow   tests/follow.mjs, and how it splits between a plain body, a transformation and a hero, since those can't all walk the same
//   decode   can the tune be read back out of the picture? Per tile: its mean and how far it has moved up and across (Lucas-Kanade, integrated, slow drift taken off). Ridge regression onto the melody table, leaving
//            each section out in turn, then the same on the table circularly shifted. A lifted sheet of fine lines doesn't change a tile's mean, so means alone can't see what change 2 does
//   rings    change 6: of the sixteen tiles, the share whose brightness, folded on the strong beats, peaks within 120 ms of them. Want 25%+
//   bass     change 5: the bump's height against the chord's root, its strength against the kick, and how much it moves the picture
//   whitney  change 9: edge crossings a second on the outer ring, real pixels, want under 4. Writes <song>.whitney.jpg frames to look at
//   turns    change 11: where the flow turns, whether it really runs backward there, and that it keeps its rules. Whether it means anything is the owner's: real chords against random ones
//   share    how much of the picture's motion is whose, as tests/judge.mjs's Balance works it out, per breath, with the stride as a channel of its own. Tune 15%+ in every voiced breath, tone 8%+ for the song
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureSong, judgeCapture, decodeCapture, impactOf, peaksOf, fOf, aucOf, offGrid, FOLLOW } from './follow.mjs';

export const HEAR = { tuneShare: 0.15, toneShare: 0.08, gap: 2, gapBpm: 80, decodeZ: 3, ringsNear: 0.12, ringsShare: 0.25, bassRoot: 0.8, bassKick: 0.3, crossings: 4, surprises: 6, surpriseApart: 20 };
const r3 = x => +(+x).toFixed(3);
const meanOf = a => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; };

// ---------------------------------------------------------------- ridge, leaving a section out each time
function solve(M, b) {
  const n = b.length, A = M.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c] || 1e-9;
    for (let r = 0; r < n; r++) { if (r === c) continue; const k = A[r][c] / d; if (k) for (let j = c; j <= n; j++) A[r][j] -= k * A[c][j]; }
  }
  return A.map((r, i) => r[n] / (r[i] || 1e-9));
}
function ridge(X, y, lambda) {
  const d = X[0].length, XtX = Array.from({ length: d }, () => new Array(d).fill(0)), Xty = new Array(d).fill(0);
  for (let i = 0; i < X.length; i++) { const x = X[i]; for (let a = 0; a < d; a++) { Xty[a] += x[a] * y[i]; for (let b = a; b < d; b++) XtX[a][b] += x[a] * x[b]; } }
  for (let a = 0; a < d; a++) { for (let b = 0; b < a; b++) XtX[a][b] = XtX[b][a]; XtX[a][a] += lambda * X.length; }
  return solve(XtX, Xty);
}
// R^2 of the held-out sections put together. X and y are per sample, groups says which section each is in.
export function crossR2(X, y, groups, lambda = 0.05) {
  const m = meanOf(y), pred = new Float64Array(y.length), ids = [...new Set(groups)];
  for (const g of ids) {
    const tr = [], ty = []; for (let i = 0; i < y.length; i++) if (groups[i] !== g) { tr.push(X[i]); ty.push(y[i] - m); }
    if (!tr.length) continue;
    const w = ridge(tr, ty, lambda);
    for (let i = 0; i < y.length; i++) if (groups[i] === g) { let s = 0; for (let k = 0; k < w.length; k++) s += w[k] * X[i][k]; pred[i] = s + m; }
  }
  let a = 0, b = 0; for (let i = 0; i < y.length; i++) { a += (y[i] - pred[i]) ** 2; b += (y[i] - m) ** 2; }
  return { r2: 1 - a / Math.max(b, 1e-9), pred };
}
// The real table against itself shifted round, far enough that the tune isn't just itself a moment ago.
export function decodeOf(X, y, groups, { shifts = 24, least = 96 } = {}) {
  const z = X[0].length, n = X.length, u = new Float64Array(z), s = new Float64Array(z);
  for (const x of X) for (let k = 0; k < z; k++) u[k] += x[k] / n;
  for (const x of X) for (let k = 0; k < z; k++) s[k] += (x[k] - u[k]) ** 2 / n;
  const S = X.map(x => x.map((v, k) => (v - u[k]) / Math.sqrt(s[k] || 1)));
  const real = crossR2(S, y, groups).r2, others = [];
  for (let q = 0; q < shifts; q++) {
    const sh = least + Math.floor((q + 0.5) / shifts * Math.max(1, n - 2 * least));
    others.push(crossR2(S, y.map((_, i) => y[(i + sh) % n]), groups).r2);
  }
  const mo = meanOf(others), sd = Math.sqrt(meanOf(others.map(v => (v - mo) ** 2)));
  return { r2: r3(real), shifted: r3(mo), z: r3((real - mo) / Math.max(sd, 1e-3)) };
}

// ---------------------------------------------------------------- in the page
// 12 fps on 96x54, per tile: mean, and displacement up and across by Lucas-Kanade between each frame and the last. Base64 of a Float32Array, 3 x 16 x frames.
const tilesInPage = async ({ t0, t1, fps }) => {
  const T = window.trippee, W = 96, H = 54, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  const N = Math.floor((t1 - t0) * fps), out = new Float32Array(N * 48);
  let prev = null;
  for (let i = 0; i < N; i++) {
    T.seek(t0 + i / fps);
    x.drawImage(T.canvas, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data, L = new Float32Array(W * H);
    for (let k = 0; k < L.length; k++) L[k] = d[k * 4 + 1];
    const sum = new Float64Array(16), xx = new Float64Array(16), yy = new Float64Array(16), xy = new Float64Array(16), xt = new Float64Array(16), yt = new Float64Array(16), cnt = new Float64Array(16);
    for (let Y = 1; Y < H - 1; Y++) for (let X = 1; X < W - 1; X++) {
      const k = Math.min(3, (Y * 4 / H) | 0) * 4 + Math.min(3, (X * 4 / W) | 0), v = L[Y * W + X];
      sum[k] += v; cnt[k]++;
      if (prev) { const gx = (L[Y * W + X + 1] - L[Y * W + X - 1]) / 2, gy = (L[(Y + 1) * W + X] - L[(Y - 1) * W + X]) / 2, gt = v - prev[Y * W + X]; xx[k] += gx * gx; yy[k] += gy * gy; xy[k] += gx * gy; xt[k] += gx * gt; yt[k] += gy * gt; }
    }
    for (let k = 0; k < 16; k++) {
      const det = xx[k] * yy[k] - xy[k] * xy[k] + 1e-3;
      out[i * 48 + k * 3] = sum[k] / cnt[k];
      out[i * 48 + k * 3 + 1] = (-yy[k] * xt[k] + xy[k] * yt[k]) / det;
      out[i * 48 + k * 3 + 2] = (xy[k] * xt[k] - xx[k] * yt[k]) / det;
    }
    prev = L;
    if (i % 12 === 0) await new Promise(r => setTimeout(r));
  }
  const b = new Uint8Array(out.buffer); let s = '';
  for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode(...b.subarray(i, i + 32768));
  return btoa(s);
};

// The motion each channel is responsible for, as Balance reads it, and the stride as one more.
const shareInPage = async ({ duration, step }) => {
  const T = window.trippee, E = app.edits, dt = 1 / 12, W = 96, H = 54, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true }), walk = app.stage.score.walk;
  const grab = t => { T.seek(t); x.drawImage(T.canvas, 0, 0, W, H); const d = x.getImageData(0, 0, W, H).data, L = new Float32Array(W * H); for (let i = 0; i < L.length; i++) L[i] = d[i * 4 + 1]; return L; };
  const CH = ['reactPulse', 'reactMelody', 'reactTone', 'reactHarmony'], allOff = () => { for (const k of CH) E[k] = 0; };
  const out = { times: [], E: [[], [], [], [], []] };
  const moved = (a0, a1, b0, b1) => { let s = 0; for (let i = 0; i < a0.length; i++) s += Math.abs((a1[i] - b1[i]) - (a0[i] - b0[i])); return +(s / a0.length).toFixed(3); };
  for (let t = 2; t < duration - 2; t += step) {
    allOff(); if (walk) walk.gain = 0;
    const b0 = grab(t), b1 = grab(t + dt);
    for (let k = 0; k < CH.length; k++) { allOff(); E[CH[k]] = 1; out.E[k].push(moved(grab(t), grab(t + dt), b0, b1)); }
    allOff();
    if (walk) { walk.gain = 1; out.E[4].push(moved(grab(t), grab(t + dt), b0, b1)); } else out.E[4].push(0);
    out.times.push(+t.toFixed(2));
    if (out.times.length % 8 === 0) await new Promise(r => setTimeout(r));
  }
  if (walk) walk.gain = 1;
  for (const k of CH) delete E[k];
  E.reactPulse = E.reactMelody = E.reactTone = 1;
  return out;
};

// Tile means at 60 fps over some stretches.
const meansInPage = async ({ starts, seconds, fps }) => {
  const T = window.trippee, W = 96, H = 54, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true }), N = Math.floor(seconds * fps), out = new Float32Array(starts.length * N * 16);
  for (let s = 0; s < starts.length; s++) for (let i = 0; i < N; i++) {
    T.seek(starts[s] + i / fps); x.drawImage(T.canvas, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data, a = new Float64Array(16), n = new Float64Array(16);
    for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) { const k = Math.min(3, (Y * 4 / H) | 0) * 4 + Math.min(3, (X * 4 / W) | 0); a[k] += d[(Y * W + X) * 4 + 1]; n[k]++; }
    for (let k = 0; k < 16; k++) out[(s * N + i) * 16 + k] = a[k] / n[k];
    if (i % 30 === 0) await new Promise(r => setTimeout(r));
  }
  const b = new Uint8Array(out.buffer); let st = '';
  for (let i = 0; i < b.length; i += 32768) st += String.fromCharCode(...b.subarray(i, i + 32768));
  return { b64: btoa(st), N };
};
const bassInPage = async ({ duration, step }) => {
  const T = window.trippee, L = await import(new URL('src/pattern/layout.js', location.href).href), Fl = await import(new URL('src/score/flags.js', location.href).href);
  const F = app.R.frame, P = L.FRAME.press * 4, R = app.stage.score.react, W = 96, H = 54, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true }), grab = t => { T.seek(t); x.drawImage(T.canvas, 0, 0, W, H); return x.getImageData(0, 0, W, H).data; };
  const at = (arr, t) => { const q = Math.max(0, Math.min(R.n - 1.001, R.C(t) * R.hz)), i = Math.floor(q); return arr[i] + (arr[i + 1] - arr[i]) * (q - i); };
  const out = { t: [], y: [], a: [], kick: [], moved: [] }, was = Fl.hearing[5];
  for (let t = 2, i = 0; t < duration - 2; t += step, i++) {
    Fl.hearing[5] = true; const on = grab(t);
    out.t.push(+t.toFixed(3)); out.y.push(F[P + 1]); out.a.push(F[P + 2]); out.kick.push(R.bassKick ? at(R.bassKick, t) : 0);
    if (i % 8 === 0) { Fl.hearing[5] = false; const off = grab(t); let s = 0; for (let k = 1; k < on.length; k += 4) s += Math.abs(on[k] - off[k]); out.moved.push(s / (on.length / 4)); }
    if (i % 16 === 0) await new Promise(r => setTimeout(r));
  }
  Fl.hearing[5] = was;
  return out;
};
const crossingsInPage = async ({ t0, t1, fps }) => {
  const T = window.trippee, W = 96, H = 54, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true }), ring = [];
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) { const r = Math.hypot((X + 0.5 - W / 2) / (H / 2), (Y + 0.5 - H / 2) / (H / 2)); if (r > 1.45 && r < 1.75) ring.push(Y * W + X); }
  const last = new Int8Array(ring.length), count = new Float64Array(ring.length), perSec = []; let n = 0, mark = 0;
  for (let i = 0, N = Math.floor((t1 - t0) * fps); i < N; i++) {
    T.seek(t0 + i / fps); x.drawImage(T.canvas, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data;
    for (let k = 0; k < ring.length; k++) { const s = d[ring[k] * 4 + 1] > 127 ? 1 : -1; if (i && s !== last[k]) { count[k]++; n++; } last[k] = s; }
    if ((i + 1) % fps === 0) { perSec.push(+((n - mark) / ring.length).toFixed(2)); mark = n; }
    if (i % 30 === 0) await new Promise(r => setTimeout(r));
  }
  return { mean: n / ring.length / ((t1 - t0)), worstSecond: Math.max(...perSec, 0), perSec };
};

// ---------------------------------------------------------------- the rows, pure
const corr = (a, b) => { const n = Math.min(a.length, b.length), ma = meanOf(a), mb = meanOf(b); let x = 0, y = 0, z = 0; for (let i = 0; i < n; i++) { x += (a[i] - ma) * (b[i] - mb); y += (a[i] - ma) ** 2; z += (b[i] - mb) ** 2; } return x / Math.sqrt(Math.max(y * z, 1e-12)); };
const highPass = (a, r) => Array.from(a, (v, i) => { let s = 0, c = 0; for (let k = Math.max(0, i - r); k <= Math.min(a.length - 1, i + r); k++) { s += a[k]; c++; } return v - s / c; });
// Each tile's brightness with its slow drift off, folded on the beats, from a half second before to a half second after: where does it peak?
export function ringsOf(raw, N, starts, fps, pulses) {
  const tiles = 16, R = 90, B = 61, lags = [], rise = [];
  for (let k = 0; k < tiles; k++) {
    const fold = new Float64Array(B), cnt = new Float64Array(B);
    starts.forEach((t0, s) => {
      const v = new Float64Array(N); for (let i = 0; i < N; i++) v[i] = raw[(s * N + i) * tiles + k];
      const a = new Float64Array(N + 1); for (let i = 0; i < N; i++) a[i + 1] = a[i] + v[i];
      const d = v.map((x, i) => x - (a[Math.min(N, i + R)] - a[Math.max(0, i - R)]) / (Math.min(N, i + R) - Math.max(0, i - R)));
      for (const p of pulses) { const c = Math.round((p - t0) * fps); if (c < 40 || c >= N - 40) continue; for (let j = 0; j < B; j++) { fold[j] += d[c + j - 30]; cnt[j]++; } }
    });
    let top = -Infinity, at = 0, low = Infinity; for (let j = 0; j < B; j++) { const f = fold[j] / Math.max(cnt[j], 1); if (f > top) { top = f; at = j; } low = Math.min(low, f); }
    lags.push(r3((at - 30) / fps)); rise.push(r3(top - low));
  }
  const near = lags.filter((l, k) => Math.abs(l) <= HEAR.ringsNear && rise[k] >= 0.5).length / tiles;
  return { near: r3(near), lags, rise, ok: near >= HEAR.ringsShare };
}
// The root as a line: each to the octave nearest the last, stepping where the chord does. Worked out here as well, so the film's table isn't just being compared with itself.
export function rootLine(runs, beat, times) {
  const S = []; let v = null;
  for (const r of runs) { if (r.t1 - r.t0 < 1.2 * beat) continue; let w = r.c >> 1; if (v != null) { while (w - v > 6) w -= 12; while (v - w > 6) w += 12; } v = w; S.push({ t: r.t0, w }); }
  return times.map(t => { let w = S[0]?.w ?? 0; for (const s of S) { if (s.t <= t) w = s.w; else break; } return w; });
}

const pct = (a, p) => { const s = Array.from(a).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) * p)] : 0; };
export function gaitOf({ pulses, bpm, rests = [] }) {
  const gaps = []; for (let i = 1; i < pulses.length; i++) if (!rests.some(r => pulses[i - 1] < r.b + 0.5 && pulses[i] > r.a - 0.5)) gaps.push(pulses[i] - pulses[i - 1]);
  const longest = gaps.length ? Math.max(...gaps) : 0;
  return { pulses: pulses.length, median: r3(pct(gaps, 0.5)), longest: r3(longest), ok: bpm <= HEAR.gapBpm || longest <= HEAR.gap + 0.1 };
}
// Where the picture's stops fall, and how far the beats are found, in each kind of stretch of the film.
export function followBy(c, parts) {
  const m = c.m ?? decodeCapture(c.mB64), v = impactOf(m, c.fps), n = v.length, pk = peaksOf(v, c.fps).map(i => c.t0 + i / c.fps), out = {};
  const top = t => { const k = Math.round((t - c.t0) * c.fps), r = Math.round(FOLLOW.tol * c.fps); let b = 0; for (let i = Math.max(0, k - r); i <= Math.min(n - 1, k + r); i++) if (v[i] > b) b = v[i]; return b; };
  const off = offGrid(c.pulses, c.bar).grid;
  for (const kind of new Set(parts.map(p => p.kind))) {
    const inIt = t => parts.some(p => p.kind === kind && t >= p.a && t < p.b);
    const B = c.pulses.filter(inIt), P = pk.filter(inIt), O = off.filter(inIt), f = fOf(P, B);
    out[kind] = { beats: B.length, F: r3(f.F), recall: r3(f.recall), precision: r3(f.precision), auc: B.length && O.length ? r3(aucOf(B.map(top), O.map(top))) : null };
  }
  return out;
}
export function sharesOf({ times, E }, breaths, voicedAt) {
  const totals = E.map(c => c.reduce((s, v) => s + v, 0)), sum = totals.reduce((s, v) => s + v, 0) || 1, shares = totals.map(v => r3(v / sum));
  const perBreath = [];
  for (let i = 0; i < breaths.length; i++) {
    const a = breaths[i], b = breaths[i + 1] ?? Infinity, ix = []; times.forEach((t, k) => { if (t >= a && t < b) ix.push(k); });
    if (!ix.length || voicedAt(a, b) < 0.35) continue;
    const s = E.map(c => ix.reduce((x, k) => x + c[k], 0)), tot = s.reduce((x, y) => x + y, 0);
    if (tot > 0) perBreath.push({ t: r3(a), tune: r3(s[1] / tot) });
  }
  const under = perBreath.filter(b => b.tune < HEAR.tuneShare);
  return { shares: { pulse: shares[0], tune: shares[1], tone: shares[2], harmony: shares[3], stride: shares[4] }, voicedBreaths: perBreath.length, under: under.length, worst: perBreath.length ? Math.min(...perBreath.map(b => b.tune)) : null, median: r3(pct(perBreath.map(b => b.tune), 0.5)), ok: !under.length && shares[2] >= HEAR.toneShare };
}

export default async ({ page, log, save, sleep }) => {
  const { dropSong } = await import('../tools/look.mjs');
  const songPath = process.env.SONG || 'media/mgmt.mp3', song = basename(songPath).replace(/\.\w+$/, ''), rows = (process.env.ROWS || 'gait,follow,decode,share').split(',');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 480, height: 270, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  await dropSong(page, songPath, { resolvePath: resolve, sleep });
  if (process.env.CUT) await page.eval(async () => { for (let i = 0; i < 600 && !app.song.compare?.score?.('cut'); i++) await new Promise(r => setTimeout(r, 200)); const c = app.song.compare; if (!c) throw new Error('no hand cut for this song'); await c.flip(); for (let i = 0; i < 100 && c.film !== 'cut'; i++) await new Promise(r => setTimeout(r, 100)); });
  const info = await page.eval(() => {
    const s = app.song.score, R = s.react, M = R.M;
    const hands = s.gestures.slice(0, -1).map(G => ({ t0: G.t0, t1: G.t1, morph: G.morph || 0, hero: (G.moves || []).filter(m => m.id !== 'cue').map(m => m.id).join(',') }));
    // on the collapsed axis, as the tables are
    const at = (arr, t) => { const x = Math.max(0, Math.min(R.n - 1.001, R.C(t) * R.hz)), i = Math.floor(x); return arr[i] + (arr[i + 1] - arr[i]) * (x - i); };
    const N = Math.floor(app.song.duration * 12), melody = [], voiced = [], energy = [], tension = [];
    for (let i = 0; i < N; i++) { const t = i / 12; melody.push(+at(R.melody, t).toFixed(4)); voiced.push(+at(R.voiced, t).toFixed(3)); energy.push(+at(R.energy, t).toFixed(4)); tension.push(+at(R.tension, t).toFixed(4)); }
    return { duration: app.song.duration, bpm: s.song?.bpm, meter: s.song?.meter, pulses: Array.from(R.pulses), choices: R.choices, ears: s.ears, gestures: hands, breaths: M.breath?.t ?? [], rests: M.rests ?? [], melody, voiced, energy, tension, conductor: (M.conductor ?? []).map(g => g.lead), depths: R.depths ? Array.from(R.depths, d => +d.toFixed(2)) : null, songIs: R.songIs, cast: s.cast ?? [], runs: (M.runs ?? []).map(r => ({ t0: r.t0, t1: r.t1, c: r.c })), beat: M.beat };
  });
  await page.eval(`app.manual=true;app.governor.enabled=false;app.R.drawScale=1;app.t=0;app.ui?.song?.show?.(false)`);
  // WALK_GAIN=1.8: the stride that much deeper, on this page only, to see what it would do. The rehearsal hasn't seen it, so it isn't a film anyone gets.
  if (process.env.WALK_GAIN) await page.eval(g => { app.stage.score.walk.gain = g; }, +process.env.WALK_GAIN);
  const result = { song, ears: info.ears, bpm: info.bpm, meter: info.meter };
  log(`${song}: ${info.bpm?.toFixed(1)} bpm in ${info.meter}, hearing ${Object.keys(info.ears || {}).filter(k => info.ears[k]).join(',') || 'off'}, ${info.gestures.length} gestures`);

  if (rows.includes('gait')) {
    const g = gaitOf(info), seen = new Map(); for (const c of info.choices) seen.set(c.label, c.every);
    result.gait = { ...g, every: Object.fromEntries(seen) };
    const d = info.depths;
    log(`Gait ${g.ok ? 'PASS' : 'FAIL'}: ${g.pulses} strong beats, median ${g.median} s, longest ${g.longest} s (want ${HEAR.gap} s at most above ${HEAR.gapBpm} bpm). One every ${JSON.stringify(result.gait.every)} beats${d ? `. Depth ${pct(d, 0.1).toFixed(2)} to ${pct(d, 0.9).toFixed(2)}, median ${pct(d, 0.5).toFixed(2)}` : ''}`);
    if (process.env.ACC) { const shown = new Set(); for (const c of info.choices) if (!shown.has(c.label)) { shown.add(c.label); log(`  ${c.label} at ${c.t0.toFixed(0)} s: every ${c.every}, from ${c.start}, on each beat ${JSON.stringify(c.acc)}, deep ${c.deep?.toFixed(2)}`); } }
    if (process.env.ACC) log(`  song: ${JSON.stringify(info.songIs)}`);
    if (process.env.ACC) log(`  film: ${info.gestures.map(G => `${G.t0.toFixed(0)}-${G.t1.toFixed(0)}${G.hero ? ' ' + G.hero : ''} (morph ${G.morph.toFixed(1)})`).join(', ')}. Cast ${info.cast.map(h => `${h.kind} ${h.t0}-${h.t1}`).join(', ')}`);
    log(`Who leads: ${Object.entries(info.conductor.reduce((o, k) => (o[k] = (o[k] || 0) + 1, o), {})).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  }
  if (rows.includes('follow')) {
    const cap = await captureSong(page, { ...info, song });
    save(`${song}.follow.json`, JSON.stringify(cap));
    const f = judgeCapture(cap);
    const parts = []; for (const G of info.gestures) { const m = G.t1 - G.morph; parts.push({ a: G.t0, b: m, kind: G.hero ? 'hero' : 'plain' }, { a: m, b: G.t1, kind: 'morph' }); }
    const by = followBy(cap, parts);
    result.follow = { F: f.F, shifted: f.shifted, auc: f.auc, peaks: f.peaks, beats: f.beats, fold: f.fold, by };
    log(`Follow: F ${f.F}, off the beat ${f.shifted}, AUC ${f.auc}, ${f.beats} beats, ${f.peaks} peaks. Plan's marks F ${FOLLOW.F}, off ${FOLLOW.shifted}, AUC ${FOLLOW.auc}`);
    log(`  by stretch: ${Object.entries(by).map(([k, v]) => `${k} ${v.beats} beats F ${v.F} AUC ${v.auc}`).join('; ')}`);
    log(`  fold -400..+400: ${f.fold.map(x => x.toFixed(1)).join(' ')}`);
  }
  if (rows.includes('decode')) {
    const b64 = await page.eval(tilesInPage, { t0: 0, t1: info.duration, fps: 12 });
    const raw = decodeCapture(b64), n = Math.floor(raw.length / 48), L = 48, X = [];
    // Displacement: moved so far, with its own slow drift (the flow, the long move) taken off over 4 s either way. Means, likewise.
    const R = 48, cols = Array.from({ length: L }, (_, k) => { const o = new Float64Array(n); let run = 0; for (let i = 0; i < n; i++) { const v = raw[i * L + k]; run = k % 3 ? run + Math.max(-3, Math.min(3, v)) : v; o[i] = run; } const a = new Float64Array(n + 1); for (let i = 0; i < n; i++) a[i + 1] = a[i] + o[i]; return o.map((v, i) => v - (a[Math.min(n, i + R)] - a[Math.max(0, i - R)]) / (Math.min(n, i + R) - Math.max(0, i - R))); });
    for (let i = 0; i < n; i++) { const x = new Array(L); for (let k = 0; k < L; k++) x[k] = cols[k][i]; X.push(x); }
    const secs = info.breaths.length ? info.breaths : [0], groupAt = t => { let g = 0; for (let k = 0; k < secs.length; k++) if (secs[k] <= t) g = k; return Math.floor(g / 3); };
    const keep = [], groups = []; for (let i = 0; i < n; i++) if (info.voiced[i] > 0.5) { keep.push(i); groups.push(groupAt(i / 12)); }
    const y = keep.map(i => info.melody[i]), Xk = keep.map(i => X[i]);
    const dec = keep.length > 200 ? decodeOf(Xk, y, groups) : null;
    const eg = []; for (let i = 0; i < n; i++) eg.push(groupAt(i / 12));
    const ener = decodeOf(X, Array.from({ length: n }, (_, i) => info.energy[i]), eg), tens = decodeOf(X, Array.from({ length: n }, (_, i) => info.tension[i]), eg);
    result.decode = { melody: dec, energy: ener, tension: tens, voicedSeconds: r3(keep.length / 12) };
    log(`Decode: melody R2 ${dec?.r2} against shifted ${dec?.shifted} (z ${dec?.z}) over ${r3(keep.length / 12)} voiced seconds; energy ${ener.r2}/${ener.shifted}, tension ${tens.r2}/${tens.shifted}`);
  }
  if (rows.includes('rings')) {
    const starts = [0.3, 0.65].map(x => +(x * info.duration).toFixed(2)), seconds = 30, r = await page.eval(meansInPage, { starts, seconds, fps: 60 });
    const f = ringsOf(decodeCapture(r.b64), r.N, starts, 60, info.pulses);
    result.rings = f;
    log(`Rings ${f.ok ? 'PASS' : 'FAIL'}: ${(f.near * 100).toFixed(0)}% of tiles peak within ${HEAR.ringsNear * 1000} ms of the beat (want ${HEAR.ringsShare * 100}%+). Peaks at ${f.lags.join(' ')} s; how much it rises ${f.rise.join(' ')}`);
  }
  if (rows.includes('bass')) {
    const r = await page.eval(bassInPage, { duration: info.duration, step: 0.25 }), on = r.a.some(v => v !== 0);
    if (!on) { result.bass = { on: false }; log('Bass: not on in this film'); }
    else {
      const line = rootLine(info.runs, info.beat, r.t), root = corr(r.y, line), kick = corr(highPass(r.a, 8), highPass(r.kick, 8)), ok = root >= HEAR.bassRoot && Math.abs(kick) < HEAR.bassKick;
      result.bass = { root: r3(root), kick: r3(kick), moved: r3(meanOf(r.moved)), ok };
      log(`Bass ${ok ? 'PASS' : 'FAIL'}: height against the root r ${r3(root)} (want ${HEAR.bassRoot}+), strength against the kick r ${r3(kick)} (want under ${HEAR.bassKick}), moves a pixel ${r3(meanOf(r.moved))}/255 on average`);
    }
  }
  if (rows.includes('whitney')) {
    const heroes = info.cast.filter(h => h.kind === 'whitney');
    result.whitney = [];
    if (!heroes.length) log('Whitney: none in this film');
    for (const h of heroes) {
      const c = await page.eval(crossingsInPage, { t0: h.t0, t1: Math.min(h.t1, h.t0 + 30), fps: 60 });
      result.whitney.push({ at: h.at, t0: h.t0, t1: h.t1, ...c });
      log(`Whitney ${c.mean < HEAR.crossings ? 'PASS' : 'FAIL'} ${h.t0}-${h.t1} s on ${h.id}: ${r3(c.mean)} edge crossings a second on the outer ring, worst second ${c.worstSecond} (want under ${HEAR.crossings}). By second ${c.perSec.slice(0, 12).join(' ')}`);
    }
    if (heroes.length) {
      const h = heroes[0], m = await page.eval(() => { const G = app.stage.score.gestures.find(x => x.hero === 'whitney'), w = G.moves[0]; return { every: w.every, from: w.from, to: w.to, n: w.whitney.length }; });
      const step = (m.to - m.from) / (m.n - 1), at = []; for (let i = 0; i < 6; i++) at.push(m.from + step * i / 2);
      const { contactSheet } = await page.eval(async ts => {
        const T = window.trippee, W = 320, H = 180, c = document.createElement('canvas'); c.width = W * 3; c.height = H * 2;
        const x = c.getContext('2d'); ts.forEach((t, i) => { T.seek(t); x.drawImage(T.canvas, (i % 3) * W, (i / 3 | 0) * H, W, H); });
        return { contactSheet: c.toDataURL('image/jpeg', 0.85) };
      }, at);
      save(`${song}.whitney.jpg`, contactSheet);
      log(`  every ${m.every} bars. Frames on a step, half way to the next, and so on: ${song}.whitney.jpg`);
    }
  }
  if (rows.includes('turns')) {
    const r = await page.eval(() => {
      const s = app.stage.score, at = s.turns ?? [], gOf = t => s.gestures.find(g => t >= g.t0 && t < g.t1);
      return { all: s.react.M.surprises ?? [], at: at.map(x => { const G = gOf(x.t), e = 0.02, back = s.phi(x.t + e, G) - s.phi(x.t - e, G); return { t: +x.t.toFixed(2), s: x.s, back: +(back / (2 * e)).toFixed(4), id: G?.pattern?.id, gears: G?.gears?.[0] }; }) };
    });
    const gaps = r.at.slice(1).map((x, i) => x.t - r.at[i].t), rules = r.all.length <= HEAR.surprises && gaps.every(g => g >= HEAR.surpriseApart), backward = r.at.filter(x => x.back < 0).length;
    result.turns = { ...r, rules, backward };
    log(`Turns ${rules && backward === r.at.length ? 'PASS' : 'FAIL'}: ${r.all.length} surprises found, ${r.at.length} clear of heroes, transformations and rests; ${backward} really run backward. ${r.at.map(x => `${x.t} s (surprise ${x.s}, flow ${x.back} on ${x.id})`).join('; ')}`);
  }
  if (rows.includes('share')) {
    const res = await page.eval(shareInPage, { duration: info.duration, step: +(process.env.SHARE_STEP || 0.5) });
    const voicedAt = (a, b) => { const i0 = Math.round(a * 12), i1 = Math.min(info.voiced.length, Math.round(Math.min(b, info.duration) * 12)); return meanOf(info.voiced.slice(i0, i1)); };
    const s = sharesOf(res, info.breaths, voicedAt);
    result.share = s;
    log(`Share ${s.ok ? 'PASS' : 'FAIL'}: ${JSON.stringify(s.shares)}. Tune per voiced breath: median ${s.median}, worst ${s.worst}, ${s.under} of ${s.voicedBreaths} under ${HEAR.tuneShare}. Tone for the song ${s.shares.tone}, want ${HEAR.toneShare}+`);
  }
  // PRINT: a film's fingerprint, to show that with hearing off nothing's different from a tree without any of this.
  if (rows.includes('print')) {
    const r = await page.eval(async ({ duration }) => {
      const T = window.trippee, app = T.app, enc = new TextEncoder(), hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''), out = {}, s = app.stage.score;
      const small = document.createElement('canvas'); small.width = 64; small.height = 36; const g = small.getContext('2d', { willReadFrequently: true }), thumbs = {};
      app.governor.enabled = false; app.R.drawScale = 1;
      for (let i = 0; i < 90; i++) { const t = +(1 + (duration - 2) * i / 89).toFixed(3); T.seek(t); const url = T.capture(); g.drawImage(T.canvas, 0, 0, 64, 36); const d = g.getImageData(0, 0, 64, 36).data; thumbs[t] = Array.from({ length: 64 * 36 }, (_, k) => d[k * 4 + 1]); out[t] = hex(await crypto.subtle.digest('SHA-256', enc.encode(url))).slice(0, 24); }
      return { shots: out, thumbs, size: [T.canvas.width, T.canvas.height], film: s.gestures.map(G => [G.t0, G.t1, G.morph ?? 0, G.pattern?.id, G.phiScale ?? 1, G.calm ?? 1, G.hero ?? '', G.melMode ?? 0, (G.gears || []).join('/')]), pulses: Array.from(s.react.pulses), stats: s.stats };
    }, { duration: info.duration });
    save(`${song}.print.json`, JSON.stringify(r));
    log(`Print: ${Object.keys(r.shots).length} frames and ${r.film.length} gestures`);
  }
  save(`${song}.hear.json`, JSON.stringify(result));
  const errs = page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  if (errs.length) log('page errors', errs.slice(0, 4));
};

// ---------------------------------------------------------------- no browser
export async function selftest() {
  const { strideAt, makeWalk } = await import('../src/score/react.js');
  let ok = true;
  const say = (good, what) => { console.log(`${good ? 'ok  ' : 'BAD '} ${what}`); if (!good) ok = false; };
  for (const L of [0.6, 1, 1.9]) {
    const n = 4000, sp = []; let mono = true, last = 0;
    for (let i = 1; i <= n; i++) { const v = strideAt(i / n, L); if (v < last - 1e-9) mono = false; sp.push((v - last) * n); last = v; }
    const top = Math.max(...sp), lastSp = sp[n - 1], firstSp = sp[0], biggest = Math.max(...sp.slice(1).map((v, i) => Math.abs(v - sp[i]))) * n / L;
    say(mono && Math.abs(strideAt(0, L)) < 1e-9 && Math.abs(strideAt(1, L) - 1) < 1e-6, `L ${L}: from 0 to 1, always forward`);
    say(top > 1.6 && top < 2.2 && Math.abs(lastSp - firstSp) < 0.02, `L ${L}: top speed ${top.toFixed(2)} of the mean, speed on the beat ${lastSp.toFixed(2)} and leaving it ${firstSp.toFixed(2)}`);
    console.log(`     L ${L}: steepest change of speed ${biggest.toFixed(1)} means per second`);
  }
  const R = { pulses: [1, 2, 3, 4, 9, 10], depths: [1, 1, 0.5, 0.5, 1, 1] }, w = makeWalk(R, t => t);
  say(R.pulses.every(p => Math.abs(w(p)) < 1e-9), 'the walk is zero on every strong beat, so nothing landing on one has moved');
  let worst = 0, prev = w(1); for (let t = 1.001; t < 10; t += 0.001) { const v = w(t); worst = Math.max(worst, Math.abs(v - prev)); prev = v; }
  say(worst < 0.0015, `no jump in it: largest step ${worst.toFixed(5)} s per ms`);
  say(Math.abs(w(6.5)) < 0.2, `a long gap just pours: ${w(6.5).toFixed(3)} s behind in the middle of a 5 s one, where a 1 s one is ${w(1.5).toFixed(3)}`);
  // the decoder: a table written in the features is found; shifted, it isn't
  let seed = 9; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const n = 1200, y = [], X = [], g = []; let v = 0;
  for (let i = 0; i < n; i++) { v = 0.97 * v + 0.2 * (rnd() - 0.5); y.push(v); X.push([v + 0.1 * (rnd() - 0.5), rnd(), rnd(), -v + 0.1 * (rnd() - 0.5)]); g.push(Math.floor(i / 150)); }
  const d = decodeOf(X, y, g), noise = decodeOf(X.map(() => [rnd(), rnd(), rnd(), rnd()]), y, g);
  say(d.r2 > 0.7 && d.z > HEAR.decodeZ, `a tune in the picture is read back: R2 ${d.r2} against ${d.shifted}, z ${d.z}`);
  say(noise.r2 < 0.1, `no tune in the picture, nothing read back: R2 ${noise.r2}`);
  return ok;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--selftest') process.exit((await selftest()) ? 0 : 1);
  if (process.argv[2] === '--same') {
    const { readFileSync } = await import('node:fs'), [a, b] = process.argv.slice(3, 5).map(f => JSON.parse(readFileSync(f, 'utf8')));
    const shots = Object.keys(a.shots), diff = shots.filter(k => a.shots[k] !== b.shots[k]), film = JSON.stringify(a.film) === JSON.stringify(b.film), beats = JSON.stringify(a.pulses) === JSON.stringify(b.pulses);
    if (diff.length && a.thumbs && b.thumbs) { let worst = 0, sum = 0; for (const k of diff) { let e = 0; a.thumbs[k].forEach((v, i) => { e += Math.abs(v - b.thumbs[k][i]); }); e /= a.thumbs[k].length; worst = Math.max(worst, e); sum += e; } console.log(`  thumbnails differ by ${(sum / diff.length).toFixed(2)}/255 on average, worst ${worst.toFixed(2)}. Sizes ${a.size} and ${b.size}`); }
    console.log(`${diff.length ? 'DIFFER' : 'SAME'}: ${shots.length - diff.length}/${shots.length} frames identical, gestures ${film ? 'identical' : 'DIFFER'}, strong beats ${beats ? 'identical' : 'DIFFER'}${diff.length ? '. First at ' + diff.slice(0, 6).join(' ') : ''}`);
    process.exit(diff.length || !film || !beats ? 1 : 0);
  }
  console.error('usage: SONG=... node tools/lab.mjs tests/hear.mjs --out lab-out/<lane>, or node tests/hear.mjs --selftest'); process.exit(2);
}
