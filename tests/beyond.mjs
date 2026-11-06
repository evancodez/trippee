// Beyond, next to black and white: node tools/lab.mjs tests/beyond.mjs --out lab-out/beyond
// Pure must be byte-identical at zero offset, then each pattern gets a row: black and white, then the plates at several openings.
import { createHash } from 'node:crypto';
const IDS = (process.env.IDS || 'checks.crush,lattice.master,pole.rings,lines.river,rooms.nested,checks.vega,lines.ghost,dots.inflate,body.tunnel,waves.pond,pole.dipole,void.zebra').split(',');
const OPENS = (process.env.OPENS || '0.15,0.5,1').split(',').map(Number);
const PAL = process.env.PAL;
const U = +(process.env.U || 0.5);
export default async ({ page, save, log }) => {
  const hash = async () => createHash('sha256').update(await page.eval('trippee.capture()')).digest('hex').slice(0, 16);
  const list = await page.eval('app.patterns.map(p=>p.id)');
  const ids = IDS.filter(i => list.includes(i));
  log('patterns', ids.join(' '));
  // Zero offset against black and white, taking the reference before Beyond has ever been touched
  let same = 0;
  for (const id of ids) {
    await page.eval(`app.edits.beyond = null; trippee.still(${JSON.stringify(id)},${U})`);
    const pure = await hash();
    await page.eval('app.beyond.on(); app.beyond.snap(0); trippee.seek(app.t)');
    const zero = await hash();
    await page.eval('app.beyond.snap(.6); trippee.seek(app.t)');
    const opened = await hash();
    await page.eval('app.beyond.off(); app.beyond.snap(); trippee.seek(app.t)');
    const back = await hash();
    const ok = pure === zero && pure === back && opened !== pure;
    if (ok) same++; else log(id, 'pure', pure, 'zero', zero, 'off', back, 'opened', opened, 'DIFFERENT');
  }
  log(`zero offset: ${same}/${ids.length} byte-identical to black and white, and opened differs`);
  // the same in the middle of a morph, where both slots are live
  await page.eval(`trippee.morph('lattice.master','rooms.nested',8,1); app.manual=true; trippee.seek(5)`);
  const mPure = await hash();
  await page.eval('app.beyond.on(); app.beyond.snap(0); trippee.seek(5)');
  const mZero = await hash();
  await page.eval('app.beyond.off(); app.beyond.snap(); trippee.seek(5)');
  log('mid-morph', mPure === mZero ? 'IDENTICAL' : 'DIFFERENT', mPure, mZero);
  // the sheet
  const cols = OPENS.length + 1, W = 480, H = 270;
  const data = await page.eval(async ({ ids, OPENS, cols, W, H, PAL, U }) => {
    const cv = document.createElement('canvas'); cv.width = cols * W; cv.height = ids.length * H;
    const x = cv.getContext('2d');
    const draw = (row, col) => x.drawImage(app.canvas, col * W, row * H, W, H);
    for (let r = 0; r < ids.length; r++) {
      trippee.still(ids[r], U);
      app.beyond.off(); app.beyond.snap(); trippee.seek(app.t); draw(r, 0);
      app.beyond.on();
      if (PAL) app.beyond.setPalette(+PAL);
      OPENS.forEach((o, c) => { app.beyond.snap(o); trippee.seek(app.t); draw(r, c + 1); });
    }
    app.beyond.off(); app.beyond.snap();
    return cv.toDataURL('image/jpeg', 0.92);
  }, { ids, OPENS, cols, W, H, PAL, U });
  save(process.env.NAME || 'sheet.jpg', data);
  log('errors', page.logs.filter(l => /\[error\]|\[exception\]/.test(l)));
};
