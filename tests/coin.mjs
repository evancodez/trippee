// The Coin. PATS=coins.disc,coins.dart node tools/lab.mjs tests/coin.mjs --out lab-out/coin
//   MODE=land   lands flat: the frame at the landing against the same pattern with no coin (under .1/255), and with the flag off (identical), for every pattern listed
//   MODE=lean   stills at fixed leans, one row per pattern, for choosing bodies
//   MODE=watch  each pattern's whole coin as a sheet and time-slices, then its last 4 beats at 60 fps
//   MODE=pairs  pops at the ends of morphs into and out of each body. MODE=full: full frames at the steepest. MODE=cost: GPU cost, to compare with a copy of the tree (--url)
//   MODE=film   a real film of a real song, its strongest build wearing the coin, spliced the way the director will: SONG=media/ppp.mp3 PAT=coins.spiral [LANDAT=seconds]
// BPM=120 LAND=30 BEATS=56
import { resolve, basename } from 'node:path';
import { watch } from '../tools/look.mjs';
export default async ({ page, save, log, sleep }) => {
  const mode = process.env.MODE || 'land';
  const ids = (process.env.PATS || 'coins.disc,coins.dart,coins.spiral,coins.cone,coins.ziggurat,coins.star').split(',');
  const bpm = +(process.env.BPM || 120), land = +(process.env.LAND || 30), beats = +(process.env.BEATS || 56);
  for (let i = 0; i < 300; i++) { if (await page.eval('!!window.trippee?.ready')) break; await sleep(200); }
  await page.eval(`(async()=>{ const T=trippee; T.app.governor.enabled=false; T.app.R.drawScale=1; document.querySelector('#hints')&&(document.querySelector('#hints').hidden=true); window.flagsM=await import(new URL('src/score/flags.js',location.href).href); window.coinM=await import(new URL('src/score/moves/coin.js',location.href).href); })()`);
  const setup = (id, coin, extra = '') => `(()=>{ const T=trippee,app=T.app,p=app.byId[${JSON.stringify(id)}];
    const G={t0:0,t1:3600,arcEnd:${land + 12},pattern:p,moves:[${coin ? `{id:'coin',land:${land},beats:${beats},spb:${60 / bpm},w0:Math.PI/2,turns:${+(process.env.TURNS ?? 2)},a0:${process.env.A0 || 'undefined'},rib:${+(process.env.RIB ?? .45)}}` : ''}],${extra}};
    app.stage.score.gestures=[G]; app.stage.score.handover=null; app.stage.hold=true; app.t=0; app.manual=true; app.paused=false; })()`;
  const errors = () => page.logs.filter(l => /\[error\]|\[exception\]/.test(l));

  if (mode === 'land') {
    for (const id of ids) {
      const r = await page.eval(async ({ id, land, setupC, setupP }) => {
        const T = trippee, c = document.createElement('canvas'); c.width = T.canvas.width; c.height = T.canvas.height;
        const g = c.getContext('2d', { willReadFrequently: true });
        const grab = t => { T.seek(t); g.drawImage(T.canvas, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
        const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]); return s / (a.length / 4); };
        (0, eval)(setupP); const plain = grab(land), plainB = grab(land - 2);
        (0, eval)(setupC); const atLand = grab(land), just = grab(land - 1 / 60), two = grab(land - 2);
        flagsM.setFlag('coin', false);
        (0, eval)(setupC); const off = grab(land - 2);
        // and with colour open, through the plates' path, at the same lean
        const app = T.app; app.t = land - 2; app.beyond.on(); app.beyond.snap(0.6); (0, eval)(setupC); T.seek(land - 2); const colourGl = app.R.gl.getError();
        app.beyond.off(); app.beyond.snap(null);
        flagsM.setFlag('coin', true);
        return { id, colourGl, landed: +diff(plain, atLand).toFixed(4), lastFrame: +diff(plain, just).toFixed(3), leanBefore: +diff(plainB, two).toFixed(2), flagOff: +diff(plainB, off).toFixed(4), gl: T.app.R.gl.getError() };
      }, { id, land, setupC: setup(id, true), setupP: setup(id, false) });
      log(JSON.stringify(r), r.landed < 0.1 && r.flagOff === 0 ? 'PASS' : 'FAIL');
    }
  }
  if (mode === 'lean') {
    const leans = (process.env.LEANS || '0,.35,.6,.8').split(',').map(Number), ws = [0.6];
    const r = await page.eval(async ({ ids, leans, ws }) => {
      const T = trippee, app = T.app, W = 480, H = 270;
      const sheet = document.createElement('canvas'); sheet.width = W * leans.length; sheet.height = H * ids.length;
      const g = sheet.getContext('2d'); g.font = '13px monospace';
      ids.forEach((id, row) => leans.forEach((k, col) => {
        const p = app.byId[id];
        app.stage.score.gestures = [{ t0: 0, t1: 3600, arcEnd: 40, pattern: p, moves: [], over: { 'lathe.k': k * Math.cos(ws[0]), 'lathe.w': k * Math.sin(ws[0]) } }];
        app.stage.score.handover = null; app.stage.hold = true; app.t = 20; T.seek(20);
        g.drawImage(T.canvas, col * W, row * H, W - 2, H - 2); g.fillStyle = '#f22'; g.fillText(`${id} k${k}`, col * W + 4, row * H + 14);
      }));
      return sheet.toDataURL('image/jpeg', 0.85);
    }, { ids, leans, ws });
    save('lean.jpg', r);
    log('lean.jpg');
  }
  if (mode === 'watch') {
    for (const id of ids) {
      await page.eval(setup(id, true));
      await page.eval(`trippee.seek(${land - beats * 60 / bpm - 1})`);
      const secs = beats * 60 / bpm + 3;
      await watch(page, save, { name: `${id}`, seconds: secs, fps: +(process.env.FPS || 30), cols: 10, rows: 8 });
      await page.eval(`trippee.seek(${land - 4 * 60 / bpm - .1})`);
      const w = await watch(page, save, { name: `${id}.end`, seconds: 4 * 60 / bpm + .6, fps: 60, cols: 10, rows: 8 });
      const dm = w.diff.slice().sort((a, b) => a - b)[w.diff.length >> 1];
      log(id, 'last 4 beats: median diff', dm, 'max', Math.max(...w.diff), 'grey', Math.max(...w.grey));
    }
  }
  if (mode === 'pick') {
    // Picked by hand, the way a tile click picks: it arrives, it goes round, and with the flag off it's a flat pattern. Then colour on it.
    const r = await page.eval(async ({ ids }) => {
      const T = trippee, app = T.app, out = [];
      const OFF = (await import(new URL('src/pattern/layout.js', location.href).href)).OFF;
      T.load('lines.river'); app.stage.hold = false; app.manual = true;
      for (const id of ids) {
        app.stage.pick(app.byId[id], app.pictureT());
        let n = 0; for (; n < 800; n++) { T.step(1 / 60); if (app.lastFrame.G.pattern.id === id && !app.lastFrame.kind && n > 60) break; if (n % 30 === 0) await new Promise(q => setTimeout(q)); }
        for (let i = 0; i < 240; i++) T.step(1 / 60);
        out.push({ id, arrivedAfter: +(n / 60).toFixed(1), showing: app.lastFrame.G.pattern.id, kind: app.lastFrame.kind, lean: +Math.hypot(app.R.slotA[OFF['lathe.k']], app.R.slotA[OFF['lathe.w']]).toFixed(3), gl: app.R.gl.getError() });
      }
      app.beyond.on(); app.beyond.snap(0.6); T.step(1 / 60);
      const url = T.capture();
      app.beyond.off(); app.beyond.snap(null);
      return { out, url };
    }, { ids });
    save('pick-colour.png', r.url);
    for (const o of r.out) log(JSON.stringify(o));
  }
  if (mode === 'full') {
    // Full frames at the steepest, with the crowded side in view, for looking at edges. --size 1920,1080
    for (const id of ids) {
      await page.eval(setup(id, true));
      const url = await page.eval(`(()=>{ const T=trippee; T.seek(${land} - (+${process.env.X || 30})*${60 / bpm}); return T.capture(); })()`);
      save(`full-${id}.png`, url);
    }
  }
  if (mode === 'pairs') {
    // Pops at the ends of a morph into and out of each body, as tests/pops.mjs measures them. These go round on their own when picked by hand, so they're moving as it starts.
    const others = (process.env.OTHERS || 'lines.river,checks.vega,lattice.master,body.planet,dots.inflate').split(',');
    const r = await page.eval(async ({ ids, others }) => {
      const T = trippee, app = T.app, c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d', { willReadFrequently: true });
      const grab = t => { T.seek(t); g.drawImage(T.canvas, 0, 0, 160, 90); return g.getImageData(0, 0, 160, 90).data; };
      const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]); return s / (a.length / 4); };
      const one = (a, b) => {
        T.morph(a, b, 10, 1);
        const steady = diff(grab(5.98), grab(6.02)), s0 = diff(grab(0.98), grab(1.02)), s1 = diff(grab(10.98), grab(11.02));
        let step = 0, at = 0, prev = grab(1); for (let t = 1.05; t < 11.1; t += 0.05) { const f = grab(t), d = diff(prev, f); if (d > step) { step = d; at = t; } prev = f; }
        return { a, b, kind: app.stage.score.gestures[0].plan?.kind, start: +s0.toFixed(1), end: +s1.toFixed(1), steady: +steady.toFixed(1), step: +step.toFixed(1), at: +at.toFixed(2) };
      };
      const out = [];
      for (const id of ids) { for (const o of others) { out.push(one(id, o)); out.push(one(o, id)); await new Promise(q => setTimeout(q)); }
        for (const b of ids) if (b !== id) out.push(one(id, b)); }
      return out;
    }, { ids, others });
    const kinds = {}; for (const o of r) kinds[o.kind] = (kinds[o.kind] || 0) + 1;
    log(r.length, 'pairs', JSON.stringify(kinds));
    const bad = r.filter(o => Math.max(o.start, o.end) > Math.max(2 * o.steady, 4)).sort((x, y) => Math.max(y.start, y.end) - Math.max(x.start, x.end));
    log('over the limit at an end:', bad.length); for (const o of bad.slice(0, 12)) log(JSON.stringify(o));
    const big = r.slice().sort((x, y) => y.step - x.step).slice(0, 6); log('biggest steps (50 ms apart)'); for (const o of big) log(JSON.stringify(o));
  }
  if (mode === 'cost') {
    // What it costs: fixed patterns, on the GPU, draw then wait. Run against a copy of the tree with the stub (--url) and compare. Coin on against off is in the same page. DSF=2 for Retina.
    const DSF = +(process.env.DSF || 2);
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 982, deviceScaleFactor: DSF, mobile: false }); await sleep(500);
    const r = await page.eval(async ({ hasCoin }) => {
      const gl = app.R.gl, px = new Uint8Array(4), T = trippee;
      const once = () => { gl.finish(); const t0 = performance.now(); T.step(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
      const best = n => { once(); let m = 1e9; for (let i = 0; i < n; i++) m = Math.min(m, once()); return m; };
      const ids = ['lines.river', 'checks.vega', 'lattice.master', 'body.planet', 'rooms.room', 'dots.inflate', 'pole.garden', 'waves.silk', 'checks.target', 'void.door'], out = {};
      for (const id of ids) { T.load(id); app.manual = true; app.t = 13; out[id] = +best(9).toFixed(2); await new Promise(q => setTimeout(q)); }
      const so = Object.values(out).sort((a, b) => a - b), median = so[so.length >> 1];
      let coin = null;
      if (hasCoin) {
        const go = over => { app.stage.score.gestures = [{ t0: 0, t1: 3600, arcEnd: 26, pattern: app.byId['coins.disc'], moves: [], over }]; app.t = 13; app.manual = true; return +best(9).toFixed(2); };
        coin = { flat: go({}), lean: go({ 'lathe.k': 0.4, 'lathe.w': 0.4 }), ribs: go({ 'lathe.k': 0.4, 'lathe.w': 0.4, 'spare.a': 5.7, 'spare.b': 0.3, 'spare.c': 0.3 }), flatAgain: go({}) };
      }
      return { size: [app.canvas.width, app.canvas.height], median, out, coin };
    }, { hasCoin: await page.eval(`!!app.byId['coins.disc']`) });
    log(JSON.stringify(r));
  }
  if (mode === 'strip') {
    // Close frames, large: one row per rib amount, from X beats to go, DX beats apart. RIBS=0,.3,.5 X=24 DX=.25 PATS=coins.disc
    const ribs = (process.env.RIBS || '0,.3,.5').split(',').map(Number), X = +(process.env.X || 24), DX = +(process.env.DX || 0.25), n = +(process.env.N || 8);
    const r = await page.eval(async ({ id, ribs, X, DX, n, land, beats, bpm }) => {
      const T = trippee, app = T.app, W = 400, H = 225, sheet = document.createElement('canvas'); sheet.width = W * n; sheet.height = H * ribs.length;
      const g = sheet.getContext('2d'); g.font = '13px monospace';
      ribs.forEach((rib, row) => { for (let c = 0; c < n; c++) {
        app.stage.score.gestures = [{ t0: 0, t1: 3600, arcEnd: land, pattern: app.byId[id], range: [0, 1], moves: [{ id: 'coin', land, beats, spb: 60 / bpm, w0: Math.PI / 2, rib }] }];
        app.stage.score.handover = null; app.stage.hold = true;
        const x = X - c * DX; T.seek(land - x * 60 / bpm);
        g.drawImage(T.canvas, c * W, row * H, W - 2, H - 2); g.fillStyle = '#f22'; g.fillText(`rib ${rib} x ${x}`, c * W + 4, row * H + 14);
      } });
      return sheet.toDataURL('image/jpeg', 0.85);
    }, { id: ids[0], ribs, X, DX, n, land, beats, bpm });
    save(`strip-${ids[0]}.jpg`, r);
  }
  if (mode === 'film') {
    // A real film of a real song: the strongest build, spliced the way the director will. SONG=media/ppp.mp3 PAT=coins.spiral [LANDAT=seconds] [QUIET=1 chord lenses off]
    const song = process.env.SONG || 'media/ppp.mp3', pat = process.env.PAT || 'coins.spiral';
    const data = { items: [], files: [resolve(song)], dragOperationsMask: 1 };
    await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 640, y: 360, data });
    await page.send('Input.dispatchDragEvent', { type: 'drop', x: 640, y: 360, data });
    for (let i = 0; i < 400; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await sleep(100); }
    const info = await page.eval(`(()=>{ app.ui.song.show(false); document.querySelector('#hints').hidden=true; const s=app.song.score;
      return { family:s.family, bpm:s.song.bpm, meter:s.song.meter, dur:s.song.duration, g:s.gestures.map(g=>[+g.t0.toFixed(1),+g.t1.toFixed(1),g.pattern.id,g.morph]), land:s.landings.filter(l=>l.dE>.05).map(l=>[l.B,l.kind,l.dE]) }; })()`);
    log(JSON.stringify(info));
    const real = !!process.env.REAL;
    const r = await page.eval(async ({ pat, landAt, quiet, rib, hold, real }) => {
      const s = app.song.score, g = s.gestures;
      const best = landAt ? { B: landAt } : s.landings.filter(l => l.B > 40 && l.B < s.song.duration - 25).sort((a, b) => b.dE - a.dE)[0];
      const L = g[g.findIndex(x => Math.abs(x.t1 - best.B) < 0.5)].t1;
      const o = rib != null ? { rib } : {};
      if (!hold) o.flow = { hold: 0, slow: 0.01, after: 1 / 8 };
      const H = coinM.spliceCoin(s, L, app.byId[pat], o), m = H.moves[0], start = H.t0, i = g.indexOf(H) - 1;
      // QUIET=1: what the director's ambient gain will do, through the only numbers a test can reach: the lenses go by coinAmbient, the rest by .3 of what's taken away.
      if (quiet) app.onFrame.push(t => { const a = coinM.coinAmbient(H, app.t); app.edits.reactTone = a; app.edits.reactMelody = 0.3 + 0.7 * a; app.edits.reactPulse = 0.5 + 0.5 * a; });
      if (!real) { app.manual = true; app.song.pause?.(); }
      return { L, start, end: H.t1, kept: g[i].pattern.id, keptFrom: g[i].t0, next: g[g.indexOf(H) + 1].pattern.id, beats: m.beats, spb: m.spb, meter: m.meter };
    }, { pat, landAt: +(process.env.LANDAT || 0), quiet: !!process.env.QUIET, rib: process.env.RIB != null ? +process.env.RIB : null, hold: process.env.HOLD !== '0', real });
    log(JSON.stringify(r));
    if (process.env.REHEARSE) {
      // The rehearsal a composed film gets, over the spliced film: does the coin make a jump, does it get thrown out?
      const q = await page.eval(async ({ pat }) => { const m = await import(new URL('src/music/rehearse.js', location.href).href); const x = await m.rehearse(app.song.score, app.song.score.song.duration); return { jumps: x.jumps, bad: x.bad, sitOut: x.sitOut, seconds: +x.seconds.toFixed(1), coinThere: app.song.score.gestures.some(g => g.moves && g.pattern.id === pat), ways: x.ways.length }; }, { pat });
      log('rehearsal', JSON.stringify(q));
    }
    if (real) {
      // The real loop and the real song clock, muted: seek in, watch it through the landing. Frame times, and a frame at every landing-relative second.
      const q = await page.eval(async ({ L, secs }) => {
        const W = 192, H = 108, cols = 12, rows = Math.ceil(secs / 0.5 / cols), sheet = document.createElement('canvas'); sheet.width = cols * W; sheet.height = rows * H; const g = sheet.getContext('2d'); g.font = '11px monospace';
        app.song.seek(L - secs + 6); app.song.play?.();
        const ts = []; let last = performance.now(), i = 0, next = last, closest = 1e9, tAt = 0, rate = [];
        await new Promise(res => { const on = t => { const now = performance.now(); ts.push(now - last); last = now; const d = Math.abs(app.t - L); if (d < closest) { closest = d; tAt = app.t; }
          if (now >= next) { next += 500; if (i < rows * cols) { g.drawImage(app.canvas, (i % cols) * W, (i / cols | 0) * H, W, H); g.fillStyle = '#f22'; g.fillText((app.t - L).toFixed(1), (i % cols) * W + 3, (i / cols | 0) * H + 12); i++; } else { app.onFrame.splice(app.onFrame.indexOf(on), 1); res(); } } };
          app.onFrame.push(on); });
        ts.sort((a, b) => a - b);
        return { sheet: sheet.toDataURL('image/jpeg', 0.8), fps: +(1000 / (ts.reduce((a, b) => a + b, 0) / ts.length)).toFixed(1), p99: +ts[ts.length * 0.99 | 0].toFixed(1), max: +ts.at(-1).toFixed(1), tier: app.governor.tier, nearestToLanding: +closest.toFixed(4), lean: app.R.slotA[0] != null };
      }, { L: r.L, secs: +(process.env.SECS || 34) });
      save(`real-${basename(song).replace(/\.\w+$/, '')}-${pat}.jpg`, q.sheet); delete q.sheet;
      log('real time', JSON.stringify(q));
      log('errors', errors());
      return;
    }
    const from = +(process.env.FROM || r.start - 3), to = +(process.env.TO || r.L + 8), name = `film-${basename(song).replace(/\.\w+$/, '')}-${pat}`;
    await page.eval(`trippee.seek(${from})`);
    const w = await watch(page, save, { name, seconds: to - from, fps: +(process.env.FPS || 30), cols: 10, rows: 8 });
    const t0 = w.time[0], d = w.diff, med = d.slice().sort((a, b) => a - b)[d.length >> 1], worst = Math.max(...d.slice(1));
    log('median step', med, 'worst', worst, 'at', w.time[d.indexOf(worst)], 'grey max', Math.max(...w.grey), 'white', Math.min(...w.white), Math.max(...w.white));
    await page.eval(`trippee.seek(${r.L - 2.2})`);
    const e = await watch(page, save, { name: name + '.end', seconds: 4.4, fps: 60, cols: 10, rows: 8 });
    const dd = e.diff, md = dd.slice().sort((a, b) => a - b)[dd.length >> 1], wd = Math.max(...dd.slice(1));
    log('around the landing, 60 fps: median', md, 'worst', wd, 'at', e.time[dd.indexOf(wd)]);
    // Every edge of the coin's gesture at 60 fps: the flight in, the coin starting, the landing, the flight out
    const scan = await page.eval(async ({ r }) => {
      const T = trippee, c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d', { willReadFrequently: true });
      const grab = () => { g.drawImage(T.canvas, 0, 0, 320, 180); return g.getImageData(0, 0, 320, 180).data; };
      const out = {};
      const G = app.stage.score.gestures, H = G.find(x => x.moves), prev = G[G.indexOf(H) - 1];
      const at = { flightInStart: prev.t1 - prev.morph, coinStart: H.t0, landing: r.L, flightOutStart: H.t1 - H.morph, flightOutEnd: H.t1 };
      for (const name in at) {
        T.seek(at[name] - 1.05); T.step(1 / 60); T.step(1 / 60); let last = grab(); const d = [], ts = [];     // the two steps: a test's edits lag a seek by a frame
        for (let i = 0; i < 120; i++) { T.step(1 / 60); const f = grab(); let s = 0; for (let k = 0; k < f.length; k += 4) s += Math.abs(f[k] - last[k]); d.push(s / (f.length / 4)); ts.push(app.t); last = f; await (i % 16 ? null : new Promise(q => setTimeout(q))); }
        const so = d.slice().sort((a, b) => a - b), med = so[60], w = so[119];
        out[name] = { t: +at[name].toFixed(2), kind: app.lastFrame.kind, median: +med.toFixed(2), worst: +w.toFixed(2), at: +(ts[d.indexOf(w)] - at[name]).toFixed(3), ratio: +(w / Math.max(med, .5)).toFixed(2) };
      }
      return out;
    }, { r });
    for (const k in scan) log(k, JSON.stringify(scan[k]));
  }
  log('errors', errors());
};
