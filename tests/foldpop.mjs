// Can a fold pop? (1) A fold just barely in, in the program that has folds, against no fold at all in the plain program, same moment: how many pixels differ. (2) Frame to frame at 60 fps across its whole way in and out, on a real pattern: the biggest step in the frame's brightness and the most of the frame that changes in one frame, next to the same pattern plain. (3) Landing on a frame by a seek against playing up to it.
//   node tools/lab.mjs tests/foldpop.mjs --size 1280,720 --out lab-out/f
export default async ({ page, save, log }) => {
  await page.eval(`window.__fps=${+(process.env.FPS || 60)};window.__ids=${JSON.stringify((process.env.IDS || 'fan,forever,screen,limit,crumple,pearls,roll').split(','))};window.__bases=${JSON.stringify((process.env.BASES || 'lines.fall,rooms.nested,checks.vega').split(','))}`);
  const r = await page.eval(async () => {
    const T = window.trippee; await app.R.whenFoldReady();
    const mod = await import('/src/score/moves/index.js');
    app.governor.enabled = false; app.R.drawScale = 1; app.manual = true;
    const W = 640, H = 360, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d', { willReadFrequently: true });
    const grab = () => { x.drawImage(T.canvas, 0, 0, W, H); return x.getImageData(0, 0, W, H).data.slice(); };
    const beats = []; for (let t = -100; t < 500; t += 1.6) beats.push(t);
    const wear = (P, id, o) => {
      const G = { t0: -200, t1: 3600, arcEnd: 3600, pattern: P, moves: [], arcs: [] };
      if (id) { const m = { id, beats, from: 10, to: 34, ...o }; const made = mod.MOVES[id].cue(m, { score: { time: x => x }, A: {}, G, at: x => x, bar: 2, beat: .5, meter: 4 }); if (!made) throw new Error('no ' + id); G.moves.push(made); }
      app.stage.score.gestures = [G]; app.stage.score.handover = null; app.stage.hold = true;
    };
    const out = [], bases = (window.__bases ?? ['lines.fall', 'rooms.nested', 'checks.vega']);
    for (const b of bases) for (const id of (window.__ids ?? ['fan', 'forever', 'screen', 'limit', 'crumple', 'pearls', 'roll'])) {
      const P = app.byId[b], row = { b, id };
      // 1. Just in
      wear(P, null); app.t = 10.0005; T.step(0); const plain = grab(), pv = app.R.variant;
      const o = id === 'roll' ? { hits: [22], D: 16 } : id === 'crumple' ? {} : { open: 3, close: 3 };
      wear(P, id, o);
      app.t = id === 'roll' ? 14.003 : 10.0005; T.step(0); const just = grab();
      let d = 0, big = 0; for (let i = 0; i < just.length; i += 4) { const v = Math.abs(just[i] - plain[i]); if (v > 2) d++; if (v > big) big = v; }
      if (id !== 'roll') { row.justDiff = d; row.justMax = big; row.fromV = pv; row.toV = app.R.variant; }
      // 2. All the way
      let prev = null, step = 0, most = 0, atS = 0, atM = 0, prevMean = 0;
      for (let t = 9.5; t < 35.5; t += 1 / (window.__fps ?? 60)) {
        app.t = t; T.step(0); const f = grab(); let s = 0, ch = 0;
        for (let i = 0; i < f.length; i += 4) { s += f[i]; if (prev && Math.abs(f[i] - prev[i]) > 60) ch++; }
        s /= f.length / 4;
        if (prev) { if (Math.abs(s - prevMean) > step) { step = Math.abs(s - prevMean); atS = t; } if (ch > most) { most = ch; atM = t; } }
        prev = f; prevMean = s;
        if (Math.round(t * 60) % 60 === 0) await new Promise(r => setTimeout(r));
      }
      row.step = +step.toFixed(2); row.atS = +atS.toFixed(2); row.most = +(most / (W * H) * 100).toFixed(1); row.atM = +atM.toFixed(2);
      out.push(row);
    }
    return out;
  });
  for (const x of r) log(JSON.stringify(x));
};
