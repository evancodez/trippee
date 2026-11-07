// Look at the time family: a dense sheet across a move, with no song, or with a real one (muted, the lab's Chrome always is).
//   IDS=time.shutter,time.ghost FROM=6 SECS=8 EVERY=.2 COLS=5 node tools/lab.mjs tests/time.mjs --out lab-out/t
//   BEGIN=0 is how far the arrival was. PICK=1 clicks it in the library, as the owner would, and waits for the flight in.
export default async ({ page, save, log }) => {
  const env = process.env, ids = (env.IDS || 'time.shutter').split(','), from = +(env.FROM ?? 6), secs = +(env.SECS ?? 8), every = +(env.EVERY ?? 0.2), cols = +(env.COLS ?? 5);
  for (const id of ids) {
    const r = await page.eval(async ({ id, from, secs, every, cols, tile, patch, morph }) => {
      const t = window.trippee, app = t.app; app.governor.enabled = false; app.R.drawScale = 1;
      if (patch) (0, eval)(`(p, app) => { ${patch} }`)(app.byId[id], app);
      if (morph) { const [a, b, D, x] = morph.split(','); t.morph(a, b, +D, 1); const G0 = app.stage.score.gestures[0]; G0.xform = (0, eval)(`(${x || "{id:'span'}"})`); delete G0.plan; delete G0.planFor; delete G0.planning; app.t = 0; }
      else t.load(id, { arcs: true });
      app.manual = true; app.t = from; t.step(0.016);
      // let the time program build if it's wanted
      app.R._wantTime(0); for (let i = 0; i < 400 && !app.R.progs[1024]; i++) await new Promise(r => setTimeout(r, 25));
      const n = Math.round(secs / every), W = tile, H = Math.round(W * t.canvas.height / t.canvas.width), rows = Math.ceil(n / cols);
      const sheet = document.createElement('canvas'); sheet.width = cols * W; sheet.height = rows * H;
      const g = sheet.getContext('2d'); g.font = '12px monospace';
      app.t = from;
      const rec = [];
      for (let i = 0; i < n; i++) {
        t.step(0); const x = (i % cols) * W, y = (i / cols | 0) * H;
        g.drawImage(t.canvas, x, y, W, H); g.fillStyle = '#f33'; g.fillText((app.t).toFixed(2), x + 3, y + 13);
        rec.push(app.R.variant);
        t.step(every - 0);
      }
      return { sheet: sheet.toDataURL('image/jpeg', 0.85), vars: [...new Set(rec)] };
    }, { id, from, secs, every, cols, tile: +(env.TILE ?? 320), patch: env.PATCH, morph: env.MORPH });
    save(`${id}.jpg`, r.sheet);
    log(id, 'programs', JSON.stringify(r.vars));
  }
  const errors = page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  log('errors', JSON.stringify(errors.slice(0, 6)).slice(0, 1500));
};
