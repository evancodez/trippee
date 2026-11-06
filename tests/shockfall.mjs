// Shock and Fall, watched: PAIRS="a,b;c,d" MODE=shock|fall|dive DIR=1 D=10 A=1 FPS=30 node tools/lab.mjs tests/shockfall.mjs --out lab-out/x
// A contact sheet and time-slices of each, then its pops: the steps at both ends against steady motion, and the biggest step anywhere in it.
import { watch, analyse } from '../tools/look.mjs';
export default async ({ page, save, log }) => {
  const pairs = (process.env.PAIRS || 'lattice.master,lattice.kagome').split(';').map(s => s.split(','));
  const mode = process.env.MODE || 'shock', D = +(process.env.D || 10), dir = +(process.env.DIR || 1), a = +(process.env.A || 1), fps = +(process.env.FPS || 15), hold = 1;
  const after = +(process.env.AFTER || 3.5), cols = +(process.env.COLS || 8), rows = +(process.env.ROWS || 7), any = !!process.env.ANY, push = process.env.PUSH ? +process.env.PUSH : undefined, from = +(process.env.FROM || 0), to = process.env.TO ? +process.env.TO : null;
  const centre = (process.env.CENTRE || '0,0').split(',').map(Number), turn = +(process.env.TURN || 0), beatP = +(process.env.BEAT || 0), surge = process.env.SURGE ? +process.env.SURGE : undefined, spin = process.env.SPIN ? +process.env.SPIN : undefined;
  for (const [x, y] of pairs) {
    const info = await page.eval(async ({ x, y, D, dir, a, hold, mode, any, push, from, centre, turn, beatP, surge, spin }) => {
      const T = window.trippee, app = T.app, X = await import('/src/score/xform/index.js');
      T.morph(x, y, D, hold);
      const g = app.stage.score.gestures;
      g[0].t0 = hold + D - 40;
      const asp = T.canvas.width / T.canvas.height;
      let fit = null;
      if (mode === 'shock') {
        fit = X.wearShock(g[0], g[1], hold + D - 0.21 * D, { dir, D, aspect: asp, any, push, centre, turn, beats: beatP ? Array.from({ length: 40 }, (_, k) => k * beatP) : null, surge });
        if (fit) { const shift = g[0].t1 - (hold + D); g[0].t1 -= shift; g[1].t0 -= shift; if (beatP) g[0].xform.beats = Array.from({ length: 40 }, (_, k) => k * beatP / D); }
      }
      if (mode === 'fall') { X.wearFall(g[0], g[1], { a, bar: 2, D, spin }); }
      window.__x = { x, y, D, hold };
      app.t = from;
      return fit ? { W: fit.W, pairs: fit.pairs, close: fit.close, open: fit.open, ratio: fit.ratio, worst: fit.worst } : { mode };
    }, { x, y, D, dir, a, hold, mode, any, push, from, centre, turn, beatP, surge, spin });
    const name = `${mode}_${x}__${y}${process.env.TAG || ''}`;
    const w = await watch(page, save, { name, seconds: (to ?? hold + D + after) - from, fps, cols, rows });
    const m = analyse(w);
    const plan = await page.eval(`(p => p && ({ kind: p.kind, lnZ: p.lnZ, fall: p.fall, W: p.W, pair: p.pair, r: p.r, white: p.white }))(window.trippee.app.stage.score.gestures[0].plan)`);
    const iOf = t => Math.round((t - from) * fps);
    const med = [...w.diff].sort((p, q) => p - q)[w.diff.length >> 1];
    log(name, JSON.stringify(info), JSON.stringify(plan));
    log('  diff at start', w.diff[iOf(hold)], w.diff[iOf(hold) + 1], 'end', w.diff.slice(iOf(hold + D) - 2, iOf(hold + D) + 3).join(' '), 'median', med, 'max', m.maxDiff, 'at', w.time[w.diff.indexOf(m.maxDiff)], 'greyP95', m.p95GreyAtNativeRes, 'solids', m.solids.length, 'flashTile', m.flashesPerSecondAnyTile, 'white', Math.min(...w.white), Math.max(...w.white));
  }
  log('errors', page.logs.filter(l => /\[error\]|\[exception\]/.test(l)));
};
