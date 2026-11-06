// Real playback in a fresh page: the picture on the audio's output clock, through play, pause and seek.
//   SONG=/media/disclosure.mp3 node tools/lab.mjs tests/musicplay.mjs --out lab-out/music
export default async ({ page, log }) => {
  const r = await page.eval(async src => {
    const app = window.app, S = app.song;
    await S.load(src, { seed: 11, autoplay: true });
    const out = { playing: S.playing, duration: S.duration };
    const rec = [];
    const sample = ms => new Promise(res => { const t0 = performance.now(); const f = () => { rec.push([performance.now() - t0, app.t, S.time()]); if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    await sample(4000);
    const last = rec[rec.length - 1];
    out.frames = rec.length; out.heard = +last[2].toFixed(3); out.pictureLeadMs = +((last[1] - last[2]) * 1000).toFixed(1);
    let back = 0;
    for (let i = 1; i < rec.length; i++) if (rec[i][1] < rec[i - 1][1]) back++;
    out.framesWhereTimeWentBack = back;
    S.pause(); const p0 = S.time(); await new Promise(r => setTimeout(r, 300)); out.heldWhilePaused = Math.abs(S.time() - p0) < 1e-6;
    S.seek(100); S.play(); await sample(1000); out.afterSeekToSong100 = +app.t.toFixed(2); out.playingAfterSeek = S.playing;
    S.pause();
    return out;
  }, process.env.SONG || '/media/disclosure.mp3');
  log(JSON.stringify(r));
};
