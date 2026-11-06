// Version 2, everything together, with real mouse and keys through CDP. Muted by the lab.
//   STAGE=boot,static,hand,music,film,fps node tools/lab.mjs tests/v2.mjs --out lab-out/v2
const sleep = ms => new Promise(r => setTimeout(r, ms));

export default async ({ page, log, save }) => {
  const stage = (process.env.STAGE || 'boot').split(',');
  const want = s => stage.includes(s);
  const mouse = (type, x, y, o = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, button: o.button ?? 'none', buttons: o.buttons ?? 0, clickCount: o.clickCount ?? 0, modifiers: o.modifiers ?? 0, deltaX: o.deltaX ?? 0, deltaY: o.deltaY ?? 0, pointerType: 'mouse' });
  const move = (x, y, o) => mouse('mouseMoved', x, y, o);
  const down = (x, y) => mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1 });
  const up = (x, y) => mouse('mouseReleased', x, y, { button: 'left', buttons: 0, clickCount: 1 });
  const held = { button: 'left', buttons: 1 };
  const glide = async (x0, y0, x1, y1, ms, o = {}) => { const n = Math.max(2, ms / 16 | 0); for (let i = 1; i <= n; i++) { await move(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, o); await sleep(16); } };
  const key = async k => {
    const code = /^\d$/.test(k) ? 'Digit' + k : k === ' ' ? 'Space' : 'Key' + k.toUpperCase();
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) });
  };
  const clickFx = async id => {
    await move(640, 300); await sleep(60);
    const r = await page.eval(`(()=>{const b=document.querySelector('[data-fx=${id}]');if(!b||b.hidden)return null;const r=b.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2,b.textContent.trim(),b.className]})()`);
    if (!r) { log('FAIL no button', id); return null; }
    await move(r[0], r[1]); await sleep(30); await down(r[0], r[1]); await up(r[0], r[1]); await sleep(120);
    return r;
  };
  const wheel = async (n, dy) => { for (let i = 0; i < n; i++) { await mouse('mouseWheel', 640, 360, { deltaY: dy }); await sleep(20); } };
  const errors = () => page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  await page.eval(() => {
    try { document.querySelector('#hints [data-ok]').click(); } catch {}
    const c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d', { willReadFrequently: true });
    window.__on = fn => new Promise(res => { const once = () => { app.onFrame.splice(app.onFrame.indexOf(once), 1); res(fn()); }; app.onFrame.push(once); });
    // the picture, small, read in the frame callback where the drawing buffer is still there
    window.__px = () => __on(() => { g.drawImage(app.canvas, 0, 0, 320, 180); return g.getImageData(0, 0, 320, 180).data; });
    window.__diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return +(s / (a.length / 4) / 765).toFixed(4); };
    window.__chroma = a => { let n = 0; for (let i = 0; i < a.length; i += 4) { if (Math.max(a[i], a[i + 1], a[i + 2]) - Math.min(a[i], a[i + 1], a[i + 2]) > 40) n++; } return +(n / (a.length / 4)).toFixed(4); };
    window.__st = () => ({ t: +app.t.toFixed(1), on: app.stage.staticOn, held: !!app.stage.staticG, pat: app.lastFrame.G.pattern.id, u: app.stage.staticG?.freezeU, two: !!app.lastFrame.N, T: +app.lastFrame.T.toFixed(2), kind: app.lastFrame.kind, J: +(app.edits.journey || 0).toFixed(3), knobs: app.hand.state().knobs.join(), scale: +app.R.drawScale.toFixed(2) });
    window.__fx = () => ({ fx: app.hand.effect(), hand: app.edits.hand && { on: +app.edits.hand.on.toFixed(2), curl: +app.edits.hand.curl.toFixed(2), x: +app.edits.hand.x.toFixed(2), y: +app.edits.hand.y.toFixed(2) }, rings: app.edits.ripples?.length || 0, warp: app.edits.warp && { t: +app.edits.warp.twist.toFixed(2), p: +app.edits.warp.pinch.toFixed(2) } });
  });
  log('version', await page.eval('trippee.version'), 'errors at boot', errors().length, errors().slice(0, 4));

  if (want('boot')) {
    await move(640, 300); await sleep(300);
    log('bar', await page.eval(`[...document.querySelectorAll('#fx [data-fx]')].map(b=>[b.dataset.fx,b.hidden?'HIDDEN':'',b.textContent.trim()].join(' ')).join(' | ')`));
    log('bar box', await page.eval(`(()=>{const r=document.querySelector('#fx').getBoundingClientRect();return [r.left,r.top,r.right,r.bottom,getComputedStyle(document.querySelector('#fx')).opacity].map(x=>+(+x).toFixed(1))})()`));
    await page.shot('boot-bar');
    await page.eval(`trippee.load('lines.river');app.t=13;trippee.run()`); await sleep(400);
    const base = await page.eval('__px().then(a=>{window.__a=a;return 1})');
    for (const id of ['ripple', 'hand', 'twist', 'pinch', 'bulge', 'comb']) {
      const r = await clickFx(id);
      log('click', id, await page.eval(`[app.hand.effect(),document.querySelector('[data-fx=${id}]').classList.contains('now')]`));
      await move(640, 360); await sleep(80);
      await page.eval('app.paused=true;__px().then(a=>{window.__a=a})'); await sleep(60);
      await down(640, 360);
      await glide(640, 360, 760, 300, 500, held);
      await sleep(id === 'hand' ? 2200 : 1000);
      log(id, 'pixels moved', await page.eval('__px().then(a=>__diff(a,__a))'), JSON.stringify(await page.eval('__fx()')));
      await page.shot('fx-' + id);
      await up(760, 300);
      await page.eval('app.paused=false');
      await clickFx(id);
      log(id, 'off', await page.eval('app.hand.effect()'));
      await key('z'); await sleep(1500);
    }
    // the toggles
    let r = await clickFx('static'); log('static button', r?.[2], await page.eval(`[app.stage.staticOn,document.querySelector('[data-fx=static]').className,document.querySelector('[data-fx=static]').textContent.trim()]`));
    r = await clickFx('static'); log('static button again', await page.eval(`[app.stage.staticOn,document.querySelector('[data-fx=static]').className]`));
    r = await clickFx('beyond'); await sleep(7000);
    log('colour button', r?.[2], await page.eval(`[app.beyond.active,document.querySelector('[data-fx=beyond]').className]`), 'coloured share', await page.eval('__px().then(__chroma)'));
    await page.shot('colour-on');
    r = await clickFx('beyond'); await sleep(7000);
    log('colour off', await page.eval(`[app.beyond.active,document.querySelector('[data-fx=beyond]').className]`), 'coloured share', await page.eval('__px().then(__chroma)'));
    r = await clickFx('sound'); await sleep(2500);
    log('music button', r?.[2], await page.eval(`[app.sound.active,document.querySelector('[data-fx=sound]').className,app.sound.context.state,app.sound.log.length]`));
    await page.shot('music-on');
    r = await clickFx('sound'); await sleep(300);
    log('music off', await page.eval(`[app.sound.active,document.querySelector('[data-fx=sound]').className]`));
    await page.send('Emulation.setDeviceMetricsOverride', { width: 760, height: 500, deviceScaleFactor: 1, mobile: false }); await sleep(300);
    await move(300, 200); await sleep(200); await page.shot('bar-narrow');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }); await sleep(300);
  }

  // ------------------------------------------------------------------------------------- static, with and without a song
  const staticStage = async label => {
    const pat = await page.eval('app.lastFrame.G.pattern.id');
    await move(640, 360); await sleep(60);
    await key('l'); await sleep(5000);
    const s0 = await page.eval('__st()');
    log(label, 'on', JSON.stringify(s0));
    const same = async what => { const s = await page.eval('__st()'); log(label, what, s.pat === s0.pat && s.u === s0.u && s.on && !s.two ? 'STAYS' : 'MOVED', JSON.stringify(s)); return s; };
    await wheel(10, -80); await sleep(4000);
    let s = await same('zoom in, 4 s later');
    if (s.J === 0) log('FAIL zoom did not stay');
    await key('k'); await sleep(200);
    const ax = await page.eval(`(()=>{const ax=app.lastFrame.G.pattern.axes?.[0];if(!ax)return null;const el=document.querySelector('#knobs input,#knobs [data-path]');return ax.path})()`);
    if (ax) { await page.eval(`app.hand.setKnob(${JSON.stringify(ax)},app.hand.natural(${JSON.stringify(ax)})*1.2)`); await sleep(1500); await same('knob ' + ax); }
    await key('k');
    for (const k of ['1', '2', '3', '4', '5', '6']) {
      await key(k); await move(500, 300); await sleep(60); await down(500, 300); await glide(500, 300, 620, 340, 300, held); await sleep(200); await up(620, 340); await sleep(100);
      await same('effect ' + k);
      await key(k);
    }
    await key('b'); await sleep(1000); await same('colour on'); await key('b');
    await key('z'); await sleep(2500);
    await page.eval('app.t+=0');
    // picking: stays static, on the new one, at its own place
    await key('p'); await sleep(400);
    const r = await page.eval(`(()=>{const t=[...document.querySelectorAll('#library .tile')].find(t=>t.textContent.toLowerCase().includes('vega'))||document.querySelectorAll('#library .tile')[3];t.scrollIntoView({block:'center'});const r=t.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2,t.textContent]})()`);
    await move(r[0], r[1]); await sleep(60); await down(r[0], r[1]); await up(r[0], r[1]); await sleep(400);
    log(label, 'picked', r[2], JSON.stringify(await page.eval('__st()')));
    await sleep(9000);
    const s1 = await page.eval('__st()');
    log(label, 'arrived', JSON.stringify(s1));
    await key('p');
    await sleep(6000);
    const s2 = await page.eval('__st()');
    log(label, 'after 6 s more', s2.pat === s1.pat && s2.u === s1.u && s2.on ? 'STAYS' : 'MOVED', JSON.stringify(s2));
    await page.shot(label + '-static');
    await key('l'); await sleep(300);
    log(label, 'off', JSON.stringify(await page.eval('__st()')));
    await sleep(8000);
    log(label, '8 s later', JSON.stringify(await page.eval('__st()')));
  };
  if (want('static')) {
    await sleep(2000);
    await staticStage('wander');
    await page.eval(`app.song.load('/media/ppp.mp3',{autoplay:true})`);
    for (let i = 0; i < 600; i++) { if (await page.eval('app.song.playing')) break; await sleep(100); }
    await sleep(8000);
    await page.eval('app.song.seek(40)'); await sleep(1000);
    await staticStage('song');
    log('song still running', await page.eval('[app.song.playing,+app.song.time().toFixed(1)]'));
    await page.eval('app.song.pause()');
  }

  // ------------------------------------------------------------------------------------- the hand, through everything
  if (want('hand')) {
    const handHere = async (name, x = 640, y = 520) => { await move(x, y); await sleep(100); log(name, JSON.stringify(await page.eval('__fx()')), JSON.stringify(await page.eval('__st()'))); await page.shot('hand-' + name); };
    // How much the hand changes the picture, measured on the same frame with and without it
    await page.eval(() => { window.__handDiff = () => { const was = app.manual; app.manual = true; const e = app.edits.hand; trippee.step(0); const g = document.createElement('canvas').getContext('2d'); g.canvas.width = 320; g.canvas.height = 180; g.drawImage(app.canvas, 0, 0, 320, 180); const a = g.getImageData(0, 0, 320, 180).data; return { e, a }; }; });
    await page.eval(`trippee.load('lines.river');app.t=13;trippee.run()`); await sleep(200);
    await key('2'); await move(640, 520); await sleep(3200);
    await handHere('open');
    // through a morph: stays up, and stays in place
    await page.eval(`app.hand.go('checks.vega',{dur:8})`);
    for (const ms of [2000, 2000, 2000, 3000]) { await sleep(ms); await handHere('morph-' + (await page.eval('Math.round(app.lastFrame.T*100)'))); }
    await sleep(1000);
    await handHere('after-morph');
    await down(640, 520); await sleep(900); await handHere('fist'); await up(640, 520); await sleep(600);
    // static
    await key('l'); await sleep(1200); await handHere('static');
    await glide(640, 520, 800, 480, 500); await sleep(200); await handHere('static-moved', 800, 480);
    await key('l'); await sleep(200);
    // colour, opened all the way so it's plainly there
    await key('b'); await page.eval('app.beyond.snap(.8)'); await sleep(800);
    await handHere('colour');
    await down(640, 520); await sleep(900); await handHere('colour-fist'); await up(640, 520);
    log('coloured share with the hand', await page.eval('__px().then(__chroma)'));
    await page.eval(`app.hand.go('lattice.master',{dur:8})`); await sleep(4000); await handHere('colour-morph');
    await sleep(5000);
    await page.eval('app.beyond.snap(null)'); await key('b'); await sleep(7000);
    // during a song, in a song's morph, and with its colour
    await page.eval(`app.song.load('/media/ppp.mp3',{autoplay:true})`);
    for (let i = 0; i < 600; i++) { if (await page.eval('app.song.playing')) break; await sleep(100); }
    await sleep(8000);
    await handHere('song');
    const m = await page.eval(`(()=>{const g=app.song.score.gestures.find(g=>g.t1>30&&g.morph);return [g.t1-g.morph,g.t1,g.pattern.id]})()`);
    await page.eval(`app.song.seek(${m[0] - 1})`); await sleep(4000);
    await handHere('song-morph');
    await key('b'); await page.eval('app.beyond.snap(.8)'); await sleep(800);
    await handHere('song-colour');
    await page.eval('app.beyond.snap(null)'); await key('b');
    await page.eval('app.song.pause()'); await key('2');
  }

  // ------------------------------------------------------------------------------------- the picture's own music
  if (want('music')) {
    const sound = () => page.eval(() => ({ on: app.sound.active, ctx: app.sound.context?.state, notes: app.sound.log.length, clock: !!app.clock, songPlaying: app.song.playing, aside: app.song.aside, t: +app.t.toFixed(1), paused: app.paused, pat: app.lastFrame.G.pattern.id, btn: document.querySelector('[data-fx=sound]').classList.contains('now') }));
    // Picks up exactly what a recorder would, from any stream
    await page.eval(() => { window.__rms = async blob => { const ctx = new OfflineAudioContext(1, 44100, 44100); try { const buf = await ctx.decodeAudioData(await blob.arrayBuffer()); const d = buf.getChannelData(0); let s = 0, pk = 0; for (let i = 0; i < d.length; i++) { s += d[i] * d[i]; pk = Math.max(pk, Math.abs(d[i])); } return { seconds: +buf.duration.toFixed(1), rms: +(20 * Math.log10(Math.sqrt(s / d.length) + 1e-9)).toFixed(1), peak: +pk.toFixed(3), size: blob.size, type: blob.type }; } catch (e) { return { failed: String(e), size: blob.size, type: blob.type }; } }; window.__stopRec = async () => { const r = app.ui.recorder; const b = await r.stop(); return __rms(b); }; app.ui.recorder.autosave = false; });
    log('silent until asked: contexts', await page.eval('[app.sound.context?.state ?? "none", app.song.contextState()]'));
    // A recording with no music: quiet, and no sound machinery made for it
    await key('r'); await sleep(2500);
    log('record, no music: context', await page.eval('app.sound.context?.state ?? "none"'));
    log('  the file', JSON.stringify(await page.eval('__stopRec()'))); await page.eval(`document.querySelector('#rec').hidden=true`);
    log('  plays as a video', JSON.stringify(await page.eval(async () => { const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(app.ui.recorder.last); await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error('no video')); }); return { d: v.duration, w: v.videoWidth, h: v.videoHeight }; })));
    await key('g'); await sleep(3000);
    log('music on', JSON.stringify(await sound()));
    await key('r'); await sleep(7000);
    log('record with music: the file', JSON.stringify(await page.eval('__stopRec()'))); await page.eval(`document.querySelector('#rec').hidden=true`);
    // Pause stops the notes
    await key(' '); await sleep(600); const n0 = (await sound()).notes; await sleep(1500); log('paused: notes', n0, '->', (await sound()).notes); await key(' ');
    await key('g'); await sleep(500);
    log('music off', JSON.stringify(await sound()));
    await sleep(5000); log('5 s later', JSON.stringify(await sound()));
    // Start recording first, then the music
    await key('r'); await sleep(1500); await key('g'); await sleep(6000);
    log('record, then music: the file', JSON.stringify(await page.eval('__stopRec()'))); await page.eval(`document.querySelector('#rec').hidden=true`);
    await key('g'); await sleep(400);
    // A song. Music pauses it, off brings it back where it was
    await page.eval(`app.song.load('/media/ppp.mp3',{autoplay:true})`);
    for (let i = 0; i < 600; i++) { if (await page.eval('app.song.playing')) break; await sleep(100); }
    await sleep(3000);
    const h0 = await page.eval('app.song.time()');
    log('song', h0, JSON.stringify(await sound()));
    await key('g'); await sleep(2500);
    const h1 = await page.eval('app.song.time()');
    log('music on over a song', h1, JSON.stringify(await sound()));
    await page.shot('music-over-song');
    await sleep(1500);
    log('song waits', await page.eval('app.song.time()') === h1 ? 'yes' : 'NO');
    // record the music with a song waiting
    await key('r'); await sleep(6000);
    log('record, song waiting: the file', JSON.stringify(await page.eval('__stopRec()'))); await page.eval(`document.querySelector('#rec').hidden=true`);
    await key('g'); await sleep(1500);
    const h2 = await page.eval('app.song.time()');
    log('music off: song back', h2, JSON.stringify(await sound()), 'clock vs heard', await page.eval('+(app.t-app.song.time()).toFixed(3)'));
    await sleep(7000);
    log('film going', JSON.stringify(await page.eval('__st()')), 'heard', await page.eval('+app.song.time().toFixed(1)'));
    // record the song, with music turned on midway
    await key('r'); await sleep(3000); await key('g'); await sleep(3000);
    log('record song then music: the file', JSON.stringify(await page.eval('__stopRec()'))); await page.eval(`document.querySelector('#rec').hidden=true`);
    await key('g'); await sleep(500);
    // The rest through the panel, as a person would: a real file drop, then the panel's own buttons
    const data = { items: [], files: [process.cwd() + '/media/ppp.mp3'], dragOperationsMask: 1 };
    await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 640, y: 360, data });
    await page.send('Input.dispatchDragEvent', { type: 'drop', x: 640, y: 360, data });
    for (let i = 0; i < 600; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await sleep(100); }
    await sleep(2500);
    const panel = async sel => { await move(640, 300); const r = await page.eval(`(()=>{const b=document.querySelector('#song ${sel}');if(!b||b.hidden)return null;const r=b.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2,b.textContent,document.querySelector('#song [data-time]').textContent]})()`); if (!r) { log('FAIL no panel button', sel); return null; } await move(r[0], r[1]); await sleep(40); await down(r[0], r[1]); await up(r[0], r[1]); await sleep(200); return r; };
    log('dropped', JSON.stringify(await sound()), 'panel state', await page.eval('app.ui.song.state'), 'open', await page.eval('app.ui.song.open'));
    await key('g'); await sleep(1500);
    const hw = await page.eval('app.song.time()');
    const rp = await panel('[data-play]'); await sleep(1000);
    log('pressed', rp?.[2], 'with the song waiting at', hw, 'panel said', rp?.[3], JSON.stringify(await sound()));
    const hp = await page.eval('app.song.time()'); await sleep(1500);
    log('song is really playing: heard moved', +(await page.eval('app.song.time()') - hp).toFixed(2), 'clock vs heard', await page.eval('+(app.t-app.song.time()).toFixed(3)'));
    await key(' '); await sleep(300); log('space pauses the song', await page.eval('app.song.playing')); await key(' '); await sleep(300); log('space plays it', await page.eval('app.song.playing'));
    // Another take with the song waiting
    await key('g'); await sleep(1000);
    const pat0 = await page.eval('app.lastFrame.G.pattern.id');
    const rt = await panel('[data-take]'); await sleep(1000);
    log('another take while waiting: wander still showing', JSON.stringify(await sound()), 'on the film?', await page.eval('!!app.stage.score.song'), 'pattern', pat0, await page.eval('app.lastFrame.G.pattern.id'));
    await key('g'); await sleep(1500);
    log('back: the new take', JSON.stringify(await sound()), 'film is the new one', await page.eval('app.stage.score===app.song.score'));
    // Eject with the song waiting
    await key('g'); await sleep(800);
    await panel('[data-eject]'); await sleep(1000);
    log('ejected while waiting', JSON.stringify(await sound()), 'music still playing', await page.eval('app.sound.active'));
    await key('g'); await sleep(1500);
    const a0 = await page.eval('app.t'); await sleep(1000);
    log('after: the picture carries on', +(await page.eval('app.t') - a0).toFixed(2), JSON.stringify(await sound()), 'score has song', await page.eval('!!app.stage.score.song'));
    // A song dropped with the music on: the song wins, the music steps aside
    await key('g'); await sleep(1000);
    await page.eval(`app.song.load('/media/ppp.mp3',{autoplay:true})`);
    for (let i = 0; i < 600; i++) { if (await page.eval('app.song.playing')) break; await sleep(100); }
    await sleep(1500);
    log('song after music', JSON.stringify(await sound()), 'clock vs heard', await page.eval('+(app.t-app.song.time()).toFixed(3)'));
    await page.eval('app.song.pause()');
    // Music and static and colour at once, on and off
    await page.eval('app.song.eject()'); await sleep(300);
    await key('g'); await key('l'); await key('b'); await sleep(2000);
    log('all on', JSON.stringify(await sound()), JSON.stringify(await page.eval('__st()')));
    await key('b'); await key('l'); await key('g'); await sleep(500);
    log('all off', JSON.stringify(await sound()), JSON.stringify(await page.eval('__st()')));
  }

  // ------------------------------------------------------------------------------------- a song's film, end to end, on a fixed clock
  if (want('film')) {
    const src = process.env.SONG || '/media/ppp.mp3';
    const info = await page.eval(`(async()=>{ const s = await app.song.load(${JSON.stringify(src)}, { seed: ${+(process.env.SEED || 11)} }); app.manual = true; app.clock = null; app.t = 0; const sc = s.score; return { dur: s.duration, bpm: +s.analysis.bpm.toFixed(1), gestures: sc.gestures.length, mattes: sc.gestures.filter(g => g.matte || g.inset).length, fams: [...new Set(sc.gestures.map(x => x.pattern.family))], ids: sc.gestures.map(x => x.pattern.id).join(' ') }; })()`);
    log('film', JSON.stringify(info));
    await page.eval(() => {
      const W = 160, H = 90, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
      // How big is the largest flat area: the radius of the largest circle that fits inside one colour, as a share of the picture's height
      const flat = d => {
        const v = new Float32Array(W * H); let best = 0;
        const px = i => { const r = d[i * 4], g2 = d[i * 4 + 1], b = d[i * 4 + 2]; return (r >> 4) << 8 | (g2 >> 4) << 4 | (b >> 4); };
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = y * W + x, p = px(i);
          if (x === 0 || y === 0 || x === W - 1 || y === H - 1) { v[i] = 1; continue; }
          let m = 1e6;
          if (px(i - 1) === p) m = Math.min(m, v[i - 1] + 1); else m = 1;
          if (px(i - W) === p) m = Math.min(m, v[i - W] + 1); else m = 1;
          if (px(i - W - 1) === p) m = Math.min(m, v[i - W - 1] + 1.41); else m = 1;
          if (px(i - W + 1) === p) m = Math.min(m, v[i - W + 1] + 1.41); else m = 1;
          v[i] = m;
        }
        for (let y = H - 2; y > 0; y--) for (let x = W - 2; x > 0; x--) {
          const i = y * W + x, p = px(i); let m = v[i];
          if (px(i + 1) === p) m = Math.min(m, v[i + 1] + 1); else m = 1;
          if (px(i + W) === p) m = Math.min(m, v[i + W] + 1); else m = 1;
          if (px(i + W + 1) === p) m = Math.min(m, v[i + W + 1] + 1.41); else m = 1;
          if (px(i + W - 1) === p) m = Math.min(m, v[i + W - 1] + 1.41); else m = 1;
          v[i] = m; if (m > best) best = m;
        }
        return best / H;
      };
      window.__watchFilm = async (dur, fps) => {
        const out = [];
        const cols = 16, tw = 180, th = 101, n = Math.ceil(dur * fps), every = Math.max(1, Math.ceil(n / (cols * 12)));
        const sheet = document.createElement('canvas'); sheet.width = cols * tw; sheet.height = Math.ceil(n / every / cols) * th;
        const sg = sheet.getContext('2d'); sg.font = '11px monospace';
        let prev = null;
        for (let i = 0; i < n; i++) {
          const t = i / fps;
          trippee.seek(t);
          g.drawImage(app.canvas, 0, 0, W, H);
          const d = g.getImageData(0, 0, W, H).data;
          let L = 0, chroma = 0, diff = 0;
          for (let k = 0; k < d.length; k += 4) { const r = d[k], gg = d[k + 1], b = d[k + 2]; L += 0.2126 * r + 0.7152 * gg + 0.0722 * b; if (Math.max(r, gg, b) - Math.min(r, gg, b) > 40) chroma++; if (prev) diff += Math.abs(r - prev[k]) + Math.abs(gg - prev[k + 1]) + Math.abs(b - prev[k + 2]); }
          prev = d;
          const f = app.lastFrame;
          out.push({ t, L: L / (W * H * 255), flat: flat(d), chroma: chroma / (W * H), diff: diff / (W * H * 765), kind: f.kind, id: f.G.pattern.id, theta: f.theta });
          if (i % every === 0) { const j = i / every, x = (j % cols) * tw, y = (j / cols | 0) * th; sg.drawImage(app.canvas, x, y, tw - 1, th - 1); sg.fillStyle = '#f22'; sg.fillText(t.toFixed(0), x + 3, y + 12); }
          if (i % 30 === 0) await new Promise(r => setTimeout(r, 0));
        }
        return { out, sheet: sheet.toDataURL('image/jpeg', 0.8) };
      };
      window.__grabAt = ts => { const tw = 320, th = 180, cols = 4, c2 = document.createElement('canvas'); c2.width = cols * tw; c2.height = Math.ceil(ts.length / cols) * th; const g2 = c2.getContext('2d'); g2.font = '12px monospace'; ts.forEach((t, i) => { trippee.seek(t); const x = (i % cols) * tw, y = (i / cols | 0) * th; g2.drawImage(app.canvas, x, y, tw - 1, th - 1); g2.fillStyle = '#f22'; g2.fillText(t.toFixed(1) + ' ' + (app.lastFrame.kind || '') + ' ' + app.lastFrame.G.pattern.id, x + 3, y + 13); }); return c2.toDataURL('image/jpeg', 0.85); };
    });
    const summary = async (label, r) => {
      const o = r.out, sorted = k => o.map(x => x[k]).sort((a, b) => a - b), q = (a, p) => +a[Math.min(a.length - 1, a.length * p | 0)].toFixed(3);
      const F = sorted('flat'), D = sorted('diff'), C = sorted('chroma');
      const solid = o.filter(x => x.L < 0.01 || x.L > 0.99 || x.flat > 0.9);
      const mostly = o.filter(x => x.L < 0.1 || x.L > 0.9);
      log(label, 'frames', o.length, 'solid frames', solid.length, JSON.stringify(solid.slice(0, 8).map(x => [+x.t.toFixed(1), +x.L.toFixed(2), x.kind, x.id])), 'mostly one colour (<10% or >90%)', mostly.length, JSON.stringify(mostly.slice(0, 8).map(x => [+x.t.toFixed(1), +x.L.toFixed(2), x.kind, x.id])));
      log(label, 'largest flat circle radius (share of height) median', q(F, .5), 'p95', q(F, .95), 'p99', q(F, .99), 'max', q(F, .9999));
      log(label, 'step change median', q(D, .5), 'p99', q(D, .99), 'max', q(D, .9999), 'coloured share median', q(C, .5), 'p95', q(C, .95), 'frames with colour', o.filter(x => x.chroma > .005).length);
      const worst = [...o].sort((a, b) => b.flat - a.flat).reduce((acc, x) => { if (acc.every(y => Math.abs(y.t - x.t) > 4)) acc.push(x); return acc; }, []).slice(0, 12);
      log(label, 'flattest', JSON.stringify(worst.map(x => [+x.t.toFixed(1), +x.flat.toFixed(2), x.kind, x.id])));
      const pops = [...o].sort((a, b) => b.diff - a.diff).slice(0, 5);
      log(label, 'biggest steps', JSON.stringify(pops.map(x => [+x.t.toFixed(1), +x.diff.toFixed(3), x.kind, x.id])));
      save(`film-${label}-worst.jpg`, await page.eval(`__grabAt(${JSON.stringify(worst.map(x => x.t))})`));
    };
    const fps = +(process.env.FILMFPS || 4), secs = Math.min(info.dur, +(process.env.SECS || 1e9));
    let r = await page.eval(`__watchFilm(${secs},${fps})`);
    save('film-bw.jpg', r.sheet); await summary('bw', r);
    await page.eval('app.beyond.on(); app.beyond.snap(null)');
    log('colour: the stop in this film at', await page.eval('app.beyond.stopAt(0)'));
    r = await page.eval(`__watchFilm(${secs},${fps})`);
    save('film-colour.jpg', r.sheet); await summary('colour', r);
    await page.eval('app.beyond.off(); app.beyond.snap()');
  }

  // ------------------------------------------------------------------------------------- frame rate, on the real rAF loop
  if (want('fps')) {
    log('canvas', await page.eval('[app.canvas.width,app.canvas.height,devicePixelRatio]'));
    await page.eval('app.governor.enabled=false;app.R.drawScale=1;app.beyond.on();app.beyond.snap(1)');
    await key('2'); await move(960, 700); await sleep(100);
    // Bring the hand up all the way without waiting: it's measured below at full height either way
    await sleep(3500);
    // Which is heaviest with all of it on? Draw, wait for the GPU, at several points of each pattern's move
    const costs = await page.eval(() => {
      const gl = app.R.gl, px = new Uint8Array(4), out = [];
      const measure = () => { gl.finish(); const t0 = performance.now(); trippee.step(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
      for (const p of app.patterns) {
        trippee.load(p.id); app.manual = true;
        let worst = 0, at = 0;
        for (const u of [.1, .5, .9]) { app.t = 26 * u; measure(); const c = Math.min(measure(), measure()); if (c > worst) { worst = c; at = u; } }
        out.push({ id: p.id, ms: +worst.toFixed(2), at });
      }
      return out.sort((a, b) => b.ms - a.ms);
    });
    log('heaviest, hand and colour on, ms per frame at full size', costs.slice(0, 8).map(c => `${c.id} ${c.ms}`).join('  '), '| median', costs[costs.length >> 1].ms);
    const A = process.env.A || costs[0].id, B = process.env.B || costs[1].id;
    const run = (secs, gov) => page.eval(async ({ secs, gov, A, B }) => {
      app.governor.history.length = 0;
      app.governor.enabled = gov; app.governor.resized(); app.governor.quietUntil = 0;
      trippee.morph(A, B, secs + 4, 1); trippee.run();
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      const ts = [], seconds = []; let next = performance.now() + 1000, n = 0, kinds = new Set();
      const t0 = performance.now();
      await new Promise(res => { const f = now => { ts.push(now); n++; kinds.add(app.lastFrame.kind); if (performance.now() >= next) { seconds.push([n, +app.R.drawScale.toFixed(2)]); n = 0; next += 1000; } if (performance.now() - t0 < secs * 1000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
      const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b);
      return { fps: +((ts.length - 1) / ((ts.at(-1) - ts[0]) / 1000)).toFixed(1), p50: +d[d.length >> 1].toFixed(1), p95: +d[d.length * .95 | 0].toFixed(1), p99: +d[d.length * .99 | 0].toFixed(1), max: +d.at(-1).toFixed(1), kinds: [...kinds], scale: app.R.drawScale, perSecond: seconds.map(s => s[0]).join(' '), scales: seconds.map(s => s[1]).join(' '), history: app.governor.history, handOn: app.edits.hand?.on, beyond: app.beyond.active };
    }, { secs, gov, A, B });
    log('morph', A, '->', B);
    log('governor OFF, full size', JSON.stringify(await run(+(process.env.SECS || 12), false)));
    log('governor ON', JSON.stringify(await run(+(process.env.SECS2 || 40), true)));
    log('sizes each program settled on (bits: 1 hand, 2 colour, 4 flight)', JSON.stringify(await page.eval('[...app.governor.states].map(([v,s])=>[v,s.tier,[1,.85,.7,.6,.5][s.tier]])')));
    await page.shot('fps-end');
    await key('2'); await page.eval('app.beyond.off();app.beyond.snap()');
    for (let i = 0; i < 100 && await page.eval('!!app.edits.hand'); i++) await sleep(200);
    await page.eval(`trippee.morph(${JSON.stringify(A)},${JSON.stringify(B)},16,1);trippee.run()`); await sleep(500);
    log('same morph, no hand, no colour, governor off', JSON.stringify(await page.eval(async () => { app.governor.enabled = false; app.R.drawScale = 1; const ts = []; const t0 = performance.now(); await new Promise(res => { const f = n => { ts.push(n); if (performance.now() - t0 < 5000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); return { fps: +((ts.length - 1) / ((ts.at(-1) - ts[0]) / 1000)).toFixed(1), scale: app.R.drawScale }; })));
  }

  // ------------------------------------------------------------------------------------- colour's rests, against everything that plans a change
  if (want('clock')) {
    const r = await page.eval(async () => {
      const out = {};
      const T = window.trippee, c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d', { willReadFrequently: true });
      const grab = () => { g.drawImage(app.canvas, 0, 0, 160, 90); return g.getImageData(0, 0, 160, 90).data; };
      const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i + 1] - b[i + 1]); return s / (a.length / 4) / 255; };
      app.manual = true; app.beyond.off(); app.beyond.snap();
      // Walk from a to b at 30 fps, watching the picture's clock. Returns the biggest forward or backward step of it, and the biggest change in the picture.
      const walk = (a, b, fn) => { let maxStep = 0, back = 0, prevP = app.pictureT(a), prevPx = null, big = 0, at = 0; for (let t = a; t < b; t += 1 / 30) { T.seek(t); fn?.(t); const P = app.pictureT(t), d = P - prevP; if (d < -1e-6) back++; if (d > maxStep) maxStep = d; prevP = P; const px = grab(); if (prevPx) { const x = diff(px, prevPx); if (x > big) { big = x; at = t; } } prevPx = px; } return { maxClockStep: +maxStep.toFixed(3), backwards: back, biggestPictureChange: +big.toFixed(3), at: +at.toFixed(2) }; };
      const fresh = () => { const s = app.stage; s.setStatic(false, 0); s.staticOn = false; s.staticG = null; s.score.handover = null; s.score.gestures.length = 0; s.hold = false; s._extend(0); };
      // the reference
      fresh(); T.seek(155); out.reference = walk(155, 157);
      // on in the middle of a stop's window: no sudden lag
      fresh(); T.seek(155); const before = app.pictureT(155);
      app.beyond.on(); out.onInWindow = { lag: 155 - app.pictureT(155), walk: walk(155, 157) };
      // on well before: the stop runs
      app.beyond.off(); app.beyond.snap(); fresh(); T.seek(100); app.beyond.on(); app.beyond.snap(null);
      out.throughStop = walk(100, 153); out.lagIn = +(153 - app.pictureT(153)).toFixed(2);
      // off in the middle of it: no jump as it lets go, however long it takes
      app.beyond.off();
      out.offInStop = walk(153, 195, t => {}); out.attachedAfter = !!app.edits.beyond; out.lagAfter = +(195 - app.pictureT(195)).toFixed(3);
      // a pick during a rest: it does arrive, with no jump
      app.beyond.off(); app.beyond.snap(); fresh(); T.seek(100); app.beyond.on(); app.beyond.snap(null);
      walk(100, 150);
      app.hand.go('checks.vega', { dur: 6 });
      out.pickInStop = walk(150, 175); out.arrived = app.lastFrame.G.pattern.id;
      // static asked for during a rest, in a morph on the picture's clock
      app.beyond.off(); app.beyond.snap(); fresh(); T.seek(100); app.beyond.on(); app.beyond.snap(null);
      const sc = app.stage.score.gestures, G = sc.find(x => x.t1 > 155); G.morph = 10; delete G.plan;
      walk(100, Math.max(101, G.t1 - 3));
      app.hand.setStatic(true);
      out.staticInMorph = walk(G.t1 - 3, G.t1 + 12); out.staticPattern = app.lastFrame.G.pattern.id; out.nextWas = sc[sc.indexOf(G) + 1]?.pattern.id; out.held = !!app.stage.staticG;
      app.hand.setStatic(false); app.beyond.off(); app.beyond.snap();
      return out;
    });
    for (const k in r) log(k, JSON.stringify(r[k]));
    await page.eval('trippee.run()');
  }

  // ------------------------------------------------------------------------------------- recordings: does the sound line up, and does the whole thing play
  if (want('rec')) {
    await page.eval(() => { app.ui.recorder.autosave = false; window.__file = async () => { const r = app.ui.recorder; const frames = r.frames, secs = r.seconds(); const blob = await r.stop(); const out = { recorded: +secs.toFixed(2), frames, size: blob.size, type: blob.type }; const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(blob); await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error('no video')); }); let d = v.duration; if (!isFinite(d)) { v.currentTime = 1e7; await new Promise(ok => { v.ondurationchange = () => { if (isFinite(v.duration)) ok(); }; setTimeout(ok, 3000); }); d = v.duration; } out.video = +d.toFixed(2); v.currentTime = Math.max(0, d - 0.2); await new Promise(ok => { v.onseeked = ok; setTimeout(ok, 2000); }); const ctx = new OfflineAudioContext(1, 44100, 44100); try { const buf = await ctx.decodeAudioData(await blob.arrayBuffer()); const c = buf.getChannelData(0), n = Math.floor(buf.sampleRate); out.audio = +buf.duration.toFixed(2); out.level = []; for (let i = 0; i + n <= c.length; i += n) { let s = 0; for (let k = i; k < i + n; k++) s += c[k] * c[k]; out.level.push(Math.round(10 * Math.log10(s / n + 1e-12))); } } catch (e) { out.audio = String(e); } return out; }; });
    await key('r'); await sleep(5000); log('no sound at all', JSON.stringify(await page.eval('__file()')));
    await key('r'); await sleep(2000); await key('g'); await sleep(5000); log('record, 2 s, then music', JSON.stringify(await page.eval('__file()'))); await key('g'); await sleep(500);
    await key('g'); await sleep(1500); await key('r'); await sleep(5000); log('music, then record', JSON.stringify(await page.eval('__file()'))); await key('g'); await sleep(5500);
    await key('r'); await sleep(4000); log('after the music has gone quiet', JSON.stringify(await page.eval('__file()')));
    await page.eval(`document.querySelector('#rec').hidden=true`);
    // the panel, open with a real song, for looking at
    const data = { items: [], files: [process.cwd() + '/media/ppp.mp3'], dragOperationsMask: 1 };
    await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 640, y: 360, data });
    await page.send('Input.dispatchDragEvent', { type: 'drop', x: 640, y: 360, data });
    for (let i = 0; i < 600; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await sleep(100); }
    await sleep(1500);
    await move(640, 300); await sleep(150);
    await page.shot('panel-open');
    log('over the panel buttons', JSON.stringify(await page.eval(`['pick','play','take','mine','eject','close'].map(n=>{const b=document.querySelector('#song [data-'+n+']');const r=b.getBoundingClientRect();const e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return [n,b.hidden,Math.round(r.left),Math.round(r.top),e===b?'ok':(e?.id||e?.closest?.('[id]')?.id||e?.tagName)]})`)));
    log('boxes', JSON.stringify(await page.eval(`['song','fx','bar','note'].map(n=>{const b=document.getElementById(n);const r=b.getBoundingClientRect();return [n,b.hidden,Math.round(r.left),Math.round(r.top),Math.round(r.right),Math.round(r.bottom)]})`)));
    // click eject for real
    const e = await page.eval(`(()=>{const r=document.querySelector('#song [data-eject]').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
    await move(e[0], e[1]); await sleep(100); log('hit', await page.eval(`(()=>{const e=document.elementFromPoint(${e[0]},${e[1]});return e?.outerHTML?.slice(0,60)})()`));
    await down(e[0], e[1]); await up(e[0], e[1]); await sleep(500);
    log('ejected', JSON.stringify(await page.eval(`({song:!!app.song.analysis,state:app.ui.song.state,clock:!!app.clock,scoreSong:!!app.stage.score.song})`)));
  }
  log('errors', errors().length, errors().slice(0, 5));
};
