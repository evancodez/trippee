// Watch one pattern become another: PAIR=a,b DUR=16 node tools/lab.mjs tests/morph.mjs --url ... --out ...
import { watch, analyse } from '../tools/look.mjs';
export default async ({ page, save, log }) => {
  const pairs = (process.env.PAIRS || process.env.PAIR).split(';').map(s => s.split(','));
  const dur = +(process.env.DUR || 16);
  for (const [a, b] of pairs) {
    await page.eval(`window.trippee.morph(${JSON.stringify(a)},${JSON.stringify(b)},${dur},1)`);
    const name = `m_${a}__${b}`;
    const w = await watch(page, save, { name, seconds: dur + 3, fps: 6, cols: 8, rows: 5 });
    const x = analyse(w);
    const minW = Math.min(...w.white), maxW = Math.max(...w.white);
    log(name, JSON.stringify({ solids: x.solids.length, white: [minW, maxW], maxDiff: x.maxDiff, medDiff: x.medianDiff, grey: x.p95GreyAtNativeRes, flash: x.flashesPerSecondAnyTile, step: x.largestLuminanceStepPerFrame }));
  }
};
