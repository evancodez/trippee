// How long a rehearsal takes, with whatever URL this is given. No picture.
export default async ({ page, log, sleep }) => {
  const songs = (process.env.SONGS || 'mgmt,ppp,wildflower,disclosure').split(','), url = await page.eval('location.href');
  for (let k = 0; k < songs.length; k++) {
    if (k) { await page.goto(url); for (let i = 0; i < 200; i++) { let ok = false; try { ok = await page.eval('window.trippee?.ready===true'); } catch { } if (ok) break; await sleep(250); } }
    await page.eval(`app.manual=true;window.__done=false;trippee.song('/media/${songs[k]}.mp3',{autoplay:false,seed:7}).then(()=>window.__done=true);0`);
    for (let i = 0; i < 3000; i++) { if (await page.eval('window.__done')) break; await sleep(200); }
    log(songs[k], await page.eval(() => `rehearsal ${app.song.rehearsal?.seconds?.toFixed(1)} camera ${!!app.song.score.camera} slowed ${app.song.score.hear.camSlowed?.length ?? 0} dips ${app.song.score.hear.dips?.length ?? 0}`));
  }
};
