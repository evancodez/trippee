// One language on one pattern, as close frames: for looking at what a move really is. Muted, on a real song's bars, with no sound.
//   SONG=mgmt LOOK=sweep:checks.cloth,plate:lattice.master FROM=60 LEN=24 EVERY=.5 node tools/lab.mjs tests/camlang.mjs --out lab-out/cam
const sheet = async ({ lang, id, from, len, every, cols, tw, th, cap }) => {
  const { getRig, shot } = await import(new URL('src/music/rehearse.js', location.href).href);
  const { wearCamera } = await import(new URL('src/score/camera.js', location.href).href);
  const { OFF } = await import(new URL('src/pattern/layout.js', location.href).href);
  const R = await getRig(), W2 = 480, H2 = 270, big = new Uint8Array(W2 * H2 * 4), tmp = new OffscreenCanvas(W2, H2), tg = tmp.getContext('2d');
  const F = app.song.score, A = app.song.analysis, p = app.byId[id];
  const G = { t0: 0, t1: 3600, arcEnd: 22, pattern: p, phiTrack: null };
  const S = { ...F, gestures: [G], handover: null, camera: null };
  wearCamera(S, A, F.react.M, 7, { lang });
  const items = []; for (let t = from; t < from + len; t += every) items.push(t);
  const top = 22, rows = Math.ceil(items.length / cols), c = document.createElement('canvas'); c.width = cols * tw; c.height = top + rows * (th + cap);
  const g = c.getContext('2d'); g.fillStyle = '#161616'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#fff'; g.font = 'bold 13px monospace'; g.fillText(`${lang} on ${id}, a frame every ${every} s`, 6, 16);
  for (let i = 0; i < items.length; i++) {
    const t = items[i], x = (i % cols) * tw, y = top + Math.floor(i / cols) * (th + cap), f = shot(R, S, t, W2, H2, big), Z = R.slotA;
    const d = tg.createImageData(W2, H2); for (let r = 0; r < H2; r++) d.data.set(big.subarray((H2 - 1 - r) * W2 * 4, (H2 - r) * W2 * 4), r * W2 * 4);
    tg.putImageData(d, 0, 0); g.drawImage(tmp, x + 1, y + cap, tw - 2, th - 2);
    g.fillStyle = '#bbb'; g.font = '10px monospace'; g.fillText(`${t.toFixed(1)} s${Z[OFF.scale].toFixed(2)} p${Z[OFF['cam.pitch']].toFixed(2)} r${Z[OFF.rot].toFixed(1)}`, x + 2, y + 9);
    if (i % 8 === 0) await new Promise(res => setTimeout(res));
  }
  return c.toDataURL('image/jpeg', 0.82);
};
export default async ({ page, log, save, sleep }) => {
  const song = process.env.SONG || 'mgmt', from = +(process.env.FROM || 60), len = +(process.env.LEN || 24), every = +(process.env.EVERY || 0.5);
  await page.eval(`app.manual=true;window.__done=false;window.__err=null;trippee.song('/media/${song}.mp3',{autoplay:false,seed:7}).then(()=>window.__done=true,e=>window.__err=String(e));0`);
  for (let i = 0; i < 3000; i++) { if (await page.eval('window.__done||!!window.__err')) break; await sleep(200); }
  const err = await page.eval('window.__err'); if (err) throw new Error(err);
  for (const pair of (process.env.LOOK || 'sweep:checks.cloth').split(',')) {
    const [lang, id] = pair.split(':');
    save(`${lang}-${id}.jpg`, await page.eval(sheet, { lang, id, from, len, every, cols: 8, tw: 220, th: 124, cap: 11 }));
    log(lang, id);
  }
};
