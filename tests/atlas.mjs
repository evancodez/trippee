// Every pattern at the middle of its move, on one sheet: node tools/lab.mjs tests/atlas.mjs --out lab-out/me
export default async ({ page, save, log }) => {
  const r = await page.eval(async () => {
    const T = window.trippee, list = T.list(), cols = 6, tw = 232, th = 130;
    const rows = Math.ceil(list.length * 3 / cols);
    const c = document.createElement('canvas'); c.width = cols * tw; c.height = rows * th;
    const g = c.getContext('2d'); g.fillStyle = '#333'; g.fillRect(0, 0, c.width, c.height);
    let i = 0;
    for (const p of list) for (const u of [0.1, 0.5, 0.9]) {
      T.still(p.id, u);
      const x = (i % cols) * tw, y = Math.floor(i / cols) * th;
      g.drawImage(T.canvas, x + 1, y + 1, tw - 2, th - 2);
      g.fillStyle = '#e22'; g.font = '11px monospace'; g.fillText(p.id, x + 4, y + 12);
      i++;
    }
    return { url: c.toDataURL('image/jpeg', 0.8), n: list.length };
  });
  save('atlas.jpg', r.url);
  log('patterns:', r.n);
};
