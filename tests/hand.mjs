// The hand, driven with real mouse and wheel input through CDP. Run: node tools/lab.mjs tests/hand.mjs --out lab-out/hand
// STAGE picks a part: press, push, journey, duty, sheet, knobs, library, record, fade (default: all)
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ALT = 1, SHIFT = 8;

export default async ({ page, log, save }) => {
  const stage = process.env.STAGE || 'all';
  const want = s => stage === 'all' || stage.split(',').includes(s);
  const mouse = (type, x, y, o = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, button: o.button ?? 'none', buttons: o.buttons ?? 0, clickCount: o.clickCount ?? 0, modifiers: o.modifiers ?? 0, deltaX: o.deltaX ?? 0, deltaY: o.deltaY ?? 0, pointerType: 'mouse' });
  const move = (x, y, o) => mouse('mouseMoved', x, y, o);
  const down = (x, y, o = {}) => mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1, ...o });
  const up = (x, y, o = {}) => mouse('mouseReleased', x, y, { button: 'left', buttons: 0, clickCount: 1, ...o });
  const wheel = (x, y, dx, dy, o = {}) => mouse('mouseWheel', x, y, { deltaX: dx, deltaY: dy, ...o });
  const glide = async (x0, y0, x1, y1, ms, o = {}) => {
    const n = Math.max(2, ms / 16 | 0);
    for (let i = 1; i <= n; i++) { await move(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, o); await sleep(16); }
  };
  const key = async k => {
    const code = k.length === 1 ? 'Key' + k.toUpperCase() : k;
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k.length === 1 ? k : undefined, windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0 });
  };
  const state = () => page.eval(() => ({ ...app.hand.state(), theta: +app.lastFrame.theta.toFixed(3), now: app.lastFrame.G.pattern.id, scale: +app.R.slotA[0].toFixed(0) }));
  // a stripe pattern with nothing moving except its own flow
  const hold = async id => { await page.eval(`trippee.load(${JSON.stringify(id)},{arcs:false});app.hand.clear()`); await sleep(400); };
  // mean of the picture, and how much it differs from a stored reference, read from the real drawn frame
  await page.eval(() => {
    const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d', { willReadFrequently: true });
    window.__grab = () => new Promise(res => { const f = () => { app.onFrame.splice(app.onFrame.indexOf(f), 1); g.drawImage(app.canvas, 0, 0, 160, 90); res(Array.from(g.getImageData(0, 0, 160, 90).data.filter((_, i) => i % 4 === 0))); }; app.onFrame.push(f); });
    window.__white = async () => { const d = await __grab(); return +(d.reduce((a, b) => a + b, 0) / d.length / 255).toFixed(3); };
    window.__ref = async () => { window.__r = await __grab(); return 1; };
    window.__diff = async () => { const d = await __grab(); let s = 0; for (let i = 0; i < d.length; i++) s += Math.abs(d[i] - __r[i]); return +(s / d.length / 255).toFixed(3); };
    window.__lat = []; let last = performance.now();
    app.onFrame.push(() => { const n = performance.now(); __lat.push(n - last); last = n; if (__lat.length > 4000) __lat.shift(); });
    window.__hitch = () => { const a = [...__lat].sort((x, y) => x - y); const r = { n: a.length, med: +a[a.length >> 1].toFixed(1), p99: +a[a.length * .99 | 0].toFixed(1), max: +a[a.length - 1].toFixed(1) }; __lat.length = 0; return r; };
  });
  log('patterns', await page.eval('app.patterns.length'), await page.eval('app.families.join(" ")'));
  const IDS = await page.eval('app.patterns.map(p=>p.id)');
  // Plain stripes show exactly what the hand does, with nothing of a pattern's own in the way
  await page.eval(`app.byId['test.plain']={id:'test.plain',name:'Plain',family:'lines',g:{fams:[{x:9}]},flow:{}}`);
  const stripe = 'test.plain';

  if (want('press')) {
    await hold(stripe);
    await page.shot('press-0-before');
    await move(640, 360);
    await glide(640, 360, 800, 300, 700);
    const lag = [];
    // A straight run, reading the ball against the cursor: how far behind is it?
    for (let i = 0; i < 40; i++) {
      const x = 300 + i * 18; await move(x, 360); await sleep(16);
      lag.push(await page.eval(`[${x},app.hand.state().pressX,app.canvas.clientHeight,app.canvas.clientWidth]`));
    }
    const [cx, px, H, W] = lag[lag.length - 1];
    const cursor = (cx - W / 2) / H * 2;
    const speed = (18 / 0.016) / H * 2;   // nominal
    await page.shot('press-1-moving');
    await sleep(1000);
    log('press', await state(), 'ball behind by', (cursor - px).toFixed(3), 'picture units');
    await page.shot('press-2-settled');
    await sleep(4200);
    log('press after idle', (await state()).press);
  }

  if (want('push')) {
    await hold(stripe);
    await move(300, 200); await sleep(100);
    await page.eval('__ref()');
    await down(300, 200);
    await glide(300, 200, 980, 500, 900, { buttons: 1, button: 'left' });
    await up(980, 500);
    log('push', await page.eval('({e:app.R.brushEnergy,on:app.R.pushOn})'));
    await page.shot('push-1-combed');
    await sleep(5000);
    log('push +5s', await page.eval('({e:app.R.brushEnergy,on:app.R.pushOn})'));
    await page.shot('push-2-relaxing');
    await key('z'); await sleep(3000);
    log('push z', await page.eval('({e:app.R.brushEnergy,on:app.R.pushOn})'));
    await page.shot('push-3-cleared');
  }

  if (want('journey')) {
    await hold(stripe);
    await move(900, 200); await sleep(300);
    await page.shot('journey-0');
    const under = () => page.eval(() => { const A = app.R.slotA, O = trippee.app.hand.offsets; const s = A[O.scale], a = -A[O.rot], c = [(900 - 640) / 360, -(200 - 360) / 360]; return [(Math.cos(a) * c[0] - Math.sin(a) * c[1]) / s + A[O.tx], (Math.sin(a) * c[0] + Math.cos(a) * c[1]) / s + A[O.ty]].map(v => +v.toFixed(4)); });
    log('pattern point under the cursor before', await under());
    for (let i = 0; i < 16; i++) { await wheel(900, 200, 0, -80); await sleep(50); }
    await sleep(800);
    log('in', await state());
    log('pattern point under the cursor after', await under());
    await page.shot('journey-1-in');
    for (let i = 0; i < 80; i++) { await wheel(900, 200, 0, 100); await sleep(30); }
    await sleep(1600);
    log('out', await state());
    await page.shot('journey-2-hairline');
    for (let i = 0; i < 40; i++) { await wheel(900, 200, 0, 100); await sleep(16); }
    await sleep(600);
    log('still further out (it should be reluctant, not stopped)', await state());
    for (let i = 0; i < 120; i++) { await wheel(900, 200, 0, -100); await sleep(16); }
    await sleep(1500);
    log('huge', await state());
    await page.shot('journey-3-huge');
    await key('z'); await sleep(3000);
    log('cleared', await state());
    await page.shot('journey-4-cleared');
  }

  if (want('duty')) {
    await hold(stripe);
    await move(640, 360); await sleep(200);
    let prev = null, seq = [];
    for (let i = 0; i < 200; i++) {
      await wheel(640, 360, 26, 0); await sleep(30);
      const s = await state();
      if (i % 22 === 0) await page.shot(`duty-${String(i).padStart(3, '0')}`);
      if (s.now !== prev) { seq.push([i, s.now, s.theta, s.room]); prev = s.now; }
    }
    log('thinner', JSON.stringify(seq), await state());
    seq = []; prev = null;
    for (let i = 0; i < 120; i++) {
      await wheel(640, 360, -26, 0); await sleep(30);
      const s = await state();
      if (s.now !== prev) { seq.push([i, s.now, s.theta, s.room]); prev = s.now; }
    }
    log('fatter', JSON.stringify(seq), await state());
    await key('z'); await sleep(1500);
  }

  if (want('sheet')) {
    await hold(stripe);
    await move(640, 360); await sleep(200);
    await page.shot('sheet-0');
    await down(640, 360, { modifiers: ALT });
    await sleep(900);
    log('lifted', await state(), await page.eval('app.hand.readout'));
    await page.shot('sheet-1-lifted');
    await glide(640, 360, 640, 300, 500, { modifiers: ALT, buttons: 1, button: 'left' });
    await sleep(200);
    log('turned', await state(), await page.eval('app.hand.readout'));
    await page.shot('sheet-2-turned');
    await page.eval('__ref()');
    await move(641, 300, { modifiers: ALT, buttons: 1, button: 'left' });
    await sleep(200);
    log('one pixel of slide changes', await page.eval('__diff()'), 'of the picture');
    // tune upwards through a detent, reading the angle against the hand
    const trace = [];
    for (let i = 0; i < 80; i++) { await move(641, 300 - i, { modifiers: ALT, buttons: 1, button: 'left' }); await sleep(30); const r = await page.eval('app.hand.readout'); trace.push(`${r?.deg?.toFixed(2)}${r?.locked ? 'L' : ''}`); }
    log('tuning', trace.join(' '));
    await page.shot('sheet-3-tuned');
    await up(641, 220, { modifiers: ALT });
    await sleep(400);
    await page.shot('sheet-4-stays');
    await key('z'); await sleep(1200);
    log('after z', await state());
    await page.shot('sheet-5-cleared');
  }

  if (want('knobs')) {
    await hold(stripe);
    await move(640, 300); await sleep(100);
    await key('k'); await sleep(300);
    await page.shot('knobs-1');
    log('knob rows', await page.eval('app.ui.knobs.rows.map(r=>r.a.name||r.a.id)'));
    const r = await page.eval(() => { const k = [...document.querySelectorAll('.knob')]; const b = k[k.length - 1].querySelector('.track').getBoundingClientRect(); return { x: b.left, y: b.top + 5, w: b.width }; });
    await move(r.x + r.w * .5, r.y); await down(r.x + r.w * .5, r.y); await glide(r.x + r.w * .5, r.y, r.x + r.w * .85, r.y, 500, { buttons: 1, button: 'left' }); await up(r.x + r.w * .85, r.y);
    await sleep(500);
    log('over', await page.eval('app.edits.over'));
    await page.shot('knobs-2-moved');
    await key('k');
    // speed and rotation really move
    await hold(stripe); await key('k'); await sleep(200);
    const rate = async () => { const a = await page.eval('[app.lastFrame.phi,app.edits.spin||0,app.t]'); await sleep(1000); const b = await page.eval('[app.lastFrame.phi,app.edits.spin||0,app.t]'); return { phiPerSec: +((b[0] - a[0]) / (b[2] - a[2])).toFixed(3), spinPerSec: +((b[1] - a[1]) / (b[2] - a[2])).toFixed(3) }; };
    log('rates at rest', await rate());
    const kk = await page.eval(() => [...document.querySelectorAll('.knob .track')].map(t => { const b = t.getBoundingClientRect(); return [b.left, b.top + 5, b.width]; }));
    await move(kk[0][0] + kk[0][2] * .85, kk[0][1]); await down(kk[0][0] + kk[0][2] * .85, kk[0][1]); await up(kk[0][0] + kk[0][2] * .85, kk[0][1]);
    await move(kk[1][0] + kk[1][2] * .8, kk[1][1]); await down(kk[1][0] + kk[1][2] * .8, kk[1][1]); await up(kk[1][0] + kk[1][2] * .8, kk[1][1]);
    await sleep(1800);
    log('rates with the knobs up', await rate());
    await page.shot('knobs-rotated');
    await key('z'); await sleep(500);
    await key('k');
    const withAxes = await page.eval(`app.patterns.find(p=>p.axes&&p.axes.length>=4).id`);
    await hold(withAxes); await key('k'); await sleep(300); await move(1100, 200); await sleep(150);
    await page.shot('knobs-3-axes');
    const k2 = await page.eval(() => { const k = [...document.querySelectorAll('.knob')]; const b = k[0].querySelector('.track').getBoundingClientRect(); return { x: b.left, y: b.top + 5, w: b.width, names: app.ui.knobs.rows.map(r => r.a.name), v0: app.ui.knobs.rows[0].get() }; });
    await page.eval('__ref()');
    await down(k2.x + k2.w * .9, k2.y); await up(k2.x + k2.w * .9, k2.y); await sleep(600);
    log(withAxes, k2.names, 'first knob', k2.v0, '->', await page.eval('app.ui.knobs.rows[0].get()'), 'picture changed by', await page.eval('__diff()'));
    await mouse('mousePressed', k2.x + k2.w * .9, k2.y, { button: 'left', buttons: 1, clickCount: 2 }); await mouse('mouseReleased', k2.x + k2.w * .9, k2.y, { button: 'left', clickCount: 2 });
    await sleep(2500);
    log('double-click lets it go', await page.eval('app.hand.state().knobs'));
    await key('k');
  }

  if (want('library')) {
    await sleep(200); await page.eval('__hitch()');
    await key('p');
    await sleep(100);
    await page.shot('library-0');
    await sleep(Math.max(3000, IDS.length * 60));
    log('frame times while thumbs drew', await page.eval('__hitch()'));
    await page.shot('library-1');
    const t = await page.eval(() => { const box = document.querySelector('#library .scroll').getBoundingClientRect(); const t = [...document.querySelectorAll('#library .tile')].find(c => { const b = c.getBoundingClientRect(); return b.top > box.top + 8 && b.bottom < box.bottom - 8 && !c.classList.contains('here'); }); const b = t.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 - 8, name: t.textContent }; });
    await move(t.x, t.y); await sleep(700);
    await page.shot('library-2-hover');
    await down(t.x, t.y); await up(t.x, t.y);
    await sleep(100);
    const whites = [];
    for (let i = 0; i < 14; i++) { whites.push([(await state()).theta, await page.eval('app.lastFrame.G.pattern.id')]); await sleep(500); }
    log('morphing to', t.name, JSON.stringify(whites), 'held', await page.eval('app.hand.isHeld()'));
    await page.shot('library-3-arrived');
    const w = await page.eval(() => { const b = document.querySelector('#library [data-wander]').getBoundingClientRect(); return { x: b.left + 8, y: b.top + 6 }; });
    await move(w.x, w.y); await down(w.x, w.y); await up(w.x, w.y); await sleep(300);
    log('wander row: held', await page.eval('app.hand.isHeld()'), await page.eval('document.querySelector("#library [data-wander]").className'));
    await key('p'); await sleep(100);
  }

  if (want('fade')) {
    await key('p'); await key('k'); await sleep(200);
    await move(640, 360);
    await sleep(600);
    await page.shot('fade-1-open');
    await move(1000, 700); await sleep(500);
    await page.shot('fade-2-bar');
    await move(640, 360);
    await sleep(5000);
    await page.shot('fade-3-idle');
    await key('p'); await key('k');
    await key('?'); await sleep(300); await page.shot('fade-4-help'); await key('?');
  }

  if (want('record')) {
    const f0 = await page.eval(() => { app.ui.recorder.autosave = false; app.ui.recorder.start(); return app.ui.recorder.mime; });
    log('recording as', f0);
    await sleep(2500);
    await page.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(2500);
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await sleep(2500);
    const res = await page.eval(async () => {
      const r = app.ui.recorder, frames = r.frames;
      const blob = await r.stop();
      const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(blob);
      await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error('video would not load')); });
      let dur = v.duration;
      if (!isFinite(dur)) { v.currentTime = 1e7; await new Promise(ok => { v.onseeked = ok; v.ondurationchange = () => { if (isFinite(v.duration)) ok(); }; }); dur = v.duration; }
      const c = document.createElement('canvas'), w = c.width = v.videoWidth, h = c.height = v.videoHeight, g = c.getContext('2d');
      // the very last moments really decode, and playing through the seams reaches the end
      v.currentTime = Math.max(0, dur - 0.15); await new Promise(ok => { v.onseeked = ok; });
      g.drawImage(v, 0, 0, w, h);
      const last = g.getImageData(0, 0, w, h).data; let lum = 0; for (let i = 0; i < last.length; i += 400) lum += last[i];
      v.currentTime = 0; await new Promise(ok => { v.onseeked = ok; });
      v.playbackRate = 4; await v.play();
      const played = await new Promise(ok => { v.onended = () => ok(v.currentTime); setTimeout(() => ok(v.currentTime), 8000); });
      return { size: blob.size, type: blob.type, dur, w, h, frames, lum, played, data: c.toDataURL('image/jpeg', .8) };
    });
    save('record-last-frame.jpg', res.data); delete res.data;
    log('record', JSON.stringify(res));
    const pic = await page.eval(async () => { const b = await app.ui.recorder.picture(); return { size: b.size, type: b.type }; });
    log('picture', pic);
    const px = await page.eval(async () => { const b = await app.ui.recorder.picture(); const bm = await createImageBitmap(b); const c = document.createElement('canvas'); c.width = 64; c.height = 36; const g = c.getContext('2d'); g.drawImage(bm, 0, 0, 64, 36); const d = g.getImageData(0, 0, 64, 36).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i]; return { w: bm.width, h: bm.height, meanLuma: Math.round(s / (d.length / 4)) }; });
    log('picture holds the frame', px);
  }
  if (want('keys')) {
    const snap = () => page.eval(() => ({ paused: app.paused, t: +app.t.toFixed(2), pat: app.lastFrame.G.pattern.id, heading: app.stage.score.gestures.at(-1).pattern.id, bare: document.body.classList.contains('bare'), calm: app.hand.calm, hold: app.hand.isHeld() }));
    log('start', await snap());
    await key(' '); await sleep(400); const a = await snap(); await sleep(300); const b = await snap();
    log('space: time stopped', a.paused, a.t === b.t);
    // the hand still works while paused
    await move(500, 300); await glide(500, 300, 700, 400, 400); await sleep(300); await page.shot('keys-paused-press');
    await key(' '); await sleep(300);
    log('space again', (await snap()).paused);
    await key('n'); await sleep(200); log('n', await snap());
    await key('n'); await sleep(200); log('n n', await snap());
    await sleep(4000); log('landed', await snap());
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 }); await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await sleep(200); log('arrow', await snap());
    await sleep(4000);
    await key('w'); await sleep(300); log('w', await snap());
    await sleep(14000); log('wandering on', await snap());
    await key('h'); await sleep(100); log('h', (await snap()).bare); await key('h');
    await key('m'); await sleep(100); log('m', (await snap()).calm);
    await sleep(2000); await page.shot('keys-calm'); await key('m');
  }

  if (want('song')) {
    const prog = [];
    await page.eval(async () => {
      const r = await fetch('/media/ppp.mp3'), b = await r.blob();
      const f = new File([b], 'ppp.mp3', { type: 'audio/mpeg' });
      const dt = new DataTransfer(); dt.items.add(f);
      window.__t0 = performance.now();
      dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    await sleep(600);
    await move(640, 300);
    await page.shot('song-0-listening');
    for (let i = 0; i < 120; i++) {
      const s = await page.eval(() => ({ state: app.ui.song.state, name: document.querySelector('#song [data-name]').textContent }));
      if (i % 10 === 0) prog.push(s.name);
      if (s.state !== 'listening') break;
      await sleep(1000);
    }
    log('listening', prog, await page.eval('(performance.now()-__t0)/1000'));
    await move(640, 310);
    await sleep(3000);
    log('song', await page.eval(() => ({ playing: app.song.playing, d: app.song.duration, t: app.t, segs: app.song.analysis?.segments?.length, gestures: app.song.score?.gestures?.length, fam: app.song.score?.family })));
    await page.shot('song-1-playing');
    const strip = await page.eval(() => { const b = document.querySelector('#song .strip').getBoundingClientRect(); return { x: b.left, y: b.top + b.height / 2, w: b.width }; });
    await move(strip.x + strip.w * .5, strip.y); await down(strip.x + strip.w * .5, strip.y); await up(strip.x + strip.w * .5, strip.y);
    await sleep(2500);
    log('seek to half', await page.eval('({t:app.t,d:app.song.duration})'));
    await page.shot('song-2-seek');
    const take = await page.eval(() => { const b = document.querySelector('#song [data-take]').getBoundingClientRect(); return { x: b.left + 4, y: b.top + 4, seed: app.song.score.seed }; });
    await move(take.x, take.y); await down(take.x, take.y); await up(take.x, take.y);
    const th = []; for (let i = 0; i < 16; i++) { th.push(await page.eval('+app.lastFrame.theta.toFixed(2)')); await sleep(250); }
    log('another take: theta through the change', th.join(' '), 'seed', take.seed, '->', await page.eval('app.song.score.seed'));
    await sleep(3000);
    await move(640, 300);
    await page.shot('song-3-take');
    // recording with the song's sound
    const res = await page.eval(async () => {
      const r = app.ui.recorder; r.autosave = false; r.start(); const mime = r.mime, hasAudio = r.hasAudio;
      await new Promise(ok => setTimeout(ok, 5000));
      const blob = await r.stop();
      const ctx = new OfflineAudioContext(1, 44100, 44100);
      let audio = null;
      try { const buf = await ctx.decodeAudioData(await blob.arrayBuffer()); const d = buf.getChannelData(0); let pk = 0; for (let i = 0; i < d.length; i += 64) pk = Math.max(pk, Math.abs(d[i])); audio = { dur: buf.duration, peak: pk }; } catch (e) { audio = 'no audio decoded: ' + e.message; }
      return { mime, hasAudio, size: blob.size, audio };
    });
    log('recording with song', JSON.stringify(res));
    await key(' '); await sleep(300); log('pause song', await page.eval('app.song.playing')); await key(' '); await sleep(200);
    log('resumed', await page.eval('app.song.playing'));
    // N while a song plays: the film takes that pattern as its motif, and the music doesn't stop
    const pool0 = await page.eval('app.song.score.pool[0]');
    const tN = await page.eval('app.t');
    await key('n');
    const th2 = []; for (let i = 0; i < 16; i++) { th2.push(await page.eval('+app.lastFrame.theta.toFixed(2)')); await sleep(250); }
    log('n in a film', pool0, '->', await page.eval('app.song.score.pool[0]'), 'theta', th2.join(' '), 'time ran on', tN, await page.eval('app.t'));
    await key('w'); await sleep(2500);
    log('w in a film: its own family again', await page.eval('app.song.score.family'), await page.eval('app.song.score.pool[0]'));
    await sleep(2500);
    const ej = await page.eval(() => { const b = document.querySelector('#song [data-eject]').getBoundingClientRect(); return { x: b.left + 4, y: b.top + 4 }; });
    await move(ej.x, ej.y); await down(ej.x, ej.y); await up(ej.x, ej.y); await sleep(3000);
    log('ejected', await page.eval('({clock:!!app.clock,song:!!app.stage.score.song,dur:app.song.duration,t:app.t,pat:app.lastFrame.G.pattern.id,n:app.stage.score.gestures.length})'));
    await sleep(1000);
    await page.shot('song-4-ejected');
    await key('s');
  }

  if (want('moire')) {
    let i = 0;
    for (const id of (process.env.MOIRE || 'lattice.master,dots.inflate,checks.floor,poles.target,lines.discs').split(',')) {
      const real = IDS.includes(id) ? id : (IDS.find(x => x.startsWith(id.slice(0, 4))) || IDS[0]);
      await page.eval(`trippee.load(${JSON.stringify(real)},{arcs:false});app.hand.clear()`); await sleep(1400);
      await move(640, 360); await sleep(100);
      await down(640, 360, { modifiers: ALT });
      await sleep(800);
      const a = await page.eval('app.hand.readout');
      await page.shot(`moire-${++i}-a`);
      // walk upward until it locks at the next detent
      let y = 360, r = a;
      for (let k = 0; k < 400; k++) { y -= 1; await move(640, y, { modifiers: ALT, buttons: 1, button: 'left' }); await sleep(12); r = await page.eval('app.hand.readout'); if (r?.locked && Math.abs(r.deg - a.deg) > 3) break; }
      await sleep(500);
      await page.shot(`moire-${++i}-b`);
      log(real, 'first', a, 'then', r);
      await up(640, y, { modifiers: ALT });
      await page.eval('app.hand.dropSheet()'); await sleep(500);
    }
  }

  if (want('grab')) {
    // Taking the threshold from the middle of a wandering gesture, and zooming with a pinch, must not move anything.
    const before = await page.eval(() => { const t = app.t; return t; });
    await page.eval(() => { window.__tr = []; window.__on = () => { const A = app.R.slotA, O = app.hand.offsets; __tr.push([+app.lastFrame.theta.toFixed(4), +A[O.scale].toFixed(4), +app.edits.duty.toFixed(4)]); }; app.onFrame.push(__on); });
    await move(640, 360);
    await sleep(2000);
    await wheel(640, 360, 2, 0);
    await sleep(600);
    await wheel(640, 360, 0, -3, { modifiers: 2 });
    for (let i = 0; i < 8; i++) { await wheel(640, 360, 0, -8, { modifiers: 2 }); await sleep(30); }
    await sleep(800);
    const r = await page.eval(() => { app.onFrame.splice(app.onFrame.indexOf(__on), 1); let dT = 0, dS = 0; for (let i = 1; i < __tr.length; i++) { dT = Math.max(dT, Math.abs(__tr[i][0] - __tr[i - 1][0])); dS = Math.max(dS, Math.abs(Math.log(__tr[i][1] / __tr[i - 1][1]))); } return { frames: __tr.length, largestThetaStep: dT, largestLogScaleStep: dS, state: app.hand.state() }; });
    // and hand.go from mid-sweep
    await page.eval(() => { __tr.length = 0; app.onFrame.push(__on); app.hand.go('dots.inflate'); });
    await sleep(1500);
    await page.eval(`app.hand.go('lattice.star')`);
    await sleep(7000);
    const r2 = await page.eval(() => { app.onFrame.splice(app.onFrame.indexOf(__on), 1); let dT = 0; for (let i = 1; i < __tr.length; i++) dT = Math.max(dT, Math.abs(__tr[i][0] - __tr[i - 1][0])); return { frames: __tr.length, dT, pat: app.lastFrame.G.pattern.id }; });
    log('going twice in a row', r2);
    log('grab', r.frames, 'theta step', r.largestThetaStep, 'ln scale step', r.largestLogScaleStep, 'J', r.state.J, 'corridor', r.state.corridor);
    // hints: answered, and stays answered
    const ok = await page.eval(() => { const b = document.querySelector('#hints [data-ok]').getBoundingClientRect(); return { x: b.left + 6, y: b.top + 6, seen: localStorage.getItem('trippee.seen') }; });
    await move(ok.x, ok.y); await sleep(100);
    await page.shot('hints-full');
    await down(ok.x, ok.y); await up(ok.x, ok.y); await sleep(200);
    log('got it: hidden', await page.eval('document.querySelector("#hints").hidden'), 'remembered', await page.eval('localStorage.getItem("trippee.seen")'));
    await move(300, 700); await sleep(200);
    await page.shot('bar-full');
  }

  if (want('settle')) {
    // A song dropped on a held pattern: is every frame continuous on the way in?
    await page.eval(`trippee.load('lattice.star',{arcs:false})`);
    await sleep(500);
    const trace = await page.eval(async () => {
      const r = await fetch('/media/ppp.mp3'), b = await r.blob(), f = new File([b], 'ppp.mp3', { type: 'audio/mpeg' });
      const log = [], t0 = performance.now();
      const on = () => log.push([+(performance.now() - t0).toFixed(0), +app.lastFrame.theta.toFixed(3), app.lastFrame.G.pattern.id, +app.t.toFixed(2)]);
      app.onFrame.push(on);
      await app.ui.song.load(f);
      await new Promise(ok => setTimeout(ok, 2500));
      app.onFrame.splice(app.onFrame.indexOf(on), 1);
      return { log, fam: app.song.score.family, pool: app.song.score.pool.slice(0, 3), mine: app.ui.song.useMine };
    });
    let jump = 0, at = null, change = [];
    for (let i = 1; i < trace.log.length; i++) { const d = Math.abs(trace.log[i][1] - trace.log[i - 1][1]); if (d > jump) { jump = d; at = [trace.log[i - 1], trace.log[i], trace.log[i + 1]]; } if (trace.log[i][2] !== trace.log[i - 1][2]) change.push(trace.log[i]); }
    log('song on a held pattern', trace.fam, trace.pool, 'mine', trace.mine, 'largest theta step', jump, 'at', JSON.stringify(at), 'pattern changes', JSON.stringify(change), 'frames', trace.log.length);
  }

  log('page errors:', page.logs.filter(l => /\[error\]|\[exception\]/.test(l)).slice(0, 8));
};
