// Retina: what the plan's lane retina7 asks of it (.wt/reports/next-level-plan.md). Muted, like every browser here, and no camera or microphone is ever asked for.
//   STAGE=plan SONG=media/mgmt.mp3     where the director put each drop and the afterspin, and why, and the gestures round them
//   STAGE=sheet SONG=...               20 frames across the whole song, then a sheet across each drop and one across the spin, each about 20 frames, and time-slices across them
//   STAGE=drop SONG=...                each drop: the colour gone within 1 s, ending within a frame of the hit, and no tinted pixel (every pixel is a whole ink or exactly black and white)
//   STAGE=still SONG=...               the afterspin's still: the plain sheet within 1/255, and nothing moving through it
//   STAGE=look SONG=... AT=t,t         full-size frames at those moments, to look at the fringe and the inks closely
//   STAGE=change                       v into Retina and back out, stepped by hand: the biggest step inside each change against the steps round it, and the byte check at the middle. No song.
//   STAGE=cost                         GPU ms of the plain film's program and Retina's at 3024x1964, governor off. Run it on its own.
import { resolve, basename } from 'node:path';
import { dropSong, enterWorld } from '../tools/look.mjs';

const want = (process.env.STAGE || 'plan').split(',');
const r2 = x => +(+x).toFixed(2);
let failed = 0;
const check = (log, name, ok, more = '') => { log(`${ok ? 'PASS' : 'FAIL'} ${name}${more ? ': ' + more : ''}`); if (!ok) failed++; };

// In the page: frames drawn small onto a sheet, by seek
const helpers = () => {
  window.R_ = {
    sheet(times, { w = 384, h = 216, cols = 5, label = true } = {}) {
      const T = window.trippee, cv = document.createElement('canvas'), rows = Math.ceil(times.length / cols);
      cv.width = cols * w; cv.height = rows * h;
      const g = cv.getContext('2d');
      times.forEach((t, i) => {
        R_.seek(t);
        const x = (i % cols) * w, y = Math.floor(i / cols) * h;
        g.drawImage(T.canvas, x, y, w, h);
        if (label) { const f = app.lastFrame; g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(x, y, 230, 16); g.fillStyle = '#fff'; g.font = '11px monospace'; g.fillText(`${t.toFixed(2)} ${f?.G?.pattern?.id ?? ''} ${f?.kind ?? ''}`, x + 3, y + 12); }
      });
      return cv.toDataURL('image/jpeg', 0.88);
    },
    // A time-slice: one column of the frame (the middle one), a column a frame, left to right
    slice(t0, t1, n = 480, h = 360, col = 0.5, row = null) {
      const T = window.trippee, cv = document.createElement('canvas'); cv.width = n; cv.height = h;
      const g = cv.getContext('2d'), W = T.canvas.width, H = T.canvas.height;
      for (let i = 0; i < n; i++) {
        R_.seek(t0 + (t1 - t0) * i / (n - 1));
        if (row == null) g.drawImage(T.canvas, Math.floor(W * col), 0, 1, H, i, 0, 1, h);
        else g.drawImage(T.canvas, 0, Math.floor(H * row), W, 1, 0, i * h / n, n, h / n + 1);
      }
      return cv.toDataURL('image/jpeg', 0.9);
    },
    px() { const gl = app.R.gl, w = app.canvas.width, h = app.canvas.height, d = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d); return { w, h, d }; },
    // A seek's frame as played there: without the hear layer's carry, which eases the camera over 1.6 real seconds from wherever the last frame was (src/score/hear.js), so it isn't the film's
    seek(t) { delete app.edits.hearCarry; app.edits.hearJumped = false; window.trippee.seek(t); delete app.edits.hearCarry; app.edits.hearJumped = false; window.trippee.seek(t); },
    at(t) { this.seek(t); return this.px(); },
    plan() { const s = app.stage.score; return s.retina ?? null; },
  };
};

const songOf = () => process.env.SONG || 'media/mgmt.mp3';
async function intoRetina(page, log, sleep) {
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  await dropSong(page, songOf(), { resolvePath: resolve, sleep });
  await enterWorld(page, 'retina', log);
  await page.eval(helpers);
}

export default async ({ page, log, save, sleep }) => {
  const song = basename(songOf()).replace(/\.\w+$/, '');
  const needsSong = want.some(s => ['plan', 'sheet', 'drop', 'still', 'look'].includes(s));
  if (needsSong) await intoRetina(page, log, sleep);
  else await page.eval(helpers);

  if (want.includes('plan')) {
    const r = await page.eval(() => {
      const s = app.stage.score, P = s.retina, r2 = x => +(+x).toFixed(2);
      return { world: s.world?.id, notes: P?.notes ?? null, drops: P?.drops?.map(d => ({ H: r2(d.H), a: r2(d.a), on: d.on, rung: d.rung.name, push: r2(d.push) })) ?? null, spin: P?.spin ? { p0: r2(P.spin.p0), S: r2(P.spin.S), Dp: r2(P.spin.Dp), real: P.spin.real, end: r2(P.spin.end), v: P.spin.v, turns: P.spin.turns } : null,
        chords: P?.chords?.length ?? 0, refused: (s.refused ?? []).slice(0, 12), guard: app.song.rehearsal?.flash ?? null,
        g: s.gestures.map(G => `${r2(G.t0)}-${r2(G.t1)} m${r2(G.morph || 0)} pk${G.peak?.hit != null ? r2(G.peak.hit) : '-'} ${G.pattern.id} h:${G.hero ?? ''} x:${G.xform?.id ?? ''} mv:${(G.moves ?? []).map(m => m.id).join('+')}${G.retina ? ' RETINA ' + G.retina.kind : ''}${G.calm ? ' calm' + G.calm : ''}`) };
    });
    log(JSON.stringify(r, null, 1));
    check(log, `${song}: the director placed at least one drop`, !!r.drops?.length, r.drops?.map(d => d.H).join(', ') || 'none');
    check(log, `${song}: and the afterspin`, !!r.spin, r.spin ? `${r.spin.p0}-${r.spin.S}` : 'none');
    if (r.drops?.length > 1) check(log, `${song}: drops 90 s apart`, r.drops.every((d, i) => !i || d.H - r.drops[i - 1].H >= 90));
  }

  if (want.includes('sheet')) {
    const P = await page.eval(() => { const P = R_.plan(); return { dur: app.song.duration, drops: P?.drops?.map(d => ({ H: d.H, a: d.a })) ?? [], spin: P?.spin ?? null }; });
    const every = Array.from({ length: 20 }, (_, i) => r2(P.dur * (i + 0.5) / 20));
    save(`sheet-${song}-song.jpg`, await page.eval((ts) => R_.sheet(ts), every));
    log('saved', `sheet-${song}-song.jpg`, every.join(' '));
    for (const [k, d] of P.drops.entries()) {
      const ts = Array.from({ length: 20 }, (_, i) => r2(d.a - 3 + (d.H + 11 - (d.a - 3)) * i / 19));
      save(`sheet-${song}-drop${k}.jpg`, await page.eval(ts => R_.sheet(ts), ts));
      // the last two seconds before the hit, close: the colour running out
      const close = Array.from({ length: 10 }, (_, i) => r2(d.H - 1.2 + 1.4 * i / 9));
      save(`sheet-${song}-drop${k}-hit.jpg`, await page.eval(ts => R_.sheet(ts, { cols: 5 }), close));
      save(`slice-${song}-drop${k}.jpg`, await page.eval((a, b) => R_.slice(a, b), d.a - 3, d.H + 6));
      log('saved drop', k, 'at', r2(d.H));
    }
    if (P.spin) {
      const s = P.spin, ts = Array.from({ length: 20 }, (_, i) => r2(s.p0 - 2 + (s.end + 2 - (s.p0 - 2)) * i / 19));
      save(`sheet-${song}-spin.jpg`, await page.eval(ts => R_.sheet(ts), ts));
      save(`slice-${song}-spin.jpg`, await page.eval((a, b) => R_.slice(a, b, 480, 360, 0.5, 0.5), s.p0 - 2, s.end));
      log('saved spin', r2(s.p0), r2(s.S));
    }
  }

  if (want.includes('drop')) {
    const res = await page.eval(async () => {
      const P = R_.plan(), out = [], W = app.canvas.width, H = app.canvas.height, { RUNGS, ZONE } = await import(new URL('src/worlds/retina/inks.js', location.href).href);
      // Coloured: any channel apart from the others. Tinted: neither grey nor on its zone's ink line (deep to pale), away from the zone's own edge, where the two zones' inks meet.
      const near = (c, a, b) => { const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], L = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2, u = Math.max(0, Math.min(1, (ac[0] * ab[0] + ac[1] * ab[1] + ac[2] * ab[2]) / L)); return Math.hypot(ac[0] - u * ab[0], ac[1] - u * ab[1], ac[2] - u * ab[2]); };
      const read = (t, d) => {
        const { d: px } = R_.at(t), rung = RUNGS[d.rung.name], mid = rung.mid, o = rung.out, s = v => v.map(x => x * 255), R = ZONE;
        let col = 0, tint = 0, n = 0;
        for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
          const i = (y * W + x) * 4, c = [px[i], px[i + 1], px[i + 2]], spread = Math.max(...c) - Math.min(...c);
          n++;
          if (spread <= 6) continue;
          col++;
          const fx = (x + 0.5 - W / 2) / H * 2, fy = (y + 0.5 - H / 2) / H * 2, r = Math.hypot(fx, fy);
          if (Math.abs(r - R) < 3 / H) continue;
          const ink = r < R ? mid : o;
          if (near(c, s(ink.deep), s(ink.pale)) > 7) tint++;
        }
        return { col: col / n, tint: tint / n };
      };
      for (const d of P?.drops ?? []) {
        const full = read(d.H - 1.0, d), mids = [d.H - 0.6, d.H - 0.4, d.H - 0.2, d.H - 0.05].map(t => read(t, d)), after = read(d.H + 1 / 60, d);
        // The last frame with any colour, at 60 a second over the last second and a bit
        let last = null;
        for (let t = d.H - 1.2; t <= d.H + 0.1; t += 1 / 60) if (read(t, d).col > 0) last = t;
        const tintMost = Math.max(full.tint, ...mids.map(m => m.tint), after.tint);
        out.push({ H: d.H, full: +full.col.toFixed(4), after: +after.col.toFixed(5), last: last == null ? null : +last.toFixed(3), lastBefore: last == null ? null : +(d.H - last).toFixed(3), mids: mids.map(m => +m.col.toFixed(3)), tints: [full, ...mids, after].map(m => +m.tint.toFixed(5)), tintMost: +tintMost.toFixed(5) });
        await new Promise(r => setTimeout(r));
      }
      return out;
    });
    for (const d of res) {
      log(JSON.stringify(d));
      check(log, `${song} drop at ${r2(d.H)}: in colour a second before it`, d.full > 0.95, `${(d.full * 100).toFixed(1)}% of pixels`);
      check(log, `${song} drop at ${r2(d.H)}: gone on the frame after the hit`, d.after === 0, `${(d.after * 100).toFixed(3)}%`);
      check(log, `${song} drop at ${r2(d.H)}: the last colour within 1 s, and within a frame or two of the hit`, d.last != null && d.lastBefore <= 1 && d.lastBefore < 2.5 / 60, `last coloured frame ${d.lastBefore} s before the hit`);
      check(log, `${song} drop at ${r2(d.H)}: no tinted pixels (a whole ink or exactly black and white, front edges aside)`, d.tintMost < 0.004, `${(d.tintMost * 100).toFixed(3)}% at the worst frame`);
    }
    if (!res.length) check(log, `${song}: a drop to check`, false);
  }

  if (want.includes('still')) {
    const r = await page.eval(async () => {
      const P = R_.plan(), s = P?.spin;
      if (!s) return null;
      const { setFlag } = await import(new URL('src/score/flags.js', location.href).href);
      const diff = (a, b) => { let worst = 0, n = 0; for (let i = 0; i < a.d.length; i += 4) { const e = Math.max(Math.abs(a.d[i] - b.d[i]), Math.abs(a.d[i + 1] - b.d[i + 1]), Math.abs(a.d[i + 2] - b.d[i + 2])); if (e > 1) n++; if (e > worst) worst = e; } return { worst, n }; };
      const a = s.real ? s.S : s.S, b = s.real ? s.S : s.S + s.Dp;      // a real rest freezes the picture's clock at time(a): any song second in the rest draws it
      const times = s.real ? null : [a + 0.05, (a + b) / 2, b - 0.05];
      const frames = (times ?? [s.S]).map(t => R_.at(t));
      // ...and for a real rest, seconds through it on the song's own clock: the picture's frozen there
      let realFrames = [];
      if (s.real) for (const t of [s.a + 0.05, (s.a + s.b) / 2, s.b - 0.05]) realFrames.push(R_.at(t));
      const moves = [];
      const fs = s.real ? realFrames : frames;
      for (let i = 1; i < fs.length; i++) moves.push(diff(fs[0], fs[i]));
      // The plain sheet: the same moment without the rings' slip and without the song at all
      const mid = s.real ? (s.a + s.b) / 2 : (a + b) / 2, here = s.real ? realFrames[1] : frames[1];
      setFlag('retina.spin', false); const was = app.edits.reactAmt; app.edits.reactAmt = 0;
      const plain = R_.at(mid);
      setFlag('retina.spin', true); app.edits.reactAmt = was;
      const vsPlain = diff(here, plain);
      // and just before the still, the rings were turning
      const before = diff(R_.at(s.S - 3), R_.at(s.S - 2.5));
      return { S: s.S, Dp: s.Dp, real: s.real, moves, vsPlain, before };
    });
    log(JSON.stringify(r));
    if (!r) check(log, `${song}: an afterspin to check`, false);
    else {
      check(log, `${song} afterspin still: nothing moves through it`, r.moves.every(m => m.worst <= 1), r.moves.map(m => `worst ${m.worst}/255, ${m.n} px over 1`).join('; '));
      check(log, `${song} afterspin still: the plain sheet to within 1/255`, r.vsPlain.worst <= 1, `worst ${r.vsPlain.worst}/255, ${r.vsPlain.n} px over 1`);
      check(log, `${song} afterspin: the rings were turning before it`, r.before.n > 1000, `${r.before.n} px changed in half a second`);
    }
  }

  if (want.includes('change')) {
    // From the film into Retina and out again, on a wander, each flight stepped by hand at 60 steps. A step is the mean change of a small copy of the frame; none inside a change may be over
    // 3 times the median of the steps round it. At x = .5 the program swaps and nothing may change.
    const r = await page.eval(async () => {
      const T = trippee, stage = app.stage, R = app.R;
      app.governor.enabled = false; R.drawScale = 1; app.manual = true; app.paused = false;
      const small = document.createElement('canvas'); small.width = 320; small.height = 180; const sg = small.getContext('2d', { willReadFrequently: true });
      const grab = () => { sg.drawImage(T.canvas, 0, 0, 320, 180); return sg.getImageData(0, 0, 320, 180).data; };
      const ready = async () => { const h = stage.score.handover; for (let i = 0; i < 400 && !h.plan; i++) { T.step(0); await new Promise(r => setTimeout(r, 4)); } h.e = 0; h.e0 = 0; return h; };
      const at = (h, x) => { h.e = h.e0 + x * h.D; T.step(0); return grab(); };
      const walk = async h => {
        const N = 60, steps = [], cv = document.createElement('canvas'), w = 256, ht = 144; cv.width = w * 10; cv.height = ht; const g = cv.getContext('2d');
        let prev = at(h, 0);
        for (let i = 1; i <= N; i++) { const f = at(h, i / N); let s = 0; for (let k = 0; k < f.length; k += 4) s += Math.abs(f[k] - prev[k]) + Math.abs(f[k + 1] - prev[k + 1]) + Math.abs(f[k + 2] - prev[k + 2]); steps.push(s / (f.length / 4) / 3); prev = f; if (i % 6 === 0) g.drawImage(T.canvas, (i / 6 - 1) * w, 0, w, ht); }
        const a0 = at(h, 0.49999), a1 = at(h, 0.5); let swap = 0; for (let k = 0; k < a0.length; k++) swap = Math.max(swap, Math.abs(a0[k] - a1[k]));
        // the worst step against the median of the six round it
        let worst = 0, where = -1;
        for (let i = 0; i < steps.length; i++) { const near = steps.slice(Math.max(0, i - 3), i).concat(steps.slice(i + 1, i + 4)).sort((x, y) => x - y), med = near[near.length >> 1] || 1e-3; const k = steps[i] / Math.max(med, 0.05); if (k > worst) { worst = k; where = (i + 1) / N; } }
        h.e = h.e0 + h.D; T.step(0); T.step(0);
        return { worst: +worst.toFixed(2), where: +where.toFixed(3), biggest: +Math.max(...steps).toFixed(2), swap, sheet: cv.toDataURL('image/jpeg', 0.85) };
      };
      stage.score.handover = null; stage.staticG = null; T.load('lines.river'); app.t = 13; T.step(0);
      let ok = await stage.setWorld('retina', { dur: 13 });
      const into = await walk(await ready());
      const there = stage.world?.id;
      for (let i = 0; i < 30; i++) { app.t += 0.5; T.step(0); }
      ok = ok && await stage.setWorld(null, { dur: 13 });
      const out = await walk(await ready());
      return { ok, there, after: stage.world?.id ?? null, into, out };
    });
    save('change-into.jpg', r.into.sheet); save('change-out.jpg', r.out.sheet);
    delete r.into.sheet; delete r.out.sheet;
    log(JSON.stringify(r));
    check(log, 'into Retina and back out', r.ok && r.there === 'retina' && r.after === null);
    check(log, 'into Retina: no step over 3 times the steps round it', r.into.worst <= 3, `worst ${r.into.worst}x at x ${r.into.where}, biggest step ${r.into.biggest}/255`);
    check(log, 'out of Retina: no step over 3 times the steps round it', r.out.worst <= 3, `worst ${r.out.worst}x at x ${r.out.where}, biggest step ${r.out.biggest}/255`);
    check(log, 'the program swaps at the middle with nothing changing', r.into.swap <= 2 && r.out.swap <= 2, `into ${r.into.swap}, out ${r.out.swap} out of 255`);
  }

  if (want.includes('cost')) {
    // GPU ms a frame at 3024x1964, the governor off: the film's own plain program, then Retina's on the same pattern, plain, with the fringe and with the inks.
    const WW = 3024 / 2, HH = 1964 / 2;
    await page.send('Emulation.setDeviceMetricsOverride', { width: WW, height: HH, deviceScaleFactor: 2, mobile: false });
    await sleep(600);
    const r = await page.eval(async () => {
      const R = app.R, gl = R.gl, px = new Uint8Array(4), stage = app.stage, T = trippee;
      app.governor.enabled = false; R.drawScale = 1; app.manual = true;
      const measure = () => { gl.finish(); const t0 = performance.now(); T.step(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
      const run = (n = 40) => { const a = []; for (let i = 0; i < n; i++) { app.t += 1 / 20; a.push(measure()); } a.sort((x, y) => x - y); return { med: +a[n >> 1].toFixed(2), p95: +a[Math.floor(n * 0.95)].toFixed(2), v: R.variant }; };
      const eng = await import(new URL('src/worlds/engine.js', location.href).href), W = await eng.loadWorld('retina'), wp = await R.prepareWorld(W);
      await wp.whenAll;
      const out = { canvas: [app.canvas.width, app.canvas.height] };
      for (const id of ['lines.fall', 'checks.vega', 'dials.target']) {
        stage.world = null; stage.score = stage.score; stage.hold = true; T.load(id); app.t = 10; await new Promise(r => setTimeout(r, 50)); T.step(0); run(10);
        const film = run();
        stage.world = W; stage.score = stage.score; T.load(id); app.t = 10; await new Promise(r => setTimeout(r, 50)); T.step(0); run(10);
        const plain = run();
        // the inks on: a drop's build, by hand
        stage.score.retina = { drops: [{ H: 1e6, a: 0, L: 20, arrive: 4, leave: 0.8, hold: 6.5, back: 8, rung: { name: 'glow' } }], spin: null, chords: [], notes: [] };
        const inks = run();
        delete stage.score.retina;
        out[id] = { film, retina: plain, inks };
      }
      stage.world = null; stage.score = stage.score;
      return out;
    });
    log('cost', JSON.stringify(r));
  }

  if (want.includes('look')) {
    const ts = (process.env.AT || '').split(',').filter(Boolean).map(Number);
    for (const t of ts) { const u = await page.eval(t => { R_.seek(t); return trippee.capture(); }, t); save(`look-${song}-${t}.png`, u); log('saved', `look-${song}-${t}.png`); }
  }

  const errs = page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  if (errs.length) { log('page errors', errs.slice(0, 6)); failed++; }
  log(failed ? `${failed} FAILED` : 'all as they should be');
  if (failed) process.exitCode = 1;
};
