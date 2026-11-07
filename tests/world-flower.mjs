// Flower Power: what docs/MODES.md section 8 asks of it that no other test does. Muted, like every browser here.
//   STAGE=stills                       every pattern in the pool, calm and buzzing, as a sheet. No song.
//   STAGE=buds                         every Bud in the pool, as sheets, and a line's ink carried through it, by numbers. No song.
//   STAGE=film SONG=media/mgmt.mp3     the world's whole film as a person gets it: what it hears, what it lands on, a 20 s sheet and slices across a Bud.
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
      const W = await eng.loadWorld('flower'), wp = await app.R.prepareWorld(W);
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
      st.score.gestures = [{ t0: -20, t1: 2 + D, arcEnd: 2 + D, pattern: a, morph: D, xform: { id: 'bud' } }, { t0: 2 + D, t1: 3600, arcEnd: 2 + D + 26, pattern: b }];
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
        for (let i = 0; i < N; i++) { const t = 1.5 + i * 11 / (N - 1); trippee.seek(t); kinds.add(app.lastFrame.kind); g.drawImage(trippee.canvas, i * w, k * h, w, h); g.fillStyle = '#fff'; g.font = '12px monospace'; g.fillText(`${P[a].id.slice(7)}>${P[b].id.slice(7)} ${t.toFixed(1)} ${app.lastFrame.kind ?? ''}`, i * w + 4, k * h + 14); }
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
    await enterWorld(page, 'flower', log);
    const info = await page.eval(() => {
      const s = app.stage.score, T = s.tables, g = s.gestures;
      return {
        bpm: s.song?.bpm, meter: s.song?.meter, N: T?.N, rings: T?.rings, cadences: T?.cadences?.map(c => ({ t: +c.t.toFixed(2), from: +c.from.toFixed(2), to: +c.to.toFixed(2), held: +c.held.toFixed(1) })),
        gestures: g.map(G => `${G.pattern.id.slice(7)} ${G.t0.toFixed(1)}-${G.t1.toFixed(1)} m${(G.morph ?? 0).toFixed(1)}`),
        inks: T?.inks, on: T?.on, blooms: Array.from(T?.bloom ?? []).slice(0, 64).join(''), grounds: Array.from(T?.ground ?? []).slice(0, 64).join(''),
        guard: app.song.rehearsal?.flash ?? null, refused: s.refused ?? null,
        ringsPerS: (s.phi(60, g[0]) - s.phi(50, g[0])) * 6 / 10, buzzMean: T ? +(T.buzz.reduce((a, b) => a + b, 0) / T.buzz.length).toFixed(3) : null, buzzMax: T ? +Math.max(...T.buzz).toFixed(2) : null,
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
      const eng = await import(new URL('src/worlds/engine.js', location.href).href), W = await eng.loadWorld('flower'), wp = await R.prepareWorld(W);
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
      const began = await stage.setWorld('flower', { pattern: pat, dur });
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
      for (const p of W._pool) { F_.show(p, 8); await new Promise(r => setTimeout(r, 20)); out.plain[p.id.slice(7)] = run(); }
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
