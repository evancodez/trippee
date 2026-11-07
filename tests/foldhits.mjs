// Does a fold keep time? On a real song, muted. Fan: the count of mirrors on each strong beat. Forever, Screen, Limit: how fast it's travelling on the strong beats against halfway between. Picked by hand with a song up: does it march on the song's beats. And seek against play, byte for byte.
export default async ({ page, save, log }) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 240; i++) { if (await page.eval('typeof window.trippee !== "undefined" && window.trippee.ready === true')) break; await sleep(250); }
  const r = await page.eval(async (song) => {
    await app.R.whenFoldReady();
    await app.song.load(`/media/${song}.mp3`, { seed: 7 }); app.song.pause(); app.ui?.song?.show?.(false);
    const here = u => new URL(u, location.href).href;
    const [{ compose }, { OFF }, { evalTrack }, { surged, clockOf }] = await Promise.all(['src/score/compose.js', 'src/pattern/layout.js', 'src/score/curves.js', 'src/score/moves/surge.js'].map(u => import(here(u))));
    const A = app.song.analysis, shots = [{ at: 0, id: 'lines.fall' }, { at: 30, from: 24, via: 'plain', id: 'rooms.nested', moves: [{ id: 'fan', open: 2, close: 1 }] }, { at: 70, from: 64, via: 'plain', id: 'lines.fall', moves: [{ id: 'forever', open: 2, close: 1 }] }, { at: 110, from: 104, via: 'plain', id: 'lines.fall', moves: [{ id: 'screen', open: 2, close: 1 }] }, { at: 150, from: 144, via: 'plain', id: 'lines.fall', moves: [{ id: 'limit', open: 2, close: 1 }] }, { at: 190, from: 184, via: 'plain', id: 'lines.fall' }];
    const sc = compose(A, 7, { patterns: app.patterns, aspect: 16 / 9, cut: { hash: A.hash, name: 'folds', line: 'x', shots } });
    app.song.score = sc; app.stage.setScore(sc); app.manual = true; app.governor.enabled = false; app.R.drawScale = 1;
    const out = { refused: sc.refused }, T = window.trippee;
    const G = id => sc.gestures.find(g => g.moves?.some(m => m.id === id)), M = id => G(id).moves.find(m => m.id === id);
    // Fan
    { const m = M('fan'), g = G('fan'); const list = [];
      for (const t of m.beats) { if (t < m.from + m.open || t > m.to - m.close) continue; app.t = t; T.step(0); list.push(+(Math.PI / app.R.slotA[OFF['fan.al']]).toFixed(3)); }
      out.fanMirrorsOnBeats = list;
      const mid = []; for (let i = 0; i + 1 < m.beats.length; i++) { const t = (m.beats[i] + m.beats[i + 1]) / 2; if (t < m.from + m.open || t > m.to - m.close) continue; app.t = t; T.step(0); mid.push(+(Math.PI / app.R.slotA[OFF['fan.al']]).toFixed(3)); }
      out.fanMirrorsBetween = mid; }
    // Travellers: speed of the table
    for (const [id, name] of [['forever', 'forever'], ['screen', 'screen'], ['limit', 'limit']]) {
      const m = M(id); let on = 0, off = 0, n = 0;
      for (let i = 2; i + 3 < m.beats.length; i++) { const t = m.beats[i], u = (m.beats[i] + m.beats[i + 1]) / 2, v = f => (m._go(f + .04) - m._go(f - .04)) / .08; on += v(t); off += v(u); n++; }
      out[name] = { speedOnBeat: +(on / n).toFixed(3), speedBetween: +(off / n).toFixed(3), wholes: +m._go(m.to).toFixed(3), beats: n };
    }
    // Seek against play
    const c = document.createElement('canvas'); c.width = 640; c.height = 360; const x = c.getContext('2d', { willReadFrequently: true }), grab = () => { x.drawImage(T.canvas, 0, 0, 640, 360); return x.getImageData(0, 0, 640, 360).data; };
    const diff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) > 2) d++; return d; };
    out.seek = [];
    const enc = async () => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await (await fetch(T.capture())).arrayBuffer()))].slice(0, 6).join('');
    const dur = A.duration, g = sc.gestures, forget = () => { for (const G of g) { delete G.plan; delete G.planFor; delete G.planning; } };
    for (let i = 0; i < 180; i++) T.seek(10 + i / 30);      // whatever the last test's jumps left easing in real seconds
    await new Promise(r => setTimeout(r, 2500));
    for (const id of ['fan', 'forever', 'screen', 'limit', 'plain']) {
      const m = id === 'plain' ? { from: 186, to: 196 } : M(id);
      for (const f of [.3, .55, .8]) {
        const t = m.from + (m.to - m.from) * f + .013;
        for (let u = t - 2; u < t - 1e-6; u += 1 / 30) T.seek(u);
        T.seek(t); const a = await enc();
        forget(); T.seek((t + dur / 2) % dur); forget(); T.seek(t); const b = await enc();
        out.seek.push([id, +t.toFixed(2), a === b]);
      }
    }
    // By hand, with a song up
    const before = {}; 
    T.seek(20); app.hand.go(app.byId['folds.fan']);
    for (let i = 0; i < 700; i++) T.step(1 / 30);
    const now0 = app.t, beats = sc.react.pulses.filter(t => t > now0 && t < now0 + 16).slice(0, 6), byHand = [];
    for (const t of beats) { T.seek(t); const f = app.lastFrame; byHand.push(+(Math.PI / app.R.slotA[OFF['fan.al']]).toFixed(3)); out.handPattern = f?.G?.pattern?.id; }
    out.fanByHandOnBeats = byHand;
    return out;
  }, process.env.SONG || 'disclosure');
  log(JSON.stringify(r, null, 0));
};
