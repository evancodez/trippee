// The Iris, watched. Look at the sheets: no number says a sheet rolls up.
//   MODE=base   TAG=before node tools/lab.mjs tests/iris.mjs --out lab-out/c    fingerprints of plain flights, to compare before and after (MODE=check TAG=before)
//   MODE=pair   PAIRS="a,b;c,d" D=10 node tools/lab.mjs tests/iris.mjs --out lab-out/c    a contact sheet, time-slices and a row of large frames of each
//   MODE=atlas  node tools/lab.mjs tests/iris.mjs --out lab-out/c    every flat pattern in the pool as the sheet: its tube and its flower, as far along as a film's would be
//   MODE=cost   node tools/lab.mjs tests/iris.mjs --size 1920,1080 --out lab-out/c    what a frame of it costs against a dive of the same two, in one page
//   MODE=live   SONG=media/ppp.mp3 node tools/lab.mjs tests/iris.mjs --out lab-out/c    purity by seek, real time, a click during it, and the tools on it
//   MODE=film   SONG=media/ppp.mp3 SEED=7 node tools/lab.mjs tests/iris.mjs --out lab-out/c    the film's own iris: the same, a 60 fps scan for pops, close frames on the hit. BEYOND=1 with colour.
import { watch, analyse } from '../tools/look.mjs';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const FLIGHTS = [['checks.vega', 'void.diamond'], ['lattice.master', 'body.planet'], ['rooms.room', 'waves.dune'], ['waves.silk', 'rooms.hall'], ['lattice.pinwheel', 'dots.inflate'], ['checks.crush', 'rooms.tunnel']];

async function live({ page, save, log, sleep, t0, t1, h, name }) {
  // Purity: the same frames in order and from random seeks
  const pure = await page.eval(async ({ t0, t1 }) => {
    const T = window.trippee, app = T.app, c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d', { willReadFrequently: true });
    const grab = t => { app.t = t; T.step(0); g.drawImage(T.canvas, 0, 0, 160, 90); return g.getImageData(0, 0, 160, 90).data; };
    const ts = Array.from({ length: 40 }, (_, i) => t0 - 1 + (t1 - t0 + 2) * i / 39);
    const a = ts.map(t => grab(t));
    for (let i = 0; i < 120; i++) grab(ts[0] + Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1) * (t1 - t0 + 2));      // make sure no plan is being leaned on
    const order = ts.map((t, i) => i).sort((x, y) => Math.sin(x * 78.233) - Math.sin(y * 78.233));
    let same = 0, worst = 0;
    for (const i of order) { const b = grab(ts[i]); let d = 0; for (let k = 0; k < b.length; k += 4) d += Math.abs(b[k] - a[i][k]); d /= b.length / 4; worst = Math.max(worst, d); if (d < 0.01) same++; }
    return { same, of: ts.length, worst };
  }, { t0, t1 });
  log('purity', JSON.stringify(pure));
  // Tools on it: at one time, the frame with the edit on and with it off again
  const tools = await page.eval(async ({ t }) => {
    const T = window.trippee, app = T.app, c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d', { willReadFrequently: true });
    const grab = () => { app.t = t; T.step(0); g.drawImage(T.canvas, 0, 0, 160, 90); return g.getImageData(0, 0, 160, 90).data; };
    const diff = (a, b) => { let d = 0; for (let k = 0; k < a.length; k += 4) d += Math.abs(a[k] - b[k]); return +(d / (a.length / 4)).toFixed(2); };
    const out = {}, base = grab(), glErr = () => app.R.gl?.getError?.() ?? 0;
    const E = app.edits, tests = { journey: () => { E.journey = 0.5; }, spin: () => { E.spin = 0.4; }, duty: () => { E.duty = 0.2; }, ripple: () => { E.ripples = [{ x: 0.2, y: 0.1, radius: 0.5, height: 0.2 }]; }, warp: () => { E.warp = { x: 0, y: 0, r: 0.6, twist: 1.5, pinch: 0 }; }, sheet: () => { E.sheet = 1; E.sheetX = 0.1; }, press: () => { E.press = 0.3; E.pressR = 0.5; } };
    for (const k in tests) { const was = { ...E }; tests[k](); const on = grab(); for (const q of Object.keys(E)) if (!(q in was)) delete E[q]; Object.assign(E, was); const off = grab(); out[k] = [diff(base, on), diff(base, off)]; }
    return { out, gl: glErr() };
  }, { t: h.at - 1.5 });
  log('tools [changes the frame, comes back to it]', JSON.stringify(tools));
  // A click: mid-roll, and in the flower. It rushes what's running, then flies there.
  for (const [tag, at] of [['roll', h.at - 2.5], ['flower', h.at + 1.5], ['nothing running, to compare', h.at - 30]]) {
    const r = await page.eval(async ({ at, t0, t1 }) => {
      const T = window.trippee, app = T.app, c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d', { willReadFrequently: true });
      const grab = () => { g.drawImage(T.canvas, 0, 0, 160, 90); return g.getImageData(0, 0, 160, 90).data; };
      const diff = (a, b) => { let d = 0; for (let k = 0; k < a.length; k += 4) d += Math.abs(a[k] - b[k]); return d / (a.length / 4); };
      app.t = at - 0.5; T.step(0);
      let prev = grab(); const ds = [];
      for (let i = 0; i < 30; i++) { T.step(1 / 60); const f = grab(); ds.push(diff(prev, f)); prev = f; }
      app.hand.go('lines.fall', { dur: 8 });
      const before = app.lastFrame.kind;
      for (let i = 0; i < 60 * 11; i++) { T.step(1 / 60); const f = grab(); ds.push(diff(prev, f)); prev = f; }
      const end = T.metrics().pattern, kind = app.lastFrame.kind;
      let worst = 0, at2 = 0; ds.forEach((d, i) => { const near = ds.slice(Math.max(0, i - 4), i + 5).filter((_, k) => k !== Math.min(i, 4)).sort((p, q) => p - q), m = near[near.length >> 1] || 1, ratio = d / Math.max(m, 0.5); if (ratio > worst) { worst = ratio; at2 = i; } });
      return { before, end, kind, worstRatio: +worst.toFixed(2), atFrame: at2, step: +ds[at2].toFixed(1) };
    }, { at, t0, t1 });
    log('click', tag, JSON.stringify(r));
    await page.eval(`app.song.rebuild({seed:app.song.score.seed})`); await sleep(1500);
    await page.eval(`app.song.pause();app.ui.song.show(false);app.manual=true;app.governor.enabled=false;app.R.drawScale=1;`);
  }
  // Real time, the song playing, muted by the lab
  const rt = await page.eval(async ({ t0, t1 }) => {
    app.governor.enabled = true; window.trippee.run(); app.song.seek(t0 - 1); await app.song.play();
    for (let i = 0; i < 300 && !(app.t > t0 - 2 && app.t < t0 + 1); i++) await new Promise(r => requestAnimationFrame(r));
    const ms = []; let last = performance.now(); const tier0 = app.R.drawScale;
    await new Promise(res => { const tick = () => { const now = performance.now(); ms.push(now - last); last = now; if (app.t > t1 + 1 || ms.length > 2000) res(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    app.song.pause();
    ms.sort((a, b) => a - b);
    return { frames: ms.length, median: +ms[ms.length >> 1].toFixed(1), p99: +ms[Math.floor(ms.length * 0.99)].toFixed(1), max: +ms[ms.length - 1].toFixed(1), tier: [tier0, app.R.drawScale], t: app.t, kind: app.lastFrame.kind };
  }, { t0, t1 });
  log('real time', JSON.stringify(rt));
  const errs = page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  log('errors', errs.length, errs.slice(0, 5).join(' | '));
}

// A frame every 1/60 s over a stretch: each step against its neighbours, so a one-frame jump stands out from however fast things are going.
async function scan(page, a, b) {
  return page.eval(async ({ a, b }) => {
    const T = window.trippee, app = T.app, c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d', { willReadFrequently: true });
    const grab = t => { app.t = t; T.step(0); g.drawImage(T.canvas, 0, 0, 320, 180); return g.getImageData(0, 0, 320, 180).data; };
    const ds = [], ts = []; let prev = grab(a);
    for (let t = a + 1 / 60; t < b; t += 1 / 60) { const f = grab(t); let s = 0; for (let i = 0; i < f.length; i += 4) s += Math.abs(f[i] - prev[i]); ds.push(s / (f.length / 4)); ts.push(t); prev = f; }
    return { ds, ts };
  }, { a, b });
}
const spikes = ({ ds, ts }, n = 5) => ds.map((d, i) => {
  const near = []; for (let k = -4; k <= 4; k++) if (k && ds[i + k] != null) near.push(ds[i + k]);
  near.sort((p, q) => p - q);
  return { t: +ts[i].toFixed(3), d: +d.toFixed(2), ratio: +(d / Math.max(near[near.length >> 1], 0.5)).toFixed(2) };
}).sort((p, q) => q.ratio - p.ratio).slice(0, n);

async function film({ page, save, log, sleep, mode }) {
  const songPath = process.env.SONG || 'media/ppp.mp3', song = basename(songPath).replace(/\.\w+$/, '') + (process.env.TAG || '');
  for (let i = 0; i < 400 && !(await page.eval('window.trippee?.ready===true')); i++) await sleep(100);
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  await page.eval(`app.governor.enabled=false;app.R.drawScale=1;trippee.seek(0)`);
  const data = { items: [], files: [resolve(songPath)], dragOperationsMask: 1 };
  await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 640, y: 360, data });
  await page.send('Input.dispatchDragEvent', { type: 'drop', x: 640, y: 360, data });
  for (let i = 0; i < 1800; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await sleep(100); }
  if (process.env.SEED) { await page.eval(`app.song.rebuild({seed:${+process.env.SEED}})`); await sleep(500); }
  await page.eval(`app.song.pause();app.ui.song.show(false);app.manual=true;app.governor.enabled=false;app.R.drawScale=1;app.t=0;`);
  const info = await page.eval(() => {
    const s = app.song.score, i = s.gestures.findIndex(G => G.xform?.id === 'iris'), G = s.gestures[i], N = s.gestures[i + 1], h = s.cast?.find(c => c.kind === 'iris');
    return { cast: s.cast?.map(c => `${c.kind}@${c.at}`).join(' '), climax: s.song?.climax, i, h, id: G?.pattern.id, next: N?.pattern.id, t0: G && G.t1 - G.morph, t1: G?.t1, D: G?.morph, xform: G?.xform && { ...G.xform, beats: G.xform.beats?.length }, sat: app.song.rehearsal?.sitOut };
  });
  log(song, JSON.stringify(info));
  if (info.i < 0) { log('NO IRIS in this film'); return; }
  if (process.env.BEYOND) await page.eval(`app.beyond.on(); app.beyond.snap(${+process.env.BEYOND === 1 ? 0.6 : +process.env.BEYOND})`);
  const { t0, t1, h } = info, name = `${song}-iris`;
  if (mode === 'live') return live({ page, save, log, sleep, t0, t1, h, name, song });
  const w = await watch(page, save, { name, seconds: t1 - t0 + 5, fps: 15, cols: 12, rows: 8, setup: `app.t=${t0 - 2};trippee.seek(${t0 - 2})` });
  const m = analyse(w);
  log('white', Math.min(...w.white).toFixed(2), Math.max(...w.white).toFixed(2), 'grey p95', m.p95GreyAtNative);
  const st = await page.eval(`(p => p && ({ kind: p.kind, zoom: p.zoom, hit: p.hit }))(app.song.score.gestures[${info.i}].plan)`);
  log('plan', JSON.stringify(st));
  for (const [label, a, b] of [['start', t0 - 0.5, t0 + 1], ['hit', h.at - 1, h.at + 1], ['end', t1 - 1, t1 + 1]]) {
    const r = await scan(page, a, b);
    log(label, JSON.stringify(spikes(r, 3)));
  }
  // Close frames on the hit: a frame every 1/30 s, a second and a bit either side of the beat
  const img = await page.eval(async ({ at }) => {
    const T = window.trippee, app = T.app, W = 320, H = 180, cols = 6, N = 36, c = document.createElement('canvas'); c.width = W * cols; c.height = H * Math.ceil(N / cols); const g = c.getContext('2d');
    for (let i = 0; i < N; i++) { const t = at + (i - N / 2) / 15; app.t = t; T.step(0); g.drawImage(T.canvas, (i % cols) * W, Math.floor(i / cols) * H, W - 2, H - 2); g.fillStyle = '#e22'; g.font = '12px monospace'; g.fillText(t.toFixed(2), (i % cols) * W + 4, Math.floor(i / cols) * H + 14); }
    return c.toDataURL('image/jpeg', 0.85);
  }, { at: h.at });
  save(`${name}.hit.jpg`, img);
  // Three frames at full size, to see the tube's edges
  for (const [k, dt] of [['roll', -2.6], ['close', -0.8], ['flower', 1.0]]) save(`${name}.${k}.png`, await page.eval(`app.t=${h.at + dt};trippee.step(0);trippee.capture()`));
  const errs = page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  log('errors', errs.length, errs.slice(0, 5).join(' | '));
}

export default async ({ page, save, log, out, sleep }) => {
  const mode = process.env.MODE || 'pair';
  if (mode === 'base' || mode === 'check') {
    const file = join(out, `flights-${process.env.TAG || 'before'}.json`);
    const got = {};
    const shots = await page.eval(async ({ FLIGHTS }) => {
      const T = window.trippee, app = T.app, res = [];
      app.governor.enabled = false; app.R.drawScale = 1;
      for (const [a, b] of FLIGHTS) {
        T.morph(a, b, 10, 1);
        app.t = 0; T.step(0);
        for (const x of [0.02, 0.3, 0.6, 0.9, 0.99]) {
          app.t = 1 + 10 * x; T.step(0);
          res.push({ key: `${a}>${b}@${x}`, kind: app.stage.score.gestures[0].plan?.kind, url: T.capture() });
        }
      }
      return res;
    }, { FLIGHTS });
    for (const s of shots) got[s.key] = s.kind + ' ' + createHash('sha256').update(s.url).digest('hex').slice(0, 16);
    if (mode === 'base') { writeFileSync(file, JSON.stringify(got, null, 1)); log('saved', Object.keys(got).length, file); return; }
    const was = JSON.parse(readFileSync(file, 'utf8')); let bad = 0;
    for (const k in got) if (was[k] !== got[k]) { bad++; log('DIFFERS', k, was[k], got[k]); }
    log(`${Object.keys(got).length - bad}/${Object.keys(got).length} identical`);
    return;
  }
  if (mode === 'film' || mode === 'live') return film({ page, save, log, sleep, mode });
  if (mode === 'atlas') {
    const b = await page.eval(async () => {
      const T = window.trippee, app = T.app, I = await import('/src/score/xform/iris.js'), S = await import('/src/score/slot.js'), L = await import('/src/pattern/layout.js');
      app.governor.enabled = false; app.R.drawScale = 1;
      const slot = new Float32Array(L.SLOT_FLOATS), rows = [], W = 240, H = 135, cols = 8;
      const ids = T.list().map(p => p.id).filter(id => app.byId[id].pool !== false && I.canIris(S.base(app.byId[id])));
      const c = document.createElement('canvas'); c.width = W * cols; c.height = (H + 16) * Math.ceil(ids.length * 2 / cols); const g = c.getContext('2d');
      ids.forEach((id, i) => {
        T.morph(id, 'lines.river', 12, 1);
        const gs = app.stage.score.gestures;
        gs[0].t0 = 1 + 12 - 40; gs[0].xform = { id: 'iris' }; delete gs[0].plan; delete gs[0].planFor; delete gs[0].planning;
        app.t = 0; T.step(0);
        for (const [k, x] of [[0, 0.47], [1, 0.74]]) {
          app.t = 1 + 12 * x; T.step(0);
          const n = i * 2 + k, X = (n % cols) * W, Y = Math.floor(n / cols) * (H + 16);
          g.drawImage(T.canvas, X, Y + 16, W - 2, H);
          g.fillStyle = '#fff'; g.fillRect(X, Y, W, 16); g.fillStyle = '#c00'; g.font = '12px monospace'; g.fillText(`${id} z${(gs[0].plan?.zoom ?? 0).toFixed(1)}`, X + 2, Y + 12);
        }
      });
      return { n: ids.length, img: c.toDataURL('image/jpeg', 0.85) };
    });
    await save('atlas.jpg', b.img); log('flat pool patterns', b.n);
    return;
  }
  if (mode === 'cost') {
    const r = await page.eval(async () => {
      const T = window.trippee, app = T.app, gl = app.R.gl, px = new Uint8Array(4), out = {};
      app.governor.enabled = false; app.R.drawScale = 1;
      const time = async () => { const ms = []; for (let i = 0; i < 40; i++) { const t0 = performance.now(); T.step(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ms.push(performance.now() - t0); await new Promise(r => setTimeout(r, 0)); } ms.sort((a, b) => a - b); return +ms[20].toFixed(2); };
      for (const [a, b] of [['lattice.master', 'lines.river'], ['riley.octagrid', 'checks.twist'], ['lines.river', 'lattice.kagome']]) {
        const row = {};
        for (const kind of ['plain', 'dive', 'iris', 'dive', 'iris']) {
          T.morph(a, b, 12, 1);
          const gs = app.stage.score.gestures;
          if (kind === 'iris') { gs[0].xform = { id: 'iris' }; delete gs[0].plan; delete gs[0].planFor; delete gs[0].planning; }
          if (kind === 'dive') gs[0].rise = false;
          app.t = kind === 'plain' ? 0.5 : 0; T.step(0);
          if (kind !== 'plain') app.t = 1 + 12 * 0.5;
          T.step(0);
          (row[kind] ??= []).push(await time());
        }
        out[`${a}>${b}`] = row;
      }
      return out;
    });
    log(JSON.stringify(r));
    return;
  }
  const pairs = (process.env.PAIRS || 'checks.vega,lines.river').split(';').map(s => s.split(','));
  const D = +(process.env.D || 10), hold = 1, after = +(process.env.AFTER || 2), fps = +(process.env.FPS || 15), o = process.env.IRIS ? JSON.parse(process.env.IRIS) : {};
  for (const [x, y] of pairs) {
    const name = `${x}__${y}${process.env.TAG || ''}`;
    const info = await page.eval(async ({ x, y, D, hold, o }) => {
      const T = window.trippee, app = T.app;
      app.governor.enabled = false; app.R.drawScale = 1;
      T.morph(x, y, D, hold);
      const g = app.stage.score.gestures;
      g[0].t0 = hold + D - 40;
      g[0].xform = { id: 'iris', ...o };
      delete g[0].plan; delete g[0].planFor; delete g[0].planning;
      app.t = 0; T.step(0);
      app.t = hold + 0.5 * D; T.step(0);
      const p = g[0].plan;
      app.t = 0;
      return { kind: p?.kind, plan: p };
    }, { x, y, D, hold, o });
    log(name, JSON.stringify(info));
    const w = await watch(page, save, { name, seconds: hold + D + after, fps, cols: +(process.env.COLS || 8), rows: +(process.env.ROWS || 6) });
    const m = analyse(w);
    const iOf = t => Math.round(t * fps), med = [...w.diff].sort((p, q) => p - q)[w.diff.length >> 1];
    log('  start', w.diff.slice(iOf(hold) - 1, iOf(hold) + 3).join(' '), 'end', w.diff.slice(iOf(hold + D) - 3, iOf(hold + D) + 3).join(' '), 'median', med, 'max', m.maxDiff, 'at', w.time[w.diff.indexOf(m.maxDiff)]);
    // A few frames large, to see the limb
    const large = process.env.LARGE ? process.env.LARGE.split(',').map(Number) : [.3, .45, .55, .62, .72, .85];
    const urls = await page.eval(async ({ hold, D, large }) => {
      const T = window.trippee, app = T.app, W = 640, H = 360, cols = 3, rows = Math.ceil(large.length / cols);
      const c = document.createElement('canvas'); c.width = W * cols; c.height = H * rows; const g = c.getContext('2d');
      large.forEach((x, i) => { app.t = hold + D * x; T.step(0); g.drawImage(T.canvas, (i % cols) * W, Math.floor(i / cols) * H, W, H); });
      return c.toDataURL('image/jpeg', 0.92);
    }, { hold, D, large });
    await save(`${name}.large.jpg`, urls);
  }
  log('errors', page.logs.filter(l => /\[error\]|\[exception\]/.test(l)));
};
