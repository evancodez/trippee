// A stretch of a film up close: a row of close frames, and a time-slice (the middle row of the picture, one line per frame) under it, with the breaths marked. A still proves nothing about a move.
//   SONG=disclosure FROM=30 SECS=20 node tools/lab.mjs tests/formclose.mjs --out lab-out/form
const sleep = ms => new Promise(r => setTimeout(r, ms));
export default async ({ page, log, save }) => {
  const song = process.env.SONG || 'disclosure', from = +(process.env.FROM || 30), secs = +(process.env.SECS || 20), name = process.env.NAME || `${song}-${from}`;
  await page.eval(`app.manual=true;window.__done=false;trippee.song('/media/${song}.mp3',{autoplay:false}).then(()=>window.__done=true);0`);
  for (let i = 0; i < 1800; i++) { if (await page.eval('window.__done')) break; await sleep(200); }
  const r = await page.eval(async ({ from, secs }) => {
    const here = u => new URL(u, location.href).href;
    const { getRig, shot } = await import(here('src/music/rehearse.js'));
    const R = await getRig(), S = app.song.score, M = S.react.M, W = 320, H = 180, px = new Uint8Array(W * H * 4);
    const cols = 10, rows = 2, slW = 1600, FPS = 30, n = secs * FPS, slH = 220;
    const c = document.createElement('canvas'); c.width = slW; c.height = rows * 90 + 2 * slH + 40;
    const g = c.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, c.width, c.height);
    const tmp = new OffscreenCanvas(W, H), tg = tmp.getContext('2d');
    const flip = () => { const d = tg.createImageData(W, H); for (let y = 0; y < H; y++) d.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); tg.putImageData(d, 0, 0); };
    g.font = '11px monospace';
    for (let i = 0; i < cols * rows; i++) {
      const t = from + secs * i / (cols * rows), f = shot(R, S, t, W, H, px); flip();
      const x = (i % cols) * 160, y = (i / cols | 0) * 90;
      g.drawImage(tmp, x, y, 159, 89);
      g.fillStyle = '#000'; g.fillRect(x, y, 90, 13); g.fillStyle = f.kind ? '#6f6' : '#fc0'; g.fillText(`${t.toFixed(1)} ${f.kind ?? ''}`, x + 2, y + 10);
    }
    // time-slices: x is time, y is the middle column; and the middle row
    const y0 = rows * 90 + 20, imgs = [g.createImageData(slW, slH), g.createImageData(slW, slH)], whites = [];
    for (let i = 0; i < n; i++) {
      const t = from + i / FPS; shot(R, S, t, W, H, px);
      const x0 = Math.floor(i * slW / n), x1 = Math.floor((i + 1) * slW / n);
      let w = 0; for (let k = 1; k < px.length; k += 16) if (px[k] > 127) w++;
      whites.push(w / (px.length / 16));
      for (let x = x0; x < x1; x++) {
        for (let y = 0; y < slH; y++) {
          const a = px[((Math.floor(y * H / slH)) * W + (W >> 1)) * 4 + 1], b = px[((H >> 1) * W + Math.floor(y * W / slH)) * 4 + 1];
          const p0 = (y * slW + x) * 4;
          imgs[0].data[p0] = imgs[0].data[p0 + 1] = imgs[0].data[p0 + 2] = a; imgs[0].data[p0 + 3] = 255;
          imgs[1].data[p0] = imgs[1].data[p0 + 1] = imgs[1].data[p0 + 2] = b; imgs[1].data[p0 + 3] = 255;
        }
      }
      if (i % 30 === 0) await new Promise(r => setTimeout(r));
    }
    g.putImageData(imgs[0], 0, y0); g.putImageData(imgs[1], 0, y0 + slH + 2);
    // the breaths in red, rests in blue, landings in green, on the strip between
    const X = t => (t - from) / secs * slW;
    for (const b of M.breath.t) if (b >= from && b < from + secs) { g.fillStyle = '#f33'; g.fillRect(X(b), y0 - 18, 2, 18); }
    for (const r of M.rests) if (r.b >= from && r.a < from + secs) { g.fillStyle = '#39f'; g.fillRect(X(r.a), y0 - 12, X(r.b) - X(r.a), 6); }
    for (const G of S.gestures) if (G.t1 >= from && G.t1 < from + secs) { g.fillStyle = '#3f3'; g.fillRect(X(G.t1), y0 - 18, 4, 10); g.fillRect(X(G.t1 - G.morph), y0 - 6, 4, 6); }
    // white
    g.strokeStyle = '#f80'; g.beginPath(); whites.forEach((w, i) => { const x = i * slW / n, y = y0 + 2 * slH + 2 - 80 * w; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    return { url: c.toDataURL('image/jpeg', 0.85), gestures: S.gestures.filter(G => G.t1 > from && G.t0 < from + secs).map(G => `${G.pattern.id} ${G.t0.toFixed(1)}-${G.t1.toFixed(1)} morph ${G.morph.toFixed(1)}`) };
  }, { from, secs });
  save(`${name}.close.jpg`, r.url); log(r.gestures.join('; '));
};
