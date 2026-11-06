// The judge: watches a whole film and says what's wrong with it, by the table in docs/NEXT.md section 4.
//
//   SONG=media/ppp.mp3 node tools/lab.mjs tests/judge.mjs --out lab-out/<lane>
//   STAGE=selftest,film,windows,purity,boot,variety,closure,countdown,wave,balance,beyond,rest,follow,direction   (default: all of them)
//   node tests/judge.mjs lab-out/<lane>/ppp.json          no browser: judges a saved capture again, for changing a threshold
//   BASELINE=save ...                                     keeps this run as lab-out/judge/<song>.json: what "no worse than baseline" means. With STAGE=direction, the gestures as lab-out/judge/<song>.gestures.json
//   node tests/judge.mjs --direction <dir with <song>.walk.json files>   no browser: docs/DIRECTION.md section 8 again on saved walks, with the plan's numbers for today beside them
//   node tests/judge.mjs --direction-selftest             no browser: a fake film that fails each of those rows
//   SEED=7 FAMILY=checks                                  another take
//   CUT=1                                                 the song's hand cut, once rehearsed, in place of the generated film. For STAGE=film,windows,direction: purity remakes the generated film
//   WORLD=mirror                                          a world (docs/MODES.md section 7). Geometry rows read the coverage draw; Flash reads true colour through three channels at a world's limits; Jolt and Jerk also read true colour; adds Dark; skips Beyond.
//                                                         With no WORLD nothing on this path runs, and no number the film's rows report can change.
//   FAKE_RESTS=30-33 FAKE_LOCKS=60-40 FAKE_WAVE=1         runs those tests' code before their features exist (a lock at 60 s, run up from 40 s). The verdicts mean nothing
//
// It drops the song the way a person does, then steps the film on a fixed clock (t is the song's time; the song itself is paused and the lab
// mutes Chrome). 12 fps over the whole song at 1080p with tools/look.mjs's watch(); 60 fps around every boundary, rest and lock.
//
// Writes, into --out, for a song called <s>:
//   judge-<s>.txt      the table: PASS, FAIL or PENDING (the thing it measures hasn't landed), and every stretch it flagged
//   judge-<s>.json     the same, as data, for tests/all.mjs
//   <s>.sheet.jpg      the whole film; <s>.slices.jpg its time-slices; <s>.json every measurement per frame
//   <s>.flags.jpg      one row per flagged stretch, so you can see what it's complaining about
//
// What it reads, all of it optional, so a test goes from PENDING to measured when its feature lands:
//   score.react.M or score.M     { breath:{beats,t}, rests:[{a,b,db}], ... } from src/music/understand.js
//   G.moves [{id,...}], G.xform {id,...}, G.hero     what the director chose; "hero" kinds come from these
//   slot numbers slip.kind, slip.left, star.k in the block, read each frame, so a lock is found by watching slip.left reach 0
//   FRAME.weight, FRAME.focus in layout.js           the weight field
import { resolve, basename, join, dirname } from 'node:path';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { watch, analyse, flashThree, enterWorld, WORLD_FLASH } from '../tools/look.mjs';
import { captureSong, judgeCapture, FOLLOW } from './follow.mjs';
import { collect, measures, changesOf, jumpsOf, rideOf, barLinesShow, meanOf, medOf, pctOf, pearson, nearest, VIS, EXACT, WALK_FPS, WALK_SIZE } from './shotlist.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// First guesses from NEXT.md, calibrated on ppp at bf1a9d2: see KNOWN below. grey, edges and the tiles look at a 320x180 copy; fine and flat were added because of what those missed.
export const TH = {
  white: [0.12, 0.88], whiteSecs: 3,
  tile: [12, 243], tileCount: 9, tileSecs: 3,
  grey: 0.25, edges: 130, noiseSecs: 2,
  fine: 0.12, fineTiles: 3,           // lines finer than about a 16 pixel period at 1080p (transitions per pixel), in this many of the 16 tiles, anywhere in the frame
  flatArea: 0.35, flatDisc: 0.25, flatSecs: 1,    // flat.mjs's flat shape: joined area of one colour, with room for a disc of this radius (share of height)
  hugeArea: 0.70, hugeDisc: 0.2,      // most of the frame one joined colour with something small floating in it (body.planet, 83% and a disc of .233), which slips under the disc limit. Big dots on black (.15) are fine
  stasisWin: 12, stasisEdges: 0.10, stasisTile: 8,
  jerk: 3, jerkFloor: 0.5,            // diff / rolling median; a median under the floor counts as the floor, so a nearly still picture doesn't divide by nothing
  flashWhole: 0, flashTile: 2,
  restDiff: 0.05, restBack: 0.5, restDb: 9, restMax: 4,      // a real stop can be under 12 dB: mgmt's is 9.3, with the harmony and the drums at nothing and then a full re-entry
  breathRange: 0.05, breathP: 0.1, breathPeak: 0.2, breathAttack: 0.5,    // the fold's range of white, the share of other periods that fold as well, how far from the breath it can peak, and its rise in seconds
  closure: 0.1,
  cost: 17.5,
};

// What calibration has to do, on the film of ppp at bf1a9d2 (seed 7), looked at frame by frame. It's kept in lab-out/g2/base, so this can be checked again.
//   Noise 93-106: waves.sea, where its top band goes to moire from about 101 s. 167-171: checks.vega down to a grey moire. 78-92 must pass.
//   One colour 299-311: body.vase into checks.target, a frame of a few huge black and white shapes.
// NEXT.md also named one colour at 43-49 and 62-65 and stasis at 8-25 and 111-134. Those were measured on an earlier film and aren't there at bf1a9d2: at 43-49 and 62-65 the
// frame is half white, no tile is near solid and the biggest flat disc is under .2 of the height; at 8-25 and 111-134 the line count triples and tiles swing by over 100/255.
// One-colour failures are seen on the old film kept in lab-out/critic (24-27, 43-47, 110-114, ...), and Stasis in the self-test below and at the end of that same film.
export const KNOWN = {
  ppp: {
    Noise: [[93, 106], [167, 171]],
    'One colour': [[299, 311]],
    Stasis: [],
    clean: [[78, 92]],
  },
};

// The breaths the prototypes measured, used only as a hint until understand() has landed.
const BREATH_HINT = { ppp: 6.9, wildflower: 5.9, disclosure: 7.2, mgmt: 7.7 };

const sorted = a => Float64Array.from(a).sort();
const pct = (a, p) => { if (!a.length) return 0; const s = sorted(a); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const median = a => pct(a, 0.5);
const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const r2 = x => +(+x).toFixed(2);

// Runs of true, in seconds. A gap of up to `bridge` seconds doesn't break one.
export function runsOf(flags, time, minSecs, bridge = 0.25) {
  const out = [], dt = time.length > 1 ? (time[time.length - 1] - time[0]) / (time.length - 1) : 1 / 12;
  for (let i = 0; i < flags.length;) {
    if (!flags[i]) { i++; continue; }
    let j = i, last = i;
    while (j < flags.length && (flags[j] || (j - last) * dt <= bridge)) { if (flags[j]) last = j; j++; }
    const secs = (last - i + 1) * dt;
    if (secs > minSecs) out.push({ t0: r2(time[i]), t1: r2(time[last]), secs: r2(secs) });
    i = j;
  }
  return out;
}
const mergeSpans = spans => {
  const s = [...spans].sort((a, b) => a.t0 - b.t0), out = [];
  for (const x of s) { const l = out[out.length - 1]; if (l && x.t0 <= l.t1 + 0.5) { l.t1 = Math.max(l.t1, x.t1); l.secs = r2(l.t1 - l.t0); if (x.why && !String(l.why).includes(x.why)) l.why += ', ' + x.why; } else out.push({ ...x, secs: r2(x.t1 - x.t0) }); }
  return out;
};
const inRest = (t0, t1, rests) => (rests || []).some(r => t0 < r.b + 1.5 && t1 > r.a - 1);    // the clock's lag is still being paid just after one

export function oneColour(w, rests, rec) {
  const n = w.white.length, whiteOut = [], tilesOut = [];
  for (let i = 0; i < n; i++) {
    whiteOut.push(w.white[i] < TH.white[0] || w.white[i] > TH.white[1]);
    const dark = w.tiles[i].filter(v => v < TH.tile[0]).length, light = w.tiles[i].filter(v => v > TH.tile[1]).length;
    tilesOut.push(dark >= TH.tileCount || light >= TH.tileCount || dark + light >= TH.tileCount);
  }
  const spans = [
    ...runsOf(whiteOut, w.time, TH.whiteSecs).map(s => ({ ...s, why: 'white' })),
    ...runsOf(tilesOut, w.time, TH.tileSecs).map(s => ({ ...s, why: 'tiles' })),
    ...(rec?.area?.length ? runsOf(rec.area.map((a, i) => (a > TH.flatArea && rec.disc[i] > TH.flatDisc) || (a > TH.hugeArea && rec.disc[i] > TH.hugeDisc)), w.time, TH.flatSecs).map(s => ({ ...s, why: 'flat shape' })) : []),
  ].filter(s => !inRest(s.t0, s.t1, rests));
  return mergeSpans(spans);
}
// A world can say what its coverage should be held to (docs/MODES.md section 4): soft: its edges are soft on purpose, so grey says nothing. edgesPerCycle 1: it shows half the edges its coverage has, so its lines are twice as bold as they measure.
export function noise(w, rec, { soft = false, edgesPerCycle = 2 } = {}) {
  const fineLimit = TH.fine * 2 / edgesPerCycle;
  const greyOut = w.grey.map(g => !soft && g > TH.grey), edgeOut = w.edges.map(e => e * edgesPerCycle / 2 > TH.edges);
  return mergeSpans([
    ...runsOf(greyOut, w.time, TH.noiseSecs).map(s => ({ ...s, why: 'grey' })),
    ...runsOf(edgeOut, w.time, TH.noiseSecs).map(s => ({ ...s, why: 'edges' })),
    ...(rec?.fine?.length ? runsOf(rec.fine.map(f => f.filter(v => v > fineLimit).length >= TH.fineTiles), w.time, TH.noiseSecs).map(s => ({ ...s, why: 'fine tiles' })) : []),
  ]);
}
// A 12 s window where the line count hardly changes and no quarter of the picture changes brightness.
export function stasisAt(w, i, L) {
  const edges = w.edges.slice(i, i + L), m = Math.max(median(edges), 1);
  const edgeVar = (pct(edges, 0.95) - pct(edges, 0.05)) / m;
  let tileMove = 0;
  for (let k = 0; k < 16; k++) {
    let lo = 1e9, hi = -1e9;
    for (let f = i; f < i + L; f++) { const v = w.tiles[f][k]; if (v < lo) lo = v; if (v > hi) hi = v; }
    tileMove = Math.max(tileMove, hi - lo);
  }
  return { edgeVar, tileMove };
}
export function stasis(w, rests) {
  const L = Math.round(TH.stasisWin * w.fps), spans = [];
  for (let i = 0; i + L <= w.white.length; i += Math.round(w.fps / 2)) {
    const t0 = w.time[i], t1 = w.time[i + L - 1];
    if (inRest(t0, t1, rests)) continue;
    const { edgeVar, tileMove } = stasisAt(w, i, L);
    if (edgeVar < TH.stasisEdges && tileMove < TH.stasisTile) spans.push({ t0: r2(t0), t1: r2(t1), why: `edges vary ${r2(edgeVar * 100)}%, tiles move ${r2(tileMove)}` });
  }
  return mergeSpans(spans);
}
// Largest step against what's around it. Only the middle ±half second of a window counts, since the ±1 s median needs something to look at.
export function jerk(win) {
  const n = win.diff.length, fps = win.fps, reach = Math.round(fps), half = Math.round(fps / 2), mid = n >> 1;
  let worst = 0, at = 0, base = 0;
  for (let i = Math.max(1, mid - half); i < Math.min(n, mid + half + 1); i++) {
    const around = win.diff.slice(Math.max(1, i - reach), Math.min(n, i + reach + 1));
    const m = Math.max(median(around), TH.jerkFloor), q = win.diff[i] / m;
    if (q > worst) { worst = q; at = win.time[i]; base = m; }
  }
  return { ratio: r2(worst), at: r2(at), median: r2(base) };
}

const row = (test, status, value, detail = '', spans = null) => ({ test, status, value, detail, ...(spans ? { spans } : {}) });
const badIf = (bad, test, value, detail, spans) => row(test, bad ? 'FAIL' : 'PASS', value, detail, spans);
const fmtSpans = s => s.map(x => `${x.t0}-${x.t1} s (${x.why})`).join('; ');

// The film-wide tests, on a saved or fresh capture.
export function judgeFilm(w, { rests = [], baseline = null, windows = [], rec = null, expects = {} } = {}) {
  const rows = [];
  const a = analyse(w);
  const oc = oneColour(w, rests, rec), nz = noise(w, rec, expects), st = stasis(w, rests);
  rows.push(badIf(oc.length, 'One colour', `${oc.length} stretches`, fmtSpans(oc), oc));
  rows.push(badIf(nz.length, 'Noise', `${nz.length} stretches`, fmtSpans(nz), nz));
  rows.push(badIf(st.length, 'Stasis', `${st.length} stretches`, fmtSpans(st), st));
  let flashW = a.flashesPerSecondWholeFrame, flashT = a.flashesPerSecondAnyTile, flashAt = '';
  for (const x of windows) { const b = analyse(x); if (b.flashesPerSecondWholeFrame > flashW || b.flashesPerSecondAnyTile > flashT) flashAt = ` (worst near ${x.time[x.time.length >> 1]} s)`; flashW = Math.max(flashW, b.flashesPerSecondWholeFrame); flashT = Math.max(flashT, b.flashesPerSecondAnyTile); }
  if (w.chan) {
    // A world: true colour, three channels, tighter on a tile. The film's limit below is unchanged, and the film never comes here.
    const all = [flashThree(w), ...windows.filter(x => x.chan).map(x => flashThree(x))], worst = k => ['whole', 'tile'].map(on => Math.max(...all.map(r => r[k][on]))).join('/');
    const over = all.flatMap(r => r.over);
    rows.push(badIf(over.length, 'Flash', `luma ${worst('luma')}, red ${worst('red')}, cyan ${worst('rc')}`, `whole frame/any tile, true colour. Limits ${WORLD_FLASH.whole} and ${WORLD_FLASH.tile} per second${over.length ? '; over: ' + over.slice(0, 8).map(o => `${o.channel} ${o.on} ${o.n} near ${r2(o.t)} s`).join(', ') : ''}`));
    const cStep = series => { let m = 0; for (let i = 1; i < series.length; i++) m = Math.max(m, Math.abs(series[i] - series[i - 1])); return m; };
    const joltC = Math.max(cStep(w.colourMean), ...windows.filter(x => x.colourMean).map(x => cStep(x.colourMean))), joltK = Math.max(a.largestLuminanceStepPerFrame, ...windows.map(x => analyse(x).largestLuminanceStepPerFrame));
    rows.push(badIf(joltC > joltK * 1.25 + 1, 'Jolt on true colour', `step ${r2(joltC)}`, `largest step in true colour's luminance, against ${r2(joltK)} on the coverage draw of the same frames; limit that times 1.25, plus 1, as Beyond has it`));
    if (windows.length) {
      const js = windows.filter(x => x.colourDiff).map(x => ({ ...jerk({ ...x, diff: x.colourDiff }), what: x.what })).sort((p, q) => q.ratio - p.ratio), o2 = js.filter(j => j.ratio > TH.jerk);
      rows.push(badIf(o2.length, 'Jerk on true colour', `worst ${js[0]?.ratio ?? 0}x`, `${js.length} windows at 60 fps, limit ${TH.jerk}x${o2.length ? '; over: ' + o2.slice(0, 8).map(j => `${j.at} s ${j.ratio}x ${j.what}`).join(', ') : ''}`));
    }
  } else
  rows.push(badIf(flashW > TH.flashWhole || flashT > TH.flashTile, 'Flash', `${flashW} whole, ${flashT} tile`, `limits ${TH.flashWhole} and ${TH.flashTile} per second${flashAt}`));
  if (windows.length) {
    const js = windows.map(x => ({ ...jerk(x), what: x.what })).sort((p, q) => q.ratio - p.ratio);
    const over = js.filter(j => j.ratio > TH.jerk);
    let step = a.largestLuminanceStepPerFrame;
    for (const x of windows) step = Math.max(step, analyse(x).largestLuminanceStepPerFrame);
    const worseThanBase = baseline?.step != null && step > baseline.step * 1.1 + 0.5;
    rows.push(badIf(over.length || worseThanBase, 'Jerk on pulses', `worst ${js[0]?.ratio ?? 0}x, step ${r2(step)}`,
      `${windows.length} windows at 60 fps, limit ${TH.jerk}x; largest luminance step ${r2(step)}${baseline?.step != null ? ` against baseline ${baseline.step}` : ', no baseline saved'}${over.length ? '; over: ' + over.slice(0, 8).map(j => `${j.at} s ${j.ratio}x ${j.what}`).join(', ') : ''}`,
      over.map(j => ({ t0: j.at - 0.5, t1: j.at + 0.5, why: `${j.ratio}x ${j.what}` }))));
  } else rows.push(row('Jerk on pulses', 'PENDING', '', 'no 60 fps windows in this run'));
  return { rows, analysis: a };
}

// Does it flag what it must on ppp at bf1a9d2? Returns lines to print, and whether all is well.
export function calibration(song, rows) {
  const K = KNOWN[song];
  if (!K) return { lines: [], ok: true };
  const lines = []; let ok = true;
  const overlap = (a, s) => Math.max(0, Math.min(a[1], s.t1) - Math.max(a[0], s.t0));
  for (const test of ['Noise', 'One colour', 'Stasis']) {
    const spans = rows.find(r => r.test === test)?.spans || [];
    for (const want of K[test]) {
      const got = spans.reduce((s, x) => s + overlap(want, x), 0), hit = got >= Math.min(1, (want[1] - want[0]) * 0.25);
      if (!hit) ok = false;
      lines.push(`  ${hit ? 'flags' : 'MISSES'} ${test} ${want[0]}-${want[1]} s (${r2(got)} s of it)`);
    }
  }
  for (const span of K.clean) for (const test of ['Noise', 'One colour', 'Stasis']) {
    const spans = rows.find(r => r.test === test)?.spans || [];
    const got = spans.reduce((s, x) => s + overlap(span, x), 0);
    if (got > 0) { ok = false; lines.push(`  WRONGLY flags ${test} in ${span[0]}-${span[1]} s (${r2(got)} s)`); }
  }
  lines.push(`  clean stretch ${K.clean.map(c => c.join('-')).join(', ')} s checked`);
  return { lines, ok };
}

// ---------------------------------------------------------------- in the page
const helpers = async () => {
  const T = window.trippee, app = T.app, L = await import(new URL('src/pattern/layout.js', location.href).href);
  const g = { c: document.createElement('canvas') };
  g.c.width = 96; g.c.height = 54; g.x = g.c.getContext('2d', { willReadFrequently: true });
  window.__small = () => { g.x.drawImage(T.canvas, 0, 0, 96, 54); const d = g.x.getImageData(0, 0, 96, 54).data, L = new Float32Array(96 * 54); for (let i = 0; i < L.length; i++) L[i] = d[i * 4 + 1]; return L; };
  window.__dmean = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
  const big = document.createElement('canvas'), bx = big.getContext('2d', { willReadFrequently: true });
  window.__full = () => { big.width = T.canvas.width; big.height = T.canvas.height; bx.drawImage(T.canvas, 0, 0); return bx.getImageData(0, 0, big.width, big.height).data; };
  // Slot B holds whatever it last held unless this frame has two patterns, and nothing reads it then, so it only counts when it's in use.
  // And the ball under the sheet follows the pointer on real seconds even when it's not pressing: an edit, not the film, so with no press it doesn't count.
  const press = L.FRAME.press * 4;
  window.__blockHash = () => {
    const F = app.R.frame.slice(); if (F[press + 2] === 0) F[press] = F[press + 1] = F[press + 3] = 0;
    let h = 0x811c9dc5;
    for (const part of [app.R.slotA, F, ...(app.lastFrame.N ? [app.R.slotB] : [])]) { const b = new Uint32Array(part.buffer, part.byteOffset, part.length); for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193); } }
    return (h >>> 0).toString(16);
  };
};

// Records what frame() decided, per frame, for reading after a watch. Written as text because watch() evals its setup.
const RECORD = `(async () => {
  const L = await import(new URL('src/pattern/layout.js', location.href).href);
  const off = name => L.OFF?.[name];
  const left = off('slip.left'), kind = off('slip.kind'), step = off('slip.step'), starK = off('star.k');
  const WEIGHT = L.FRAME?.weight, gl = app.R.gl, ids = [], rec = window.__rec = { kind: [], pat: [], T: [], left: [], slip: [], star: [], weight: [], step: [], fine: [], area: [], disc: [], glErrors: 0 };
  let n = 0, buf = null;
  // the flat.mjs measure, on a very small copy: the biggest joined area of one colour, and the biggest disc of one colour that fits
  const FW = 80, FH = 45, fc = document.createElement('canvas'); fc.width = FW; fc.height = FH;
  const fg = fc.getContext('2d', { willReadFrequently: true });
  const stack = new Int32Array(FW * FH), seen = new Uint8Array(FW * FH), dist = new Float32Array(FW * FH);
  const flatOf = () => {
    fg.drawImage(app.canvas, 0, 0, FW, FH);
    const d = fg.getImageData(0, 0, FW, FH).data;
    seen.fill(0);
    let best = 0, disc = 0;
    const col = v => (v > 235 ? 1 : v < 20 ? 2 : 0);
    for (let i = 0; i < FW * FH; i++) {
      if (seen[i]) continue;
      const c = col(d[i * 4 + 1]); if (!c) continue;
      let top = 0, m = 0; stack[top++] = i; seen[i] = 1;
      while (top) {
        const k = stack[--top]; m++;
        const x = k % FW, y = (k / FW) | 0;
        if (x > 0 && !seen[k - 1] && col(d[(k - 1) * 4 + 1]) === c) { seen[k - 1] = 1; stack[top++] = k - 1; }
        if (x < FW - 1 && !seen[k + 1] && col(d[(k + 1) * 4 + 1]) === c) { seen[k + 1] = 1; stack[top++] = k + 1; }
        if (y > 0 && !seen[k - FW] && col(d[(k - FW) * 4 + 1]) === c) { seen[k - FW] = 1; stack[top++] = k - FW; }
        if (y < FH - 1 && !seen[k + FW] && col(d[(k + FW) * 4 + 1]) === c) { seen[k + FW] = 1; stack[top++] = k + FW; }
      }
      if (m > best) best = m;
    }
    for (const white of [true, false]) {
      for (let i = 0; i < FW * FH; i++) { const v = d[i * 4 + 1]; dist[i] = (white ? v > 235 : v < 20) ? 1e6 : 0; }
      for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) { const i = y * FW + x; if (x === 0 || y === 0 || x === FW - 1 || y === FH - 1) dist[i] = Math.min(dist[i], 1.5); if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1); if (y > 0) dist[i] = Math.min(dist[i], dist[i - FW] + 1); }
      for (let y = FH - 1; y >= 0; y--) for (let x = FW - 1; x >= 0; x--) { const i = y * FW + x; if (x < FW - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1); if (y < FH - 1) dist[i] = Math.min(dist[i], dist[i + FW] + 1); if (dist[i] > disc) disc = dist[i]; }
    }
    return [best / (FW * FH), disc / FH];
  };
  // How fine the lines are, anywhere in the frame: transitions per pixel at native resolution in each of 16 tiles, across or along, whichever is more.
  // A line period of P pixels is 2/P. look.mjs only looks down the middle of the frame, and the shader's edges are so crisp that grey alone can't see this.
  const fineOf = () => {
    const W = app.canvas.width, H = app.canvas.height;
    if (!buf || buf.length !== W * H * 4) buf = new Uint8Array(W * H * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const hN = new Uint32Array(16), hC = new Uint32Array(16), vN = new Uint32Array(16), vC = new Uint32Array(16);
    for (let y = 1; y < H - 1; y += 5) {
      const ty = 3 - Math.min(3, (y * 4 / H) | 0); let prev = buf[y * W * 4 + 1] > 127;
      for (let x = 1; x < W; x++) { const v = buf[(y * W + x) * 4 + 1] > 127, k = ty * 4 + Math.min(3, (x * 4 / W) | 0); hC[k]++; if (v !== prev) hN[k]++; prev = v; }
    }
    for (let x = 1; x < W - 1; x += 5) {
      const tx = Math.min(3, (x * 4 / W) | 0); let prev = buf[x * 4 + 1] > 127;
      for (let y = 1; y < H; y++) { const v = buf[(y * W + x) * 4 + 1] > 127, k = (3 - Math.min(3, (y * 4 / H) | 0)) * 4 + tx; vC[k]++; if (v !== prev) vN[k]++; prev = v; }
    }
    return Array.from(hN, (n, k) => +Math.max(n / Math.max(hC[k], 1), vN[k] / Math.max(vC[k], 1)).toFixed(3));
  };
  const on = window.__recOn = () => {
    const f = app.lastFrame; let k = ids.indexOf(f.G.pattern.id); if (k < 0) { ids.push(f.G.pattern.id); k = ids.length - 1; }
    rec.ids = ids; rec.kind.push(f.kind || null); rec.pat.push(k); rec.T.push(+(f.T || 0).toFixed(3));
    const A = app.R.slotA, B = app.R.slotB;
    if (left != null) { rec.left.push(+Math.max(A[left], f.N ? B[left] : 0).toFixed(3)); rec.slip.push(Math.max(A[kind], f.N ? B[kind] : 0)); rec.step.push(+Math.max(A[step], f.N ? B[step] : 0).toFixed(3)); }
    if (starK != null) rec.star.push(+Math.max(A[starK], f.N ? B[starK] : 0).toFixed(3));
    if (WEIGHT != null) rec.weight.push(+app.R.frame[WEIGHT * 4].toFixed(3));
    window.__coverage?.();       // a world: these read the coverage draw, then the colour goes back for whoever reads it next
    rec.fine.push(fineOf());
    const [a, d] = flatOf(); rec.area.push(+a.toFixed(3)); rec.disc.push(+d.toFixed(3));
    if (window.__coverage) app.R.draw();
    if (++n % 60 === 0 && gl.getError()) rec.glErrors++;
  };
  app.onFrame.push(on);
})()`;
const STOP_RECORD = `(()=>{const i=app.onFrame.indexOf(window.__recOn);if(i>=0)app.onFrame.splice(i,1);return window.__rec})()`;

export default async ({ page, log, save, out, sleep }) => {
  const stages = (process.env.STAGE || 'selftest,film,windows,purity,boot,variety,closure,countdown,wave,balance,beyond,rest,follow,direction').split(',');
  const WORLD = process.env.WORLD && process.env.WORLD !== 'film' ? process.env.WORLD : null;
  const want = s => stages.includes(s) && !(WORLD && s === 'beyond');
  const songPath = process.env.SONG || 'media/ppp.mp3', song = basename(songPath).replace(/\.\w+$/, '');
  const rows = [], extra = {};
  const add = (r, ...more) => { rows.push(r); log(`${r.status.padEnd(7)} ${r.test}: ${r.value}${r.detail ? '  ' + String(r.detail).slice(0, 600) : ''}`); for (const m of more) log(m); };
  const pageErrors = () => page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  await page.eval(helpers);

  // ---- Boot: on a fresh page, before anything has probed, the very first probe has to draw something.
  if (want('boot')) {
    const b = await page.eval(() => {
      const R = app.R, { W, H, px } = R.probe(R.slotA.slice(), 16 / 9);
      let lit = 0, dark = 0; for (let i = 0; i < px.length; i += 4) { if (px[i] > 200) lit++; if (px[i] < 55) dark++; }
      return { lit: +(lit / (W * H)).toFixed(3), dark: +(dark / (W * H)).toFixed(3), err: R.gl.getError(), pattern: app.lastFrame?.G?.pattern?.id };
    });
    add(badIf(b.lit === 0 || b.err !== 0, 'Boot (first probe)', `lit ${b.lit}`, `first probe of ${b.pattern}: ${b.lit} white, ${b.dark} black, gl error ${b.err}. integrate and v2 are run by tests/all.mjs`));
  }

  // ---- Can it see what it's for? Three pictures made bad on purpose, and one good one. Each test has to fire on its own bad picture and stay quiet on the good one.
  if (want('selftest')) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    await page.eval(`app.governor.enabled=false;app.R.drawScale=1;app.manual=true`);
    const cases = [
      { name: 'a frozen picture', test: 'Stasis', secs: 15, id: 'lines.river', start: `window.__phi=app.stage.score.phi;app.stage.score.phi=()=>0`, hold: '', end: `app.stage.score.phi=window.__phi` },
      { name: 'lines far too fine', test: 'Noise', secs: 5, id: 'lines.river', start: '', hold: 'app.edits.over={freq:24}', end: 'app.edits.over={}' },
      { name: 'nearly all white', test: 'One colour', secs: 6, id: 'lattice.master', start: '', hold: 'app.edits.duty=-0.5', end: 'app.edits.duty=0' },
    ];
    const results = [];
    const judgeOne = async (c, setup) => {
      const w = await watch(page, () => {}, { name: 'self', seconds: c.secs, fps: 12, cols: 2, rows: 1, setup: `${setup};${RECORD}` });
      const rec = await page.eval(STOP_RECORD);
      await page.eval(`app.onFrame.splice(app.onFrame.indexOf(window.__hold),1);${c.end || ''}`);
      return { oc: oneColour(w, [], rec), nz: noise(w, rec), st: stasis(w, []) };
    };
    for (const c of cases) {
      const r = await judgeOne(c, `trippee.load(${JSON.stringify(c.id)},{arcs:false});app.t=6;${c.start};window.__hold=()=>{${c.hold}};app.onFrame.push(window.__hold);${c.hold}`);
      const got = { 'One colour': r.oc, Noise: r.nz, Stasis: r.st }[c.test];
      results.push({ ...c, fired: got.length > 0, spans: got });
      log(`  self-test, ${c.name}: ${c.test} ${got.length ? 'fired ' + fmtSpans(got) : 'DID NOT FIRE'}`);
    }
    const good = await judgeOne({ secs: 30 }, `trippee.load('lattice.master',{sweep:true,len:30});app.t=0;window.__hold=()=>{};app.onFrame.push(window.__hold)`);
    const noisy = [...good.oc, ...good.nz, ...good.st];
    log(`  self-test, a good pattern riding its whole move: ${noisy.length ? 'WRONGLY flagged ' + fmtSpans(noisy) : 'quiet'}`);
    const missed = results.filter(r => !r.fired).map(r => r.test);
    add(badIf(missed.length || noisy.length, 'Judge self-test', `${results.length - missed.length}/${results.length} bad pictures caught, ${noisy.length} false alarms`, missed.length ? 'missed ' + missed.join(', ') : ''));
    await page.eval(`app.t=0;trippee.seek(0)`);
  }

  // ---- the song, dropped like a person drops it. The wander is held at t=0 first, so the handover is the same every run.
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  await page.eval(`app.governor.enabled=false;app.R.drawScale=1;trippee.seek(0)`);
  const data = { items: [], files: [resolve(songPath)], dragOperationsMask: 1 };
  await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 640, y: 360, data });
  await page.send('Input.dispatchDragEvent', { type: 'drop', x: 640, y: 360, data });
  const tLoad = Date.now();
  for (let i = 0; i < 1800; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await sleep(100); }
  const ready = await page.eval('app.ui.song.state');
  if (ready !== 'ready') throw new Error(`song never got ready: ${ready}`);
  if (process.env.SEED || process.env.FAMILY) await page.eval(`app.song.prepareTake({${process.env.SEED ? `seed:${+process.env.SEED},` : ''}${process.env.FAMILY ? `family:${JSON.stringify(process.env.FAMILY)}` : ''}}).then(show => { show?.(); })`);
  if (process.env.CUT) {
    for (let i = 0; i < 3000 && !(await page.eval('!!app.song.compare')); i++) await sleep(100);
    if (!(await page.eval('!!app.song.compare'))) throw new Error(`CUT=1: ${song} has no hand cut, or it never got rehearsed`);
    await page.eval(`(()=>{const sc=app.song.compare.score('cut');app.song.score=sc;app.stage.setScore(sc)})()`);
    log(`the hand cut, not the generated film: ${await page.eval('app.song.compare.line')}`);
  }
  await page.eval(`app.song.pause();app.ui.song.show(false);app.manual=true;app.governor.enabled=false;app.R.drawScale=1;app.t=0;`);
  if (WORLD) {
    await enterWorld(page, WORLD, log);
    await page.eval(`(()=>{const s=window.__small,f=window.__full;window.__small=()=>{window.__coverage?.();return s()};window.__full=()=>{window.__coverage?.();return f()};app.t=0})()`);
  }
  const info = await page.eval(() => {
    const s = app.song.score, M = s.react?.M ?? s.M ?? null;
    const heroOf = G => [G.hero, G.xform?.id, ...(G.moves || []).map(m => m.id)].filter(Boolean);
    return {
      duration: app.song.duration, family: s.family, bpm: s.song?.bpm, meter: s.song?.meter, seed: s.seed, rehearsal: app.song.rehearsal && { seconds: +app.song.rehearsal.seconds.toFixed(2), bad: app.song.rehearsal.bad },
      analyseSeconds: +app.song.analyseSeconds.toFixed(1), size: [app.canvas.width, app.canvas.height],
      gestures: s.gestures.map(G => ({ t0: +G.t0.toFixed(2), t1: +G.t1.toFixed(2), morph: +(G.morph || 0).toFixed(2), id: G.pattern.id, hero: heroOf(G) })),
      pulses: Array.from(s.react?.pulses || []),
      M: M && { landed: !!M.runs?.length, rests: M.rests || [], breath: M.breath ? { beats: M.breath.beats, t: Array.from(M.breath.t || []) } : null, home: M.home || null },
    };
  });
  log(`${song}: ${info.duration.toFixed(1)} s, family ${info.family}, ${info.gestures.length} gestures, ${info.size.join('x')}, listened in ${((Date.now() - tLoad) / 1000).toFixed(1)} s (analysis ${info.analyseSeconds} s), rehearsal ${JSON.stringify(info.rehearsal)}`);
  const rests = (info.M?.rests || []).filter(r => r.b > r.a);
  for (const f of (process.env.FAKE_RESTS || '').split(',').filter(Boolean)) { const [a, b] = f.split('-').map(Number); rests.push({ a, b }); }
  const inFilm = t => t > 2 && t < info.duration - 2;

  // ---- the whole film, 12 fps at 1080p
  let film = null, rec = null;
  const filmFile = join(out, `${song}.json`);
  if (want('film')) {
    const cols = 14, rowsWanted = Math.ceil(info.duration / 2 / cols);
    const t0 = Date.now();
    const w = await watch(page, save, { name: song, seconds: info.duration, fps: 12, cols, rows: rowsWanted, setup: `app.t=0;${RECORD}`, ...(WORLD ? { colour: true } : {}) });
    rec = await page.eval(STOP_RECORD);
    log(`watched the film in ${((Date.now() - t0) / 1000).toFixed(0)} s: ${w.white.length} frames`);
    film = w;
    save(`${song}.rec.json`, JSON.stringify(rec));
  } else if (existsSync(filmFile)) {
    film = JSON.parse(readFileSync(filmFile, 'utf8')); film.name = song;
    const rf = join(out, `${song}.rec.json`); if (existsSync(rf)) rec = JSON.parse(readFileSync(rf, 'utf8'));
    log(`using the capture already in ${filmFile}`);
  }

  // Locks are found by watching slip.left reach 0, so they don't depend on how the director spelled anything.
  const locks = [];
  if (rec?.left?.length && film) for (let i = 1; i < rec.left.length; i++) if (rec.left[i - 1] > 0 && rec.left[i] === 0) {
    let k = i - 1; while (k > 0 && rec.left[k - 1] > 0) k--;
    locks.push({ t: film.time[i], t0: film.time[k], bandBeats: rec.step[i - 1] });
  }

  for (const f of (process.env.FAKE_LOCKS || '').split(',').filter(Boolean)) { const [t, t0] = f.split('-').map(Number); locks.push({ t, t0, bandBeats: 4 }); }

  // ---- 60 fps around every boundary, morph start, rest and lock, and a sample of pulses
  const windows = [];
  if (want('windows')) {
    const marks = [];
    for (const G of info.gestures) { if (inFilm(G.t1)) marks.push({ t: G.t1, what: `landing on ${G.id}` }); if (G.morph && inFilm(G.t1 - G.morph)) marks.push({ t: G.t1 - G.morph, what: `morph starts from ${G.id}` }); }
    for (const r of rests) { marks.push({ t: r.a, what: 'rest begins' }, { t: r.b, what: 'rest ends' }); }
    for (const l of locks) marks.push({ t: l.t, what: 'lock' });
    const P = info.pulses.filter(inFilm);
    for (let i = 0; i < 10 && P.length; i++) marks.push({ t: P[Math.floor((i + 0.5) * P.length / 10)], what: 'pulse' });
    marks.sort((a, b) => a.t - b.t);
    const t0 = Date.now();
    const noSave = () => {};
    for (const m of marks) {
      const w = await watch(page, noSave, { name: 'w', seconds: 3, fps: 60, cols: 2, rows: 1, setup: `app.t=${m.t - 1.5}`, ...(WORLD ? { colour: true } : {}) });
      windows.push({ ...w, what: m.what, mark: m.t });
    }
    log(`${marks.length} windows at 60 fps in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    save(`${song}.windows.json`, JSON.stringify(windows.map(w => ({ what: w.what, mark: w.mark, fps: w.fps, diff: w.diff, mean: w.mean, time: w.time, tiles: w.tiles, white: w.white, grey: w.grey, edges: w.edges, cpuMs: w.cpuMs, size: w.size, ...(w.chan ? { chan: w.chan, colourDiff: w.colourDiff, colourMean: w.colourMean } : {}) }))));
  }

  // ---- the film-wide table
  const baseFile = join(ROOT, 'lab-out', 'judge', `${song}.json`);
  const baseline = existsSync(baseFile) ? JSON.parse(readFileSync(baseFile, 'utf8')) : null;
  let judged = null;
  if (film) {
    judged = judgeFilm(film, { rests, baseline, windows, rec, ...(WORLD ? { expects: await page.eval(`(()=>{const W=app.stage.world;return{soft:!!W?.soft,edgesPerCycle:W?.edgesPerCycle??2}})()`) } : {}) });
    for (const r of judged.rows) add(r);
    const glErrors = rec?.glErrors ?? 0;
    add(badIf(glErrors || pageErrors().length, 'Console', `${pageErrors().length} errors, ${glErrors} gl errors`, pageErrors().slice(0, 4).join(' | ')));
    if (process.env.BASELINE === 'save') {
      mkdirSync(dirname(baseFile), { recursive: true });
      const a = judged.analysis; let step = a.largestLuminanceStepPerFrame;
      for (const x of windows) step = Math.max(step, analyse(x).largestLuminanceStepPerFrame);
      writeFileSync(baseFile, JSON.stringify({ song, step: r2(step), saved: new Date().toISOString(), from: await page.eval('location.pathname'), rows: judged.rows }));
      log(`saved baseline ${baseFile}`);
    }
    const cal = calibration(song, judged.rows);
    if (cal.lines.length) { log(`calibration against the stretches known to be bad at bf1a9d2 (${cal.ok ? 'all as expected' : 'NOT as expected'}; only meaningful on that film):`); cal.lines.forEach(l => log(l)); }
    extra.calibration = cal;
  }

  // ---- Dark: a world has no large empty black. A frame a second, true colour.
  if (WORLD && film) {
    const dark = await page.eval(async duration => {
      const { darkOf } = await import(new URL('tools/look.mjs', location.href).href);
      const T = window.trippee, W = 320, H = 180, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d', { willReadFrequently: true }), out = [];
      for (let t = 1; t < duration; t += 1) { T.seek(t); x.drawImage(T.canvas, 0, 0, W, H); out.push({ t, ...darkOf(x.getImageData(0, 0, W, H).data, W, H) }); if (t % 8 === 0) await new Promise(r => setTimeout(r)); }
      return out;
    }, info.duration);
    const over = dark.filter(d => d.bad);
    extra.dark = { over: over.length, frames: dark.length };
    add(badIf(over.length, 'Dark', `${over.length}/${dark.length} frames`, `share under Y .03 under .35, biggest disc of it under .25 of the height; worst share ${Math.max(...dark.map(d => d.share))}, worst disc ${Math.max(...dark.map(d => d.disc))}${over.length ? '; at ' + over.slice(0, 12).map(d => d.t).join(' ') : ''}`));
  }

  // ---- Purity: the block at 100 times, in order against any order, each on a fresh take of the same film.
  if (want('purity')) {
    const pr = await page.eval(async ({ duration, rests }) => {
      const T = window.trippee, song = app.song;
      const times = []; for (let i = 0; i < 100; i++) times.push(+((i + 0.37) * duration / 100).toFixed(3));
      for (const r of rests) times.push(r.a - 0.2, (r.a + r.b) / 2, r.b + 0.3, r.b + 1.5, r.b + 4);
      times.sort((a, b) => a - b);
      const take = async () => {
        (await song.prepareTake({}))?.();
        return song.score;
      };
      const run = order => { const h = {}; for (const i of order) { T.seek(times[i]); h[i] = window.__blockHash(); } return h; };
      const ids = times.map((_, i) => i);
      await take();
      const A = run(ids), plan0 = song.score.gestures.map(g => g.pattern.id).join();
      await take();
      let seed = 8675309; const rnd = n => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed >>> 8) % n; };
      const shuffled = ids.slice(); for (let i = shuffled.length - 1; i > 0; i--) { const j = rnd(i + 1); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
      const B = run(shuffled), plan1 = song.score.gestures.map(g => g.pattern.id).join();
      // and straight back over the same film without a fresh take: nothing reading the film may change it
      const C = run(ids);
      const bad = ids.filter(i => A[i] !== B[i]).map(i => times[i]), again = ids.filter(i => B[i] !== C[i]).map(i => times[i]);
      return { n: ids.length, bad, again, sameFilm: plan0 === plan1 };
    }, { duration: info.duration, rests });
    add(badIf(pr.bad.length || pr.again.length, 'Purity', `${pr.n - pr.bad.length}/${pr.n} identical`, `in order against shuffled, on two takes of the same film${pr.sameFilm ? '' : ' (the takes CHOSE DIFFERENT PATTERNS)'}${pr.bad.length ? '; differ at ' + pr.bad.slice(0, 12).join(' ') : ''}${pr.again.length ? '; a second reading differs at ' + pr.again.slice(0, 12).join(' ') : ''}`));
    await page.eval(`app.manual=true;app.R.drawScale=1;app.t=0`);
  }

  // ---- Variety: what the director chose
  if (want('variety')) {
    const seq = await page.eval(() => app.song.score.gestures.map(G => ({ t0: G.t0, t1: G.t1, kinds: [G.hero, G.xform?.id, ...(G.moves || []).map(m => m.id)].filter(Boolean) })));
    const heroes = []; for (const G of seq) for (const k of G.kinds) heroes.push({ t: G.t0, k });
    const planKinds = rec?.kind ? [...new Set(rec.kind.filter(Boolean))] : [];
    // A world that names one kind of landing (motion.xform) means it: that's its film, and a director's variety isn't what it's after. Anything else it does is still counted.
    const oneKind = WORLD ? await page.eval(() => app.stage.world?.motion?.xform ?? null) : null;
    if (oneKind && heroes.every(h => h.k === oneKind)) add(row('Variety', 'PASS', `one kind of landing, ${oneKind}, and the world says so`, `motion.xform; plan kinds: ${planKinds.join(' ') || '?'}`));
    else if (!heroes.length) add(row('Variety', 'PENDING', `plan kinds: ${planKinds.join(' ') || '?'}`, 'no gesture has moves or a transformation yet'));
    else {
      const names = [...new Set(heroes.map(h => h.k))];
      const twice = heroes.filter((h, i) => i && heroes[i - 1].k === h.k);
      const first = heroes[0].t;
      add(badIf(names.length < 4 || twice.length || first > 90, 'Variety', `${names.length} kinds, first at ${r2(first)} s`, `${names.join(' ')}; order ${heroes.map(h => h.k).join(' ')}${twice.length ? '; twice running at ' + twice.map(h => r2(h.t)).join(' ') : ''}`));
    }
  }

  // ---- Closure and Countdown, at every lock
  if (want('closure') || want('countdown')) {
    if (!locks.length) {
      if (want('closure')) add(row('Closure', 'PENDING', '', 'no gesture ever slips and locks yet (slip.left never reaches 0)'));
      if (want('countdown')) add(row('Countdown reads', 'PENDING', '', 'no lock in this film yet'));
    } else {
      const res = await page.eval(async ({ locks }) => {
        const T = window.trippee, out = [];
        const { OFF } = await import(new URL('src/pattern/layout.js', location.href).href);
        const TABLE = ['slip.left', 'slip.step', 'slip.ease', 'slip.seed', 'spare.a', 'spare.b', 'spare.c', 'spare.d'].map(p => OFF[p]);
        const fdiff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i + 1] - b[i + 1]); return s / (a.length / 4); };
        const corr = (a, b) => { let sa = 0, sb = 0, ab = 0, aa = 0, bb = 0, n = a.length; for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; } sa /= n; sb /= n; for (let i = 0; i < n; i++) { const x = a[i] - sa, y = b[i] - sb; ab += x * y; aa += x * x; bb += y * y; } return ab / Math.sqrt(aa * bb + 1e-9); };
        for (const l of locks) {
          app.edits.over = app.edits.over || {};
          T.seek(l.t); const on = window.__full().slice(); const finalSmall = window.__small();
          app.edits.over['slip.kind'] = 0; T.seek(l.t); const off = window.__full().slice(); delete app.edits.over['slip.kind'];
          const closure = fdiff(on, off);
          // correlation with the final frame, walking up to the lock
          const span = Math.max(l.t - l.t0, 1), n = Math.ceil(span * 12), c = [];
          for (let i = 0; i <= n; i++) { T.seek(l.t0 + i / 12); c.push(+corr(window.__small(), finalSmall).toFixed(4)); }
          // A step is a ring arriving: its slip goes to exactly nothing and stays there, each at least half a beat after the last. The rings never stop between the beats, so the picture can't be counted by its holds.
          // Each is also seen in the pixels: when a ring has landed the frame has come on since the ring before, and at the end it's the final frame.
          const seen = {}, arrived = [];
          for (let i = 0; i <= n; i++) {
            T.seek(l.t0 + i / 12);
            TABLE.forEach((o, r) => { const v = app.R.slotA[o]; if (v !== 0) seen[r] = i; });
          }
          for (const r in seen) if (seen[r] < n) arrived.push(seen[r] + 1);
          arrived.sort((a, b) => a - b);
          let steps = 0, lastAt = -1e9, gain = 0;
          for (const i of arrived) if (i - lastAt >= 3) { steps++; lastAt = i; }
          for (let i = 1; i < arrived.length; i++) if (c[arrived[i]] > c[arrived[i - 1]]) gain++;
          let lowest = 1; for (const v of c) lowest = Math.min(lowest, v);
          out.push({ t: l.t, span: +span.toFixed(1), closure: +closure.toFixed(3), steps, gain, c0: lowest, c1: c.at(-1), series: c });
        }
        return out;
      }, { locks });
      if (want('closure')) {
        const bad = res.filter(r => r.closure >= TH.closure);
        add(badIf(bad.length, 'Closure', `worst ${Math.max(...res.map(r => r.closure))}/255 over ${res.length} locks`, `limit ${TH.closure}/255; ${res.map(r => `${r2(r.t)} s ${r.closure}`).join(', ')}. Per-band arrival isn't measured here: look at the slices`));
      }
      if (want('countdown')) {
        const long = res.filter(r => r.span >= 8), bad = long.filter(r => r.steps < 5 || r.c1 - r.c0 < 0.2);     // steps: rings that arrive one at a time. It also has to rise to the final frame overall
        if (!long.length) add(row('Countdown reads', 'PENDING', '', 'locks exist, none run up over at least 8 s'));
        else add(badIf(bad.length, 'Countdown reads', `${long.map(r => r.steps).join(', ')} steps`, `rings arriving, and the correlation with the final frame, ${long.map(r => `${r2(r.t)} s from ${r2(r.c0)} to ${r2(r.c1)} over ${r.span} s, up on ${r.gain} rings`).join(', ')}`));
      }
      extra.locks = res.map(({ series, ...r }) => r);
    }
  }

  // ---- Rest: still in the rest, moving straight after, and the band has really stopped
  if (want('rest')) {
    if (!rests.length) add(row('Rest', info.M?.landed ? 'PASS' : 'PENDING', 'no rests', info.M?.landed ? 'understand found none in this song' : 'understand() has not landed'));
    else if (film) {
      const db = await page.eval(async (songPath) => {
        const buf = await (await fetch('/' + songPath)).arrayBuffer();
        const off = new OfflineAudioContext(1, 1, 22050), a = await off.decodeAudioData(buf), d = a.getChannelData(0), hop = Math.round(a.sampleRate / 10), v = [];
        for (let i = 0; i + hop < d.length; i += hop) { let s = 0; for (let k = 0; k < hop; k++) s += d[i + k] * d[i + k]; v.push(+(10 * Math.log10(s / hop + 1e-10)).toFixed(1)); }
        return v;
      }, songPath);
      const fps = film.fps, bar = 60 / (info.bpm || 120) * (info.meter || 4);
      const detail = [], bad = [];
      for (const r of rests) {
        const frames = (a, b) => film.diff.slice(Math.max(0, Math.round(a * fps)), Math.round(b * fps));
        const around = median([...frames(r.a - 8, r.a - 1), ...frames(r.b + 3, r.b + 10)]);
        const held = median(frames(r.a + 0.1, r.b - 0.1)), back = Math.max(...frames(r.b, r.b + 0.5), 0);
        const hop = 10, loud = median(db.slice(Math.round(Math.max(0, r.a - 4 * bar) * hop), Math.round(r.a * hop)).concat(db.slice(Math.round(r.b * hop), Math.round((r.b + 4 * bar) * hop))));
        const inside = mean(db.slice(Math.round(r.a * hop), Math.round(r.b * hop))), drop = loud - inside;
        const fails = [];
        if (held >= TH.restDiff * around) fails.push(`moves ${r2(held / Math.max(around, 1e-3) * 100)}%`);
        if (back <= TH.restBack * around) fails.push(`re-entry only ${r2(back / Math.max(around, 1e-3) * 100)}%`);
        if (drop < TH.restDb) fails.push(`drop only ${r2(drop)} dB`);
        detail.push(`${r2(r.a)}-${r2(r.b)} s: held ${r2(held)} of ${r2(around)}, back ${r2(back)}, drop ${r2(drop)} dB${fails.length ? ' [' + fails.join(', ') + ']' : ''}`);
        if (fails.length) bad.push(r);
      }
      add(badIf(bad.length || rests.length > TH.restMax, 'Rest', `${rests.length} rests, ${bad.length} bad`, detail.join('; ')));
    }
  }

  // ---- Breath: does the picture visibly breathe on the phrase? The white folded on the breath grid, against the same thing folded on grids of other periods. An autocorrelation can't see this
  // under the big swings of each pattern's long move and each flight, and a fold can, since only what's locked to the grid survives it.
  if (want('film') || film) {
    const grid = info.M?.breath?.t?.length > 1 ? info.M.breath.t : null;
    const lagHint = grid ? median(grid.slice(1).map((t, i) => t - grid[i])) : BREATH_HINT[song];
    if (film && lagHint) {
      // Only where the film is listening: a transformation is its own move, and a body move (a coin, a countdown, a star) is the hero of its stretch, with everything else told to step back on purpose.
      const BODY_MOVES = ['coin', 'slip', 'star'], heroAt = t => info.gestures.find(G => G.t0 <= t && t < G.t1)?.hero?.some(h => BODY_MOVES.includes(h));
      const listening = rec?.kind?.length ? i => !rec.kind[i] && !heroAt(film.time[i]) : null;
      const b = breathOf(film, lagHint, grid), f = breathFold(film, grid ?? [0], lagHint, listening);
      extra.breath = { ...b, fold: f };
      const measured = !!grid, off = Math.min(f.peak, 1 - f.peak);
      const good = f.range >= TH.breathRange && f.p <= TH.breathP && off <= TH.breathPeak && (f.attack == null || f.attack >= TH.breathAttack);
      add(row('Breath', measured ? (good ? 'PASS' : 'FAIL') : 'PENDING', `fold ${f.range} of white at ${r2(lagHint)} s, p ${f.p}`, `white folded on the breath grid over the ${f.share} of the film that's listening: range ${f.range} (want ${TH.breathRange}+), peaking ${r2(off)} of a breath from the breath (want ${TH.breathPeak} at most), other periods fold as well ${f.p} of the time (want ${TH.breathP} at most), rises in ${f.attack} s (want ${TH.breathAttack}+). Autocorrelation for the record: r ${b.r}${measured ? '' : '; breath from the prototype, understand() has not landed'}`));
    }
  }

  // ---- Wave and Balance draw small and fast. Everything before here needed 1080p.
  const smallView = async () => { await page.send('Emulation.setDeviceMetricsOverride', { width: 480, height: 270, deviceScaleFactor: 1, mobile: false }); await sleep(400); await page.eval(`app.manual=true;app.governor.enabled=false;app.R.drawScale=1;app.ui?.song?.show?.(false)`); };

  if (want('wave')) {
    const live = rec?.weight?.some(v => v !== 0) || process.env.FAKE_WAVE;
    if (!live) add(row('Wave', 'PENDING', '', 'the weight field has not landed, or is never on'));
    else {
      await smallView();
      const res = await page.eval(async ({ pulses, duration }) => {
        const T = window.trippee, L = await import(new URL('src/pattern/layout.js', location.href).href);
        const W = 96, H = 54, FPS = 60, F = app.R.frame, Fw = L.FRAME.weight * 4, Ff = L.FRAME.focus * 4;
        const inner = [], outer = [], cs = [], sections = [0.3, 0.65].map(x => x * duration), times = [];
        for (const s0 of sections) for (let i = 0; i < 25 * FPS; i++) {
          const t = s0 + i / FPS; T.seek(t); const px = window.__small();
          const fx = F[Ff], fy = F[Ff + 1]; let a = 0, an = 0, b = 0, bn = 0;
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const X = (x + 0.5 - W / 2) / (H / 2) - fx, Y = (H / 2 - y - 0.5) / (H / 2) - fy, r = Math.hypot(X, Y); if (Math.abs(r - 0.2) < 0.07) { a += px[y * W + x]; an++; } else if (Math.abs(r - 0.9) < 0.07) { b += px[y * W + x]; bn++; } }
          inner.push(a / Math.max(an, 1)); outer.push(b / Math.max(bn, 1)); times.push(t);
          if (F[Fw + 2] > 0) cs.push(1 / F[Fw + 2]);
          if (i % 30 === 0) await new Promise(r => setTimeout(r));
        }
        return { inner, outer, times, c: cs.length ? cs[cs.length >> 1] : 0.6, fall: F[Fw + 3] > 0, pulses: pulses.filter(p => sections.some(s => p > s + 2.5 && p < s + 23)) };
      }, { pulses: info.pulses, duration: info.duration });
      const w = waveOf(res);
      add(badIf(!w.ok, 'Wave', `inner ${w.inner.lag} frames, outer lead ${w.outer.lag} (want ${w.expected}), p ${w.p}`, `${res.pulses.length} beats. Inner peak within 3 frames of the beat, outer lead r/c within 10, permuted beats p < .01`));
    }
  }

  if (want('balance')) {
    await smallView();
    const res = await page.eval(async ({ duration, step }) => {
      const T = window.trippee, E = app.edits, dt = 1 / 12;
      const CH = ['reactPulse', 'reactMelody', 'reactTone', 'reactHarmony'], allOff = () => { for (const c of CH) E[c] = 0; };
      const grab = t => { T.seek(t); return window.__small(); };
      const out = { times: [], E: CH.map(() => []) };
      for (let t = 2; t < duration - 2; t += step) {
        allOff(); const b0 = grab(t), b1 = grab(t + dt);
        for (let c = 0; c < CH.length; c++) {
          allOff(); E[CH[c]] = 1; const a0 = grab(t), a1 = grab(t + dt);
          let s = 0; for (let i = 0; i < a0.length; i++) s += Math.abs((a1[i] - b1[i]) - (a0[i] - b0[i]));
          out.E[c].push(+(s / a0.length).toFixed(3));
        }
        out.times.push(+t.toFixed(2));
        if (out.times.length % 8 === 0) await new Promise(r => setTimeout(r));
      }
      for (const c of CH) delete E[c];
      E.reactPulse = E.reactMelody = E.reactTone = 1;
      return out;
    }, { duration: info.duration, step: +(process.env.BALANCE_STEP || 0.5) });
    const lag = info.M?.breath?.t?.length > 1 ? median(info.M.breath.t.slice(1).map((t, i) => t - info.M.breath.t[i])) : (BREATH_HINT[song] || 8);
    const b = balanceOf(res, lag);
    extra.balance = b;
    const conducted = !!info.M?.breath?.t?.length;
    const bad = b.leadShare < 0.8 || b.pulse > 0.35;
    add(row('Balance', conducted ? (bad ? 'FAIL' : 'PASS') : 'PENDING', `pulse ${r2(b.pulse * 100)}%, a lead in ${r2(b.leadShare * 100)}% of breaths`, `motion energy per channel over the song: pulse ${r2(b.shares[0] * 100)}%, melody ${r2(b.shares[1] * 100)}%, tone ${r2(b.shares[2] * 100)}%, harmony ${r2(b.shares[3] * 100)}%. Want a lead at 50%+ in 80%+ of breaths, pulse at most 35%${conducted ? '' : '; the conductor has not landed'}`));
  }

  // ---- Beyond: Jolt, Flash and Cost with colour on, and byte-identical when shut
  if (want('beyond')) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    const same = await page.eval(async duration => {
      const T = window.trippee; app.manual = true; app.governor.enabled = false; app.R.drawScale = 1;
      const times = [0.2, 0.35, 0.5, 0.65, 0.8].map(x => x * duration); const plain = [], zero = [];
      for (const t of times) { app.t = t; plain.push(T.capture()); }
      app.t = 0; app.beyond.on(); app.beyond.snap(0);
      for (const t of times) { app.t = t; app.beyond.snap(0); zero.push(T.capture()); }
      return times.filter((_, i) => plain[i] !== zero[i]).map(t => +t.toFixed(1));
    }, info.duration);
    const secs = info.duration;      // colour's stop can be anywhere in the song, and a film goes on changing to the end
    const w = await watch(page, () => {}, { name: 'beyond', seconds: secs, fps: 12, cols: 2, rows: 1, setup: `app.t=0;app.beyond.on();app.beyond.snap()` });
    const a = analyse(w);
    const cost = await page.eval(async duration => {
      const T = window.trippee, gl = app.R.gl, px = new Uint8Array(4), ms = [];
      for (let i = 0; i < 40; i++) { app.t = (i + 0.5) / 40 * duration * 0.33; gl.finish(); const t0 = performance.now(); T.step(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ms.push(performance.now() - t0); if (i % 4 === 0) await new Promise(r => setTimeout(r)); }
      ms.sort((x, y) => x - y);
      app.beyond.off(); app.beyond.snap(null);
      return { p50: +ms[20].toFixed(1), p95: +ms[37].toFixed(1), max: +ms[39].toFixed(1) };
    }, info.duration);
    const stepPlain = film ? (() => { let m = 0; for (let i = 1; i < Math.min(film.mean.length, secs * 12); i++) m = Math.max(m, Math.abs(film.mean[i] - film.mean[i - 1])); return m; })() : null;
    const jolt = a.largestLuminanceStepPerFrame, joltBad = stepPlain != null && jolt > stepPlain * 1.25 + 1;
    const flashBad = a.flashesPerSecondWholeFrame > TH.flashWhole || a.flashesPerSecondAnyTile > TH.flashTile;
    add(badIf(same.length || joltBad || flashBad || cost.p95 > TH.cost, 'Beyond', `jolt ${jolt}, flash ${a.flashesPerSecondWholeFrame}/${a.flashesPerSecondAnyTile}, p95 ${cost.p95} ms`, `the whole ${r2(secs)} s with colour on. Jolt against black and white ${stepPlain != null ? r2(stepPlain) : '?'}; cost ${JSON.stringify(cost)}; snap(0) byte-identical at 5 film times: ${same.length ? 'NO at ' + same.join(' ') : 'yes'}`));
  }

  // ---- Follow: does the picture land on the strong beats? The whole song at 60 fps on 96x54. Pure, and the capture's kept: node tests/follow.mjs <song>.follow.json judges it again.
  // The marks are what the film gets to once it hears (docs/MODES.md section 6, behind flags it hasn't opted into), so with no world and no hearing on it's reported and can't fail: today's film isn't meant to pass.
  if (want('follow')) {
    await smallView();
    const heard = !!WORLD || await page.eval(async () => { const F = await import(new URL('src/score/flags.js', location.href).href); return !!F.hearing && Object.values(F.hearing).some(Boolean); });
    const cap = await captureSong(page, { pulses: info.pulses, duration: info.duration, bpm: info.bpm, meter: info.meter, song, world: WORLD });
    save(`${song}.follow.json`, JSON.stringify(cap));
    const f = judgeCapture(cap);
    extra.follow = f;
    add(row('Follow', heard ? (f.pass ? 'PASS' : 'FAIL') : 'PENDING', `F ${f.F}, off the beat ${f.shifted}, AUC ${f.auc}`, `${f.beats} beats, ${f.peaks} peaks at +-${FOLLOW.tol * 1000} ms, off grid by ${f.shift} s (${f.offIs}). Want F ${FOLLOW.F}+, off ${FOLLOW.shifted} at most, AUC ${FOLLOW.auc}+${heard ? '' : '. Reported only: the film has not opted into hearing'}`));
  }

  // ---- Direction: docs/DIRECTION.md section 8, over a walk of this film. Reads whatever rows ran above; moves nothing they measured, because it's last.
  if (want('direction') && !WORLD) {
    const t = directionSelfTest();
    t.lines.forEach(l => log(l));
    add(badIf(!t.ok, 'Direction self-test', `${t.caught}/${t.total} fake films caught, ${t.alone} failing their own row alone`, t.ok ? '' : t.lines.filter(l => /MISSES|should/.test(l)).join(' | ')));
    const raw = await page.eval(collect, WALK_SIZE), d = JSON.parse(raw);
    save(`${song}.walk.json`, raw);
    const gestureFile = join(ROOT, 'lab-out', 'judge', `${song}.gestures.json`);
    if (process.env.BASELINE === 'save' && !d.sheet && !d.gestures.some(G => G.hitS != null)) {
      mkdirSync(dirname(gestureFile), { recursive: true });
      writeFileSync(gestureFile, JSON.stringify({ song, seed: d.seed, saved: new Date().toISOString(), lines: fingerprintOf(d) }));
      log(`saved gestures ${gestureFile}`);
    }
    const hashFile = process.env.HASH_REPORT || join(out, 'hash-report.json');
    const others = walksIn(out).map(x => ({ song: x.song, perMin: measureDirection(x.d).perMin }));
    const { rows: table, m } = directionRows(d, { baseline: existsSync(gestureFile) ? JSON.parse(readFileSync(gestureFile, 'utf8')) : null, hashReport: existsSync(hashFile) ? JSON.parse(readFileSync(hashFile, 'utf8')) : null, songs: others, existing: rows });
    table.forEach(r => add(r));
    extra.direction = { live: m.live, hits: m.hits.map(h => ({ t: r2(h.t), size: r2(h.size), show: r2(h.show), kind: h.kind })), top: m.top, patterns: m.patterns, perMin: r2(m.perMin) };
  }

  const counts = { PASS: 0, FAIL: 0, PENDING: 0 }; rows.forEach(r => counts[r.status]++);
  log(`\n${song}: ${counts.PASS} pass, ${counts.FAIL} fail, ${counts.PENDING} pending`);
  const text = [`judge ${song}, ${await page.eval('location.pathname')}, ${new Date().toISOString()}`, `${info.duration.toFixed(1)} s, family ${info.family}, seed ${info.seed}, ${info.gestures.length} gestures`, '',
    ...rows.map(r => `${r.status.padEnd(7)} ${r.test}: ${r.value}\n        ${r.detail}`),
    '', ...(extra.calibration?.lines?.length ? ['calibration on the stretches known bad at bf1a9d2 (' + (extra.calibration.ok ? 'as expected' : 'NOT as expected') + '):', ...extra.calibration.lines] : [])].join('\n');
  save(`judge-${song}.txt`, text + '\n');
  save(`judge-${song}.json`, JSON.stringify({ song, info: { ...info, pulses: undefined }, rows, extra, counts, errors: pageErrors() }));

  // One row per flagged stretch, so it can be looked at. Done last: it moves the clock.
  const flagged = rows.flatMap(r => (r.spans || []).map(s => ({ ...s, test: r.test }))).slice(0, 40);
  if (flagged.length && film) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    const url = await page.eval(async flagged => {
      const T = window.trippee, COLS = 7, TW = 200, TH = 112;
      const c = document.createElement('canvas'); c.width = COLS * TW; c.height = flagged.length * TH; const g = c.getContext('2d'); g.font = '11px monospace';
      app.manual = true;
      flagged.forEach((f, r) => { for (let k = 0; k < COLS; k++) { const t = f.t0 + (f.t1 - f.t0) * k / (COLS - 1); T.seek(t); g.drawImage(T.canvas, k * TW, r * TH, TW - 1, TH - 1); g.fillStyle = '#000'; g.fillRect(k * TW, r * TH, k ? 44 : 190, 14); g.fillStyle = '#f33'; g.fillText(k ? t.toFixed(1) : `${t.toFixed(1)} ${f.test} ${String(f.why).slice(0, 20)}`, k * TW + 2, r * TH + 11); } });
      return c.toDataURL('image/jpeg', 0.82);
    }, flagged);
    save(`${song}.flags.jpg`, url);
  }
  if (pageErrors().length) log('page errors', pageErrors().slice(0, 6));
};

// ---------------------------------------------------------------- pure measures used above
export function breathOf(w, lag, breaths) {
  const fps = w.fps, x = Float64Array.from(w.white), n = x.length;
  // take out anything slower than a couple of breaths
  const R = Math.round(lag * 2 * fps); let s = 0; const ma = new Float64Array(n), pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { s += x[i]; pre[i + 1] = s; }
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - R), b = Math.min(n, i + R + 1); ma[i] = (pre[b] - pre[a]) / (b - a); }
  const y = x.map((v, i) => v - ma[i]);
  const auto = L => { let ab = 0, aa = 0, bb = 0; for (let i = 0; i + L < n; i++) { ab += y[i] * y[i + L]; aa += y[i] * y[i]; bb += y[i + L] * y[i + L]; } return ab / Math.sqrt(aa * bb + 1e-12); };
  const lo = Math.round(3 * fps), hi = Math.min(Math.round(20 * fps), n >> 1), r = [];
  for (let L = lo; L <= hi; L++) r.push(auto(L));
  const at = L => r[L - lo] ?? 0, target = Math.round(lag * fps), reach = Math.max(2, Math.round(Math.max(0.08 * lag, 0.2) * fps));
  let bestNear = -2, bestNearL = target;
  for (let L = Math.max(lo + 1, target - reach); L <= Math.min(hi - 1, target + reach); L++) if (at(L) > bestNear) { bestNear = at(L); bestNearL = L; }
  const localMax = at(bestNearL) >= at(bestNearL - 1) && at(bestNearL) >= at(bestNearL + 1);
  let best = -2, bestL = lo; for (let L = lo; L <= hi; L++) if (at(L) > best) { best = at(L); bestL = L; }
  const peak = localMax && bestNear > 0.05 && bestNear >= 0.6 * best;
  // attacks: 10-90% rise time of the white in the half breath before each breath, on a lightly smoothed curve
  let attack = null;
  if (breaths?.length) {
    const rises = [];
    const sm = y.map((_, i) => { let c = 0, v = 0; for (let k = Math.max(0, i - 1); k <= Math.min(n - 1, i + 1); k++) { v += y[k]; c++; } return v / c; });
    for (const b of breaths) {
      const i1 = Math.round(b * fps), i0 = Math.max(0, i1 - Math.round(lag * fps / 2)); if (i1 >= n || i1 <= i0 + 2) continue;
      let lo2 = 1e9, hi2 = -1e9; for (let i = i0; i <= i1; i++) { lo2 = Math.min(lo2, sm[i]); hi2 = Math.max(hi2, sm[i]); }
      if (hi2 - lo2 < 0.01) continue;
      let a = i1, c = i1; for (let i = i1; i >= i0; i--) { if (sm[i] >= lo2 + 0.9 * (hi2 - lo2)) c = i; if (sm[i] >= lo2 + 0.1 * (hi2 - lo2)) a = i; else break; }
      rises.push(Math.max(c - a, 0) / fps);
    }
    if (rises.length) attack = r2(median(rises));
  }
  return { r: r2(bestNear), peak, best: r2(best), bestLag: r2(bestL / fps), attack };
}

// Does the white rise and fall with the breaths? The picture's mean white, folded on the breath grid, against the same thing folded on grids of other periods. The autocorrelation can't see this under
// the big slow swings of each pattern's long move and each flight; a fold can, because only something locked to the grid survives it. Returns the range of the fold, where it peaks (0 is on the breath, as a share of a breath),
// p, the share of other periods that fold as well, and how long the fold takes to rise from 10% to 90% on its way to that peak, in seconds.
export function breathFold({ fps, white }, grid, breath, mask = null) {
  const n = white.length, R = Math.round(breath * fps), pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + white[i];
  const y = white.map((v, i) => v - (pre[Math.min(n, i + R + 1)] - pre[Math.max(0, i - R)]) / (Math.min(n, i + R + 1) - Math.max(0, i - R)));
  const B = 24;
  // Too little of the film to go on, and it's the whole film
  let kept = 0; if (mask) for (let i = 0; i < n; i++) if (mask(i)) kept++;
  const only = mask && kept >= 0.15 * n ? mask : null;
  const fold = (t0, P) => { const s = new Float64Array(B), c = new Float64Array(B); for (let i = 0; i < n; i++) { if (only && !only(i)) continue; const ph = ((i / fps - t0) / P % 1 + 1) % 1, b = Math.min(B - 1, Math.floor(ph * B)); s[b] += y[i]; c[b]++; } const m = Array.from(s, (v, b) => v / Math.max(c[b], 1)); return { m, range: Math.max(...m) - Math.min(...m), peak: m.indexOf(Math.max(...m)) / B }; };
  const t0 = grid[0], P = grid.length > 1 ? (grid[grid.length - 1] - grid[0]) / (grid.length - 1) : breath, real = fold(t0, P);
  let more = 0, tries = 0;
  for (let f = 0.7; f <= 1.45; f += 0.005) { if (Math.abs(f - 1) < 0.04) continue; tries++; if (fold(t0, P * f).range >= real.range) more++; }
  const top = real.m.indexOf(Math.max(...real.m)), lo = Math.min(...real.m), at = k => real.m[((k % B) + B) % B];
  let a = 0, c = 0;
  for (let k = 1; k < B; k++) { const v = (at(top - k) - lo) / Math.max(real.range, 1e-6); if (v >= 0.9) c = k; if (v >= 0.1) a = k; else break; }
  return { range: +real.range.toFixed(3), peak: +real.peak.toFixed(2), p: +(more / tries).toFixed(3), attack: +(((a - c) / B) * P).toFixed(2), share: +((only ? kept : n) / n).toFixed(2) };
}

export function waveOf({ inner, outer, times, c, pulses, fall }) {
  const FPS = 60, idx = t => { let lo = 0, hi = times.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (times[m] < t) lo = m + 1; else hi = m; } return Math.abs(times[lo] - t) < 0.02 ? lo : -1; };
  const detrend = s => { const R = 90, o = new Float64Array(s.length); for (let i = 0; i < s.length; i++) { let v = 0, k = 0; for (let j = Math.max(0, i - R); j <= Math.min(s.length - 1, i + R); j += 6) { v += s[j]; k++; } o[i] = s[i] - v / k; } return o; };
  const A = detrend(inner), B = detrend(outer);
  const locked = (s, beats, lo, hi) => { const m = new Float64Array(hi - lo + 1), n = new Float64Array(hi - lo + 1); for (const b of beats) { const i = idx(b); if (i < 0) continue; for (let l = lo; l <= hi; l++) { const k = i + l; if (k >= 0 && k < s.length) { m[l - lo] += s[k]; n[l - lo]++; } } } return m.map((v, i) => v / Math.max(n[i], 1)); };
  const peakOf = (m, lo) => { let best = -1e9, at = 0, sum = 0; m.forEach((v, i) => { sum += v; if (v > best) { best = v; at = i + lo; } }); return { lag: at, height: best - sum / m.length }; };
  const expected = fall ? -Math.round(0.35 * 0.9 ** 4 * FPS) : -Math.round(0.9 / (c || 0.6) * FPS);     // fall: hearing 6, the rings accelerate in, s = .35 r^4
  const iLo = -30, iHi = 30, oLo = expected - 45, oHi = expected + 45;
  const inP = peakOf(locked(A, pulses, iLo, iHi), iLo), outP = peakOf(locked(B, pulses, oLo, oHi), oLo);
  // the same measure with the beats wherever they like inside the section, 200 times
  let seed = 271828; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  // Inside the sections the real beats came from, which aren't next to each other: the gap between them has nothing in it, so a beat falling there can't score, and that would flatter the real ones.
  const secs = []; let s0 = times[0];
  for (let i = 1; i <= times.length; i++) if (i === times.length || times[i] - times[i - 1] > 0.1) { secs.push([s0 + 2.5, times[i - 1] - 2.5]); s0 = times[i]; }
  const room = secs.reduce((v, [a, b]) => v + Math.max(0, b - a), 0);
  const fakeBeat = () => { let u = rnd() * room; for (const [a, b] of secs) { const w = Math.max(0, b - a); if (u <= w) return a + u; u -= w; } return secs[0][0]; };
  let beat = 0;
  for (let p = 0; p < 200; p++) {
    const fake = pulses.map(fakeBeat);
    if (peakOf(locked(A, fake, iLo, iHi), iLo).height >= inP.height) beat++;
  }
  const p = (beat + 1) / 201;
  // The outer ring only has to be seen coming: it's a wide soft band with a long tail, whose peak measures a few frames later than its front, on a journey of over a second. It's the inner one that has to land on the beat, and to within a frame or so.
  return { ok: Math.abs(inP.lag) <= 3 && Math.abs(outP.lag - expected) <= 10 && p < 0.01, inner: inP, outer: outP, expected, p: +p.toFixed(4) };
}

export function balanceOf({ times, E }, lag) {
  const n = times.length, totals = E.map(c => c.reduce((s, v) => s + v, 0)), sum = totals.reduce((s, v) => s + v, 0) || 1;
  const shares = totals.map(v => v / sum);
  const leads = []; const per = Math.max(1, Math.round(lag / Math.max(times[1] - times[0], 0.01)));
  for (let i = 0; i < n; i += per) {
    const s = E.map(c => c.slice(i, i + per).reduce((x, y) => x + y, 0)), tot = s.reduce((x, y) => x + y, 0);
    if (tot > 0) leads.push(Math.max(...s) / tot);
  }
  const leadShare = leads.filter(v => v >= 0.5).length / Math.max(leads.length, 1);
  return { pulse: shares[0], shares, leadShare, breaths: leads.length };
}

// ---------------------------------------------------------------- STAGE=direction: docs/DIRECTION.md section 8
// Pure, over a walk: what tests/shotlist.mjs's collect returned, kept as <song>.walk.json. Its measures, not new ones. A hit is G.peak.hit, a Fall or Iris hit, or an entry in score.sheet.hits.
// Until a film has a sheet or a G.peak these rows are PENDING and read the film's changes as its hits, which is what "today" means in the plan. There's deliberately no row saying louder must change more: a good cut fails it (section 2).
export const DIR = { reads: 0.7, barLines: 0.35, top: 0.8, onHit: 0.6, prepared: 0.5, rank: 0.5, gaps: 0.5, morphs: 0.4, refrain: 0.6, oneIdea: 0.6, energyR: 0.4, energyLoud: 1.3, pace: 2, ambient: 0.9, letIn: 0.3, noFiner: 1.05 };
const EXISTING = ['Flash', 'Jerk on pulses', 'One colour', 'Noise', 'Stasis'];
const whole = x => Math.round(x * 100);

export const fingerprintOf = d => d.gestures.map(G => [G.t0, G.t1, G.id, G.morph, G.xform ?? '-'].map(v => (typeof v === 'number' ? +v.toFixed(3) : v)).join(' '));

export function spearman(x, y) {
  const ranks = a => { const o = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]), r = new Array(a.length); for (let i = 0; i < o.length;) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2; i = j + 1; } return r; };
  return x.length < 3 ? NaN : pearson(ranks(x), ranks(y));
}

// Every number the rows need.
export function measureDirection(d) {
  const { range, avg, edge, shows, peakOf } = measures(d);
  const s = d.samples, real = d.gestures.slice(0, -1), { beat, bar, dur } = d, n = s.diff.length;
  const changes = changesOf(d), changeT = changes.map(c => c.s), J = jumpsOf(d);
  const live = !!d.sheet || d.gestures.some(G => G.hitS != null);
  const barAt = t => { let k = 0; for (let i = 0; i < d.bars.length && d.bars[i] <= t + 1e-3; i++) k = i; return k; };
  const biggest = Math.max(0, ...J.score.map(x => x.s));
  const sizeAt = t => (Math.abs(t - d.climax) <= bar ? biggest + 1 : Math.max(...[-1, 0, 1].map(k => J.score[barAt(t) + k]?.s ?? 0)));

  // ---- the hits
  const fromChange = c => ({ t: c.s, sm: c.sm, end: c.end, kind: c.type });
  const hits = (live ? changes.filter(c => c.G?.hitS != null || c.G?.into === 'fall' || c.G?.xform === 'iris') : changes).map(fromChange);
  for (const h of d.sheet?.hits ?? []) {
    const on = hits.find(x => Math.abs(x.t - h.t) <= EXACT);
    if (on) on.size = h.size ?? on.size; else hits.push({ t: h.t, size: h.size, sm: null, end: h.t, kind: h.depth ?? 'sheet' });
  }
  hits.sort((a, b) => a.t - b.t);
  for (const h of hits) { h.size ??= sizeAt(h.t); h.show = shows(h.t); }

  // ---- Reads, Not everywhere
  const reads = meanOf(hits.map(h => (h.show >= VIS ? 1 : 0))), barLines = barLinesShow(d, shows);

  // ---- Top three: from the song, so the sheet can't pick easy ones. Where a jump is exactly is a judgement within a bar or so, so it may show at either its raw or its refined bar.
  const top = J.peaks.slice(0, 3).map(p => ({ t: p.t, s: p.s, sign: p.sign, show: Math.max(shows(p.t), shows(d.bars[p.i0])), onChange: Math.abs(nearest(changeT, p.t)?.d ?? 99) <= beat }));
  const topShows = meanOf(top.map(x => (x.show >= VIS ? 1 : 0))), topOnChange = top.filter(x => x.onChange).length;

  // ---- Peak on the hit. A hit with no transformation of its own looks 2 bars either way.
  const landed = hits.map(h => (h.sm != null ? peakOf(h.sm, h.end, h.t) : live ? peakOf(h.t - 2 * bar, h.t + 2 * bar - 0.25, h.t) : null)).filter(Boolean);
  const onHit = meanOf(landed.map(k => (Math.abs(k.peakOff) <= beat ? 1 : 0)));

  // ---- Climax. The arrival from the wander and the tail after the last gesture aren't the film's doing, so they can't win.
  let atClimax = 0, elsewhere = 0, elsewhereAt = 0, before = 0;
  for (let i = 0; i < n; i += 3) {
    const t = i / WALK_FPS;
    if (s.hand?.[i] || t > real.at(-1).s1) continue;
    const v = shows(t);
    if (Math.abs(t - d.climax) <= bar) atClimax = Math.max(atClimax, v);
    else { if (v > elsewhere) { elsewhere = v; elsewhereAt = t; } if (t < d.climax) before = Math.max(before, v); }
  }

  // ---- Prepared and Rank
  const ranked = [...hits].sort((a, b) => b.size - a.size).slice(0, 3);
  const motion = (a, b) => meanOf(range(a, b).map(i => s.diff[i]));
  const prep = ranked.map(h => ({ t: h.t, before: motion(h.t - 2 * bar, h.t), after: motion(h.t, h.t + 2 * bar) }));
  // Pooled over the three: one hit with next to nothing after it can't decide the row by itself.
  const prepared = meanOf(prep.map(x => x.before)) / Math.max(meanOf(prep.map(x => x.after)), 0.01), rank = spearman(hits.map(h => h.size), hits.map(h => h.show));

  // ---- Not a metronome
  const gapsOf = hits.slice(1).map((h, i) => h.t - hits[i].t), gapMean = meanOf(gapsOf);
  const gaps = gapMean ? Math.sqrt(meanOf(gapsOf.map(v => (v - gapMean) ** 2))) / gapMean : 0;
  const ms = real.map(G => G.morph).filter(Boolean), medM = medOf(ms);
  const morphs = ms.length ? ms.filter(v => Math.abs(v - medM) <= 0.15 * medM).length / ms.length : 0;

  // ---- Refrain, by time, and by shotlist's count of sections
  const patsIn = x => real.filter(G => Math.min(G.s1, x.t1) - Math.max(G.s0, x.t0) >= 0.3 * (x.t1 - x.t0)).map(G => G.id);
  let worn = 0, back = 0, wearing = 0;
  const backs = d.segments.filter(x => x.visit > 0);
  for (const x of backs) {
    const first = patsIn(d.segments.find(y => y.label === x.label && y.visit === 0));
    back += x.t1 - x.t0;
    for (const G of real) if (first.includes(G.id)) worn += Math.max(0, Math.min(G.s1, x.t1) - Math.max(G.s0, x.t0));
    if (patsIn(x).some(id => first.includes(id))) wearing++;
  }

  // ---- One idea
  const lenAll = real.at(-1).s1, fam = {}, way = {};
  for (const G of real) fam[G.fam] = (fam[G.fam] || 0) + G.s1 - G.s0;
  const ways = changes.filter(c => c.G).map(c => c.G.into ?? '?');
  for (const k of ways) way[k] = (way[k] || 0) + 1;
  const best = o => Object.entries(o).sort((a, b) => b[1] - a[1])[0] ?? ['-', 0];
  const topFam = best(fam), topWay = best(way);

  // ---- Energy on the eye: the same breaths as shotlist's table
  const breaths = d.phrases.filter(r => range(r.a, r.b).length && r.b - r.a >= 0.5 * d.breath.seconds).map(r => ({ E: avg('E', r.a, r.b), edge: medOf(range(r.a, r.b).map(i => edge[i])) }));
  const byE = [...breaths].sort((a, b) => a.E - b.E), third = Math.max(1, Math.floor(byE.length / 3));
  const energyR = pearson(breaths.map(x => x.E), breaths.map(x => x.edge));
  const quietEdge = meanOf(byE.slice(0, third).map(x => x.edge)), loudEdge = meanOf(byE.slice(-third).map(x => x.edge));

  // ---- Loud is bold: the sheet's ride if it has one
  const rideBars = rideOf(d, J), levelAt = d.sheet?.ride?.length ? t => { let l = d.sheet.ride[0][1]; for (const [a, v] of d.sheet.ride) if (a <= t) l = v; return l; } : t => rideBars[barAt(t)];
  // How fine it gets, not how fine it usually is: the complaint is a loud passage of tiny dots, and a median doesn't see one. Section 4 sets this limit as a "most".
  const fineAt = want => pctOf(range(0, dur).filter(i => want(levelAt(i / WALK_FPS))).map(i => s.fine[i]), 0.9);
  const fine1 = fineAt(l => l === 1), fine34 = fineAt(l => l >= 3);

  return {
    live, hits, reads, barLines, top, topShows, topOnChange, onHit, landed: landed.length, atClimax, elsewhere, elsewhereAt, before, climax: d.climax, bar, prep, prepared, rank, gaps, morphs, morphCount: ms.length,
    refrain: back ? worn / back : 0, wearing, backs: backs.length, fam: topFam[0], famShare: topFam[1] / lenAll, way: topWay[0], wayShare: ways.length ? topWay[1] / ways.length : 0, energyR, loudOverQuiet: loudEdge / Math.max(quietEdge, 1e-6), loudEdge, quietEdge,
    fine1, fine34, ambientLow: meanOf(s.amb.map(v => (v < DIR.ambient ? 1 : 0))), perMin: changes.length / lenAll * 60, changes: changes.length, patterns: new Set(real.map(G => G.id)).size,
  };
}

const dirRow = (live, test, ok, value, detail) => {
  const r = row(test, live ? (ok ? 'PASS' : 'FAIL') : 'PENDING', value, live ? detail : `${detail}. Reported only, no sheet or G.peak on this film: as it stands it would ${ok ? 'pass' : 'fail'}`);
  r.ok = !!ok;
  return r;
};

export function identityRow(d, m, { baseline = null, hashReport = null } = {}) {
  const flagged = d.directing && Object.values(d.directing).some(Boolean);
  if (m.live || flagged) return row('Identity', 'PENDING', 'not the plain film', 'this film has a sheet, a G.peak or a directing flag on; identity is a test of the film with them off');
  if (!baseline) return row('Identity', 'PENDING', 'no baseline', 'keep one with BASELINE=save STAGE=direction, taken from a commit');
  const now = fingerprintOf(d), was = baseline.lines, at = now.findIndex((l, i) => l !== was[i]), differ = at >= 0 || now.length !== was.length;
  const pixels = hashReport ? (hashReport.differ?.length ?? 0) + (hashReport.missing?.length ?? 0) : null;
  return badIf(differ || pixels, 'Identity', `${now.length} gestures ${differ ? 'DIFFER' : 'identical'}, pixels ${pixels == null ? 'not read' : pixels ? `${pixels} differ` : 'identical'}`, `against the gestures saved ${baseline.saved}.${differ ? ` First difference, gesture ${at}: was "${was[at]}", now "${now[at]}".` : ''} ${pixels == null ? 'Pixels are tests/hash.mjs, a step of tests/all.mjs; HASH_REPORT=<its hash-report.json> reads one here' : ''}`);
}

export function paceRow(list, live) {
  if (list.length < 4) return row('Pace across songs', 'PENDING', `${list.length} of 4 songs`, 'needs the four walks in one --out');
  const v = list.map(x => x.perMin), ratio = Math.max(...v) / Math.max(Math.min(...v), 1e-6);
  return dirRow(live, 'Pace across songs', ratio >= DIR.pace, `most over least ${r2(ratio)}`, `changes a minute: ${list.map(x => `${x.song} ${r2(x.perMin)}`).join(', ')}. Want ${DIR.pace}+`);
}

export function existingRow(rows) {
  const here = EXISTING.map(t => rows.find(r => r.test === t)).filter(Boolean), bad = here.filter(r => r.status === 'FAIL');
  const name = 'Flash, Jerk, One colour, Noise, Stasis';
  if (!here.length) return row(name, 'PENDING', 'not run here', 'STAGE=film,windows,direction runs them on this film');
  return badIf(bad.length, name, `${here.length} of ${EXISTING.length} ran, ${bad.length} failed`, bad.map(r => `${r.test}: ${r.value}`).join('; '));
}

export function neverLostRow(d) {
  const by = d.sheet?.by, unseen = (d.refused ?? []).filter(r => !r.seen);
  if (d.refused == null || by !== 'cut') return row('Never lost', 'PENDING', d.refused?.length ? `${d.refused.length} refused, not a cut` : 'not a cut', 'read on a shipped cut: score.sheet.by "cut". An entry with seen: true is one the owner has seen');
  return badIf(unseen.length, 'Never lost', `${unseen.length} refused and unseen`, unseen.slice(0, 8).map(r => `${r.t ?? '?'} ${r.what ?? ''}: ${r.why ?? ''}`).join('; '));
}

// The table, on one film.
export function directionRows(d, { baseline = null, hashReport = null, songs = [], existing = [] } = {}) {
  const m = measureDirection(d), L = m.live, none = !m.hits.length;
  const list = (a, f) => a.map(f).join(', ');
  const rows = [
    identityRow(d, m, { baseline, hashReport }),
    dirRow(L && !none, 'Reads', m.reads >= DIR.reads, `${whole(m.reads)}% of ${m.hits.length} hits show`, `want ${whole(DIR.reads)}%+. Shows ${VIS}x or more: ${list(m.hits.filter(h => h.show >= VIS), h => `${r2(h.t)} (${r2(h.show)})`) || 'none'}`),
    dirRow(L, 'Not everywhere', m.barLines < DIR.barLines, `${whole(m.barLines)}% of bar lines show`, `want under ${whole(DIR.barLines)}%: a zoom on every bar is why this row exists`),
    dirRow(L, 'Top three', m.topShows >= DIR.top, `${m.top.filter(x => x.show >= VIS).length} of ${m.top.length} show, ${m.topOnChange} on a change`, `want ${whole(DIR.top)}%. The song's biggest jumps, not chosen by the sheet: ${list(m.top, x => `${r2(x.t)} ${x.sign > 0 ? '+' : '-'}${r2(x.s)} shows ${r2(x.show)}`)}`),
    dirRow(L && m.landed > 0, 'Peak on the hit', m.onHit >= DIR.onHit, `${whole(m.onHit)}% of ${m.landed}`, `fastest frame within a beat of the hit, want ${whole(DIR.onHit)}%+`),
    dirRow(L, 'Climax', m.atClimax >= m.elsewhere && m.atClimax >= m.before, `${r2(m.atClimax)} at ${r2(m.climax)} s, biggest elsewhere ${r2(m.elsewhere)} at ${r2(m.elsewhereAt)} s`, `want the film's biggest show within a bar of the climax, nothing before it bigger (biggest before: ${r2(m.before)})`),
    dirRow(L && !none, 'Prepared', m.prepared <= DIR.prepared, `${r2(m.prepared)}`, `motion in the 2 bars before the top 3 hits over the 2 after, want ${DIR.prepared} at most. Before and after: ${list(m.prep, x => `${r2(x.t)} s ${r2(x.before)}, ${r2(x.after)}`)}`),
    dirRow(L && m.hits.length >= 4, 'Rank', m.rank >= DIR.rank, `r ${r2(m.rank)}`, `Spearman of hit size against show over ${m.hits.length} hits, want ${DIR.rank}+`),
    dirRow(L && m.hits.length >= 3, 'Not a metronome', m.gaps >= DIR.gaps && m.morphs < DIR.morphs, `gaps ${r2(m.gaps)}, ${whole(m.morphs)}% of morphs near the median`, `spread (sd/mean) of the gaps between hits, want ${DIR.gaps}+; morphs within 15% of the median, want under ${whole(DIR.morphs)}%`),
    dirRow(L && m.backs > 0, 'Refrain', m.refrain >= DIR.refrain, `${whole(m.refrain)}% of the time, ${m.wearing} of ${m.backs} sections`, `time in returning sections wearing a pattern their first visit wore, want ${whole(DIR.refrain)}%+`),
    dirRow(L, 'One idea', Math.max(m.famShare, m.wayShare) >= DIR.oneIdea, `family ${m.fam} ${whole(m.famShare)}%, way ${m.way} ${whole(m.wayShare)}%`, `top family's share of the time, or top way of changing's share of the changes, want ${whole(DIR.oneIdea)}%+`),
    dirRow(L, 'Energy on the eye', m.energyR >= DIR.energyR && m.loudOverQuiet >= DIR.energyLoud, `r ${r2(m.energyR)}, loud over quiet ${r2(m.loudOverQuiet)}`, `r of energy with edge speed, want ${DIR.energyR}+; loud third's edge speed ${r2(m.loudEdge)} over quiet third's ${r2(m.quietEdge)}, want ${DIR.energyLoud}+`),
    paceRow(songs, L),
    dirRow(L && Number.isFinite(m.fine1) && m.fine1 > 0, 'Loud is bold', m.fine34 <= m.fine1 * DIR.noFiner, `fineness ${r2(m.fine34)} at ride 3-4, ${r2(m.fine1)} at ride 1`, `its finest stretches (p90), want no finer at ride 3-4 than at ride 1, within ${whole(DIR.noFiner - 1)}%`),
    dirRow(L, "The song's let in", m.ambientLow < DIR.letIn, `${whole(m.ambientLow)}% of the film`, `score.ambient under ${DIR.ambient}, want under ${whole(DIR.letIn)}%`),
    neverLostRow(d),
    existingRow(existing),
  ];
  return { rows, m };
}

// ---- A film made of numbers. It passes every row, and each change below makes it fail one. Two rows have two conditions, so they get one change each.
function fakeWalk(change = () => {}) {
  const P = {
    dur: 240, bar: 2, beat: 0.5, climax: 200, plain: false,
    sections: [[0, 32, 'A', 0, 0.3], [32, 72, 'B', 0, 0.6], [72, 112, 'A', 1, 0.2], [112, 152, 'B', 1, 0.95], [152, 200, 'C', 0, 0.5], [200, 240, 'B', 2, 1]],
    shots: [{ id: 'a.x', fam: 'a', into: 'plain', hit: 32, morph: 9 }, { id: 'b.y', fam: 'b', into: 'plain', hit: 72, morph: 12 }, { id: 'a.x', fam: 'a', into: 'plain', hit: 112, morph: 16 }, { id: 'b.y', fam: 'b', into: 'plain', hit: 152, morph: 22 }, { id: 'c.z', fam: 'c', into: 'plain', hit: 200, morph: 30 }, { id: 'b.y', fam: 'b' }],
    hits: [[32, 0.4], [36, 0.2], [72, 0.6], [112, 0.9], [128, 0.1], [152, 0.8], [200, 1]].map(([t, size]) => ({ t, size, surge: t === 200 ? 30 : 2 + 12 * size * size })),
    extra: [], everyBar: false, early: false, busyBefore: false,
    edge: E => 2 + 8 * E, fine: l => (l >= 3 ? 6 : l === 1 ? 8 : 7), amb: () => 1, refused: [],
  };
  change(P);
  const n = Math.floor(P.dur * WALK_FPS) + 1, at = i => i / WALK_FPS, section = t => P.sections.find(x => t >= x[0] && t < x[1]) ?? P.sections.at(-1);
  const ride = [[0, 1], [32, 3], [72, 1], [112, 3], [152, 2], [200, 4]], level = t => ride.reduce((l, [a, v]) => (a <= t ? v : l), 1);
  const diff = new Array(n).fill(1), put = (t, h, fall = 1.5) => { for (let i = Math.ceil(t * WALK_FPS); i < n && at(i) < t + 4; i++) diff[i] = Math.max(diff[i], 1 + (h - 1) * Math.exp(-(at(i) - t) / fall)); };
  for (const h of P.hits) if (h.surge) { for (let i = Math.max(0, Math.ceil((h.t - 4) * WALK_FPS)); i < h.t * WALK_FPS; i++) diff[i] = P.busyBefore && h.size >= 0.8 ? 4 : 0.45; }
  for (const h of P.hits) if (h.surge) put(h.t, h.surge);
  if (P.early) for (const h of P.hits) if (h.surge && h.t !== P.climax && P.shots.some(x => x.hit === h.t)) put(h.t - 5, h.surge * 1.5, 0.3);
  if (P.everyBar) for (let t = 0; t < P.dur; t += P.bar) put(t, 3, 0.3);
  for (const x of P.extra) put(x.t, x.h);
  const E = Array.from({ length: n }, (_, i) => section(at(i))[4]), e = 20 / 320 + 12 / 180;
  let t = 0;
  const gestures = P.shots.map((x, i) => {
    const s1 = x.hit != null ? x.hit + 0.25 * x.morph : 236, sm = x.hit != null ? s1 - x.morph : null, G = { i, t0: t, t1: s1, s0: t, s1, sm, hitS: x.hit != null && !P.plain && !x.notHit ? x.hit : null, id: x.id, fam: x.fam, look: 'l', morph: x.morph ?? 0, into: x.into ?? null, xform: null, label: null, visit: 0 };
    t = s1;
    return G;
  });
  gestures.push({ i: gestures.length, t0: t, t1: P.dur, s0: t, s1: P.dur, sm: null, hitS: null, id: P.shots.at(-1).id, fam: P.shots.at(-1).fam, look: 'l', morph: 0, into: null, xform: null, label: null, visit: 0 });
  const bars = Array.from({ length: P.dur / P.bar }, (_, i) => i * P.bar), louds = bars.map(b => section(b)[4]);
  const phrases = []; for (let a = 0; a < P.dur; a += 8) phrases.push({ a, b: a + 8 });
  return {
    dur: P.dur, bar: P.bar, beat: P.beat, climax: P.climax, bars, breath: { seconds: 8 }, cast: [], arrivals: [], phrases, gestures,
    segments: P.sections.map(([a, b, label, visit]) => ({ t0: a, t1: b, label, visit })),
    per: { loud: louds, bright: louds, bass: louds, perc: louds, voiced: louds.map(() => 0.5) },
    directing: P.plain ? { peak: false, sheet: false } : { peak: true, sheet: true }, sheet: P.plain ? null : { by: 'cut', hits: P.hits.map(({ t, size }) => ({ t, size })), ride }, refused: P.plain ? null : P.refused,
    samples: { diff, flips: E.map(v => P.edge(v) * e * 320 / (WALK_FPS * 100)), nx: new Array(n).fill(20), ny: new Array(n).fill(12), E, amb: Array.from({ length: n }, (_, i) => P.amb(at(i))), fine: Array.from({ length: n }, (_, i) => P.fine(level(at(i)))), hand: new Array(n).fill(0) },
  };
}
const FOUR = rates => rates.map((perMin, i) => ({ song: `song${i}`, perMin }));
const GOOD_RATES = [1.4, 2, 3, 3.7], OK_EXISTING = EXISTING.map(test => ({ test, status: 'PASS', value: '' }));
const FAKES = [
  ['Reads', 'hits nothing shows on, the top three still moving', { film: P => { for (const h of P.hits) if (![112, 152, 200].includes(h.t)) h.surge = 0; } }],
  ['Not everywhere', 'a zoom on every bar', { film: P => { P.everyBar = true; } }],
  ['Top three', 'a sheet that picks easy moments and misses the biggest jumps', { film: P => { for (const h of P.hits) if (h.t === 112 || h.t === 152) h.t += 6; for (const x of P.shots) if (x.hit === 112 || x.hit === 152) x.hit += 6; } }],
  ['Peak on the hit', 'each transformation at its fastest 5 s early', { film: P => { P.early = true; } }],
  ['Climax', 'something bigger at 60 s', { film: P => { P.extra.push({ t: 60, h: 40 }); } }],
  ['Prepared', 'busy right up to the top hits', { film: P => { P.busyBefore = true; } }],
  ['Rank', 'the smallest hits show most', { film: P => { const by = new Map([[0.1, 8], [0.2, 6], [0.4, 4], [0.6, 3], [0.8, 2.5], [0.9, 2.2]]); for (const h of P.hits) h.surge = by.get(h.size) ?? h.surge; } }],
  ['Not a metronome', 'hits exactly 40 s apart', { film: P => { P.hits = [40, 80, 120, 160, 200].map((t, i) => ({ t, size: 0.5 + i / 10, surge: 2 + 12 * (0.5 + i / 10) ** 2 })); P.extra.push({ t: 112, h: 7 }, { t: 152, h: 7 }); P.shots.forEach((x, i) => { if (x.hit != null) x.hit = 40 * (i + 1); }); } }],
  ['Not a metronome', 'every morph the same length', { film: P => { for (const x of P.shots) if (x.morph) x.morph = 12; } }],
  ['Refrain', 'nothing comes back wearing what it wore', { film: P => { P.shots[2].id = 'a.other'; P.shots[3].id = 'b.other'; P.shots[5].id = 'b.third'; } }],
  ['One idea', 'a tour: every family, every way of changing', { film: P => { P.shots.forEach((x, i) => { x.fam = `f${i}`; if (x.into) x.into = `kind${i}`; }); } }],
  ['Energy on the eye', 'slower when it is louder', { film: P => { P.edge = E => 10 - 8 * E; } }],
  ['Energy on the eye', 'follows the song, but barely faster', { film: P => { P.edge = E => 6 + 0.5 * E; } }],
  ['Pace across songs', 'the same film for every song', { songs: FOUR([2.4, 2.5, 2.6, 2.8]) }],
  ['Loud is bold', 'finest at its loudest', { film: P => { P.fine = l => (l >= 3 ? 14 : 8); } }],
  ["The song's let in", 'the song turned down for half the film', { film: P => { P.amb = t => (t < 120 ? 0.5 : 1); } }],
  ['Never lost', 'a hero the guard removed, unseen', { film: P => { P.refused = [{ t: 200, what: 'iris', why: 'the guard removed it' }]; } }],
  ['Flash, Jerk, One colour, Noise, Stasis', 'a flash', { existing: OK_EXISTING.map(r => (r.test === 'Flash' ? { ...r, status: 'FAIL', value: '1 whole' } : r)) }],
];

// Does every row catch its fake film? Returns lines to print, and whether all is well.
export function directionSelfTest() {
  const lines = []; let ok = true;
  const run = ({ film, songs = FOUR(GOOD_RATES), existing = OK_EXISTING, baseline = null } = {}) => directionRows(fakeWalk(film), { songs, existing, baseline }).rows;
  const good = run(), notGood = good.filter(r => r.status !== 'PASS' && r.test !== 'Identity');
  if (notGood.length) { ok = false; lines.push(`  the good film should pass every row, and: ${notGood.map(r => `${r.test} ${r.status} ${r.value}`).join('; ')}`); } else lines.push(`  a good film passes all ${good.length - 1} rows Identity isn't asked about`);
  let caught = 0, alone = 0;
  for (const [test, name, how] of FAKES) {
    const rows = run(how), it = rows.find(r => r.test === test), others = rows.filter(r => r.test !== test && r.test !== 'Identity' && r.status !== 'PASS').map(r => r.test);
    if (it.status === 'FAIL') caught++; else ok = false;
    if (!others.length) alone++;
    lines.push(`  ${it.status === 'FAIL' ? 'catches' : 'MISSES '} ${test}, ${name}: ${it.value}${others.length ? ` (also: ${others.join(', ')})` : ''}`);
  }
  // Identity runs on the plain film
  const plain = fakeWalk(P => { P.plain = true; }), saved = { lines: fingerprintOf(plain), saved: 'now' }, id = b => directionRows(plain, { baseline: b }).rows.find(r => r.test === 'Identity');
  const same = id(saved), moved = id({ ...saved, lines: saved.lines.map((l, i) => (i === 2 ? l.replace('a.x', 'a.moved') : l)) });
  const hashed = directionRows(plain, { baseline: saved, hashReport: { differ: [{}], missing: [] } }).rows.find(r => r.test === 'Identity');
  if (same.status !== 'PASS' || moved.status !== 'FAIL' || hashed.status !== 'FAIL') ok = false; else caught++;
  lines.push(`  ${moved.status === 'FAIL' ? 'catches' : 'MISSES '} Identity, a gesture that changed: ${moved.value}. Unchanged: ${same.status}. Pixels that changed: ${hashed.status}`);
  // Nothing fails before there's a sheet or a peak, and everything still reports
  const today = directionRows(plain, { songs: FOUR(GOOD_RATES), baseline: saved }).rows.filter(r => r.test !== 'Identity' && !r.test.startsWith('Flash') && r.status !== 'PENDING');
  if (today.length) { ok = false; lines.push(`  ${today.map(r => r.test).join(', ')} should be PENDING with no sheet and no peak`); } else lines.push('  with no sheet and no peak the rows report and stay PENDING');
  return { lines, ok, caught, total: FAKES.length + 1, alone, fakes: FAKES.length };
}

// What docs/DIRECTION.md section 8 says of today's film, seed 7, to check a walk of it against. Single numbers are section 1's and shotlist's per song; pairs are ranges.
export const PLAN_TODAY = {
  reads: { what: 'Reads, %', get: m => whole(m.reads), ppp: 24, wildflower: 22, disclosure: 33, mgmt: 22, slack: 1 },
  barLines: { what: 'Not everywhere, %', get: m => whole(m.barLines), ppp: 27, wildflower: 22, disclosure: 29, mgmt: 33, slack: 1 },
  topOnChange: { what: 'Top three, on a change', get: m => m.topOnChange, range: [0, 1] },
  onHit: { what: 'Peak on the hit, %', get: m => whole(m.onHit), ppp: 7, wildflower: 17, disclosure: 29, mgmt: 0, slack: 1 },
  climax: { what: 'Climax, biggest?', get: m => (m.atClimax >= m.elsewhere ? 1 : 0), range: [0, 0] },
  prepared: { what: 'Prepared', get: m => r2(m.prepared), range: [0.6, 0.9] },
  morphs: { what: 'Morphs near median, %', get: m => whole(m.morphs), ppp: 67, wildflower: 43, disclosure: 50, mgmt: 56, slack: 1 },
  wearing: { what: 'Refrain, sections', get: m => m.wearing, ppp: 2, wildflower: 1, disclosure: 0, mgmt: 0, slack: 0 },
  backs: { what: 'Refrain, of', get: m => m.backs, ppp: 7, wildflower: 3, disclosure: 4, mgmt: 3, slack: 0 },
  family: { what: 'One idea, top family %', get: m => whole(m.famShare), range: [23, 34] },
  energyR: { what: 'Energy on the eye, r', get: m => r2(m.energyR), ppp: 0.39, wildflower: -0.11, disclosure: 0.18, mgmt: 0.38, slack: 0.01 },
  letIn: { what: "The song's let in, %", get: m => whole(m.ambientLow), range: [54, 63] },
  perMin: { what: 'Changes a minute', get: m => r2(m.perMin), ppp: 2.84, wildflower: 2.5, disclosure: 2.44, mgmt: 2.36, slack: 0.01 },
};
export function todayTable(perSong) {
  const songs = Object.keys(perSong), lines = [`  ${''.padEnd(26)}${songs.map(s => s.padStart(12)).join('')}   the plan`]; let same = 0, total = 0;
  for (const P of Object.values(PLAN_TODAY)) {
    const cells = songs.map(s => {
      const v = P.get(perSong[s]), ok = P.range ? v >= P.range[0] && v <= P.range[1] : P[s] == null || Math.abs(v - P[s]) <= P.slack;
      total++; if (ok) same++;
      return `${v}${ok ? '' : ' !'}`.padStart(12);
    });
    lines.push(`  ${P.what.padEnd(26)}${cells.join('')}   ${P.range ? P.range.join(' to ') : songs.map(s => P[s]).join(', ')}`);
  }
  lines.push(`  ${same} of ${total} numbers as the plan has them; ! marks the others. Loud is bold, for the plan's "MGMT finest at its loudest": ${songs.map(s => `${s} ${r2(perSong[s].fine34)} at ride 3-4, ${r2(perSong[s].fine1)} at ride 1`).join('; ')}`);
  return lines;
}

// Every walk in a folder, for Pace.
export function walksIn(dir) {
  return readdirSync(dir).filter(f => f.endsWith('.walk.json')).map(f => { const d = JSON.parse(readFileSync(join(dir, f), 'utf8')); return { song: f.replace('.walk.json', ''), d }; });
}

// Run on its own, with no browser, against a saved capture
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === '--direction-selftest') {
  const t = directionSelfTest();
  t.lines.forEach(l => console.log(l));
  console.log(`${t.ok ? 'PASS' : 'FAIL'} direction self-test: ${t.caught}/${t.total} fake films caught, ${t.alone} of ${t.fakes} failing their own row alone`);
  process.exit(t.ok ? 0 : 1);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === '--direction') {
  const walks = walksIn(process.argv[3]), measured = walks.map(x => ({ ...x, m: measureDirection(x.d) })), songs = measured.map(x => ({ song: x.song, perMin: x.m.perMin }));
  for (const { song, d } of walks) {
    const gestureFile = join(ROOT, 'lab-out', 'judge', `${song}.gestures.json`);
    const { rows } = directionRows(d, { songs, baseline: existsSync(gestureFile) ? JSON.parse(readFileSync(gestureFile, 'utf8')) : null });
    console.log(`\n${song}`);
    for (const r of rows) console.log(`${r.status.padEnd(7)} ${r.test}: ${r.value}\n        ${String(r.detail).slice(0, 400)}`);
  }
  if (!measured.some(x => x.m.live)) { console.log('\nAgainst what the plan says of today:'); todayTable(Object.fromEntries(measured.map(x => [x.song, x.m]))).forEach(l => console.log(l)); }
  process.exit(0);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node tests/judge.mjs <capture.json>'); process.exit(2); }
  const w = JSON.parse(readFileSync(file, 'utf8')), song = basename(file).replace(/\.\w+$/, '');
  w.name = song;
  const winFile = file.replace(/\.json$/, '.windows.json');
  const windows = existsSync(winFile) ? JSON.parse(readFileSync(winFile, 'utf8')) : [];
  const recFile = file.replace(/\.json$/, '.rec.json');
  const { rows } = judgeFilm(w, { windows, rec: existsSync(recFile) ? JSON.parse(readFileSync(recFile, 'utf8')) : null });
  for (const r of rows) console.log(`${r.status.padEnd(7)} ${r.test}: ${r.value}\n        ${String(r.detail).slice(0, 900)}`);
  const cal = calibration(song, rows);
  cal.lines.forEach(l => console.log(l));
}
