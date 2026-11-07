// The sheet in space, watched. Look at the sheets: no number says a floor is falling away.
//   PAIR=a,b VIA=flood D=14 [O='{"amp":.5}'] node tools/lab.mjs tests/space.mjs --out lab-out/s     a dense sheet across one transformation, with the frame just before and just after
//   LOAD=space.swell S=30 node tools/lab.mjs tests/space.mjs --out lab-out/s                       a dense sheet of one pattern moving
//   OVER='{"space.kind":1,...}' LOAD=lines.fall ...                                                any numbers on any pattern
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
  if (E.PAIR) {
    const [a, b] = E.PAIR.split(','), D = +(E.D || 14), name = E.NAME || `${E.VIA}-${a}-${b}`;
    const info = await page.eval(async ({ a, b, D, via, o }) => {
      const T = window.trippee, app = T.app;
      T.morph(a, b, D, 1);
      const G = app.stage.score.gestures[0];
      G.xform = { id: via, ...o }; delete G.plan; delete G.planFor; delete G.planning;
      app.t = 0; T.step(0); app.t = 2; T.step(0); app.t = 3; T.step(0);
      return { kind: app.lastFrame?.kind, plan: G.plan?.kind, variant: app.R.variant };
    }, { a, b, D, via: E.VIA, o: JSON.parse(E.O || '{}') });
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
