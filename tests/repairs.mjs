// The small pops, one by one, each on a real film. Muted: the song stays paused, unless it's a stand-in. STAGE=head,pit,static,g SONG=mgmt node tools/lab.mjs tests/repairs.mjs --out lab-out/repair
//   head     a click, then seeking back to before it: what was showing has to start as itself and not part way through a morph
//   pit      riley.pit rising out into the next pattern with a song on
//   static   real wheel, then leaving static, on a real song
//   g        pressing g in the middle of a morph, and again, with a real key
const POP = (series, from, to) => { const s = series.slice(from, to), sorted = [...s].sort((a, b) => a - b), med = sorted[s.length >> 1] || 0, top = Math.max(...s); return { med: +med.toFixed(1), top: +top.toFixed(1), at: s.indexOf(top) + from, ratio: +(top / Math.max(med, 1)).toFixed(1) }; };
export default async ({ page, log, save, sleep }) => {
  const song = process.env.SONG || 'mgmt', stages = (process.env.STAGE || 'head,pit,static,g').split(',');
  await page.eval(`app.manual=true;window.__done=false;trippee.song('/media/${song}.mp3',{autoplay:false}).then(()=>window.__done=true);0`);
  for (let i = 0; i < 1800; i++) { if (await page.eval('window.__done')) break; await sleep(200); }
  await page.eval(() => {
    const T = window.trippee; app.song.pause(); app.manual = true; app.governor.enabled = false; app.R.drawScale = 1;
    const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d', { willReadFrequently: true });
    window.__grab = () => { g.drawImage(T.canvas, 0, 0, 160, 90); return g.getImageData(0, 0, 160, 90).data; };
    window.__diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i + 1] - b[i + 1]); return s / (a.length / 4); };
    window.__run = n => { const out = []; T.step(1 / 60); let prev = window.__grab(); for (let i = 0; i < n; i++) { T.step(1 / 60); const f = window.__grab(); out.push(+window.__diff(prev, f).toFixed(1)); prev = f; } return out; };
  });
  if (stages.includes('head')) {
    const r = await page.eval(async () => {
      const T = window.trippee, S = app.stage, out = [];
      // short heads and long ones: clicks a few seconds into a gesture, and well into it
      for (const [k, into] of [[2, 3], [3, 1], [4, 7]]) {
        const G0 = S.score.gestures[k], t = G0.t0 + into;
        T.seek(t); window.__run(4);
        S.pick('lattice.master', app.pictureT()); window.__run(600);
        const g = S.score.gestures, head = g.find(x => Math.abs(x.t1 - t) < 1) ?? g[k];
        const seek = (a, b) => { const o = []; let prev = null; for (let x = a; x < b; x += 1 / 60) { T.seek(x); const f = window.__grab(); if (prev) o.push(+window.__diff(prev, f).toFixed(1)); prev = f; } return o; };
        const across = seek(head.t0 - 0.5, head.t0 + 0.5), m0 = head.t1 - (head.morph || 0), intoMorph = head.morph ? seek(m0 - 0.3, m0 + 0.3) : [], end = seek(head.t1 - 0.3, head.t1 + 0.3);
        out.push({ head: [+head.t0.toFixed(2), +head.t1.toFixed(2), +(head.morph || 0).toFixed(2)], id: head.pattern.id, across: Math.max(...across), med: across.slice().sort((a, b) => a - b)[across.length >> 1], intoMorph: intoMorph.length ? Math.max(...intoMorph) : 0, end: Math.max(...end) });
      }
      return out;
    });
    for (const x of r) log('head', JSON.stringify(x));
  }
  if (stages.includes('pit')) {
    const r = await page.eval(async () => {
      const T = window.trippee, g = app.stage.score.gestures, out = [];
      for (const k of [1, 3]) {
        const G = g[k]; const was = { pattern: G.pattern, rise: G.rise, arcs: G.arcs, flow: G.flow, range: G.range, moves: G.moves, phiTrack: G.phiTrack };
        G.pattern = app.byId['riley.pit']; G.arcs = G.pattern.arcs; G.flow = G.pattern.flow; G.range = [0, 1]; delete G.moves; G.rise = true; G.xform = undefined; G.plan = G.planFor = G.planning = null;
        const series = [], f0 = G.t1 - 1; let prev = null, kind = null;
        for (let x = f0; x < G.t1 + 0.5; x += 1 / 60) { T.seek(x); kind = app.lastFrame.kind ?? kind; const f = window.__grab(); if (prev) series.push(+window.__diff(prev, f).toFixed(1)); prev = f; }
        out.push({ k, kind, next: g[k + 1].pattern.id, t1: +G.t1.toFixed(2), tail: series.slice(50, 70).join(' ') });
        Object.assign(G, was); G.plan = G.planFor = G.planning = null;
      }
      return out;
    });
    for (const x of r) log('pit', JSON.stringify(x));
  }
  if (stages.includes('static')) {
    const t = await page.eval(() => { const g = app.stage.score.gestures, G = g[3], t = G.t0 + 4; trippee.seek(t); window.__run(5); app.stage.setStatic(true, app.pictureT()); return window.__run(120).slice(-3); });
    log('static on', JSON.stringify(t));
    for (let i = 0; i < 6; i++) { await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 300, y: 200, deltaX: 0, deltaY: i < 4 ? -120 : 120 }); await page.eval('window.__run(4)'); }
    const r = await page.eval(() => { const a = window.__run(30); app.stage.setStatic(false, app.pictureT()); const b = window.__run(200); return { a, b, kind: app.lastFrame.kind }; });
    log('leaving static', JSON.stringify(POP(r.b, 0, 200)), 'first', r.b.slice(0, 12).join(' '), 'before', r.a.slice(-4).join(' '));
    await page.eval('app.stage.setStatic(false,app.pictureT());window.__run(30)');
  }
  if (stages.includes('g')) {
    const key = async k => { await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: 'KeyG', text: k, windowsVirtualKeyCode: 71 }); await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: 'KeyG', windowsVirtualKeyCode: 71 }); };
    await page.eval(() => { const g = app.stage.score.gestures, G = g.find(x => x.morph && x.t1 > 100 && !x.moves), t = G.t1 - G.morph * 0.5; trippee.seek(t); window.__run(5); return t; });
    await key('g');
    const a = await page.eval('window.__run(360)');
    log('g pressed mid-morph', JSON.stringify(POP(a, 0, 360)), 'active', await page.eval('app.sound?.active'), 'clock', await page.eval('!!app.clock'), 'near', a.slice(Math.max(0, POP(a, 0, 360).at - 3), POP(a, 0, 360).at + 4).join(' '));
    // and in the middle of the wander's morph, back again
    await page.eval(() => { const g = app.stage.score.gestures, G = g.find(x => x.morph && x.t1 > app.pictureT() + 2); if (G) { app.t = G.t1 - G.morph * 0.5; } window.__run(10); });
    const was = await page.eval('app.lastFrame.kind');
    await key('g');
    const b = await page.eval('window.__run(500)');
    log('g again, kind then', was, JSON.stringify(POP(b, 0, 500)), 'active', await page.eval('app.sound?.active'), 'clock', await page.eval('!!app.clock'), 'near', b.slice(Math.max(0, POP(b, 0, 500).at - 3), POP(b, 0, 500).at + 4).join(' '));
    await page.eval('app.song.pause()');
  }
  // A stop of colour's has to keep clear of the film's own. The song's tables are never to run backward, wherever colour puts its stop.
  if (stages.includes('clock')) {
    const r = await page.eval(() => {
      const T = window.trippee, sc = app.stage.score, w = sc.time?.windows ?? [];
      const walk = () => { let back = 0, worst = 0, at = null, prev = null; for (let t = 1; t < app.song.duration - 1; t += 0.1) { T.seek(t); const c = app.lastFrame.c; if (prev !== null && c < prev - 1e-3) { back++; if (prev - c > worst) { worst = prev - c; at = +t.toFixed(1); } } prev = c; } return { back, worst: +worst.toFixed(3), at }; };
      app.t = 0; app.beyond.on(); app.beyond.snap();
      const stop = app.beyond.stopAt(1), first = walk();
      app.beyond.off(); app.beyond.snap(null);
      return { windows: w.map(x => [+x.from.toFixed(1), +x.paid.toFixed(1)]), stop, first };
    });
    log('clock with colour on', JSON.stringify(r));
  }
  log('errors', JSON.stringify(page.logs.filter(l => /\[error\]|\[exception\]/.test(l)).slice(0, 4)));
};
