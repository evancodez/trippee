// Lane I: River and Arcade. node tools/lab.mjs tests/impossible.mjs --size 1920,1080 --out lab-out/i
//   MODE=grid  SHOTS='[["id",{"path":v},u],...]'   a sheet of stills with the knobs set, for looking
//   MODE=move  ID=a LEN=26 SECS=20 FPS=4           a sheet and slices of one whole gesture
//   MODE=close                                     field.ph+period changes no pixels, on each, at several places
//   MODE=hit                                       does the fold finish? how grey, how white, across a long run of the flow
//   MODE=cost                                      GPU cost against plain neighbours, in the same page
//   MODE=pairs [OTHERS=a,b]                        pops at the ends of morphs, the biggest step in one, and any flat shape on the way (the measure of tests/flat.mjs), into and out of each
//   MODE=film SONG=media/ppp.mp3 [SEED=7] [AT=s]   a real film with these in its pool: the rehearsal, a sheet, 60 fps scans at every boundary. Nothing is left in the pool after it
import { resolve, basename } from 'node:path';
import { watch, analyse } from '../tools/look.mjs';
const MODE = process.env.MODE || 'grid';
export default async ({ page, save, log }) => {
  await page.eval(`app.governor.enabled=false`);
  const ids = process.env.IDS ? process.env.IDS.split(',') : (await page.eval('trippee.list()')).filter(p => p.family === 'impossible').map(p => p.id);
  if (MODE === 'grid') {
    const shots = process.env.SHOTS ? JSON.parse(process.env.SHOTS) : ids.flatMap(id => [[id, {}, .2], [id, {}, .8]]);
    const cols = +(process.env.COLS || 2), sc = +(process.env.CELL || 960);
    const r = await page.eval(async ({ shots, cols, sc }) => {
      const { measure } = await import(new URL('src/music/rehearse.js', location.href).href), mc = document.createElement('canvas'); mc.width = 640; mc.height = 360; const mg = mc.getContext('2d', { willReadFrequently: true });
      const T = trippee, c = document.createElement('canvas'), ch = Math.round(sc * 9 / 16), rows = Math.ceil(shots.length / cols); c.width = cols * sc; c.height = rows * ch;
      const g = c.getContext('2d', { willReadFrequently: true }), out = []; g.font = '14px monospace';
      shots.forEach(([id, over, u, flowAt], i) => {
        app.edits.over = over || {};
        T.still(id, u ?? .5);
        const x = (i % cols) * sc, y = (i / cols | 0) * ch;
        g.drawImage(T.canvas, x, y, sc, ch);
        const d = g.getImageData(x, y, sc, ch).data; let w = 0, gr = 0; for (let k = 0; k < d.length; k += 4) { if (d[k] > 127) w++; if (d[k] > 48 && d[k] < 208) gr++; }
        mg.drawImage(T.canvas, 0, 0, 640, 360); const m = measure(mg.getImageData(0, 0, 640, 360).data, 640, 360);
        out.push({ id, white: +(w / (d.length / 4)).toFixed(3), grey: +(gr / (d.length / 4)).toFixed(3), why: m.why, tiles: m.tiles, fine: m.fine, edges: m.edges, area: +m.area.toFixed(2), disc: +m.disc.toFixed(2) });
        g.fillStyle = '#f22'; g.fillText(`${id} ${JSON.stringify(over)} u${u}`, x + 4, y + 16);
      });
      app.edits.over = {};
      return { url: c.toDataURL('image/jpeg', .88), out, W: T.canvas.width, H: T.canvas.height, gl: app.R.gl.getError() };
    }, { shots, cols, sc });
    save(`${process.env.TAG || 'grid'}.jpg`, r.url); log(r.W, r.H, 'gl', r.gl, JSON.stringify(r.out));
  }
  if (MODE === 'move') {
    const id = process.env.ID, len = +(process.env.LEN || 26), secs = +(process.env.SECS || 20), fps = +(process.env.FPS || 4);
    await page.eval(`trippee.load(${JSON.stringify(id)},{sweep:true,len:${len}})`);
    if (process.env.OVER) await page.eval(`app.edits.over=${process.env.OVER}`);
    const w = await watch(page, save, { name: id + (process.env.TAG || ''), seconds: secs, fps, cols: +(process.env.C || 8), rows: +(process.env.R || 5) });
    const a = analyse(w);
    log(id, JSON.stringify({ meanWhite: a.meanWhite, edges: a.edgeRange, greyMedian: a.medianGreyAtNativeRes, greyP95: a.p95GreyAtNativeRes, maxDiff: a.maxDiff, flash: a.flashesPerSecondWholeFrame }));
  }
  if (MODE === 'close') {
    // A whole cycle of the flow is an isometry of the tiling, so it must change nothing.
    const r = await page.eval(async ids => {
      const T = trippee, W = T.canvas.width, H = T.canvas.height, gl = app.R.gl, out = [];
      const read = () => { const b = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
      for (const id of ids) {
        // the shader wraps at ph .5 on the River and at a whole number on the Arcade: step across the wrap, by a hair, and against a real move of the same size well away from it
        const river = app.byId[id].g.field.kind === 1, at = river ? .5 : 1, e = 2e-4;
        for (const spin of river ? [0, .6, 1.3] : [0]) {
          const grab = p => { app.edits.over = { 'field.ph': p, 'field.spin': spin }; T.still(id, .5); return read(); };
          const d = (a, b) => { let ch = 0, sum = 0; for (let i = 0; i < W * H * 4; i += 4) { const v = Math.abs(a[i] - b[i]); if (v > 32) ch++; sum += v; } return { changed: +(100 * ch / (W * H)).toFixed(4), mean: +(sum / (W * H)).toFixed(4) }; };
          out.push({ id, spin, across: d(grab(at - e), grab(at + e)), away: d(grab(at + .25 - e), grab(at + .25 + e)), whole: d(grab(.3), grab(1.3)) });
        }
      }
      app.edits.over = {};
      return out;
    }, ids);
    for (const o of r) log(JSON.stringify(o));
  }
  if (MODE === 'cost') {
    const list = [...ids, ...(process.env.PLAIN || 'lines.fall,checks.cloth,riley.blaze,dots.inflate').split(',')];
    const r = await page.eval(ids => {
      const gl = app.R.gl, px = new Uint8Array(4), out = {};
      const measure = () => { gl.finish(); const t0 = performance.now(); trippee.step(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
      for (let pass = 0; pass < 3; pass++) for (const id of ids) { trippee.load(id); app.manual = true; const c = []; for (const u of [.1, .3, .5, .7, .9]) { app.t = 26 * u; measure(); c.push(Math.min(measure(), measure(), measure())); } out[id] = Math.min(out[id] ?? 1e9, +Math.max(...c).toFixed(2)); }
      return out;
    }, list);
    log(JSON.stringify(r));
  }
  if (MODE === 'ab') {
    // What having these in the program costs everything else that shares it: the same frames through two copies of the shader, alternating in one page at 3024x1964. A=/lab-out/i/base/ B=/
    const r = await page.eval(async ({ A, B, ids }) => {
      const mk = async u => { const M = await import(new URL(u + 'src/gl/renderer.js', location.href).href), c = document.createElement('canvas'); c.width = 3024; c.height = 1964; const R = new M.Renderer(c); await R.whenAllReady(); return R; };
      const Ra = await mk(A), Rb = await mk(B), T = trippee, px = new Uint8Array(4);
      const time = R => { const gl = R.gl; gl.finish(); const t0 = performance.now(); R.draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
      const as = [], bs = [], vars = [];
      for (const id of ids) {
        let ba = 1e9, bb = 1e9;
        for (const u of [.25, .5, .75]) {
          T.still(id, u);
          for (const R of [Ra, Rb]) { R.slotA.set(app.R.slotA); R.slotB.set(app.R.slotB); R.frame.set(app.R.frame); }
          time(Ra); time(Rb);
          for (let k = 0; k < 6; k++) { ba = Math.min(ba, time(Ra)); bb = Math.min(bb, time(Rb)); }
        }
        as.push(ba); bs.push(bb); vars.push(Rb.variant);
        await new Promise(r => setTimeout(r));
      }
      return ids.map((id, i) => [id, vars[i], +as[i].toFixed(2), +bs[i].toFixed(2), +(100 * (bs[i] / as[i] - 1)).toFixed(1)]);
    }, { A: process.env.A, B: process.env.B, ids: process.env.IDS.split(',') });
    for (const x of r) log(JSON.stringify(x));
  }
  if (MODE === 'pairs') {
    const others = (process.env.OTHERS || 'lines.fall,checks.cloth,dots.inflate,lattice.master,body.tube,rooms.room,pole.garden,waves.current,riley.blaze,riley.octagrid').split(',');
    const r = await page.eval(async ({ ids, others }) => {
      const T = trippee, W = 160, H = 90, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
      const grab = t => { T.seek(t); g.drawImage(T.canvas, 0, 0, W, H); return g.getImageData(0, 0, W, H).data; };
      const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]); return s / (a.length / 4); };
      const stack = new Int32Array(W * H), seen = new Uint8Array(W * H), dist = new Float32Array(W * H);
      const flat = d => {
        seen.fill(0); let best = 0;
        for (let i = 0; i < W * H; i++) { if (seen[i]) continue; const v = d[i * 4], col = v > 235 ? 1 : v < 20 ? 2 : 0; if (!col) continue;
          let top = 0, n = 0; stack[top++] = i; seen[i] = 1;
          while (top) { const k = stack[--top]; n++; const x = k % W, y = (k / W) | 0; for (const m of [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, y > 0 ? k - W : -1, y < H - 1 ? k + W : -1]) { if (m < 0 || seen[m]) continue; const u = d[m * 4], cu = u > 235 ? 1 : u < 20 ? 2 : 0; if (cu === col) { seen[m] = 1; stack[top++] = m; } } }
          if (n > best) best = n; }
        let disc = 0;
        for (const white of [true, false]) { for (let i = 0; i < W * H; i++) dist[i] = (white ? d[i * 4] > 235 : d[i * 4] < 20) ? 1e6 : 0;
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (x === 0 || y === 0 || x === W - 1 || y === H - 1) dist[i] = Math.min(dist[i], 1.5); if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1); if (y > 0) dist[i] = Math.min(dist[i], dist[i - W] + 1); }
          for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (x < W - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1); if (y < H - 1) dist[i] = Math.min(dist[i], dist[i + W] + 1); disc = Math.max(disc, dist[i]); } }
        return { area: best / (W * H), disc: disc / H };
      };
      const out = [];
      const one = (a, b) => {
        T.morph(a, b, 8, 1);
        const steady = diff(grab(5), grab(5.04)), s0 = diff(grab(.98), grab(1.02)), s1 = diff(grab(8.98), grab(9.02));
        let step = 0, at = 0, over = 0, area = 0, disc = 0, prev = grab(1);
        for (let t = 1.05; t < 9.1; t += .05) { const f = grab(t), d = diff(prev, f); if (d > step) { step = d; at = t; } const v = flat(f); if (v.area > .35 && v.disc > .25) over += .05; area = Math.max(area, v.area); disc = Math.max(disc, v.disc); prev = f; }
        return { a, b, kind: app.stage.score.gestures[0].plan?.kind, start: +s0.toFixed(1), end: +s1.toFixed(1), steady: +steady.toFixed(1), step: +step.toFixed(1), at: +at.toFixed(2), area: +area.toFixed(2), disc: +disc.toFixed(2), over: +over.toFixed(2) };
      };
      T.morph('lines.river', 'checks.vega', 8, 1); T.seek(5);
      for (const a of ids) { for (const o of others) { out.push(one(a, o)); out.push(one(o, a)); await new Promise(r => setTimeout(r)); } for (const o of ids) if (o !== a) { out.push(one(a, o)); await new Promise(r => setTimeout(r)); } }
      return { out, gl: app.R.gl.getError() };
    }, { ids, others });
    const pop = o => Math.max(o.start, o.end) > Math.max(2 * o.steady, 4), kinds = {};
    for (const o of r.out) kinds[o.kind] = (kinds[o.kind] || 0) + 1;
    log(JSON.stringify(kinds), 'pairs', r.out.length, 'gl', r.gl);
    log('popped', r.out.filter(pop).length); for (const o of r.out.filter(pop).sort((x, y) => Math.max(y.start, y.end) - Math.max(x.start, x.end)).slice(0, 14)) log(JSON.stringify(o));
    log('flat', r.out.filter(o => o.over > 0).length); for (const o of r.out.filter(o => o.over > 0).sort((x, y) => y.over - x.over).slice(0, 12)) log(JSON.stringify(o));
    log('worst step'); for (const o of [...r.out].sort((x, y) => y.step - x.step).slice(0, 8)) log(JSON.stringify(o));
  }
  if (MODE === 'film') {
    const song = process.env.SONG || 'media/ppp.mp3', name = basename(song).replace(/\.\w+$/, ''), only = process.env.ONLY !== '0';
    const data = { items: [], files: [resolve(song)], dragOperationsMask: 1 };
    await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 640, y: 360, data });
    await page.send('Input.dispatchDragEvent', { type: 'drop', x: 640, y: 360, data });
    for (let i = 0; i < 600; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await new Promise(r => setTimeout(r, 100)); }
    const info = await page.eval(async ({ seed, ids, only, want }) => {
      app.ui.song.show(false); document.querySelector('#hints').hidden = true; app.song.pause?.(); app.manual = true;
      for (const id of ids) Object.defineProperty(app.byId[id], 'pool', { value: true, configurable: true });
      app.song.rebuild({ ...(only ? { family: 'impossible' } : {}), quiet: true, ...(seed ? { seed } : {}), ...(want ? { pattern: want } : {}) });
      const m = await import(new URL('src/music/rehearse.js', location.href).href), s = app.song.score;
      const x = await m.rehearse(s, s.song.duration);
      window.__x = x;
      return { family: s.family, why: Object.keys(x).join(), bpm: s.song.bpm, meter: s.song.meter, dur: s.song.duration, jumps: x.jumps?.slice(0, 8), bad: x.bad, seconds: +x.seconds.toFixed(1),
        g: s.gestures.map(g => [+g.t0.toFixed(1), +g.t1.toFixed(1), g.pattern.id, +(g.morph || 0).toFixed(1), g.range?.map(v => +v.toFixed(2)), g.plan?.kind]) };
    }, { seed: +(process.env.SEED || 0), ids, only, want: process.env.ID });
    log(JSON.stringify({ ...info, g: undefined })); for (const g of info.g) log(JSON.stringify(g));
    log(JSON.stringify(await page.eval(() => (window.__x.rides ?? []).filter(n => /^impossible/.test(n.id)).map(n => [n.id, n.why, n.range, n.added, n.trimmed]))));
    log(JSON.stringify(await page.eval(() => app.song.score.gestures.filter(g => g.pattern.family === 'impossible').map(g => ({ id: g.pattern.id, arcs: g.arcs, what: g.change, over: g.over, thetaBody: !!g.thetaBody })))).slice(0, 1800));
    if (process.env.WHYONLY) return;
    if (process.env.ID && !process.env.AT) {
      // Watch one of them, song on, from where the film first wears it: a sheet and slices, the same way as tests/film.mjs looks
      const t0 = await page.eval(id => { const G = app.song.score.gestures.find(g => g.pattern.id === id); if (!G) return null; trippee.seek(G.t0 + 2); return G.t0 + 2; }, process.env.ID);
      if (t0 == null) { log('not in this film', process.env.ID); return; }
      const w = await watch(page, save, { name: `song-${process.env.ID}-${name}`, seconds: +(process.env.SECS || 20), fps: +(process.env.FPS || 12), cols: 8, rows: 5 });
      const a = analyse(w);
      log(process.env.ID, 'from', t0.toFixed(1), JSON.stringify({ meanWhite: a.meanWhite, edges: a.edgeRange, greyMedian: a.medianGreyAtNativeRes, greyP95: a.p95GreyAtNativeRes, maxDiff: a.maxDiff, flash: a.flashesPerSecondWholeFrame, tile: a.flashesPerSecondAnyTile }));
      return;
    }
    if (process.env.EDITS) await page.eval(`Object.assign(app.edits,${process.env.EDITS})`);
    if (process.env.MEL) await page.eval(`app.song.score.gestures.forEach(g=>{if(g.pattern.family==='impossible')g.melMode=${process.env.MEL}})`);
    if (process.env.AT) {
      const q = await page.eval(({ at, step }) => { const T = trippee, W = 480, H = 270, c = document.createElement('canvas'); c.width = 4 * W; c.height = 4 * H; const g = c.getContext('2d'); g.font = '12px monospace';
        for (let i = 0; i < 16; i++) { const t = at + i * step; T.seek(t); g.drawImage(T.canvas, (i % 4) * W, (i / 4 | 0) * H, W - 1, H - 1); g.fillStyle = '#f22'; g.fillText(`${t.toFixed(2)} ${app.lastFrame.kind ?? 'plain'} x ${(app.lastFrame.T ?? 0).toFixed(3)} ${app.lastFrame.G.pattern.id}`, (i % 4) * W + 3, (i / 4 | 0) * H + 13); }
        return c.toDataURL('image/jpeg', 0.85); }, { at: +process.env.AT, step: +(process.env.STEP || 1) });
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
        if (!G.morph || G.pattern.family !== 'impossible' && !(s.gestures[s.gestures.indexOf(G) + 1]?.pattern.family === 'impossible')) continue;
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
    log('boundaries', r.out.length, 'over 3x', worst.filter(o => o.ratio > 3).length, 'gl', r.gl, 'errors', page.logs.filter(l => /\[error\]|\[exception\]/.test(l)).slice(0, 5));
    for (const o of worst.slice(0, 12)) log(JSON.stringify(o));
  }
};
