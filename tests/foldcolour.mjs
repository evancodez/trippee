// The fold set in colour and in a world: the same frames in black and white, Beyond's plates, and each world asked for. Says if a program fails to build.
//   WORLDS=flower,numbers node tools/lab.mjs tests/foldcolour.mjs --size 1280,720 --out lab-out/f
export default async ({ page, save, log }) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 240; i++) { if (await page.eval('typeof window.trippee !== "undefined" && window.trippee.ready === true')) break; await sleep(250); }
  const worlds = (process.env.WORLDS || '').split(',').filter(Boolean);
  const r = await page.eval(async ({ worlds }) => {
    const T = window.trippee, sleep = ms => new Promise(r => setTimeout(r, ms)); await app.R.whenFoldReady();
    app.governor.enabled = false; app.R.drawScale = 1; app.manual = true;
    const ids = ['folds.fan', 'folds.forever', 'folds.foreverstar', 'folds.screen', 'folds.limit', 'folds.crumple', 'folds.pearls'], tw = 256, th = 144, modes = ['bw', 'colour', ...worlds];
    const c = document.createElement('canvas'); c.width = ids.length * tw; c.height = modes.length * th; const g = c.getContext('2d'); g.font = '11px monospace';
    const fails = [];
    let y = 0;
    for (const mode of modes) {
      if (mode === 'colour') { app.beyond.on(); app.beyond.snap(0.6); }
      else if (mode !== 'bw') {
        app.beyond.off(); app.beyond.snap();
        await T.world(mode);
        for (let i = 0; i < 400 && !app.R.wp?.ready; i++) { T.step(1 / 30); await sleep(50); }
        for (let i = 0; i < 120; i++) { T.step(1 / 30); await sleep(5); }
      }
      let x = 0;
      for (const id of ids) {
        T.load(id, { arcs: false });
        if (mode !== 'bw' && mode !== 'colour') { app.t = 20; T.step(0); for (let i = 0; i < 80 && app.R.wp && !app.R.wp.progs[app.R.wp.variantOf(app.R.frame)]; i++) { await sleep(100); T.step(0); } }
        app.t = 20; T.step(0);
        g.drawImage(T.canvas, x * tw, y * th, tw - 1, th - 1);
        g.fillStyle = '#f33'; g.fillText(`${mode} ${id} v${app.R.variant}`, x * tw + 3, y * th + 12);
        if (app.R.wp?.failed) fails.push(`${mode}: ${app.R.wp.failed.slice(0, 300)}`);
        x++;
      }
      y++;
    }
    return { url: c.toDataURL('image/jpeg', 0.85), fails };
  }, { worlds });
  save('colour.jpg', r.url);
  log(`fails: ${JSON.stringify(r.fails)}`);
  const errs = page.logs.filter(l => /shader|failed|error/i.test(l)).slice(0, 6); if (errs.length) log(errs.join('\n'));
};
