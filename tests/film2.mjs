import { watch, analyse } from '../tools/look.mjs';
export default async ({ page, save, log }) => {
  const song = process.env.SONG || '/media/ppp.mp3', secs = +(process.env.SECS || 180);
  const info = await page.eval(`(async()=>{ const s = await window.trippee.song(${JSON.stringify(song)}, { seed: 11 }); window.trippee.app.manual = true; window.trippee.app.clock = null; window.trippee.app.t = 0; const sc = s.score; return { dur: s.duration, family: sc.family, stats: sc.stats, g: sc.gestures.slice(0, 40).map(x => [+x.t0.toFixed(1), x.pattern.id, +(x.morph||0).toFixed(1)]) }; })()`);
  log(JSON.stringify(info).slice(0, 1600));
  const w = await watch(page, save, { name: 'film', seconds: secs, fps: 3, cols: 12, rows: 12 });
  const a = analyse(w);
  log(JSON.stringify({ solids: a.solids, meanWhite: a.meanWhite, edges: a.edgeRange, maxDiff: a.maxDiff, medDiff: a.medianDiff, flash: a.flashesPerSecondWholeFrame, tile: a.flashesPerSecondAnyTile, greyP95: a.p95GreyAtNativeRes }));
  const low = w.white.filter(v => v < 0.2 || v > 0.8).length / w.white.length;
  log('frames mostly one colour:', low.toFixed(3));
};
