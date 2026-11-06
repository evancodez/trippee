// Lane P: what the Riley patterns look like, at full size. node tools/lab.mjs tests/riley.mjs --size 1920,1080 --out lab-out/riley
//   MODE=stills IDS=a,b     a 2x2 sheet per pattern (U=.1,.35,.65,.9), and ZOOM=1 a whole frame at FULL=.5
//   MODE=move ID=a SECS=20  a sheet and slices of one whole gesture (LEN seconds), at FPS
//   MODE=cost               GPU cost of each against a plain neighbour, in the same page
//   MODE=flag               which join the pool with each flag off
//   MODE=ab A=/lab-out/x/ B=/lab-out/y/   the same frames through two copies of the shader, in one page
//   MODE=pairs [OTHERS=a,b] pops and flat shapes in morphs into and out of each
//   MODE=film SONG=media/ppp.mp3    a real film all of this family: rehearsal, a sheet, 60 fps scans at every boundary
import { resolve, basename } from 'node:path';
import { watch, analyse } from '../tools/look.mjs';
const MODE = process.env.MODE || 'stills';
const list = async page => process.env.IDS ? process.env.IDS.split(',') : (await page.eval('trippee.list()')).filter(p => p.family === 'riley').map(p => p.id);
export default async ({ page, save, log }) => {
  await page.eval(`app.governor.enabled=false`);
  if (MODE === 'stills') {
    const us = (process.env.U || '.1,.35,.65,.9').split(',').map(Number);
    for (const id of await list(page)) {
      const r = await page.eval(async ({ id, us, full }) => {
        const T = trippee, W = T.canvas.width, H = T.canvas.height, c = document.createElement('canvas');
        const cols = 2, rows = Math.ceil(us.length / 2); c.width = 1920; c.height = 1080 / cols * rows;
        const g = c.getContext('2d', { willReadFrequently: true }), out = [];
        us.forEach((u, i) => {
          T.still(id, u);
          g.drawImage(T.canvas, (i % cols) * 960, (i / cols | 0) * 540, 960, 540);
          const d = g.getImageData((i % cols) * 960, (i / cols | 0) * 540, 960, 540).data; let w = 0, gr = 0;
          for (let k = 0; k < d.length; k += 4) { if (d[k] > 127) w++; if (d[k] > 48 && d[k] < 208) gr++; }
          out.push({ u, white: +(w / (d.length / 4)).toFixed(3), grey: +(gr / (d.length / 4)).toFixed(3) });
        });
        const sheet = c.toDataURL('image/jpeg', 0.88);
        let big = null;
        if (full != null) { T.still(id, full); big = T.canvas.toDataURL('image/jpeg', 0.92); }
        return { sheet, big, out, W, H };
      }, { id, us, full: process.env.FULL ? +process.env.FULL : null });
      save(`${id}.stills.jpg`, r.sheet);
      if (r.big) save(`${id}.full.jpg`, r.big);
      log(id, `${r.W}x${r.H}`, JSON.stringify(r.out));
    }
  }
  if (MODE === 'move') {
    const id = process.env.ID, len = +(process.env.LEN || 26), secs = +(process.env.SECS || len), fps = +(process.env.FPS || 4);
    await page.eval(`trippee.load(${JSON.stringify(id)},{sweep:true,len:${len}})`);
    if (process.env.START) await page.eval(`trippee.seek(${+process.env.START})`);
    const w = await watch(page, save, { name: id + (process.env.TAG || ''), seconds: secs, fps, cols: +(process.env.COLS || 8), rows: +(process.env.ROWS || 5) });
    const a = analyse(w);
    log(id, JSON.stringify({ meanWhite: a.meanWhite, edges: a.edgeRange, greyMedian: a.medianGreyAtNativeRes, greyP95: a.p95GreyAtNativeRes, maxDiff: a.maxDiff, flash: a.flashesPerSecondWholeFrame }));
  }
  if (MODE === 'cost') {
    const ids = [...(await list(page)), ...(process.env.PLAIN || 'lines.fall,checks.cloth,dots.inflate').split(',')];
    const r = await page.eval(ids => {
      const gl = app.R.gl, px = new Uint8Array(4), out = {};
      const measure = () => { gl.finish(); const t0 = performance.now(); trippee.step(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
      for (const id of ids) { trippee.load(id); app.manual = true; const c = []; for (const u of [.1, .3, .5, .7, .9]) { app.t = 26 * u; measure(); c.push(Math.min(measure(), measure(), measure())); } out[id] = +Math.max(...c).toFixed(2); }
      return out;
    }, ids);
    log(JSON.stringify(r));
  }
  if (MODE === 'pairs') {
    // Pops at the ends of morphs and the biggest step in one, into and out of each, and any flat shape on the way. Others= the far ends.
    const ids = await list(page), others = (process.env.OTHERS || 'lines.fall,checks.cloth,dots.inflate,lattice.master,body.tube,rooms.room,pole.garden,waves.current').split(',');
    const r = await page.eval(async ({ ids, others }) => {
      const T = trippee, app = T.app, W = 160, H = 90, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
      const grab = t => { T.seek(t); g.drawImage(T.canvas, 0, 0, W, H); return g.getImageData(0, 0, W, H).data; };
      const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]); return s / (a.length / 4); };
      // flat: most of the frame one joined colour, with room for a disc
      const dist = new Float32Array(W * H);
      const disc = d => { let best = 0; for (const white of [true, false]) { for (let i = 0; i < W * H; i++) dist[i] = (white ? d[i * 4] > 235 : d[i * 4] < 20) ? 1e6 : 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (x === 0 || y === 0 || x === W - 1 || y === H - 1) dist[i] = Math.min(dist[i], 1.5); if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1); if (y > 0) dist[i] = Math.min(dist[i], dist[i - W] + 1); }
        for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (x < W - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1); if (y < H - 1) dist[i] = Math.min(dist[i], dist[i + W] + 1); best = Math.max(best, dist[i]); } } return best / H; };
      const out = [];
      const one = (a, b) => {
        T.morph(a, b, 10, 1);
        const steady = diff(grab(5.98), grab(6.02)), s0 = diff(grab(0.98), grab(1.02)), s1 = diff(grab(10.98), grab(11.02));
        let step = 0, at = 0, mx = 0, prev = grab(1); for (let t = 1.05; t < 11.1; t += 0.05) { const f = grab(t), d = diff(prev, f); if (d > step) { step = d; at = t; } mx = Math.max(mx, disc(f)); prev = f; }
        return { a, b, kind: app.stage.score.gestures[0].plan?.kind, start: +s0.toFixed(1), end: +s1.toFixed(1), steady: +steady.toFixed(1), step: +step.toFixed(1), at: +at.toFixed(2), disc: +mx.toFixed(2) };
      };
      T.morph('lines.river', 'checks.vega', 8, 1); T.seek(5);
      for (const a of ids) { for (const o of others) { out.push(one(a, o)); out.push(one(o, a)); await new Promise(r => setTimeout(r)); }
        const others2 = ids.filter(x => x !== a).slice(0, +(window.__within ?? 99)); for (const o of others2) { out.push(one(a, o)); await new Promise(r => setTimeout(r)); } }
      return out;
    }, { ids, others });
    const pop = o => Math.max(o.start, o.end) > Math.max(2 * o.steady, 4), kinds = {};
    for (const o of r) kinds[o.kind] = (kinds[o.kind] || 0) + 1;
    log(JSON.stringify(kinds), 'pairs', r.length);
    log('popped', r.filter(pop).length); for (const o of r.filter(pop).sort((x, y) => Math.max(y.start, y.end) - Math.max(x.start, x.end)).slice(0, 14)) log(JSON.stringify(o));
    log('worst step'); for (const o of [...r].sort((x, y) => y.step - x.step).slice(0, 10)) log(JSON.stringify(o));
    log('biggest disc'); for (const o of [...r].sort((x, y) => y.disc - x.disc).slice(0, 8)) log(JSON.stringify(o));
  }
  if (MODE === 'film') {
    // A real film of a real song, all this family: what the rehearsal makes of it, a sheet of it, and 60 fps scans at every boundary. SONG=media/ppp.mp3 [SEED=7] [FROM SECS]
    const song = process.env.SONG || 'media/ppp.mp3', name = basename(song).replace(/\.\w+$/, '');
    const data = { items: [], files: [resolve(song)], dragOperationsMask: 1 };
    await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 640, y: 360, data });
    await page.send('Input.dispatchDragEvent', { type: 'drop', x: 640, y: 360, data });
    for (let i = 0; i < 600; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await new Promise(r => setTimeout(r, 100)); }
    const info = await page.eval(async seed => {
      app.ui.song.show(false); document.querySelector('#hints').hidden = true; app.song.pause?.(); app.manual = true;
      app.song.rebuild({ family: 'riley', quiet: true, ...(seed ? { seed } : {}) });
      const m = await import(new URL('src/music/rehearse.js', location.href).href), s = app.song.score;
      const x = await m.rehearse(s, s.song.duration);
      return { family: s.family, bpm: s.song.bpm, meter: s.song.meter, dur: s.song.duration, jumps: x.jumps?.slice(0, 8), bad: x.bad, seconds: +x.seconds.toFixed(1),
        g: s.gestures.map(g => [+g.t0.toFixed(1), +g.t1.toFixed(1), g.pattern.id, +(g.morph || 0).toFixed(1), g.range?.map(v => +v.toFixed(2))]) };
    }, +(process.env.SEED || 0));
    log(JSON.stringify({ ...info, g: undefined })); for (const g of info.g) log(JSON.stringify(g));
    if (process.env.AT) {
      const q = await page.eval(at => { const T = trippee, W = 480, H = 270, c = document.createElement('canvas'); c.width = 4 * W; c.height = 2 * H; const g = c.getContext('2d'); g.font = '12px monospace';
        for (let i = 0; i < 8; i++) { const t = at + (i - 5) / 60; T.seek(t); g.drawImage(T.canvas, (i % 4) * W, (i / 4 | 0) * H, W - 1, H - 1); g.fillStyle = '#f22'; g.fillText(`${(i - 5)}/60 ${app.lastFrame.kind ?? 'plain'} x ${(app.lastFrame.T ?? 0).toFixed(4)} ${app.lastFrame.G.pattern.id}`, (i % 4) * W + 3, (i / 4 | 0) * H + 13); }
        return c.toDataURL('image/jpeg', 0.85); }, +process.env.AT);
      save(`film-${name}.at.jpg`, q); log('errors', page.logs.filter(l => /\[error\]|\[exception\]/.test(l)).slice(0, 5)); return;
    }
    const r = await page.eval(async ({ from, secs, every }) => {
      const T = trippee, W = 160, H = 90, cols = 12, n = Math.ceil(secs / every), TW = 160, TH = 90;
      const sheet = document.createElement('canvas'); sheet.width = cols * TW; sheet.height = Math.ceil(n / cols) * TH; const sg = sheet.getContext('2d'); sg.font = '11px monospace';
      for (let i = 0; i < n; i++) { const t = from + i * every; T.seek(t); sg.drawImage(T.canvas, (i % cols) * TW, (i / cols | 0) * TH, TW - 1, TH - 1); sg.fillStyle = '#f22'; sg.fillText(`${t.toFixed(0)} ${app.lastFrame.kind ?? ''}`, (i % cols) * TW + 3, (i / cols | 0) * TH + 12); }
      const url = sheet.toDataURL('image/jpeg', 0.82);
      const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
      const grab = t => { T.seek(t); g.drawImage(T.canvas, 0, 0, W, H); return g.getImageData(0, 0, W, H).data; };
      const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]); return s / (a.length / 4); };
      const s = app.song.score, out = [];
      for (const G of s.gestures) {
        if (!G.morph) continue;
        for (const [what, at] of [['start', G.t1 - G.morph], ['end', G.t1]]) {
          const ds = []; let prev = grab(at - 0.5);
          for (let k = 1; k <= 60; k++) { const f = grab(at - 0.5 + k / 60); ds.push(diff(prev, f)); prev = f; }
          const sorted = [...ds].sort((a, b) => a - b), med = sorted[30], top = sorted[59];
          out.push({ what, at: +at.toFixed(2), from: G.pattern.id, kind: (T.seek(G.t1 - 0.5), app.lastFrame.kind), med: +med.toFixed(2), top: +top.toFixed(2), ratio: +(top / Math.max(med, 0.5)).toFixed(2), when: +(ds.indexOf(top) / 60 - 0.5).toFixed(3) });
          await new Promise(r => setTimeout(r));
        }
      }
      return { url, out, gl: app.R.gl.getError() };
    }, { from: +(process.env.FROM || 0), secs: +(process.env.SECS || 180), every: +(process.env.EVERY || 1) });
    save(`film-${name}.jpg`, r.url);
    const worst = [...r.out].sort((a, b) => b.ratio - a.ratio);
    log('boundaries', r.out.length, 'over 3x', worst.filter(o => o.ratio > 3).length, 'gl', r.gl);
    for (const o of worst.slice(0, 12)) log(JSON.stringify(o));
  }
  if (MODE === 'ab') {
    // The same frames through two copies of the shader, alternating in one page at 3024x1964, so whatever else the machine is doing falls on both. A=/lab-out/x/ B=/lab-out/y/ (trees served beside this one)
    const r = await page.eval(async ({ A, B, ids }) => {
      const mk = async u => { const M = await import(u + 'src/gl/renderer.js'), c = document.createElement('canvas'); c.width = 3024; c.height = 1964; const R = new M.Renderer(c); await R.whenReady(); return R; };
      const Ra = await mk(A), Rb = await mk(B), T = trippee, px = new Uint8Array(4);
      const time = R => { const gl = R.gl; gl.finish(); const t0 = performance.now(); R.draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
      const list = ids.length ? ids : T.list().filter(p => p.family !== 'riley' && p.family !== 'coins' && p.family !== 'dials').map(p => p.id);
      const as = [], bs = [];
      for (const id of list) {
        let ba = 1e9, bb = 1e9;
        for (const u of [.25, .5, .75]) {
          T.still(id, u);
          for (const R of [Ra, Rb]) { R.slotA.set(app.R.slotA); R.slotB.set(app.R.slotB); R.frame.set(app.R.frame); }
          time(Ra); time(Rb);
          for (let k = 0; k < 4; k++) { ba = Math.min(ba, time(Ra)); bb = Math.min(bb, time(Rb)); }
        }
        as.push(ba); bs.push(bb);
        await new Promise(r => setTimeout(r));
      }
      const med = a => [...a].sort((x, y) => x - y)[a.length >> 1];
      return { n: list.length, A: +med(as).toFixed(2), B: +med(bs).toFixed(2), rise: +(100 * (med(bs) / med(as) - 1)).toFixed(1), perB: list.map((id, i) => [id, +as[i].toFixed(1), +bs[i].toFixed(1)]).sort((x, y) => (y[2] / y[1]) - (x[2] / x[1])).slice(0, 6) };
    }, { A: process.env.A, B: process.env.B, ids: (process.env.IDS || '').split(',').filter(Boolean) });
    log(JSON.stringify(r));
  }
  if (MODE === 'flag') {
    // With its flag off a pattern is out of films and the wander, and with all of them off no film has any
    const r = await page.eval(async () => {
      const F = await import(new URL('src/score/flags.js', location.href).href), ids = () => app.patterns.filter(p => p.family === 'riley' && p.pool !== false).map(p => p.id), out = { on: ids().length };
      for (const f of ['blaze', 'octagrid', 'metamorphosis', 'labyrinth', 'snap']) { F.setFlag(f, false); out[f] = ids().length; F.setFlag(f, true); }
      F.setAllFlags(false); out.all = ids().length; F.setAllFlags(true);
      return out;
    });
    log(JSON.stringify(r));
  }
  log('errors', page.logs.filter(l => /\[error\]|\[exception\]/.test(l)).slice(0, 5));
};
