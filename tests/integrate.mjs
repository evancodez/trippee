// The whole thing, end to end, with real input through CDP and a real song.
//   node tools/lab.mjs tests/integrate.mjs --out lab-out/integrate
// STAGE picks parts: boot, song, record (default: boot,song,record). Tools are in tests/hand.mjs, frame rates in tests/fps.mjs.
import { resolve } from 'node:path';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export default async ({ page, log, save, out }) => {
  const stage = (process.env.STAGE || 'boot,song,record').split(',');
  const SONG = process.env.SONG || 'media/ppp.mp3';
  const mouse = (type, x, y, o = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, button: o.button ?? 'none', buttons: o.buttons ?? 0, clickCount: o.clickCount ?? 0, modifiers: o.modifiers ?? 0, pointerType: 'mouse' });
  const click = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1 }); await mouse('mouseReleased', x, y, { button: 'left', clickCount: 1 }); };
  const clickEl = async sel => { const b = await page.eval(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2}})()`); await click(b.x, b.y); };
  const errs = () => page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  await page.eval(() => {
    const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d', { willReadFrequently: true });
    window.__grab = () => new Promise(res => { const f = () => { app.onFrame.splice(app.onFrame.indexOf(f), 1); g.drawImage(app.canvas, 0, 0, 160, 90); res(Array.from(g.getImageData(0, 0, 160, 90).data.filter((_, i) => i % 4 === 0))); }; app.onFrame.push(f); });
    window.__diff2 = async ms => { const a = await __grab(); await new Promise(r => setTimeout(r, ms)); const b = await __grab(); let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return +(s / a.length / 255).toFixed(3); };
    window.__white = async () => { const d = await __grab(); return +(d.reduce((a, b) => a + b, 0) / d.length / 255).toFixed(3); };
    window.__fps = ms => new Promise(res => { const t0 = performance.now(); let n = 0; const f = () => { n++; const e = performance.now() - t0; if (e < ms) requestAnimationFrame(f); else res(+(n / e * 1000).toFixed(1)); }; requestAnimationFrame(f); });
  });

  if (stage.includes('boot')) {
    log('--- boot');
    log('version', await page.eval('app.VERSION'), 'errors so far', errs());
    log('canvas', await page.eval('[app.canvas.width,app.canvas.height]'), 'fps', await page.eval('__fps(2000)'));
    log('families', await page.eval('app.families.join(" ")'), 'patterns', await page.eval('app.patterns.length'));
    const lib = await page.eval(() => { const r = {}; for (const p of app.patterns) r[p.family] = (r[p.family] || 0) + 1; return r; });
    log('per family', lib);
    log('library tiles', await page.eval('document.querySelectorAll("#library .tile").length'), 'headings', await page.eval('[...document.querySelectorAll("#library h3")].map(h=>h.textContent).join(" ")'));
    // the wander's plan: run the same code that grows it, and read the families in order
    const seq = await page.eval(() => {
      const S = app.stage, keep = S.score.gestures.length;
      S._extend(app.t + 900);
      const list = S.score.gestures.map(g => g.pattern.family);
      const runs = []; for (const f of list) { if (runs.at(-1)?.[0] === f) runs.at(-1)[1]++; else runs.push([f, 1]); }
      return { gestures: list.length, keep, runs, lens: S.score.gestures.slice(0, 8).map(g => +(g.t1 - g.t0).toFixed(1)) };
    });
    log('wander plan', JSON.stringify(seq));
  }

  if (stage.includes('boot')) {
    // A real page load, untouched, with the loop running
    await page.goto((process.env.LAB_URL || 'http://localhost:5300/'));
    for (let i = 0; i < 80; i++) { if (await page.eval('window.trippee?.ready===true')) break; await sleep(250); }
    await page.eval(() => {
      const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d', { willReadFrequently: true });
      window.__grab = () => new Promise(res => { const f = () => { app.onFrame.splice(app.onFrame.indexOf(f), 1); g.drawImage(app.canvas, 0, 0, 160, 90); res(Array.from(g.getImageData(0, 0, 160, 90).data.filter((_, i) => i % 4 === 0))); }; app.onFrame.push(f); });
      window.__diff2 = async ms => { const a = await __grab(); await new Promise(r => setTimeout(r, ms)); const b = await __grab(); let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return +(s / a.length / 255).toFixed(3); };
      window.__white = async () => { const d = await __grab(); return +(d.reduce((a, b) => a + b, 0) / d.length / 255).toFixed(3); };
      window.__fps = ms => new Promise(res => { const t0 = performance.now(); let n = 0; const f = () => { n++; const e = performance.now() - t0; if (e < ms) requestAnimationFrame(f); else res(+(n / e * 1000).toFixed(1)); }; requestAnimationFrame(f); });
    });
    await sleep(5000);
    await page.shot('boot-5s');
    log('moving? mean change over 1 s at t=', await page.eval('app.t'), await page.eval('__diff2(1000)'), 'fps', await page.eval('__fps(1500)'));
    // Watch the wander pass from family to family in the running page, by jumping the clock on a little
    const fams = [];
    for (let i = 0; i < 12; i++) {
      const r = await page.eval(() => { const g = app.stage.score.gestures, cur = app.stage.current(app.t); const next = g[g.indexOf(cur) + 1]; if (next) app.t = next.t0 + 12; return app.lastFrame.G.pattern.id; });
      await sleep(400);
      fams.push(await page.eval('app.lastFrame.G.pattern.id'));
      if (i % 3 === 0) await page.shot(`boot-wander-${i}`);
    }
    log('wander, as the page plays it', fams.join(' '));
    log('errors', errs());
  }

  if (stage.includes('song')) {
    log('--- song');
    // Into the canvas with a real drag of a real file, as Finder would.
    const file = resolve(SONG);
    const data = { items: [], files: [file], dragOperationsMask: 1 };
    await mouse('mouseMoved', 640, 360);
    await page.eval(() => { window.__tr = []; window.__on = () => __tr.push([+(performance.now()).toFixed(0), +app.t.toFixed(3), +app.lastFrame.theta.toFixed(3), app.lastFrame.G.pattern.id]); app.onFrame.push(__on); window.__t0 = performance.now(); });
    const d1 = await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 640, y: 360, data });
    await page.send('Input.dispatchDragEvent', { type: 'dragOver', x: 640, y: 360, data });
    await sleep(120);
    await page.shot('song-0-dragover');
    log('dropmark shown', await page.eval('!document.querySelector("#drop").hidden'), d1.error?.message || '');
    await page.send('Input.dispatchDragEvent', { type: 'drop', x: 640, y: 360, data });
    await sleep(300);
    const prog = [];
    let shot = false;
    for (let i = 0; i < 240; i++) {
      const s = await page.eval(() => ({ state: app.ui.song.state, name: document.querySelector('#song [data-name]').textContent, bar: document.querySelector('#song [data-progress] i').style.width }));
      if (prog.at(-1) !== s.name) prog.push(s.name);
      if (!shot && /listening\s+[1-9]/.test(s.name)) { await page.shot('song-1-listening'); shot = true; }
      if (s.state === 'ready') break;
      await sleep(100);
    }
    log('listening shown', prog.slice(0, 10).join(' | '), '...', prog.at(-1), 'took', await page.eval('(performance.now()-__t0)/1000'));
    await sleep(1500);
    const st = () => page.eval(() => ({ playing: app.song.playing, ctx: app.song.contextState?.(), d: +app.song.duration.toFixed(1), t: +app.t.toFixed(2), heard: +app.song.time().toFixed(2), pat: app.lastFrame.G.pattern.id, theta: +app.lastFrame.theta.toFixed(2), gestures: app.song.score?.gestures?.length, family: app.song.score?.family, secs: app.song.analysis?.segments?.length, name: document.querySelector('#song [data-name]').textContent, ui: document.querySelector('#song [data-time]').textContent }));
    log('playing', await st());
    log('fps', await page.eval('__fps(2000)'));
    await sleep(3000);
    await page.shot('song-2-playing');
    log('errors', errs());
    // Does it stay on the clock, and does the picture follow?
    const a = await st(); await sleep(2000); const b = await st();
    log('2 s later, film moved', +(b.t - a.t).toFixed(2), 'heard moved', +(b.heard - a.heard).toFixed(2), 'lead ms', +((b.t - b.heard) * 1000).toFixed(1));
    log('picture changes over 1 s', await page.eval('__diff2(1000)'));
    // Is real sound flowing? A tap on the output.
    log('audio level', await page.eval(async () => { const s = app.song.audioStream?.(); if (!s) return 'no audioStream'; const c = new AudioContext(); const n = c.createMediaStreamSource(s), an = c.createAnalyser(); an.fftSize = 2048; n.connect(an); const v = new Float32Array(2048); let pk = 0; for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 40)); an.getFloatTimeDomainData(v); for (const x of v) pk = Math.max(pk, Math.abs(x)); } n.disconnect(); c.close(); return +pk.toFixed(3); }));
    // Seek through the strip with the mouse
    await mouse('mouseMoved', 640, 700);
    const strip = await page.eval(() => { const b = document.querySelector('#song .strip').getBoundingClientRect(); return { x: b.left, y: b.top + b.height / 2, w: b.width, secs: document.querySelectorAll('#song .sec').length, marks: document.querySelectorAll('#song .mark').length }; });
    log('strip', strip);
    await page.shot('song-3-strip');
    const beforeSeek = await st();
    await click(strip.x + strip.w * 0.5, strip.y);
    await sleep(3000);
    const afterSeek = await st();
    log('seek to half: t', beforeSeek.t, '->', afterSeek.t, 'of', afterSeek.d, 'heard', afterSeek.heard, 'playing', afterSeek.playing);
    await page.shot('song-4-seeked');
    // Another take: seed changes, music doesn't stop, the old film bends into the new
    const seed0 = await page.eval('app.song.score.seed');
    const h0 = await page.eval('app.song.time()');
    await page.eval(() => { __tr.length = 0; });
    await clickEl('#song [data-take]');
    await sleep(5000);
    const take = await page.eval(() => { const tr = __tr; let maxTh = 0, minTh = 0, jump = 0; for (let i = 1; i < tr.length; i++) { maxTh = Math.max(maxTh, tr[i][2]); minTh = Math.min(minTh, tr[i][2]); jump = Math.max(jump, Math.abs(tr[i][1] - tr[i - 1][1])); } return { frames: tr.length, maxTh, minTh, largestTimeStep: jump, first: tr[0]?.[3], last: tr.at(-1)?.[3] }; });
    log('another take: seed', seed0, '->', await page.eval('app.song.score.seed'), 'heard ran', h0, '->', await page.eval('app.song.time()'), JSON.stringify(take));
    await page.shot('song-5-take');
    // Use the pattern on screen. The hand first picks a pattern from outside the film's family.
    const fam = await page.eval('app.song.score.family');
    await page.eval(() => { __tr.length = 0; });
    await clickEl('#song [data-mine]');
    await sleep(6000);
    const pool = await page.eval('({family:app.song.score.family,pool:app.song.score.pool?.slice(0,4),now:app.lastFrame.G.pattern.id,mine:app.ui.song.useMine,playing:app.song.playing})');
    log('use the pattern on screen: family was', fam, 'now', pool);
    await page.shot('song-6-mine');
    await clickEl('#song [data-mine]');
    await sleep(3000);
    log('and off again', await page.eval('({family:app.song.score.family,pool:app.song.score.pool?.slice(0,4),mine:app.ui.song.useMine})'));
    log('errors', errs());
    // Pause and resume by key
    const key = async k => { const code = k === ' ' ? 'Space' : 'Key' + k.toUpperCase(); await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) }); await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) }); };
    await key(' '); await sleep(500); const p0 = await st(); await sleep(500); const p1 = await st();
    log('space pauses', p0.playing, 'time held', p0.t === p1.t);
    await key(' '); await sleep(500); log('space resumes', (await st()).playing);
  }

  if (stage.includes('record')) {
    log('--- record');
    if (!(await page.eval('!!app.song?.duration'))) {
      const file = resolve(SONG);
      await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 640, y: 360, data: { items: [], files: [file], dragOperationsMask: 1 } });
      await page.send('Input.dispatchDragEvent', { type: 'drop', x: 640, y: 360, data: { items: [], files: [file], dragOperationsMask: 1 } });
      for (let i = 0; i < 240; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await sleep(100); }
      await page.eval(() => app.song.seek(30));
      await sleep(2000);
    }
    const SECS = +(process.env.SECS || 24);
    const info = await page.eval(() => { const r = app.ui.recorder; r.autosave = false; window.__rt = []; const f = () => __rt.push(performance.now()); app.onFrame.push(f); window.__rtf = f; return null; });
    // the real key
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'r', code: 'KeyR', text: 'r', windowsVirtualKeyCode: 82 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'r', code: 'KeyR', windowsVirtualKeyCode: 82 });
    await sleep(300);
    log('recording', await page.eval('({on:app.ui.recorder.on,mime:app.ui.recorder.mime,audio:app.ui.recorder.hasAudio,canvas:[app.canvas.width,app.canvas.height]})'), 'rec box', await page.eval('!document.querySelector("#rec").hidden'));
    await page.shot('record-0');
    const cw = [];
    for (let i = 0; i < SECS; i++) { await sleep(1000); cw.push(await page.eval('app.canvas.width+"x"+app.canvas.height')); }
    log('canvas size all through', [...new Set(cw)]);
    const fpsDuring = await page.eval(() => { const t = __rt; const dts = []; for (let i = 1; i < t.length; i++) dts.push(t[i] - t[i - 1]); dts.sort((a, b) => a - b); return { frames: t.length, fps: +((t.length - 1) / ((t.at(-1) - t[0]) / 1000)).toFixed(1), p50: +dts[dts.length >> 1].toFixed(1), p99: +dts[dts.length * .99 | 0].toFixed(1), max: +dts.at(-1).toFixed(1) }; });
    log('frame rate while recording', fpsDuring);
    const res = await page.eval(async () => {
      const r = app.ui.recorder, frames = r.frames, secs = r.seconds();
      app.onFrame.splice(app.onFrame.indexOf(__rtf), 1);
      const blob = await r.stop();
      window.__lastBlob = blob;
      const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.src = URL.createObjectURL(blob);
      await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error('video would not load: ' + v.error?.message)); });
      let dur = v.duration;
      if (!isFinite(dur)) { v.currentTime = 1e7; await new Promise(ok => { v.ondurationchange = () => { if (isFinite(v.duration)) ok(); }; setTimeout(ok, 3000); }); dur = v.duration; }
      const c = document.createElement('canvas'), w = c.width = v.videoWidth, h = c.height = v.videoHeight, g = c.getContext('2d', { willReadFrequently: true });
      const points = [0.05, 0.25, 0.5, 0.75, 0.9, 0.99].map(f => f * dur).concat([Math.max(0, dur - 0.1)]);
      const seen = [], images = [];
      for (const at of points) {
        v.currentTime = at;
        await new Promise((ok, no) => { const tm = setTimeout(() => no(new Error('seek to ' + at + ' never landed')), 8000); v.onseeked = () => { clearTimeout(tm); ok(); }; });
        await new Promise(requestAnimationFrame);
        g.drawImage(v, 0, 0, w, h);
        const d = g.getImageData(0, 0, w, h).data; let lum = 0, n = 0; for (let i = 0; i < d.length; i += 400) { lum += d[i]; n++; }
        seen.push({ at: +at.toFixed(2), got: +v.currentTime.toFixed(2), lum: +(lum / n / 255).toFixed(3) });
        images.push(c.toDataURL('image/jpeg', 0.7));
      }
      // the sound, decoded
      let audio;
      try {
        const buf = await new OfflineAudioContext(2, 44100, 44100).decodeAudioData(await blob.arrayBuffer());
        const d = buf.getChannelData(0), sr = buf.sampleRate, win = Math.floor(sr * 2), levels = [];
        for (let s = 0; s + win <= d.length; s += win) { let pk = 0; for (let i = s; i < s + win; i += 16) pk = Math.max(pk, Math.abs(d[i])); levels.push(+pk.toFixed(2)); }
        audio = { dur: +buf.duration.toFixed(2), channels: buf.numberOfChannels, levelPer2s: levels };
      } catch (e) { audio = 'no audio decoded: ' + e.message; }
      // and playing through to the very end
      v.currentTime = 0; await new Promise(ok => { v.onseeked = ok; });
      v.playbackRate = 8; await v.play();
      const played = await new Promise(ok => { v.onended = () => ok(v.currentTime); setTimeout(() => ok(v.currentTime), 9000); });
      return { size: blob.size, type: blob.type, dur, w, h, frames, secs, seen, audio, played, images };
    });
    res.images.forEach((im, i) => save(`record-at-${i}.jpg`, im));
    delete res.images;
    log('clip', JSON.stringify(res));
    await page.eval(async () => { const b = window.__lastBlob; const r = new FileReader(); await new Promise(ok => { r.onload = ok; r.readAsDataURL(b); }); window.__lastData = r.result; });
    const n = await page.eval('window.__lastData.length');
    const CHUNK = 8e6; let b64 = '';
    for (let i = 0; i < n; i += CHUNK) b64 += await page.eval(`window.__lastData.slice(${i},${i + CHUNK})`);
    const ext = res.type.includes('mp4') ? 'mp4' : 'webm';
    save('clip.' + ext, Buffer.from(b64.split(',')[1], 'base64'));
    log('clip saved', ext);
  }

  log('errors at the end', errs());
};
