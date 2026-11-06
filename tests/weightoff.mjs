// With every flag of this lane off, the song sheet has to write exactly what it wrote before the weight field. Old and new songSheet on the same slots at many times.
//   node tools/lab.mjs tests/weightoff.mjs --out lab-out/w      needs lab-out/w/old-song-sheet.js, from git show of the commit before.
import { resolve } from 'node:path';
const sleep = ms => new Promise(r => setTimeout(r, ms));
export default async ({ page, log }) => {
  const data = { items: [], files: [resolve(process.env.SONG || 'media/ppp.mp3')], dragOperationsMask: 1 };
  await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 320, y: 180, data });
  await page.send('Input.dispatchDragEvent', { type: 'drop', x: 320, y: 180, data });
  for (let i = 0; i < 1800; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await sleep(100); }
  const r = await page.eval(async () => {
    const [Old, New, F, S, L] = await Promise.all(['/lab-out/w/old-song-sheet.js', '/src/score/song-sheet.js', '/src/score/flags.js', '/src/score/slot.js', '/src/pattern/layout.js'].map(u => import(u)));
    for (const k of ['weight', 'tuneRings', 'lensMap', 'lung', 'conductor', 'rests', 'understand']) F.setFlag(k, false);
    const before = app.song.rehearsal; app.song.rebuild({}); for (let i = 0; i < 200 && app.song.rehearsal === before; i++) await new Promise(r => setTimeout(r, 100));
    app.song.pause(); app.manual = true;
    const score = app.song.score, res = { n: 0, slotDiff: 0, frameDiff: 0, worst: 0, at: null };
    const A0 = new Float32Array(L.SLOT_FLOATS), B0 = new Float32Array(L.SLOT_FLOATS), n = 400;
    for (let i = 0; i < n; i++) {
      const t = i * app.song.duration / n, gi = score.gestures.findIndex(g => g.t0 <= t && t < g.t1), G = score.gestures[Math.max(gi, 0)], N = score.gestures[Math.max(gi, 0) + 1] || G;
      for (const kind of [null, 'dive', 'rise', 'slide']) {
        S.fillSlot(A0, G, t, G.pattern, { phi: score.phi(t, G) }); S.fillSlot(B0, N, t, N.pattern, { phi: score.phi(t, N) });
        const x = 0.5, mk = () => ({ t, c: t, G, A: A0.slice(), B: B0.slice(), F: new Float32Array(L.FRAME_VEC4 * 4), x, T: x, kind, plan: null, two: !!kind, solid: 1, theta: 0.02, thetaB: 0.01, moveA: true, moveB: !!kind, sa: 1, sb: 1, thA: 0, thB: 0, from: G, to: N });
        const a = mk(), b = mk();
        Old.songSheet(a, score, { reactAmt: 1 }); New.songSheet(b, score, { reactAmt: 1 });
        res.n++;
        for (const [p, q, tag] of [[a.A, b.A, 'slotDiff'], [a.B, b.B, 'slotDiff'], [a.F, b.F, 'frameDiff']]) for (let k = 0; k < p.length; k++) { const d = Math.abs(p[k] - q[k]); if (d > 0) { res[tag]++; if (d > res.worst) { res.worst = d; res.at = [t, kind, tag, k]; } } }
        if (Math.abs(a.theta - b.theta) > 1e-9 || Math.abs(a.thetaB - b.thetaB) > 1e-9) res.theta = (res.theta || 0) + 1;
      }
    }
    for (const k of ['weight', 'tuneRings', 'lensMap', 'lung', 'conductor', 'rests', 'understand']) F.setFlag(k, true);
    return res;
  });
  log('flags off, old against new:', JSON.stringify(r));
};
