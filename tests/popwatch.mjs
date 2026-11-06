// One morph, at a fine clock, with close frames across its biggest step: PAIR=riley.blaze,waves.current D=10 AT=3.2-3.7 EVERY=.0167 node tools/lab.mjs tests/popwatch.mjs --out lab-out/repair
// RISE=1 or RISE=0 forces which way a flight goes. Prints the steps, and what the numbers were doing.
export default async ({ page, log, save }) => {
  const [a, b] = (process.env.PAIR || 'riley.blaze,waves.current').split(','), D = +(process.env.D || 10), every = +(process.env.EVERY || 1 / 60);
  const [t0, t1] = (process.env.AT || '').split('-').map(Number);
  const r = await page.eval(async ({ a, b, D, every, t0, t1, rise }) => {
    const T = window.trippee, app = T.app, L = await import('/src/pattern/layout.js'), OFF = L.OFF, F = L.FRAME;
    T.morph(a, b, D, 1);
    if (rise != null) { const G = app.stage.score.gestures[0]; G.rise = !!rise; G.plan = G.planFor = G.planning = null; }
    const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d', { willReadFrequently: true });
    const grab = t => { T.seek(t); g.drawImage(T.canvas, 0, 0, 160, 90); return g.getImageData(0, 0, 160, 90).data; };
    const diff = (p, q) => { let s = 0; for (let i = 0; i < p.length; i += 4) s += Math.abs(p[i] - q[i]); return s / (p.length / 4); };
    let series = []; let prev = grab(1); for (let t = 1.05; t < D + 1.1; t += 0.05) { const f = grab(t), d = diff(prev, f); series.push([+t.toFixed(2), +d.toFixed(1)]); prev = f; }
    const top = series.reduce((m, v) => (v[1] > m[1] ? v : m), [0, 0]);
    const from = isNaN(t0) ? top[0] - 0.2 : t0, to = isNaN(t1) ? top[0] + 0.1 : t1, n = Math.ceil((to - from) / every), cols = 12, tw = 192, th = 108, sheet = document.createElement('canvas'); sheet.width = cols * tw; sheet.height = Math.ceil(n / cols) * th; const sg = sheet.getContext('2d'); sg.font = '11px monospace';
    const rows = []; prev = grab(from);
    for (let i = 0; i < n; i++) {
      const t = from + i * every, f = grab(t), d = diff(prev, f); prev = f; const fr = app.lastFrame, A = app.R.slotA, B = app.R.slotB, W = app.R.frame;
      sg.drawImage(T.canvas, (i % cols) * tw, (i / cols | 0) * th, tw - 1, th - 1); const lab = `${t.toFixed(3)} ${d.toFixed(0)} ${fr.kind || ''} ${(fr.T || 0).toFixed(3)}`; sg.fillStyle = '#000'; sg.fillRect((i % cols) * tw, (i / cols | 0) * th, sg.measureText(lab).width + 4, 13); sg.fillStyle = '#f33'; sg.fillText(lab, (i % cols) * tw + 2, (i / cols | 0) * th + 10);
      rows.push({ t: +t.toFixed(3), d: +d.toFixed(1), kind: fr.kind, T: +(fr.T || 0).toFixed(4), thA: +A[OFF.theta].toFixed(3), thB: +B[OFF.theta].toFixed(3), far: +W[F.spare * 4].toFixed(3), end: +W[F.spare * 4 + 1].toFixed(3), zoom: +W[F.dive * 4 + 2].toFixed(3), mode: W[F.dive * 4 + 3] });
    }
    return { plan: app.stage.score.gestures[0].plan, series, rows, url: sheet.toDataURL('image/jpeg', 0.85) };
  }, { a, b, D, every, t0, t1, rise: process.env.RISE != null ? +process.env.RISE : null });
  save(`pop-${a}-${b}.jpg`, r.url);
  log(JSON.stringify(r.plan));
  log(r.series.map(v => v.join(':')).join(' '));
  for (const x of r.rows) log(JSON.stringify(x));
};
