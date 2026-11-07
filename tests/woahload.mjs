// How long a song takes to get ready, how long its rehearsal is, and whether the picture keeps moving while it does. Muted: the song never plays.
//   SONGS=mgmt,ppp SEED=7 LAB_URL=http://localhost:5340/ node tools/lab.mjs tests/woahload.mjs --size 1920,1080 --out lab-out/woah
//   PLAY=1 ...          then plays it through in real time (muted, by the lab's own flag), and says the frame rate, and the worst of it by what was on. PLAY=60 is only the first 60 s
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
      return { total: +total.toFixed(1), listen: +(app.song.analyseSeconds ?? 0).toFixed(1), rehearsal: +(R.seconds ?? 0).toFixed(1), range: +(R.rangeSeconds ?? 0).toFixed(1), guard: +(R.flash?.seconds ?? 0).toFixed(1), left: R.flash?.left?.length ?? null, worstFrames: gaps.slice(0, 6).map(x => Math.round(x)), over100: gaps.filter(x => x > 100).length, frames: gaps.length, refused: S.refused?.length ?? 0, clocked: R.clocked, guardClock: R.flash?.clock, looked: R.flash?.looked, allowed: R.flash?.allowed, falseAlarms: R.flash?.falseAlarms, spots: R.flash?.tried?.length, swaps: R.flash?.swaps, programs: S.woahPrograms, tries: window.__tries, cast: S.stats?.cast?.slice(0, 200), woah: S.woah?.list?.map(x => `${x.id}@${x.at}`).join(' ') ?? null };
    }, { song, seed });
    log(song, JSON.stringify(r));
    if (process.env.PLAY) {
      const most = +process.env.PLAY > 1 ? +process.env.PLAY : Infinity;
      const q = await page.eval(async most => {
        const S = app.song.score, list = S.woah?.list ?? [], d = Math.min(app.song.duration, most);
        const gaps = [], at = []; let last = 0, tiers = 0;
        app.song.play();
        await new Promise(res => { const tick = n => { if (last) { gaps.push(n - last); at.push(app.pictureT?.() ?? 0); } last = n; if (app.R.drawScale < 1) tiers++; if ((app.pictureT?.() ?? 0) >= d - 0.3 || !app.song.playing) res(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
        app.song.pause?.();
        const sorted = [...gaps].sort((a, b) => a - b), pct = p => sorted[Math.floor(sorted.length * p)], fps = x => +(1000 / x).toFixed(1);
        const worst = gaps.map((g, i) => [g, at[i]]).sort((a, b) => b[0] - a[0]).slice(0, 8).map(([g, t]) => `${Math.round(g)}ms@${t.toFixed(1)}${list.find(x => t >= x.t0 && t <= x.t1)?.id ? ' ' + list.find(x => t >= x.t0 && t <= x.t1).id : ''}`);
        const by = {};
        gaps.forEach((g, i) => { const k = list.find(x => at[i] >= x.t0 && at[i] <= x.t1)?.id ?? 'rest'; (by[k] ??= []).push(g); });
        const rates = Object.fromEntries(Object.entries(by).map(([k, v]) => { const s2 = v.sort((a, b) => a - b); return [k, `${fps(s2[s2.length >> 1])}/${fps(s2[Math.floor(s2.length * 0.99)])}`]; }));
        return { seconds: +d.toFixed(0), frames: gaps.length, medianFps: fps(pct(0.5)), p1Fps: fps(pct(0.99)), over33: gaps.filter(g => g > 33.4).length, over50: gaps.filter(g => g > 50).length, over100: gaps.filter(g => g > 100).length, framesBelowFullSize: tiers, worst, rates };
      }, most);
      log(song, 'PLAY', JSON.stringify(q));
    }
  }
};
