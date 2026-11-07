// How much the film answers the song, in real pixels: the owner's "not nearly reactive enough". Works on any build, so main can be measured against the branch.
//
//   SONGS=mgmt,ppp node tools/lab.mjs tests/answer.mjs --url http://localhost:5300/ --out lab-out/answer-main       (or LAB_URL)
//   HEAR=0                  start with ?hear=0 appended
//   STRIPS=mgmt:62.4,ppp:120   also a dense strip around those song seconds: 16 frames, 15 per second, centred on the nearest strong beat
//
// Walks the film with the rehearsal's own eyes at 30 fps on 160x90, on a fixed clock, muted. Everything's from what's drawn:
//   beat       the change over the 200 ms arriving at a strong beat (mean |dY|, 0..255), and the same on the other beats: how far the sheet moves on the beat, and against what
//   answers    the share of the frame whose brightness moved by a quarter of full range over that 200 ms, on the beat, less the same on the other beats
//   tap        the share of strong beats with a clear peak of motion within 150 ms: 1.5 times the median of the bar around it. Could you tap along?
//   fold       motion folded on the strong beats: its top against its mean. A flat line, 1, has no beat in it
//   tune       the whole sheet's own up-and-down (Lucas-Kanade, integrated, drift over 3 s removed) against the tune in voiced stretches: r at no lag, and the lag where r is best. Plus the same against sideways/zoom in case the tune moved those
//   notes      motion in the 200 ms after a note starts, against voiced time as a whole
//   moments    the song's biggest jumps (tests/shotlist.mjs's jumpsOf): the share that visibly answer, by shotlist's own rule, and the same for all bar lines as a control. Then the biggest in order, each with its answer
//   loud       motion in the loudest third of the song against the quietest
//   grow       the same answer at each of the song's biggest repeated hits in order: motion within a beat of it
import { basename, resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { jumpsOf } from './shotlist.mjs';

const F = 30, W = 160, H = 90;

export const walk = async ({ F, W, H }) => {
  const here = u => new URL(u, location.href).href;
  const { getRig, shot } = await import(here('src/music/rehearse.js'));
  const R = await getRig(), S = app.song.score, A = app.song.analysis, dur = A.duration, N = Math.floor(dur * F);
  const px = new Uint8Array(W * H * 4), Y = new Float32Array(W * H);
  const back = Array.from({ length: 6 }, () => new Float32Array(W * H));
  const out = { d: new Float32Array(N), d200: new Float32Array(N), cov: new Float32Array(N), gx: new Float32Array(N), gy: new Float32Array(N), gz: new Float32Array(N), white: new Float32Array(N), mean: new Float32Array(N), tiles: new Float32Array(N * 16) };
  let prev = null;
  for (let i = 0; i < N; i++) {
    shot(R, S, i / F, W, H, px);
    let white = 0;
    for (let k = 0; k < W * H; k++) { const v = px[k * 4 + 1]; Y[k] = v; if (v > 127) white++; }
    out.white[i] = white / (W * H);
    { let all = 0; const q = new Float64Array(16), n = new Float64Array(16); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = Y[y * W + x], k = Math.min(3, (y * 4 / H) | 0) * 4 + Math.min(3, (x * 4 / W) | 0); all += v; q[k] += v; n[k]++; } out.mean[i] = all / (W * H); for (let k = 0; k < 16; k++) out.tiles[i * 16 + k] = q[k] / n[k]; }
    if (prev) {
      let d = 0, xx = 0, yy = 0, zz = 0, xy = 0, xz = 0, yz = 0, xt = 0, yt = 0, zt = 0;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const k = y * W + x, gx = (Y[k + 1] - Y[k - 1]) / 2, gy = (Y[k + W] - Y[k - W]) / 2, gt = Y[k] - prev[k], rx = (x - W / 2) / (H / 2), ry = (y - H / 2) / (H / 2), gz = gx * rx + gy * ry;
        d += Math.abs(gt);
        xx += gx * gx; yy += gy * gy; zz += gz * gz; xy += gx * gy; xz += gx * gz; yz += gy * gz; xt += gx * gt; yt += gy * gt; zt += gz * gt;
      }
      out.d[i] = d / ((W - 2) * (H - 2));
      // Three unknowns: shift across, shift up, zoom. In frame heights. A little ridge so a flat frame stays still.
      const e = 1e-2 * (xx + yy + 1), a = xx + e, b = yy + e, c = zz + e, det = a * (b * c - yz * yz) - xy * (xy * c - yz * xz) + xz * (xy * yz - b * xz) || 1;
      const u = (-xt * (b * c - yz * yz) + yt * (xy * c - yz * xz) - zt * (xy * yz - b * xz)) / det;
      const v = (-a * (yt * c - yz * zt) + xy * (xt * c - xz * zt) - xz * (xt * yz - yt * xz)) / det;
      const z = (-a * (b * zt - yt * yz) + xy * (xy * zt - yt * xz) - xt * (xy * yz - b * xz)) / det;
      out.gx[i] = u / (H / 2); out.gy[i] = v / (H / 2); out.gz[i] = z;       // gy: up is positive, since the rows come bottom up
      const old = back[(i + 5) % 6];
      let d6 = 0, cov = 0;
      if (i >= 6) { for (let k = 0; k < W * H; k++) { const q = Math.abs(Y[k] - old[k]); d6 += q; if (q > 64) cov++; } out.d200[i] = d6 / (W * H); out.cov[i] = cov / (W * H); }
    }
    back[(i + 5) % 6].set(Y);
    prev = back[(i + 5) % 6];
    if (i % 60 === 0) await new Promise(r => setTimeout(r));
  }
  const m = S.react?.M, film = S.heard ?? S.react, at = (a, t) => (a ? a[Math.max(0, Math.min(a.length - 1, Math.round(t * A.fps)))] || 0 : 0);
  const barsN = (A.bars || []).length, per = {};
  for (const k of ['loud', 'bright', 'bass', 'perc', 'voiced']) per[k] = Array.from(A.bars || [], (t, i) => { const t1 = A.bars[i + 1] ?? t + 2; let s = 0, c = 0; for (let q = t; q < t1; q += 0.1) { s += at(A[k], q); c++; } return s / Math.max(c, 1); });
  const melTable = [], enTable = [], voicedT = [];
  for (let i = 0; i < N; i++) { melTable.push(+at(A.m, i / F).toFixed(3)); voicedT.push(+at(A.voiced, i / F).toFixed(2)); enTable.push(+at(A.E || A.loud, i / F).toFixed(3)); }
  const enc = a => { const b = new Uint8Array(a.buffer); let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode(...b.subarray(i, i + 32768)); return btoa(s); };
  const r = { d: enc(out.d), d200: enc(out.d200), cov: enc(out.cov), gx: enc(out.gx), gy: enc(out.gy), gz: enc(out.gz), white: enc(out.white), mean: enc(out.mean), tiles: enc(out.tiles) };
  return JSON.stringify({
    ...r, melTable, voicedT, enTable, dur, N, bpm: A.bpm, meter: A.meter, beats: Array.from(A.beats || []), bars: Array.from(A.bars || []), pulses: Array.from(film.pulses || []), per, bar: m?.bar ?? (A.bars?.[1] - A.bars?.[0]) ?? 2,
    segments: (A.segments || []).map(s => ({ t0: s.t0, t1: s.t1, label: s.label })), arrivals: m?.arrivals ? m.arrivals(0.3).map(x => ({ t: x.t, a: x.a })) : [], rests: (m?.rests || []).map(x => ({ a: x.a, b: x.b })),
    gestures: S.gestures.length, ambientLow: (() => { let k = 0, c = 0; for (let t = 0; t < dur; t += 0.25) { if ((S.ambient?.(t) ?? 1) < 0.9) k++; c++; } return k / c; })(), hasHear: !!S.heard, version: app.VERSION,
  });
};

const dec = s => { const b = Buffer.from(s, 'base64'); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const med = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const r3 = x => +x.toFixed(3), r2 = x => +x.toFixed(2);
const corr = (a, b) => { const ma = mean(a), mb = mean(b); let x = 0, y = 0, z = 0; for (let i = 0; i < a.length; i++) { x += (a[i] - ma) * (b[i] - mb); y += (a[i] - ma) ** 2; z += (b[i] - mb) ** 2; } return x / Math.sqrt(y * z || 1); };

// A flash, as tools/look.mjs counts them: a pair of opposing swings of 10% of full scale, per second.
const flashes = (series, fps) => {
  const swings = []; let dir = 0, pivot = series[0];
  series.forEach((v, i) => { if (dir >= 0 && v > pivot) { pivot = v; dir = 1; } if (dir <= 0 && v < pivot) { pivot = v; dir = -1; } if (dir === 1 && pivot - v >= 25.5) { swings.push(i); dir = -1; pivot = v; } else if (dir === -1 && v - pivot >= 25.5) { swings.push(i); dir = 1; pivot = v; } });
  let worst = 0, secs = 0; const at = [];
  for (let a = 0; a < swings.length; a++) { let b = a; while (b < swings.length && swings[b] - swings[a] < fps) b++; const n = Math.floor((b - a) / 2); if (n) { secs++; at.push(+(swings[a] / fps).toFixed(1)); } worst = Math.max(worst, n); }
  return { worst, secs, at };
};

export function reckon(raw) {
  const q = JSON.parse(raw), d = dec(q.d), d200 = dec(q.d200), cov = dec(q.cov), gx = dec(q.gx), gy = dec(q.gy), gz = dec(q.gz), { dur, N, beats, bars, per, bar, segments, arrivals, rests, melTable, voicedT, enTable } = q;
  const meanY = dec(q.mean), tl = dec(q.tiles), fw = flashes(Array.from(meanY), F);
  let tileWorst = 0, tileSecs = 0; for (let k = 0; k < 16; k++) { const f = flashes(Array.from({ length: N }, (_, i) => tl[i * 16 + k]), F); tileWorst = Math.max(tileWorst, f.worst); tileSecs += f.secs; }
  const iAt = t => Math.max(0, Math.min(N - 1, Math.round(t * F))), rng = (a, b) => { const o = []; for (let i = Math.max(0, Math.ceil(a * F)); i <= Math.min(N - 1, Math.floor(b * F)); i++) o.push(i); return o; };
  const strong = new Set(q.pulses.map(t => t.toFixed(3)));
  // A strong beat by a rule no film chose as well: the bar lines. Both are reported, since v2.5.1's pulses are its own sparse pick.
  const stT = q.pulses.filter(t => t > 4 && t < dur - 4), otherT = beats.filter(t => t > 4 && t < dur - 4 && !strong.has(t.toFixed(3)));
  const arriving = t => iAt(t + 0.07);
  const bm = mean(stT.map(t => d200[arriving(t)])), om = mean(otherT.map(t => d200[arriving(t)])), bc = mean(stT.map(t => cov[arriving(t)])), oc = mean(otherT.map(t => cov[arriving(t)]));
  const barT = bars.filter(t => t > 4 && t < dur - 4), bbm = mean(barT.map(t => d200[arriving(t)])), bbc = mean(barT.map(t => cov[arriving(t)]));
  const d3 = i => (d[Math.max(0, i - 1)] + d[i] + d[Math.min(N - 1, i + 1)]) / 3;
  const tap = mean(stT.map((t, k) => {
    const near = Math.max(...rng(t - 0.15, t + 0.15).map(d3)), L = Math.max(1, (stT[k + 1] ?? t + 2) - t), base = med(rng(t - L, t + L).map(i => d[i]));
    return near >= 1.5 * Math.max(base, 0.05) ? 1 : 0;
  }));
  // Motion folded on the strong beats
  const fold = new Float32Array(24), foldN = new Float32Array(24);
  for (let k = 0; k + 1 < stT.length; k++) { const a = stT[k], b = stT[k + 1]; if (b - a > 4) continue; for (const i of rng(a, b)) { const x = Math.min(23, Math.floor((i / F - a) / (b - a) * 24)); fold[x] += d[i]; foldN[x]++; } }
  const f2 = Array.from(fold, (v, i) => v / Math.max(foldN[i], 1)), foldTop = Math.max(...f2) / Math.max(mean(f2), 1e-3), foldMin = Math.min(...f2) / Math.max(mean(f2), 1e-3), foldAt = f2.indexOf(Math.max(...f2)) / 24;
  // The tune: the sheet's own height, drift over 3 s taken off, against the melody in voiced stretches
  const integ = g => { const o = new Float32Array(N); let s = 0; for (let i = 0; i < N; i++) { s = 0.995 * s + g[i]; o[i] = s; } const hp = new Float32Array(N), w = 45; let run = 0; for (let i = 0; i < N; i++) { run += o[i]; if (i >= 2 * w) run -= o[i - 2 * w]; hp[i] = o[i] - run / Math.min(i + 1, 2 * w); } return hp; };
  const iy = integ(gy), ix = integ(gx), iz = integ(gz);
  const voicedIdx = []; for (let i = 60; i < N - 60; i++) if (voicedT[i] > 0.4) voicedIdx.push(i);
  const lagged = (sig, L) => corr(voicedIdx.map(i => sig[Math.max(0, Math.min(N - 1, i + L))]), voicedIdx.map(i => melTable[i]));
  const lags = [-60, -45, -30, -21, -15, -9, -6, -3, 0, 3, 6, 9, 15, 21, 30, 45, 60];
  const best = sig => { let top = 0, at = 0; for (const L of lags) { const r = lagged(sig, L); if (Math.abs(r) > Math.abs(top)) { top = r; at = L; } } return { r: r3(top), lag: r2(at / F), now: r3(lagged(sig, 0)) }; };
  const tuneAmp = mean(voicedIdx.map(i => Math.abs(iy[i])));
  // The same on rates, which a wandering integral can't swamp: the sheet's speed upward against how fast the tune's climbing, both over a tenth of a second or so
  const box = (a, r) => { const o = new Float32Array(N); let s = 0; for (let i = 0; i < N; i++) { s += a[i]; if (i > 2 * r) s -= a[i - 2 * r - 1]; o[i] = s / Math.min(i + 1, 2 * r + 1); } return Float32Array.from(o, (_, i) => o[Math.min(N - 1, i + r)]); };
  const dm = new Float32Array(N); for (let i = 1; i < N; i++) dm[i] = voicedT[i] > 0.4 && voicedT[i - 1] > 0.4 ? melTable[i] - melTable[i - 1] : 0;
  const dmS = box(dm, 3), gyS = box(gy, 3), rate = L => corr(voicedIdx.map(i => gyS[Math.max(0, Math.min(N - 1, i + L))]), voicedIdx.map(i => dmS[i]));
  const rates = [-30, -15, -9, -6, -3, 0, 3, 6, 9, 15, 30].map(L => [L, rate(L)]), topRate = rates.reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a));
  // Notes
  const noteT = []; { let last = -1, lastM = 1e9; for (let i = 3; i < N - 12; i++) { if (voicedT[i] < 0.4) { lastM = 1e9; continue; } const m = melTable[i]; if (Math.abs(m - lastM) >= 0.8 && Math.abs(melTable[i + 3] - m) < 0.5 && i - last > 3) { noteT.push(i / F); last = i; lastM = m; } } }
  const noteMove = mean(noteT.map(t => d200[iAt(t + 0.2)])), voicedMove = mean(voicedIdx.map(i => d200[i]));
  // Motion, lined up on the notes that jump: what a note does, whatever the beat's doing, since they don't fall on the beat in any regular way
  const jumps = []; { let last = -1e9, held = null; for (let i = 3; i < N - 12; i++) { if (voicedT[i] < 0.4) { held = null; continue; } const m = melTable[i]; if ((held == null || Math.abs(m - held) >= 1.5) && Math.abs(melTable[i + 2] - m) < 0.7 && i - last > 7) { jumps.push(i); last = i; held = m; } } }
  const eta = Array.from({ length: 31 }, (_, k) => mean(jumps.map(i => d[Math.max(0, Math.min(N - 1, i + k - 10))]))), etaBase = mean(eta), etaTop = Math.max(...eta), etaAt = (eta.indexOf(etaTop) - 10) / F;
  // Moments: shotlist's biggest jumps, and shotlist's rule for showing
  const J = jumpsOf({ per, bars, bar, dur, segments, arrivals });
  const shows = t => { const near = rng(t - 0.25, t + 0.25).map(d3), base = [...rng(t - 8, t - 1), ...rng(t + 1, t + 8)].map(i => d[i]); return (near.length ? Math.max(...near) : 0) / Math.max(med(base), 0.08); };
  const peaks = J.peaks.filter(p => p.t > 8 && p.t < dur - 4), top = peaks.slice(0, Math.max(6, Math.round(dur / 22)));
  const momentsShown = mean(top.map(p => (shows(p.t) >= 1.5 ? 1 : 0))), barsShown = mean(barT.map(t => (shows(t) >= 1.5 ? 1 : 0)));
  // Loud against quiet, by the song's own thirds
  const en = Float32Array.from(enTable), bars2 = barT.map(t => ({ t, e: mean(rng(t, t + bar).map(i => en[i])), m: mean(rng(t, t + bar).map(i => d[i])) })).sort((a, b) => a.e - b.e), third = Math.max(1, Math.floor(bars2.length / 3));
  const quiet = bars2.slice(0, third), loud = bars2.slice(-third);
  const mQuiet = mean(quiet.map(x => x.m)), mLoud = mean(loud.map(x => x.m));
  const voicedShare = voicedIdx.length / N;
  // The song's biggest rises in the order they come: does a later one get less than an earlier one? How fast the picture's going around each, and for the bars after it.
  const grow = peaks.filter(p => p.sign > 0).slice(0, 8).sort((a, b) => a.t - b.t).map(p => `${r2(p.t)}:${r2(Math.max(...rng(p.t - 0.3, p.t + 0.3).map(d3)))}/${r2(mean(rng(p.t, p.t + 2 * bar).map(i => d[i])))}`).join(' ');
  return {
    beat: { strong: r2(bm), others: r2(om), ratio: r2(bm / Math.max(om, 1e-3)), bars: r2(bbm), n: stT.length, secs: r2(mean(stT.slice(1).map((t, i) => t - stT[i]))) },
    answers: { strong: r3(bc), others: r3(oc), bars: r3(bbc) },
    tap: r3(tap), fold: { top: r2(foldTop), min: r2(foldMin), at: r2(foldAt), swing: r2((foldTop - foldMin) * mean(f2)) }, meanMotion: r2(mean(Array.from(d))),
    tune: { up: best(iy), rate: { now: r3(rate(0)), r: r3(topRate[1]), lag: r2(topRate[0] / F) }, across: best(ix), amp: r3(tuneAmp), voiced: r2(voicedShare) },
    notes: { n: jumps.length, peak: r2(etaTop / Math.max(etaBase, 1e-3)), at: r2(etaAt), swing: r2(etaTop - Math.min(...eta)) },
    moments: { shown: r2(momentsShown), barsShown: r2(barsShown), top: top.map(p => `${r2(p.t)}${p.sign > 0 ? '+' : '-'}${r2(p.s)}:${r2(shows(p.t))}`).join(' ') },
    grow, flash: { whole: fw.worst, wholeN: fw.secs, tile: tileWorst, tileN: tileSecs, at: fw.at.slice(0, 12).join(' ') },
    loud: { quiet: r2(mQuiet), loud: r2(mLoud), ratio: r2(mLoud / Math.max(mQuiet, 1e-3)) },
    ambientLow: r2(q.ambientLow), gestures: q.gestures, hasHear: q.hasHear, version: q.version,
  };
}

// In the page: a contact sheet of real frames, 15 a second around a time. Each frame's caption gives its offset from the beat.
export const stripInPage = async ({ at, frames, per, cols, W, H, title }) => {
  const here = u => new URL(u, location.href).href;
  const { getRig, shot } = await import(here('src/music/rehearse.js'));
  const R = await getRig(), S = app.song.score, px = new Uint8Array(W * H * 4);
  const c = document.createElement('canvas'), rows = Math.ceil(frames / cols); c.width = cols * W; c.height = rows * (H + 14) + 18;
  const g = c.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#ff0'; g.font = '12px sans-serif'; g.fillText(title, 4, 13);
  const im = g.createImageData(W, H);
  for (let i = 0; i < frames; i++) {
    const off = (i - (frames >> 1)) / per;
    shot(R, S, at + off, W, H, px);
    for (let y = 0; y < H; y++) im.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    const X = (i % cols) * W, Y = Math.floor(i / cols) * (H + 14) + 18;
    g.putImageData(im, X, Y);
    g.fillStyle = off === 0 ? '#0f0' : '#ccc'; g.fillText(`${off >= 0 ? '+' : ''}${off.toFixed(2)}`, X + 3, Y + H + 11);
  }
  return c.toDataURL('image/jpeg', 0.8);
};

// In the page: time-slices. The centre row and centre column against time, top to bottom, 60 a second, with the strong beats ticked in red at the left, moments in yellow, and the tune as a green line at the right. A beat you can see is a row of bumps at the ticks.
export const slicesInPage = async ({ t0, secs, W, H }) => {
  const here = u => new URL(u, location.href).href;
  const { getRig, shot } = await import(here('src/music/rehearse.js'));
  const R = await getRig(), S = app.song.score, A = app.song.analysis, F = 60, N = Math.floor(secs * F), px = new Uint8Array(W * H * 4), gap = 60;
  const c = document.createElement('canvas'); c.width = W + H + gap + 90; c.height = N; const g = c.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, c.width, c.height);
  const im = g.createImageData(W + H, 1), P = (S.heard ?? S.react).pulses, M = S.hear?.moments ?? [];
  const at = (a, t) => (a ? a[Math.max(0, Math.min(a.length - 1, Math.round(t * A.fps)))] || 0 : 0);
  for (let i = 0; i < N; i++) {
    const t = t0 + i / F;
    shot(R, S, t, W, H, px);
    for (let x = 0; x < W; x++) { const v = px[((H >> 1) * W + x) * 4 + 1]; im.data.set([v, v, v, 255], x * 4); }
    for (let y = 0; y < H; y++) { const v = px[(y * W + (W >> 1)) * 4 + 1]; im.data.set([v, v, v, 255], (W + y) * 4); }
    g.putImageData(im, gap, i);
    const m = at(A.m, t), v = at(A.voiced, t);
    if (v > 0.4) { g.fillStyle = '#0f0'; g.fillRect(gap + W + H + 45 + m * 3, i, 2, 1); }
    if (i % 6 === 0) await new Promise(r => setTimeout(r));
  }
  g.font = '11px sans-serif';
  for (const p of P) if (p >= t0 && p < t0 + secs) { g.fillStyle = '#f33'; g.fillRect(0, (p - t0) * F, gap, 2); g.fillText(p.toFixed(2), 2, (p - t0) * F - 2); }
  for (const q of M) if (q.t >= t0 && q.t < t0 + secs) { g.fillStyle = '#ff0'; g.fillRect(gap + W + H, (q.t - t0) * F, 40, 2); g.fillText(q.kind, gap + W + H + 2, (q.t - t0) * F - 2); }
  return c.toDataURL('image/jpeg', 0.85);
};

export default async ({ page, save, sleep, log }) => {
  const songs = (process.env.SONGS || 'mgmt,ppp,wildflower,disclosure').split(','), seed = +(process.env.SEED || 7), base = await page.eval('location.href'), strips = (process.env.STRIPS || '').split(',').filter(Boolean).map(x => x.split(':')), all = {};
  const url = process.env.HEAR != null ? `${base.split('?')[0]}?hear=${process.env.HEAR}` : base;
  for (const [k, song] of songs.entries()) {
    if (k || process.env.HEAR != null) { await page.goto(url); for (let i = 0; i < 200; i++) { let ok = false; try { ok = await page.eval('window.trippee?.ready===true'); } catch { /* still navigating */ } if (ok) break; await sleep(250); } }
    await page.eval(`app.manual=true;window.__done=false;window.__err=null;trippee.song('/media/${song}.mp3',{autoplay:false,seed:${seed}}).then(()=>window.__done=true,e=>window.__err=String(e));0`);
    const t0 = Date.now();
    for (let i = 0; i < 1800 && !(await page.eval('window.__done||!!window.__err')); i++) await sleep(250);
    const err = await page.eval('window.__err');
    if (err) throw new Error(`${song}: ${err}`);
    log(song, 'ready in', ((Date.now() - t0) / 1000).toFixed(0), 's');
    if (process.env.SIZE) await page.eval(`import(new URL('src/score/hear.js',location.href).href).then(m=>{${process.env.SIZE.split(',').map(x => { const [k, v] = x.split(':'); return `m.SIZE.${k}=${v};`; }).join('')}})`);
    if (!process.env.NOWALK) {
      const raw = await page.eval(walk, { F, W, H });
      save(`${song}.answer.json`, raw);
      all[song] = reckon(raw);
      log(song, JSON.stringify(all[song]));
    }
    for (const [s, t] of (process.env.SLICES || '').split(',').filter(Boolean).map(x => x.split(':'))) {
      if (s !== song) continue;
      save(`${song}.slices-${t}.jpg`, await page.eval(slicesInPage, { t0: +t, secs: +(process.env.SECS || 12), W: 480, H: 270 }));
    }
    for (const [s, t] of strips) {
      if (s !== song) continue;
      const beatsAt = await page.eval(`(()=>{const S=app.song.score,f=S.heard??S.react;return Array.from(f.pulses)})()`);
      const at = beatsAt.reduce((b, x) => (Math.abs(x - +t) < Math.abs(b - +t) ? x : b), +t);
      save(`${song}.strip-${t}.jpg`, await page.eval(stripInPage, { at, frames: +(process.env.FRAMES || 24), per: +(process.env.PER || 15), cols: 8, W: 240, H: 135, title: `${song} ${at.toFixed(2)} s, a strong beat at +0.00, ${process.env.PER || 15} per second` }));
    }
  }
  save('summary.json', JSON.stringify(all, null, 1));
  log('done');
};
