// Look at one pattern: PATTERN=<id> node tools/lab.mjs tests/pattern.mjs --out lab-out/me
// Writes <id>.sheet.jpg (one whole gesture out of a solid and into the other) and prints measurements.
import { watch, analyse } from '../tools/look.mjs';
export default async ({ page, save, log }) => {
  const id = process.env.PATTERN;
  const len = +(process.env.LEN || 26);
  await page.eval(`window.trippee.load(${JSON.stringify(id)},{sweep:true,len:${len}})`);
  const w = await watch(page, save, { name: id, seconds: len, fps: 4, cols: 8, rows: 5 });
  const a = analyse(w);
  log(id, JSON.stringify({ solids: a.solids, meanWhite: a.meanWhite, edges: a.edgeRange, greyMedian: a.medianGreyAtNativeRes, greyP95: a.p95GreyAtNativeRes, maxDiff: a.maxDiff, flash: a.flashesPerSecondWholeFrame }));
};
