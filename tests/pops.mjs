// Finds pops: compares the picture just before and after the moments a transition starts and ends, for many pairs of patterns. N=70 pairs.
// The very first morph on a fresh page goes first: that one once planned blind, from a probe that couldn't draw.
export default async ({ page, log }) => {
  const r = await page.eval(async N => {
    const T = window.trippee, app = T.app, ids = T.list().map(p => p.id);
    const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d', { willReadFrequently: true });
    const grab = t => { T.seek(t); g.drawImage(T.canvas, 0, 0, 160, 90); return g.getImageData(0, 0, 160, 90).data; };
    const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]); return s / (a.length / 4); };
    let seed = 12345; const rnd = n => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
    const out = [], kinds = {};
    const one = (a, b) => {
      T.morph(a, b, 10, 1);
      const steady = diff(grab(5.98), grab(6.02));
      const s0 = diff(grab(0.98), grab(1.02)), s1 = diff(grab(10.98), grab(11.02));
      // the biggest step anywhere in it, at a fine enough clock to catch one frame's flip
      let step = 0, at = 0, prev = grab(1); for (let t = 1.05; t < 11.1; t += 0.05) { const f = grab(t), d = diff(prev, f); if (d > step) { step = d; at = t; } prev = f; }
      const kind = app.stage.score.gestures[0].plan?.kind;
      return { a, b, kind, start: +s0.toFixed(1), end: +s1.toFixed(1), steady: +steady.toFixed(1), step: +step.toFixed(1), at: +at.toFixed(2) };
    };
    const first = one('lines.river', 'checks.vega');
    for (let k = 0; k < N; k++) {
      const a = ids[rnd(ids.length)]; let b = ids[rnd(ids.length)]; if (b === a) b = ids[(ids.indexOf(a) + 1) % ids.length];
      const o = one(a, b);
      kinds[o.kind] = (kinds[o.kind] || 0) + 1;
      out.push(o);
      await new Promise(r => setTimeout(r, 0));
    }
    return { first, kinds, slides: out.filter(o => o.kind === 'slide').sort((x, y) => y.step - x.step).slice(0, 12), worst: out.sort((x, y) => Math.max(y.start, y.end, y.step) - Math.max(x.start, x.end, x.step)).slice(0, 14), medianEnd: out.map(o => o.end).sort((a, b) => a - b)[out.length >> 1], medianStep: out.map(o => o.step).sort((a, b) => a - b)[out.length >> 1] };
  }, +(process.env.N || 70));
  log('first', JSON.stringify(r.first));
  log(JSON.stringify(r.kinds), 'median end', r.medianEnd, 'median biggest step', r.medianStep);
  for (const w of r.worst) log(JSON.stringify(w));
  log('slides');
  for (const w of r.slides) log(JSON.stringify(w));
};
