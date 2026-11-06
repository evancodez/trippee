// Where does a film flash, and why? Scans a whole film small and fast, the judge's way, and for every swing pair the judge would count says what was going on. Muted: the song never plays.
//   SONG=media/mgmt.mp3 node tools/lab.mjs tests/flash.mjs --out lab-out/repair         the whole film at 12 fps, and at 60 around each thing flagged
//   AT=204.5-206.2 EVERY=.1 ...                                                         close frames across a stretch, with their numbers, as <song>-<at>.jpg
//   FLAGS=lung=0,weight=0 SET=reactAmt=0 SEED=3                                         another configuration of the same film
import { resolve, basename } from 'node:path';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const r2 = x => +(+x).toFixed(2);
// The judge's count, in tools/look.mjs: opposing swings of at least 10% of full scale within a second.
function swingsOf(series) {
  const out = []; let dir = 0, pivot = series[0];
  series.forEach((v, i) => {
    if (dir >= 0 && v > pivot) { pivot = v; dir = 1; }
    if (dir <= 0 && v < pivot) { pivot = v; dir = -1; }
    if (dir === 1 && pivot - v >= 25.5) { out.push(i); dir = -1; pivot = v; }
    else if (dir === -1 && v - pivot >= 25.5) { out.push(i); dir = 1; pivot = v; }
  });
  return out;
}
function flashSpans(series, fps, times, limit) {
  const sw = swingsOf(series), spans = []; let worst = 0;
  for (let a = 0; a < sw.length; a++) { let b = a; while (b < sw.length && sw[b] - sw[a] < fps) b++; const n = Math.floor((b - a) / 2); worst = Math.max(worst, n); if (n > limit) spans.push({ t: times[sw[a]], n }); }
  return { worst, spans };
}
export default async ({ page, log, save }) => {
  const songPath = process.env.SONG || 'media/ppp.mp3', song = basename(songPath).replace(/\.\w+$/, '');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  const data = { items: [], files: [resolve(songPath)], dragOperationsMask: 1 };
  await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 320, y: 180, data });
  await page.send('Input.dispatchDragEvent', { type: 'drop', x: 320, y: 180, data });
  for (let i = 0; i < 1800; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await sleep(100); }
  await page.eval(async ({ flags, set, seed }) => {
    const F = await import(new URL('src/score/flags.js', location.href).href);
    for (const f of flags) { const [k, v] = f.split('='); F.setFlag(k, +v !== 0); }
    if (flags.length || seed) { const before = app.song.rehearsal; app.song.rebuild(seed ? { seed } : {}); for (let i = 0; i < 200 && app.song.rehearsal === before; i++) await new Promise(r => setTimeout(r, 100)); }
    for (const f of set) { const [k, v] = f.split('='); app.edits[k] = +v; }
    app.song.pause(); app.ui.song.show(false); app.manual = true; app.governor.enabled = false; app.R.drawScale = 1; app.t = 0;
    const c = document.createElement('canvas'); c.width = 320; c.height = 180; const x = c.getContext('2d', { willReadFrequently: true });
    window.__tiles = () => {
      x.drawImage(window.trippee.canvas, 0, 0, 320, 180); const d = x.getImageData(0, 0, 320, 180).data, W = 320, H = 180; let sum = 0, white = 0;
      const L_ = new Uint8Array(W * H); for (let k = 0; k < L_.length; k++) { const v = (d[k * 4] * 0.2126 + d[k * 4 + 1] * 0.7152 + d[k * 4 + 2] * 0.0722) | 0; L_[k] = v; sum += v; if (v > 127) white++; }
      const tiles = []; for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) { let s = 0, n = 0; for (let y = (ty * H / 4) | 0; y < ((ty + 1) * H / 4 | 0); y += 3) for (let X = (tx * W / 4) | 0; X < ((tx + 1) * W / 4 | 0); X += 3) { s += L_[y * W + X]; n++; } tiles.push(+(s / n).toFixed(1)); }
      return { mean: +(sum / L_.length).toFixed(2), white: +(white / L_.length).toFixed(4), tiles };
    };
  }, { flags: (process.env.FLAGS || '').split(',').filter(Boolean), set: (process.env.SET || '').split(',').filter(Boolean), seed: +(process.env.SEED || 0) });
  const info = await page.eval(() => { const s = app.song.score; return { duration: app.song.duration, gestures: s.gestures.map(G => ({ t0: +G.t0.toFixed(2), t1: +G.t1.toFixed(2), morph: +(G.morph || 0).toFixed(2), id: G.pattern.id, moves: (G.moves || []).map(m => m.id), xform: G.xform?.id })) }; });
  const reh = await page.eval(() => { const r = app.song.rehearsal; return r && { seconds: r.seconds, flash: r.flash, jumps: r.jumps?.length }; });
  log(`rehearsal ${reh?.seconds?.toFixed(2)} s, guard ${JSON.stringify(reh?.flash)}, jumps ${reh?.jumps}`);
  log(`${song}: ${info.duration.toFixed(1)} s, ${info.gestures.length} gestures`);
  log(info.gestures.map(g => `  ${g.t0}-${g.t1} morph ${g.morph} ${g.id} ${g.moves.join(',')} ${g.xform || ''}`).join('\n'));

  if (process.env.AT) {
    const [a, b] = process.env.AT.split('-').map(Number), every = +(process.env.EVERY || 0.1);
    const r = await page.eval(async ({ a, b, every }) => {
      const L = await import(new URL('src/pattern/layout.js', location.href).href), T = window.trippee, OFF = L.OFF;
      const n = Math.ceil((b - a) / every), cols = Math.min(12, n), tw = 192, th = 108, c = document.createElement('canvas'); c.width = cols * tw; c.height = Math.ceil(n / cols) * th; const g = c.getContext('2d'); g.font = '11px monospace';
      const rows = [];
      for (let i = 0; i < n; i++) {
        const t = a + i * every; T.seek(t); const v = window.__tiles(), f = app.lastFrame, A = app.R.slotA, B = app.R.slotB;
        g.drawImage(T.canvas, (i % cols) * tw, (i / cols | 0) * th, tw - 1, th - 1);
        const lab = `${t.toFixed(2)} ${v.mean.toFixed(0)} ${f.kind || ''} ${f.T ? f.T.toFixed(2) : ''}`;
        g.fillStyle = '#000'; g.fillRect((i % cols) * tw, (i / cols | 0) * th, g.measureText(lab).width + 4, 13); g.fillStyle = '#f33'; g.fillText(lab, (i % cols) * tw + 2, (i / cols | 0) * th + 10);
        rows.push({ t: +t.toFixed(3), mean: v.mean, white: v.white, kind: f.kind, T: +(f.T || 0).toFixed(3), c: f.c != null ? +f.c.toFixed(3) : null, id: f.G.pattern.id, N: f.N?.pattern?.id, theta: +A[OFF.theta].toFixed(3), scale: +A[OFF.scale].toFixed(3), rot: +A[OFF.rot].toFixed(3), f0: +A[OFF['f0.ph']].toFixed(3), f1: +A[OFF['f1.ph']].toFixed(3), f2: +A[OFF['f2.ph']].toFixed(3), freq: +A[OFF.freq].toFixed(3), d0: +A[OFF['f0.d']].toFixed(3), d1: +A[OFF['f1.d']].toFixed(3), lung: +app.R.frame[L.FRAME.pose * 4 + 14].toFixed(3), w: +app.R.frame[L.FRAME.weight * 4].toFixed(3) });
      }
      return { rows, url: c.toDataURL('image/jpeg', 0.85) };
    }, { a, b, every });
    save(`${song}-${a}.jpg`, r.url);
    for (const x of r.rows) log(JSON.stringify(x));
    return;
  }

  const FPS = +(process.env.FPS || 12);
  const res = await page.eval(async ({ duration, FPS }) => {
    const T = window.trippee, o = { mean: [], tiles: [], time: [], kinds: [], ids: [] }, N = Math.floor(duration * FPS);
    for (let i = 0; i < N; i++) {
      const t = i / FPS; T.seek(t); const v = window.__tiles();
      o.mean.push(v.mean); o.tiles.push(v.tiles); o.time.push(+t.toFixed(3)); o.kinds.push(app.lastFrame?.kind || ''); o.ids.push(app.lastFrame?.G?.pattern?.id);
      if (i % 40 === 0) await new Promise(r => setTimeout(r));
    }
    return o;
  }, { duration: info.duration, FPS });
  const whole = flashSpans(res.mean, FPS, res.time, 0);
  const tiles = Array.from({ length: 16 }, (_, k) => flashSpans(res.tiles.map(a => a[k]), FPS, res.time, 2));
  log(`FLASH ${song}: whole ${whole.worst} tile ${Math.max(...tiles.map(t => t.worst))}`);
  const spots = [...whole.spans.map(s => ({ ...s, who: 'whole' })), ...tiles.flatMap((t, k) => t.spans.map(s => ({ ...s, who: 't' + k })))].sort((a, b) => a.t - b.t);
  const merged = [];
  for (const s of spots) { const l = merged.at(-1); if (l && s.t < l.t1 + 1.2) { l.t1 = s.t; l.who.add(s.who); l.n = Math.max(l.n, s.n); } else merged.push({ t0: s.t, t1: s.t, who: new Set([s.who]), n: s.n }); }
  for (const m of merged) {
    const i = Math.round(m.t0 * FPS), G = info.gestures.find(g => g.t0 <= m.t0 && m.t0 < g.t1);
    log(`  ${r2(m.t0)}-${r2(m.t1)} x${m.n} ${[...m.who].slice(0, 8).join(',')} [${res.kinds[i]}] ${res.ids[i]}${G?.moves.length ? ' ' + G.moves.join(',') : ''}${G?.xform ? ' ' + G.xform : ''}`);
  }
};
