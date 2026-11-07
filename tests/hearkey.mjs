// The e key, with real keys, in real time, muted: it flips the layer that follows the song with the song going on and no pop, across a recording too. ?hear=0 starts without it, and h hides the interface, song or no song. The song panel's sliders reach it.
//
//   SONG=mgmt node tools/lab.mjs tests/hearkey.mjs --size 1280,720 --out lab-out/hearkey
const press = async (page, key, shift = false) => {
  const code = 'Key' + key.toUpperCase(), params = { key: shift ? key.toUpperCase() : key, code, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0), modifiers: shift ? 8 : 0 };
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
};
// What every animation frame sees for a while: real seconds, the picture's clock, the layer, the frame's mean change on a small copy, the camera's zoom.
const sample = (page, ms) => page.eval(async ms => {
  const { FRAME } = await import(new URL('src/pattern/layout.js', location.href).href);
  const c = document.createElement('canvas'); c.width = 96; c.height = 54; const g = c.getContext('2d', { willReadFrequently: true });
  const rows = [], t0 = performance.now(); let prev = null;
  await new Promise(res => {
    const on = () => {
      g.drawImage(app.canvas, 0, 0, 96, 54);
      const d = g.getImageData(0, 0, 96, 54).data; let s = 0;
      if (prev) for (let i = 1; i < d.length; i += 4) s += Math.abs(d[i] - prev[i]);
      prev = d;
      rows.push({ at: +(performance.now() - t0).toFixed(1), t: +app.t.toFixed(3), song: +app.song.time().toFixed(3), hear: +(app.edits.hear ?? -1).toFixed(3), diff: +(s / (96 * 54)).toFixed(2), zoom: +(app.R.frame[FRAME.hear * 4]).toFixed(4), bloom: +(app.R.frame[FRAME.hear * 4 + 6]).toFixed(4), y: +(app.R.frame[FRAME.hear * 4 + 3]).toFixed(4), turn: +(app.R.frame[FRAME.hear * 4 + 1]).toFixed(4), note: +Math.min(app.R.frame[FRAME.hear * 4 + 10], app.R.frame[FRAME.hear * 4 + 14], app.R.frame[FRAME.hear * 4 + 18]).toFixed(4), R: +(app.R.frame[FRAME.hear * 4 + 7]).toFixed(3) });
      if (performance.now() - t0 < ms) requestAnimationFrame(on); else res();
    };
    requestAnimationFrame(on);
  });
  return rows;
}, ms);
const med = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1] ?? 0; };
const say = (log, name, ok, more = '') => log(`${ok ? 'PASS' : 'FAIL'}  ${name}${more ? '  ' + more : ''}`);
const waitReady = async (page, sleep) => { for (let i = 0; i < 240; i++) { let ok = false; try { ok = await page.eval('window.trippee?.ready===true'); } catch { /* still navigating */ } if (ok) return; await sleep(250); } throw new Error('never ready'); };
const load = async (page, sleep, song) => {
  await page.eval(`window.__done=false;window.__err=null;app.song.load('/media/${song}.mp3',{seed:7}).then(()=>window.__done=true,e=>window.__err=String(e));0`);
  for (let i = 0; i < 1200 && !(await page.eval('window.__done||!!window.__err')); i++) await sleep(250);
  const e = await page.eval('window.__err'); if (e) throw new Error(e);
};

export default async ({ page, sleep, log }) => {
  const song = process.env.SONG || 'mgmt', base = (await page.eval('location.href')).split('?')[0], ats = (process.env.AT || '60').split(',').map(Number);
  const errors = () => page.logs.filter(l => l.startsWith('[exception]') || l.startsWith('[error]'));

  // ---- no song: h is still the interface's
  await press(page, 'h');
  say(log, 'no song: h hides the interface', await page.eval(`document.body.classList.contains('bare')`));
  await press(page, 'h');

  await load(page, sleep, song);
  say(log, 'on by default', (await page.eval('app.edits.hear')) === 1);
  await page.eval(`app.song.seek(${ats[0]});app.song.play();0`);
  await sleep(1500);

  // ---- real frames with it on
  const on = await sample(page, 6000);
  const gaps = on.slice(1).map((r, i) => r.at - on[i].at), fps = 1000 / med(gaps);
  log(`frame rate with it on: ${fps.toFixed(1)} fps, p95 ${[...gaps].sort((x, y) => x - y)[Math.floor(gaps.length * 0.95)].toFixed(1)} ms; zoom ${Math.min(...on.map(r => r.zoom)).toFixed(3)} to ${Math.max(...on.map(r => r.zoom)).toFixed(3)}, bloom to ${Math.min(...on.map(r => r.bloom)).toFixed(3)}, median change ${med(on.map(r => r.diff))}`);
  say(log, 'the camera is moving', Math.max(...on.map(r => r.zoom)) > 0.03);

  // ---- h: off, with the song going on
  const flip = async (want) => {
    const was = await page.eval('app.song.time()');
    const going = sample(page, 2600);
    await sleep(500);
    await press(page, 'e');
    const rows = await going;
    const pressed = rows.find(r => Math.abs(r.hear - rows[0].hear) > 1e-3) ?? rows[rows.length >> 1], k = rows.indexOf(pressed);
    const back = rows.filter((r, i) => i && r.t < rows[i - 1].t).length;
    const settled = Math.abs(rows.at(-1).hear - want) < 1e-3;
    // A pop is one frame far out of line with those around it, whatever speed things are going at.
    let worst = 0, usual = 0.5;
    for (let i = Math.max(1, k - 3); i <= Math.min(rows.length - 2, k + 70); i++) { const near = rows.slice(Math.max(1, i - 6), i + 7).filter((_, q, a) => q !== Math.min(i - 1, 6)).map(r => r.diff), m = Math.max(med(near), 0.5); if (rows[i].diff / m > worst / usual) { worst = rows[i].diff; usual = m; } }
    say(log, `e to ${want}: the song goes on`, (await page.eval('app.song.playing')) && back === 0 && (await page.eval('app.song.time()')) > was + 2, `clock went back ${back} times`);
    say(log, `e to ${want}: eases over about a second`, settled, `took ${(rows.find(r => Math.abs(r.hear - want) < 1e-3)?.at ?? 0) - pressed.at | 0} ms`);
    say(log, `e to ${want}: no pop`, worst <= usual * 3, `its most out-of-line frame changes ${worst} against ${usual} around it`);
  };
  await flip(0);
  const off = await sample(page, 3000);
  say(log, 'off: the camera has let go', off.every(r => r.zoom === 0), `zoom ${Math.max(...off.map(r => Math.abs(r.zoom)))}`);
  await flip(1);
  await sleep(200);

  // ---- the sliders reach it. Real inputs, and the zoom through a few beats.
  const slide = (key, v) => page.eval(`(()=>{const i=document.querySelector('[data-react="${key}"]');i.value=${v};i.oninput();return app.edits['${key}']})()`);
  const top = async () => { const r = await sample(page, 3500); return { z: Math.max(...r.map(x => x.zoom)), b: Math.min(...r.map(x => x.bloom)), y: Math.max(...r.map(x => Math.abs(x.y))), note: Math.min(...r.map(x => x.note)), turn: Math.max(...r.map(x => Math.abs(x.turn))), R: Math.min(...r.map(x => x.R)), d: med(r.map(x => x.diff)) }; };
  const seekTo = t => page.eval(`app.song.seek(${t});0`);
  for (const [key, label] of [['reactPulse', 'pulse'], ['reactMelody', 'melody'], ['reactTone', 'tone']]) {
    const got = {};
    for (const v of [0, 1, 2]) { await slide(key, v); await seekTo(ats[0]); await sleep(1800); got[v] = await top(); }
    await slide(key, 1);
    log(`slider ${label}: at 0 ${JSON.stringify(got[0])}; at 1 ${JSON.stringify(got[1])}; at 2 ${JSON.stringify(got[2])}`);
    if (key === 'reactPulse') say(log, 'pulse at 2 is plainly more, and at 0 the push is gone', got[2].z > got[1].z * 1.5 && got[0].z < got[1].z * 0.6);
    if (key === 'reactMelody') say(log, 'melody at 2 is plainly more, and at 0 the lift and the notes are gone', got[2].y > got[1].y * 1.5 && got[0].note === 0 && got[2].note < got[1].note * 1.5);
  }

  // ---- across a recording: no file's saved, it's kept in the page and thrown away
  await page.eval(`app.ui.recorder.autosave=false;0`);
  await press(page, 'r'); await sleep(2500);
  await press(page, 'e'); await sleep(2500);
  await press(page, 'e'); await sleep(2000);
  await press(page, 'r'); await sleep(1500);
  const rec = await page.eval(`(()=>{const l=app.ui.recorder.last;return {size:l?.size??l?.blob?.size??0,on:app.ui.recorder.on}})()`);
  say(log, 'across a recording: h twice, it finishes and has a file', !rec.on && rec.size > 1000, JSON.stringify(rec));
  await page.eval(`app.ui.recorder.last=null;0`);

  // ---- a hand cut: d, and it follows the song just the same. h while it's showing.
  if (process.env.CUT !== '0') {
    for (let i = 0; i < 900 && !(await page.eval('!!app.song.compare')); i++) await sleep(200);
    if (await page.eval('!!app.song.compare')) {
      await press(page, 'd'); await sleep(9000);
      const inCut = await sample(page, 3000);
      say(log, 'a hand cut follows the song', (await page.eval('app.song.compare.film')) === 'cut' && Math.max(...inCut.map(r => r.zoom)) > 0.03, `film ${await page.eval('app.song.compare.film')}, zoom to ${Math.max(...inCut.map(r => r.zoom))}, ${(await page.eval('app.song.score.sheet?.hits?.length ?? 0'))} hits, ${(await page.eval('app.song.score.hear.moments.length'))} moments`);
      await flip(0); await flip(1);
      await press(page, 'd'); await sleep(9000);
    } else log('no hand cut came up for this song');
  }

  // ---- colour and a world take it too
  await press(page, 'b'); await sleep(3000);
  const col = await sample(page, 3000);
  say(log, 'colour follows the song', Math.max(...col.map(r => r.zoom)) > 0.03 && !!(await page.eval('app.edits.beyond')), `zoom to ${Math.max(...col.map(r => r.zoom))}, ${(1000 / med(col.slice(1).map((r, i) => r.at - col[i].at))).toFixed(1)} fps`);
  await flip(0); await flip(1);
  await press(page, 'b'); await sleep(2000);
  await page.eval(`app.stage.setWorld('flower');0`);
  for (let i = 0; i < 300 && !(await page.eval('!!app.stage.score.world && !!app.stage.score.hear')); i++) await sleep(200);
  await sleep(16000);
  const world = await sample(page, 4000);
  say(log, 'Flower Power follows the song', Math.max(...world.map(r => r.zoom)) > 0.03, `zoom to ${Math.max(...world.map(r => r.zoom))}, ${(1000 / med(world.slice(1).map((r, i) => r.at - world[i].at))).toFixed(1)} fps`);
  await flip(0); await flip(1);
  await page.eval(`app.stage.setWorld(null);0`); await sleep(3000);

  // ---- the song ending: the film gives way to what comes after it, and the camera lets go without a pop
  const dur = await page.eval('app.song.duration');
  await page.eval(`app.song.seek(${dur - 5});0`); await sleep(1500);
  const ending = await sample(page, 8000);
  { let worst = 0, usual = 0.5; for (let i = 1; i < ending.length - 1; i++) { const near = ending.slice(Math.max(1, i - 6), i + 7).map(r => r.diff), m = Math.max(med(near), 0.5); if (ending[i].diff / m > worst / usual) { worst = ending[i].diff; usual = m; } }
    say(log, 'the song ends: no pop', worst <= usual * 4, `its most out-of-line frame changes ${worst} against ${usual} around it; zoom at the end ${ending.at(-1).zoom}`); }
  await sleep(3000);
  await load(page, sleep, song);
  await page.eval(`app.song.seek(${ats[0]});app.song.play();0`); await sleep(1000);

  // ---- h hides the interface whatever's on, song and all
  const h0 = await page.eval('app.edits.hear');
  await press(page, 'h');
  say(log, 'with a song on, h hides the interface and leaves this alone', (await page.eval(`document.body.classList.contains('bare')`)) && (await page.eval('app.edits.hear')) === h0);
  await press(page, 'h');
  say(log, 'no errors', errors().length === 0, errors().slice(0, 3).join(' | ').slice(0, 400));

  // ---- ?hear=0 starts without it, and e brings it in
  await page.goto(`${base}?hear=0`); await waitReady(page, sleep);
  await load(page, sleep, song);
  say(log, '?hear=0 starts without it', (await page.eval('app.edits.hear')) === 0);
  await page.eval(`app.song.seek(${ats[0]});app.song.play();0`);
  await sleep(1200);
  const zero = await sample(page, 1500);
  say(log, '?hear=0: the camera never moves', zero.every(r => r.zoom === 0));
  await flip(1);
  const up = await sample(page, 2500);
  say(log, '?hear=0, then e: it comes in', Math.max(...up.map(r => r.zoom)) > 0.03);
  await page.eval('app.song.pause();0');
  log('done');
};
