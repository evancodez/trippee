// Matter: what docs (the next-level plan, lane matter7) asks of it that no other test does. Muted, like every browser here. Run each through the lab:
//   LAB_URL=http://localhost:5381/ node tools/lab.mjs tests/matter.mjs --out lab-out/matter7
//   STAGE=stills                       every pattern in the pool at two moments, as a sheet. No song.
//   STAGE=step                         one division as a sheet, and the landing: the frame a hair before a whole step against the frame on the step before, both diagonals, black on white and white on black. No song, no camera.
//   STAGE=shatter                      a shatter made by hand on each bold sheet, as a sheet, and the lock: the frame after it against the plain sheet. No song.
//   STAGE=film SONG=media/mgmt.mp3     the mode's whole film as a person gets it: what the director did and why, a sheet of 20 frames across the song, a 12 fps watch with slices round a division
//                                      and round each shatter, and each shatter's lock against the same frame with no shatter. FRAMES=20
//   STAGE=change SONG=...              into the mode from the film and back out, stepped by hand at 30 fps: no step inside a change over 3 times the steps round it (the modes lane's probe). AT=30
//   STAGE=cost                         ms a frame at 3024x1964, governor off: each pattern plain, a shatter, and the film's plain program for scale. Say what else was running.
import { resolve } from 'node:path';
import { watch, dropSong, enterWorld, makeChannels, flashThree } from '../tools/look.mjs';

const want = (process.env.STAGE || 'stills').split(',');
const r2 = x => +(+x).toFixed(2);

const put = () => {
  window.M_ = {
    async enter() {
      const eng = await import(new URL('src/worlds/engine.js', location.href).href);
      const W = await eng.loadWorld('matter'), wp = await app.R.prepareWorld(W);
      await wp.whenAll;
      if (wp.failed) throw new Error(wp.failed);
      app.governor.enabled = false; app.R.drawScale = 1; app.manual = true;
      app.stage.world = W; app.stage.score = app.stage.score; app.stage.hold = true;
      return W;
    },
    show(p, t, more = {}) {
      const st = app.stage;
      st.score.gestures = [{ t0: 0, t1: 3600, arcEnd: 40, pattern: p, ...more }]; st.score.handover = null;
      app.t = t; trippee.seek(t);
      return st.score.gestures[0];
    },
    px() { const gl = app.R.gl, w = app.canvas.width, h = app.canvas.height, d = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d); return { w, h, d }; },
    diff(a, b) { let n = 0, worst = 0, sum = 0; for (let i = 0; i < a.d.length; i += 4) { const e = Math.max(Math.abs(a.d[i] - b.d[i]), Math.abs(a.d[i + 1] - b.d[i + 1]), Math.abs(a.d[i + 2] - b.d[i + 2])); if (e > 1) n++; sum += e; if (e > worst) worst = e; } return { over1: n, share: +(n / (a.d.length / 4)).toFixed(5), worst, mean: +(sum / (a.d.length / 4)).toFixed(4) }; },
    sheet(cols, rows, w = 320, h = 180) { const cv = document.createElement('canvas'); cv.width = cols * w; cv.height = rows * h; const g = cv.getContext('2d'); let i = 0; return { add(label) { const x = (i % cols) * w, y = Math.floor(i / cols) * h; g.drawImage(trippee.canvas, x, y, w, h); g.fillStyle = '#c00'; g.fillRect(x, y, Math.min(w, 8 + 7 * label.length), 15); g.fillStyle = '#fff'; g.font = '11px monospace'; g.fillText(label, x + 4, y + 11); i++; }, url: () => cv.toDataURL('image/jpeg', 0.88) }; },
  };
};

export default async ({ page, log, save, sleep }) => {
  for (let i = 0; i < 240; i++) { if (await page.eval('window.trippee?.ready===true')) break; await sleep(250); }
  await page.eval(put);

  if (want.includes('stills')) {
    const r = await page.eval(async () => {
      const W = await M_.enter(), P = W._pool, S = M_.sheet(2, P.length, 560, 315);
      for (const p of P) for (const t of [6, 21.3]) { M_.show(p, t); S.add(`${p.id} t=${t} v${app.R.variant}`); }
      return { sheet: S.url(), ids: P.map(p => p.id) };
    });
    save('stills.jpg', r.sheet);
    log('stills', r.ids.join(' '));
  }

  if (want.includes('step')) {
    // s goes on by a tenth a second, so a step is ten seconds: knots of one, which evalTrack runs on in a straight line.
    const r = await page.eval(async () => {
      const W = await M_.enter(), cells = W._pool.filter(p => p.group === 'cells'), out = [], S = M_.sheet(10, 4, 256, 144);
      for (const p of cells) for (const sigma0 of [1, -1]) {
        const more = { arcs: [], mitosis: { knots: [{ t: 0, x: 0, v: 0.1 }], flips: [], sigma0 } };
        const k = 3, at = u => 10 * (k + u);
        M_.show(p, at(0), more); const a = M_.px();
        M_.show(p, at(1 - 1e-6), more); const b = M_.px();
        M_.show(p, at(1), more); const c = M_.px();
        out.push({ id: p.id, sigma0, end: M_.diff(b, a), whole: M_.diff(c, a) });
        if (S) for (let i = 0; i < 10; i++) { M_.show(p, at(i / 10), more); S.add(`${p.id.slice(7)} s${sigma0} u=${(i / 10).toFixed(1)}`); }
      }
      return { out, sheet: S.url() };
    });
    save('step.jpg', r.sheet);
    for (const o of r.out) log(`${o.end.over1 === 0 ? 'PASS' : 'FAIL'} ${o.id} sigma ${o.sigma0}: a hair before a whole step against the step before, ${o.end.over1} pixels over 1/255 (${o.end.share}), worst ${o.end.worst}, mean ${o.end.mean}; a whole step on: ${o.whole.over1} over`);
  }

  if (want.includes('shatter')) {
    const r = await page.eval(async () => {
      const W = await M_.enter(), sheets = W._pool.filter(p => p.group === 'sheet'), out = [], S = M_.sheet(8, sheets.length * 2, 256, 144);
      const { layoutOf } = await import(new URL('src/worlds/matter/shatter.js', location.href).href);
      for (const [n, p] of sheets.entries()) {
        const sh = { hit: 3, back: 15, bar: 2, L: layoutOf(11 + n * 7, 0.25 - 0.2 * n, -0.12, app.canvas.width / app.canvas.height) };
        const st = app.stage, set = on => { st.score.matter = on ? { shatters: [sh] } : null; };
        M_.show(p, 0); set(true);
        for (let i = 0; i < 16; i++) { const t = [2.9, 3.1, 3.25, 3.4, 3.6, 4, 5, 7, 10, 12.6, 13.4, 13.9, 14.3, 14.6, 14.85, 15.05][i]; app.t = t; trippee.seek(t); S.add(`${p.id.slice(7)} ${t.toFixed(2)}`); }
        // The lock: the frame after it, and the frame before the hit, against the plain sheet at the same moments.
        const look = t => { set(true); app.t = t; trippee.seek(t); const a = M_.px(), v = app.R.variant; set(false); trippee.seek(t); const b = M_.px(); set(true); return { ...M_.diff(a, b), v }; };
        out.push({ id: p.id, after: look(15 + 1 / 60), before: look(3 - 1 / 60), during: look(9) });
        set(false);
      }
      return { out, sheet: S.url() };
    });
    save('shatter.jpg', r.sheet);
    for (const o of r.out) log(`${o.after.over1 === 0 && o.before.over1 === 0 ? 'PASS' : 'FAIL'} ${o.id}: the frame after the last lock against the plain sheet, ${o.after.over1} pixels over 1/255 (worst ${o.after.worst}); the frame before the hit, ${o.before.over1}; while it's broken, ${o.during.share} of the frame differs (program ${o.during.v})`);
  }

  if (want.includes('film') || want.includes('change')) await dropSong(page, process.env.SONG || 'media/mgmt.mp3', { resolvePath: resolve, sleep });

  if (want.includes('film')) {
    await enterWorld(page, 'matter', log);
    const plan = await page.eval(() => {
      const sc = app.stage.score, g = sc.gestures, f = x => +x.toFixed(2);
      return {
        dur: f(app.song.analysis.duration),
        gestures: g.map(G => `${f(G.t0)}-${f(G.t1)} ${G.pattern.id}${G.mitosis ? ` divides x${G.mitosis.hits.length} (${f((G.mitosis.hits.at(-1) - G.mitosis.hits[0]) / Math.max(1, G.mitosis.hits.length - 1))} s apart, flips at steps ${G.mitosis.flips.join(',') || 'none'}, holds ${G.mitosis.knots.filter(k => k.v === 0).length - 2})` : ''}${G.shatter ? ` SHATTERS at ${f(G.shatter.hit)}, heals ${f(G.shatter.back)}` : ''}${G.moves?.length ? ` moves ${G.moves.map(m => m.id).join(',')}` : ''}${G.xform ? ` out by ${G.xform.id}` : ''}`),
        shatters: (sc.matter?.shatters ?? []).map(S => ({ hit: f(S.hit), back: f(S.back), arrival: f(S.a), song: S.song.map(f), point: [f(S.L.cx), f(S.L.cy)] })),
        woah: (sc.woah?.list ?? sc.woah?.picked ?? []).map?.(w => `${w.id}@${f(w.t ?? w.from ?? 0)}`) ?? null,
      };
    });
    log('film', plan.dur, 's');
    for (const l of plan.gestures) log('  ', l);
    log('shatters', JSON.stringify(plan.shatters));
    // 20 frames across the song.
    const frames = +(process.env.FRAMES || 20);
    const sheet = await page.eval(async ({ frames, dur }) => {
      const S = M_.sheet(5, Math.ceil(frames / 5), 384, 216), out = [];
      for (let i = 0; i < frames; i++) { const t = 4 + (dur - 12) * i / (frames - 1); app.t = t; trippee.seek(t); const f = app.lastFrame; S.add(`${t.toFixed(1)} ${f.G.pattern.id.replace(/^\w+\./, '')}${f.kind ? ' ' + f.kind : ''}`); out.push(app.R.variant); }
      return { url: S.url(), variants: [...new Set(out)] };
    }, { frames, dur: plan.dur });
    save('film-sheet.jpg', sheet.url);
    log('film sheet programs', sheet.variants.join(','));
    // A division passage, at 12 fps, and each shatter, from a bar before it to a bar after it heals.
    const div = await page.eval(() => { const g = app.stage.score.gestures.find(G => G.mitosis && G.mitosis.hits.length >= 8); return g ? g.mitosis.hits[2] - 1 : null; });
    const song = (process.env.SONG || 'media/mgmt.mp3').replace(/^.*\//, '').replace(/\.\w+$/, '');
    if (div != null) {
      await watch(page, save, { name: `divide-${song}`, seconds: 10, fps: 12, cols: 10, rows: 6, setup: `app.t=${div};trippee.seek(${div})` });
      log(`watched division from ${r2(div)} s`);
      for (const [k, dt] of [['before', 0.85], ['peanut', 0.97], ['after', 1.3]]) save(`shot-${song}-divide-${k}.png`, await page.eval(t => { app.t = t; trippee.seek(t); return trippee.canvas.toDataURL('image/png'); }, div + dt));
    }
    for (const [i, S] of plan.shatters.entries()) {
      const a = S.hit - 2.5, secs = Math.min(40, S.back - S.hit + 5);
      await watch(page, save, { name: `shatter${i}-${song}`, seconds: secs, fps: 12, cols: 10, rows: 8, setup: `app.t=${a};trippee.seek(${a})` });
      const lock = await page.eval(({ hit, back }) => {
        const sc = app.stage.score, look = t => { sc.matter.bare = false; app.t = t; trippee.seek(t); const a = M_.px(); sc.matter.bare = true; trippee.seek(t); const b = M_.px(); sc.matter.bare = false; return M_.diff(a, b); };
        return { after: look(back + 1 / 60), before: look(hit - 1 / 60), mid: look((hit + back) / 2) };
      }, S);
      for (const [k, t] of [['crack', S.hit + 0.8], ['hang', (S.hit + S.back) / 2], ['heal', S.back - 0.5]]) save(`shot-${song}-shatter${i}-${k}.png`, await page.eval(t => { app.t = t; trippee.seek(t); return trippee.canvas.toDataURL('image/png'); }, t));
      log(`${lock.after.over1 === 0 ? 'PASS' : 'FAIL'} shatter ${i} at ${S.hit} s healing on ${S.back} s: the frame after the last lock against the plain sheet, ${lock.after.over1} pixels over 1/255 (worst ${lock.after.worst}); the frame before the hit ${lock.before.over1}; half way, ${lock.mid.share} of the frame is broken off it`);
    }
  }

  if (want.includes('change')) {
    // The modes lane's stepped probe, into this mode and back.
    const seq = (process.env.SEQ || 'matter,film').split(','), fps = 30;
    let t = +(process.env.AT || 30), from = 'film';
    for (const to of seq) {
      const r = await page.eval(async ({ to, t, fps, chanSrc }) => {
        const T = window.trippee, wait = ms => new Promise(r => setTimeout(r, ms));
        const chanOf = (0, eval)(`(${chanSrc})`)(), cw = 320, chh = 180, cc = document.createElement('canvas'); cc.width = cw; cc.height = chh; const cg = cc.getContext('2d', { willReadFrequently: true });
        const chan = { luma: [], red: [], rc: [], whole: { luma: [], red: [], rc: [] } }, time = [], rows = [];
        const cols = 10, sheet = document.createElement('canvas'); sheet.width = cols * 128; sheet.height = 72 * 8; const sg = sheet.getContext('2d');
        let prev = null, n = 0;
        const look = tag => {
          cg.drawImage(T.canvas, 0, 0, cw, chh); const px = cg.getImageData(0, 0, cw, chh).data, c = chanOf(px, cw, chh);
          for (const k of ['luma', 'red', 'rc']) { chan[k].push(c[k]); chan.whole[k].push(c.whole[k]); }
          let d = 0; for (let i = 0; i < px.length; i += 16) if (prev) d += Math.abs(px[i] - prev[i]) + Math.abs(px[i + 1] - prev[i + 1]) + Math.abs(px[i + 2] - prev[i + 2]);
          prev = px; const N = px.length / 16, h = app.stage.score.handover, hx = h?.wall ? Math.min(1, Math.max(0, (h.e - (h.e0 ?? 0)) / h.D)) : -1;
          rows.push([n, +(d / (N * 3)).toFixed(2), 0, +hx.toFixed(3), app.R.world?.id ?? '-', app.R.variant, app.lastFrame?.kind ?? '-', tag]);
          time.push(+(n / fps).toFixed(3));
          if (n % Math.round(fps / 3) === 0 && n / Math.round(fps / 3) < cols * 8) { const k = n / Math.round(fps / 3); sg.drawImage(T.canvas, (k % cols) * 128, Math.floor(k / cols) * 72, 128, 72); sg.fillStyle = '#c00'; sg.fillRect((k % cols) * 128, Math.floor(k / cols) * 72, 62, 11); sg.fillStyle = '#fff'; sg.font = '9px monospace'; sg.fillText(`${(n / fps).toFixed(1)} x${hx.toFixed(2)}`, (k % cols) * 128 + 2, Math.floor(k / cols) * 72 + 9); }
          n++;
        };
        if (Math.abs(app.t - t) > 1) { app.t = t; T.seek(t); }
        for (let i = 0; i < fps; i++) { T.step(1 / fps); look('before'); }
        let began = null;
        app.stage.setWorld(to === 'film' ? null : to).then(v => { began = v; }, e => { began = String(e); });
        for (let i = 0; i < 40 * fps && began === null; i++) { T.step(1 / fps); look('wait'); await wait(4); }
        const startN = n;
        for (let i = 0; i < 30 * fps; i++) { T.step(1 / fps); look(''); if (!app.stage.score.handover?.change && i > fps) break; if (i % 4 === 0) await wait(1); }
        const endN = n;
        for (let i = 0; i < 6 * fps; i++) { T.step(1 / fps); look('after'); if (i % 4 === 0) await wait(1); }
        return { rows, chan, time, began, startN, endN, t: app.t, sheet: sheet.toDataURL('image/jpeg', 0.75) };
      }, { to, t, fps, chanSrc: makeChannels.toString() });
      save(`change-${from}-${to}.jpg`, r.sheet);
      const steps = r.rows.map(x => x[1]), jumps = [];
      let worstRatio = 0;
      for (let i = 1; i < steps.length; i++) {
        const nb = []; for (let j = i - 6; j <= i + 6; j++) if (j !== i && j >= 1 && j < steps.length) nb.push(steps[j]); nb.sort((a, b) => a - b);
        const med = nb[nb.length >> 1];
        if (i >= r.startN && i < r.endN && steps[i] > 2) worstRatio = Math.max(worstRatio, steps[i] / Math.max(med, 1));
        if (i >= r.startN && i < r.endN && steps[i] > 12 && steps[i] > 3 * Math.max(med, 1)) jumps.push(`${((i - r.startN) / fps).toFixed(2)}s ${steps[i]}/${med} x${r.rows[i][3]} ${r.rows[i][4]} ${r.rows[i][6]}`);
      }
      const cut = (a, b) => ({ luma: r.chan.luma.slice(a, b), red: r.chan.red.slice(a, b), rc: r.chan.rc.slice(a, b), whole: { luma: r.chan.whole.luma.slice(a, b), red: r.chan.whole.red.slice(a, b), rc: r.chan.whole.rc.slice(a, b) } });
      const fl = flashThree({ chan: cut(r.startN, r.endN), fps, time: r.time.slice(r.startN, r.endN).map(x => +(x - r.startN / fps).toFixed(2)) });
      let worst = 0; for (let i = r.startN; i < r.endN; i++) worst = Math.max(worst, steps[i]);
      log(`${jumps.length ? 'FAIL' : 'PASS'} ${from} -> ${to} at ${t.toFixed(1)} s: began ${r.began}, change ${((r.endN - r.startN) / fps).toFixed(2)} s, worst step ${worst}, worst step against the steps round it ${worstRatio.toFixed(2)}x; flash luma ${fl.luma.whole}/${fl.luma.tile} ${fl.over.map(o => `${o.channel} ${o.on} ${o.n} at ${o.t}s`).join(', ')}`);
      if (jumps.length) log('     jumps:', jumps.join(' | '));
      from = to; t = r.t;
    }
  }

  if (want.includes('cost')) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 3024 / 2, height: 1964 / 2, deviceScaleFactor: 2, mobile: false });
    await sleep(600);
    const r = await page.eval(async () => {
      const W = await M_.enter(), R = app.R, gl = R.gl, px = new Uint8Array(4), stage = app.stage;
      const { layoutOf } = await import(new URL('src/worlds/matter/shatter.js', location.href).href);
      const measure = () => { gl.finish(); const t0 = performance.now(); trippee.step(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
      const run = (n = 40) => { const a = []; for (let i = 0; i < n; i++) { app.t += 1 / 20; a.push(measure()); } a.sort((x, y) => x - y); return { med: +a[n >> 1].toFixed(2), p95: +a[Math.floor(n * 0.95)].toFixed(2), v: R.variant }; };
      const out = { canvas: [app.canvas.width, app.canvas.height], plain: {}, shatter: {} };
      for (const p of W._pool) { M_.show(p, 8); await new Promise(r => setTimeout(r, 20)); out.plain[p.id] = run(); }
      for (const p of W._pool.filter(q => q.group === 'sheet')) { M_.show(p, 0); stage.score.matter = { shatters: [{ hit: 0, back: 3600, bar: 2, L: layoutOf(5, 0.2, -0.1, app.canvas.width / app.canvas.height) }] }; app.t = 8; trippee.seek(8); await new Promise(r => setTimeout(r, 20)); out.shatter[p.id] = run(); stage.score.matter = null; }
      stage.world = null; stage.score = stage.score; trippee.load('lines.fall'); app.manual = true; app.t = 10; await new Promise(r => setTimeout(r, 50)); out.filmPlain = run();
      stage.world = W; stage.score = stage.score;
      return out;
    });
    log('cost', JSON.stringify(r));
  }

  const errs = page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  if (errs.length) log('page errors', errs.slice(0, 6).join(' | '));
};
