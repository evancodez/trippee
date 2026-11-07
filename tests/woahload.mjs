// How long a song takes to get ready, how long its rehearsal is, and whether the picture keeps moving while it does. Muted: the song never plays.
//   SONGS=mgmt,ppp SEED=7 LAB_URL=http://localhost:5340/ node tools/lab.mjs tests/woahload.mjs --out lab-out/woah
export default async ({ page, log, sleep }) => {
  const songs = (process.env.SONGS || 'mgmt,ppp,wildflower,disclosure').split(','), seed = +(process.env.SEED || 7), url = await page.eval('location.href');
  for (let k = 0; k < songs.length; k++) {
    if (k) await page.goto(url);
    for (let i = 0; i < 200; i++) { let ok = false; try { ok = await page.eval('window.trippee?.ready===true'); } catch { /* still navigating */ } if (ok) break; await sleep(250); }
    await sleep(4000);       // the page's own programs, as a person arriving would have them
    const song = songs[k];
    const r = await page.eval(async ({ song, seed }) => {
      const gaps = []; let last = performance.now(), going = true;
      const tick = () => { const n = performance.now(); gaps.push(n - last); last = n; if (going) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      const t0 = performance.now();
      await trippee.song(`/media/${song}.mp3`, { autoplay: false, seed });
      const total = (performance.now() - t0) / 1000;
      going = false;
      gaps.sort((a, b) => b - a);
      const R = app.song.rehearsal ?? {}, S = app.song.score;
      return { total: +total.toFixed(1), listen: +(app.song.analyseSeconds ?? 0).toFixed(1), rehearsal: +(R.seconds ?? 0).toFixed(1), range: +(R.rangeSeconds ?? 0).toFixed(1), guard: +(R.flash?.seconds ?? 0).toFixed(1), left: R.flash?.left?.length ?? null, worstFrames: gaps.slice(0, 6).map(x => Math.round(x)), over100: gaps.filter(x => x > 100).length, frames: gaps.length, refused: S.refused?.length ?? 0, clocked: R.clocked, programs: S.woahPrograms, tries: window.__tries, cast: S.stats?.cast?.slice(0, 200), woah: S.woah?.list?.map(x => `${x.id}@${x.at}`).join(' ') ?? null };
    }, { song, seed });
    log(song, JSON.stringify(r));
  }
};
