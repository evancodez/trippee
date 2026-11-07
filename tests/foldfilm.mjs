// The fold set on a real song, as a hand cut asks for it. Muted: the song never plays. Each fold on a pattern the film really uses, on the song's own moments, with whatever comes before and after it. Says where it flashes (the judge's count, every pixel at 320x180), whether the cut was refused, and writes a dense sheet of each shot.
//   SONG=mgmt node tools/lab.mjs tests/foldfilm.mjs --size 1280,720 --out lab-out/f
//   SKIP=flash,sheets   REHEARSE=1 (the guard's rehearsal, as a real film gets)
import { writeFileSync } from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const r2 = x => +(+x).toFixed(2);
function swingsOf(series) {
  const out = []; let dir = 0, pivot = series[0];
  series.forEach((v, i) => {
    if (dir >= 0 && v > pivot) { pivot = v; dir = 1; }
    if (dir <= 0 && v < pivot) { pivot = v; dir = -1; }
    if (dir === 1 && pivot - v >= 25.5) { out.push(i); dir = -1; pivot = v; }
    else if (dir === -1 && v - pivot >= 25.5) { out.push(i); dir = 1; pivot = v; }
  });
  return out;
}
function worstOf(series, fps, times, limit) {
  const sw = swingsOf(series), spans = []; let worst = 0;
  for (let a = 0; a < sw.length; a++) { let b = a; while (b < sw.length && sw[b] - sw[a] < fps) b++; const n = Math.floor((b - a) / 2); worst = Math.max(worst, n); if (n > limit) spans.push({ t: times[sw[a]], n }); }
  return { worst, spans };
}
// Shots by song. at, from: song seconds on its own moments.
const CUTS = {
  mgmt: [
    { at: 0, id: 'lines.fall', arcs: true },
    { at: 47.51, from: 39.83, id: 'rooms.nested', via: 'plain', moves: [{ id: 'fan', open: 3, close: 2 }] },
    { at: 77.75, from: 72, id: 'lines.fall', via: 'plain', moves: [{ id: 'forever', open: 2, close: 2 }] },
    { at: 98.87, from: 96.3, id: 'pole.garden', via: 'plain', moves: [{ id: 'pearls', open: 3, close: 2 }] },
    { at: 112.79, from: 110, id: 'lines.fall', via: 'plain', moves: [{ id: 'limit', open: 3, close: 2 }] },
    { at: 151.19, from: 143.03, id: 'rooms.nested', via: 'plain', moves: [{ id: 'crumple', open: 4, close: 2 }] },
    { at: 192.95, from: 185.27, id: 'checks.vega', via: 'plain', moves: [{ id: 'screen', open: 2, close: 1 }] },
  ],
};
export default async ({ page, save, log }) => {
  const song = process.env.SONG || 'mgmt', SKIP = new Set((process.env.SKIP || '').split(','));
  for (let i = 0; i < 240; i++) { if (await page.eval('typeof window.trippee !== "undefined" && window.trippee.ready === true')) break; await sleep(250); }
  const made = await page.eval(async ({ song, shots, rehearseIt }) => {
    await app.R.whenFoldReady();
    await app.song.load(`/media/${song}.mp3`, { seed: 7 }); app.song.pause(); app.ui?.song?.show?.(false);
    const here = u => new URL(u, location.href).href;
    const [{ compose }, { rehearse }, { auditCut }] = await Promise.all(['src/score/compose.js', 'src/music/rehearse.js', 'src/score/cut.js'].map(u => import(here(u))));
    const A = app.song.analysis;
    const sc = compose(A, 7, { patterns: app.patterns, aspect: 16 / 9, cut: { hash: A.hash, name: 'folds', line: 'a test of the fold set', shots } });
    if (rehearseIt) { const r = await rehearse(sc, Math.min(A.duration, 1200), () => {}, { lastTry: true }); auditCut(sc, r); }
    app.song.score = sc; app.stage.setScore(sc);
    app.manual = true; app.governor.enabled = false; app.R.drawScale = 1; app.t = 0;
    window.__sc = sc;
    const c = document.createElement('canvas'); c.width = 320; c.height = 180; const x = c.getContext('2d', { willReadFrequently: true });
    window.__tiles = () => {
      x.drawImage(window.trippee.canvas, 0, 0, 320, 180); const d = x.getImageData(0, 0, 320, 180).data, W = 320, H = 180; let sum = 0;
      const L_ = new Uint8Array(W * H); for (let k = 0; k < L_.length; k++) { const v = (d[k * 4] * 0.2126 + d[k * 4 + 1] * 0.7152 + d[k * 4 + 2] * 0.0722) | 0; L_[k] = v; sum += v; }
      const o = []; for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) { let s = 0, n = 0; for (let y = (ty * H / 4) | 0; y < ((ty + 1) * H / 4 | 0); y++) for (let X = (tx * W / 4) | 0; X < ((tx + 1) * W / 4 | 0); X++) { s += L_[y * W + X]; n++; } o.push(+(s / n).toFixed(1)); }
      return { mean: +(sum / L_.length).toFixed(2), tiles: o };
    };
    return { duration: A.duration, refused: sc.refused, gestures: sc.gestures.map(G => ({ t0: +G.t0.toFixed(2), t1: +G.t1.toFixed(2), morph: +(G.morph || 0).toFixed(2), id: G.pattern.id, moves: (G.moves ?? []).map(m => m.id), m: (G.moves ?? []).filter(m => m.from != null).map(m => ({ from: m.from, to: m.to, open: m.open, close: m.close, beats: m.beats?.length })) })) };
  }, { song, shots: CUTS[song], rehearseIt: !!process.env.REHEARSE });
  log(`refused ${JSON.stringify(made.refused)}`);
  log(made.gestures.map(g => `  ${g.t0}-${g.t1} morph ${g.morph} ${g.id} [${g.moves}] ${JSON.stringify(g.m)}`).join('\n'));
  if (!SKIP.has('sheets')) {
    for (const g of made.gestures) {
      if (!g.moves.length || !g.m.length) continue;
      const m = g.m[0], a = m.from - 2, b = m.to + 3, N = 96, cols = 12, tw = 150, th = 84;
      const url = await page.eval(async ({ a, b, N, cols, tw, th }) => {
        const c = document.createElement('canvas'); c.width = cols * tw; c.height = Math.ceil(N / cols) * th; const x = c.getContext('2d'); x.font = '10px monospace';
        for (let i = 0; i < N; i++) { const t = a + (b - a) * i / N; window.trippee.seek(t); x.drawImage(window.trippee.canvas, (i % cols) * tw, (i / cols | 0) * th, tw - 1, th - 1); x.fillStyle = '#f33'; x.fillText(t.toFixed(1), (i % cols) * tw + 2, (i / cols | 0) * th + 10); if (i % 12 === 0) await new Promise(r => setTimeout(r)); }
        return c.toDataURL('image/jpeg', 0.8);
      }, { a, b, N, cols, tw, th });
      save(`${song}-${g.moves.at(-1)}.jpg`, url);
    }
  }
  if (!SKIP.has('flash')) {
    const FPS = 12;
    const res = await page.eval(async ({ duration, FPS }) => {
      const T = window.trippee, o = { mean: [], tiles: [], time: [] }, N = Math.floor(duration * FPS);
      for (let i = 0; i < N; i++) { const t = i / FPS; T.seek(t); const v = window.__tiles(); o.mean.push(v.mean); o.tiles.push(v.tiles); o.time.push(+t.toFixed(3)); if (i % 40 === 0) await new Promise(r => setTimeout(r)); }
      return o;
    }, { duration: Math.min(made.duration, 215), FPS });
    const whole = worstOf(res.mean, FPS, res.time, 0), tiles = Array.from({ length: 16 }, (_, k) => worstOf(res.tiles.map(a => a[k]), FPS, res.time, 2));
    log(`FLASH ${song}: whole ${whole.worst} tile ${Math.max(...tiles.map(t => t.worst))}`);
    for (const g of made.gestures) {
      const mine = t => t >= g.t0 && t < g.t1, w = whole.spans.filter(s => mine(s.t)), tt = tiles.flatMap(x => x.spans).filter(s => mine(s.t));
      log(`  ${g.t0}-${g.t1} ${g.id} [${g.moves}]: whole ${w.length ? Math.max(...w.map(s => s.n)) : 0} at ${w.slice(0, 4).map(s => r2(s.t))}; tile ${tt.length ? Math.max(...tt.map(s => s.n)) : 0} at ${[...new Set(tt.map(s => Math.round(s.t)))].slice(0, 6)}`);
    }
  }
  const errs = page.logs.filter(l => /error|fail/i.test(l)).slice(0, 5);
  if (errs.length) log('page: ' + errs.join(' | '));
};
