// Fold patterns picked by hand, as the library picks them, into and out of; in black and white, and colour. Says how far the frame's brightness steps frame to frame, and writes sheets.
//   node tools/lab.mjs tests/foldclick.mjs --size 1280,720 --out lab-out/f
//   IDS=folds.fan,folds.limit  COLOUR=1  ONLY=cost
export default async ({ page, save, log }) => {
  const ids = (process.env.IDS || 'folds.fan,folds.forever,folds.screen,folds.limit,folds.crumple,folds.pearls').split(',');
  const r = await page.eval(async ({ ids, colour }) => {
    const T = window.trippee;
    await app.R.whenFoldReady();
    app.governor.enabled = false; app.R.drawScale = 1; app.manual = true; T.step(0.1);
    const out = {}, cols = 12, tw = 150, th = 84;
    if (colour) { app.beyond.on(); app.beyond.snap(0.6); }
    const hand = app.hand;
    const shoot = async (N, dt) => {
      const c = document.createElement('canvas'); c.width = cols * tw; c.height = Math.ceil(N / cols) * th; const g = c.getContext('2d'); g.font = '10px monospace';
      const small = document.createElement('canvas'); small.width = 160; small.height = 90; const sx = small.getContext('2d', { willReadFrequently: true });
      let prev = null, worst = 0, at = 0;
      for (let i = 0; i < N; i++) {
        const sub = 4; let w = 0;
        for (let k = 0; k < sub; k++) { T.step(dt / sub); sx.drawImage(T.canvas, 0, 0, 160, 90); const d = sx.getImageData(0, 0, 160, 90).data; let s = 0; for (let q = 0; q < d.length; q += 4) s += d[q]; s /= d.length / 4; if (prev != null && Math.abs(s - prev) > worst) { worst = Math.abs(s - prev); at = app.t; } prev = s; }
        g.drawImage(T.canvas, (i % cols) * tw, (i / cols | 0) * th, tw - 1, th - 1); g.fillStyle = '#f33'; g.fillText(`${app.t.toFixed(1)} ${app.lastFrame?.kind ?? ''}`, (i % cols) * tw + 2, (i / cols | 0) * th + 10);
      }
      return { url: c.toDataURL('image/jpeg', 0.8), worst: +worst.toFixed(1), at: +at.toFixed(2) };
    };
    for (const id of ids) {
      hand.go(app.byId[id]);
      const a = await shoot(48, 0.33);
      hand.go(app.byId['lines.fall']);
      const b = await shoot(36, 0.33);
      out[id] = { into: a, outOf: b, kind: app.stage.score.handover?.plan?.kind };
    }
    return out;
  }, { ids, colour: !!process.env.COLOUR });
  for (const id in r) {
    save(`click-${process.env.COLOUR ? 'col-' : ''}${id}.jpg`, r[id].into.url);
    save(`clickout-${process.env.COLOUR ? 'col-' : ''}${id}.jpg`, r[id].outOf.url);
    log(`${id}: in, worst step ${r[id].into.worst} at ${r[id].into.at}; out ${r[id].outOf.worst} at ${r[id].outOf.at}`);
  }
};
