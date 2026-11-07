// The time family in colour and in a world: IDS=time.target,... WORLD=flower FROM=9 node tools/lab.mjs tests/timecolour.mjs --out lab-out/t
const sleep = ms => new Promise(r => setTimeout(r, ms));
import { enterWorld } from '../tools/look.mjs';
export default async ({ page, save, log }) => {
  const env = process.env, ids = (env.IDS || 'time.target,time.rings,time.ghost,time.fringe,time.snakes,time.ouchi,time.echo').split(','), from = +(env.FROM ?? 9.5), world = env.WORLD;
  if (world) await enterWorld(page, world, log);
  const r = await page.eval(async ({ ids, from, world, tile }) => {
    const T = window.trippee, R = app.R; app.governor.enabled = false; R.drawScale = 1; app.manual = true;
    if (!world) { app.beyond.on(); app.beyond.snap(0.6); }
    const cols = 4, W = tile, H = Math.round(W * 9 / 16), c = document.createElement('canvas'); c.width = cols * W; c.height = Math.ceil(ids.length / cols) * H; const x = c.getContext('2d'); x.font = '12px monospace';
    const out = [];
    for (let i = 0; i < ids.length; i++) {
      const G = app.stage.score.gestures, p = app.byId[ids[i]];
      if (world) { const g0 = G[0]; G.length = 1; G[0] = { ...g0, t0: 0, t1: 3600, arcEnd: 26, pattern: p, arcs: undefined, moves: undefined, xform: undefined, morph: 0, plan: null }; app.stage.score.handover = null; app.stage.hold = true; }
      else T.load(ids[i], {});
      app.t = from; T.seek(from);
      for (let k = 0; k < 120 && R.timeOn && !((R.variant & 1024) || (R.variant % 64 === 0 && false)); k++) { await new Promise(r => setTimeout(r, 25)); T.seek(from); if (R.wp && R.wp.progs[(R.variant - R.wp.base) | 1024]) break; }
      T.seek(from + 0.0); T.seek(from);
      x.drawImage(T.canvas, (i % cols) * W, (i / cols | 0) * H, W, H); x.fillStyle = '#fff'; x.fillText(ids[i], (i % cols) * W + 3, (i / cols | 0) * H + 13);
      out.push([ids[i], R.variant, R.timeOn]);
    }
    return { sheet: c.toDataURL('image/jpeg', 0.88), out };
  }, { ids, from, world, tile: +(env.TILE ?? 400) });
  save(`colour-${world ?? 'plates'}.jpg`, r.sheet);
  log(JSON.stringify(r.out));
  log('errors', JSON.stringify(page.logs.filter(l => /\[error\]|\[exception\]/.test(l)).slice(0, 5)).slice(0, 900));
};
