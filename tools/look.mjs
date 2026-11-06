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

const inPage = async ({ seconds, fps, cols, rows, setup }) => {
  const t = window.trippee;
  if (setup) await (0, eval)(setup);
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
  for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    t.step(dt);
    out.cpuMs.push(+(performance.now() - t0).toFixed(1));
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
    for (let y = 0; y < 180; y++) { const k = ((y * W / 180) | 0) + 90 * W; put(i, y, d[k * 4], d[k * 4 + 1], d[k * 4 + 2]); }
    for (let y = 0; y < 180; y++) { const k = y * W + 160; put(i, 182 + y, d[k * 4], d[k * 4 + 1], d[k * 4 + 2]); }
    for (let y = 0; y < 128; y++) { const a = y / 128 * Math.PI * 2, px = (160 + 60 * Math.cos(a)) | 0, py = (90 + 60 * Math.sin(a)) | 0, k = py * W + px; put(i, 364 + y, d[k * 4], d[k * 4 + 1], d[k * 4 + 2]); }
    // contact sheet
    if (i >= nextThumb && thumbI < thumbsWanted) {
      const cx = (thumbI % cols) * tw, cy = Math.floor(thumbI / cols) * th;
      gs.drawImage(src, cx + 1, cy + 1, tw - 2, th - 2);
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

export async function watch(page, save, { name = 'watch', seconds = 20, fps = 12, cols = 8, rows = 7, setup = null } = {}) {
  const r = await page.eval(inPage, { seconds, fps, cols, rows, setup });
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
