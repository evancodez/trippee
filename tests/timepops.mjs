// Any pop as each of the time family comes up, runs and goes through its turns: every frame at 60 fps, how much of the frame changed against the frames round it. IDS=... SECS=8 node tools/lab.mjs tests/timepops.mjs
export default async ({ page, log }) => {
  const env = process.env, ids = (env.IDS || 'time.shutter,time.target,time.rings,time.venetian,time.spiral,time.cells,time.wave,time.ghost,time.fringe,time.snakes,time.ouchi,time.echo,time.waterfall,time.rewind').split(',');
  for (const id of ids) {
    const r = await page.eval(async ({ id, secs, from }) => {
      const T = window.trippee, app = T.app, R = app.R; app.governor.enabled = false; R.drawScale = 1;
      R._wantTime(0); for (let i = 0; i < 400 && !R.progs[1024]; i++) await new Promise(r => setTimeout(r, 25));
      T.load(id, {}); app.manual = true; app.t = from; T.step(0);
      const W = 320, H = 180, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
      let prev = null; const d = [];
      for (let i = 0; i < secs * 60; i++) {
        T.step(1 / 60); g.drawImage(T.canvas, 0, 0, W, H);
        const p = g.getImageData(0, 0, W, H).data; let s = 0;
        if (prev) for (let k = 0; k < p.length; k += 4) s += Math.abs(p[k + 1] - prev[k + 1]);
        if (prev) d.push(s / (W * H)); prev = p;
      }
      let worst = 0, at = 0;
      for (let i = 3; i < d.length - 3; i++) { const n = [d[i - 3], d[i - 2], d[i - 1], d[i + 1], d[i + 2], d[i + 3]].sort((a, b) => a - b), m = n[2] + 0.3, q = d[i] / m; if (q > worst) { worst = q; at = from + i / 60; } }
      const i0 = Math.round((at - from) * 60); return { around: d.slice(Math.max(0, i0 - 6), i0 + 7).map(x => +x.toFixed(2)), ratio: +worst.toFixed(2), at: +at.toFixed(2), most: +Math.max(...d).toFixed(1), mean: +(d.reduce((a, b) => a + b, 0) / d.length).toFixed(1) };
    }, { id, secs: +(env.SECS || 10), from: +(env.FROM || 0) });
    log(id, JSON.stringify(r));
  }
  log('errors', JSON.stringify(page.logs.filter(l => /\[error\]|\[exception\]/.test(l)).slice(0, 4)).slice(0, 500));
};
