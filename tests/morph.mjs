// Watch one pattern become another: PAIRS="a,b;c,d" DUR=10 node tools/lab.mjs tests/morph.mjs --out ...
import { watch, analyse } from '../tools/look.mjs';
export default async ({ page, save, log }) => {
  const pairs = process.env.PAIRS.split(';').map(s => s.split(','));
  const dur = +(process.env.DUR || 10);
  for (const [a, b] of pairs) {
    await page.eval(`window.trippee.morph(${JSON.stringify(a)},${JSON.stringify(b)},${dur},1)`);
    const name = `m_${a}__${b}`;
    const w = await watch(page, save, { name, seconds: dur + 2.4, fps: 6, cols: 8, rows: 4 });
    const x = analyse(w);
    const kind = await page.eval(`window.trippee.app.stage.score.gestures[0].plan?.kind`);
    log(name, kind, JSON.stringify({ solids: x.solids.length, white: [Math.min(...w.white), Math.max(...w.white)], maxDiff: x.maxDiff, medDiff: x.medianDiff, flash: x.flashesPerSecondAnyTile, step: x.largestLuminanceStepPerFrame }));
  }
};
