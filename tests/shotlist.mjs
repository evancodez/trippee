// A shot list: what the film really does next to what the music really does, phrase by phrase, for someone who can't hear the song. The numbers have to carry it.
//
//   node tools/lab.mjs tests/shotlist.mjs --size 1280,720 --out lab-out/direction
//   SONGS=ppp,mgmt   only these.  SEED=7   another take (7 is what a dropped song gets).  CUT=1   the song's hand cut, once rehearsed, in place of the generated film.
//
// Each song gets a fresh page, as a person dropping one song would, and the film is the one the rehearsal passed. It's then stepped on a fixed clock at 12 fps with the rehearsal's own eyes (no sound
// plays), so what's measured is what's drawn: kinds of transformation as the plan really chose them, pixels flipping, edges crossing. Writes, into --out:
//   <song>.shots.txt   the header, one row per breath, every gesture, and the whole-song numbers (each section of it says how its numbers are defined)
//   <song>.strip.jpg   a frame at each section boundary and every 8 bars, captioned
//   <song>.walk.json   the walk itself: what tests/judge.mjs's STAGE=direction reads, and node tests/judge.mjs --direction <folder> reads again. Numbers only, and lab-out stays out of the repo
//   summary.txt        the whole-song numbers of every song in this run, side by side
import { closeSync, openSync, readSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const F = 12, W = 320, H = 180;       // fps and size it's measured at: the judge's `edges` are counted at this size, and STUDY.md's speeds are quoted on a frame 320 wide
const VIS = 1.5;                      // a moment "shows" if the picture changes this many times faster within .25 s of it than it typically does in the 16 s around it
const EXACT = 0.12;                   // seconds: closer than this is on it

// ---------------------------------------------------------------- in the page: walk the film
export const collect = async ({ F, W, H }) => {
  const here = u => new URL(u, location.href).href;
  const [{ getRig, shot }, { fineness, fillSlot }, { OFF, SLOT_FLOATS }, { reactAt }, { chordName }, { lookOf }] = await Promise.all(
    ['src/music/rehearse.js', 'src/score/slot.js', 'src/pattern/layout.js', 'src/score/react.js', 'src/music/understand.js', 'src/score/compose.js'].map(u => import(here(u))));
  const R = await getRig(), S = app.song.score, A = app.song.analysis, RR = S.react, M = RR.M, g = S.gestures;
  const time = S.time ?? (t => t), dur = A.duration, N = Math.floor(dur * F), aspect = W / H;
  const tmp = new Float32Array(SLOT_FLOATS), n3 = v => Math.round(v * 1000) / 1000;
  const at = (arr, t) => (arr ? arr[Math.max(0, Math.min(arr.length - 1, Math.round(t * A.fps)))] ?? 0 : 0);
  // Film seconds back to song seconds. The film's clock lags behind a rest, so a landing at the film's time(a) happens at the song's a.
  const songAt = tau => { let lo = 0, hi = dur + 2; if (time(hi) < tau) return tau; for (let i = 0; i < 44; i++) { const m = (lo + hi) / 2; if (time(m) < tau) lo = m; else hi = m; } return hi; };
  const easeOut = (t, t0, stop) => (t <= t0 ? t : t0 + stop * (x => x - x * x / 2)(Math.min(1, (t - t0) / stop)));
  const easeIn = (t, t1, stop) => (t >= t1 ? t : t1 - stop * (x => x - x * x / 2)(Math.min(1, (t1 - t) / stop)));
  const stopOf = G => Math.min(G.morph * 0.4, 3.5);
  const idx = new Map(g.map((G, i) => [G, i]));

  // The pattern's own flow, in frame widths per second: how fast its clock runs, times how far one cycle moves an edge at this size. Clean of the song and the transformation. What a drive does for itself isn't in here; the measured edge speed has it.
  const flowOf = (X, clk, tau) => {
    const t = clk(tau), dphi = (S.phi(clk(tau + 0.125), X) - S.phi(clk(tau - 0.125), X)) / 0.25;
    fillSlot(tmp, X, t, X.pattern, { phi: S.phi(t, X) });
    const flow = X.flow || X.pattern.flow, sc = Math.max(tmp[OFF.scale], 1e-4), fr = Math.max(tmp[OFF.freq], 1e-3);
    let v = 0;
    if (flow) for (const key in flow) {
      const m = /^f(\d)\.ph$/.exec(key);
      if (!m || tmp[OFF[`f${m[1]}.on`]] < 0.5 || Math.abs(tmp[OFF[`f${m[1]}.d`]]) > 0.98) continue;
      const q = n => Math.abs(tmp[OFF[`f${m[1]}.${n}`]]);
      const k = Math.hypot(q('x'), q('y')) + q('r1') + q('r2') + (q('l1') + q('l2')) / 0.7 + (q('t1') + q('t2')) / 4;
      if (k > 0) v = Math.max(v, Math.abs(flow[key]) * Math.abs(dphi) * sc / (k * fr) / (2 * aspect));
    }
    return { flow: v, fine: fineness(tmp) };
  };

  // What the long move does between two film times, on the gesture's own clock (it comes to rest in its transformation). Only what really changes.
  const VIEW = ['scale', 'freq', 'rot', 'cam.pitch', 'cam.yaw', 'cam.roll', 'cam.dist', 'surf.spin'], RATIO = new Set(['scale', 'freq', 'cam.dist']);
  const sweep = (G, a, b) => {
    const paths = [...new Set([...VIEW, ...(G.arcs || G.pattern.arcs || []).map(x => x.path)])].filter(p => OFF[p] !== undefined), got = paths.map(() => []);
    for (let k = 0; k <= 6; k++) {
      const t = a + (b - a) * k / 6, tt = G.morph ? easeOut(t, G.t1 - G.morph, stopOf(G)) : t;
      fillSlot(tmp, G, tt, G.pattern, { phi: S.phi(tt, G) });
      paths.forEach((p, i) => got[i].push(tmp[OFF[p]]));
    }
    return paths.map((p, i) => [p, n3(got[i][0]), n3(got[i][6]), n3(Math.min(...got[i])), n3(Math.max(...got[i]))]).filter(([p, , , lo, hi]) => (RATIO.has(p) && lo > 0 ? hi / lo > 1.02 : hi - lo > 0.02));
  };

  // Optical flow along the centre row and column, which is how STUDY.md measured the reference: windows matched against the same line a quarter of a second ago, the median shift, in px/s on a frame 320 wide. Smallest shift wins a tie, so a repeating pattern can't alias far.
  const shifts = (a, b, into) => {
    for (let w = 0; w + 32 <= a.length; w += 32) {
      let lo = 255, hi = 0;
      for (let k = 0; k < 32; k++) { lo = Math.min(lo, a[w + k]); hi = Math.max(hi, a[w + k]); }
      if (hi - lo < 64) continue;       // nothing to read in a flat stretch
      let best = Infinity, at = 0;
      for (let q = -24; q <= 24; q++) {
        if (w + q < 0 || w + q + 32 > b.length) continue;
        let sad = 0.1 * Math.abs(q);
        for (let k = 0; k < 32; k++) sad += Math.abs(a[w + k] - b[w + q + k]) / 255;
        if (sad < best) { best = sad; at = q; }
      }
      into.push(Math.abs(at));
    }
  };
  const lineRow = [], lineCol = [];
  const s = { of: [], kind: [], x: [], hand: [], gi: [], diff: [], flips: [], white: [], nx: [], ny: [], E: [], perc: [], voiced: [], pitch: [], tone: [], tension: [], amb: [], flow: [], fine: [] };
  const px = new Uint8Array(W * H * 4), prev = new Uint8Array(W * H);
  const rows = Array.from({ length: 9 }, (_, j) => Math.floor((j + 0.5) * H / 9)), cols = Array.from({ length: 9 }, (_, j) => Math.floor((j + 0.5) * W / 9));
  let last = { flow: 0, fine: 0 };
  for (let i = 0; i <= N; i++) {
    const t = i / F, tau = time(t), f = shot(R, S, t, W, H, px), h = S.handover;
    let white = 0, dsum = 0, flips = 0;
    for (let k = 0; k < W * H; k++) { const v = px[k * 4 + 1], p = prev[k]; if (v > 127) white++; dsum += Math.abs(v - p); if ((v > 127) !== (p > 127)) flips++; prev[k] = v; }
    let nx = 0, ny = 0;
    for (const y of rows) for (let x = 1; x < W; x++) if ((px[(y * W + x) * 4 + 1] > 127) !== (px[(y * W + x - 1) * 4 + 1] > 127)) nx++;
    for (const x of cols) for (let y = 1; y < H; y++) if ((px[(y * W + x) * 4 + 1] > 127) !== (px[((y - 1) * W + x) * 4 + 1] > 127)) ny++;
    const row = new Uint8Array(W), col = new Uint8Array(H), got = [];
    for (let k = 0; k < W; k++) row[k] = px[((H >> 1) * W + k) * 4 + 1];
    for (let k = 0; k < H; k++) col[k] = px[(k * W + (W >> 1)) * 4 + 1];
    lineRow.push(row); lineCol.push(col);
    if (lineRow.length > 4) { lineRow.shift(); lineCol.shift(); }
    if (lineRow.length === 4) { shifts(row, lineRow[0], got); shifts(col, lineCol[0], got); }
    got.sort((u, v) => u - v);
    s.of.push(got.length ? got[got.length >> 1] * 4 : null);
    const hand = !!(h && f.from === h.G);
    let x = 0;
    if (f.kind) x = hand ? (t - h.t0) / (h.t1 - h.t0) : (tau - (f.from.t1 - f.from.morph)) / f.from.morph;
    if (i % 3 === 0) {
      if (f.kind && f.T < 0.5 && !hand) last = flowOf(f.from, u => easeOut(u, f.from.t1 - f.from.morph, stopOf(f.from)), tau);
      else if (f.kind && !hand) last = flowOf(f.N, u => easeIn(u, f.from.t1, stopOf(f.from)), tau);
      else last = flowOf(f.G, u => u, tau);
    }
    const r = reactAt(RR, RR.C ? RR.C(t) : t);
    s.kind.push(f.kind ?? 0); s.x.push(n3(x)); s.hand.push(hand ? 1 : 0); s.gi.push(idx.get(f.G) ?? -1);
    s.diff.push(i ? n3(dsum / (W * H)) : 0); s.flips.push(i ? +(flips / (W * H)).toFixed(5) : 0); s.white.push(n3(white / (W * H))); s.nx.push(n3(nx / rows.length)); s.ny.push(n3(ny / cols.length));
    s.E.push(n3(at(A.E, t))); s.perc.push(n3(at(A.perc, t))); s.voiced.push(n3(at(A.voiced, t))); s.pitch.push(n3(at(A.pitch, t)));
    s.tone.push(n3(r.tone)); s.tension.push(n3(r.tension)); s.amb.push(n3(S.ambient?.(tau) ?? 1));
    s.flow.push(+last.flow.toFixed(4)); s.fine.push(n3(last.fine));
    if (i % 48 === 0) await new Promise(res => setTimeout(res));
  }

  const marks = M.breath.t.length ? M.breath.t.filter(t => t < dur) : Array.from(A.bars).filter((_, i) => i % 4 === 0);
  const bounds = [0, ...marks.filter(t => t > 0.25), dur];
  const phrases = bounds.slice(0, -1).map((a, i) => {
    const b = bounds[i + 1], ta = time(a), tb = time(b);
    return { a, b, sweeps: g.map((G, gi) => [G, gi]).filter(([G]) => G.t0 < tb && G.t1 > ta).map(([G, gi]) => ({ gi, paths: sweep(G, Math.max(G.t0, ta), Math.min(G.t1, tb)) })) };
  });
  const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const rh = app.song.rehearsal;
  // Bar means of what docs/DIRECTION.md section 5 listens to, for the jumps and the ride in tests/judge.mjs. Numbers from the analysis, in a file that stays in lab-out.
  const barList = Array.from(A.bars), per = {};
  for (const k of ['loud', 'bright', 'bass', 'perc', 'voiced']) per[k] = barList.map((t, i) => {
    const a = Math.round(t * A.fps), b = Math.round((barList[i + 1] ?? t + M.bar) * A.fps); let v = 0, c = 0;
    for (let f = Math.max(0, a); f < b && f < (A[k]?.length ?? 0); f++) { v += A[k][f]; c++; }
    return c ? +(v / c).toFixed(5) : 0;
  });
  const directing = await import(here('src/score/flags.js')).then(m => m.directing ?? null);
  return JSON.stringify({
    dur, bpm: A.bpm, meter: A.meter, keyOwn: NAMES[A.key] + (A.minor ? 'm' : ''), home: M.home.name, homeC: M.home.c, keySig: NAMES[M.key], beat: M.beat, bar: M.bar, climax: A.climax,
    character: A.character, swell: A.swellRegularity, phraseBars: A.phraseBars,
    breath: { beats: M.breath.beats, seconds: M.breath.seconds, bars: M.breath.bars, bar0: M.breath.bar0, loop: M.breath.loop, loopSeconds: M.breath.loopSeconds, t: M.breath.t, depth: M.lungs.map(l => l.depth) },
    choices: (S.heard ?? RR).choices, pulses: (S.heard ?? RR).pulses, bars: Array.from(A.bars), beats: Array.from(A.beats),
    segments: A.segments.map(x => ({ t0: x.t0, t1: x.t1, label: x.label, visit: x.visit || 0, rot: x.rot || 0 })),
    arrivals: M.arrivals(0.3).map(p => ({ bar: p.bar, t: p.t, a: p.a, s: p.s })), arrival: Array.from(M.arrival), rests: M.rests, windows: time.windows ?? [],
    runs: M.runs.map(r => ({ t0: r.t0, t1: r.t1, c: r.c, name: chordName(r.c) })), conductor: M.conductor.map(c => ({ t: c.t, lead: c.lead, second: c.second, margin: c.margin })),
    family: S.family, stats: S.stats, seed: S.seed, sitOut: rh?.sitOut ?? [], rehearsal: rh?.seconds, handoverFrom: S.handover?.G?.pattern?.id ?? null,
    cast: (S.cast ?? []).map(h => ({ ...h, sAt: songAt(h.at), s0: songAt(h.t0), s1: songAt(h.t1) })), samples: s,
    per, directing, sheet: S.sheet ?? null, refused: S.refused ?? null,
    gestures: g.map((G, i) => ({
      i, t0: G.t0, t1: G.t1, s0: songAt(G.t0), s1: songAt(G.t1), sm: G.morph ? songAt(G.t1 - G.morph) : null, hitS: G.peak ? songAt(G.peak.hit) : null, id: G.pattern.id, fam: G.pattern.family, look: lookOf(G.pattern), drive: !!G.pattern.drive, morph: G.morph || 0,
      kindIn: G.kindIn ?? null, kindOut: G.kindOut ?? null, label: G.label ?? null, visit: G.visit ?? 0, replayOf: G.replayOf ?? null, change: G.change ?? null, hero: G.hero ?? null, moves: (G.moves ?? []).map(m => m.id), xform: G.xform?.id ?? null,
      into: G.plan ? (G.plan.fall ? 'fall' : G.plan.kind) : G.xform?.id ?? null, rise: G.rise ?? null, range: G.range ?? null, gears: G.gears ?? [], noGlide: !!G.noGlide, calm: G.calm ?? null, phiScale: G.phiScale ?? null, ride: i < g.length - 1 ? sweep(G, G.t0, G.t1) : [],
    })),
    phrases,
  });
};

// The contact sheet: drawn large by the same eyes, then shrunk the way a screen would.
const contact = async ({ title, items, cols, tw, th, cap }) => {
  const { getRig, shot } = await import(new URL('src/music/rehearse.js', location.href).href);
  const R = await getRig(), S = app.song.score, W2 = 640, H2 = 360, big = new Uint8Array(W2 * H2 * 4), tmp = new OffscreenCanvas(W2, H2), tg = tmp.getContext('2d');
  const top = 30, rows = Math.ceil(items.length / cols), c = document.createElement('canvas');
  c.width = cols * tw; c.height = top + rows * (th + cap);
  const g = c.getContext('2d');
  g.fillStyle = '#161616'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff'; g.font = 'bold 16px monospace'; g.fillText(title, 6, 20);
  for (let i = 0; i < items.length; i++) {
    const it = items[i], x = (i % cols) * tw, y = top + Math.floor(i / cols) * (th + cap);
    shot(R, S, it.t, W2, H2, big);
    const d = tg.createImageData(W2, H2);
    for (let r = 0; r < H2; r++) d.data.set(big.subarray((H2 - 1 - r) * W2 * 4, (H2 - r) * W2 * 4), r * W2 * 4);
    tg.putImageData(d, 0, 0);
    g.imageSmoothingQuality = 'high';
    g.drawImage(tmp, x + 1, y + cap, tw - 2, th - 2);
    g.fillStyle = it.boundary ? '#ffd23c' : '#e8e8e8'; g.font = 'bold 13px monospace'; g.fillText(it.line1, x + 4, y + 14);
    g.fillStyle = it.moving ? '#7dff9b' : '#9cc4ff'; g.font = '12px monospace'; g.fillText(it.line2, x + 4, y + 30);
    if (i % 8 === 0) await new Promise(res => setTimeout(res));
  }
  return c.toDataURL('image/jpeg', 0.85);
};

// ---------------------------------------------------------------- reading the mp3's own name for itself: title and artist, nothing else
function tagsOf(song) {
  const file = join(ROOT, 'media', `${song}.mp3`);
  const fromName = () => {
    try { const m = /^(.+?) - (.+)\.\w+$/.exec(basename(realpathSync(file))); return m ? { artist: m[1], title: m[2], from: 'file name' } : { title: song, artist: null, from: 'file name' }; }
    catch { return { title: song, artist: null, from: 'nothing' }; }
  };
  try {
    const fd = openSync(file, 'r'), b = Buffer.alloc(1 << 18), got = readSync(fd, b, 0, b.length, 0);
    closeSync(fd);
    if (got < 10 || b.toString('latin1', 0, 3) !== 'ID3') return fromName();
    const v = b[3], safe = o => (b[o] << 21) | (b[o + 1] << 14) | (b[o + 2] << 7) | b[o + 3];
    let pos = 10;
    const end = Math.min(10 + safe(6), got), out = {};
    if (b[5] & 0x40) pos += v === 4 ? safe(10) : b.readUInt32BE(10) + 4;
    const text = (o, n) => {
      const e = b[o], raw = b.subarray(o + 1, o + n);
      const be = x => Buffer.from(x.subarray(0, x.length & ~1)).swap16().toString('utf16le');
      const s = e === 0 ? raw.toString('latin1') : e === 3 ? raw.toString('utf8') : e === 1 && raw[0] !== 0xfe ? raw.toString('utf16le') : be(raw);
      return s.replace(/^﻿/, '').replace(/\0.*$/s, '').trim();
    };
    while (pos + 10 < end) {
      const small = v === 2, id = b.toString('latin1', pos, pos + (small ? 3 : 4));
      if (!/^[A-Z0-9]+$/.test(id)) break;
      const n = small ? (b[pos + 3] << 16) | (b[pos + 4] << 8) | b[pos + 5] : v === 4 ? safe(pos + 4) : b.readUInt32BE(pos + 4), body = pos + (small ? 6 : 10);
      if (n <= 0 || body + n > got) break;
      if (id === 'TIT2' || id === 'TT2') out.title = text(body, n);
      if (id === 'TPE1' || id === 'TP1') out.artist = text(body, n);
      pos = body + n;
    }
    // Uploads carry the channel as the artist, and the real one in the title
    const both = /^(.+?) - (.+)$/.exec(out.title ?? '');
    if (both) { out.artist = both[1]; out.title = both[2]; }
    return out.title ? { ...out, from: 'ID3' } : fromName();
  } catch { return fromName(); }
}

// ---------------------------------------------------------------- numbers
export const meanOf = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
export const pctOf = (a, p) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };
export const medOf = a => pctOf(a, 0.5);
export const pearson = (x, y) => {
  const px = [], py = [];
  x.forEach((v, i) => { if (Number.isFinite(v) && Number.isFinite(y[i])) { px.push(v); py.push(y[i]); } });
  if (px.length < 3) return NaN;
  const mx = meanOf(px), my = meanOf(py);
  let a = 0, b = 0, c = 0;
  px.forEach((v, i) => { a += (v - mx) * (py[i] - my); b += (v - mx) ** 2; c += (py[i] - my) ** 2; });
  return b && c ? a / Math.sqrt(b * c) : NaN;
};
export const nearest = (list, t) => { let best = null; for (const v of list) if (best === null || Math.abs(t - v) < Math.abs(t - best)) best = v; return best === null ? null : { v: best, d: t - best }; };
const pad = (v, n) => String(v).padStart(n), rpad = (v, n) => String(v).padEnd(n);
const fx = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '-');
const sign = (v, d = 2) => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(d) : '-');
const dot = v => (Number.isFinite(v) ? v.toFixed(2).replace(/^(-?)0\./, '$1.') : '-');
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const num = v => { const a = Math.abs(v); return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : dot(v); };
const sweepText = paths => paths.map(([p, a, b, lo, hi]) => {
  const back = Math.max(hi - Math.max(a, b), Math.min(a, b) - lo);
  const times = (p === 'scale' || p === 'freq' || p === 'cam.dist') && a > 0 && b > 0 ? ` x${(b / a).toFixed(2)}` : '';
  return back > 0.25 * (hi - lo) ? `${p} ${num(a)}>${num(b)} via ${num(lo)}..${num(hi)}` : `${p} ${num(a)}>${num(b)}${times}`;
}).join(', ');

// ---------------------------------------------------------------- the measures, shared with tests/judge.mjs (STAGE=direction). All pure, over what collect returned.
export { F as WALK_FPS, VIS, EXACT };
export const WALK_SIZE = { F, W, H };

export function measures(d) {
  const s = d.samples, n = s.diff.length;
  const range = (a, b) => { const r = []; for (let i = Math.ceil(a * F); i < Math.min(n, Math.ceil(b * F)); i++) if (i >= 0) r.push(i); return r; };
  const avg = (key, a, b) => meanOf(range(a, b).map(i => s[key][i]));
  // Edge speed from the picture itself: how many pixels flip per second, over how much edge there is per pixel. Stripes of period P moving at v flip 2v/P of the frame a second and have 2/P of edge per pixel, so this gives v. In % of the frame's width per second, as in STUDY.md (the reference: 5 to 10).
  const edge = s.flips.map((f, i) => { const e = s.nx[i] / W + s.ny[i] / H; return e * W > 0.5 ? f * F / e / W * 100 : NaN; });
  // Does a moment show? The picture's rate of change, around it, against what's usual nearby
  const diff3 = s.diff.map((_, i) => (s.diff[Math.max(0, i - 1)] + s.diff[i] + s.diff[Math.min(n - 1, i + 1)]) / 3);
  const shows = t => {
    const near = range(t - 0.25, t + 0.25).map(i => diff3[i]), base = [...range(t - 8, t - 1), ...range(t + 1, t + 8)].map(i => s.diff[i]);
    return (near.length ? Math.max(...near) : 0) / Math.max(medOf(base), 0.2);
  };
  // Where the eye sees a transformation: its fastest moment, against where it's meant to hit.
  const peakOf = (sm, end, hit) => {
    const r = range(sm, end + 0.25);
    if (!r.length) return null;
    let top = r[0]; for (const i of r) if (diff3[i] > diff3[top]) top = i;
    const body = range(sm - 8, sm).map(i => s.diff[i]);
    return { peakAt: top / F, peakOff: top / F - hit, peakBar: nearest(d.bars, top / F)?.d, peakX: diff3[top] / Math.max(medOf(body), 0.2) };
  };
  return { n, range, avg, edge, diff3, shows, peakOf };
}

// The structural changes: a pattern landing, where its transformation means it to hit, and the big moves that hit inside a gesture.
export function changesOf(d) {
  const g = d.gestures, real = g.slice(0, -1);
  const castOf = (G, kind) => d.cast.find(h => h.kind === kind && Math.abs(h.t1 - G.t1) < 0.06);
  const changes = real.slice(0, -1).map(G => {
    const N = g[G.i + 1], hero = G.xform === 'shock' || G.xform === 'iris' ? castOf(G, G.xform) : null;
    return { s: G.hitS ?? (hero ? hero.sAt : G.s1), end: G.s1, sm: G.sm, type: G.into ?? '?', from: G.id, to: N.id, D: G.morph, G };
  });
  for (const h of d.cast) {
    if (!['countdown', 'coin', 'lock'].includes(h.kind)) continue;
    const t = h.kind === 'lock' ? h.s1 : h.sAt, on = changes.find(c => Math.abs(c.s - t) < 0.3);
    if (on) on.type += `+${h.kind}`;
    else changes.push({ s: t, end: t, sm: null, type: `hit:${h.kind}`, from: h.id, to: h.id, D: 0, G: null });
  }
  changes.sort((a, b) => a.s - b.s);
  return changes;
}

// The same bar-line control report() prints: how often any bar line away from the ends shows.
export const barLinesShow = (d, shows) => meanOf(d.bars.filter(t => t > 8 && t < d.dur - 8).map(t => (shows(t) >= VIS ? 1 : 0)));

// What docs/DIRECTION.md section 5 hears, from the bar means collect saves, for rows that must not take the sheet's word for what matters. Lane B1's src/music/phrasing.js is the same formula; once it lands, it should replace these two.
const sdOf = a => { const m = meanOf(a); return Math.sqrt(meanOf(a.map(v => (v - m) ** 2))) || 1; };
export function jumpsOf(d) {
  const { per, bars, bar, dur } = d, N = bars.length, WEIGHT = { loud: 1, bright: 0.5, bass: 0.7, perc: 0.5, voiced: 0.3 };
  const span = (a, i, j) => meanOf(a.slice(Math.max(0, i), Math.max(0, j)));
  const J = {};
  for (const k in WEIGHT) { const v = bars.map((_, i) => span(per[k], i, i + 2) - span(per[k], i - 2, i)), sd = sdOf(v); J[k] = v.map(x => x / sd); }
  const score = bars.map((t, i) => {
    let up = 0, dn = 0;
    for (const k in WEIGHT) { up += WEIGHT[k] * Math.max(0, J[k][i]); dn += (k === 'bright' ? 0.4 : WEIGHT[k]) * Math.max(0, -J[k][i]); }
    return { i, t, s: Math.max(up, dn), sign: up >= dn ? 1 : -1 };
  });
  const peaks = score.filter(x => x.t > 4 * bar && x.t < dur - 4).filter(x => { for (let k = -4; k <= 4; k++) if (k && score[x.i + k]?.s > x.s) return false; return true; });
  // A rise goes to the section start or arrival nearest it within 2 bars, a fall to the biggest single-bar drop within 2 bars.
  const marks = [...d.segments.slice(1).map(x => x.t0), ...d.arrivals.map(x => x.t)];
  const refined = peaks.map(x => {
    if (x.sign < 0) {
      let best = x.i, drop = 0;
      for (let k = Math.max(1, x.i - 2); k <= Math.min(N - 1, x.i + 2); k++) { const v = per.loud[k - 1] - per.loud[k]; if (v > drop) { drop = v; best = k; } }
      return { ...x, i0: x.i, i: best, t: bars[best] };
    }
    const m = nearest(marks, x.t);
    if (!m || Math.abs(m.d) > 2 * bar + 1e-3) return { ...x, i0: x.i };
    const at = bars.reduce((b, t, i) => (Math.abs(t - m.v) < Math.abs(bars[b] - m.v) ? i : b), 0);
    return { ...x, i0: x.i, i: at, t: m.v };
  }).sort((a, b) => b.s - a.s);
  return { score, peaks: refined };
}
// The level, 0 whisper to 4 peak, of each bar.
export function rideOf(d, jumps = jumpsOf(d)) {
  const { per, bars } = d, N = bars.length, z = a => { const m = meanOf(a), sd = sdOf(a); return a.map(v => (v - m) / sd); };
  const lz = z(per.loud), bz = z(per.bright), pz = z(per.perc);
  const h0 = bars.map((_, i) => lz[i] + 0.5 * bz[i] * Math.min(1, Math.max(0, per.loud[i] / 0.4)) + 0.4 * pz[i]);
  const heat = bars.map((_, i) => meanOf(h0.slice(Math.max(0, i - 1), Math.min(N, i + 3))));
  const qs = [0.15, 0.4, 0.7, 0.9].map(q => { const v = [...heat].sort((a, b) => a - b); return v[Math.floor((v.length - 1) * q)]; });
  const lv = heat.map(h => qs.filter(q => h >= q).length);
  const runs = () => { const r = []; let a = 0; for (let i = 1; i <= N; i++) if (i === N || lv[i] !== lv[a]) { r.push({ a, b: i, l: lv[a] }); a = i; } return r; };
  // Runs under 4 bars join their nearest neighbour; then each edge goes to a jump within 4 bars, because the mean runs late.
  for (let pass = 0; pass < 4; pass++) { const r = runs(); r.forEach((x, i) => { if (x.b - x.a >= 4) return; const L = r[i - 1], R = r[i + 1], to = !L ? R : !R ? L : Math.abs(L.l - x.l) <= Math.abs(R.l - x.l) ? L : R; if (to) for (let k = x.a; k < x.b; k++) lv[k] = to.l; }); }
  const big = jumps.peaks.filter(p => p.s >= 2.5).map(p => p.i0), r = runs();
  for (let i = 1; i < r.length; i++) {
    const e = r[i].a, m = nearest(big, e);
    if (!m || Math.abs(m.d) > 4 || m.d === 0) continue;
    for (let k = Math.min(e, m.v); k < Math.max(e, m.v); k++) lv[k] = m.v < e ? r[i].l : r[i - 1].l;
  }
  return lv;
}

export function report(song, d, tags) {
  const s = d.samples, n = s.diff.length, beat = d.beat, bar = d.bar, dur = d.dur, out = [], p = (x = '') => out.push(x);
  const g = d.gestures, real = g.slice(0, -1), iOf = t => Math.max(0, Math.min(n - 1, Math.round(t * F)));
  const { range, avg, edge, diff3, shows, peakOf } = measures(d);
  const eOf = (a, b) => avg('E', a, b);
  const secName = x => `${x.label}${x.visit + 1}`, sectionAt = t => d.segments.find(x => t >= x.t0 && t < x.t1) ?? d.segments.at(-1);
  const lines = s.nx.map((v, i) => v + s.ny[i]);
  const barAt = t => { let k = 0; for (let i = 0; i < d.bars.length; i++) { if (d.bars[i] <= t + 1e-3) k = i; else break; } return k; };

  // ---- what the music has at each moment
  const sectionStarts = d.segments.slice(1).map(x => x.t0), restEdges = d.rests.flatMap(r => [r.a, r.b]), arrT = d.arrivals.map(x => x.t);
  const homes = d.runs.filter(r => r.c === d.homeC && r.t1 - r.t0 >= 1.2).map(r => r.t0);
  const fallAt = d.bars.map(t => (t > 4 * bar && t < dur - 4 * bar ? eOf(t - 4 * bar, t) - eOf(t, t + 4 * bar) : 0));
  const falls = d.bars.map((t, i) => ({ t, v: fallAt[i], i })).filter(x => x.v >= 0.08 && x.v >= (fallAt[x.i - 1] ?? 0) && x.v >= (fallAt[x.i - 2] ?? 0) && x.v > (fallAt[x.i + 1] ?? 0) && x.v > (fallAt[x.i + 2] ?? 0));

  // ---- the structural changes
  const changes = changesOf(d);
  const changeT = changes.map(c => c.s);

  // ---- does a moment show? As a profile: how fast the picture changes in the 2 s before a moment, on it and in the 2 s after, against that same typical rate. Whether it surges into the moment, or after, or not at all.
  const profile = t => {
    const base = Math.max(medOf([...range(t - 8, t - 1), ...range(t + 1, t + 8)].map(i => s.diff[i])), 0.2);
    return [[-2, -1], [-1, -0.25], [-0.25, 0.25], [0.25, 1], [1, 2]].map(([a, b]) => fx(meanOf(range(t + a, t + b).map(i => s.diff[i])) / base, 1)).join(' ');
  };
  // ...and what's going on at it
  const stateAt = t => { const i = iOf(t), G = g[s.gi[i]]; return s.kind[i] ? `${G?.into ?? s.kind[i]} ${Math.round(s.x[i] * 100)}%` : `holding ${G?.id ?? '?'}`; };
  const onBars = d.bars.filter(t => t > 8 && t < dur - 8);
  const chanceShow = barLinesShow(d, shows), chanceBeat = meanOf(onBars.map(t => (Math.abs(nearest(changeT, t)?.d ?? 99) <= beat ? 1 : 0)));

  // ---- where a change lands
  const strongNear = t => {
    const why = [];
    const within = (list, lim) => { const k = nearest(list, t); return k && Math.abs(k.d) <= lim; };
    if (within(sectionStarts, beat)) why.push('section');
    if (within(arrT, beat)) why.push('arrival');
    if (within(restEdges, beat)) why.push('rest');
    if (Math.abs(t - d.climax) <= bar) why.push('climax');
    if (within(falls.map(x => x.t), beat)) why.push('fall');
    return why;
  };
  const tierOf = t => {
    const why = strongNear(t);
    if (why.length) return { tier: 'strong', why };
    const inBreath = Math.abs(nearest(d.breath.t, t)?.d ?? 99) <= EXACT, home = Math.abs(nearest(homes, t)?.d ?? 99) <= beat;
    if (inBreath || home) return { tier: 'phrase', why: [inBreath && 'breath', home && 'home chord'].filter(Boolean) };
    return Math.abs(nearest(d.bars, t)?.d ?? 99) <= EXACT ? { tier: 'bar', why: ['bar line only'] } : { tier: 'off', why: [Math.abs(nearest(d.beats, t)?.d ?? 99) <= EXACT ? 'a beat only' : 'off the grid'] };
  };
  for (const c of changes) {
    c.dBar = nearest(d.bars, c.s)?.d; c.dBeat = nearest(d.beats, c.s)?.d; c.dBreath = nearest(d.breath.t, c.s)?.d;
    const na = nearest(arrT, c.s); c.dArr = na?.d; c.arrA = na ? d.arrivals.find(x => x.t === na.v)?.a : null;
    c.dSec = nearest(sectionStarts, c.s)?.d; c.dRest = nearest(restEdges, c.s)?.d;
    Object.assign(c, tierOf(c.s));
    c.show = shows(c.s);
    // Where the eye sees it: the fastest moment of the transformation, against where it's meant to land. A move that eases to rest on its beat is doing almost nothing on that beat.
    if (c.sm != null) Object.assign(c, peakOf(c.sm, c.end, c.s));
  }
  const allTiers = onBars.map(t => tierOf(t).tier), chanceStrong = meanOf(allTiers.map(x => (x === 'strong' ? 1 : 0))), chancePhrase = meanOf(allTiers.map(x => (x === 'phrase' ? 1 : 0)));

  // ---- the header
  p(`${song.toUpperCase()}: ${tags.artist ? tags.artist + ' - ' : ''}${tags.title}   (from ${tags.from}; /media/${song}.mp3)`);
  p(`duration ${mmss(dur)} (${dur.toFixed(1)} s)   tempo ${d.bpm.toFixed(1)} bpm   meter ${d.meter}   beat ${beat.toFixed(3)} s   bar ${bar.toFixed(2)} s, ${d.bars.length} bars`);
  p(`key: home ${d.home} (key signature of ${d.keySig}; the analysis's own guess, ${d.keyOwn})`);
  p(`breath: ${d.breath.seconds.toFixed(2)} s = ${d.breath.beats} beats = ${d.breath.bars} bars, first at ${fx(d.breath.t[0], 1)} s, ${d.breath.t.length} of them. Harmony's own loop ${d.breath.loop} beats (${fx(d.breath.loopSeconds, 1)} s)`);
  const pulseBy = new Map();
  for (const c of d.choices) if (!pulseBy.has(c.label)) pulseBy.set(c.label, c);
  p(`pulse rhythm (one rhythm of strong beats per kind of section, a swell on each): ${[...pulseBy.values()].map(c => `${c.label}: every ${c.every} beats from beat ${c.start + 1} (${(c.every * beat).toFixed(2)} s)`).join('; ')}. ${d.pulses.length} pulses`);
  p(`character: ${Object.entries(d.character ?? {}).map(([k, v]) => `${k} ${fx(v)}`).join(', ')}; swell regularity ${fx(d.swell)}`);
  p();
  p('sections (label + visit number: B2 is the second B)');
  p('  name    start     end    len   mean E  transposed');
  for (const x of d.segments) p(`  ${rpad(secName(x), 5)} ${pad(fx(x.t0, 1), 7)} ${pad(fx(x.t1, 1), 7)} ${pad(fx(x.t1 - x.t0, 1), 6)}   ${pad(dot(eOf(x.t0, x.t1)), 5)}   ${x.rot ? sign(x.rot, 0) + ' st' : ''}`);
  p();
  p(`arrivals, how much of somewhere the song gets to on a bar, 0..1, strongest first: ${d.arrivals.map(x => `${x.t.toFixed(1)} (bar ${x.bar + 1}, ${dot(x.a)})`).join('  ') || 'none'}`);
  p(`rests, the band stopping: ${d.rests.map(r => `${r.a.toFixed(2)}-${r.b.toFixed(2)} (${r.db} dB)`).join('  ') || 'none'}`);
  p(`falls, the song dropping away by .08 or more over 4 bars: ${falls.map(x => `${x.t.toFixed(1)} (${dot(x.v)})`).join('  ') || 'none'}`);
  p(`climax (the analysis's pick): ${d.climax.toFixed(1)} s`);
  p();
  p(`the film: seed ${d.seed}, named for family ${d.family}, ${real.length} gestures, arriving from the wander's ${d.handoverFrom ?? '?'}. Rehearsal ${fx(d.rehearsal, 1)} s, sat out: ${d.sitOut.join(', ') || 'nothing'}`);
  p(`cast: ${d.cast.map(h => `${h.kind}${h.mirror ? '(mirrored)' : ''} at ${h.at.toFixed(1)} on ${h.id} [${h.t0.toFixed(1)}..${h.t1.toFixed(1)}]`).join('; ') || 'nobody'}`);
  p(`composer's stats: ${JSON.stringify({ medianLen: d.stats.medianLen, minLen: d.stats.minLen, maxLen: d.stats.maxLen, kinds: d.stats.kinds, replays: d.stats.replays, boundaryLanded: d.stats.boundaryLanded, onBreath: d.stats.onBreath, arrivalsLanded: d.stats.arrivalsLanded, restsLanded: d.stats.restsLanded })}`);
  p();

  // ---- the rows
  p('================================ ONE ROW PER BREATH ================================');
  p('Times are the song\'s seconds. Bars count from 1. Left of the | is the music, right of it the picture.');
  p('  sec    section at the start, > if another starts inside the row');
  p('  E dE   mean analysis energy 0..1, and against the row before        tone  brightness, -1 dark .. 1 bright');
  p('  voi    share of the row with a voice or tune present                n/s   how active it is: notes per second while present (a move of a semitone or more, held for 1/6 s, is a note)');
  p('  drm    mean percussion                                              ten   how far the harmony is from home, 0 is home');
  p('  chords the chords that hold for 1.2 s or more, * is home             lead  who the conductor says is leading / second');
  p('  marks  ARR arrival (strength), SEC a section starts, REST the band stops, FALL the song drops');
  p('  flow   the pattern\'s own flow, % of frame width per second, worked out from its clock and its size. 0 if it has no flow of its own');
  p('  edge   how fast edges really move on screen, same units, measured from the picture, everything included. Pixels flipping over edge length, which gives the speed square to the edges');
  p('  fine   line fineness, cycles per picture unit (12 is the film\'s limit for bold)      lns  edges crossed across the frame, a row plus a column at 320x180 (the judge\'s limit: 130)');
  p('  wht    share of the frame that\'s white     amb  how much of the song\'s reaction the sheet takes: 1 all of it, .3 a hero has the floor');
  p('  xform  transformations under way in the row, with how far through they get; a land@ is the moment it finishes');
  p('  hero   what\'s on: countdown, coin, star, lock, snap, fall, shock, iris, and Riley patterns by name; ! is its moment, at that second');
  p('  pattern  id [family/look], > the next one; in () if it\'s only on its way in');
  p('  sweep  what the long move does to the view and the pattern\'s arcs in this row, start>end, x is a factor');
  p();
  p(`${pad('time', 6)} ${pad('bar', 4)} ${rpad('sec', 6)} ${pad('E', 4)} ${pad('dE', 5)} ${pad('tone', 5)} ${pad('voi', 4)} ${pad('n/s', 4)} ${pad('drm', 4)} ${pad('ten', 4)} ${rpad('chords', 16)} ${rpad('lead', 11)} ${rpad('marks', 24)}| ${pad('flow', 5)} ${pad('edge', 5)} ${pad('fine', 5)} ${pad('lns', 4)} ${pad('wht', 4)} ${pad('amb', 4)} ${rpad('xform', 22)} ${rpad('hero', 18)} ${rpad('pattern', 40)} sweep`);
  const rowStats = [];
  let prevE = null;
  for (const row of d.phrases) {
    const { a, b } = row, r = range(a, b);
    if (!r.length) continue;
    const E = eOf(a, b), voiced = r.filter(i => s.voiced[i] > 0.35), inside = d.segments.filter(x => x.t0 > a + 0.05 && x.t0 < b - 0.05);
    let notes = 0, held = null, gap = 0, away = 0;
    for (const i of r) {
      if (s.voiced[i] <= 0.35) { if (++gap > 3) held = null; continue; }
      gap = 0;
      if (held === null) { notes++; held = s.pitch[i]; away = 0; } else if (Math.abs(s.pitch[i] - held) >= 1) { if (++away >= 2) { notes++; held = s.pitch[i]; away = 0; } } else away = 0;
    }
    const act = voiced.length / F >= 0.5 ? notes / (voiced.length / F) : 0;
    const here = d.runs.filter(x => x.t0 < b && x.t1 > a && x.t1 - x.t0 >= 1.2);
    const names = (here.length ? here : d.runs.filter(x => x.t0 < b && x.t1 > a).sort((x, y) => (y.t1 - y.t0) - (x.t1 - x.t0)).slice(0, 1)).map(x => x.name + (x.c === d.homeC ? '*' : ''));
    const chords = names.filter((v, i) => v !== names[i - 1]);
    const lead = d.conductor.find(c => Math.abs(c.t - a) < 0.02);
    const marks = [
      ...d.arrivals.filter(x => x.t >= a && x.t < b).map(x => `ARR${dot(x.a)}@${x.t.toFixed(1)}`),
      ...d.segments.filter(x => x.t0 > 0 && x.t0 >= a - 0.05 && x.t0 < b - 0.05).map(x => `SEC ${secName(x)}@${x.t0.toFixed(1)}`),
      ...d.rests.filter(x => x.a < b && x.b > a).map(x => `REST${x.a.toFixed(1)}-${x.b.toFixed(1)}`), ...falls.filter(x => x.t >= a && x.t < b).map(x => `FALL@${x.t.toFixed(1)}`),
    ];
    // the picture
    const flow = meanOf(r.map(i => s.flow[i])) * 100, ed = medOf(r.map(i => edge[i])), fine = medOf(r.map(i => s.fine[i])), lns = medOf(r.map(i => lines[i])), wht = meanOf(r.map(i => s.white[i])), amb = meanOf(r.map(i => s.amb[i]));
    const runs = [];
    for (const i of r) {
      if (!s.kind[i]) continue;
      const G = g[s.gi[i]], name = s.hand[i] ? `${s.kind[i]}(arriving)` : G?.into ?? s.kind[i], l = runs.at(-1);
      if (l && l.name === name && l.gi === s.gi[i]) l.x1 = s.x[i]; else runs.push({ name, gi: s.gi[i], x0: s.x[i], x1: s.x[i], hand: s.hand[i] });
    }
    const xf = runs.map(q => { const G = g[q.gi], landing = !q.hand && G && G.s1 >= a && G.s1 <= b + 0.05; return `${q.name} ${Math.round(q.x0 * 100)}-${Math.round(q.x1 * 100)}%${landing ? ` land@${G.s1.toFixed(1)}` : ''}`; }).join(', ') || '-';
    const heroes = d.cast.filter(h => h.s0 < b && h.s1 > a).map(h => { const when = h.kind === 'lock' ? h.s1 : h.sAt; return h.kind + (when >= a && when < b ? `!${when.toFixed(1)}` : ''); });
    const gis = [...new Set(r.map(i => s.gi[i]))].filter(i => i >= 0), last = r.at(-1);
    const ids = gis.map(i => `${g[i].id} [${g[i].fam}/${g[i].look}]`);
    if (s.kind[last] && g[s.gi[last] + 1]) ids.push(`(${g[s.gi[last] + 1].id})`);
    const sw = row.sweeps.filter(x => x.paths.length).map(x => (row.sweeps.length > 1 ? `${g[x.gi].id.split('.')[1] ?? g[x.gi].id}: ` : '') + sweepText(x.paths)).join('; ');
    const sec = secName(sectionAt(a)) + (inside.length ? '>' + secName(inside.at(-1)) : '');
    p(`${pad(a.toFixed(1), 6)} ${pad(barAt(a) + 1, 4)} ${rpad(sec, 6)} ${pad(dot(E), 4)} ${pad(prevE === null ? '-' : dot(E - prevE), 5)} ${pad(dot(meanOf(r.map(i => s.tone[i]))), 5)} ${pad(dot(voiced.length / r.length), 4)} ${pad(act.toFixed(1), 4)} ${pad(dot(meanOf(r.map(i => s.perc[i]))), 4)} ${pad(dot(meanOf(r.map(i => s.tension[i]))), 4)} ${rpad(chords.slice(0, 6).join(' ') + (chords.length > 6 ? ' +' + (chords.length - 6) : ''), 16)} ${rpad(lead ? `${lead.lead}/${lead.second}` : '-', 11)} ${rpad(marks.join(' '), 24)}| ${pad(flow.toFixed(1), 5)} ${pad(fx(ed, 1), 5)} ${pad(fine.toFixed(1), 5)} ${pad(lns.toFixed(0), 4)} ${pad(dot(wht), 4)} ${pad(dot(amb), 4)} ${rpad(xf, 22)} ${rpad(heroes.join(' ') || '-', 18)} ${rpad(ids.join(' > '), 40)} ${sw || '-'}`);
    prevE = E;
    const mid = (a + b) / 2;
    rowStats.push({ a, b, E, tone: meanOf(r.map(i => s.tone[i])), voice: voiced.length / r.length, act, drums: meanOf(r.map(i => s.perc[i])), ten: meanOf(r.map(i => s.tension[i])),
      rate: changeT.filter(t => Math.abs(t - mid) <= 15).length * 2, flow, edge: ed, fine: Math.log(Math.max(fine, 1e-3)), fineRaw: fine, lines: lns, xform: r.filter(i => s.kind[i]).length / r.length, full: b - a >= 0.5 * d.breath.seconds });
  }
  p();

  // ---- the gestures
  p('================================ EVERY GESTURE, AS A SHOT ================================');
  p('From, to and length in the song\'s seconds, then in bars and breaths. way: how the song moves at each end (rise, fall, level, break). into: the transformation out of it, and how long that takes. gears: beats a flow element takes to pass, as it shifts. ride: its whole long move.');
  p(`${pad('#', 3)} ${pad('from', 6)} ${pad('to', 6)} ${pad('len', 5)} ${pad('bars', 5)} ${pad('brth', 5)} ${rpad('sec', 4)} ${rpad('pattern', 40)} ${rpad('way', 12)} ${rpad('hero', 18)} ${rpad('into', 12)} ${pad('D', 4)}  ${rpad('gears', 9)} ride`);
  for (const G of real) {
    const len = G.s1 - G.s0, extra = [G.xform && G.xform !== G.into && `asked for ${G.xform}`, G.replayOf != null && `replays #${G.replayOf}${G.change ? ` (${G.change})` : ''}`, G.noGlide && 'no glide', G.phiScale != null && `clock x${fx(G.phiScale)}`, G.calm != null && `calmed ${fx(G.calm)}`].filter(Boolean).join(', ');
    p(`${pad(G.i, 3)} ${pad(G.s0.toFixed(1), 6)} ${pad(G.s1.toFixed(1), 6)} ${pad(len.toFixed(1), 5)} ${pad((len / bar).toFixed(1), 5)} ${pad((len / d.breath.seconds).toFixed(1), 5)} ${rpad(G.label ? G.label + (G.visit + 1) : '-', 4)} ${rpad(`${G.id} [${G.fam}/${G.look}]`, 40)} ${rpad(`${G.kindIn ?? '-'}>${G.kindOut ?? '-'}`, 12)} ${rpad([G.hero, ...G.moves].filter((v, i, x) => v && x.indexOf(v) === i).join('+') || '-', 18)} ${rpad(G.into ?? '-', 12)} ${pad(G.morph.toFixed(1), 4)}  ${rpad(G.gears.map(x => +(+x).toFixed(1)).join('>') || '-', 9)} ${sweepText(G.ride) || 'nothing moves'}${extra ? '   [' + extra + ']' : ''}`);
  }
  p();

  // ---- whole-song numbers
  p('================================ WHOLE-SONG NUMBERS ================================');
  p('A structural change is a pattern landing (at the moment its transformation is meant to hit: a shock or an iris hits before it finishes) or a Countdown locking, a Coin landing or a Lock closing inside a gesture. The film\'s very last landing into its tail isn\'t counted.');
  p();
  p('1. Each section');
  p(`  ${rpad('sec', 5)} ${pad('start', 6)} ${pad('len', 6)} ${pad('E', 4)} ${pad('tone', 5)} ${pad('voi', 4)} ${pad('drm', 4)} | ${pad('changes', 7)} ${pad('/min', 5)} ${pad('xform%', 6)} ${pad('edge', 5)} ${pad('flow', 5)} ${pad('fine', 5)} ${pad('lns', 4)} patterns and heroes`);
  const secStats = d.segments.map(x => {
    const r = range(x.t0, x.t1), c = changes.filter(q => q.s >= x.t0 && q.s < x.t1), len = x.t1 - x.t0;
    const heroes = [...new Set(d.cast.filter(h => h.sAt >= x.t0 && h.sAt < x.t1).map(h => h.kind))];
    const st = { name: secName(x), E: eOf(x.t0, x.t1), rate: c.length / len * 60, edge: medOf(r.map(i => edge[i])), flow: meanOf(r.map(i => s.flow[i])) * 100, fine: medOf(r.map(i => s.fine[i])), lines: medOf(r.map(i => lines[i])), xform: r.filter(i => s.kind[i]).length / Math.max(r.length, 1) };
    p(`  ${rpad(st.name, 5)} ${pad(x.t0.toFixed(1), 6)} ${pad(len.toFixed(1), 6)} ${pad(dot(st.E), 4)} ${pad(dot(meanOf(r.map(i => s.tone[i]))), 5)} ${pad(dot(r.filter(i => s.voiced[i] > 0.35).length / Math.max(r.length, 1)), 4)} ${pad(dot(meanOf(r.map(i => s.perc[i]))), 4)} | ${pad(c.length, 7)} ${pad(st.rate.toFixed(1), 5)} ${pad(Math.round(st.xform * 100), 6)} ${pad(fx(st.edge, 1), 5)} ${pad(st.flow.toFixed(1), 5)} ${pad(st.fine.toFixed(1), 5)} ${pad(st.lines.toFixed(0), 4)} ${[...new Set(real.filter(G => G.s0 < x.t1 && G.s1 > x.t0).map(G => G.id))].join(' ')}${heroes.length ? '  HERO ' + heroes.join(' ') : ''}`);
    return st;
  });
  const lenAll = real.at(-1).s1, perMin = changes.length / lenAll * 60, ks = {};
  p(`  whole film: ${changes.length} changes in ${lenAll.toFixed(0)} s, ${perMin.toFixed(2)} a minute, one every ${(lenAll / Math.max(changes.length, 1)).toFixed(1)} s (the reference: one about every 26 s). Fastest section ${Math.max(...secStats.map(x => x.rate)).toFixed(1)}/min, slowest ${Math.min(...secStats.map(x => x.rate)).toFixed(1)}/min.`);
  for (let i = 0; i < n; i++) if (s.kind[i]) { const G = g[s.gi[i]], k = s.hand[i] ? 'arriving' : G?.into ?? s.kind[i]; ks[k] = (ks[k] || 0) + 1 / F; }
  const movingShare = s.kind.filter(Boolean).length / n;
  p(`  time spent transforming: ${Math.round(movingShare * 100)}% of the song. ${Object.entries(ks).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v.toFixed(0)} s`).join(', ')}`);
  p(`  edge speed over the whole song, % of frame width per second: p10 ${fx(pctOf(edge, 0.1), 1)}, median ${fx(medOf(edge), 1)}, p90 ${fx(pctOf(edge, 0.9), 1)}, p99 ${fx(pctOf(edge, 0.99), 1)}`);
  p(`  optical flow on the centre row and column, STUDY.md's measure (the reference: 15 to 30 px/s on a frame 320 wide, 5 to 10% of it a second): p10 ${fx(pctOf(s.of, 0.1), 0)}, median ${fx(medOf(s.of), 0)}, p90 ${fx(pctOf(s.of, 0.9), 0)} px/s, median ${fx(medOf(s.of) / W * 100, 1)}% of the width a second`);
  p();

  p('2. Longest stretches');
  const stops = [0, ...changeT, lenAll];
  let gapA = 0, gapB = 0;
  for (let i = 1; i < stops.length; i++) if (stops[i] - stops[i - 1] > gapB - gapA) { gapA = stops[i - 1]; gapB = stops[i]; }
  let holdA = 0, holdB = 0, r0 = null;
  for (let i = 0; i <= n; i++) { if (i < n && !s.kind[i]) { if (r0 === null) r0 = i; } else if (r0 !== null) { if ((i - r0) / F > holdB - holdA) { holdA = r0 / F; holdB = i / F; } r0 = null; } }
  const longG = [...real].sort((x, y) => (y.s1 - y.s0) - (x.s1 - x.s0))[0];
  const longestGap = gapB - gapA;
  p(`  no structural change: ${longestGap.toFixed(1)} s, ${gapA.toFixed(1)} to ${gapB.toFixed(1)}, sections ${[...new Set(d.segments.filter(x => x.t0 < gapB && x.t1 > gapA).map(secName))].join(' ')}, mean E ${dot(eOf(gapA, gapB))} (song's mean ${dot(eOf(0, dur))}). In it: ${[...new Set(real.filter(G => G.s0 < gapB && G.s1 > gapA).map(G => G.id))].join(', ')}`);
  p(`  no transformation under way: ${(holdB - holdA).toFixed(1)} s, ${holdA.toFixed(1)} to ${holdB.toFixed(1)}, mean E ${dot(eOf(holdA, holdB))}`);
  p(`  one pattern on screen: ${(longG.s1 - longG.s0).toFixed(1)} s, ${longG.id}, ${longG.s0.toFixed(1)} to ${longG.s1.toFixed(1)}, mean E ${dot(eOf(longG.s0, longG.s1))}`);
  p();

  p('3. Does the picture follow the song? Pearson r over the breaths (rows of at least half a breath). Change rate is structural changes in the 30 s around each row, per minute. Fineness is on a log scale.');
  const full = rowStats.filter(x => x.full), series = { energy: x => x.E, tone: x => x.tone, voice: x => x.voice, 'tune activity': x => x.act, drums: x => x.drums, tension: x => x.ten };
  const picks = { 'change rate': x => x.rate, 'flow (its own)': x => x.flow, 'edge speed': x => x.edge, 'fineness': x => x.fine, 'lines crossed': x => x.lines, 'time transforming': x => x.xform };
  p(`  ${rpad('', 20)}${Object.keys(series).map(k => pad(k, 14)).join('')}`);
  const rE = {};
  for (const [name, f] of Object.entries(picks)) {
    rE[name] = pearson(full.map(x => x.E), full.map(f));
    p(`  ${rpad(name, 20)}${Object.values(series).map(m => pad(sign(pearson(full.map(m), full.map(f))), 14)).join('')}`);
  }
  p(`  (${full.length} breaths. Reference film: pattern density against loudness r = .04 to .39 per song, so it isn't about being high. It's whether the film does something different when the song does.)`);
  const byE = [...full].sort((x, y) => x.E - y.E), third = Math.max(1, Math.floor(byE.length / 3)), quiet = byE.slice(0, third), loud = byE.slice(-third);
  const pair = (name, f, d2 = 1) => p(`    ${rpad(name, 20)} ${pad(meanOf(quiet.map(f)).toFixed(d2), 7)}   ${pad(meanOf(loud.map(f)).toFixed(d2), 7)}`);
  p(`  the quietest third of the breaths (E ${dot(meanOf(quiet.map(x => x.E)))}) against the loudest third (E ${dot(meanOf(loud.map(x => x.E)))}):`);
  pair('change rate /min', x => x.rate); pair('edge speed', x => x.edge); pair('its own flow', x => x.flow); pair('fineness', x => x.fineRaw); pair('lines crossed', x => x.lines, 0); pair('time transforming', x => x.xform, 2);
  p(`  across sections (n = ${secStats.length}): energy against change rate r ${sign(pearson(secStats.map(x => x.E), secStats.map(x => x.rate)))}, edge speed ${sign(pearson(secStats.map(x => x.E), secStats.map(x => x.edge)))}, fineness ${sign(pearson(secStats.map(x => x.E), secStats.map(x => Math.log(x.fine))))}`);
  const onPulse = meanOf(d.pulses.flatMap(t => range(t - 0.17, t + 0.17).map(i => s.diff[i]))), overall = meanOf(s.diff);
  p(`  how much the picture changes within .17 s of a chosen strong beat, against always: ${(onPulse / Math.max(overall, 1e-3)).toFixed(2)} times`);
  p();

  p('4. Every structural change and where it lands. Seconds, + after, - before. Time is when it hits.');
  p('  bar, beat, breath: how far from the nearest. arrival: from the nearest of .3 or more, and how strong that is. section, rest: from the nearest edge of one.');
  p(`  on: what it falls on. shows: how much faster the picture changes within .25 s of this moment than is typical in the 16 s around it (${VIS} or more counts as visible).`);
  p('  peak: when the transformation is really going fastest, against the hit, then how far that is from a bar line, and how many times faster that is than the 8 s before it.');
  p('  around it: the picture\'s rate of change in the windows -2..-1, -1..-.25, -.25..+.25, +.25..+1, +1..+2 s, each against the typical rate in the 16 s around. A hit that reads has a big third number or a jump after it.');
  p(`  ${pad('time', 6)} ${rpad('kind', 18)} ${rpad('from > to', 44)} ${pad('D', 4)} ${pad('bar', 6)} ${pad('beat', 6)} ${pad('breath', 6)} ${pad('arrival', 11)} ${pad('section', 7)} ${pad('rest', 7)}  ${rpad('on', 22)} ${pad('shows', 5)} ${pad('peak', 6)} ${pad('p>bar', 6)} ${pad('peak x', 6)}  around it`);
  for (const c of changes) p(`  ${pad(c.s.toFixed(1), 6)} ${rpad(c.type, 18)} ${rpad(c.from === c.to ? c.from : `${c.from} > ${c.to}`, 44)} ${pad(c.D.toFixed(1), 4)} ${pad(sign(c.dBar), 6)} ${pad(sign(c.dBeat), 6)} ${pad(sign(c.dBreath), 6)} ${pad(c.dArr === undefined ? '-' : `${sign(c.dArr, 1)}(${dot(c.arrA)})`, 11)} ${pad(sign(c.dSec, 1), 7)} ${pad(sign(c.dRest, 1), 7)}  ${rpad(c.why.join('+'), 22)} ${pad(c.show.toFixed(1), 5)} ${pad(sign(c.peakOff, 1), 6)} ${pad(sign(c.peakBar), 6)} ${pad(fx(c.peakX, 1), 6)}  ${profile(c.s)}`);
  const landed = changes.filter(c => c.peakOff !== undefined);
  const tierShare = k => changes.filter(c => c.tier === k).length / Math.max(changes.length, 1);
  p(`  medians: from a bar ${fx(medOf(changes.map(c => Math.abs(c.dBar))))} s, from a breath ${fx(medOf(changes.map(c => Math.abs(c.dBreath))))} s, from an arrival ${fx(medOf(changes.map(c => Math.abs(c.dArr))), 1)} s.`);
  const peakMed = medOf(landed.map(c => c.peakOff));
  p(`  the eye: a transformation's fastest moment comes a median ${fx(peakMed, 1)} s from its hit, and ${fx(medOf(landed.map(c => Math.abs(c.peakBar))))} s from any bar line. ${Math.round(landed.filter(c => Math.abs(c.peakOff) <= beat).length / Math.max(landed.length, 1) * 100)}% have it within a beat of the hit. ${Math.round(changes.filter(c => c.show >= VIS).length / Math.max(changes.length, 1) * 100)}% of changes are visible on their own moment (the same test on any bar line: ${Math.round(chanceShow * 100)}%).`);
  const byKind = {};
  for (const c of changes) (byKind[c.G ? c.G.into ?? '?' : c.type.replace('hit:', '')] ??= []).push(c.show);
  p(`  how much each kind shows on its own moment, median: ${Object.entries(byKind).sort((x, y) => medOf(y[1]) - medOf(x[1])).map(([k, v]) => `${k} ${medOf(v).toFixed(1)} (${v.length})`).join(', ')}`);
  p();

  p('5. What it lands on, against what any bar line would land on');
  p(`  on something strong (a section, an arrival of .3 or more, a rest, a fall, within a beat; the climax within a bar): ${Math.round(tierShare('strong') * 100)}%. Any bar line: ${Math.round(chanceStrong * 100)}%.`);
  p(`  on the phrase only (a breath, or the home chord coming back): ${Math.round(tierShare('phrase') * 100)}%. Any bar line: ${Math.round(chancePhrase * 100)}%.`);
  p(`  on nothing in particular (a bar line, or not even that): ${Math.round((tierShare('bar') + tierShare('off')) * 100)}%, of which off the bar line altogether ${Math.round(tierShare('off') * 100)}%.`);
  p();

  p(`6. The song's strongest moments, and whether the picture answers. Moments: arrivals, section edges, rests, falls, the climax; within 2 bars of each other they count as one; the top one per 22 s or so. "Exact" is a change within ${EXACT} s, "beat" within a beat; "shows" as above.`);
  const cands = [
    ...d.arrivals.map(x => ({ t: x.t, v: x.a, why: `arrival ${dot(x.a)}` })),
    ...d.segments.slice(1).map((x, i) => { const dE = eOf(x.t0, x.t0 + 2 * bar) - eOf(x.t0 - 2 * bar, x.t0), diff = x.label !== d.segments[i].label; return { t: x.t0, v: (diff ? 0.6 : 0.3) + Math.min(0.4, Math.abs(dE)), why: `section ${secName(x)} (dE ${sign(dE)})` }; }),
    ...d.rests.flatMap(r => [{ t: r.a, v: 0.7, why: 'band stops' }, { t: r.b, v: 0.9, why: 'band returns' }]),
    { t: d.climax, v: 1, why: 'climax' }, ...falls.map(x => ({ t: x.t, v: Math.min(1, x.v / 0.25), why: `falls ${dot(x.v)}` })),
  ].sort((x, y) => y.v - x.v);
  const merged = [];
  for (const c of cands) { const on = merged.find(q => Math.abs(q.t - c.t) <= 2 * bar); if (on) { on.why += `, ${c.why}`; on.v = Math.min(1.5, on.v + 0.1); } else merged.push({ ...c }); }
  merged.sort((x, y) => y.v - x.v);
  const strongest = merged.slice(0, Math.max(8, Math.min(16, Math.round(dur / 22))));
  for (const m of strongest) { const k = nearest(changeT, m.t); m.dChange = k ? -k.d : undefined; m.exact = k && Math.abs(k.d) <= EXACT; m.onBeat = k && Math.abs(k.d) <= beat; m.show = shows(m.t); m.state = stateAt(m.t); }
  p('  change: seconds to the nearest change, + after the moment, - before. around it: as in 4. Visible only counts pixels changing fast, so something small locking into place can read to the eye and not here. Nobody on this job can see the film move or hear the song.');
  p(`  ${pad('time', 6)} ${pad('size', 4)} ${pad('change', 6)} ${pad('shows', 5)}  ${rpad('around it', 20)} ${rpad('at that moment', 34)} why`);
  for (const m of [...strongest].sort((x, y) => x.t - y.t)) p(`  ${pad(m.t.toFixed(1), 6)} ${pad(dot(m.v), 4)} ${pad(sign(m.dChange, 1), 6)} ${pad(m.show.toFixed(1), 5)}  ${rpad(profile(m.t), 20)} ${rpad(m.state, 34)} ${m.why}`);
  const share = f => strongest.filter(f).length / Math.max(strongest.length, 1);
  p(`  of ${strongest.length}: a change exactly on it ${Math.round(share(m => m.exact) * 100)}%, within a beat ${Math.round(share(m => m.onBeat) * 100)}%, visible in the picture ${Math.round(share(m => m.show >= VIS) * 100)}%, both a change within a beat and visible ${Math.round(share(m => m.onBeat && m.show >= VIS) * 100)}%. On any bar line: a change within a beat ${Math.round(chanceBeat * 100)}%, visible ${Math.round(chanceShow * 100)}%.`);
  p();

  p('7. What comes round again');
  const useCount = new Map();
  for (const G of real) useCount.set(G.id, [...(useCount.get(G.id) ?? []), G.s0]);
  p(`  patterns: ${useCount.size} different in ${real.length} gestures. More than once: ${[...useCount].filter(([, v]) => v.length > 1).map(([k, v]) => `${k} x${v.length} (${v.map(t => t.toFixed(0)).join(', ')})`).join('; ') || 'none'}`);
  const patsIn = x => real.filter(G => Math.min(G.s1, x.t1) - Math.max(G.s0, x.t0) >= 0.3 * (x.t1 - x.t0)).map(G => G.id);
  const backs = d.segments.filter(x => x.visit > 0), wore = backs.filter(x => patsIn(x).some(id => patsIn(d.segments.find(y => y.label === x.label && y.visit === 0)).includes(id)));
  p(`  sections that come back: ${backs.length}. Wearing a pattern their first visit wore (for 30% of the section or more): ${wore.length}${wore.length ? ` (${wore.map(secName).join(' ')})` : ''}. Gestures the composer meant as a replay of an earlier one: ${real.filter(G => G.replayOf != null).length}`);
  const shareBy = key => { const o = {}; for (const G of real) o[G[key]] = (o[G[key]] || 0) + G.s1 - G.s0; return Object.entries(o).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${Math.round(v / lenAll * 100)}%`).join(', '); };
  p(`  families by time: ${shareBy('fam')}`);
  p(`  looks by time: ${shareBy('look')}`);
  const kinds = changes.filter(c => c.G).map(c => c.G.into ?? '?'), kCount = {};
  kinds.forEach(k => { kCount[k] = (kCount[k] || 0) + 1; });
  let same = 0, run = 1, longRun = kinds.length ? 1 : 0, longKind = kinds[0];
  for (let i = 1; i < kinds.length; i++) { if (kinds[i] === kinds[i - 1]) { same++; run++; if (run > longRun) { longRun = run; longKind = kinds[i]; } } else run = 1; }
  const topKind = Object.entries(kCount).sort((x, y) => y[1] - x[1])[0];
  p(`  transformation kinds: ${Object.entries(kCount).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(', ')}. The same kind twice running ${same} of ${Math.max(kinds.length - 1, 0)} times; longest run ${longRun} of ${longKind}.`);
  p(`  how each gesture's song moves into the next (rise, fall, level, break): ${Object.entries(real.reduce((o, G) => { o[G.kindOut] = (o[G.kindOut] || 0) + 1; return o; }, {})).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  const lens = real.map(G => G.s1 - G.s0), medLen = medOf(lens), sdLen = Math.sqrt(meanOf(lens.map(v => (v - meanOf(lens)) ** 2)));
  const near15 = lens.filter(v => Math.abs(v - medLen) <= 0.15 * medLen).length, inBars = {};
  lens.forEach(v => { const k = Math.round(v / bar); inBars[k] = (inBars[k] || 0) + 1; });
  const wholeBreaths = lens.filter(v => Math.abs(v / d.breath.seconds - Math.round(v / d.breath.seconds)) < 0.06).length;
  const ms = real.map(G => G.morph).filter(Boolean), medM = medOf(ms);
  p(`  gesture lengths: median ${medLen.toFixed(1)} s, shortest ${Math.min(...lens).toFixed(1)}, longest ${Math.max(...lens).toFixed(1)}, spread (sd/mean) ${fx(sdLen / meanOf(lens))}. ${near15} of ${lens.length} within 15% of the median. ${wholeBreaths} of ${lens.length} are a whole number of breaths.`);
  p(`  in bars: ${Object.entries(inBars).sort((x, y) => +x[0] - +y[0]).map(([k, v]) => `${k}:${v}`).join(' ')}`);
  p(`  transformation lengths: median ${medM.toFixed(1)} s, shortest ${Math.min(...ms).toFixed(1)}, longest ${Math.max(...ms).toFixed(1)}, ${ms.filter(v => Math.abs(v - medM) <= 0.15 * medM).length} of ${ms.length} within 15% of the median.`);
  p();

  const glance = {
    'duration, s': dur.toFixed(0), 'tempo, bpm': d.bpm.toFixed(0), 'breath, s': d.breath.seconds.toFixed(1), gestures: real.length, 'changes per minute': perMin.toFixed(2), 'slowest section, per minute': Math.min(...secStats.map(x => x.rate)).toFixed(1), 'fastest section, per minute': Math.max(...secStats.map(x => x.rate)).toFixed(1),
    'longest with no change, s': longestGap.toFixed(1), 'time transforming, %': Math.round(movingShare * 100), 'median edge speed, %W/s': fx(medOf(edge), 1), 'median optical flow, px/s at 320': fx(medOf(s.of), 0), 'r energy/change rate': sign(rE['change rate']), 'r energy/flow': sign(rE['flow (its own)']), 'r energy/edge speed': sign(rE['edge speed']), 'r energy/fineness': sign(rE.fineness),
    'quiet third change rate': meanOf(quiet.map(x => x.rate)).toFixed(1), 'loud third change rate': meanOf(loud.map(x => x.rate)).toFixed(1), 'quiet third edge speed': meanOf(quiet.map(x => x.edge)).toFixed(1), 'loud third edge speed': meanOf(loud.map(x => x.edge)).toFixed(1),
    'on a strong moment, %': Math.round(tierShare('strong') * 100), '...any bar line, %': Math.round(chanceStrong * 100), 'on a phrase only, %': Math.round(tierShare('phrase') * 100), 'on nothing in particular, %': Math.round((tierShare('bar') + tierShare('off')) * 100),
    'median |bar| of a change, s': fx(medOf(changes.map(c => Math.abs(c.dBar)))), 'median peak before hit, s': fx(peakMed, 1), 'peak within a beat of hit, %': Math.round(landed.filter(c => Math.abs(c.peakOff) <= beat).length / Math.max(landed.length, 1) * 100), 'changes visible on their moment, %': Math.round(changes.filter(c => c.show >= VIS).length / Math.max(changes.length, 1) * 100),
    'falls: how much they show': byKind.fall ? medOf(byKind.fall).toFixed(1) : '-', 'all other kinds: how much they show': fx(medOf(changes.filter(c => c.G?.into !== 'fall').map(c => c.show)), 1),
    'strongest moments': strongest.length, '...change exactly on it, %': Math.round(share(m => m.exact) * 100), '...change within a beat, %': Math.round(share(m => m.onBeat) * 100), '...visible, %': Math.round(share(m => m.show >= VIS) * 100), '...any bar line visible, %': Math.round(chanceShow * 100),
    'different patterns': useCount.size, 'sections coming back': backs.length, '...wearing what they wore': wore.length, 'commonest transformation': topKind ? `${topKind[0]} ${topKind[1]}/${kinds.length}` : '-', 'same kind running, %': Math.round(same / Math.max(kinds.length - 1, 1) * 100), 'gesture length spread': fx(sdLen / meanOf(lens)), 'lengths within 15% of median, %': Math.round(near15 / lens.length * 100), 'morphs within 15% of median, %': Math.round(ms.filter(v => Math.abs(v - medM) <= 0.15 * medM).length / ms.length * 100),
  };
  return { text: out.join('\n') + '\n', glance };
}

// ---------------------------------------------------------------- the strip's captions
function stripItems(d) {
  const s = d.samples, g = d.gestures, n = s.diff.length, iOf = t => Math.max(0, Math.min(n - 1, Math.round(t * F)));
  const secName = x => `${x.label}${x.visit + 1}`, sectionAt = t => d.segments.find(x => t >= x.t0 && t < x.t1) ?? d.segments.at(-1);
  const times = d.segments.map(x => ({ t: Math.max(x.t0, 0.1), boundary: true }));
  d.bars.forEach((t, i) => { if (i % 8 === 0 && t < d.dur - 0.1 && !times.some(q => Math.abs(q.t - t) < 1)) times.push({ t, boundary: false }); });
  times.sort((a, b) => a.t - b.t);
  const barAt = t => { let k = 0; for (let i = 0; i < d.bars.length; i++) { if (d.bars[i] <= t + 1e-3) k = i; else break; } return k; };
  return times.map(({ t, boundary }) => {
    const i = iOf(t), r = []; for (let k = Math.max(0, i - 6); k < Math.min(n, i + 6); k++) r.push(s.E[k]);
    const G = g[s.gi[i]], moving = !!s.kind[i];
    return { t, boundary, moving,
      line1: `${t.toFixed(1)}s bar ${barAt(t) + 1} ${boundary ? '>' : ''}${secName(sectionAt(t + 0.01))} E${dot(meanOf(r))}`,
      line2: `${(G?.id ?? '?').slice(0, 24)}${moving ? ` ${s.hand[i] ? 'arriving' : G?.into ?? s.kind[i]} ${Math.round(s.x[i] * 100)}%` : ''}` };
  });
}

export default async ({ page, log, save, sleep, out }) => {
  const songs = (process.env.SONGS || 'ppp,wildflower,disclosure,mgmt').split(','), seed = +(process.env.SEED || 7), summary = [];
  const url = await page.eval('location.href');
  for (let k = 0; k < songs.length; k++) {
    const song = songs[k], t0 = Date.now();
    // A fresh page for each: what one rehearsal has learned shouldn't change the next song's film
    if (k) { await page.goto(url); for (let i = 0; i < 200; i++) { let ok = false; try { ok = await page.eval('window.trippee?.ready===true'); } catch { /* still navigating */ } if (ok) break; await sleep(250); } }
    await page.eval(`app.manual=true;window.__done=false;window.__err=null;trippee.song('/media/${song}.mp3',{autoplay:false,seed:${seed}}).then(()=>window.__done=true,e=>window.__err=String(e));0`);
    for (let i = 0; i < 3000; i++) { if (await page.eval('window.__done||!!window.__err')) break; await sleep(200); }
    const err = await page.eval('window.__err');
    if (err || !(await page.eval('window.__done'))) throw new Error(`${song} didn't load: ${err ?? 'timed out'}`);
    if (process.env.CUT) {
      for (let i = 0; i < 1500 && !(await page.eval('!!app.song.compare')); i++) await sleep(200);
      if (!(await page.eval('!!app.song.compare'))) throw new Error(`CUT=1: ${song} has no hand cut, or it never got rehearsed`);
      await page.eval(`(()=>{const sc=app.song.compare.score('cut');app.song.score=sc;app.stage.setScore(sc)})()`);
    }
    log(song, 'loaded in', ((Date.now() - t0) / 1000).toFixed(0), 's. Walking it.');
    const raw = await page.eval(collect, { F, W, H });
    const parsed = JSON.parse(raw);
    save(`${song}.walk.json`, raw);
    const tags = tagsOf(song);
    const { text, glance } = report(song, parsed, tags);
    save(`${song}.shots.txt`, text);
    const items = stripItems(parsed);
    const title = `${song}: ${tags.artist ? tags.artist + ' - ' : ''}${tags.title}. Yellow caption: a section starts here. Green: a transformation is under way.`;
    save(`${song}.strip.jpg`, await page.eval(contact, { title, items, cols: 6, tw: 320, th: 180, cap: 36 }));
    summary.push({ song, title: tags.title, glance });
    log(song, 'done in', ((Date.now() - t0) / 1000).toFixed(0), 's.', items.length, 'frames on the strip.', JSON.stringify(glance));
    const bad = page.logs.filter(l => /^\[(error|exception)\]/.test(l));
    if (bad.length) log(' page errors so far:', bad.length, bad.at(-1).slice(0, 400));
  }
  const keys = Object.keys(summary[0].glance), w0 = Math.max(...keys.map(x => x.length)) + 2;
  const lines = [`${' '.repeat(w0)}${summary.map(x => pad(x.song, 14)).join('')}`, ...keys.map(key => rpad(key, w0) + summary.map(x => pad(x.glance[key], 14)).join(''))];
  writeFileSync(join(out, 'summary.txt'), lines.join('\n') + '\n');
  log('\n' + lines.join('\n'));
};
