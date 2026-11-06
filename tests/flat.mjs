// Do morphs ever pass through one colour? Random pairs, measured by the biggest connected area of one colour, with the worst on a sheet:
// node tools/lab.mjs tests/flat.mjs --out lab-out/me     (N=120 pairs. A flat shape is over FLAT=.35 of the frame, joined up, with room for a disc of radius DISC=.25 of the frame's height)
const FLAT = +(process.env.FLAT || 0.35), DISC = +(process.env.DISC || 0.25);
export default async ({ page, log, save }) => {
  const r = await page.eval(async (N, FLAT, DISC) => {
    const T = window.trippee, app = T.app, ids = T.list().map(p => p.id);
    const W = 80, H = 45;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
    // The largest run of joined pixels that are all clearly one colour. A mid value is an edge or lines too fine to tell, and joins nothing.
    const stack = new Int32Array(W * H), seen = new Uint8Array(W * H), dist = new Float32Array(W * H);
    const L = t => {
      T.seek(t); g.drawImage(T.canvas, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data;
      seen.fill(0);
      let best = 0, sum = 0, flatC = 0;
      for (let i = 0; i < W * H; i++) sum += d[i * 4];
      for (let i = 0; i < W * H; i++) {
        if (seen[i]) continue;
        const v = d[i * 4], col = v > 235 ? 1 : v < 20 ? 2 : 0;
        if (!col) continue;
        let top = 0, n = 0; stack[top++] = i; seen[i] = 1;
        while (top) {
          const k = stack[--top]; n++;
          const x = k % W, y = (k / W) | 0;
          for (const m of [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, y > 0 ? k - W : -1, y < H - 1 ? k + W : -1]) {
            if (m < 0 || seen[m]) continue;
            const u = d[m * 4], cu = u > 235 ? 1 : u < 20 ? 2 : 0;
            if (cu === col) { seen[m] = 1; stack[top++] = m; }
          }
        }
        if (n > best) { best = n; flatC = col; }
      }
      // A dot field's background is all joined up but has nothing empty in it. So how big a disc of one colour fits matters too.
      let disc = 0;
      for (const white of [true, false]) {
        for (let i = 0; i < W * H; i++) dist[i] = (white ? d[i * 4] > 235 : d[i * 4] < 20) ? 1e6 : 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (x === 0 || y === 0 || x === W - 1 || y === H - 1) dist[i] = Math.min(dist[i], 1.5); if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1); if (y > 0) dist[i] = Math.min(dist[i], dist[i - W] + 1); }
        for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (x < W - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1); if (y < H - 1) dist[i] = Math.min(dist[i], dist[i + W] + 1); disc = Math.max(disc, dist[i]); }
      }
      return { area: best / (W * H), disc: disc / H, white: sum / (W * H) / 255 };
    };
    let seed = 4242; const rnd = n => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed >>> 8) % n; };
    const pairs = [], kinds = {};
    for (let k = 0; k < N; k++) {
      const a = ids[rnd(ids.length)]; let b = ids[rnd(ids.length)]; if (b === a) b = ids[(ids.indexOf(a) + 1) % ids.length];
      T.morph(a, b, 8, 1);
      let worst = 0, at = 0, over = 0, disc = 0;
      // the two ends are the patterns themselves, so what counts is the flight between them
      for (let t = 1.4; t < 8.6; t += 0.2) { const v = L(t); const flat = v.area > FLAT && v.disc > DISC; if (flat && v.area > worst) { worst = v.area; at = t; disc = v.disc; } if (flat) over += 0.2; }
      const plan = app.stage.score.gestures[0].plan, kind = plan?.kind; kinds[kind] = (kinds[kind] || 0) + 1;
      pairs.push({ a, b, kind, worst: +worst.toFixed(3), disc: +disc.toFixed(2), at: +at.toFixed(1), over: +over.toFixed(1), lnZ: +(plan?.lnZ ?? 0).toFixed(2) });
      if (k % 4 === 0) await new Promise(r => setTimeout(r, 0));
    }
    const bad = pairs.filter(p => p.over > 0).sort((x, y) => y.over - x.over);
    const ts = bad.slice(0, 8);
    const sheet = document.createElement('canvas'); sheet.width = 4 * 320; sheet.height = Math.max(1, ts.length) * 180; const sg = sheet.getContext('2d'); sg.font = '12px monospace';
    ts.forEach((p, i) => { T.morph(p.a, p.b, 8, 1); [p.at - 1.2, p.at - 0.4, p.at, p.at + 0.8].forEach((t, j) => { T.seek(t); sg.drawImage(T.canvas, j * 320, i * 180, 319, 179); sg.fillStyle = '#f22'; sg.fillText(`${t.toFixed(1)} ${p.a}>${p.b} ${app.lastFrame.kind}`, j * 320 + 3, i * 180 + 13); }); });
    return { kinds, total: pairs.length, badCount: bad.length, bad: bad.slice(0, 16), sheet: sheet.toDataURL('image/jpeg', .85) };
  }, +(process.env.N || 120), FLAT, DISC);
  save('flat.jpg', r.sheet); delete r.sheet;
  log(JSON.stringify(r.kinds), 'pairs', r.total, `with a flat shape over ${FLAT * 100 | 0}% of the frame`, r.badCount);
  for (const b of r.bad) log(JSON.stringify(b));
  if (r.badCount > r.total * 0.1) log('FAIL: too many morphs pass through a large flat shape');
};
