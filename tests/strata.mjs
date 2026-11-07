// Strata, watched: a sheet's sets of lines lift off to panes of glass of their own on a build, and lock back into register on its landing (src/score/moves/space.js, kind 8 in src/gl/chunks/space.js). Muted: the song never plays.
//
//   SONGS=mgmt,wildflower node tools/lab.mjs tests/strata.mjs --out lab-out/<you>     each song's film as ?strata=1 makes it, rehearsed with its guard: where strata went and why, and for each one
//                                                                                      a sheet of 20 frames (<song>-strata-<n>.jpg), time-slices through the middle (<song>-strata-<n>.slice.jpg), the lock, the judge's flash count
//                                                                                      with it and with the panes held together, and one-frame pops at 60 fps
//   SEED=8                another take
//   MODE=loop             the library's Strata, one round of it with no song: a sheet and time-slices
//   MODE=cost             GPU ms a frame (median, and the tenth fastest of 50) of the library's Strata with the panes apart and together, a plain sheet, and the same sheet on the space program. --size 3024,1964 for a laptop's screen
//   MODE=off              no toggle: says strata isn't cast and no gesture wears it
//
// The lock: the frame on the landing is drawn with the panes together, so it's the flat sheet by construction, and the frame one 60th before it is compared with the same frame with the panes held together, through the rehearsal's eyes at 960x540.
// Flashes: opposing swings of 10% of full scale within a second, the judge's count, on the whole frame and on each of 16 tiles, at 20 fps from a second before it comes loose to two after it locks.
import { resolve } from 'node:path';
import { dropSong } from '../tools/look.mjs';
const E = process.env, sleep = ms => new Promise(r => setTimeout(r, ms));

// In the page: helpers on window, so each step is a short eval
const helpers = () => {
  const T = window.trippee, W = 320, H = 180, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  const lum = () => { x.drawImage(T.canvas, 0, 0, W, H); const d = x.getImageData(0, 0, W, H).data, L = new Uint8Array(W * H); for (let k = 0; k < L.length; k++) L[k] = (d[k * 4] * 0.2126 + d[k * 4 + 1] * 0.7152 + d[k * 4 + 2] * 0.0722) | 0; return L; };
  const tilesOf = L => { const o = []; let all = 0; for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) { let s = 0, n = 0; for (let y = (ty * H / 4) | 0; y < ((ty + 1) * H / 4 | 0); y++) for (let X = (tx * W / 4) | 0; X < ((tx + 1) * W / 4 | 0); X++) { s += L[y * W + X]; n++; } o.push(s / n); all += s / n; } return { tiles: o, mean: all / 16 }; };
  const full = () => { const gl = app.R.gl, w = T.canvas.width, h = T.canvas.height, px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
  const swings = (s, sw = 25.5) => { const out = []; let dir = 0, p = s[0]; s.forEach((v, i) => { if (dir >= 0 && v > p) { p = v; dir = 1; } if (dir <= 0 && v < p) { p = v; dir = -1; } if (dir === 1 && p - v >= sw) { out.push(i); dir = -1; p = v; } else if (dir === -1 && v - p >= sw) { out.push(i); dir = 1; p = v; } }); return out; };
  const worst = (s, fps) => { const sw = swings(s); let w = 0, at = -1; for (let a = 0; a < sw.length; a++) { let b = a; while (b < sw.length && sw[b] - sw[a] < fps) b++; const n = Math.floor((b - a) / 2); if (n > w) { w = n; at = sw[a]; } } return { n: w, at }; };
  const label = (g, s, X, Y) => { g.font = '11px monospace'; g.fillStyle = '#000'; g.fillRect(X, Y, g.measureText(s).width + 4, 13); g.fillStyle = '#f33'; g.fillText(s, X + 2, Y + 10); };
  window.__st = { T, W, H, lum, tilesOf, full, worst, label };
};

export default async ({ page, log, save }) => {
  const MODE = E.MODE || 'film';
  await page.eval(helpers);
  if (MODE === 'loop' || MODE === 'cost') return loopOrCost(page, log, save, MODE);
  const songs = (E.SONGS || 'mgmt,wildflower').split(','), url = await page.eval('location.href');
  let first = true, bad = 0;
  for (const song of songs) {
    if (!first) { await page.goto(url); for (let i = 0; i < 200; i++) { let ok = false; try { ok = await page.eval('window.trippee?.ready===true'); } catch { /* navigating */ } if (ok) break; await sleep(250); } await page.eval(helpers); }
    first = false;
    await page.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    await page.eval(async on => { const F = await import(new URL('src/score/flags.js', location.href).href); F.directing.strata = on; }, MODE !== 'off');
    await dropSong(page, `media/${song}.mp3`, { resolvePath: resolve, sleep });
    if (E.SEED) await page.eval(async seed => { (await app.song.prepareTake({ seed }))?.(); app.song.pause(); app.manual = true; }, +E.SEED);
    const info = await page.eval(() => {
      const S = app.song.score, list = [];
      for (const G of S.gestures) for (const m of G.moves ?? []) if (m.id === 'strata') list.push({ from: m.from, to: m.to, lands: m.lands, top: m.top, pattern: G.pattern.id, G: [G.t0, G.t1, G.morph], next: S.gestures[S.gestures.indexOf(G) + 1]?.pattern.id });
      const cast = (S.woah?.list ?? []).filter(x => x.id === 'strata');
      return { list, cast, all: (S.woah?.list ?? []).map(x => `${x.id}@${x.t0}`).join(' '), refused: (S.refused ?? []).filter(r => JSON.stringify(r).includes('strata')), guard: app.song.rehearsal?.flash, dur: app.song.duration };
    });
    log(`\n=== ${song}${E.SEED ? ' seed ' + E.SEED : ''}: ${info.dur.toFixed(0)} s. Strata worn ${info.list.length} times. The film's tricks: ${info.all}. The guard left ${JSON.stringify(info.guard?.left ?? [])}`);
    for (const c of info.cast) log(`  cast at ${c.t0}-${c.t1}, locks on ${c.lands} on ${c.pattern}  [${c.why}]`);
    if (info.refused.length) log('  refused', JSON.stringify(info.refused));
    if (MODE === 'off') { log(info.list.length || info.cast.length ? 'FAIL strata worn with the toggle off' : 'PASS strata not worn with the toggle off'); bad += info.list.length; continue; }
    let n = 0;
    for (const s of info.list) {
      n++;
      log(`  #${n} ${s.pattern}: comes loose from ${s.from.toFixed(2)}, panes ${s.top.toFixed(2)} apart at most, locks on ${s.lands.toFixed(2)}, then into ${s.next} (gesture ${s.G.map(v => +(+v).toFixed(2)).join(' ')})`);
      const r = await page.eval(async ({ s, n, song }) => {
        const { T, W, H, lum, tilesOf, full, worst, label } = window.__st, S = app.song.score;
        const m = S.gestures.flatMap(G => G.moves ?? []).find(q => q.id === 'strata' && Math.abs(q.lands - s.lands) < 1e-6), was = m.lands;
        const together = on => { m.lands = on ? m.from - 1 : was; };      // the panes held together: the same film, the same frames, with no separation
        const a = s.from - 1, b = s.lands + 3;
        // A sheet of 20
        const cols = 5, tw = 320, th = 180, cv = document.createElement('canvas'); cv.width = cols * tw; cv.height = 4 * th; const g = cv.getContext('2d');
        const { strataSep } = await import(new URL('src/score/moves/space.js', location.href).href);
        for (let i = 0; i < 20; i++) { const t = a + (b - a) * i / 19; T.seek(t); g.drawImage(T.canvas, (i % cols) * tw, (i / cols | 0) * th, tw - 2, th - 2); label(g, `${t.toFixed(2)} sep ${strataSep(m, t).toFixed(3)} ${app.lastFrame?.kind ?? ''}`, (i % cols) * tw, (i / cols | 0) * th); }
        const sheet = cv.toDataURL('image/jpeg', 0.85);
        // Time-slices through the middle of the frame, a column and a row, at 30 fps
        const N = Math.round((b - a) * 30), sl = document.createElement('canvas'); sl.width = N; sl.height = 2 * H + 4; const sg = sl.getContext('2d'), img = sg.createImageData(N, 2 * H + 4);
        for (let i = 0; i < N; i++) { T.seek(a + i / 30); const L = lum(); for (let y = 0; y < H; y++) { const v = L[y * W + (W >> 1)], k = (y * N + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255; } for (let y = 0; y < H; y++) { const v = L[(H >> 1) * W + Math.round(y * W / H)], k = ((H + 4 + y) * N + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255; } }
        sg.putImageData(img, 0, 0); const lk = Math.round((s.lands - a) * 30); sg.fillStyle = '#f33'; sg.fillRect(lk, H, 1, 4);
        const slice = sl.toDataURL('image/jpeg', 0.9);
        // The lock
        const diff = (p, q) => { let mx = 0, sum = 0; for (let k = 0; k < p.length; k += 4) { const d = Math.abs(p[k + 1] - q[k + 1]); if (d > mx) mx = d; sum += d; } return { max: mx, mean: +(sum / (p.length / 4)).toFixed(4) }; };
        // Through the rehearsal's own eyes, which go straight to the frame's numbers: the picture's camera eases a jump out over real seconds, so two seeks to one moment aren't always one frame
        const { getRig, shot } = await import(new URL('src/music/rehearse.js', location.href).href), R = await getRig(), LW = 960, LH = 540, p = new Uint8Array(LW * LH * 4), q = new Uint8Array(LW * LH * 4);
        await Promise.race([R.whenBuilt?.([16]), new Promise(r => setTimeout(r, 4000))]);
        const at = t => { shot(R, S, t, LW, LH, p); together(true); shot(R, S, t, LW, LH, q); together(false); return diff(p, q); };
        const lock = { on: at(s.lands), before: at(s.lands - 1 / 60), beat: at(s.lands - 0.25) };
        // Flashes, with it and with the panes held together
        const scan = held => {
          together(held); const fps = 20, mean = [], tiles = Array.from({ length: 16 }, () => []);
          for (let t = a; t <= s.lands + 2; t += 1 / fps) { T.seek(t); const v = tilesOf(lum()); mean.push(v.mean); v.tiles.forEach((x, k) => tiles[k].push(x)); }
          together(false);
          const w = worst(mean, fps), ts = tiles.map(q => worst(q, fps)), k = ts.reduce((b, x, i) => (x.n > ts[b].n ? i : b), 0);
          return { whole: w.n, wholeAt: w.at >= 0 ? +(a + w.at / fps).toFixed(2) : null, tile: ts[k].n, tileAt: ts[k].at >= 0 ? +(a + ts[k].at / fps).toFixed(2) : null, tileOf: k, range: [+Math.min(...mean).toFixed(1), +Math.max(...mean).toFixed(1)] };
        };
        const flash = { strata: scan(false), together: scan(true) };
        // One-frame pops at 60 fps: the biggest step against the steps around it, over the whole stretch and right at the lock
        const steps = []; let prev = null;
        for (let t = s.from - 0.5; t <= s.lands + 1.5; t += 1 / 60) { T.seek(t); const L = lum(); if (prev) { let d = 0; for (let k = 0; k < L.length; k++) d += Math.abs(L[k] - prev[k]); steps.push({ t, d: d / L.length }); } prev = L; }
        const ratio = i => { const near = steps.slice(Math.max(0, i - 6), i).concat(steps.slice(i + 1, i + 7)).map(x => x.d).sort((p, q) => p - q), med = near[near.length >> 1] || 1e-3; return steps[i].d / Math.max(med, 0.05); };
        let pop = { r: 0, t: 0 }; steps.forEach((x, i) => { const r = ratio(i); if (r > pop.r) pop = { r, t: x.t, d: x.d }; });
        const li = steps.findIndex(x => x.t >= s.lands - 1e-6), atLock = li >= 0 ? { r: +ratio(li).toFixed(2), d: +steps[li].d.toFixed(2) } : null;
        return { sheet, slice, lock, flash, pop: { r: +pop.r.toFixed(2), t: +pop.t.toFixed(2), d: +(pop.d ?? 0).toFixed(2) }, atLock };
      }, { s, n, song });
      save(`${song}-strata-${n}.jpg`, r.sheet); save(`${song}-strata-${n}.slice.jpg`, r.slice);
      const lockOk = r.lock.on.max <= 1;
      const flashOk = r.flash.strata.whole === 0 && r.flash.strata.tile <= Math.max(2, r.flash.together.tile);
      if (!lockOk || !flashOk) bad++;
      log(`    lock: on the hit ${r.lock.on.max}/255, a 60th before ${r.lock.before.max}/255 (mean ${r.lock.before.mean}), a quarter second before ${r.lock.beat.max}/255 ${lockOk ? 'PASS' : 'FAIL'}`);
      log(`    flashes: whole ${r.flash.strata.whole}${r.flash.strata.whole ? ' at ' + r.flash.strata.wholeAt : ''}, tile ${r.flash.strata.tile}${r.flash.strata.tile ? ` at ${r.flash.strata.tileAt} (tile ${r.flash.strata.tileOf})` : ''}, mean ${r.flash.strata.range.join('..')}; panes held together: whole ${r.flash.together.whole}, tile ${r.flash.together.tile}${r.flash.together.tile ? ' at ' + r.flash.together.tileAt : ''} ${flashOk ? 'PASS' : 'FAIL'}`);
      log(`    pops at 60 fps: the biggest step is ${r.pop.r}x the steps around it, at ${r.pop.t} (${r.pop.d}/255 a pixel); at the lock ${JSON.stringify(r.atLock)}`);
      log(`    wrote ${song}-strata-${n}.jpg and .slice.jpg`);
    }
    if (!info.list.length) { log('  FAIL: strata wasn\'t cast'); bad++; }
  }
  const errors = page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  log(`\nstrata: ${bad ? 'FAIL' : 'PASS'}, errors ${errors.length}`, errors.slice(0, 5).join(' | '));
};

async function loopOrCost(page, log, save, MODE) {
  if (MODE === 'loop') {
    const r = await page.eval(async () => {
      const { T, W, H, lum, label } = window.__st;
      T.load('space.strata'); app.manual = true; app.governor.enabled = false; app.R.drawScale = 1;
      for (let i = 0; i < 400 && !app.R.spaceReady(); i++) await new Promise(r => setTimeout(r, 50));
      const cols = 5, tw = 320, th = 180, cv = document.createElement('canvas'); cv.width = cols * tw; cv.height = 4 * th; const g = cv.getContext('2d');
      for (let i = 0; i < 20; i++) { const t = 27 * i / 19; app.t = t; T.step(0); g.drawImage(T.canvas, (i % cols) * tw, (i / cols | 0) * th, tw - 2, th - 2); label(g, `${t.toFixed(2)} ${app.R.variant}`, (i % cols) * tw, (i / cols | 0) * th); }
      const N = 27 * 30, sl = document.createElement('canvas'); sl.width = N; sl.height = H; const sg = sl.getContext('2d'), img = sg.createImageData(N, H);
      for (let i = 0; i < N; i++) { app.t = i / 30; T.step(0); const L = lum(); for (let y = 0; y < H; y++) { const k = (y * N + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = L[y * W + (W >> 1)]; img.data[k + 3] = 255; } }
      sg.putImageData(img, 0, 0);
      return { sheet: cv.toDataURL('image/jpeg', 0.85), slice: sl.toDataURL('image/jpeg', 0.9) };
    });
    save('strata-loop.jpg', r.sheet); save('strata-loop.slice.jpg', r.slice);
    log('wrote strata-loop.jpg and strata-loop.slice.jpg');
    return;
  }
  const r = await page.eval(async () => {
    const { T } = window.__st, R = app.R, gl = R.gl, X = R.timer; app.governor.enabled = false; R.drawScale = 1; app.manual = true;
    for (let i = 0; i < 400 && !R.spaceReady(); i++) await new Promise(r => setTimeout(r, 50));
    if (!X) return { none: 1 };
    const measure = async (id, at, over) => {
      T.load(id); if (over) app.stage.score.gestures[0].over = over; const ms = [];
      for (let i = 0; i < 50; i++) {
        app.t = at + i / 240; T.step(0); gl.finish();
        const q = gl.createQuery(); gl.beginQuery(X.TIME_ELAPSED_EXT, q); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.endQuery(X.TIME_ELAPSED_EXT);
        await new Promise(res => { const w = () => (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) ? res() : setTimeout(w, 2)); w(); });
        ms.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q);
      }
      ms.sort((p, q) => p - q);
      return { ms: +ms[ms.length >> 1].toFixed(2), low: +ms[5].toFixed(2), variant: R.variant };      // low: the tenth fastest, as other work on the GPU only ever adds
    };
    const sheet = { 'space.kind': 8, 'space.dist': 2.4, 'space.pitch': 0.25, 'space.bowl': -1, 'space.q': 0, 'space.pix': 1 };
    return { size: [T.canvas.width, T.canvas.height], plainLattice: await measure('lattice.kagome', 10), strataTogether: await measure('space.strata', 1), strataApart: await measure('space.strata', 17), kagomeOnSpaceProgram: await measure('lattice.kagome', 10, { ...sheet, 'space.amp': 0 }), kagomeStrata: await measure('lattice.kagome', 10, { ...sheet, 'space.amp': 0.25 }), swell: await measure('space.swell', 20) };
  });
  log(JSON.stringify(r));
}
