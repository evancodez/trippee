// What the rehearsal's guard did to the cast film: SONG=media/ppp.mp3 [SEED=11] LAB_URL=... node tools/lab.mjs tests/woahguard.mjs --out lab-out/me
// Prints the film's cast as it reports it and as the slots stand after the guard (they must agree, and nothing's "none"), what the guard changed, swapped and left, how many looks it had and spent, and how long it took.
import { resolve } from 'node:path';
const sleep = ms => new Promise(r => setTimeout(r, ms));
export default async ({ page, log }) => {
  const song = process.env.SONG || 'media/ppp.mp3', seed = process.env.SEED, t0 = Date.now();
  const data = { items: [], files: [resolve(song)], dragOperationsMask: 1 };
  await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 640, y: 360, data });
  await page.send('Input.dispatchDragEvent', { type: 'drop', x: 640, y: 360, data });
  for (let i = 0; i < 1800; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await sleep(100); }
  const loaded = (Date.now() - t0) / 1000;
  if (seed) { await page.eval(`app.song.prepareTake({seed:${+seed}}).then(s=>{s?.();})`); await sleep(1000); }
  const r = await page.eval(() => {
    const s = app.stage.score, W = s.woah, R = app.song.rehearsal, f = R?.flash;
    const slots = W?.slots?.slice().sort((a, b) => a.from - b.from).map(x => `${x.id ?? 'none'}@${Math.round(x.kind === 'change' ? x.hit : x.from)}${x.climax ? '!' : ''}`).join(' ');
    return {
      seed: s.seed, said: s.stats?.woah, slots, cast: s.stats?.cast,
      rehearsal: R && { seconds: +R.seconds.toFixed(1), clocked: R.clocked, bad: R.bad, early: R.early },
      guard: f && { looked: Math.round(f.looked), allowed: f.allowed, left: f.left, fixes: f.fixes?.map(x => `${x.t} ${x.id} ${x.did}`), swaps: f.swaps, seconds: f.seconds, falseAlarms: f.falseAlarms },
      refused: (s.refused ?? []).map(x => `${x.t} ${x.what}: ${x.why}`),
    };
  });
  log(`${song} seed ${r.seed}, ready in ${loaded.toFixed(1)} s`);
  log(`said:  ${r.said}`);
  log(`slots: ${r.slots}`);
  log(`heroes: ${r.cast}`);
  log(`rehearsal: ${JSON.stringify(r.rehearsal)}`);
  log(`guard: ${JSON.stringify(r.guard)}`);
  for (const x of r.refused) log(`  ${x}`);
  const errors = page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  log('errors', errors);
};
