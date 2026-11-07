// A whole film as it's really drawn, from the page's own canvas: for a world or a hand cut, which the small rig doesn't draw the same. Muted.
//   SONG=mgmt WORLD=flower node tools/lab.mjs tests/camstrip.mjs --out lab-out/cam
//   SONG=disclosure CUT=1 AT=80-100 EVERY=.5 ...
import { resolve } from 'node:path';
import { enterWorld } from '../tools/look.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sheet = async ({ title, items, cols, tw, th, cap }) => {
  const T = window.trippee, top = 22, rows = Math.ceil(items.length / cols), c = document.createElement('canvas'); c.width = cols * tw; c.height = top + rows * (th + cap);
  const g = c.getContext('2d'); g.fillStyle = '#161616'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#fff'; g.font = 'bold 13px monospace'; g.fillText(title, 6, 16);
  app.song.pause?.(); app.ui?.song?.show?.(false); app.manual = true; if (app.governor) app.governor.enabled = false; app.R.drawScale = 1;
  for (let i = 0; i < items.length; i++) {
    const t = items[i], x = (i % cols) * tw, y = top + Math.floor(i / cols) * (th + cap);
    T.seek(t); g.drawImage(T.canvas, x + 1, y + cap, tw - 2, th - 2);
    const f = app.lastFrame; g.fillStyle = f.kind ? '#7dff9b' : '#bbb'; g.font = '10px monospace'; g.fillText(`${t.toFixed(1)} ${(f.G.pattern.id).split('.').pop().slice(0, 11)}${f.kind ? ' ' + f.kind.slice(0, 5) + ' ' + Math.round(f.T * 100) : ''}`, x + 2, y + 9);
    if (i % 4 === 0) await new Promise(r => setTimeout(r));
  }
  return c.toDataURL('image/jpeg', 0.82);
};
export default async ({ page, log, save }) => {
  const song = process.env.SONG || 'mgmt', songPath = resolve(`media/${song}.mp3`), world = process.env.WORLD;
  await page.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 1, mobile: false }); await sleep(300);
  const data = { items: [], files: [songPath], dragOperationsMask: 1 };
  await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 320, y: 180, data }); await page.send('Input.dispatchDragEvent', { type: 'drop', x: 320, y: 180, data });
  for (let i = 0; i < 1800; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await sleep(100); }
  if (world) await enterWorld(page, world, log);
  if (process.env.CUT) {
    for (let i = 0; i < 1800; i++) { if (await page.eval('!!app.song.compare')) break; await sleep(100); }
    await page.eval(`(()=>{const sc=app.song.compare.score('cut');app.song.score=sc;app.stage.setScore(sc)})()`);
    log('cut', await page.eval('app.song.compare.line'));
  }
  const { dur, bar, plan, hasCam } = await page.eval(() => ({ dur: app.song.analysis.duration, bar: app.stage.score.react?.M?.bar ?? 2, plan: app.stage.score.camera?.plan ?? null, hasCam: !!app.stage.score.camera }));
  log('camera', hasCam, JSON.stringify(plan)?.slice(0, 400));
  const at = process.env.AT?.split('-').map(Number), every = +(process.env.EVERY || 2) * bar, items = [];
  for (let t = at ? at[0] : 0.2; t < (at ? at[1] : dur); t += every) items.push(t);
  save(`${song}-${world ?? (process.env.CUT ? 'cut' : 'film')}${at ? '-' + at[0] : ''}.jpg`, await page.eval(sheet, { title: `${song} ${world ?? (process.env.CUT ? 'hand cut' : 'film')}, a frame every ${(every / bar).toFixed(2)} bars`, items, cols: 12, tw: 160, th: 90, cap: 11 }));
  log(await page.eval(() => JSON.stringify(app.song.score?.refused?.slice?.(0, 6) ?? null)));
};
