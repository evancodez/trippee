// Does it understand? In node, no browser, no GPU: run the analysis on synthetic songs and on the four test songs, and say what understand() makes of them.
//
//   node tests/understand.mjs                    everything; the first run decodes the songs with afconvert into a temp folder and keeps its analyses there
//   SYN=0 node tests/understand.mjs              the real songs only
//   REAL=0 node tests/understand.mjs             the synthetic songs only
//   WAVDIR=/some/dir node tests/understand.mjs   use <dir>/<song>.mono.wav (16 bit, 22050 Hz) instead of decoding, and <dir>/<song>.json for a saved analysis if there is one
//
// Passes when synthetic loops find home and loop 20/20, a synthetic stop is found where it is and nothing's found where the band plays on, the real songs' homes and breaths are the ones
// the prototypes measured, every table is continuous across a rest, and with the flags off buildReact gives what it gave before understand() existed.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyse, ANALYSIS_VERSION, SR } from '../src/music/analysis.js';
import { understand, chordName } from '../src/music/understand.js';
import { buildReact, reactAt } from '../src/score/react.js';
import { flag, setFlag } from '../src/score/flags.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const check = (ok, what) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); };
const fix = (x, n = 2) => (+x).toFixed(n);

// ---------------------------------------------------------------- synthetic songs: triads in sines, a root in the bass, a kick on every beat
const CHORDS = { I: [0, 0], ii: [2, 1], IV: [5, 0], V: [7, 0], vi: [9, 1] };
const PROGS = { 'I-V-vi-IV': ['I', 'V', 'vi', 'IV'], 'I-IV-V-I': ['I', 'IV', 'V', 'I'], 'vi-IV-I-V': ['vi', 'IV', 'I', 'V'], 'I-vi-ii-V': ['I', 'vi', 'ii', 'V'] };
function synth(root, prog, { bpm = 100, bars = 48, stops = [] } = {}) {
  const beat = 60 / bpm, n = Math.floor(bars * 4 * beat * SR), s = new Float32Array(n);
  for (let bar = 0; bar < bars; bar++) {
    const [dr, minor] = CHORDS[prog[bar % prog.length]], r = (root + dr) % 12, tones = [r, r + (minor ? 3 : 4), r + 7];
    const t0 = Math.floor(bar * 4 * beat * SR), t1 = Math.floor((bar + 1) * 4 * beat * SR);
    for (let i = t0; i < t1 && i < n; i++) {
      const t = (i - t0) / SR, bt = t % beat;
      let v = 0;
      for (const p of tones) { const f = 261.626 * 2 ** (p / 12); v += 0.15 * Math.sin(2 * Math.PI * f * t) + 0.05 * Math.sin(4 * Math.PI * f * t); }     // pitch class 0 is C
      v += 0.25 * Math.sin(2 * Math.PI * 65.406 * 2 ** (r / 12) * t);
      v += 0.5 * Math.exp(-bt * 30) * Math.sin(2 * Math.PI * 70 * bt);
      s[i] = v * 0.5;
    }
  }
  // A stop: everything out, with only a little room left, cut on the beat
  for (const [a, b] of stops) for (let i = Math.floor(a * SR); i < Math.floor(b * SR) && i < n; i++) s[i] *= 0.004;
  return s;
}
async function synthetic() {
  if (process.env.SYN === 'stop') return stopTest();
  let okH = 0, okL = 0, tot = 0;
  const rows = [];
  for (const [name, prog] of Object.entries(PROGS)) {
    const found = [];
    for (const root of [0, 3, 5, 8, 10]) {
      const A = await analyse(synth(root, prog)), M = understand(A);
      tot++;
      const H = M.home.root === root && !M.home.minor, L = M.breath.loop === 16;
      if (H) okH++;
      if (L) okL++;
      found.push(`${M.home.name}${H ? '' : '!'} ${M.breath.loop}${L ? '' : '!'}`);
    }
    rows.push(`  ${name.padEnd(10)} ${found.join(' | ')}`);
  }
  console.log(rows.join('\n'));
  check(okH === tot, `synthetic home ${okH}/${tot}`);
  check(okL === tot, `synthetic loop ${okL}/${tot}`);
  return stopTest();
}
async function stopTest() {
  // A stop where one is, and only there. The song fades in and out, as songs do: A.loud is scaled by its own quietest 5%, and a song with no quiet in it scales its ripple up to fill 0..1.
  const beat = 60 / 100, bar = 4 * beat, a = 20 * bar, b = a + 2 * beat, ends = [[0, 4 * bar], [44 * bar, 48 * bar]];
  const a2 = 32 * bar, b2 = a2 + 3 * beat;
  const A = await analyse(synth(3, PROGS['I-V-vi-IV'], { stops: [...ends, [a, b], [a2, b2]] })), M = understand(A);
  const [r, r2] = M.rests;
  check(M.rests.length === 2 && Math.abs(r.a - a) < 0.2 && Math.abs(r.b - b) < 0.2 && Math.abs(r2.a - a2) < 0.2 && Math.abs(r2.b - b2) < 0.2, `synthetic stops at ${fix(a)}-${fix(b)} and ${fix(a2)}-${fix(b2)}: found ${M.rests.map(x => `${fix(x.a)}-${fix(x.b)}`).join(', ') || 'none'}, and neither end of the song`);
  if (r2) {
    const gone = r.b - r.a + r2.b - r2.a;
    check(Math.abs(M.C(r2.b + 5) - (r2.b + 5 - gone)) < 1e-6 && M.C(r2.a + 0.1) === M.C(r2.b - 0.1) && Math.abs(M.T(M.C(r2.b + 5)) - (r2.b + 5)) < 1e-6 && Math.abs(M.T(M.C(r.b + 5)) - (r.b + 5)) < 1e-6, 'C and T across two rests');
    const R = buildReact(A, 1);
    check(R.n === Math.ceil((A.duration - gone) * R.hz) + 2, `the tables are the song less its rests: ${R.n} samples`);
    for (const k of TABLES) if (biggestStep(R[k]) > 0.25) check(false, `${k} jumps by ${fix(biggestStep(R[k]), 3)} in a frame, with rests`);
  }
  const none = understand(await analyse(synth(3, PROGS['I-V-vi-IV'], { stops: ends })));
  check(none.rests.length === 0, `no rests while the band plays on: ${none.rests.map(x => `${fix(x.a)}-${fix(x.b)}`).join(', ') || 'none'}`);
  return A;
}

// ---------------------------------------------------------------- the real songs
const SONGS = { ppp: { home: 'Db', breath: 6.9 }, wildflower: { home: 'Eb', breath: 5.9 }, disclosure: { home: 'Dbm', breath: 7.2 }, mgmt: { home: 'G', breath: 7.7 } };
function wavOf(name, dir) {
  const given = process.env.WAVDIR && join(process.env.WAVDIR, `${name}.mono.wav`);
  if (given && existsSync(given)) return given;
  const out = join(dir, `${name}.mono.wav`);
  if (!existsSync(out)) execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${SR}`, '-c', '1', join(ROOT, 'media', `${name}.mp3`), out]);
  return out;
}
function samplesOf(file) {
  const b = readFileSync(file);
  let o = 12;
  while (b.toString('latin1', o, o + 4) !== 'data') o += 8 + b.readUInt32LE(o + 4);
  const n = b.readUInt32LE(o + 4) >> 1, s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = b.readInt16LE(o + 8 + i * 2) / 32768;
  return s;
}
async function analysisOf(name, samples, dir) {
  for (const d of [process.env.WAVDIR, dir]) {
    const f = d && join(d, `${name}.json`);
    if (f && existsSync(f)) { const A = JSON.parse(readFileSync(f)); if (A.version === ANALYSIS_VERSION) return A; }
  }
  const A = await analyse(samples), out = {};
  for (const k in A) { const v = A[k]; out[k] = ArrayBuffer.isView(v) ? Array.from(v) : v; }
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(out));
  return out;
}
// What judge.mjs measures: the median level over 4 bars either side against the mean inside, in 100 ms steps.
function trueDrop(samples, r, bar) {
  const hop = Math.round(SR / 10), db = [];
  for (let i = 0; i + hop < samples.length; i += hop) { let s = 0; for (let k = 0; k < hop; k++) s += samples[i + k] ** 2; db.push(10 * Math.log10(s / hop + 1e-10)); }
  const out = db.slice(Math.round(Math.max(0, r.a - 4 * bar) * 10), Math.round(r.a * 10)).concat(db.slice(Math.round(r.b * 10), Math.round((r.b + 4 * bar) * 10))).sort((x, y) => x - y);
  const inside = db.slice(Math.round(r.a * 10), Math.round(r.b * 10));
  return out[out.length >> 1] - inside.reduce((s, v) => s + v, 0) / Math.max(inside.length, 1);
}
const TABLES = ['pulse', 'melody', 'melSlow', 'voiced', 'tone', 'energy', 'lung', 'tension', 'px', 'py', 'gDrums', 'gTune', 'gTone', 'gHarm'];
const OLD = ['pulse', 'melody', 'melSlow', 'voiced', 'tone', 'energy'];
const biggestStep = (a, i0 = 1, i1 = a.length) => { let m = 0; for (let i = Math.max(1, i0); i < i1; i++) m = Math.max(m, Math.abs(a[i] - a[i - 1])); return m; };

async function real() {
  const dir = join(tmpdir(), 'trippee-understand');
  mkdirSync(dir, { recursive: true });
  for (const [name, want] of Object.entries(SONGS)) {
    const samples = samplesOf(wavOf(name, dir)), A = await analysisOf(name, samples, dir);
    const t0 = performance.now(), R = buildReact(A, 1), took = performance.now() - t0, M = R.M;
    console.log(`\n${name}: ${fix(A.bpm, 1)} bpm in ${A.meter}, ${fix(A.duration, 1)} s, buildReact ${took.toFixed(0)} ms`);
    check(M.home.name === want.home, `home ${M.home.name} (want ${want.home}), key signature ${chordName(M.key * 2)}`);
    check(Math.abs(M.breath.seconds - want.breath) < 0.1, `breath ${fix(M.breath.seconds)} s (want ${want.breath}): ${M.breath.beats} beats, starting on beat ${M.breath.offset}, ${M.breath.t.length} of them; the loop is ${M.breath.loop} beats, ${fix(M.breath.loopSeconds, 1)} s`);
    console.log(`     rests: ${M.rests.map(r => `${fix(r.a)}-${fix(r.b)} (${fix(r.b - r.a)} s, really ${fix(trueDrop(samples, r, M.bar), 1)} dB down, ${r.db} by the estimate)`).join(', ') || 'none'}`);
    check(M.rests.length <= 4, `at most 4 rests: ${M.rests.length}`);
    for (const r of M.rests) check(trueDrop(samples, r, M.bar) >= 8, `the band has really stopped at ${fix(r.a)}: ${fix(trueDrop(samples, r, M.bar), 1)} dB`);
    console.log(`     arrival peaks: ${M.arrivals(0.3).slice(0, 8).map(p => `${fix(p.t, 1)} s a=${fix(p.a)}`).join(', ') || 'none'} (bars with s >= .35: ${Array.from(M.arrivalS).filter(s => s >= 0.35).length}/${M.arrivalS.length})`);
    const count = {};
    for (const c of M.conductor) count[c.lead] = (count[c.lead] || 0) + 1;
    let sw = 0; for (let i = 1; i < M.conductor.length; i++) if (M.conductor[i].lead !== M.conductor[i - 1].lead) sw++;
    const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
    console.log(`     lead: ${Object.entries(count).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(100 * v / M.conductor.length)}%`).join(', ')}; ${sw} switches in ${M.conductor.length} breaths: ${M.conductor.map(c => c.lead[0]).join('')}`);
    console.log(`     mean gains: drums ${fix(mean(R.gDrums))}, tune ${fix(mean(R.gTune))}, tone ${fix(mean(R.gTone))}, harm ${fix(mean(R.gHarm))}`);
    check((count.drums || 0) / M.conductor.length <= 0.15, `drums don't take over: they lead ${Math.round(100 * (count.drums || 0) / M.conductor.length)}% of breaths`);
    const places = new Map();
    for (const r of M.runs) places.set(r.c, (places.get(r.c) || 0) + r.t1 - r.t0);
    console.log(`     harmony: ${[...places].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, d]) => `${chordName(c)} ${d.toFixed(0)} s at (${M.place(c).map(v => fix(v)).join(',')}) pulling ${fix(M.tension(c))}`).join('; ')}`);
    // Every table has to be continuous, and no worse at a rest than anywhere else
    for (const k of TABLES) if (biggestStep(R[k]) > 0.25) check(false, `${k} jumps by ${fix(biggestStep(R[k]), 3)} in a frame`);
    for (const r of M.rests) {
      const i = Math.round(M.C(r.a) * R.hz), near = TABLES.map(k => biggestStep(R[k], i - 30, i + 30));
      check(Math.max(...near) <= 0.2, `no table jumps at the rest at ${fix(r.a)}: worst ${fix(Math.max(...near), 3)}`);
      const c0 = M.C(r.a), c1 = M.C((r.a + r.b) / 2), c2 = M.C(r.b - 1e-3);
      check(c0 === c1 && c1 === c2 && Math.abs(M.C(r.b + 1) - (c0 + 1)) < 1e-6, `C stops in the rest and carries on after it`);
      check(Math.abs(M.T(M.C(r.b + 1)) - (r.b + 1)) < 1e-6 && Math.abs(M.T(M.C(r.a - 1)) - (r.a - 1)) < 1e-6, `T undoes C on both sides of it`);
    }
    // Reading it twice gives the same thing, and it's a pure function of c
    const s0 = JSON.stringify(reactAt(R, 42.5)), s1 = JSON.stringify(reactAt(R, 42.5));
    check(s0 === s1, 'reactAt is pure');
    // With its flags off nothing's different from before understand() was written, and with them on the old tables only move if there's a rest
    setFlag('understand', false);
    const Off = buildReact(A, 1);
    setFlag('understand', true);
    check(Off.M.neutral && Off.M.C(77) === 77 && Off.M.rests.length === 0 && Off.M.gains(50).drums === 1, 'flag understand off is neutral');
    check(TABLES.slice(6).every(k => k.startsWith('g') ? Off[k].every(v => v === 1) : Off[k].every(v => v === 0)), 'flag off: the new tables are at rest');
    if (!M.rests.length) check(OLD.every(k => R[k].length === Off[k].length && R[k].every((v, i) => v === Off[k][i])) && JSON.stringify(R.chords) === JSON.stringify(Off.chords), 'no rests: the old tables are byte-identical with the flag off');
    else {
      // A rest taken out moves the percentiles the tone and the size are scaled by, a hair
      const until = Math.floor(M.rests[0].a * R.hz) - 300;
      let worst = 0;
      for (const k of OLD) for (let i = 0; i < until; i++) worst = Math.max(worst, Math.abs(R[k][i] - Off[k][i]));
      check(worst < 0.02, `the same up to the first rest: differs by ${fix(worst, 4)} at most`);
      setFlag('rests', false);
      const noRest = buildReact(A, 1);
      setFlag('rests', true);
      check(noRest.M.rests.length === 0 && OLD.every(k => noRest[k].every((v, i) => v === Off[k][i])), 'flag rests off: old tables byte-identical');
    }
  }
}

if (process.env.SYN !== '0') await synthetic();
if (process.env.REAL !== '0') await real();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
