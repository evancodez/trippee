// The compare: d, D, = and - in a real page, with real keys through CDP and the song really playing (muted by the lab). Every row prints PASS or FAIL with its numbers. See docs/DIRECTION.md section 7.
//   SONG=media/mgmt.mp3 node tools/lab.mjs tests/compare.mjs --size 1280,720 --out lab-out/a3/compare           a song with a cut: the keys, the clock, pops, recording, the panel
//   SONG=media/ppp.mp3 ...                                                                                      the other cut
//   NOCUT=media/wildflower.mp3 node tools/lab.mjs tests/compare.mjs --out lab-out/a3/nocut                      a song with no cut: no button, no key, nothing touched
//   SONG=media/mgmt.mp3 BLIND=1 node tools/lab.mjs tests/compare.mjs --url 'http://localhost:5300/?blind=1' --out lab-out/a3/blind      A and B, a stored coin, ? reveals
//   ARRIVE=media/mgmt.mp3,media/ppp.mp3 node tools/lab.mjs tests/compare.mjs --out lab-out/a3/arrive            the arrival flight out of many wander pictures: how long it took, and whether it flashes
import { resolve, basename } from 'node:path';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KEYS = { '=': ['Equal', 187], '-': ['Minus', 189], '?': ['Slash', 191], ' ': ['Space', 32] };

export default async ({ page, log, save }) => {
  let fails = 0;
  const row = (ok, name, ...rest) => { if (!ok) fails++; log(`${ok ? 'PASS' : 'FAIL'} ${name}`, ...rest); };
  // A real key, the way a keyboard sends it.
  const key = async k => {
    const shift = k === 'D' || k === '?', [code, vk] = KEYS[k] ?? ['Key' + k.toUpperCase(), k.toUpperCase().charCodeAt(0)];
    const o = { key: k, code, windowsVirtualKeyCode: vk, modifiers: shift ? 8 : 0 };
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...o, text: k });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...o });
  };
  const drop = async path => {
    const data = { items: [], files: [resolve(path)], dragOperationsMask: 1 };
    await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 320, y: 180, data });
    await page.send('Input.dispatchDragEvent', { type: 'drop', x: 320, y: 180, data });
    for (let i = 0; i < 3000; i++) { if (await page.eval('app.ui.song.state==="ready"')) return true; await sleep(100); }
    return false;
  };
  const errors = () => page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  const until = async (expr, ms = 120000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.eval(expr)) return (Date.now() - t0) / 1000; await sleep(100); } return null; };
  await page.eval(() => {
    try { document.querySelector('#hints [data-ok]').click(); } catch {}
    app.ui.recorder.autosave = false;
    // Every frame on screen, as it happens: the clock, what's showing, and a small copy of the picture.
    const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d', { willReadFrequently: true });
    let prev = null;
    window.__log = null;
    app.onFrame.push(() => {
      const L = window.__log;
      if (!L) return;
      g.drawImage(app.canvas, 0, 0, 160, 90);
      const d = g.getImageData(0, 0, 160, 90).data; let s = 0, m = 0;
      const tiles = new Float32Array(16);
      for (let i = 0, y = 0; y < 90; y++) for (let x = 0; x < 160; x++, i += 4) { const v = d[i + 1]; m += v; tiles[(y * 4 / 90 | 0) * 4 + (x * 4 / 160 | 0)] += v; if (prev) s += Math.abs(v - prev[i + 1]); }
      prev = d;
      const f = app.lastFrame, S = app.song;
      L.push({ now: performance.now(), t: app.t, heard: S.time(), film: S.compare?.film ?? null, kind: f.kind ?? '', x: +(f.x || 0).toFixed(3), id: f.G?.pattern?.id, step: s / (160 * 90), mean: m / (160 * 90), tiles: [...tiles].map(v => v / (40 * 22.5)) });
      if (L.sheet && L.length % L.sheet.every === 0 && L.sheet.left-- > 0) L.sheet.grab();
    });
    // A sheet of the picture as it goes by.
    window.__sheet = (n, every, cols = 8) => {
      const tw = 240, th = 135, can = document.createElement('canvas'); can.width = tw * cols; can.height = th * Math.ceil(n / cols);
      const x = can.getContext('2d'); x.font = '12px monospace'; let k = 0;
      window.__log.sheet = { every, left: n, grab() { const X = (k % cols) * tw, Y = (k / cols | 0) * th; x.drawImage(app.canvas, X, Y, tw - 1, th - 1); const lab = `${app.t.toFixed(2)} ${app.lastFrame.kind ?? ''} ${(app.lastFrame.x || 0).toFixed(2)}`; x.fillStyle = '#000'; x.fillRect(X, Y, x.measureText(lab).width + 4, 14); x.fillStyle = '#f33'; x.fillText(lab, X + 2, Y + 11); k++; } };
      return () => can.toDataURL('image/jpeg', 0.85);
    };
    window.__print = sc => sc.gestures.map(G => `${G.t0.toFixed(2)} ${G.t1.toFixed(2)} ${G.pattern.id} ${(G.morph || 0).toFixed(2)} ${G.xform?.id ?? ''}`).join('|');
  });

  // ---------------------------------------------------------------- the arrival: out of wander pictures that flash at 7 s, scanned the way tests/flash.mjs does, at 60 frames a second
  if (process.env.ARRIVE) {
    const from = (process.env.FROM || 'riley.blaze,rooms.chevron,pole.rosette,still.chevrons').split(',');
    await page.eval(() => { const c = document.createElement('canvas'); c.width = 320; c.height = 180; const x = c.getContext('2d', { willReadFrequently: true });
      window.__tiles = () => { x.drawImage(window.trippee.canvas, 0, 0, 320, 180); const d = x.getImageData(0, 0, 320, 180).data, W = 320, H = 180; let sum = 0; const L = new Uint8Array(W * H); for (let k = 0; k < L.length; k++) { const v = (d[k * 4] * 0.2126 + d[k * 4 + 1] * 0.7152 + d[k * 4 + 2] * 0.0722) | 0; L[k] = v; sum += v; } const tiles = []; for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) { let t = 0, n = 0; for (let y = (ty * H / 4) | 0; y < ((ty + 1) * H / 4 | 0); y++) for (let X = (tx * W / 4) | 0; X < ((tx + 1) * W / 4 | 0); X++) { t += L[y * W + X]; n++; } tiles.push(t / n); } return { mean: sum / L.length, tiles }; }; });
    const swings = series => { const out = []; let dir = 0, pivot = series[0]; series.forEach((v, i) => { if (dir >= 0 && v > pivot) { pivot = v; dir = 1; } if (dir <= 0 && v < pivot) { pivot = v; dir = -1; } if (dir === 1 && pivot - v >= 25.5) { out.push(i); dir = -1; pivot = v; } else if (dir === -1 && v - pivot >= 25.5) { out.push(i); dir = 1; pivot = v; } }); return out; };
    const worst = (series, fps) => { const sw = swings(series); let w = 0; for (let i = 0; i < sw.length; i++) { let j = i; while (j < sw.length && sw[j] - sw[i] < fps) j++; w = Math.max(w, (j - i) >> 1); } return w; };
    for (const path of process.env.ARRIVE.split(',')) for (const id of from) {
      // On that pattern, not holding it, or the song would take it for its own.
      await page.eval(id => { app.manual = false; trippee.run(); trippee.load(id); app.stage.hold = false; if (app.ui.song.useMine) app.ui.song.toggleMine(); }, id);
      await sleep(500);
      if (!await drop(path)) { row(false, 'loads', path, id); continue; }
      const r = await page.eval(async () => {
        const T = window.trippee, S = app.song, arrival = S.arrival; S.pause(); app.ui.song.show(false); app.manual = true; app.governor.enabled = false; app.R.drawScale = 1;
        const FPS = 60, o = { mean: [], tiles: [], kinds: [], arrival, first: S.score.gestures[0].pattern.id };
        const N = Math.ceil((arrival + 1) * FPS);
        for (let i = 0; i < N; i++) { T.seek(i / FPS); const v = window.__tiles(); o.mean.push(v.mean); o.tiles.push(v.tiles); o.kinds.push(i < arrival * FPS ? app.lastFrame.kind ?? '' : ''); if (i % 40 === 0) await new Promise(r => setTimeout(r)); }
        return o;
      });
      const whole = worst(r.mean, 60); let tile = 0; for (let k = 0; k < 16; k++) tile = Math.max(tile, worst(r.tiles.map(a => a[k]), 60));
      row(whole === 0 && tile <= 2, `${basename(path)} from ${id} into ${r.first}: flight ${r.arrival} s, ${[...new Set(r.kinds)].filter(Boolean).join()}`, 'whole', whole, 'tile', tile);
      await page.eval(() => { app.manual = false; trippee.run(); app.governor.enabled = true; app.ui.song.show(true); document.querySelector('[data-eject]').click(); });
      await until(`app.ui.song.state === 'empty'`, 15000);
      await sleep(800);
    }
    log(fails ? `FAILS ${fails}` : 'ALL PASS');
    return;
  }

  // ---------------------------------------------------------------- a song with no cut
  if (process.env.NOCUT) {
    row(await drop(process.env.NOCUT), 'loads');
    const hash = await page.eval('app.song.hash');
    await sleep(1500);
    const before = await page.eval(() => ({ print: __print(app.song.score), score: app.stage.score === app.song.score, handover: !!app.stage.score.handover }));
    await page.eval(() => { app.ui.song.show(true); });
    await sleep(300);
    row(await page.eval('app.song.compare === null && !app.song.compareComing'), 'nothing to compare');
    row(await page.eval(`document.querySelector('[data-film]').hidden`), 'no button');
    row(await page.eval(`[...document.querySelectorAll('[data-compare]')].every(n => getComputedStyle(n).display === 'none')`), 'no keys in the help');
    await page.eval(`document.querySelector('#note').hidden = true`);
    const sc0 = await page.eval(`(window.__sc = app.stage.score, app.stage.score.gestures.length)`);
    for (const k of ['d', 'D', '=', '-']) { await key(k); await sleep(250); }
    await sleep(2000);
    const after = await page.eval(() => ({ same: window.__sc === app.stage.score, print: __print(app.stage.score), note: !document.querySelector('#note').hidden, keys: Object.keys(localStorage).filter(k => k.startsWith('trippee.compare')), arrival: app.song.arrival }));
    row(after.same, 'the keys leave the film alone');
    row(after.print === before.print, 'its gestures are what they were');
    row(!after.note, 'nothing said');
    row(after.keys.length === 0, 'nothing written', after.keys);
    log('film', hash, 'arrived in', after.arrival, 's, gestures', sc0);
    log(before.print.replaceAll('|', '\n'));
    row(errors().length === 0, 'no errors', errors().slice(0, 4));
    log(fails ? `FAILS ${fails}` : 'ALL PASS');
    return;
  }

  // ---------------------------------------------------------------- a song with a cut
  const path = process.env.SONG || 'media/mgmt.mp3', blind = !!process.env.BLIND, name = basename(path).replace(/\.\w+$/, '');
  const t00 = Date.now();
  row(await drop(path), 'loads');
  log('ready after', (Date.now() - t00) / 1000, 's, arrival flight', await page.eval('app.song.arrival'), 's; first gesture', await page.eval(`app.song.score.gestures[0].pattern.id`));
  await page.eval(() => { window.__log = []; app.ui.song.show(true); app.governor.enabled = true; });

  // Before the second film's rehearsed: the song plays, the button's hidden, and a key does nothing but say so.
  const coming = await page.eval('({ coming: app.song.compareComing, c: !!app.song.compare, hidden: document.querySelector("[data-film]").hidden })');
  row(coming.coming && !coming.c && coming.hidden, 'rehearsing behind the picture: no button yet', JSON.stringify(coming));
  const f0 = await page.eval('app.stage.score === app.song.score');
  await key('d'); await sleep(200);
  row(f0 && await page.eval(`document.querySelector('#note').textContent.includes('rehearsing') && app.stage.score === app.song.score`), 'd says the other film is still rehearsing');
  // Is the film still running smoothly while the other one's rehearsed behind it?
  const took = await until('!!app.song.compare', 240000);
  const fr = await page.eval(() => { const L = window.__log, dts = []; for (let i = 1; i < L.length; i++) dts.push(L[i].now - L[i - 1].now); dts.sort((a, b) => a - b); return { n: L.length, median: +dts[dts.length >> 1].toFixed(1), p99: +dts[Math.floor(dts.length * 0.99)].toFixed(1), worst: +dts.at(-1).toFixed(1) }; });
  row(took != null, 'the cut is rehearsed behind the picture', took, 's; frames meanwhile (ms)', JSON.stringify(fr));
  if (took == null) { log('FAILS', fails + 1); return; }
  await sleep(300);
  const info = await page.eval(() => { const c = app.song.compare, a = c.score('auto'), b = c.score('cut'); return { film: c.film, label: document.querySelector('[data-film]').textContent, hidden: document.querySelector('[data-film]').hidden, line: c.line, auto: __print(a), cut: __print(b), refused: b.refused, kept: !!a.runway && !!b.runway, flash: null }; });
  row(!info.hidden && info.label === (blind ? info.label : 'generated') && info.film === 'auto', 'the button is there and says which film', JSON.stringify(info.label));
  if (blind) row(/^film [AB]$/.test(info.label), 'blind: it only says A or B', info.label);
  row(info.auto !== info.cut, 'two different films');
  log('refused', JSON.stringify(info.refused));
  log('cut:\n' + info.cut.replaceAll('|', '\n'));

  // Rehearsal really ran on the cut, with the film showing all along, and it hasn't touched the generated film.
  const wakeUi = async () => { await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 300, button: 'none', buttons: 0, pointerType: 'mouse' }); await sleep(250); };
  await wakeUi();
  await page.shot(`${name}-panel-generated`);

  // ---- d, with the clock running. From a quiet moment.
  const playing = await page.eval('app.song.playing');
  row(playing, 'the song is playing');
  await page.eval(() => { window.__log = []; });
  await sleep(1200);
  const heardAtD = await page.eval(() => { window.__sheetDone = __sheet(32, 16); window.__log.mark = window.__log.length; return app.song.time(); });
  await key('d');
  const flip1 = await until(`app.song.compare.film === 'cut' || app.song.compare.wanted !== 'cut'`, 8000);
  await until(`app.song.compare.film === 'cut'`, 8000);
  const fl = await page.eval('app.song.compare.flight');
  await sleep((fl || 6) * 1000 + 2500);
  const across = await page.eval(() => {
    const L = window.__log, m = L.mark ?? 0, a = L.slice(Math.max(0, m - 30));
    const dts = [], clock = []; let back = 0;
    for (let i = 1; i < a.length; i++) { const dt = (a[i].now - a[i - 1].now) / 1000, d = a[i].t - a[i - 1].t; dts.push(dt); clock.push(Math.abs(d - dt)); if (d < 0) back++; }
    // The sound's clock against the wall: no restart, no stop, no slide.
    const h0 = a[0], off = a.map(f => f.heard - h0.heard - (f.now - h0.now) / 1000), steps = a.slice(1).map(f => f.step).sort((x, y) => x - y);
    const sw = a.findIndex(f => f.film === 'cut'), w = 12, around = sw > 0 ? a.slice(Math.max(1, sw - w), sw + w).map((f, i, all) => `${f.step.toFixed(1)}/${(f.now - a[Math.max(1, sw - w) + i - 1].now).toFixed(0)}ms`) : [];
    const landed = a.filter(f => f.kind).at(-1);
    // A pop: one frame far above the frames around it. A flight going fast is a run of big frames, and isn't one.
    const allSteps = a.map(f => f.step); let pop = 0, popAt = -1;
    for (let i = 5; i < allSteps.length - 5; i++) { const near = [...allSteps.slice(i - 4, i), ...allSteps.slice(i + 1, i + 5)].sort((x, y) => x - y)[4], over = allSteps[i] / Math.max(near, 2.5); if (over > pop) { pop = over; popAt = i; } }
    return { frames: a.length, sw, back, worstClock: +Math.max(...clock).toFixed(4), audioSlip: +(Math.max(...off) - Math.min(...off)).toFixed(4), stepMedian: +steps[steps.length >> 1].toFixed(2), stepP99: +steps[Math.floor(steps.length * 0.99)].toFixed(2), stepWorst: +steps.at(-1).toFixed(2), pop: +pop.toFixed(2), popAt: popAt - sw, around, kinds: [...new Set(a.map(f => f.kind))], meanStepAtSwitch: sw > 0 ? +a[sw].step.toFixed(2) : null, id0: a[0].id, id1: a.at(-1).id, landed: landed?.kind };
  });
  row(await page.eval(`app.song.compare.film === 'cut' && app.stage.score === app.song.compare.score('cut') && app.song.score === app.stage.score`), 'd shows the cut');
  row(across.back === 0, 'the clock never runs backward', across.back);
  row(across.audioSlip < 0.06, 'the sound never stops or restarts across a switch: its clock against the wall moves under 60 ms', across.audioSlip);
  log('clock against each frame, worst', across.worstClock, 's;', 'frames', across.frames, 'switch at frame', across.sw);
  row(across.pop < 3, 'no pop on the way in: the most any one frame stands above those around it', JSON.stringify({ pop: across.pop, framesAfterSwitch: across.popAt, median: across.stepMedian, p99: across.stepP99, worst: across.stepWorst, atSwitch: across.meanStepAtSwitch, kinds: across.kinds }));
  log('frame steps around the switch', across.around.join(' '));
  save(`${name}-switch-to-cut.jpg`, await page.eval('__sheetDone()'));
  await wakeUi();
  await page.shot(`${name}-panel-cut`);
  const noteAfter = await page.eval(`document.querySelector('#note').textContent`);
  log('the note last said:', JSON.stringify(noteAfter));
  // Local flashes on the real frames of the flight.
  const flashes = await page.eval(() => {
    const L = window.__log, m = L.mark ?? 0, a = L.slice(m), secs = (a.at(-1).now - a[0].now) / 1000;
    const swings = series => { const out = []; let dir = 0, pivot = series[0]; series.forEach((v, i) => { if (dir >= 0 && v > pivot) { pivot = v; dir = 1; } if (dir <= 0 && v < pivot) { pivot = v; dir = -1; } if (dir === 1 && pivot - v >= 25.5) { out.push(i); dir = -1; pivot = v; } else if (dir === -1 && v - pivot >= 25.5) { out.push(i); dir = 1; pivot = v; } }); return out; };
    const worst = series => { const sw = swings(series); let w = 0; for (let i = 0; i < sw.length; i++) { let j = i; while (j < sw.length && a[sw[j]].now - a[sw[i]].now < 1000) j++; w = Math.max(w, (j - i) >> 1); } return w; };
    let tile = 0; for (let k = 0; k < 16; k++) tile = Math.max(tile, worst(a.map(f => f.tiles[k])));
    return { secs: +secs.toFixed(1), whole: worst(a.map(f => f.mean)), tile };
  });
  row(flashes.whole === 0 && flashes.tile <= 2, 'the flight flashes under the limits, on the frames as shown', JSON.stringify(flashes));

  // ---- = and -
  const t1 = await page.eval('app.song.time()');
  await key('='); await sleep(150); await key('-'); await sleep(150);
  const marks = await page.eval(() => { const c = app.song.compare; return { said: document.querySelector('#note').textContent, marks: c.marks(), raw: localStorage.getItem('trippee.compare.' + c.hash) }; });
  const [my, mn] = marks.marks.slice(-2);
  row(my?.yes === true && mn?.yes === false && my.film === 'cut' && Math.abs(my.t - t1) < 1 && !!marks.raw, '= and - are logged against the film and the time', JSON.stringify(marks.marks.slice(-2)), JSON.stringify(marks.said));

  // ---- d back. The generated film's gestures come round as they were.
  const passage0 = await page.eval('app.song.compare.passage');
  await sleep(1500);
  await key('d');
  await until(`app.song.compare.film === 'auto'`, 8000);
  const passage1 = await page.eval('app.song.compare.passage');
  await sleep(1000);
  row(passage1 > passage0 + 1, 'd moves where the last switch happened', passage0.toFixed(2), passage1.toFixed(2));

  // ---- D: the cut, from where that last switch was.
  await sleep((await page.eval('app.song.compare.flight') || 6) * 1000 + 800);
  const was = await page.eval('app.song.time()');
  await page.eval(() => { window.__log = []; window.__sheetDone = __sheet(32, 16); });
  await key('D');
  await until(`app.song.compare.film === 'cut'`, 8000);
  await sleep(250);
  const back = await page.eval(`({ t: app.song.time(), passage: app.song.compare.passage, film: app.song.compare.film, playing: app.song.playing })`);
  row(back.film === 'cut' && back.playing && Math.abs(back.t - passage1) < 1.5 && back.t < was - 1, 'D switches and goes back to the last switch', JSON.stringify(back), 'from', was.toFixed(2), 'to', passage1.toFixed(2));
  await sleep((await page.eval('app.song.compare.flight') || 6) * 1000 + 1500);
  const dpop = await page.eval(() => { const a = window.__log.slice(1), steps = a.map(f => f.step).sort((x, y) => x - y), sw = a.findIndex(f => f.film === 'cut'), s = a.map(f => f.step); let pop = 0, popAt = -1; for (let i = 5; i < s.length - 5; i++) { const near = [...s.slice(i - 4, i), ...s.slice(i + 1, i + 5)].sort((x, y) => x - y)[4], over = s[i] / Math.max(near, 2.5); if (over > pop) { pop = over; popAt = i; } } return { pop: +pop.toFixed(2), popAt: popAt - sw, n: a.length, median: +steps[steps.length >> 1].toFixed(2), p99: +steps[Math.floor(steps.length * 0.99)].toFixed(2), worst: +steps.at(-1).toFixed(2), around: sw > 0 ? a.slice(Math.max(0, sw - 6), sw + 8).map((f, i) => `${f.step.toFixed(1)}/${(f.now - a[Math.max(0, sw - 6) + i - 1]?.now).toFixed(0)}ms`) : [] }; });
  row(dpop.pop < 3, 'no pop going back either', JSON.stringify(dpop));
  save(`${name}-D-back.jpg`, await page.eval('__sheetDone()'));

  // ---- D again: the same passage in the other film, not the place it was pressed.
  await key('D');
  await until(`app.song.compare.film === 'auto'`, 8000);
  await sleep(250);
  const back2 = await page.eval(`({ t: app.song.time(), film: app.song.compare.film })`);
  row(back2.film === 'auto' && Math.abs(back2.t - passage1) < 1.5, 'D again: the same passage in the other film', JSON.stringify(back2));
  const fl2 = await page.eval('app.song.compare.flight'); await sleep((fl2 || 6) * 1000 + 800);

  // ---- The films stay themselves: a flight into a film starts from the film as rehearsed.
  const same = await page.eval(() => { const c = app.song.compare, a = c.score('auto'), b = c.score('cut'), t = a.gestures.at(-1).t0 + 1; const cur = app.stage.score; const other = cur === a ? b : a; other.runway(t, 0); return { pa: __print(other), expect: other === a ? 'auto' : 'cut' }; });
  row((same.expect === 'auto' ? info.auto : info.cut) === same.pa, 'a film that has been switched away from and back is still the film it was', same.expect);

  // ---- Keys pressed quickly: where it ends up is what counts, and it never gets stuck
  const before = await page.eval('app.song.compare.film');
  await key('d'); await key('d'); await sleep(2500);
  const quick = await page.eval(`({ film: app.song.compare.film, wanted: app.song.compare.wanted, waiting: app.stage.waiting.length })`);
  row(quick.film === before && quick.wanted === before && quick.waiting === 0, 'd d comes back to the same film', JSON.stringify(quick));
  await key('d'); await sleep(40); await key('d'); await sleep(40); await key('d'); await sleep(9000);
  const quick3 = await page.eval(`({ film: app.song.compare.film, wanted: app.song.compare.wanted, score: app.stage.score === app.song.compare.score(app.song.compare.film) })`);
  row(quick3.film !== before && quick3.film === quick3.wanted && quick3.score, 'd d d ends on the other one', JSON.stringify(quick3));

  // ---- A recording across a switch plays to its end
  await sleep(2000);
  await key('r'); await sleep(3500);
  const during = await page.eval('app.ui.recorder.on');
  await key('d'); await sleep(9500);
  await key('r'); await sleep(800);
  const video = await page.eval(async () => {
    const r = app.ui.recorder; await r.finished; const blob = r.last, v = document.createElement('video');
    v.muted = true; v.src = URL.createObjectURL(blob); await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error('no video')); });
    let d = v.duration;
    if (!isFinite(d)) { v.currentTime = 1e7; await new Promise(ok => { v.ondurationchange = () => { if (isFinite(v.duration)) ok(); }; setTimeout(ok, 3000); }); d = v.duration; v.currentTime = 0; }
    const out = { type: blob.type, size: blob.size, w: v.videoWidth, h: v.videoHeight, duration: +d.toFixed(2), frames: r.frames };
    // The whole of it, at speed, with a look at what it shows on the way.
    const c = document.createElement('canvas'), cols = 8, tw = 240, th = 135; c.width = cols * tw; c.height = th * 2; const g = c.getContext('2d'); let k = 0, lastT = -1, stuck = 0;
    await new Promise(ok => { v.onseeked = ok; setTimeout(ok, 1500); });
    v.playbackRate = 2;
    const grab = setInterval(() => { if (k < 16) { g.drawImage(v, (k % cols) * tw, (k / cols | 0) * th, tw - 1, th - 1); k++; } if (v.currentTime === lastT) stuck++; lastT = v.currentTime; }, 400);
    await v.play();
    const ended = await new Promise(ok => { v.onended = () => ok(true); setTimeout(() => ok(false), d * 1000 / 2 + 6000); });
    clearInterval(grab);
    out.ended = ended; out.reached = +v.currentTime.toFixed(2); out.stuck = stuck;
    out.sheet = c.toDataURL('image/jpeg', 0.8);
    URL.revokeObjectURL(v.src);
    return out;
  });
  save(`${name}-recording.jpg`, video.sheet); delete video.sheet;
  row(during && video.ended && video.reached > video.duration - 0.5 && video.duration > 11 && video.w > 0, 'a recording across a switch plays to its end', JSON.stringify(video));

  // ---- The song's end, and coming back from it into whichever film it's told
  await page.eval(`app.ui.song.show(true)`);
  await page.eval(() => { app.hand.veil(() => app.song.seek(app.song.duration - 9)); });
  const rested = await until('app.song.resting', 30000);
  row(rested != null, 'it plays to its end and rests', rested);
  const filmAtRest = await page.eval('app.song.compare.film');
  await key('d'); await sleep(500);
  const atRest = await page.eval('({ film: app.song.compare.film, resting: app.song.resting, wander: !app.stage.score.song })');
  row(atRest.film !== filmAtRest && atRest.resting && atRest.wander, 'at rest d changes which film comes back, and the wander carries on', JSON.stringify(atRest));
  await key(' ');
  await until('app.song.playing && !app.song.resting', 10000);
  await sleep(300);
  const woke = await page.eval(`({ playing: app.song.playing, resting: app.song.resting, right: app.stage.score === app.song.compare.score(app.song.compare.film), film: app.song.compare.film })`);
  row(woke.playing && !woke.resting && woke.right, 'play comes back into that film', JSON.stringify(woke));

  // ---- Another take, from the cut: that's the generated film
  await sleep(6500);
  if (await page.eval(`app.song.compare.film !== 'cut'`)) { await key('d'); await until(`app.song.compare.film === 'cut'`, 8000); await sleep(7000); }
  await page.eval(`document.querySelector('[data-take]').click()`);
  const took2 = await until(`app.song.compare.film === 'auto'`, 120000);
  await sleep(500);
  row(took2 != null && await page.eval(`app.stage.score === app.song.compare.score('auto') && app.stage.score !== null`), 'another take shows a new generated film, and d still reaches the cut', took2);

  // ---- The help says, and blind reveals
  await key('?'); await sleep(200);
  const help = await page.eval(() => ({ shown: [...document.querySelectorAll('[data-compare]')].every(n => getComputedStyle(n).display !== 'none'), note: document.querySelector('#note').textContent, label: document.querySelector('[data-film]').textContent, coin: localStorage.getItem('trippee.compare.' + app.song.hash + '.coin') }));
  row(help.shown, 'the help lists the keys');
  await wakeUi();
  await page.shot(`${name}-help`);
  if (blind) {
    row(/^A is the/.test(help.note) && help.label.includes(':') && (help.coin === 'cut' || help.coin === 'auto'), 'blind: ? reveals, and the coin is stored', JSON.stringify(help));
  }
  await key('?');

  // ---- Eject: the compare goes with the song
  await page.eval(`document.querySelector('[data-eject]').click()`);
  await sleep(8000);
  row(await page.eval('app.song.compare === null && !app.song.compareComing && document.querySelector("[data-film]").hidden'), 'eject: no compare, no button');
  row(errors().length === 0, 'no errors', errors().slice(0, 6));
  log(fails ? `FAILS ${fails}` : 'ALL PASS');
};
