// The owner's way in: click a riot pattern in the library, with no song and then with a real song dropped on (the lab's Chrome is muted). Real page, real keys and clicks, real time.
//   node tools/lab.mjs tests/riothand.mjs --out lab-out/v3
//   PICKS=riot.wring,riot.ratchet SONG=media/mgmt.mp3 SEEK=80 SECS=10 ...
// Writes riothand-<pick>[-song].jpg, a contact sheet of what was on screen.
import { resolve } from 'node:path';
const env = process.env, sleep = ms => new Promise(r => setTimeout(r, ms));
const grab = (page, secs, every = 0.33) => page.eval(async ({ secs, every }) => {
  const W = 256, H = 144, cols = 8, n = Math.ceil(secs / every), rows = Math.ceil(n / cols), sheet = document.createElement('canvas'); sheet.width = cols * W; sheet.height = rows * H;
  const g = sheet.getContext('2d'); g.font = '11px monospace';
  const ids = []; let i = 0, next = performance.now(), last = performance.now(); const ts = [];
  await new Promise(res => { const on = () => { const now = performance.now(); ts.push(now - last); last = now; if (now >= next) { next += every * 1000; const x = (i % cols) * W, y = (i / cols | 0) * H; g.drawImage(app.canvas, x, y, W, H); g.fillStyle = '#f22'; g.fillText(app.t.toFixed(1), x + 3, y + 12); ids.push(app.lastFrame.G.pattern.id); if (++i >= n) { app.onFrame.splice(app.onFrame.indexOf(on), 1); res(); } } }; app.onFrame.push(on); });
  ts.sort((a, b) => a - b);
  return { sheet: sheet.toDataURL('image/jpeg', 0.8), ids: [...new Set(ids)], fps: +(1000 / (ts.reduce((a, b) => a + b, 0) / ts.length)).toFixed(0), worst: +ts.at(-1).toFixed(0) };
}, { secs, every });
const clickTile = (page, id) => page.eval(id => { app.ui.library.show(true); const t = app.ui.library.tiles.get(id); if (!t) throw new Error('no tile ' + id); t.b.click(); app.ui.library.show(false); return t.b.title; }, id);
export default async ({ page, save, log }) => {
  const picks = (env.PICKS || 'riot.ratchet,riot.scissor,riot.bellows,riot.speaker,riot.wring').split(','), secs = +(env.SECS || 8);
  const song = env.SONG, seek = +(env.SEEK || 80);
  log('in the library:', await page.eval(() => app.patterns.filter(p => p.family === 'riot').map(p => `${p.name} pool ${p.pool}`).join(', ')));
  if (!env.NOPLAIN) for (const id of picks) {
    log('clicked', await clickTile(page, id));
    await sleep(9500);      // the flight in
    const r = await grab(page, secs);
    save(`riothand-${id.replace('riot.', '')}.jpg`, r.sheet); delete r.sheet;
    log(id, JSON.stringify(r));
  }
  if (song) {
    const data = { items: [], files: [resolve(song)], dragOperationsMask: 1 };
    await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 640, y: 360, data });
    await page.send('Input.dispatchDragEvent', { type: 'drop', x: 640, y: 360, data });
    for (let i = 0; i < 1800; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await sleep(100); }
    await page.eval(`app.ui.song.show(false);document.querySelector('#hints').hidden=true;app.song.seek(${seek});`);
    log('song up', await page.eval('({ t: app.t, playing: app.song.playing, pulses: app.song.score.react.pulses.length })'));
    for (const id of picks) {
      log('clicked', await clickTile(page, id));
      await sleep(9500);
      const r = await grab(page, secs);
      save(`riothand-${id.replace('riot.', '')}-song.jpg`, r.sheet); delete r.sheet;
      log(id, JSON.stringify(r), 'calm', await page.eval('app.lastFrame.G.calm'));
    }
  }
  const errors = page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  log('errors', JSON.stringify(errors.slice(0, 6)));
};
