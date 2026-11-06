// A click always moves there: a real click on a real tile, in every mode, with and without colour.  node tools/lab.mjs tests/pick.mjs --out lab-out/h
// Pass: within 11 s lastFrame.G.pattern is the one clicked and nothing is morphing, no pop at either end of the handover, no errors.
// ONLY=wander,held,...  picks modes. COLOUR=off,on picks colour. Writes pick.json, and a frame from any failure.
const POP_ABS = 16, POP_REL = 7;      // a step over this many /255, and over this many times what was going on around it, is a pop

export default async ({ page, log, save, sleep }) => {
  const only = process.env.ONLY?.split(',');
  const colours = (process.env.COLOUR || 'off,on').split(',');
  const mouse = (type, x, y, o = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, button: o.button ?? 'none', buttons: o.buttons ?? 0, clickCount: o.clickCount ?? 0, modifiers: o.modifiers ?? 0, deltaX: o.deltaX ?? 0, deltaY: o.deltaY ?? 0, pointerType: 'mouse' });
  const click = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1 }); await mouse('mouseReleased', x, y, { button: 'left', clickCount: 1 }); };
  const key = async k => {
    const code = /^\d$/.test(k) ? 'Digit' + k : 'Key' + k.toUpperCase();
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) });
  };
  const errCount = () => page.logs.filter(l => l.startsWith('[exception]') || l.startsWith('[error]')).length;

  if (process.env.GPU === '0') await page.eval(`app.R.onCost = null; app.governor.timed = false; app.R.drawScale = 1; for (const s of app.governor.states.values()) s.tier = 0;`);     // the governor going by the frame rate alone, for A/B
  await page.eval(() => {
    try { document.querySelector('#hints [data-ok]').click(); } catch {}
    app.ui.library.show(true);
    // Every frame, right after it's drawn: how far the picture moved from the last one, and what the stage is doing.
    const c = document.createElement('canvas'); c.width = 96; c.height = 54; const g = c.getContext('2d', { willReadFrequently: true });
    let prev = null;
    window.__trace = null;
    app.onFrame.push(() => {
      if (!window.__trace) { prev = null; return; }
      g.drawImage(app.canvas, 0, 0, 96, 54);
      const px = g.getImageData(0, 0, 96, 54).data;
      let d = 0;
      if (prev) for (let i = 0; i < px.length; i += 4) d += Math.abs(px[i] - prev[i]) + Math.abs(px[i + 1] - prev[i + 1]) + Math.abs(px[i + 2] - prev[i + 2]);
      prev = px;
      const f = app.lastFrame;
      window.__trace.push([+(performance.now() / 1000).toFixed(3), +(d / (96 * 54 * 3)).toFixed(2), f.G.pattern.id, f.N ? f.N.pattern.id : '', f.kind || '', +(f.T || 0).toFixed(3), app.R.drawScale]);
    });
    // a tile on screen, for a real click
    window.__tile = id => { const t = app.ui.library.tiles.get(id); t.b.scrollIntoView({ block: 'center' }); const r = t.b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2 - 8]; };
    window.__state = () => ({ t: +app.t.toFixed(2), pt: +app.pictureT().toFixed(2), pat: app.lastFrame.G.pattern.id, N: app.lastFrame.N?.pattern.id ?? null, kind: app.lastFrame.kind, T: +(app.lastFrame.T || 0).toFixed(3), morphing: app.stage.morphing(app.pictureT()), held: app.stage.hold, staticG: !!app.stage.staticG, want: app.stage.want?.pat.id ?? null, song: !!app.stage.score.song, here: [...app.ui.library.tiles.values()].filter(x => x.b.classList.contains('here')).map(x => x.p.id) });
  });
  const ids = await page.eval(() => app.patterns.filter(p => p.pool !== false).map(p => p.id));
  let seedN = 5;
  const nextTarget = async () => {
    const cur = await page.eval(() => app.lastFrame.G.pattern.id);
    for (;;) { seedN = (seedN * 73 + 41) % ids.length; if (ids[seedN] !== cur) return ids[seedN]; }
  };

  // One trial: a real click, then watch for up to 11 s (plus whatever the first click costs).
  const trial = async (name, { before, clicks = 1, gap = 700, limit = 11 } = {}) => {
    if (before) await before();
    const e0 = errCount();
    const fromWas = await page.eval('app.lastFrame.G.pattern.id');
    await page.eval('window.__trace=[]');
    await sleep(350);
    let target, clickAt, hereAtOnce;
    for (let i = 0; i < clicks; i++) {
      target = await nextTarget();
      const [x, y] = await page.eval(`__tile(${JSON.stringify(target)})`);
      await sleep(30);
      clickAt = await page.eval('performance.now()/1000');
      await click(x, y);
      if (i === clicks - 1) { await sleep(60); hereAtOnce = (await page.eval('__state()')).here.join(); }
      if (i < clicks - 1) await sleep(gap);
    }
    let st, landed = null;
    for (let w = 0; w < limit * 10 + 5; w++) {
      await sleep(100);
      st = await page.eval('__state()');
      if (st.pat === target && !st.morphing) { landed = await page.eval(`performance.now()/1000-${clickAt}`); break; }
    }
    await sleep(500);
    const tr = await page.eval('(()=>{const t=window.__trace;window.__trace=null;return t})()');
    // Pops: a one-frame step well out of line with the frames round it, anywhere; and the first and last steps of the handover, against the frames just before them.
    let pop = null, worst = 0;
    const steps = tr.map(r => r[1]);
    const seam = i => { if (i < 2) return null; const w = steps.slice(Math.max(1, i - 9), i).sort((a, b) => a - b), steady = w[w.length >> 1] ?? 0; return { step: steps[i], steady, at: +(tr[i][0] - clickAt).toFixed(2), kind: tr[i][4] || tr[i - 1][4], T: tr[i][5], pat: tr[i][2], N: tr[i][3], seam: true, ms: Math.round((tr[i][0] - tr[i - 1][0]) * 1000), near: steps.slice(Math.max(0, i - 4), i + 5).join(' ') }; };
    const clickI = tr.findIndex(r => r[0] >= clickAt);
    let lastI = -1; for (let i = tr.length - 1; i > clickI; i--) if (tr[i][3]) { lastI = i + 1; break; }
    for (let i = clickI; i >= 0 && i < clickI + 40 && i < tr.length; i++) { const s = seam(i); if (s && s.step > Math.max(3 * s.steady, 8) && (tr[i][5] < 0.02) && (!pop || s.step > pop.step)) pop = s; }
    if (lastI > 0 && lastI < tr.length) for (const i of [lastI - 1, lastI]) { const s = seam(i); if (s && s.step > Math.max(3 * s.steady, 8) && (!pop || s.step > pop.step)) pop = s; }
    for (let i = 1; i < steps.length; i++) {
      const around = steps.slice(Math.max(1, i - 12), i + 13).filter((_, k, a) => a.length).sort((a, b) => a - b), med = around[around.length >> 1];
      const bad = steps[i] > POP_ABS && steps[i] > POP_REL * Math.max(med, 0.5);
      if (steps[i] > worst) worst = steps[i];
      if (bad && (!pop || steps[i] > pop.step)) pop = { step: steps[i], med, at: +(tr[i][0] - clickAt).toFixed(2), kind: tr[i][4], T: tr[i][5], pat: tr[i][2], N: tr[i][3] };
    }
    const frames = tr.length, secs = tr.length > 1 ? tr[tr.length - 1][0] - tr[0][0] : 1;
    const kinds = [...new Set(tr.map(r => r[4]).filter(Boolean))];
    const errors = errCount() - e0;
    const ok = landed !== null && landed <= limit && !pop && !errors && hereAtOnce === target;
    const tiers = [...new Set(tr.map(r => r[6]))];
    const wi = steps.indexOf(worst), worstAt = wi >= 0 ? { at: +(tr[wi][0] - clickAt).toFixed(2), kind: tr[wi][4], T: tr[wi][5], pat: tr[wi][2], N: tr[wi][3], near: steps.slice(Math.max(1, wi - 4), wi + 5).join(' ') } : null;
    const row = { name, ok, tiers, from: fromWas, target, landed: landed && +landed.toFixed(2), pop, worstStep: worst, worstAt, kinds, fps: +(frames / secs).toFixed(0), errors, here: hereAtOnce === target ? 'at once' : hereAtOnce, end: st };
    log(ok ? 'ok  ' : 'FAIL', name.padEnd(30), (fromWas + '>' + target).padEnd(36), 'landed', String(row.landed).padEnd(6), kinds.join('+').padEnd(14), 'worst', String(worst).padEnd(6), 'fps', row.fps, tiers.length > 1 ? 'tiers ' + tiers.join() : '', pop ? 'POP ' + JSON.stringify(pop) : '', errors ? 'errors ' + errors : '', hereAtOnce !== target ? 'tile ' + hereAtOnce : '', landed === null ? JSON.stringify(st) : '');
    if (!ok) await page.shot(`pick-fail-${name.replace(/\W+/g, '-')}`);
    return row;
  };

  const rows = [];
  const run = async (name, o) => { rows.push(await trial(name, o)); };
  const want = m => !only || only.includes(m);

  // ---- modes. Each leaves things for the next to set up from.
  // Wandering, and well away from the wander's next morph, unless a trial wants otherwise
  const toWander = async () => {
    await page.eval(() => { const s = app.song; if (s?.analysis) s.eject(); app.clock = null; app.paused = false; app.sound?.off?.(); if (app.hand.isStatic()) app.hand.setStatic(false); app.hand.wander(); });
    for (let i = 0; i < 60; i++) { if (await page.eval('!app.stage.handingOver(app.pictureT())&&!app.stage._wanderNext&&!app.stage.staticG')) break; await sleep(100); }
    await page.eval(() => { const s = app.stage, t = app.pictureT(), c = s.current(t); if (c.t1 - c.morph < t + 13 && !c.rush) { const N = s.score.gestures[s.score.gestures.indexOf(c) + 1]; const x = t - (c.t1 - c.morph); if (x <= 0) { c.t1 = t + 13 + c.morph; if (N) N.t0 = c.t1; } } });
    await sleep(400);
  };
  let songIn = false;
  const song = async () => {
    await page.eval(`app.song.load('/media/ppp.mp3',{autoplay:true})`);
    for (let i = 0; i < 900; i++) { if (await page.eval('app.song.playing')) break; await sleep(100); }
    songIn = true;
    await sleep(8000);   // past the film's way in
  };
  const seekFilm = t => page.eval(`app.song.seek(${t})`);

  for (const colour of colours) {
    const on = colour === 'on';
    const tag = n => `${n}${on ? ' +colour' : ''}`;
    await toWander();
    if (on) { await key('b'); await page.eval('app.beyond.snap()'); await sleep(200); }

    if (want('wander')) await run(tag('wander'), { before: toWander });
    if (want('held')) await run(tag('held'), {
      before: async () => { await toWander(); await page.eval(`app.hand.go('lines.river',{dur:3})`); await sleep(3500); } });
    if (want('static')) {
      await run(tag('static'), { before: async () => { await toWander(); await sleep(3000); await page.eval('app.hand.setStatic(true)'); await sleep(5000); } });
      await page.eval('app.hand.setStatic(false)'); await sleep(300);
    }
    if (want('paused')) {
      await run(tag('wander paused'), { before: async () => { await toWander(); await page.eval('app.paused=true'); } });
      await page.eval('app.paused=false');
    }
    if (want('music')) {
      await run(tag('make music'), { before: async () => { await toWander(); await key('g'); await sleep(1500); } });
      await page.eval('app.sound?.off?.()'); await sleep(300);
    }
    if (want('film')) {
      await run(tag('film playing'), { before: async () => { await toWander(); await song(); await seekFilm(30); await sleep(1500); } });
      await run(tag('film paused'), { before: async () => { await page.eval('app.song.pause()'); await sleep(300); } });
      await page.eval('app.song.play()'); await sleep(500);
      await run(tag('film+static'), { before: async () => { await page.eval('app.hand.setStatic(true)'); await sleep(5000); } });
      await page.eval('app.hand.setStatic(false)'); await sleep(7000);
      await run(tag('music, song waiting'), { before: async () => { await key('g'); await sleep(4000); } });
      await key('g'); await sleep(7000);
      await run(tag('film ended'), { before: async () => { const d = await page.eval('app.song.duration'); await seekFilm(d - 1.5); for (let i = 0; i < 80; i++) { if (await page.eval('app.song.resting')) break; await sleep(200); } await sleep(4000); } });
    }
    if (want('flight')) {
      // the middle of a flight on the wander's own clock: a dive already running when the click comes
      await run(tag('mid-flight'), { before: async () => {
        await toWander();
        await page.eval(() => { const s = app.stage, t = app.pictureT(), g = s.score.gestures, c = s.current(t); c.t1 = t + 8; c.morph = 10; delete c.plan; g.length = g.indexOf(c) + 1; c.xform = null; s.hold = false; s._extend(t); g[g.indexOf(c) + 1].pattern = app.byId[app.lastFrame.G.pattern.family === 'checks' ? 'rooms.hall' : 'checks.vega']; });
        await sleep(3000);
      } });
      await run(tag('mid-handover'), { before: async () => { await toWander(); await page.eval(`app.hand.go('rooms.hall',{dur:8})`); await sleep(3000); } });
      await run(tag('tool selected'), { before: async () => { await toWander(); await key('3'); await sleep(200); } });
      await key('3');
      await run(tag('two quick clicks'), { before: toWander, clicks: 2, gap: 900 });
      await run(tag('three quick clicks'), { before: toWander, clicks: 3, gap: 500 });
    }
    if (want('stop') && on) {
      // Inside colour's own stop: its rest has the picture's clock standing still.
      await run(tag('in a colour stop'), { before: async () => {
        await toWander();
        await page.eval(() => { const a = app.beyond.stopAt(150) ?? 150; app.t = Math.max(app.t, 100); app.beyond.off(); app.beyond.on(); app.t = 149; });
        await sleep(2500);
        log('  stop', JSON.stringify(await page.eval('({t:app.t,pt:app.pictureT()})')));
      } });
      await page.eval('app.t=0');
    }
    if (want('rest')) {
      // Inside a rest in the song: score.time holding the picture's clock, with a stand-in for the Stop's clock if it hasn't been built.
      await run(tag('in a rest'), { before: async () => {
        await toWander();
        await page.eval(() => { const t0 = app.t; app.stage.score.time = t => (t < t0 + 1 ? t : t0 + 1); });
        await sleep(1500);
      } });
      await page.eval('delete app.stage.score.time');
    }
    if (on) { await key('b'); await page.eval('app.beyond.snap()'); await sleep(200); }
  }

  const fails = rows.filter(r => !r.ok);
  log(`${rows.length - fails.length}/${rows.length} passed`);
  for (const f of fails) log('  failed', f.name, JSON.stringify({ landed: f.landed, pop: f.pop, errors: f.errors, here: f.here, end: f.end }));
  save('pick.json', JSON.stringify(rows, null, 1));
};
