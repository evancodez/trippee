// The sheet in space, watched. Look at the sheets: no number says a floor is falling away.
//   PAIR=a,b VIA=flood D=14 [O='{"amp":.5}'] node tools/lab.mjs tests/space.mjs --out lab-out/s     a dense sheet across one transformation, with the frame just before and just after
//   LOAD=space.swell S=30 node tools/lab.mjs tests/space.mjs --out lab-out/s                       a dense sheet of one pattern moving
//   OVER='{"space.kind":1,...}' LOAD=lines.fall ...                                                any numbers on any pattern
import { resolve, basename } from 'node:path';
const E = process.env;
export default async ({ page, save, log }) => {
  const errs = () => page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  const cols = +(E.COLS || 6), rows = +(E.ROWS || 5), W = +(E.W || 320), H = Math.round(W * 9 / 16);
  const sheet = async (name, ts) => {
    const url = await page.eval(async ({ ts, cols, rows, W, H }) => {
      const T = window.trippee, app = T.app;
      app.governor.enabled = false; app.R.drawScale = 1;
      const c = document.createElement('canvas'); c.width = W * cols; c.height = H * rows; const g = c.getContext('2d');
      g.font = '12px monospace';
      ts.forEach((t, i) => {
        app.t = t; T.step(0);
        const x = (i % cols) * W, y = Math.floor(i / cols) * H;
        g.drawImage(T.canvas, x, y, W - 2, H - 2);
        g.fillStyle = '#000'; g.fillRect(x + 2, y + 2, 40, 14); g.fillStyle = '#f33'; g.fillText(t.toFixed(2), x + 4, y + 13);
      });
      return c.toDataURL('image/jpeg', 0.86);
    }, { ts, cols, rows, W, H });
    save(name, url);
    log('wrote', name);
  };
  const N = cols * rows;
  // A hand cut using all of it on a real song, the song's reaction on, muted. Whole-film scan for flashes at 20 fps, the judge's count: opposing swings of 10% of full scale in a second, none for the whole frame, two for a tile.
  if (E.MODE === 'film') {
    const songPath = E.SONG || 'media/mgmt.mp3';
    await page.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
    await new Promise(r => setTimeout(r, 300));
    const data = { items: [], files: [resolve(songPath)], dragOperationsMask: 1 };
    await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 320, y: 180, data });
    await page.send('Input.dispatchDragEvent', { type: 'drop', x: 320, y: 180, data });
    for (let i = 0; i < 1800; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await new Promise(r => setTimeout(r, 100)); }
    const made = await page.eval(async () => {
      const here = u => new URL(u, location.href).href, { applyCut } = await import(here('src/score/cut.js'));
      app.song.pause(); app.ui.song.show(false); app.manual = true; app.governor.enabled = false; app.R.drawScale = 1;
      const S = app.song.score, A = app.song.analysis, M = S.react.M, bars = Array.from(A.bars), near = t => bars.reduce((b, x) => (Math.abs(x - t) < Math.abs(b - t) ? x : b), bars[0]);
      const T = [0, 40, 64, 88, 112, 136, 160, 184].map(near);
      const shots = [
        { at: T[0], id: 'lines.river' },
        { at: T[1], from: T[1] - 8, via: 'flood', id: 'checks.crush', tail: 3 },
        { at: T[2], from: T[2] - 9, via: 'tube', id: 'lattice.master', tail: 4 },
        { at: T[3], from: T[3] - 7, via: 'drop', id: 'waves.silk', tail: 3, moves: [{ id: 'swell', lead: 5, coast: 5 }] },
        { at: T[4], from: T[4] - 6, via: 'pleat', id: 'space.pleats', tail: 3, moves: [{ id: 'pleats' }] },
        { at: T[5], id: 'space.crystal', moves: [{ id: 'slice' }] },
        { at: T[6], id: 'space.ride', moves: [{ id: 'ride', lead: 7, coast: 7 }] },
        { at: T[7], id: 'lines.fall' },
      ];
      applyCut(S, { hash: A.hash, name: 'space-test', shots }, A, M);
      return { T, refused: S.refused, gestures: S.gestures.map(G => [+G.t0.toFixed(1), +G.t1.toFixed(1), +(G.morph || 0).toFixed(1), G.pattern.id, G.xform?.id ?? '', (G.moves || []).map(m => m.id).join(',')].join(' ')), pulses: S.react.pulses?.length };
    });
    log(JSON.stringify(made, null, 0));
    const a = +(E.A ?? 20), b = +(E.B ?? 200);
    const r = await page.eval(async ({ a, b }) => {
      const T = window.trippee, c = document.createElement('canvas'); c.width = 320; c.height = 180; const x = c.getContext('2d', { willReadFrequently: true });
      const sheet = document.createElement('canvas'), W = 192, H = 108, cols = 12, n = Math.ceil((b - a) / 1.5); sheet.width = W * cols; sheet.height = H * Math.ceil(n / cols); const g = sheet.getContext('2d'); g.font = '11px monospace';
      const means = [], tiles = Array.from({ length: 16 }, () => []), ts = [], kinds = [];
      let i = 0, shot = 0;
      for (let t = a; t < b; t += 0.05, i++) {
        T.seek(t);
        x.drawImage(T.canvas, 0, 0, 320, 180); const d = x.getImageData(0, 0, 320, 180).data; const tile = new Float64Array(16); let sum = 0;
        for (let k = 0, y = 0; y < 180; y++) for (let X = 0; X < 320; X++, k += 4) { const v = d[k] * 0.2126 + d[k + 1] * 0.7152 + d[k + 2] * 0.0722; sum += v; tile[(y / 45 | 0) * 4 + (X / 80 | 0)] += v; }
        means.push(sum / 57600); tile.forEach((v, q) => tiles[q].push(v / 3600)); ts.push(+t.toFixed(2)); kinds.push(app.lastFrame?.kind || '');
        if (i % 30 === 0) { g.drawImage(T.canvas, (shot % cols) * W, (shot / cols | 0) * H, W - 1, H - 1); g.fillStyle = '#000'; g.fillRect((shot % cols) * W, (shot / cols | 0) * H, 80, 13); g.fillStyle = '#f33'; g.fillText(`${t.toFixed(1)} ${app.lastFrame?.kind || ''}`, (shot % cols) * W + 2, (shot / cols | 0) * H + 10); shot++; }
      }
      return { means, tiles, ts, kinds, url: sheet.toDataURL('image/jpeg', 0.8) };
    }, { a, b });
    save(`film-${basename(songPath)}.jpg`, r.url);
    const swings = series => { const o = []; let dir = 0, p = series[0]; series.forEach((v, i) => { if (dir >= 0 && v > p) { p = v; dir = 1; } if (dir <= 0 && v < p) { p = v; dir = -1; } if (dir === 1 && p - v >= 25.5) { o.push(i); dir = -1; p = v; } else if (dir === -1 && v - p >= 25.5) { o.push(i); dir = 1; p = v; } }); return o; };
    const spans = (series, limit) => { const sw = swings(series), out = []; let worst = 0; for (let i = 0; i < sw.length; i++) { let j = i; while (j < sw.length && sw[j] - sw[i] < 20) j++; const n = Math.floor((j - i) / 2); worst = Math.max(worst, n); if (n > limit) out.push([r.ts[sw[i]], n]); } return { worst, at: out.slice(0, 16) }; };
    log('whole', JSON.stringify(spans(r.means, 0)));
    const perTile = r.tiles.map(q => spans(q, 2)), worstTile = Math.max(...perTile.map(q => q.worst));
    log('tile worst', worstTile, JSON.stringify(perTile.flatMap(q => q.at).sort((p, q) => p[0] - q[0]).slice(0, 24)));
    const seen = {}; r.kinds.forEach(k => { seen[k] = (seen[k] || 0) + 1; }); log('kinds (frames at 20 fps)', JSON.stringify(seen));
    log('errors', errs().length, errs().slice(0, 3).join(' | ').slice(0, 1000));
    return;
  }
  // A pop is one frame much further from its neighbours than they are from theirs. Every transformation, on real pairs from the film's pool, at 60 fps across each end and 30 across the middle.
  if (E.MODE === 'pops') {
    const PAIRS = (E.PAIRS || 'checks.vega,lines.fall;lattice.master,body.planet;rooms.room,waves.dune;waves.silk,rooms.hall;lines.river,checks.crush;void.diamond,dots.inflate').split(';').map(p => p.split(','));
    for (const via of (E.VIAS || 'flood,drop,tube,pleat').split(',')) for (const [a, b] of PAIRS) {
      const r = await page.eval(async ({ a, b, via, D }) => {
        const T = window.trippee, app = T.app; app.governor.enabled = false; app.R.drawScale = 1;
        const c = document.createElement('canvas'); c.width = 240; c.height = 135; const g = c.getContext('2d', { willReadFrequently: true });
        const grab = () => { g.drawImage(T.canvas, 0, 0, 240, 135); return g.getImageData(0, 0, 240, 135).data; };
        const diff = (p, q) => { let d = 0; for (let i = 0; i < p.length; i += 4) d += Math.abs(p[i] - q[i]); return d / (p.length / 4); };
        T.morph(a, b, D, 1);
        const G = app.stage.score.gestures[0]; G.xform = { id: via }; delete G.plan; delete G.planFor; delete G.planning;
        app.t = 0; T.step(0); app.t = 0.9; T.step(0);
        const scan = (t0, t1, dt) => { const o = []; app.t = t0; T.step(0); let pv = grab(); for (let t = t0 + dt; t <= t1 + 1e-6; t += dt) { app.t = t; T.step(0); const f = grab(); o.push([+t.toFixed(3), +diff(pv, f).toFixed(2)]); pv = f; } return o; };
        const head = scan(0.8, 1.6, 1 / 60), mid = scan(1.6, 1 + D - 0.6, 1 / 30), tail = scan(1 + D - 0.6, 1 + D + 0.4, 1 / 60);
        const spike = list => { let best = [0, 0]; for (let i = 1; i < list.length - 1; i++) { const q = list[i][1] / Math.max(Math.max(list[i - 1][1], list[i + 1][1]), 0.5); if (q > best[1]) best = [list[i][0], +q.toFixed(2)]; } return best; };
        return { kind: G.plan?.kind, head: spike(head), mid: spike(mid), tail: spike(tail), most: Math.max(...head.concat(mid, tail).map(x => x[1])), top: head.concat(mid, tail).sort((p, q) => q[1] - p[1]).slice(0, 6) };
      }, { a, b, via, D: +(E.D || 12) });
      log(`${via} ${a}>${b}`, JSON.stringify(r));
    }
    log('errors', errs().length, errs().slice(0, 3).join(' | ').slice(0, 800));
    return;
  }
  // What a frame costs the GPU at this size, by the timer query, against a plain frame and a dive of the same two in the one page.
  if (E.MODE === 'cost') {
    const r = await page.eval(async ({}) => {
      const T = window.trippee, app = T.app, R = app.R; app.governor.enabled = false; R.drawScale = 1;
      const gl = R.gl, X = R.timer; if (!X) return { none: 1 };
      const measure = async setup => {
        setup(); const ms = [];
        for (let i = 0; i < 40; i++) {
          app.t += 1 / 120; T.step(0);
          gl.finish();
          const q = gl.createQuery(); gl.beginQuery(X.TIME_ELAPSED_EXT, q); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.endQuery(X.TIME_ELAPSED_EXT);
          await new Promise(res => { const w = () => (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) ? res() : setTimeout(w, 2)); w(); });
          ms.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q);
        }
        ms.sort((p, q) => p - q);
        return { ms: +ms[ms.length >> 1].toFixed(2), v: R.variant };
      };
      const morph = (via, at) => () => { T.morph('checks.vega', 'lines.fall', 14, 1); const G = app.stage.score.gestures[0]; G.xform = via ? { id: via } : undefined; delete G.plan; delete G.planFor; delete G.planning; app.t = 0; T.step(0); app.t = 1 + 14 * at; T.step(0); };
      const load = (id, at) => () => { T.load(id); app.t = at; T.step(0); };
      const out = {};
      out.plain = await measure(load('lines.fall', 5));
      out.plainAfter = await measure(load('lines.fall', 5));
      out.dive = await measure(morph(null, 0.5));
      for (const [via, at] of [['flood', 0.5], ['drop', 0.5], ['tube', 0.5], ['pleat', 0.5]]) out[via] = await measure(morph(via, at));
      for (const [id, at] of [['space.swell', 20], ['space.terraces', 20], ['space.pleats', 20], ['space.ride', 20], ['space.crystal', 20]]) out[id] = await measure(load(id, at));
      return out;
    }, {});
    log(JSON.stringify(r));
    return;
  }
  if (E.PAIR) {
    const [a, b] = E.PAIR.split(','), D = +(E.D || 14), name = E.NAME || `${E.VIA}-${a}-${b}`;
    const info = await page.eval(async ({ a, b, D, via, o, beyond }) => {
      const T = window.trippee, app = T.app;
      T.morph(a, b, D, 1);
      const G = app.stage.score.gestures[0];
      G.xform = { id: via, ...o }; delete G.plan; delete G.planFor; delete G.planning;
      if (beyond) { app.beyond.on(); app.beyond.snap(0.6); }
      app.t = 0; T.step(0); app.t = 2; T.step(0); app.t = 3; T.step(0);
      return { kind: app.lastFrame?.kind, plan: G.plan?.kind, variant: app.R.variant };
    }, { a, b, D, via: E.VIA, o: JSON.parse(E.O || '{}'), beyond: !!E.BEYOND });
    log(JSON.stringify(info));
    const ts = Array.from({ length: N }, (_, i) => 1 + D * (i / (N - 1)));
    if (E.AT) { for (const t of E.AT.split(',')) save(`${name}.${t}.png`, await page.eval(`app.t=${+t};trippee.step(0);trippee.capture()`)); return; }
    await sheet(`${name}.sheet.jpg`, ts);
  } else {
    const id = E.LOAD, S = +(E.S || 30);
    await page.eval(async ({ id, over }) => {
      const T = window.trippee, app = T.app;
      T.load(id, { arcs: !over });
      if (over) app.stage.score.gestures[0].over = over;
    }, { id, over: E.OVER ? JSON.parse(E.OVER) : null });
    if (E.AT) { for (const t of E.AT.split(',')) save(`${E.NAME || id}.${t}.png`, await page.eval(`app.t=${+t};trippee.step(0);trippee.capture()`)); return; }
    const ts = Array.from({ length: N }, (_, i) => S * (i / (N - 1)));
    await sheet(`${E.NAME || id}.sheet.jpg`, ts);
  }
  log('errors', errs().length, errs().slice(0, 3).join(' | ').slice(0, 1200));
};
