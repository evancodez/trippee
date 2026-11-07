// What a fold costs: the GPU's own time per frame, at the size asked for, on the pattern as a film would have it, and the same pattern plain. Stills as PNGs at full size for looking at.
//   node tools/lab.mjs tests/foldcost.mjs --size 1920,1080 --out lab-out/f
export default async ({ page, save, log }) => {
  const r = await page.eval(async ({ ids, wears }) => {
    const T = window.trippee;
    await app.R.whenFoldReady();
    const mod = await import('/src/score/moves/index.js');
    app.governor.enabled = false; app.R.drawScale = 1; app.manual = true;
    const R = app.R, had = R.onCost, out = {}, sleep = ms => new Promise(r => setTimeout(r, ms));
    const measure = async () => {
      const got = [];
      R.onCost = (k, s, ms) => got.push(ms);
      for (let i = 0; i < 90; i++) { T.step(1 / 60); await new Promise(r => requestAnimationFrame(r)); }
      R.onCost = had;
      got.sort((a, b) => a - b);
      return { median: +(got[got.length >> 1] ?? -1).toFixed(2), p95: +(got[Math.floor(got.length * 0.95)] ?? -1).toFixed(2), n: got.length, variant: R.variant };
    };
    const beats = []; for (let t = -100; t < 500; t += 1) beats.push(t);
    for (const id of ids) { T.load(id, { arcs: false }); app.t = 12; out[id] = await measure(); }
    for (const [base, w] of wears) {
      const G = { t0: -200, t1: 3600, arcEnd: 3600, pattern: app.byId[base], moves: [] };
      if (w !== 'plain') G.moves.push(mod.MOVES[w].cue({ id: w, beats, from: -50, to: 1000, open: 1, close: 1 }, { score: { time: x => x }, A: {}, G, at: x => x, bar: 2, beat: .5, meter: 4 }));
      app.stage.score.gestures = [G]; app.stage.score.handover = null; app.stage.hold = true; app.t = 12;
      out[`${base}+${w}`] = await measure();
    }
    return { out, w: T.canvas.width, h: T.canvas.height, timer: !!R.timer };
  }, { ids: ['lines.fall', 'checks.vega', 'folds.fan', 'folds.forever', 'folds.screen', 'folds.limit', 'folds.crumple', 'folds.pearls'], wears: [['lines.fall', 'plain'], ['lines.fall', 'fan'], ['lines.fall', 'forever'], ['lines.fall', 'screen'], ['lines.fall', 'limit'], ['lines.fall', 'crumple'], ['lines.fall', 'pearls'], ['checks.vega', 'plain'], ['checks.vega', 'limit'], ['checks.vega', 'pearls']] });
  log(`canvas ${r.w}x${r.h} timer ${r.timer}`);
  for (const k in r.out) log(`${k}: ${JSON.stringify(r.out[k])}`);
  // Stills
  for (const id of (process.env.STILLS || 'folds.fan,folds.forever,folds.foreverstar,folds.screen,folds.screenwave,folds.limit,folds.crumple,folds.pearls').split(',')) {
    await page.eval(`(async()=>{trippee.load(${JSON.stringify(id)},{arcs:false}); app.t=23; trippee.step(0);})()`);
    const url = await page.eval(`(trippee.step(0), trippee.canvas.toDataURL('image/jpeg',.9))`);
    save(`still-${id}.jpg`, url);
  }
};
