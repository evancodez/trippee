// What a film wears: its tricks by time, and sheets to look at them with. Muted: the song never plays.
//   SONGS=mgmt SEEDS=7,8 FAST=1 node tools/lab.mjs tests/woah.mjs --out lab-out/woah           the list. FAST=1: no flash guard, no range: the casting, in seconds
//   SHEET=1                                                                                     the whole film on one sheet, a frame every EVERY seconds (default 2): <song>-<seed>.film.jpg
//   WORLD=flower                                                                                a world's film, in colour
//   DENSE=1                                                                                     each trick's way in and way out, close: <song>-<seed>-dense.jpg
import { enterWorld } from '../tools/look.mjs';
const sheet = async ({ title, items, cols, tw, th, colour = false }) => {
  const { getRig, shot } = await import(new URL('src/music/rehearse.js', location.href).href);
  const R = await getRig(), S = app.song.score, W2 = 480, H2 = 270, big = new Uint8Array(W2 * H2 * 4), tmp = new OffscreenCanvas(W2, H2), tg = tmp.getContext('2d');
  const top = 22, rows = Math.ceil(items.length / cols), c = document.createElement('canvas');
  c.width = cols * tw; c.height = top + rows * (th + 13);
  const g = c.getContext('2d');
  g.fillStyle = '#161616'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff'; g.font = 'bold 13px monospace'; g.fillText(title, 6, 16);
  const list = S.woah?.list ?? [];
  for (let i = 0; i < items.length; i++) {
    const t = items[i], x = (i % cols) * tw, y = top + Math.floor(i / cols) * (th + 13), f = shot(R, S, t, W2, H2, big, colour), G = f.G;
    const d = tg.createImageData(W2, H2);
    for (let r = 0; r < H2; r++) d.data.set(big.subarray((H2 - 1 - r) * W2 * 4, (H2 - r) * W2 * 4), r * W2 * 4);
    tg.putImageData(d, 0, 0);
    g.imageSmoothingQuality = 'high';
    g.drawImage(tmp, x + 1, y + 13, tw - 2, th - 2);
    const tr = list.find(q => t >= q.t0 && t <= q.t1);
    g.fillStyle = tr ? '#ffd23c' : f.kind ? '#7dff9b' : '#bbb'; g.font = '10px monospace';
    g.fillText(`${t.toFixed(1)} ${tr ? tr.id : f.kind ? f.kind : (G.moves?.[0]?.id ?? G.hero ?? '')} ${(G.pattern.id).split('.').pop().slice(0, 8)}`, x + 2, y + 10);
    if (i % 6 === 0) await new Promise(res => setTimeout(res));
  }
  return c.toDataURL('image/jpeg', 0.8);
};
export default async ({ page, log, save, sleep }) => {
  const songs = (process.env.SONGS || 'mgmt,ppp,wildflower,disclosure').split(','), seeds = (process.env.SEEDS || '7').split(',').map(Number), url = await page.eval('location.href');
  const FAST = process.env.FAST === '1', EVERY = +(process.env.EVERY || 2);
  let first = true;
  for (const song of songs) for (const seed of seeds) {
    if (!first) await page.goto(url);
    first = false;
    for (let i = 0; i < 200; i++) { let ok = false; try { ok = await page.eval('window.trippee?.ready===true'); } catch { /* still navigating */ } if (ok) break; await sleep(250); }
    if (FAST) await page.eval(async () => { const F = await import(new URL('src/score/flags.js', location.href).href); F.setFlag('flashGuard', false); F.setFlag('range', false); });
    await page.eval(`app.manual=true;window.__done=false;window.__err=null;trippee.song('/media/${song}.mp3',{autoplay:false,seed:${seed}}).then(()=>window.__done=true,e=>window.__err=String(e));0`);
    for (let i = 0; i < 3000; i++) { if (await page.eval('window.__done||!!window.__err')) break; await sleep(200); }
    const err = await page.eval('window.__err');
    if (err) throw new Error(err);
    if (process.env.WORLD) await enterWorld(page, process.env.WORLD, log);
    const info = await page.eval(() => {
      const S = app.song.score, W = S.woah, g = S.gestures;
      return { dur: app.song.analysis.duration, register: S.pace?.register, cast: S.stats?.cast, climax: S.pace?.climaxAt, idea: W?.climaxIdea, lean: W?.take, tricks: (W?.list ?? []).map(x => `${x.at.toFixed(0).padStart(4)} ${x.kind[0]} ${x.id.padEnd(9)} ${(x.t1 - x.t0).toFixed(0).padStart(3)}s ${x.pattern.padEnd(20)} ${x.climax ? 'CLIMAX ' : ''}${x.again ? 'again ' : ''}${x.answers ? 'answers ' + x.answers + ' ' : ''}[${x.why}]`),
        gestures: g.length, glist: g.slice(0, -1).map(G => `${G.t0.toFixed(1).padStart(6)}-${G.t1.toFixed(1).padEnd(6)} m${(G.morph || 0).toFixed(1).padEnd(5)} ${G.pattern.id.padEnd(20)} ${(G.part?.way ?? '').padEnd(6)} ${G.hero ?? ''} ${G.xform?.id ?? ''} [${(G.moves ?? []).map(m => m.id).join(',')}]`), refused: S.refused ?? [], rehearsal: app.song.rehearsal ? { s: +app.song.rehearsal.seconds?.toFixed(1), left: app.song.rehearsal.flash?.left } : null, segs: app.song.analysis.segments.map(s => `${s.label}${s.visit || ''}@${s.t0.toFixed(0)}`).join(' ') };
    });
    log(`\n=== ${song} seed ${seed}: ${info.dur.toFixed(0)} s, ${info.register}, ${info.gestures} gestures, climax ${info.climax?.toFixed(0)} idea ${info.idea}. Heroes: ${info.cast}\n  ${info.segs}`);
    for (const x of info.tricks) log('  ' + x);
    if (process.env.GL) for (const x of info.glist) log('   ' + x);
    if (!FAST) log('  guard', JSON.stringify(info.rehearsal), 'refused', info.refused.length, JSON.stringify(info.refused.slice(0, 30)));
    if (process.env.SHEET) {
      const items = []; for (let t = 1; t < info.dur; t += EVERY) items.push(t);
      save(`${song}-${seed}.film.jpg`, await page.eval(`(${sheet.toString()})(${JSON.stringify({ title: `${song} seed ${seed} every ${EVERY}s`, items, cols: 12, tw: 160, th: 90, colour: !!process.env.WORLD })})`));
    }
    if (process.env.DENSE) {
      const list = await page.eval(() => (app.song.score.woah?.list ?? []).map(x => [x.t0, x.t1, x.id, x.at]));
      const items = [];
      for (const [a, b] of list) { for (let k = 0; k < 6; k++) items.push(a - 1 + k * 1.2); for (let k = 0; k < 6; k++) items.push(b - 5 + k * 1.2); }
      save(`${song}-${seed}-dense.jpg`, await page.eval(`(${sheet.toString()})(${JSON.stringify({ title: `${song} seed ${seed}: each trick, in and out`, items, cols: 12, tw: 160, th: 90 })})`));
    }
  }
  const errors = page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  if (errors.length) log('errors', errors.slice(0, 10));
};
