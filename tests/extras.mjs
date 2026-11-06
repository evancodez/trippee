// The extras against signals whose answer is known, then against the four songs, muted.
//
//   node tests/extras.mjs                                        synthetic only, no browser. ONLY=trem,echo picks some
//   SONGS=ppp,mgmt node tools/lab.mjs tests/extras.mjs --out lab-out/extras
//                                                                the real songs through the real worker and cache, in Chrome. The lab always mutes it. Writes picture.png of what came out.
// Songs have no ground truth here, so what's checked on them is what can be: bytes of A unchanged, time, the cache, and that a field disagrees with loudness and with the drums where it claims to.
import { pathToFileURL } from 'node:url';
import { extras, makeFFT } from '../src/music/extras.js';
import { analyse, SR } from '../src/music/analysis.js';

// ---------------------------------------------------------------- signals
const mulberry = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const hzOf = m => 440 * Math.pow(2, (m - 69) / 12);
const zeros = sec => new Float32Array(Math.ceil(sec * SR));
const addInto = (a, b, gain = 1, at = 0) => { for (let i = 0; i < b.length && i + at < a.length; i++) a[i + at] += b[i] * gain; return a; };

// a held chord of harmonic notes, a little detuned so it isn't one perfect comb
function pad(chords, sec, { each = 2, harm = [1, .6, .4, .3, .2, .15, .1, .08], seed = 3, level = .12 } = {}) {
  const rand = mulberry(seed), x = zeros(sec), ph = {};
  for (let i = 0; i < x.length; i++) {
    const t = i / SR, c = chords[Math.floor(t / each) % chords.length];
    let s = 0;
    for (const m of c) { const f = hzOf(m); for (let h = 0; h < harm.length; h++) { if (f * (h + 1) > 10000) break; const key = m * 16 + h; ph[key] ??= rand() * 6.28; s += harm[h] * Math.sin(2 * Math.PI * f * (h + 1) * t + ph[key]); } }
    x[i] = s * level;
  }
  return x;
}
function pluck(x, at, midi, { decay = 12, level = .3, harm = [1, .5, .35, .25, .15, .1] } = {}) {
  const a = Math.floor(at * SR), f = hzOf(midi), n = Math.min(x.length - a, Math.floor(SR * Math.min(3, 7 / decay)));
  for (let i = 0; i < n; i++) { const t = i / SR; let s = 0; for (let h = 0; h < harm.length; h++) s += harm[h] * Math.sin(2 * Math.PI * f * (h + 1) * t); x[a + i] += level * s * Math.exp(-decay * t) * Math.min(1, t * 400); }
}
const tremolo = (x, rate, depth) => x.map((v, i) => v * (1 + depth * Math.cos(2 * Math.PI * rate * i / SR)));
function delay(x, sec, g, { taps = 0 } = {}) {       // taps 0: feedback. Otherwise that many repeats, each g times the last
  const L = Math.round(sec * SR), y = Float32Array.from(x);
  if (!taps) { for (let i = L; i < y.length; i++) y[i] += g * y[i - L]; return y; }
  for (let k = 1; k <= taps; k++) { const gain = g ** k, at = L * k; for (let i = at; i < y.length; i++) y[i] += gain * x[i - at]; }
  return y;
}
function convolve(x, h) {
  let F = 1; while (F < x.length + h.length) F <<= 1;
  const fft = makeFFT(F), a = new Float64Array(F), ai = new Float64Array(F), b = new Float64Array(F), bi = new Float64Array(F);
  a.set(x); b.set(h);
  fft(a, ai); fft(b, bi);
  for (let k = 0; k < F; k++) { const r = a[k] * b[k] - ai[k] * bi[k], m = a[k] * bi[k] + ai[k] * b[k]; a[k] = r; ai[k] = -m; }
  fft(a, ai);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = a[i] / F;
  return out;
}
function reverb(x, rt, { mix = 1, seed = 11, dry = 1 } = {}) {
  const rand = mulberry(seed), n = Math.floor(SR * Math.min(rt * 1.5, 8)), h = new Float32Array(n), k = Math.log(1000) / rt;     // 60 dB in amplitude is a factor of 1000
  let e = 0;
  for (let i = 0; i < n; i++) { h[i] = (rand() * 2 - 1) * Math.exp(-k * i / SR); e += h[i] * h[i]; }
  const g = mix / Math.sqrt(e) * 0.7;
  for (let i = 0; i < n; i++) h[i] *= g;
  const wet = convolve(x, h);
  return wet.map((v, i) => v + dry * x[i]);
}
function drum(x, at, kind, level, rand) {
  const a = Math.floor(at * SR);
  if (kind === 'kick') for (let i = 0, n = Math.floor(.18 * SR); i < n && a + i < x.length; i++) { const t = i / SR; x[a + i] += level * Math.sin(2 * Math.PI * (48 * t + (50 / 30) * (1 - Math.exp(-30 * t)))) * Math.exp(-t * 18); }
  if (kind === 'snare') for (let i = 0, n = Math.floor(.16 * SR); i < n && a + i < x.length; i++) { const t = i / SR; x[a + i] += level * (.6 * Math.sin(2 * Math.PI * 240 * t) * Math.exp(-t * 28) + .7 * (rand() * 2 - 1) * Math.exp(-t * 20)); }
  if (kind === 'hat') { let last = 0; for (let i = 0, n = Math.floor(.05 * SR); i < n && a + i < x.length; i++) { const t = i / SR, w = rand() * 2 - 1, hp = w - last; last = w; x[a + i] += level * hp * Math.exp(-t * 90); } }
  if (kind === 'tom') for (let i = 0, n = Math.floor(.14 * SR); i < n && a + i < x.length; i++) { const t = i / SR; x[a + i] += level * (Math.sin(2 * Math.PI * 130 * t) + .35 * (rand() * 2 - 1)) * Math.exp(-t * 24); }
}
function drums(sec, bpm, { kick = [0, 2], snare = [1, 3], hats = 2, seed = 5, level = .5, fillBars = [] } = {}) {
  const rand = mulberry(seed), x = zeros(sec), b = 60 / bpm, bars = Math.ceil(sec / (4 * b));
  for (let bar = 0; bar < bars; bar++) {
    const t = bar * 4 * b, fill = fillBars.includes(bar);
    for (let q = 0; q < 4; q++) {
      if (fill && q >= 2) continue;
      if (kick.includes(q)) drum(x, t + q * b, 'kick', level, rand);
      if (snare.includes(q)) drum(x, t + q * b, 'snare', level * .8, rand);
    }
    for (let e = 0; e < 4 * hats; e++) if (!(fill && e >= 2 * hats)) drum(x, t + e * b / hats, 'hat', level * .25, rand);
    if (fill) for (let s = 0; s < 8; s++) drum(x, t + (2 + s / 4) * b, s % 2 ? 'snare' : 'tom', level * .8, rand);
  }
  return x;
}
const mix = (...xs) => { const n = Math.max(...xs.map(a => a.length)), o = new Float32Array(n); for (const x of xs) addInto(o, x); return o; };

// ---------------------------------------------------------------- an A with a known clock, so a test here only tests the extras
function fakeA(sec, bpm = 120, meter = 4) {
  const spb = 60 / bpm, beats = [], tauHz = 100, tau = new Float64Array(Math.ceil(sec * tauHz) + 2);
  for (let t = 0; t < sec; t += spb) beats.push(t);
  for (let k = 0; k < tau.length; k++) tau[k] = (k / tauHz) / spb;
  const barBeats = []; for (let i = 0; i < beats.length; i += meter) barBeats.push(i);
  const E = new Float32Array(Math.ceil(sec * SR / 512)).fill(.5);
  return { duration: sec, beats: Float64Array.from(beats), bars: Float64Array.from(barBeats, i => beats[i]), barBeats: Int32Array.from(barBeats), meter, bpm, tau, tauHz, chordStep: 4, chroma: new Float32Array(0), segments: [{ t0: 0, t1: sec, label: 'A' }], E };
}
const hear = async (x, opts = {}) => { const sec = x.length / SR; return extras(x, opts.right ?? x, opts.A ?? fakeA(sec, opts.bpm ?? 120)); };

// ---------------------------------------------------------------- bookkeeping
const results = [];
const check = (name, ok, said) => { results.push({ name, ok: !!ok, said }); console.log(`${ok ? 'pass' : 'FAIL'}  ${name}  ${said ?? ''}`); };
const note = (name, said) => console.log(`      ${name}  ${said}`);
const med = a => { const s = Array.from(a).sort((p, q) => p - q); return s.length ? s[s.length >> 1] : 0; };
const avg = a => { let s = 0; for (const v of a) s += v; return s / Math.max(1, a.length); };
const f = (x, d = 2) => (+x).toFixed(d);
const corr = (a, b) => { const n = Math.min(a.length, b.length); let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n; let c = 0, x = 0, y = 0; for (let i = 0; i < n; i++) { c += (a[i] - ma) * (b[i] - mb); x += (a[i] - ma) ** 2; y += (b[i] - mb) ** 2; } return c / Math.sqrt(x * y || 1); };
const CMAJ = [48, 55, 60, 64, 67], AMIN = [45, 52, 57, 60, 64], FMAJ = [41, 53, 57, 60, 65], GMAJ = [43, 55, 59, 62, 67];

// ---------------------------------------------------------------- the tests
const tests = {
  async trem() {
    const base = pad([CMAJ], 16);
    for (const [rate, depth] of [[3, .2], [3, .5], [5, .3], [5, .7], [8, .4], [10, .5]]) {
      const X = await hear(tremolo(base, rate, depth)), mid = X.trem;
      const r = med(mid.rate.filter(v => v > 0)), d = med(mid.depth.filter(v => v > 0));
      check(`trem finds ${rate} Hz depth ${depth}`, mid.share > .6 && Math.abs(r - rate) < .35 && Math.abs(d - depth) < Math.max(.1, depth * .3), `rate ${f(r)} depth ${f(d)} heard ${f(mid.share)}`);
    }
    const none = await hear(base);
    check('trem: a still pad has none', none.trem.share === 0, `heard ${f(none.trem.share)}`);
    const changes = await hear(pad([CMAJ, AMIN, FMAJ, GMAJ], 24, { each: 1 }));
    check('trem: chord changes every second are not tremolo', changes.trem.share < .1, `heard ${f(changes.trem.share)}`);
    // strumming: the same chord struck at a steady rate, the thing that fools it
    for (const rate of [4, 6, 8]) {
      const x = zeros(16); for (let t = 0; t < 16; t += 1 / rate) for (const m of CMAJ) pluck(x, t, m, { decay: 10, level: .1 });
      const X = await hear(x);
      check(`trem: strumming at ${rate} Hz is rejected`, X.trem.share < .1, `heard ${f(X.trem.share)} sharp ${f(med(X.trem.raw.sharp))} coh ${f(med(X.trem.raw.coh))}`);
    }
    const dr = await hear(drums(16, 120));
    check('trem: a drum kit alone is not tremolo', dr.trem.share < .1, `heard ${f(dr.trem.share)}`);
    const dr16 = await hear(drums(16, 120, { hats: 4, kick: [0, 1, 2, 3] }));
    check('trem: four on the floor with 16th hats is not tremolo', dr16.trem.share < .1, `heard ${f(dr16.trem.share)}`);
    const over = await hear(mix(tremolo(base, 5, .5), drums(16, 110, { level: .3 })));
    const r = med(over.trem.rate.filter(v => v > 0));
    check('trem: 5 Hz .5 survives a drum kit on top', over.trem.share > .4 && Math.abs(r - 5) < .4, `rate ${f(r)} depth ${f(med(over.trem.depth.filter(v => v > 0)))} heard ${f(over.trem.share)}`);
    const sw = await hear(mix(pad([CMAJ, AMIN], 20, { each: 4 }).map((v, i) => v * (1 + .5 * Math.cos(2 * Math.PI * 4.5 * i / SR)))));
    check('trem: tremolo through chord changes', sw.trem.share > .5, `rate ${f(med(sw.trem.rate.filter(v => v > 0)))} heard ${f(sw.trem.share)}`);
  },

  async echo() {
    const dry = () => { const x = zeros(30), rand = mulberry(7); let t = .1; while (t < 28) { pluck(x, t, 55 + Math.floor(rand() * 24), { decay: 18, level: .35 }); t += .9 + rand() * 1.4; } return x; };
    const base = dry();
    for (const [lag, g] of [[.12, .5], [.25, .3], [.25, .6], [.375, .5], [.5, .7], [.6, .5]]) {
      const X = await hear(delay(base, lag, g)), e = X.echo;
      check(`echo finds ${lag * 1000} ms feedback ${g}`, Math.abs(e.lag[0] - lag) < .012 && e.wet[0] > .1, `lag ${f(e.lag[0], 3)} wet ${f(e.wet[0])} level ${f(e.level[0])} repeat ratio ${f(e.feedback[0])} lopsided ${f(e.lop[0])}`);
    }
    const slap = await hear(delay(base, .12, .5, { taps: 1 }));
    check('echo: one slapback at 120 ms', Math.abs(slap.echo.lag[0] - .12) < .012 && slap.echo.wet[0] > .05, `lag ${f(slap.echo.lag[0], 3)} wet ${f(slap.echo.wet[0])} ratio ${f(slap.echo.feedback[0])}`);
    const d0 = await hear(base);
    check('echo: dry plucks are dry', d0.echo.wet[0] < .1, `wet ${f(d0.echo.wet[0])} lopsided ${f(d0.echo.lop[0])}`);
    // the thing that fools a plain autocorrelation: a steady rhythm of notes, no delay anywhere
    const rh = zeros(30), rand = mulberry(9), notes = [60, 64, 67, 72];
    for (let i = 0, t = 0; t < 29; i++, t += .25) pluck(rh, t, notes[i % 4], { decay: 16, level: i % 4 === 0 ? .4 : .22 });
    const R = await hear(rh);
    check('echo: a steady eighth-note rhythm is dry', R.echo.wet[0] < .1, `wet ${f(R.echo.wet[0])} lag ${f(R.echo.lag[0], 3)} lopsided ${f(R.echo.lop[0])} level ${f(R.echo.level[0])}`);
    const rd = await hear(drums(30, 120));
    check('echo: a drum kit is dry', rd.echo.wet[0] < .1, `wet ${f(rd.echo.wet[0])} lag ${f(rd.echo.lag[0], 3)}`);
    const rhd = await hear(delay(rh, .375, .5));
    check('echo: dotted-eighth delay on that rhythm', Math.abs(rhd.echo.lag[0] - .375) < .02 && rhd.echo.wet[0] > .05, `wet ${f(rhd.echo.wet[0])} lag ${f(rhd.echo.lag[0], 3)} grid ${f(rhd.echo.grid[0], 3)}`);
    const pd = await hear(mix(delay(base, .375, .5), pad([CMAJ], 30, { level: .03 }), drums(30, 96, { level: .3 })));
    check('echo: 375 ms under a quiet pad and a drum kit', Math.abs(pd.echo.lag[0] - .375) < .02 && pd.echo.wet[0] > .05, `wet ${f(pd.echo.wet[0])} lag ${f(pd.echo.lag[0], 3)} `);
  },

  async air() {
    // stabs that stop dead, in a room whose decay we chose
    const stabs = sec => { const x = zeros(sec), rand = mulberry(4); let t = .2; while (t < sec - 3) { const m = 48 + Math.floor(rand() * 24), n = Math.floor(.12 * SR), a = Math.floor(t * SR), ff = hzOf(m); for (let i = 0; i < n; i++) { const tt = i / SR; let s = 0; for (let h = 1; h <= 8; h++) s += Math.sin(2 * Math.PI * ff * h * tt) / h; x[a + i] += .25 * s * Math.min(1, tt * 500) * Math.min(1, (n - i) / 40); } t += 1.4 + rand() * 1.5; } return x; };
    const base = stabs(40);
    const seen = [];
    for (const rt of [.3, .6, 1.2, 2.4, 4]) {
      const X = await hear(reverb(base, rt, { dry: .5 }));
      seen.push([rt, X.air.song]);
      check(`air: ${rt} s room`, X.air.song > rt * .6 && X.air.song < rt * 1.5, `said ${f(X.air.song)} s, from ${X.air.decays} decays, windows with enough ${f(X.air.share)}`);
    }
    const dryStabs = await hear(base);
    check('air: dry stabs read short', dryStabs.air.song < .3, `said ${f(dryStabs.air.song)} s, ${dryStabs.air.decays} decays`);
    // sustained: the case the plan warned about. If it can't tell, it should say nothing rather than guess
    for (const rt of [.5, 2.5]) {
      const p = reverb(pad([CMAJ, AMIN, FMAJ, GMAJ], 40, { each: 3 }), rt, { dry: .5 });
      const X = await hear(p);
      note(`air on a sustained pad, ${rt} s room`, `said ${f(X.air.song)} s, ${X.air.decays} decays, enough in ${f(X.air.share)} of windows`);
    }
    for (const rt of [.5, 2.5]) {
      const p = mix(reverb(mix(pad([CMAJ, AMIN, FMAJ, GMAJ], 40, { each: 2, level: .06 }), stabs(40)), rt, { dry: .5 }), drums(40, 110, { level: .35 }));
      const X = await hear(p);
      note(`air on a band with dry drums, ${rt} s room`, `said ${f(X.air.song)} s, ${X.air.decays} decays, enough in ${f(X.air.share)}`);
    }
  },

  async shim() {
    const chorus = (x, sec = .018, depth = .004, rate = 1.1, seed = 0) => { const y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) { const d = (sec + depth * Math.sin(2 * Math.PI * rate * i / SR + seed)) * SR, a = i - d, j = Math.floor(a), fr = a - j; y[i] = x[i] + (j >= 0 ? x[j] * (1 - fr) + x[j + 1] * fr : 0); } return y; };
    const still = pad([CMAJ], 24), moving = pad([CMAJ, AMIN, FMAJ, GMAJ], 24, { each: 2 });
    const a = await hear(still), b = await hear(chorus(still)), c = await hear(moving), d = await hear(chorus(moving)), e = await hear(drums(24, 120)), g = await hear(mix(chorus(moving), drums(24, 120, { level: .3 }))), h = await hear(mix(moving, drums(24, 120, { level: .3 })));
    const v = X => avg(X.shim.raw);
    note('shim', `still ${f(v(a), 3)} still+chorus ${f(v(b), 3)} changes ${f(v(c), 3)} changes+chorus ${f(v(d), 3)} drums ${f(v(e), 3)} changes+drums ${f(v(h), 3)} changes+chorus+drums ${f(v(g), 3)}`);
    check('shim: chorus on a still pad reads above dry', v(b) > 3 * v(a) + .01, `${f(v(b), 3)} against ${f(v(a), 3)}`);
    check('shim: chorus through chord changes reads above dry changes', v(d) > 1.5 * v(c), `${f(v(d), 3)} against ${f(v(c), 3)}`);
    check('shim: chorus under drums reads above dry under drums', v(g) > 1.3 * v(h), `${f(v(g), 3)} against ${f(v(h), 3)}`);
    check('shim: a tremolo is coherent, not shimmer', avg((await hear(tremolo(still, 3, .5))).shim.raw) < .5 * v(b), '');
  },

  async width() {
    const n = pad([CMAJ], 8), other = pad([AMIN], 8, { seed: 9 });
    const W = async (l, r) => (await hear(l, { right: r })).width.song;
    const mono = await W(n, n);
    check('width: mono is 0', mono < 1e-4, f(mono, 4));
    const onlyL = await W(n, new Float32Array(n.length));
    check('width: one side only is .5', Math.abs(onlyL - .5) < .001, f(onlyL, 3));
    const anti = await W(n, n.map(v => -v));
    check('width: out of phase is 1', anti > .999, f(anti, 3));
    const half = await W(n.map(v => v * 1.5), n.map(v => v * .5));     // mid 1, side .5: .5/1.5 = 1/3
    check('width: known ratio 1/3', Math.abs(half - 1 / 3) < .002, f(half, 3));
    const un = await W(n, other);
    check('width: two different parts is near .5', Math.abs(un - .5) < .08, f(un, 3));
  },

  async wave() {
    const sec = 6, f0 = 110, t = i => i / SR, tab = { };
    const sine = Float32Array.from({ length: sec * SR }, (_, i) => .5 * Math.sin(2 * Math.PI * f0 * t(i)));
    const K = 40, band = shape => Float32Array.from({ length: sec * SR }, (_, i) => { let s = 0; for (let h = 1; h <= K; h++) { if (h * f0 > 10000) break; s += shape(h) * Math.sin(2 * Math.PI * h * f0 * t(i)); } return .4 * s; });
    const square = band(h => (h % 2 ? 1 / h : 0)), saw = band(h => (h % 2 ? 1 : -1) / h);
    const asTable = shape => { const o = new Float32Array(64); let pk = 0; for (let i = 0; i < 64; i++) { let s = 0; for (let h = 1; h <= 24; h++) s += shape(h) * Math.sin(2 * Math.PI * h * i / 64); o[i] = s; pk = Math.max(pk, Math.abs(s)); } return o.map(v => v / pk); };
    for (const [name, x, shape] of [['sine', sine, h => (h === 1 ? 1 : 0)], ['square', square, h => (h % 2 ? 1 / h : 0)], ['saw', saw, h => (h % 2 ? 1 : -1) / h]]) {
      const X = await hear(x), W = X.wave, n = W.conf.length, want = asTable(shape);
      let c = 0, cnt = 0, rms = 0;
      for (let q = 4; q < n - 4; q++) { const got = Float32Array.from({ length: 64 }, (_, i) => W.table[q * 64 + i] / 127); c += corr(got, want); cnt++; for (let i = 0; i < 64; i++) rms += (got[i] - want[i]) ** 2; }
      check(`wave: ${name} comes back as itself, standing still`, c / cnt > .98, `correlation ${f(c / cnt, 3)}, rms error ${f(Math.sqrt(rms / cnt / 64), 3)}, period ${f(med(W.hz))} Hz, conf ${f(med(W.conf))}`);
    }
    // the same note at another pitch, same table
    const up = Float32Array.from({ length: sec * SR }, (_, i) => { let s = 0; for (let h = 1; h <= 24; h++) { if (h * 220 > 10000) break; s += (h % 2 ? 1 : 0) / h * Math.sin(2 * Math.PI * h * 220 * t(i)); } return .4 * s; });
    const a = await hear(square), b = await hear(up);
    check('wave: a square an octave up is the same table', corr(Int8Array.from(a.wave.table.subarray(8 * 64, 9 * 64)), Int8Array.from(b.wave.table.subarray(8 * 64, 9 * 64))) > .9, '');
    const rand = mulberry(2), noise = Float32Array.from({ length: sec * SR }, () => (rand() * 2 - 1) * .3);
    const N = await hear(noise);
    check('wave: noise has no shape to give', N.wave.share < .1, `share confident ${f(N.wave.share)}, conf ${f(med(N.wave.conf))}`);
    const dr = await hear(drums(12, 120));
    note('wave on drums', `share confident ${f(dr.wave.share)}`);
    const dense = await hear(mix(pad([CMAJ, AMIN], 12), drums(12, 120, { level: .4 })));
    note('wave on chords and drums', `share confident ${f(dense.wave.share)} conf ${f(med(dense.wave.conf))}: the "dense mix" case`);
    check('wave: size', sec * 4 * 64 === a.wave.table.length, `${a.wave.table.length} bytes`);
  },

  async snare() {
    const X = await hear(mix(drums(32, 120), pad([CMAJ, AMIN], 32, { level: .03 }))), s = X.snare, bb = [[], [], [], []];
    for (let i = 0; i < s.length; i++) bb[i % 4].push(s[i]);
    const m = bb.map(avg);
    check('snare: 2 and 4 stand over 1 and 3', Math.min(m[1], m[3]) > 3 * Math.max(m[0], m[2]), m.map(v => f(v)).join(' '));
    const hats = await hear(mix(drums(32, 120, { snare: [], hats: 4 })));
    check('snare: kick and hats alone leave it low', avg(hats.snare) < .35 && avg(hats.snare.subarray(0, 8)) >= 0, `mean ${f(avg(hats.snare))}, 1 2 3 4: ${[0, 1, 2, 3].map(q => f(avg(hats.snare.filter((_, i) => i % 4 === q)))).join(' ')}`);
    const off = await hear(drums(32, 120, { snare: [3] })), o = [0, 1, 2, 3].map(q => avg(off.snare.filter((_, i) => i % 4 === q)));
    check('snare: on the 4 only', o[3] > 3 * Math.max(o[0], o[1], o[2]), o.map(v => f(v)).join(' '));
  },

  async clip() {
    // A verse clean and a verse driven, at equal level. Then the trap: clean and loud against dirty and quiet.
    const b = pad([CMAJ, AMIN], 40, { level: .05 }), drive = g => { const y = b.map(v => Math.tanh(v * g)); let e = 0, e0 = 0; for (let i = 0; i < b.length; i++) { e += y[i] * y[i]; e0 += b[i] * b[i]; } const k = Math.sqrt(e0 / e); return y.map(v => v * k); };
    const dirty = drive(12), x = new Float32Array(b.length);
    for (let i = 0; i < x.length; i++) x[i] = (i / SR) % 20 < 10 ? b[i] : dirty[i];
    const dr = drums(40, 120, { level: .15 });
    const part = (X, a0, a1) => avg(X.clip.value.subarray(a0 * 10, a1 * 10));
    const A1 = await hear(x), s1 = [part(A1, 1, 9), part(A1, 11, 19)];
    check('clip: driven above clean at equal level', s1[1] > s1[0] + .3, `clean ${f(s1[0])} driven ${f(s1[1])}`);
    const A2 = await hear(mix(x, dr)), s2 = [part(A2, 1, 9), part(A2, 11, 19)];
    check('clip: and under a drum kit', s2[1] > s2[0] + .2, `clean ${f(s2[0])} driven ${f(s2[1])}`);
    const trap = new Float32Array(b.length);
    for (let i = 0; i < x.length; i++) trap[i] = (i / SR) % 20 < 10 ? 2.5 * b[i] : .4 * dirty[i];
    const A3 = await hear(trap), s3 = [part(A3, 1, 9), part(A3, 11, 19)];
    check('clip: loud and clean below quiet and driven', s3[1] > s3[0] + .2, `loud clean ${f(s3[0])} quiet driven ${f(s3[1])}`);
    // the other trap: same clean chords, hats come in. Nothing's distorted.
    const hatsIn = new Float32Array(b.length), hh = drums(40, 120, { kick: [], snare: [], hats: 4, level: .4 });
    for (let i = 0; i < b.length; i++) hatsIn[i] = b[i] + ((i / SR) % 20 < 10 ? 0 : hh[i]);
    const A4 = await hear(hatsIn), s4 = [part(A4, 1, 9), part(A4, 11, 19)];
    note('clip when clean hats come in and nothing distorts', `no hats ${f(s4[0])}, hats ${f(s4[1])}${s4[1] > s4[0] + .2 ? '  -- it reads hats as clipping' : ''}`);
  },

  async fill() {
    const bars = [7, 15, 23], X = await hear(mix(drums(64, 120, { fillBars: bars }), pad([CMAJ, AMIN], 64, { level: .03 }))), r = X.fill.runs;
    const hitBar = q => r.some(g => g.t0 >= (q + .25) * 2 - .3 && g.t0 <= (q + 1) * 2);
    const found = bars.filter(hitBar), wrong = r.filter(g => !bars.some(q => g.t0 >= (q + .25) * 2 - .3 && g.t0 <= (q + 1) * 2));
    check('fill: finds the drummer\'s fills', found.length === bars.length, `found ${found.length} of ${bars.length}, at ${r.map(g => f(g.t0)).join(' ')}`);
    check('fill: and nothing else', wrong.length === 0, `${wrong.length} wrong`);
    const land = r.every(g => bars.some(q => Math.abs(g.land - (q + 1) * 2) < .05));
    check('fill: lands on the next bar line', land, r.map(g => f(g.land)).join(' '));
    const none = await hear(drums(64, 120, { hats: 4 }));
    check('fill: a steady kit has none', none.fill.runs.length === 0, `${none.fill.runs.length}`);
    const chords = await hear(pad([CMAJ, AMIN, FMAJ, GMAJ], 40, { each: .5 }));
    check('fill: fast chords with no drums have none', chords.fill.runs.length === 0, `${chords.fill.runs.length} ${chords.fill.runs.map(g => `${f(g.t0)}-${f(g.t1)} hits ${g.hits.length}`).join(' ')}`);
    const sect = new Float32Array(SR * 64), quiet = drums(64, 120, { hats: 2, level: .4 }), busy = drums(64, 120, { hats: 4, kick: [0, 1, 2, 3], level: .4 });
    for (let i = 0; i < sect.length; i++) sect[i] = (i / SR) < 32 ? quiet[i] : busy[i];
    const S = await hear(sect);
    check('fill: a busier section is not a fill', S.fill.runs.length <= 1, `${S.fill.runs.length} at ${S.fill.runs.map(g => f(g.t0)).join(' ')}`);
  },

  async bass() {
    const line = [40, 40, 43, 45, 33, 36, 38, 40, 28, 31, 33, 35, 47, 45, 43, 40], beat = .5, sec = 32, want = t => line[Math.floor(t / beat) % line.length];
    const mk = () => { const x = zeros(sec); let ph = 0; for (let i = 0; i < x.length; i++) { const t = i / SR, fr = hzOf(want(t)), u = (t % beat) / beat; ph += fr / SR; const q = ph % 1; let s = 0; for (let h = 1; h <= 6; h++) s += Math.sin(2 * Math.PI * h * q) / (h * h * .5 + .5); x[i] = .3 * s * Math.min(1, u * 40) * Math.exp(-u * .6); } return x; };
    const b = mk();
    const score = (X, skip = .12) => { const B = X.bassPitch; let ok = 0, n = 0, oct = 0; for (let q = 0; q < B.midi.length; q++) { const t = q / B.hz, u = t % beat; if (t < 1 || t > sec - 1 || u < skip || u > beat - skip) continue; n++; const d = B.midi[q] - want(t); if (Math.abs(d) <= .5) ok++; else if (Math.abs(((d % 12) + 18) % 12 - 6) <= .5) oct++; } return [ok / n, oct / n]; };
    const clean = score(await hear(b));
    check('bassPitch: a known line, alone', clean[0] > .9, `${f(clean[0] * 100, 0)}% within a half step, ${f(clean[1] * 100, 0)}% an octave out`);
    const kit = score(await hear(mix(b, drums(sec, 120, { level: .5 }))));
    check('bassPitch: under a kick-heavy kit', kit[0] > .75, `${f(kit[0] * 100, 0)}% within a half step, ${f(kit[1] * 100, 0)}% an octave out`);
    const band = score(await hear(mix(b, drums(sec, 120, { level: .4 }), pad([[60, 64, 67], [57, 60, 64]], sec, { level: .03 }))));
    check('bassPitch: in a band', band[0] > .7, `${f(band[0] * 100, 0)}% within a half step, ${f(band[1] * 100, 0)}% an octave out`);
    const noBass = await hear(mix(drums(sec, 120), pad([[60, 64, 67]], sec, { level: .05 })));
    note('bassPitch with no bass', `conf ${f(avg(noBass.bassPitch.conf))} against ${f(avg((await hear(b)).bassPitch.conf))} with one`);
  },

  async cut() {
    const sec = 16, bpm = 120, tone = Float32Array.from({ length: sec * SR }, (_, i) => .5 * Math.sin(2 * Math.PI * 40 * i / SR));   // 2 s bars: 80 wiggles a bar
    const X = await hear(tone), C = X.cut;
    let cross = 0;
    const row = 3, get = (r, j, c = 0) => C.data[2 * (r * C.width + j) + c] - 128;
    for (let j = 1; j < C.width; j++) if ((get(row, j) >= 0) !== (get(row, j - 1) >= 0)) cross++;
    check('cut: 40 Hz is 80 wiggles a 2 s bar', Math.abs(cross / 2 - 80) <= 1, `${cross / 2} wiggles, ${C.width} x ${C.height}, ${C.data.length} bytes, cutoff ${f(C.cutoff)} Hz`);
    let top = 0; for (let j = 0; j < C.width; j++) top = Math.max(top, Math.abs(get(row, j)));
    check('cut: full scale', top > 110, `peak ${top}`);
    let sideMax = 0; for (let j = 0; j < C.data.length / 2; j++) sideMax = Math.max(sideMax, Math.abs(C.data[2 * j + 1] - 128));
    check('cut: mono has no side', sideMax <= 1, `side peak ${sideMax}`);
    const high = Float32Array.from({ length: sec * SR }, (_, i) => .5 * Math.sin(2 * Math.PI * 1000 * i / SR) + .5 * Math.sin(2 * Math.PI * 40 * i / SR));
    const H = await hear(high), c = corr(H.cut.data.filter((_, i) => i % 2 === 0), C.data.filter((_, i) => i % 2 === 0));
    check('cut: 1 kHz is gone', c > .97, `correlation with the 40 Hz alone ${f(c, 3)}`);
    const st = await hear(tone, { right: tone.map(v => -v) });
    let m2 = 0, s2 = 0; for (let j = 0; j < st.cut.data.length / 2; j++) { m2 = Math.max(m2, Math.abs(st.cut.data[2 * j] - 128)); s2 = Math.max(s2, Math.abs(st.cut.data[2 * j + 1] - 128)); }
    check('cut: out of phase is all side', s2 > 110 && m2 <= 1, `mid ${m2} side ${s2}`);
    // a slow bar: 512 a bar at 4 s is 128 Hz, and 120 Hz would fold
    const slow = await hear(tone, { A: fakeA(sec, 60) });
    check('cut: slow bars bring the cutoff down', slow.cut.cutoff < 60, `4 s bars: cutoff ${f(slow.cut.cutoff)} Hz`);
    const A = fakeA(sec, 120), Y = await extras(tone, tone, A);
    check('cut: covers the whole song', Y.cut.edges[0] <= 0 && Y.cut.edges[Y.cut.edges.length - 1] >= sec, `${f(Y.cut.edges[0])} to ${f(Y.cut.edges[Y.cut.edges.length - 1])}`);
    // the resample on tau: a tempo that speeds up, and a tone locked to the beat. Every bar must then be the same row.
    const durD = 24, tauHz = 100, tau = new Float64Array(durD * tauHz + 2), bps = t => 1.6 + .1 * t;       // 96 bpm rising to 240
    for (let k = 1; k < tau.length; k++) tau[k] = tau[k - 1] + bps((k - .5) / tauHz) / tauHz;
    const tauAt = t => { const x = t * tauHz, i = Math.min(tau.length - 2, Math.floor(x)); return tau[i] + (tau[i + 1] - tau[i]) * (x - i); };
    const beats = []; for (let b = 0, k = 0; b < tau[tau.length - 1]; b++) { while (k + 1 < tau.length && tau[k + 1] < b) k++; if (k + 1 >= tau.length) break; beats.push((k + (b - tau[k]) / (tau[k + 1] - tau[k])) / tauHz); }
    const barB = []; for (let i = 0; i < beats.length; i += 4) barB.push(i);
    const locked = Float32Array.from({ length: durD * SR }, (_, i) => .5 * Math.sin(2 * Math.PI * 6 * tauAt(i / SR)));   // 6 cycles a beat: 24 a bar, whatever the tempo
    const clock = { duration: durD, beats: Float64Array.from(beats), bars: Float64Array.from(barB, i => beats[i]), barBeats: Int32Array.from(barB), meter: 4, bpm: 150, tau, tauHz, chordStep: 4, chroma: new Float32Array(0), segments: [{ t0: 0, t1: durD }], E: new Float32Array(1000).fill(.5) };
    const L = await extras(locked, locked, clock), rows = L.cut.height, W = L.cut.width, barRow = r => Float32Array.from({ length: W }, (_, j) => L.cut.data[2 * (r * W + j)] - 128);
    let least = 1; for (let r = 2; r < rows - 2; r++) least = Math.min(least, corr(barRow(r), barRow(2)));
    check('cut: on the song\'s clock, a speeding tempo keeps every bar the same', least > .95, `least correlation between bars ${f(least, 3)} over ${rows} bars`);
  },

  async sustain() {
    const a = await hear(pad([CMAJ], 12)), b = await hear(drums(12, 120)), x = zeros(12); for (let t = 0; t < 11; t += .25) pluck(x, t, 60, { decay: 30 });
    const c = await hear(x);
    check('sustain: held notes high', avg(a.sustain) > .85, f(avg(a.sustain)));
    check('sustain: a drum kit low', avg(b.sustain) < .45, f(avg(b.sustain)));
    check('sustain: short plucks between', avg(c.sustain) > avg(b.sustain) - .05 && avg(c.sustain) < avg(a.sustain), f(avg(c.sustain)));
  },

  // voices reads the main analysis' chroma, so this one goes through analyse() itself. Slow.
  async voices() {
    const dyad = [[60, 67]], triad = [[60, 64, 67]], sev = [[60, 64, 67, 70, 74]], one = [[60]];
    for (const [name, c, lo, hi] of [['one note', one, 1, 3.2], ['a fifth', dyad, 2, 4], ['a triad', triad, 3, 5], ['five notes', sev, 4, 7.5]]) {
      const x = pad(c, 16, { harm: [1, .5, .25, .12] });
      const A = await analyse(x.slice(0)), X = await extras(x, x, A);
      const m = avg(X.voices.subarray(1, Math.max(2, X.voices.length - 1)));
      check(`voices: ${name}`, m >= lo && m <= hi, `${f(m)} (${[...X.voices].map(v => f(v, 1)).slice(0, 6).join(' ')})`);
    }
    const sil = new Float32Array(16 * SR), rnd = mulberry(1); for (let i = 0; i < sil.length; i++) sil[i] = (rnd() * 2 - 1) * 1e-5;
    const A = await analyse(sil.slice(0)), X = await extras(sil, sil, A);
    note('voices in near silence', `${f(avg(X.voices))}`);
  },

  // Nothing here may write to A. And A itself is whatever analysis.js says, which this file doesn't touch.
  async pure() {
    const { createHash } = await import('node:crypto');
    const x = pad([CMAJ, AMIN], 12), A = await analyse(x.slice(0));
    const digest = o => { const h = createHash('sha256'); for (const k of Object.keys(o).sort()) { const v = o[k]; if (ArrayBuffer.isView(v)) h.update(k).update(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)); else h.update(k).update(JSON.stringify(v) ?? ''); } return h.digest('hex'); };
    const before = digest(A), xBefore = digest({ x });
    const one = await extras(x, x, A), two = await extras(x, x, A);
    check('extras never write to A', digest(A) === before, before.slice(0, 16));
    check('or to the samples', digest({ x }) === xBefore, '');
    const strip = v => { const { seconds, lap, ...rest } = v; return rest; };
    const flat = (o, h) => { if (ArrayBuffer.isView(o)) h.update(new Uint8Array(o.buffer, o.byteOffset, o.byteLength)); else if (Array.isArray(o)) o.forEach(v => flat(v, h)); else if (o && typeof o === 'object') for (const k of Object.keys(o).sort()) { h.update(k); flat(o[k], h); } else h.update(String(o)); return h; };
    check('the same song twice gives the same bytes', flat(strip(one), createHash('sha256')).digest('hex') === flat(strip(two), createHash('sha256')).digest('hex'), '');
  },

  // Nothing at the edges of the possible: no NaN anywhere, nothing thrown.
  async edges() {
    const finite = (o, path = '') => { if (ArrayBuffer.isView(o)) { for (const v of o) if (!Number.isFinite(v)) return path; return null; } if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) { const b = finite(o[i], path + '.' + i); if (b) return b; } return null; } if (o && typeof o === 'object') { for (const k of Object.keys(o)) { const b = finite(o[k], path + '.' + k); if (b) return b; } return null; } return typeof o === 'number' && !Number.isFinite(o) ? path : null; };
    const silence = new Float32Array(10 * SR), blip = new Float32Array(SR / 2).map((_, i) => Math.sin(i * .05) * .5), oneSide = pad([CMAJ], 8);
    const cases = [['ten seconds of silence', silence, silence], ['half a second', blip, blip], ['one channel silent', oneSide, new Float32Array(oneSide.length)], ['clipped flat out', oneSide.map(v => Math.sign(v)), oneSide.map(v => Math.sign(v))]];
    for (const [name, l, r] of cases) { const X = await extras(l, r, fakeA(l.length / SR)), bad = finite(X); check(`edges: ${name}`, !bad, bad ? `NaN at ${bad}` : ''); }
    const noClock = await extras(blip, blip, { duration: .5, beats: new Float64Array(0), bars: new Float64Array(0), barBeats: new Int32Array(0), meter: 4, bpm: 120, tau: new Float64Array(52), tauHz: 100, chordStep: 4, chroma: new Float32Array(0), segments: [], E: new Float32Array(0) });
    check('edges: a song with no beats at all', !finite(noClock), '');
  },

  // Cost: a 4-minute band, in Node, on this thread.
  async cost() {
    const sec = 240, x = mix(pad([CMAJ, AMIN, FMAJ, GMAJ], sec, { each: 2, level: .05 }), drums(sec, 120, { level: .3 }));
    const t0 = Date.now(), X = await extras(x, x, fakeA(sec, 120)), took = (Date.now() - t0) / 1000;
    check('under 10 s for 4 minutes', took < 10, `${f(took)} s: ${Object.entries(X.lap).map(([k, v]) => `${k} ${v}`).join(', ')} ms`);
    note('bytes', fieldBytes(X));
  },
};
function fieldBytes(X) {
  const size = o => (ArrayBuffer.isView(o) ? o.byteLength : Array.isArray(o) ? o.reduce((s, v) => s + size(v), 0) : o && typeof o === 'object' ? Object.values(o).reduce((s, v) => s + size(v), 0) : 8);
  return Object.entries(X).map(([k, v]) => `${k} ${Math.round(size(v) / 1024)}K`).join(' ');
}

async function node() {
  const only = process.env.ONLY?.split(',');
  for (const k of Object.keys(tests)) {
    if (only && !only.includes(k)) continue;
    const t0 = Date.now();
    console.log(`\n--- ${k}`);
    await tests[k]();
    console.log(`      (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length} of ${results.length} pass`);
  if (bad.length) { console.log('failed:'); for (const r of bad) console.log(`  ${r.name}  ${r.said ?? ''}`); process.exit(1); }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await node();

// ---------------------------------------------------------------- the real songs, in Chrome, muted
const ALL = ['ppp', 'wildflower', 'disclosure', 'mgmt'];
export default async function lab({ page, save, log }) {
  const names = process.env.SONGS?.split(',') ?? ALL, table = [];
  for (const name of names) {
    log(`--- ${name}`);
    if (process.env.INJECT) { const r = await page.eval(injectInPage, name); log(JSON.stringify(r, null, 0)); table.push(r); continue; }
    const r = await page.eval(songInPage, name);
    if (r.png) { save(`${name}.png`, r.png); delete r.png; }
    log(JSON.stringify(r, null, 0));
    table.push(r);
    check(`${name}: A's bytes unchanged by the extras`, r.AUnchanged, r.AHash);
    check(`${name}: under 10 s per 4 minutes`, r.extrasSeconds / r.duration * 240 < 10, `${r.extrasSeconds} s for ${r.duration} s, in the worker. Longest frame gap ${r.longestFrameGapMs} ms`);
    check(`${name}: the cache gives the same bytes, and at once`, r.cacheSameBytes && r.cachedSeconds < .2, `${r.cachedSeconds} s`);
  }
  save(process.env.INJECT ? 'inject.json' : 'songs.json', JSON.stringify(table, null, 1));
  const bad = results.filter(q => !q.ok);
  if (bad.length) throw new Error(`${bad.length} failed: ${bad.map(q => q.name).join('; ')}`);
}

// Ground truth on real music: do something known to the real song and see if the field moves by what it should. INJECT=1. Offline only, no output.
async function injectInPage(name) {
  const { extras, makeFFT } = await import('/src/music/extras.js');
  const SR = 22050, bytes = await (await fetch(`/media/${name}.mp3`)).arrayBuffer(), decoded = await new OfflineAudioContext(2, 44100, 44100).decodeAudioData(bytes.slice(0));
  const off = new OfflineAudioContext(2, Math.ceil(decoded.duration * SR), SR), src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
  const rend = await off.startRendering(), L = rend.getChannelData(0).slice(0), R = rend.getChannelData(1).slice(0), mono = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) mono[i] = (L[i] + R[i]) / 2;
  const A = await new Promise((res, rej) => { const w = new Worker('/src/music/analyse.worker.js', { type: 'module' }); w.onmessage = e => { if (e.data.result) { w.terminate(); res(e.data.result); } else if (e.data.error) rej(new Error(e.data.error)); }; const c = mono.slice(0); w.postMessage(c, [c.buffer]); });
  const avg = a => { let q = 0; for (const v of a) q += v; return q / Math.max(1, a.length); }, med = a => { const o = Float32Array.from(a).sort(); return o[o.length >> 1] ?? 0; };
  const r2 = x => +(+x).toFixed(2), r3 = x => +(+x).toFixed(3);
  const both = fn => [fn(L, 0), fn(R, 1)];
  const run = async ([l, r]) => extras(l, r, A);
  const sayTrem = X => ({ share: r2(X.trem.share), rate: r2(med(X.trem.rate.filter(v => v > 0))), depth: r2(med(X.trem.depth.filter(v => v > 0))) });
  const sayEcho = X => { const on = []; for (let i = 0; i < X.echo.lag.length; i++) if (Math.abs(X.echo.lag[i] - X.echo.floor) > 1e-4) on.push(r3(X.echo.lag[i])); return { sections: X.echo.lag.length, heard: on.length, song: X.echo.song ? r3(X.echo.song.lag) : null, score: r3(X.echo.songScore), lop: r2(X.echo.songLop), level: r2(X.echo.songLevel), lags: [...new Set(on)] }; };
  const out = { name };
  const dry = await run([L, R]);
  out.dry = { trem: sayTrem(dry), echo: sayEcho(dry), air: { song: r2(dry.air.song), share: r2(dry.air.share), decays: dry.air.decays }, shim: r3(avg(dry.shim.raw)) };
  // tremolo on the whole mix, then on one added part
  out.trem5_5 = sayTrem(await run(both(x => x.map((v, i) => v * (1 + .5 * Math.cos(2 * Math.PI * 5 * i / SR))))));
  out.trem3_3 = sayTrem(await run(both(x => x.map((v, i) => v * (1 + .3 * Math.cos(2 * Math.PI * 3 * i / SR))))));
  let e0 = 0; for (let i = 0; i < mono.length; i += 16) e0 += mono[i] * mono[i]; const rmsSong = Math.sqrt(e0 / (mono.length / 16));
  const part = (gain, rate, depth) => { const fs = [130.8, 196, 261.6, 329.6, 392], o = new Float32Array(mono.length); let k = 0; for (let i = 0; i < o.length; i++) { let v = 0; for (const f of fs) for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * f * h * i / SR) / h; o[i] = v; k += v * v; } const g = gain * rmsSong / Math.sqrt(k / o.length); for (let i = 0; i < o.length; i++) o[i] *= g * (1 + depth * Math.cos(2 * Math.PI * rate * i / SR)); return o; };
  const added = part(.7, 4.5, .7); out.part_trem4_5_at_minus3dB = sayTrem(await run(both(x => x.map((v, i) => v + added[i]))));
  const addedQ = part(.35, 4.5, .7); out.part_trem4_5_at_minus9dB = sayTrem(await run(both(x => x.map((v, i) => v + addedQ[i]))));
  // delay on the whole mix
  const delay = (x, lag, g) => { const n = Math.round(lag * SR), y = Float32Array.from(x); for (let i = n; i < y.length; i++) y[i] += g * y[i - n]; return y; };
  out.delay_375_5 = sayEcho(await run(both(x => delay(x, .375, .5))));
  out.delay_210_6 = sayEcho(await run(both(x => delay(x, .21, .6))));
  out.delay_600_3 = sayEcho(await run(both(x => delay(x, .6, .3))));
  // a room on the whole mix
  const reverb = (x, rt, seed) => { let F = 1, s = seed; const nh = Math.floor(SR * Math.min(rt * 1.5, 8)); while (F < x.length + nh) F <<= 1; const fft = makeFFT(F), a = new Float64Array(F), ai = new Float64Array(F), b = new Float64Array(F), bi = new Float64Array(F), rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }, k = Math.log(1000) / rt; let e = 0; for (let i = 0; i < nh; i++) { b[i] = (rand() * 2 - 1) * Math.exp(-k * i / SR); e += b[i] * b[i]; } const g = 1 / Math.sqrt(e); for (let i = 0; i < nh; i++) b[i] *= g; a.set(x); fft(a, ai); fft(b, bi); for (let i = 0; i < F; i++) { const re = a[i] * b[i] - ai[i] * bi[i], im = a[i] * bi[i] + ai[i] * b[i]; a[i] = re; ai[i] = -im; } fft(a, ai); const y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) y[i] = x[i] * .5 + a[i] / F * .7; return y; };
  for (const rt of [.5, 1.5, 4]) { const X = await run(both((x, c) => reverb(x, rt, 11 + c))); out[`room_${rt}`] = { song: r2(X.air.song), share: r2(X.air.share), decays: X.air.decays }; }
  // chorus on the whole mix
  const chorus = (x, ph) => { const y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) { const d = (.018 + .004 * Math.sin(2 * Math.PI * 1.1 * i / SR + ph)) * SR, a = i - d, j = Math.floor(a), f = a - j; y[i] = x[i] + (j >= 0 ? x[j] * (1 - f) + x[j + 1] * f : 0); } return y; };
  { const X = await run(both((x, c) => chorus(x, c * 1.5))); out.chorus = { shim: r3(avg(X.shim.raw)), dry: r3(avg(dry.shim.raw)), ratio: r2(avg(X.shim.raw) / avg(dry.shim.raw)) }; }
  // drive the second half at equal level
  { const half = Math.floor(L.length / 2), drive = (x, g) => { let e0 = 0, e1 = 0; const y = Float32Array.from(x); for (let i = half; i < x.length; i++) { y[i] = Math.tanh(x[i] * g); e0 += x[i] * x[i]; e1 += y[i] * y[i]; } const k = Math.sqrt(e0 / e1); for (let i = half; i < x.length; i++) y[i] *= k; return y; };
    for (const g of [2, 6]) { const X = await run(both(x => drive(x, g))), v = X.clip.value, n = v.length >> 1; out[`drive_${g}`] = { first: r2(avg(v.subarray(0, n))), second: r2(avg(v.subarray(n))), dryFirst: r2(avg(dry.clip.value.subarray(0, n))), drySecond: r2(avg(dry.clip.value.subarray(n))) }; } }
  return out;
}

// Runs in the page. Nothing here has an output: OfflineAudioContext only, so no sound can be made even before the lab's mute.
async function songInPage(name) {
  const { listenExtras, cacheGet, cachePut, EXTRAS_VERSION } = await import('/src/music/extras.js');
  const bytes = await (await fetch(`/media/${name}.mp3`)).arrayBuffer();
  const off0 = new OfflineAudioContext(2, 44100, 44100);
  const decoded = await off0.decodeAudioData(bytes.slice(0));
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 22050), 22050);
  const s = off.createBufferSource(); s.buffer = decoded; s.connect(off.destination); s.start();
  const mono = (await off.startRendering()).getChannelData(0).slice(0);
  const t0 = performance.now();
  const A = await new Promise((res, rej) => { const w = new Worker('/src/music/analyse.worker.js', { type: 'module' }); w.onmessage = e => { if (e.data.result) { w.terminate(); res(e.data.result); } else if (e.data.error) rej(new Error(e.data.error)); }; w.postMessage(mono, [mono.buffer]); });
  const mainSeconds = (performance.now() - t0) / 1000;
  const sha = async o => { const parts = []; for (const k of Object.keys(o).sort()) { const v = o[k]; if (k === 'x') continue; parts.push(new TextEncoder().encode(k)); if (ArrayBuffer.isView(v)) parts.push(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)); else parts.push(new TextEncoder().encode(JSON.stringify(v) ?? '')); } const n = parts.reduce((q, p) => q + p.length, 0), all = new Uint8Array(n); let at = 0; for (const p of parts) { all.set(p, at); at += p.length; } const d = await crypto.subtle.digest('SHA-256', all); return [...new Uint8Array(d)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join(''); };
  const before = await sha(A), hash = `labtest-${name}`;
  // the longest the page itself is held up while it listens
  let gap = 0, lastF = performance.now(), going = true;
  const tick = () => { const n = performance.now(); gap = Math.max(gap, n - lastF); lastF = n; if (going) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const t1 = performance.now();
  const X = await listenExtras(decoded, A, hash);
  const seconds = (performance.now() - t1) / 1000;
  going = false;
  const t2 = performance.now(), again = await listenExtras(decoded, A, hash), cached = (performance.now() - t2) / 1000;
  const same = await sha({ a: X.wave.table, b: X.cut.data, c: X.snare, d: X.trem.depth }) === await sha({ a: again.wave.table, b: again.cut.data, c: again.snare, d: again.trem.depth });

  const avg = a => { let q = 0; for (const v of a) q += v; return q / Math.max(1, a.length); };
  const pc = (a, p) => { const o = Float32Array.from(a).sort(); return o[Math.min(o.length - 1, Math.floor(o.length * p))] ?? 0; };
  const corr = (a, b) => { const n = Math.min(a.length, b.length); let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n; let c = 0, x = 0, y = 0; for (let i = 0; i < n; i++) { c += (a[i] - ma) * (b[i] - mb); x += (a[i] - ma) ** 2; y += (b[i] - mb) ** 2; } return c / Math.sqrt(x * y || 1); };
  const r2 = x => +(+x).toFixed(2), r3 = x => +(+x).toFixed(3);
  const resample = (a, n) => Float32Array.from({ length: n }, (_, i) => a[Math.min(a.length - 1, Math.floor((i + 0.5) * a.length / n))]);

  // snare by place in the bar
  const meter = A.meter, byBeat = Array.from({ length: meter }, () => []), barStart = new Set(Array.from(A.barBeats));
  { let pos = 0; for (let i = 0; i < X.snare.length; i++) { if (barStart.has(i)) pos = 0; byBeat[pos % meter].push(X.snare[i]); pos++; } }
  // the bass against the chords
  const B = X.bassPitch; let inChord = 0, onRoot = 0, cnt = 0;
  for (let q = 0; q < B.midi.length; q++) {
    if (B.conf[q] < 0.15) continue;
    const t = q / B.hz, c = A.chord[Math.min(A.chord.length - 1, Math.floor(t * 22050 / 512 / A.chordStep))], root = c >> 1, minor = c & 1, pcn = ((Math.round(B.midi[q]) % 12) + 12) % 12;
    cnt++;
    if (pcn === root) onRoot++;
    if (pcn === root || pcn === (root + (minor ? 3 : 4)) % 12 || pcn === (root + 7) % 12) inChord++;
  }
  const cm = X.cut.data; let mid2 = 0, side2 = 0; for (let i = 0; i < cm.length; i += 2) { mid2 += (cm[i] - 128) ** 2; side2 += (cm[i + 1] - 128) ** 2; }
  const E10 = resample(A.E, X.clip.value.length);
  // table steadiness: how like its neighbour each confident table is
  const T = X.wave.table, W = X.wave, n = W.conf.length; let steady = 0, sc = 0;
  for (let q = 1; q < n; q++) { if (W.conf[q] < 0.35 || W.conf[q - 1] < 0.35) continue; steady += corr(T.subarray(q * 64, (q + 1) * 64), T.subarray((q - 1) * 64, q * 64)); sc++; }

  const out = {
    name, duration: r2(decoded.duration), bpm: r2(A.bpm), meter, sections: A.segments.length, channels: decoded.numberOfChannels,
    mainSeconds: r2(mainSeconds), extrasSeconds: r2(seconds), workerSeconds: r2(X.seconds), lap: X.lap, cachedSeconds: r3(cached), cacheSameBytes: same, longestFrameGapMs: Math.round(gap),
    AUnchanged: before === await sha(A), AHash: before,
    wave: { confident: r2(W.share), confMedian: r2(pc(W.conf, .5)), confP90: r2(pc(W.conf, .9)), hzMedian: r2(pc(W.hz, .5)), steadiness: r2(steady / Math.max(sc, 1)) },
    snare: { byBeat: byBeat.map(a => r2(avg(a))), mean: r2(avg(X.snare)), p90: r2(pc(X.snare, .9)), lag1: r2(corr(X.snare.subarray(1), X.snare)), lag2: r2(corr(X.snare.subarray(2), X.snare)), lag4: r2(corr(X.snare.subarray(4), X.snare)) },
    clip: { mean: r2(avg(X.clip.value)), vsLoud: r2(corr(X.clip.value, E10)), iqr: r2(pc(X.clip.value, .75) - pc(X.clip.value, .25)) },
    fill: { hits: X.fill.hits, runs: X.fill.runs.length, at: X.fill.runs.map(g => `${r2(g.t0)}-${r2(g.t1)}>${r2(g.land)}:${g.hits.length}`) },
    trem: { share: r2(X.trem.share), rate: r2(pc(X.trem.rate.filter(v => v > 0), .5)), depth: r2(pc(X.trem.depth.filter(v => v > 0), .5)), passWindows: r2(avg(X.trem.raw.pass)), cohMedian: r2(pc(X.trem.raw.coh, .5)) },
    shim: { mean: r3(avg(X.shim.raw)), p10: r3(pc(X.shim.raw, .1)), p90: r3(pc(X.shim.raw, .9)), coherence: r2(avg(X.shim.coherence)), vsLoud: r2(corr(X.shim.raw, resample(A.E, X.shim.raw.length))) },
    air: { song: r2(X.air.song), share: r2(X.air.share), decays: X.air.decays },
    width: { song: r2(X.width.song), p10: r2(pc(X.width.value, .1)), p90: r2(pc(X.width.value, .9)) },
    echo: Array.from(X.echo.lag, (v, i) => `${r2(X.echo.t0[i])}:${A.segments[i].label} lag ${r3(v)} grid ${r3(X.echo.grid[i])} wet ${r2(X.echo.wet[i])} level ${r2(X.echo.level[i])} ratio ${r2(X.echo.feedback[i])} lop ${r2(X.echo.lop[i])}`),
    voices: { mean: r2(avg(X.voices)), p10: r2(pc(X.voices, .1)), p90: r2(pc(X.voices, .9)) },
    sustain: { mean: r2(avg(X.sustain)), p10: r2(pc(X.sustain, .1)), p90: r2(pc(X.sustain, .9)) },
    bass: { conf: r2(avg(B.conf)), usedShare: r2(cnt / B.midi.length), inChord: r2(inChord / Math.max(cnt, 1)), onRoot: r2(onRoot / Math.max(cnt, 1)), p10: r2(pc(B.midi, .1)), p90: r2(pc(B.midi, .9)) },
    cut: { size: `${X.cut.width}x${X.cut.height}`, kb: Math.round(cm.length / 1024), cutoff: r2(X.cut.cutoff), midRms: r2(Math.sqrt(mid2 / (cm.length / 2))), sideRms: r2(Math.sqrt(side2 / (cm.length / 2))), sideOverMidPeak: r3(X.cut.sidePeak / X.cut.midPeak) },
  };

  // the picture: one strip for each field, against the song's time
  const P = 1400, rows = [['wave (time x phase)', 64], ['wave conf', 18], ['clip / A.E', 44], ['snare per beat, fills', 40], ['trem depth', 30], ['shim', 30], ['air rt s', 30], ['width', 30], ['echo wet by section', 22], ['voices', 30], ['sustain', 26], ['bass midi', 70], ['cut mid (bars x 512)', 90]];
  const H = rows.reduce((q, r) => q + r[1] + 4, 24), cv = document.createElement('canvas'); cv.width = P; cv.height = H;
  const g = cv.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, P, H); g.font = '11px monospace'; g.fillStyle = '#fff'; g.fillText(`${name}  ${r2(A.bpm)} bpm  ${meter}/4`, 6, 14);
  let y = 24; const LEFT = 150, PW = P - LEFT - 6, D = decoded.duration, xOf = t => LEFT + (t / D) * PW;
  const line = (arr, tOf, h, top, color) => { g.strokeStyle = color; g.beginPath(); for (let i = 0; i < arr.length; i++) { const v = Math.min(1, Math.max(0, arr[i] / top)); const X0 = xOf(tOf(i)), Y0 = y + h - v * h; i ? g.lineTo(X0, Y0) : g.moveTo(X0, Y0); } g.stroke(); };
  const bar = (t0, t1, h, v, color) => { g.fillStyle = color; g.fillRect(xOf(t0), y + h - v * h, Math.max(1, xOf(t1) - xOf(t0)), v * h); };
  for (const [label, h] of rows) {
    g.fillStyle = '#999'; g.fillText(label, 4, y + 12);
    g.fillStyle = '#1b1b1b'; g.fillRect(LEFT, y, PW, h);
    if (label.startsWith('wave (')) { const im = g.createImageData(n, 64); for (let q = 0; q < n; q++) for (let i = 0; i < 64; i++) { const v = T[q * 64 + i] + 128, o = 4 * ((63 - i) * n + q); im.data[o] = im.data[o + 1] = im.data[o + 2] = v; im.data[o + 3] = 255; } const c2 = document.createElement('canvas'); c2.width = n; c2.height = 64; c2.getContext('2d').putImageData(im, 0, 0); g.imageSmoothingEnabled = false; g.drawImage(c2, LEFT, y, PW, h); }
    if (label === 'wave conf') line(W.conf, i => i * W.hop, h, 1, '#7cf');
    if (label.startsWith('clip')) { line(E10, i => i / 10, h, 1, '#555'); line(X.clip.value, i => i / 10, h, 1, '#fa5'); }
    if (label.startsWith('snare')) { for (let i = 0; i < X.snare.length; i++) bar(A.beats[i], A.beats[i + 1] ?? D, h, X.snare[i], (byBeatColor(i))); for (const r of X.fill.runs) { g.fillStyle = '#f33'; g.fillRect(xOf(r.t0), y, Math.max(2, xOf(r.t1) - xOf(r.t0)), 6); } }
    if (label.startsWith('trem')) line(X.trem.depth, i => i / X.trem.hz, h, 1, '#6e6');
    if (label === 'shim') line(X.shim.raw, i => X.shim.t0 + i / X.shim.hz, h, .4, '#c8f');
    if (label.startsWith('air')) { for (let i = 0; i < X.air.rt.length; i++) bar(i * X.air.hop, (i + 1) * X.air.hop, h, Math.min(1, X.air.rt[i] / 4), '#6cf'); }
    if (label === 'width') line(X.width.value, i => i / X.width.hz, h, 1, '#ff8');
    if (label.startsWith('echo')) for (let i = 0; i < X.echo.lag.length; i++) { bar(X.echo.t0[i], X.echo.t1[i], h, Math.min(1, X.echo.wet[i] * 2), `hsl(${i * 47},60%,55%)`); g.fillStyle = '#fff'; g.fillText(`${Math.round(X.echo.lag[i] * 1000)}`, xOf(X.echo.t0[i]) + 2, y + 12); }
    if (label === 'voices') for (let i = 0; i + 1 < X.barEdges.length; i++) bar(X.barEdges[i], X.barEdges[i + 1], h, Math.min(1, X.voices[i] / 8), '#f8a');
    if (label === 'sustain') for (let i = 0; i + 1 < X.barEdges.length; i++) bar(X.barEdges[i], X.barEdges[i + 1], h, X.sustain[i], '#8fa');
    if (label.startsWith('bass')) { const my = m => y + h - ((m - 28) / 32) * h; for (let q = 0; q < A.chord.length; q += 2) { const t = q * A.chordStep * 512 / 22050, rt = A.chord[q] >> 1; g.fillStyle = '#444'; for (let o = 24; o <= 60; o += 12) g.fillRect(xOf(t), my(o + rt), 1.5, 1.5); } for (let q = 0; q < B.midi.length; q += 2) { g.fillStyle = `rgba(255,200,80,${Math.min(1, .15 + B.conf[q] * 1.6)})`; g.fillRect(xOf(q / B.hz), my(B.midi[q]) - 1, 1.5, 2); } }
    if (label.startsWith('cut')) { const c3 = document.createElement('canvas'); c3.width = 512; c3.height = X.cut.height; const im = c3.getContext('2d').createImageData(512, X.cut.height); for (let i = 0; i < 512 * X.cut.height; i++) { const v = cm[2 * i]; im.data[4 * i] = im.data[4 * i + 1] = im.data[4 * i + 2] = v; im.data[4 * i + 3] = 255; } c3.getContext('2d').putImageData(im, 0, 0); g.imageSmoothingEnabled = false; g.drawImage(c3, LEFT, y, PW, h); }
    y += h + 4;
    function byBeatColor(i) { return barStart.has(i) ? '#f96' : '#59c'; }
  }
  out.png = cv.toDataURL('image/png');
  return out;
}
