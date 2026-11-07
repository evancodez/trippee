// The camera's hands over a whole song, as a picture: seven tracks against the song's sections, and where the whips land. For judging phrasing. No sound.
//   SONGS=mgmt,ppp node tools/lab.mjs tests/camhands.mjs --out lab-out/cam
const draw = async () => {
  const S = app.song.score, c = S.camera, A = app.song.analysis, W = 1800, rowH = 74, rows = [['alt', -1.2, 1.4], ['spin', null, null], ['tip', -1, 1], ['dir', null, null], ['lens', 0.5, 5.5], ['speed', 0, 2], ['veil', 0, 1]];
  const cv = document.createElement('canvas'); cv.width = W; cv.height = 40 + rows.length * rowH; const g = cv.getContext('2d');
  g.fillStyle = '#111'; g.fillRect(0, 0, W, cv.height); const dur = c.dur, X = t => t / dur * W;
  const colours = { drift: '#3b5', plate: '#59c', survey: '#a7f', wander: '#7c5', dolly: '#fa3', rock: '#f6a', sweep: '#f44', corkscrew: '#ff5', swoop: '#5ee', veil: '#ccc' };
  let last = 0;
  for (const s of A.segments) { g.fillStyle = '#555'; g.fillRect(X(s.t0), 0, 1, cv.height); g.fillStyle = '#ddd'; g.font = '11px monospace'; g.fillText(s.label, X(s.t0) + 2, 11); }
  for (let t = 0; t < dur; t += 0.5) { g.fillStyle = colours[c.langAt(t)] ?? '#888'; g.fillRect(X(t), 14, X(0.5) + 1, 8); }
  for (const m of c.moments) if ((m.size ?? m.s) > 0.5 && m.sign > 0 && !['section', 'chord', 'fill'].includes(m.kind)) { g.fillStyle = '#f33'; g.fillRect(X(m.t), 24, 2, cv.height); }
  for (const t of c.knots) { g.fillStyle = '#333'; g.fillRect(X(t), 24, 1, cv.height); }
  rows.forEach(([k, lo, hi], r) => {
    const a = c.T[k], y0 = 40 + r * rowH, n = Math.min(a.length, Math.floor(dur * 30));
    if (lo == null) { lo = Infinity; hi = -Infinity; for (let i = 0; i < n; i++) { lo = Math.min(lo, a[i]); hi = Math.max(hi, a[i]); } }
    g.fillStyle = '#ddd'; g.font = '11px monospace'; g.fillText(k + ' ' + lo.toFixed(1) + '..' + hi.toFixed(1), 4, y0 + 11);
    g.strokeStyle = '#7df'; g.beginPath(); for (let i = 0; i < n; i += 3) { const px = X(i / 30), py = y0 + rowH - 4 - (a[i] - lo) / (hi - lo || 1) * (rowH - 8); if (i) g.lineTo(px, py); else g.moveTo(px, py); } g.stroke();
  });
  return cv.toDataURL('image/png');
};
export default async ({ page, log, save, sleep }) => {
  const songs = (process.env.SONGS || 'mgmt,ppp,wildflower,disclosure').split(','), url = await page.eval('location.href');
  for (let k = 0; k < songs.length; k++) {
    if (k) { await page.goto(url); for (let i = 0; i < 200; i++) { let ok = false; try { ok = await page.eval('window.trippee?.ready===true'); } catch { } if (ok) break; await sleep(250); } }
    await page.eval(`app.manual=true;window.__done=false;trippee.song('/media/${songs[k]}.mp3',{autoplay:false,seed:7}).then(()=>window.__done=true);0`);
    for (let i = 0; i < 3000; i++) { if (await page.eval('window.__done')) break; await sleep(200); }
    save(`${songs[k]}.hands.png`, await page.eval(draw));
    log(songs[k], await page.eval(() => app.song.score.camera.plan.map(p => `${p.t0} ${p.label} ${p.lang}${p.way < 0 ? '-' : ''} P${p.P} x${p.phrases}`).join(' | ')));
  }
};
