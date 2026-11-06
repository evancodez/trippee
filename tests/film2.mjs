// A song's film, stepped on a fixed clock: SONG=/media/ppp.mp3 SECS=150 node tools/lab.mjs tests/film2.mjs
import { watch, analyse } from '../tools/look.mjs';
export default async ({ page, save, log }) => {
  const song = process.env.SONG || '/media/ppp.mp3', secs = +(process.env.SECS || 150);
  const info = await page.eval(`(async()=>{ const s = await window.trippee.song(${JSON.stringify(song)}, { seed: ${+(process.env.SEED || 11)} }); const A = window.trippee.app; A.manual = true; A.clock = null; A.t = 0; const sc = s.score; return { dur: s.duration, bpm: s.analysis.bpm, fams: [...new Set(sc.gestures.map(x => x.pattern.family))], g: sc.gestures.map(x => [+x.t0.toFixed(0), x.pattern.id]) }; })()`);
  log(JSON.stringify(info).slice(0, 900));
  const w = await watch(page, save, { name: 'film', seconds: secs, fps: 3, cols: 12, rows: 12 });
  const a = analyse(w);
  log(JSON.stringify({ solids: a.solids, meanWhite: a.meanWhite, edges: a.edgeRange, flash: a.flashesPerSecondWholeFrame, tile: a.flashesPerSecondAnyTile }));
  const mostly = w.white.filter(v => v < 0.2 || v > 0.8).length / w.white.length;
  log('frames mostly one colour:', mostly.toFixed(3));
  // Does the picture move with the pulse? Fine steps over a stretch in the middle of the song
  await page.eval(`(()=>{ window.trippee.app.t = 60; })()`);
  const f = await watch(page, save, { name: 'pulse', seconds: 30, fps: 24, cols: 8, rows: 4 });
  const p = await page.eval(`(async()=>{ const { reactAt } = await import('/src/score/react.js'); const R = window.trippee.app.stage.score.react; return ${JSON.stringify(f.time)}.map(t => reactAt(R, t).pulse); })()`);
  const n = Math.min(p.length, f.diff.length) - 1, mean = x => x.reduce((s, v) => s + v, 0) / x.length;
  const d = f.diff.slice(1, n), q = p.slice(1, n), md = mean(d), mq = mean(q);
  let sxy = 0, sxx = 0, syy = 0; d.forEach((v, i) => { sxy += (v - md) * (q[i] - mq); sxx += (v - md) ** 2; syy += (q[i] - mq) ** 2; });
  log('corr(frame change, pulse):', (sxy / Math.sqrt(sxx * syy)).toFixed(3), 'largest step', Math.max(...f.diff.slice(1)).toFixed(1), 'median', [...f.diff].sort((x, y) => x - y)[f.diff.length >> 1].toFixed(1));
};
