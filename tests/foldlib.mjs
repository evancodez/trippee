// The fold family in the real library: its tiles have folded pictures, and a real click on one flies there.
export default async ({ page, save, log }) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 240; i++) { if (await page.eval('typeof window.trippee !== "undefined" && window.trippee.ready === true')) break; await sleep(250); }
  const r = await page.eval(async () => {
    const lib = app.ui.library ?? app.ui.lib; if (!lib) return { err: 'no library on app.ui: ' + Object.keys(app.ui) };
    lib.show(true);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 300 && [...lib.tiles.values()].some(t => !t.done); i++) await sleep(250);
    const heads = [...lib.scroll.querySelectorAll('h3')].map(h => h.textContent), tiles = [...lib.tiles.values()].filter(t => t.p.family === 'folds');
    const cols = 5, tw = 264, th = 148, c = document.createElement('canvas'); c.width = cols * tw; c.height = Math.ceil(tiles.length / cols) * th; const g = c.getContext('2d');
    tiles.forEach((t, i) => { g.drawImage(t.c, (i % cols) * tw, (i / cols | 0) * th); g.fillStyle = '#f33'; g.font = '12px monospace'; g.fillText(`${t.p.id} ${t.done}`, (i % cols) * tw + 3, (i / cols | 0) * th + 13); });
    const url = c.toDataURL('image/jpeg', 0.85);
    tiles.find(t => t.p.id === 'folds.limit').b.click();
    await sleep(9000);
    const shown = app.lastFrame?.G?.pattern?.id, on = app.R.slotA[(await import('/src/pattern/layout.js')).OFF['sf.on']];
    return { url, heads: heads.slice(-4), n: tiles.length, done: tiles.filter(t => t.done).length, shown, on, kind: app.lastFrame?.kind };
  });
  if (r.err) { log(r.err); return; }
  save('library.jpg', r.url); delete r.url; log(JSON.stringify(r));
  const errs = page.logs.filter(l => /error|failed/i.test(l)).slice(0, 5); if (errs.length) log(errs.join('\n'));
};
