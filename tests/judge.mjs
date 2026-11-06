// The judge: watches a whole film and says what's wrong with it, by the table in docs/NEXT.md section 4.
//
//   SONG=media/ppp.mp3 node tools/lab.mjs tests/judge.mjs --out lab-out/<lane>
//   STAGE=selftest,film,windows,purity,boot,variety,closure,countdown,wave,balance,beyond,rest   (default: all of them)
//   node tests/judge.mjs lab-out/<lane>/ppp.json          no browser: judges a saved capture again, for changing a threshold
//   BASELINE=save ...                                     keeps this run as lab-out/judge/<song>.json: what "no worse than baseline" means
//   SEED=7 FAMILY=checks                                  another take
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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { watch, analyse } from '../tools/look.mjs';

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
  restDiff: 0.05, restBack: 0.5, restDb: 12, restMax: 4,
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
export function noise(w, rec) {
  const greyOut = w.grey.map(g => g > TH.grey), edgeOut = w.edges.map(e => e > TH.edges);
  return mergeSpans([
    ...runsOf(greyOut, w.time, TH.noiseSecs).map(s => ({ ...s, why: 'grey' })),
    ...runsOf(edgeOut, w.time, TH.noiseSecs).map(s => ({ ...s, why: 'edges' })),
    ...(rec?.fine?.length ? runsOf(rec.fine.map(f => f.filter(v => v > TH.fine).length >= TH.fineTiles), w.time, TH.noiseSecs).map(s => ({ ...s, why: 'fine tiles' })) : []),
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
export function judgeFilm(w, { rests = [], baseline = null, windows = [], rec = null } = {}) {
  const rows = [];
  const a = analyse(w);
  const oc = oneColour(w, rests, rec), nz = noise(w, rec), st = stasis(w, rests);
  rows.push(badIf(oc.length, 'One colour', `${oc.length} stretches`, fmtSpans(oc), oc));
  rows.push(badIf(nz.length, 'Noise', `${nz.length} stretches`, fmtSpans(nz), nz));
  rows.push(badIf(st.length, 'Stasis', `${st.length} stretches`, fmtSpans(st), st));
  let flashW = a.flashesPerSecondWholeFrame, flashT = a.flashesPerSecondAnyTile, flashAt = '';
  for (const x of windows) { const b = analyse(x); if (b.flashesPerSecondWholeFrame > flashW || b.flashesPerSecondAnyTile > flashT) flashAt = ` (worst near ${x.time[x.time.length >> 1]} s)`; flashW = Math.max(flashW, b.flashesPerSecondWholeFrame); flashT = Math.max(flashT, b.flashesPerSecondAnyTile); }
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
    rec.fine.push(fineOf());
    const [a, d] = flatOf(); rec.area.push(+a.toFixed(3)); rec.disc.push(+d.toFixed(3));
    if (++n % 60 === 0 && gl.getError()) rec.glErrors++;
  };
  app.onFrame.push(on);
})()`;
const STOP_RECORD = `(()=>{const i=app.onFrame.indexOf(window.__recOn);if(i>=0)app.onFrame.splice(i,1);return window.__rec})()`;

export default async ({ page, log, save, out, sleep }) => {
  const stages = (process.env.STAGE || 'selftest,film,windows,purity,boot,variety,closure,countdown,wave,balance,beyond,rest').split(',');
  const want = s => stages.includes(s);
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
  if (process.env.SEED || process.env.FAMILY) await page.eval(`app.song.rebuild({${process.env.SEED ? `seed:${+process.env.SEED},` : ''}${process.env.FAMILY ? `family:${JSON.stringify(process.env.FAMILY)}` : ''}})`);
  await page.eval(`app.song.pause();app.ui.song.show(false);app.manual=true;app.governor.enabled=false;app.R.drawScale=1;app.t=0;`);
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
    const w = await watch(page, save, { name: song, seconds: info.duration, fps: 12, cols, rows: rowsWanted, setup: `app.t=0;${RECORD}` });
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
      const w = await watch(page, noSave, { name: 'w', seconds: 3, fps: 60, cols: 2, rows: 1, setup: `app.t=${m.t - 1.5}` });
      windows.push({ ...w, what: m.what, mark: m.t });
    }
    log(`${marks.length} windows at 60 fps in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    save(`${song}.windows.json`, JSON.stringify(windows.map(w => ({ what: w.what, mark: w.mark, fps: w.fps, diff: w.diff, mean: w.mean, time: w.time, tiles: w.tiles, white: w.white, grey: w.grey, edges: w.edges, cpuMs: w.cpuMs, size: w.size }))));
  }

  // ---- the film-wide table
  const baseFile = join(ROOT, 'lab-out', 'judge', `${song}.json`);
  const baseline = existsSync(baseFile) ? JSON.parse(readFileSync(baseFile, 'utf8')) : null;
  let judged = null;
  if (film) {
    judged = judgeFilm(film, { rests, baseline, windows, rec });
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

  // ---- Purity: the block at 100 times, in order against any order, each on a fresh take of the same film.
  if (want('purity')) {
    const pr = await page.eval(async ({ duration, rests }) => {
      const T = window.trippee, song = app.song;
      const times = []; for (let i = 0; i < 100; i++) times.push(+((i + 0.37) * duration / 100).toFixed(3));
      for (const r of rests) times.push(r.a - 0.2, (r.a + r.b) / 2, r.b + 0.3, r.b + 1.5, r.b + 4);
      times.sort((a, b) => a - b);
      const take = async () => {
        const before = song.rehearsal;
        song.rebuild({});
        for (let i = 0; i < 200 && song.rehearsal === before; i++) await new Promise(r => setTimeout(r, 100));
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
    if (!heroes.length) add(row('Variety', 'PENDING', `plan kinds: ${planKinds.join(' ') || '?'}`, 'no gesture has moves or a transformation yet'));
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
          // A step: it had been holding still for half a second, then gains at least .03 within a second. A film that merely approaches its final frame has no steps.
          let steps = 0, lastAt = -1e9;
          for (let i = 6; i + 12 < c.length; i++) if (Math.abs(c[i] - c[i - 6]) < 0.01 && c[i + 12] - c[i] >= 0.03 && i - lastAt >= 6) { steps++; lastAt = i + 12; }
          out.push({ t: l.t, span: +span.toFixed(1), closure: +closure.toFixed(3), steps, c0: c[0], c1: c.at(-1), series: c });
        }
        return out;
      }, { locks });
      if (want('closure')) {
        const bad = res.filter(r => r.closure >= TH.closure);
        add(badIf(bad.length, 'Closure', `worst ${Math.max(...res.map(r => r.closure))}/255 over ${res.length} locks`, `limit ${TH.closure}/255; ${res.map(r => `${r2(r.t)} s ${r.closure}`).join(', ')}. Per-band arrival isn't measured here: look at the slices`));
      }
      if (want('countdown')) {
        const long = res.filter(r => r.span >= 8), bad = long.filter(r => r.steps < 5 || r.c1 - r.c0 < 0.2);
        if (!long.length) add(row('Countdown reads', 'PENDING', '', 'locks exist, none run up over at least 8 s'));
        else add(badIf(bad.length, 'Countdown reads', `${long.map(r => r.steps).join(', ')} steps`, `correlation with the final frame, ${long.map(r => `${r2(r.t)} s from ${r2(r.c0)} to ${r2(r.c1)} over ${r.span} s`).join(', ')}`));
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

  // ---- Breath: does the picture's white rise and fall at the breath's period?
  if (want('film') || film) {
    const lagHint = info.M?.breath?.t?.length > 1 ? median(info.M.breath.t.slice(1).map((t, i) => t - info.M.breath.t[i])) : BREATH_HINT[song];
    if (film && lagHint) {
      const b = breathOf(film, lagHint, info.M?.breath?.t);
      extra.breath = b;
      const measured = !!info.M?.breath?.t?.length;
      const good = b.peak && (!measured || b.attack == null || b.attack >= 0.5);
      add(row('Breath', measured ? (good ? 'PASS' : 'FAIL') : 'PENDING', `r ${b.r} at ${r2(lagHint)} s`, `autocorrelation of white: ${b.peak ? 'a peak' : 'no peak'} at the lag${b.bestLag ? `, strongest at ${b.bestLag} s (r ${b.best})` : ''}${b.attack != null ? `, attacks ${b.attack} s` : ''}${measured ? '' : '; breath from the prototype, understand() has not landed'}`));
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
        return { inner, outer, times, c: cs.length ? cs[cs.length >> 1] : 0.6, pulses: pulses.filter(p => sections.some(s => p > s + 2.5 && p < s + 23)) };
      }, { pulses: info.pulses, duration: info.duration });
      const w = waveOf(res);
      add(badIf(!w.ok, 'Wave', `inner ${w.inner.lag} frames, outer lead ${w.outer.lag} (want ${w.expected}), p ${w.p}`, `${res.pulses.length} beats. Inner peak within 1 frame of the beat, outer lead r/c within 2, permuted beats p < .01`));
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

export function waveOf({ inner, outer, times, c, pulses }) {
  const FPS = 60, idx = t => { let lo = 0, hi = times.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (times[m] < t) lo = m + 1; else hi = m; } return Math.abs(times[lo] - t) < 0.02 ? lo : -1; };
  const detrend = s => { const R = 90, o = new Float64Array(s.length); for (let i = 0; i < s.length; i++) { let v = 0, k = 0; for (let j = Math.max(0, i - R); j <= Math.min(s.length - 1, i + R); j += 6) { v += s[j]; k++; } o[i] = s[i] - v / k; } return o; };
  const A = detrend(inner), B = detrend(outer);
  const locked = (s, beats, lo, hi) => { const m = new Float64Array(hi - lo + 1), n = new Float64Array(hi - lo + 1); for (const b of beats) { const i = idx(b); if (i < 0) continue; for (let l = lo; l <= hi; l++) { const k = i + l; if (k >= 0 && k < s.length) { m[l - lo] += s[k]; n[l - lo]++; } } } return m.map((v, i) => v / Math.max(n[i], 1)); };
  const peakOf = (m, lo) => { let best = -1e9, at = 0, sum = 0; m.forEach((v, i) => { sum += v; if (v > best) { best = v; at = i + lo; } }); return { lag: at, height: best - sum / m.length }; };
  const expected = -Math.round(0.9 / (c || 0.6) * FPS);
  const iLo = -30, iHi = 30, oLo = expected - 45, oHi = expected + 45;
  const inP = peakOf(locked(A, pulses, iLo, iHi), iLo), outP = peakOf(locked(B, pulses, oLo, oHi), oLo);
  // the same measure with the beats wherever they like inside the section, 200 times
  let seed = 271828; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const t0 = times[0], t1 = times[times.length - 1]; let beat = 0;
  for (let p = 0; p < 200; p++) {
    const fake = pulses.map(() => t0 + 2.5 + rnd() * (t1 - t0 - 5));
    if (peakOf(locked(A, fake, iLo, iHi), iLo).height >= inP.height) beat++;
  }
  const p = (beat + 1) / 201;
  return { ok: Math.abs(inP.lag) <= 1 && Math.abs(outP.lag - expected) <= 2 && p < 0.01, inner: inP, outer: outP, expected, p: +p.toFixed(4) };
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

// Run on its own, with no browser, against a saved capture
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
