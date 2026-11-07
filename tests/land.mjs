// The hit (docs/DIRECTION.md section 3, Timing). Is a transformation's fastest frame on its hit, and is a film with the flag off exactly the film it was?
//
//   SAVE=1 node tools/lab.mjs tests/land.mjs --url '<url>?peak=0' --out lab-out/a1-land              writes each song's fingerprint, flag off, to <out>/identity.json
//   CHECK=1 node tools/lab.mjs tests/land.mjs --url '<url>?peak=0' --out lab-out/a1-land             compares against it: gestures (t0 t1 id morph xform peak), exits 1 if they differ
//   node tools/lab.mjs tests/land.mjs --out lab-out/a1-land                                          what land() did, song by song, with the speed of T around each hit, a pop scan and strips
//   SONGS=mgmt,ppp  only these.  SEED=7  another take.  STRIPS=0  no pictures.
//
// Each song gets a fresh page and the film the rehearsal passed, stepped by hand with no sound. Everything here reads the score and the rehearsal's own eyes.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const fingerprint = () => app.song.score.gestures.map(G => [G.t0, G.t1, G.morph ?? 0].map(v => v.toFixed(4)).concat(G.pattern.id, G.xform?.id ?? '-', G.peak ? `${G.peak.hit.toFixed(4)}/${G.peak.q}` : '-').join(' ')).join('\n');

// How T goes through each transformation, on the film's clock: where it's fastest against the hit, how fast, and the biggest step between two frames against the median of the steps around it.
const walk = async () => {
  const here = u => new URL(u, location.href).href;
  const [{ morphAt }, { smoother }, { getRig, shot }] = await Promise.all(['src/score/morphclock.js', 'src/score/curves.js', 'src/music/rehearse.js'].map(u => import(here(u))));
  const R = await getRig(), S = app.song.score, g = S.gestures, FPS = 30, W = 96, H = 54, px = new Uint8Array(W * H * 4), out = [];
  for (let i = 0; i < g.length - 1; i++) {
    const G = g[i], N = g[i + 1];
    if (!G.morph) continue;
    const t0 = G.t1 - G.morph, n = Math.ceil(G.morph * FPS);
    // Its plan, so that a flight's limit is the one it will really play with
    shot(R, S, t0 + 0.01, W, H, px);
    let top = 0, at = t0, last = 0, back = 0, jump = 0;
    for (let k = 1; k <= n; k++) {
      const t = t0 + k / FPS, m = morphAt(S, G, N, Math.min(t, G.t1 - 1e-4)), T = m ? smoother(m.x) : 1, v = (T - last) * FPS;
      if (v > top) { top = v; at = t; }
      if (T < last - 1e-9) back++;
      jump = Math.max(jump, T - last);
      last = T;
    }
    // A step in the picture itself, across the whole morph and a second either side
    const steps = [];
    let prev = null;
    for (let t = Math.max(t0 - 6, G.t0); t < G.t1 + 1; t += 1 / FPS) {
      shot(R, S, t, W, H, px);
      const now = px.slice();
      if (prev) { let d = 0; for (let k = 1; k < now.length; k += 4) d += Math.abs(now[k] - prev[k]); steps.push({ t, d: d / (W * H) }); }
      prev = now;
    }
    const sorted = steps.map(s => s.d).sort((a, b) => a - b), med = sorted[sorted.length >> 1], worst = steps.reduce((a, b) => (b.d > a.d ? b : a), steps[0]);
    const hit = G.peak?.hit ?? G.t1;
    // The hang: how long the picture all but stops on the way in to the hit, against how it was moving before the transformation started. Half a second's mean, so one still frame isn't a hang.
    const before = steps.filter(s => s.t < t0).map(s => s.d).sort((a, b) => a - b), body = before[before.length >> 1] ?? med;
    let hang = 0, run = 0;
    const inTo = steps.filter(s => s.t >= t0 && s.t <= hit);
    for (let a = 0; a < inTo.length; a++) { const w = inTo.slice(a, a + 15), m = w.reduce((x, y) => x + y.d, 0) / w.length; run = m < 0.5 * body ? run + 1 / FPS : 0; hang = Math.max(hang, run); }
    // The same film time twice, the second straight after a look elsewhere: seeking has to land on the same picture as playing
    shot(R, S, hit, W, H, px); const a = px.slice();
    shot(R, S, t0 - 3, W, H, px);
    G.plan = G.planFor = G.planning = null;
    shot(R, S, hit, W, H, px);
    let seek = 0; for (let k = 1; k < a.length; k += 4) seek = Math.max(seek, Math.abs(a[k] - px[k]));
    out.push({ i, id: `${G.pattern.id}>${N.pattern.id}`, kind: G.plan?.kind ?? G.xform?.id ?? '?', xf: G.xform?.id ?? '', hit: +hit.toFixed(2), q: G.peak?.q ?? null, D: +G.morph.toFixed(2), tail: +(G.t1 - hit).toFixed(2),
      fastestOff: +(at - hit).toFixed(2), fastest: +top.toFixed(2), lnZ: +(G.plan?.lnZ ?? 0).toFixed(2), jump: +jump.toFixed(3), back, worstAt: +(worst.t - hit).toFixed(2), worst: +worst.d.toFixed(1), med: +med.toFixed(1), body: +body.toFixed(1), hang: +hang.toFixed(1), seek });
    await new Promise(r => setTimeout(r));
  }
  return { rows: out, landed: S.landed ?? null, refused: S.refused ?? null, flash: S.rehearsal?.flash ?? null };
};

// Before, on and after each hit, for looking at. No sound, no film clock: the rehearsal's eyes at the fixed moments.
const strip = async ({ title, rows, bar, tw, th }) => {
  const { getRig, shot } = await import(new URL('src/music/rehearse.js', location.href).href);
  const R = await getRig(), S = app.song.score, W2 = 640, H2 = 360, big = new Uint8Array(W2 * H2 * 4), tmp = new OffscreenCanvas(W2, H2), tg = tmp.getContext('2d');
  const offs = [-4, -2, -1, -0.5, 0, 0.5, 1, 2], top = 26, cap = 16, c = document.createElement('canvas');
  c.width = offs.length * tw; c.height = top + rows.length * (th + cap);
  const g = c.getContext('2d');
  g.fillStyle = '#161616'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff'; g.font = 'bold 14px monospace'; g.fillText(title, 6, 18);
  g.font = '11px monospace';
  rows.forEach((r, y) => offs.forEach((o, x) => {
    const t = r.hit + o * bar;
    shot(R, S, t, W2, H2, big);
    const d = tg.createImageData(W2, H2);
    for (let k = 0; k < H2; k++) d.data.set(big.subarray((H2 - 1 - k) * W2 * 4, (H2 - k) * W2 * 4), k * W2 * 4);
    tg.putImageData(d, 0, 0);
    g.drawImage(tmp, x * tw, top + y * (th + cap) + cap, tw, th);
    g.fillStyle = o === 0 ? '#ff0' : '#bbb';
    g.fillText(o === 0 ? `${r.hit.toFixed(1)} HIT ${r.kind} ${r.id}`.slice(0, 44) : `${o > 0 ? '+' : ''}${o} bar`, x * tw + 3, top + y * (th + cap) + 12);
  }));
  return c.toDataURL('image/jpeg', 0.8);
};

export default async ({ page, log, save, sleep, out }) => {
  const songs = (process.env.SONGS || 'ppp,wildflower,disclosure,mgmt').split(','), seed = +(process.env.SEED || 7), url = await page.eval('location.href');
  const on = !/[?&]peak=0/.test(url), file = join(out, 'identity.json'), prints = {};
  let bad = 0;
  for (let k = 0; k < songs.length; k++) {
    const song = songs[k];
    if (k) { await page.goto(url); for (let i = 0; i < 200; i++) { let ok = false; try { ok = await page.eval('window.trippee?.ready===true'); } catch { /* still navigating */ } if (ok) break; await sleep(250); } }
    await page.eval(`app.manual=true;window.__done=false;window.__err=null;trippee.song('/media/${song}.mp3',{autoplay:false,seed:${seed}}).then(()=>window.__done=true,e=>window.__err=String(e));0`);
    for (let i = 0; i < 3000; i++) { if (await page.eval('window.__done||!!window.__err')) break; await sleep(200); }
    const err = await page.eval('window.__err');
    if (err || !(await page.eval('window.__done'))) throw new Error(`${song} didn't load: ${err ?? 'timed out'}`);
    prints[song] = await page.eval(fingerprint);
    log(song, 'gestures', prints[song].split('\n').length, 'peaks', (prints[song].match(/\/2$/gm) ?? []).length);
    if (!on) continue;
    const r = await page.eval(walk);
    log(song, 'landed', JSON.stringify(r.landed));
    log(song, 'refused', JSON.stringify(r.refused));
    for (const x of r.rows) log(' ', JSON.stringify(x));
    const peaked = r.rows.filter(x => x.q), near = peaked.filter(x => Math.abs(x.fastestOff) <= 0.5);
    const hangs = r.rows.map(x => x.hang).sort((a, b) => a - b);
    log(song, `peaked ${peaked.length}, fastest T within .5 s of the hit: ${near.length}; running backwards: ${r.rows.filter(x => x.back).length}; a seek landing elsewhere: ${r.rows.filter(x => x.seek > 2).length}; hang into a hit, median ${hangs[hangs.length >> 1]} s, worst ${hangs.at(-1)} s`);
    if (process.env.STRIPS !== '0') {
      const bar = await page.eval('app.song.score.react.M.bar'), rows = r.rows.filter(x => x.q != null).slice(0, 12);
      save(`${song}.hits.jpg`, await page.eval(strip, { title: `${song}: bars from each hit`, rows, bar, tw: 200, th: 112 }));
    }
    const errs = page.logs.filter(l => /^\[(error|exception)\]/.test(l));
    if (errs.length) { bad++; log(' page errors:', errs.length, errs.at(-1).slice(0, 300)); }
  }
  if (process.env.SAVE) { writeFileSync(file, JSON.stringify(prints, null, 1)); log('saved', file); }
  if (process.env.CHECK) {
    if (!existsSync(file)) throw new Error(`nothing saved at ${file}`);
    const was = JSON.parse(readFileSync(file, 'utf8'));
    for (const song of songs) {
      if (was[song] === prints[song]) { log(song, 'identical'); continue; }
      bad++;
      const a = (was[song] ?? '').split('\n'), b = prints[song].split('\n');
      log(song, 'DIFFERS', a.length, 'gestures against', b.length);
      for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { log('  was', a[i]); log('  now', b[i]); }
    }
  }
  if (bad) process.exitCode = 1;
};
