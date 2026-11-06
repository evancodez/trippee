// Every tool works in every mode: real input, then at one t a capture with the tool on and its edit nulled again. Pass: the tile where it was used differs.
//   node tools/lab.mjs tests/tools.mjs --out lab-out/h     ONLY=wander,held,... modes. TOOLS=ripple,zoom,... tools. COLOUR=off,on.
const CX = 760, CY = 330;           // where the tools are used, in CSS pixels at 1280x720
const NEED = 1.5;                   // mean difference in the tile, /255

export default async ({ page, log, save, sleep }) => {
  const only = process.env.ONLY?.split(',');
  const tools = (process.env.TOOLS || 'ripple,hand,twist,pinch,bulge,comb,zoom,weight,sheet,knob').split(',');
  const colours = (process.env.COLOUR || 'off,on').split(',');
  const ALT = 1, SHIFT = 8;
  const mouse = (type, x, y, o = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, button: o.button ?? 'none', buttons: o.buttons ?? 0, clickCount: o.clickCount ?? 0, modifiers: o.modifiers ?? 0, deltaX: o.deltaX ?? 0, deltaY: o.deltaY ?? 0, pointerType: 'mouse' });
  const move = (x, y, o) => mouse('mouseMoved', x, y, o);
  const down = (x, y, o = {}) => mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1, ...o });
  const up = (x, y, o = {}) => mouse('mouseReleased', x, y, { button: 'left', buttons: 0, clickCount: 1, ...o });
  const wheel = (x, y, dx, dy, o = {}) => mouse('mouseWheel', x, y, { deltaX: dx, deltaY: dy, ...o });
  const glide = async (x0, y0, x1, y1, ms, o = {}) => { const n = Math.max(2, ms / 16 | 0); for (let i = 1; i <= n; i++) { await move(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, o); await sleep(16); } };
  const key = async k => {
    const code = /^\d$/.test(k) ? 'Digit' + k : 'Key' + k.toUpperCase();
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) });
  };
  const errCount = () => page.logs.filter(l => l.startsWith('[exception]') || l.startsWith('[error]')).length;
  const held = { buttons: 1, button: 'left' };

  await page.eval(() => {
    try { document.querySelector('#hints [data-ok]').click(); } catch {}
    const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d', { willReadFrequently: true });
    const grab = () => { g.drawImage(app.canvas, 0, 0, 160, 90); return g.getImageData(0, 0, 160, 90).data; };
    // The biggest difference in any tile near (cx, cy), and over the whole frame
    window.__pair = (nullIt, cx, cy) => {
      const wasManual = app.manual;
      trippee.seek(app.t);
      const a = grab(); const undo = nullIt(app.edits, app.R) || (() => {});
      trippee.seek(app.t);
      const b = grab(); undo();
      let best = 0, all = 0;
      const W = 160, H = 90, tw = 10, th = 10, X = cx / innerWidth * W, Y = cy / innerHeight * H;
      for (let ty = 0; ty + th <= H; ty += th) for (let tx = 0; tx + tw <= W; tx += tw) {
        let s = 0;
        for (let y = ty; y < ty + th; y++) for (let x = tx; x < tx + tw; x++) { const i = (y * W + x) * 4; s += (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3; }
        s /= tw * th; all += s;
        if (Math.hypot(tx + tw / 2 - X, ty + th / 2 - Y) < 32) best = Math.max(best, s);
      }
      if (!wasManual) trippee.run();
      return { tile: +best.toFixed(2), frame: +(all / 144).toFixed(2), kind: app.lastFrame.kind, T: +(app.lastFrame.T || 0).toFixed(2), pat: app.lastFrame.G.pattern.id };
    };
    window.__nulls = {
      ripple: E => { E.ripples = null; },
      hand: E => { E.hand = null; },
      twist: E => { E.warp = null; }, pinch: E => { E.warp = null; }, bulge: E => { E.warp = null; },
      comb: (E, R) => { const e = R.brushEnergy; R.brushEnergy = 0; return () => { R.brushEnergy = e; }; },
      zoom: E => { E.journey = 0; E.jx = 0; E.jy = 0; E.spin = 0; },
      weight: E => { E.duty = 0; },
      sheet: E => { E.sheet = 0; },
      knob: E => { E.over = {}; },
    };
  });

  // Each uses the tool for real and leaves it on while the pair is captured. The returned function lets go.
  const use = {
    ripple: async () => { await key('1'); await move(CX, CY); await down(CX, CY); await up(CX, CY); await sleep(1100); return async () => { await key('1'); }; },
    hand: async () => { await key('2'); await glide(CX - 40, CY, CX, CY, 100); await down(CX, CY); await sleep(900); return async () => { await up(CX, CY); await key('2'); }; },
    twist: async () => { await key('3'); await move(CX, CY); await down(CX, CY); await glide(CX, CY, CX + 60, CY - 60, 300, held); await sleep(150); return async () => { await up(CX + 60, CY - 60); await key('3'); }; },
    pinch: async () => { await key('4'); await move(CX, CY); await down(CX, CY); await sleep(800); return async () => { await up(CX, CY); await key('4'); }; },
    bulge: async () => { await key('5'); await move(CX, CY); await down(CX, CY); await sleep(800); return async () => { await up(CX, CY); await key('5'); }; },
    comb: async () => { await key('6'); await move(CX - 60, CY); await down(CX - 60, CY); await glide(CX - 60, CY, CX + 60, CY + 30, 350, held); return async () => { await up(CX + 60, CY + 30); await key('6'); }; },
    zoom: async () => { await move(CX, CY); for (let i = 0; i < 12; i++) { await wheel(CX, CY, 0, -60); await sleep(24); } await sleep(350); return async () => {}; },
    weight: async () => { await move(CX, CY); for (let i = 0; i < 14; i++) { await wheel(CX, CY, 0, 40, { modifiers: SHIFT }); await sleep(24); } await sleep(300); return async () => {}; },
    sheet: async () => { await move(CX, CY); await down(CX, CY, { modifiers: ALT }); await sleep(750); return async () => { await up(CX, CY, { modifiers: ALT }); }; },
    knob: async () => { await page.eval(() => { const h = app.hand; h.setKnob('freq', h.natural('freq') * 1.7); }); await sleep(450); return async () => {}; },
  };
  const clearAll = async () => { await page.eval('app.hand.clear()'); await sleep(250); await page.eval(() => { app.hand.fx.warp.twist.set(0); app.hand.fx.warp.pinch.set(0); app.R.clearBrush?.(); }); };

  const rows = [];
  const trial = async (mode, again) => {
    for (const tool of tools) {
      if (again) await again();
      const e0 = errCount();
      const off = await use[tool]();
      if (process.env.SHOTS) await page.shot(`tool-${mode.replace(/\W+/g, '-')}-${tool}`);
      const r = await page.eval(`__pair(__nulls[${JSON.stringify(tool)}],${CX},${CY})`);
      await off();
      const errors = errCount() - e0;
      const ok = r.tile >= NEED && !errors;
      rows.push({ mode, tool, ok, ...r, errors });
      log(ok ? 'ok  ' : 'FAIL', mode.padEnd(24), tool.padEnd(8), 'tile', String(r.tile).padEnd(6), 'frame', String(r.frame).padEnd(6), (r.kind || '-').padEnd(6), 'T', r.T, r.pat, errors ? 'errors ' + errors : '');
      if (!ok) await page.shot(`tool-fail-${mode.replace(/\W+/g, '-')}-${tool}`);
      await clearAll();
    }
  };

  const toWander = async () => {
    await page.eval(() => { const s = app.song; if (s?.analysis) s.eject(); app.clock = null; app.paused = false; app.sound?.off?.(); if (app.hand.isStatic()) app.hand.setStatic(false); app.hand.wander(); });
    for (let i = 0; i < 60; i++) { if (await page.eval('!app.stage.handingOver(app.pictureT())&&!app.stage._wanderNext&&!app.stage.staticG')) break; await sleep(100); }
    // well away from the wander's next morph, unless a mode wants one
    await page.eval(() => { const s = app.stage, t = app.pictureT(), c = s.current(t); if (c.morph && c.t1 - c.morph < t + 60 && t <= c.t1 - c.morph) { const N = s.score.gestures[s.score.gestures.indexOf(c) + 1]; c.t1 = t + 60 + c.morph; if (N) N.t0 = c.t1; } });
  };
  const pat = id => page.eval(`app.hand.go(${JSON.stringify(id)},{dur:3})`).then(() => sleep(3400));
  const song = async () => {
    await page.eval(`app.song.load('/media/ppp.mp3',{autoplay:true})`);
    for (let i = 0; i < 900; i++) { if (await page.eval('app.song.playing')) break; await sleep(100); }
    await sleep(8000);
    await page.eval('app.song.seek(30)'); await sleep(1500);
  };
  const want = m => !only || only.includes(m);

  for (const colour of colours) {
    const on = colour === 'on';
    const tag = n => `${n}${on ? ' +colour' : ''}`;
    await toWander();
    if (on) { await key('b'); await page.eval('app.beyond.snap(0.6)'); await sleep(200); }

    if (want('wander')) { await toWander(); await trial(tag('wander')); }
    if (want('held')) { await toWander(); await pat('lines.river'); await trial(tag('held')); }
    if (want('static')) { await toWander(); await pat('checks.vega'); await page.eval('app.hand.setStatic(true)'); await sleep(800); await trial(tag('static')); await page.eval('app.hand.setStatic(false)'); await sleep(300); }
    if (want('paused')) { await toWander(); await pat('lattice.master'); await page.eval('app.paused=true'); await trial(tag('paused')); await page.eval('app.paused=false'); }
    if (want('music')) { await toWander(); await key('g'); await sleep(1000); await trial(tag('make music')); await page.eval('app.sound?.off?.()'); await sleep(300); }
    if (want('flight')) {
      // A long dive on the wander's own clock, with the tools used in the middle of it
      await toWander();
      const kind = await page.eval(() => { const s = app.stage, t = app.pictureT(); app.hand.clear(); s.score.handover = null; const A = app.byId['checks.vega'], B = app.byId['void.diamond'] ?? app.byId['rooms.hall']; s.score.gestures = [{ t0: t - 5, t1: t + 200, arcEnd: t + 200, pattern: A, morph: 210, rise: false }, { t0: t + 200, t1: t + 3600, arcEnd: t + 226, pattern: B }]; s.hold = true; return 'set'; });
      await page.eval(`app.t+=0`);
      await sleep(800);
      await page.eval(() => { const s = app.stage, t = app.pictureT(), G = s.current(t); const stop = t + 210; G.t1 = t + 200 * 0.6; G.morph = 200; s.score.gestures[1].t0 = G.t1; delete G.plan; });
      await sleep(400);
      await trial(tag('mid-flight'));
      await page.eval(() => { const s = app.stage, t = app.pictureT(), g = s.score.gestures; g.length = 0; s.hold = false; s._extend(t); s.score.gestures[0].t0 = t - 1; });
      // A long handover, by hand
      await toWander();
      await page.eval(`app.hand.go('checks.vega',{dur:3})`); await sleep(3300);
      await page.eval(`app.hand.go('rooms.hall',{dur:200})`);
      for (let i = 0; i < 40; i++) { if (await page.eval(`app.lastFrame.G.pattern.id==='rooms.hall'&&app.stage.handingOver(app.pictureT())`)) break; await sleep(100); }
      await page.eval(() => { app.stage.score.handover.e = 70; });
      await sleep(300);
      await trial(tag('mid-handover'));
      await page.eval(() => { app.stage.score.handover = null; });
    }
    if (want('stop') && on) {
      await toWander();
      await page.eval(() => { app.t = 100; app.beyond.off(); app.beyond.on(); app.beyond.snap(0.6); app.t = 151; });
      await trial(tag('in a colour stop'), () => page.eval('app.t=151'));
      await page.eval('app.t=30');
    }
    if (want('rest')) {
      await toWander();
      await page.eval(() => { const t0 = app.t; app.stage.score.time = t => (t < t0 + 1 ? t : t0 + 1); });
      await sleep(1200);
      await trial(tag('in a rest'));
      await page.eval('delete app.stage.score.time');
    }
    if (want('film')) {
      await toWander(); await song();
      await trial(tag('film playing'));
      await page.eval('app.song.pause()'); await sleep(200);
      await trial(tag('film paused'));
      await page.eval('app.song.play()'); await sleep(300);
      await page.eval('app.hand.setStatic(true)'); await sleep(4500);
      await trial(tag('film+static'));
      await page.eval('app.hand.setStatic(false)'); await sleep(6500);
      await key('g'); await sleep(4000);
      await trial(tag('music, song waiting'));
      await key('g'); await sleep(7000);
      const d = await page.eval('app.song.duration');
      await page.eval(`app.song.seek(${d - 1.5})`);
      for (let i = 0; i < 80; i++) { if (await page.eval('app.song.resting')) break; await sleep(200); }
      await sleep(3500);
      await trial(tag('film ended'));
    }
    if (on) { await key('b'); await page.eval('app.beyond.snap()'); await sleep(200); }
  }

  // In a flight, the pattern being flown through holds still whatever the hand does, and the free one takes it.
  if (want('hold')) {
    await toWander();
    const r = await page.eval(async () => {
      const T = trippee, E = app.edits, O = app.hand.offsets, A = app.R.slotA, B = app.R.slotB;
      T.morph('checks.vega', 'rooms.hall', 10, 1);
      const was = app.onFrame.splice(0);    // the hand's own tick would write over these
      const out = {};
      T.seek(5); out.kind = app.lastFrame.kind;
      const a0 = [A[O.theta], A[O.scale], A[O['f0.ph']], A[O.freq]], b0 = [B[O.theta], B[O.freq]];
      E.duty = 0.3; E.over = { freq: A[O.freq] * 1.5 }; E.journey = 0.8; E.jx = 0.1; E.spin = 0.3; T.seek(5);
      const a1 = [A[O.theta], A[O.scale], A[O['f0.ph']], A[O.freq]], b1 = [B[O.theta], B[O.freq]];
      out.aHeld = a0.every((v, i) => Math.abs(v - a1[i]) < 1e-5);
      out.bMoved = b0.some((v, i) => Math.abs(v - b1[i]) > 1e-3);
      E.duty = 0; E.over = {}; E.spin = 0; E.jx = 0; E.jy = 0; E.journey = 0;
      app.onFrame.push(...was);
      T.run();
      return out;
    });
    const ok = r.aHeld && r.bMoved && r.kind === 'dive';
    rows.push({ mode: 'flight holds', tool: 'all', ok, ...r });
    log(ok ? 'ok  ' : 'FAIL', 'flight holds still'.padEnd(24), JSON.stringify(r));
    // The landing is clean with the hand zoomed, in or right out, with real scrolling before and during the flight.
    await page.eval(() => {
      const c = document.createElement('canvas'); c.width = 96; c.height = 54; const g = c.getContext('2d', { willReadFrequently: true });
      let prev = null; window.__tr = null;
      window.__step = () => { if (!__tr) { prev = null; return; } g.drawImage(app.canvas, 0, 0, 96, 54); const px = g.getImageData(0, 0, 96, 54).data; let d = 0; if (prev) for (let i = 0; i < px.length; i += 4) d += Math.abs(px[i] - prev[i]); prev = px; __tr.push([+(d / (96 * 54)).toFixed(2), app.lastFrame.kind || '', +(app.lastFrame.T || 0).toFixed(3), +(app.edits.journey || 0).toFixed(3), +(app.edits.jx || 0).toFixed(4), +(app.edits.jy || 0).toFixed(4), app.R.drawScale, app.R.variant]); };
      app.onFrame.push(__step);
    });
    for (const [name, dy] of [['zoomed in', -30], ['zoomed right out', 70]]) {
      await toWander();
      await page.eval(`app.hand.go('checks.vega',{dur:2.5})`); await sleep(5400);
      await move(CX, CY);
      for (let i = 0; i < 30; i++) { await wheel(CX, CY, 0, dy); await sleep(16); }
      await sleep(500);
      await page.eval(() => { const s = app.stage, t = app.pictureT(), c = s.current(t), g = s.score.gestures; s.hold = false; c.t1 = t + 10; c.morph = 7; c.rise = false; delete c.plan; g.length = g.indexOf(c) + 1; g.push({ t0: c.t1, t1: c.t1 + 600, arcEnd: c.t1 + 40, period: 44, pattern: app.byId['rooms.hall'] }); s.hold = true; window.__tr = []; });
      await sleep(5000);
      for (let i = 0; i < 20; i++) { await wheel(CX, CY, 0, dy); await sleep(16); }     // and again in the middle of it
      await sleep(5800);
      const tr = await page.eval('(()=>{const t=__tr;__tr=null;return t})()');
      let i = tr.length - 1; while (i > 0 && !tr[i][1]) i--;
      const near = tr.slice(i - 8, i + 8).map(x => x[0]), before = near.slice(0, 8).sort((a, b) => a - b)[4], worst = Math.max(...tr.slice(i - 1, i + 3).map(x => x[0]));
      const ok2 = worst <= Math.max(3 * before, 8);
      rows.push({ mode: 'flight lands', tool: name, ok: ok2, worst, before, J: tr[i][3] });
      log(ok2 ? 'ok  ' : 'FAIL', 'flight lands'.padEnd(24), name.padEnd(18), 'J', tr[i][3], 'worst', worst, 'steady', before, near.join(' '), ok2 ? '' : JSON.stringify(tr.slice(i - 2, i + 4)));
      await page.eval(`app.hand.clear()`); await sleep(500);
    }
    await page.eval(`app.onFrame.splice(app.onFrame.indexOf(__step),1)`);
  }

  const fails = rows.filter(r => !r.ok);
  log(`${rows.length - fails.length}/${rows.length} passed`);
  for (const f of fails) log('  failed', f.mode, f.tool, JSON.stringify(f));
  save('tools.json', JSON.stringify(rows, null, 1));
};
