// A whole song on one sheet, or a stretch of it in close frames, as the rehearsal's own eyes draw them: for looking at a film's pace with your own eyes. Muted: the song never plays.
//
//   SONGS=mgmt node tools/lab.mjs tests/pacestrip.mjs --out lab-out/pace                 a frame every 2 bars, the whole song: <song>.film.jpg
//   SONGS=mgmt AT=151-193 EVERY=.5 ...                                                   close frames across a stretch, EVERY bars apart: <song>-151.jpg
//   SEED=81144 ...                                                                       another take.    LAB_URL=http://localhost:5313/?pace=0  the old film
const sheet = async ({ title, items, cols, tw, th, cap }) => {
  const { getRig, shot } = await import(new URL('src/music/rehearse.js', location.href).href);
  const R = await getRig(), S = app.song.score, W2 = 480, H2 = 270, big = new Uint8Array(W2 * H2 * 4), tmp = new OffscreenCanvas(W2, H2), tg = tmp.getContext('2d');
  const top = 26, rows = Math.ceil(items.length / cols), c = document.createElement('canvas');
  c.width = cols * tw; c.height = top + rows * (th + cap);
  const g = c.getContext('2d');
  g.fillStyle = '#161616'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff'; g.font = 'bold 14px monospace'; g.fillText(title, 6, 18);
  const gi = t => { const L = S.gestures; let k = 0; for (let i = 0; i < L.length; i++) if (L[i].t0 <= t) k = i; return L[k]; };
  let lastG = null;
  for (let i = 0; i < items.length; i++) {
    const t = items[i], x = (i % cols) * tw, y = top + Math.floor(i / cols) * (th + cap), f = shot(R, S, t, W2, H2, big), G = f.G;
    const d = tg.createImageData(W2, H2);
    for (let r = 0; r < H2; r++) d.data.set(big.subarray((H2 - 1 - r) * W2 * 4, (H2 - r) * W2 * 4), r * W2 * 4);
    tg.putImageData(d, 0, 0);
    g.imageSmoothingQuality = 'high';
    g.drawImage(tmp, x + 1, y + cap, tw - 2, th - 2);
    const fresh = (f.from ?? G) !== lastG; lastG = f.from ?? G;
    g.fillStyle = f.kind ? '#7dff9b' : fresh ? '#ffd23c' : '#bbb'; g.font = '10px monospace';
    g.fillText(`${t.toFixed(1)} ${(G.pattern.id).split('.').pop().slice(0, 9)}${f.kind ? ' ' + f.kind.slice(0, 5) + ' ' + Math.round(f.T * 100) : ''}${G.part ? ' L' + G.part.level : ''}`, x + 2, y + 10);
    if (i % 8 === 0) await new Promise(res => setTimeout(res));
  }
  return c.toDataURL('image/jpeg', 0.82);
};

export default async ({ page, log, save, sleep }) => {
  const songs = (process.env.SONGS || 'ppp,wildflower,disclosure,mgmt').split(','), seed = +(process.env.SEED || 7), url = await page.eval('location.href');
  for (let k = 0; k < songs.length; k++) {
    const song = songs[k];
    if (k) { await page.goto(url); for (let i = 0; i < 200; i++) { let ok = false; try { ok = await page.eval('window.trippee?.ready===true'); } catch { /* still navigating */ } if (ok) break; await sleep(250); } }
    await page.eval(`app.manual=true;window.__done=false;window.__err=null;trippee.song('/media/${song}.mp3',{autoplay:false,seed:${seed}}).then(()=>window.__done=true,e=>window.__err=String(e));0`);
    for (let i = 0; i < 3000; i++) { if (await page.eval('window.__done||!!window.__err')) break; await sleep(200); }
    const err = await page.eval('window.__err');
    if (err) throw new Error(err);
    const { bar, dur } = await page.eval(() => ({ bar: app.song.score.react.M.bar, dur: app.song.analysis.duration }));
    const at = process.env.AT?.split('-').map(Number), every = +(process.env.EVERY || 2) * bar, items = [];
    for (let t = at ? at[0] : 0.2; t < (at ? at[1] : dur); t += every) items.push(t);
    const title = `${song} seed ${seed}${url.includes('pace=0') ? ' OLD' : ''}, a frame every ${(every / bar).toFixed(2)} bars (${every.toFixed(2)} s). Green: transforming. Yellow: a new gesture.`;
    save(at ? `${song}-${at[0]}.jpg` : `${song}.film.jpg`, await page.eval(sheet, { title, items, cols: at ? 8 : 12, tw: at ? 240 : 160, th: at ? 135 : 90, cap: 12 }));
    log(song, 'done', items.length, 'frames');
  }
};
