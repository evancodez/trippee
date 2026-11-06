// A world's flashes, in real pixels, through three channels per tile: gamma luma as tools/look.mjs counts it, WCAG's saturated red, and red minus cyan for equal-luminance alternation. And the Dark check.
// docs/MODES.md section 7. A world reads 0 on the whole frame and at most 1 a second on any tile, in every channel. The film's limits stay in tests/judge.mjs, and the film is only read here as a control.
//
//   node tools/lab.mjs tests/flashworld.mjs --out lab-out/<lane>                                 STAGE=selftest,dark: made-up flashes and dark frames on the real canvas, each of which must be caught or passed. No song.
//   STAGE=film SONG=media/mgmt.mp3 node tools/lab.mjs tests/flashworld.mjs --out lab-out/<lane>  the colour watch on a film reads exactly what the plain watch reads, and red and cyan are still
//   STAGE=world WORLD=mirror SONG=media/mgmt.mp3 ...                                             the world's whole film at 12 fps and 60 fps around its landings, plus Dark
//
// A synthetic flash is painted with gl.clear straight after the frame is drawn, in the same task, so it goes through exactly what a world's frame goes through: the canvas, the 320 x 180 copy, the channels, the count.
import { resolve, basename } from 'node:path';
import { watch, analyse, flashThree, dropSong, enterWorld, WORLD_FLASH, CHANNELS } from '../tools/look.mjs';

const r2 = x => +(+x).toFixed(2);

// Paints over each frame. A flash is a pair of opposing changes, so `hz` flashes a second is A then B, `hz` times a second. tile: only that sixteenth of the frame.
const paintSetup = c => `(() => {
  const app = window.trippee.app, gl = app.R.gl, c = ${JSON.stringify(c)}, W = () => window.trippee.canvas.width, H = () => window.trippee.canvas.height;
  window.__paintOff?.();
  const on = t => {
    const up = c.hz ? Math.floor(t * c.hz * 2 + 1e-6) % 2 === 0 : true, ink = (up ? c.A : c.B).map(v => v / 255);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const back = (c.back ?? [128, 128, 128]).map(v => v / 255);
    if (c.tile != null) { gl.disable(gl.SCISSOR_TEST); gl.clearColor(back[0], back[1], back[2], 1); gl.clear(gl.COLOR_BUFFER_BIT); const tx = c.tile % 4, ty = 3 - (c.tile >> 2); gl.enable(gl.SCISSOR_TEST); gl.scissor(Math.floor(tx * W() / 4), Math.floor(ty * H() / 4), Math.ceil(W() / 4), Math.ceil(H() / 4)); }
    gl.clearColor(ink[0], ink[1], ink[2], 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.disable(gl.SCISSOR_TEST);
  };
  app.onFrame.push(on);
  window.__paintOff = () => { const i = app.onFrame.indexOf(on); if (i >= 0) app.onFrame.splice(i, 1); window.__paintOff = null; };
  app.t = 0; app.manual = true;
})()`;

const CASES = [
  { name: 'red and blue at equal gamma luma, 3 a second, whole frame', A: [255, 40, 0], B: [0, 90, 255], hz: 3, want: { caughtBy: 'rc', notBy: ['luma'], bad: true } },
  { name: "the plan's vermilion and blue, 3 a second, whole frame", A: [255, 62, 20], B: [0, 132, 255], hz: 3, want: { caughtBy: 'rc', notBy: ['luma'], bad: true } },
  { name: 'dim saturated red, only the red term can see it', A: [140, 0, 0], B: [120, 0, 0], hz: 3, want: { caughtBy: 'red', notBy: ['luma', 'rc'], bad: true } },
  { name: 'plain grey, only brightness', A: [200, 200, 200], B: [100, 100, 100], hz: 3, want: { caughtBy: 'luma', notBy: ['red', 'rc'], bad: true } },
  { name: 'red and blue in one tile, 2 a second', A: [255, 40, 0], B: [0, 90, 255], hz: 2, tile: 5, want: { caughtBy: 'rc', on: 'tile', bad: true } },
  // The guard sits inside the judge's limits on purpose: this tile moves the whole frame's cyan by 25.4, under the judge's 25.5 and over the guard's 19. So the guard acts on it, and the judge lets it pass.
  { name: 'red and blue in one tile, 1 a second: at the limit', A: [255, 40, 0], B: [0, 90, 255], hz: 1, tile: 5, want: { bad: false }, guard: true },
  { name: 'red and blue, whole frame, once in two seconds: under it', A: [255, 40, 0], B: [0, 90, 255], hz: 0.25, want: { bad: false } },
  { name: 'nothing changes', A: [255, 40, 0], B: [255, 40, 0], hz: 3, want: { bad: false } },
];

const checkCase = (res, want) => {
  const fails = [];
  if (res.bad !== want.bad) fails.push(`bad is ${res.bad}, want ${want.bad}`);
  if (want.caughtBy && want.on !== 'tile' && !(res[want.caughtBy].whole > 0)) fails.push(`${want.caughtBy} didn't catch it on the whole frame`);
  if (want.caughtBy && want.on === 'tile' && !(res[want.caughtBy].tile > WORLD_FLASH.tile)) fails.push(`${want.caughtBy} didn't catch it on the tile`);
  for (const c of want.notBy ?? []) if (res[c].whole > 0 || res[c].tile > 0) fails.push(`${c} saw it too: ${JSON.stringify(res[c])}`);
  return fails;
};

export default async ({ page, log, save, sleep }) => {
  const stages = (process.env.STAGE || 'selftest,dark').split(',');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  await page.eval(`app.governor.enabled=false;app.R.drawScale=1;app.manual=true`);
  let failed = 0;
  const say = (ok, line) => { if (!ok) failed++; log(`${ok ? 'ok  ' : 'BAD '} ${line}`); };

  if (stages.includes('selftest')) {
    for (const fps of [12, 60]) for (const [i, c] of CASES.entries()) {
      const w = await watch(page, fps === 12 && i === 0 ? save : () => {}, { name: 'selftest-redblue', seconds: 4, fps, cols: 8, rows: 2, colour: true, setup: paintSetup(c) });
      await page.eval(`window.__paintOff?.()`);
      const res = flashThree(w), fails = checkCase(res, c.want);
      say(!fails.length, `${fps} fps, ${c.name}: luma ${res.luma.whole}/${res.luma.tile}, red ${res.red.whole}/${res.red.tile}, cyan ${res.rc.whole}/${res.rc.tile}${res.bad ? ', caught' : ', passes'}${fails.length ? ' [' + fails.join('; ') + ']' : ''}`);
    }
    // The rehearsal's own eyes, FlashSeen with its world path, on the same paint: the guard must see what the test sees. And what the film's path reads, for the record.
    const seen = await page.eval(async ({ CASES, setups }) => {
      const { FlashSeen } = await import(new URL('src/music/rehearse.js', location.href).href);
      const T = window.trippee, gl = app.R.gl, out = [];
      for (let i = 0; i < CASES.length; i++) {
        (0, eval)(setups[i]);
        const W = T.canvas.width, H = T.canvas.height, n = 48, fps = 12, px = new Uint8Array(W * H * 4), world = new FlashSeen(n, W, H, fps, true), film = new FlashSeen(n, W, H, fps);
        for (let k = 0; k < n; k++) { T.step(1 / fps); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); const f = app.lastFrame; world.take(k, px, f, []); film.take(k, px, f, []); }
        window.__paintOff?.();
        out.push({ world: world.over().length, film: film.over().length });
      }
      return out;
    }, { CASES: CASES.map(c => c.name), setups: CASES.map(paintSetup) });
    CASES.forEach((c, i) => { say((seen[i].world > 0) === (c.guard ?? c.want.bad), `FlashSeen's world path, ${c.name}: ${seen[i].world} over its limits (the film's path, reading green at the film's limits: ${seen[i].film})`); });
  }

  if (stages.includes('dark')) {
    const shapes = {
      'all black': { ctx: 'x.fillStyle="#000";x.fillRect(0,0,W,H)', bad: true },
      'a huge black disc on plum': { ctx: 'x.fillStyle="#6a2a4a";x.fillRect(0,0,W,H);x.fillStyle="#000";x.beginPath();x.arc(W/2,H/2,H*.33,0,7);x.fill()', bad: true, why: 'disc' },
      'half black in thin stripes': { ctx: 'x.fillStyle="#ff3e14";x.fillRect(0,0,W,H);x.fillStyle="#000";for(let i=0;i<W;i+=12)x.fillRect(i,0,6,H)', bad: true, why: 'share' },
      'a fifth black in thin stripes': { ctx: 'x.fillStyle="#ff3e14";x.fillRect(0,0,W,H);x.fillStyle="#000";for(let i=0;i<W;i+=20)x.fillRect(i,0,4,H)', bad: false },
      'plum, nearly black but not': { ctx: 'x.fillStyle="#4a3148";x.fillRect(0,0,W,H)', bad: false },
      'velvet at Y .02 fills a quarter, as a small disc': { ctx: 'x.fillStyle="#e040c0";x.fillRect(0,0,W,H);x.fillStyle="#180a20";x.beginPath();x.arc(W/2,H/2,H*.2,0,7);x.fill()', bad: false },
    };
    const got = await page.eval(async shapes => {
      const { darkOf } = await import(new URL('tools/look.mjs', location.href).href);
      const W = 320, H = 180, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d', { willReadFrequently: true }), out = {};
      for (const [k, v] of Object.entries(shapes)) { new Function('x', 'W', 'H', v.ctx)(x, W, H); out[k] = darkOf(x.getImageData(0, 0, W, H).data, W, H); }
      return out;
    }, shapes);
    for (const [k, v] of Object.entries(shapes)) say(got[k].bad === v.bad, `Dark, ${k}: share ${got[k].share}, disc ${got[k].disc}${got[k].bad ? ', caught' : ', passes'}`);
  }

  if (stages.includes('film')) {
    const songPath = process.env.SONG || 'media/mgmt.mp3', song = basename(songPath).replace(/\.\w+$/, ''), secs = +(process.env.SECS || 60);
    await dropSong(page, songPath, { resolvePath: resolve, sleep });
    const a = await watch(page, () => {}, { name: 'plain', seconds: secs, fps: 12, cols: 2, rows: 1, setup: 'app.t=30' });
    const b = await watch(page, () => {}, { name: 'colour', seconds: secs, fps: 12, cols: 2, rows: 1, setup: 'app.t=30', colour: true });
    const same = k => JSON.stringify(a[k]) === JSON.stringify(b[k]);
    for (const k of ['white', 'mean', 'grey', 'edges', 'diff', 'tiles', 'time']) say(same(k), `${song}, ${secs} s: ${k} from the colour watch is the plain watch's, byte for byte`);
    const A = analyse(a), res = flashThree(b, { whole: 1e9, tile: 1e9 });
    say(res.luma.whole === A.flashesPerSecondWholeFrame && res.luma.tile === A.flashesPerSecondAnyTile, `luma channel ${res.luma.whole}/${res.luma.tile}, analyse() says ${A.flashesPerSecondWholeFrame}/${A.flashesPerSecondAnyTile}`);
    say(res.red.whole === 0 && res.red.tile === 0 && res.rc.whole === 0 && res.rc.tile === 0, `black and white has no red and no cyan: red ${res.red.whole}/${res.red.tile}, cyan ${res.rc.whole}/${res.rc.tile}`);
  }

  if (stages.includes('world')) {
    const songPath = process.env.SONG || 'media/mgmt.mp3', song = basename(songPath).replace(/\.\w+$/, ''), world = process.env.WORLD || 'mirror', secs = +(process.env.SECS || 0);
    await dropSong(page, songPath, { resolvePath: resolve, sleep });
    await enterWorld(page, world, log);
    const info = await page.eval(() => { const s = app.stage.score; return { duration: app.song.duration, gestures: s.gestures.map(G => ({ t1: G.t1, id: G.pattern.id, morph: G.morph || 0 })), pulses: Array.from(s.react?.pulses || []).slice(0, 2000) }; });
    const dur = secs || info.duration, cols = 14, rows = Math.ceil(dur / 2 / cols);
    const w = await watch(page, save, { name: `${world}-${song}`, seconds: dur, fps: 12, cols, rows, colour: true, setup: 'app.t=0' });
    const whole = flashThree(w);
    log(`${world} on ${song}, 12 fps, ${r2(dur)} s: luma ${whole.luma.whole}/${whole.luma.tile}, red ${whole.red.whole}/${whole.red.tile}, cyan ${whole.rc.whole}/${whole.rc.tile} (swings ${JSON.stringify(CHANNELS)}; limits ${WORLD_FLASH.whole} and ${WORLD_FLASH.tile})`);
    for (const o of whole.over.slice(0, 12)) log(`  over: ${o.channel} ${o.on} ${o.n} a second near ${r2(o.t)} s`);
    if (whole.bad) failed++;
    // 60 fps around each landing and morph, which is where a colour moves fastest
    const marks = []; for (const G of info.gestures) { if (G.t1 > 2 && G.t1 < dur - 2) marks.push(G.t1); if (G.morph && G.t1 - G.morph > 2 && G.t1 - G.morph < dur - 2) marks.push(G.t1 - G.morph); }
    let worst = null;
    for (const t of marks) {
      const x = await watch(page, () => {}, { name: 'w', seconds: 3, fps: 60, cols: 2, rows: 1, colour: true, setup: `app.t=${t - 1.5}` });
      const r = flashThree(x);
      if (r.bad) { failed++; for (const o of r.over.slice(0, 3)) log(`  over at 60 fps: ${o.channel} ${o.on} ${o.n} a second near ${r2(o.t)} s`); }
      if (!worst || r.rc.tile + r.luma.tile + r.red.tile > worst) worst = r.rc.tile + r.luma.tile + r.red.tile;
    }
    log(`${marks.length} windows at 60 fps`);
    const dark = await page.eval(async dur => {
      const { darkOf } = await import(new URL('tools/look.mjs', location.href).href);
      const T = window.trippee, W = 320, H = 180, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d', { willReadFrequently: true }), out = [];
      for (let t = 1; t < dur; t += 1) { T.seek(t); x.drawImage(T.canvas, 0, 0, W, H); const d = darkOf(x.getImageData(0, 0, W, H).data, W, H); out.push({ t, ...d }); if (t % 8 === 0) await new Promise(r => setTimeout(r)); }
      return out;
    }, dur);
    const darkBad = dark.filter(d => d.bad);
    log(`Dark, a frame a second: ${darkBad.length} of ${dark.length} over; worst share ${Math.max(...dark.map(d => d.share))}, worst disc ${Math.max(...dark.map(d => d.disc))}${darkBad.length ? '; first at ' + darkBad.slice(0, 8).map(d => d.t).join(' ') : ''}`);
    if (darkBad.length) failed++;
    save(`flashworld-${world}-${song}.json`, JSON.stringify({ world, song, whole, dark }));
  }

  const errs = page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  if (errs.length) { log('page errors', errs.slice(0, 6)); failed++; }
  log(failed ? `${failed} FAILED` : 'all as they should be');
  if (failed) process.exitCode = 1;
};
