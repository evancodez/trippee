// The weight lane's own quick look: a whole film scanned small and fast for what the judge would say about Flash, Breath, Wave and Balance, plus sheets to look at the motion.
//   SONG=media/ppp.mp3 STAGE=flash,wave,balance,look node tools/lab.mjs tests/weight.mjs --out lab-out/w
//   FPS=24 AT=48,120   SET='conductor=0' FLAGS='weight=0'
// Sound never plays: the song is paused and the lab mutes Chrome.
import { resolve, basename } from 'node:path';
import { writeFileSync } from 'node:fs';
import { watch, analyse } from '../tools/look.mjs';
import { breathOf, waveOf, balanceOf } from './judge.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const r2 = x => +(+x).toFixed(2);
function flashes(series, fps, times) {
  const swings = []; let dir = 0, pivot = series[0];
  series.forEach((v, i) => {
    if (dir >= 0 && v > pivot) { pivot = v; dir = 1; }
    if (dir <= 0 && v < pivot) { pivot = v; dir = -1; }
    if (dir === 1 && pivot - v >= 25.5) { swings.push(i); dir = -1; pivot = v; }
    else if (dir === -1 && v - pivot >= 25.5) { swings.push(i); dir = 1; pivot = v; }
  });
  let worst = 0, at = 0, all = [];
  for (let a = 0; a < swings.length; a++) { let b = a; while (b < swings.length && swings[b] - swings[a] < fps) b++; const n = Math.floor((b - a) / 2); if (n > worst) { worst = n; at = times[swings[a]]; } if (n >= 1) all.push(r2(times[swings[a]])); }
  return { worst, at, all };
}

export default async ({ page, log, save, out }) => {
  const songPath = process.env.SONG || 'media/ppp.mp3', song = basename(songPath).replace(/\.\w+$/, '');
  const stages = (process.env.STAGE || 'flash,wave,balance').split(',');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  const data = { items: [], files: [resolve(songPath)], dragOperationsMask: 1 };
  await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 320, y: 180, data });
  await page.send('Input.dispatchDragEvent', { type: 'drop', x: 320, y: 180, data });
  for (let i = 0; i < 1800; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await sleep(100); }
  await page.eval(async ({ flags, set, pool }) => {
    const F = await import(new URL('src/score/flags.js', location.href).href);
    for (const f of flags) { const [k, v] = f.split('='); F.setFlag(k, +v !== 0); }
    const drop = new RegExp(pool || '^$'); let dropped = 0; for (const P of app.patterns) if (pool && drop.test(P.id)) { P.pool = false; dropped++; }
    if (flags.length || dropped) { const before = app.song.rehearsal; app.song.rebuild({}); for (let i = 0; i < 200 && app.song.rehearsal === before; i++) await new Promise(r => setTimeout(r, 100)); }
    for (const f of set) { const [k, v] = f.split('='); app.edits[k] = +v; }
    app.song.pause(); app.ui.song.show(false); document.querySelector('#hints')?.setAttribute('hidden', ''); app.manual = true; app.governor.enabled = false; app.R.drawScale = 1; app.t = 0;
    const L = await import(new URL('src/pattern/layout.js', location.href).href);
    const c = document.createElement('canvas'); c.width = 320; c.height = 180; const x = c.getContext('2d', { willReadFrequently: true });
    window.__tiles = () => {
      x.drawImage(window.trippee.canvas, 0, 0, 320, 180); const d = x.getImageData(0, 0, 320, 180).data, W = 320, H = 180; let sum = 0, white = 0;
      const L_ = new Uint8Array(W * H); for (let k = 0; k < L_.length; k++) { const v = (d[k * 4] * 0.2126 + d[k * 4 + 1] * 0.7152 + d[k * 4 + 2] * 0.0722) | 0; L_[k] = v; sum += v; if (v > 127) white++; }
      const tiles = []; for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) { let s = 0, n = 0; for (let y = (ty * H / 4) | 0; y < ((ty + 1) * H / 4 | 0); y += 3) for (let X = (tx * W / 4) | 0; X < ((tx + 1) * W / 4 | 0); X += 3) { s += L_[y * W + X]; n++; } tiles.push(+(s / n).toFixed(1)); }
      return { mean: +(sum / L_.length).toFixed(2), white: +(white / L_.length).toFixed(4), tiles };
    };
    const g = document.createElement('canvas'); g.width = 96; g.height = 54; const gx = g.getContext('2d', { willReadFrequently: true });
    window.__small = () => { gx.drawImage(window.trippee.canvas, 0, 0, 96, 54); const d = gx.getImageData(0, 0, 96, 54).data, S = new Float32Array(96 * 54); for (let i = 0; i < S.length; i++) S[i] = d[i * 4 + 1]; return S; };
  }, { flags: (process.env.FLAGS || '').split(',').filter(Boolean), set: (process.env.SET || '').split(',').filter(Boolean), pool: process.env.NOPOOL || '' });
  const info = await page.eval(() => {
    const s = app.song.score, M = s.react?.M;
    return { duration: app.song.duration, pulses: Array.from(s.react?.pulses || []), breath: M?.breath?.t ? Array.from(M.breath.t) : [], bar: M?.bar, gestures: s.gestures.map(G => ({ t0: +G.t0.toFixed(2), t1: +G.t1.toFixed(2), morph: +(G.morph || 0).toFixed(2), id: G.pattern.id })) };
  });
  log(`${song}: ${info.duration.toFixed(1)} s, ${info.gestures.length} gestures, ${info.pulses.length} pulses, ${info.breath.length} breaths`);

  if (stages.includes('flash')) {
    const FPS = +(process.env.FPS || 24), confs = (process.env.CONF || 'all').split(';');
    const counted = {};
    for (const conf of confs) {
      const t0 = Date.now();
      const res = await page.eval(async ({ duration, FPS, conf }) => {
        const T = window.trippee, o = { fps: FPS, white: [], mean: [], tiles: [], time: [], kinds: [] }, E = app.edits, set = conf === 'all' ? [] : conf.split(',').map(x => x.split('='));
        for (const [k, v] of set) E[k] = +v;
        const N = Math.floor(duration * FPS);
        for (let i = 0; i < N; i++) {
          const t = i / FPS; T.seek(t); const v = window.__tiles();
          o.white.push(v.white); o.mean.push(v.mean); o.tiles.push(v.tiles); o.time.push(+t.toFixed(3)); o.kinds.push(app.lastFrame?.kind || '');
          if (i % 40 === 0) await new Promise(r => setTimeout(r));
        }
        for (const [k] of set) delete E[k];
        return o;
      }, { duration: info.duration, FPS, conf });
      const whole = flashes(res.mean, FPS, res.time);
      let worstT = 0; for (let k = 0; k < 16; k++) worstT = Math.max(worstT, flashes(res.tiles.map(a => a[k]), FPS, res.time).worst);
      log(`[${conf}] FLASH whole ${whole.worst} (limit 0) at ${whole.all.slice(0, 12).join(' ')}; tile ${worstT} (limit 2); ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      if (info.breath.length > 1) { const lag = info.breath.slice(1).map((t, i) => t - info.breath[i]).sort((a, b) => a - b)[(info.breath.length - 1) >> 1], b = breathOf(res, lag, info.breath); log(`  BREATH r ${b.r} at ${r2(lag)} s, peak ${b.peak}, best ${b.best} at ${b.bestLag}, attack ${b.attack}`); }
      const spans = [];
      for (const [name, ser, lim] of [['whole', res.mean, 1], ...Array.from({ length: 16 }, (_, k) => ['t' + k, res.tiles.map(a => a[k]), 3])]) {
        const f = flashes(ser, FPS, res.time); if (f.worst < lim) continue;
        const sw = []; let d = 0, p = ser[0]; ser.forEach((v, i) => { if (d >= 0 && v > p) { p = v; d = 1; } if (d <= 0 && v < p) { p = v; d = -1; } if (d === 1 && p - v >= 25.5) { sw.push(i); d = -1; p = v; } else if (d === -1 && v - p >= 25.5) { sw.push(i); d = 1; p = v; } });
        for (let a = 0; a < sw.length; a++) { let b = a; while (b < sw.length && sw[b] - sw[a] < FPS) b++; if (Math.floor((b - a) / 2) >= lim) spans.push({ t: res.time[sw[a]], name, kind: res.kinds[sw[a]] }); }
      }
      spans.sort((a, b) => a.t - b.t);
      const merged = []; for (const x of spans) { const l = merged.at(-1); if (l && x.t < l.t1 + 1.5) { l.t1 = x.t; l.names.add(x.name); l.kinds.add(x.kind); } else merged.push({ t0: x.t, t1: x.t, names: new Set([x.name]), kinds: new Set([x.kind]) }); }
      for (const m of merged) { const G = info.gestures.find(g => g.t0 <= m.t0 && m.t0 < g.t1); log(`  over: ${r2(m.t0)}-${r2(m.t1)} ${[...m.names].join(',')} kinds [${[...m.kinds].join(',')}] in ${G?.id}`); }
      writeFileSync(`${out}/${song}.scan.json`, JSON.stringify(res));
    }
  }
  const small = async () => { await page.send('Emulation.setDeviceMetricsOverride', { width: 480, height: 270, deviceScaleFactor: 1, mobile: false }); await sleep(300); };
  if (stages.includes('wave')) {
    await small();
    const res = await page.eval(async ({ pulses, duration }) => {
      const T = window.trippee, L = await import(new URL('src/pattern/layout.js', location.href).href);
      const W = 96, H = 54, FPS = 60, F = app.R.frame, Fw = L.FRAME.weight * 4, Ff = L.FRAME.focus * 4;
      const inner = [], outer = [], cs = [], sections = [0.3, 0.65].map(x => x * duration), times = [];
      for (const s0 of sections) for (let i = 0; i < 25 * FPS; i++) {
        const t = s0 + i / FPS; T.seek(t); const px = window.__small();
        const fx = F[Ff], fy = F[Ff + 1]; let a = 0, an = 0, b = 0, bn = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const X = (x + 0.5 - W / 2) / (H / 2) - fx, Y = (H / 2 - y - 0.5) / (H / 2) - fy, r = Math.hypot(X, Y); if (Math.abs(r - 0.2) < 0.07) { a += px[y * W + x]; an++; } else if (Math.abs(r - 0.9) < 0.07) { b += px[y * W + x]; bn++; } }
        inner.push(a / Math.max(an, 1)); outer.push(b / Math.max(bn, 1)); times.push(t);
        if (F[Fw + 2] > 0) cs.push(1 / F[Fw + 2]);
        if (i % 30 === 0) await new Promise(r => setTimeout(r));
      }
      return { inner, outer, times, c: cs.length ? cs[cs.length >> 1] : 0.6, pulses: pulses.filter(p => sections.some(s => p > s + 2.5 && p < s + 23)) };
    }, { pulses: info.pulses, duration: info.duration });
    const w = waveOf(res);
    if (process.env.CURVES) {
      const lock = (S, lo, hi) => { const o = new Float64Array(hi - lo + 1), n = new Float64Array(hi - lo + 1), det = S.map((v, i) => { let a = 0, k = 0; for (let j = Math.max(0, i - 90); j <= Math.min(S.length - 1, i + 90); j += 6) { a += S[j]; k++; } return v - a / k; }); for (const b of res.pulses) { const i = res.times.findIndex(t => Math.abs(t - b) < 0.02); if (i < 0) continue; for (let l = lo; l <= hi; l++) if (det[i + l] != null) { o[l - lo] += det[i + l]; n[l - lo]++; } } return Array.from(o, (v, i) => +(v / Math.max(n[i], 1)).toFixed(1)); };
      log('inner every 3 frames from -30:', lock(res.inner, -30, 30).filter((_, i) => i % 3 === 0).join(' '));
      log('outer every 6 frames from -135:', lock(res.outer, -135, -45).filter((_, i) => i % 6 === 0).join(' '));
    }
    // The judge draws its shuffled beats across the gap between the two sections as well, where they find no frames, so it's comparing all the real beats against about half as many fake ones.
    // This is the same test with the fake beats inside the sections.
    {
      const det = S => { const o = new Float64Array(S.length); for (let i = 0; i < S.length; i++) { let v = 0, k = 0; for (let j = Math.max(0, i - 90); j <= Math.min(S.length - 1, i + 90); j += 6) { v += S[j]; k++; } o[i] = S[i] - v / k; } return o; };
      const A = det(res.inner), N = res.times.length >> 1, height = idxs => { const m = new Float64Array(61), n = new Float64Array(61); for (const i of idxs) for (let l = -30; l <= 30; l++) { const k = i + l; if (k >= 0 && k < A.length) { m[l + 30] += A[k]; n[l + 30]++; } } let best = -1e9, sum = 0; m.forEach((v, q) => { const x = v / Math.max(n[q], 1); sum += x; if (x > best) best = x; }); return best - sum / 61; };
      const real = res.pulses.map(b => { let lo = 0, hi = res.times.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (res.times[m] < b) lo = m + 1; else hi = m; } return lo; });
      let seed = 271828, beat = 0; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; const h0 = height(real);
      for (let p = 0; p < 200; p++) { const fake = res.pulses.map(() => { const sec = rnd() < 0.5 ? 0 : N; return sec + 150 + Math.floor(rnd() * (N - 300)); }); if (height(fake) >= h0) beat++; }
      log(`  p with the fake beats all inside the sections: ${((beat + 1) / 201).toFixed(4)}`);
    }
    log(`WAVE ${w.ok ? 'PASS' : 'FAIL'} inner ${w.inner.lag} frames (height ${r2(w.inner.height)}), outer ${w.outer.lag} want ${w.expected} (height ${r2(w.outer.height)}), p ${w.p}, ${res.pulses.length} beats`);
  }
  if (stages.includes('balance')) {
    await small();
    const res = await page.eval(async ({ duration, step }) => {
      const RX = await import(new URL('src/score/react.js', location.href).href), Rc = app.song.score.react; window.__gains = t => RX.reactAt(Rc, Rc.C(t)).gains;
      const T = window.trippee, E = app.edits, dt = 1 / 12;
      const CH = ['reactPulse', 'reactMelody', 'reactTone', 'reactHarmony'], allOff = () => { for (const c of CH) E[c] = 0; };
      const grab = t => { T.seek(t); return window.__small(); };
      const o = { times: [], E: CH.map(() => []) };
      for (let t = 2; t < duration - 2; t += step) {
        allOff(); const b0 = grab(t), b1 = grab(t + dt);
        for (let c = 0; c < CH.length; c++) {
          allOff(); E[CH[c]] = 1; const a0 = grab(t), a1 = grab(t + dt);
          let s = 0; for (let i = 0; i < a0.length; i++) s += Math.abs((a1[i] - b1[i]) - (a0[i] - b0[i]));
          o.E[c].push(+(s / a0.length).toFixed(3));
        }
        o.times.push(+t.toFixed(2)); (o.g ||= []).push((({ drums, tune, tone, harm }) => [drums, tune, tone, harm].map(v => +v.toFixed(2)))(window.__gains?.(t) ?? { drums: 0, tune: 0, tone: 0, harm: 0 })); (o.ids ||= []).push(app.lastFrame?.G?.pattern?.id + (app.lastFrame?.kind ? '/' + app.lastFrame.kind : ''));
        if (o.times.length % 8 === 0) await new Promise(r => setTimeout(r));
      }
      for (const c of CH) delete E[c];
      return o;
    }, { duration: info.duration, step: +(process.env.BALANCE_STEP || 1) });
    const lag = info.breath.length > 1 ? info.breath.slice(1).map((t, i) => t - info.breath[i]).sort((a, b) => a - b)[(info.breath.length - 1) >> 1] : 8;
    const b = balanceOf(res, lag);
    if (process.env.BREATHS) {
      const per = Math.max(1, Math.round(lag / (res.times[1] - res.times[0])));
      for (let i = 0; i < res.times.length; i += per) {
        const sum = res.E.map(c => c.slice(i, i + per).reduce((x, y) => x + y, 0)), tot = sum.reduce((x, y) => x + y, 0) || 1, g = res.g[i + (per >> 1)] || [];
        log(`  ${String(res.times[i]).padStart(6)} shares ${sum.map(v => String(Math.round(v / tot * 100)).padStart(3)).join(' ')} tot ${String(Math.round(tot)).padStart(5)} gains ${g.join(' ')} ${res.ids[i + (per >> 1)]}`);
      }
    }
    log(`BALANCE pulse ${r2(b.shares[0] * 100)}%, melody ${r2(b.shares[1] * 100)}%, tone ${r2(b.shares[2] * 100)}%, harmony ${r2(b.shares[3] * 100)}%; a lead in ${r2(b.leadShare * 100)}% of ${b.breaths} breaths`);
  }
  // What each channel does to the frame, by itself: on against off, as a grid of difference pictures round a strong beat. CH=reactPulse AT=120 SECS=3
  if (stages.includes('rings')) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    const at = +(process.env.AT || '120').split(',')[0], chs = (process.env.CH || 'reactPulse,reactMelody,reactHarmony').split(','), cols = +(process.env.COLS || 12);
    const url = await page.eval(async ({ at, chs, cols, pulses }) => {
      const T = window.trippee, E = app.edits, W = 213, H = 120, c = document.createElement('canvas'), x = c.getContext('2d', { willReadFrequently: true });
      c.width = W; c.height = H;
      const grab = t => { T.seek(t); x.drawImage(T.canvas, 0, 0, W, H); return x.getImageData(0, 0, W, H).data.slice(); };
      const beat = pulses.find(p => p > at) ?? at, times = []; for (let i = 0; i < cols; i++) times.push(beat - 1.5 + i * 2.4 / (cols - 1));
      const sheet = document.createElement('canvas'), sg = sheet.getContext('2d'); sheet.width = W * cols; sheet.height = H * (chs.length + 1);
      const put = (data, cx, cy) => { const im = sg.createImageData(W, H); im.data.set(data); sg.putImageData(im, cx, cy); };
      times.forEach((t, i) => { put(grab(t), i * W, 0); sg.fillStyle = 'red'; sg.font = '12px sans-serif'; sg.fillText((t - beat).toFixed(2), i * W + 3, 13); });
      chs.forEach((ch, row) => times.forEach((t, i) => {
        E[ch] = 1; const a = grab(t); E[ch] = 0; const b = grab(t); delete E[ch];
        const d = new Uint8ClampedArray(a.length); for (let k = 0; k < a.length; k += 4) { const v = Math.min(255, Math.abs(a[k + 1] - b[k + 1]) * 1.5); d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255; }
        put(d, i * W, (row + 1) * H);
      }));
      return { url: sheet.toDataURL('image/jpeg', 0.85), beat };
    }, { at, chs, cols, pulses: info.pulses });
    save(`${song}_rings_${at}.jpg`, url.url); log(`rings ${at}: beat at ${r2(url.beat)}`);
  }
  // Every boundary at 60 fps: the worst step against what's around it, song on. Over 2.5x gets named.
  if (stages.includes('bound')) {
    await small();
    const r = await page.eval(async ({ gestures }) => {
      const T = window.trippee, marks = [], out = [];
      for (const G of gestures) { if (G.t1 < 3000) marks.push([G.t1, 'land ' + G.id]); if (G.morph && G.t1 < 3000) marks.push([G.t1 - G.morph, 'start from ' + G.id]); }
      for (const [at, what] of marks) {
        let prev = null; const rows = [];
        for (let t = at - 1; t < at + 1; t += 1 / 60) { T.seek(t); const px = window.__small(); if (prev) { let d = 0; for (let i = 0; i < px.length; i++) d += Math.abs(px[i] - prev[i]); rows.push([+t.toFixed(3), d / px.length]); } prev = px; }
        const sorted = rows.map(x => x[1]).sort((a, b) => a - b), med = Math.max(sorted[sorted.length >> 1], 0.5), w = rows.reduce((a, b) => (b[1] > a[1] ? b : a));
        out.push({ at: +at.toFixed(2), what, ratio: +(w[1] / med).toFixed(2), worst: +w[1].toFixed(1), when: w[0], kind: app.lastFrame?.kind || '' });
        await new Promise(r => setTimeout(r));
      }
      return out;
    }, { gestures: info.gestures });
    const bad = r.filter(x => x.ratio > 2.5).sort((a, b) => b.ratio - a.ratio);
    log(`BOUND ${r.length} boundaries, worst ${Math.max(...r.map(x => x.ratio))}x; over 2.5x: ${bad.map(x => `${x.at} ${x.what} ${x.ratio}x (${x.worst}) at ${x.when}`).join('; ') || 'none'}`);
  }
  // A pop: what changes frame by frame round AT, with the song on and off. POPSECS either side.
  if (stages.includes('pop')) {
    await small();
    for (const at of (process.env.AT || '57.45').split(',').map(Number)) {
      const r = await page.eval(async ({ at, secs }) => {
        const T = window.trippee, E = app.edits, out = {};
        for (const [name, ch] of [['song', null], ['none', 'reactAmt'], ['noMel', 'reactMelody'], ['noHarm', 'reactHarmony'], ['noTone', 'reactTone'], ['noPulse', 'reactPulse'], ['noLung', 'reactLung']]) {
          for (const k of ['reactAmt', 'reactMelody', 'reactHarmony', 'reactTone', 'reactPulse', 'reactLung']) delete E[k];
          if (ch) E[ch] = 0;
          let prev = null; const rows = [];
          for (let t = at - secs; t < at + secs; t += 1 / 60) { T.seek(t); const px = window.__small(); if (prev) { let d = 0; for (let i = 0; i < px.length; i++) d += Math.abs(px[i] - prev[i]); rows.push([+t.toFixed(3), +(d / px.length).toFixed(1), app.lastFrame?.kind || '', +(app.lastFrame?.T || 0).toFixed(3)]); } prev = px; }
          out[name] = rows;
        }
        for (const k of ['reactAmt', 'reactMelody', 'reactHarmony', 'reactTone', 'reactPulse', 'reactLung']) delete E[k];
        return out;
      }, { at, secs: +(process.env.POPSECS || 0.25) });
      for (const k in r) { const sorted = r[k].map(x => x[1]).sort((a, b) => a - b), med = sorted[sorted.length >> 1], w = r[k].reduce((a, b) => (b[1] > a[1] ? b : a)); log(`pop ${at} [${k}] median step ${med}, worst ${w[1]} at ${w[0]} kind ${w[2]} T ${w[3]}`); }
    }
  }
  // A strong beat, close up: frames from SPAN seconds before it to after it, at 960x540.
  if (stages.includes('beat')) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    for (const at of (process.env.AT || '120').split(',').map(Number)) {
      const url = await page.eval(async ({ at, pulses, span }) => {
        const T = window.trippee, W = 480, H = 270, beat = pulses.find(p => p > at) ?? at, cols = 5, rows = 4, sheet = document.createElement('canvas'), g = sheet.getContext('2d');
        sheet.width = W * cols; sheet.height = H * rows; g.font = '16px sans-serif'; g.fillStyle = 'red';
        for (let i = 0; i < cols * rows; i++) { const t = beat - span + i * (span * 1.5) / (cols * rows - 1); T.seek(t); g.drawImage(T.canvas, (i % cols) * W, ((i / cols) | 0) * H, W, H); g.fillText((t - beat).toFixed(2), (i % cols) * W + 4, ((i / cols) | 0) * H + 18); }
        return { url: sheet.toDataURL('image/jpeg', 0.85), beat, id: app.lastFrame?.G?.pattern?.id };
      }, { at, pulses: info.pulses, span: +(process.env.SPAN || 1.2) });
      save(`${song}_beat_${at}.jpg`, url.url); log(`beat ${at}: at ${r2(url.beat)} on ${url.id}`);
    }
  }
  if (stages.includes('look')) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    const noThumb = process.env.LOOKSECS || 6;
    for (const a of (process.env.AT || '48').split(',').map(Number)) {
      const w = await watch(page, save, { name: `${song}_${a}`, seconds: +noThumb, fps: +(process.env.LOOKFPS || 12), cols: 12, rows: 6, setup: `app.t=${a}` });
      const x = analyse(w);
      log(`look ${a}: whole ${x.flashesPerSecondWholeFrame}, tile ${x.flashesPerSecondAnyTile}, step ${x.largestLuminanceStepPerFrame}`);
    }
  }
  const errs = page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  log(errs.length ? `ERRORS ${errs.slice(0, 4).join(' | ')}` : 'no console errors');
};
