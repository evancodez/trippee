// Shock and Fall inside a real film, with a real song, on a fixed clock. Sound never plays: the lab mutes Chrome and the song is paused.
//   SONG=media/ppp.mp3 N=6 WEAR=shock|fall|both node tools/lab.mjs tests/shockfilm.mjs --out lab-out/x
// Wears the move on the first N gestures that can, then scans each transformation at 60 fps at both ends for pops, and writes a sheet and slices of each.
import { resolve, basename } from 'node:path';
import { watch, analyse } from '../tools/look.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
export default async ({ page, log, save }) => {
  const song = process.env.SONG || 'media/ppp.mp3', N = +(process.env.N || 6), wear = process.env.WEAR || 'both', dirs = (process.env.DIRS || '1,2').split(',').map(Number);
  const data = { items: [], files: [resolve(song)], dragOperationsMask: 1 };
  await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 640, y: 360, data });
  await page.send('Input.dispatchDragEvent', { type: 'drop', x: 640, y: 360, data });
  for (let i = 0; i < 600; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await sleep(100); }
  await page.eval(`app.song.pause();app.ui.song.show(false);document.querySelector('#hints').hidden=true;app.manual=true;app.governor.enabled=false;app.R.drawScale=1;app.t=0;`);
  const worn = await page.eval(async ({ N, wear, dirs, skip }) => {
    const X = await import('/src/score/xform/index.js');
    const s = app.song.score, g = s.gestures, asp = app.canvas.width / app.canvas.height, out = [], bar = 60 / (s.song?.bpm || 120) * (s.song?.meter || 4);
    const phiOf = (t, G) => s.phi(t, G);
    let shocks = 0;
    for (let i = 1 + skip; i < g.length - 2 && out.length < N; i++) {
      const G = g[i], Nx = g[i + 1], L = G.t1;
      if (!G.morph) continue;
      let what = null;
      const wantFall = wear === 'fall' || (wear === 'both' && out.length % 2 === 1);
      if (!wantFall) {
        const dir = dirs[shocks % dirs.length];
        const fit = X.wearShock(G, Nx, L, { dir, D: Math.min(G.morph, 10), aspect: asp, phiOf, beats: s.react?.pulses });
        if (fit) { what = { kind: 'shock', dir, W: +fit.W.toFixed(2), pairs: fit.pairs, close: fit.close.length, open: fit.open.length, ratio: +fit.ratio.toFixed(2) }; shocks++; }
      }
      if (!what && wear !== 'shock') { X.wearFall(G, Nx, { a: 1, bar, phiOf, spin: out.length % 4 === 1 ? 0.25 : -0.25 }); what = { kind: 'fall', v: +Nx.carry.v.toFixed(2), pre: +Nx.carry.pre.toFixed(2), K: +Nx.carry.K.toFixed(2) }; }
      if (what) out.push({ i, a: G.pattern.id, b: Nx.pattern.id, L: +L.toFixed(2), t0: +(G.t1 - G.morph).toFixed(2), t1: +G.t1.toFixed(2), ...what });
    }
    return { out, bar, genes: g.length };
  }, { N, wear, dirs, skip: +(process.env.SKIP || 0) });
  log('film', basename(song), 'gestures', worn.genes, 'bar', worn.bar.toFixed(2));
  let bad = 0;
  for (const w of worn.out) {
    await page.eval(`app.t=${w.t0 - 0.6};trippee.step(0)`);
    const name = `film_${basename(song, '.mp3')}_${w.i}_${w.kind}`;
    const res = await watch(page, save, { name, seconds: w.t1 - w.t0 + 2.2, fps: 60, cols: 8, rows: 6 });
    const x = analyse(res);
    const kind = await page.eval(`(app.lastFrame?.kind)`);
    const iOf = t => Math.round((t - (w.t0 - 0.6)) * 60);
    const win = (a, b) => res.diff.slice(Math.max(0, a), b);
    const med = a => [...a].sort((p, q) => p - q)[a.length >> 1];
    const at0 = iOf(w.t0), at1 = iOf(w.t1);
    const startStep = Math.max(...win(at0 - 2, at0 + 3)), endStep = Math.max(...win(at1 - 2, at1 + 3));
    const before = med(win(at0 - 30, at0 - 3)), around = med(win(at1 - 12, at1 + 12)), all = med(res.diff);
    const peak = Math.max(...res.diff), peakAt = res.time[res.diff.indexOf(peak)];
    // A pop is one frame well above the frames on both sides of it
    let pops = [];
    for (let k = 3; k < res.diff.length - 3; k++) {
      const n = [res.diff[k - 3], res.diff[k - 2], res.diff[k + 2], res.diff[k + 3]].sort((p, q) => p - q);
      const near = n[1];
      if (res.diff[k] > Math.max(3 * near, near + 3)) pops.push([res.time[k], res.diff[k], +near.toFixed(1)]);
    }
    if (pops.length) bad++;
    log(JSON.stringify(w));
    log('   start', startStep, 'before', before, 'end', endStep, 'around', around, 'median', all, 'peak', peak, 'at', peakAt, 'grey95', x.p95GreyAtNativeRes, 'flash', x.flashesPerSecondWholeFrame, x.flashesPerSecondAnyTile, 'white', Math.min(...res.white), Math.max(...res.white), 'pops', JSON.stringify(pops.slice(0, 6)));
  }
  log('runs with a pop', bad, 'of', worn.out.length);
  log('errors', page.logs.filter(l => /\[error\]|\[exception\]/.test(l)));
};
