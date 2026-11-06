// Ink carry: a line keeps its ink through a landing. docs/MODES.md section 7 and the ink rule in section 4. At each landing in a film the colour difference across the landing frame is no bigger than the
// frames around it, and playing into a landing gives the same bytes as seeking to it.
//
//   WORLD=mirror SONG=media/mgmt.mp3 node tools/lab.mjs tests/inkcarry.mjs --out lab-out/<lane>       no WORLD is the film, as a control. Muted.
//   node tests/inkcarry.mjs --selftest                                                                no browser, the measure alone
//   SELF=1 SONG=... node tools/lab.mjs tests/inkcarry.mjs ...                                         also the real film's pixels tinted from the landing frame on: it has to catch that
//
// Colour difference: mean of |dR|+|dG|+|dB| over 3 at 320x180, for the whole frame and for the worst of 16 tiles, since an ink can jump in one corner. Frames at 60 fps, on a grid with the landing half way
// between two frames, so one step is exactly the one across the landing. It's compared with the 15 steps either side, and a sliver of rounding (.25 of 255, 10%) is forgiven.
//
// An ink can jump where no landing is, too, so the whole film is also scanned at 60 fps on 96x54: any one frame's step in colour over 3 times its neighbours' median (plus .5) while coverage doesn't step with it. That's a colour changing with no line moving. SCAN=0 leaves it out.
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CARRY = { around: 15, ratio: 1.1, floor: 0.25 };

// series: colour difference per step, at: the step across the landing. Pure.
export function carryOf(series, at, { around = CARRY.around, ratio = CARRY.ratio, floor = CARRY.floor } = {}) {
  let top = 0;
  for (let i = Math.max(0, at - around); i <= Math.min(series.length - 1, at + around); i++) if (i !== at && series[i] > top) top = series[i];
  const step = series[at];
  return { step: +step.toFixed(3), around: +top.toFixed(3), ok: step <= top * ratio + floor };
}

// The film's landings and what the frames do around them, on real pixels. tint: multiply colour from the landing on, as a planted fault.
const measureInPage = async ({ marks, fps, reach, tint }) => {
  const T = window.trippee, W = 320, H = 180, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true }), out = [];
  const tileOf = new Int32Array(W * H); for (let y = 0; y < H; y++) for (let X = 0; X < W; X++) tileOf[y * W + X] = Math.min(3, (y * 4 / H) | 0) * 4 + Math.min(3, (X * 4 / W) | 0);
  for (let m = 0; m < marks.length; m++) {
    const t1 = marks[m], whole = [], tile = []; let prev = null;
    for (let i = -reach; i <= reach + 1; i++) {
      const t = t1 + (i - 0.5) / fps;      // the step from i=0 to i=1 is the one across t1
      T.seek(t);
      x.drawImage(T.canvas, 0, 0, W, H);
      const d = x.getImageData(0, 0, W, H).data;
      const px = new Float32Array(W * H * 3);
      const k = tint && t >= t1 ? tint : [1, 1, 1];
      for (let q = 0; q < W * H; q++) { px[q * 3] = d[q * 4] * k[0]; px[q * 3 + 1] = d[q * 4 + 1] * k[1]; px[q * 3 + 2] = d[q * 4 + 2] * k[2]; }
      if (prev) {
        let s = 0; const ts = new Float64Array(16), tc = new Float64Array(16);
        for (let q = 0; q < W * H; q++) { const v = (Math.abs(px[q * 3] - prev[q * 3]) + Math.abs(px[q * 3 + 1] - prev[q * 3 + 1]) + Math.abs(px[q * 3 + 2] - prev[q * 3 + 2])) / 3; s += v; ts[tileOf[q]] += v; tc[tileOf[q]]++; }
        whole.push(s / (W * H)); tile.push(Array.from(ts, (v, q) => v / tc[q]));
      }
      prev = px;
    }
    out.push({ t: t1, whole: whole.map(v => +v.toFixed(3)), tile: tile.map(a => a.map(v => +v.toFixed(2))), at: reach, kind: app.lastFrame?.kind ?? null });
    if (m % 2 === 0) await new Promise(r => setTimeout(r));
  }
  return out;
};

// One step per frame through the whole film, in true colour and, in a world, in coverage. Which frames step in colour alone: pure, given the two series.
export function inkSteps(c, cov, fps, { reach = 15, ratio = 3, floor = 0.5 } = {}) {
  const out = [], med = (a, i) => { const s = []; for (let k = Math.max(1, i - reach); k <= Math.min(a.length - 1, i + reach); k++) if (k !== i) s.push(a[k]); s.sort((p, q) => p - q); return s[s.length >> 1] ?? 0; };
  for (let i = 1; i < c.length; i++) {
    const m = med(c, i);
    if (c[i] <= m * ratio + floor) continue;
    const mc = med(cov, i);
    if (cov[i] > mc * ratio + floor) continue;       // the lines moved as well: Jerk and pops look after that
    out.push({ i, t: +(i / fps).toFixed(3), step: +c[i].toFixed(2), around: +m.toFixed(2), coverage: +cov[i].toFixed(2) });
  }
  return out;
}
const scanInPage = async ({ duration, fps }) => {
  const T = window.trippee, W = 96, H = 54, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d', { willReadFrequently: true });
  const N = Math.floor(duration * fps), c = new Float32Array(N), k = new Float32Array(N), meta = {};
  let pc = null, pk = null;
  const read = () => { x.drawImage(T.canvas, 0, 0, W, H); return x.getImageData(0, 0, W, H).data.slice(); };
  const dif = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3; return s / (W * H); };
  for (let i = 0; i < N; i++) {
    T.seek(i / fps);
    const a = read();
    let b = a;
    if (window.__coverage) { window.__coverage(); b = read(); }
    if (pc) { c[i] = dif(a, pc); k[i] = dif(b, pk); }
    pc = a; pk = b;
    meta[i] = app.lastFrame?.G?.pattern?.id;
    if (i % 30 === 0) await new Promise(r => setTimeout(r));
  }
  return { c: Array.from(c, v => +v.toFixed(3)), k: Array.from(k, v => +v.toFixed(3)), ids: Object.values(meta) };
};

// Play into each landing from a second before it, then seek to every time that frame was drawn at, and compare the bytes.
const playSeekInPage = async ({ marks, fps }) => {
  const T = window.trippee, gl = app.R.gl, W = T.canvas.width, H = T.canvas.height, px = new Uint8Array(W * H * 4), bad = [];
  const hash = () => { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); let h = 0x811c9dc5; const b = new Uint32Array(px.buffer); for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193); } return h >>> 0; };
  let frames = 0;
  for (const t1 of marks) {
    const played = [];
    T.seek(t1 - 1);
    for (let i = 0; i < fps * 1.25; i++) { T.step(1 / fps); played.push({ t: app.t, h: hash() }); }
    for (const p of played) { T.seek(p.t); frames++; if (hash() !== p.h) bad.push(+p.t.toFixed(3)); }
    await new Promise(r => setTimeout(r));
  }
  return { frames, bad, size: [W, H] };
};

export default async ({ page, log, save, sleep }) => {
  const { dropSong, enterWorld } = await import('../tools/look.mjs');
  const songPath = process.env.SONG || 'media/mgmt.mp3', song = basename(songPath).replace(/\.\w+$/, ''), world = process.env.WORLD || null;
  await page.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  await dropSong(page, songPath, { resolvePath: resolve, sleep });
  if (world) await enterWorld(page, world, log);
  const info = await page.eval(() => { const s = app.stage.score; return { duration: app.song.duration, landings: s.gestures.slice(0, -1).map(G => ({ t: +G.t1.toFixed(4), id: G.pattern.id, morph: +(G.morph || 0).toFixed(2), xform: G.xform?.id ?? null, plan: G.plan?.kind ?? null })) }; });
  const inFilm = info.landings.filter(l => l.t > 1 && l.t < info.duration - 1);
  const FPS = 60, REACH = 16;
  const res = await page.eval(measureInPage, { marks: inFilm.map(l => l.t), fps: FPS, reach: REACH, tint: null });
  const rows = res.map((r, i) => {
    const w = carryOf(r.whole, r.at);
    let tileWorst = null;
    for (let k = 0; k < 16; k++) { const c = carryOf(r.tile.map(a => a[k]), r.at); if (!tileWorst || c.step - c.around > tileWorst.step - tileWorst.around) tileWorst = { ...c, k }; }
    return { ...inFilm[i], whole: w, tile: tileWorst, ok: w.ok && tileWorst.ok };
  });
  const bad = rows.filter(r => !r.ok);
  log(`Ink carry ${world || 'film'} on ${song}: ${rows.length - bad.length}/${rows.length} landings clean`);
  for (const r of rows) log(`  ${r.ok ? 'ok ' : 'BAD'} ${r.t} ${r.id} morph ${r.morph} ${r.plan ?? ''} ${r.xform ?? ''}: across ${r.whole.step}, around ${r.whole.around}; worst tile ${r.tile.k} ${r.tile.step} around ${r.tile.around}`);
  const some = inFilm.filter((_, i) => i % Math.max(1, Math.floor(inFilm.length / 6)) === 0).map(l => l.t);
  const ps = await page.eval(playSeekInPage, { marks: some, fps: FPS });
  log(`Play against seek: ${ps.frames - ps.bad.length}/${ps.frames} frames the same bytes at ${ps.size.join('x')}, at ${some.length} landings${ps.bad.length ? '; differ at ' + ps.bad.slice(0, 12).join(' ') : ''}`);
  if (process.env.SELF) {
    const planted = await page.eval(measureInPage, { marks: inFilm.slice(0, 6).map(l => l.t), fps: FPS, reach: REACH, tint: [0.93, 0.97, 1] });
    const caught = planted.map(r => carryOf(r.whole, r.at));
    log(`A planted ink jump, the real frames tinted 7% from each landing on: ${caught.filter(c => !c.ok).length}/${caught.length} caught; across ${caught.map(c => c.step).join(' ')} against around ${caught.map(c => c.around).join(' ')}`);
  }
  let steps = [];
  if (process.env.SCAN !== '0') {
    const sc = await page.eval(scanInPage, { duration: info.duration, fps: FPS });
    steps = inkSteps(sc.c, sc.k, FPS).map(x => ({ ...x, id: sc.ids[x.i] }));
    log(`Colour stepping with no line moving, the whole film at ${FPS} fps: ${steps.length} frames`);
    for (const x of steps.slice(0, 24)) log(`  ${x.t} s on ${x.id}: ${x.step} against ${x.around} around it, coverage ${x.coverage}`);
  }
  save(`inkcarry-${world || 'film'}-${song}.json`, JSON.stringify({ world, song, rows, playSeek: ps, steps }));
  if (bad.length || ps.bad.length || steps.length) process.exitCode = 1;
  const errs = page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  if (errs.length) log('page errors', errs.slice(0, 4));
};

export function selftest() {
  const flat = Array.from({ length: 33 }, (_, i) => 2 + 0.5 * Math.sin(i));
  const jump = flat.slice(); jump[16] = 9;
  const ease = Array.from({ length: 33 }, (_, i) => 1 + Math.abs(i - 16) * 0.1);
  const motion = flat.slice(); motion[16] = Math.max(...flat) * 0.99;
  const cases = [['steady', flat, true], ['an ink jump', jump, false], ['the clock easing to rest', ease, true], ['as big as the frames around it', motion, true]];
  const still = Array.from({ length: 60 }, () => 0.3), withStep = still.slice(); withStep[30] = 2.3;
  const a = inkSteps(withStep, still, 60), b = inkSteps(withStep, withStep, 60), c0 = inkSteps(still, still, 60);
  let ok = a.length === 1 && a[0].i === 30 && b.length === 0 && c0.length === 0;
  console.log(`${ok ? 'ok  ' : 'BAD '} a step in colour alone is found; one that coverage takes as well isn't; nothing stepping finds nothing`);
  for (const [n, s, want] of cases) { const c = carryOf(s, 16), good = c.ok === want; if (!good) ok = false; console.log(`${good ? 'ok  ' : 'BAD '} ${n}: across ${c.step}, around ${c.around}, ${c.ok ? 'passes' : 'caught'}`); }
  return ok;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(selftest() ? 0 : 1);
