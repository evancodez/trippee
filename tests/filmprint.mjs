// Checker's: a film's frames and gesture list on whatever tree --url serves, to diff against tag v2.4. Muted (the lab). No source touched.
//   SONGS=mgmt,ppp WHICH=cut|auto TAG=now QUERY='?cut=restless' node tools/lab.mjs <this> --url http://localhost:5300/ --out lab-out/chk/frames
import { createHash } from 'node:crypto';
const sleep = ms => new Promise(r => setTimeout(r, ms));
export default async ({ page, save, log }) => {
  const SONGS = (process.env.SONGS || 'mgmt,ppp').split(','), WHICH = process.env.WHICH || 'cut', TAG = process.env.TAG || 'now', BASE = process.env.BASE || process.env.LAB_URL || 'http://localhost:5300/', QUERY = process.env.QUERY || '', STEP = +(process.env.STEP || 1.7);
  for (const song of SONGS) {
    await page.goto(BASE + QUERY);
    for (let i = 0; i < 240; i++) { if (await page.eval('typeof window.trippee !== "undefined" && window.trippee.ready === true')) break; await sleep(250); }
    const t0 = Date.now();
    const made = await page.eval(async ({ song, WHICH, STEP }) => {
      const here = u => new URL(u, location.href).href;
      const t00 = performance.now();
      await app.song.load(`/media/${song}.mp3`, { seed: 7 });
      const loadS = (performance.now() - t00) / 1000;
      app.song.pause(); app.ui?.song?.show?.(false);
      const [{ compose }, { rehearse }, { cutFor }, { auditCut }] = await Promise.all(['src/score/compose.js', 'src/music/rehearse.js', 'src/score/cuts/index.js', 'src/score/cut.js'].map(u => import(here(u))));
      const A = app.song.analysis;
      let sc, r, reh = 0;
      if (WHICH === 'cut') {
        const cut = await cutFor(A.hash);
        sc = compose(A, 7, { patterns: app.patterns, aspect: 16 / 9, cut });
        const t1 = performance.now();
        r = await rehearse(sc, Math.min(A.duration, 1200), () => {}, { lastTry: true });
        reh = (performance.now() - t1) / 1000;
        auditCut(sc, r);
        app.song.score = sc; app.stage.setScore(sc);
      } else {
        sc = app.song.score; r = app.song.rehearsal; reh = r?.seconds ?? 0;
      }
      const T = window.trippee; app.manual = true; app.governor.enabled = false; app.R.drawScale = 1; app.paused = false;
      const dur = A.duration, times = [];
      for (let t = 0.25; t < dur + 4; t += STEP) times.push(+t.toFixed(3));
      const enc = new TextEncoder();
      const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
      const small = document.createElement('canvas'); small.width = 64; small.height = 36; const x = small.getContext('2d', { willReadFrequently: true });
      const frames = [];
      for (const t of times) {
        T.seek(t);
        const s = await sha(T.capture());
        x.drawImage(T.canvas, 0, 0, 64, 36);
        const d = x.getImageData(0, 0, 64, 36).data, thumb = []; for (let i = 0; i < d.length; i += 4) thumb.push(d[i + 1]);
        frames.push({ t, s, thumb, id: app.lastFrame?.G?.pattern?.id, kind: app.lastFrame?.kind ?? null });
        await new Promise(r => setTimeout(r));
      }
      const r2 = x => +(+x).toFixed(2);
      return {
        loadS, reh, dur, arrival: app.song.arrival, refused: sc.refused, fixes: r?.flash?.fixes, left: r?.flash?.left,
        gestures: sc.gestures.map(G => ({ t0: r2(G.t0), t1: r2(G.t1), morph: r2(G.morph || 0), id: G.pattern.id, hero: G.hero ?? null, xform: G.xform?.id ?? null, moves: (G.moves || []).map(m => m.id), rise: G.rise ?? null, calm: G.calm ?? null, peak: G.peak?.q ?? null, phiScale: G.phiScale ?? null })),
        cast: (sc.cast || []).map(c => ({ kind: c.kind, at: c.at, id: c.id })),
        frames,
      };
    }, { song, WHICH, STEP });
    save(`${song}.${WHICH}.${TAG}.json`, JSON.stringify(made));
    log(`${song} ${WHICH} ${TAG}: load ${made.loadS.toFixed(1)} s, rehearsal ${made.reh?.toFixed?.(1)} s, ${made.gestures.length} gestures, ${made.cast.length} cast, ${made.frames.length} frames, refused ${made.refused?.length}, arrival ${made.arrival}, took ${(Date.now() - t0) / 1000} s`);
  }
};
