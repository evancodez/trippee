import { watch, report } from '../tools/look.mjs';
export default async ({ page, save, log }) => {
  const w = await watch(page, save, { name: 'first', seconds: 72, fps: 6, cols: 10, rows: 7 });
  log(report(w).slice(0, 300));
  log(await page.eval(() => window.trippee.metrics()));
};
