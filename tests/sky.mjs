// The sheet as a world, watched: Dome, Planet and Canyon (src/score/moves/sky.js, src/gl/chunks/sky.js). Muted: the song never plays.
//
//   MODE=loop [IDS=space.dome,space.planet,space.canyon]   one round of each library pattern with no song: a sheet of 30 frames (<id>.loop.jpg), time-slices through the middle column and row at 30 fps
//                                                          (<id>.loop.slice.jpg), the judge's flash count at 20 fps and one-frame pops at 60 fps over the whole round
//   MODE=at IDS=space.dome@12@20,space.planet@22          those moments, full size
//   MODE=cost --size 3024,1964                             GPU ms a frame (median and the tenth fastest of 50) of each at its fullest, against a plain sheet, ride and swell
//   MODE=film SONGS=mgmt,ppp [QUERY=sky=1]                 each song's film as composed: where these went, and for each a sheet of 20 frames, time-slices, flashes and pops over the stretch
//
// Flashes: opposing swings of 10% of full scale within a second, the judge's count, on the whole frame and on each of 16 tiles. A pop: one frame's step much bigger than the steps either side of it.
import { resolve } from 'node:path';
import { dropSong } from '../tools/look.mjs';
const E = process.env, sleep = ms => new Promise(r => setTimeout(r, ms));
const SKY = 2048, FLIGHT = 4;

const helpers = () => {
  const T = window.trippee, W = 320, H = 180, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  const lum = () => { x.drawImage(T.canvas, 0, 0, W, H); const d = x.getImageData(0, 0, W, H).data, L = new Uint8Array(W * H); for (let k = 0; k < L.length; k++) L[k] = (d[k * 4] * 0.2126 + d[k * 4 + 1] * 0.7152 + d[k * 4 + 2] * 0.0722) | 0; return L; };
  const tilesOf = L => { const o = []; let all = 0; for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) { let s = 0, n = 0; for (let y = (ty * H / 4) | 0; y < ((ty + 1) * H / 4 | 0); y++) for (let X = (tx * W / 4) | 0; X < ((tx + 1) * W / 4 | 0); X++) { s += L[y * W + X]; n++; } o.push(s / n); all += s / n; } return { tiles: o, mean: all / 16 }; };
  const swings = (s, sw = 25.5) => { const out = []; let dir = 0, p = s[0]; s.forEach((v, i) => { if (dir >= 0 && v > p) { p = v; dir = 1; } if (dir <= 0 && v < p) { p = v; dir = -1; } if (dir === 1 && p - v >= sw) { out.push(i); dir = -1; p = v; } else if (dir === -1 && v - p >= sw) { out.push(i); dir = 1; p = v; } }); return out; };
  const worst = (s, fps) => { const sw = swings(s); let w = 0, at = -1; for (let a = 0; a < sw.length; a++) { let b = a; while (b < sw.length && sw[b] - sw[a] < fps) b++; const n = Math.floor((b - a) / 2); if (n > w) { w = n; at = sw[a]; } } return { n: w, at }; };
  const label = (g, s, X, Y) => { g.font = '11px monospace'; g.fillStyle = '#000'; g.fillRect(X, Y, g.measureText(s).width + 4, 13); g.fillStyle = '#f33'; g.fillText(s, X + 2, Y + 10); };
  // A sheet, time-slices, flashes and pops over [a, b], each moment drawn by seek(t)
  const watchSpan = async (a, b, seek, name) => {
    const cols = 6, rows = 5, tw = 320, th = 180, cv = document.createElement('canvas'); cv.width = cols * tw; cv.height = rows * th; const g = cv.getContext('2d');
    const n = cols * rows;
    for (let i = 0; i < n; i++) { const t = a + (b - a) * i / (n - 1); seek(t); g.drawImage(T.canvas, (i % cols) * tw, (i / cols | 0) * th, tw - 2, th - 2); label(g, `${t.toFixed(2)} v${app.R.variant}`, (i % cols) * tw, (i / cols | 0) * th); }
    const sheet = cv.toDataURL('image/jpeg', 0.85);
    const N = Math.round((b - a) * 30), sl = document.createElement('canvas'); sl.width = N; sl.height = 2 * H + 4; const sg = sl.getContext('2d'), img = sg.createImageData(N, 2 * H + 4);
    for (let i = 0; i < N; i++) { seek(a + i / 30); const L = lum(); for (let y = 0; y < H; y++) { const v = L[y * W + (W >> 1)], k = (y * N + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255; } for (let y = 0; y < H; y++) { const v = L[(H >> 1) * W + Math.round(y * W / H)], k = ((H + 4 + y) * N + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255; } }
    sg.putImageData(img, 0, 0);
    const slice = sl.toDataURL('image/jpeg', 0.9);
    const fps = 20, mean = [], tiles = Array.from({ length: 16 }, () => []);
    for (let t = a; t <= b; t += 1 / fps) { seek(t); const v = tilesOf(lum()); mean.push(v.mean); v.tiles.forEach((q, k) => tiles[k].push(q)); }
    const w = worst(mean, fps), ts = tiles.map(q => worst(q, fps)), k = ts.reduce((p, q, i) => (q.n > ts[p].n ? i : p), 0);
    const flash = { whole: w.n, wholeAt: w.at >= 0 ? +(a + w.at / fps).toFixed(2) : null, tile: ts[k].n, tileAt: ts[k].at >= 0 ? +(a + ts[k].at / fps).toFixed(2) : null, range: [+Math.min(...mean).toFixed(1), +Math.max(...mean).toFixed(1)] };
    // One-frame pops at 60 fps: a step against the steps either side of it
    const steps = []; let prev = null;
    for (let t = a; t <= b; t += 1 / 60) { seek(t); const L = lum(); if (prev) { let s = 0; for (let q = 0; q < L.length; q++) s += Math.abs(L[q] - prev[q]); steps.push([t, s / L.length]); } prev = L; }
    let pop = [0, 0, 0];
    for (let i = 1; i < steps.length - 1; i++) { const r = steps[i][1] / Math.max(steps[i - 1][1], steps[i + 1][1], 0.5); if (r > pop[1]) pop = [+steps[i][0].toFixed(3), +r.toFixed(2), +steps[i][1].toFixed(2)]; }
    const most = steps.reduce((p, q) => (q[1] > p[1] ? q : p), [0, 0]);
    return { sheet, slice, flash, pop, most: [+most[0].toFixed(3), +most[1].toFixed(2)], name };
  };
  window.__sk = { T, W, H, lum, tilesOf, worst, label, watchSpan };
};
const waitSky = page => page.eval(async ({ SKY, FLIGHT }) => { const R = app.R; R.whenBuilt?.([SKY, SKY | FLIGHT]); for (let i = 0; i < 600 && !(R.progs[SKY] && R.progs[SKY | FLIGHT]); i++) await new Promise(r => setTimeout(r, 50)); return !!R.progs[SKY]; }, { SKY, FLIGHT });

export default async ({ page, log, save }) => {
  const MODE = E.MODE || 'loop';
  await page.eval(helpers);
  log('sky programs', await waitSky(page));
  const errs = () => page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  if (MODE === 'loop') {
    for (const id of (E.IDS || 'space.dome,space.planet,space.canyon,space.skim').split(',')) {
      const L = { 'space.dome': 34, 'space.planet': 38, 'space.canyon': 32, 'space.skim': 30 }[id] ?? 34;
      const r = await page.eval(async ({ id, L }) => {
        const T = window.trippee; app.governor.enabled = false; app.R.drawScale = 1;
        T.load(id, { arcs: true });
        const G = app.stage.score.gestures[0], t0 = G.t0;
        return window.__sk.watchSpan(t0, t0 + L, t => { app.t = t; T.step(0); }, id);
      }, { id, L: +(E.L || L) });
      save(`${id}.loop.jpg`, r.sheet); save(`${id}.loop.slice.jpg`, r.slice);
      log(id, 'flash', JSON.stringify(r.flash), 'pop', JSON.stringify(r.pop), 'biggest step', JSON.stringify(r.most));
    }
  } else if (MODE === 'at') {
    for (const spec of (E.IDS || 'space.dome@20').split(',')) {
      const [id, ...ts] = spec.split('@');
      await page.eval(id => { window.trippee.load(id, { arcs: true }); app.governor.enabled = false; app.R.drawScale = 1; }, id);
      for (const t of ts) save(`${id}.at${t}.${E.EXT || 'jpg'}`, await page.eval(`(()=>{const G=app.stage.score.gestures[0];app.t=G.t0+${+t};trippee.step(0);trippee.step(0);const c=document.createElement('canvas');c.width=trippee.canvas.width;c.height=trippee.canvas.height;c.getContext('2d').drawImage(trippee.canvas,0,0);return c.toDataURL('image/jpeg',.9);})()`));
    }
  } else if (MODE === 'cost') {
    const r = await page.eval(async () => {
      const T = window.trippee, R = app.R, gl = R.gl, X = R.timer; app.governor.enabled = false; R.drawScale = 1;
      if (!X) return { none: 1 };
      const measure = async (id, at) => {
        T.load(id, { arcs: true }); const G = app.stage.score.gestures[0]; app.t = G.t0 + at; T.step(0); T.step(0);
        const ms = [];
        for (let i = 0; i < 50; i++) {
          app.t += 1 / 240; T.step(0); gl.finish();
          const q = gl.createQuery(); gl.beginQuery(X.TIME_ELAPSED_EXT, q); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.endQuery(X.TIME_ELAPSED_EXT);
          await new Promise(res => { const w = () => (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) ? res() : setTimeout(w, 2)); w(); });
          if (!gl.getParameter(X.GPU_DISJOINT_EXT)) ms.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q);
        }
        ms.sort((p, q) => p - q);
        return { med: +ms[ms.length >> 1].toFixed(2), fast: +ms[Math.min(9, ms.length - 1)].toFixed(2), v: R.variant };
      };
      const out = { size: [T.canvas.width, T.canvas.height] };
      for (const [id, at] of [['lines.fall', 5], ['space.dome', 1], ['space.dome', 14], ['space.dome', 20], ['space.planet', 1], ['space.planet', 22], ['space.canyon', 1], ['space.canyon', 16], ['space.skim', 15], ['space.ride', 20], ['space.swell', 20], ['space.hall', 20], ['lines.fall', 6]]) out[`${id}@${at}`] = await measure(id, at);
      return out;
    });
    log(JSON.stringify(r));
  } else if (MODE === 'film') {
    const songs = (E.SONGS || 'mgmt').split(','), base = await page.eval('location.href.split("?")[0]');
    for (const song of songs) {
      await page.goto(base + (E.QUERY ? '?' + E.QUERY : ''));
      for (let i = 0; i < 200; i++) { let ok = false; try { ok = await page.eval('window.trippee?.ready===true'); } catch { /* navigating */ } if (ok) break; await sleep(250); }
      await page.eval(helpers); await waitSky(page);
      await page.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
      await sleep(300);
      await dropSong(page, `media/${song}.mp3`, { resolvePath: resolve, sleep });
      if (E.SEED) await page.eval(async seed => { (await app.song.prepareTake({ seed }))?.(); app.song.pause(); app.manual = true; }, +E.SEED);
      const info = await page.eval(() => {
        const S = app.song.score, list = [];
        for (const G of S.gestures) for (const m of G.moves ?? []) if (['dome', 'planet', 'canyon', 'skim'].includes(m.id)) list.push({ id: m.id, from: m.from, to: m.to, loop: m.loop, pattern: G.pattern.id, G: [G.t0, G.t1, G.morph] });
        return { list, all: (S.woah?.list ?? []).map(x => `${x.id}@${x.t0}`).join(' '), refused: (S.refused ?? []).filter(r => /dome|planet|canyon|skim/.test(JSON.stringify(r))), left: app.song.rehearsal?.flash?.left, dur: app.song.duration };
      });
      log(`\n=== ${song}: ${info.dur.toFixed(0)} s. The film's tricks: ${info.all}. The guard left ${JSON.stringify(info.left ?? [])}`);
      if (info.refused.length) log('  refused', JSON.stringify(info.refused));
      let n = 0;
      for (const s of info.list) {
        n++;
        log(`  #${n} ${s.id} on ${s.pattern}: ${s.from.toFixed(2)} to ${s.to.toFixed(2)}${s.loop ? `, over at ${s.loop.a.toFixed(2)}-${s.loop.b.toFixed(2)}` : ''} (gesture ${s.G.map(v => (+v).toFixed(2)).join(' ')})`);
        const r = await page.eval(async ({ a, b, name }) => window.__sk.watchSpan(a, b, t => window.trippee.seek(t), name), { a: s.from - 1, b: Math.min(s.to + 3, s.G[1]), name: `${song}-${s.id}-${n}` });
        save(`${song}-${s.id}-${n}.jpg`, r.sheet); save(`${song}-${s.id}-${n}.slice.jpg`, r.slice);
        log(`     flash ${JSON.stringify(r.flash)} pop ${JSON.stringify(r.pop)} biggest step ${JSON.stringify(r.most)}`);
      }
    }
  }
  log('errors', errs().length, errs().slice(0, 3).join(' | ').slice(0, 1200));
};
