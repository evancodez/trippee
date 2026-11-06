// Watch a film in real time with the real song and the real loop, the way a person would. Writes a contact sheet of what was on screen.
//   SONG=media/ppp.mp3 FROM=0 SECS=100 node tools/lab.mjs tests/film.mjs --out lab-out/me
import { resolve, basename } from 'node:path';
const sleep = ms => new Promise(r => setTimeout(r, ms));
export default async ({ page, log, save }) => {
  const song = process.env.SONG || 'media/ppp.mp3', from = +(process.env.FROM || 0), secs = +(process.env.SECS || 100), every = +(process.env.EVERY || 1), cols = 12;
  const data = { items: [], files: [resolve(song)], dragOperationsMask: 1 };
  await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 640, y: 360, data });
  await page.send('Input.dispatchDragEvent', { type: 'drop', x: 640, y: 360, data });
  for (let i = 0; i < 400; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await sleep(100); }
  if (process.env.FAMILY) await page.eval(`app.song.rebuild({family:${JSON.stringify(process.env.FAMILY)}})`);
  await page.eval(`app.ui.song.show(false);document.querySelector('#hints').hidden=true;${from ? `app.song.seek(${from});` : ''}`);
  log('film', await page.eval('({family:app.song.score.family,gestures:app.song.score.gestures.length,pool:app.song.score.pool?.slice(0,6),d:app.song.duration})'));
  const r = await page.eval(async ({ secs, every, cols }) => {
    const W = 192, H = 108, n = Math.ceil(secs / every), rows = Math.ceil(n / cols);
    const sheet = document.createElement('canvas'); sheet.width = cols * W; sheet.height = rows * H; const g = sheet.getContext('2d');
    g.font = '11px monospace';
    const ts = [], seq = []; let i = 0, next = performance.now(), last = performance.now();
    await new Promise(res => {
      const on = () => {
        const now = performance.now(); ts.push(now - last); last = now;
        if (now >= next) {
          next += every * 1000;
          const x = (i % cols) * W, y = (i / cols | 0) * H;
          g.drawImage(app.canvas, x, y, W, H);
          g.fillStyle = '#f22'; g.fillText(app.t.toFixed(1), x + 3, y + 12);
          seq.push(app.lastFrame.G.pattern.id);
          if (++i >= n) { app.onFrame.splice(app.onFrame.indexOf(on), 1); res(); }
        }
      };
      app.onFrame.push(on);
    });
    ts.sort((a, b) => a - b);
    const runs = []; for (const s of seq) { if (runs.at(-1)?.[0] === s) runs.at(-1)[1]++; else runs.push([s, 1]); }
    return { sheet: sheet.toDataURL('image/jpeg', .8), fps: +(1000 / (ts.reduce((a, b) => a + b, 0) / ts.length)).toFixed(1), p99: +ts[ts.length * .99 | 0].toFixed(1), max: +ts.at(-1).toFixed(1), runs, tier: app.governor.tier };
  }, { secs, every, cols });
  const name = basename(song).replace(/\.\w+$/, '') + (process.env.FAMILY ? '-' + process.env.FAMILY : '');
  save(`film-${name}.jpg`, r.sheet); delete r.sheet;
  log('real time', JSON.stringify(r));
  log('errors', page.logs.filter(l => /\[error\]|\[exception\]/.test(l)));
};
