// Where does brightness jump in a song's film, and what was happening? SONG=/media/mgmt.mp3 node tools/lab.mjs tests/jumps.mjs --out lab-out/me
export default async ({ page, log }) => {
  const src = process.env.SONG || '/media/mgmt.mp3';
  const r = await page.eval(`(async()=>{
    const s = await window.trippee.song(${JSON.stringify(src)}, { seed: ${+(process.env.SEED || 11)} });
    const T = window.trippee, app = T.app; app.manual = true; app.clock = null;
    const c = document.createElement('canvas'); c.width = 64; c.height = 36; const g = c.getContext('2d', { willReadFrequently: true });
    let prev = null; const out = []; const dt = 0.1;
    const chan = { mel: 0, beat: 0, n: 0 };
    for (let t = 0; t < Math.min(s.duration, 400); t += dt) {
      T.seek(t); g.drawImage(T.canvas, 0, 0, 64, 36);
      const d = g.getImageData(0, 0, 64, 36).data; let L = 0, D = 0;
      for (let i = 0; i < d.length; i += 4) { L += d[i + 1]; if (prev) D += Math.abs(d[i + 1] - prev[i >> 2]); }
      L /= (d.length / 4) * 255; D /= (d.length / 4) * 255;
      const f = app.lastFrame;
      const cur = new Uint8Array(d.length >> 2); for (let i = 0; i < d.length; i += 4) cur[i >> 2] = d[i + 1];
      out.push({ t: +t.toFixed(1), L: +L.toFixed(3), D: +D.toFixed(3), kind: f.kind, id: f.G.pattern.id, next: f.N?.pattern?.id });
      prev = cur;
      if (out.length % 40 === 0) await new Promise(r => setTimeout(r, 0));
    }
    const steps = out.slice(1).map((o, i) => ({ ...o, dL: +(o.L - out[i].L).toFixed(3) }));
    const worst = [...steps].sort((a, b) => Math.abs(b.dL) - Math.abs(a.dL)).slice(0, 8);
    const worstD = [...steps].sort((a, b) => b.D - a.D).slice(0, 6);
    const kinds = {}; for (const g2 of s.score.gestures) kinds[g2.plan?.kind || 'none'] = (kinds[g2.plan?.kind || 'none'] || 0) + 1;
    return { kinds, fams: [...new Set(s.score.gestures.map(x => x.pattern.family))], rehearsal: s.rehearsal?.jumps?.slice(0, 6), worst, worstD, medD: [...steps].map(o => o.D).sort((a, b) => a - b)[steps.length >> 1] };
  })()`);
  log(JSON.stringify({ kinds: r.kinds, fams: r.fams, rehearsal: r.rehearsal, medD: r.medD }));
  for (const w of r.worst) log(JSON.stringify(w));
  log('--- biggest picture changes'); for (const w of r.worstD) log(JSON.stringify(w));
};
