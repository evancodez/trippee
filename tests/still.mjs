// The chill set, looked at. Sheets and time-slices of each hand-pick pattern over LEN seconds, with the flash numbers.
//   node tools/lab.mjs tests/still.mjs --out lab-out/v2                      all of them
//   ONLY=still.floor,still.ball LEN=60 node tools/lab.mjs tests/still.mjs --out lab-out/v2
import { watch, analyse } from '../tools/look.mjs';
export default async ({ page, save, log }) => {
  const len = +(process.env.LEN || 48), fps = +(process.env.FPS || 12);
  for (let i = 0; i < 300 && !(await page.eval('!!window.trippee?.ready')); i++) await new Promise(r => setTimeout(r, 200));
  const ids = process.env.ONLY ? process.env.ONLY.split(',') : await page.eval(`trippee.list().filter(p => p.family === 'still').map(p => p.id)`);
  await page.eval(`app.governor.enabled = false; app.R.drawScale = 1; app.manual = true;`);
  if (process.env.STILLS) {         // ids:time,... one full-size frame each
    for (const one of process.env.STILLS.split(',')) {
      const [id, at] = one.split(':');
      const url = await page.eval(`(() => { trippee.load(${JSON.stringify(id)}, { sweep: true, len: ${len} }); for (let i = 0; i < 4; i++) trippee.seek(${+at} + i / 60); return trippee.capture(); })()`);
      save(`${id}@${at}.png`, url);
    }
    log('errors', page.logs.filter(l => /\[error\]|\[exception\]/.test(l)).slice(0, 8));
    return;
  }
  if (process.env.CLICK) {          // the way the owner would: open the library, click each tile in real time, see it arrive and keep moving
    const ids2 = await page.eval(`trippee.list().filter(p => p.family === 'still')`);
    await page.eval(`app.ui.library ? app.ui.library.show(true) : document.querySelector('[data-a=library]').click(); app.manual = false; trippee.run();`);
    await new Promise(r => setTimeout(r, 2500));
    const shots = [];
    for (const p of ids2) {
      const r = await page.eval(async ({ name, id }) => {
        const b = [...document.querySelectorAll('button.tile')].find(x => x.title === name);
        if (!b) return { id, found: false };
        const thumbBefore = b.querySelector('canvas').toDataURL();
        b.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
        await new Promise(r => setTimeout(r, 1500));
        const hoverMoved = b.querySelector('canvas').toDataURL() !== thumbBefore;
        b.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
        b.click();
        const t0 = performance.now(); let landed = null;
        while (performance.now() - t0 < 14000) { await new Promise(r => setTimeout(r, 200)); if (landed == null && app.lastFrame?.G?.pattern?.id === id && !app.stage.morphing(app.pictureT())) landed = (performance.now() - t0) / 1000; if (landed != null && performance.now() - t0 > landed * 1000 + 5000) break; }
        const c = document.createElement('canvas'); c.width = 64; c.height = 36; const g = c.getContext('2d', { willReadFrequently: true });
        const read = () => { g.drawImage(app.canvas, 0, 0, 64, 36); return g.getImageData(0, 0, 64, 36).data; };
        await new Promise(r => requestAnimationFrame(r)); const A = read();
        await new Promise(r => setTimeout(r, 1500)); await new Promise(r => requestAnimationFrame(r)); const B = read();
        let d = 0; for (let i = 0; i < A.length; i += 4) d += Math.abs(A[i] - B[i]);
        return { id, found: true, hoverMoved, landed: landed && +landed.toFixed(1), showing: app.lastFrame?.G?.pattern?.id, movedIn1_5s: +(d / (64 * 36)).toFixed(1), fps: app.governor?.fps };
      }, { name: p.name, id: p.id });
      log(JSON.stringify(r));
    }
    log('errors', page.logs.filter(l => /\[error\]|\[exception\]/.test(l)).slice(0, 8));
    return;
  }
  if (process.env.FILM) {           // The Wildflower cut, composed, rehearsed and watched, muted. FILM=wildflower
    const name = process.env.FILM;
    await page.eval(async s => { await app.song.load(`/media/${s}.mp3`, { seed: 7 }); app.song.pause(); app.ui?.song?.show?.(false); }, name);
    const made = await page.eval(async alt => {
      const here = u => new URL(u, location.href).href;
      const [{ compose }, { rehearse }, { auditCut }] = await Promise.all(['src/score/compose.js', 'src/music/rehearse.js', 'src/score/cut.js'].map(u => import(here(u))));
      const A = app.song.analysis, cut = structuredClone((await import(here(`src/score/cuts/${A.hash}.js`))).default);
      if (alt) {       // the same film wearing the rest of the set: nothing but a look at them on the song
        cut.shots[1].id = 'still.chevrons'; cut.shots[1].moves = [{ id: 'moire', k: 10, beat: [[47.63, 1.1], [94.98, 1.4]], zig: 0.85, zigN: 0.55, turn: [[47.63, 0.25], [70.56, 0.32], [82.4, 0.6], [94.98, 0.75]] }];
        cut.shots[2].id = 'still.floor'; delete cut.shots[2].moves[0].rim;
        cut.shots[3].id = 'still.mirror'; cut.shots[3].moves = [{ id: 'mirror', turn: [[182.28, 0.02], [189.29, 0.05], [206.7, 0.11]] }];
      }
      const sc = compose(A, 7, { patterns: app.patterns, aspect: 16 / 9, cut });
      const atLoad = sc.refused?.slice() ?? [];
      const r = await rehearse(sc, Math.min(A.duration, 1200), () => {}, { lastTry: true });
      auditCut(sc, r);
      app.song.score = sc; app.stage.setScore(sc);
      app.governor.enabled = false; app.R.drawScale = 1; app.manual = true;
      return { line: cut.line, atLoad, refused: sc.refused, left: r.flash?.left, fixes: r.flash?.fixes, gestures: sc.gestures.map(G => [+G.t0.toFixed(2), +G.t1.toFixed(2), +(G.morph || 0).toFixed(2), G.pattern.id, (G.moves || []).map(m => m.id).join(','), G.xform?.id ?? '', G.rise ?? '']), duration: A.duration };
    }, !!process.env.ALT);
    log(JSON.stringify(made, null, 0));
    if (process.env.WINDOWS) {         // a-b,c-d: closer looks, no whole film
      for (const win of process.env.WINDOWS.split(',')) {
        const [a, b] = win.split('-').map(Number);
        await page.eval(`trippee.seek(${a})`);
        const w = await watch(page, save, { name: `win-${name}-${a}`, seconds: b - a, fps: 12, cols: 8, rows: 5 });
        const an = analyse(w);
        log(win, JSON.stringify({ whole: an.flashesPerSecondWholeFrame, tile: an.flashesPerSecondAnyTile, whiteMin: Math.min(...w.white), med: an.medianDiff, max: an.maxDiff }));
      }
      log('errors', page.logs.filter(l => /\[error\]|\[exception\]/.test(l)).slice(0, 8));
      return;
    }
    await page.eval(`trippee.seek(0)`);
    const w = await watch(page, save, { name: `film-${name}${process.env.ALT ? '-alt' : ''}`, seconds: Math.ceil(made.duration), fps, cols: 12, rows: 12 });
    const a = analyse(w);
    log('film', JSON.stringify({ whole: a.flashesPerSecondWholeFrame, tile: a.flashesPerSecondAnyTile, white: a.meanWhite, solids: a.solids, med: a.medianDiff, max: a.maxDiff, stepMax: a.largestLuminanceStepPerFrame }));
    // where the frame changes most against its neighbours: the jolts
    const big = []; for (let i = 8; i < w.diff.length - 8; i++) { const r = w.diff.slice(i - 8, i + 9).sort((x, y) => x - y)[8]; if (w.diff[i] > 2.5 * Math.max(r, 2)) big.push([w.time[i], w.diff[i], +r.toFixed(1)]); }
    log('jolts', JSON.stringify(big.slice(0, 30)));
    log('errors', page.logs.filter(l => /\[error\]|\[exception\]/.test(l)).slice(0, 8));
    return;
  }
  for (const id of ids) {
    await page.eval(`trippee.load(${JSON.stringify(id)}, { sweep: true, len: ${len} })`);
    const w = await watch(page, save, { name: id, seconds: len, fps, cols: 6, rows: 5 });
    const a = analyse(w);
    log(id, JSON.stringify({ whole: a.flashesPerSecondWholeFrame, tile: a.flashesPerSecondAnyTile, white: a.meanWhite, solids: a.solids.length, edges: a.edgeRange, med: a.medianDiff, max: a.maxDiff, stepMax: a.largestLuminanceStepPerFrame, grey: a.medianGreyAtNativeRes }));
  }
  log('errors', page.logs.filter(l => /\[error\]|\[exception\]/.test(l)).slice(0, 8));
};
