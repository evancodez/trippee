// What the director cast, seen moving. Drops a song, prints the cast, then for each hero a close-frame sheet and time-slices over its whole run.
//   SONG=media/ppp.mp3 SEED=7 node tools/lab.mjs tests/direct.mjs --out lab-out/d
//   HEROES=countdown,coin   only these kinds.  BEYOND=1  with colour on.  LIST=1  just the cast.
import { resolve, basename } from 'node:path';
import { watch, analyse } from '../tools/look.mjs';
export default async ({ page, log, save, sleep }) => {
  const songPath = process.env.SONG || 'media/ppp.mp3', song = basename(songPath).replace(/\.\w+$/, '');
  for (let i = 0; i < 400 && !(await page.eval('window.trippee?.ready===true')); i++) await sleep(100);
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  await page.eval(`app.governor.enabled=false;app.R.drawScale=1;trippee.seek(0)`);
  const data = { items: [], files: [resolve(songPath)], dragOperationsMask: 1 };
  await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 640, y: 360, data });
  await page.send('Input.dispatchDragEvent', { type: 'drop', x: 640, y: 360, data });
  for (let i = 0; i < 1800; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await sleep(100); }
  if (process.env.SEED) { await page.eval(`app.song.rebuild({seed:${+process.env.SEED}})`); await sleep(500); }
  await page.eval(`app.song.pause();app.ui.song.show(false);app.manual=true;app.governor.enabled=false;app.R.drawScale=1;app.t=0;`);
  const info = await page.eval(() => { const s = app.song.score; return { cast: s.cast, stats: s.stats, sit: app.song.rehearsal?.sitOut, gestures: s.gestures.map(G => ({ t0: +G.t0.toFixed(2), t1: +G.t1.toFixed(2), morph: +(G.morph || 0).toFixed(2), id: G.pattern.id, x: [G.hero, G.xform?.id, ...(G.moves || []).map(m => m.id)].filter(Boolean).join(',') })) }; });
  log(song, 'cast', JSON.stringify(info.cast?.map(h => `${h.kind}@${h.at} ${h.id}${h.mirror ? ' mirrored' : ''} [${h.t0},${h.t1}]`)), 'sat out', JSON.stringify(info.sit));
  for (const G of info.gestures) log(`  ${String(G.t0).padStart(7)} ${String(G.t1).padStart(7)} m${G.morph} ${G.id} ${G.x}`);
  if (process.env.LIST) return;
  const want = process.env.HEROES?.split(',');
  if (process.env.BEYOND) await page.eval(`app.beyond.on(); app.beyond.snap(.6)`);
  const fps = +(process.env.FPS || 12);
  const done = new Set();
  for (const h of info.cast || []) {
    if (want && !want.includes(h.kind)) continue;
    const key = h.kind + (h.mirror ? 'm' : '');
    if (done.has(key) && !process.env.ALL) continue;
    done.add(key);
    // The whole run and a bit either side, in about 96 frames on the sheet
    let a = h.t0 - 2, b = h.t1 + 3;
    if (h.kind === 'star') b = Math.min(b, a + 40);
    if (['fall', 'shock'].includes(h.kind)) { a = h.t0 - 1; b = h.t1 + 4; }
    if (!['countdown', 'coin', 'star', 'fall', 'shock', 'lock'].includes(h.kind)) b = Math.min(b, a + 24);
    if (h.kind === 'countdown' || h.kind === 'coin') b = Math.min(b, h.at + 5);
    const name = `${song}-${h.kind}${h.mirror ? '-m' : ''}-${Math.round(h.at)}`;
    const w = await watch(page, save, { name, seconds: b - a, fps, cols: 12, rows: 8, setup: `app.t=${a};trippee.seek(${a})` });
    const A = analyse(w);
    log(name, `[${a.toFixed(1)},${b.toFixed(1)}] ${h.id}`, 'white', Math.min(...w.white).toFixed(2), Math.max(...w.white).toFixed(2), 'maxdiff', Math.max(...w.diff.slice(1)).toFixed(1), 'median', [...w.diff].sort((x, y) => x - y)[w.diff.length >> 1].toFixed(1));
  }
  // A Countdown, one frame on each ring's lock: does it read ring by ring, from the outside in?
  if (!want || want.includes('countdown')) for (const h of (info.cast || []).filter(h => h.kind === 'countdown')) {
    const img = await page.eval(async ({ h }) => {
      const s = app.song.score, G = s.gestures.find(g => Math.abs(g.t0 - h.t0) < 0.5 && g.moves?.[0]?.lockT), m = G?.moves[0];
      if (!m) return null;
      const beat = t => s.tau(t), L = m.lockT, b0 = beat(L), times = [];
      const timeOf = b => { let lo = L - 60, hi = L + 60; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (beat(mid) < b) lo = mid; else hi = mid; } return lo; };
      for (let k = Math.ceil(m.T / m.step); k >= -1; k--) times.push(timeOf(b0 - k * m.step));
      const W = 400, H = 225, cols = 4, c = document.createElement('canvas'); c.width = W * cols; c.height = H * Math.ceil(times.length / cols); const g = c.getContext('2d');
      times.forEach((t, i) => { app.t = t; trippee.seek(t); g.drawImage(app.canvas, (i % cols) * W, Math.floor(i / cols) * H, W - 2, H - 2); g.fillStyle = '#e22'; g.font = '14px monospace'; g.fillText(t.toFixed(2), (i % cols) * W + 4, Math.floor(i / cols) * H + 15); });
      return c.toDataURL('image/jpeg', 0.85);
    }, { h });
    if (img) save(`${song}-rings-${Math.round(h.at)}.jpg`, img);
  }
  const errs = page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  log('errors', errs.length, errs.slice(0, 5).join(' | '));
};
