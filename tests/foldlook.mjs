// Contact sheets of fold scenes, while inventing. SCENES=path to a js module in the page's tree exporting { scenes: [{ name, g, flow, drive(out, c), times }] }.
export default async ({ page, save, log }) => {
  const r = await page.eval(async (mod, size) => {
    const T = window.trippee, app = T.app;
    await app.R.whenFoldReady();
    app.governor.enabled = false; app.R.drawScale = 1; app.manual = true;
    const { scenes, pats } = await import(mod + '?' + Date.now());
    const cols = 6, tw = size, th = Math.round(size * 9 / 16);
    const total = scenes.reduce((s, x) => s + 1, 0);
    const c = document.createElement('canvas'); c.width = cols * tw; c.height = total * th;
    const g = c.getContext('2d');
    let y = 0;
    for (const sc of scenes) {
      const p = { id: 'x' + y, name: sc.name, family: 'x', pool: false, arcs: [], flow: sc.flow ?? {}, g: sc.g, lambda: .2, drive: sc.drive };
      app.stage.score.gestures = [{ t0: 0, t1: 3600, arcEnd: 3600, pattern: p, arcs: [] }];
      app.stage.score.handover = null; app.stage.hold = true;
      const times = sc.times ?? [0, 1, 2, 3, 4, 5];
      for (let i = 0; i < cols; i++) {
        app.t = times[i]; T.step(0);
        g.drawImage(T.canvas, i * tw, y * th, tw - 1, th - 1);
      }
      g.fillStyle = '#f33'; g.font = '13px monospace'; g.fillText(sc.name, 4, y * th + 14);
      y++;
    }
    return { url: c.toDataURL('image/jpeg', 0.85) };
  }, process.env.SCENES, +(process.env.TW || 300));
  save((process.env.NAME || 'look') + '.jpg', r.url);
};
