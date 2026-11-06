// The end of a song, a bad file, and the hand during a film.  node tools/lab.mjs tests/songend.mjs --out lab-out/me
import { resolve } from 'node:path';
const sleep = ms => new Promise(r => setTimeout(r, ms));
export default async ({ page, log }) => {
  const mouse = (type, x, y, o = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, button: o.button ?? 'none', buttons: o.buttons ?? 0, clickCount: o.clickCount ?? 0, deltaX: o.deltaX ?? 0, deltaY: o.deltaY ?? 0, modifiers: o.modifiers ?? 0, pointerType: 'mouse' });
  const drop = async file => { const data = { items: [], files: [resolve(file)], dragOperationsMask: 1 }; await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 640, y: 360, data }); await page.send('Input.dispatchDragEvent', { type: 'drop', x: 640, y: 360, data }); };
  const st = () => page.eval(() => ({ t: +app.t.toFixed(2), heard: +app.song.time().toFixed(2), playing: app.song.playing, resting: app.song.resting, clock: !!app.clock, pat: app.lastFrame.G.pattern.id, theta: +app.lastFrame.theta.toFixed(2), panel: document.querySelector('#song [data-time]').textContent, btn: document.querySelector('#song [data-play]').textContent, state: app.ui.song.state }));
  // a file that isn't a song
  await drop('README.md'); await sleep(1500);
  log('not a song', await page.eval('document.querySelector("#song [data-name]").textContent'), await page.eval('app.ui.song.state'));
  log('errors from that (one is expected)', page.logs.filter(l => /\[error\]|\[exception\]/.test(l)).length);
  await drop('media/ppp.mp3');
  for (let i = 0; i < 300; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await sleep(100); }
  await sleep(4000);
  // The hand during a film: zoom, then duty, then press. It comes back on its own and the pattern doesn't change.
  await mouse('mouseMoved', 700, 300);
  const pat0 = await page.eval('app.lastFrame.G.pattern.id');
  await page.eval(() => { window.__hs = () => { const A = app.R.slotA; return { scale: +app.edits.journey.toFixed(3), duty: +app.edits.duty.toFixed(3), press: +app.edits.press.toFixed(3), pat: app.lastFrame.G.pattern.id }; }; });
  for (let i = 0; i < 10; i++) { await mouse('mouseWheel', 700, 300, { deltaY: -80 }); await sleep(30); }
  await sleep(500); log('zoomed in a film', await page.eval('__hs()'));
  await sleep(300);
  for (let i = 0; i < 12; i++) { await mouse('mouseWheel', 700, 300, { deltaX: 40 }); await sleep(30); }
  await sleep(400); log('sideways in a film', await page.eval('__hs()'), 'was', pat0);
  await page.shot('end-hand-in-film');
  await sleep(6000); log('6 s later, easing back', await page.eval('__hs()'));
  // Near the end
  await page.eval(() => app.song.seek(app.song.duration - 6)); await sleep(1500);
  log('near the end', await st());
  await sleep(5500); log('song over', await st());
  await sleep(1500); await page.shot('end-1-holding'); log('holding', await st());
  await sleep(2500); log('wander should be opening', await st());
  await sleep(6000); await page.shot('end-2-wander'); log('wander', await st());
  log('frames moving', await page.eval(async () => { const a = app.t; await new Promise(r => setTimeout(r, 500)); return app.t > a; }));
  // Space: back to the film from the start, bending into it
  await page.eval(() => { window.__tr = []; window.__on = () => __tr.push([+app.t.toFixed(3), +app.lastFrame.theta.toFixed(3), +app.lastFrame.solid.toFixed(2), app.lastFrame.G.pattern.id]); app.onFrame.push(__on); });
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', text: ' ', windowsVirtualKeyCode: 32 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await sleep(4000);
  const tr = await page.eval('__tr');
  const change = tr.findIndex((r, i) => i && r[0] < tr[i - 1][0]);
  log('space after the end', await st(), 'swap happened at', JSON.stringify(tr.slice(Math.max(0, change - 2), change + 3)));
  log('errors', page.logs.filter(l => /\[error\]|\[exception\]/.test(l)).map(l => l.slice(0, 200)));
};
