// Follow: does the picture land on the song's strong beats? docs/MODES.md section 7. Pure: a capture goes in, numbers come out, and a saved capture can be judged again with no browser.
//
//   SONG=media/mgmt.mp3 node tools/lab.mjs tests/follow.mjs --out lab-out/<lane>      the whole song at 60 fps on 96x54. Writes <song>.follow.json. WORLD=<id> for a world. Muted, as ever.
//   node tests/follow.mjs lab-out/<lane>/mgmt.follow.json                             judges that again
//   node tests/follow.mjs lab-out/<lane>/mgmt.windows.json                            a judge capture: only its "pulse" windows (10 beats, 3 s each), and only tile means, so |change in the tile's mean| stands in for the tile's mean |change|. Indicative
//   node tests/follow.mjs --selftest                                                  knows a following picture from one that doesn't, on made-up series
//   CONTROL=on SONG=...  node tools/lab.mjs tests/follow.mjs ...                      the same in real pixels: the flow clock warped by hand to fall into each pulse. CONTROL=off falls between them
//
// Per tile (the judge's sixteen) m(t) = mean |dL| between one frame and the last. Impact is a sudden stop: v(t) = sum over tiles of max(0, m(t-50 ms) - m(t+50 ms)).
// Then peaks of v, and F at +-70 ms against R.pulses, one peak to one beat, and F again with the grid off the beat.
// Per-beat AUC: the chance that v's peak within +-70 ms of a real pulse beats v's peak at the same reach around a point off the grid. Pass: F at least .7, off-grid F at most .35, AUC at least .85.
//
// "Half a bar off" is what the plan says, but it isn't always off: a pulse every two beats in 4/4 (react.js picks 2, 4 or 8) lands on itself half a bar along. So where half a bar lands back on
// the grid the off grid is half the pulse spacing instead, and the result says which it used.
import { readFileSync, existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FOLLOW = { F: 0.7, shifted: 0.35, auc: 0.85, tol: 0.07, reach: 0.05, tiles: 16 };

const mean = a => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; };
const medianOf = a => { const s = Float64Array.from(a).sort(); return s.length ? s[s.length >> 1] : 0; };
const r3 = x => +(+x).toFixed(3);

// m: a flat Float32Array or array, tiles x frames, frame first. Returns v per frame.
export function impactOf(m, fps, tiles = FOLLOW.tiles, reach = FOLLOW.reach) {
  const n = Math.floor(m.length / tiles), L = Math.max(1, Math.round(reach * fps)), v = new Float64Array(n);
  for (let i = L + 1; i < n - L; i++) {
    let s = 0;
    for (let k = 0; k < tiles; k++) { const d = m[(i - L) * tiles + k] - m[(i + L) * tiles + k]; if (d > 0) s += d; }
    v[i] = s;
  }
  return v;
}

// Local maxima within +-200 ms that stand two standard deviations above what's within +-1.5 s of them. Absolute size doesn't come into it: a big picture with a small stop on the beat still stops on the beat.
// Chosen on the real-pixel controls (CONTROL=on, off, and none, on mgmt): it knows nothing of the grid, and of the settings tried it separates them best without one. See the plan's marks against what those reach before moving this.
export function peaksOf(v, fps) {
  const n = v.length, near = Math.max(1, Math.round(0.2 * fps)), far = Math.round(1.5 * fps), out = [];
  const a = new Float64Array(n + 1), b = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { a[i + 1] = a[i] + v[i]; b[i + 1] = b[i] + v[i] * v[i]; }
  for (let i = 1; i < n - 1; i++) {
    if (v[i] <= 0) continue;
    let top = true;
    for (let k = Math.max(0, i - near); k <= Math.min(n - 1, i + near) && top; k++) if (v[k] > v[i] || (v[k] === v[i] && k < i)) top = false;
    if (!top) continue;
    const lo = Math.max(0, i - far), hi = Math.min(n, i + far + 1), c = hi - lo, u = (a[hi] - a[lo]) / c, s = Math.sqrt(Math.max(0, (b[hi] - b[lo]) / c - u * u));
    if (v[i] >= u + 2 * s) out.push(i);
  }
  return out;
}

// One peak to one beat, each to its nearest free partner within tol.
export function fOf(peakTimes, beats, tol = FOLLOW.tol) {
  if (!peakTimes.length || !beats.length) return { F: 0, precision: 0, recall: 0, hits: 0 };
  const P = Float64Array.from(peakTimes).sort(), B = Float64Array.from(beats).sort();
  let i = 0, hits = 0;
  for (const b of B) {
    while (i < P.length && P[i] < b - tol) i++;
    if (i < P.length && P[i] <= b + tol) { hits++; i++; }
  }
  const precision = hits / P.length, recall = hits / B.length;
  return { F: precision + recall ? (2 * precision * recall) / (precision + recall) : 0, precision, recall, hits };
}

// The grid off the beat: half a bar along if that's really off the grid, else half the spacing of the pulses.
export function offGrid(pulses, bar, tol = FOLLOW.tol) {
  const P = Float64Array.from(pulses).sort();
  const nearBeat = t => { let lo = 0, hi = P.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (P[m] < t) lo = m + 1; else hi = m; } return Math.min(Math.abs(P[lo] - t), lo ? Math.abs(P[lo - 1] - t) : 1e9); };
  const onItself = shift => { let c = 0; for (const p of P) if (nearBeat(p + shift) <= tol * 2) c++; return c / Math.max(P.length, 1); };
  const gaps = []; for (let i = 1; i < P.length; i++) gaps.push(P[i] - P[i - 1]);
  const spacing = gaps.length ? medianOf(gaps) : bar;
  const half = (bar || spacing) / 2, useHalfBar = onItself(half) <= 0.5;
  const shift = useHalfBar ? half : spacing / 2;
  return { grid: Array.from(P, p => p + shift), shift: r3(shift), used: useHalfBar ? 'half a bar' : 'half the pulse spacing, since half a bar lands on the grid', spacing: r3(spacing) };
}

// Mann-Whitney: how often a beat's peak beats an off-grid peak.
export function aucOf(on, off) {
  if (!on.length || !off.length) return null;
  let s = 0;
  for (const a of on) for (const b of off) s += a > b ? 1 : a === b ? 0.5 : 0;
  return s / (on.length * off.length);
}

// A capture: { fps, t0, tiles, m, pulses, bar }. Everything else is worked out here, so a threshold can change and a capture be judged again.
export function followOf({ fps, t0 = 0, m, tiles = FOLLOW.tiles, pulses, bar }, limits = FOLLOW) {
  const v = impactOf(m, fps, tiles), n = v.length, end = t0 + (n - 1) / fps;
  const beats = pulses.filter(t => t >= t0 + 0.2 && t <= end - 0.2);
  const pk = peaksOf(v, fps), times = pk.map(i => t0 + i / fps);
  const off = offGrid(beats, bar);
  const grid = off.grid.filter(t => t >= t0 + 0.2 && t <= end - 0.2);
  const real = fOf(times, beats), shifted = fOf(times, grid);
  const top = t => { const c = Math.round((t - t0) * fps), r = Math.round(limits.tol * fps); let b = 0; for (let i = Math.max(0, c - r); i <= Math.min(n - 1, c + r); i++) if (v[i] > b) b = v[i]; return b; };
  const auc = aucOf(beats.map(top), grid.map(top));
  // v folded on the pulse, for looking at: where a beat's stop really falls, in 40 ms bins from -400 to +400 ms
  const B = 21, fold = new Float64Array(B), cnt = new Float64Array(B);
  for (const b of beats) for (let k = 0; k < B; k++) { const i = Math.round((b + (k - 10) * 0.04 - t0) * fps); if (i >= 0 && i < n) { fold[k] += v[i]; cnt[k]++; } }
  const pass = real.F >= limits.F && shifted.F <= limits.shifted && auc >= limits.auc;
  return { F: r3(real.F), shifted: r3(shifted.F), auc: auc == null ? null : r3(auc), beats: beats.length, peaks: times.length, precision: r3(real.precision), recall: r3(real.recall), shift: off.shift, offIs: off.used, spacing: off.spacing, fold: Array.from(fold, (x, k) => r3(x / Math.max(cnt[k], 1))), pass };
}

// A judge capture: 3 s windows at 60 fps with only the tile means in them, and a real |dL| that's only for the whole frame. So: the tile means' change, per window, around the "pulse" windows only.
// AUC is all these can give: F needs the whole song. off-grid points are half a bar either side of the beat, both inside the window.
export function followFromWindows(windows, bar) {
  const P = windows.filter(w => w.what === 'pulse');
  const on = [], off = [];
  const half = bar / 2;
  for (const w of P) {
    const n = w.tiles.length, m = new Float64Array(n * 16);
    for (let i = 1; i < n; i++) for (let k = 0; k < 16; k++) m[i * 16 + k] = Math.abs(w.tiles[i][k] - w.tiles[i - 1][k]);
    const v = impactOf(m, w.fps), t0 = w.time[0];
    const top = t => { const c = Math.round((t - t0) * w.fps), r = Math.round(FOLLOW.tol * w.fps); let b = 0; for (let i = Math.max(0, c - r); i <= Math.min(n - 1, c + r); i++) if (v[i] > b) b = v[i]; return b; };
    on.push(top(w.mark));
    for (const s of [-half, half]) if (w.mark + s > t0 + 0.2 && w.mark + s < w.time[n - 1] - 0.2) off.push(top(w.mark + s));
  }
  return { auc: r3(aucOf(on, off)), beats: on.length, offPoints: off.length };
}

// ---------------------------------------------------------------- in the page
// Steps the film at fps through t0..t1 and gives back tiles x frames of mean |dL|, on what's on screen. Base64 of a Float32Array, since a song is about a megabyte of it.
export const captureInPage = async ({ t0, t1, fps }) => {
  const T = window.trippee, W = 96, H = 54, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  const N = Math.floor((t1 - t0) * fps), out = new Float32Array(N * 16), tile = new Int32Array(W * H), count = new Float64Array(16);
  for (let y = 0; y < H; y++) for (let X = 0; X < W; X++) { const k = Math.min(3, (y * 4 / H) | 0) * 4 + Math.min(3, (X * 4 / W) | 0); tile[y * W + X] = k; count[k]++; }
  let prev = null;
  for (let i = 0; i < N; i++) {
    T.seek(t0 + i / fps);
    x.drawImage(T.canvas, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data, L = new Float32Array(W * H);
    for (let k = 0; k < L.length; k++) L[k] = d[k * 4] * 0.2126 + d[k * 4 + 1] * 0.7152 + d[k * 4 + 2] * 0.0722;
    if (prev) { for (let k = 0; k < L.length; k++) out[i * 16 + tile[k]] += Math.abs(L[k] - prev[k]); for (let q = 0; q < 16; q++) out[i * 16 + q] = out[i * 16 + q] / count[q]; }
    prev = L;
    if (i % 30 === 0) await new Promise(r => setTimeout(r));
  }
  const b = new Uint8Array(out.buffer); let s = '';
  for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode(...b.subarray(i, i + 32768));
  return btoa(s);
};
export const decodeCapture = b64 => { const b = Buffer.from(b64, 'base64'); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); };

// One song, from a page with the song in it and the view small.
export async function captureSong(page, { pulses, duration, bpm, meter, song, world = null }) {
  const m = await page.eval(captureInPage, { t0: 0, t1: duration, fps: 60 });
  return { song, world, fps: 60, t0: 0, tiles: 16, pulses, bar: (60 / (bpm || 120)) * (meter || 4), bpm, meter, duration, mB64: m };
}
export const judgeCapture = c => followOf({ ...c, m: c.m ?? decodeCapture(c.mB64) });

export default async ({ page, log, save, sleep }) => {
  const { dropSong, enterWorld } = await import('../tools/look.mjs');
  const songPath = process.env.SONG || 'media/mgmt.mp3', song = basename(songPath).replace(/\.\w+$/, ''), world = process.env.WORLD || null;
  await page.send('Emulation.setDeviceMetricsOverride', { width: 480, height: 270, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  await dropSong(page, songPath, { resolvePath: resolve, sleep });
  if (world) await enterWorld(page, world, log);
  const info = await page.eval(() => { const s = app.song.score; return { duration: app.song.duration, bpm: s.song?.bpm, meter: s.song?.meter, pulses: Array.from((s.heard ?? s.react)?.pulses || []) }; });
  await page.eval(`app.manual=true;app.governor.enabled=false;app.R.drawScale=1;app.t=0`);
  // A control in real pixels: the film's own flow clock warped by hand, so the sheet really does fall into each pulse (change 1's speed law, .15 + x^1.5) or into the point half way between them. Nothing in the film is changed but this page's copy of its clock.
  const control = process.env.CONTROL;
  if (control) await page.eval(({ control }) => {
    const s = app.stage.score, P = Array.from((s.heard ?? s.react).pulses), phi0 = s.phi;
    const at = control === 'off' ? P.slice(1).map((p, i) => (p + P[i]) / 2) : P;
    const warp = t => {
      let lo = 0, hi = at.length - 1; if (t < at[0] || t >= at[hi]) return t;
      while (lo < hi - 1) { const m = (lo + hi) >> 1; if (at[m] <= t) lo = m; else hi = m; }
      const a = at[lo], b = at[hi], x = (t - a) / (b - a), I = u => 0.15 * u + Math.pow(u, 2.5) / 2.5;
      return a + (b - a) * I(x) / I(1);
    };
    s.phi = (t, G) => phi0(warp(t), G);
  }, { control });
  const t0 = Date.now();
  const cap = await captureSong(page, { ...info, song, world });
  save(`${song}${world ? '-' + world : ''}${control ? '-control-' + control : ''}.follow.json`, JSON.stringify(cap));
  const f = judgeCapture(cap);
  log(`Follow ${song}${world ? ' in ' + world : ''}: F ${f.F}, off the beat ${f.shifted} (${f.offIs}, ${f.shift} s), AUC ${f.auc}, ${f.beats} beats, ${f.peaks} peaks, precision ${f.precision}, recall ${f.recall}. ${f.pass ? 'PASS' : 'FAIL'}; want F ${FOLLOW.F}+, off ${FOLLOW.shifted} at most, AUC ${FOLLOW.auc}+. Took ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  log(`v folded on the pulse, -400..+400 ms: ${f.fold.join(' ')}`);
  const errs = page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  if (errs.length) log('page errors', errs.slice(0, 4));
};

// ---------------------------------------------------------------- made-up series, so it's known what it can see
export function selftest() {
  let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const fps = 60, secs = 120, n = fps * secs, bar = 1.92;
  const pulses = []; for (let t = 1; t < secs - 1; t += bar) pulses.push(+t.toFixed(3));
  const mk = stopAt => {
    const m = new Float64Array(n * 16);
    for (let i = 0; i < n; i++) {
      const t = i / fps;
      // flow slows into each stop and sets off again
      let near = 1e9; for (const p of stopAt) if (Math.abs(t - p) < Math.abs(near)) near = t - p;
      const s = near < 0 && near > -0.25 ? 6 : near >= 0 && near < 0.2 ? 0.3 : 1.5;     // fast just before, nearly still just after
      for (let k = 0; k < 16; k++) m[i * 16 + k] = s * (1 + 0.15 * (rnd() - 0.5));
    }
    return m;
  };
  const noise = new Float64Array(n * 16); for (let i = 0; i < noise.length; i++) noise[i] = 1.5 * (1 + 0.8 * (rnd() - 0.5));
  const cases = [
    { name: 'stops on the pulses', m: mk(pulses), want: f => f.F >= 0.9 && f.auc >= 0.95 && f.shifted <= 0.2 && f.pass },
    { name: 'stops half a bar off', m: mk(pulses.map(p => p + bar / 2)), want: f => f.F <= 0.2 && f.auc <= 0.1 && !f.pass },
    { name: 'never stops, just noise', m: noise, want: f => f.F <= 0.45 && Math.abs(f.auc - 0.5) <= 0.25 && !f.pass },
    { name: 'pulses every half bar: half a bar lands on the grid', m: mk(pulses.flatMap(p => [p, p + bar / 2])), pulses: pulses.flatMap(p => [p, p + bar / 2]), want: f => f.F >= 0.9 && f.shifted <= 0.2 && f.pass && /spacing/.test(f.offIs) },
  ];
  let ok = true;
  for (const c of cases) {
    const f = followOf({ fps, t0: 0, m: c.m, pulses: c.pulses ?? pulses, bar });
    const good = c.want(f); if (!good) ok = false;
    console.log(`${good ? 'ok  ' : 'BAD '} ${c.name}: F ${f.F}, off ${f.shifted}, AUC ${f.auc}, ${f.peaks} peaks for ${f.beats} beats`);
  }
  return ok;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2];
  if (arg === '--selftest') process.exit(selftest() ? 0 : 1);
  if (!arg) { console.error('usage: node tests/follow.mjs <song.follow.json | song.windows.json> | --selftest'); process.exit(2); }
  const J = JSON.parse(readFileSync(arg, 'utf8'));
  if (Array.isArray(J)) {
    const song = basename(arg).replace(/\.windows\.json$/, ''), jf = join(dirname(arg), `judge-${song}.json`);
    const info = existsSync(jf) ? JSON.parse(readFileSync(jf, 'utf8')).info : null;
    const bpm = +process.env.BPM || info?.bpm, meter = +process.env.METER || info?.meter || 4;
    if (!bpm) { console.error('no judge json beside it: say BPM='); process.exit(2); }
    console.log(song, JSON.stringify(followFromWindows(J, (60 / bpm) * meter)));
  } else console.log(JSON.stringify(judgeCapture(J)));
}
