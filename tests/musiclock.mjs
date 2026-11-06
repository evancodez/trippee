// Is the picture locked to the music, and does the rest of the song object work? Run in the lab:
//   SONG=/media/ppp.mp3 node tools/lab.mjs tests/musiclock.mjs --out lab-out/music
// Writes <name>.lock.jpg: the centre row against time for a passage of plain flow, with a red tick every N beats, and prints the
// period the pixels actually repeat at, against what the clock says.
export default async ({ page, save, log }) => {
  const song = process.env.SONG || '/media/ppp.mp3', name = song.split('/').pop().replace(/\..*$/, '');
  const r = await page.eval(async (src, patId) => {
    const T = window.trippee, app = window.app;
    await T.song(src, { seed: 7 });
    const S = app.song, sc = S.score, A = S.analysis;
    // Pick a gesture whose pattern flows on a plane family, and hold its arcs still so only the clock moves the picture.
    const plain = g => g.pattern.flow && Object.keys(g.pattern.flow).some(k => /^f\d\.ph$/.test(k)) && (g.t1 - g.t0) > 18 && !g.matte;
    let G = sc.gestures.find(g => plain(g) && (patId ? g.pattern.id === patId : g.pattern.id !== 'x'));
    if (!G) G = sc.gestures.find(plain);
    const pat = G.pattern, N = G.gears[0];
    const a = G.t0 + 2, b = Math.min(G.t1 - 2, a + 16);
    const hold = { t0: 0, t1: 1e6, pattern: pat, pol0: 0, pol1: 0, inDur: 1, outDur: 1, arcs: [], arcEnd: 1e6, phiTrack: [{ t: sc.tau(a), x: 0, v: 1 / N }] };
    const score = { ...sc, gestures: [hold] };
    app.stage.setScore(score);
    app.manual = true;
    const fps = 30, n = Math.round((b - a) * fps), W = 320, H = 180;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    const K = document.createElement('canvas'); K.width = n; K.height = H + 24;
    const gk = K.getContext('2d');
    const im = gk.createImageData(n, H);
    const pix = [];
    for (let i = 0; i < n; i++) {
      T.seek(a + i / fps);
      g.drawImage(T.canvas, 0, 0, W, H);
      const d = g.getImageData(0, 90, W, 1).data, col = [];
      for (let y = 0; y < H; y++) {
        const x = Math.round(y * W / H), k = (y * n + i) * 4;
        im.data[k] = d[x * 4]; im.data[k + 1] = d[x * 4 + 1]; im.data[k + 2] = d[x * 4 + 2]; im.data[k + 3] = 255;
      }
      for (let x = 20; x < W; x += 40) col.push(d[x * 4]);
      pix.push(col);
    }
    gk.putImageData(im, 0, 0);
    gk.fillStyle = '#111'; gk.fillRect(0, H, n, 24);
    // ticks every N beats from the clock
    const tau0 = sc.tau(a);
    gk.fillStyle = '#f33';
    for (let bt = Math.ceil(tau0); bt < sc.tau(b); bt++) {
      let lo = a, hi = b;
      for (let q = 0; q < 30; q++) { const m = (lo + hi) / 2; if (sc.tau(m) < bt) lo = m; else hi = m; }
      const x = (lo - a) * fps, major = (bt - Math.round(tau0)) % N === 0;
      gk.fillRect(x, H + (major ? 2 : 14), major ? 2 : 1, major ? 22 : 10);
    }
    const wide = document.createElement('canvas'); wide.width = Math.max(n, 1400); wide.height = (H + 24) * 2;
    const gw = wide.getContext('2d'); gw.imageSmoothingEnabled = false; gw.drawImage(K, 0, 0, wide.width, wide.height);
    // The period each pixel repeats at: autocorrelation peak
    const periods = [];
    for (let c0 = 0; c0 < pix[0].length; c0++) {
      const s = pix.map(p => p[c0]); const m = s.reduce((x, y) => x + y, 0) / n;
      let best = 0, bl = 0; const ac = [];
      for (let lag = 3; lag < n * 0.75; lag++) { let v = 0; for (let i = 0; i + lag < n; i++) v += (s[i] - m) * (s[i + lag] - m); ac.push(v / (n - lag)); }
      for (let i = 1; i < ac.length - 1; i++) if (ac[i] > ac[i - 1] && ac[i] >= ac[i + 1] && ac[i] > best * 1.2) { best = ac[i]; bl = i + 3; }
      if (bl && best > 100) { const y0 = ac[bl - 4] ?? 0, y1 = ac[bl - 3], y2 = ac[bl - 2] ?? 0; periods.push((bl + 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2 || 1)) / fps); }
    }
    periods.sort((x, y) => x - y);
    const rate = sc.rate((a + b) / 2);
    // Smoothness of Phi itself, numerically: second difference at 100 Hz, against what one tempo would give
    let worst = 0;
    for (const g2 of sc.gestures.slice(0, -1)) for (let t = g2.t0 + 0.02; t < g2.t1 - 0.02; t += 0.05) {
      const d1 = sc.phi(t + 0.01, g2) - sc.phi(t, g2), d0 = sc.phi(t, g2) - sc.phi(t - 0.01, g2);
      worst = Math.max(worst, Math.abs(d1 - d0) / Math.max(Math.abs(d0), 1e-9));
    }
    return { img: wide.toDataURL('image/jpeg', 0.85), id: pat.id, N, a, b, rate, bpm: A.bpm, expected: N / rate, medianPeriod: periods[periods.length >> 1], periods: periods.map(x => +x.toFixed(3)), worstPhiStep: worst };
  }, song, process.env.PATTERN || null);
  save(`${name}.lock.jpg`, r.img);
  log(`${name}: ${r.id}, ${r.a.toFixed(1)}..${r.b.toFixed(1)} s, N=${r.N} at ${r.bpm.toFixed(2)} BPM. Clock says one element per ${r.expected.toFixed(3)} s. Pixels repeat at ${r.medianPeriod?.toFixed(3)} s, which is ${(r.expected / r.medianPeriod).toFixed(3)} repeats per element (a pattern with its own half-cycle symmetry repeats twice). All pixel periods: ${JSON.stringify(r.periods)}. Worst Phi step change between 10 ms steps, over the whole film: ${(r.worstPhiStep * 100).toFixed(2)}%`);

  // The rest of the song object: cache, rebuild, pattern first, real audio clock
  const more = await page.eval(async (src) => {
    const T = window.trippee, app = window.app, S = app.song;
    const out = {};
    await S.load(src, { seed: 3 });
    out.fromCacheSecondLoad = S.fromCache; out.secondLoadSeconds = +S.analyseSeconds.toFixed(3);
    const f0 = S.score.family;
    const ids = T.list();
    const pick = ids.find(p => p.family !== f0) || ids[0];
    await S.rebuild({ pattern: pick.id });
    out.patternFirst = S.score.gestures[0].pattern.id === pick.id; out.patternFamily = S.score.family === pick.family; out.picked = pick.id;
    S.rebuild({ family: f0, seed: 3 });
    // Purity: same seed, same score
    const a = JSON.stringify(S.score.landings);
    S.rebuild({ family: f0, seed: 3 });
    out.sameScoreTwice = a === JSON.stringify(S.score.landings);
    return out;
  }, song);
  log(JSON.stringify(more));
};
