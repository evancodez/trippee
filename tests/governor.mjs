// The governor under real load: a canvas far too big to draw at 60, with the real rAF loop.
//   node tools/lab.mjs tests/governor.mjs --out lab-out/integrate
const sleep = ms => new Promise(r => setTimeout(r, ms));
export default async ({ page, log, save }) => {
  const W = +(process.env.W || 3840), H = +(process.env.H || 2160);
  await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false });
  await sleep(600);
  await page.eval(() => {
    trippee.load('lines.bowtie'); app.t = 15;
    window.__fps = ms => new Promise(res => { const t0 = performance.now(); let n = 0; const f = () => { n++; const e = performance.now() - t0; if (e < ms) requestAnimationFrame(f); else res(+(n / e * 1000).toFixed(1)); }; requestAnimationFrame(f); });
    app.ui.recorder.autosave = false; app.ui.recorder.start();
    window.__sizes = new Set(); app.onFrame.push(() => __sizes.add(app.canvas.width + 'x' + app.canvas.height + ' copy ' + app.ui.recorder.copy?.width + 'x' + app.ui.recorder.copy?.height));
  });
  log('canvas', await page.eval('[app.canvas.width,app.canvas.height]'), 'recording', await page.eval('app.ui.recorder.mime'));
  for (let i = 0; i < +(process.env.N || 14); i++) {
    await sleep(800);
    const s = await page.eval(`__fps(1200).then(f=>({fps:f,tier:app.governor.tier,scale:app.R.drawScale}))`);
    log(i, JSON.stringify(s));
  }
  log('history', JSON.stringify(await page.eval('app.governor.history')));
  log('sizes seen in the frame loop while it was recording', await page.eval('[...__sizes]'));
  const res = await page.eval(async () => {
    const blob = await app.ui.recorder.stop();
    const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(blob);
    await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error('no video')); });
    let d = v.duration; if (!isFinite(d)) { v.currentTime = 1e7; await new Promise(ok => { v.ondurationchange = () => { if (isFinite(v.duration)) ok(); }; setTimeout(ok, 3000); }); d = v.duration; }
    const c = document.createElement('canvas'), w = c.width = v.videoWidth, h = c.height = v.videoHeight, g = c.getContext('2d');
    v.currentTime = d - 0.2; await new Promise(ok => { v.onseeked = ok; }); await new Promise(requestAnimationFrame);
    g.drawImage(v, 0, 0, w, h);
    return { dur: d, w, h, size: blob.size, data: c.toDataURL('image/jpeg', .8) };
  });
  save('governor-clip-end.jpg', res.data); delete res.data; log('clip', JSON.stringify(res));
  await page.shot('governor-low');
  // Back up when the load goes away
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  await page.eval(() => { app.governor.wait = 3; app.governor.calm = 0; trippee.load('lattice.star'); });
  for (let i = 0; i < 10; i++) { await sleep(2000); log('after load', JSON.stringify(await page.eval('({t:+app.t.toFixed(1),tier:app.governor.tier,scale:app.R.drawScale,fps:+app.governor.fps.toFixed(1),calm:app.governor.calm})'))); }
  log('history', JSON.stringify(await page.eval('app.governor.history')));
  log('errors', page.logs.filter(l => /\[error\]|\[exception\]/.test(l)));
};
