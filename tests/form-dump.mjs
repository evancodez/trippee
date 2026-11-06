// Saves each song's analysis as the browser made it, and the film it ends up with after its rehearsal, for tests/form.mjs to read in node.
//   node tools/lab.mjs tests/form-dump.mjs --out lab-out/form
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const sleep = ms => new Promise(r => setTimeout(r, ms));
export default async ({ page, log, out }) => {
  await page.eval(`app.manual=true`);
  for (const song of (process.env.SONGS || 'ppp,wildflower,disclosure,mgmt').split(',')) {
    const t0 = Date.now();
    await page.eval(`window.__load = trippee.song('/media/${song}.mp3', { autoplay: false }).then(() => window.__done = true); window.__done = false; 0`);
    for (let i = 0; i < 1800; i++) { if (await page.eval('window.__done')) break; await sleep(200); }
    const r = await page.eval(() => {
      const A = app.song.analysis, o = {};
      for (const k in A) { const v = A[k]; o[k] = ArrayBuffer.isView(v) ? Array.from(v) : v; }
      const s = app.song.score;
      return { A: JSON.stringify(o), family: s.family, stats: s.stats, seconds: app.song.rehearsal?.seconds, sitOut: app.song.rehearsal?.sitOut,
        gestures: s.gestures.map(G => ({ t0: G.t0, t1: G.t1, id: G.pattern.id, fam: G.pattern.family, range: G.range, morph: G.morph, label: G.label, kindOut: G.kindOut, rise: G.rise })) };
    });
    writeFileSync(resolve(out, `${song}.json`), r.A);
    delete r.A;
    writeFileSync(resolve(out, `${song}.film.json`), JSON.stringify(r, null, 0));
    const share = {}; r.gestures.slice(0, -1).forEach(g => share[g.fam] = (share[g.fam] || 0) + g.t1 - g.t0);
    log(song, ((Date.now() - t0) / 1000).toFixed(0) + ' s', 'family', r.family, 'rehearsal', r.seconds?.toFixed(1), 'sitOut', r.sitOut, JSON.stringify(share));
  }
};
