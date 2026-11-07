// Each fold worn on real film patterns, fully in, at one time. BASES=a,b,c WEARS=fan,forever TIME=20 node tools/lab.mjs tests/foldwear.mjs --out lab-out/f
export default async ({ page, save, log }) => {
  const r = await page.eval(async (o) => {
    const T = window.trippee, app = T.app;
    await app.R.whenFoldReady();
    app.governor.enabled = false; app.R.drawScale = 1; app.manual = true;
    const mod = await import('/src/score/moves/index.js');
    const tw = o.tw, th = Math.round(tw * 9 / 16), c = document.createElement('canvas'); c.width = o.wears.length * tw; c.height = o.bases.length * th;
    const g = c.getContext('2d'); const beats = []; for (let t = -100; t < 500; t += 1) beats.push(t);
    let y = 0;
    for (const b of o.bases) {
      let x = 0;
      for (const w of o.wears) {
        const [id, optsS] = w.split('~'), opts = optsS ? JSON.parse(optsS) : {};
        const G = { t0: -200, t1: 3600, arcEnd: 3600, pattern: app.byId[b], moves: [] };
        if (id !== 'none') { const m = { id, beats, from: -50, to: 1000, open: 1, close: 1, ...opts }; const made = mod.MOVES[id].cue(m, { score: { time: x => x }, A: {}, G, at: x => x, bar: 2, beat: .5, meter: 4 }); if (!made) throw new Error('refused ' + id); G.moves.push(made); }
        app.stage.score.gestures = [G]; app.stage.score.handover = null; app.stage.hold = true;
        app.t = o.time; T.step(0);
        g.drawImage(T.canvas, x * tw, y * th, tw - 1, th - 1);
        g.fillStyle = '#f33'; g.font = '11px monospace'; g.fillText(`${b} ${w.slice(0, 22)}`, x * tw + 3, y * th + 11);
        x++;
      }
      y++;
    }
    return { url: c.toDataURL('image/jpeg', 0.85) };
  }, { bases: (process.env.BASES || 'checks.vega,lines.fall,lattice.master,waves.silk,rooms.nested,lattice.pinwheel,dots.inflate,pole.garden').split(','), wears: (process.env.WEARS || 'none;fan;forever;screen;limit;crumple').split(';'), time: +(process.env.TIME || 20), tw: +(process.env.TW || 300) });
  save((process.env.NAME || 'wear') + '.jpg', r.url);
};
