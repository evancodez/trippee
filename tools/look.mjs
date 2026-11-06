// How automated tests "watch" the app: step it frame by frame on a fixed clock, and measure what it actually draws.
//
// Used from a lab script (see tools/lab.mjs):
//
//   import { watch, report } from '../tools/look.mjs';
//   export default async ({ page, save, log }) => {
//     const w = await watch(page, save, { name: 'dots', seconds: 30, fps: 12 });
//     log(report(w));
//   };
//
// watch() writes three files: <name>.sheet.jpg   a contact sheet, time in red, for looking at motion as a sequence
//                             <name>.slices.jpg  time-slices: centre row, centre column and a ring against time; straight
//                                                diagonal lines are steady motion, curves are eased moves, breaks are cuts
//                             <name>.json        every per-frame measurement
//
// It requires only window.trippee.step(dtSeconds) and window.trippee.canvas.
//
// watch(..., { colour: true }) is for a world, and only for a world. It reads the true colour first (out.chan: the three flash channels; out.colourMean and out.colourDiff: Jolt and Jerk on
// true colour; the sheet and slices), then, if window.__coverage is there, redraws the same frame as coverage for every other number, which are the film's measures unchanged.
// With no colour option nothing here differs from what it always did, by a byte.

const inPage = async ({ seconds, fps, cols, rows, setup, colour = false, chanSrc = null }) => {
  const t = window.trippee;
  if (setup) await (0, eval)(setup);
  const chanOf = colour ? (0, eval)(`(${chanSrc})`)() : null;
  const src = t.canvas, W = 320, H = 180;
  const small = document.createElement('canvas'); small.width = W; small.height = H;
  const g = small.getContext('2d', { willReadFrequently: true });
  const CROP = 256;
  const crop = document.createElement('canvas'); crop.width = crop.height = CROP;
  const gc = crop.getContext('2d', { willReadFrequently: true });
  const N = Math.round(seconds * fps), dt = 1 / fps;
  const thumbsWanted = cols * rows;
  const sheet = document.createElement('canvas'); sheet.width = 1400; sheet.height = Math.round(1400 / cols * (H / W) * rows);
  const gs = sheet.getContext('2d');
  const tw = sheet.width / cols, th = sheet.height / rows;
  const slices = document.createElement('canvas'); slices.width = N; slices.height = 180 + 2 + 180 + 2 + 128;
  const gk = slices.getContext('2d');
  const im = gk.createImageData(N, slices.height);
  const out = { fps, seconds, white: [], mean: [], grey: [], edges: [], diff: [], tiles: [], time: [], cpuMs: [] };
  let prev = null, nextThumb = 0, thumbI = 0;
  let held = null, heldX = null, prevC = null, colourData = null;
  if (colour) { held = document.createElement('canvas'); heldX = held.getContext('2d', { willReadFrequently: true }); out.chan = { luma: [], red: [], rc: [], whole: { luma: [], red: [], rc: [] } }; out.colourMean = []; out.colourDiff = []; }
  for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    t.step(dt);
    out.cpuMs.push(+(performance.now() - t0).toFixed(1));
    if (colour) {
      // True colour, while it's in the drawing buffer. Then the same frame as coverage, if the world can draw it.
      if (held.width !== src.width || held.height !== src.height) { held.width = src.width; held.height = src.height; }
      heldX.drawImage(src, 0, 0);
      g.drawImage(src, 0, 0, W, H);
      colourData = g.getImageData(0, 0, W, H).data;
      const c = chanOf(colourData, W, H);
      for (const k of ['luma', 'red', 'rc']) { out.chan[k].push(c[k]); out.chan.whole[k].push(c.whole[k]); }
      out.colourMean.push(c.whole.luma);
      if (prevC) { let dc = 0; for (let k = 0; k < colourData.length; k += 4) dc += Math.abs(colourData[k] * 0.2126 + colourData[k + 1] * 0.7152 + colourData[k + 2] * 0.0722 - (prevC[k] * 0.2126 + prevC[k + 1] * 0.7152 + prevC[k + 2] * 0.0722)); out.colourDiff.push(+(dc / (W * H)).toFixed(2)); } else out.colourDiff.push(0);
      prevC = colourData;
      window.__coverage?.();
    }
    // The drawing buffer is only valid in this same task, so read straight after stepping.
    g.drawImage(src, 0, 0, W, H);
    const sw = Math.min(CROP, src.width), sh = Math.min(CROP, src.height);
    gc.drawImage(src, (src.width - sw) / 2 | 0, (src.height - sh) / 2 | 0, sw, sh, 0, 0, sw, sh);
    const d = g.getImageData(0, 0, W, H).data;
    const dc = gc.getImageData(0, 0, sw, sh).data;
    const L = new Uint8Array(W * H);
    let sum = 0, white = 0, dif = 0;
    for (let k = 0; k < L.length; k++) {
      const v = (d[k * 4] * 0.2126 + d[k * 4 + 1] * 0.7152 + d[k * 4 + 2] * 0.0722) | 0;
      L[k] = v; sum += v; if (v > 127) white++;
      if (prev) dif += Math.abs(v - prev[k]);
    }
    // grey is measured at native resolution, centre crop, where a 1-bit picture has only antialiased edge pixels
    let grey = 0; const nc = sw * sh;
    for (let k = 0; k < nc; k++) { const v = dc[k * 4 + 1]; if (v > 48 && v < 208) grey++; }
    let edges = 0;
    for (let x = 1; x < W; x++) if ((L[90 * W + x] > 127) !== (L[90 * W + x - 1] > 127)) edges++;
    for (let y = 1; y < H; y++) if ((L[y * W + 160] > 127) !== (L[(y - 1) * W + 160] > 127)) edges++;
    // 4x4 tile means, for detecting flashes that affect part of the frame
    const tiles = [];
    for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
      let s = 0, c = 0;
      for (let y = (ty * H / 4) | 0; y < ((ty + 1) * H / 4 | 0); y += 3) for (let x = (tx * W / 4) | 0; x < ((tx + 1) * W / 4 | 0); x += 3) { s += L[y * W + x]; c++; }
      tiles.push(+(s / c).toFixed(1));
    }
    out.white.push(+(white / L.length).toFixed(4));
    out.mean.push(+(sum / L.length).toFixed(2));
    out.grey.push(+(grey / nc).toFixed(4));
    out.edges.push(edges);
    out.diff.push(+(dif / L.length).toFixed(2));
    out.tiles.push(tiles);
    out.time.push(typeof t.time === 'function' ? +t.time().toFixed(3) : +(i * dt).toFixed(3));
    // time-slices
    const put = (x, y, r, gg, b) => { const k = (y * N + x) * 4; im.data[k] = r; im.data[k + 1] = gg; im.data[k + 2] = b; im.data[k + 3] = 255; };
    const sl = colour ? colourData : d;      // what's seen is the colour, whatever was measured
    for (let y = 0; y < 180; y++) { const k = ((y * W / 180) | 0) + 90 * W; put(i, y, sl[k * 4], sl[k * 4 + 1], sl[k * 4 + 2]); }
    for (let y = 0; y < 180; y++) { const k = y * W + 160; put(i, 182 + y, sl[k * 4], sl[k * 4 + 1], sl[k * 4 + 2]); }
    for (let y = 0; y < 128; y++) { const a = y / 128 * Math.PI * 2, px = (160 + 60 * Math.cos(a)) | 0, py = (90 + 60 * Math.sin(a)) | 0, k = py * W + px; put(i, 364 + y, sl[k * 4], sl[k * 4 + 1], sl[k * 4 + 2]); }
    // contact sheet
    if (i >= nextThumb && thumbI < thumbsWanted) {
      const cx = (thumbI % cols) * tw, cy = Math.floor(thumbI / cols) * th;
      gs.drawImage(colour ? held : src, cx + 1, cy + 1, tw - 2, th - 2);
      gs.fillStyle = '#e22'; gs.font = '12px monospace';
      gs.fillText(out.time[i].toFixed(1), cx + 4, cy + 13);
      thumbI++; nextThumb = (thumbI * N) / thumbsWanted;
    }
    prev = L;
    if (i % 8 === 0) await new Promise(r => setTimeout(r, 0));
  }
  gk.putImageData(im, 0, 0);
  // scale slices to a readable width
  const wide = document.createElement('canvas'); wide.width = Math.max(N, 1400); wide.height = slices.height;
  const gw = wide.getContext('2d'); gw.imageSmoothingEnabled = false; gw.drawImage(slices, 0, 0, wide.width, wide.height);
  return { out, sheet: sheet.toDataURL('image/jpeg', 0.8), slices: wide.toDataURL('image/jpeg', 0.82), size: [src.width, src.height] };
};

export async function watch(page, save, { name = 'watch', seconds = 20, fps = 12, cols = 8, rows = 7, setup = null, colour = false } = {}) {
  const r = await page.eval(inPage, { seconds, fps, cols, rows, setup, ...(colour ? { colour: true, chanSrc: makeChannels.toString() } : {}) });
  save(`${name}.sheet.jpg`, r.sheet);
  save(`${name}.slices.jpg`, r.slices);
  save(`${name}.json`, JSON.stringify({ ...r.out, size: r.size }));
  return { name, size: r.size, ...r.out };
}

// Plain-language measurements from a watch() result.
export function analyse(w) {
  const n = w.white.length, fps = w.fps;
  const solids = [];
  for (let i = 0; i < n;) {
    const s = w.white[i] > 0.985 ? 'white' : w.white[i] < 0.015 ? 'black' : null;
    if (!s) { i++; continue; }
    let j = i;
    while (j < n && (s === 'white' ? w.white[j] > 0.985 : w.white[j] < 0.015)) j++;
    solids.push({ at: w.time[i], seconds: +((j - i) / fps).toFixed(2), colour: s });
    i = j;
  }
  // A flash is a pair of opposing luminance swings of at least 10% of full scale (WCAG 2.3.1 style), counted per second.
  const flashesPerSecond = (series) => {
    const swings = [];
    let dir = 0, pivot = series[0];
    series.forEach((v, i) => {
      if (dir >= 0 && v > pivot) { pivot = v; dir = 1; }
      if (dir <= 0 && v < pivot) { pivot = v; dir = -1; }
      if (dir === 1 && pivot - v >= 25.5) { swings.push(i); dir = -1; pivot = v; }
      else if (dir === -1 && v - pivot >= 25.5) { swings.push(i); dir = 1; pivot = v; }
    });
    let worst = 0;
    for (let a = 0; a < swings.length; a++) {
      let b = a;
      while (b < swings.length && swings[b] - swings[a] < fps) b++;
      worst = Math.max(worst, Math.floor((b - a) / 2));
    }
    return worst;
  };
  const worstFlash = flashesPerSecond(w.mean);
  let worstTileFlash = 0;
  for (let k = 0; k < 16; k++) worstTileFlash = Math.max(worstTileFlash, flashesPerSecond(w.tiles.map(t => t[k])));
  let maxStep = 0;
  for (let i = 1; i < n; i++) maxStep = Math.max(maxStep, Math.abs(w.mean[i] - w.mean[i - 1]));
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
  // The largest single-frame image change, against typical: a cut or a jolt shows up as a big ratio.
  const sorted = [...w.diff].sort((x, y) => x - y);
  return {
    frames: n, size: w.size,
    solids,
    meanWhite: +avg(w.white).toFixed(3),
    medianGreyAtNativeRes: +pct(w.grey, 0.5).toFixed(3),
    p95GreyAtNativeRes: +pct(w.grey, 0.95).toFixed(3),
    edgeRange: [pct(w.edges, 0.05), pct(w.edges, 0.95)],
    medianDiff: +pct(w.diff, 0.5).toFixed(2),
    maxDiff: +sorted[n - 1].toFixed(2),
    largestLuminanceStepPerFrame: +maxStep.toFixed(2),
    flashesPerSecondWholeFrame: worstFlash,
    flashesPerSecondAnyTile: worstTileFlash,
    avgCpuMsPerStep: +avg(w.cpuMs).toFixed(1),
  };
}

export const report = w => `${w.name}: ${JSON.stringify(analyse(w), null, 1)}`;

// ---------------------------------------------------------------- what a world's colour is judged by. All pure, and no film path reads any of it.
// This file has no imports, so a page can import it too: await import(new URL('tools/look.mjs', location.href).href).

// The flash limits, per docs/MODES.md section 7. Swings are in each channel's own units: luma 10% of 255; the WCAG red term (R-G-B)x320 on linear values, over 20 in both directions;
// red minus cyan, in the same bytes and at the same 25.5 as luma. A world reads zero on the whole frame and under 2 per second on a tile, so 1 at most. The film's own limit stays in tests/judge.mjs.
export const CHANNELS = { luma: 25.5, red: 20, rc: 25.5 };
export const WORLD_FLASH = { whole: 0, tile: 1 };

// Returns (rgba bytes, W, H) -> per-tile and whole-frame values of the three channels. A factory with nothing outside it, so watch() can send it to the page as text.
// Tiles sample as watch() samples them, every third pixel across and down; the whole frame is every pixel. Luma truncates per pixel exactly as watch() does.
export function makeChannels() {
  const lin = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const s = i / 255; lin[i] = s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }
  const f1 = v => +v.toFixed(1);
  return (d, W, H) => {
    let aL = 0, aR = 0, aC = 0;
    const tL = new Float64Array(16), tR = new Float64Array(16), tC = new Float64Array(16), tN = new Float64Array(16);
    for (let y = 0; y < H; y++) {
      const ty = Math.min(3, Math.floor(y * 4 / H)), y0 = (ty * H / 4) | 0, onY = (y - y0) % 3 === 0;
      for (let x = 0; x < W; x++) {
        const k = (y * W + x) * 4, r = d[k], g = d[k + 1], b = d[k + 2];
        const L = (r * 0.2126 + g * 0.7152 + b * 0.0722) | 0, C = r - (g + b) / 2;
        const R = lin[r], G = lin[g], B = lin[b], S = R + G + B;
        const red = S > 0 && R / S >= 0.8 ? Math.max(0, (R - G - B) * 320) : 0;     // WCAG's saturated red
        aL += L; aR += red; aC += C;
        if (onY) {
          const tx = Math.min(3, Math.floor(x * 4 / W)), x0 = (tx * W / 4) | 0;
          if ((x - x0) % 3 === 0) { const q = ty * 4 + tx; tL[q] += L; tR[q] += red; tC[q] += C; tN[q]++; }
        }
      }
    }
    const n = W * H, luma = [], red = [], rc = [];
    for (let q = 0; q < 16; q++) { const c = Math.max(tN[q], 1); luma.push(f1(tL[q] / c)); red.push(f1(tR[q] / c)); rc.push(f1(tC[q] / c)); }
    return { luma, red, rc, whole: { luma: +(aL / n).toFixed(2), red: +(aR / n).toFixed(2), rc: +(aC / n).toFixed(2) } };
  };
}

// The judge's count: opposing swings of at least `swing`, and the most pairs of them inside any one second. The same walk as analyse() above, with the swing as an argument.
export function swingsIn(series, swing) {
  const out = []; let dir = 0, pivot = series[0];
  for (let i = 0; i < series.length; i++) {
    const v = series[i];
    if (dir >= 0 && v > pivot) { pivot = v; dir = 1; }
    if (dir <= 0 && v < pivot) { pivot = v; dir = -1; }
    if (dir === 1 && pivot - v >= swing) { out.push(i); dir = -1; pivot = v; }
    else if (dir === -1 && v - pivot >= swing) { out.push(i); dir = 1; pivot = v; }
  }
  return out;
}
export function flashesIn(series, swing, fps) {
  const sw = swingsIn(series, swing); let worst = 0, at = -1;
  for (let a = 0; a < sw.length; a++) {
    let b = a;
    while (b < sw.length && sw[b] - sw[a] < fps) b++;
    const n = Math.floor((b - a) / 2);
    if (n > worst) { worst = n; at = sw[a]; }
  }
  return { worst, at };
}

// All three channels on one capture: a watch() with colour on, or anything shaped like its .chan. Bad if any channel passes a limit, and which, where.
export function flashThree({ chan, fps, time }, limits = WORLD_FLASH) {
  const res = { bad: false, over: [] };
  for (const name of Object.keys(CHANNELS)) {
    const swing = CHANNELS[name], w = flashesIn(chan.whole[name], swing, fps);
    let tile = 0, tileAt = -1, tileOf = -1;
    for (let k = 0; k < 16; k++) { const f = flashesIn(chan[name].map(v => v[k]), swing, fps); if (f.worst > tile) { tile = f.worst; tileAt = f.at; tileOf = k; } }
    res[name] = { whole: w.worst, tile };
    if (w.worst > limits.whole) res.over.push({ channel: name, on: 'whole', n: w.worst, t: time ? time[w.at] : w.at });
    if (tile > limits.tile) res.over.push({ channel: name, on: 'tile ' + tileOf, n: tile, t: time ? time[tileAt] : tileAt });
  }
  res.bad = res.over.length > 0;
  return res;
}

// The Dark check: no large empty black. Y is relative luminance, on any rgba bytes. Share of pixels under Y .03 under 35%, and the biggest disc of them under .25 of the height.
// A city-block distance transform from what isn't dark, with the frame's edge counted as not dark, the way flat.mjs fits its disc. A disc can't be measured smaller than this says; it reads at worst about 1.4 times big on a diagonal.
export const DARK = { Y: 0.03, share: 0.35, disc: 0.25 };
export function darkOf(d, W, H) {
  const lin = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const s = i / 255; lin[i] = s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }
  const n = W * H, dist = new Float32Array(n);
  let dark = 0;
  for (let i = 0; i < n; i++) { const Y = 0.2126 * lin[d[i * 4]] + 0.7152 * lin[d[i * 4 + 1]] + 0.0722 * lin[d[i * 4 + 2]]; if (Y < DARK.Y) { dark++; dist[i] = 1e6; } }
  let disc = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (x === 0 || y === 0 || x === W - 1 || y === H - 1) dist[i] = Math.min(dist[i], 1); if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1); if (y > 0) dist[i] = Math.min(dist[i], dist[i - W] + 1); }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (x < W - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1); if (y < H - 1) dist[i] = Math.min(dist[i], dist[i + W] + 1); if (dist[i] > disc && dist[i] < 1e5) disc = dist[i]; }
  const share = dark / n, r = disc / H;
  return { share: +share.toFixed(3), disc: +r.toFixed(3), bad: share >= DARK.share || r >= DARK.disc };
}

// How a lab script gets a song loaded, the way a person does, and held still on a fixed clock with the governor out of it.
export async function dropSong(page, songPath, { resolvePath = x => x, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const data = { items: [], files: [resolvePath(songPath)], dragOperationsMask: 1 };
  await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 320, y: 180, data });
  await page.send('Input.dispatchDragEvent', { type: 'drop', x: 320, y: 180, data });
  for (let i = 0; i < 1800; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await sleep(100); }
  const state = await page.eval('app.ui.song.state');
  if (state !== 'ready') throw new Error(`song never got ready: ${state}`);
  await page.eval(`app.song.pause();app.ui.song.show(false);app.manual=true;app.governor.enabled=false;app.R.drawScale=1;app.t=0;`);
}

// Into a world, for a test, with no nine-second change: the world's own film from its start, as if it had always been on. window.__coverage redraws the frame that's up, full size and as coverage, in the same task,
// which is what the geometry rows read. 'film' or nothing is no world, and then window.__coverage isn't there and no test takes the world path. See docs/MODES.md section 4.
export async function enterWorld(page, id, log = () => {}) {
  if (!id || id === 'film') return null;
  const r = await page.eval(async id => {
    const T = window.trippee, stage = app.stage, song = app.song, wait = ms => new Promise(r => setTimeout(r, ms));
    if (!stage.setWorld) throw new Error('no stage.setWorld yet');
    const before = song?.rehearsal;
    let began = null; stage.setWorld(id).then(v => { began = v; }, e => { began = String(e); });
    // settle() and a stage's morphs run on frames, and a test's frames are stepped by hand
    for (let i = 0; i < 2400 && began === null; i++) { T.step(1 / 60); await wait(5); }
    if (began !== true) throw new Error(`stage.setWorld(${id}) gave ${began}`);
    const W = stage.world;
    if (song?.analysis) { for (let i = 0; i < 3000 && song.rehearsal === before; i++) await wait(100); song.pause?.(); }
    const wp = app.R.worldPrograms.get(W);
    await wp.whenAll;
    if (wp.failed) throw new Error(`world ${id} failed to build: ${wp.failed}`);
    stage.score.handover = null;      // the film as it is once the change is over
    app.manual = true; app.governor.enabled = false; app.R.drawScale = 1; app.t = 0;
    window.__coverage = () => { const wp = app.R.wp; if (!wp) return; wp.block[0] = 1; app.R.draw(); wp.block[0] = 0; };
    T.seek(0);
    return { id: W.id, world: stage.score.world?.id, gestures: stage.score.gestures.length, wp: !!app.R.wp, rehearsal: song?.rehearsal && +song.rehearsal.seconds.toFixed(2) };
  }, id);
  log(`world ${id}: ${JSON.stringify(r)}`);
  return r;
}
