// How far the camera travels in a minute, and what a viewer sees of a pattern while it's on. Reads the numbers a frame writes, at 20 fps over a whole film, with no picture and no sound.
//
//   LAB_URL=http://localhost:5331/ SONGS=mgmt,ppp node tools/lab.mjs tests/camtravel.mjs --out lab-out/cam
//   LAB_URL='http://localhost:5331/?cam=0' ...     the same film without it
//
// Pan is in the frame's own units (its half height is 1), so 1 is half a frame's height. Zoom is in natural logs. Roll and tilt are in radians. Everything is the path length per minute, so a push that comes back counts twice.
// "Film" is the slot's own view (the long moves and any camera in them). "Hear" is the layer in front of the sheet, which pushes and sways. A flight's own zoom is counted apart, because it's a transformation.
// "Net" is how far each pattern's view got from where it started, by the end of its time, which is what you've seen of it. Pushes and sways come back. A journey doesn't.
const scan = async ({ fps, cam }) => {
  const { frame } = await import(new URL('src/score/frame.js', location.href).href);
  const { OFF, FRAME } = await import(new URL('src/pattern/layout.js', location.href).href);
  const R = app.R, S = app.song.score, dur = app.song.analysis.duration, edits = { hear: 1 }, Hm = FRAME.hear * 4, n = Math.floor(dur * fps);
  const num = (s, k) => s[OFF[k]];
  const sum = { panF: 0, zoomF: 0, rollF: 0, tiltF: 0, panH: 0, zoomH: 0, rollH: 0, zoomX: 0 };
  let prev = null;
  const seen = new Map();
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / fps, f = frame(S, t, R, edits), A = R.slotA, F = R.frame;
    const s = num(A, 'scale'), now = {
      G: f.from ?? f.G, kind: f.kind, x: num(A, 'tx'), y: num(A, 'ty'), s, rot: num(A, 'rot'), pitch: num(A, 'cam.pitch'), roll: num(A, 'cam.roll'), yaw: num(A, 'cam.yaw'),
      hz: Math.log(1 + F[Hm]), hr: F[Hm + 1], hx: F[Hm + 2], hy: F[Hm + 3], fz: f.kind === 'dive' || f.kind === 'rise' ? Math.log(F[FRAME.dive * 4 + 2] || 1) : 0,
    };
    if (prev && prev.G === now.G) {
      sum.panF += Math.hypot(now.x - prev.x, now.y - prev.y) * s;
      sum.zoomF += Math.abs(Math.log(now.s / prev.s));
      sum.rollF += Math.abs(now.rot - prev.rot) + Math.abs(now.roll - prev.roll) + Math.abs(now.yaw - prev.yaw);
      sum.tiltF += Math.abs(now.pitch - prev.pitch);
    }
    if (prev) {
      sum.panH += Math.hypot(now.hx - prev.hx, now.hy - prev.hy);
      sum.zoomH += Math.abs(now.hz - prev.hz);
      sum.rollH += Math.abs(now.hr - prev.hr);
      if (now.kind === prev.kind) sum.zoomX += Math.abs(now.fz - prev.fz);
    }
    if (!f.kind) {
      let g = seen.get(now.G);
      if (!g) seen.set(now.G, g = { id: now.G.pattern.id, t0: t, t1: t, x0: now.x, y0: now.y, s0: now.s, r0: now.rot, lnLo: 0, lnHi: 0, rotMost: 0, panMost: 0, tiltMost: 0 });
      g.t1 = t;
      g.lnLo = Math.min(g.lnLo, Math.log(now.s / g.s0)); g.lnHi = Math.max(g.lnHi, Math.log(now.s / g.s0));
      g.rotMost = Math.max(g.rotMost, Math.abs(now.rot - g.r0));
      g.panMost = Math.max(g.panMost, Math.hypot(now.x - g.x0, now.y - g.y0) * now.s);
      g.tiltMost = Math.max(g.tiltMost, Math.abs(now.pitch));
    }
    prev = now;
    if (i % 400 === 0) await new Promise(res => setTimeout(res));
  }
  const per = 60 / dur, out = { dur, gestures: S.gestures.length };
  for (const k in sum) out[k] = +(sum[k] * per).toFixed(2);
  const gs = [...seen.values()].filter(g => g.t1 - g.t0 > 2), wt = gs.reduce((a, g) => a + (g.t1 - g.t0), 0) || 1, mean = f => gs.reduce((a, g) => a + f(g) * (g.t1 - g.t0), 0) / wt;
  out.net = { panMost: +mean(g => g.panMost).toFixed(2), zoomRange: +mean(g => g.lnHi - g.lnLo).toFixed(2), rotMost: +mean(g => g.rotMost).toFixed(2), tiltMost: +mean(g => g.tiltMost).toFixed(2), onFor: +mean(g => g.t1 - g.t0).toFixed(1) };
  out.moved = gs.filter(g => g.panMost > 0.5).length + '/' + gs.length;
  return out;
};

export default async ({ page, log, save, sleep }) => {
  const songs = (process.env.SONGS || 'mgmt,ppp,wildflower,disclosure').split(','), seed = +(process.env.SEED || 7), url = await page.eval('location.href'), all = {};
  for (let k = 0; k < songs.length; k++) {
    const song = songs[k];
    if (k) { await page.goto(url); for (let i = 0; i < 200; i++) { let ok = false; try { ok = await page.eval('window.trippee?.ready===true'); } catch { /* still navigating */ } if (ok) break; await sleep(250); } }
    await page.eval(`app.manual=true;window.__done=false;window.__err=null;trippee.song('/media/${song}.mp3',{autoplay:false,seed:${seed}}).then(()=>window.__done=true,e=>window.__err=String(e));0`);
    for (let i = 0; i < 3000; i++) { if (await page.eval('window.__done||!!window.__err')) break; await sleep(200); }
    const err = await page.eval('window.__err');
    if (err) throw new Error(err);
    const r = all[song] = await page.eval(scan, { fps: 20 });
    log(song, JSON.stringify(r));
  }
  save('travel.json', JSON.stringify(all, null, 1));
  const rows = ['panF', 'zoomF', 'rollF', 'tiltF', 'panH', 'zoomH', 'rollH', 'zoomX'];
  log('\nper minute     ' + songs.map(s => s.padStart(11)).join(''));
  for (const k of rows) log(k.padEnd(14) + songs.map(s => String(all[s][k]).padStart(11)).join(''));
  for (const k of ['panMost', 'zoomRange', 'rotMost', 'tiltMost', 'onFor']) log(('net ' + k).padEnd(14) + songs.map(s => String(all[s].net[k]).padStart(11)).join(''));
  log('moved>.5'.padEnd(14) + songs.map(s => String(all[s].moved).padStart(11)).join(''));
};
