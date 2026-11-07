// The tricks' own patterns in the library, with no song: a sheet of the time and space tiles, then a real click on each of IDS, watched for 8 s after it.
//   LAB_URL=... node tools/lab.mjs tests/woahlib.mjs --size 1280,720 --out lab-out/me        IDS=time.ghost,space.swell to choose
// Says, for each: how much the picture changes a second once it's arrived (a pattern that doesn't move at all reads ~0), how much of it is mid-grey (a flat grey frame while a program's built reads near 1), and the longest run of near-solid frames.
// Writes lib.jpg (the tiles) and clicks.jpg (one row per click, a frame every second).
const IDS = (process.env.IDS || 'space.swell,time.ghost,time.ghostcheck,time.snakes,time.ouchi,time.shutter,time.target,time.rings,time.venetian,time.wave,time.spiral,time.cells,time.echo').split(',');
export default async ({ page, save, log }) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 240; i++) { if (await page.eval('typeof window.trippee !== "undefined" && window.trippee.ready === true')) break; await sleep(250); }
  const r = await page.eval(async IDS => {
    const lib = app.ui.library ?? app.ui.lib; if (!lib) return { err: 'no library' };
    lib.show(true);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 300 && [...lib.tiles.values()].some(t => !t.done); i++) await sleep(250);
    const tiles = [...lib.tiles.values()].filter(t => t.p.family === 'time' || t.p.family === 'space');
    const cols = 6, tw = 220, th = 124, c = document.createElement('canvas'); c.width = cols * tw; c.height = Math.ceil(tiles.length / cols) * th; const g = c.getContext('2d');
    tiles.forEach((t, i) => { g.drawImage(t.c, (i % cols) * tw, (i / cols | 0) * th, tw - 2, th - 2); g.fillStyle = '#f33'; g.font = '12px monospace'; g.fillText(t.p.id, (i % cols) * tw + 3, (i / cols | 0) * th + 13); });
    const libUrl = c.toDataURL('image/jpeg', 0.8);
    const W = 96, H = 54, sm = document.createElement('canvas'); sm.width = W; sm.height = H; const sg = sm.getContext('2d', { willReadFrequently: true });
    const sw = 160, sh = 90, strip = document.createElement('canvas'); strip.width = 9 * sw; strip.height = IDS.length * sh; const st = strip.getContext('2d');
    const out = [];
    for (let n = 0; n < IDS.length; n++) {
      const id = IDS[n], t = tiles.find(x => x.p.id === id);
      if (!t) { out.push({ id, err: 'no tile' }); continue; }
      t.b.click();
      let prev = null, change = [], grey = [], solidRun = 0, solidMost = 0;
      const t0 = performance.now();
      for (let k = 0; k < 80; k++) {
        await sleep(85);
        // inside a frame, after the app's own draw and before the page is composited, while the drawing buffer still has it
        const px = await new Promise(r => requestAnimationFrame(() => { sg.drawImage(app.canvas, 0, 0, W, H); if (k % 10 === 9) st.drawImage(app.canvas, (k / 10 | 0) * sw, n * sh, sw - 2, sh - 2); r(sg.getImageData(0, 0, W, H).data); })); let d = 0, gr = 0, lo = 255, hi = 0;
        for (let i = 1; i < px.length; i += 4) { const v = px[i]; if (prev) d += Math.abs(v - prev[i]); if (v > 70 && v < 185) gr++; lo = Math.min(lo, v); hi = Math.max(hi, v); }
        prev = px; change.push(d / (W * H)); grey.push(gr / (W * H));
        if (hi - lo < 40) { solidRun++; solidMost = Math.max(solidMost, solidRun); } else solidRun = 0;
      }
      st.fillStyle = '#f33'; st.font = '12px monospace'; st.fillText(id, 3, n * sh + 13);
      const late = change.slice(40), mean = a => a.reduce((s, v) => s + v, 0) / Math.max(a.length, 1);
      out.push({ id, shown: app.lastFrame?.G?.pattern?.id, movesLate: +mean(late).toFixed(2), grey: +Math.max(...grey).toFixed(2), greyLate: +mean(grey.slice(40)).toFixed(2), solidSeconds: +(solidMost / 10).toFixed(1), ms: Math.round(performance.now() - t0) });
    }
    return { libUrl, clicks: strip.toDataURL('image/jpeg', 0.8), out };
  }, IDS);
  if (r.err) { log(r.err); return; }
  save('lib.jpg', r.libUrl); save('clicks.jpg', r.clicks);
  for (const o of r.out) log(JSON.stringify(o));
  const errs = page.logs.filter(l => /\[error\]|\[exception\]/.test(l)).slice(0, 5); if (errs.length) log(errs.join('\n'));
};
