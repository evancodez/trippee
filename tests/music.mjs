// Testing the music system against ground truth.
//
//   node tests/music.mjs                 synthetic songs with known tempo and an ABABCB form, the last chorus transposed:
//                                        prints beat accuracy, section accuracy and repetition labels. No browser needed.
//   node tools/lab.mjs tests/music.mjs --out lab-out/music
//                                        end to end in a real Chrome: SONG=/media/ppp.mp3 (or SONG=synth), composes a film,
//                                        steps it at a fixed rate, measures the picture, writes contact sheets and time-slices.
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { watch, analyse as measure } from '../tools/look.mjs';

// ---------------------------------------------------------------- the synthetic song
const SR = 22050;
const mulberry = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

const SECTIONS = {
  A: { name: 'A', bars: 16, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], tone: [1, 0.25, 0.08], level: 0.5, drums: 0.25, hat: 0, melody: [69, 72, 76, 74, 72, 69, 67, 69] },
  B: { name: 'B', bars: 16, chords: [[48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60]], tone: [1, 0.6, 0.45, 0.3, 0.2, 0.12], level: 1, drums: 1, hat: 1, melody: [79, 76, 79, 81, 79, 76, 74, 72] },
  C: { name: 'C', bars: 8, chords: [[50, 53, 57], [46, 50, 53]], tone: [1, 0.05], level: 0.32, drums: 0, hat: 0, melody: [62, 65, 69, 74, 69, 65, 62, 65] },
};

export function synth({ bpm = 118, meter = 4, seed = 1, form = 'ABABCB', transposeLast = 2, intro = 0.1, drift = 0 } = {}) {
  const rand = mulberry(seed);
  let beat = 60 / bpm;
  const plan = form.split('').map(c => ({ ...SECTIONS[c] }));
  plan[plan.length - 1].transpose = transposeLast;
  const totalBars = plan.reduce((s, p) => s + p.bars, 0);
  const duration = intro + totalBars * meter * beat * (1 + drift) + 2;
  const out = new Float32Array(Math.ceil(duration * SR));
  const add = (t0, dur, fn) => {
    const a = Math.floor(t0 * SR), b = Math.min(out.length, Math.floor((t0 + dur) * SR));
    for (let i = Math.max(0, a); i < b; i++) out[i] += fn((i - a) / SR);
  };
  const noise = new Float32Array(SR); for (let i = 0; i < SR; i++) noise[i] = rand() * 2 - 1;
  const truth = { bpm, meter, duration, beats: [], downbeats: [], boundaries: [], labels: [], secBeats: [] };
  let bar = 0, t = intro;
  for (const sec of plan) {
    truth.boundaries.push(t);
    truth.labels.push(sec.name + (sec.transpose ? `+${sec.transpose}` : ''));
    truth.secBeats.push(truth.beats.length);
    const tr = sec.transpose || 0;
    for (let b = 0; b < sec.bars; b++, bar++) {
      const chord = sec.chords[b % sec.chords.length];
      beat = (60 / bpm) * (1 + drift * Math.sin(2 * Math.PI * bar / 37));
      truth.downbeats.push(t);
      for (let q = 0; q < meter; q++) {
        truth.beats.push(t);
        // the pad holds across the beat
        for (const note of chord) {
          const f = hz(note + tr), tone = sec.tone;
          const lvl = 0.055 * sec.level;
          add(t, beat * 1.02, x => { let s = 0; for (let h = 0; h < tone.length; h++) s += tone[h] * Math.sin(2 * Math.PI * f * (h + 1) * x); return s * lvl * Math.min(1, x * 80) * Math.min(1, (beat * 1.02 - x) * 80); });
        }
        // bass
        const bf = hz(chord[0] - 12 + tr);
        if (q === 0 || (meter === 4 && q === 2)) add(t, beat * 0.9, x => 0.28 * sec.level * Math.sin(2 * Math.PI * bf * x) * Math.exp(-x * 3) * Math.min(1, x * 200));
        // lead
        const mn = sec.melody[(b * meter + q) % sec.melody.length] + tr, mf = hz(mn);
        add(t, beat * 0.85, x => { const v = 1 + 0.003 * Math.sin(2 * Math.PI * 5.5 * x); return 0.12 * sec.level * (Math.sin(2 * Math.PI * mf * v * x) + 0.4 * Math.sin(4 * Math.PI * mf * v * x)) * Math.min(1, x * 40) * Math.exp(-x * 1.5); });
        // drums
        if (sec.drums > 0) {
          const dl = sec.drums;
          if (q === 0 || (meter === 4 && q === 2)) add(t, 0.22, x => 0.65 * dl * Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-x * 30)) * x) * Math.exp(-x * 14));
          if ((meter === 4 && (q === 1 || q === 3)) || (meter === 3 && q > 0)) add(t, 0.16, x => 0.35 * dl * noise[(x * SR | 0) % SR] * Math.exp(-x * 22));
        }
        if (sec.hat) for (const e of [0, 0.5]) add(t + e * beat, 0.04, x => { const k = (x * SR | 0); return 0.12 * sec.hat * (noise[(k * 7) % SR] - noise[(k * 7 + 1) % SR]) * Math.exp(-x * 90); });
        t += beat;
      }
    }
  }
  truth.end = t;
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i] * 1.3) * 0.8;
  return { samples: out, truth };
}

// ---------------------------------------------------------------- scoring an analysis against the truth
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
export function scoreAnalysis(A, truth) {
  const tauAt = t => { const x = t * A.tauHz, i = Math.max(0, Math.min(A.tau.length - 2, Math.floor(x))); return A.tau[i] + (A.tau[i + 1] - A.tau[i]) * (x - i); };
  // Beat accuracy: tau must be an integer on every true beat. Fractional part as seconds at the true tempo.
  const beat = 60 / truth.bpm;
  const rateFactor = A.bpm / truth.bpm;
  const octave = Math.round(Math.log2(rateFactor));
  const k = Math.pow(2, octave);       // a tracker at double tempo has beats at twice the rate; it's still locked
  const errs = truth.beats.map(b => { const x = tauAt(b); const f = (k >= 1 ? x / k : x * 1 / k); const e = f - Math.round(f); return Math.abs(e) * beat; });
  const signed = truth.beats.map(b => { const x = tauAt(b); const f = (k >= 1 ? x / k : x * 1 / k); return (f - Math.round(f)) * beat; });
  const within = errs.filter(e => e <= 0.07).length / errs.length;
  // Tempo jitter: rate above .5 Hz
  let jit = 0, cnt = 0;
  const win = Math.round(A.tauHz * 2);
  for (let i = win; i < A.rate.length - win; i += 7) { let s = 0; for (let j = -win; j <= win; j++) s += A.rate[i + j]; s /= (2 * win + 1); jit = Math.max(jit, Math.abs(A.rate[i] - s) / s); cnt++; }
  // Downbeats
  const dbErr = truth.downbeats.map(d => Math.min(...Array.from(A.bars, b => Math.abs(b - d))));
  const dbOk = dbErr.filter(e => e < beat * 0.3).length / dbErr.length;
  // Sections: boundaries found within one bar of a true one, and the other way round
  const barDur = beat * truth.meter;
  const found = A.segments.map(s => s.t0).filter(t => t > 1);
  const trueB = truth.boundaries.filter(t => t > 1);
  const hits = trueB.filter(b => found.some(f => Math.abs(f - b) <= barDur)).length;
  const prec = found.filter(f => trueB.some(b => Math.abs(f - b) <= barDur)).length / Math.max(found.length, 1);
  const offs = trueB.map(b => Math.min(...found.map(f => Math.abs(f - b))));
  // Labels at the middle of each true section
  const labelAt = t => A.segments.find(s => t >= s.t0 && t < s.t1) || A.segments[A.segments.length - 1];
  const labelsAtTruth = truth.boundaries.map((b, i) => { const e = truth.boundaries[i + 1] ?? truth.end; const s = labelAt((b + e) / 2); return `${s.label}${s.rot ? (s.rot > 0 ? '+' : '') + s.rot : ''}`; });
  // Does the form come out? Same truth letter iff same label.
  let pairOk = 0, pairs = 0;
  const letters = truth.labels.map(l => l[0]);
  const ourLetters = labelsAtTruth.map(l => l[0]);
  for (let i = 0; i < letters.length; i++) for (let j = i + 1; j < letters.length; j++) { pairs++; if ((letters[i] === letters[j]) === (ourLetters[i] === ourLetters[j])) pairOk++; }
  // canon: a beat in a later B must map to the same bar-position beat of the first B
  let canonOk = 0, canonN = 0;
  const firstOf = {};
  truth.labels.forEach((l, i) => { if (!(l[0] in firstOf)) firstOf[l[0]] = i; });
  truth.labels.forEach((l, i) => {
    if (firstOf[l[0]] === i) return;
    const a0 = truth.secBeats[firstOf[l[0]]], b0 = truth.secBeats[i], b1 = truth.secBeats[i + 1] ?? truth.beats.length;
    for (let q = b0; q < b1; q += 2) {
      const c = A.canon[Math.max(0, Math.min(A.canon.length - 1, Math.round(tauAt(truth.beats[q]))))];
      const trueMap = truth.beats[a0 + (q - b0)];
      canonN++;
      if (Math.abs(A.beats[Math.min(A.beats.length - 1, c)] - trueMap) < beat * 0.6) canonOk++;
    }
  });
  return {
    tempo: `${truth.bpm} true, ${A.bpm.toFixed(2)} found${octave ? ` (octave ${octave})` : ''}`,
    beatWithin70ms: +within.toFixed(3), beatMedianErrMs: +(median(errs) * 1000).toFixed(1), beatMeanSignedMs: +(signed.reduce((s, v) => s + v, 0) / signed.length * 1000).toFixed(1),
    rateJitterPct: +(jit * 100).toFixed(3),
    meter: `${truth.meter} true, ${A.meter} found (contrast ${A.meterContrast.toFixed(2)})`,
    downbeats: +dbOk.toFixed(3), phraseBars: A.phraseBars,
    sectionRecall: `${hits}/${trueB.length}`, sectionPrecision: +prec.toFixed(2), boundaryMedianOffsetS: +median(offs).toFixed(3),
    truthLabels: truth.labels.join(' '), foundLabels: labelsAtTruth.join(' '), allSegments: A.segments.map(s => `${s.label}${s.visit ? s.visit + 1 : ''}${s.rot ? '(' + s.rot + ')' : ''}`).join(' '),
    pairAgreement: `${pairOk}/${pairs}`, canonAccuracy: +(canonOk / Math.max(canonN, 1)).toFixed(3),
    character: Object.fromEntries(Object.entries(A.character).map(([k, v]) => [k, +v.toFixed(2)])), swellRegularity: +A.swellRegularity.toFixed(2),
  };
}

export function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, samples[i] * 32767 | 0)), 44 + i * 2);
  return buf;
}

// ---------------------------------------------------------------- run directly: the synthetic ground truth, no browser
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { analyse } = await import('../src/music/analysis.js');
  const cases = [
    { bpm: 118, meter: 4, seed: 1 },
    { bpm: 92, meter: 4, seed: 2 },
    { bpm: 140, meter: 4, seed: 3 },
    { bpm: 84, meter: 3, seed: 4 },
    { bpm: 110, meter: 4, seed: 5, drift: 0.03 },
  ];
  const only = process.env.CASE ? [cases[+process.env.CASE]] : cases;
  for (const c of only) {
    const { samples, truth } = synth(c);
    const t0 = performance.now();
    const A = await analyse(samples);
    const secs = (performance.now() - t0) / 1000;
    console.log(`\n--- ${c.bpm} BPM, meter ${c.meter}, ${truth.duration.toFixed(0)} s of audio, analysed in ${secs.toFixed(1)} s`);
    console.log(scoreAnalysis(A, truth), 'grid', A.grid);
  }
}

// ---------------------------------------------------------------- run in the lab: the whole film
const pearson = (a, b) => {
  const n = Math.min(a.length, b.length); let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  return num / Math.sqrt(Math.max(da * db, 1e-12));
};
const boxSmooth = (a, r) => { const o = new Array(a.length).fill(0); for (let i = 0; i < a.length; i++) { let s = 0, c = 0; for (let j = Math.max(0, i - r); j <= Math.min(a.length - 1, i + r); j++) { s += a[j]; c++; } o[i] = s / c; } return o; };

export default async ({ page, save, log, out }) => {
  const FPS = +(process.env.WATCH_FPS || 8), seed = +(process.env.SEED || 7);
  let song = process.env.SONG || '/media/ppp.mp3', truth = null, name = (process.env.NAME || song.split('/').pop().replace(/\..*$/, ''));
  if (song === 'synth') {
    const made = synth({ bpm: +(process.env.BPM || 118), meter: 4, seed: 1 });
    truth = made.truth;
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'synth.wav'), wav(made.samples));
    const rel = out.split('/trippee/').pop();
    song = `/${rel}/synth.wav`;
    name = 'synth';
  }
  const opts = { seed, ...(process.env.PATTERN ? { pattern: process.env.PATTERN } : {}), ...(process.env.FAMILY ? { family: process.env.FAMILY } : {}) };
  const t0 = Date.now();
  const info = await page.eval(async (src, o) => {
    const T = window.trippee;
    await T.song(src, o);
    const s = window.app.song, A = s.analysis, sc = s.score;
    return {
      duration: s.duration, bpm: A.bpm, meter: A.meter, phraseBars: A.phraseBars, climax: A.climax, swell: A.swellRegularity, character: A.character,
      segments: A.segments.map(x => `${x.t0.toFixed(1)}:${x.label}${x.visit ? x.visit + 1 : ''}${x.rot ? '(' + x.rot + ')' : ''}`).join(' '),
      family: sc.family, poolIds: sc.pool, stats: sc.stats,
      landings: sc.landings,
      gestures: sc.gestures.map(g => ({ t0: +g.t0.toFixed(2), t1: +g.t1.toFixed(2), id: g.pattern.id, N: g.gears, pol0: g.pol0, pol1: g.pol1, replay: g.replayOf ?? null, change: g.change ?? null, form: g.form ?? null })),
      fromCache: s.fromCache, analyseSeconds: s.analyseSeconds, rehearsal: s.rehearsal,
      onset: Array.from(A.onset), onsetFps: A.fps,
    };
  }, song, opts);
  log(`loaded ${song} in ${((Date.now() - t0) / 1000).toFixed(1)} s. ${info.duration.toFixed(1)} s long, ${info.bpm.toFixed(1)} BPM, meter ${info.meter}, phrase ${info.phraseBars} bars, swell ${info.swell.toFixed(2)}, climax ${info.climax.toFixed(0)} s`);
  log('character', JSON.stringify(info.character), 'family', info.family, 'pool', JSON.stringify(info.poolIds));
  log('segments', info.segments);
  log('gestures:\n' + info.gestures.map(g => `  ${g.t0.toFixed(1).padStart(6)} ${g.t1.toFixed(1).padStart(6)} (${(g.t1 - g.t0).toFixed(1).padStart(4)}s) pol ${g.pol0}/${g.pol1} ${g.id} N=${JSON.stringify(g.N)} ${g.form || ''} ${g.replay != null ? 'replay of ' + g.replay + (g.change ? ' +' + g.change : '') : ''}`).join('\n'));
  log('stats', JSON.stringify(info.stats));
  log('analysis', info.analyseSeconds.toFixed(1), 's; rehearsal', JSON.stringify(info.rehearsal));

  // Watch all of it on a fixed clock: no real-time wait. No audio is played.
  const seconds = Math.min(info.duration, +(process.env.WATCH_SECONDS || 1e9));
  const w = await watch(page, save, { name, seconds, fps: FPS, cols: 12, rows: 12, setup: 'window.trippee.seek(0)' });
  const a = measure(w);
  const solids = a.solids.filter(s => s.at < seconds - 3);
  const starts = solids.map(s => s.at), gaps = starts.slice(1).map((v, i) => v - starts[i]);
  const planned = info.landings.map(l => l.B);
  const offs = planned.filter(B => B <= seconds).map(B => { let best = 1e9; for (const s of a.solids) { const d = B < s.at ? s.at - B : B > s.at + s.seconds ? B - s.at - s.seconds : 0; best = Math.min(best, d); } return best; });
  // Visual speed against onsets: only inside gesture bodies, at several scales
  const onsetSeries = w.diff.map((_, i) => { let m = 0; for (let k = -2; k <= 2; k++) m = Math.max(m, info.onset[Math.round((w.time[i] + k / (FPS * 5)) * info.onsetFps)] || 0); return m; });
  const rs = {}, bp = {};
  for (const secs of [0.25, 0.5, 1, 2]) {
    const r = Math.max(1, Math.round(secs * FPS / 2));
    const inBody = i => { const t = w.time[i]; return info.gestures.some(g => t > g.t0 + 8 && t < g.t1 - 7); };
    const idx = w.diff.map((_, i) => i).filter(inBody);
    const dA = boxSmooth(w.diff, r), oA = boxSmooth(onsetSeries, r);
    rs[`${secs}s`] = +pearson(idx.map(i => dA[i]), idx.map(i => oA[i])).toFixed(3);
    // the same with the slow trend (8 s and up) taken out: that's the question of whether anything moves with the transients
    const slow = Math.round(4 * FPS), dS = boxSmooth(w.diff, slow), oS = boxSmooth(onsetSeries, slow);
    bp[`${secs}s`] = +pearson(idx.map(i => dA[i] - dS[i]), idx.map(i => oA[i] - oS[i])).toFixed(3);
  }
  log(JSON.stringify({
    solidCount: solids.length, medianGapS: +median(gaps).toFixed(1), medianSolidS: +median(solids.map(s => s.seconds)).toFixed(2), longestSolidS: Math.max(...solids.map(s => s.seconds)),
    plannedLandings: planned.length, picture_vs_plan_medianOffsetS: +median(offs).toFixed(3), picture_vs_plan_worstS: +Math.max(...offs).toFixed(3),
    speedOnsetR: rs, speedOnsetR_transientsOnly: bp, flashesPerSecond: a.flashesPerSecondWholeFrame, flashesTile: a.flashesPerSecondAnyTile, maxLumaStep: a.largestLuminanceStepPerFrame, meanWhite: a.meanWhite, greyP95: a.p95GreyAtNativeRes,
  }, null, 0));
  log('solids', a.solids.map(s => `${s.at.toFixed(1)}+${s.seconds}${s.colour[0]}`).join(' '));
  if (truth) {
    // Against the truth: how far is the nearest landing from each true boundary?
    const trueB = truth.boundaries.filter(b => b > 1);
    const dB = trueB.map(b => Math.min(...planned.map(B => Math.abs(B - b))));
    const dP = trueB.map(b => { let best = 1e9; for (const s of solids) { const e = b < s.at ? s.at - b : b > s.at + s.seconds ? b - s.at - s.seconds : 0; best = Math.min(best, e); } return best; });
    log('truth: boundary to planned landing', JSON.stringify(dB.map(x => +x.toFixed(3))), 'median', median(dB).toFixed(3), ' boundary to solid in the picture', JSON.stringify(dP.map(x => +x.toFixed(3))), 'median', median(dP).toFixed(3));
  }
};
