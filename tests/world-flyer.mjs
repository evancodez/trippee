// Flyer: every pattern as it looks, how each change goes, real clicks. Muted. Say STAGE=sheet,lands,clicks,film.
//   LAB_URL=http://localhost:5342/ STAGE=sheet node tools/lab.mjs tests/world-flyer.mjs --out lab-out/fly
//   STAGE=film SONG=media/mgmt.mp3 FROM=40 TO=70 ...          frames of a song's film, with what it's wearing
//   STAGE=lands SONG=media/mgmt.mp3 ...                       each landing of a film as a strip
//   STAGE=clicks ...                                          the library opened, each tile clicked with real input
import { resolve } from 'node:path';
import { dropSong, enterWorld } from '../tools/look.mjs';

const sheetInPage = async ({ items, cols, tw, th }) => {
  const rows = Math.ceil(items.length / cols), c = document.createElement('canvas'); c.width = cols * tw; c.height = rows * th;
  const g = c.getContext('2d'); g.font = '12px monospace';
  for (let i = 0; i < items.length; i++) {
    const im = new Image(); im.src = items[i].url; await im.decode();
    const x = (i % cols) * tw, y = ((i / cols) | 0) * th; g.drawImage(im, x, y, tw - 2, th - 2);
    if (items[i].label) { g.fillStyle = '#000'; g.fillRect(x, y, g.measureText(items[i].label).width + 6, 15); g.fillStyle = '#fff'; g.fillText(items[i].label, x + 3, y + 11); }
  }
  return c.toDataURL('image/jpeg', 0.86);
};
const grab = (tw, th) => { const c = document.createElement('canvas'); c.width = tw; c.height = th; c.getContext('2d').drawImage(window.trippee.canvas, 0, 0, tw, th); return c.toDataURL('image/jpeg', 0.85); };

export default async ({ page, log, save, sleep }) => {
  const stages = (process.env.STAGE || 'sheet').split(','), song = process.env.SONG;
  const size = (process.env.SIZE || '1280,720').split(',').map(Number);
  await page.send('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: 1, mobile: false });
  if (song) await dropSong(page, song, { resolvePath: resolve, sleep });
  await enterWorld(page, 'flyer', log);
  const errs = () => page.logs.filter(l => /\[error\]|\[exception\]/.test(l));

  if (stages.includes('sheet')) {
    // Each pattern on its own, with no song: two moments, one round and one square.
    const only = process.env.IDS?.split(',');
    const r = await page.eval(async ({ only, grabS }) => {
      const T = window.trippee, grab = (0, eval)(`(${grabS})`), stage = app.stage, W = stage.world, out = [];
      for (const p of W._pool) {
        if (only && !only.includes(p.id)) continue;
        const g = stage.score.gestures;
        g.length = 0; g.push({ t0: 0, t1: 3600, arcEnd: 44, period: 44, pattern: p, morph: 0, page: 0 });
        stage.score.handover = null;
        for (const t of [26, 60]) { T.seek(t); await new Promise(r => setTimeout(r, 20)); T.seek(t); out.push({ url: grab(426, 240), label: `${p.id} ${t}` }); }
      }
      return out;
    }, { only, grabS: grab.toString() }).catch(async e => { log('sheet failed', e.message); return []; });
    log('patterns', r.length / 2);
    const cols = 6;
    for (let i = 0; i < r.length; i += cols * 6) save(`sheet${i / (cols * 6)}.jpg`, await page.eval(sheetInPage, { items: r.slice(i, i + cols * 6), cols, tw: 426, th: 240 }));
    log(errs().slice(0, 6));
  }

  if (stages.includes('film')) {
    const from = +(process.env.FROM ?? 20), to = +(process.env.TO ?? 80), step = +(process.env.STEP ?? 2.5);
    const r = await page.eval(async ({ from, to, step, grabS }) => {
      const T = window.trippee, grab = (0, eval)(`(${grabS})`), out = [];
      for (let t = from; t < to; t += step) { T.seek(t); await new Promise(r => setTimeout(r, 15)); out.push({ url: grab(426, 240), label: `${t.toFixed(1)} ${app.lastFrame?.G?.pattern?.id?.slice(6)} ${app.lastFrame?.kind ?? ''}` }); }
      return out;
    }, { from, to, step, grabS: grab.toString() });
    save(`film-${from}.jpg`, await page.eval(sheetInPage, { items: r, cols: 6, tw: 426, th: 240 }));
    log(errs().slice(0, 6));
  }

  if (stages.includes('lands')) {
    const r = await page.eval(async ({ grabS, want }) => {
      const T = window.trippee, grab = (0, eval)(`(${grabS})`), S = app.stage.score, g = S.gestures, out = [], kinds = {};
      for (let i = 0; i + 1 < g.length && out.length < want * 7; i++) {
        const G = g[i], t0 = G.t1 - (G.morph || 0);
        if (!G.morph) continue;
        for (const u of [-0.05, 0.14, 0.3, 0.5, 0.7, 0.86, 1.03]) { const t = t0 + u * G.morph; T.seek(t); await new Promise(r => setTimeout(r, 12)); T.seek(t); out.push({ url: grab(300, 169), label: u === 0.14 ? `${G.pattern.id.slice(6)}>${g[i + 1].pattern.id.slice(6)}` : u === 0.5 ? `${app.lastFrame?.kind ?? ''} ${t.toFixed(1)} D${G.morph.toFixed(1)}` : '' }); }
      }
      for (const G of g) { const k = G.plan?.kind ?? G.xform?.id ?? '-'; kinds[k] = (kinds[k] ?? 0) + 1; }
      return { out, kinds, n: g.length, ids: g.map(G => G.pattern.id.slice(6)).join(' '), moves: g.map(G => (G.moves ?? []).map(m => m.id).join('+')).join(' ') };
    }, { grabS: grab.toString(), want: +(process.env.N ?? 14) });
    log('kinds', JSON.stringify(r.kinds), 'gestures', r.n);
    log(r.ids); log(r.moves);
    for (let i = 0; i < r.out.length; i += 7 * 12) save(`lands${i / (7 * 12)}.jpg`, await page.eval(sheetInPage, { items: r.out.slice(i, i + 7 * 12), cols: 7, tw: 300, th: 169 }));
    log(errs().slice(0, 6));
  }

  if (stages.includes('clicks')) {
    // The library, opened by its own key or button, and every tile clicked with real input.
    await page.eval(`app.manual=false;app.governor.enabled=false;document.querySelector('#hints [data-ok]')?.click();`);
    const n = await page.eval(async () => { const L = app.ui?.library ?? app.library; L.show(true); await new Promise(r => setTimeout(r, 500)); return app.stage.world._pool.length; });
    const tile = i => page.eval(i => { const L = app.ui?.library ?? app.library, p = app.stage.world._pool[i], t = L.tiles.get(p.id); if (!t) return null; t.b.scrollIntoView({ block: 'center' }); const r = t.b.getBoundingClientRect(); return { id: p.id, x: r.x + r.width / 2, y: r.y + r.height / 2, vis: r.width > 0 }; }, i);
    let ok = 0; const bad = [];
    for (let i = 0; i < n; i++) {
      const t = await tile(i);
      if (!t?.vis) { bad.push(`${i} no tile`); continue; }
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: t.x, y: t.y });
      await sleep(40);
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: t.x, y: t.y, button: 'left', clickCount: 1 });
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: t.x, y: t.y, button: 'left', clickCount: 1 });
      let landed = false, was = null;
      for (let k = 0; k < 260 && !landed; k++) { await sleep(60); was = await page.eval(id => { const f = app.lastFrame, G = app.stage.score.handover?.to ?? f?.G; return { on: f?.G?.pattern?.id, wait: !!app.stage.score.handover, kind: f?.kind }; }, t.id); landed = was.on === t.id && !was.wait; }
      if (landed) ok++; else bad.push(`${t.id}: ${JSON.stringify(was)}`);
      if (i % 8 === 0) log('clicked', i, t.id, landed, was?.kind);
    }
    log(`clicks: ${ok}/${n} landed`, bad.slice(0, 10));
    log(errs().slice(0, 6));
  }
};
