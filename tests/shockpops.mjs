// Pops, per kind, for Shock and Fall: KIND=shock|fall N=40 DIR=1 node tools/lab.mjs tests/shockpops.mjs --out lab-out/x
// Same measure as tests/pops.mjs, on pairs that can wear it. No song here: for that, tests/shockfilm.mjs. A fall arrives at speed on purpose, so its landing is judged against the frames either side of it.
export default async ({ page, log }) => {
  const r = await page.eval(async ({ N, kind, dir }) => {
    const T = window.trippee, app = T.app, X = await import('/src/score/xform/index.js'), ids = T.list().map(p => p.id).filter(id => app.byId[id].pool !== false);
    const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d', { willReadFrequently: true });
    const grab = t => { T.seek(t); g.drawImage(T.canvas, 0, 0, 160, 90); return g.getImageData(0, 0, 160, 90).data; };
    const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]); return s / (a.length / 4); };
    let seed = 777; const rnd = n => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
    const asp = T.canvas.width / T.canvas.height, out = [];
    // The same measure as tests/flat.mjs: a joined area of one colour over .35 of the frame, with room for a disc of .25 of its height
    const fW = 80, fH = 45, fc = document.createElement('canvas'); fc.width = fW; fc.height = fH; const fg = fc.getContext('2d', { willReadFrequently: true });
    const stack = new Int32Array(fW * fH), seen = new Uint8Array(fW * fH), dist = new Float32Array(fW * fH);
    const flatAt = t => {
      T.seek(t); fg.drawImage(T.canvas, 0, 0, fW, fH);
      const d = fg.getImageData(0, 0, fW, fH).data, cl = v => (v > 235 ? 1 : v < 20 ? 2 : 0);
      seen.fill(0); let best = 0, disc = 0;
      for (let i = 0; i < fW * fH; i++) {
        const col = cl(d[i * 4]); if (seen[i] || !col) continue;
        let top = 0, n = 0; stack[top++] = i; seen[i] = 1;
        while (top) { const k = stack[--top]; n++; const x = k % fW, y = (k / fW) | 0; for (const m of [x > 0 ? k - 1 : -1, x < fW - 1 ? k + 1 : -1, y > 0 ? k - fW : -1, y < fH - 1 ? k + fW : -1]) { if (m >= 0 && !seen[m] && cl(d[m * 4]) === col) { seen[m] = 1; stack[top++] = m; } } }
        if (n > best) best = n;
      }
      for (const white of [true, false]) {
        for (let i = 0; i < fW * fH; i++) dist[i] = (white ? d[i * 4] > 235 : d[i * 4] < 20) ? 1e6 : 0;
        for (let y = 0; y < fH; y++) for (let x = 0; x < fW; x++) { const i = y * fW + x; if (x === 0 || y === 0 || x === fW - 1 || y === fH - 1) dist[i] = Math.min(dist[i], 1.5); if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1); if (y > 0) dist[i] = Math.min(dist[i], dist[i - fW] + 1); }
        for (let y = fH - 1; y >= 0; y--) for (let x = fW - 1; x >= 0; x--) { const i = y * fW + x; if (x < fW - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1); if (y < fH - 1) dist[i] = Math.min(dist[i], dist[i + fW] + 1); disc = Math.max(disc, dist[i]); }
      }
      return best / (fW * fH) > 0.35 && disc / fH > 0.25;
    };
    const f1 = v => +v.toFixed(1);
    let tries = 0;
    while (out.length < N && tries++ < N * 40) {
      const a = ids[rnd(ids.length)], b = ids[rnd(ids.length)];
      if (a === b) continue;
      T.morph(a, b, 10, 1);
      const gs = app.stage.score.gestures;
      gs[0].t0 = -29;
      if (kind === 'shock') {
        const fit = X.wearShock(gs[0], gs[1], 9, { dir, D: 10, aspect: asp });
        if (!fit) continue;
        const shift = gs[0].t1 - 11; gs[0].t1 -= shift; gs[1].t0 -= shift;
      } else {
        X.wearFall(gs[0], gs[1], { a: 1, bar: 2, D: 10 });
      }
      app.t = 0; T.step(0);
      const steady = diff(grab(5.98), grab(6.02));
      const s0 = diff(grab(0.98), grab(1.02));
      const eP = diff(grab(10.94), grab(10.98)), e0 = diff(grab(10.98), grab(11.02)), eN = diff(grab(11.02), grab(11.06));
      const ds = []; let prev = grab(1), step = 0, at = 0;
      for (let t = 1.05; t < 11.5; t += 0.05) { const f = grab(t), d = diff(prev, f); ds.push(d); if (d > step) { step = d; at = t; } prev = f; }
      ds.sort((p, q) => p - q);
      const planKind = gs[0].plan?.kind;
      let flat = 0, flatT = 0; for (let t = 1.4; t < 10.8; t += 0.2) if (flatAt(t)) { flat += 0.2; flatT = t; }
      out.push({ a, b, kind: planKind, flat: +flat.toFixed(1), flatT: +flatT.toFixed(1), pairs: gs[0].plan?.pair?.filter(p => p >= 0).length, start: f1(s0), steady: f1(steady), endP: f1(eP), end: f1(e0), endN: f1(eN), step: f1(step), at: +at.toFixed(2), med: f1(ds[ds.length >> 1]) });
      await new Promise(r => setTimeout(r, 0));
    }
    return { out };
  }, { N: +(process.env.N || 40), kind: process.env.KIND || 'shock', dir: +(process.env.DIR || 1) });
  const o = r.out;
  const fails = o.filter(x => {
    const endPop = x.end > Math.max(2 * Math.max(x.endP, x.endN), 4), startPop = x.start > Math.max(2 * x.steady, 4);
    x.why = (endPop ? 'END ' : '') + (startPop ? 'START ' : '') + (x.step > 3 * x.med + 2 ? 'step' : '');
    return endPop || startPop;
  });
  log(`${o.length} pairs of ${process.env.KIND || 'shock'}: ${fails.length} pop at an end. Kinds:`, JSON.stringify(o.reduce((m, x) => { m[x.kind] = (m[x.kind] || 0) + 1; return m; }, {})));
  for (const x of fails) log('POP', JSON.stringify(x));
  const flats = o.filter(x => x.flat > 0).sort((p, q) => q.flat - p.flat);
  log(`${flats.length} pairs pass through a flat shape`);
  for (const x of flats.slice(0, 8)) log(' FLAT', x.a, x.b, x.kind, 'for', x.flat, 's, last at', x.flatT);
  log('worst steps');
  for (const x of [...o].sort((p, q) => q.step / (q.med + 2) - p.step / (p.med + 2)).slice(0, 8)) log(' ', JSON.stringify(x));
  log('errors', page.logs.filter(l => /\[error\]|\[exception\]/.test(l)));
};
