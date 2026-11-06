// Finds pops: compares the picture just before and after the moments a transition starts and ends, for many pairs of patterns.
export default async ({ page, log }) => {
  const r = await page.eval(async () => {
    const T = window.trippee, app = T.app, ids = T.list().map(p => p.id);
    const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d', { willReadFrequently: true });
    const grab = t => { T.seek(t); g.drawImage(T.canvas, 0, 0, 160, 90); return g.getImageData(0, 0, 160, 90).data; };
    const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]); return s / (a.length / 4); };
    let seed = 12345; const rnd = n => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
    const out = [], kinds = {};
    const N = +(window.__N || 70);
    for (let k = 0; k < N; k++) {
      const a = ids[rnd(ids.length)]; let b = ids[rnd(ids.length)]; if (b === a) b = ids[(ids.indexOf(a) + 1) % ids.length];
      T.morph(a, b, 10, 1);
      const steady = diff(grab(5.98), grab(6.02));
      const s0 = diff(grab(0.98), grab(1.02)), s1 = diff(grab(10.98), grab(11.02));
      const kind = app.stage.score.gestures[0].plan?.kind;
      kinds[kind] = (kinds[kind] || 0) + 1;
      out.push({ a, b, kind, start: +s0.toFixed(1), end: +s1.toFixed(1), steady: +steady.toFixed(1) });
      if (k % 5 === 0) await new Promise(r => setTimeout(r, 0));
    }
    return { kinds, worst: out.sort((x, y) => Math.max(y.start, y.end) - Math.max(x.start, x.end)).slice(0, 14), medianEnd: out.map(o => o.end).sort((a, b) => a - b)[out.length >> 1] };
  });
  log(JSON.stringify(r.kinds), 'median end', r.medianEnd);
  for (const w of r.worst) log(JSON.stringify(w));
};
