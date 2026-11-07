// What's going on either side of a jerk: each frame's difference from the last, at 60 fps, with the numbers that moved. Muted.   SONG=ppp AT=118.86 node tools/lab.mjs tests/camjerk.mjs --out lab-out/cam
import { dropSong } from '../tools/look.mjs';
export default async ({ page, log }) => {
  const song = process.env.SONG || 'ppp';
  await page.eval(`app.manual=true;window.__done=false;trippee.song('/media/${song}.mp3',{autoplay:false,seed:${process.env.SEED || 7}}).then(()=>window.__done=true);0`);
  for (let i = 0; i < 3000; i++) { if (await page.eval('window.__done')) break; await new Promise(r => setTimeout(r, 200)); }
  for (const at of (process.env.AT || '118.86').split(',').map(Number)) {
    const out = await page.eval(async ({ at, span }) => {
      const { OFF } = await import(new URL('src/pattern/layout.js', location.href).href);
      const T = window.trippee, W = 320, H = 180, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d', { willReadFrequently: true });
      app.song.pause?.(); app.ui?.song?.show?.(false); app.governor.enabled = false; app.R.drawScale = 1;
      let prev = null; const rows = [], n = Math.round(span * 2 * 60);
      for (let i = 0; i < n; i++) {
        const t = at - span + i / 60; T.seek(t); x.drawImage(T.canvas, 0, 0, W, H); const d = x.getImageData(0, 0, W, H).data, A = app.R.slotA, f = app.lastFrame;
        let s = 0; if (prev) { for (let k = 0; k < d.length; k += 4) s += Math.abs(d[k] - prev[k]); s /= (W * H); } prev = d;
        const v = k => A[OFF[k]];
        rows.push(`${t.toFixed(3)} d${s.toFixed(1).padStart(6)} ${f.kind ?? '-'} x${(f.T ?? 0).toFixed(3)} ${f.G.pattern.id.slice(0, 12)} s${v('scale').toFixed(3)} r${v('rot').toFixed(3)} t${v('tx').toFixed(3)},${v('ty').toFixed(3)} p${v('cam.pitch').toFixed(3)} k${v('surf.kind')} th${v('theta').toFixed(3)}`);
      }
      return rows;
    }, { at, span: +(process.env.SPAN || 0.25) });
    log(out.join('\n'));
  }
};
