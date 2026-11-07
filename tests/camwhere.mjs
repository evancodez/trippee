// The camera's plan for each film: which language each section has, and the moments that get a whip. No picture.
export default async ({ page, log, sleep }) => {
  const songs = (process.env.SONGS || 'mgmt,ppp,wildflower,disclosure').split(','), url = await page.eval('location.href');
  for (let k = 0; k < songs.length; k++) {
    if (k) { await page.goto(url); for (let i = 0; i < 200; i++) { let ok = false; try { ok = await page.eval('window.trippee?.ready===true'); } catch { } if (ok) break; await sleep(250); } }
    await page.eval(`app.manual=true;window.__done=false;trippee.song('/media/${songs[k]}.mp3',{autoplay:false,seed:${process.env.SEED || 7}}).then(()=>window.__done=true);0`);
    for (let i = 0; i < 3000; i++) { if (await page.eval('window.__done')) break; await sleep(200); }
    log(songs[k], await page.eval(() => { const c = app.song.score.camera, H = app.song.score.hear; return c.plan.map(p => `${p.t0} ${p.label} ${p.lang}${p.way < 0 ? '-' : ''} P${p.P} x${p.phrases}`).join(' | ') + '\n  whips ' + c.moments.filter(m => (m.size ?? m.s) > 0.5 && m.sign > 0 && !['section', 'chord', 'fill'].includes(m.kind)).map(m => `${m.t.toFixed(1)} ${m.kind} ${(m.size ?? m.s).toFixed(2)}`).join(', ') + '\n  falls ' + c.moments.filter(m => m.sign < 0 && (m.size ?? m.s) > 0.2).map(m => m.t.toFixed(1)).join(',') + '\n  rehearsal ' + (app.song.rehearsal?.seconds?.toFixed(1)) + ' slowed ' + JSON.stringify(H.camSlowed ?? null) + ' dips ' + (H.dips?.length ?? 0); }));
  }
};
