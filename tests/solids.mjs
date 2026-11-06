// Every pattern, one whole gesture stepped through: does it start and land exactly solid, and does it ever jump?
//   node tools/lab.mjs tests/solids.mjs --out lab-out/me
export default async ({ page, log }) => {
  const r = await page.eval(async () => {
    const W = 160, H = 90, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    const read = () => { g.drawImage(app.canvas, 0, 0, W, H); const d = g.getImageData(0, 0, W, H).data, v = new Float32Array(W * H); for (let i = 0; i < v.length; i++) v[i] = d[i * 4] / 255; return v; };
    const mean = v => { let s = 0; for (let i = 0; i < v.length; i++) s += v[i]; return s / v.length; };
    const out = [], LEN = 26, STEP = 0.2;
    for (const p of app.patterns) {
      trippee.load(p.id, { sweep: true, len: LEN }); app.manual = true;
      let prev = null, jump = 0, at = 0, first = 0, last = 0, spread = 0;
      for (let t = 0; t <= LEN - 0.001 + 1e-6; t += STEP) {
        app.t = Math.min(t, LEN - 0.001); trippee.step(0);
        const v = read(), m = mean(v);
        if (t === 0) first = m;
        if (prev !== null && Math.abs(m - prev) > jump) { jump = Math.abs(m - prev); at = t; }
        prev = m;
      }
      app.t = LEN - 0.001; trippee.step(0); last = mean(read());
      out.push({ id: p.id, first: +first.toFixed(4), last: +last.toFixed(4), jump: +jump.toFixed(3), at: +at.toFixed(1) });
      await new Promise(r => setTimeout(r, 0));
    }
    return out;
  });
  const bad = r.filter(x => x.first > 0.005 || x.last < 0.995);
  log('patterns', r.length, 'not exactly solid at the ends:', JSON.stringify(bad));
  const j = [...r].sort((a, b) => b.jump - a.jump).slice(0, 8);
  log('largest brightness change in 0.2 s:', JSON.stringify(j.map(x => [x.id, x.jump, x.at])));
  log('errors', page.logs.filter(l => /\[error\]|\[exception\]/.test(l)));
};
