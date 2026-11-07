// A few moments of a film, large. Muted.   SONG=mgmt AT=68,70.5 node tools/lab.mjs tests/camfull.mjs --out lab-out/cam
const draw = async ({ times, W, H, cols }) => {
  const { getRig, shot } = await import(new URL('src/music/rehearse.js', location.href).href);
  const R = await getRig(), S = app.song.score, big = new Uint8Array(W * H * 4), tmp = new OffscreenCanvas(W, H), tg = tmp.getContext('2d');
  const rows = Math.ceil(times.length / cols), c = document.createElement('canvas'); c.width = cols * W; c.height = rows * H;
  const g = c.getContext('2d');
  times.forEach((t, i) => {
    const f = shot(R, S, t, W, H, big), d = tg.createImageData(W, H);
    for (let r = 0; r < H; r++) d.data.set(big.subarray((H - 1 - r) * W * 4, (H - r) * W * 4), r * W * 4);
    tg.putImageData(d, 0, 0); g.drawImage(tmp, (i % cols) * W, Math.floor(i / cols) * H);
    g.fillStyle = '#f33'; g.font = 'bold 14px monospace'; g.fillText(`${t} ${f.G.pattern.id} ${f.kind ?? ''}`, (i % cols) * W + 4, Math.floor(i / cols) * H + 16);
  });
  return c.toDataURL('image/jpeg', 0.9);
};
export default async ({ page, log, save, sleep }) => {
  const song = process.env.SONG || 'mgmt', times = (process.env.AT || '68').split(',').map(Number);
  await page.eval(`app.manual=true;window.__done=false;window.__err=null;trippee.song('/media/${song}.mp3',{autoplay:false,seed:${process.env.SEED || 7}}).then(()=>window.__done=true,e=>window.__err=String(e));0`);
  for (let i = 0; i < 3000; i++) { if (await page.eval('window.__done||!!window.__err')) break; await sleep(200); }
  save(`${song}-${times[0]}.jpg`, await page.eval(draw, { times, W: +(process.env.W || 800), H: +(process.env.H || 450), cols: +(process.env.COLS || 2) }));
  log(await page.eval(() => JSON.stringify(app.song.score.camera?.plan ?? null)));
};
