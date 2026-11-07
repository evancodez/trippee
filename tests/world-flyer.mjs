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
  // FAST: not waiting for the rehearsal, for a look at what's composed.
  if (stages.includes('clicks')) {
    // The way a person gets there, in real time: the change of world, frames running, nothing stepped by hand.
    await page.eval(`app.governor.enabled=false;document.querySelector('#hints [data-ok]')?.click();app.stage.setWorld('flyer')`);
    for (let k = 0; k < 200; k++) { await sleep(300); if (await page.eval(`app.stage.world?.id==='flyer'&&!app.stage.score.handover`)) break; }
    log('in', await page.eval(`app.stage.world?.id+' '+app.t.toFixed(1)`));
  } else if (process.env.FAST && song) {
    await page.eval(async () => { const T = window.trippee, stage = app.stage; let began = null; stage.setWorld('flyer', { dur: 1 }).then(v => { began = v; }); for (let i = 0; i < 4000 && began === null; i++) { T.step(1 / 60); await new Promise(r => setTimeout(r, 5)); } const wp = app.R.worldPrograms.get(stage.world); await wp.whenAll; stage.score.handover = null; app.manual = true; app.governor.enabled = false; app.R.drawScale = 1; app.song.pause?.(); T.seek(0); });
  } else await enterWorld(page, 'flyer', log);
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
        for (const t of (only ? [26, 60] : [9, 63])) { T.seek(t); await new Promise(r => setTimeout(r, 20)); T.seek(t); out.push({ url: grab(426, 240), label: `${p.id} ${t}` }); }
      }
      return out;
    }, { only, grabS: grab.toString() }).catch(async e => { log('sheet failed', e.message); return []; });
    log('patterns', r.length / 2);
    const cols = 6;
    for (let i = 0; i < r.length; i += cols * 6) save(`sheet${i / (cols * 6)}.jpg`, await page.eval(sheetInPage, { items: r.slice(i, i + cols * 6), cols, tw: 426, th: 240 }));
    log(errs().slice(0, 6));
  }

  if (stages.includes('pure')) {
    // The same moments, in order, shuffled, and in order again: the same pixels each time. Colour and all.
    const r = await page.eval(async () => {
      const T = window.trippee, gl = app.R.gl, W = T.canvas.width, H = T.canvas.height, dur = app.song?.duration ?? 120, px = new Uint8Array(W * H * 4);
      const times = Array.from({ length: 24 }, (_, i) => +((i + 0.37) * dur / 24).toFixed(3));
      const hash = t => { T.seek(t); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); let h = 2166136261; for (let i = 0; i < px.length; i += 37) h = Math.imul(h ^ px[i], 16777619); return h >>> 0; };
      const run = o => { const a = {}; for (const i of o) { hash(times[i]); a[i] = hash(times[i]); } return a; };
      const ids = times.map((_, i) => i), A = run(ids), s = ids.slice().sort((x, y) => (x * 7) % 11 - (y * 7) % 11), B = run(s), C = run(ids);
      return { bad: ids.filter(i => A[i] !== B[i]).map(i => times[i]), again: ids.filter(i => B[i] !== C[i]).map(i => times[i]), n: ids.length };
    });
    log('pure', JSON.stringify(r));
  }

  if (stages.includes('at')) {
    // AT=39.8,92.5  a strip of 18 frames, STEP apart (default a sixtieth), around each, with the frame's mean step.
    const ats = process.env.AT.split(',').map(Number), step = +(process.env.STEP ?? 1 / 60), n = +(process.env.NF ?? 18);
    for (const at of ats) {
      const r = await page.eval(async ({ at, step, n, grabS }) => {
        window.__OFF = (await import(new URL('src/pattern/layout.js', location.href).href)).OFF;
        const T = window.trippee, grab = (0, eval)(`(${grabS})`), out = [], c = document.createElement('canvas'); c.width = 96; c.height = 54; const g = c.getContext('2d', { willReadFrequently: true }); let prev = null;
        for (let i = 0; i < n; i++) { const t = at + (i - n / 2) * step; T.seek(t); await new Promise(r => setTimeout(r, 10)); T.seek(t); g.drawImage(T.canvas, 0, 0, 96, 54); const d = g.getImageData(0, 0, 96, 54).data; let sum = 0; if (prev) for (let k = 0; k < d.length; k += 4) sum += Math.abs(d[k] - prev[k]) + Math.abs(d[k + 1] - prev[k + 1]) + Math.abs(d[k + 2] - prev[k + 2]); prev = d; out.push({ url: grab(426, 240), label: `${t.toFixed(3)} d${(sum / (3 * 96 * 54)).toFixed(1)} ${app.lastFrame?.G?.pattern?.id?.slice(6)} ${app.lastFrame?.kind ?? ''} x${(app.stage.score.flyer?.driveAt(t) ?? 0).toFixed(2)} r${(app.R.slotA[window.__OFF?.rot] ?? 0).toFixed(2)} rl${(app.R.slotA[window.__OFF?.['cam.roll']] ?? 0).toFixed(2)} s${(app.R.slotA[window.__OFF?.scale] ?? 0).toFixed(2)}` }); }
        return out;
      }, { at, step, n, grabS: grab.toString() });
      save(`at-${at}.jpg`, await page.eval(sheetInPage, { items: r, cols: 6, tw: 426, th: 240 }));
      log(at, r.map(x => x.label.split(' ')[1]).join(' '));
    }
    log(errs().slice(0, 6));
  }

  if (stages.includes('film')) {
    const from = +(process.env.FROM ?? 20), to = +(process.env.TO ?? 80), step = +(process.env.STEP ?? 2.5);
    const r = await page.eval(async ({ from, to, step, grabS }) => {
      const T = window.trippee, grab = (0, eval)(`(${grabS})`), out = [];
      for (let t = from; t < to; t += step) { T.seek(t); await new Promise(r => setTimeout(r, 15)); T.seek(t); out.push({ url: grab(426, 240), label: `${t.toFixed(1)} ${app.lastFrame?.G?.pattern?.id?.slice(6)} ${app.lastFrame?.kind ?? ''}` }); }
      return out;
    }, { from, to, step, grabS: grab.toString() });
    save(`film-${from}.jpg`, await page.eval(sheetInPage, { items: r, cols: 6, tw: 426, th: 240 }));
    log(errs().slice(0, 6));
  }

  if (stages.includes('lands')) {
    const r = await page.eval(async ({ grabS, want }) => {
      const T = window.trippee, grab = (0, eval)(`(${grabS})`), S = app.stage.score, g = S.gestures, out = [], kinds = {};
      for (const G of g) G.plan = G.planFor = G.planning = null;
      for (let i = 0; i + 1 < g.length && out.length < want * 7; i++) {
        const G = g[i], t0 = G.t1 - (G.morph || 0);
        if (!G.morph) continue;
        for (const u of [-0.05, 0.14, 0.3, 0.5, 0.7, 0.86, 1.03]) { const t = t0 + u * G.morph; T.seek(t); await new Promise(r => setTimeout(r, 12)); T.seek(t); out.push({ url: grab(300, 169), label: u === 0.14 ? `${G.pattern.id.slice(6)}>${g[i + 1].pattern.id.slice(6)}` : u === 0.5 ? `${app.lastFrame?.kind ?? ''} ${t.toFixed(1)} D${G.morph.toFixed(1)}` : '' }); }
      }
      for (const G of g) { const k = G.plan?.kind ?? G.xform?.id ?? '-'; kinds[k] = (kinds[k] ?? 0) + 1; }
      const F = S.flyer, A = app.song.analysis;
      const heard = F ? { wave: A.x?.wave?.share, hits: F.hits.length, every: F.every, snares: F.snares.length, fills: F.fills.length, whoa: F.whoa && +F.whoa.t.toFixed(1), plan: F.plan.map(p => `${p.t.toFixed(0)}:${p.e}`).join(' '), driveAvg: +(Array.from({ length: 60 }, (_, i) => F.driveAt(A.duration * i / 60)).reduce((x, y) => x + y, 0) / 60).toFixed(2) } : null;
      return { heard, out, kinds, n: g.length, ids: g.map(G => G.pattern.id.slice(6)).join(' '), moves: g.map(G => (G.moves ?? []).map(m => m.id).join('+')).join(' ') };
    }, { grabS: grab.toString(), want: +(process.env.N ?? 14) });
    log('kinds', JSON.stringify(r.kinds), 'gestures', r.n);
    log('heard', JSON.stringify(r.heard));
    log(r.ids); log(r.moves);
    for (let i = 0; i < r.out.length; i += 7 * 12) save(`lands${i / (7 * 12)}.jpg`, await page.eval(sheetInPage, { items: r.out.slice(i, i + 7 * 12), cols: 7, tw: 300, th: 169 }));
    log(errs().slice(0, 6));
  }

  if (stages.includes('clicks')) {
    // The library, opened by its own key or button, and every tile clicked with real input.
    log('frames run', await page.eval(async () => { const a = app.t; await new Promise(r => setTimeout(r, 1000)); return [a, app.t]; }));
    const n = await page.eval(async () => { const L = app.ui.library; L.show(true); await new Promise(r => setTimeout(r, 800)); return app.stage.world._pool.length; });
    const tile = i => page.eval(i => { const L = app.ui?.library ?? app.library, p = app.stage.world._pool[i], t = L.tiles.get(p.id); if (!t) return null; t.b.scrollIntoView({ block: 'center' }); const r = t.b.getBoundingClientRect(); return { id: p.id, x: r.x + r.width / 2, y: r.y + r.height / 2, vis: r.width > 0 }; }, i);
    let ok = 0; const bad = [];
    for (let i = 0; i < n; i++) {
      const t = await tile(i);
      if (!t?.vis) { bad.push(`${i} no tile`); continue; }
      if (i === 0) { log('under the pointer', await page.eval(({ x, y }) => { const e = document.elementFromPoint(x, y); return `${e?.tagName}.${e?.className} manual ${app.manual} t ${app.t}`; }, t)); await page.shot('clicks0'); }
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: t.x, y: t.y });
      await sleep(40);
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: t.x, y: t.y, button: 'left', clickCount: 1 });
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: t.x, y: t.y, button: 'left', clickCount: 1 });
      let landed = false, was = null;
      for (let k = 0; k < 260 && !landed; k++) { await sleep(60); was = await page.eval(id => { const f = app.lastFrame; return { on: f?.G?.pattern?.id, wait: !!app.stage.score.handover, kind: f?.kind, t: +app.t.toFixed(1) }; }, t.id); landed = was.on === t.id && !was.wait; }
      if (landed) ok++; else bad.push(`${t.id}: ${JSON.stringify(was)}`);
      if (i % 8 === 0) log('clicked', i, t.id, landed, JSON.stringify(was));
    }
    log(`clicks: ${ok}/${n} landed`, bad.slice(0, 10));
    log(errs().slice(0, 6));
  }
};
