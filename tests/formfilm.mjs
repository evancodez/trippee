// A whole film at a glance, and whether it breathes. Steps it on a fixed clock with the rehearsal's own eyes, so it's quick and plays no sound.
//   SONG=ppp node tools/lab.mjs tests/formfilm.mjs --out lab-out/form
// Writes <song>.film.jpg, one frame every EVERY seconds with its time and pattern, and says the white autocorrelation at the breath, form on against form off.
import { breathOf, breathFold } from './judge.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
export { breathFold };
export default async ({ page, log, save }) => {
  const song = process.env.SONG || 'ppp', every = +(process.env.EVERY || 2);
  // FORM=0 SPREAD=0: the same film without them, to compare
  await page.eval(`(async () => { const { flags } = await import(new URL('src/score/flags.js', location.href).href); ${process.env.FORM === '0' ? 'flags.form = false;' : ''}${process.env.SPREAD === '0' ? 'flags.spread = false;' : ''}${(process.env.FLAGSOFF || '').split(',').filter(Boolean).map(f => `flags.${f} = false;`).join('')} })()`);
  await page.eval(`app.manual=true;window.__done=false;trippee.song('/media/${song}.mp3',{autoplay:false}).then(()=>window.__done=true);0`);
  for (let i = 0; i < 1800; i++) { if (await page.eval('window.__done')) break; await sleep(200); }
  const r = await page.eval(async ({ every, nopops }) => {
    const here = u => new URL(u, location.href).href;
    const { getRig, shot } = await import(here('src/music/rehearse.js'));
    const R = await getRig(), S = app.song.score, F = 12;
    const W = 160, H = 90, px = new Uint8Array(W * H * 4);
    const look = (score, t) => { const f = shot(R, score, t, W, H, px); let w = 0, n = 0; for (let i = 1; i < px.length; i += 8) { if (px[i] > 127) w++; n++; } return { w: w / n, id: f.G.pattern.id }; };
    const dur = S.gestures.at(-2).t1;
    // white at 12 fps, the judge's breath measure
    const white = [];
    for (let i = 0; i < dur * F; i++) { white.push(+look(S, i / F).w.toFixed(4)); if (i % 60 === 0) await new Promise(r => setTimeout(r)); }
    // 60 fps across each landing: the biggest step in the mean picture
    const LOW = new Uint8Array(W * H * 4), pops = [];
    for (const [G, c, what] of nopops ? [] : S.gestures.slice(0, -1).flatMap(G => [[G, G.t1 - G.morph, 'starts'], [G, G.t1, 'lands']])) {
      let prev = null, worst = 0, at = 0;
      const steps = [];
      for (let i = -36; i <= 36; i++) {
        const t = c + i / 60; shot(R, S, t, W, H, LOW);
        if (prev) { let d = 0; for (let k = 1; k < LOW.length; k += 4) d += Math.abs(LOW[k] - prev[k]); d /= W * H; steps.push(d); if (d > worst) { worst = d; at = t; } }
        prev = LOW.slice();
      }
      const med = steps.slice().sort((a, b) => a - b)[steps.length >> 1];
      // A pop stands alone: a fast end to a flight is big too, but it gets there smoothly. Against the steps two frames either side of it.
      const w = steps.indexOf(worst), around = Math.max(steps[w - 2] ?? 0, steps[w + 2] ?? 0);
      pops.push({ t: +c.toFixed(2), what, id: G.pattern.id, next: S.gestures[S.gestures.indexOf(G) + 1].pattern.id, plan: G.plan?.kind, worst: +worst.toFixed(2), med: +med.toFixed(2), at: +at.toFixed(2), spike: worst > 2 * around + 2 });
      await new Promise(r => setTimeout(r));
    }
    // the sheet
    const cols = 12, tw = 192, th = 108, n = Math.ceil(dur / every), c = document.createElement('canvas');
    c.width = cols * tw; c.height = Math.ceil(n / cols) * th;
    const g = c.getContext('2d'), SW = 384, SH = 216, big = new Uint8Array(SW * SH * 4), tmp = new OffscreenCanvas(SW, SH), tg = tmp.getContext('2d');
    g.font = '11px monospace';
    for (let i = 0; i < n; i++) {
      const t = i * every, f = shot(R, S, t, SW, SH, big), d = tg.createImageData(SW, SH);
      for (let y = 0; y < SH; y++) d.data.set(big.subarray((SH - 1 - y) * SW * 4, (SH - y) * SW * 4), y * SW * 4);
      tg.putImageData(d, 0, 0);
      const x = (i % cols) * tw, y = (i / cols | 0) * th;
      g.drawImage(tmp, x, y, tw - 1, th - 1);
      const label = `${t.toFixed(0)} ${(f.N ?? f.G).pattern.id}${f.kind ? ' ' + f.kind : ''}`;
      g.fillStyle = '#000'; g.fillRect(x, y, Math.min(tw, g.measureText(label).width + 4), 13); g.fillStyle = f.kind ? '#6f6' : '#fc0'; g.fillText(label, x + 2, y + 10);
      if (i % 20 === 0) await new Promise(r => setTimeout(r));
    }
    // Nothing may start while the clock is catching up, and the rehearsal can shorten a morph
    const late = (S.time.windows ?? []).flatMap(w => S.gestures.slice(0, -1).filter(g => g.t1 - g.morph > w.from && g.t1 - g.morph < w.paid).map(g => `${g.pattern.id} ${(g.t1 - g.morph).toFixed(1)} in ${w.from.toFixed(1)}-${w.paid.toFixed(1)}`));
    const rh = app.song.rehearsal, rides = rh?.rides ?? [], ways = rh?.ways ?? [];
    const quality = { narrow: rides.filter(x => x.width < 0.3).length, rides: rides.length, added: rides.filter(x => x.added).length, kinds: ways.reduce((o, w) => { o[w.kind] = (o[w.kind] || 0) + 1; return o; }, {}), turned: ways.filter(w => w.turned).length, noisy: ways.filter(w => w.noise > 1.5 || w.colour > 0.7).map(w => `${w.id} ${w.noise}/${w.colour}`) };
    return { quality, late, fps: F, white, pops, sheet: c.toDataURL('image/jpeg', 0.8), stats: S.stats, breath: S.react.M.breath.seconds, t: S.react.M.breath.t, sitOut: app.song.rehearsal?.sitOut, seconds: app.song.rehearsal?.seconds };
  }, { every, nopops: !!process.env.NOPOPS });
  save(`${song}.film.jpg`, r.sheet);
  save(`${song}.white.json`, Buffer.from(JSON.stringify({ fps: r.fps, white: r.white, t: r.t, breath: r.breath })));
  const b = breathOf({ fps: r.fps, white: r.white }, r.breath, r.t);
  log(song, JSON.stringify(r.stats));
  log('rehearsal', r.seconds?.toFixed(1), 's, sat out', r.sitOut);
  log('breath', r.breath.toFixed(2), JSON.stringify(b));
  log('quality', JSON.stringify(r.quality));
  log('fold', JSON.stringify(breathFold({ fps: r.fps, white: r.white }, r.t, r.breath)));
  log('morphs starting in a lag:', r.late.length ? r.late.join(', ') : 'none');
  log('pops', r.pops.map(p => `${p.t} ${p.what} ${p.id}>${p.next} ${p.plan ?? ''} worst ${p.worst} med ${p.med}${p.spike ? ' POP@' + p.at : ''}`).join('\n  '));
  const errs = await page.eval('window.__errors ?? null');
  if (errs) log('errors', errs);
};
