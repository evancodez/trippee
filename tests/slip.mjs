// The Countdown and the slip, on a hand-made gesture. No song here, so no pulse: the shape of the move and nothing else.
//   STAGE=dials,run,reads,closure,crops,lock,cost node tools/lab.mjs tests/slip.mjs --out lab-out/slip
//   DIAL=dials.board BPM=120
import { watch, analyse } from '../tools/look.mjs';
const STAGES = (process.env.STAGE || 'dials,run,reads,closure').split(',');
const DIAL = process.env.DIAL || 'dials.board', BPM = +(process.env.BPM || 120);
const DIALS = ['dials.board', 'dials.target', 'dials.rooms', 'dials.diamonds', 'dials.sectors', 'dials.sunburst'];

// On the page: a score of one Countdown, and a plain lead-in. Bars at 2 s if BPM is 120. L is the downbeat.
const setup = (dial, bpm, L) => `
  (async () => {
    const { countdown } = await import('/src/score/moves/slip.js');
    const s = window.app.stage, tau = t => t * ${bpm} / 60, phi = t => tau(t) / 8;
    s.score = { gestures: [], phi: (t, G) => phi(t), tau, song: null, handover: null };
    const G = countdown(window.app.byId[${JSON.stringify(dial)}], { L: ${L}, score: s.score, meter: 4, t1: ${L} + 30, seed: 3 });
    G.t0 = Math.min(G.t0, 0);
    s.score.gestures = [G]; s.hold = true; s.score.handover = null;
    window.__G = G; console.log('countdown', JSON.stringify({ T: G.moves[0].T, step: G.moves[0].step, runSeconds: G.moves[0].T * 60 / ${bpm}, t0: G.t0 })); window.app.t = 0; window.trippee.seek(0);
  })()`;

export default async ({ page, save, log, sleep }) => {
  for (let i = 0; i < 400 && !(await page.eval('window.trippee?.ready===true')); i++) await new Promise(r => setTimeout(r, 100));
  await page.eval(`app.governor.enabled=false; document.querySelector('#hints')&&(document.querySelector('#hints').hidden=true);`);
  const L = +(process.env.L || 20);

  if (STAGES.includes('dials')) {
    // Each dial whole, broken a little after the shatter, in the middle of the run, and at the end
    const r = await page.eval(async ({ DIALS, L, setupStrs }) => {
      const W = 320, H = 180, times = [0.2, 3, 10, 16, 19, L];
      const c = document.createElement('canvas'); c.width = W * times.length; c.height = H * DIALS.length; const g = c.getContext('2d');
      for (let d = 0; d < DIALS.length; d++) {
        await (0, eval)(setupStrs[d]);
        for (let k = 0; k < times.length; k++) { const t = times[k]; window.trippee.seek(t); g.drawImage(window.app.canvas, k * W, d * H, W, H); }
      }
      return c.toDataURL('image/jpeg', .9);
    }, { DIALS, L, setupStrs: DIALS.map(d => setup(d, BPM, L)) });
    save('dials.jpg', r);
  }
  if (STAGES.includes('run')) {
    const w = await watch(page, save, { name: `run-${DIAL}`, seconds: L + 4, fps: 12, cols: 12, rows: 8, setup: setup(DIAL, BPM, L) });
    log('run', JSON.stringify(analyse(w)));
    log(page.logs.filter(l => /countdown/.test(l)).at(-1));
  }
  if (STAGES.includes('reads')) {
    // Correlation with what the whole board is at that moment (the camera's moving, so the final frame itself is a different size), and with the final frame, at each bar line
    const r = await page.eval(async ({ L, bpm, s }) => {
      await (0, eval)(s);
      const W = 320, H = 180, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
      const grab = t => { window.trippee.seek(t); g.drawImage(window.app.canvas, 0, 0, W, H); return g.getImageData(0, 0, W, H).data; };
      const corr = (d, f) => { let a = 0, b = 0, ab = 0, aa = 0, bb = 0, n = 0; for (let i = 0; i < d.length; i += 4) { const x = d[i], y = f[i]; a += x; b += y; ab += x * y; aa += x * x; bb += y * y; n++; } return (ab - a * b / n) / Math.sqrt((aa - a * a / n) * (bb - b * b / n) + 1e-6); };
      const bar = 240 / bpm, m = window.__G.moves[0], keep = m.lockT, whole = [], fin = [], f = grab(L);
      for (let t = L - 9 * bar; t <= L + 1e-3; t += bar) {
        const on = grab(t); m.lockT = -1e6; const off = grab(t); m.lockT = keep;
        whole.push(+corr(on, off).toFixed(3)); fin.push(+corr(on, f).toFixed(3));
      }
      return { whole, fin };
    }, { L, bpm: BPM, s: setup(DIAL, BPM, L) });
    log('corr with the whole board at each bar', r.whole.join(' '));
    log('corr with the final frame at each bar', r.fin.join(' '));
    const steps = a => { let n = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[i - 1] + 0.02) n++; return n; };
    log('rises', steps(r.whole), 'against the whole board,', steps(r.fin), 'against the final frame');
  }
  if (STAGES.includes('crops')) {
    // 2x crops of curved cuts, at DSF 1 and 2
    const dsfs = (process.env.DSFS || '1,2').split(',').map(Number);
    for (const dsf of dsfs) {
      await page.eval('window.trippee.run()');
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: dsf, mobile: false });
      await new Promise(r => setTimeout(r, 800));
      const r = await page.eval(async ({ DIALS, L, setupStrs, times, duty }) => {
        app.edits.duty = duty;
        const out = [], cw = 320, ch = 180, zoom = 2;
        const c = document.createElement('canvas'); c.width = cw * zoom * times.length; c.height = ch * zoom * DIALS.length; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
        for (let d = 0; d < DIALS.length; d++) {
          await (0, eval)(setupStrs[d]);
          for (let k = 0; k < times.length; k++) {
            window.trippee.seek(times[k]);
            const src = window.app.canvas, D = src.width / 1280, sx = src.width * .5 + 40 * D, sy = src.height * .5 - 130 * D;
            g.drawImage(src, sx, sy, cw, ch, k * cw * zoom, d * ch * zoom, cw * zoom, ch * zoom);
          }
        }
        return { w: window.app.canvas.width, url: c.toDataURL('image/png') };
      }, { DIALS: (process.env.CROPS || DIALS.join()).split(','), L, setupStrs: (process.env.CROPS || DIALS.join()).split(',').map(d => setup(d, BPM, L)), times: [7, 11], duty: +(process.env.DUTY || 0) });
      log('crop at', dsf, r.w);
      save(`crops${process.env.DUTY ? '-duty' : ''}-dsf${dsf}.png`, r.url);
    }
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  }
  if (STAGES.includes('near')) {
    // Close frames of the moves themselves: the shatter, a ring locking, the last lock and what comes after. FROM,SECS,EVERY in seconds
    const FROM = +(process.env.FROM || 1.8), SECS = +(process.env.SECS || 1.6), COLS = 8, ROWS = +(process.env.ROWS || 4);
    const r = await page.eval(async ({ s, FROM, SECS, COLS, ROWS }) => {
      await (0, eval)(s);
      const W = 240, H = 135, c = document.createElement('canvas'); c.width = W * COLS; c.height = H * ROWS; const g = c.getContext('2d'); g.font = '12px monospace';
      const n = COLS * ROWS;
      for (let i = 0; i < n; i++) { const t = FROM + SECS * i / (n - 1); window.trippee.seek(t); g.drawImage(window.app.canvas, (i % COLS) * W, (i / COLS | 0) * H, W, H); g.fillStyle = '#f22'; g.fillText(t.toFixed(2), (i % COLS) * W + 3, (i / COLS | 0) * H + 12); }
      return c.toDataURL('image/jpeg', .9);
    }, { s: setup(DIAL, BPM, L), FROM, SECS, COLS, ROWS });
    save(process.env.NAME || 'near.jpg', r);
  }
  if (STAGES.includes('song')) {
    // On a real song: a composed film with a Countdown put into it by hand, the way the director will.
    const { resolve } = await import('node:path');
    const song = process.env.SONG || 'media/ppp.mp3', d = process.env.DIAL || 'dials.board';
    const data = { items: [], files: [resolve(song)], dragOperationsMask: 1 };
    await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 640, y: 360, data });
    await page.send('Input.dispatchDragEvent', { type: 'drop', x: 640, y: 360, data });
    for (let i = 0; i < 1200; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await new Promise(r => setTimeout(r, 100)); }
    const info = await page.eval(async ({ d, after }) => {
      const { placeCountdown } = await import('/src/score/moves/slip.js');
      app.ui.song.show(false); const h = document.querySelector('#hints'); if (h) h.hidden = true;
      app.governor.enabled = false;
      const score = app.song.score, land = score.landings.find(l => l.B >= after) ?? score.landings.at(-1);
      const G = placeCountdown(score, app.byId[d], { L: land.B, meter: score.song.meter ?? 4, seed: 3 });
      window.__G = G; window.__A = score.gestures[score.gestures.indexOf(G) - 1]; window.__N = score.gestures[score.gestures.indexOf(G) + 1];
      app.song.pause?.();
      return { L: land.B, kindL: land.kind, t0: G.t0, t1: G.t1, morphIn: __A.morph, morphOut: G.morph, bpm: score.song.bpm, meter: score.song.meter, T: G.moves[0].T, step: G.moves[0].step, Ap: __A.pattern.id, Np: __N?.pattern.id, film: score.gestures.length, score: Object.keys(score).join() };
    }, { d, after: +(process.env.AFTER || 40) });
    log('placed', JSON.stringify(info));
    log('L in beats', await page.eval('(() => { const s = app.song.score, L = window.__G.moves[0].lockT, b = s.tau(L); return { beats: +b.toFixed(3), inBar: +(b % (s.song.meter ?? 4)).toFixed(3) }; })()'));
    // The tune in the loose rings: the table with it against without it, through the run
    log('tune', JSON.stringify(await page.eval(async () => {
      const { fillSlot } = await import('/src/score/slot.js'), { OFF, SLOT_FLOATS } = await import('/src/pattern/layout.js');
      const G = window.__G, m = G.moves[0], R = m.react, a = new Float32Array(SLOT_FLOATS), b = new Float32Array(SLOT_FLOATS), names = ['slip.left', 'slip.step', 'slip.ease', 'slip.seed', 'spare.a', 'spare.b', 'spare.c', 'spare.d'];
      const rows = [], score = app.song.score; let top = 0, sum = 0, n = 0;
      for (let t = G.t0 + 1; t < m.hold.t; t += 0.25) {
        const phi = score.phi(t, G);
        m.react = R; fillSlot(a, G, t, G.pattern, { phi }); m.react = null; fillSlot(b, G, t, G.pattern, { phi }); m.react = R;
        const d = names.map(k => a[OFF[k]] - b[OFF[k]]);
        for (const v of d) { top = Math.max(top, Math.abs(v)); sum += Math.abs(v); n++; }
        if (rows.length < 8 && Math.round(t * 4) % 16 === 0) rows.push([+t.toFixed(1), ...d.map(v => +v.toFixed(2))]);
      }
      return { hasC: !!R?.C, top: +top.toFixed(3), mean: +(sum / n).toFixed(3), rows };
    })));
    const name = process.env.NAME || 'song';
    const from = info.t0 - info.morphIn - 1, secs = info.L + 8 - from;
    await page.eval(`app.edits.reactAmt=${+(process.env.REACT ?? 1)}`);
    const w = await watch(page, save, { name, seconds: secs, fps: 12, cols: 10, rows: 8, setup: `window.trippee.seek(${from})` });
    log('whole', JSON.stringify(analyse(w)));
    // At 60 fps around every boundary
    const windows = { flightIn: [info.t0 - info.morphIn - 0.5, info.morphIn + 1.5], shatter: [info.t0 - 0.5, 3], lock: [info.L - 1.5, 3], release: [info.L, 3], flightOut: [info.t1 - info.morphOut - 0.5, info.morphOut + 1.5] };
    for (const k in windows) {
      const [a, len] = windows[k];
      const r = await page.eval(async ({ a, len }) => {
        const W = 320, H = 180, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
        window.trippee.seek(a); g.drawImage(app.canvas, 0, 0, W, H); let prev = g.getImageData(0, 0, W, H).data; const ds = [];
        for (let i = 1; i < len * 60; i++) { window.trippee.step(1 / 60); g.drawImage(app.canvas, 0, 0, W, H); const d = g.getImageData(0, 0, W, H).data; let s = 0; for (let k = 0; k < d.length; k += 4) s += Math.abs(d[k] - prev[k]); ds.push(s / (W * H)); prev = d; }
        return ds;
      }, { a, len });
      const sorted = [...r].sort((x, y) => x - y), med = sorted[sorted.length >> 1], mx = sorted.at(-1), at = a + (r.indexOf(mx) + 1) / 60;
      let worstStep = 0; r.forEach((v, i) => { if (i > 0 && i < r.length - 1) { const m = (r[i - 1] + r[i + 1]) / 2; if (v - m > worstStep) worstStep = v - m; } });
      log(k, 'median', med.toFixed(2), 'max', mx.toFixed(2), 'at', at.toFixed(2), 'worst spike over neighbours', worstStep.toFixed(2));
    }
    log('errors', page.logs.filter(l => /\[error\]|\[exception\]/.test(l)).slice(0, 5));
  }
  if (STAGES.includes('lock')) {
    // Lock, by hand, on whatever's asked: 8 bars at 120, starting at 2 s
    for (const id of (process.env.LOCK || 'lines.fall,checks.crush,dials.sunburst').split(',')) {
      const su = `(async () => {
        const { lockMove } = await import('/src/score/moves/slip.js');
        const { flatten } = await import('/src/pattern/genome.js');
        const s = app.stage, tau = t => t * 2, pat = app.byId[${JSON.stringify(id)}];
        s.score = { gestures: [], phi: t => tau(t) / 8, tau, song: null, handover: null };
        const G = { t0: -5, t1: 600, arcEnd: 60, pattern: pat, range: [0.4, 0.4], fixedRange: true, freezeU: null };
        const slot = flatten(pat.g); G.moves = [lockMove(slot, { t: 2, tau, smallest: 1 })];
        console.log(JSON.stringify(G.moves[0], (k, v) => k === 'lock' || typeof v === 'function' ? undefined : v));
        s.score.gestures = [G]; s.hold = true; app.t = 0; trippee.seek(0);
      })()`;
      const w = await watch(page, save, { name: `lock-${id}`, seconds: 20, fps: 12, cols: 12, rows: 6, setup: su });
      log(id, JSON.stringify(analyse(w)));
    }
    log(page.logs.filter(l => /kind/.test(l)).join(' '));
  }
  if (STAGES.includes('cost')) {
    // The same page, the same frame: the program as it is against one with the slip stubbed out. W H DSF as tests/fps.mjs.
    const W = +(process.env.W || 1920), H = +(process.env.H || 1080), DSF = +(process.env.DSF || 1);
    await page.eval('window.trippee.run()');
    await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DSF, mobile: false });
    await new Promise(r => setTimeout(r, 800));
    const r = await page.eval(async ({ ids }) => {
      const { FRAG, VERT } = await import('/src/gl/shader.js');
      const R = app.R, gl = R.gl, px = new Uint8Array(4);
      const stub = FRAG.replace('\n', '\n#define NOSLIP\n');
      const mk = t => { const s = gl.createShader(t === 0 ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER); gl.shaderSource(s, t === 0 ? VERT : stub); gl.compileShader(s); return s; };
      const pr = gl.createProgram(), fs = mk(1); gl.attachShader(pr, mk(0)); gl.attachShader(pr, fs); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return { err: gl.getShaderInfoLog(fs) };
      gl.uniformBlockBinding(pr, gl.getUniformBlockIndex(pr, 'Block'), 0); gl.useProgram(pr); gl.uniform1i(gl.getUniformLocation(pr, 'uPush'), 0);
      const real = R.progs[0], out = {};
      const once = () => { gl.finish(); const t0 = performance.now(); window.trippee.step(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
      for (const id of ids) {
        window.trippee.load(id); app.manual = true; app.t = 13; once();
        const A = [], B = [];
        for (let i = 0; i < 40; i++) { R.progs[0] = real; R.prog = real; A.push(once()); R.progs[0] = pr; R.prog = pr; B.push(once()); }
        R.progs[0] = real; R.prog = real;
        const med = v => [...v].sort((x, y) => x - y)[v.length >> 1];
        out[id] = { real: +med(A).toFixed(2), stub: +med(B).toFixed(2) };
      }
      return { size: [app.canvas.width, app.canvas.height], out };
    }, { ids: (process.env.IDS || 'lines.river,checks.crush,lattice.master,dials.board').split(',') });
    log('cost', JSON.stringify(r));
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  }
  if (STAGES.includes('robust')) {
    // Things that can happen in the middle of a Countdown. Each: steps at 60 fps, the biggest frame-to-frame spike over its neighbours, what's showing after.
    const scan = async (name, act, secs) => {
      await page.eval(setup(DIAL, BPM, L));
      const r = await page.eval(async ({ act, secs }) => {
        const W = 320, H = 180, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
        window.trippee.seek(9); g.drawImage(app.canvas, 0, 0, W, H); let prev = g.getImageData(0, 0, W, H).data; const ds = [];
        (0, eval)(act);
        let sheet = document.createElement('canvas'); sheet.width = 240 * 8; sheet.height = 135 * 3; const gs = sheet.getContext('2d'); const every = Math.floor(secs * 60 / 24); let n = 0;
        for (let i = 0; i < secs * 60; i++) { window.trippee.step(1 / 60); g.drawImage(app.canvas, 0, 0, W, H); if (i % every === 0 && n < 24) { gs.drawImage(app.canvas, (n % 8) * 240, (n / 8 | 0) * 135, 240, 135); n++; } const d = g.getImageData(0, 0, W, H).data; let s = 0; for (let k = 0; k < d.length; k += 4) s += Math.abs(d[k] - prev[k]); ds.push(s / (W * H)); prev = d; }
        let spike = 0, at = 0; ds.forEach((v, i) => { if (i > 0 && i < ds.length - 1) { const m = (ds[i - 1] + ds[i + 1]) / 2; if (v - m > spike) { spike = v - m; at = i; } } });
        const sorted = [...ds].sort((a, b) => a - b);
        return { median: +sorted[ds.length >> 1].toFixed(2), max: +sorted.at(-1).toFixed(2), spike: +spike.toFixed(2), at: +(9 + at / 60).toFixed(2), showing: app.lastFrame?.G?.pattern?.id, morphing: app.lastFrame?.kind, sheet: sheet.toDataURL('image/jpeg', .85) };
      }, { act, secs });
      save(`robust-${name}.jpg`, r.sheet); delete r.sheet;
      log(name, JSON.stringify(r));
    };
    await scan('pick', "app.stage.pick('lines.river', app.pictureT())", 12);
    await scan('beyond', "app.beyond.on(); app.beyond.snap(0.6)", 12);
    await scan('static', "app.stage.setStatic(true, app.pictureT())", 12);
    await page.eval('app.beyond.off(); app.beyond.snap(null)');
    await scan('flagoff', "import('/src/score/flags.js').then(f=>f.setFlag('slip',false))", 4);
    await page.eval("import('/src/score/flags.js').then(f=>f.setFlag('slip',true))");
    log('errors', page.logs.filter(l => /\[error\]|\[exception\]/.test(l)).slice(0, 5));
  }
  if (STAGES.includes('idle')) {
    // A dial by itself, as picked from the library
    const w = await watch(page, save, { name: 'idle', seconds: 30, fps: 12, cols: 12, rows: 5, setup: "window.trippee.load('dials.board',{sweep:true,len:44})" });
    log('idle', JSON.stringify(analyse(w)));
  }
  if (STAGES.includes('big')) {
    // Full size, by eye
    await page.eval(setup(DIAL, BPM, L));
    for (const t of (process.env.TIMES || '3.5,7,12,17,19.5,20.8').split(',').map(Number)) {
      const url = await page.eval(`(window.trippee.seek(${t}), window.trippee.canvas.toDataURL('image/jpeg', .92))`);
      save(`big-${DIAL}-${t}.jpg`, url);
    }
  }
  if (STAGES.includes('rehearse')) {
    // The film's rehearsal, with a Countdown in the film, as the director will leave it
    const { resolve } = await import('node:path');
    const data = { items: [], files: [resolve(process.env.SONG || 'media/ppp.mp3')], dragOperationsMask: 1 };
    await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 640, y: 360, data });
    await page.send('Input.dispatchDragEvent', { type: 'drop', x: 640, y: 360, data });
    for (let i = 0; i < 1200; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await new Promise(r => setTimeout(r, 100)); }
    log('rehearse', JSON.stringify(await page.eval(async ({ after }) => {
      const { placeCountdown } = await import('/src/score/moves/slip.js'), { rehearse } = await import('/src/music/rehearse.js');
      const score = app.song.score, land = score.landings.find(l => l.B >= after) ?? score.landings.at(-1);
      const G = placeCountdown(score, app.byId['dials.board'], { L: land.B, meter: score.song.meter ?? 4, seed: 3 });
      for (const g of score.gestures) { delete g.plan; delete g.planFor; delete g.planning; }
      const t0 = performance.now();
      const r = await rehearse(score, 1200);
      return { placed: !!G, seconds: +((performance.now() - t0) / 1000).toFixed(1), sitOut: r.sitOut, bad: r.bad, jumps: r.jumps?.length, ways: r.ways?.length, stillThere: score.gestures.includes(G), range: G.range };
    }, { after: +(process.env.AFTER || 40) })));
    log('errors', page.logs.filter(l => /\[error\]|\[exception\]/.test(l)).slice(0, 5));
  }
  if (STAGES.includes('closure')) {
    // At the lock against slip off; before the shatter against slip off
    const r = await page.eval(async ({ L, s, DIALS, setupStrs, bpm }) => {
      window.__OFF = (await import('/src/pattern/layout.js')).OFF;
      const W = 640, H = 360, out = {};
      const gl = window.app.R.gl;
      const px = t => { window.trippee.seek(t); const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(window.app.canvas, 0, 0, W, H); return g.getImageData(0, 0, W, H).data; };
      for (let d = 0; d < DIALS.length; d++) {
        await (0, eval)(setupStrs[d]);
        const G = window.__G, m = G.moves[0];
        const sl = G.pattern.slip, kind = sl.kind, beat = 60 / bpm;
        const both = t => { const on = px(t), keep = m.lockT; m.lockT = -1e6; const off = px(t); m.lockT = keep; return [on, off]; };
        const diff = (a, b, mask) => { let s = 0, n = 0, mx = 0; for (let i = 0; i < a.length; i += 4) { if (mask && !mask[i >> 2]) continue; const e = Math.abs(a[i] - b[i]); s += e; n++; if (e > mx) mx = e; } return [+(s / Math.max(n, 1)).toFixed(4), mx]; };
        const [on0, off0] = both(L), [on9, off9] = both(L - 1 / 60);
        const bands = [];
        if (kind === 2 || kind === 3) {
          // Each ring, in its own annulus: a beat before it locks, a frame before, on its beat, and a frame after
          const nb = sl.bands, scale = t => { window.trippee.seek(t); return window.app.R.slotA[window.__OFF.scale]; };
          for (let i = 0; i < nb; i++) {
            const tl = L - i * m.step * beat, sc = scale(tl), q = G.pattern.g['p1.q'] ?? 0;
            const inner = kind === 2 ? i / sl.n : Math.exp(i / sl.n - 2), outer = kind === 2 ? (i + 1) / sl.n : Math.exp((i + 1) / sl.n - 2);
            const mask = new Uint8Array(W * H);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
              const X = (x + .5 - W / 2) / H * 2, Y = -(y + .5 - H / 2) / H * 2;
              const r = q > 0 ? Math.max(Math.abs(X), Math.abs(Y)) : q < 0 ? (Math.abs(X) + Math.abs(Y)) * .70711 : Math.hypot(X, Y);
              if (r / sc > inner + .01 && r / sc < outer - .01) mask[y * W + x] = 1;
            }
            const row = [];
            for (const dt of [-beat, -1 / 60, 0, 1 / 60]) { const [a, b] = both(tl + dt); row.push(diff(a, b, mask)[0]); }
            bands.push(row);
          }
        }
        if (kind === 4) {
          // Each wedge, round the clock
          for (let i = 0; i < sl.bands; i++) {
            const tl = L - i * m.step * beat, mask = new Uint8Array(W * H);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
              const X = (x + .5 - W / 2) / H * 2, Y = -(y + .5 - H / 2) / H * 2, e = sl.n * (Math.atan2(Y, X) / (2 * Math.PI) + .5), f = e - Math.floor(e);
              if (Math.floor(e) % sl.n === i && f > .05 && f < .95) mask[y * W + x] = 1;
            }
            const row = [];
            for (const dt of [-beat, -1 / 60, 0, 1 / 60]) { const [a, b] = both(tl + dt); row.push(diff(a, b, mask)[0]); }
            bands.push(row);
          }
        }
        out[DIALS[d]] = { atLock: diff(on0, off0), frameBefore: diff(on9, off9), bands };
      }
      return out;
    }, { L, s: setup(DIAL, BPM, L), DIALS, setupStrs: DIALS.map(d => setup(d, BPM, L)), bpm: BPM });
    // Lock: a frame before bar 8 against slip off, and on it
    log('lock closure', JSON.stringify(await page.eval(async ({ ids }) => {
      const { lockMove } = await import('/src/score/moves/slip.js'), { flatten } = await import('/src/pattern/genome.js');
      const W = 640, H = 360, out = {}, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
      const px = t => { window.trippee.seek(t); g.drawImage(app.canvas, 0, 0, W, H); return g.getImageData(0, 0, W, H).data; };
      const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]); return +(s / (W * H)).toFixed(4); };
      for (const id of ids) {
        const st = app.stage, tau = t => t * 2, pat = app.byId[id];
        st.score = { gestures: [], phi: t => tau(t) / 8, tau, song: null, handover: null };
        const G = { t0: -5, t1: 600, arcEnd: 60, pattern: pat, range: [0.4, 0.4], fixedRange: true };
        G.moves = [lockMove(flatten(pat.g), { t: 2, tau, smallest: 1 })];
        st.score.gestures = [G]; st.hold = true; app.t = 0; window.trippee.seek(0);
        const row = {};
        for (const [k, t] of [['bar4', 10], ['frameBefore', 18 - 1 / 60], ['lock', 18]]) { const a = px(t), keep = G.moves; G.moves = [{ id: 'none' }]; const b = px(t); G.moves = keep; row[k] = diff(a, b); }
        out[id] = row;
      }
      return out;
    }, { ids: ['dials.sunburst', 'checks.crush', 'lines.squeeze'] })));
    for (const d in r) { log(d, 'at the lock', r[d].atLock, 'a frame before', r[d].frameBefore); for (let i = 0; i < r[d].bands.length; i++) log('  ring', i, 'a beat before, a frame before, on the beat, a frame after', r[d].bands[i].join(' ')); }
  }
};
