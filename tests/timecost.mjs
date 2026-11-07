// What the time programs cost on the GPU at 1920x1080, by what the GPU says each frame took, next to the same picture on a plain program.
//   node tools/lab.mjs tests/timecost.mjs --size 1920,1080 --out lab-out/t
export default async ({ page, log }) => {
  const ids = (process.env.IDS || 'riot.ratchet,time.shutter,time.target,time.rings,time.ghost,time.fringe,time.snakes,time.waterfall').split(',');
  for (const id of ids) {
    const r = await page.eval(async ({ id }) => {
      const t = window.trippee, app = t.app, R = app.R; app.governor.enabled = false; R.drawScale = 1;
      R._wantTime(0); for (let i = 0; i < 400 && !R.progs[1024]; i++) await new Promise(r => setTimeout(r, 25));
      t.load(id, {}); app.manual = false; app.t = 12;
      const costs = {}, was = R.onCost; R.onCost = (k, s, ms) => { (costs[k] ??= []).push(ms); };
      const js = []; const orig = t.step;
      let n = 0; const end = performance.now() + 4000;
      await new Promise(res => { const f = () => { n++; if (performance.now() < end) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
      // what frame() itself takes on the CPU, for the numbers it works out
      const { frame } = await import(new URL('src/score/frame.js', location.href).href);
      const s0 = performance.now(); for (let i = 0; i < 200; i++) frame(app.stage.score, app.t + i * 0.016, R, app.edits); const cpu = (performance.now() - s0) / 200;
      R.onCost = was;
      const med = a => { const b = [...a].sort((x, y) => x - y); return +b[b.length >> 1].toFixed(2); }, out = {};
      for (const k in costs) if (costs[k].length > 8) out[k] = med(costs[k]);
      return { out, fps: +(n / 4).toFixed(0), cpu: +cpu.toFixed(3), size: [t.canvas.width, t.canvas.height] };
    }, { id });
    log(id, JSON.stringify(r));
  }
};
