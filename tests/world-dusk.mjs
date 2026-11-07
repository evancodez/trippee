// Dusk: what docs/MODES.md section 8 asks of it that no other test does. Muted, like every browser here.
//   STAGE=stills                       every pattern in the pool, calm and buzzing, as a sheet. No song.
//   STAGE=buds                         the first few landings, as sheets. No song.
//   STAGE=sheet                        every pattern on one sheet, to judge them against each other. TIMES=20,21,22 for several moments, NAME=file
//   STAGE=lands                        landings as sheets: LANDS=ridge>sierra:line,sierra>sea:fall,sea>lowsun:flare,lowsun>wires:settle, D=seconds. No song.
//   STAGE=clicks                       every pattern in the library by a real click on its tile. On its own: the others stop the clock
//   STAGE=steps SONG=... AT=t,t        frames either side of moments in the film, and what changed
//   STAGE=film SONG=media/mgmt.mp3     the world's whole film as a person gets it: what it hears, what it lands on, a 20 s sheet and slices across a landing.
//   STAGE=change                       from the film into the world and back, as a sheet, with the byte check at the middle.
//   STAGE=cost                         GPU ms per program at 3024x1964, governor off. Say what else was running.
//   SESSION=1 ...                      holds one browser and reloads the page for each file dropped in <out>/cmd: { stages, env, script }. It lets go after two idle minutes, and after twenty-five in all, so a look needn't queue again.
import { resolve, basename, join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { watch, dropSong, enterWorld, analyse, flashThree } from '../tools/look.mjs';

let want = (process.env.STAGE || 'stills').split(',');
const put = () => {
  window.F_ = {
    async enter() {
      const eng = await import(new URL('src/worlds/engine.js', location.href).href);
      const W = await eng.loadWorld('dusk'), wp = await app.R.prepareWorld(W);
      await wp.whenAll;
      if (wp.failed) throw new Error(wp.failed);
      app.governor.enabled = false; app.R.drawScale = 1; app.manual = true;
      app.stage.world = W; app.stage.score = app.stage.score; app.stage.hold = true;
      return W;
    },
    show(p, t) {
      const st = app.stage;
      st.score.gestures = [{ t0: 0, t1: 3600, arcEnd: 40, pattern: p }]; st.score.handover = null;
      app.t = t; trippee.seek(t);
    },
    budStart(a, b, D = 10) {
      const st = app.stage;
      st.score.handover = null;
      st.score.gestures = [{ t0: -20, t1: 2 + D, arcEnd: 2 + D, pattern: a, morph: D, xform: { id: 'line', chosen: true } }, { t0: 2 + D, t1: 3600, arcEnd: 2 + D + 26, pattern: b }];
      st.hold = true; app.t = 0; trippee.seek(0);
    },
  };
};
export default async ctx => {
  const { page, out, sleep } = ctx;
  await stages(ctx);
  const dir = join(out, 'cmd');
  if (!process.env.SESSION && !existsSync(join(dir, 'on'))) return;
  mkdirSync(dir, { recursive: true });
  const began = Date.now(); let idle = Date.now(), n = 0;
  while (Date.now() - idle < 120000 && Date.now() - began < 25 * 60000) {
    const f = join(dir, 'next.json');
    if (!existsSync(f)) { await sleep(500); continue; }
    const c = JSON.parse(readFileSync(f, 'utf8')); rmSync(f);
    const lines = [], log = (...a) => { lines.push(a.join(' ')); console.log(...a); };
    for (const k of Object.keys(c.env ?? {})) process.env[k] = c.env[k];
    try {
      await page.goto(c.url ?? (process.env.LAB_URL || 'http://localhost:5300/'));
      for (let i = 0; i < 240; i++) { if (await page.eval('typeof window.trippee !== "undefined" && window.trippee.ready === true')) break; await sleep(250); }
      page.logs.length = 0;
      if (c.script) { const m = await import(`${pathToFileURL(resolve(c.script)).href}?n=${++n}`); await m.default({ ...ctx, log }); }
      else { want = c.stages; await stages({ ...ctx, log }); }
    } catch (e) { log('FAILED ' + e.message); }
    for (const k of Object.keys(c.env ?? {})) delete process.env[k];
    writeFileSync(join(dir, c.done ?? 'done.log'), lines.join('\n') + '\n');
    idle = Date.now();
  }
};
async function stages({ page, log, save, sleep }) {
  await page.eval(put);
  if (want.includes('stills')) {
    const r = await page.eval(async () => {
      const W = await F_.enter();
      const cv = document.createElement('canvas'), n = W._pool.length, cols = 2, rows = n, w = 800, h = 450;
      cv.width = cols * w; cv.height = rows * h;
      const g = cv.getContext('2d');
      W._pool.forEach((p, i) => [6, 21.3].forEach((t, j) => { F_.show(p, t); g.drawImage(trippee.canvas, j * w, i * h, w, h); g.fillStyle = '#fff'; g.font = '16px monospace'; g.fillText(`${p.id} t=${t}`, j * w + 8, i * h + 20); }));
      return { sheet: cv.toDataURL('image/jpeg', 0.9), ids: W._pool.map(p => p.id), variant: app.R.variant };
    });
    save('stills.jpg', r.sheet);
    log('stills', r.ids.join(' '), 'variant', r.variant);
  }
  if (want.includes('sheet')) {
    // Every pattern on one sheet, so they can be judged against each other. EVERY=seconds apart for the columns.
    const r = await page.eval(async ts => {
      const W = await F_.enter();
      const cv = document.createElement('canvas'), P = W._pool, cols = 4, w = 480, h = 270, rows = Math.ceil(P.length * ts.length / cols);
      cv.width = cols * w; cv.height = rows * h;
      const g = cv.getContext('2d'); let i = 0;
      for (const p of P) for (const t of ts) { F_.show(p, t); const x = (i % cols) * w, y = Math.floor(i / cols) * h; g.drawImage(trippee.canvas, x, y, w, h); g.fillStyle = '#000'; g.fillRect(x, y, 150, 18); g.fillStyle = '#fff'; g.font = '13px monospace'; g.fillText(p.id.slice(5), x + 4, y + 13); i++; }
      return { sheet: cv.toDataURL('image/jpeg', 0.9), n: P.length };
    }, (process.env.TIMES || '6').split(',').map(Number));
    save(process.env.NAME || 'sheet.jpg', r.sheet);
    log('sheet', r.n, 'patterns');
  }
  if (want.includes('lands')) {
    // Landings of every kind, as sheets: LANDS=a>b:kind,... with no song, so the clock's steady. D seconds each.
    const list = (process.env.LANDS || 'ridge>sierra:line,sierra>sea:fall,sea>lowsun:flare,lowsun>wires:settle,wires>rays:line,rays>tremolo:fall,tremolo>cloister:flare,cloister>blinds:settle,blinds>curtain:line,curtain>moon:flare,moon>windows:fall,windows>lake:line,lake>road:settle,road>drive:flare,drive>ridge:dive').split(',').map(s => s.split(/[>:]/));
    const r = await page.eval(async (list, D) => {
      const W = await F_.enter(), by = id => W._pool.find(p => p.id === 'dusk.' + id), out = [];
      const N = 10, w = 256, h = 144, cv = document.createElement('canvas'); cv.width = w * N; cv.height = h * list.length;
      const g = cv.getContext('2d');
      for (let k = 0; k < list.length; k++) {
        const [a, b, kind] = list[k], st = app.stage;
        st.score.handover = null;
        st.score.gestures = [{ t0: -20, t1: 2 + D, arcEnd: 2 + D, pattern: by(a), morph: D, xform: { id: kind, chosen: true } }, { t0: 2 + D, t1: 3600, arcEnd: 2 + D + 26, pattern: by(b) }];
        st.hold = true; app.t = 0; trippee.seek(0);
        for (let i = 0; i < 400 && !st.score.gestures[0].plan; i++) { trippee.seek(2.5); await new Promise(r => setTimeout(r, 4)); }
        let kinds = new Set(), V = new Set();
        for (let i = 0; i < N; i++) { const t = 1.5 + i * (D + 1) / (N - 1); trippee.seek(t); kinds.add(app.lastFrame.kind); V.add(app.R.variant); g.drawImage(trippee.canvas, i * w, k * h, w, h); g.fillStyle = '#000'; g.fillRect(i * w, k * h, 150, 15); g.fillStyle = '#fff'; g.font = '11px monospace'; g.fillText(`${a}>${b} ${t.toFixed(1)} ${app.lastFrame.kind ?? ''}`, i * w + 3, k * h + 11); }
        out.push(`${a}>${b} wanted ${kind}: ${[...kinds].join(',')} programs ${[...V].join(',')}`);
      }
      return { sheet: cv.toDataURL('image/jpeg', 0.9), out };
    }, list, +(process.env.D || 8));
    save(process.env.NAME || 'lands.jpg', r.sheet);
    log('lands\n  ' + r.out.join('\n  '));
  }
  if (want.includes('clicks')) {
    // Every pattern in the library, by a real click on its tile, on the wander. Each has to land, with no error.
    const mouse = (type, x, y, o = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, button: o.button ?? 'none', buttons: o.buttons ?? 0, clickCount: o.clickCount ?? 0 });
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    const ids = await page.eval(async () => {
      try { document.querySelector('#hints [data-ok]').click(); } catch {}
      await app.stage.setWorld('dusk');
      app.ui.library.show(true);
      window.__tile = id => { const t = app.ui.library.tiles.get(id); t.b.scrollIntoView({ block: 'center' }); const r = t.b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2 - 8]; };
      return app.stage.world._pool.map(p => p.id);
    });
    for (let i = 0; i < 300; i++) { if (await page.eval('!app.stage.score.handover?.change')) break; await sleep(100); }
    await sleep(400);
    const shown = await page.eval(() => [...document.querySelectorAll('#library .tile')].filter(b => b.offsetParent).map(b => b.title));
    log('library shows', shown.length, 'tiles of', ids.length);
    let good = 0;
    const order = ids.map((_, k) => ids[(k * 11 + 3) % ids.length]);
    for (const id of order) {
      const [x, y] = await page.eval(`__tile(${JSON.stringify(id)})`);
      await sleep(30);
      await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1 }); await mouse('mouseReleased', x, y, { button: 'left', clickCount: 1 });
      let landed = null; const t0 = Date.now(), kinds = new Set();
      while (Date.now() - t0 < 16000) { await sleep(120); const st = await page.eval(() => ({ p: app.lastFrame.G.pattern.id, k: app.lastFrame.kind, m: !!app.lastFrame.N })); if (st.k) kinds.add(st.k); if (st.p === id && !st.m) { landed = Date.now() - t0; break; } }
      if (landed != null) good++;
      log(landed != null ? 'ok  ' : 'FAIL', id, landed != null ? `${(landed / 1000).toFixed(1)} s` : 'never landed', [...kinds].join(','));
    }
    log(`clicks: ${good}/${ids.length} landed`);
  }
  if (want.includes('steps')) {
    // Frames just either side of moments in the film, and the difference between them: AT=t,t,... SONG=...
    const songPath = process.env.SONG || 'media/mgmt.mp3';
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    await dropSong(page, songPath, { resolvePath: resolve, sleep });
    await enterWorld(page, 'dusk', log);
    const ats = (process.env.AT || '').split(',').map(Number);
    const r = await page.eval(async ats => {
      app.manual = true;
      const g0 = app.stage.score.gestures.map(G => `${G.pattern.id.slice(5)} ${G.t0.toFixed(2)}-${G.t1.toFixed(2)} m${(G.morph ?? 0).toFixed(1)} ${G.xform?.id ?? '-'} ${(G.moves ?? []).map(m => m.id).join('+')} ${G.run ?? ''}`);
      const w = 320, h = 180, cv = document.createElement('canvas'); cv.width = w * 4; cv.height = h * ats.length;
      const g = cv.getContext('2d', { willReadFrequently: true }), small = document.createElement('canvas'); small.width = w; small.height = h; const sg = small.getContext('2d', { willReadFrequently: true });
      const out = [];
      for (let k = 0; k < ats.length; k++) {
        const t = ats[k], grab = T => { trippee.seek(T); sg.drawImage(trippee.canvas, 0, 0, w, h); return sg.getImageData(0, 0, w, h); };
        trippee.seek(t - 2); for (let i = 0; i < 60; i++) { trippee.seek(t - 2 + i * 0.02); if (app.lastFrame.N && !app.stage.score.gestures.find(G => G.t1 > t - 1)?.plan) await new Promise(r => setTimeout(r, 4)); }
        const a = grab(t - 1 / 60), f = app.lastFrame, was = { kind: f.kind, p: f.G.pattern.id, x: +(f.T || 0).toFixed(3) }, b = grab(t + 1 / 60), f2 = app.lastFrame, now = { kind: f2.kind, p: f2.G.pattern.id }, c = grab(t + 3 / 60);
        const dm = (p, q) => { let s = 0; for (let i = 0; i < p.data.length; i += 4) s += Math.abs(p.data[i] - q.data[i]) + Math.abs(p.data[i + 1] - q.data[i + 1]) + Math.abs(p.data[i + 2] - q.data[i + 2]); return +(s / (w * h * 3)).toFixed(2); };
        const d = new ImageData(w, h); for (let i = 0; i < d.data.length; i += 4) { const v = Math.min(255, 3 * (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]))); d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
        g.putImageData(a, 0, k * h); g.putImageData(b, w, k * h); g.putImageData(c, 2 * w, k * h); g.putImageData(d, 3 * w, k * h);
        out.push({ t, was, now, across: dm(a, b), next: dm(b, c) });
      }
      return { sheet: cv.toDataURL('image/jpeg', 0.92), out, g0 };
    }, ats);
    save(process.env.NAME || 'steps.jpg', r.sheet);
    log(r.g0.join('\n')); log(JSON.stringify(r.out));
  }
  if (want.includes('buds')) {
    const r = await page.eval(async () => {
      const W = await F_.enter(), P = W._pool, out = [];
      const pairs = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]].filter(([a, b]) => P[a] && P[b]);
      const cv = document.createElement('canvas'), w = 320, h = 180, N = 8;
      cv.width = w * N; cv.height = h * pairs.length;
      const g = cv.getContext('2d');
      for (let k = 0; k < pairs.length; k++) {
        const [a, b] = pairs[k];
        F_.budStart(P[a], P[b]);
        let kinds = new Set();
        for (let i = 0; i < 400 && !app.stage.score.gestures[0].plan; i++) { trippee.seek(2.5); await new Promise(r => setTimeout(r, 4)); }
        for (let i = 0; i < N; i++) { const t = 1.5 + i * 11 / (N - 1); trippee.seek(t); kinds.add(app.lastFrame.kind); g.drawImage(trippee.canvas, i * w, k * h, w, h); g.fillStyle = '#fff'; g.font = '12px monospace'; g.fillText(`${P[a].id.slice(5)}>${P[b].id.slice(5)} ${t.toFixed(1)} ${app.lastFrame.kind ?? ''}`, i * w + 4, k * h + 14); }
        out.push(`${P[a].id}>${P[b].id}: ${[...kinds].join(',')}`);
      }
      return { sheet: cv.toDataURL('image/jpeg', 0.9), out };
    });
    save('buds.jpg', r.sheet);
    log('buds', r.out.join('\n     '));
  }
  if (want.includes('film')) {
    const songPath = process.env.SONG || 'media/mgmt.mp3', song = basename(songPath).replace(/\.\w+$/, '');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    await dropSong(page, songPath, { resolvePath: resolve, sleep });
    await enterWorld(page, 'dusk', log);
    const info = await page.eval(() => {
      const s = app.stage.score, T = s.tables, g = s.gestures;
      return {
        bpm: s.song?.bpm, meter: s.song?.meter, air: T?.air, trem: T?.tremHeard, whoas: T?.whoas,
        gestures: g.map(G => `${G.pattern.id.slice(5)} ${G.t0.toFixed(1)}-${G.t1.toFixed(1)} m${(G.morph ?? 0).toFixed(1)} ${G.xform?.id ?? '-'} ${(G.moves ?? []).map(m => m.id).join('+')}`),
        day: [0, 0.25, 0.5, 0.75, 1].map(k => +(T?.day?.[Math.floor(k * ((T?.n ?? 2) - 2))] ?? 0).toFixed(2)),
        guard: app.song.rehearsal?.flash ?? null, refused: s.refused ?? null,
      };
    });
    log(JSON.stringify(info, null, 0));
    const firstMorph = await page.eval(() => { const g = app.stage.score.gestures; const G = g.find(x => x.morph && x.t1 - x.morph > 20) ?? g[0]; return G.t1 - G.morph; });
    const a = Math.max(0, firstMorph - 6);
    const w = await watch(page, save, { name: `film-${song}`, seconds: 20, fps: 30, cols: 8, rows: 7, setup: `app.t=${a}`, colour: true });
    const A = analyse(w), f = flashThree(w);
    log(`20 s from ${a.toFixed(1)}: kinds`, JSON.stringify(await page.eval(() => app.lastFrame.kind)), 'flash', JSON.stringify({ luma: f.luma, red: f.red, rc: f.rc, over: f.over.slice(0, 4) }));
    // Two frames to look at closely
    const shots = await page.eval(a => { trippee.seek(a + 2); const x = trippee.capture(); trippee.seek(a + 13); return [x, trippee.capture()]; }, a);
    save(`film-${song}-a.png`, shots[0]); save(`film-${song}-b.png`, shots[1]);
  }
  if (want.includes('change')) {
    // From the film into the world and out again: x .46-.54 byte for byte the film's own flight, the program swapped in the middle, and a sheet to look at. Copied from tests/worlds.mjs, STAGE=change.
    const r = await page.eval(async () => {
      const T = trippee, stage = app.stage, R = app.R;
      app.governor.enabled = false; R.drawScale = 1; app.manual = true; app.paused = false;
      const eng = await import(new URL('src/worlds/engine.js', location.href).href), W = await eng.loadWorld('dusk'), wp = await R.prepareWorld(W);
      await wp.whenAll;
      const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
      const sha = async () => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(T.capture())));
      const dur = 9, XS = [0.46, 0.4999, 0.5, 0.5001, 0.54], pat = W._pool[0];
      const reset = w => { stage.score.handover = null; stage.staticG = null; stage.world = w; stage.score = stage.score; T.load('lines.river'); app.t = 13; T.step(0); };
      const ready = async () => { const h = stage.score.handover; for (let i = 0; i < 400 && !h.plan; i++) { T.step(0); await new Promise(r => setTimeout(r, 4)); } h.e = 0; h.e0 = 0; return h; };
      const at = async (h, x) => { h.e = h.e0 + x * h.D; T.step(0); return { sha: await sha(), v: R.variant, url: T.capture() }; };
      reset(null);
      { const t = app.pictureT(), snap = stage.snapshot(t), g = stage.score.gestures; g.length = 0; g.push({ t0: t, t1: t + 3600, arcEnd: t + 44, period: 44, pattern: pat, morph: 0 }); stage.morphFrom(snap, t, dur, { noGlide: true }); }
      const h0 = await ready(), film = {};
      for (const x of XS) film[x] = (await at(h0, x)).sha;
      reset(null);
      const began = await stage.setWorld('dusk', { pattern: pat, dur });
      const h1 = await ready(), world = {}, vs = {};
      for (const x of XS) { const f = await at(h1, x); world[x] = f.sha; vs[x] = f.v; }
      // The program changes at x=.5: the frame just before and the frame on it, a thousandth of a second apart, in two different programs.
      const small = document.createElement('canvas'); small.width = 640; small.height = 360; const sg = small.getContext('2d', { willReadFrequently: true });
      const grab = async x => { await at(h1, x); sg.drawImage(T.canvas, 0, 0, 640, 360); return sg.getImageData(0, 0, 640, 360).data; };
      const a0 = await grab(0.49999), a1 = await grab(0.5); let swapN = 0, swapTop = 0; for (let i = 0; i < a0.length; i++) { const d = Math.abs(a0[i] - a1[i]); if (d > 2) swapN++; if (d > swapTop) swapTop = d; }
      const cv = document.createElement('canvas'), w = 320, ht = 180, xs = [0, 0.15, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]; cv.width = w * xs.length; cv.height = ht * 2;
      const g = cv.getContext('2d');
      for (let i = 0; i < xs.length; i++) { await at(h1, xs[i]); g.drawImage(T.canvas, i * w, 0, w, ht); }
      h1.e = h1.e0 + h1.D; T.step(0); T.step(0);
      const landed = R.variant, on = stage.world?.id;
      // and out
      const left = await stage.setWorld(null, { dur });
      const h2 = await ready();
      for (let i = 0; i < xs.length; i++) { await at(h2, xs[i]); g.drawImage(T.canvas, i * w, ht, w, ht); }
      h2.e = h2.e0 + h2.D; T.step(0); T.step(0);
      return { began, left, same: XS.map(x => film[x] === world[x]), swap: { over2: swapN, top: swapTop }, vs, landed, on, after: stage.world?.id ?? null, afterV: R.variant, sheet: cv.toDataURL('image/jpeg', 0.88) };
    });
    save('change.jpg', r.sheet);
    log('change: across the swap', JSON.stringify(r.swap), 'x .46-.54 equals a film flight to the same pattern (its plan can differ: the film can\'t see the field)', JSON.stringify(r.same), 'programs', JSON.stringify(r.vs), 'landed in', r.on, r.landed, 'and out in', r.after, r.afterV);
  }
  if (want.includes('cost')) {
    const WW = 3024 / 2, HH = 1964 / 2;
    await page.send('Emulation.setDeviceMetricsOverride', { width: WW, height: HH, deviceScaleFactor: 2, mobile: false });
    await sleep(600);
    const r = await page.eval(async () => {
      const W = await F_.enter(), R = app.R, gl = R.gl, px = new Uint8Array(4), stage = app.stage;
      const measure = () => { gl.finish(); const t0 = performance.now(); trippee.step(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
      const run = (n = 40) => { const a = []; for (let i = 0; i < n; i++) { app.t += 1 / 20; a.push(measure()); } a.sort((x, y) => x - y); return { med: +a[n >> 1].toFixed(2), p95: +a[Math.floor(n * 0.95)].toFixed(2), v: R.variant }; };
      const out = { canvas: [app.canvas.width, app.canvas.height], plain: {}, bud: {} };
      for (const p of W._pool) { F_.show(p, 8); await new Promise(r => setTimeout(r, 20)); out.plain[p.id.slice(5)] = run(); }
      // The film's own plain program on a film pattern, the same way, for scale
      stage.world = null; stage.score = stage.score; trippee.load('lines.fall'); app.manual = true; app.t = 10; await new Promise(r => setTimeout(r, 50)); out.filmPlain = run();
      stage.world = W; stage.score = stage.score;
      F_.budStart(W._pool[0], W._pool[1]); for (let i = 0; i < 100 && !stage.score.gestures[0].plan; i++) { trippee.seek(2.5); await new Promise(r => setTimeout(r, 4)); }
      trippee.seek(6); out.bud = run();
      return out;
    });
    log('cost', JSON.stringify(r));
  }
  const errs = page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  if (errs.length) log('page errors', errs.slice(0, 4));
}
