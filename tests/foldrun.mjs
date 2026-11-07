// Fold patterns, by hand and worn on a film's own patterns, as dense sheets across a move. No song: the move's own clock.
//   IDS=folds.fan,folds.screen LEN=24 node tools/lab.mjs tests/foldrun.mjs --out lab-out/f
//   WEAR=fan BASE=checks.vega FROM=2 TO=30 LEN=34 ...   the move on a film's pattern: in, through and out, with beats at BPM
export default async ({ page, save, log }) => {
  const r = await page.eval(async (o) => {
    const T = window.trippee, app = T.app;
    await app.R.whenFoldReady();
    app.governor.enabled = false; app.R.drawScale = 1; app.manual = true;
    const mod = await import('/src/score/moves/index.js');
    const sheets = {};
    const cols = o.cols, tw = o.tw, th = Math.round(tw * 9 / 16);
    const shoot = async name => {
      const N = cols * o.rows, c = document.createElement('canvas'); c.width = cols * tw; c.height = o.rows * th;
      const g = c.getContext('2d');
      for (let i = 0; i < N; i++) {
        app.t = o.t0 + o.len * i / N; T.step(0);
        g.drawImage(T.canvas, (i % cols) * tw, Math.floor(i / cols) * th, tw - 1, th - 1);
        g.fillStyle = '#f33'; g.font = '11px monospace'; g.fillText(app.t.toFixed(1), (i % cols) * tw + 3, Math.floor(i / cols) * th + 11);
      }
      sheets[name] = c.toDataURL('image/jpeg', 0.82);
    };
    if (o.wear) {
      const P = app.byId[o.base], beats = []; for (let t = 0; t < o.len + 40; t += 60 / o.bpm) beats.push(t);
      const G = { t0: 0, t1: 3600, arcEnd: 3600, pattern: P, moves: [] };
      const m = { id: o.wear, beats, from: o.from, to: o.to, ...(o.opts ?? {}) };
      const made = mod.MOVES[o.wear].cue ? mod.MOVES[o.wear].cue(m, { score: { time: x => x }, A: {}, G, at: x => x, bar: 2, beat: .5, meter: 4 }) : m;
      if (!made) return { err: 'refused' };
      G.moves.push(made);
      app.stage.score.gestures = [G]; app.stage.score.handover = null; app.stage.hold = true;
      await shoot(`${o.wear}-${o.base}`);
    } else for (const id of o.ids) {
      T.load(id, { arcs: false }); await shoot(id);
    }
    return { sheets };
  }, { ids: (process.env.IDS || '').split(','), wear: process.env.WEAR, base: process.env.BASE, from: +(process.env.FROM || 2), to: +(process.env.TO || 30), bpm: +(process.env.BPM || 60), t0: +(process.env.T0 || 0), len: +(process.env.LEN || 24), cols: +(process.env.COLS || 8), rows: +(process.env.ROWS || 6), tw: +(process.env.TW || 225), opts: process.env.OPTS ? JSON.parse(process.env.OPTS) : null });
  if (r.err) { log(r.err); return; }
  for (const k in r.sheets) save(k + '.jpg', r.sheets[k]);
};
