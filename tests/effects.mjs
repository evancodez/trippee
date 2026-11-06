// The effects bar, static and the hand, with real mouse and keys through CDP.  node tools/lab.mjs tests/effects.mjs --out lab-out/fx
// STAGE picks a part: bar, ripple, hand, warp, comb, static, song, fps (default: all)
const sleep = ms => new Promise(r => setTimeout(r, ms));

export default async ({ page, log }) => {
  const stage = process.env.STAGE || 'all';
  const want = s => stage === 'all' || stage.split(',').includes(s);
  const mouse = (type, x, y, o = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, button: o.button ?? 'none', buttons: o.buttons ?? 0, clickCount: o.clickCount ?? 0, modifiers: o.modifiers ?? 0, deltaX: o.deltaX ?? 0, deltaY: o.deltaY ?? 0, pointerType: 'mouse' });
  const move = (x, y, o) => mouse('mouseMoved', x, y, o);
  const down = (x, y) => mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1 });
  const up = (x, y) => mouse('mouseReleased', x, y, { button: 'left', buttons: 0, clickCount: 1 });
  const glide = async (x0, y0, x1, y1, ms, o = {}) => {
    const n = Math.max(2, ms / 16 | 0);
    for (let i = 1; i <= n; i++) { await move(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, o); await sleep(16); }
  };
  const key = async k => {
    const code = /^\d$/.test(k) ? 'Digit' + k : 'Key' + k.toUpperCase();
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) });
  };
  await page.eval(`app.byId['test.plain']={id:'test.plain',name:'Plain',family:'lines',g:{fams:[{x:9}]},flow:{}}`);
  await page.eval(() => { try { document.querySelector('#hints [data-ok]').click(); } catch {} });
  const hold = async id => { await page.eval(`trippee.load(${JSON.stringify(id)},{arcs:true});app.t=13;app.hand.clear()`); await sleep(300); };
  const fxState = () => page.eval(() => ({ fx: app.hand.effect(), hand: app.edits.hand && { on: +app.edits.hand.on.toFixed(3), curl: +app.edits.hand.curl.toFixed(2), x: +app.edits.hand.x.toFixed(2), y: +app.edits.hand.y.toFixed(2) }, rings: app.edits.ripples?.length || 0, warp: app.edits.warp && { t: +app.edits.warp.twist.toFixed(2), p: +app.edits.warp.pinch.toFixed(2) } }));

  if (want('bar')) {
    await move(640, 300); await sleep(300);
    await page.shot('bar-1-awake');
    log('bar opacity moving', await page.eval(`getComputedStyle(document.getElementById('fx')).opacity`));
    await sleep(3400);
    log('bar opacity still', await page.eval(`getComputedStyle(document.getElementById('fx')).opacity`));
    await move(640, 660); await sleep(300);
    await page.shot('bar-2-near-bottom');
    // Every button is clicked for real: read where it is, click it
    for (const id of ['ripple', 'hand', 'twist', 'pinch', 'bulge', 'comb']) {
      await move(640, 300); await sleep(60);
      const r = await page.eval(`(()=>{const r=document.querySelector('[data-fx=${id}]').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
      await move(r[0], r[1]); await down(r[0], r[1]); await up(r[0], r[1]); await sleep(120);
      const on = await page.eval(`[app.hand.effect(),document.querySelector('[data-fx=${id}]').classList.contains('now')]`);
      if (on[0] !== id || !on[1]) log('FAIL click', id, on);
      await down(r[0], r[1]); await up(r[0], r[1]); await sleep(60);
      if (await page.eval('app.hand.effect()') !== null) log('FAIL click again should go back', id);
    }
    log('bar clicks done');
    for (const [k, id] of [['1', 'ripple'], ['2', 'hand'], ['3', 'twist'], ['4', 'pinch'], ['5', 'bulge'], ['6', 'comb']]) {
      await key(k); await sleep(30);
      if (await page.eval('app.hand.effect()') !== id) log('FAIL key', k);
      if (k === '4') { await page.shot('bar-3-chosen'); }
      await key(k); await sleep(30);
      if (await page.eval('app.hand.effect()') !== null) log('FAIL key again', k);
    }
    log('bar keys done');
  }

  if (want('ripple')) {
    for (const id of ['test.plain', 'checks.vega']) {
      await hold(id);
      await key('1');
      await move(500, 300); await sleep(100);
      await down(500, 300); await up(500, 300);
      for (const ms of [500, 1500, 3000, 5500]) { await sleep(ms === 500 ? 500 : ms === 1500 ? 1000 : ms === 3000 ? 1500 : 2500); await page.shot(`ripple-${id}-${ms}`); log(ms, await fxState()); }
      await key('1');
    }
    await hold('test.plain');
    await key('1');
    await move(200, 200); await down(200, 200);
    await glide(200, 200, 1000, 500, 1600, { buttons: 1, button: 'left' });
    await up(1000, 500);
    log('rain', await fxState());
    await page.shot('ripple-rain');
    await sleep(14000);
    log('rain over', await fxState());
    await key('1');
  }

  if (want('hand')) {
    await hold('test.plain');
    await key('2');
    await move(640, 560); await sleep(16);
    for (const ms of [300, 900, 1800, 3000]) { await sleep(ms === 300 ? 300 : ms === 900 ? 600 : ms === 1800 ? 900 : 1200); await page.shot(`hand-rise-${ms}`); log('rise', ms, await fxState()); }
    await glide(640, 560, 760, 500, 400);
    await sleep(300);
    const open = await fxState();
    await down(760, 500); await sleep(800);
    await page.shot('hand-fist');
    const shut = await fxState();
    log('click keeps the wrist', open.hand, shut.hand);
    await up(760, 500); await sleep(900);
    await page.shot('hand-open-again');
    await key('2');
    for (const ms of [500, 1500, 4000, 8000]) { await sleep(ms === 500 ? 500 : ms === 1500 ? 1000 : ms === 4000 ? 2500 : 4000); await page.shot(`hand-sink-${ms}`); log('sink', ms, await fxState()); }
    // A morph with the hand up
    await key('2');
    await page.eval(`trippee.morph('lines.bowtie','checks.vega',8,0.5);app.manual=false;trippee.run()`);
    await move(640, 560); await sleep(3000);
    await page.shot('hand-morph-mid');
    log('morphing', await page.eval('[app.lastFrame.T,app.lastFrame.N?.pattern?.id]'));
    await key('2');
    await sleep(4000);
  }

  if (want('warp')) {
    await hold('test.plain');
    await key('3');
    await move(640, 360); await down(640, 360);
    await glide(640, 360, 900, 300, 900, { buttons: 1, button: 'left' });
    await sleep(600);
    await page.shot('twist-held'); log('twist', await fxState());
    await up(900, 300); await sleep(1500);
    await page.shot('twist-relax'); log('twist +1.5', await fxState());
    await sleep(9000);
    log('twist +10', await fxState());
    await key('3');
    await hold('checks.vega');
    await key('4');
    await move(640, 360); await down(640, 360); await sleep(1800);
    await page.shot('pinch-held'); log('pinch', await fxState());
    await up(640, 360); await sleep(1500);
    await page.shot('pinch-relax');
    await key('4'); await sleep(8000);
    log('pinch gone', await fxState());
    await hold('test.plain');
    await key('5');
    await move(640, 360); await down(640, 360); await sleep(1800);
    await page.shot('bulge-held'); log('bulge', await fxState());
    await up(640, 360);
    await key('5');
  }

  if (want('comb')) {
    await hold('test.plain');
    await key('6');
    await move(300, 200); await sleep(100); await down(300, 200);
    await glide(300, 200, 980, 500, 900, { buttons: 1, button: 'left' });
    await up(980, 500);
    log('comb', await page.eval('({e:app.R.brushEnergy,on:app.R.pushOn,press:app.edits.press})'));
    await page.shot('comb');
    await key('6'); await key('z'); await sleep(2000);
  }

  if (want('static')) {
    await page.eval(() => {
      const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d', { willReadFrequently: true });
      window.__grab = () => { trippee.step(0); g.drawImage(app.canvas, 0, 0, 160, 90); return Array.from(g.getImageData(0, 0, 160, 90).data.filter((_, i) => i % 4 === 0)); };
      window.__jump = (fn) => { const a = __grab(); fn(); const b = __grab(); let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return +(s / a.length / 255).toFixed(4); };
      window.__st = () => ({ t: +app.t.toFixed(1), on: app.stage.staticOn, held: !!app.stage.staticG, pat: app.lastFrame.G.pattern.id, u: app.stage.staticG?.freezeU, two: !!app.lastFrame.N, T: +app.lastFrame.T.toFixed(2) });
    });
    // On, from a wander. Wandering is what's running on a fresh page, so bring it back
    await page.eval(`app.hand.clear()`);
    await page.eval(() => { const s = app.stage; s.hold = false; s.score.gestures = []; s._extend(app.t); });
    await sleep(2000);
    await key('l');
    // asked for in the middle of a morph, it arrives first
    for (let i = 0; i < 60; i++) { await sleep(100); if (await page.eval('__st().held')) break; }
    log('static on', await page.eval('__st()'), 'button', await page.eval(`document.querySelector('[data-fx=static]').className+' '+document.querySelector('[data-fx=static] span').textContent`));
    await move(640, 300); await sleep(100); await page.shot('static-on');
    const pat = await page.eval('app.lastFrame.G.pattern.id');
    // Far past where the wander would have changed, and it's still there and still flowing
    const phi0 = await page.eval('app.lastFrame.phi');
    for (let i = 0; i < 6; i++) { await page.eval('app.t+=40'); await sleep(120); const s = await page.eval('__st()'); if (s.pat !== pat || s.two) log('FAIL static moved on', s); }
    log('240 s on: same pattern', await page.eval('__st()'), 'flow moved', await page.eval('app.lastFrame.phi') - phi0);
    const A0 = await page.eval('app.R.slotA.slice(0,200).join()');
    // Knobs, zoom, effects while static
    await move(640, 360);
    for (let i = 0; i < 8; i++) { await mouse('mouseWheel', 640, 360, { deltaY: -60 }); await sleep(20); }
    await sleep(600);
    log('zoom while static', await page.eval('app.edits.journey'));
    await page.eval(() => { const ax = app.lastFrame.G.pattern.axes?.[0]; if (ax) app.hand.setKnob(ax.path, (ax.min + ax.max) / 2); return ax?.path; });
    await sleep(500);
    log('knob while static', await page.eval('app.hand.state().knobs'));
    await key('1'); await move(500, 300); await down(500, 300); await up(500, 300); await sleep(1200);
    log('ripple while static', await fxState());
    await key('1'); await key('2'); await move(640, 500); await sleep(1800); log('hand while static', await fxState());
    await page.shot('static-with-hand'); await key('2'); await key('z'); await sleep(1500);
    // Off: no jump in the picture, and the wander's back
    let j = await page.eval(() => { app.manual = true; const still = __jump(() => {}); return [still, __jump(() => app.hand.setStatic(false))]; });
    log('picture change at turning off [nothing done, turned off]', j, await page.eval('__st()'));
    await page.eval('trippee.run()');
    await sleep(800);
    await page.eval('app.t+=45'); await sleep(200);
    log('wandering again', await page.eval('__st()'));
    // On, then pick a pattern from the library for real
    j = await page.eval(() => { app.manual = true; const still = __jump(() => {}); return [still, __jump(() => app.hand.setStatic(true))]; });
    log('picture change at turning on [nothing done, turned on]', j, await page.eval('__st()'));
    await page.eval('trippee.run()');
    await sleep(300);
    await key('p'); await sleep(500);
    const r = await page.eval(`(()=>{const t=[...document.querySelectorAll('#library .tile')].find(t=>t.querySelector('span').textContent.toLowerCase().includes('vega'))||document.querySelectorAll('#library .tile')[3];t.scrollIntoView({block:'center'});const r=t.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2,t.textContent]})()`);
    await move(r[0], r[1]); await down(r[0], r[1]); await up(r[0], r[1]);
    await sleep(500);
    log('picked', r[2], await page.eval('__st()'));
    await page.shot('static-pick-morphing');
    await sleep(9000);
    log('arrived', await page.eval('__st()'));
    await page.shot('static-pick-arrived');
    await key('p');
    const at = await page.eval('__st()');
    await page.eval('app.t+=200'); await sleep(200);
    const after = await page.eval('__st()');
    log('still static after 200 s', after, after.pat === at.pat && after.on ? 'ok' : 'FAIL');
    // Two picks in a row
    await page.eval(`app.hand.go('lattice.master')`); await sleep(1000);
    await page.eval(`app.hand.go('lines.river')`); await sleep(500);
    log('second pick waits', await page.eval('__st()'));
    await sleep(8500); log('then goes', await page.eval('__st()'));
    await sleep(8500); log('and stays', await page.eval('__st()'));
    await key('l'); await sleep(200);
    log('off', await page.eval('__st()'));
  }

  if (want('song')) {
    await page.eval(`app.song.load('/media/ppp.mp3',{autoplay:true})`);
    for (let i = 0; i < 400; i++) { if (await page.eval('app.song.playing')) break; await sleep(100); }
    await sleep(3000);
    const st = () => page.eval(() => ({ heard: +app.song.time().toFixed(1), on: app.stage.staticOn, held: !!app.stage.staticG, pat: app.lastFrame.G.pattern.id, two: !!app.lastFrame.N, T: +app.lastFrame.T.toFixed(2) }));
    log('song playing', await st());
    await move(640, 300); await key('l'); await sleep(4600);
    log('static in a song', await st());
    await page.shot('song-static');
    const pat = await page.eval('app.lastFrame.G.pattern.id');
    await page.eval('app.song.seek(app.song.time()+60)'); await sleep(1500);
    let s = await st(); log('60 s later in the song', s, s.pat === pat ? 'ok' : 'FAIL');
    await page.eval(`app.hand.go('checks.vega')`); await sleep(9000);
    s = await st(); log('picked in a song, static', s);
    await key('2'); await move(640, 500); await sleep(2500); await page.shot('song-static-hand'); log('hand in a song', await fxState()); await key('2');
    await key('l'); await sleep(500);
    log('off in a song', await st());
    await sleep(7000);
    log('film again', await st());
    await page.eval('app.song.pause()');
  }

  if (want('fps')) {
    // Governor off, so what's measured is the full-size picture
    await page.eval('app.governor.enabled=false;app.R.drawScale=1');
    await page.eval(() => { window.__lat = []; let last = performance.now(); app.onFrame.push(() => { const n = performance.now(); __lat.push(n - last); last = n; }); window.__hitch = () => { const a = [...__lat].sort((x, y) => x - y); const r = { n: a.length, med: +a[a.length >> 1].toFixed(1), p95: +a[a.length * .95 | 0].toFixed(1), p99: +a[a.length * .99 | 0].toFixed(1), max: +a[a.length - 1].toFixed(1), scale: app.R.drawScale, w: app.canvas.width, h: app.canvas.height }; __lat.length = 0; return r; }; });
    for (const id of ['test.plain', 'checks.vega', 'lattice.master']) {
      await hold(id);
      await page.eval('__hitch()'); await sleep(2500);
      log(id, 'no hand', await page.eval('__hitch()'));
      await key('2'); await move(640, 560); await sleep(2500); await page.eval('__hitch()');
      await glide(640, 560, 760, 520, 1000); await glide(760, 520, 500, 600, 1000);
      log(id, 'hand open, moving', await page.eval('__hitch()'));
      await down(500, 600); await sleep(1500); await page.eval('__hitch()'); await sleep(1500);
      log(id, 'fist', await page.eval('__hitch()'));
      await up(500, 600); await key('2'); await sleep(4000);
    }
    await key('1'); await hold('checks.vega');
    await move(200, 200); await down(200, 200); await glide(200, 200, 1000, 500, 2000, { buttons: 1, button: 'left' }); await up(1000, 500);
    log('rain', await page.eval('__hitch()'));
    await key('1');
  }
  const errs = page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  log('errors', errs.length, errs.slice(0, 5));
};
