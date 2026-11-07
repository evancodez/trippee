// Camouflage (src/tools/webcam.js): you're in the picture only while you move. Never a real camera: the pretend one is a scripted person, run on the clock the test steps.
// The 'wave' script learns the room to 2.5 s, walks in to 4, waves an arm fast to 8, stands still to 12 and walks off by 15. 'two' is two people, 'still' walks in and stands, 'dark' is wave in a dark room.
//
//   node tools/lab.mjs tests/camo.mjs --out lab-out/<lane>                         STAGE=off,gone,flash (default)
//   STAGE=off       no camera is ever asked for, and nothing of it is loaded, until it's turned on. The button's there
//   STAGE=gone      no song: standing still, you're gone within about half a second, with no seam (the frame matches the plain one to 1/255). PATTERNS=a,b to choose
//   STAGE=flash     the judge's counts with the pretend camera running the whole script: no song, a song (SONG=media/mgmt.mp3, AT=40), and in a mode (WORLD=dusk). 12 and 60 fps. FAKE=wave.
//                   ONLY=held or ONLY=song stops after that part, SKIP=held leaves the held patterns out; DIAG=1 saves each run's per-frame numbers
//   STAGE=sheet     a frame sheet of 20 frames across the script, with a song, and stills at the strongest moments. SONG, AT, PATTERN, FAKE
//   STAGE=cost      what the camera's work costs a frame on the processor, and the GPU's frame with it on and off, at DSF=2 (W,H default 1512,982)
import { resolve } from 'node:path';
import { watch, analyse, flashThree, dropSong, enterWorld } from '../tools/look.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const r3 = x => +(+x).toFixed(3);

// In the page: camouflage on, with the pretend camera, and the time programs built before anything's watched.
const startFake = fake => `(async () => {
  const m = await import(new URL('src/tools/webcam.js', location.href).href);
  if (app.camo?.on()) app.camo.stop();
  await m.toggle(app, { fake: ${JSON.stringify(fake)} });
  const R = app.R, P = () => R.wp ? R.wp.progs : R.progs;
  for (let i = 0; i < 600 && !(P()[1024] && P()[1024 | 4]); i++) await new Promise(r => setTimeout(r, 20));
  return !!(P()[1024] && P()[1024 | 4]);
})()`;

export default async ({ page, log, save }) => {
  const stages = (process.env.STAGE || 'off,gone,flash').split(',');
  let failed = 0;
  const say = (ok, line) => { if (!ok) failed++; log(`${ok ? 'ok  ' : 'BAD '} ${line}`); };

  if (stages.includes('off')) {
    // A fresh page that counts every ask for a camera from its very first script
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__asked = 0; if (navigator.mediaDevices) { const g = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = (...a) => { window.__asked++; return Promise.reject(new Error('no camera in tests')); }; }` });
    await page.goto(await page.eval('location.href'));
    for (let i = 0; i < 160 && !(await page.eval('window.trippee?.ready === true')); i++) await sleep(250);
    // A film's worth of ordinary use: a pattern, a step through the library, the effects
    await page.eval(`trippee.load('lines.river'); app.manual = true; for (let i = 0; i < 120; i++) trippee.step(1 / 30); app.hand.step(1); for (let i = 0; i < 60; i++) trippee.step(1 / 30)`);
    const r = await page.eval(() => ({ asked: window.__asked, loaded: performance.getEntriesByType('resource').some(e => /webcam\.js/.test(e.name)), camo: !!app.camo, edits: !!app.edits.camo, field: !!app.R.camoField, button: !!document.querySelector('[data-fx=camo]'), tip: document.querySelector('[data-fx=camo]')?.title ?? '' }));
    say(r.asked === 0, `no camera asked for with it off: ${r.asked} asks`);
    say(!r.loaded && !r.camo && !r.edits && !r.field, `nothing of it loaded or written: webcam.js ${r.loaded ? 'loaded' : 'not loaded'}, app.camo ${r.camo}, edits.camo ${r.edits}, texture ${r.field}`);
    say(r.button && /nothing leaves this machine/.test(r.tip), `the button is on the bar and says nothing leaves this machine: "${r.tip}"`);
    // The real path, turned on, asks once (and is told no here), says so and stays off
    const real = await page.eval(async () => { const m = await import(new URL('src/tools/webcam.js', location.href).href); const ok = await m.toggle(app); return { ok, asked: window.__asked, on: !!app.camo?.on(), edits: !!app.edits.camo }; });
    say(real.asked === 1 && !real.ok && !real.on && !real.edits, `turned on with no camera to be had: asked ${real.asked}, on ${real.on}, so it's off again`);
  }

  if (stages.includes('gone')) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    const pats = (process.env.PATTERNS || 'lines.river,checks.vega,dots.inflate,waves.silk').split(',');
    for (const id of pats) {
      await page.eval(`app.governor.enabled=false;app.R.drawScale=1;trippee.load(${JSON.stringify(id)});app.manual=true;app.t=6`);
      const armed = await page.eval(startFake('wave'));
      if (!armed) { say(false, `${id}: the time programs never came`); continue; }
      const r = await page.eval(async () => {
        const T = window.trippee, gl = app.R.gl, W = T.canvas.width, H = T.canvas.height, a = new Uint8Array(W * H * 4), b = new Uint8Array(W * H * 4);
        const diff = () => { let m = 0, n = 0; for (let i = 0; i < a.length; i += 4) { const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); if (d > m) m = d; if (d > 1) n++; } return { m, n }; };
        const rows = [], fps = 60;
        for (let k = 0; k < 15.5 * fps; k++) {
          T.step(1 / fps);
          gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, a);
          const c = app.edits.camo, s = app.camo.state;
          // the same moment with no camouflage at all
          app.edits.camo = null; T.step(0); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b);
          const d = diff();
          rows.push({ t: +s.t.toFixed(3), would: +(c?.would ?? 0).toFixed(4), area: s.area, shown: !!c?.shown, armed: s.armed, fam: c?.fam ?? -1, motion: s.motion, max: d.m, px: d.n });
          if (k % 6 === 0) await new Promise(r => setTimeout(r));
        }
        app.camo.stop();
        return { rows, stats: null };
      });
      const rows = r.rows, still = 8, off = 12;
      const seenWhileMoving = rows.filter(x => x.t > 4.5 && x.t < still && x.px > 0).length / Math.max(1, rows.filter(x => x.t > 4.5 && x.t < still).length);
      // when it's gone: the first frame after you stop from which every frame until you walk off matches the plain one to 1/255
      let gone = null;
      for (let i = rows.length - 1; i >= 0; i--) { const x = rows[i]; if (x.t < still) break; if (x.t >= off) continue; if (x.max <= 1) gone = x.t; else break; }
      const restMax = Math.max(...rows.filter(x => x.t > still + 1 && x.t < off).map(x => x.max));
      const fam = [...new Set(rows.map(x => x.fam))];
      log(`${id}: family ${fam.join(',')}, shown while waving ${(100 * seenWhileMoving).toFixed(0)}% of frames, biggest difference waving ${Math.max(...rows.filter(x => x.t > 4.5 && x.t < still).map(x => x.max))}`);
      say(gone != null && gone - still <= 0.7, `${id}: gone ${gone == null ? 'never' : r3(gone - still) + ' s'} after standing still (about half a second wanted), and from then on the frame is the plain one to ${restMax}/255`);
      say(restMax <= 1, `${id}: no seam once still: the biggest difference from the plain frame is ${restMax}/255`);
      save(`gone-${id}.json`, JSON.stringify(rows));
    }
  }

  if (stages.includes('flash')) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    const fake = process.env.FAKE || 'wave', pats = (process.env.PATTERNS || 'lines.river,checks.vega').split(',');
    // No song: a pattern held, the script run through, with it and without it
    for (const id of process.env.SKIP === 'held' ? [] : pats) for (const fps of [12, 60]) {
      const set = `app.governor.enabled=false;app.R.drawScale=1;trippee.load(${JSON.stringify(id)});app.manual=true;app.t=6`;
      await page.eval(set); await page.eval(startFake(fake));
      const w = await watch(page, process.env.DIAG ? save : () => {}, { name: `camo-${id}-${fps}`, seconds: 15.5, fps, cols: 8, rows: 4 });
      await page.eval('app.camo?.stop()');
      await page.eval(set);
      const p = await watch(page, () => {}, { name: `plain-${id}`, seconds: 15.5, fps, cols: 4, rows: 1 });
      const A = analyse(w), B = analyse(p);
      say(A.flashesPerSecondWholeFrame === 0 && A.flashesPerSecondAnyTile <= 1, `no song, ${id}, ${fake}, ${fps} fps: whole ${A.flashesPerSecondWholeFrame}, tile ${A.flashesPerSecondAnyTile} (without it ${B.flashesPerSecondWholeFrame}, ${B.flashesPerSecondAnyTile}); largest step ${A.largestLuminanceStepPerFrame}`);
    }
    if (process.env.ONLY === 'held') { log(failed ? `${failed} FAILED` : 'all as they should be'); return; }
    // A song's film: the 1 and the 3
    const songPath = process.env.SONG || 'media/mgmt.mp3', at = +(process.env.AT || 40);
    await dropSong(page, songPath, { resolvePath: resolve, sleep });
    for (const fps of [12, 60]) {
      await page.eval(`app.t=${at};trippee.seek(${at})`); await page.eval(startFake(fake));
      const w = await watch(page, process.env.DIAG ? save : () => {}, { name: `camo-song-${fps}`, seconds: 15.5, fps, cols: 8, rows: 4 });
      await page.eval('app.camo?.stop()');
      await page.eval(`app.t=${at};trippee.seek(${at})`);
      const p = await watch(page, process.env.DIAG ? save : () => {}, { name: `plain-song-${fps}`, seconds: 15.5, fps, cols: 8, rows: 4 });
      const A = analyse(w), B = analyse(p);
      say(A.flashesPerSecondWholeFrame === 0 && A.flashesPerSecondAnyTile <= Math.max(1, B.flashesPerSecondAnyTile), `the film of ${songPath} from ${at} s, ${fake}, ${fps} fps: whole ${A.flashesPerSecondWholeFrame}, tile ${A.flashesPerSecondAnyTile} (the film without it ${B.flashesPerSecondWholeFrame}, ${B.flashesPerSecondAnyTile})`);
    }
    if (process.env.ONLY === 'song') { log(failed ? `${failed} FAILED` : 'all as they should be'); return; }
    // A mode
    const world = process.env.WORLD || 'dusk';
    await enterWorld(page, world, log);
    for (const fps of [12, 60]) {
      await page.eval(`app.t=${at};trippee.seek(${at})`); const ok = await page.eval(startFake(fake));
      const w = await watch(page, () => {}, { name: 'camo-world', seconds: 15.5, fps, cols: 4, rows: 1, colour: true });
      await page.eval('app.camo?.stop()');
      await page.eval(`app.t=${at};trippee.seek(${at})`);
      const p = await watch(page, () => {}, { name: 'plain-world', seconds: 15.5, fps, cols: 4, rows: 1, colour: true });
      const A = flashThree(w), B = flashThree(p);
      say(ok && !A.bad, `${world}, ${fake}, ${fps} fps: luma ${A.luma.whole}/${A.luma.tile}, red ${A.red.whole}/${A.red.tile}, cyan ${A.rc.whole}/${A.rc.tile} (without it luma ${B.luma.whole}/${B.luma.tile}, cyan ${B.rc.whole}/${B.rc.tile})${A.over.length ? ' over: ' + A.over.slice(0, 3).map(o => `${o.channel} ${o.on} ${o.n} near ${r3(o.t)}`).join('; ') : ''}`);
    }
  }

  if (stages.includes('sheet')) {
    const fake = process.env.FAKE || 'wave', songPath = process.env.SONG || 'media/mgmt.mp3', at = +(process.env.AT || 40), id = process.env.PATTERN;
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    if (songPath !== 'none') await dropSong(page, songPath, { resolvePath: resolve, sleep });
    if (process.env.WORLD) await enterWorld(page, process.env.WORLD, log);
    const set = songPath === 'none' ? `app.governor.enabled=false;app.R.drawScale=1;trippee.load(${JSON.stringify(id || 'lines.river')});app.manual=true;app.t=6` : `app.t=${at};trippee.seek(${at})`;
    await page.eval(set); await page.eval(startFake(fake));
    const tag = `${fake}-${songPath === 'none' ? id || 'lines.river' : 'song'}${process.env.WORLD ? '-' + process.env.WORLD : ''}`;
    const w = await watch(page, save, { name: `sheet-${tag}`, seconds: 15, fps: 12, cols: 5, rows: 4 });
    log(JSON.stringify(analyse(w)));
    // the strongest moments, full size: where the slide is furthest from a whole step
    await page.eval('app.camo?.stop()'); await page.eval(set); await page.eval(startFake(fake));
    const shots = await page.eval(async () => {
      const T = window.trippee, best = [];
      for (let k = 0; k < 15 * 30; k++) { T.step(1 / 30); const c = app.edits.camo; const v = c?.shown ? Math.abs(c.would) : 0; if (v > 0.3) best.push({ k, v, t: app.camo.state.t }); }
      return best;
    });
    const pick = []; for (const s of shots) if (!pick.length || s.t - pick[pick.length - 1].t > 1.2) pick.push(s);
    await page.eval('app.camo?.stop()'); await page.eval(set); await page.eval(startFake(fake));
    let k = 0;
    for (const p of pick.slice(0, 6)) {
      const url = await page.eval(async n => { const T = window.trippee; while (app.camo.state.t < n - 1e-6) T.step(1 / 30); T.step(0); return T.canvas.toDataURL('image/png'); }, p.t);
      save(`still-${tag}-${++k}.png`, url);
      log(`still ${k} at ${r3(p.t)} s of the script, ${r3(p.v)} of a step out`);
    }
    await page.eval('app.camo?.stop()');
  }

  if (stages.includes('cost')) {
    const Wd = +(process.env.W || 1512), Hd = +(process.env.H || 982);
    await page.send('Emulation.setDeviceMetricsOverride', { width: Wd, height: Hd, deviceScaleFactor: 2, mobile: false });
    await sleep(500);
    for (const id of (process.env.PATTERNS || 'lines.river,checks.vega,dots.inflate').split(',')) {
      await page.eval(`app.governor.enabled=false;app.R.drawScale=1;trippee.load(${JSON.stringify(id)});app.manual=true;app.t=6`);
      const gpu = async () => page.eval(() => { const gl = app.R.gl, px = new Uint8Array(4), one = () => { gl.finish(); const t0 = performance.now(); trippee.step(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; }; one(); one(); const r = []; for (let i = 0; i < 30; i++) r.push(one()); r.sort((a, b) => a - b); return +r[r.length >> 1].toFixed(2); });
      const off = await gpu();
      await page.eval(startFake('wave'));
      // run it to the wave, where you're showing, and measure there
      await page.eval(() => { const T = window.trippee; app.camo.resetStats(); while (app.camo.state.t < 5.2) T.step(1 / 60); });
      const st = await page.eval(() => app.camo.stats());
      const on = await gpu();
      const info = await page.eval(() => ({ shown: app.edits.camo?.shown, would: app.edits.camo?.would, variant: app.R.variant, canvas: [app.canvas.width, app.canvas.height] }));
      log(`${id} at ${info.canvas.join('x')}: GPU frame ${off} ms plain, ${on} ms with you showing (variant ${info.variant}, ${r3(info.would)} of a step out); the camera's work ${st.meanMs} ms a frame on average, ${st.maxMs} at most; a camera frame ${st.camMeanMs} ms, ${st.camMaxMs} at most`);
      say(st.meanMs < 1, `${id}: the camera's work is under 1 ms a frame (${st.meanMs})`);
      await page.eval('app.camo?.stop()');
    }
  }

  const errs = page.logs.filter(l => /\[error\]|\[exception\]/.test(l) && !/no camera in tests|camouflage: no camera/.test(l));
  if (errs.length) { log('page errors', errs.slice(0, 6)); failed++; }
  log(failed ? `${failed} FAILED` : 'all as they should be');
  if (failed) process.exitCode = 1;
};
