// A click on a tile in the middle of a film: is there a pop as it starts, or as it lands? SONG=mgmt AT=30,100,150 node tools/lab.mjs tests/clickpop.mjs --out lab-out/repair. Muted: the song stays paused.
export default async ({ page, log }) => {
  const song = process.env.SONG || 'mgmt', at = (process.env.AT || '30,100,150,190').split(',').map(Number), ids = (process.env.IDS || 'lines.river,checks.twist,lattice.master,dots.inflate').split(',');
  await page.eval(`app.manual=true;window.__done=false;trippee.song('/media/${song}.mp3',{autoplay:false}).then(()=>window.__done=true);0`);
  for (let i = 0; i < 1800; i++) { if (await page.eval('window.__done')) break; await new Promise(r => setTimeout(r, 200)); }
  const r = await page.eval(async ({ at, ids }) => {
    const T = window.trippee; app.song.pause(); app.manual = true; app.governor.enabled = false; app.R.drawScale = 1;
    const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d', { willReadFrequently: true });
    const grab = () => { g.drawImage(T.canvas, 0, 0, 160, 90); return g.getImageData(0, 0, 160, 90).data; };
    const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i + 1] - b[i + 1]); return s / (a.length / 4); };
    const out = [];
    for (let n = 0; n < at.length; n++) {
      T.seek(at[n]); let prev = grab(); const series = [], kinds = [];
      for (let i = 0; i < 8; i++) { T.step(1 / 60); const f = grab(); series.push(+diff(prev, f).toFixed(1)); kinds.push(app.lastFrame.kind || ''); prev = f; }
      const from = app.lastFrame.G.pattern.id;
      app.stage.pick(ids[n % ids.length], app.pictureT());
      for (let i = 0; i < 620; i++) { T.step(1 / 60); const f = grab(); series.push(+diff(prev, f).toFixed(1)); kinds.push(app.lastFrame.kind || ''); prev = f; if (i % 40 === 0) await new Promise(r => setTimeout(r)); }
      const start = kinds.findIndex((k, i) => i >= 8 && k), end = kinds.lastIndexOf(kinds[start]);
      out.push({ at: at[n], from, to: ids[n % ids.length], now: app.lastFrame.G.pattern.id, kind: kinds[start], before: series.slice(4, 8).join(' '), started: start, around: series.slice(Math.max(start - 3, 0), start + 5).join(' '), end, landed: series.slice(Math.max(end - 3, 0), end + 5).join(' '), worst: Math.max(...series) });
    }
    return out;
  }, { at, ids });
  for (const x of r) log(JSON.stringify(x));
};
