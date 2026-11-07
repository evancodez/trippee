// A hand cut's frames, big, at any moments, on the real song's numbers (muted: the song never plays). No rehearsal, so it's quick: this is for looking.
//   SONG=mgmt QUERY='?cut=time' AT=10-14:.25 COLS=4 TILE=480 NAME=x node tools/lab.mjs tests/timesong.mjs --out lab-out/t
//   SHOTS='[{at:0,id:"lines.river",moves:[{id:"ghost",beats:"strong"}]}]'   a cut written here instead. COLOUR=1 with colour on. WORLD=flower in a world.
const sleep = ms => new Promise(r => setTimeout(r, ms));
export default async ({ page, save, log }) => {
  const env = process.env, song = env.SONG || 'mgmt';
  await page.goto((env.LAB_URL || 'http://localhost:5300/') + (env.QUERY ?? '?cut=time'));
  for (let i = 0; i < 240; i++) { if (await page.eval('typeof window.trippee !== "undefined" && window.trippee.ready === true')) break; await sleep(250); }
  await page.eval(async s => { await app.song.load(`/media/${s}.mp3`, { seed: 7 }); app.song.pause(); app.ui?.song?.show?.(false); }, song);
  const r = await page.eval(async ({ at, cols, tile, shots, colour }) => {
    const here = u => new URL(u, location.href).href;
    const [{ compose }, { cutFor }] = await Promise.all(['src/score/compose.js', 'src/score/cuts/index.js'].map(u => import(here(u))));
    const A = app.song.analysis, cut = shots ? { hash: A.hash, name: 'here', line: '', shots: (0, eval)(shots) } : await cutFor(A.hash);
    const sc = compose(A, 7, { patterns: app.patterns, aspect: 16 / 9, cut });
    app.song.score = sc; app.stage.setScore(sc);
    const T = window.trippee; app.manual = true; app.governor.enabled = false; app.R.drawScale = 1; app.paused = false;
    app.R._wantTime(0); for (let i = 0; i < 400 && !app.R.progs[64]; i++) await new Promise(r => setTimeout(r, 25));
    if (colour) { document.dispatchEvent?.(new Event('x')); app.beyond?.set?.(true); }
    const times = [];
    for (const part of at.split(',')) { const [range, step] = part.split(':'), [a, b] = range.split('-').map(Number); if (b == null) times.push(a); else for (let t = a; t <= b + 1e-6; t += +step) times.push(t); }
    const W = tile, H = Math.round(W * T.canvas.height / T.canvas.width), c = document.createElement('canvas'); c.width = cols * W; c.height = Math.ceil(times.length / cols) * H;
    const x = c.getContext('2d'); x.font = '12px monospace';
    const vars = new Set();
    times.forEach((t, i) => {
      T.seek(t); T.seek(t); vars.add(app.R.variant);
      const X = (i % cols) * W, Y = (i / cols | 0) * H;
      x.drawImage(T.canvas, X, Y, W, H);
      const lab = `${t.toFixed(2)} ${app.lastFrame?.G?.pattern?.id ?? ''} ${app.lastFrame?.kind ?? ''}`, w = x.measureText(lab).width + 6;
      x.fillStyle = '#000'; x.fillRect(X, Y, w, 15); x.fillStyle = '#f44'; x.fillText(lab, X + 3, Y + 11);
    });
    return { sheet: c.toDataURL('image/jpeg', 0.88), refused: sc.refused, vars: [...vars] };
  }, { at: env.AT || '10-14:.5', cols: +(env.COLS || 4), tile: +(env.TILE || 480), shots: env.SHOTS, colour: !!env.COLOUR });
  save(`${env.NAME || 'song'}.jpg`, r.sheet);
  log('refused', JSON.stringify(r.refused).slice(0, 400), 'programs', JSON.stringify(r.vars));
  log('errors', JSON.stringify(page.logs.filter(l => /\[error\]|\[exception\]/.test(l)).slice(0, 5)).slice(0, 800));
};
