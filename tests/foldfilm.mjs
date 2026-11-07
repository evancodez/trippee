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
    { at: 98.87, from: 96.3, id: 'pole.garden', via: 'plain', moves: [{ id: 'screen', open: 2, close: 1 }] },
    { at: 112.79, from: 110, id: 'lines.fall', via: 'plain', moves: [{ id: 'roll', times: { hits: [122.39, 130.07, 137.75] } }] },
    { at: 151.19, from: 143.03, id: 'rooms.nested', via: 'plain', moves: [{ id: 'crumple', open: 4, close: 2 }] },
    { at: 170.39, from: 165, id: 'lines.fall', via: 'plain', moves: [{ id: 'limit', open: 2, close: 2 }] },
    { at: 192.95, from: 185.27, id: 'pole.garden', via: 'plain', moves: [{ id: 'pearls', open: 2, close: 1 }] },
  ],
};
// Any other song: one fold to a section of the song, each on a pattern the film uses. FOLDS=fan,limit IDS=lines.fall,rooms.nested
// STAY=1 on MGMT: out of a fold that doesn't shut, by a flight, and from one sheet to another under the same mirrors, by a glide.
CUTS.stay = [
  { at: 0, id: 'lines.fall', arcs: true },
  { at: 47.51, from: 39.83, id: 'rooms.nested', via: 'plain', moves: [{ id: 'crumple', open: 3, stay: true }] },
  { at: 77.75, from: 70.07, id: 'lines.fall', via: 'plain', moves: [{ id: 'limit', open: 2, stay: true }] },
  { at: 112.79, from: 104, id: 'pole.garden', via: 'slide', moves: [{ id: 'limit', open: 0, close: 2, times: { from: 104 } }] },
  { at: 151.19, from: 143.03, id: 'lines.fall', via: 'plain' },
];
const LIST = (process.env.FOLDS || 'fan,forever,limit,crumple,screen,pearls,roll').split(','), BASES = (process.env.BASES || 'rooms.nested,lines.fall,lines.fall,pole.garden,checks.vega,pole.garden,lines.fall').split(',');
export const autoCut = async (page, song) => page.eval(async ({ song, LIST, BASES }) => {
  await app.song.load(`/media/${song}.mp3`, { seed: 7 }); app.song.pause();
  const A = app.song.analysis, segs = A.segments.filter(s => s.t1 - s.t0 >= 14), shots = [{ at: 0, id: 'lines.fall', arcs: true }];
  let i = 0, last = 0;
  for (const s of segs) { if (s.t0 < 8 || s.t0 - last < 12) continue; shots.push({ at: s.t0, from: Math.max(last + 4, s.t0 - 6), id: BASES[i % BASES.length], via: 'plain', moves: [{ id: LIST[i % LIST.length], open: 3, close: 2 }] }); i++; last = s.t0; }
  return shots;
}, { song, LIST, BASES });
export default async ({ page, save, log }) => {
  const song = process.env.SONG || 'mgmt', SKIP = new Set((process.env.SKIP || '').split(','));
  for (let i = 0; i < 240; i++) { if (await page.eval('typeof window.trippee !== "undefined" && window.trippee.ready === true')) break; await sleep(250); }
  const shotsFor = process.env.FILM ? null : process.env.STAY ? CUTS.stay : CUTS[song] && !process.env.AUTO ? CUTS[song] : await autoCut(page, song);
  log(JSON.stringify(shotsFor?.map(s => [+s.at.toFixed(1), s.id, s.moves?.[0]?.id])));
  const made = await page.eval(async ({ song, shots, rehearseIt }) => {
    await app.R.whenFoldReady();
    await app.song.load(`/media/${song}.mp3`, { seed: 7 }); if (shots) { app.song.pause(); } app.ui?.song?.show?.(false);
    const here = u => new URL(u, location.href).href;
    const [{ compose }, { rehearse }, { auditCut }] = await Promise.all(['src/score/compose.js', 'src/music/rehearse.js', 'src/score/cut.js'].map(u => import(here(u))));
    const A = app.song.analysis;
    let sc;
    if (shots) {
      sc = compose(A, 7, { patterns: app.patterns, aspect: 16 / 9, cut: { hash: A.hash, name: 'folds', line: 'a test of the fold set', shots } });
      if (rehearseIt) { const r = await rehearse(sc, Math.min(A.duration, 1200), () => {}, { lastTry: true }); auditCut(sc, r); }
    } else {
      for (let i = 0; i < 2400 && !(app.song.rehearsal && app.ui.song.state === 'ready'); i++) await new Promise(r => setTimeout(r, 100));
      sc = app.song.score; window.__reh = app.song.rehearsal?.flash;
    }
    app.song.pause(); app.song.score = sc; app.stage.setScore(sc);
    app.manual = true; app.governor.enabled = false; app.R.drawScale = 1; app.t = 0;
    window.__sc = sc;
    const c = document.createElement('canvas'); c.width = 320; c.height = 180; const x = c.getContext('2d', { willReadFrequently: true });
    window.__tiles = () => {
      x.drawImage(window.trippee.canvas, 0, 0, 320, 180); const d = x.getImageData(0, 0, 320, 180).data, W = 320, H = 180; let sum = 0;
      const L_ = new Uint8Array(W * H); for (let k = 0; k < L_.length; k++) { const v = (d[k * 4] * 0.2126 + d[k * 4 + 1] * 0.7152 + d[k * 4 + 2] * 0.0722) | 0; L_[k] = v; sum += v; }
      const o = []; for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) { let s = 0, n = 0; for (let y = (ty * H / 4) | 0; y < ((ty + 1) * H / 4 | 0); y++) for (let X = (tx * W / 4) | 0; X < ((tx + 1) * W / 4 | 0); X++) { s += L_[y * W + X]; n++; } o.push(+(s / n).toFixed(1)); }
      return { mean: +(sum / L_.length).toFixed(2), tiles: o };
    };
    window.__kinds = {}; for (const G of sc.gestures) if (G.morph) { app.t = G.t1 - G.morph * .5; window.trippee.seek(app.t); window.__kinds[+G.t1.toFixed(1)] = app.lastFrame?.kind; }
    return { kinds: window.__kinds, duration: A.duration, refused: sc.refused, gestures: sc.gestures.map(G => ({ t0: +G.t0.toFixed(2), t1: +G.t1.toFixed(2), morph: +(G.morph || 0).toFixed(2), id: G.pattern.id, moves: (G.moves ?? []).map(m => m.id), m: (G.moves ?? []).filter(m => m.from != null).map(m => ({ from: m.from, to: m.to, open: m.open, close: m.close, beats: m.beats?.length })), hits: (G.moves ?? []).find(m => m.id === 'roll')?.hits })) };
  }, { song, shots: shotsFor, rehearseIt: !!process.env.REHEARSE });
  log(`guard ${JSON.stringify(await page.eval('window.__reh ?? null'))}`);
  log(`refused ${JSON.stringify(made.refused)}  kinds ${JSON.stringify(made.kinds)}`);
  log(made.gestures.map(g => `  ${g.t0}-${g.t1} morph ${g.morph} ${g.id} [${g.moves}] ${JSON.stringify(g.m)} ${g.hits ?? ''}`).join('\n'));
  if (process.env.AT) {
    const [a, b] = process.env.AT.split('-').map(Number), every = +(process.env.EVERY || 0.1), N = Math.ceil((b - a) / every), cols = 12, tw = 150, th = 84;
    const r = await page.eval(async ({ a, every, N, cols, tw, th }) => {
      const c = document.createElement('canvas'); c.width = cols * tw; c.height = Math.ceil(N / cols) * th; const x = c.getContext('2d'); x.font = '10px monospace'; const means = [];
      for (let i = 0; i < N; i++) { const t = a + every * i; window.trippee.seek(t); const v = window.__tiles(); means.push(Math.round(v.mean)); x.drawImage(window.trippee.canvas, (i % cols) * tw, (i / cols | 0) * th, tw - 1, th - 1); x.fillStyle = '#f33'; x.fillText(`${t.toFixed(2)} ${Math.round(v.mean)}`, (i % cols) * tw + 2, (i / cols | 0) * th + 10); }
      return { url: c.toDataURL('image/jpeg', 0.85), means };
    }, { a, every, N, cols, tw, th });
    save(`${song}-at-${a}.jpg`, r.url); log('means ' + r.means.join(' ')); return;
  }
  if (!SKIP.has('sheets')) {
    for (const g of made.gestures) {
      if (g.moves.at(-1) === 'cue' || !g.moves.length || (process.env.FILM && !['fan', 'forever', 'screen', 'limit', 'crumple', 'pearls', 'roll'].includes(g.moves.at(-1)))) continue;
      const m = (process.env.FILM ? null : g.m[0]) ?? { from: g.t0, to: g.t1 - g.morph }, a = m.from - 2, b = m.to + 3, N = 96, cols = 12, tw = 150, th = 84;
      const url = await page.eval(async ({ a, b, N, cols, tw, th }) => {
        const c = document.createElement('canvas'); c.width = cols * tw; c.height = Math.ceil(N / cols) * th; const x = c.getContext('2d'); x.font = '10px monospace';
        for (let i = 0; i < N; i++) { const t = a + (b - a) * i / N; window.trippee.seek(t); x.drawImage(window.trippee.canvas, (i % cols) * tw, (i / cols | 0) * th, tw - 1, th - 1); x.fillStyle = '#f33'; x.fillText(t.toFixed(1), (i % cols) * tw + 2, (i / cols | 0) * th + 10); if (i % 12 === 0) await new Promise(r => setTimeout(r)); }
        return c.toDataURL('image/jpeg', 0.8);
      }, { a, b, N, cols, tw, th });
      save(`${song}-${process.env.FILM ? `${Math.round(g.t0)}-` : ''}${g.moves.at(-1)}.jpg`, url);
    }
  }
  if (!SKIP.has('flash')) {
    const FPS = 12;
    const res = await page.eval(async ({ duration, FPS }) => {
      const T = window.trippee, o = { mean: [], tiles: [], time: [] }, N = Math.floor(duration * FPS);
      for (let i = 0; i < N; i++) { const t = i / FPS; T.seek(t); const v = window.__tiles(); o.mean.push(v.mean); o.tiles.push(v.tiles); o.time.push(+t.toFixed(3)); if (i % 40 === 0) await new Promise(r => setTimeout(r)); }
      return o;
    }, { duration: made.duration, FPS });
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
