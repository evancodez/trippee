// Real frame rates. Run: node tools/lab.mjs tests/fps.mjs --size 1920,1080 --out lab-out/integrate
// First the cost of every pattern on the GPU at several points of its move (draw, then wait for it), then the heaviest under the
// real rAF loop. DSF=2 draws at twice the density, like a Retina screen. GOV=0 turns the governor off for the measurement.
const sleep = ms => new Promise(r => setTimeout(r, ms));
export default async ({ page, log, save }) => {
  const W = +(process.env.W || 1920), H = +(process.env.H || 1080), DSF = +(process.env.DSF || 1);
  if (DSF !== 1 || W !== 1920) { await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DSF, mobile: false }); await sleep(500); }
  log('canvas', await page.eval('[app.canvas.width,app.canvas.height,devicePixelRatio]'));
  if (process.env.GOV === '0') await page.eval('app.governor.enabled = false');
  const costs = await page.eval(() => {
    const gl = app.R.gl, px = new Uint8Array(4), out = [];
    const measure = () => { gl.finish(); const t0 = performance.now(); trippee.step(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
    for (const p of app.patterns) {
      trippee.load(p.id); app.manual = true;
      let worst = 0, at = 0;
      for (const u of [.1, .25, .4, .5, .6, .75, .9]) {
        app.t = 26 * u; measure();
        const c = Math.min(measure(), measure());
        if (c > worst) { worst = c; at = u; }
      }
      out.push({ id: p.id, ms: +worst.toFixed(2), at });
    }
    return out.sort((a, b) => b.ms - a.ms);
  });
  log('heaviest by GPU time', costs.slice(0, 14).map(c => `${c.id} ${c.ms}ms@${c.at}`).join('  '));
  log('lightest', costs.slice(-4).map(c => `${c.id} ${c.ms}ms`).join('  '), 'median', costs[costs.length >> 1].ms);
  const n = +(process.env.TOP || 10);
  const rows = [];
  for (const c of costs.slice(0, n)) {
    const r = await page.eval(async ({ id, at }) => {
      trippee.load(id); app.manual = false; trippee.step(0); trippee.run();
      app.t = 26 * at - 2.5; const tA = app.t;
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      const ts = []; const t0 = performance.now();
      await new Promise(res => { const f = n => { ts.push(n); if (performance.now() - t0 < 5000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
      const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b);
      return { fps: +((ts.length - 1) / ((ts.at(-1) - ts[0]) / 1000)).toFixed(1), p50: +d[d.length >> 1].toFixed(1), p95: +d[d.length * .95 | 0].toFixed(1), max: +d.at(-1).toFixed(1), scale: app.R.drawScale };
    }, c);
    rows.push({ id: c.id, cost: c.ms, ...r });
    log(c.id, 'cost', c.ms, JSON.stringify(r));
  }
  log('errors', page.logs.filter(l => /\[error\]|\[exception\]/.test(l)));
};
